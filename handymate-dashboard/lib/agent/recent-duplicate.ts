import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * "Har vi precis skrivit exakt det här?" — dubbelskyddet för Mattes
 * fältskrivningar (Matte Mobile Voice V1, 2026-08-30).
 *
 * ═══ VARFÖR VID SKRIVNINGEN, INTE I TRANSPORTEN ═══
 *
 * Röstvägen har flera sätt att skicka samma sak två gånger, och de ser olika
 * ut i koden: ett dubbeltryck på bekräftelsekortet, en återanvänd
 * bekräftelse-token (den är giltig i 15 minuter och är inte en engångsnyckel,
 * se lib/agent/external-confirm.ts), eller modellen som råkar anropa samma
 * verktyg två gånger i samma tur. Ett skydd per väg hade behövt vara tre
 * skydd och ändå missat den fjärde vägen. Det här sitter framför själva
 * insert:en, så alla vägar in täcks av samma regel.
 *
 * Fönstret är avsiktligt kort: hantverkaren SKA kunna logga två riktiga pass
 * samma dag, eller samma material två gånger när han verkligen hämtat mer.
 * Det som aldrig är äkta är en identisk rad några sekunder senare.
 */

/** Kolumnvärden som identifierar raden. `null` matchas med IS NULL. */
export type DubblettFilter = Record<string, string | number | boolean | null>

export const DUBBLETT_FONSTER_MINUTER = 5

/**
 * Returnerar id:t på en identisk rad skriven inom fönstret, annars null.
 * Kastar vid databasfel — anroparen ska hellre avbryta än skriva en rad den
 * inte vet om den redan finns.
 */
export async function hittaNyligDubblett(params: {
  supabase: SupabaseClient
  tabell: string
  /** Kolumnen som bär radens id, t.ex. 'time_entry_id'. */
  idKolumn: string
  filter: DubblettFilter
  /** Tidsstämpelkolumnen att mäta fönstret mot. */
  tidKolumn?: string
  fonsterMinuter?: number
}): Promise<string | null> {
  const {
    supabase,
    tabell,
    idKolumn,
    filter,
    tidKolumn = 'created_at',
    fonsterMinuter = DUBBLETT_FONSTER_MINUTER,
  } = params

  let fraga = supabase
    .from(tabell)
    .select(idKolumn)
    .gte(tidKolumn, new Date(Date.now() - fonsterMinuter * 60 * 1000).toISOString())
    .limit(1)

  for (const [kolumn, varde] of Object.entries(filter)) {
    // .eq() matchar aldrig NULL i Postgres — utan is()-grenen hade en rad
    // utan projekt (eller utan kund) aldrig känts igen som dubblett.
    fraga = varde === null ? fraga.is(kolumn, null) : fraga.eq(kolumn, varde)
  }

  const { data, error } = await fraga
  if (error) throw new Error(error.message)
  // Kolumnnamnet är dynamiskt, så PostgREST-typerna kan inte härleda raden.
  const traff = (data as unknown as Array<Record<string, unknown>> | null)?.[0]
  return traff ? String(traff[idKolumn]) : null
}
