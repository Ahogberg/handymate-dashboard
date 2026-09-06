/**
 * Facit: driftfynd F20 och F21 från Codex liveprov onboarding → fakturaunderlag
 * (docs/audit/live-onboarding-to-invoice-2026-09-06.md).
 *
 *  - F20: samma belopp visades som 1 062,5 (portalens lista), 1 063 (dokument
 *    och signeringsknapp), 812,5 (fakturaskaparen) och 813 (fakturadokument).
 *    Sex formaterare med olika avrundning. Regeln nu: hela kronor utan
 *    decimaler, öre med exakt två — överallt, via lib/format-price.
 *  - F21: förfallodatum 2026-10-05 vid fakturadatum 2026-09-06 och 30 dagar
 *    netto. Lokal midnatt + 30 dagar skrevs ut med toISOString (UTC), som
 *    ligger ett dygn bakom svensk tid vid midnatt. Kalenderdagsaritmetik i
 *    svensk tid i stället, samma helper som schemat (F08/F09).
 */
import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { formatKronor, formatKronorTal } from '../lib/format-price'
import { formatCurrency as dokumentKr } from '../lib/document-html'
import { formatCurrency as radKr } from '../components/quotes/ItemRow'
import { formatCurrency as portalKr } from '../app/portal/[token]/helpers'
import { renderPremium as fakturaPremium } from '../lib/invoice-templates/premium'
import { buildInvoiceTemplateData } from '../lib/invoice-templates/data-builder'
import { svDatePlusDays, svDateStr } from '../lib/dates'

const ROOT = path.join(__dirname, '..')
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8')
const utanKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test.describe('F20 — en kronformatering', () => {
  test('hela kronor utan decimaler, öre med två, vanlig space som tusentalsavgränsare', () => {
    expect(formatKronor(1063)).toBe('1 063 kr')
    expect(formatKronor(1062.5)).toBe('1 062,50 kr')
    expect(formatKronor(812.5)).toBe('812,50 kr')
    expect(formatKronor(162.5)).toBe('162,50 kr')
    expect(formatKronor(10000)).toBe('10 000 kr')
    expect(formatKronor(0)).toBe('0 kr')
    expect(formatKronor(null)).toBe('0 kr')
    expect(formatKronor(undefined)).toBe('0 kr')
    expect(formatKronorTal(1062.5)).toBe('1 062,50')
    // Flyttalsbrus avrundas till öre, aldrig till "812,499999"
    expect(formatKronor(812.4999999)).toBe('812,50 kr')
    // Negativt (kreditrad): Intl ger typografiskt minus, båda accepteras
    expect(formatKronor(-125.25)).toMatch(/^[-\u2212]125,25 kr$/)
  })

  test('dokumentmotorn, offertbyggarens rader och portalen ger samma sträng', () => {
    for (const n of [1062.5, 1063, 812.5, 0]) {
      expect(dokumentKr(n)).toBe(formatKronor(n))
      expect(radKr(n)).toBe(formatKronor(n))
      expect(portalKr(n)).toBe(formatKronor(n))
    }
  })

  test('portalens offertlista använder samma tal (inte toLocaleString)', () => {
    const src = utanKommentarer(read('app/portal/[token]/components/PortalQuotesList.tsx'))
    expect(src).toContain('formatKronorTal(q.customer_pays || q.total)')
    expect(src).not.toContain("(q.customer_pays || q.total).toLocaleString")
  })

  test('fakturaskaparens tidrader visar kronor med samma regel', () => {
    const src = utanKommentarer(read('app/dashboard/invoices/new/page.tsx'))
    expect(src).toContain('{formatKronor(totalCost)}')
    expect(src).not.toContain("totalCost.toLocaleString('sv-SE')} kr")
  })

  test('fakturadokumentet (premium) skriver 812,50 och 162,50 — inte 813 eller 812,5', () => {
    const data = buildInvoiceTemplateData(
      { invoice_id: 'i', invoice_number: 'FV-2026-004', status: 'draft', invoice_date: '2026-09-06', due_date: '2026-10-06',
        subtotal: 650, vat_rate: 25, vat_amount: 162.5, total: 812.5, customer_pays: 812.5,
        items: [{ description: 'Elinstallation', quantity: 1, unit: 'tim', unit_price: 650, total: 650 }] },
      { business_name: 'TEST Codex – onboarding El' }, null,
    )
    const html = fakturaPremium(data)
    expect(html).toContain('812,50')
    expect(html).toContain('162,50')
    expect(html).not.toMatch(/\b813\b/)
    expect(html).not.toMatch(/812,5(?!0)/)
  })

  test('mallarnas formatNumber: öre får aldrig en ensam decimal', () => {
    for (const f of ['lib/invoice-templates/premium.ts', 'lib/invoice-templates/friendly.ts', 'lib/quote-templates/premium.ts', 'lib/quote-templates/friendly.ts']) {
      const src = utanKommentarer(read(f))
      expect(src, f).toContain('minimumFractionDigits: 2, maximumFractionDigits: 2')
      expect(src, f).not.toContain("toLocaleString('sv-SE', { maximumFractionDigits: 2 })")
    }
  })
})

