/**
 * Delad namn-helper för kundvända texter (SMS/e-post).
 *
 * Flyttad hit 2026-08-12 från lib/agents/daniel/unopened-quotes.ts efter
 * pilotbugg: SMS läckte rått kundpostnamn ("Hej TEST Andreas - FixDEF!")
 * och hantverkarens interna arbetsnamn på offerten. Se R1/R2-reglerna:
 *   R1 — hälsningar använder kundens FÖRNAMN. Tomt/saknat namn → "Hej!".
 *   R2 — quote.title/project.name/deal.title/booking.notes är interna
 *        arbetsnamn och får ALDRIG stå i kundtext.
 *
 * unopened-quotes.ts re-exporterar härifrån så befintliga importer
 * fortsätter fungera oförändrade.
 */

/**
 * Extrahera förnamn från fullt namn. Robust mot:
 *   - null / tom sträng → ''
 *   - "Erik Svensson" → "Erik"
 *   - "BRF Lindgården" → "BRF" (företagsnamn — accepterar, fallar tillbaka i meddelandet)
 *   - leading/trailing whitespace → trim
 */
export function extractFirstName(fullName: string | null | undefined): string {
  if (!fullName) return ''
  const trimmed = fullName.trim()
  if (!trimmed) return ''
  return trimmed.split(/\s+/)[0] || ''
}

/**
 * Bygg en kundvänd hälsning: "Hej Anna!" eller "Hej!" om namnet saknas.
 * Använd i alla kundvända SMS/e-post istället för att interpolera rått
 * fullnamn — se R1.
 */
export function halsning(namn: string | null | undefined): string {
  const firstName = extractFirstName(namn)
  return firstName ? `Hej ${firstName}!` : 'Hej!'
}
