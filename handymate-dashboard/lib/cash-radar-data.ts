/**
 * Pengar in-radarn — serverns datalager (spec: tasks/cash-radar-spec.md).
 *
 * Delas av GET /api/dashboard/cash-radar och måndagsbriefen — EN sanning,
 * ingen drift. Hämtar rådata (fakturor, deals, stages) och kör den rena
 * projektionsmotorn i lib/cash-radar.ts. Inga nya tabeller.
 *
 * Åtgärdslistan (v1-enkelhet): EN delad lista (max 3, sorterad på belopp,
 * fallande) fästs vid varje dipp — inte per-vecka-matchad. Kandidater:
 *   - remind_invoice  — obetald faktura (påminnelse via befintlig gated väg)
 *   - nudge_quote     — öppen deal i quote_sent med kopplad offert (skapar
 *                       quote_nudge-förslag; already_pending om ett öppet
 *                       förslag redan finns för offerten)
 *   - wake_customer   — statisk länk till Att godkänna (räknas ej mot de 3)
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  medianDelayDays,
  weeklyNormal,
  projectInflows,
  detectDips,
  type RadarWeek,
} from './cash-radar'

/** Historikfönster för betalda fakturor (dagar). */
const HISTORY_DAYS = 180

/** Åtgärd med belopp — sorteras fallande, max 3 per dipp. */
type AmountAction =
  | { type: 'remind_invoice'; invoice_id: string; invoice_number: string | null; amount: number }
  | { type: 'nudge_quote'; quote_id: string; title: string | null; amount: number; already_pending: boolean }

export type RadarAction = AmountAction | { type: 'wake_customer'; link: string }

export interface RadarDipWithActions {
  week_start: string
  expected_kr: number
  actions: RadarAction[]
}

export interface CashRadarResult {
  ready: boolean
  normal_kr: number
  weeks: RadarWeek[]
  dips: RadarDipWithActions[]
}

/**
 * Bygger hela radar-underlaget för ett företag:
 * median-försening + veckonormal ur 180 dagars betalda fakturor,
 * projektion av obetalda fakturor + viktad pipeline-potential,
 * dipp-detektion mot normalen, samt åtgärdsförslag per dipp.
 */
export async function assembleCashRadar(
  supabase: SupabaseClient,
  businessId: string
): Promise<CashRadarResult> {
  const nowMs = Date.now()
  const sinceIso = new Date(nowMs - HISTORY_DAYS * 24 * 3600_000).toISOString()

  // 1–3. Betalda fakturor, obetalda fakturor och pipeline-stages parallellt.
  const [paidRes, unpaidRes, stagesRes] = await Promise.all([
    supabase
      .from('invoice')
      .select('total, due_date, paid_at')
      .eq('business_id', businessId)
      .eq('status', 'paid')
      .not('paid_at', 'is', null)
      .gte('paid_at', sinceIso)
      .limit(2000),
    supabase
      .from('invoice')
      .select('invoice_id, invoice_number, total, due_date, customer_id')
      .eq('business_id', businessId)
      .in('status', ['sent', 'overdue'])
      .limit(1000),
    supabase
      .from('pipeline_stage')
      .select('id, slug, is_won, is_lost')
      .eq('business_id', businessId),
  ])

  const paidRows = paidRes.data || []

  // Median-försening: endast rader MED due_date (annars går förseningen inte att mäta).
  const medianDelay = medianDelayDays(
    paidRows
      .filter(r => r.due_date && r.paid_at)
      .map(r => ({ due_date: String(r.due_date), paid_at: String(r.paid_at) }))
  )

  // Veckonormal: median av veckosummor (cold start-gate ligger i motorn).
  const normal = weeklyNormal(
    paidRows.map(r => ({ paid_at: String(r.paid_at), total: Number(r.total) || 0 })),
    nowMs
  )

  const unpaid = unpaidRes.data || []

  // 3. Öppna deals: mappa stage_id → slug och filtrera bort won/lost.
  const stageById = new Map<string, { slug: string; is_won: boolean; is_lost: boolean }>()
  for (const s of stagesRes.data || []) {
    stageById.set(String(s.id), { slug: String(s.slug), is_won: !!s.is_won, is_lost: !!s.is_lost })
  }

  const { data: dealRows } = await supabase
    .from('deal')
    .select('id, value, stage_id, expected_close_date, quote_id, customer_id, title')
    .eq('business_id', businessId)
    .limit(1000)

  const openDeals: Array<{
    id: string
    value: number
    stageSlug: string
    expected_close_date: string | null
    quote_id: string | null
    title: string | null
  }> = []
  for (const d of dealRows || []) {
    const stage = stageById.get(String(d.stage_id))
    if (!stage || stage.is_won || stage.is_lost) continue
    openDeals.push({
      id: String(d.id),
      value: Number(d.value) || 0,
      stageSlug: stage.slug,
      expected_close_date: (d.expected_close_date as string | null) || null,
      quote_id: (d.quote_id as string | null) || null,
      title: (d.title as string | null) || null,
    })
  }

  // 4. Projektion + dipp-detektion.
  const weeks = projectInflows({
    unpaidInvoices: unpaid.map(i => ({
      invoice_id: String(i.invoice_id),
      total: Number(i.total) || 0,
      due_date: (i.due_date as string | null) || null,
    })),
    openDeals,
    medianDelay,
    nowMs,
  })
  const dips = detectDips(weeks, normal.normal_kr)

  // 5. Åtgärder — bara när det finns dippar att åtgärda (sparar en query annars).
  let actions: RadarAction[] = []
  if (dips.length > 0) {
    // Dedup-flagga: öppna quote_nudge-förslag → set av quote_id (JS-set,
    // samma mönster som Hanna — slipper JSON-path-in per deal).
    const pendingQuoteIds = new Set<string>()
    const { data: pendingNudges } = await supabase
      .from('pending_approvals')
      .select('payload')
      .eq('business_id', businessId)
      .eq('approval_type', 'quote_nudge')
      .eq('status', 'pending')
      .limit(500)
    for (const p of pendingNudges || []) {
      const qid = (p.payload as Record<string, unknown> | null)?.quote_id
      if (qid) pendingQuoteIds.add(String(qid))
    }

    const candidates: AmountAction[] = []
    for (const inv of unpaid) {
      const amount = Math.round(Number(inv.total) || 0)
      if (!(amount > 0)) continue
      candidates.push({
        type: 'remind_invoice',
        invoice_id: String(inv.invoice_id),
        invoice_number: (inv.invoice_number as string | null) || null,
        amount,
      })
    }
    for (const deal of openDeals) {
      if (deal.stageSlug !== 'quote_sent' || !deal.quote_id) continue
      candidates.push({
        type: 'nudge_quote',
        quote_id: deal.quote_id,
        title: deal.title,
        amount: Math.round(deal.value),
        already_pending: pendingQuoteIds.has(deal.quote_id),
      })
    }
    candidates.sort((a, b) => b.amount - a.amount)
    actions = [...candidates.slice(0, 3), { type: 'wake_customer', link: '/dashboard/approvals' }]
  }

  return {
    ready: normal.ready,
    normal_kr: normal.normal_kr,
    weeks,
    dips: dips.map(d => ({ week_start: d.week_start, expected_kr: d.expected_kr, actions })),
  }
}
