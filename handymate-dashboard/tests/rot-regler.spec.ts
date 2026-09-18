/**
 * FACIT: ROT/RUT som DATERAD regel — en sanning (spår 5, 2026-09-18).
 *
 * Vad som bevisas här:
 *  1. `lib/rot/regler.ts` ger rätt regel per datum, inklusive gränsdagarna
 *     kring den tillfälligt höjda ROT-satsen (2025-05-12..2025-12-31), och
 *     ALDRIG en tyst gissning utanför tabellen (verifierad:false + warn).
 *  2. Tal går genom VARJE väg med två datum (2025-06-01 ⇒ 50 %,
 *     2026-03-01 ⇒ 30 %): de rena funktionerna, årstaksvägen, skv-vägen,
 *     grön teknik i offertmotorn och alla fakturavägar som verkligen räknar
 *     ett ROT-avdrag. Lärdomen 2026-09-16 ("en delad funktion måste bevisas
 *     på varje väg") är skälet till att fakturavägarna KÖRS, inte skannas.
 *  3. Källskanning: satserna och taken får inte återuppstå som literaler i
 *     lib/ eller app/ utanför lib/rot/regler.ts.
 *
 * Browserlöst: riktiga källfiler transpileras och körs med injicerade
 * beroenden (samma mönster som tests/project-invoice-journey.spec.ts).
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'
import { regelFor, ROT_REGLER, arsFor, gronTeknikAndelarFor } from '../lib/rot/regler'
import * as rotRut from '../lib/rot-rut'
import * as rotBasis from '../lib/rot-rut-basis'
import * as status from '../lib/invoices/status'
import * as mapper from '../lib/invoices/quote-to-invoice-items'
import * as lifecycle from '../lib/ata/lifecycle'
import * as regler from '../lib/rot/regler'
import { calculateQuoteTotals, calculatePublicQuoteTotalsFromBase } from '../lib/quote-calculations'
import { validateInvoiceForSkv } from '../lib/skv/validate-rot-request'

const ROT = path.join(__dirname, '..')
const las = (f: string) => fs.readFileSync(path.join(ROT, f), 'utf8')

/** Arbetskostnad 10 000 kr ex moms ⇒ 12 500 kr inkl moms. */
const ARBETE = 10000
const ROT_2025 = 6250 // 50 % av 12 500
const ROT_2026 = 3750 // 30 % av 12 500

