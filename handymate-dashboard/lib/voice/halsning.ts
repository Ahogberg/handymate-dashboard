/**
 * Hälsningsljudet i röstbrevlådeflödet, som en 46elks-ljudsträng.
 *
 * 2026-09-10. Bakgrund: `app/api/voice/incoming/route.ts` returnerade
 * `{ play: '<APP_URL>/api/voice/greeting?business_id=...' }`. I 46elks är
 * `play` platsen för ett LJUD — en ljudfil eller en `tts:`-sträng — inte för
 * en webhook som returnerar call actions. 46elks hämtade adressen, förväntade
 * sig ljud, fick JSON och svarade `badaudio` / "Unsupported audio format".
 * Den som ringde hörde åtta sekunders tystnad och blev bortkopplad.
 *
 * Samma missförstånd fanns på `ivr:` mot `/api/voice/consent`, som gav
 * `badurl` / "Could not reach the specified URL".
 *
 * Rätt form är att bygga ljudet på plats. Texten bor här så att `incoming`
 * och `greeting`-rutten inte kan glida ifrån varandra: rutten finns kvar
 * eftersom `voice_start` kan peka på den, men båda vägarna säger samma sak.
 */
export function halsningsljud(businessName: string | null | undefined): string {
  const namn = (businessName || '').trim() || 'oss'
  return (
    `tts:sv-SE:Hej och välkommen till ${namn}. Vi kan tyvärr inte svara just nu. ` +
    `Lämna ett meddelande så hör vi av oss så snart vi kan.`
  )
}
