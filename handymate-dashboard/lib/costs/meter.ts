/**
 * Mätfunktionerna — rena, testbara, inga sidoeffekter (COGS-mätaren, 2026-08-08).
 *
 * ═══ SMS-DELAR ÄR HELA POÄNGEN ═══
 *
 * Ett SMS är inte en enhet, det är 1–n delar, och vi betalar per del. Innan
 * den här filen räknades delar INGENSTANS i kodbasen: ett 300-teckens SMS
 * kostade oss 2 × 52 öre men bokfördes som ett enda. Värre — en emoji tvingar
 * hela meddelandet till UCS-2, där en del bara rymmer 70 tecken i stället för
 * 160. En agent som lägger en 😊 i ett 100-teckens SMS fördubblar alltså
 * kostnaden, tyst. Den sortens sak är precis vad en mätare finns för.
 *
 * Svenska å/ä/ö ligger i GSM-7:s grundtabell och kostar ingenting extra.
 * Tecken som { } [ ] ~ ^ | \ och € kostar två GSM-7-positioner var (escape).
 *
 * ═══ AVRUNDNING ═══
 *
 * Allt returneras i ÖRE som heltal. Se lib/costs/price-list.ts om varför.
 */

import { currentPriceList, llmPriceFor, type PriceList } from './price-list'

// ── SMS ──────────────────────────────────────────────────────────────────

/** GSM-7:s grundtabell (3GPP TS 23.038), som ett set av kodpunkter. */
const GSM7_BAS = new Set(
  ('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
    '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà')
    .split('')
)

/** Tecken som kräver escape i GSM-7 och därför tar två positioner. */
const GSM7_ESCAPE = new Set(['\f', '^', '{', '}', '\\', '[', '~', ']', '|', '€'])

/**
 * Kan meddelandet skickas som GSM-7, och hur många positioner tar det då?
 * Returnerar null om något tecken saknas i GSM-7 — då blir det UCS-2.
 */
function gsm7Positioner(text: string): number | null {
  let positioner = 0
  for (const tecken of Array.from(text)) {
    if (GSM7_ESCAPE.has(tecken)) {
      positioner += 2
    } else if (GSM7_BAS.has(tecken)) {
      positioner += 1
    } else {
      return null
    }
  }
  return positioner
}

/**
 * Antal SMS-delar. Ett tomt meddelande är 1 del — vi skickar det ändå, och
 * operatören debiterar det ändå. Att kalla det 0 hade gjort mätaren
 * optimistisk på precis det sätt en mätare inte får vara.
 */
export function smsPartCount(message: string): number {
  const text = message ?? ''
  const gsm = gsm7Positioner(text)

  if (gsm !== null) {
    if (gsm <= 160) return 1
    // Sammanfogade (concatenated) SMS offrar 7 positioner per del till UDH.
    return Math.ceil(gsm / 153)
  }

  // UCS-2: räkna kodenheter, inte kodpunkter. En emoji utanför BMP är två
  // UDH-enheter, och operatören debiterar per enhet.
  const enheter = text.length
  if (enheter <= 70) return 1
  return Math.ceil(enheter / 67)
}

export function smsCostOre(message: string, p: PriceList = currentPriceList()): number {
  return smsPartCount(message) * p.sms_part_ore
}

// ── Samtal ───────────────────────────────────────────────────────────────

export type CallDestination = 'mobile' | 'landline' | 'unknown'

/**
 * Svenskt mobilnummer eller fast? Skillnaden är 57 mot 15 öre/minut, alltså
 * nästan fyra gånger — det är värt att klassificera rätt.
 *
 * Svenska mobilserier börjar på 07 (+467). Allt annat svenskt riktnummer är
 * fast. Utländska nummer klassas 'unknown': vi har ingen prislista för dem,
 * och att gissa på mobilpriset hade gett ett tal som ser exakt ut.
 */
export function classifySwedishNumber(e164: string): CallDestination {
  const n = (e164 || '').replace(/[\s-]/g, '')
  if (!n.startsWith('+46')) return 'unknown'
  const efter = n.slice(3)
  if (/^7[02369]\d{7}$/.test(efter)) return 'mobile'
  if (/^\d{6,12}$/.test(efter)) return 'landline'
  return 'unknown'
}

