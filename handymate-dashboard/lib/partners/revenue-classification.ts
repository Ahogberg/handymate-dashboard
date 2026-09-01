/**
 * Ren klassning av Stripe-intäkt för partnerprovision.
 *
 * Gränsen är avsiktligt fail-closed: en rad är provisionsgrundande bara om
 * dess Stripe Price-id finns i billing_plan. Addons, engångsköp och okända
 * rader ger aldrig provision bara för att de råkar ligga på samma faktura.
 */

export const PARTNER_REVENUE_SCHEMA_VERSION = 1 as const

export type PartnerRevenueClass =
  | 'core_subscription'
  | 'excluded_addon'
  | 'refund'
  | 'chargeback'
  | 'unknown'

export interface RevenueAllocation {
  period: string
  amountExVatOre: number
}

export interface ClassifiedRevenueLine {
  lineId: string
  priceId: string | null
  classification: PartnerRevenueClass
  reason:
    | 'known_core_price'
    | 'addon_metadata'
    | 'known_excluded_price'
    | 'missing_price'
    | 'unknown_price'
    | 'missing_service_period'
    | 'invalid_amount'
    | 'non_sek'
    | 'proportional_reversal'
  amountExVatOre: number
  serviceStart: string | null
  serviceEnd: string | null
  allocations: RevenueAllocation[]
}

export interface PartnerRevenueSnapshot {
  schemaVersion: typeof PARTNER_REVENUE_SCHEMA_VERSION
  invoiceId: string
  currency: string
  eventKind: 'payment' | 'refund' | 'chargeback'
  classification: PartnerRevenueClass | 'mixed'
  lines: ClassifiedRevenueLine[]
  commissionableExVatOre: number
}

export interface StripeInvoiceLike {
  id?: unknown
  currency?: unknown
  amount_paid?: unknown
  total_excluding_tax?: unknown
  tax?: unknown
  metadata?: unknown
  subscription_details?: unknown
  lines?: unknown
}

