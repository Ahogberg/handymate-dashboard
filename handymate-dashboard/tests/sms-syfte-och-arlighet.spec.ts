import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as ts from 'typescript'
import { smsSyfteForHandelse, SVAR_PA_KUNDKONTAKT } from '../lib/outbound/sms-syfte'
import { gateCustomerSms } from '../lib/outbound/sms-gate'

// Facit för provsamtalet 2026-09-10 kl 07:30.
//
// Kunden ringde, ingen svarade. Två fel inträffade i samma sekund:
//
//   1. Fångst-SMS:et till kunden gick INTE ut. Regelmotorn hårdkodade
//      purpose:'proactive' för varje regel-SMS, och sjudagarsfönstret i
//      sms-gate gäller just 'proactive'. Ett svar på ett samtal kunden själv
//      ringt låg alltså under samma tak som ett kampanjutskick.
//   2. Notisen till hantverkaren gick ut ändå, och sa ordagrant "och skickade
//      ett svar-SMS". Utfallet fanns redan uträknat i samma kodväg
//      (meddelaFangatSamtal läser sms_log), men returvärdet kastades bort.
//
// Det andra felet är det allvarligare: en produkt som säger att den gjort
// något den inte gjort är värre än en produkt som inte gjorde något.

const ROT = join(__dirname, '..')

// ── 1. Klassificeringen ────────────────────────────────────────────────

test('ett svar på inkommande kundkontakt är conversational, aldrig proactive', () => {
  // 'proactive' är det ENDA syfte som sjudagarsfönstret rör (sms-gate.ts).
  // Står en händelse i listan får dess SMS alltså gå även om kunden fått ett
  // SMS i veckan — det är hela poängen.
  for (const handelse of SVAR_PA_KUNDKONTAKT) {
    expect(smsSyfteForHandelse(handelse), `${handelse} måste vara ett svar, inte ett utskick`).toBe('conversational')
  }
  expect(SVAR_PA_KUNDKONTAKT).toContain('call_missed')
})

test('allt annat är proactive — spärren gäller fortfarande för kampanjer och omvårdnad', () => {
  for (const handelse of ['quote_sent', 'quote_opened', 'job_completed', 'customer_dormant', 'invoice_overdue', 'morning_report_sent']) {
    expect(smsSyfteForHandelse(handelse), `${handelse} får inte slippa spärren`).toBe('proactive')
  }
  // Okänd, tom eller saknad händelse ⇒ den försiktiga sidan.
  for (const okant of [undefined, null, '', '   ', 'nagot_vi_inte_kanner']) {
    expect(smsSyfteForHandelse(okant)).toBe('proactive')
  }
})

// ── 2. Spärren i praktiken ─────────────────────────────────────────────

/** Supabase-attrapp: kunden finns, och har fått ett SMS igår. */
function dbMedNyligtSms() {
  const svar: Record<string, any> = {
    customer: { data: [{ customer_id: 'cus_1', phone_number: '+46708379552', sms_opt_out: false }], error: null },
    sms_log: { data: { sms_id: 'sms_igar' }, error: null },
  }
  return {
    from(tabell: string) {
      const resultat = svar[tabell] ?? { data: null, error: null }
      const q: any = { then: (r: any) => Promise.resolve(resultat).then(r) }
      for (const m of ['select', 'eq', 'in', 'gte', 'limit', 'order', 'is']) q[m] = () => q
      q.maybeSingle = async () => resultat
      q.single = async () => resultat
      return q
    },
  } as any
}

const GRIND_INDATA = {
  businessId: 'biz_al7pjuu5smi',
  phoneE164: '+46708379552',
  recipient: 'customer' as const,
  messageType: 'automation_rule',
}

test('fångst-SMS:et släpps igenom trots ett SMS igår', async () => {
  // Det som faktiskt hände 07:30, kört mot den verkliga grinden.
  const beslut = await gateCustomerSms({
    supabase: dbMedNyligtSms(),
    ...GRIND_INDATA,
    purpose: smsSyfteForHandelse('call_missed'),
  })
  expect(beslut.allowed, beslut.allowed ? '' : `blockerad: ${(beslut as any).code}`).toBe(true)
})

test('samma spärr stoppar fortfarande ett proaktivt utskick', async () => {
  // Motprovet. Hade grinden slutat spärra hade provet ovan varit meningslöst.
  const beslut = await gateCustomerSms({
    supabase: dbMedNyligtSms(),
    ...GRIND_INDATA,
    purpose: smsSyfteForHandelse('customer_dormant'),
  })
  expect(beslut.allowed).toBe(false)
  expect((beslut as any).code).toBe('recent_customer_contact')
})

test('en kund som avböjt SMS får inget svar heller — conversational öppnar inte opt-out', async () => {
  // Viktigt att skilja på: frekvensspärren ska vika för ett svar, STOPP ska
  // aldrig göra det.
  const db: any = {
    from() {
      const resultat = { data: [{ customer_id: 'cus_1', phone_number: '+46708379552', sms_opt_out: true }], error: null }
      const q: any = { then: (r: any) => Promise.resolve(resultat).then(r) }
      for (const m of ['select', 'eq', 'in', 'gte', 'limit']) q[m] = () => q
      q.maybeSingle = async () => resultat
      return q
    },
  }
  const beslut = await gateCustomerSms({ supabase: db, ...GRIND_INDATA, purpose: 'conversational' })
  expect(beslut.allowed).toBe(false)
  expect((beslut as any).code).toBe('customer_opted_out')
})

