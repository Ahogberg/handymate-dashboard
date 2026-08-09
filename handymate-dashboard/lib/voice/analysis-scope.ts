/**
 * Rollfördelningen i samtalsvägen (2026-08-09, etapp 2b).
 *
 * ═══ TVÅ HJÄRNOR, EN GRÄNS ═══
 *
 * Ett inkommande samtal transkriberas och går sedan till TVÅ mottagare:
 *
 *   Lisa (agentmotorn)   AGERAR — hon har verktyg och gör saker direkt:
 *                        create_booking, send_sms, create_customer …
 *   Analysmotorn         FÖRESLÅR — den skapar ai_suggestion-kort som
 *                        hantverkaren (eller auto-approve) tar ställning till.
 *
 * Innan den här gränsen fanns kunde båda producera samma sak: Lisa bokade
 * mötet OCH analysmotorn föreslog "boka in mötet" — två åtgärder på samma
 * mening i samma samtal. Analysmotorn var dessutom i praktiken avstängd
 * (bara en catch-gren som nästan aldrig träffade), så de fem förslagstyper
 * den var ensam om hade tyst slutat existera.
 *
 * Gränsen: analysmotorn får föreslå EXAKT de typer Lisa saknar verktyg för.
 * Överlappet är därmed omöjligt per konstruktion — inte per prompttillit.
 * Facit (tests/samtalsvagen.spec.ts) korsläser listan mot Lisas allowedTools
 * i personalities.ts så att de inte kan glida isär.
 */

/** Typer analysmotorn får föreslå — de Lisa INTE kan utföra själv. */
export const ANALYS_TILLATNA_TYPER = [
  'quote',      // Lisa saknar create_quote
  'follow_up',  // inget verktyg finns
  'callback',   // inget verktyg finns
  'reminder',   // inget verktyg finns
  'reschedule', // ombokningen bor i approve-actions, inte i Lisas verktyg
] as const

export type AnalysForslagsTyp = (typeof ANALYS_TILLATNA_TYPER)[number]

/**
 * Typerna Lisa äger, och med VILKET verktyg. Kartan är dokumentation som
 * facit kan exekvera: varje typ här ska motsvara ett verktyg i Lisas
 * allowedTools, och ingen av dem får finnas i tillåtna-listan ovan.
 */
export const LISA_AGER_TYPERNA: Record<string, string> = {
  booking: 'create_booking',
  sms: 'send_sms',
  create_customer: 'create_customer',
}

/**
 * Släpper igenom enbart tillåtna förslag. Kod, inte prompttillit — modellen
 * ombeds visserligen att hålla sig till de fem, men det som skyddar
 * hantverkaren från dubbelåtgärder är den här raden, inte instruktionen.
 * Returnerar också vad som kastades, så anroparen kan logga det.
 */
export function filtreraAnalysforslag<T extends { type?: string }>(
  forslag: T[]
): { tillatna: T[]; kastade: T[] } {
  const tillatna: T[] = []
  const kastade: T[] = []
  for (const f of forslag) {
    if ((ANALYS_TILLATNA_TYPER as readonly string[]).includes(f.type || '')) tillatna.push(f)
    else kastade.push(f)
  }
  return { tillatna, kastade }
}
