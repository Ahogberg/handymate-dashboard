/**
 * Facit för spår 6 — "En identitetsläsare" (kundminne pass 2).
 *
 * Samma person hör av sig på tre sätt: "070-123 45 67" i webbformuläret,
 * "+46701234567" från 46elks och "Anna@Exempel.SE" i Gmail. Varje kanal läste
 * identiteten på sitt eget sätt, och två av dem kunde aldrig träffa:
 * Gmail-matcharen gjorde `.eq('email', råvärdet)` (versaler ⇒ ingen kund) och
 * dealtidslinjen sökte kundens ID som delsträng i ett TELEFONNUMMER.
 *
 * Fem påståenden:
 *
 *   1. `070…`, `+4670…` och e-posten ger SAMMA customerId.
 *   2. Tvetydig identitet ⇒ `ambiguous` UTAN id (fail-closed).
 *   3. Gmail-processorn skapar INTE en ny kund när avsändaren är tvetydig.
 *   4. DealTimelines SMS-gren filtrerar på telefonkandidater, aldrig kund-ID.
 *   5. Kommunikationsunderlagets e-postmatch är skiftlägesokänslig.
 *
 * Browserlöst. De riktiga källfilerna transpileras och körs med en supabase-
 * stubbe som FILTRERAR PÅ RIKTIGT (in/eq/ilike över rader i minnet) — ett
 * facit som bara räknar anrop hade inte sett skillnad på "slog upp" och
 * "slog upp rätt".
 *
 *   npx playwright test tests/identitetslasare.spec.ts --no-deps --project=chromium --reporter=line
 */
import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import * as ts from 'typescript'

const ROT = join(__dirname, '..')
const las = (p: string) => readFileSync(join(ROT, p), 'utf8').replace(/\r\n/g, '\n')

/**
 * Transpilerar en källfil OCH hela dess kedja av `@/`-beroenden, så
 * normaliseringen som körs är den riktiga (phone-normalize, customer-dedupe).
 */
