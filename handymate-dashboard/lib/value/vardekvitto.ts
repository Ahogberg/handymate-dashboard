/**
 * Värdekvittot natt 1 (Tur 4 etapp 7, VP4/VP5 första steget) — månadens
 * ärliga kronor som REN BERÄKNING. Inga migrationer, inga utskick, ingen
 * lagring: posten räknas fram ur samma attributionskärna som veckovärdet
 * (lib/value/recovered-revenue.ts), bara med kalendermånad i stället för
 * rullande dagar.
 *
 * ═══ DE FYRA ÄRLIGHETSREGLERNA (facit i tests/vardekvitto.spec.ts) ═══
 *
 * 1. INGEN SCHABLON når confirmed_kr. Bekräftat är enbart verifierade
 *    händelser med verkligt belopp — en bokning är en händelse, inte en
 *    krona, och lead-schabloner existerar inte här.
 * 2. En intäkt attribueras EN gång, även över månadsgräns: händelsen hör
 *    till den månad den INTRÄFFADE, aldrig till kortets månad — så ett kort
 *    godkänt i juli som ger en accepterad offert 1 augusti räknas i augusti,
 *    och bara där.
 * 3. Tom månad är en ÄRLIG NOLLA — aldrig null, aldrig en gissning.
 * 4. Potential och bekräftat är SEPARATA: potential_kr (vilande, ur
 *    lib/value/pengar-pa-bordet.ts — ingen ny kategori, ingen ny krona)
 *    summeras ALDRIG in i confirmed_kr. null betyder "inte läst här"
 *    (t.ex. när ytan redan bär pengar-datat) — aldrig en påhittad nolla.
 *
 * Posten är OFÖRÄNDERLIG (Object.freeze) — ett kvitto skrivs, det redigeras
 * inte. method_version stämplar beräkningsmetoden så en framtida regeländring
 * aldrig tyst skriver om historien.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getRecoveredRevenue,
  sumRecoveredKr,
  type Attribution,
} from '@/lib/value/recovered-revenue'

export const VARDEKVITTO_METHOD_VERSION = 1

const DAY_MS = 24 * 60 * 60 * 1000

export interface VardekvittoRad {
  label: string
  amount: number
  agent: string
  /** Dagar från godkänt kort till verifierad händelse — bevisets tidsspann. */
  dagar: number
  approval_id: string
}

export interface Vardekvitto {
  /** 'ÅÅÅÅ-MM' — kalendermånaden, inte ett rullande fönster. */
  period: string
  confirmed_kr: number
  confirmed_items: VardekvittoRad[]
  /** Vilande potential — ALDRIG summerad in i confirmed. null = inte läst här. */
  potential_kr: number | null
  method_version: number
}

/** Kalendermånadens gränser i UTC. null vid ogiltig period — aldrig en gissning. */
export function manadsfonster(period: string): { fromMs: number; toMs: number } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period)
  if (!m) return null
  const ar = Number(m[1])
  const manad = Number(m[2])
  return {
    fromMs: Date.UTC(ar, manad - 1, 1),
    toMs: Date.UTC(ar, manad, 1),
  }
}

/**
 * Regel 2 som kod: en attribution hör till månaden händelsen INTRÄFFADE.
 * Fönstret är halvöppet [from, to) — midnatt första nästa månad hör dit.
 */
export function manadensAttributioner(attributions: Attribution[], period: string): Attribution[] {
  const fonster = manadsfonster(period)
  if (!fonster) return []
  return attributions.filter(
    a => a.occurred_at_ms >= fonster.fromMs && a.occurred_at_ms < fonster.toMs,
  )
}

/** Ren postbyggare — fryst, deterministisk, aldrig en schablon. */
export function byggVardekvitto(input: {
  period: string
  attributions: Attribution[]
  /** Vilande ur pengar-på-bordet-summeringen. null = inte läst här. */
  potentialKr: number | null
}): Vardekvitto {
  const inne = manadensAttributioner(input.attributions, input.period)

  const items: VardekvittoRad[] = inne
    // Bokningar bär 0 kr (verifierad händelse, inget verifierat belopp) —
    // de är inte kvittorader. Regel 1: ingen schablon fyller hålet.
    .filter(a => a.amount_kr > 0)
    .map(a => Object.freeze({
      label: a.label,
      amount: Math.round(a.amount_kr),
      agent: a.agent ?? 'matte',
      dagar: Math.max(0, Math.round((a.occurred_at_ms - a.card_resolved_at_ms) / DAY_MS)),
      approval_id: a.card_id,
    }))

  return Object.freeze({
    period: input.period,
    confirmed_kr: sumRecoveredKr(inne),
    confirmed_items: Object.freeze(items) as unknown as VardekvittoRad[],
    potential_kr: input.potentialKr === null ? null : Math.max(0, Math.round(input.potentialKr)),
    method_version: VARDEKVITTO_METHOD_VERSION,
  })
}

/**
 * I/O: månadens kvitto ur attributionskärnan. Korten hämtas med kärnans
 * egen marginal (attributionsfönstret före månadsskiftet), händelserna
 * filtreras sedan EXAKT på kalendermånaden — gte-fönstret i kärnan är
 * bara en grovavgränsning.
 *
 * potential_kr lämnas null här: vilande läses av ytan ur samma
 * pengar-på-bordet-data den redan bär (ägargrindad) — att läsa om åtta
 * källor för en rad vore en andra sanning om samma kronor.
 */
export async function getVardekvitto(
  supabase: SupabaseClient,
  businessId: string,
  period: string,
): Promise<Vardekvitto | null> {
  const fonster = manadsfonster(period)
  if (!fonster) return null

  const dagar = Math.ceil((fonster.toMs - fonster.fromMs) / DAY_MS)
  const recovered = await getRecoveredRevenue(supabase, businessId, {
    sinceDays: dagar,
    now: new Date(fonster.toMs),
  })

  return byggVardekvitto({ period, attributions: recovered.attributions, potentialKr: null })
}
