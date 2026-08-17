import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { buildPengarSummary, type OverdueInvoice } from '@/lib/value/pengar-pa-bordet'
import { getWeekCapacity, currentWeekMonday } from '@/lib/capacity/week-capacity'
import { svDateStrPlusDays } from '@/lib/dates'
import { summarizeQuietCustomersByJobType } from '@/lib/customers/reactivation-signal'
import { HANNA_OUTBOUND_QUIET_DAYS, QUIET_MONTH_DAYS } from '@/lib/customers/quiet-customer'
import { composeSuggestions, type ComposeSuggestionsInput } from '@/lib/mission/suggestions'
import { arTestId } from '@/lib/testdata'

export const dynamic = 'force-dynamic'

/**
 * GET /api/mission/suggestions — Uppdragsradens tre möjliga chips
 * (Goal-to-Plan V1, Etapp C, tasks/jaunty-pondering-hummingbird.md).
 *
 * Komponerar tre KÄLLOR server-side (en klienthämtning i stället för tre):
 * förfallet/marginalrisk ur samma väg som app/api/dashboard/pengar
 * (buildPengarSummary, fast med bara de två billiga frågorna — offert-/
 * fakturasvepet som de andra kategorierna behöver hämtas inte här),
 * kapacitet NÄSTA vecka (lib/capacity/week-capacity.ts), och toppgruppen ur
 * reaktiveringssignalen (samma som app/api/jarvis/reactivation-signal).
 *
 * Var källa är fail-soft VAR FÖR SIG: en trasig läsning ger `null` för just
 * den signalen (composeSuggestions hittar då inte på det chippet) — den
 * drar aldrig ner de andra två källorna med sig.
 *
 * Rollgrind som value/ledger (Etapp D-härdning): chipsen bygger på förfallna
 * belopp och marginalrisk — samma finansiella känslighet — ägare/admin
 * (tests/permission-contract.spec.ts). JarvisHome.tsx döljer hela
 * Uppdragsrad på 403 (missionSurfaceAllowed), inte bara chipsen.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id

    const [pengar, capacity, reactivation] = await Promise.all([
      loadPengarSignal(supabase, businessId),
      loadCapacitySignal(supabase, businessId),
      loadReactivationSignal(supabase, businessId),
    ])

    const input: ComposeSuggestionsInput = { pengar, capacity, reactivation }
    return NextResponse.json({ suggestions: composeSuggestions(input) })
  } catch (error: any) {
    console.error('GET /api/mission/suggestions error:', error)
    return NextResponse.json({ suggestions: [] })
  }
}

async function loadPengarSignal(
  supabase: ReturnType<typeof getServerSupabase>,
  businessId: string,
): Promise<ComposeSuggestionsInput['pengar']> {
  try {
    const idag = new Date().toISOString().split('T')[0]
    const [overdueRes, marginRes] = await Promise.all([
      supabase
        .from('invoice')
        .select('invoice_id, total, customer_pays, rot_rut_type')
        .eq('business_id', businessId)
        .in('status', ['sent', 'overdue'])
        .lt('due_date', idag),
      supabase
        .from('pending_approvals')
        .select('payload')
        .eq('business_id', businessId)
        .eq('approval_type', 'profitability_warning')
        .eq('status', 'pending'),
    ])
    if (overdueRes.error) throw new Error(overdueRes.error.message)
    if (marginRes.error) throw new Error(marginRes.error.message)

    const riktigaForfallna = (overdueRes.data ?? []).filter((i: any) => !arTestId(i.invoice_id))
    const overrun = (p: unknown): number => {
      const v = (p as Record<string, unknown> | null)?.projected_overrun
      return typeof v === 'number' ? v : 0
    }

    const summary = buildPengarSummary({
      staleQuotes: [],
      missedRevenue: [],
      overdueInvoices: riktigaForfallna as OverdueInvoice[],
      marginOverruns: (marginRes.data ?? []).map(r => overrun(r.payload)),
      ataEstimates: [],
    })

    const forfallet = summary.kategorier.find(k => k.key === 'forfallet')
    const marginalrisk = summary.kategorier.find(k => k.key === 'marginalrisk')
    return {
      forfallet_kr: forfallet?.summaKr ?? 0,
      marginalrisk_count: marginalrisk?.antal ?? 0,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[mission-suggestions] pengar-källan kunde inte läsas:', msg)
    return null
  }
}

async function loadCapacitySignal(
  supabase: ReturnType<typeof getServerSupabase>,
  businessId: string,
): Promise<ComposeSuggestionsInput['capacity']> {
  try {
    const nextWeekStart = svDateStrPlusDays(7, new Date(`${currentWeekMonday()}T12:00:00Z`))
    const capacity = await getWeekCapacity(supabase, businessId, nextWeekStart)
    return {
      thin: Boolean(capacity.thin_week),
      configured: capacity.source === 'settings',
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[mission-suggestions] kapacitets-källan kunde inte läsas:', msg)
    return null
  }
}

async function loadReactivationSignal(
  supabase: ReturnType<typeof getServerSupabase>,
  businessId: string,
): Promise<ComposeSuggestionsInput['reactivation']> {
  try {
    const groups = await summarizeQuietCustomersByJobType(supabase, businessId, {
      thresholdDays: HANNA_OUTBOUND_QUIET_DAYS,
    })
    const top = groups[0]
    if (!top) return null
    return {
      job_type: top.job_type,
      count: top.count,
      quietMonths: Math.round(HANNA_OUTBOUND_QUIET_DAYS / QUIET_MONTH_DAYS),
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[mission-suggestions] återaktiverings-källan kunde inte läsas:', msg)
    return null
  }
}
