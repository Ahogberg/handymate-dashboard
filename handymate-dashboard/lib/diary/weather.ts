/**
 * Väder i byggdagboken (Etapp D3, ÄTA + byggdagbok-omtaget, 2026-09-02).
 *
 * Ersätter dubblettkartan i app/dashboard/projects/[id]/page.tsx (~rad 3925)
 * och app/api/projects/[id]/logs/pdf/route.ts (~rad 17-23) — samma fem värden
 * och samma svenska etiketter, en enda källa i stället för tre kopior.
 *
 * SMHI-mappningen (Wsymb2, "Vädersymboler för Sverige") används av både
 * mobilens GPS-autofyll och lib/diary/smhi.ts. Se
 * https://opendata.smhi.se/apidocs/metfcst/parameters.html för hela tabellen.
 */

export const DIARY_WEATHER = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy'] as const

export type DiaryWeather = (typeof DIARY_WEATHER)[number]

export const WEATHER_LABELS: Record<DiaryWeather, string> = {
  sunny: 'Sol',
  cloudy: 'Mulet',
  rainy: 'Regn',
  snowy: 'Snö',
  windy: 'Blåsigt',
}

export const WEATHER_EMOJI: Record<DiaryWeather, string> = {
  sunny: '☀️',
  cloudy: '☁️',
  rainy: '🌧️',
  snowy: '❄️',
  windy: '💨',
}

export function isDiaryWeather(value: unknown): value is DiaryWeather {
  return typeof value === 'string' && (DIARY_WEATHER as readonly string[]).includes(value)
}

/**
 * Wsymb2 → DiaryWeather. SMHI:s koder 1–27:
 *   1–3   klart/lätt molnighet          → sunny
 *   4–7   halvklart t.o.m. mulet        → cloudy
 *   8–14  regnskurar/åska/regn          → rainy
 *   15–17 snöblandat regn/snöbyar/snö   → snowy
 *   18–24 lätt t.o.m. kraftigt regn     → rainy
 *   25–27 lätt t.o.m. kraftigt snöfall  → snowy
 *
 * Vind vinner ALDRIG över nederbörd — en isande regnstorm ska visas som
 * regn, inte som "blåsigt", eftersom nederbörden är vad hantverkaren behöver
 * dokumentera för en eventuell tvist. windSpeed (m/s) ≥ 10 slår bara igenom
 * när koden i sig INTE redan är nederbörd.
 *
 * Kod utanför 1–27 (eller inget värde) → null: "ingen giltig SMHI-kod",
 * anroparen avgör själv fallback (manuellt val).
 */
export function smhiSymbolToWeather(symbol: number, windSpeed?: number): DiaryWeather | null {
  if (!Number.isInteger(symbol) || symbol < 1 || symbol > 27) return null

  const isRainy = (symbol >= 8 && symbol <= 14) || (symbol >= 18 && symbol <= 24)
  const isSnowy = (symbol >= 15 && symbol <= 17) || (symbol >= 25 && symbol <= 27)

  if (isRainy) return 'rainy'
  if (isSnowy) return 'snowy'

  if (typeof windSpeed === 'number' && windSpeed >= 10) return 'windy'

  if (symbol >= 1 && symbol <= 3) return 'sunny'
  return 'cloudy' // 4–7
}
