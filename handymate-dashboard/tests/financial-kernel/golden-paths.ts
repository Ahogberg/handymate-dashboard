/**
 * Financial Kernel — golden paths som körbara specifikationer (Claude-spår C, 2026-09-13).
 *
 * Varje scenario nedan är ett av blueprintens §23-scenarier uttryckt som DATA:
 * kanoniska event (ur catalog.ts), förväntad fakturaprojektion, förväntade
 * verifikationer (kontonummer är FÖRSLAG, se FINANCIAL_KERNEL_SE_LEDGER_REVIEW.md),
 * och hur många gånger legacy-eventet payment_received får avfyras.
 *
 * tests/financial-kernel-golden-paths.spec.ts kör konsistenskontroller på datan
 * redan i dag (belopp balanserar exakt via Money, allokeringar överstiger aldrig
 * betalningen, payment_received = antal settlade KUND-komponenter, inga
 * momskonton i omvänd skattskyldighet, ingen bokföring vid invoice_issued
 * under kontantmetoden). När C4–C9 finns blir samma data indata till riktiga
 * end-to-end-tester: kör eventen, jämför sluttillstånd med `invoice`, `vouchers`.
 *
 * Belopp är decimalsträngar i SEK. Kontonummer märkta i PROPOSED_ACCOUNTS är
 * inte beslutade — en namngiven konsult bekräftar dem (orkestreringen C9).
 */
import type { FinancialEventType } from '../../lib/financial-kernel/events/catalog'

export type Regime = {
  vatRegime: 'standard' | 'reverse_charge_construction'
  accountingMethod: 'accrual' | 'cash'
  taxReduction?: 'rot' | 'rut'
}

export interface GpEvent {
  t: FinancialEventType
  /** Huvudbelopp i SEK som decimalsträng. */
  amt?: string
  /** Index i `events` för orsakande event (causation). */
  cause?: number
  /** Payloadfält som kontrollerna läser (component, payment_id, invoice_id, reason, partial …). */
  p?: Record<string, string | number | boolean | undefined>
}

/** [konto, debet, kredit] — exakt en av debet/kredit satt. */
export type VoucherLine = [account: string, debit: string | null, credit: string | null]

export interface Voucher {
  /** Index i `events` för eventet som utlöser verifikationen. */
  after: number
  series: 'F' | 'B' | 'L' | 'M' | 'IB'
  effectiveDate: string
  lines: VoucherLine[]
}

export interface GoldenPath {
  id: number
  title: string
  regime: Regime
  given: string[]
  when: string[]
  events: GpEvent[]
  invoice: { status: string; paidAmount: string; outstanding: string; legacyStatus?: string }
  vouchers: Voucher[]
  reconciliation: string
  automation: { paymentReceived: number; legacyPaymentReceived?: number; note?: string }
  /** Kontroller som inte kan uttryckas i datan; blir asserts i C4+. */
  expects: string[]
}

/** Kontoförslag. `confirmed: false` på alla tills en namngiven konsult sagt ja. */
export const PROPOSED_ACCOUNTS: Record<string, { name: string; source: string; confirmed: false }> = {
  '1510': { name: 'Kundfordringar', source: 'BAS; Odoo l10n_se', confirmed: false },
  '1513': { name: 'Kundfordringar – delad faktura (Skatteverkets ROT/RUT-del)', source: 'BAS; Odoo l10n_se', confirmed: false },
  '1580': { name: 'Fordringar för kontokort och kuponger (PSP-clearing)', source: 'BAS; Odoo l10n_se', confirmed: false },
  '1930': { name: 'Företagskonto', source: 'BAS; Odoo l10n_se', confirmed: false },
  '2420': { name: 'Förskott från kunder (överbetalning)', source: 'BAS', confirmed: false },
  '2440': { name: 'Leverantörsskulder', source: 'BAS; Odoo l10n_se', confirmed: false },
  '2611': { name: 'Utgående moms 25 % (försäljning inom Sverige)', source: 'BAS; Odoo l10n_se', confirmed: false },
  '2614': { name: 'Utgående moms omvänd skattskyldighet 25 %', source: 'BAS; Odoo l10n_se', confirmed: false },
  '2641': { name: 'Debiterad ingående moms', source: 'BAS; Odoo l10n_se', confirmed: false },
  '2647': { name: 'Ingående moms omvänd skattskyldighet varor och tjänster i Sverige', source: 'BAS; Odoo l10n_se', confirmed: false },
  '3001': { name: 'Försäljning inom Sverige 25 % moms', source: 'BAS; Odoo l10n_se', confirmed: false },
  '3231': { name: 'Försäljning inom byggsektorn, omvänd skattskyldighet', source: 'BAS; Odoo l10n_se', confirmed: false },
  '3591': { name: 'Fakturerade påminnelseavgifter (momsfri) — KONTO OSÄKERT', source: 'BAS-praxis, ej verifierad', confirmed: false },
  '3740': { name: 'Öres- och kronutjämning', source: 'BAS; Odoo l10n_se; blueprint §5', confirmed: false },
  '4010': { name: 'Inköp material och varor', source: 'BAS', confirmed: false },
  '4425': { name: 'Inköpta tjänster i Sverige, omvänd skattskyldighet 25 %', source: 'BAS (saknas i Odoo core)', confirmed: false },
  '6570': { name: 'Bankkostnader / betalningsförmedlingsavgifter — MOMSBEHANDLING OSÄKER', source: 'BAS-praxis', confirmed: false },
  '8313': { name: 'Ränteintäkter från kortfristiga fordringar (dröjsmålsränta) — KONTO OSÄKERT', source: 'BAS-praxis, ej verifierad', confirmed: false },
}

const STANDARD: Regime = { vatRegime: 'standard', accountingMethod: 'accrual' }

