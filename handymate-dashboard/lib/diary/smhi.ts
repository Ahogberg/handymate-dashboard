import { smhiSymbolToWeather, type DiaryWeather } from './weather'

/**
 * SMHI-väder för byggdagboken (Etapp D3/D4, 2026-09-02).
 *
 * Mobilens GPS-autofyll (spår framåt, byggs i handymate-mobile) och
 * `GET /api/weather` (den här sprintens D4) delar den här funktionen.
 * Desktop använder den INTE — där är vädret alltid manuellt.
 *
 * Två SMHI-produkter kombineras för att täcka igår→+10 dagar i en enda
 * fråga: mesan2g (analys, senaste ~24 h bakåt i tiden) och snow1g (prognos,
 * framåt). Vid överlappande timmar VINNER analysen — den beskriver vad som
 * faktiskt hände, prognosen bara vad som väntades.
 *
 * pmp3g v2 är nedlagd sedan 2026-03-31 (404) — använd den aldrig.
 *
 * ═══ FÄLTFORMATET ═══
 *
 * Verifierat skarpt mot Stockholm (59.33, 18.07) 2026-09-02: SVARET FÖLJER
 * PLANEN EXAKT — `timeSeries[].time` (ISO 8601 UTC) och
 * `timeSeries[].data.{air_temperature, wind_speed, symbol_code}` för BÅDA
 * produkterna. Ett `parameters`-fallback (SMHI:s äldre name/values-form)
 * finns ändå kvar nedan som defensivt skydd — SMHI har bytt svarsformat
 * förut (pmp3g-nedläggningen), och en tyst 0-rader-dag är svårare att
 * upptäcka än en tydlig varning i loggen.
 */

export class SmhiUnavailableError extends Error {
  constructor(message = 'SMHI svarar inte just nu') {
    super(message)
    this.name = 'SmhiUnavailableError'
  }
}

const ANALYS_URL = (lat: string, lon: string) =>
  `https://opendata-download-metanalys.smhi.se/api/category/mesan2g/version/2/geotype/point/lon/${lon}/lat/${lat}/data.json`
const PROGNOS_URL = (lat: string, lon: string) =>
  `https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/${lon}/lat/${lat}/data.json`

interface SmhiHour {
  time: Date
  airTemp: number | null
  windSpeed: number | null
  symbol: number | null
}

let loggedUnknownFormat = false

function readParamFallback(entry: Record<string, unknown>, name: string): number | null {
  const params = entry.parameters
  if (!Array.isArray(params)) return null
  const match = params.find((p: any) => p && p.name === name)
  const value = Array.isArray(match?.values) ? match.values[0] : undefined
  return typeof value === 'number' ? value : null
}

async function fetchSmhiSeries(url: string): Promise<SmhiHour[]> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(6000),
    next: { revalidate: 1800 },
  } as RequestInit)
  if (!res.ok) throw new Error(`SMHI svarade ${res.status} för ${url}`)

  const json: unknown = await res.json()
  const series = Array.isArray((json as any)?.timeSeries) ? (json as any).timeSeries : []

  const out: SmhiHour[] = []
  for (const entry of series as Array<Record<string, unknown>>) {
    const timeRaw = (entry.time as string | undefined) ?? (entry.validTime as string | undefined)
    const time = typeof timeRaw === 'string' ? new Date(timeRaw) : null
    if (!time || Number.isNaN(time.getTime())) continue

    const data = entry.data as Record<string, unknown> | undefined
    let airTemp: number | null = null
    let windSpeed: number | null = null
    let symbol: number | null = null

    if (data && typeof data === 'object') {
      airTemp = typeof data.air_temperature === 'number' ? data.air_temperature : null
      windSpeed = typeof data.wind_speed === 'number' ? data.wind_speed : null
      symbol = typeof data.symbol_code === 'number' ? data.symbol_code : null
    }

    // Defensivt fallback om `data`-fältet saknas eller är tomt — SMHI:s
    // äldre "parameters: [{name, values}]"-form (t/ws/Wsymb2).
    if (airTemp === null && windSpeed === null && symbol === null) {
      airTemp = readParamFallback(entry, 't')
      windSpeed = readParamFallback(entry, 'ws')
      symbol = readParamFallback(entry, 'Wsymb2')

      if (airTemp === null && windSpeed === null && symbol === null && !loggedUnknownFormat) {
        loggedUnknownFormat = true
        console.warn('lib/diary/smhi: okänt postformat från SMHI, första posten:', JSON.stringify(entry).slice(0, 500))
      }
    }

    out.push({ time, airTemp, windSpeed, symbol })
  }
  return out
}

