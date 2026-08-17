/**
 * Reaktiverings-signal ("Låt Matte väga in det" — narrow slice av
 * Mission-Control-förslaget, tasks/jaunty-pondering-hummingbird.md).
 *
 * Ingen ny tabell, ingen ny tyst-kund-definition: kandidaterna kommer rakt
 * av från den delade primitiven i lib/customers/quiet-customer.ts
 * (fetchQuietCustomers, HANNA_OUTBOUND_QUIET_DAYS — samma tröskel som
 * Hannas befintliga reaktiveringsflöde i lib/agents/hanna-outbound.ts).
 * Den här filen lägger bara till EN gruppering ovanpå: senaste projektets
 * job_type per tyst kund, räknat och sorterat, så att ett kort kan säga
 * "N tidigare X-kunder" i stället för en odifferentierad siffra.
 *
 * Kunder utan job_type på sitt senaste projekt exkluderas helt från
 * grupperingen — ingen "övrigt"-hink som kan vilseleda om vad gruppen
 * faktiskt är.
 *
 * Rena delen (gruppering/räkning/filtrering/sortering) är utbruten som
 * groupByJobType — samma pure/IO-uppdelning som summarizeByPattern i
 * lib/playbook/checkpoint-outcomes.ts, facit-testas utan mock-DB i
 * tests/reactivation-signal.spec.ts.
 *
 * Fail-safe genomgående, samma konvention som fetchQuietCustomers: kastar
 * aldrig, degraderar till tom lista vid vilket DB-fel som helst.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchQuietCustomers, HANNA_OUTBOUND_QUIET_DAYS } from '@/lib/customers/quiet-customer'

export interface ReactivationJobTypeGroup {
  job_type: string
  count: number
}

/**
 * Minsta antal kunder för att ett jobbtyp-grupp ska räknas som en riktig
 * signal — "hellre missa än gissa": 2-3 kunder är inte ett mönster värt
 * att lyfta fram som ett agenttips.
 */
export const MIN_REACTIVATION_GROUP_SIZE = 5

/**
 * Ren funktion, ingen I/O. Grupperar redan uppslagna (kund → senaste
 * job_type)-poster till räknade, filtrerade, fallande sorterade grupper.
 * Vid oavgjort count behålls insättningsordningen (Array.sort är stabil).
 */
export function groupByJobType(entries: { job_type: string }[]): ReactivationJobTypeGroup[] {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    counts.set(entry.job_type, (counts.get(entry.job_type) || 0) + 1)
  }

  const groups: ReactivationJobTypeGroup[] = Array.from(counts.entries())
    .filter(([, count]) => count >= MIN_REACTIVATION_GROUP_SIZE)
    .map(([job_type, count]) => ({ job_type, count }))

  return groups.sort((a, b) => b.count - a.count)
}

/**
 * Hämtar tysta tidigare kunder (delad primitiv), slår upp senaste
 * projektets job_type per kund i EN batchad query (samma queryform som
 * lib/agents/hanna/capacity-fill.ts:538-553 och lib/agents/hanna-outbound.ts
 * använder per kund — här batchad över hela poolen eftersom vi behöver ALLA
 * tysta kunders senaste jobbtyp för en global gruppering, inte bara ett
 * fåtal redan valda kandidater), och grupperar med groupByJobType.
 *
 * Kastar aldrig — DB-fel i något steg ger tom lista.
 */
export async function summarizeQuietCustomersByJobType(
  supabase: SupabaseClient,
  businessId: string,
  opts: { thresholdDays?: number; now?: Date } = {},
): Promise<ReactivationJobTypeGroup[]> {
  try {
    const quietCustomers = await fetchQuietCustomers(supabase, businessId, {
      thresholdDays: opts.thresholdDays ?? HANNA_OUTBOUND_QUIET_DAYS,
      limit: 500,
      now: opts.now,
    })
    if (quietCustomers.length === 0) return []

    const customerIds = quietCustomers.map(c => c.customer_id)
    const { data, error } = await supabase
      .from('project')
      .select('customer_id, job_type, created_at')
      .eq('business_id', businessId)
      .in('customer_id', customerIds)
      .not('job_type', 'is', null)
    if (error) {
      console.warn('[reactivation-signal] projektquery misslyckades (tom lista):', error.message)
      return []
    }

    // Senaste projektet (störst created_at) vinner per kund.
    const latestByCustomer = new Map<string, { job_type: string; created_at: string }>()
    for (const row of (data || []) as Array<{ customer_id: string; job_type: string; created_at: string }>) {
      const existing = latestByCustomer.get(row.customer_id)
      if (!existing || new Date(row.created_at).getTime() > new Date(existing.created_at).getTime()) {
        latestByCustomer.set(row.customer_id, { job_type: row.job_type, created_at: row.created_at })
      }
    }

    const entries = Array.from(latestByCustomer.values()).map(v => ({ job_type: v.job_type }))
    return groupByJobType(entries)
  } catch (err: any) {
    console.warn('[reactivation-signal] oväntat fel (tom lista):', err?.message || err)
    return []
  }
}
