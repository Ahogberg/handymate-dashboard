/**
 * "Egen post ELLER behörighet" — ägarkontroll på personliga poster (2026-08-06).
 *
 * ═══ VARFÖR DEN HÄR FUNKTIONEN FINNS ═══
 *
 * Körjournal, resa och traktamente är den anställdes egen bokföring. När
 * behörighetskontraktet skrevs grindades därför bara GET (som returnerar HELA
 * teamets underlag) medan skrivvägarna lämnades öppna — att kräva
 * see_financials för att logga sin egen körning hade brutit ett fungerande
 * flöde för varje anställd.
 *
 * Men "öppen" var för mycket. Skrivvägarna filtrerade på `business_id` och
 * inget annat, så vilken anställd som helst kunde ändra eller RADERA en
 * kollegas poster. Rätt regel är varken "alla" eller "bara chefen" utan:
 *
 *   din egen post — eller behörighet att se hela teamets.
 *
 * ═══ TVÅ KANTFALL SOM AVGÖR RIKTNINGEN ═══
 *
 * **Post utan ägare** (`business_user_id` är null — förekommer i äldre data och
 * när POST inte satte fältet) tillhör INTE den som råkar titta. Bara den med
 * behörighet får röra den. Motsatt tolkning hade gjort varje herrelös post
 * fritt vilt.
 *
 * **Okänd användare** (currentUser kunde inte härledas) äger ingenting. Att
 * låta null matcha null hade gjort en trasig sessionsuppslagning till en
 * nyckel till alla ägarlösa poster.
 *
 * Ren funktion — facit-testad i tests/record-ownership.spec.ts.
 */

export interface RecordOwnershipInput {
  /** Postens ägare, som den står i databasen. */
  recordOwnerId: string | null | undefined
  /** Den som gör anropet. null när rollen inte kunde härledas. */
  currentUserId: string | null | undefined
  /** Resultatet av hasPermission(...) för den behörighet som annars krävs. */
  hasFallbackPermission: boolean
}

export function canTouchRecord({
  recordOwnerId,
  currentUserId,
  hasFallbackPermission,
}: RecordOwnershipInput): boolean {
  if (hasFallbackPermission) return true
  // Båda måste finnas OCH vara samma. Se kantfallen i filhuvudet: null === null
  // får aldrig läsas som "min post".
  if (!recordOwnerId || !currentUserId) return false
  return recordOwnerId === currentUserId
}

/**
 * Får anroparen skapa en post i NÅGON ANNANS namn?
 *
 * POST tar `business_user_id` ur bodyn på flera av de här rutterna, vilket
 * innebar att vem som helst kunde registrera utlägg på en kollega. Utelämnad
 * eller egen id är alltid tillåtet; någon annans kräver behörighet.
 */
export function canCreateForOwner({
  recordOwnerId,
  currentUserId,
  hasFallbackPermission,
}: RecordOwnershipInput): boolean {
  // Ingen ägare angiven → posten blir anroparens egen (eller ägarlös), alltid ok.
  if (!recordOwnerId) return true
  return canTouchRecord({ recordOwnerId, currentUserId, hasFallbackPermission })
}
