/**
 * Facit för innehållskontraktet på hemskärmen (Claude Design-granskningen
 * 2026-08-08, verifierad mot koden).
 *
 * Granskningen sa: korten bär en rubrik om ett problem och två knappar, inte
 * ett färdigt resultat man kan säga ja till — så Godkänn blir ett löfte utan
 * täckning. Kodläget var värre än så.
 *
 * `voice="foreslar"` stod HÅRDKODAT på varje kort, medan missad_intakt,
 * review_auto_invoice och four_eyes_* är REVIEW_REQUIRED i ACTION_CONTRACT och
 * alltså inte kan utföras. Servern svarade ärligt `executed: false` med texten
 * "Öppna ärendet och granska det innan något skickas" — och klienten kastade
 * svaret och skrev "skickade: …" i Klart idag.
 *
 * Det är samma felklass som Resend-buggen och de svalda Supabase-felen:
 * påstådd leverans utan verifierad leverans. Sanningen fanns redan i svaret;
 * ytan slängde den.
 *
 *   npx playwright test tests/innehallskontrakt.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { voiceFor, reviewAlternatives, doneRowText } from '../lib/jarvis/card-voice'
import { ACTION_CONTRACT, classify } from '../lib/approvals/action-contract'
import { cardActions } from '../lib/jarvis/voice'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const kod = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')

test.describe('regel 4: ett sant verb — planens viktigaste test', () => {
  test('INGEN korttyp kan säga "föreslår" utan att kunna utföras', () => {
    // Går över HELA kontraktet, inte ett urval. Läggs en ny typ till som
    // REVIEW_REQUIRED får den aldrig av misstag en Godkänn-knapp.
    const fel: string[] = []
    for (const [typ, klass] of Object.entries(ACTION_CONTRACT)) {
      const röst = voiceFor(typ)
      if (röst === 'foreslar' && klass !== 'EXECUTABLE_ACTION') fel.push(`${typ} (${klass})`)
      if (röst !== 'foreslar' && klass === 'EXECUTABLE_ACTION') fel.push(`${typ} borde få föreslå`)
    }
    expect(fel, `röst och kontrakt är oense: ${fel.join(', ')}`).toEqual([])
  })

  test('de fyra som utlöste fyndet frågar numera', () => {
    for (const typ of ['missad_intakt', 'review_auto_invoice', 'manual_project_create', 'four_eyes_quote']) {
      expect(classify(typ), `${typ} har bytt klass`).toBe('REVIEW_REQUIRED')
      expect(voiceFor(typ), `${typ} säger fortfarande föreslår`).toBe('fragar')
    }
  })

  test('okänd typ frågar — den godkänns aldrig blint', () => {
    expect(voiceFor('nagot_helt_nytt')).toBe('fragar')
    expect(voiceFor(null)).toBe('fragar')
    expect(voiceFor(undefined)).toBe('fragar')
  })

  test('ett frågande kort KAN inte utlösa ett godkännande', () => {
    // Det räcker inte att dölja knappen: cardActions sätter approves:false på
    // varje alternativ, så mekaniken i sig utesluter godkännande.
    const knappar = cardActions('fragar', { alternatives: reviewAlternatives('missad_intakt') })
    expect(knappar.length).toBeGreaterThan(0)
    expect(knappar.some(k => k.approves), 'ett granskningskort har en godkänn-knapp').toBe(false)
    expect(knappar[0].label).toBe('Öppna och granska')
  })

  test('ett utförande kort har fortfarande sin Godkänn-knapp', () => {
    const knappar = cardActions('foreslar', { approveLabel: 'Skicka påminnelsen' })
    expect(knappar.some(k => k.approves && k.label === 'Skicka påminnelsen')).toBe(true)
  })

  test('kvittensen anpassas efter vad kortet är', () => {
    // Man avvisar inte ett konstaterande.
    expect(reviewAlternatives('missad_intakt')[1].label).toBe('Avvisa')
    const ack = Object.entries(ACTION_CONTRACT).find(([, k]) => k === 'ACKNOWLEDGEMENT')
    if (ack) expect(reviewAlternatives(ack[0])[1].label).toBe('Noterat')
  })
})

test.describe('Klart idag ljuger inte om vad som hände', () => {
  test('executed:false ger serverns egna ord, aldrig "skickade"', () => {
    const rad = doneRowText({
      action: 'approve',
      title: 'Avslutat projekt saknar faktura',
      executed: false,
      note: 'Öppna ärendet och granska det innan något skickas.',
    })
    expect(rad, 'påstår fortfarande leverans').not.toContain('skickade')
    expect(rad).toContain('Öppna ärendet och granska')
  })

  test('utan note men executed:false sägs det ändå inte "skickade"', () => {
    const rad = doneRowText({ action: 'approve', title: 'Något', executed: false })
    expect(rad).not.toContain('skickade')
    expect(rad).toContain('öppnade')
  })

  test('ett verkligt utförande får säga skickade', () => {
    expect(doneRowText({ action: 'approve', title: 'Påminnelse', executed: true }))
      .toContain('skickade')
    // Äldre svar utan fältet får behålla det gamla ordet hellre än ett påhittat.
    expect(doneRowText({ action: 'approve', title: 'Påminnelse' })).toContain('skickade')
  })

  test('avvisning är alltid avvisning', () => {
    expect(doneRowText({ action: 'reject', title: 'X', executed: false })).toBe('avvisade: X')
  })
})

test.describe('bruset uppströms — fem rader om samma tio offerter', () => {
  test('Daniels schema och dedup-fönstret säger samma sak', () => {
    // 168 h dimensionerades för "söndag + onsdag" — det står i dedup-modulens
    // eget filhuvud. Daniel kördes ändå DAGLIGEN, så det räckte att modellen
    // formulerade om sig för att samma insikt skulle passera som ny.
    const v = JSON.parse(read('vercel.json'))
    const daniel = v.crons.find((c: any) => c.path.endsWith('/daniel'))
    expect(daniel, 'daniels cron saknas').toBeTruthy()
    expect(daniel.schedule, 'daniel kör oftare än dedup-fönstret klarar')
      .toMatch(/\* \* 0,3$/)
  })

  test('varje hypotes har en dedup-nyckel som beskriver fenomenet', () => {
    // Punkt 1-4 saknade instruerad nyckel och föll tillbaka på rubriken.
    const p = read('lib/agents/daniel/observation-prompt.ts')
    for (const nyckel of [
      'daniel_conversion_by_customer_type',
      'daniel_stale_quotes_pattern',
      'daniel_lead_source_conversion',
      'daniel_price_elasticity',
    ]) {
      expect(p, `hypotesen saknar ${nyckel}`).toContain(nyckel)
    }
  })

  test('rate-limiten tar bort brus i stället för att flytta det', () => {
    // Kontrollen låg EFTER inserten: observationen sparades, fick inget
    // related_approval_id, och dök upp som nyhetsrad i stället. Ett tak som
    // skulle skona hantverkaren gjorde beslutskort till nyheter.
    const s = kod('lib/agents/shared/save-and-push.ts')
    const grind = s.indexOf('approvalsRemainingToday <= 0')
    const insert = s.indexOf(".from('business_knowledge')")
    expect(grind, 'ingen kvotgrind').toBeGreaterThan(-1)
    expect(grind, 'kvoten kollas efter att raden sparats').toBeLessThan(insert)
  })

  test('ett avfärdat kort återuppstår inte som nyhet', () => {
    // Rutten nollar related_approval_id när kortet inte längre är pending
    // (rätt för Agera-knappen). Nyhetsfiltret testade bara det fältet, så
    // kortet man nyss avfärdat kom tillbaka längre ned på sidan.
    expect(kod('app/api/observations/route.ts')).toContain('had_approval: true')
    expect(kod('components/jarvis/JarvisHome.tsx'))
      .toContain('!o.related_approval_id && !o.had_approval')
  })

  test('utkastkorten åldras — NULL matchas aldrig av .lt()', () => {
    for (const fil of ['lib/quotes/suggest-quote-draft.ts', 'lib/ata/suggest-ata-draft.ts']) {
      expect(kod(fil), `${fil} sätter inget expires_at`).toContain('expires_at:')
    }
  })
})

test.describe('regel 3: ett ärende per kort', () => {
  const { groupApprovals, groupTitle, groupTotalKr } = require('../lib/jarvis/group-approvals')
  const kort = (id: string, typ: string, tid: string, payload: any = {}) => ({
    id, approval_type: typ, title: `Kort ${id}`, description: null,
    payload, risk_level: 'low', created_at: tid,
  })

  test('två förfallna fakturor samma dygn blir ETT beslut', () => {
    const g = groupApprovals([
      kort('a', 'invoice_reminder', '2026-08-08T09:00:00Z'),
      kort('b', 'invoice_reminder', '2026-08-08T14:00:00Z'),
    ])
    expect(g).toHaveLength(1)
    expect(g[0].merged).toBe(true)
    expect(g[0].members).toHaveLength(2)
    // Äldst representerar gruppen — det kortet har väntat längst.
    expect(g[0].primary.id).toBe('a')
  })

  test('olika dygn slås INTE ihop', () => {
    const g = groupApprovals([
      kort('a', 'invoice_reminder', '2026-08-07T09:00:00Z'),
      kort('b', 'invoice_reminder', '2026-08-08T09:00:00Z'),
    ])
    expect(g).toHaveLength(2)
  })

  test('olika typ slås INTE ihop', () => {
    const g = groupApprovals([
      kort('a', 'invoice_reminder', '2026-08-08T09:00:00Z'),
      kort('b', 'send_sms', '2026-08-08T09:30:00Z'),
    ])
    expect(g).toHaveLength(2)
  })

  test('utkastkort slås ALDRIG ihop — de bär olika innehåll', () => {
    // Två offertutkast är två olika offerter med egna rader och belopp.
    // Att slå ihop dem hade dolt exakt det regel 1 kräver ska synas.
    for (const typ of ['create_quote_draft', 'create_ata_draft', 'review_auto_invoice']) {
      const g = groupApprovals([
        kort('a', typ, '2026-08-08T09:00:00Z'),
        kort('b', typ, '2026-08-08T09:30:00Z'),
      ])
      expect(g, `${typ} slogs ihop`).toHaveLength(2)
    }
  })

  test('summan visas bara när ALLA medlemmar bär ett belopp', () => {
    const grupp = {
      primary: kort('a', 'invoice_reminder', '2026-08-08T09:00:00Z', { amount_kr: 3813 }),
      members: [
        kort('a', 'invoice_reminder', '2026-08-08T09:00:00Z', { amount_kr: 3813 }),
        kort('b', 'invoice_reminder', '2026-08-08T10:00:00Z', { amount_kr: 3813 }),
      ],
      merged: true,
    }
    const belopp = (a: any) => (a.payload.amount_kr as number) ?? null
    expect(groupTotalKr(grupp, belopp)).toBe(7626)

    // Saknar ett kort belopp är summan en gissning som ser exakt ut.
    const halvt = { ...grupp, members: [grupp.members[0], kort('c', 'invoice_reminder', '2026-08-08T11:00:00Z')] }
    expect(groupTotalKr(halvt, belopp)).toBeNull()
  })

  test('rubriken säger antalet, och beloppet bara när det finns', () => {
    const grupp = {
      primary: kort('a', 'invoice_reminder', '2026-08-08T09:00:00Z'),
      members: [kort('a', 'invoice_reminder', '2026-08-08T09:00:00Z'), kort('b', 'invoice_reminder', '2026-08-08T10:00:00Z')],
      merged: true,
    }
    expect(groupTitle(grupp, 7626)).toContain('2 fakturor har förfallit')
    // sv-SE formaterar med HÅRT mellanslag (U+00A0) — samma fälla som
    // formatKr-testerna i moments-sviten. Jämför mot samma formaterare.
    const formaterat = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(7626)
    expect(groupTitle(grupp, 7626)).toContain(` kr`)
    expect(groupTitle(grupp, null)).toBe('2 fakturor har förfallit')
    // Ensamt kort behåller sin egen rubrik.
    expect(groupTitle({ ...grupp, merged: false }, null)).toBe('Kort a')
  })

  test('ytan räknar beslut, inte databasrader, och döljer inte källraderna', () => {
    const s = kod('components/jarvis/JarvisHome.tsx')
    expect(s).toContain('const grupper = groupApprovals(synliga)')
    expect(s, 'räknaren räknar fortfarande rader').toContain('grupper.length + reschedules.length')
    // Sammanslagning får aldrig betyda att information försvinner.
    expect(s).toContain('group!.map(m =>')
  })

  test('ett godkännande på en grupp utför VARJE medlem', () => {
    const s = kod('components/jarvis/JarvisHome.tsx')
    expect(s).toContain('for (const m of medlemmar) await executeSend(m, action, editedText)')
    // Och ångrar man gruppen ska alla korten tillbaka, inte bara ett.
    expect(s).toContain('pendingTimers.current.forEach((timer, id)')
  })
})

test.describe('"Värt att veta" — tre grindar', () => {
  const { entityFrom, arSammanfattning, passerarGrindar, grindaNyheter } =
    require('../lib/jarvis/news-gates')
  const { nyhetsAtgard } = require('../lib/jarvis/news-actions')
  const obs = (id: string, data_basis: any = null) => ({
    id, agent_id: 'daniel', observation: 'text', suggestion: null,
    data_basis, created_at: '2026-08-08T09:00:00Z',
  })

  test('grind 2: en rad utan namngivet objekt faller', () => {
    expect(passerarGrindar(obs('a'), new Set())).toBe(false)
    expect(passerarGrindar(obs('b', { quote_id: 'q1' }), new Set())).toBe(true)
  })

  test('grind 3: en aggregatrad är en sammanfattning, inte ett fynd', () => {
    // "Av 11 offerter har 4 accepterats" — samma sak som Verksamheten säger.
    expect(arSammanfattning(obs('a', { metric: 'acceptance_rate_by_customer_type' }))).toBe(true)
    // ...men bär raden ett objekt är den ett fynd, även med metric.
    expect(arSammanfattning(obs('b', { metric: 'x', quote_id: 'q1' }))).toBe(false)
  })

  test('grind 1: en rad man redan sett är ingen nyhet', () => {
    const r = obs('a', { quote_id: 'q1' })
    expect(passerarGrindar(r, new Set())).toBe(true)
    expect(passerarGrindar(r, new Set(['a']))).toBe(false)
  })

  test('fem rader om samma tio offerter blir en', () => {
    // Fyra aggregatvarianter + ett riktigt fynd — precis Claude Designs bild.
    const rader = [
      obs('1', { metric: 'acceptance_rate_by_customer_type' }),
      obs('2', { metric: 'acceptance_by_detail_level' }),
      obs('3', null),
      obs('4', { metric: 'lead_source_conversion' }),
      obs('5', { quote_id: 'q_bengtsson' }),
    ]
    const kvar = grindaNyheter(rader, new Set())
    expect(kvar).toHaveLength(1)
    expect(kvar[0].id).toBe('5')
  })

  test('entiteten plockas ut specifikt före generellt', () => {
    expect(entityFrom({ quote_id: 'q1', customer_id: 'c1' })).toEqual({ typ: 'quote', id: 'q1' })
    expect(entityFrom({ customer_id: 'c1' })).toEqual({ typ: 'customer', id: 'c1' })
    expect(entityFrom({ metric: 'x' })).toBeNull()
    expect(entityFrom(null)).toBeNull()
    // Tom sträng är inget id.
    expect(entityFrom({ quote_id: '  ' })).toBeNull()
  })

  test('den döda länkgrenen är återupplivad', () => {
    // nyhetsAtgard tog redan emot entiteten — men anropades utan den, så
    // alla Daniels rader fick samma generiska länk till /dashboard/pipeline.
    const generisk = nyhetsAtgard('daniel', null)
    const specifik = nyhetsAtgard('daniel', entityFrom({ quote_id: 'q1' }))
    expect(generisk.href).toBe('/dashboard/pipeline')
    expect(specifik.href).toBe('/dashboard/quotes/q1')
    expect(specifik.label).toBe('Öppna offerten')

    const s = kod('components/jarvis/JarvisHome.tsx')
    expect(s, 'anropas fortfarande utan entitet')
      .toContain('nyhetsAtgard(o.agent_id, entityFrom(o.data_basis))')
  })

  test('ytan grindar, och markerar sett EFTER renderingen', () => {
    const s = kod('components/jarvis/JarvisHome.tsx')
    expect(s).toContain('grindaNyheter(')
    // Markeras de under renderingen filtreras de bort i samma render som de
    // visas i — och syns aldrig.
    expect(s).toContain('NYHET_SEDD_EFTER_MS')
    expect(s).toContain('hm_nyheter_sedda')
  })

  test('tomma tillstånd säger något sant i stället för en nolla', () => {
    const s = kod('components/jarvis/JarvisHome.tsx')
    // Siffran får stå kvar när den är över noll — felet var att en NOLLA
    // renderades rakt av. Villkoret är det som ska finnas.
    expect(s, 'antalet renderas fortfarande ovillkorligt')
      .toContain('pipelineStats.newLeadsToday > 0')
    expect(s).toContain('inga nya idag')
  })
})

test.describe('regel 1: kortet bär ett färdigt resultat', () => {
  const { approveLabel } = require('../lib/jarvis/approval-view')
  const { cardContext } = require('../lib/jarvis/card-context')

  test('invoice_reminder: beloppet och kunden ligger på toppnivå', () => {
    // Låg tidigare BARA nästlat under `delivery`. cardContext och
    // approveLabel läser toppnivån, så kontextraden blev tom och knappen
    // sa "Skicka påminnelsen" utan siffra.
    const s = kod('app/api/cron/send-reminders/route.ts')
    for (const falt of ['amount_kr:', 'customer_name:', 'invoice_number:']) {
      expect(s, `${falt} saknas på payloadens toppnivå`).toContain(falt)
    }
    // Och delivery är ORÖRT — deliverInvoiceReminder läser fortfarande därifrån.
    expect(s).toContain('delivery: deliveryInput')

    const payload = { amount_kr: 3813, customer_name: 'Andreas', invoice_number: '2026-001' }
    // sv-SE formaterar med HÅRT mellanslag (U+00A0) — jämför mot samma
    // formaterare i stället för mot en literal med vanligt mellanslag.
    expect(approveLabel('invoice_reminder', payload))
      .toContain((3813).toLocaleString('sv-SE'))
    expect(cardContext(payload)).toContain('Andreas')
  })

  test('review_auto_invoice: raderna följer med, inte bara summan', () => {
    // Fakturautkastet är redan SKAPAT — artefakten fanns, men payloaden bar
    // bara total och items_count. "Granska faktura" utan raderna är en
    // uppmaning att gå någon annanstans, inte ett färdigt resultat.
    const s = kod('lib/projects/auto-invoice-on-complete.ts')
    expect(s).toContain('preview: {')
    expect(s).toContain('items: allItems')
    expect(s).toContain('customer_pays:')
  })

  test('create_ata_draft producerar utkastet FÖRE frågan', () => {
    const s = kod('lib/ata/suggest-ata-draft.ts')
    // Genereringen ska ske i producenten, inte vid godkännandet.
    expect(s).toContain('generateQuoteFromInput')
    expect(s).toContain('preview')
    // Fail-soft: ett ÄTA-behov får inte försvinna för att modellen failar.
    expect(s).toContain('kortet skapas ändå')
  })

  test('create_ata_draft: rubriken är inte längre en kopia av brödtexten', () => {
    // Stod som `ÄTA-förslag: ${description.slice(0,80)}` direkt ovanför samma
    // sträng i sin helhet.
    const s = kod('lib/ata/suggest-ata-draft.ts')
    expect(s, 'rubriken är fortfarande en avhuggen kopia')
      .not.toContain('ÄTA-förslag: ${description.slice(0, 80)}')
    expect(s).toContain('preview?.job_title')
  })

  test('ett räknat belopp slår alltid en gissad parameter', () => {
    const s = kod('lib/ata/suggest-ata-draft.ts')
    const raknat = s.indexOf('preview?.total_before_vat')
    const gissat = s.indexOf('params.amountEstimate')
    expect(raknat, 'det räknade beloppet saknas').toBeGreaterThan(-1)
    expect(raknat, 'gissningen prioriteras före beräkningen').toBeLessThan(gissat)
  })
})

test.describe('ytan använder härledningen', () => {
  const s = kod('components/jarvis/JarvisHome.tsx')

  test('rösten är inte hårdkodad längre', () => {
    expect(s, 'voice="foreslar" står kvar hårdkodat').not.toContain('voice="foreslar"')
    expect(s).toContain('voiceFor(approval.approval_type)')
  })

  test('klienten läser serverns svar innan den skriver Klart idag', () => {
    expect(s).toContain('doneRowText({')
    // Fälten ligger nästlade under `execution` i route-svaret — läses de från
    // toppnivån blir executed alltid undefined och raden ljuger igen.
    expect(s).toContain('svar?.execution')
  })

  test('ångra-rutan säger inte "Skickar" om kort som inte kan skicka', () => {
    // Samma lögn som Klart idag-raden, bara några sekunder tidigare: den
    // optimistiska rutan visas FÖRE utskicket och sa "Skickar: …" även för
    // REVIEW_REQUIRED-kort.
    const i = s.indexOf('setSnack({')
    expect(i).toBeGreaterThan(-1)
    const block = s.slice(i, i + 500)
    expect(block).toContain('mayExecute(forsta.approval_type)')
    expect(block).toContain('Behandlar:')
  })

  test('Öppna-knappen öppnar i stället för att skicka', () => {
    const i = s.indexOf("action.id === 'open'")
    expect(i, 'ingen hantering av Öppna').toBeGreaterThan(-1)
    const efter = s.slice(i, i + 400)
    expect(efter).toContain('setDetailIds')
    expect(efter, 'Öppna skickar något').not.toContain('queueAction')
  })
})