function laddaKedja(fil: string, mocks: Record<string, any> = {}): any {
  const cache: Record<string, { exports: any }> = {}
  function ladda(rel: string): any {
    if (cache[rel]) return cache[rel].exports
    const kod = ts.transpileModule(las(rel), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText
    const modul = { exports: {} as any }
    cache[rel] = modul
    const req = (id: string): any => {
      if (id in mocks) return mocks[id]
      const bas = id.startsWith('@/') ? id.slice(2) : id.startsWith('.') ? join(dirname(rel), id) : null
      if (bas) {
        for (const kandidat of [bas, `${bas}.ts`, `${bas}.tsx`, join(bas, 'index.ts')]) {
          if (existsSync(join(ROT, kandidat)) && kandidat.endsWith('.ts')) return ladda(kandidat)
        }
      }
      return require(id)
    }
    new Function('require', 'exports', 'module', kod)(req, modul.exports, modul)
    return modul.exports
  }
  return ladda(fil)
}

/**
 * Supabase-stubbe som filtrerar på riktigt. `%` i ilike-mönster stöds inte
 * (identitetsuppslagen använder literala värden, aldrig jokertecken).
 */
function bord(data: Record<string, any[]>, ops: any[] = []) {
  return {
    ops,
    from(tabell: string) {
      let rader: any[] = [...(data[tabell] || [])]
      const q: any = {}
      const behall = (f: (r: any) => boolean) => { rader = rader.filter(f); return q }
      q.select = () => q
      q.eq = (c: string, v: any) => { ops.push([tabell, 'eq', c, v]); return behall(r => r[c] === v) }
      q.neq = (c: string, v: any) => behall(r => r[c] !== v)
      q.in = (c: string, v: any[]) => { ops.push([tabell, 'in', c, v]); return behall(r => v.includes(r[c])) }
      q.ilike = (c: string, p: string) => {
        ops.push([tabell, 'ilike', c, p])
        const literal = p.replace(/\\(.)/g, '$1')
        return behall(r => typeof r[c] === 'string' && r[c].toLowerCase() === literal.toLowerCase())
      }
      q.not = (c: string) => behall(r => r[c] !== null && r[c] !== undefined)
      q.is = () => q
      q.or = (villkor: string) => { ops.push([tabell, 'or', villkor]); return q }
      for (const m of ['gt', 'gte', 'lt', 'lte', 'contains', 'limit']) q[m] = () => q
      q.order = (c: string, o?: { ascending?: boolean }) => {
        const riktning = o?.ascending === false ? -1 : 1
        rader = [...rader].sort((a, b) => String(a[c] ?? '').localeCompare(String(b[c] ?? '')) * riktning)
        return q
      }
      q.insert = (rad: any) => {
        ops.push([tabell, 'insert', rad])
        const svar = { data: { id: `${tabell}_ny`, ...rad }, error: null }
        const i: any = {
          select: () => i,
          single: async () => svar,
          maybeSingle: async () => svar,
          then: (r: any) => Promise.resolve({ data: null, error: null }).then(r),
        }
        return i
      }
      q.update = (rad: any) => { ops.push([tabell, 'update', rad]); return q }
      q.maybeSingle = async () => ({ data: rader[0] ?? null, error: null })
      q.single = async () => ({ data: rader[0] ?? null, error: rader[0] ? null : { message: 'ingen rad' } })
      q.then = (r: any) => Promise.resolve({ data: rader, error: null }).then(r)
      return q
    },
  }
}

const BIZ = 'biz_1'
const ANNA = {
  customer_id: 'cust_anna', business_id: BIZ, name: 'Anna Berg',
  phone_number: '070-123 45 67', email: 'Anna@Exempel.SE',
  address_line: 'Storgatan 1', created_at: '2026-01-01T10:00:00Z',
}

function läsare() {
  return laddaKedja('lib/identity/resolve-contact.ts').resolveContact
}

// ══════════════════════════════════════════════════════════════════════
// 1. En person, tre skrivsätt, ett id
// ══════════════════════════════════════════════════════════════════════

test.describe('resolveContact — en identitet', () => {
  test('070…, +4670… och e-posten ger samma customerId', async () => {
    const resolveContact = läsare()
    const db = () => bord({ customer: [ANNA], leads: [] }) as any

    const viaLokalt = await resolveContact(db(), BIZ, { phone: '0701234567' })
    const viaE164 = await resolveContact(db(), BIZ, { phone: '+46701234567' })
    const viaEpost = await resolveContact(db(), BIZ, { email: 'anna@exempel.se' })

    expect(viaLokalt.customerId, 'lokalt format hittade inte kunden').toBe('cust_anna')
    expect(viaE164.customerId, 'E.164 hittade inte kunden').toBe('cust_anna')
    expect(viaEpost.customerId, 'e-posten hittade inte kunden').toBe('cust_anna')
    expect(viaLokalt.matchedBy).toBe('phone')
    expect(viaEpost.matchedBy).toBe('email')
  })

  test('e-post med versaler i UPPSLAGET träffar en gemen kundrad', async () => {
    const resolveContact = läsare()
    const db = bord({ customer: [{ ...ANNA, email: 'anna@exempel.se' }], leads: [] }) as any
    const r = await resolveContact(db, BIZ, { email: '  Anna@Exempel.SE ' })
    expect(r.customerId).toBe('cust_anna')
  })

  test('okänd avsändare ⇒ matchedBy none, inget id, inte tvetydig', async () => {
    const resolveContact = läsare()
    const db = bord({ customer: [ANNA], leads: [] }) as any
    const r = await resolveContact(db, BIZ, { phone: '+46709999999', email: 'ingen@exempel.se' })
    expect(r).toEqual({ matchedBy: 'none' })
  })

  test('annat företags kund matchas aldrig', async () => {
    const resolveContact = läsare()
    const db = bord({ customer: [{ ...ANNA, business_id: 'biz_2' }], leads: [] }) as any
    const r = await resolveContact(db, BIZ, { phone: '0701234567', email: 'anna@exempel.se' })
    expect(r.customerId).toBeUndefined()
  })
})

// ══════════════════════════════════════════════════════════════════════
// 2. Tvetydigt ⇒ fail-closed
// ══════════════════════════════════════════════════════════════════════

test.describe('resolveContact — tvetydighet', () => {
  test('samma e-post på två kunder ⇒ ambiguous utan id', async () => {
    const resolveContact = läsare()
    const db = bord({
      customer: [
        { ...ANNA, phone_number: null },
        { ...ANNA, customer_id: 'cust_bo', name: 'Bo Berg', phone_number: null, created_at: '2026-02-01T10:00:00Z' },
      ],
      leads: [],
    }) as any
    const r = await resolveContact(db, BIZ, { email: 'anna@exempel.se' })
    expect(r.ambiguous).toBe(true)
    expect(r.customerId).toBeUndefined()
    expect(r.leadId).toBeUndefined()
    expect(r.matchedBy).toBe('none')
  })

  test('telefonen pekar på en kund och e-posten på en annan ⇒ ambiguous', async () => {
    const resolveContact = läsare()
    const db = bord({
      customer: [
        ANNA,
        { ...ANNA, customer_id: 'cust_bo', name: 'Bo Berg', phone_number: null, email: 'bo@exempel.se' },
      ],
      leads: [],
    }) as any
    const r = await resolveContact(db, BIZ, { phone: '0701234567', email: 'bo@exempel.se' })
    expect(r.ambiguous).toBe(true)
    expect(r.customerId).toBeUndefined()
  })

  test('två öppna leads på samma nummer ⇒ ambiguous', async () => {
    const resolveContact = läsare()
    const db = bord({
      customer: [],
      leads: [
        { lead_id: 'lead_1', business_id: BIZ, phone: '+46701234567', email: null, status: 'new', customer_id: null },
        { lead_id: 'lead_2', business_id: BIZ, phone: '+46701234567', email: null, status: 'contacted', customer_id: null },
      ],
    }) as any
    const r = await resolveContact(db, BIZ, { phone: '+46701234567' })
    expect(r.ambiguous).toBe(true)
    expect(r.leadId).toBeUndefined()
  })
})

// ══════════════════════════════════════════════════════════════════════
// 3. Kund före lead, bara öppna leads
// ══════════════════════════════════════════════════════════════════════

test.describe('resolveContact — leads', () => {
  test('öppen lead på e-posten när ingen kund finns', async () => {
    const resolveContact = läsare()
    const db = bord({
      customer: [],
      leads: [{ lead_id: 'lead_1', business_id: BIZ, phone: null, email: 'Anna@Exempel.SE', status: 'new', customer_id: null }],
    }) as any
    const r = await resolveContact(db, BIZ, { email: 'anna@exempel.se' })
    expect(r.leadId).toBe('lead_1')
    expect(r.matchedBy).toBe('email')
  })

  test('stängd lead räknas inte som identitet', async () => {
    const resolveContact = läsare()
    const db = bord({
      customer: [],
      leads: [{ lead_id: 'lead_1', business_id: BIZ, phone: null, email: 'anna@exempel.se', status: 'won', customer_id: 'cust_anna' }],
    }) as any
    const r = await resolveContact(db, BIZ, { email: 'anna@exempel.se' })
    expect(r.leadId).toBeUndefined()
    expect(r.matchedBy).toBe('none')
  })

  test('kunden vinner över en öppen lead med samma e-post', async () => {
    const resolveContact = läsare()
    const db = bord({
      customer: [ANNA],
      leads: [{ lead_id: 'lead_1', business_id: BIZ, phone: null, email: 'anna@exempel.se', status: 'new', customer_id: null }],
    }) as any
    const r = await resolveContact(db, BIZ, { email: 'anna@exempel.se' })
    expect(r.customerId).toBe('cust_anna')
    expect(r.leadId).toBeUndefined()
  })
})

// ══════════════════════════════════════════════════════════════════════
// 4. Gmail-processorn — tvetydig avsändare blir INTE en ny kund
// ══════════════════════════════════════════════════════════════════════

test.describe('gmail-processorn', () => {
  function processor(resolution: any, ops: any[]) {
    const tyst = async () => {}
    return laddaKedja('lib/gmail/processor.ts', {
      '@/lib/identity/resolve-contact': { resolveContact: async () => resolution },
      '@/lib/numbering': { getNextCustomerNumber: async () => 'K-1' },
      '@/lib/company/company-model': { hourlyRateField: () => ({ value: null }) },
      '@/lib/observability/driftlarm': { rapporteraTystFel: tyst },
      './message-identity': {
        gmailIdentity: (konto: string, id: string) => ({ mail_provider: 'google', mail_account: konto, provider_message_id: id }),
        findGmailMessage: async () => null,
      },
      '@/lib/automation-engine': { fireEvent: async () => { ops.push(['event']) } },
    })
  }

  const MEJL = {
    messageId: 'gm_1', threadId: 'tr_1', from: 'Anna Berg <anna@exempel.se>',
    to: 'info@nordstrom.se', subject: 'Proppskåpet', bodyText: 'Hej, ring mig på 070-123 45 67',
    snippet: '', date: '2026-09-18T08:00:00Z',
  }

  test('tvetydig avsändare ⇒ ingen ny kund, mejlet sparas omatchat', async () => {
    const ops: any[] = []
    const { processInboundEmail } = processor({ matchedBy: 'none', ambiguous: true }, ops)
    const db = bord({ email_conversations: [], customer: [], business_config: [] }, ops) as any

    const r = await processInboundEmail(db, BIZ, MEJL, 'info@nordstrom.se')

    expect(r.stored, 'mejlet sparades inte').toBe(true)
    expect(
      ops.filter(o => o[0] === 'customer' && o[1] === 'insert'),
      'en tvetydig avsändare fick skapa en tredje kundrad',
    ).toHaveLength(0)
    const sparade = ops.filter(o => o[0] === 'email_conversations' && o[1] === 'insert')
    expect(sparade).toHaveLength(1)
    expect(sparade[0][2].matched_by).toBe('unmatched')
    expect(sparade[0][2].customer_id).toBeNull()
  })

  test('okänd (entydigt) avsändare skapar fortfarande kund', async () => {
    const ops: any[] = []
    const { processInboundEmail } = processor({ matchedBy: 'none' }, ops)
    const db = bord({ email_conversations: [], customer: [], business_config: [] }, ops) as any

    await processInboundEmail(db, BIZ, MEJL, 'info@nordstrom.se')
    expect(
      ops.filter(o => o[0] === 'customer' && o[1] === 'insert'),
      'auto-skapandet av kund vid okänd avsändare försvann',
    ).toHaveLength(1)
  })

  test('känd kund ⇒ mejlet kopplas, ingen ny kund', async () => {
    const ops: any[] = []
    const { processInboundEmail } = processor({ matchedBy: 'email', customerId: 'cust_anna' }, ops)
    const db = bord({ email_conversations: [], customer: [ANNA], business_config: [] }, ops) as any

    await processInboundEmail(db, BIZ, MEJL, 'info@nordstrom.se')
    expect(ops.filter(o => o[0] === 'customer' && o[1] === 'insert')).toHaveLength(0)
    const sparade = ops.filter(o => o[0] === 'email_conversations' && o[1] === 'insert')
    expect(sparade[0][2].customer_id).toBe('cust_anna')
  })

  test('matcharen läser identiteten genom resolveContact, inte rått .eq(email)', () => {
    const källa = las('lib/gmail/processor.ts')
    const matcharen = källa.slice(källa.indexOf('async function matchSender'), källa.indexOf('function extractPhoneFromBody'))
    expect(matcharen).toContain('resolveContact')
    expect(matcharen, 'rått e-postuppslag tillbaka i matcharen').not.toContain(".eq('email'")
  })
})

// ══════════════════════════════════════════════════════════════════════
// 5. DealTimeline — SMS-grenen
// ══════════════════════════════════════════════════════════════════════

test.describe('DealTimeline', () => {
  const KÄLLA = las('components/pipeline/DealTimeline.tsx')
  const SMS_GREN = KÄLLA.slice(KÄLLA.indexOf("// 2. SMS"), KÄLLA.indexOf('// 3. Customer activities'))

  test('SMS-frågan filtrerar på kundens telefonkandidater', () => {
    expect(SMS_GREN).toContain('phoneCandidates')
    expect(SMS_GREN).toContain('phone_to.in.')
    expect(SMS_GREN).toContain('phone_from.in.')
  })

  test('kundens ID jämförs aldrig med ett telefonnummer', () => {
    // Kommentaren ovanför frågan beskriver den gamla buggen; bara KODEN prövas.
    const kod = SMS_GREN.split('\n').filter(rad => !rad.trim().startsWith('//')).join('\n')
    expect(kod, 'kund-ID söks åter som delsträng i ett telefonnummer').not.toMatch(/phone_to\.ilike[^\n]*customerId/)
    expect(kod).not.toMatch(/phone_(to|from)[^\n]*\$\{customerId\}/)
  })

  test('phoneCandidates går att importera i en klientkomponent (inga serverberoenden)', () => {
    const modul = las('lib/voice/find-customer-by-phone.ts')
    const importer = Array.from(modul.matchAll(/^import\s+(type\s+)?.*?from\s+'([^']+)'/gm))
    for (const [, typOnly, källa] of importer) {
      if (typOnly) continue
      expect(
        ['@/lib/phone-normalize', '@/lib/customer-dedupe'],
        `find-customer-by-phone drog in ${källa} — då kan DealTimeline inte importera phoneCandidates`,
      ).toContain(källa)
    }
  })
})

// ══════════════════════════════════════════════════════════════════════
// 6. Kommunikationsunderlaget — e-post skiftlägesokänsligt
// ══════════════════════════════════════════════════════════════════════

test.describe('communication-trail', () => {
  test('webbchatten matchas på gemen e-post och telefonkandidater', async () => {
    const ops: any[] = []
    const { getCommunicationTrail } = laddaKedja('lib/compliance/communication-trail.ts')
    const db = bord({ customer: [ANNA], quotes: [] }, ops) as any

    await getCommunicationTrail(db, BIZ, 'cust_anna')

    const villkor = ops.find(o => o[0] === 'widget_conversation' && o[1] === 'or')?.[2]
    expect(villkor, 'webbchatten slogs aldrig upp').toBeTruthy()
    expect(villkor, 'e-posten matchas skiftlägeskänsligt igen').toContain('visitor_email.ilike.anna@exempel.se')
    expect(villkor).not.toContain('visitor_email.eq.')
    expect(villkor, 'telefonen matchas på råvärdet igen').toContain('visitor_phone.in.')
    expect(villkor).toContain('+46701234567')
  })
})