/** YYYY-MM-DD i Europe/Stockholm — en-CA formaterar ISO-likt utan att
 * behöva plocka isär formatToParts för det vanliga fallet. */
const STOCKHOLM_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
})
const STOCKHOLM_HOUR = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm', hour: '2-digit', hourCycle: 'h23',
})

function stockholmDateString(d: Date): string {
  return STOCKHOLM_DATE.format(d)
}
function stockholmHour(d: Date): number {
  return Number(STOCKHOLM_HOUR.format(d))
}

export interface SmhiVaderResult {
  weather: DiaryWeather
  temperature: number
  source: 'smhi'
  hours_used: number
  wind_speed_max: number
}

/**
 * Hämtar dygnsväder för `date` (YYYY-MM-DD, lokalt Stockholm-datum) ur SMHI.
 *
 * - `null` om ingen av källorna har någon timme för det datumet.
 * - Kastar `SmhiUnavailableError` om BÅDA anropen failar (nät, timeout,
 *   icke-2xx) — anroparen (GET /api/weather) svarar 503 på det.
 */
export async function hamtaSmhiVader(params: { lat: number; lon: number; date: string }): Promise<SmhiVaderResult | null> {
  const lat = params.lat.toFixed(6)
  const lon = params.lon.toFixed(6)

  const [analysResult, prognosResult] = await Promise.allSettled([
    fetchSmhiSeries(ANALYS_URL(lat, lon)),
    fetchSmhiSeries(PROGNOS_URL(lat, lon)),
  ])

  if (analysResult.status === 'rejected' && prognosResult.status === 'rejected') {
    throw new SmhiUnavailableError()
  }

  // Slås ihop per timme (ISO-nyckel). Prognosen sätts först, analysen sätts
  // EFTER och skriver därmed över samma timme — "analysen vinner".
  const byHour = new Map<string, SmhiHour>()
  if (prognosResult.status === 'fulfilled') {
    for (const h of prognosResult.value) byHour.set(h.time.toISOString(), h)
  }
  if (analysResult.status === 'fulfilled') {
    for (const h of analysResult.value) byHour.set(h.time.toISOString(), h)
  }

  const matching = Array.from(byHour.values()).filter((h) => {
    const localHour = stockholmHour(h.time)
    return stockholmDateString(h.time) === params.date && localHour >= 7 && localHour <= 16
  })

  if (matching.length === 0) return null

  const temps: number[] = []
  let windMax = 0
  // Insättningsordning bevaras av Map — ger deterministisk tie-break när
  // flera väderslag har samma antal timmar.
  const counts = new Map<DiaryWeather, number>()

  for (const h of matching) {
    if (typeof h.airTemp === 'number') temps.push(h.airTemp)
    if (typeof h.windSpeed === 'number') windMax = Math.max(windMax, h.windSpeed)
    if (typeof h.symbol === 'number') {
      const mapped = smhiSymbolToWeather(h.symbol, h.windSpeed ?? undefined)
      if (mapped) counts.set(mapped, (counts.get(mapped) ?? 0) + 1)
    }
  }

  if (counts.size === 0) throw new SmhiUnavailableError('SMHI-svaret saknade tolkningsbara vädersymboler')

  const hasPrecip = (counts.get('rainy') ?? 0) > 0 || (counts.get('snowy') ?? 0) > 0
  const candidates = hasPrecip
    ? (['rainy', 'snowy'] as const).filter((k) => (counts.get(k) ?? 0) > 0)
    : Array.from(counts.keys())

  let weather: DiaryWeather = candidates[0]
  let best = counts.get(weather) ?? 0
  for (const key of candidates) {
    const n = counts.get(key) ?? 0
    if (n > best) { weather = key; best = n }
  }

  const temperature = temps.length > 0
    ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length)
    : 0

  return {
    weather,
    temperature,
    source: 'smhi',
    hours_used: matching.length,
    wind_speed_max: Math.round(windMax * 10) / 10,
  }
}