interface NormalizeOptions {
  corePriceIds: ReadonlySet<string>
  excludedPriceIds?: ReadonlySet<string>
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function finiteInteger(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : null
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function unixToIso(value: unknown): string | null {
  const seconds = finiteInteger(value)
  if (seconds === null || seconds <= 0) return null
  const date = new Date(seconds * 1000)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function nextMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
}

/**
 * Fördelar ett helt öresbelopp linjärt över tjänsteperiodens kalenderdelar.
 * Fördelningen görs i millisekunder och sista öresresten delas ut efter
 * största decimalrest. Summan kan därför aldrig glida från originalbeloppet.
 */
export function allocateAcrossCalendarMonths(
  amountExVatOre: number,
  serviceStartIso: string,
  serviceEndIso: string,
): RevenueAllocation[] {
  const amount = Math.round(amountExVatOre)
  const start = new Date(serviceStartIso)
  const end = new Date(serviceEndIso)
  if (amount <= 0 || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return []

  const totalMs = end.getTime() - start.getTime()
  const weights: Array<{ period: string; exact: number; floor: number; remainder: number }> = []
  let cursor = monthStart(start)

  while (cursor < end) {
    const following = nextMonth(cursor)
    const overlapStart = Math.max(start.getTime(), cursor.getTime())
    const overlapEnd = Math.min(end.getTime(), following.getTime())
    if (overlapEnd > overlapStart) {
      const exact = amount * ((overlapEnd - overlapStart) / totalMs)
      const floor = Math.floor(exact)
      weights.push({
        period: cursor.toISOString().slice(0, 7),
        exact,
        floor,
        remainder: exact - floor,
      })
    }
    cursor = following
  }

  let left = amount - weights.reduce((sum, item) => sum + item.floor, 0)
  const byRemainder = [...weights].sort((a, b) =>
    b.remainder - a.remainder || a.period.localeCompare(b.period)
  )
  for (let i = 0; i < byRemainder.length && left > 0; i++, left--) {
    byRemainder[i].floor++
  }

  return weights.map(item => ({ period: item.period, amountExVatOre: item.floor }))
}

function invoiceMetadata(invoice: StripeInvoiceLike): Record<string, unknown> {
  const subscriptionDetails = record(invoice.subscription_details)
  return {
    ...record(invoice.metadata),
    ...record(subscriptionDetails.metadata),
  }
}

function extractLines(invoice: StripeInvoiceLike): unknown[] {
  const lines = record(invoice.lines)
  return Array.isArray(lines.data) ? lines.data : []
}

function extractPriceId(line: Record<string, unknown>): string | null {
  // Stripe har flyttat prisfältet mellan API-versioner. Vi läser båda
  // dokumenterade formerna men klassar fortfarande bara mot vår allowlist.
  const directPrice = record(line.price)
  const pricing = record(line.pricing)
  const priceDetails = record(pricing.price_details)
  return stringOrNull(directPrice.id)
    || stringOrNull(priceDetails.price)
    || stringOrNull(priceDetails.price_id)
}

function extractPeriod(line: Record<string, unknown>): { start: string | null; end: string | null } {
  const period = record(line.period)
  return { start: unixToIso(period.start), end: unixToIso(period.end) }
}

function extractLineExVatOre(line: Record<string, unknown>): number | null {
  const excludingTax = finiteInteger(line.amount_excluding_tax)
  if (excludingTax !== null) return excludingTax
  return finiteInteger(line.amount)
}

/**
 * Klassar och periodiserar en betald Stripe-faktura. Funktionen tar inga
 * miljövariabler eller databasberoenden; allowlistan kommer från billing_plan.
 */
export function classifyPaidInvoice(
  invoice: StripeInvoiceLike,
  options: NormalizeOptions,
): PartnerRevenueSnapshot {
  const invoiceId = stringOrNull(invoice.id) || 'unknown_invoice'
  const currency = (stringOrNull(invoice.currency) || '').toLowerCase()
  const metadata = invoiceMetadata(invoice)
  const addon = stringOrNull(metadata.addon)
  const rawLines = extractLines(invoice)

  const paidExVatOre = (() => {
    const explicit = finiteInteger(invoice.total_excluding_tax)
    if (explicit !== null && explicit >= 0) return explicit
    const paid = finiteInteger(invoice.amount_paid)
    const tax = finiteInteger(invoice.tax) || 0
    return paid === null ? null : Math.max(0, paid - Math.max(0, tax))
  })()

  const rawAmounts = rawLines.map(raw => extractLineExVatOre(record(raw)))
  const rawTotal = rawAmounts.reduce<number>((sum, amount) => sum + Math.max(0, amount || 0), 0)
  const paidRatio = paidExVatOre !== null && rawTotal > 0
    ? Math.min(1, paidExVatOre / rawTotal)
    : 1

  const lines = rawLines.map((raw, index): ClassifiedRevenueLine => {
    const line = record(raw)
    const lineId = stringOrNull(line.id) || `${invoiceId}:line:${index}`
    const priceId = extractPriceId(line)
    const period = extractPeriod(line)
    const rawAmount = extractLineExVatOre(line)
    const amountExVatOre = rawAmount === null ? 0 : Math.max(0, Math.round(rawAmount * paidRatio))

    let classification: PartnerRevenueClass = 'unknown'
    let reason: ClassifiedRevenueLine['reason'] = 'unknown_price'

    if (currency !== 'sek') {
      reason = 'non_sek'
    } else if (amountExVatOre <= 0) {
      reason = 'invalid_amount'
    } else if (addon) {
      classification = 'excluded_addon'
      reason = 'addon_metadata'
    } else if (!priceId) {
      reason = 'missing_price'
    } else if (options.excludedPriceIds?.has(priceId)) {
      classification = 'excluded_addon'
      reason = 'known_excluded_price'
    } else if (!options.corePriceIds.has(priceId)) {
      reason = 'unknown_price'
    } else if (!period.start || !period.end) {
      reason = 'missing_service_period'
    } else {
      classification = 'core_subscription'
      reason = 'known_core_price'
    }

    const allocations = classification === 'core_subscription' && period.start && period.end
      ? allocateAcrossCalendarMonths(amountExVatOre, period.start, period.end)
      : []

    return {
      lineId,
      priceId,
      classification,
      reason,
      amountExVatOre,
      serviceStart: period.start,
      serviceEnd: period.end,
      allocations,
    }
  })

  const classes = new Set(lines.map(line => line.classification))
  const classification: PartnerRevenueSnapshot['classification'] = classes.size === 1
    ? lines[0]?.classification || 'unknown'
    : 'mixed'

  return {
    schemaVersion: PARTNER_REVENUE_SCHEMA_VERSION,
    invoiceId,
    currency,
    eventKind: 'payment',
    classification,
    lines,
    commissionableExVatOre: lines
      .filter(line => line.classification === 'core_subscription')
      .reduce((sum, line) => sum + line.amountExVatOre, 0),
  }
}

/**
 * Skapar en spårbar negativ spegling av en redan klassad faktura. ratio är
 * den återbetalda/bestridda andelen av Stripes bruttobelopp. Varje delbelopp
 * avrundas deterministiskt; en återkörning med samma Stripe-event dedupas i
 * lagringslagret, inte genom att skriva om originalhändelsen.
 */
export function reverseRevenueSnapshot(
  original: PartnerRevenueSnapshot,
  kind: 'refund' | 'chargeback',
  ratio: number,
): PartnerRevenueSnapshot {
  const safeRatio = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0
  const lines = original.lines.map((line): ClassifiedRevenueLine => {
    if (line.classification !== 'core_subscription' || safeRatio <= 0) {
      return {
        ...line,
        classification: kind,
        reason: 'proportional_reversal',
        amountExVatOre: 0,
        allocations: [],
      }
    }
    const amountExVatOre = -Math.round(line.amountExVatOre * safeRatio)
    const allocations = line.allocations.map(allocation => ({
      period: allocation.period,
      amountExVatOre: -Math.round(allocation.amountExVatOre * safeRatio),
    }))
    return {
      ...line,
      classification: kind,
      reason: 'proportional_reversal',
      amountExVatOre,
      allocations,
    }
  })

  return {
    ...original,
    eventKind: kind,
    classification: kind,
    lines,
    commissionableExVatOre: lines.reduce((sum, line) => sum + line.amountExVatOre, 0),
  }
}

/** Kalenderbaserad provisionsmånad: första betalningsmånaden = 1. */
export function commissionCalendarMonth(startedAtIso: string, period: string): number {
  if (!/^\d{4}-\d{2}$/.test(period)) return 0
  const startedAt = new Date(startedAtIso)
  if (!Number.isFinite(startedAt.getTime())) return 0
  const [year, month] = period.split('-').map(Number)
  const diff = (year - startedAt.getUTCFullYear()) * 12 + (month - (startedAt.getUTCMonth() + 1))
  return diff < 0 ? 0 : diff + 1
}

export interface PeriodRevenueExtraction {
  hasSnapshot: boolean
  amountExVatOre: number
}

/** Läser endast vår versionsmärkta snapshot; råa Stripe-totaler är aldrig fallback. */
export function extractPartnerRevenueForPeriod(
  billingEventData: unknown,
  period: string,
): PeriodRevenueExtraction {
  const data = record(billingEventData)
  const snapshot = record(data.partner_revenue)
  if (snapshot.schemaVersion !== PARTNER_REVENUE_SCHEMA_VERSION || !Array.isArray(snapshot.lines)) {
    return { hasSnapshot: false, amountExVatOre: 0 }
  }

  let amountExVatOre = 0
  for (const rawLine of snapshot.lines) {
    const line = record(rawLine)
    if (!Array.isArray(line.allocations)) continue
    for (const rawAllocation of line.allocations) {
      const allocation = record(rawAllocation)
      if (allocation.period !== period) continue
      const amount = finiteInteger(allocation.amountExVatOre)
      if (amount !== null) amountExVatOre += amount
    }
  }
  return { hasSnapshot: true, amountExVatOre }
}
