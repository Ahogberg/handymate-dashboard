import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { roundSek } from './commission-engine'

export interface LegalBillingIdentity {
  legalName: string
  organizationNumber: string
  registeredAddress: string
  vatNumber: string | null
  email: string
}

export interface PartnerBillingIdentity extends LegalBillingIdentity {
  vatRegistered: boolean
  vatRate: number
  fTaxApproved: boolean
  payoutReference: string
}

export interface SelfBillingStatementRow {
  customerName: string
  period: string
  customerMonth: number
  baseSek: number
  rate: number
  commissionSek: number
  kind: 'accrual' | 'adjustment'
}

export interface SelfBillingDocument {
  documentType: 'self_billing_invoice'
  title: 'SJÄLVFAKTURERING'
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  seller: PartnerBillingIdentity
  buyer: LegalBillingIdentity
  rows: SelfBillingStatementRow[]
  subtotalSek: number
  vatRate: number
  vatSek: number
  totalSek: number
  paymentTermsDays: number
  generatedAt: string
}

export interface BuildSelfBillingInput {
  invoiceNumber: string
  invoiceDate: string
  seller: PartnerBillingIdentity
  buyer: LegalBillingIdentity
  rows: SelfBillingStatementRow[]
  paymentTermsDays?: number
  generatedAt?: string
}

/**
 * Handymates juridiska köparidentitet får aldrig hårdkodas eller gissas.
 * Batchskapandet stannar tills alla värden är satta i den skarpa miljön.
 */
export function getHandymateBillingIdentityFromEnv(): LegalBillingIdentity {
  return {
    legalName: required(process.env.HANDYMATE_LEGAL_NAME || '', 'Handymates juridiska namn'),
    organizationNumber: required(process.env.HANDYMATE_ORG_NUMBER || '', 'Handymates organisationsnummer'),
    registeredAddress: required(process.env.HANDYMATE_REGISTERED_ADDRESS || '', 'Handymates adress'),
    vatNumber: required(process.env.HANDYMATE_VAT_NUMBER || '', 'Handymates momsregistreringsnummer'),
    email: required(process.env.HANDYMATE_BILLING_EMAIL || '', 'Handymates faktura-e-post'),
  }
}

function required(value: string, label: string): string {
  const trimmed = value?.trim()
  if (!trimmed) throw new Error(`${label} saknas för självfakturering`)
  return trimmed
}

function validIsoDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(new Date(`${value}T00:00:00Z`).getTime())) {
    throw new Error(`${label} är ogiltigt`)
  }
  return value
}

export function buildSelfBillingDocument(input: BuildSelfBillingInput): SelfBillingDocument {
  const paymentTermsDays = input.paymentTermsDays ?? 30
  if (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 1 || paymentTermsDays > 365) {
    throw new Error('Betalningsvillkoret är ogiltigt')
  }
  if (!input.rows.length) throw new Error('Självfakturan saknar provisionsrader')

  const invoiceDate = validIsoDate(input.invoiceDate, 'Fakturadatum')
  const due = new Date(`${invoiceDate}T00:00:00Z`)
  due.setUTCDate(due.getUTCDate() + paymentTermsDays)

  const seller: PartnerBillingIdentity = {
    ...input.seller,
    legalName: required(input.seller.legalName, 'Partnerns juridiska namn'),
    organizationNumber: required(input.seller.organizationNumber, 'Partnerns organisationsnummer'),
    registeredAddress: required(input.seller.registeredAddress, 'Partnerns adress'),
    email: required(input.seller.email, 'Partnerns faktura-e-post'),
    vatNumber: input.seller.vatRegistered
      ? required(input.seller.vatNumber || '', 'Partnerns momsregistreringsnummer')
      : null,
    payoutReference: required(input.seller.payoutReference, 'Partnerns betalningsuppgift'),
  }
  if (!Number.isFinite(seller.vatRate) || seller.vatRate < 0 || seller.vatRate > 1) {
    throw new Error('Partnerns momssats är ogiltig')
  }
  if (!seller.vatRegistered && seller.vatRate !== 0) {
    throw new Error('Ej momsregistrerad partner måste ha momssats 0')
  }

  const buyer: LegalBillingIdentity = {
    ...input.buyer,
    legalName: required(input.buyer.legalName, 'Handymates juridiska namn'),
    organizationNumber: required(input.buyer.organizationNumber, 'Handymates organisationsnummer'),
    registeredAddress: required(input.buyer.registeredAddress, 'Handymates adress'),
    email: required(input.buyer.email, 'Handymates faktura-e-post'),
    vatNumber: required(input.buyer.vatNumber || '', 'Handymates momsregistreringsnummer'),
  }

  const rows = input.rows.map(row => ({
    ...row,
    baseSek: roundSek(row.baseSek),
    commissionSek: roundSek(row.commissionSek),
  }))
  const subtotalSek = roundSek(rows.reduce((sum, row) => sum + row.commissionSek, 0))
  const vatRate = seller.vatRegistered ? seller.vatRate : 0
  const vatSek = roundSek(subtotalSek * vatRate)
  const totalSek = roundSek(subtotalSek + vatSek)

  return {
    documentType: 'self_billing_invoice',
    title: 'SJÄLVFAKTURERING',
    invoiceNumber: required(input.invoiceNumber, 'Självfakturanummer'),
    invoiceDate,
    dueDate: due.toISOString().slice(0, 10),
    seller,
    buyer,
    rows,
    subtotalSek,
    vatRate,
    vatSek,
    totalSek,
    paymentTermsDays,
    generatedAt: input.generatedAt || new Date().toISOString(),
  }
}

