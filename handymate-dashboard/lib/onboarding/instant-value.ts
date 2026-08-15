/**
 * Instant-value — ren beräkningsmotor för onboardingens payoff ("Karins krona-fynd").
 *
 * Deterministisk, synkron sammanfattning av kundens NYSS importerade data. Ingen
 * DB, inga externa anrop, inga sidoeffekter → enhetstestbar (tests/facit-instant-
 * value.spec.ts). API-rutten (app/api/onboarding/instant-value/route.ts) gör bara
 * queries och matar in raderna hit.
 *
 * ÄRLIGHET (förtroende-kritiskt): siffrorna speglar exakt vad som finns i datan —
 * inget fabriceras. Samma status-/fältkonventioner som cash-radarn
 * (invoice.status IN ('sent','overdue'), belopp = invoice.total) så payoff-
 * siffrorna matchar det dashboarden senare visar — ingen drift.
 */

export type InstantAgent = 'Karin' | 'Hanna' | 'Daniel' | 'Lars' | 'Lisa'

export interface InstantHeadline {
  agent: InstantAgent
  text: string
  amount_kr?: number
  count?: number
}

export interface InstantValue {
  overdue_count: number
  overdue_sum_kr: number
  unpaid_count: number
  unpaid_sum_kr: number
  customer_count: number
  open_deals_count: number
  open_deals_value_kr: number
  /**
   * 90-dagarsgenomgången (2026-08-08): rena ANTAL för checklistan efter
   * import — "87 offerter analyserade ✓". Bara counts, ingen AI-väntan i
   * onboardingflödet; noll är ett giltigt svar och animeras inte bort.
   */
  quotes_analyzed: number
  projects_analyzed: number
  invoices_analyzed: number
  /**
   * Betald fakturahistorik (2026-08-15, Fortnox-historik-widening) — en
   * STÖDJANDE statistik, tävlar ALDRIG om headline-platsen (se pickHeadline).
   * `null` om inga betalda fakturor finns — visas då inte alls, aldrig som
   * "0 kr sedan okänt datum".
   */
  historical_revenue: { count: number; sum_kr: number; since_date: string } | null
  headline: InstantHeadline
}

/** Fakturarad som beräkningen bryr sig om (övriga kolumner ignoreras). */
export interface InstantInvoiceRow {
  total: number | string | null
  status: string | null
}

/** Deal-rad (öppen/stängd avgörs via stage-flaggorna nedan). */
export interface InstantDealRow {
  value: number | string | null
  stage_id: string | number | null
}

/** Pipeline-stage med won/lost-flaggor (samma mönster som cash-radar-data). */
export interface InstantStageRow {
  id: string | number
  is_won?: boolean | null
  is_lost?: boolean | null
}

export function fmt(n: number): string {
  return n.toLocaleString('sv-SE')
}

/**
 * Räknar samman payoff-siffrorna ur importerade rader.
 *
 * - Obetalda fakturor = status IN ('sent','overdue') (filtreras defensivt här
 *   även om rutten redan filtrerar i queryn → funktionen är robust och testbar
 *   med blandad indata). Förfallna = delmängden med status 'overdue'.
 * - Öppna deals = stage finns bland stages OCH är varken won eller lost. Saknad
 *   eller stängd stage → exkluderas (konservativt, undviker överskattning).
 * - Belopp rundas till heltal kronor (matchar cash-radarns heltalskonvention).
 */
/** Betald fakturarad ur historik-pullen — bara det beräkningen bryr sig om. */
export interface InstantPaidInvoiceRow {
  total: number | string | null
  invoice_date: string | null
}

