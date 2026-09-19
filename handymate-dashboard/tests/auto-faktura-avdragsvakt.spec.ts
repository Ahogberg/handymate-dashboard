import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'
import { avdragsvaktSkal, kunderMedAvdragshistorik } from '../lib/invoices/auto-invoice-avdragsvakt'

/**
 * Facit för avdragsvakten i auto-faktureringen (spår 5, 2026-09-18).
 *
 * ═══ VILKET FEL SOM STÄNGS ═══
 *
 * app/api/invoices/auto-generate satte `customerPays: total` och skrev aldrig
 * rot_rut_type, rot_rut_deduction eller rot_work_cost. En ROT-kund fick en
 * auto-faktura på FULLT belopp, och kundens årsutrymme förbrukades inte.
 *
 * ═══ VARFÖR FACITET PRÖVAR EN VAKT OCH INTE EN BERÄKNING ═══
 *
 * Avdraget går inte att räkna i den rutten, slaget upp mot produktionsdatabasen
 * 2026-09-18: `customer` har NOLL ROT/RUT-kolumner, och auto-fakturan har
 * varken offert eller projekt att läsa rot_rut_type, personnummer eller
 * fastighetsbeteckning ur. Tidposter har ingen jobbtyp, så inte heller
 * lib/rot/tabell.ts kan avgöra berättigandet. Ett avdrag räknat på det
 * underlaget vore en gissning om skatt.
 *
 * Rutten hoppar därför över kunder med avdragshistorik, med samma logik som
 * den redan utesluter tidposter utan timpris. Fel åt rätt håll: en utebliven
 * auto-faktura går att skicka för hand, en skickad faktura utan avdrag
 * upptäcks först när kunden ringer.
 */

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// ── Den rena domen ────────────────────────────────────────────────────────
test.describe('vem har avdragshistorik', () => {
  test('rot och rut räknas, båda källorna slås samman', () => {
    const ut = kunderMedAvdragshistorik([
      { customer_id: 'k1', rot_rut_type: 'rot' },
      { customer_id: 'k2', rot_rut_type: 'rut' },
    ])
    expect(Array.from(ut).sort()).toEqual(['k1', 'k2'])
  })

  test('tomt, okänt och saknat värde är INTE ett spår', () => {
    // Faller det här blockeras hela kundregistret av en slarvig sträng, och
    // auto-fakturering slutar fungera helt i stället för att fungera rätt.
    const ut = kunderMedAvdragshistorik([
      { customer_id: 'k1', rot_rut_type: null },
      { customer_id: 'k2', rot_rut_type: '' },
      { customer_id: 'k3', rot_rut_type: 'gron_teknik' },
      { customer_id: 'k4', rot_rut_type: 'nej' },
    ])
    expect(Array.from(ut)).toEqual([])
  })

  test('versaler och blanksteg i databasen ska inte släppa igenom en ROT-kund', () => {
    const ut = kunderMedAvdragshistorik([
      { customer_id: 'k1', rot_rut_type: ' ROT ' },
      { customer_id: 'k2', rot_rut_type: 'Rut' },
    ])
    expect(Array.from(ut).sort()).toEqual(['k1', 'k2'])
  })

  test('rad utan kund ignoreras utan att kasta', () => {
    expect(Array.from(kunderMedAvdragshistorik([{ customer_id: null, rot_rut_type: 'rot' }]))).toEqual([])
  })

  test('skälet säger vad man ska göra, och upprepar inte kundnamnet', () => {
    const skal = avdragsvaktSkal()
    expect(skal).toContain('fakturera dem för hand')
    // Ytan visar customer_name bredvid skälet; i 375 px blev upprepningen
    // "Familjen Lind — Familjen Lind har haft…" (sett 2026-09-18).
    expect(skal).toContain('Har haft ROT- eller RUT-avdrag')
    // Inga tekniska termer i hantverkarens text.
    expect(skal).not.toMatch(/rot_rut_type|payload|null|customer_id/)
  })
})

// ── Rutten körd på riktigt, med databasgränsen mockad ─────────────────────
interface Fixtur {
  tidposter: any[]
  kunder: any[]
  offerterMedAvdrag: any[]
  fakturorMedAvdrag: any[]
  lasfel?: boolean
}

