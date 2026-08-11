import type { SupabaseClient } from '@supabase/supabase-js'
import type { QuoteItem } from '@/lib/types/quote'
import { calculateQuoteMargin } from '@/lib/quotes/margin'

/**
 * Förväntad marginal vid accept (2026-08-12).
 *
 * calculateQuoteMargin() (lib/quotes/margin.ts) räknar bara i UI:t medan
 * offerten byggs — siffran kastas bort i samma sekund kunden accepterar.
 * Den här filen fryser den siffran på quotes.expected_margin_snapshot i
 * accept-ögonblicket, så en hantverkare senare kan svara på "vad trodde jag
 * att jag skulle tjäna på det här?" (jämfört med efterkalkylens facit).
 *
 * KRITISKT: kolumnen `quotes.expected_margin_snapshot` skapas av
 * sql/v120_expected_margin_snapshot.sql, som körs manuellt EFTER att den
 * här koden deployats. Skrivningen nedan måste därför tåla att kolumnen
 * INTE finns än (Postgres 42703) — den loggar och ger upp, kastar aldrig.
 * En accept ska aldrig kunna blockeras av en marginal-snapshot.
 */

export type MarginSnapshotBasis = 'manual_accept' | 'portal_accept' | 'signed'

export interface ExpectedMarginSnapshot {
  margin_kr: number
  margin_pct: number | null
  known_revenue: number
  known_cost: number
  is_partial: boolean
  rows_with_cost: number
  rows_without_cost: number
  computed_at: string
  basis: MarginSnapshotBasis
}

/** Ren funktion — bygger snapshot-payloaden från offertraderna. */
export function buildExpectedMarginSnapshot(
  items: QuoteItem[],
  basis: MarginSnapshotBasis,
): ExpectedMarginSnapshot {
  const margin = calculateQuoteMargin(items)
  return {
    margin_kr: margin.contribution,
    margin_pct: margin.marginPercent,
    known_revenue: margin.knownRevenue,
    known_cost: margin.knownCost,
    is_partial: margin.isPartial,
    rows_with_cost: margin.rowsWithCost,
    rows_without_cost: margin.rowsWithoutCost,
    computed_at: new Date().toISOString(),
    basis,
  }
}

/**
 * Fire-and-forget: läser offertens rader, bygger snapshot, skriver den —
 * ALLT i try/catch. Skriver aldrig över en befintlig snapshot (första
 * accepten vinner, t.ex. om både portal- och manual-accept-vägen triggas).
 * Loggar bara vid fel — kastar ALDRIG. Anropas alltid EFTER att själva
 * accept-uppdateringen redan lyckats, aldrig blockerande för den.
 */
export async function captureExpectedMarginSnapshot(
  supabase: SupabaseClient,
  businessId: string,
  quoteId: string,
  basis: MarginSnapshotBasis,
): Promise<void> {
  try {
    const { data: existing, error: existingErr } = await supabase
      .from('quotes')
      .select('expected_margin_snapshot')
      .eq('quote_id', quoteId)
      .eq('business_id', businessId)
      .maybeSingle()

    if (existingErr) {
      console.warn('[margin-snapshot] kunde inte läsa befintlig snapshot (icke-blockerande):', existingErr.message)
      return
    }
    if (existing?.expected_margin_snapshot) {
      // Redan fryst — första accepten vinner.
      return
    }

    // Ingen business_id-filtrering här — quote_items nås alltid via sitt
    // quote_id (samma mönster som app/api/quotes/route.ts), quote_id är
    // redan verifierat höra till businessId ovan.
    const { data: items, error: itemsErr } = await supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', quoteId)

    if (itemsErr) {
      console.warn('[margin-snapshot] kunde inte läsa quote_items (icke-blockerande):', itemsErr.message)
      return
    }

    const snapshot = buildExpectedMarginSnapshot((items || []) as QuoteItem[], basis)

    const { error: updateErr } = await supabase
      .from('quotes')
      .update({ expected_margin_snapshot: snapshot })
      .eq('quote_id', quoteId)
      .eq('business_id', businessId)

    if (updateErr) {
      // Förväntat fel innan v120 körts: kolumnen finns inte än (42703).
      console.warn('[margin-snapshot] kunde inte spara snapshot (icke-blockerande, väntat innan v120 körts):', updateErr.message)
    }
  } catch (err) {
    console.warn('[margin-snapshot] oväntat fel vid snapshot-fångst (icke-blockerande):', err)
  }
}
