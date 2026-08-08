/**
 * Kostnadsboken — skrivsidan (COGS-mätaren, 2026-08-08).
 *
 * ═══ FAIL-SOFT ÄR ETT KRAV, INTE EN BEKVÄMLIGHET ═══
 *
 * `recordCost` kastar aldrig och blockerar aldrig. En mätare får under inga
 * omständigheter fälla det den mäter: att ett SMS till en kund inte skickas
 * för att en kostnadsrad inte kunde skrivas vore att byta en riktig affär mot
 * en bokföringspost. Fel loggas och sväljs.
 *
 * Det är också därför tabellen är APPEND-ONLY och HÄRLEDD. Den är aldrig
 * auktoritativ för kvot, feature-gate eller fakturering — går den sönder
 * tappar vi insikt, inte pengar.
 *
 * ═══ ENHETERNA PER RESURSSLAG ═══
 *
 *   sms       units = SMS-DELAR (inte meddelanden). Ett långt SMS är flera
 *             delar och kostar flera gånger. Kundens kvot drar 1 — den
 *             diskrepansen är avsiktlig och hör till prissättningen.
 *   call_out  units = DEBITERBARA MINUTER (påbörjad minut räknas hel).
 *   whisper   units = SEKUNDER ljud.
 *   llm       units = TOTALA TOKENS (in + ut + cache).
 *
 * ═══ VALUTA ═══
 *
 * `costOre` är alltid heltal öre i SEK. Kommer kostnaden från en USD-källa
 * ska den passera `usdToOre` i lib/costs/meter.ts — den är enda tillåtna
 * valutabryggan, och facit kontrollerar att ingen anropare skickar dollar hit.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { PRICE_VERSION } from './price-list'

export type CostResource = 'sms' | 'call_out' | 'whisper' | 'llm'

export interface RecordCostArgs {
  supabase: SupabaseClient
  businessId: string
  resource: CostResource
  units: number
  /** Heltal öre, SEK. Se valutanoten ovan. */
  costOre: number
  priceVersion?: string
  /** Vad som kostade: 'sms_log' | 'call_recording' | 'agent_run' … */
  refType?: string
  refId?: string
  meta?: Record<string, unknown>
}

/**
 * Bokför en kostnadshändelse. Returnerar inget och kastar aldrig — anroparen
 * ska inte kunna bry sig om utfallet, för då blir mätningen en risk.
 */
export async function recordCost(args: RecordCostArgs): Promise<void> {
  const { supabase, businessId, resource, units, costOre } = args

  try {
    if (!businessId) {
      console.warn('[cost] recordCost utan business_id — hoppar över')
      return
    }

    // Negativ kostnad finns inte, och en avrundad float i en heltalskolumn
    // blir ett tyst PostgREST-fel. Städa här i stället.
    const öre = Math.max(0, Math.round(costOre || 0))

    const { error } = await supabase.from('cost_event').insert({
      id: 'cost_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10),
      business_id: businessId,
      resource,
      units: Math.max(0, units || 0),
      cost_ore: öre,
      price_version: args.priceVersion || PRICE_VERSION,
      ref_type: args.refType || null,
      ref_id: args.refId || null,
      meta: args.meta || {},
      created_at: new Date().toISOString(),
    })

    if (error) {
      // Vanligaste orsaken första gången: v100-migrationen är inte körd.
      console.warn(`[cost] kunde inte bokföra ${resource} för ${businessId}: ${error.message}`)
    }
  } catch (err: any) {
    console.warn(`[cost] recordCost kastade (sväljs): ${err?.message || err}`)
  }
}