function formatSek(value: number): string {
  return `${value.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('sv-SE')
}

/** Renderar den frysta snapshoten; inga liveuppgifter hämtas vid nedladdning. */
export function generateSelfBillingPdf(document: SelfBillingDocument): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const teal = '#0F766E'
  doc.setFillColor(teal)
  doc.rect(0, 0, 210, 30, 'F')
  doc.setTextColor('#FFFFFF')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text(document.title, 15, 19)

  doc.setTextColor('#0F172A')
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Självfakturanummer: ${document.invoiceNumber}`, 130, 42)
  doc.text(`Fakturadatum: ${formatDate(document.invoiceDate)}`, 130, 48)
  doc.text(`Förfallodatum: ${formatDate(document.dueDate)}`, 130, 54)
  doc.text(`Betalningsvillkor: ${document.paymentTermsDays} dagar`, 130, 60)

  doc.setFont('helvetica', 'bold')
  doc.text('SÄLJARE / PARTNER', 15, 42)
  doc.setFont('helvetica', 'normal')
  doc.text(document.seller.legalName, 15, 48)
  doc.text(`Org.nr: ${document.seller.organizationNumber}`, 15, 54)
  doc.text(document.seller.registeredAddress, 15, 60)
  if (document.seller.vatNumber) doc.text(`Momsreg.nr: ${document.seller.vatNumber}`, 15, 66)
  doc.text(`Betalning: ${document.seller.payoutReference}`, 15, document.seller.vatNumber ? 72 : 66)

  doc.setFont('helvetica', 'bold')
  doc.text('KÖPARE / UTFÄRDARE', 75, 42)
  doc.setFont('helvetica', 'normal')
  doc.text(document.buyer.legalName, 75, 48)
  doc.text(`Org.nr: ${document.buyer.organizationNumber}`, 75, 54)
  doc.text(document.buyer.registeredAddress, 75, 60)
  doc.text(`Momsreg.nr: ${document.buyer.vatNumber || '—'}`, 75, 66)

  autoTable(doc, {
    startY: 82,
    head: [['Kund', 'Period', 'Månad', 'Bas', 'Sats', 'Provision']],
    body: document.rows.map(row => [
      row.customerName,
      row.period,
      String(row.customerMonth),
      formatSek(row.baseSek),
      `${(row.rate * 100).toLocaleString('sv-SE')} %`,
      formatSek(row.commissionSek),
    ]),
    theme: 'grid',
    headStyles: { fillColor: teal, textColor: '#FFFFFF' },
    styles: { font: 'helvetica', fontSize: 8 },
  })

  const finalY = (doc as any).lastAutoTable?.finalY || 110
  const x = 195
  doc.setFontSize(10)
  doc.text(`Provision exkl. moms: ${formatSek(document.subtotalSek)}`, x, finalY + 10, { align: 'right' })
  doc.text(`Moms ${(document.vatRate * 100).toLocaleString('sv-SE')} %: ${formatSek(document.vatSek)}`, x, finalY + 16, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(`Att betala: ${formatSek(document.totalSek)}`, x, finalY + 24, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor('#475569')
  doc.text('Denna faktura har utfärdats av Handymate för partnerns räkning enligt avtal om självfakturering.', 15, 282)
  doc.text(`F-skatt: ${document.seller.fTaxApproved ? 'Godkänd' : 'Ej uppgiven'}`, 15, 287)

  return new Uint8Array(doc.output('arraybuffer'))
}