/**
 * Debiterbara minuter. Telefonioperatörer debiterar per PÅBÖRJAD minut, så
 * 61 sekunder är två minuter. Ett samtal på 0 sekunder (obesvarat) är noll.
 *
 * OBS: att 46elks debiterar per påbörjad minut är ett ANTAGANDE tills det är
 * avstämt mot en faktisk faktura. Är det i stället per sekund överskattar vi
 * — vilket är den säkrare riktningen för en marginalberäkning.
 */
export function billableMinutes(durationSeconds: number): number {
  const s = Math.max(0, Math.floor(durationSeconds || 0))
  if (s === 0) return 0
  return Math.ceil(s / 60)
}

export function callCostOre(
  durationSeconds: number,
  destination: CallDestination,
  p: PriceList = currentPriceList()
): number {
  const minuter = billableMinutes(durationSeconds)
  if (minuter === 0) return 0
  switch (destination) {
    case 'mobile': return minuter * p.call_mobile_ore_per_min
    case 'landline': return minuter * p.call_landline_ore_per_min
    // Okänd destination: använd mobilpriset som övre gräns. En underskattad
    // kostnad är farligare än en överskattad i en marginalrapport.
    case 'unknown': return minuter * p.call_mobile_ore_per_min
  }
}

// ── Whisper ──────────────────────────────────────────────────────────────

/**
 * Whisper debiteras per sekund, avrundat uppåt till närmaste sekund — inte
 * per minut. Därför sekundproportionellt här, till skillnad från samtal.
 */
export function whisperCostOre(durationSeconds: number, p: PriceList = currentPriceList()): number {
  const s = Math.max(0, durationSeconds || 0)
  if (s === 0) return 0
  return Math.ceil((s / 60) * p.whisper_ore_per_min)
}

// ── LLM ──────────────────────────────────────────────────────────────────

export interface TokenUsage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

/**
 * LLM-kostnad i öre. Okänd modell → 0, med varning: ett påhittat pris för en
 * modell vi inte känner blir ett tal som ser mätt ut men är gissat.
 */
export function llmCostOre(
  usage: TokenUsage,
  model: string,
  p: PriceList = currentPriceList()
): number {
  return Math.round(llmCostOreExakt(usage, model, p))
}

/**
 * Oavrundad kostnad i öre.
 *
 * Avrundningen sker MEDVETET först i ytterlagren. Ett enskilt agentanrop kan
 * kosta bråkdelar av ett öre, och `Math.round` på varje anrop hade nollat dem
 * — vilket i sin tur hade urholkat cost-guardens dygnstak, som summerar många
 * små körningar. Boken (cost_event) avrundar per rad; taket räknar exakt.
 */
function llmCostOreExakt(usage: TokenUsage, model: string, p: PriceList): number {
  const pris = llmPriceFor(model, p)
  if (!pris) {
    console.warn(`[meter] okänd modell "${model}" — LLM-kostnad bokförs som 0`)
    return 0
  }
  return (
    ((usage.input_tokens || 0) / 1_000_000) * pris.in_ore_per_mtok +
    ((usage.output_tokens || 0) / 1_000_000) * pris.out_ore_per_mtok +
    ((usage.cache_creation_input_tokens || 0) / 1_000_000) * pris.cache_write_ore_per_mtok +
    ((usage.cache_read_input_tokens || 0) / 1_000_000) * pris.cache_read_ore_per_mtok
  )
}

/**
 * LLM-kostnad i USD.
 *
 * Finns för att de befintliga cost-guard-taken är denominerade i USD
 * (`PLAN_COST_CAPS_USD`, `agent_runs.estimated_cost`) och det kontraktet ska
 * inte ändras av en mätare. Priserna kommer ändå ur samma prislista, så det
 * finns fortfarande bara ett ställe att ändra ett pris på.
 */
export function llmCostUsd(
  usage: TokenUsage,
  model: string,
  p: PriceList = currentPriceList()
): number {
  return llmCostOreExakt(usage, model, p) / p.usd_ore
}

/** USD → öre med versionens pinnade kurs. Enda tillåtna valutabryggan. */
export function usdToOre(usd: number, p: PriceList = currentPriceList()): number {
  return Math.round((usd || 0) * p.usd_ore)
}

/** "1 234 kr" / "52 öre" — för interna rapportytor. */
export function formatOre(ore: number): string {
  if (Math.abs(ore) < 100) return `${ore} öre`
  return `${(ore / 100).toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr`
}