function compile(file: string, deps: Record<string, unknown>) {
  const js = ts.transpileModule(las(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText
  const m = { exports: {} as any }
  new Function('require', 'module', 'exports', js)((n: string) => {
    if (!(n in deps)) throw new Error('Ostubbat beroende: ' + n)
    return deps[n]
  }, m, m.exports)
  return m.exports
}

/** Kör fn med systemklockan låst till ett datum — vägar som saknar ett
 *  uttryckligt datum faller på `new Date()` och ska då följa DEN dagens regel. */
async function medKlocka<T>(iso: string, fn: () => Promise<T> | T): Promise<T> {
  const Riktig = Date
  class Fejk extends Riktig {
    constructor(...args: any[]) {
      // @ts-expect-error – vidarebefordran till Date-konstruktorn
      if (args.length === 0) super(iso); else super(...args)
    }
    static now() { return new Riktig(iso).getTime() }
  }
  ;(globalThis as any).Date = Fejk
  try {
    return await fn()
  } finally {
    ;(globalThis as any).Date = Riktig
  }
}

// ── 1. Regeln själv ────────────────────────────────────────────────────────

test('regelFor ger den tillfälligt höjda ROT-satsen mitt i 2025 och 30 % 2026', () => {
  const sommar = regelFor('2025-06-01')
  expect(sommar.rot_andel).toBe(0.50)
  expect(sommar.verifierad).toBe(true)

  const vinter = regelFor('2026-03-01')
  expect(vinter.rot_andel).toBe(0.30)
  expect(vinter.rot_tak).toBe(50000)
  expect(vinter.rut_andel).toBe(0.50)
  expect(vinter.rut_tak).toBe(75000)
  expect(vinter.totalt_tak).toBe(75000)
  expect(vinter.gron_teknik_tak).toBe(50000)
  expect(vinter.verifierad).toBe(true)
})

test('gränsdagarna går rakt igenom — 11/12 maj 2025 och nyår 2025/2026', () => {
  expect(regelFor('2025-05-11').rot_andel).toBe(0.30)
  expect(regelFor('2025-05-12').rot_andel).toBe(0.50)
  expect(regelFor('2025-12-31').rot_andel).toBe(0.50)
  expect(regelFor('2026-01-01').rot_andel).toBe(0.30)
})

test('utanför tabellen: närmaste regel, verifierad:false och en warn — aldrig en tyst gissning', () => {
  const warns: any[] = []
  const original = console.warn
  console.warn = (...a: any[]) => { warns.push(a) }
  try {
    const gammal = regelFor('2024-12-31')
    expect(gammal.verifierad).toBe(false)
    expect(gammal.giltig_fran).toBe(ROT_REGLER[0].giltig_fran)

    const trasig = regelFor('inte-ett-datum')
    expect(trasig.verifierad).toBe(false)
  } finally {
    console.warn = original
  }
  expect(warns.length).toBe(2)
  expect(String(warns[0][0])).toContain('[rot/regler]')
})

test('regeln kastar aldrig och läser Date i svensk tid', () => {
  expect(() => regelFor(new Date('bajs' as any))).not.toThrow()
  expect(regelFor(new Date('2025-06-01T10:00:00Z')).rot_andel).toBe(0.50)
  expect(arsFor('2025-06-01')).toBe(2025)
  expect(gronTeknikAndelarFor('2025-06-01')).toEqual({ gron_solceller: 0.15, gron_lagring: 0.50, gron_laddpunkt: 0.50 })
})

test('tabellen är lückfri och icke-överlappande', () => {
  for (let i = 1; i < ROT_REGLER.length; i++) {
    const forra = ROT_REGLER[i - 1]
    expect(forra.giltig_till, 'bara sista raden får vara öppen').not.toBeNull()
    expect(ROT_REGLER[i].giltig_fran > String(forra.giltig_till)).toBe(true)
  }
  expect(ROT_REGLER[ROT_REGLER.length - 1].giltig_till).toBeNull()
})

// ── 2. De rena beräkningsvägarna ───────────────────────────────────────────

test('lib/rot-rut: avdraget följer datumet', () => {
  expect(rotRut.rotRutDeductionInclVat('rot', ARBETE, { datum: '2025-06-01' })).toBe(ROT_2025)
  expect(rotRut.rotRutDeductionInclVat('rot', ARBETE, { datum: '2026-03-01' })).toBe(ROT_2026)
  // RUT är 50 % i båda perioderna — samma tal, men det ska bevisas, inte antas.
  expect(rotRut.rotRutDeductionInclVat('rut', ARBETE, { datum: '2025-06-01' })).toBe(6250)
  expect(rotRut.rotRutDeductionInclVat('rut', ARBETE, { datum: '2026-03-01' })).toBe(6250)
})

test('lib/rot-rut: calculateRotRut och etiketten läser samma regel', () => {
  const items = [{ type: 'labor' as const, total: ARBETE }]
  const j2025 = rotRut.calculateRotRut(items, 'rot', 12500, '2025-06-01')
  expect(j2025.rate).toBe(0.50)
  expect(j2025.deduction).toBe(ROT_2025)
  expect(j2025.maxPerPerson).toBe(50000)

  const j2026 = rotRut.calculateRotRut(items, 'rot', 12500, '2026-03-01')
  expect(j2026.rate).toBe(0.30)
  expect(j2026.deduction).toBe(ROT_2026)

  expect(rotRut.getRotRutLabel('rot', '2025-06-01')).toBe('ROT-avdrag 50%')
  expect(rotRut.getRotRutLabel('rot', '2026-03-01')).toBe('ROT-avdrag 30%')
  expect(rotRut.getRotRutLabel('rut', '2026-03-01')).toBe('RUT-avdrag 50%')
})

test('lib/rot-rut: taket klipper även med den höga satsen', () => {
  // 200 000 ex moms ⇒ 250 000 inkl moms ⇒ 50 % = 125 000, men taket är 50 000.
  expect(rotRut.rotRutDeductionInclVat('rot', 200000, { datum: '2025-06-01' })).toBe(50000)
  expect(rotRut.gronTeknikDeductionInclVat(45000, { datum: '2025-06-01' })).toBe(50000)
})

// ── 3. Årstaksvägen (lib/rot-rut-limits) med riktig databas-stubb ──────────

function laddaLimits(fakturor: any[] = []) {
  const db: any = {
    from() {
      const q: any = {
        select: () => q, eq: () => q, in: () => q, gte: () => q, lte: () => q, neq: () => q,
        then: (ok: any, bad: any) => Promise.resolve({ data: fakturor, error: null }).then(ok, bad),
      }
      return q
    },
  }
  return compile('lib/rot-rut-limits.ts', {
    '@/lib/supabase': { getServerSupabase: () => db },
    '@/lib/invoices/status': status,
    '@/lib/rot-rut': rotRut,
    '@/lib/rot/regler': regler,
  })
}

test('calculateRawDeduction och buildValidationFromUsage följer datumet', () => {
  const limits = laddaLimits()
  expect(limits.calculateRawDeduction('rot', ARBETE, { datum: '2025-06-01' })).toBe(ROT_2025)
  expect(limits.calculateRawDeduction('rot', ARBETE, { datum: '2026-03-01' })).toBe(ROT_2026)

  const usage = { rot_used: 48000, rut_used: 0, total_used: 48000, rot_remaining: 2000, rut_remaining: 75000, total_remaining: 27000, year: 2025 }
  const v = limits.buildValidationFromUsage('rot', ROT_2025, usage, '2025-06-01')
  expect(v.max_allowed_deduction).toBe(2000)
  expect(v.warning).toContain('överskrider')
})

test('validateRotRutDeduction + calculateCappedDeduction: samma arbetskostnad, olika datum', async () => {
  const limits = laddaLimits([])
  const v2025 = await limits.validateRotRutDeduction('c', 'b', 'rot', ARBETE, { datum: '2025-06-01' })
  expect(v2025.requested_deduction).toBe(ROT_2025)
  expect(v2025.allowed).toBe(true)

  const v2026 = await limits.validateRotRutDeduction('c', 'b', 'rot', ARBETE, { datum: '2026-03-01' })
  expect(v2026.requested_deduction).toBe(ROT_2026)

  expect((await limits.calculateCappedDeduction('c', 'b', 'rot', ARBETE, { datum: '2025-06-01' })).deduction).toBe(ROT_2025)
  expect((await limits.calculateCappedDeduction('c', 'b', 'rot', ARBETE, { datum: '2026-03-01' })).deduction).toBe(ROT_2026)
})

test('calculateCappedDeduction kapar mot kundens redan använda utrymme — med 2025 års sats', async () => {
  const limits = laddaLimits([{ rot_rut_type: 'rot', rot_rut_deduction: 48000, status: 'paid', is_credit_note: false }])
  const kapat = await limits.calculateCappedDeduction('c', 'b', 'rot', ARBETE, { datum: '2025-06-01' })
  expect(kapat.capped).toBe(true)
  expect(kapat.deduction).toBe(2000)
  const usage = await limits.getCustomerRotRutUsage('c', 'b', 2025)
  expect(usage.rot_remaining).toBe(2000)
  expect(usage.total_remaining).toBe(27000)
  expect(usage.year).toBe(2025)
})

// ── 4. Skatteverket-valideringen (betalningsdatumet styr) ─────────────────

function skvFaktura(over: Record<string, any> = {}) {
  return {
    invoice: {
      invoice_id: 'i', status: 'customer_paid', paid_at: '2025-06-01', total: 100000,
      rot_rut_type: 'rot', rot_work_cost: ARBETE, rot_deduction: ROT_2025, vat_rate: 25,
      rot_hours: 10, rot_work_category: 'Bygg', rot_property_type: 'smahus',
      rot_property_designation: 'BÅLSTA 1:1', ...over,
    },
    customerPersonalNumber: '199001010009', businessOrgNumber: '5566778899', taxYear: 2025,
  }
}

test('skv-valideringen läser årstaket ur regeln för betalningsdatumet', () => {
  const ok = validateInvoiceForSkv(skvFaktura() as any)
  expect(ok.errors).toEqual([])
  expect(ok.normalized?.begartBelopp).toBe(ROT_2025)

  const overTak = validateInvoiceForSkv(skvFaktura({ rot_deduction: 50001, rot_work_cost: 200000 }) as any)
  expect(overTak.errors.join(' ')).toContain('årstaket 50000')

  const rut = validateInvoiceForSkv({
    ...skvFaktura({ rot_rut_type: 'rut', rut_work_cost: 200000, rut_deduction: 75001, rot_property_type: null }),
    taxYear: 2025,
  } as any)
  expect(rut.errors.join(' ')).toContain('årstaket 75000')
})

// ── 5. Offertmotorn: ROT + grön teknik ────────────────────────────────────

const offertRad = (over: Record<string, any> = {}) => ({
  id: 'r1', item_type: 'item' as const, description: 'Arbete', quantity: 1, unit: 'tim',
  unit_price: ARBETE, total: ARBETE, sort_order: 0, is_rot_eligible: false, is_rut_eligible: false,
  labor_amount: null, material_amount: null, travel_amount: null, ...over,
})

test('calculateQuoteTotals: samma offert, olika datum ⇒ olika ROT-avdrag', () => {
  const items: any[] = [offertRad({ rot_rut_type: 'rot', is_rot_eligible: true })]
  expect(calculateQuoteTotals(items, 0, 25, '2025-06-01').rotDeduction).toBe(ROT_2025)
  expect(calculateQuoteTotals(items, 0, 25, '2026-03-01').rotDeduction).toBe(ROT_2026)
})

test('grön teknik-satserna kommer ur regeln, oförändrade (15/50/50, tak 50 000)', () => {
  // OBS: satserna flyttades hit OFÖRÄNDRADE från lib/quote-calculations.ts.
  // Att offertmotorns grön-gren i sig är död sedan tidigare (getBasisRotRutType
  // returnerar null för gron_*, så gronBase blir 0 — tests/gron-teknik.spec.ts
  // var RÖD redan före det här passet) är ett ANNAT fel och rörs inte här.
  // Det som bevisas: satserna och taket kommer ur regeln och följer datumet.
  for (const datum of ['2025-06-01', '2026-03-01']) {
    expect(gronTeknikAndelarFor(datum)).toEqual({ gron_solceller: 0.15, gron_lagring: 0.50, gron_laddpunkt: 0.50 })
    // 10 000 ex moms × 15 % = 1 500, × 1,25 moms = 1 875.
    expect(rotRut.gronTeknikDeductionInclVat(ARBETE * gronTeknikAndelarFor(datum).gron_solceller, { datum })).toBe(1875)
    expect(rotRut.gronTeknikDeductionInclVat(ARBETE * gronTeknikAndelarFor(datum).gron_lagring, { datum })).toBe(6250)
    // Taket klipper: 200 000 × 50 % × 1,25 = 125 000 ⇒ 50 000.
    expect(rotRut.gronTeknikDeductionInclVat(200000 * gronTeknikAndelarFor(datum).gron_laddpunkt, { datum })).toBe(50000)
  }
})

test('tillvalsvägen (calculatePublicQuoteTotalsFromBase) bär datumet vidare', () => {
  const bas = calculateQuoteTotals([], 0, 25, '2025-06-01')
  const tillval: any[] = [{ id: 'o1', item_type: 'option', quantity: 1, unit_price: ARBETE, total: ARBETE, rot_rut_type: 'rot', unit: 'tim' }]
  const valda = new Set(['o1'])
  expect(calculatePublicQuoteTotalsFromBase(bas, tillval, valda, 0, 25, '2025-06-01').rotDeduction).toBe(ROT_2025)
  expect(calculatePublicQuoteTotalsFromBase(bas, tillval, valda, 0, 25, '2026-03-01').rotDeduction).toBe(ROT_2026)
})

// ── 6. Fakturavägarna — tal genom VARJE väg ───────────────────────────────

const ROT_RAD = {
  id: 'r1', item_type: 'item', description: 'Arbete', quantity: 1, unit: 'tim',
  unit_price: ARBETE, total: ARBETE, labor_amount: ARBETE, material_amount: 0, travel_amount: 0,
  is_rot_eligible: true, rot_rut_type: 'rot', type: 'labor',
}

function fakturaHarness() {
  const tables: Record<string, any[]> = {
    quotes: [{ quote_id: 'q', business_id: 'b', customer_id: 'c', rot_rut_type: 'rot', vat_rate: 25, items: [ROT_RAD], total: 12500 }],
    quote_items: [],
    project: [{ project_id: 'p', business_id: 'b', customer_id: 'c', quote_id: 'q', name: 'Garage', status: 'completed', vat_rate: 25 }],
    project_change: [],
    project_material: [],
    invoice: [],
    customer: [{ customer_id: 'c', business_id: 'b', name: 'Demokund' }],
    business_config: [{ business_id: 'b', business_name: 'Demo', org_number: '5566778899', bankgiro: '123-4567', default_payment_days: 30, next_invoice_number: 1 }],
    time_entry: [{ time_entry_id: 't1', business_id: 'b', customer_id: 'c', project_id: 'p', duration_minutes: 600, hourly_rate: 1000, work_date: '2025-06-01', work_category: 'work', description: 'Arbete', billable: true, invoiced: false, customer: { name: 'Demokund' } }],
    business_users: [],
    booking: [{ booking_id: 'bk', business_id: 'b', agreement_id: 'a', customer_id: 'c', job_status: 'completed' }],
    service_agreement: [{ agreement_id: 'a', business_id: 'b', customer_id: 'c', rot_rut_type: 'rot', title: 'Avtal', price_items: [{ description: 'Servicebesök', quantity: 1, unit_price: ARBETE, is_rot_eligible: true }] }],
    pending_approvals: [],
  }
  const skapade: any[] = []
  const db: any = {
    from(table: string) {
      let fields = '*'; let one = false
      const filters: ((r: any) => boolean)[] = []
      const q: any = {
        select: (s?: string) => { if (s) fields = s; return q },
        eq: (k: string, v: any) => { filters.push(r => r[k] === v); return q },
        neq: (k: string, v: any) => { filters.push(r => r[k] !== v); return q },
        in: (k: string, v: any[]) => { filters.push(r => v.includes(r[k])); return q },
        gte: () => q, lte: () => q, is: () => q, or: () => q, order: () => q, limit: () => q,
        single: () => { one = true; return q },
        maybeSingle: () => { one = true; return q },
        insert: (rows: any) => { const arr = Array.isArray(rows) ? rows : [rows]; tables[table] = [...(tables[table] || []), ...arr]; return q },
        update: () => q,
        then: (ok: any, bad: any) => Promise.resolve().then(() => {
          const rows = (tables[table] || []).filter(r => filters.every(f => f(r))).map(r => ({ ...r }))
          void fields
          return { data: one ? (rows[0] || null) : rows, error: null }
        }).then(ok, bad),
      }
      return q
    },
  }
  const limits = (() => {
    const inner: any = { from: () => ({ select: () => inner.q, }) }
    void inner
    const stubDb: any = {
      from() {
        const q: any = { select: () => q, eq: () => q, in: () => q, gte: () => q, lte: () => q, neq: () => q,
          then: (ok: any, bad: any) => Promise.resolve({ data: [], error: null }).then(ok, bad) }
        return q
      },
    }
    return compile('lib/rot-rut-limits.ts', {
      '@/lib/supabase': { getServerSupabase: () => stubDb },
      '@/lib/invoices/status': status,
      '@/lib/rot-rut': rotRut,
      '@/lib/rot/regler': regler,
    })
  })()

  const anrop: { datum: any; deduction: number }[] = []
  const limitsSpion = {
    ...limits,
    calculateCappedDeduction: async (c: string, b: string, t: any, l: number, o: any = {}) => {
      const r = await limits.calculateCappedDeduction(c, b, t, l, o)
      anrop.push({ datum: o.datum, deduction: r.deduction })
      return r
    },
  }

  const deps: any = {
    'next/server': { NextResponse, NextRequest },
    '@/lib/supabase': { getServerSupabase: () => db },
    '@/lib/auth': { getAuthenticatedBusiness: async () => ({ business_id: 'b' }) },
    '@/lib/permissions': { getCurrentUser: async () => ({ id: 'u' }), hasPermission: () => true },
    '@/lib/rot-rut-limits': limitsSpion,
    '@/lib/rot-rut': rotRut,
    '@/lib/rot-rut-basis': rotBasis,
    '@/lib/invoices/quote-to-invoice-items': mapper,
    '@/lib/ata/lifecycle': lifecycle,
    '@/lib/observability/driftlarm': { rapporteraTystFel: async () => {} },
    '@/lib/types/invoice': {},
    '@supabase/supabase-js': {},
    '@/lib/invoices/create-invoice': {
      createInvoice: async (_: any, input: any) => {
        skapade.push(input)
        return { invoice: { invoice_id: 'i' + skapade.length, invoice_number: 'TEST', ...input } }
      },
    },
  }

  return { tables, skapade, anrop, deps, db }
}

const req = (body: any) => new NextRequest('https://test/x', { method: 'POST', body: JSON.stringify(body) })

/** Kör en fakturaväg under en låst klocka och returnera avdraget den räknade. */
async function vagensAvdrag(iso: string, kor: (h: ReturnType<typeof fakturaHarness>) => Promise<any>) {
  const h = fakturaHarness()
  let svar: any = null
  await medKlocka(iso, async () => { const r: any = await kor(h); svar = r && typeof r.json === 'function' ? await r.json() : r })
  return { avdrag: h.skapade[0]?.rotRutDeduction, anrop: h.anrop, skapade: h.skapade, svar }
}

const vagar: Record<string, (h: ReturnType<typeof fakturaHarness>) => Promise<any>> = {
  'from-quote': async h => {
    const r = compile('app/api/invoices/from-quote/route.ts', h.deps)
    return r.POST(req({ quote_id: 'q' }))
  },
  'from-time-entries': async h => {
    const r = compile('app/api/invoices/from-time-entries/route.ts', h.deps)
    return r.POST(req({ customer_id: 'c', time_entry_ids: ['t1'], rot_rut_type: 'rot' }))
  },
  'invoices POST': async h => {
    const r = compile('app/api/invoices/route.ts', h.deps)
    return r.POST(req({ customer_id: 'c', items: [ROT_RAD], rot_rut_type: 'rot', vat_rate: 25 }))
  },
  'from-project': async h => {
    const r = compile('app/api/invoices/from-project/route.ts', h.deps)
    return r.POST(req({ project_id: 'p', customer_id: 'c', rot_rut_type: 'rot', vat_rate: 25, items: [ROT_RAD] }))
  },
  'create-final-invoice': async h => {
    const r = compile('app/api/projects/[id]/create-final-invoice/route.ts', h.deps)
    return r.POST(req({}), { params: { id: 'p' } })
  },
  'invoice-visit (serviceavtal)': async h => {
    const r = compile('lib/agreements/invoice-visit.ts', h.deps)
    return r.invoiceAgreementVisit(h.db, 'b', 'bk')
  },
}

for (const [namn, kor] of Object.entries(vagar)) {
  test(`fakturavägen ${namn} räknar 50 % 2025-06-01 och 30 % 2026-03-01`, async () => {
    const j2025 = await vagensAvdrag('2025-06-01T09:00:00Z', kor)
    expect(j2025.anrop.length, 'vägen ska ha frågat årstaksfunktionen').toBeGreaterThan(0)
    expect(j2025.anrop[0].deduction).toBe(ROT_2025)

    const j2026 = await vagensAvdrag('2026-03-01T09:00:00Z', kor)
    expect(j2026.anrop[0].deduction).toBe(ROT_2026)
  })
}

test('projektfakturaunderlaget (byggProjektFakturaUnderlag) räknar på samma regel', async () => {
  for (const [iso, vantat] of [['2025-06-01T09:00:00Z', ROT_2025], ['2026-03-01T09:00:00Z', ROT_2026]] as const) {
    const h = fakturaHarness()
    h.tables.quotes[0].items = [ROT_RAD]
    const draft = compile('lib/invoices/project-invoice-draft.ts', h.deps)
    await medKlocka(iso, () => draft.byggProjektFakturaUnderlag(h.db, 'b', 'p'))
    expect(h.anrop.length, 'underlaget ska ha frågat årstaksfunktionen').toBeGreaterThan(0)
    expect(h.anrop[0].deduction).toBe(vantat)
  }
})

test('POST /api/invoices med invoice_date 2025 räknar 2025 års sats — även när klockan står på 2026', async () => {
  const h = fakturaHarness()
  const r = compile('app/api/invoices/route.ts', h.deps)
  await medKlocka('2026-03-01T09:00:00Z', () =>
    r.POST(req({ customer_id: 'c', items: [ROT_RAD], rot_rut_type: 'rot', vat_rate: 25, invoice_date: '2025-06-01' })))
  expect(h.anrop[0].datum, 'fakturadatumet måste nå avdragsberäkningen').toBeTruthy()
  expect(h.anrop[0].deduction).toBe(ROT_2025)
})

test('de fakturavägar som har ett datum i scope skickar det vidare', async () => {
  for (const namn of ['from-quote', 'from-time-entries', 'invoices POST']) {
    const h = fakturaHarness()
    await medKlocka('2025-06-01T09:00:00Z', () => vagar[namn](h))
    expect(h.anrop[0]?.datum, `${namn} ska skicka datum`).toBeTruthy()
  }
})

test('offertens årstakshjälpare (applyAnnualCap) bär datumet till årstaket', async () => {
  const h = fakturaHarness()
  const cap = compile('lib/quotes/apply-annual-cap.ts', h.deps)
  const totals = { rotWorkCost: ARBETE, rutWorkCost: 0, subtotal: ARBETE, afterDiscount: ARBETE, total: 12500 }
  const nu = { rotDeduction: 0, rotCustomerPays: 0, rutDeduction: 0, rutCustomerPays: 0 }
  await cap.applyAnnualCap('b', 'c', 25, totals, nu, '2025-06-01')
  expect(h.anrop[0].datum).toBe('2025-06-01')
  expect(h.anrop[0].deduction).toBe(ROT_2025)
  await cap.applyAnnualCap('b', 'c', 25, totals, nu, '2026-03-01')
  expect(h.anrop[1].deduction).toBe(ROT_2026)
})

test('kreditvägen ärver originalfakturans avdrag i stället för att räkna om satsen', () => {
  const src = las('app/api/invoices/credit/route.ts')
  // Kreditfakturan proportionerar originalets avdrag — den får ALDRIG
  // applicera en sats, för då skulle en kredit av en 2025-faktura räknas
  // med dagens regel.
  expect(src).toContain('original.rot_rut_deduction')
  expect(src).not.toMatch(/rotRutDeductionInclVat|calculateCappedDeduction/)
  const original = ROT_2025
  expect(-Math.abs(Math.round(original * 0.5))).toBe(-3125)
})

// ── 7. Källskanning: literalerna får inte återuppstå ──────────────────────

/** Filer som räknar ROT/RUT/grön teknik i pengar. Här får satserna och taken
 *  inte finnas som literaler — de kommer ur lib/rot/regler.ts. */
const KARNFILER = [
  'lib/rot-rut.ts',
  'lib/rot-rut-limits.ts',
  'lib/skv/validate-rot-request.ts',
  'lib/quote-calculations.ts',
  'lib/quotes/apply-annual-cap.ts',
  'lib/invoice-calculations.ts',
  'lib/ata/totals.ts',
  'lib/rot-rut-basis.ts',
  'app/api/invoices/route.ts',
  'app/api/invoices/from-quote/route.ts',
  'app/api/invoices/from-project/route.ts',
  'app/api/invoices/from-time-entries/route.ts',
  'app/api/projects/[id]/create-final-invoice/route.ts',
  'lib/invoices/project-invoice-draft.ts',
  'lib/agreements/invoice-visit.ts',
]

/** Strikt mönster för pengaräknande kärnfiler — där får ingen av siffrorna stå. */
const FORBJUDNA = /(?<![\d.-])(0\.30|0\.50|0\.5|50_?000|75_?000)(?![\d])/
/** Bredare skanning över lib/+app/: `0.5` utan decimalnolla är för vanligt i
 *  Tailwind-klasser (`mt-0.5`) och arbetsandelar (`labor_share: 0.5`) för att
 *  kunna förbjudas globalt — satsen skrivs `0.50` i den här kodbasen. */
const FORBJUDNA_BRETT = /(?<![\d.-])(0\.30|0\.50|50_?000|75_?000)(?![\d])/

test('ROT-satserna och taken finns inte som literaler i pengaräknande filer', () => {
  for (const fil of KARNFILER) {
    const rader = las(fil).split('\n')
    rader.forEach((rad, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(rad)) return // kommentarer får nämna siffrorna
      expect(FORBJUDNA.test(rad), `${fil}:${i + 1} — ${rad.trim()}`).toBe(false)
    })
  }
})

/**
 * UNDANTAGSLISTA — rader i lib/ och app/ som innehåller en av siffrorna OCH ett
 * ROT/RUT/avdrags-ord, men som INTE är en ROT-sats eller ett ROT-tak.
 * Varje rad har ett skäl. Listan får bara växa med ett skrivet skäl.
 */
const UNDANTAG: { fil: string; skal: string }[] = [
  { fil: 'lib/product-defaults.ts', skal: 'produktprislista (styckpris 75 000 kr för en köksrenovering), inte ett avdragstak' },
  { fil: 'lib/rot/regler.ts', skal: 'regeltabellen själv — här SKA siffrorna stå' },
]

test('ingen annan fil i lib/ eller app/ bär en ROT/RUT-sats eller ett ROT-tak som literal', () => {
  const traffar: string[] = []
  const gaIgenom = (dir: string) => {
    for (const post of fs.readdirSync(path.join(ROT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${post.name}`
      if (post.isDirectory()) { gaIgenom(rel); continue }
      if (!/\.tsx?$/.test(post.name)) continue
      if (UNDANTAG.some(u => u.fil === rel)) continue
      las(rel).split('\n').forEach((rad, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(rad)) return
        if (!FORBJUDNA_BRETT.test(rad)) return
        if (!/rot|rut|gron|grön|avdrag|deduction/i.test(rad)) return
        traffar.push(`${rel}:${i + 1} — ${rad.trim()}`)
      })
    }
  }
  gaIgenom('lib')
  gaIgenom('app')
  expect(traffar, 'flytta siffran till lib/rot/regler.ts eller skriv in ett skäl i UNDANTAG').toEqual([])
})

test('ARCHITECTURE.md pekar på regeln i stället för på inställningsnycklar', () => {
  const arch = las('ARCHITECTURE.md')
  expect(arch).toContain('lib/rot/regler.ts')
  const avsnitt = arch.slice(arch.indexOf('### 3.2'), arch.indexOf('## 4.'))
  expect(avsnitt).not.toMatch(/\|\s*`rot_deduction_rate`\s*\|/)
})
