/**
 * Hur offert- och fakturaytorna läser business_config från WEBBLÄSAREN.
 *
 * ═══ VARFÖR '*' OCH INTE EN KOLUMNLISTA ═══
 *
 * Bakgrund (rotorsaksanalys 2026-08-06): pilotkunden Bee hade sin logotyp
 * inlagd men den syntes aldrig på offerter. Orsaken var inte rendering, inte
 * lagring och inte data-buildern — utan att fyra klient-selecter begärde
 * kolumnen `vat_number`, som ingen migration i sql/ skapar.
 *
 * PostgREST 400:ar HELA frågan när en efterfrågad kolumn saknas. Alltså blev
 * `businessConfig` null, och därmed `logoUrl` null → initialbokstaven visades.
 * Företagsnamn och kontaktuppgifter såg ändå rätt ut eftersom de faller
 * tillbaka på useBusiness(), så felet såg ut som "bara loggan är trasig".
 *
 * Det avgörande: commit 69b4bc5b (2026-05-15), som SKULLE laga loggan, la in
 * `logo_url` och `vat_number` i samma select. Fixen kunde aldrig fungera, och
 * mönstret kopierades sedan till tre filer till.
 *
 * En kolumnlista är alltså en tickande bomb här: varje fält någon lägger till
 * i förhoppning om att det finns kan tysta HELA företagsinformationen på
 * offerten. `select('*')` kan inte gå sönder på det viset — det är också
 * därför inställningssidan (som använder '*') alltid har visat loggan korrekt
 * medan offertvyn inte gjort det.
 *
 * business_config är EN rad per företag. Kostnaden för att hämta alla kolumner
 * är försumbar jämfört med risken att tappa hela dokumenthuvudet.
 *
 * tests/business-config-select.spec.ts vaktar att ingen återinför en
 * kolumnlista på de här ytorna.
 */

export const QUOTE_SURFACE_BUSINESS_SELECT = '*'

/**
 * Loggar när business_config inte kunde läsas. Tystnaden var halva buggen —
 * alla fyra ytor destrukturerade bara `{ data }` och märkte aldrig 400:an.
 */
export function logBusinessConfigError(surface: string, error: { message?: string } | null | undefined): void {
  if (!error) return
  console.error(
    `[${surface}] business_config kunde inte läsas — dokumentets logotyp, adress och betaluppgifter blir tomma:`,
    error.message || error,
  )
}
