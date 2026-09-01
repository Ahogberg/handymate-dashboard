/**
 * Provisionsmotorns RENA logik — inga DB-anrop, direkttestbar
 * (tests/partner-commission.spec.ts). DB-orkestreringen ligger i
 * lib/partners/commission.ts.
 *
 * Affärsmodellen (Andreas beslut 2026-09-01, se content/partner/partneravtal-v1.md
 * Bilaga 1 — ersätter den tidigare trappan från 2026-08-11):
 *  - Standard är EN flat sats (default commission_tiers = [{min:0,rate:0.20}])
 *    i ladder_months (default 36) kalendermånader, därefter base_rate_after
 *    (default 0 %). Motorn själv förblir generisk — en explicit flertrappa
 *    eller ett annat ladder_months/base_rate_after är fortsatt en giltig
 *    per-partner-avvikelse (Partnerbekräftelse, avtalets punkt 16.3), satt
 *    via PartnerCommissionModal. Tom/null trappa → legacy partners.commission_rate.
 *  - tier_mode 'book' (default): uppnådd sats gäller hela kundstocken.
 *    'marginal': kunder fördelas i band efter converted_at stigande —
 *    kund på position p får satsen för högsta steget med min <= p.
 *  - Månad 1..ladder_months per kund på trappsatsen, därefter EVIG
 *    basnivå (base_rate_after) så länge kunden betalar. "Månad" = BETALD
 *    månad — en obetald månad avancerar inte räknaren (ingen betalning →
 *    ingen liggarrad).
 *  - Basen är faktiskt betalt EX MOMS. Systemet kör idag Stripe utan
 *    automatic_tax (amount_paid == ex moms); om moms aktiveras senare
 *    bär billing_event.data total_excluding_tax/tax från 2026-08-11.
 */

export interface TierStep {
  min: number
  rate: number
}

export interface PartnerCommissionConfig {
  tiers: TierStep[] | null
  legacyRate: number
  baseRateAfter: number
  tierMode: 'book' | 'marginal'
  ladderMonths: number
}

/** En kund med minst en lyckad betalning i perioden. */
export interface CustomerPayment {
  businessId: string
  referralId: string | null
  /** 1..N — betald-månads-räknare INKLUSIVE denna period. */
  customerMonth: number
  paidExMomsSek: number
  /** ISO-datum för konvertering — styr bandordning i marginal-läget. */
  convertedAt: string
  billingEventIds: string[]
}

export interface LedgerRowDraft {
  businessId: string
  referralId: string | null
  customerMonth: number
  baseAmountSek: number
  rate: number
  amountSek: number
  rateSource: 'tier' | 'base_rate' | 'legacy_rate'
  tierSnapshot: {
    active_count: number
    tiers: TierStep[] | null
    tier_mode: 'book' | 'marginal'
    band: number | null
  }
  billingEventIds: string[]
}

interface BillingEventData {
  amount_paid?: number | null
  total_excluding_tax?: number | null
  tax?: number | null
  currency?: string | null
}

/**
 * Härled provisionsbasen (kr, ex moms) ur ett billing_event.data-objekt.
 * Returnerar 0 om beloppet inte kan användas (fel valuta, negativt, tomt).
 *
 * Regler i prioritetsordning:
 *  1. total_excluding_tax (öre) om satt — Stripe-fakturans egen ex-moms-summa.
 *  2. amount_paid - tax om tax > 0.
 *  3. amount_paid rakt av — dagens läge: ingen automatic_tax i Stripe,
 *     priserna faktureras utan påslagen moms, så betalt belopp ÄR basen.
 *     (Verifierat mot prod 2026-08-11: enda payment_succeeded-raden
 *     matchar listpriset exakt, ingen momskomponent.)
 */
export function deriveExMomsSek(data: BillingEventData | null | undefined): number {
  if (!data) return 0
  if (data.currency && String(data.currency).toLowerCase() !== 'sek') return 0

  let ore: number | null = null
  if (typeof data.total_excluding_tax === 'number' && data.total_excluding_tax > 0) {
    ore = data.total_excluding_tax
  } else if (typeof data.amount_paid === 'number') {
    ore = typeof data.tax === 'number' && data.tax > 0
      ? data.amount_paid - data.tax
      : data.amount_paid
  }

  if (ore === null || !isFinite(ore) || ore <= 0) return 0
  return ore / 100
}

/** Sortera trappan stigande på min och validera grundformen. */
function normalizeTiers(tiers: TierStep[] | null | undefined): TierStep[] | null {
  if (!Array.isArray(tiers) || tiers.length === 0) return null
  const clean = tiers
    .filter(t => t && typeof t.min === 'number' && typeof t.rate === 'number' && t.rate > 0 && t.rate <= 1)
    .sort((a, b) => a.min - b.min)
  return clean.length > 0 ? clean : null
}

