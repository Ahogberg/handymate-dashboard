/**
 * Facit för spår 3 — "Bokning på svar".
 *
 * ═══ VILKET VERKLIGT FEL DETTA STÄNGER ═══
 *
 * Vi skickade själva "Vi kan komma: 1) … 2) … Svara med numret som passar
 * bäst" och kunden svarade "2". Svaret gick rakt in i intent-agenten och blev
 * ett `lead_review`-kort med texten "2" — ingen koppling till tiderna vi just
 * erbjudit, ingen bokning, ingen bekräftelse. Koden sa det rakt ut
 * (lib/approvals/booking-times-review.ts): "Kundens svar hanteras separat
 * innan kalendern ändras". Det ledet fanns inte.
 *
 * Sex påståenden:
 *   1. Tolkningen är kod, inte en modell — och den gissar aldrig.
 *   2. Svar inom fönstret ⇒ erbjudandet `accepted` + EXAKT ett kort med rätt
 *      tid, och intent-vägen (lead_review-kortet) hoppas över.
 *   3. Utgånget erbjudande ⇒ ingen matchning, vanlig väg.
 *   4. Upptagen tid ⇒ nya tider EN gång; andra gången går ärendet till
 *      hantverkaren i stället för till kunden.
 *   5. Två svar på samma erbjudande ⇒ ett kort, en bokning (status-CAS).
 *   6. Godkänt kort ⇒ createBooking-vägen körs EN gång med exakt den valda
 *      tiden, `booking_created` avfyras, och kunden får bekräftelsen.
 *
 * Browserlöst. Riktiga källfiler transpileras och körs med injicerade
 * beroenden — samma harness som tests/sms-svar-blir-kund.spec.ts.
 *
 *   npx playwright test tests/bokning-pa-svar.spec.ts --no-deps --project=chromium --reporter=line
 */
import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { NextRequest } from 'next/server'
import * as ts from 'typescript'
import { classify, mayExecute } from '../lib/approvals/action-contract'

const ROT = join(__dirname, '..')
const las = (p: string) => readFileSync(join(ROT, p), 'utf8').replace(/\r\n/g, '\n')