function rutt(fix: Fixtur) {
  const skapade: any[] = []
  const tystaFel: any[] = []
  const db = {
    from(table: string) {
      const filter: Record<string, any> = {}
      const q: any = {
        select: () => q,
        eq: (k: string, v: any) => { filter[k] = v; return q },
        is: () => q,
        not: () => q,
        in: () => q,
        order: () => q,
        insert: () => Promise.resolve({ error: null }),
        update: () => q,
        single: async () => {
          if (table === 'business_config') {
            return { data: { business_name: 'Firman', default_payment_days: 30, default_hourly_rate: 700, contact_email: 'a@b.se' }, error: null }
          }
          return { data: null, error: null }
        },
      }
      // Läsningar som returnerar listor: awaitas direkt av rutten.
      const lista = (data: any[], error: any = null) => Object.assign(q, {
        then: (res: any) => res({ data, error }),
      })
      if (table === 'time_entry') return lista(fix.tidposter)
      if (table === 'customer') return lista(fix.kunder)
      if (table === 'quotes') return lista(fix.offerterMedAvdrag, fix.lasfel ? { message: 'nätverket' } : null)
      if (table === 'invoice') return lista(fix.fakturorMedAvdrag, fix.lasfel ? { message: 'nätverket' } : null)
      return q
    },
  }
  const kod = ts.transpileModule(read('app/api/invoices/auto-generate/route.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const api: Record<string, any> = {}
  const mocks: Record<string, any> = {
    'next/server': { NextRequest, NextResponse },
    '@/lib/auth': { getAuthenticatedBusiness: async () => ({ business_id: 'biz-a' }) },
    '@/lib/cron/verify-secret': { verifyCronSecret: () => false },
    '@/lib/supabase': { getServerSupabase: () => db },
    '@/lib/observability/driftlarm': {
      rapporteraTystFel: async (_db: unknown, _b: string, kod: string, text: string) => { tystaFel.push({ kod, text }) },
    },
    '@/lib/branding/get-branding': { loadBranding: async () => null, brandingFromConfig: () => ({}) },
    '@/lib/invoices/create-invoice': {
      createInvoice: async (_db: unknown, input: any) => {
        skapade.push(input)
        return { invoice: { invoice_id: 'inv_1' }, invoiceNumber: 'FV-2026-001', replayed: false }
      },
    },
    // Den RIKTIGA vakten — det är den som prövas.
    '@/lib/invoices/auto-invoice-avdragsvakt': require(path.join(ROOT, 'lib/invoices/auto-invoice-avdragsvakt')),
  }
  new Function('require', 'exports', kod)((id: string) => mocks[id] ?? require(id), api)
  return { api, skapade, tystaFel }
}

const tidpost = (id: string, kund: string, minuter = 120) => ({
  time_entry_id: id, customer_id: kund, duration_minutes: minuter,
  hourly_rate: 700, work_date: '2026-09-10', description: 'Arbete', is_billable: true,
})
const anrop = () => new NextRequest('https://test/api/invoices/auto-generate', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
})

test.describe('rutten kör tal', () => {
  test('ROT-kund får INGEN auto-faktura, och skälet säger varför', async () => {
    const { api, skapade } = rutt({
      tidposter: [tidpost('t1', 'k-rot')],
      kunder: [{ customer_id: 'k-rot', name: 'Familjen Lind', email: 'l@x.se', phone_number: '+46701740001' }],
      offerterMedAvdrag: [{ customer_id: 'k-rot', rot_rut_type: 'rot' }],
      fakturorMedAvdrag: [],
    })
    const svar = await api.POST(anrop())
    const body = await svar.json()
    // Det här är hela felet: förut skapades en faktura på fullt belopp här.
    expect(skapade).toHaveLength(0)
    expect(body.invoices_created).toBe(0)
    expect(body.skipped[0].customer_name).toBe('Familjen Lind')
    expect(body.skipped[0].reason).toContain('ROT- eller RUT-avdrag')
  })

  test('kund utan avdragshistorik faktureras som förut, med rätt belopp', async () => {
    const { api, skapade } = rutt({
      tidposter: [tidpost('t1', 'k-vanlig'), tidpost('t2', 'k-vanlig', 60)],
      kunder: [{ customer_id: 'k-vanlig', name: 'Bolaget AB', email: 'b@x.se', phone_number: '+46701740002' }],
      offerterMedAvdrag: [],
      fakturorMedAvdrag: [],
    })
    const svar = await api.POST(anrop())
    const body = await svar.json()
    expect(body.invoices_created).toBe(1)
    expect(skapade).toHaveLength(1)
    // 2 h + 1 h à 700 kr = 2 100 exkl moms, 2 625 inkl 25 %.
    expect(skapade[0].subtotal).toBe(2100)
    expect(skapade[0].total).toBe(2625)
    expect(skapade[0].customerPays).toBe(2625)
    expect(skapade[0].sources.timeEntryIds).toEqual(['t1', 't2'])
  })

  test('RUT-spår räknas likadant som ROT', async () => {
    const { api, skapade } = rutt({
      tidposter: [tidpost('t1', 'k-rut')],
      kunder: [{ customer_id: 'k-rut', name: 'Hemhjälpen', email: 'h@x.se', phone_number: '+46701740003' }],
      offerterMedAvdrag: [],
      fakturorMedAvdrag: [{ customer_id: 'k-rut', rot_rut_type: 'rut' }],
    })
    const body = await (await api.POST(anrop())).json()
    expect(skapade).toHaveLength(0)
    expect(body.skipped[0].customer_name).toBe('Hemhjälpen')
  })

  test('en ROT-kund stoppar inte de andras fakturor', async () => {
    const { api, skapade } = rutt({
      tidposter: [tidpost('t1', 'k-rot'), tidpost('t2', 'k-vanlig')],
      kunder: [
        { customer_id: 'k-rot', name: 'Lind', email: 'l@x.se', phone_number: '+4670' },
        { customer_id: 'k-vanlig', name: 'Bolaget', email: 'b@x.se', phone_number: '+4671' },
      ],
      offerterMedAvdrag: [{ customer_id: 'k-rot', rot_rut_type: 'rot' }],
      fakturorMedAvdrag: [],
    })
    const body = await (await api.POST(anrop())).json()
    expect(body.invoices_created).toBe(1)
    expect(skapade[0].customerId).toBe('k-vanlig')
    expect(body.skipped.map((s: any) => s.customer_name)).toContain('Lind')
  })

  test('kan historiken inte läsas skapas INGEN faktura — vakten faller stängt', async () => {
    // Faller det här tolkas ett läsfel som "ingen har avdrag", och rutten
    // skickar precis den faktura vakten finns för att stoppa.
    const { api, skapade, tystaFel } = rutt({
      tidposter: [tidpost('t1', 'k-vanlig')],
      kunder: [{ customer_id: 'k-vanlig', name: 'Bolaget', email: 'b@x.se', phone_number: '+4671' }],
      offerterMedAvdrag: [],
      fakturorMedAvdrag: [],
      lasfel: true,
    })
    const body = await (await api.POST(anrop())).json()
    expect(skapade).toHaveLength(0)
    expect(body.success).toBe(false)
    expect(body.errors[0]).toContain('ROT/RUT-historiken')
    // Och det syns i driften, inte bara i svaret.
    expect(tystaFel.map(f => f.kod)).toContain('invoices/auto-generate:avdragshistorik_olasbar')
  })
})

// ── Gränserna i källan ────────────────────────────────────────────────────
test.describe('rutten gissar inget avdrag', () => {
  const src = read('app/api/invoices/auto-generate/route.ts')

  test('vakten läser BÅDA källorna, tenantfiltrerat', () => {
    const block = src.slice(src.indexOf('const avdragskunder'), src.indexOf('// Generate invoice per customer'))
    expect(block).toContain("from('quotes')")
    expect(block).toContain("from('invoice')")
    // Utan business_id hade en annan firmas ROT-offert blockerat den här
    // firmans faktura — och läckt att kunden finns någon annanstans.
    expect((block.match(/\.eq\('business_id', params\.businessId\)/g) || []).length).toBe(2)
  })

  test('vakten prövas FÖRE radbyggnaden', () => {
    const iVakt = src.indexOf('if (avdragskunder.has(customerId))')
    const iRader = src.indexOf('const priceLessEntries')
    const iSkapa = src.indexOf('await createInvoice(')
    expect(iVakt).toBeGreaterThan(-1)
    expect(iVakt).toBeLessThan(iRader)
    expect(iVakt).toBeLessThan(iSkapa)
  })

  test('rutten räknar inget eget avdrag och hittar ingen sats', () => {
    // Det ENDA hederliga svaret här är att inte fakturera. Skulle någon
    // lägga in en beräkning utan personnummer och fastighetsbeteckning blir
    // det ett avdrag Skatteverket nekar.
    expect(src).not.toContain('calculateCappedDeduction')
    expect(src).not.toContain('rotRutDeductionInclVat')
    expect(src).not.toMatch(/0\.3\b|0\.5\b/)
    expect(src).not.toContain('rot_work_cost')
  })

  test('vakten dokumenterar varför beräkningen inte går', () => {
    const lib = read('lib/invoices/auto-invoice-avdragsvakt.ts')
    expect(lib).toContain('NOLL ROT/RUT-kolumner')
    expect(lib).toContain('personnummer')
  })
})