/**
 * Book-läget: högsta trappsteget vars min <= activeCount gäller hela stocken.
 * Returnerar null om trappan är tom (→ legacy-satsen används).
 */
export function evaluateBookRate(
  tiers: TierStep[] | null | undefined,
  activeCount: number,
): { rate: number; band: number } | null {
  const clean = normalizeTiers(tiers)
  if (!clean) return null
  let vald = clean[0]
  let band = 0
  for (let i = 0; i < clean.length; i++) {
    if (clean[i].min <= activeCount) {
      vald = clean[i]
      band = i
    }
  }
  return { rate: vald.rate, band }
}

/**
 * Marginal-läget: trappberättigade kunder sorteras på converted_at stigande
 * (deterministisk tie-break på businessId) — kund på 1-baserad position p
 * får satsen för högsta steget med min <= p.
 */
export function allocateMarginalBands(
  customers: CustomerPayment[],
  tiers: TierStep[] | null | undefined,
): Map<string, { rate: number; band: number }> {
  const ut = new Map<string, { rate: number; band: number }>()
  const clean = normalizeTiers(tiers)
  if (!clean) return ut

  const sorterade = [...customers].sort((a, b) =>
    a.convertedAt < b.convertedAt ? -1 :
    a.convertedAt > b.convertedAt ? 1 :
    a.businessId < b.businessId ? -1 : 1
  )
  for (let p = 1; p <= sorterade.length; p++) {
    const steg = evaluateBookRate(clean, p)
    if (steg) ut.set(sorterade[p - 1].businessId, steg)
  }
  return ut
}

/**
 * Huvudfunktionen: en periods betalande kunder för EN partner → utkast till
 * liggarrader. Deterministisk — samma indata ger alltid samma utdata.
 *
 * activeCount = ALLA kunder med betalning i perioden (även de i
 * basnivå-svansen — de räknas i volymen men får bara base_rate_after).
 */
export function computeLedgerRows(
  config: PartnerCommissionConfig,
  customers: CustomerPayment[],
): LedgerRowDraft[] {
  const betalande = customers.filter(c => c.paidExMomsSek > 0)
  const activeCount = betalande.length
  if (activeCount === 0) return []

  const cleanTiers = normalizeTiers(config.tiers)
  const trappberattigade = betalande.filter(c => c.customerMonth <= config.ladderMonths)

  // Bandtilldelning per läge (bara för trappberättigade kunder).
  let bandFor: (c: CustomerPayment) => { rate: number; band: number | null; source: 'tier' | 'legacy_rate' }
  if (!cleanTiers) {
    bandFor = () => ({ rate: config.legacyRate, band: null, source: 'legacy_rate' })
  } else if (config.tierMode === 'marginal') {
    const band = allocateMarginalBands(trappberattigade, cleanTiers)
    bandFor = (c) => {
      const b = band.get(c.businessId)
      return b ? { rate: b.rate, band: b.band, source: 'tier' } : { rate: cleanTiers[0].rate, band: 0, source: 'tier' }
    }
  } else {
    const bok = evaluateBookRate(cleanTiers, activeCount)!
    bandFor = () => ({ rate: bok.rate, band: bok.band, source: 'tier' })
  }

  return betalande.map((c): LedgerRowDraft => {
    let rate: number
    let band: number | null
    let rateSource: LedgerRowDraft['rateSource']

    if (c.customerMonth > config.ladderMonths) {
      rate = config.baseRateAfter
      band = null
      rateSource = 'base_rate'
    } else {
      const b = bandFor(c)
      rate = b.rate
      band = b.band
      rateSource = b.source
    }

    return {
      businessId: c.businessId,
      referralId: c.referralId,
      customerMonth: c.customerMonth,
      baseAmountSek: c.paidExMomsSek,
      rate,
      amountSek: Math.round(c.paidExMomsSek * rate),
      rateSource,
      tierSnapshot: {
        active_count: activeCount,
        tiers: cleanTiers,
        tier_mode: config.tierMode,
        band,
      },
      billingEventIds: c.billingEventIds,
    }
  })
}

/** 'YYYY-MM' för månaden före den givna tidpunkten (default: nu). */
export function previousMonth(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  return d.toISOString().slice(0, 7)
}

/** [start, slut)-gränser i ISO för en 'YYYY-MM'-period. */
export function periodBounds(period: string): { start: string; end: string } {
  const [y, m] = period.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 1))
  return { start: start.toISOString(), end: end.toISOString() }
}
