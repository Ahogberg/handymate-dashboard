import type { SupabaseClient } from '@supabase/supabase-js'
import { DEMO_QUOTE_BUSINESS_ID, DEMO_QUOTE_VALID_DAYS } from '@/lib/demo/demo-quote'

/**
 * Städning av demo-offerten (yta 9, 2026-09-08). Körs från underhålls-
 * cronen en gång per dygn.
 *
 * All logik ligger i SQL-funktionen demo_quote_cleanup (sql/v223): den
 * vägrar på företag som inte är markerade is_demo_tenant, och raderar i
 * FK-säker ordning. Här bara anropet + ett svar som cronen kan logga.
 *
 * Livslängd = offertens giltighetstid. Efter det finns inget kvar för
 * besökaren att öppna, och personuppgifterna (namn, mobil) ska bort.
 */
export const DEMO_QUOTE_RETENTION_DAYS = DEMO_QUOTE_VALID_DAYS

export interface DemoQuoteCleanupResult {
  customers: number
  quotes: number
  projects: number
  deals: number
  cutoff: string
}

export async function stadaDemoOfferter(
  supabase: SupabaseClient,
  olderThanDays: number = DEMO_QUOTE_RETENTION_DAYS,
): Promise<DemoQuoteCleanupResult> {
  const { data, error } = await supabase.rpc('demo_quote_cleanup', {
    p_business_id: DEMO_QUOTE_BUSINESS_ID,
    p_older_than_days: olderThanDays,
  })
  if (error) throw new Error(`demo_quote_cleanup: ${error.message}`)

  const r = (data ?? {}) as Partial<DemoQuoteCleanupResult>
  const result: DemoQuoteCleanupResult = {
    customers: Number(r.customers ?? 0),
    quotes: Number(r.quotes ?? 0),
    projects: Number(r.projects ?? 0),
    deals: Number(r.deals ?? 0),
    cutoff: String(r.cutoff ?? ''),
  }
  if (result.customers > 0) {
    console.log(`[demo-quote] städade ${result.customers} demo-besökare (${result.quotes} offerter, ${result.projects} projekt, ${result.deals} affärer)`)
  }
  return result
}