/** Transpilerar en riktig källfil och kör den med injicerade beroenden. */
function ladda(fil: string, mocks: Record<string, any>) {
  const kod = ts.transpileModule(las(fil), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const exports: Record<string, any> = {}
  const req = (id: string) => (id in mocks ? mocks[id] : require(id))
  new Function('require', 'exports', kod)(req, exports)
  return exports
}

/** Fejkad Supabase: svar per tabell i kö, varje anrop loggas. */
function db(svar: Record<string, any[]>, operationer: any[] = []) {
  return {
    operationer,
    from(tabell: string) {
      const resultat = svar[tabell]?.shift() ?? { data: null, error: null }
      const q: any = { then: (r: any) => Promise.resolve(resultat).then(r) }
      for (const m of ['select', 'eq', 'neq', 'is', 'not', 'in', 'gt', 'gte', 'lt', 'contains', 'order', 'limit', 'insert', 'update', 'upsert']) {
        q[m] = (...a: any[]) => { operationer.push([tabell, m, ...a]); return q }
      }
      q.maybeSingle = async () => { operationer.push([tabell, 'maybeSingle']); return resultat }
      q.single = async () => { operationer.push([tabell, 'single']); return resultat }
      return q
    },
  }
}

const KANDIDATER = {
  phoneCandidates: (t: string) => Array.from(new Set([t, t.startsWith('0') ? '+46' + t.slice(1) : t])),
}
const NORMALISERA = { normalizeSwedishPhone: (t: string) => (t.startsWith('0') ? '+46' + t.slice(1) : t) }

const MODUL = 'lib/bookings/svar-pa-erbjudande.ts'
const BIZ = 'biz_1'
const FRAN = '+46701234567'

// Tre tider: två på tisdag, en på torsdag — så veckodagstolkningen får ett
// äkta tvetydighetsfall att avstå från.
const SLOTS = [
  { start: '2026-09-22T09:00:00+02:00', end: '2026-09-22T11:00:00+02:00', label: 'tisdag 22 september kl 09:00–11:00' },
  { start: '2026-09-22T13:00:00+02:00', end: '2026-09-22T15:00:00+02:00', label: 'tisdag 22 september kl 13:00–15:00' },
  { start: '2026-09-24T08:00:00+02:00', end: '2026-09-24T10:00:00+02:00', label: 'torsdag 24 september kl 08:00–10:00' },
]

const NU = new Date('2026-09-18T10:00:00+02:00')
const ERBJUDANDE = {
  id: 'boff_abc', business_id: BIZ, customer_id: 'cust_1', lead_id: null,
  phone_e164: FRAN, slots: SLOTS, source_approval_id: 'appr_1', parent_offer_id: null,
  status: 'open', chosen_slot: null,
  expires_at: '2026-09-20T10:00:00+02:00',
  resulting_approval_id: null, resulting_booking_id: null,
}

function laddaModul(korten: any[], extra: Record<string, any> = {}) {
  return ladda(MODUL, {
    '@/lib/voice/find-customer-by-phone': KANDIDATER,
    '@/lib/phone-normalize': NORMALISERA,
    '@/lib/approvals/skapa-kort': {
      skapaKort: async (_s: any, kort: any) => { korten.push(kort); return { id: kort.id } },
    },
    '@/lib/bookings/erbjudande': {
      rensaSlots: (v: any) => (Array.isArray(v) ? v : []),
    },
    ...extra,
  })
}

/** Standardkö: erbjudandet, ledig kalender, lyckad CAS, kundnamn. */
function svarDb(över: Record<string, any[]> = {}, ops: any[] = []) {
  return db({
    booking_offer: [{ data: { ...ERBJUDANDE }, error: null }, { data: { id: ERBJUDANDE.id }, error: null }],
    booking: [{ data: [], error: null }],
    schedule_entry: [{ data: [], error: null }],
    customer: [{ data: { name: 'Anna Svensson' }, error: null }],
    ...över,
  }, ops)
}

// ══════════════════════════════════════════════════════════════════════
// 1. Tolkningen är kod — och gissar aldrig
// ══════════════════════════════════════════════════════════════════════

test.describe('1. tolkaSvar', () => {
  const { tolkaSvar } = laddaModul([])

  test('siffran vi bad om räknas', () => {
    expect(tolkaSvar('2', SLOTS)).toBe(1)
    expect(tolkaSvar(' 2) ', SLOTS)).toBe(1)
    expect(tolkaSvar('Nr 3 tack', SLOTS)).toBe(2)
    expect(tolkaSvar('alternativ 1', SLOTS)).toBe(0)
  })

  test('veckodag som bara en tid har räknas', () => {
    expect(tolkaSvar('torsdag funkar bäst', SLOTS)).toBe(2)
    expect(tolkaSvar('Tors', SLOTS)).toBe(2)
  })

  test('veckodag med två tider kräver klockslag', () => {
    // Två tider på tisdag: utan klockslag VET vi inte, och då bokar vi inget.
    expect(tolkaSvar('tisdag', SLOTS)).toBeNull()
    expect(tolkaSvar('tisdag 13', SLOTS)).toBe(1)
    expect(tolkaSvar('tisdag kl 09:00', SLOTS)).toBe(0)
  })

  test('tvetydigt eller orelaterat svar matchar ingenting', () => {
    expect(tolkaSvar('1 eller 2 går bra', SLOTS)).toBeNull()
    expect(tolkaSvar('tisdag eller torsdag', SLOTS)).toBeNull()
    // Nämns två dagar och bara EN av dem har en tid är det fortfarande inget
    // val — kunden kan mena den andra dagen, som vi inte erbjudit.
    expect(tolkaSvar('torsdag eller fredag', SLOTS)).toBeNull()
    expect(tolkaSvar('4', SLOTS)).toBeNull()
    expect(tolkaSvar('Hej, vad kostar det att byta proppskåp?', SLOTS)).toBeNull()
    expect(tolkaSvar('', SLOTS)).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════
// 2. Svar inom fönstret ⇒ accepterat erbjudande + ETT kort
// ══════════════════════════════════════════════════════════════════════

test.describe('2. svaret blir ett kort', () => {
  test('"2" accepterar erbjudandet och ger exakt ett bokningskort med rätt tid', async () => {
    const korten: any[] = []
    const ops: any[] = []
    const { svarPaErbjudande } = laddaModul(korten)
    const r = await svarPaErbjudande({ supabase: svarDb({}, ops) as any, businessId: BIZ, from: FRAN, text: '2', nu: NU })

    expect(r.hanterat, 'svaret måste stoppa den vanliga vägen').toBe(true)
    expect(r.utfall).toBe('accepterat')
    expect(r.vald?.start).toBe(SLOTS[1].start)

    // Erbjudandet skrivs om med CAS open → accepted.
    const cas = ops.find(o => o[0] === 'booking_offer' && o[1] === 'update')
    expect(cas, 'erbjudandet uppdaterades aldrig').toBeTruthy()
    expect(cas[2].status).toBe('accepted')
    expect(cas[2].chosen_slot.start).toBe(SLOTS[1].start)
    // Villkoren räknas från UPPDATERINGEN och framåt — uppslaget ovanför har
    // sitt eget status-filter och skulle annars dölja en borttagen CAS.
    const casVillkor = ops
      .slice(ops.indexOf(cas))
      .filter(o => o[0] === 'booking_offer' && o[1] === 'eq')
      .map(o => `${o[2]}=${o[3]}`)
    expect(casVillkor, 'CAS:en saknar villkoret status=open — två svar skulle ge två kort').toContain('status=open')

    // EXAKT ett kort, och det är bokningskortet — inget lead_review.
    expect(korten).toHaveLength(1)
    expect(korten[0].approval_type).toBe('booking_offer_confirm')
    expect(korten[0].payload.slot.start).toBe(SLOTS[1].start)
    expect(korten[0].payload.offer_id).toBe(ERBJUDANDE.id)
    expect(korten[0].risk_level).toBe('high')
    expect(korten[0].title).toContain('Anna')
    expect(korten[0].title).toContain('13:00')
    expect(korten.some(k => k.approval_type === 'lead_review'), 'ett lead_review-kort ovanpå bokningskortet').toBe(false)
  })

  test('uppslaget kräver öppet, icke utgånget erbjudande i rätt företag', async () => {
    const ops: any[] = []
    const { svarPaErbjudande } = laddaModul([])
    await svarPaErbjudande({ supabase: svarDb({}, ops) as any, businessId: BIZ, from: FRAN, text: '2', nu: NU })
    const villkor = ops.filter(o => o[0] === 'booking_offer')
    expect(villkor.some(o => o[1] === 'eq' && o[2] === 'business_id' && o[3] === BIZ), 'uppslaget är inte tenant-scopat').toBe(true)
    expect(villkor.some(o => o[1] === 'eq' && o[2] === 'status' && o[3] === 'open')).toBe(true)
    expect(villkor.some(o => o[1] === 'gt' && o[2] === 'expires_at')).toBe(true)
    const kandidater = villkor.find(o => o[1] === 'in' && o[2] === 'phone_e164')
    expect(kandidater, 'numret slås inte upp på kandidatformerna').toBeTruthy()
    expect(kandidater[3]).toContain(FRAN)
  })

  test('otolkbart svar lämnar erbjudandet orört och går vanliga vägen', async () => {
    const korten: any[] = []
    const ops: any[] = []
    const { svarPaErbjudande } = laddaModul(korten)
    const r = await svarPaErbjudande({
      supabase: svarDb({}, ops) as any, businessId: BIZ, from: FRAN,
      text: 'Kan ni ringa mig i stället?', nu: NU,
    })
    expect(r.hanterat).toBe(false)
    expect(korten).toHaveLength(0)
    expect(ops.some(o => o[0] === 'booking_offer' && o[1] === 'update')).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════
// 3. Utgånget erbjudande
// ══════════════════════════════════════════════════════════════════════

test('3. utgånget erbjudande matchar inte, även om raden råkar komma tillbaka', async () => {
  const korten: any[] = []
  const { svarPaErbjudande } = laddaModul(korten)
  const utgånget = { ...ERBJUDANDE, expires_at: '2026-09-17T10:00:00+02:00' }
  const r = await svarPaErbjudande({
    supabase: svarDb({ booking_offer: [{ data: utgånget, error: null }] }) as any,
    businessId: BIZ, from: FRAN, text: '2', nu: NU,
  })
  expect(r.hanterat, 'ett två dygn gammalt erbjudande får inte boka någon').toBe(false)
  expect(r.utfall).toBe('ingen_matchning')
  expect(korten).toHaveLength(0)
})

// ══════════════════════════════════════════════════════════════════════
// 4. Upptagen tid — nya tider EN gång
// ══════════════════════════════════════════════════════════════════════

test.describe('4. tiden hann bli upptagen', () => {
  test('första gången: erbjudandet superseded och nya tider förbereds', async () => {
    const korten: any[] = []
    const ops: any[] = []
    const { svarPaErbjudande } = laddaModul(korten)
    const r = await svarPaErbjudande({
      supabase: svarDb({ booking: [{ data: [{ booking_id: 'book_x' }], error: null }] }, ops) as any,
      businessId: BIZ, from: FRAN, text: '2', nu: NU,
    })
    expect(r.utfall).toBe('upptagen_nytt_forslag')
    const cas = ops.find(o => o[0] === 'booking_offer' && o[1] === 'update')
    expect(cas[2].status).toBe('superseded')
    expect(korten).toHaveLength(1)
    // Samma väg och samma grindar som det första tidsförslaget — ingen ny
    // utskickstyp: SMS:et går först när hantverkaren godkänner kortet.
    expect(korten[0].approval_type).toBe('propose_booking_times')
    expect(korten[0].payload.parent_offer_id).toBe(ERBJUDANDE.id)
    expect(korten[0].payload.duration_hours).toBe(2)
  })

  test('andra gången: inget tredje SMS — ärendet går till hantverkaren', async () => {
    const korten: any[] = []
    const { svarPaErbjudande } = laddaModul(korten)
    const andraRundan = { ...ERBJUDANDE, id: 'boff_def', parent_offer_id: 'boff_abc' }
    const r = await svarPaErbjudande({
      supabase: svarDb({
        booking_offer: [{ data: andraRundan, error: null }, { data: { id: andraRundan.id }, error: null }],
        booking: [{ data: [{ booking_id: 'book_x' }], error: null }],
      }) as any,
      businessId: BIZ, from: FRAN, text: '2', nu: NU,
    })
    expect(r.utfall).toBe('upptagen_till_hantverkaren')
    expect(korten).toHaveLength(1)
    expect(korten[0].approval_type, 'kunden fick ett tredje SMS med tider').not.toBe('propose_booking_times')
    expect(korten[0].approval_type).toBe('agent_insight')
  })

  test('konfliktkollen som inte kan svara bokar aldrig', async () => {
    const korten: any[] = []
    const { svarPaErbjudande } = laddaModul(korten)
    const r = await svarPaErbjudande({
      supabase: svarDb({ booking: [{ data: null, error: { message: 'nätverksfel' } }] }) as any,
      businessId: BIZ, from: FRAN, text: '2', nu: NU,
    })
    expect(r.hanterat, 'ett uppslagsfel tolkades som "ledig"').toBe(false)
    expect(korten).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════════════
// 5. Två svar ⇒ ett kort
// ══════════════════════════════════════════════════════════════════════

test('5. andra svaret på samma erbjudande ger inget nytt kort', async () => {
  const korten: any[] = []
  const { svarPaErbjudande } = laddaModul(korten)
  // CAS:en träffar ingen rad: någon (det första svaret) hann före.
  const r = await svarPaErbjudande({
    supabase: svarDb({
      booking_offer: [{ data: { ...ERBJUDANDE }, error: null }, { data: null, error: null }],
    }) as any,
    businessId: BIZ, from: FRAN, text: '2', nu: NU,
  })
  expect(r.utfall).toBe('redan_besvarat')
  expect(r.hanterat, 'det andra svaret ska inte heller bli ett lead_review-kort').toBe(true)
  expect(korten, 'två svar gav två kort — och därmed två bokningar').toHaveLength(0)
})

// ══════════════════════════════════════════════════════════════════════
// 6. Granskningen fryser tiden — och blockerar en tid som blivit tagen
// ══════════════════════════════════════════════════════════════════════

test.describe('6. granskningen', () => {
  const GRANSKNING = 'lib/approvals/booking-offer-review.ts'
  const granskningsMocks = (ledig: boolean) => ({
    '@/lib/bookings/svar-pa-erbjudande': { arSlotenLedig: async () => ledig },
    '@/lib/bookings/erbjudande': {},
    '@/lib/bookings/confirmation-sms': {
      buildBookingConfirmationSms: (p: any) => `Hej Anna! Din tid hos ${p.businessName} är bokad: ${p.scheduledStart}`,
    },
  })
  const accepterat = { ...ERBJUDANDE, status: 'accepted', chosen_slot: SLOTS[1] }

  test('underlaget läses ur erbjudandet och fryser vald tid + bekräftelsetext', async () => {
    const { prepareBookingOfferReview } = ladda(GRANSKNING, granskningsMocks(true))
    const prepared = await prepareBookingOfferReview(
      db({
        booking_offer: [{ data: accepterat, error: null }],
        customer: [{ data: { customer_id: 'cust_1', name: 'Anna Svensson', phone_number: FRAN }, error: null }],
        business_config: [{ data: { business_name: 'Nordström El AB', assigned_phone_number: '+46766860747' }, error: null }],
      }) as any,
      BIZ,
      { offer_id: ERBJUDANDE.id, kundens_svar: '2' },
    )
    expect(prepared.executionPayload.start).toBe(SLOTS[1].start)
    expect(prepared.executionPayload.durationMinutes).toBe(120)
    expect(prepared.executionPayload.message).toContain('Nordström El AB')
    expect(prepared.review.confirmLabel).toBe('Boka tiden')
    expect(prepared.review.messages[0].recipients).toEqual([FRAN])
  })

  test('tid som blivit upptagen mellan svaret och trycket blockerar kortet', async () => {
    const { prepareBookingOfferReview } = ladda(GRANSKNING, granskningsMocks(false))
    await expect(prepareBookingOfferReview(
      db({
        booking_offer: [{ data: accepterat, error: null }],
        customer: [{ data: { customer_id: 'cust_1', name: 'Anna', phone_number: FRAN }, error: null }],
        business_config: [{ data: { business_name: 'Nordström El AB' }, error: null }],
      }) as any,
      BIZ,
      { offer_id: ERBJUDANDE.id },
    )).rejects.toThrow(/upptagen/i)
  })

  test('en redan skapad bokning går inte att skapa igen', async () => {
    const { prepareBookingOfferReview } = ladda(GRANSKNING, granskningsMocks(true))
    await expect(prepareBookingOfferReview(
      db({ booking_offer: [{ data: { ...accepterat, resulting_booking_id: 'book_1' }, error: null }] }) as any,
      BIZ, { offer_id: ERBJUDANDE.id },
    )).rejects.toThrow(/redan/i)
  })
})

// ══════════════════════════════════════════════════════════════════════
// 7. Godkännandet: EN bokning på exakt den valda tiden + booking_created
// ══════════════════════════════════════════════════════════════════════

test.describe('7. bokningsvägen', () => {
  function laddaApproveActions(ops: any[], händelser: any[]) {
    return ladda('lib/approve-actions.ts', {
      '@/lib/rot-rut': { rotRutDeductionInclVat: () => 0 },
      '@/lib/quotes/create-quote': { createQuote: async () => ({}) },
      '@/lib/customer-dedupe': { findCustomerDuplicates: async () => [] },
      '@/lib/products/price-list-view': { getPublicPriceList: async () => [] },
      '@/lib/branch': { describeBranches: () => '', resolveBusinessBranch: () => '' },
      '@/lib/automation-engine': {
        fireEvent: async (_s: any, namn: string, biz: string, data: any) => { händelser.push({ namn, biz, data }) },
      },
      '@/lib/notifications': { notifyBookingConflict: async () => {} },
    })
  }

  test('bokningen skapas EN gång, med den valda tiden, och avfyrar booking_created', async () => {
    const ops: any[] = []
    const händelser: any[] = []
    const { executeApproveAction } = laddaApproveActions(ops, händelser)
    const r = await executeApproveAction(
      db({
        booking: [
          { data: [], error: null },
          { data: { booking_id: 'book_ny' }, error: null },
        ],
        schedule_entry: [{ data: [], error: null }],
      }, ops) as any,
      { suggestion_type: 'booking', business_id: BIZ, customer_id: 'cust_1' },
      {
        customer_name: 'Anna Svensson', phone_number: FRAN,
        scheduled_start: SLOTS[1].start, scheduled_end: SLOTS[1].end,
        duration_minutes: 120, service: 'Tid som kunden valt i SMS',
      },
    )
    expect(r.success, r.error).toBe(true)

    const inserts = ops.filter(o => o[0] === 'booking' && o[1] === 'insert')
    expect(inserts, 'mer än en bokning skapades').toHaveLength(1)
    const rad = inserts[0][2]
    // Exakt den valda tiden — inte en sträng utan tidszon som servern tolkar
    // som UTC (kunden hade fått en tid två timmar fel).
    expect(Date.parse(rad.scheduled_start)).toBe(Date.parse(SLOTS[1].start))
    expect(Date.parse(rad.scheduled_end)).toBe(Date.parse(SLOTS[1].end))
    // booking.status är enumet booking_status i prod; 'pending' finns inte,
    // och kolumnen `source` finns inte alls. Inserten failade förut alltid.
    expect(rad.status).toBe('confirmed')
    expect(Object.keys(rad), 'kolumnen source finns inte på booking i prod').not.toContain('source')

    const skapade = händelser.filter(h => h.namn === 'booking_created')
    expect(skapade, 'booking_created avfyrades inte exakt en gång').toHaveLength(1)
    expect(skapade[0].data.booking_id).toBe('book_ny')
  })

  test('krock ⇒ ingen bokning och inget event', async () => {
    const ops: any[] = []
    const händelser: any[] = []
    const { executeApproveAction } = laddaApproveActions(ops, händelser)
    const r = await executeApproveAction(
      db({
        booking: [{ data: [{ booking_id: 'book_x', scheduled_start: SLOTS[1].start, scheduled_end: SLOTS[1].end }], error: null }],
        schedule_entry: [{ data: [], error: null }],
        ai_suggestion: [{ data: null, error: null }],
      }, ops) as any,
      { suggestion_type: 'booking', business_id: BIZ, customer_id: 'cust_1' },
      { scheduled_start: SLOTS[1].start, scheduled_end: SLOTS[1].end },
    )
    expect(r.success).toBe(false)
    expect(ops.filter(o => o[0] === 'booking' && o[1] === 'insert')).toHaveLength(0)
    expect(händelser.filter(h => h.namn === 'booking_created')).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════════════
// 8. Kortkontraktet och utförandegrenen
// ══════════════════════════════════════════════════════════════════════

test.describe('8. kortet går att godkänna — och okända typer gör det inte', () => {
  const RUTT_KOD = las('app/api/approvals/[id]/route.ts')

  test('typen är klassad som utförande och har en egen gren i rutten', () => {
    expect(classify('booking_offer_confirm')).toBe('EXECUTABLE_ACTION')
    expect(mayExecute('booking_offer_confirm')).toBe(true)
    expect(RUTT_KOD, 'typen saknar hanterare — kortet failar stängt vid klick')
      .toContain("case 'booking_offer_confirm':")
  })

  test('grenen skapar bokningen genom den befintliga vägen och skickar bekräftelsen', () => {
    const gren = RUTT_KOD.slice(RUTT_KOD.indexOf("case 'booking_offer_confirm':"))
      .slice(0, RUTT_KOD.slice(RUTT_KOD.indexOf("case 'booking_offer_confirm':")).indexOf("case 'autonomy_offer':"))
    expect(gren).toContain('executeApproveAction')
    expect(gren).toContain("messageType: 'booking_confirmation'")
    expect(gren, 'utan idempotenskontroll kan två tryck ge två bokningar').toContain('resulting_booking_id')
  })

  test('en okänd korttyp godkänns fortfarande inte', () => {
    expect(classify('hittepa_kort')).toBeNull()
    expect(mayExecute('hittepa_kort')).toBe(false)
  })

  test('slot-SMS:ets gren skriver erbjudandet först när SMS:et gått iväg', () => {
    const gren = RUTT_KOD.slice(RUTT_KOD.indexOf("case 'propose_booking_times':"))
    expect(gren.slice(0, 6000)).toContain('skapaErbjudande')
    expect(gren.slice(0, 6000)).toContain('if (r.sms_sent)')
  })
})

// ══════════════════════════════════════════════════════════════════════
// 9. Rutten: svaret går FÖRE intent-agenten
// ══════════════════════════════════════════════════════════════════════

test.describe('9. inkommande SMS', () => {
  const RUTT = 'app/api/sms/incoming/route.ts'
  const FORETAG = { business_id: BIZ, business_name: 'Nordström El AB' }
  const PAYLOAD = new URLSearchParams({
    direction: 'incoming', id: 'sf1', from: FRAN, to: '+46766860747', message: '2',
  }).toString()

  function ruttMocks(hanterat: boolean, spår: string[]) {
    return {
      '@/lib/elks-webhook-auth': {
        verifieraElksWebhook: () => ({ ok: true, via: 'hemlighet' }),
        larmaAvvisadElksWebhook: () => {}, medElksHemlighet: (u: string) => u,
      },
      '@/lib/agent-trigger': {
        triggerAgentFireAndForget: () => { spår.push('agent') },
        makeIdempotencyKey: () => 'k',
      },
      '@/lib/sms-send': { sendSmsViaElks: async () => ({ success: true }), parseOptOutCommand: () => null },
      '@/lib/outbound/sms-gate': { resolveSmsCustomer: async () => ({ ok: false, code: 'not_found', error: 'x' }) },
      '@/lib/matte/owner-sender': { isTeamPhone: async () => false },
      '@/lib/voice/find-customer-by-phone': { ...KANDIDATER, findCustomerByPhone: async () => null },
      '@/lib/sms/relatera-missat-samtal': {
        hittaMissatSamtal: async () => ({ related_call_id: null, svar_pa_missat_samtal: false }),
        INGEN_KOPPLING: { related_call_id: null, svar_pa_missat_samtal: false },
      },
      '@/lib/bookings/svar-pa-erbjudande': {
        svarPaErbjudande: async () => { spår.push('erbjudande'); return { hanterat, utfall: hanterat ? 'accepterat' : 'ingen_matchning' } },
      },
      '@/lib/matte/resolver': { resolveEntity: async () => { spår.push('intent'); return null } },
      '@/lib/matte/intent-agent': { runIntentAgent: async () => { spår.push('intent'); return {} } },
      '@/lib/matte/action-executor': { executeMatteActions: async () => { spår.push('intent') } },
      '@/lib/matte/calendar-slots': { getAvailableSlots: async () => [] },
      '@/lib/sms/svar-blir-jobb': { svarBlirJobb: async () => { spår.push('lead_review'); return { hanteradeTyper: [] } } },
      '@/lib/automation-engine': { fireEvent: async () => ({}) },
      '@/lib/supabase': { getServerSupabase: () => db({
        business_config: [{ data: FORETAG, error: null }, { data: FORETAG, error: null }],
        sms_conversation: [{ data: { id: 1 }, error: null }, { data: [], error: null }],
      }) },
    }
  }

  const anrop = () => new NextRequest('https://app.handymate.se/api/sms/incoming?k=h', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: PAYLOAD,
  })

  test('matchat erbjudande stoppar intent-vägen, lead-kortet och agentsvaret', async () => {
    const spår: string[] = []
    const api = ladda(RUTT, ruttMocks(true, spår))
    await api.POST(anrop())
    await new Promise(r => setTimeout(r, 30))
    expect(spår).toContain('erbjudande')
    expect(spår, 'intent-agenten kördes ovanpå ett redan hanterat tidsval').not.toContain('intent')
    expect(spår, 'kunden fick ett lead_review-kort med texten "2"').not.toContain('lead_review')
    expect(spår, 'den fria agenten svarade kunden ovanpå bokningskortet').not.toContain('agent')
  })

  test('utan matchning går SMS:et den vanliga vägen', async () => {
    const spår: string[] = []
    const api = ladda(RUTT, ruttMocks(false, spår))
    await api.POST(anrop())
    await new Promise(r => setTimeout(r, 30))
    expect(spår).toContain('erbjudande')
    expect(spår, 'vanliga vägen stängdes av för alla SMS').toContain('intent')
    expect(spår).toContain('agent')
  })
})
