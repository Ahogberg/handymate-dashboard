import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/onboarding/instant-value
 *
 * Onboardingens "payoff": DETERMINISTISK, synkron sammanfattning av kundens
 * NYSS importerade data — inget cron, ingen agent, inga externa anrop. Detta
 * ger LiveTour (steg 6) den EMOTIONELLA toppen: "Karin har hittat 3 förfallna
 * fakturor värda 45 000 kr", räknat direkt ur databasen.
 *
 * ÄRLIGHET (förtroende-kritiskt): siffrorna speglar exakt vad som finns i
 * datan — inget fabriceras. Vi återanvänder cash-radar-data's status-/fält-
 * konventioner (invoice.status IN ('sent','overdue'), invoice.total) så att
 * payoff-siffrorna matchar det dashboarden senare visar — ingen drift.
 *
 * Snabb (<1s): några count/sum-queries scope:ade på business_id. Ingen skrivning,
 * inga utskick, inga agent-körningar.
 */

type Agent = 'Karin' | 'Hanna' | 'Daniel' | 'Lars' | 'Lisa'

interface Headline {
  agent: Agent
  text: string
  amount_kr?: number
  count?: number
}

interface InstantValue {
  overdue_count: number
  overdue_sum_kr: number
  unpaid_count: number
  unpaid_sum_kr: number
  customer_count: number
  open_deals_count: number
  open_deals_value_kr: number
  headline: Headline
}

function fmt(n: number): string {
  return n.toLocaleString('sv-SE')
}

export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const businessId = business.business_id

  // Obetalda fakturor (samma konvention som cash-radar-data: status IN
  // ('sent','overdue'), belopp = total). Hämtar status+total och summerar i JS
  // så vi får både obetald-total och den förfallna delmängden ur EN query.
  const [invoicesRes, customerRes, dealRows, stagesRes] = await Promise.all([
    supabase
      .from('invoice')
      .select('total, status')
      .eq('business_id', businessId)
      .in('status', ['sent', 'overdue'])
      .limit(5000),
    supabase
      .from('customer')
      .select('customer_id', { count: 'exact', head: true })
      .eq('business_id', businessId),
    supabase
      .from('deal')
      .select('value, stage_id')
      .eq('business_id', businessId)
      .limit(2000),
    supabase
      .from('pipeline_stage')
      .select('id, is_won, is_lost')
      .eq('business_id', businessId),
  ])

  const invoices = invoicesRes.data ?? []
  let overdue_count = 0
  let overdue_sum_kr = 0
  let unpaid_count = 0
  let unpaid_sum_kr = 0
  for (const inv of invoices) {
    const amount = Math.round(Number(inv.total) || 0)
    unpaid_count += 1
    unpaid_sum_kr += amount
    if (inv.status === 'overdue') {
      overdue_count += 1
      overdue_sum_kr += amount
    }
  }

  const customer_count = customerRes.count ?? 0

  // Öppna deals: filtrera bort won/lost via stage-flaggor (samma mönster som
  // cash-radar-data). Billigt — bara två små queries.
  const openStageIds = new Set<string>()
  const closedStageIds = new Set<string>()
  for (const s of stagesRes.data ?? []) {
    if (s.is_won || s.is_lost) closedStageIds.add(String(s.id))
    else openStageIds.add(String(s.id))
  }
  let open_deals_count = 0
  let open_deals_value_kr = 0
  for (const d of dealRows.data ?? []) {
    const stageId = String(d.stage_id)
    // Öppen om stage finns och inte är won/lost. Saknad stage → behandla som stängd (konservativt).
    if (!openStageIds.has(stageId)) continue
    if (closedStageIds.has(stageId)) continue
    open_deals_count += 1
    open_deals_value_kr += Math.round(Number(d.value) || 0)
  }

  const headline = pickHeadline({
    overdue_count,
    overdue_sum_kr,
    unpaid_count,
    unpaid_sum_kr,
    customer_count,
    open_deals_count,
    open_deals_value_kr,
  })

  const result: InstantValue = {
    overdue_count,
    overdue_sum_kr,
    unpaid_count,
    unpaid_sum_kr,
    customer_count,
    open_deals_count,
    open_deals_value_kr,
    headline,
  }
  return NextResponse.json(result)
}

/**
 * Väljer det STARKASTE ÄRLIGA fyndet. Prioritet (ordningen är själva pengar-
 * dramaturgin):
 *   1. Förfallna fakturor  → Karin (starkast: akuta pengar att jaga)
 *   2. Obetalda fakturor   → Karin (pengar på väg in att bevaka)
 *   3. Öppna affärer        → Daniel (offerter att följa upp)
 *   4. Kunder importerade   → Hanna (redo att jobba)
 *   5. Tomt (skippad import) → mjuk default, aldrig fabricerat
 */
function pickHeadline(v: Omit<InstantValue, 'headline'>): Headline {
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