// ── 3. Att regelmotorn faktiskt använder klassificeringen ──────────────

test('regelmotorn hårdkodar inte längre syftet för regel-SMS', () => {
  const src = readFileSync(join(ROT, 'lib/automation-engine.ts'), 'utf8')
  const kodrader = src.split('\n').filter(r => !r.trim().startsWith('//') && !r.trim().startsWith('*'))
  const hardkodat = kodrader.filter(r => /purpose:\s*'proactive'/.test(r))
  expect(hardkodat.join('\n'), 'ett hårdkodat proactive är precis felet som blockerade fångst-SMS:et').toEqual('')
  expect(src, 'syftet härleds inte ur händelsen').toContain('smsSyfteForHandelse')
})

test('händelsenamnet stämplas på BÅDA vägarna — direkt körning och godkänt kort', () => {
  // Går regeln via ett godkännandekort först måste syftet vara detsamma när
  // ägaren trycker. Missas stämpeln där blockeras svaret igen, men bara i det
  // fall där en människa faktiskt tittat på det.
  const src = readFileSync(join(ROT, 'lib/automation-engine.ts'), 'utf8')
  const stamplingar = src.match(/rule_event_name/g) || []
  expect(stamplingar.length, 'rule_event_name ska stämplas i approval-grenen, exekveringsgrenen och läsas i handleSendSms').toBeGreaterThanOrEqual(3)
  // Godkännandegrenen bygger sin egen context — kontrollera den uttryckligen.
  const apprGren = src.slice(src.indexOf('rule_action_config: typedRule.action_config'), src.indexOf('autonomy_key: autonomyKey'))
  expect(apprGren, 'godkännandekortet bär inte händelsen vidare').toContain('rule_event_name')
})

// ── 4. Notisen får inte påstå mer än vad som hände ─────────────────────

function laddaFirstEventSms(skickade: string[]) {
  const kod = ts.transpileModule(readFileSync(join(ROT, 'lib/onboarding/first-event-sms.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const mocks: Record<string, any> = {
    '@/lib/supabase': {
      getServerSupabase: () => ({
        from: () => {
          const resultat = { data: { personal_phone: '+46708379552', business_name: 'Nordström El AB', display_name: null }, error: null }
          const q: any = {}
          for (const m of ['select', 'eq']) q[m] = () => q
          q.single = async () => resultat
          return q
        },
      }),
    },
    '@/lib/business-preferences': {
      getBusinessPreferences: async () => ({}),
      setBusinessPreference: async () => {},
    },
    '@/lib/sms-send': {
      sendSmsViaElks: async (args: any) => { skickade.push(args.message); return { success: true } },
    },
  }
  const exports: Record<string, any> = {}
  new Function('require', 'exports', kod)((id: string) => mocks[id] ?? require(id), exports)
  return exports
}

test('gick svaret inte fram säger notisen det — och ber ägaren ringa upp', async () => {
  const skickade: string[] = []
  await laddaFirstEventSms(skickade).sendFirstEventSms('biz_al7pjuu5smi', 'missed_call', 'Anna Svensson', { svarSkickat: false })
  expect(skickade.length, 'inget SMS skickades alls').toBe(1)
  const text = skickade[0]
  expect(text, 'notisen påstår ett svar som aldrig gick fram').not.toContain('skickade ett svar')
  expect(text).toContain('Anna Svensson')
  expect(text.toLowerCase(), 'ägaren får ingen uppmaning att ringa upp').toContain('ring upp')
})

test('gick svaret fram får notisen säga det', async () => {
  const skickade: string[] = []
  await laddaFirstEventSms(skickade).sendFirstEventSms('biz_al7pjuu5smi', 'missed_call', 'Anna Svensson', { svarSkickat: true })
  expect(skickade[0]).toContain('skickade ett svar')
})

test('samtalsvägen skickar med utfallet — inte ett antagande', () => {
  // Grinden fanns och var korrekt hela tiden; felet var att den här raden
  // aldrig fick veta vad den kommit fram till.
  const src = readFileSync(join(ROT, 'app/api/voice/missed/route.ts'), 'utf8')
  expect(src, 'returvärdet från meddelaFangatSamtal kastas bort igen').toMatch(/=\s*await meddelaFangatSamtal\(/)
  const anrop = src.slice(src.indexOf("sendFirstEventSms(businessId, 'missed_call'"))
  expect(anrop.slice(0, 400), 'notisen får inte utfallet').toContain('svarSkickat')
})

test('inga agentlöften i texterna utan täckning', () => {
  // Agenter föreslår, ägaren godkänner. En notis som säger att Daniel "följde
  // upp" när det som hänt är att ett kort väntar är samma klass av fel.
  // Bara kod — filhuvudet BESKRIVER de gamla formuleringarna och ska få göra
  // det. Utan filtret flaggar provet dokumentationen av felet.
  const kod = readFileSync(join(ROT, 'lib/onboarding/first-event-sms.ts'), 'utf8')
    .split('\n')
    .filter(r => !/^\s*(\/\/|\*|\/\*)/.test(r))
    .join('\n')
  for (const pastaende of ['följde just upp', 'har skickat en påminnelse', 'skickade en påminnelse']) {
    expect(kod, `texten påstår "${pastaende}" utan att någon godkänt`).not.toContain(pastaende)
  }
  // Motprov: filtret får inte ha ätit upp hela filen.
  expect(kod).toContain('case \'quote_followup\':')
})
