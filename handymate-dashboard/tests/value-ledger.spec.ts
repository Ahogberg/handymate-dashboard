/**
 * Facit för Value Ledger-fyrstegsvyn (2026-08-12) — lib/value/ledger.ts.
 *
 * Testar bara den rena härledningen (byggManadsLedger). I/O-funktionen
 * (getManadsLedger) är ett tunt uppslagsskal runt den och testas medvetet
 * inte här — samma delning som recovered-revenue.spec.ts.
 *
 *   npx playwright test tests/value-ledger.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import {
  byggManadsLedger,
  ledgerCardAmountKr,
  type LedgerCard,
  type LedgerInvoiceFacit,
} from '../lib/value/ledger'

const DAY_MS = 24 * 60 * 60 * 1000
const AUG1 = Date.UTC(2026, 7, 1)

function kort(over: Partial<LedgerCard> = {}): LedgerCard {
  return {
    id: 'appr_1',
    approval_type: 'missad_intakt',
    status: 'pending',
    created_at_ms: AUG1 + 2 * DAY_MS,
    resolved_at_ms: null,
    amount_kr: 10000,
    invoice_id: null,
    invoice_verified: false,
    ...over,
  }
}

function faktura(over: Partial<LedgerInvoiceFacit> = {}): LedgerInvoiceFacit {
  return { total_kr: 12000, paid: false, paid_at_ms: null, ...over }
}

test.describe('delmängdsinvarianten — agerat ⊆ identifierat', () => {
  test('bara godkända kort räknas i agerat, resten stannar i identifierat', () => {
    const cards = [
      kort({ id: 'a', status: 'approved', amount_kr: 5000 }),
      kort({ id: 'b', status: 'pending', amount_kr: 7000 }),
      kort({ id: 'c', status: 'rejected', amount_kr: 3000 }),
    ]
    const l = byggManadsLedger({ period: '2026-08', cards, invoices: new Map() })
    expect(l.identifierat).toEqual({ kr: 15000, antal: 3 })
    expect(l.agerat).toEqual({ kr: 5000, antal: 1 })
    // Invarianten: agerat är alltid <= identifierat i både kr och antal.
    expect(l.agerat.antal).toBeLessThanOrEqual(l.identifierat.antal)
    expect(l.agerat.kr).toBeLessThanOrEqual(l.identifierat.kr)
  })

  test('auto_approved räknas som agerat, precis som approved', () => {
    const cards = [kort({ status: 'auto_approved', amount_kr: 4000 })]
    const l = byggManadsLedger({ period: '2026-08', cards, invoices: new Map() })
    expect(l.agerat).toEqual({ kr: 4000, antal: 1 })
  })

  test('kort skapade UTANFÖR perioden räknas inte alls', () => {
    const cards = [kort({ created_at_ms: Date.UTC(2026, 6, 31), status: 'approved' })]
    const l = byggManadsLedger({ period: '2026-08', cards, invoices: new Map() })
    expect(l.identifierat).toEqual({ kr: 0, antal: 0 })
    expect(l.agerat).toEqual({ kr: 0, antal: 0 })
  })
})

test.describe('kort utan artifacts når aldrig fakturerat', () => {
  test('godkänt kort utan invoice_id stannar i agerat', () => {
    const cards = [kort({ status: 'approved', invoice_id: null, invoice_verified: false })]
    const l = byggManadsLedger({ period: '2026-08', cards, invoices: new Map() })
    expect(l.fakturerat).toEqual({ kr: 0, antal: 0 })
    expect(l.betalt).toEqual({ kr: 0, antal: 0 })
  })

  test('create_ata_draft med invoice_id men OVERIFIERAD (invoiced_at inte satt) räknas inte', () => {
    const cards = [
      kort({
        approval_type: 'create_ata_draft',
        status: 'approved',
        invoice_id: 'inv_1',
        invoice_verified: false, // ÄTA:n har en referens men är inte bevisat fakturerad
      }),
    ]
    const invoices = new Map([['inv_1', faktura({ paid: true })]])
    const l = byggManadsLedger({ period: '2026-08', cards, invoices })
    expect(l.fakturerat).toEqual({ kr: 0, antal: 0 })
    expect(l.betalt).toEqual({ kr: 0, antal: 0 })
  })

  test('invoice_id som pekar på en faktura som inte finns i uppslaget räknas inte', () => {
    const cards = [kort({ status: 'approved', invoice_id: 'inv_saknas', invoice_verified: true })]
    const l = byggManadsLedger({ period: '2026-08', cards, invoices: new Map() })
    expect(l.fakturerat).toEqual({ kr: 0, antal: 0 })
  })
})

test.describe('fakturans belopp, aldrig kortets uppskattning', () => {
  test('fakturerat/betalt använder invoice.total_kr — inte kortets amount_kr', () => {
    const cards = [
      kort({
        status: 'approved',
        amount_kr: 8000, // kortets uppskattning — ska INTE synas i fakturerat/betalt
        invoice_id: 'inv_1',
        invoice_verified: true,
      }),
    ]
    const invoices = new Map([['inv_1', faktura({ total_kr: 12500, paid: true })]])
    const l = byggManadsLedger({ period: '2026-08', cards, invoices })
    expect(l.agerat.kr).toBe(8000) // steget före ÄR kortets uppskattning
    expect(l.fakturerat).toEqual({ kr: 12500, antal: 1 })
    expect(l.betalt).toEqual({ kr: 12500, antal: 1 })
  })

  test('obetald faktura hamnar i fakturerat men inte i betalt', () => {
    const cards = [kort({ status: 'approved', invoice_id: 'inv_1', invoice_verified: true })]
    const invoices = new Map([['inv_1', faktura({ total_kr: 9000, paid: false })]])
    const l = byggManadsLedger({ period: '2026-08', cards, invoices })
    expect(l.fakturerat).toEqual({ kr: 9000, antal: 1 })
    expect(l.betalt).toEqual({ kr: 0, antal: 0 })
  })

  test('samma faktura via två kort räknas bara en gång', () => {
    const cards = [
      kort({ id: 'a', status: 'approved', invoice_id: 'inv_1', invoice_verified: true }),
      kort({ id: 'b', status: 'approved', invoice_id: 'inv_1', invoice_verified: true }),
    ]
    const invoices = new Map([['inv_1', faktura({ total_kr: 5000, paid: true })]])
    const l = byggManadsLedger({ period: '2026-08', cards, invoices })
    expect(l.fakturerat).toEqual({ kr: 5000, antal: 1 })
    expect(l.betalt).toEqual({ kr: 5000, antal: 1 })
  })
})

test.describe('invoice_reminder — hoppar fakturerat, går direkt till betalt-prövningen', () => {
  test('invoice_reminder räknas ALDRIG i fakturerat, även med en verifierad referens', () => {
    const cards = [
      kort({
        approval_type: 'invoice_reminder',
        status: 'approved',
        invoice_id: 'inv_1',
        invoice_verified: true,
        resolved_at_ms: AUG1 + 2 * DAY_MS,
      }),
    ]
    const invoices = new Map([['inv_1', faktura({ paid: false })]])
    const l = byggManadsLedger({ period: '2026-08', cards, invoices })
    expect(l.fakturerat).toEqual({ kr: 0, antal: 0 })
  })

  test('betald INOM 14-dagarsfönstret efter godkännandet räknas i betalt', () => {
    const resolved = AUG1 + 2 * DAY_MS
    const cards = [
      kort({
        approval_type: 'invoice_reminder',
        status: 'approved',
        invoice_id: 'inv_1',
        resolved_at_ms: resolved,
      }),
    ]
    const invoices = new Map([
      ['inv_1', faktura({ total_kr: 4200, paid: true, paid_at_ms: resolved + 5 * DAY_MS })],
    ])
    const l = byggManadsLedger({ period: '2026-08', cards, invoices })
    expect(l.betalt).toEqual({ kr: 4200, antal: 1 })
  })

  test('betald UTANFÖR 14-dagarsfönstret räknas inte', () => {
    const resolved = AUG1 + 2 * DAY_MS
    const cards = [
      kort({
        approval_type: 'invoice_reminder',
        status: 'approved',
        invoice_id: 'inv_1',
        resolved_at_ms: resolved,
      }),
    ]
    const invoices = new Map([
      ['inv_1', faktura({ total_kr: 4200, paid: true, paid_at_ms: resolved + 20 * DAY_MS })],
    ])
    const l = byggManadsLedger({ period: '2026-08', cards, invoices })
    expect(l.betalt).toEqual({ kr: 0, antal: 0 })
  })

  test('betald FÖRE godkännandet (redan betald när påminnelsen skickades) räknas inte', () => {
    const resolved = AUG1 + 5 * DAY_MS
    const cards = [
      kort({
        approval_type: 'invoice_reminder',
        status: 'approved',
        invoice_id: 'inv_1',
        resolved_at_ms: resolved,
      }),
    ]
    const invoices = new Map([
      ['inv_1', faktura({ total_kr: 4200, paid: true, paid_at_ms: resolved - 1 * DAY_MS })],
    ])
    const l = byggManadsLedger({ period: '2026-08', cards, invoices })
    expect(l.betalt).toEqual({ kr: 0, antal: 0 })
  })
})

test.describe('betalt ⊆ fakturerat ∪ påminnelse-vägen', () => {
  test('betalt kan aldrig innehålla en faktura som varken är fakturerad eller kom via invoice_reminder', () => {
    // Ett create_ata_draft-kort utan verifierad referens kan inte bidra —
    // även om samma invoice_id råkar finnas och vara betald i uppslaget.
    const cards = [
      kort({ approval_type: 'create_ata_draft', status: 'approved', invoice_id: 'inv_1', invoice_verified: false }),
    ]
    const invoices = new Map([['inv_1', faktura({ paid: true })]])
    const l = byggManadsLedger({ period: '2026-08', cards, invoices })
    expect(l.betalt).toEqual({ kr: 0, antal: 0 })
  })
})

test.describe('tom månad → ärliga nollor', () => {
  test('inga kort ger nollor i alla fyra stadier', () => {
    const l = byggManadsLedger({ period: '2026-06', cards: [], invoices: new Map() })
    expect(l.identifierat).toEqual({ kr: 0, antal: 0 })
    expect(l.agerat).toEqual({ kr: 0, antal: 0 })
    expect(l.fakturerat).toEqual({ kr: 0, antal: 0 })
    expect(l.betalt).toEqual({ kr: 0, antal: 0 })
    expect(l.period).toBe('2026-06')
  })

  test('ogiltig period ger nollor, aldrig ett kastat fel', () => {
    const l = byggManadsLedger({ period: 'inte-en-period', cards: [kort({ status: 'approved' })], invoices: new Map() })
    expect(l.identifierat).toEqual({ kr: 0, antal: 0 })
  })

  test('posten är oföränderlig', () => {
    const l = byggManadsLedger({ period: '2026-08', cards: [], invoices: new Map() })
    expect(Object.isFrozen(l)).toBe(true)
    expect(Object.isFrozen(l.identifierat)).toBe(true)
  })
})

test.describe('bortfall — avvisade kort ur samma kohort (B3)', () => {
  test('avvisade kort räknas i antal och kronor ur samma kohort', () => {
    const cards = [
      kort({ id: 'a', status: 'approved', amount_kr: 5000 }),
      kort({ id: 'b', status: 'rejected', amount_kr: 3000 }),
      kort({ id: 'c', status: 'rejected', amount_kr: 2000 }),
      kort({ id: 'd', status: 'pending', amount_kr: 1000 }),
    ]
    const l = byggManadsLedger({ period: '2026-08', cards, invoices: new Map() })
    expect(l.bortfall).toEqual({ avvisade_antal: 2, avvisade_kr: 5000 })
  })

  test('avvisade kort UTANFÖR perioden räknas inte', () => {
    const cards = [kort({ status: 'rejected', created_at_ms: Date.UTC(2026, 6, 15) })]
    const l = byggManadsLedger({ period: '2026-08', cards, invoices: new Map() })
    expect(l.bortfall).toEqual({ avvisade_antal: 0, avvisade_kr: 0 })
  })

  test('inga avvisade ger ärliga nollor, och tom månad likaså', () => {
    const l1 = byggManadsLedger({
      period: '2026-08',
      cards: [kort({ status: 'approved' })],
      invoices: new Map(),
    })
    expect(l1.bortfall).toEqual({ avvisade_antal: 0, avvisade_kr: 0 })
    const l2 = byggManadsLedger({ period: '2026-06', cards: [], invoices: new Map() })
    expect(l2.bortfall).toEqual({ avvisade_antal: 0, avvisade_kr: 0 })
  })

  test('bortfallet ändrar INTE de fyra stegen — avvisade stannar i identifierat', () => {
    const cards = [
      kort({ id: 'a', status: 'approved', amount_kr: 5000 }),
      kort({ id: 'b', status: 'rejected', amount_kr: 3000 }),
    ]
    const l = byggManadsLedger({ period: '2026-08', cards, invoices: new Map() })
    expect(l.identifierat).toEqual({ kr: 8000, antal: 2 })
    expect(l.agerat).toEqual({ kr: 5000, antal: 1 })
  })
})

test.describe('items — varje krona med sin historia (B4)', () => {
  const richCards = () => [
    kort({ id: 'p', status: 'pending', amount_kr: 1000, created_at_ms: AUG1 + 1 * DAY_MS }),
    kort({ id: 'g', status: 'approved', amount_kr: 2000, created_at_ms: AUG1 + 2 * DAY_MS }),
    kort({
      id: 'f', status: 'approved', amount_kr: 3000,
      invoice_id: 'inv_f', invoice_verified: true, created_at_ms: AUG1 + 3 * DAY_MS,
    }),
    kort({
      id: 'b', status: 'approved', amount_kr: 4000,
      invoice_id: 'inv_b', invoice_verified: true, created_at_ms: AUG1 + 4 * DAY_MS,
    }),
    kort({ id: 'r', status: 'rejected', amount_kr: 5000, created_at_ms: AUG1 + 5 * DAY_MS }),
  ]
  const richInvoices = () =>
    new Map([
      ['inv_f', faktura({ total_kr: 3300, paid: false })],
      ['inv_b', faktura({ total_kr: 4400, paid: true, paid_at_ms: AUG1 + 10 * DAY_MS })],
    ])

  test('varje kort får sitt ärliga steg', () => {
    const l = byggManadsLedger({ period: '2026-08', cards: richCards(), invoices: richInvoices() })
    const steg = Object.fromEntries(l.items.map(i => [i.approval_id, i.steg]))
    expect(steg).toEqual({
      p: 'identifierat',
      g: 'agerat',
      f: 'fakturerat',
      b: 'betalt',
      r: 'avvisad',
    })
  })

  test('kronan per item: fakturans belopp först när fakturan är bevisad, annars kortets', () => {
    const l = byggManadsLedger({ period: '2026-08', cards: richCards(), invoices: richInvoices() })
    const perId = new Map(l.items.map(i => [i.approval_id, i]))
    expect(perId.get('g')!.kr).toBe(2000) // kortets uppskattning
    expect(perId.get('f')!.kr).toBe(3300) // fakturans belopp
    expect(perId.get('b')!.kr).toBe(4400)
    expect(perId.get('r')!.kr).toBe(5000)
    expect(perId.get('b')!.paid_at).toBe(new Date(AUG1 + 10 * DAY_MS).toISOString())
    expect(perId.get('f')!.paid_at).toBeNull()
    // invoice_id exponeras bara när fakturan är bevisad (fakturerat/betalt).
    expect(perId.get('f')!.invoice_id).toBe('inv_f')
    expect(perId.get('b')!.invoice_id).toBe('inv_b')
    expect(perId.get('g')!.invoice_id).toBeNull()
  })

  test('aggregaten är identiska med och utan exponeringen — items ändrar ingen matte', () => {
    const l = byggManadsLedger({ period: '2026-08', cards: richCards(), invoices: richInvoices() })
    expect(l.identifierat).toEqual({ kr: 15000, antal: 5 })
    expect(l.agerat).toEqual({ kr: 9000, antal: 3 })
    expect(l.fakturerat).toEqual({ kr: 7700, antal: 2 })
    expect(l.betalt).toEqual({ kr: 4400, antal: 1 })
  })

  test('items antal matchar stegens antal — delmängden består per item', () => {
    const l = byggManadsLedger({ period: '2026-08', cards: richCards(), invoices: richInvoices() })
    expect(l.items).toHaveLength(l.identifierat.antal)
    expect(l.items.filter(i => i.steg === 'betalt')).toHaveLength(l.betalt.antal)
    // fakturerade = de som stannade på fakturerat + de (icke-påminnelser) som gick vidare till betalt
    const fakturaVagen = l.items.filter(
      i => i.steg === 'fakturerat' || (i.steg === 'betalt' && i.approval_type !== 'invoice_reminder'),
    )
    expect(fakturaVagen).toHaveLength(l.fakturerat.antal)
  })

  test('invoice_reminder: betald i fönstret ger betalt, annars stannar den i agerat', () => {
    const resolved = AUG1 + 2 * DAY_MS
    const bygg = (paidAtMs: number) =>
      byggManadsLedger({
        period: '2026-08',
        cards: [
          kort({
            id: 'rem', approval_type: 'invoice_reminder', status: 'approved',
            invoice_id: 'inv_1', resolved_at_ms: resolved,
          }),
        ],
        invoices: new Map([
          ['inv_1', faktura({ total_kr: 4200, paid: true, paid_at_ms: paidAtMs })],
        ]),
      })
    expect(bygg(resolved + 5 * DAY_MS).items[0].steg).toBe('betalt')
    expect(bygg(resolved + 5 * DAY_MS).items[0].kr).toBe(4200)
    expect(bygg(resolved + 20 * DAY_MS).items[0].steg).toBe('agerat')
  })

  test('dubblettfaktura: andra kortet stannar i agerat — fakturan räknas en gång', () => {
    const cards = [
      kort({ id: 'a', status: 'approved', invoice_id: 'inv_1', invoice_verified: true, created_at_ms: AUG1 + 1 * DAY_MS }),
      kort({ id: 'b', status: 'approved', invoice_id: 'inv_1', invoice_verified: true, created_at_ms: AUG1 + 2 * DAY_MS }),
    ]
    const invoices = new Map([['inv_1', faktura({ total_kr: 5000, paid: true, paid_at_ms: AUG1 + 3 * DAY_MS })]])
    const l = byggManadsLedger({ period: '2026-08', cards, invoices })
    expect(l.items.filter(i => i.steg === 'betalt')).toHaveLength(1)
    expect(l.items.filter(i => i.steg === 'agerat')).toHaveLength(1)
    expect(l.betalt).toEqual({ kr: 5000, antal: 1 })
  })

  test('nyast först', () => {
    const l = byggManadsLedger({ period: '2026-08', cards: richCards(), invoices: richInvoices() })
    const tider = l.items.map(i => i.created_at)
    expect(tider).toEqual([...tider].sort().reverse())
    expect(l.items[0].approval_id).toBe('r')
  })

  test('titeln följer med när kortet har en', () => {
    const l = byggManadsLedger({
      period: '2026-08',
      cards: [kort({ title: 'Förfallen faktura 2081' }), kort({ id: 'x' })],
      invoices: new Map(),
    })
    const perId = new Map(l.items.map(i => [i.approval_id, i]))
    expect(perId.get('appr_1')!.title).toBe('Förfallen faktura 2081')
    expect(perId.get('x')!.title).toBeNull()
  })

  test('tom och ogiltig period ger tomma items och bortfall-nollor', () => {
    const l = byggManadsLedger({ period: 'inte-en-period', cards: [kort()], invoices: new Map() })
    expect(l.items).toEqual([])
    expect(l.bortfall).toEqual({ avvisade_antal: 0, avvisade_kr: 0 })
  })
})

test.describe('ledgerCardAmountKr — rätt fält per korttyp', () => {
  test('profitability_warning läser projected_overrun', () => {
    expect(ledgerCardAmountKr('profitability_warning', { projected_overrun: 3000 })).toBe(3000)
  })
  test('create_ata_draft läser amount_estimate', () => {
    expect(ledgerCardAmountKr('create_ata_draft', { amount_estimate: 4500 })).toBe(4500)
  })
  test('missad_intakt/fakturera_projekt/invoice_reminder läser amount_kr', () => {
    expect(ledgerCardAmountKr('missad_intakt', { amount_kr: 1000 })).toBe(1000)
    expect(ledgerCardAmountKr('fakturera_projekt', { amount_kr: 2000 })).toBe(2000)
    expect(ledgerCardAmountKr('invoice_reminder', { amount_kr: 3000 })).toBe(3000)
  })
  test('saknat eller icke-positivt belopp ger 0 — aldrig en gissning', () => {
    expect(ledgerCardAmountKr('missad_intakt', {})).toBe(0)
    expect(ledgerCardAmountKr('missad_intakt', { amount_kr: null })).toBe(0)
    expect(ledgerCardAmountKr('missad_intakt', { amount_kr: -500 })).toBe(0)
    expect(ledgerCardAmountKr('missad_intakt', null)).toBe(0)
  })
})