export function computeInstantValue(input: {
  invoices: InstantInvoiceRow[]
  customerCount: number
  deals: InstantDealRow[]
  stages: InstantStageRow[]
  /** 90-dagarsgenomgångens counts — valfria så befintliga anropare står orörda. */
  quotesAnalyzed?: number
  projectsAnalyzed?: number
  invoicesAnalyzed?: number
  /** Betalda fakturor (historik) — valfri, utelämnad/tom ger historical_revenue: null. */
  paidInvoices?: InstantPaidInvoiceRow[]
}): InstantValue {
  let overdue_count = 0
  let overdue_sum_kr = 0
  let unpaid_count = 0
  let unpaid_sum_kr = 0

  for (const inv of input.invoices) {
    if (inv.status !== 'sent' && inv.status !== 'overdue') continue
    const amount = Math.round(Number(inv.total) || 0)
    unpaid_count += 1
    unpaid_sum_kr += amount
    if (inv.status === 'overdue') {
      overdue_count += 1
      overdue_sum_kr += amount
    }
  }

  const customer_count = Math.max(0, Math.round(input.customerCount || 0))

  // Öppna/stängda stage-id:n via won/lost-flaggor.
  const openStageIds = new Set<string>()
  const closedStageIds = new Set<string>()
  for (const s of input.stages) {
    if (s.is_won || s.is_lost) closedStageIds.add(String(s.id))
    else openStageIds.add(String(s.id))
  }

  let open_deals_count = 0
  let open_deals_value_kr = 0
  for (const d of input.deals) {
    const stageId = String(d.stage_id)
    if (!openStageIds.has(stageId)) continue
    if (closedStageIds.has(stageId)) continue
    open_deals_count += 1
    open_deals_value_kr += Math.round(Number(d.value) || 0)
  }

  const base = {
    overdue_count,
    overdue_sum_kr,
    unpaid_count,
    unpaid_sum_kr,
    customer_count,
    open_deals_count,
    open_deals_value_kr,
  }

  // Historisk omsättning — stödjande statistik, räknas EFTER base/headline
  // och påverkar aldrig pickHeadline (den ser bara `base`).
  let historical_revenue: InstantValue['historical_revenue'] = null
  const paidInvoices = input.paidInvoices ?? []
  if (paidInvoices.length > 0) {
    const sum_kr = paidInvoices.reduce((s, i) => s + Math.round(Number(i.total) || 0), 0)
    const dates = paidInvoices
      .map(i => i.invoice_date)
      .filter((d): d is string => !!d)
      .sort()
    historical_revenue = {
      count: paidInvoices.length,
      sum_kr,
      since_date: dates[0] ?? '',
    }
  }

  return {
    ...base,
    quotes_analyzed: Math.max(0, Math.round(input.quotesAnalyzed ?? 0)),
    projects_analyzed: Math.max(0, Math.round(input.projectsAnalyzed ?? 0)),
    invoices_analyzed: Math.max(0, Math.round(input.invoicesAnalyzed ?? input.invoices.length)),
    historical_revenue,
    headline: pickHeadline(base),
  }
}

/**
 * Väljer det STARKASTE ÄRLIGA fyndet. Prioritet (ordningen är själva pengar-
 * dramaturgin):
 *   1. Förfallna fakturor  → Karin (starkast: akuta pengar att jaga)
 *   2. Obetalda fakturor   → Karin (pengar på väg in att bevaka)
 *   3. Öppna affärer        → Daniel (offerter att följa upp)
 *   4. Kunder importerade   → Hanna (redo att jobba)
 *   5. Tomt (skippad import) → Lisa, mjuk default, aldrig fabricerat
 */
export function pickHeadline(v: Omit<InstantValue, 'headline' | 'quotes_analyzed' | 'projects_analyzed' | 'invoices_analyzed' | 'historical_revenue'>): InstantHeadline {
  if (v.overdue_count > 0) {
    return {
      agent: 'Karin',
      text: `Karin har hittat ${v.overdue_count} förfallna fakturor värda ${fmt(v.overdue_sum_kr)} kr`,
      amount_kr: v.overdue_sum_kr,
      count: v.overdue_count,
    }
  }
  if (v.unpaid_count > 0) {
    return {
      agent: 'Karin',
      text: `Karin bevakar ${v.unpaid_count} obetalda fakturor värda ${fmt(v.unpaid_sum_kr)} kr`,
      amount_kr: v.unpaid_sum_kr,
      count: v.unpaid_count,
    }
  }
  if (v.open_deals_count > 0) {
    return {
      agent: 'Daniel',
      text: `Daniel följer upp ${v.open_deals_count} öppna affärer`,
      amount_kr: v.open_deals_value_kr > 0 ? v.open_deals_value_kr : undefined,
      count: v.open_deals_count,
    }
  }
  if (v.customer_count > 0) {
    return {
      agent: 'Hanna',
      text: `${fmt(v.customer_count)} kunder redo — dina AI-kollegor är på plats`,
      count: v.customer_count,
    }
  }
  return {
    agent: 'Lisa',
    text: 'Ditt AI-team är redo — lägg till kunder så börjar de jobba',
  }
}