test.describe('F21 — 30 dagar netto är 30 kalenderdagar i svensk tid', () => {
  test('2026-09-06 + 30 dagar = 2026-10-06, även över DST-bytet 25 oktober', () => {
    expect(svDatePlusDays('2026-09-06', 30)).toBe('2026-10-06')
    expect(svDatePlusDays('2026-10-10', 30)).toBe('2026-11-09')
    expect(svDatePlusDays('2026-12-15', 30)).toBe('2027-01-14')
  })

  test('svDateStr ger svensk kalenderdag för en lokal midnatt — inte UTC-dagen', () => {
    // 2026-10-06 00:00 i Stockholm = 2026-10-05T22:00Z. toISOString hade sagt 10-05.
    const lokalMidnatt = new Date('2026-10-06T00:00:00+02:00')
    expect(lokalMidnatt.toISOString().slice(0, 10)).toBe('2026-10-05')
    expect(svDateStr(lokalMidnatt)).toBe('2026-10-06')
  })

  test('fakturaskaparen, offertbyggaren och serverns fakturaskapande använder svenska datumhjälpare', () => {
    const ny = utanKommentarer(read('app/dashboard/invoices/new/page.tsx'))
    expect(ny).toContain('setDueDate(svDatePlusDays(invoiceDate, paymentDays))')
    expect(ny).toContain('useState(svDateStr())')
    expect(ny).not.toContain("toISOString().split('T')[0]")

    const qb = utanKommentarer(read('app/dashboard/quotes/_shared/QuoteBuilder.tsx'))
    expect(qb).toContain('svDateStr(validUntil)')
    expect(qb).not.toContain("validUntil.toISOString()")

    const ci = utanKommentarer(read('lib/invoices/create-invoice.ts'))
    expect(ci).toContain('return svDateStr(d)')
    expect(ci).not.toContain("toISOString().split('T')[0]")

    const detalj = utanKommentarer(read('app/dashboard/invoices/[id]/page.tsx'))
    expect(detalj).toContain('paid_at: svDateStr(),')
  })
})

test.describe('F23–F26 — fakturans presentationsfel ur produktionsprovet 7 sep', () => {
  test('F23: förhandsgranskningens knapp lovar inte utskick, och befintlig faktura visas i stället för en ny', () => {
    const src = utanKommentarer(read('app/dashboard/projects/[id]/invoice-preview/page.tsx'))
    expect(src).toContain('Skapa faktura till {customerName}')
    expect(src).not.toContain('Skicka faktura till {customerName}')
    expect(src).toContain('Fakturan skapas som utkast och öppnas.')
    expect(src).toContain('Fakturan finns redan: {data.existingInvoice.invoice_number}')
    expect(src).toContain('{data.existingInvoice?.invoice_number ?? data.nextInvoiceNumber}')
    expect(src).not.toContain("toLocaleString('sv-SE')")
    const route = utanKommentarer(read('app/api/projects/[id]/invoice-preview/route.ts'))
    expect(route).toContain('existingInvoice: existingInvoice || null')
    expect(route).toContain(".eq('project_id', project.project_id)")
  })

  test('F24: inga kronbelopp via toLocaleString kvar i faktura-, projekt-, offert- eller portalytorna', () => {
    const walk = (d: string): string[] => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : [])
    const traffar: string[] = []
    for (const dir of ['app/dashboard/invoices', 'app/dashboard/projects', 'app/dashboard/quotes', 'app/portal', 'components/invoices', 'components/projects']) {
      for (const f of walk(dir)) {
        const src = utanKommentarer(read(f))
        for (const m of Array.from(src.matchAll(/toLocaleString\('sv-SE'\)\}(?:&nbsp;| )kr|toLocaleString\('sv-SE'\) \+ ' kr'/g))) traffar.push(`${f}: ${m[0]}`)
      }
    }
    expect(traffar).toEqual([])
  })

  test('F25: utkast räknas inte som fakturerat, och korten jämför netto mot netto', () => {
    const econ = utanKommentarer(read('lib/projects/compute-economics.ts'))
    expect(econ).toContain("const utfardad = ['sent', 'overdue', 'customer_paid', 'paid'].includes(inv.status || '')")
    expect(econ).toContain('if (utfardad) fakturerat += v')
    for (const f of ['components/projects/ProjectStatusCard.tsx', 'components/projects/ProjectStatusBand.tsx']) {
      expect(utanKommentarer(read(f)), f).toMatch(/fakturerat_ex_moms_kr \?\? \w+\.?\w*\.?fakturerat_kr/)
    }
  })

  test('F26: framdriftens belopp räknar grundoffert plus signerad ÄTA', () => {
    const src = utanKommentarer(read('app/dashboard/projects/[id]/page.tsx'))
    expect(src).toContain("project.budget_amount + changes.filter(c => ['signed', 'approved', 'invoiced'].includes(c.status))")
  })
})