/** Standardfaktura 10 000 ex moms → 12 500 inkl. Kundkomponent 12 500. */
function issuedStandard(invoiceId: string, issued: string, due: string): GpEvent[] {
  return [
    { t: 'invoice_issued', amt: '12500.00', p: { invoice_id: invoiceId, vat_regime: 'standard', accounting_method: 'accrual', issued_date: issued, due_date: due } },
    { t: 'receivable_created', amt: '12500.00', cause: 0, p: { receivable_id: `${invoiceId}-c`, invoice_id: invoiceId, component: 'customer' } },
  ]
}
const ISSUE_VOUCHER = (date: string): Voucher => ({ after: 0, series: 'F', effectiveDate: date, lines: [['1510', '12500.00', null], ['3001', null, '10000.00'], ['2611', null, '2500.00']] })

export const GOLDEN_PATHS: GoldenPath[] = [
  {
    id: 1, title: 'Standardfaktura → kundbetalning → allokering → AR noll → bokföring → avstämning', regime: STANDARD,
    given: ['Faktureringsmetoden', 'Faktura F-1001: 10 000 ex moms, 25 %, total 12 500, utställd 2026-09-01, förfaller 2026-10-01'],
    when: ['Kunden betalar 12 500 via bankgiro 2026-09-20 (manuell markering)', 'Banktransaktionen importeras 2026-09-21'],
    events: [
      ...issuedStandard('F-1001', '2026-09-01', '2026-10-01'),
      { t: 'payment_initiated', amt: '12500.00', p: { payment_id: 'pay-1', provider: 'manual', direction: 'inbound' } },
      { t: 'payment_settled', amt: '12500.00', cause: 2, p: { payment_id: 'pay-1', evidence: 'manual', settled_at: '2026-09-20' } },
      { t: 'payment_allocated', amt: '12500.00', cause: 3, p: { allocation_id: 'al-1', payment_id: 'pay-1', receivable_id: 'F-1001-c' } },
      { t: 'receivable_settled', cause: 4, p: { receivable_id: 'F-1001-c', invoice_id: 'F-1001', component: 'customer' } },
      { t: 'bank_transaction_imported', amt: '12500.00', p: { bank_transaction_id: 'bt-1', source: 'bank', banked_at: '2026-09-20' } },
      { t: 'reconciliation_matched', amt: '12500.00', cause: 6, p: { bank_transaction_id: 'bt-1', matched_type: 'payment', matched_id: 'pay-1', partial: false } },
    ],
    invoice: { status: 'paid', paidAmount: '12500.00', outstanding: '0.00', legacyStatus: 'paid' },
    vouchers: [
      ISSUE_VOUCHER('2026-09-01'),
      { after: 4, series: 'B', effectiveDate: '2026-09-20', lines: [['1930', '12500.00', null], ['1510', null, '12500.00']] },
    ],
    reconciliation: 'bt-1 matchad mot pay-1, inga undantag',
    automation: { paymentReceived: 1 },
    expects: ['correlation_id = fin_invoice_F-1001 på samtliga event', 'causation-kedjan går att gå från reconciliation_matched till invoice_issued'],
  },
  {
    id: 4, title: 'Delbetalning', regime: STANDARD,
    given: ['Som GP1'], when: ['Kunden betalar 5 000 av 12 500'],
    events: [
      ...issuedStandard('F-1004', '2026-09-01', '2026-10-01'),
      { t: 'payment_initiated', amt: '5000.00', p: { payment_id: 'pay-4', provider: 'manual', direction: 'inbound' } },
      { t: 'payment_settled', amt: '5000.00', cause: 2, p: { payment_id: 'pay-4', evidence: 'manual' } },
      { t: 'payment_allocated', amt: '5000.00', cause: 3, p: { allocation_id: 'al-4', payment_id: 'pay-4', receivable_id: 'F-1004-c' } },
    ],
    invoice: { status: 'sent', paidAmount: '5000.00', outstanding: '7500.00', legacyStatus: 'paid' },
    vouchers: [ISSUE_VOUCHER('2026-09-01'), { after: 4, series: 'B', effectiveDate: '2026-09-20', lines: [['1930', '5000.00', null], ['1510', null, '5000.00']] }],
    reconciliation: 'öppen post 7 500 på F-1004-c',
    automation: { paymentReceived: 0, legacyPaymentReceived: 1, note: 'DIVERGENS: legacy decidePaymentOutcome markerar en icke-ROT-faktura paid vid VILKET belopp som helst (to_paid). Kerneln lämnar fordran öppen. C5 måste besluta om fasaden bevarar kvirken för icke-kernel-företag eller rättar den.' },
    expects: ['receivable_settled avfyras INTE', 'invoice.paid_amount = 5000 i projektionen'],
  },
  {
    id: 5, title: 'Två delbetalningar som tillsammans stänger en faktura', regime: STANDARD,
    given: ['Som GP1'], when: ['5 000 den 20:e, 7 500 den 28:e'],
    events: [
      ...issuedStandard('F-1005', '2026-09-01', '2026-10-01'),
      { t: 'payment_initiated', amt: '5000.00', p: { payment_id: 'pay-5a', provider: 'manual', direction: 'inbound' } },
      { t: 'payment_settled', amt: '5000.00', cause: 2, p: { payment_id: 'pay-5a', evidence: 'manual' } },
      { t: 'payment_allocated', amt: '5000.00', cause: 3, p: { allocation_id: 'al-5a', payment_id: 'pay-5a', receivable_id: 'F-1005-c' } },
      { t: 'payment_initiated', amt: '7500.00', p: { payment_id: 'pay-5b', provider: 'manual', direction: 'inbound' } },
      { t: 'payment_settled', amt: '7500.00', cause: 5, p: { payment_id: 'pay-5b', evidence: 'manual' } },
      { t: 'payment_allocated', amt: '7500.00', cause: 6, p: { allocation_id: 'al-5b', payment_id: 'pay-5b', receivable_id: 'F-1005-c' } },
      { t: 'receivable_settled', cause: 7, p: { receivable_id: 'F-1005-c', invoice_id: 'F-1005', component: 'customer' } },
    ],
    invoice: { status: 'paid', paidAmount: '12500.00', outstanding: '0.00', legacyStatus: 'paid' },
    vouchers: [
      ISSUE_VOUCHER('2026-09-01'),
      { after: 4, series: 'B', effectiveDate: '2026-09-20', lines: [['1930', '5000.00', null], ['1510', null, '5000.00']] },
      { after: 7, series: 'B', effectiveDate: '2026-09-28', lines: [['1930', '7500.00', null], ['1510', null, '7500.00']] },
    ],
    reconciliation: 'två banktransaktioner, två matchningar',
    automation: { paymentReceived: 1, note: 'Avfyras vid settlement, inte vid första delbetalningen.' },
    expects: ['payment_received avfyras exakt en gång, efter pay-5b'],
  },
  {
    id: 7, title: 'Överbetalning', regime: STANDARD,
    given: ['Som GP1'], when: ['Kunden betalar 12 600 (100 kr för mycket)'],
    events: [
      ...issuedStandard('F-1007', '2026-09-01', '2026-10-01'),
      { t: 'payment_initiated', amt: '12600.00', p: { payment_id: 'pay-7', provider: 'manual', direction: 'inbound' } },
      { t: 'payment_settled', amt: '12600.00', cause: 2, p: { payment_id: 'pay-7', evidence: 'manual' } },
      { t: 'payment_allocated', amt: '12500.00', cause: 3, p: { allocation_id: 'al-7', payment_id: 'pay-7', receivable_id: 'F-1007-c' } },
      { t: 'receivable_settled', cause: 4, p: { receivable_id: 'F-1007-c', invoice_id: 'F-1007', component: 'customer' } },
    ],
    invoice: { status: 'paid', paidAmount: '12500.00', outstanding: '0.00', legacyStatus: 'paid' },
    vouchers: [
      ISSUE_VOUCHER('2026-09-01'),
      { after: 4, series: 'B', effectiveDate: '2026-09-20', lines: [['1930', '12600.00', null], ['1510', null, '12500.00'], ['2420', null, '100.00']] },
    ],
    reconciliation: '100 kr oallokerat på pay-7 = kundtillgodohavande; INTE avrundning (utanför policy), INTE intäkt',
    automation: { paymentReceived: 1 },
    expects: ['payment.unallocated = 100.00', 'kundtillgodohavandet syns på kundkortet och kan återbetalas (payment_refunded) eller allokeras mot nästa faktura'],
  },
  {
    id: 10, title: 'Kreditfaktura före betalning', regime: STANDARD,
    given: ['Som GP1, obetald'], when: ['Hel kredit KF-1 ställs ut 2026-09-10'],
    events: [
      ...issuedStandard('F-1010', '2026-09-01', '2026-10-01'),
      { t: 'invoice_credited', amt: '-12500.00', cause: 0, p: { invoice_id: 'F-1010', credit_invoice_id: 'KF-1', issued_date: '2026-09-10' } },
      { t: 'receivable_adjusted', amt: '-12500.00', cause: 2, p: { receivable_id: 'F-1010-c', reason: 'credit' } },
    ],
    invoice: { status: 'credited', paidAmount: '0.00', outstanding: '0.00', legacyStatus: 'credited' },
    vouchers: [
      ISSUE_VOUCHER('2026-09-01'),
      { after: 2, series: 'F', effectiveDate: '2026-09-10', lines: [['3001', '10000.00', null], ['2611', '2500.00', null], ['1510', null, '12500.00']] },
    ],
    reconciliation: 'ingen betalning, inget att stämma av',
    automation: { paymentReceived: 0, note: 'En kredit ALLOKERAR inte; receivable_settled avfyras aldrig av en kredit, därför inget payment_received. Bindande.' },
    expects: ['receivable F-1010-c har belopp 0 och är stängd via adjustment, inte via settlement', 'kreditfakturan får eget nummer i samma serie (§36.1), inte KF-serie utanför räknaren'],
  },
  {
    id: 12, title: 'Dubbel webhook / dubbel Fortnox-synk är ekonomiskt exakt en gång', regime: STANDARD,
    given: ['Som GP1'], when: ['Samma settlement-event levereras två gånger med samma idempotensnyckel'],
    events: [
      ...issuedStandard('F-1012', '2026-09-01', '2026-10-01'),
      { t: 'payment_initiated', amt: '12500.00', p: { payment_id: 'pay-12', provider: 'fortnox', direction: 'inbound' } },
      { t: 'payment_settled', amt: '12500.00', cause: 2, p: { payment_id: 'pay-12', evidence: 'fortnox', idempotency_key: 'fortnox_import:biz:F-1012:v3' } },
      { t: 'payment_allocated', amt: '12500.00', cause: 3, p: { allocation_id: 'al-12', payment_id: 'pay-12', receivable_id: 'F-1012-c' } },
      { t: 'receivable_settled', cause: 4, p: { receivable_id: 'F-1012-c', invoice_id: 'F-1012', component: 'customer' } },
    ],
    invoice: { status: 'paid', paidAmount: '12500.00', outstanding: '0.00', legacyStatus: 'paid' },
    vouchers: [ISSUE_VOUCHER('2026-09-01'), { after: 4, series: 'B', effectiveDate: '2026-09-20', lines: [['1930', '12500.00', null], ['1510', null, '12500.00']] }],
    reconciliation: 'en betalning, en allokering',
    automation: { paymentReceived: 1 },
    expects: ['andra append_financial_event med samma nyckel returnerar inserted=false', 'exakt en rad i payments, en i payment_allocations, en verifikation B', 'payment_received avfyras en gång trots två leveranser'],
  },
  {
    id: 34, title: 'ROT: kunddel betald, Skatteverket väntar, sedan Skatteverket betalar — post-payment-automation exakt en gång', regime: { ...STANDARD, taxReduction: 'rot' },
    given: ['Arbete 8 000 ex (10 000 inkl), material 2 000 ex (2 500 inkl), total 12 500', 'ROT 30 % av arbetskostnad inkl moms = 3 000', 'Kund 9 500, Skatteverket 3 000'],
    when: ['Kunden betalar 9 500 den 20:e', 'Skatteverket betalar ut 3 000 den 15:e nästa månad'],
    events: [
      { t: 'invoice_issued', amt: '12500.00', p: { invoice_id: 'F-1034', vat_regime: 'standard', accounting_method: 'accrual', tax_reduction: 'rot' } },
      { t: 'receivable_created', amt: '9500.00', cause: 0, p: { receivable_id: 'F-1034-c', invoice_id: 'F-1034', component: 'customer' } },
      { t: 'receivable_created', amt: '3000.00', cause: 0, p: { receivable_id: 'F-1034-t', invoice_id: 'F-1034', component: 'tax_authority' } },
      { t: 'payment_initiated', amt: '9500.00', p: { payment_id: 'pay-34c', provider: 'manual', direction: 'inbound' } },
      { t: 'payment_settled', amt: '9500.00', cause: 3, p: { payment_id: 'pay-34c', evidence: 'manual' } },
      { t: 'payment_allocated', amt: '9500.00', cause: 4, p: { allocation_id: 'al-34c', payment_id: 'pay-34c', receivable_id: 'F-1034-c' } },
      { t: 'receivable_settled', cause: 5, p: { receivable_id: 'F-1034-c', invoice_id: 'F-1034', component: 'customer' } },
      { t: 'payment_initiated', amt: '3000.00', p: { payment_id: 'pay-34t', provider: 'skatteverket', direction: 'inbound' } },
      { t: 'payment_settled', amt: '3000.00', cause: 7, p: { payment_id: 'pay-34t', evidence: 'bank' } },
      { t: 'payment_allocated', amt: '3000.00', cause: 8, p: { allocation_id: 'al-34t', payment_id: 'pay-34t', receivable_id: 'F-1034-t' } },
      { t: 'receivable_settled', cause: 9, p: { receivable_id: 'F-1034-t', invoice_id: 'F-1034', component: 'tax_authority' } },
    ],
    invoice: { status: 'paid', paidAmount: '12500.00', outstanding: '0.00', legacyStatus: 'paid' },
    vouchers: [
      { after: 0, series: 'F', effectiveDate: '2026-09-01', lines: [['1510', '9500.00', null], ['1513', '3000.00', null], ['3001', null, '10000.00'], ['2611', null, '2500.00']] },
      { after: 5, series: 'B', effectiveDate: '2026-09-20', lines: [['1930', '9500.00', null], ['1510', null, '9500.00']] },
      { after: 9, series: 'B', effectiveDate: '2026-10-15', lines: [['1930', '3000.00', null], ['1513', null, '3000.00']] },
    ],
    reconciliation: 'två banktransaktioner: kund 9 500, Skatteverket 3 000',
    automation: { paymentReceived: 1, note: 'Blueprint §18.5 / golden path 34. Efter pay-34c: legacy to_customer_paid → payment_received. Efter pay-34t: legacy settled → INGENTING.' },
    expects: ['invoice.status = customer_paid mellan de två betalningarna', 'payment_received avfyras efter F-1034-c, aldrig efter F-1034-t', 'momsen är oförändrad av ROT-uppdelningen (2611 = 2 500)'],
  },
  {
    id: 19, title: 'ROT: Skatteverket betalar mindre än begärt', regime: { ...STANDARD, taxReduction: 'rot' },
    given: ['Som GP34, kunddelen betald'], when: ['Skatteverket beslutar 2 500 i stället för 3 000'],
    events: [
      { t: 'invoice_issued', amt: '12500.00', p: { invoice_id: 'F-1019', vat_regime: 'standard', accounting_method: 'accrual', tax_reduction: 'rot' } },
      { t: 'receivable_created', amt: '9500.00', cause: 0, p: { receivable_id: 'F-1019-c', invoice_id: 'F-1019', component: 'customer' } },
      { t: 'receivable_created', amt: '3000.00', cause: 0, p: { receivable_id: 'F-1019-t', invoice_id: 'F-1019', component: 'tax_authority' } },
      { t: 'payment_initiated', amt: '2500.00', p: { payment_id: 'pay-19t', provider: 'skatteverket', direction: 'inbound' } },
      { t: 'payment_settled', amt: '2500.00', cause: 3, p: { payment_id: 'pay-19t', evidence: 'bank' } },
      { t: 'payment_allocated', amt: '2500.00', cause: 4, p: { allocation_id: 'al-19t', payment_id: 'pay-19t', receivable_id: 'F-1019-t' } },
    ],
    invoice: { status: 'customer_paid', paidAmount: '12000.00', outstanding: '500.00', legacyStatus: 'customer_paid' },
    vouchers: [
      { after: 0, series: 'F', effectiveDate: '2026-09-01', lines: [['1510', '9500.00', null], ['1513', '3000.00', null], ['3001', null, '10000.00'], ['2611', null, '2500.00']] },
      { after: 5, series: 'B', effectiveDate: '2026-10-15', lines: [['1930', '2500.00', null], ['1513', null, '2500.00']] },
    ],
    reconciliation: 'UNDANTAG: 500 kr öppet på F-1019-t efter beslut. Ingen automatisk lösning: antingen ny faktura till kunden (fordran flyttar 1513→1510) eller avskrivning. Beslutet är kundens/konsultens.',
    automation: { paymentReceived: 0, note: 'Kunddelen antas redan settlad i ett tidigare steg (utanför detta scenario). Ingen ny automation.' },
    expects: ['FYND FÖR FK.1: receivable_adjusted.reason saknar värde för omklassning mellan komponenter (tax_authority → customer). Föreslås: reason = reclassification, med from_component/to_component i payload. Kräver ARCHITECTURE.md-ändring i C4, inte här.'],
  },
  {
    id: 36, title: 'Öresavrundning inom policy: explicit bokföring, ingen tolerans', regime: STANDARD,
    given: ['Faktura 1 234,56', 'Avrundningspolicy SE (FÖRSLAG): |diff| < 1,00 kr → 3740'],
    when: ['Kunden betalar 1 234,00 (56 öre för lite)'],
    events: [
      { t: 'invoice_issued', amt: '1234.56', p: { invoice_id: 'F-1036', vat_regime: 'standard', accounting_method: 'accrual' } },
      { t: 'receivable_created', amt: '1234.56', cause: 0, p: { receivable_id: 'F-1036-c', invoice_id: 'F-1036', component: 'customer' } },
      { t: 'payment_initiated', amt: '1234.00', p: { payment_id: 'pay-36', provider: 'manual', direction: 'inbound' } },
      { t: 'payment_settled', amt: '1234.00', cause: 2, p: { payment_id: 'pay-36', evidence: 'manual' } },
      { t: 'payment_allocated', amt: '1234.00', cause: 3, p: { allocation_id: 'al-36', payment_id: 'pay-36', receivable_id: 'F-1036-c' } },
      { t: 'receivable_adjusted', amt: '-0.56', cause: 4, p: { receivable_id: 'F-1036-c', reason: 'rounding' } },
      { t: 'receivable_settled', cause: 5, p: { receivable_id: 'F-1036-c', invoice_id: 'F-1036', component: 'customer' } },
    ],
    invoice: { status: 'paid', paidAmount: '1234.00', outstanding: '0.00', legacyStatus: 'paid' },
    vouchers: [
      { after: 0, series: 'F', effectiveDate: '2026-09-01', lines: [['1510', '1234.56', null], ['3001', null, '987.65'], ['2611', null, '246.91']] },
      { after: 5, series: 'B', effectiveDate: '2026-09-20', lines: [['1930', '1234.00', null], ['3740', '0.56', null], ['1510', null, '1234.56']] },
    ],
    reconciliation: 'matchad; differensen 0,56 är en rad på 3740, inte en tyst tolerans',
    automation: { paymentReceived: 1, note: 'Legacy absorberade 0,56 via sin 1-kronstolerans i payment-decision.ts utan spår. Samma slutstatus, nu med förklaring.' },
    expects: ['ingen jämförelsetolerans i kernelkod', 'summan 1234.00 + 0.56 = 1234.56 exakt'],
  },
  {
    id: 37, title: 'Differens utanför avrundningspolicy: fordran förblir öppen', regime: STANDARD,
    given: ['Som GP36'], when: ['Kunden betalar 1 200,00 (34,56 för lite)'],
    events: [
      { t: 'invoice_issued', amt: '1234.56', p: { invoice_id: 'F-1037', vat_regime: 'standard', accounting_method: 'accrual' } },
      { t: 'receivable_created', amt: '1234.56', cause: 0, p: { receivable_id: 'F-1037-c', invoice_id: 'F-1037', component: 'customer' } },
      { t: 'payment_initiated', amt: '1200.00', p: { payment_id: 'pay-37', provider: 'manual', direction: 'inbound' } },
      { t: 'payment_settled', amt: '1200.00', cause: 2, p: { payment_id: 'pay-37', evidence: 'manual' } },
      { t: 'payment_allocated', amt: '1200.00', cause: 3, p: { allocation_id: 'al-37', payment_id: 'pay-37', receivable_id: 'F-1037-c' } },
    ],
    invoice: { status: 'sent', paidAmount: '1200.00', outstanding: '34.56', legacyStatus: 'paid' },
    vouchers: [
      { after: 0, series: 'F', effectiveDate: '2026-09-01', lines: [['1510', '1234.56', null], ['3001', null, '987.65'], ['2611', null, '246.91']] },
      { after: 4, series: 'B', effectiveDate: '2026-09-20', lines: [['1930', '1200.00', null], ['1510', null, '1200.00']] },
    ],
    reconciliation: 'UNDANTAG: 34,56 öppet, inget absorberas, ingen 3740',
    automation: { paymentReceived: 0, legacyPaymentReceived: 1, note: 'Samma legacy-kvirk som GP4: icke-ROT-delbetalning blir paid. Kerneln: öppen.' },
    expects: ['ingen rad på 3740', 'receivable_settled avfyras inte'],
  },
  {
    id: 24, title: 'Periodlås mellan fakturadatum och betalning', regime: STANDARD,
    given: ['Faktura utställd 2026-12-28', 'Period 2026-12 låst 2027-01-03'], when: ['Betalning 2027-01-05'],
    events: [
      ...issuedStandard('F-1024', '2026-12-28', '2027-01-27'),
      { t: 'period_locked', p: { period_id: '2026-12', fiscal_year_id: '2026' } },
      { t: 'payment_initiated', amt: '12500.00', p: { payment_id: 'pay-24', provider: 'manual', direction: 'inbound' } },
      { t: 'payment_settled', amt: '12500.00', cause: 3, p: { payment_id: 'pay-24', evidence: 'manual', settled_at: '2027-01-05' } },
      { t: 'payment_allocated', amt: '12500.00', cause: 4, p: { allocation_id: 'al-24', payment_id: 'pay-24', receivable_id: 'F-1024-c' } },
      { t: 'receivable_settled', cause: 5, p: { receivable_id: 'F-1024-c', invoice_id: 'F-1024', component: 'customer' } },
    ],
    invoice: { status: 'paid', paidAmount: '12500.00', outstanding: '0.00', legacyStatus: 'paid' },
    vouchers: [
      ISSUE_VOUCHER('2026-12-28'),
      { after: 5, series: 'B', effectiveDate: '2027-01-05', lines: [['1930', '12500.00', null], ['1510', null, '12500.00']] },
    ],
    reconciliation: 'matchad i 2027-01',
    automation: { paymentReceived: 1 },
    expects: ['betalningsverifikationen har effective_date 2027-01-05 och period 2027-01, aldrig 2026-12', 'ett försök att bokföra med effective_date i låst period kastar, ingen tyst flytt av datum'],
  },
  {
    id: 31, title: 'Omvänd skattskyldighet bygg: ingen utgående moms, eget intäktskonto, ruta 41', regime: { vatRegime: 'reverse_charge_construction', accountingMethod: 'accrual' },
    given: ['Köparen är byggföretag med evidensierad status', 'Arbete 10 000 ex moms, ingen moms debiteras'],
    when: ['Fakturan ställs ut med texten "Omvänd betalningsskyldighet" och köparens VAT-nr', 'Kunden betalar 10 000'],
    events: [
      { t: 'invoice_issued', amt: '10000.00', p: { invoice_id: 'F-1031', vat_regime: 'reverse_charge_construction', accounting_method: 'accrual' } },
      { t: 'receivable_created', amt: '10000.00', cause: 0, p: { receivable_id: 'F-1031-c', invoice_id: 'F-1031', component: 'customer' } },
      { t: 'payment_initiated', amt: '10000.00', p: { payment_id: 'pay-31', provider: 'manual', direction: 'inbound' } },
      { t: 'payment_settled', amt: '10000.00', cause: 2, p: { payment_id: 'pay-31', evidence: 'manual' } },
      { t: 'payment_allocated', amt: '10000.00', cause: 3, p: { allocation_id: 'al-31', payment_id: 'pay-31', receivable_id: 'F-1031-c' } },
      { t: 'receivable_settled', cause: 4, p: { receivable_id: 'F-1031-c', invoice_id: 'F-1031', component: 'customer' } },
    ],
    invoice: { status: 'paid', paidAmount: '10000.00', outstanding: '0.00', legacyStatus: 'paid' },
    vouchers: [
      { after: 0, series: 'F', effectiveDate: '2026-09-01', lines: [['1510', '10000.00', null], ['3231', null, '10000.00']] },
      { after: 4, series: 'B', effectiveDate: '2026-09-20', lines: [['1930', '10000.00', null], ['1510', null, '10000.00']] },
    ],
    reconciliation: 'matchad',
    automation: { paymentReceived: 1 },
    expects: ['momsdeklaration: ruta 41 += 10 000; ruta 05/10 oförändrade', 'fakturadokumentet bär den lagstadgade hänvisningen och köparens momsregistreringsnummer', 'köparens status är sparad med datum och evidens'],
  },
  {
    id: 33, title: 'Kontantmetoden: ingen bokföring vid utställande, intäkt och moms vid betalning', regime: { vatRegime: 'standard', accountingMethod: 'cash' },
    given: ['Företaget bokför enligt kontantmetoden'], when: ['Faktura 12 500 ställs ut', 'Kunden betalar 12 500'],
    events: [
      { t: 'invoice_issued', amt: '12500.00', p: { invoice_id: 'F-1033', vat_regime: 'standard', accounting_method: 'cash' } },
      { t: 'receivable_created', amt: '12500.00', cause: 0, p: { receivable_id: 'F-1033-c', invoice_id: 'F-1033', component: 'customer' } },
      { t: 'payment_initiated', amt: '12500.00', p: { payment_id: 'pay-33', provider: 'manual', direction: 'inbound' } },
      { t: 'payment_settled', amt: '12500.00', cause: 2, p: { payment_id: 'pay-33', evidence: 'manual' } },
      { t: 'payment_allocated', amt: '12500.00', cause: 3, p: { allocation_id: 'al-33', payment_id: 'pay-33', receivable_id: 'F-1033-c' } },
      { t: 'receivable_settled', cause: 4, p: { receivable_id: 'F-1033-c', invoice_id: 'F-1033', component: 'customer' } },
    ],
    invoice: { status: 'paid', paidAmount: '12500.00', outstanding: '0.00', legacyStatus: 'paid' },
    vouchers: [
      { after: 4, series: 'B', effectiveDate: '2026-09-20', lines: [['1930', '12500.00', null], ['3001', null, '10000.00'], ['2611', null, '2500.00']] },
    ],
    reconciliation: 'matchad',
    automation: { paymentReceived: 1, note: 'Pay, allokering, fordran och projektion är IDENTISKA med GP1. Bara Ledger-projektionen skiljer. Det är kernelgränsens test (§15.2).' },
    expects: ['ingen verifikation utlöst av invoice_issued', 'vid räkenskapsårets slut bokförs obetalda fakturor som fordringar (separat scenario 38)'],
  },
  {
    id: 35, title: 'Faktura utställd före cut-over, betald efter: mot ingående balans', regime: STANDARD,
    given: ['Cut-over 2026-01-01 (räkenskapsårsgräns, D4)', 'F-0999 utställd 2025-12-15 finns i legacy och i SIE #IB som del av 1510', 'Period 2025-12 låst'],
    when: ['Kunden betalar 12 500 den 2026-01-20'],
    events: [
      { t: 'receivable_created', amt: '12500.00', p: { receivable_id: 'F-0999-c', invoice_id: 'F-0999', component: 'customer', source_type: 'opening_balance' } },
      { t: 'payment_initiated', amt: '12500.00', p: { payment_id: 'pay-35', provider: 'manual', direction: 'inbound' } },
      { t: 'payment_settled', amt: '12500.00', cause: 1, p: { payment_id: 'pay-35', evidence: 'manual', settled_at: '2026-01-20' } },
      { t: 'payment_allocated', amt: '12500.00', cause: 2, p: { allocation_id: 'al-35', payment_id: 'pay-35', receivable_id: 'F-0999-c' } },
      { t: 'receivable_settled', cause: 3, p: { receivable_id: 'F-0999-c', invoice_id: 'F-0999', component: 'customer' } },
    ],
    invoice: { status: 'paid', paidAmount: '12500.00', outstanding: '0.00', legacyStatus: 'paid' },
    vouchers: [
      { after: 3, series: 'B', effectiveDate: '2026-01-20', lines: [['1930', '12500.00', null], ['1510', null, '12500.00']] },
    ],
    reconciliation: 'matchad; 1510 minskar mot IB, ingen intäkt, ingen rad i 2025-12',
    automation: { paymentReceived: 1, note: 'Kunden har betalat: legacy-beteendet är oförändrat.' },
    expects: ['inget invoice_issued för F-0999 i kerneln (ingen replay, §18.4)', 'ingen bokföring i låst period', '1510 efter betalning = IB − 12 500'],
  },
  {
    id: 39, title: 'Påminnelseavgift och dröjsmålsränta på förfallen faktura', regime: STANDARD,
    given: ['F-1039 12 500 förfallen', 'Påminnelseavgift 60 kr (momsfri), ränta 45,20 (momsfri) — MOMSBEHANDLING ATT BEKRÄFTA'],
    when: ['Påminnelse skickas', 'Kunden betalar 12 605,20'],
    events: [
      ...issuedStandard('F-1039', '2026-08-01', '2026-08-31'),
      { t: 'receivable_adjusted', amt: '60.00', cause: 1, p: { receivable_id: 'F-1039-c', reason: 'dunning_fee' } },
      { t: 'receivable_adjusted', amt: '45.20', cause: 1, p: { receivable_id: 'F-1039-c', reason: 'interest' } },
      { t: 'payment_initiated', amt: '12605.20', p: { payment_id: 'pay-39', provider: 'manual', direction: 'inbound' } },
      { t: 'payment_settled', amt: '12605.20', cause: 4, p: { payment_id: 'pay-39', evidence: 'manual' } },
      { t: 'payment_allocated', amt: '12605.20', cause: 5, p: { allocation_id: 'al-39', payment_id: 'pay-39', receivable_id: 'F-1039-c' } },
      { t: 'receivable_settled', cause: 6, p: { receivable_id: 'F-1039-c', invoice_id: 'F-1039', component: 'customer' } },
    ],
    invoice: { status: 'paid', paidAmount: '12605.20', outstanding: '0.00', legacyStatus: 'paid' },
    vouchers: [
      ISSUE_VOUCHER('2026-08-01'),
      { after: 2, series: 'F', effectiveDate: '2026-09-15', lines: [['1510', '60.00', null], ['3591', null, '60.00']] },
      { after: 3, series: 'F', effectiveDate: '2026-09-15', lines: [['1510', '45.20', null], ['8313', null, '45.20']] },
      { after: 6, series: 'B', effectiveDate: '2026-09-25', lines: [['1930', '12605.20', null], ['1510', null, '12605.20']] },
    ],
    reconciliation: 'matchad',
    automation: { paymentReceived: 1 },
    expects: ['invoice.total ändras INTE av påminnelsen (legacy skriver om total — kartan tier 2 #5); avgiften är en justering av fordran', 'ränta periodiseras över tid; detta scenario bokför den vid påminnelsen — konsulten avgör (Q i SE-granskningen)'],
  },
  {
    id: 2, title: 'Kort/PSP-betalning: clearing, utbetalning, avgift, bankavstämning', regime: STANDARD,
    given: ['Som GP1', 'PSP-avgift 1,45 % = 181,25'], when: ['Kunden betalar med kort via Handymate Pay', 'PSP betalar ut netto 12 318,75 två dagar senare'],
    events: [
      ...issuedStandard('F-1002', '2026-09-01', '2026-10-01'),
      { t: 'payment_intent_created', amt: '12500.00', cause: 1, p: { payment_intent_id: 'pi-2', invoice_id: 'F-1002', provider: 'psp', method: 'card' } },
      { t: 'payment_initiated', amt: '12500.00', cause: 2, p: { payment_id: 'pay-2', payment_intent_id: 'pi-2', provider: 'psp', direction: 'inbound' } },
      { t: 'payment_authorized', cause: 3, p: { payment_id: 'pay-2' } },
      { t: 'payment_processing_started', cause: 4, p: { payment_id: 'pay-2' } },
      { t: 'payment_settled', amt: '12500.00', cause: 5, p: { payment_id: 'pay-2', evidence: 'provider', fee_minor: 18125 } },
      { t: 'payment_allocated', amt: '12500.00', cause: 6, p: { allocation_id: 'al-2', payment_id: 'pay-2', receivable_id: 'F-1002-c' } },
      { t: 'receivable_settled', cause: 7, p: { receivable_id: 'F-1002-c', invoice_id: 'F-1002', component: 'customer' } },
      { t: 'payout_created', amt: '12318.75', cause: 6, p: { payout_id: 'po-2', provider: 'psp', fee_minor: 18125 } },
      { t: 'payout_settled', amt: '12318.75', cause: 9, p: { payout_id: 'po-2', banked_at: '2026-09-22' } },
      { t: 'bank_transaction_imported', amt: '12318.75', p: { bank_transaction_id: 'bt-2', source: 'bank', banked_at: '2026-09-22' } },
      { t: 'reconciliation_matched', amt: '12318.75', cause: 11, p: { bank_transaction_id: 'bt-2', matched_type: 'payout', matched_id: 'po-2', partial: false } },
    ],
    invoice: { status: 'paid', paidAmount: '12500.00', outstanding: '0.00', legacyStatus: 'paid' },
    vouchers: [
      ISSUE_VOUCHER('2026-09-01'),
      { after: 7, series: 'B', effectiveDate: '2026-09-20', lines: [['1580', '12500.00', null], ['1510', null, '12500.00']] },
      { after: 10, series: 'B', effectiveDate: '2026-09-22', lines: [['1930', '12318.75', null], ['6570', '181.25', null], ['1580', null, '12500.00']] },
    ],
    reconciliation: 'bt-2 matchad mot po-2; 1580 = 0 efter utbetalning',
    automation: { paymentReceived: 1, note: 'Avfyras vid settlement (kunden är klar), inte vid utbetalning.' },
    expects: ['kunden anses betald vid payment_settled även om pengarna är i clearing', 'avgiftens moms: PSP i annat EU-land = tjänsteinköp med omvänd skattskyldighet (ruta 21/30/48) — Q i SE-granskningen; P0 (merchant of record) avgör vem som bär avgiften'],
  },
  {
    id: 20, title: 'Leverantörsfaktura: attest → AP-bokföring → betalning → avstämning', regime: STANDARD,
    given: ['Leverantörsfaktura 4 000 ex + 1 000 moms = 5 000'], when: ['Attesteras', 'Betalas via bankgiro'],
    events: [
      { t: 'supplier_invoice_approved', amt: '5000.00', p: { supplier_invoice_id: 'LF-20', vat_regime: 'standard' } },
      { t: 'payable_created', amt: '5000.00', cause: 0, p: { payable_id: 'LF-20-p', supplier_invoice_id: 'LF-20' } },
      { t: 'payment_initiated', amt: '5000.00', p: { payment_id: 'pay-20', provider: 'manual', direction: 'outbound' } },
      { t: 'payment_settled', amt: '5000.00', cause: 2, p: { payment_id: 'pay-20', evidence: 'bank' } },
      { t: 'supplier_payment_settled', amt: '5000.00', cause: 3, p: { payment_id: 'pay-20', supplier_invoice_id: 'LF-20' } },
      { t: 'payable_settled', cause: 4, p: { payable_id: 'LF-20-p', supplier_invoice_id: 'LF-20' } },
      { t: 'bank_transaction_imported', amt: '-5000.00', p: { bank_transaction_id: 'bt-20', source: 'bank' } },
      { t: 'reconciliation_matched', amt: '5000.00', cause: 6, p: { bank_transaction_id: 'bt-20', matched_type: 'supplier_payment', matched_id: 'pay-20', partial: false } },
    ],
    invoice: { status: 'paid', paidAmount: '5000.00', outstanding: '0.00', legacyStatus: 'paid' },
    vouchers: [
      { after: 0, series: 'L', effectiveDate: '2026-09-05', lines: [['4010', '4000.00', null], ['2641', '1000.00', null], ['2440', null, '5000.00']] },
      { after: 4, series: 'B', effectiveDate: '2026-09-25', lines: [['2440', '5000.00', null], ['1930', null, '5000.00']] },
    ],
    reconciliation: 'bt-20 matchad mot pay-20',
    automation: { paymentReceived: 0, note: 'Leverantörssidan avfyrar aldrig payment_received.' },
    expects: ['omvänd skattskyldighet på inköp (underentreprenör bygg): 4425 + 2647 D / 2614 K, ruta 24/30/48 — separat scenario när C9 briefas'],
  },
  {
    id: 30, title: 'Samma kommando efter nätverkstimeout: ekonomiskt exakt en gång', regime: STANDARD,
    given: ['Som GP1'], when: ['record_payment_settlement anropas, svaret tappas, klienten försöker igen med samma idempotensnyckel'],
    events: [
      ...issuedStandard('F-1030', '2026-09-01', '2026-10-01'),
      { t: 'payment_initiated', amt: '12500.00', p: { payment_id: 'pay-30', provider: 'manual', direction: 'inbound' } },
      { t: 'payment_settled', amt: '12500.00', cause: 2, p: { payment_id: 'pay-30', evidence: 'manual', idempotency_key: 'payment_settlement:manual:pay-30:1' } },
      { t: 'payment_allocated', amt: '12500.00', cause: 3, p: { allocation_id: 'al-30', payment_id: 'pay-30', receivable_id: 'F-1030-c' } },
      { t: 'receivable_settled', cause: 4, p: { receivable_id: 'F-1030-c', invoice_id: 'F-1030', component: 'customer' } },
    ],
    invoice: { status: 'paid', paidAmount: '12500.00', outstanding: '0.00', legacyStatus: 'paid' },
    vouchers: [ISSUE_VOUCHER('2026-09-01'), { after: 4, series: 'B', effectiveDate: '2026-09-20', lines: [['1930', '12500.00', null], ['1510', null, '12500.00']] }],
    reconciliation: 'en betalning',
    automation: { paymentReceived: 1 },
    expects: ['andra anropet returnerar samma payment_id och inserted=false på alla tre event', 'inga dubbla rader; bryggan konsumerar receivable_settled en gång tack vare leveransboken (C3)'],
  },
]
