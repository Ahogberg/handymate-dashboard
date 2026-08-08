/**
 * Prislistan — enda stället inköpspriser bor (COGS-mätaren, 2026-08-08).
 *
 * ═══ VARFÖR VERSIONERAD OCH INTE KONSTANTER ═══
 *
 * Priser ändras. En konstant som skrivs om gör historiken fel i efterhand:
 * förra månadens kostnad räknas plötsligt om med den här månadens pris, och
 * ingen ser att det hände. Varje kostnadshändelse bär därför sin
 * `price_version`, och en prisändring LÄGGER TILL en version — den skriver
 * aldrig om en befintlig.
 *
 * ═══ ALLT I ÖRE, HELTAL ═══
 *
 * Kostnad räknas i öre som heltal. Flyttalsören blir avrundningsspöken när
 * man summerar tusentals SMS, och en kostnadsrapport som inte går ihop på
 * kronan går inte att lita på. USD räknas om vid mätpunkten med en KURS SOM
 * ÄR PINNAD PER VERSION — reproducerbart, men det är ett antagande, inte ett
 * faktum. Se `usd_ore`.
 *
 * ═══ VAD SOM ÄR VERIFIERAT OCH VAD SOM ÄR LISTPRIS ═══
 *
 * Telefonipriserna nedan är 46elks publicerade listpriser för Sverige
 * (46elks.com/pricing/sweden, hämtade 2026-08-08, ex moms). De är INTE
 * verifierade mot en faktisk faktura. Hela mätaren blir exakt så sann som de
 * talen — stäm av dem innan du litar på en marginalsiffra.
 *
 * LLM-priserna är däremot desamma som koden redan räknade med på tre ställen
 * (thinking-call.ts, photo-assessment.ts, avtal-forslag.ts) innan de flyttade
 * hit.
 */

export const PRICE_VERSION = '2026-08'

export interface LlmPrice {
  in_ore_per_mtok: number
  out_ore_per_mtok: number
  cache_write_ore_per_mtok: number
  cache_read_ore_per_mtok: number
}

export interface PriceList {
  version: string
  /** Per SMS-DEL, inte per meddelande. Ett långt SMS är flera delar. */
  sms_part_ore: number
  call_mobile_ore_per_min: number
  call_landline_ore_per_min: number
  /** 46elks debiterar inte inkommande IVR/SIP-minuter. Noll är ett pris. */
  call_inbound_ore_per_min: number
  number_rental_ore_per_month: number
  whisper_ore_per_min: number
  /** Pinnad USD→öre-kurs. Ett antagande per version, inte en live-kurs. */
  usd_ore: number
  /** Nyckel = modellsträngen från lib/ai/get-model.ts. */
  llm: Record<string, LlmPrice>
}

/**
 * USD-priser per miljon tokens → öre per miljon tokens.
 * Skrivs som uttryck så det syns VAD som är leverantörens pris (dollartalet)
 * och vad som är vår omräkning.
 */
function usdPerMtok(usd: number, usdOre: number): number {
  return Math.round(usd * usdOre)
}

function byggPrislista(version: string, usdOre: number): PriceList {
  return {
    version,
    sms_part_ore: 52,
    call_mobile_ore_per_min: 57,
    call_landline_ore_per_min: 15,
    call_inbound_ore_per_min: 0,
    number_rental_ore_per_month: 3000,
    // OpenAI Whisper: $0.006/minut.
    whisper_ore_per_min: Math.round(0.006 * usdOre),
    usd_ore: usdOre,
    llm: {
      // Samma tal som thinking-call.ts räknade med före flytten.
      'claude-sonnet-4-6': {
        in_ore_per_mtok: usdPerMtok(3.0, usdOre),
        out_ore_per_mtok: usdPerMtok(15.0, usdOre),
        cache_write_ore_per_mtok: usdPerMtok(3.75, usdOre),
        cache_read_ore_per_mtok: usdPerMtok(0.3, usdOre),
      },
      // Samma tal som avtal-forslag.ts räknade med före flytten.
      'claude-haiku-4-5-20251001': {
        in_ore_per_mtok: usdPerMtok(1.0, usdOre),
        out_ore_per_mtok: usdPerMtok(5.0, usdOre),
        cache_write_ore_per_mtok: usdPerMtok(1.25, usdOre),
        cache_read_ore_per_mtok: usdPerMtok(0.1, usdOre),
      },
      // Opus används av 'reasoning-heavy' (lib/ai/get-model.ts:28).
      'claude-opus-4-7': {
        in_ore_per_mtok: usdPerMtok(15.0, usdOre),
        out_ore_per_mtok: usdPerMtok(75.0, usdOre),
        cache_write_ore_per_mtok: usdPerMtok(18.75, usdOre),
        cache_read_ore_per_mtok: usdPerMtok(1.5, usdOre),
      },
    },
  }
}

export const PRICE_LISTS: Record<string, PriceList> = {
  // 960 öre/USD = 9,60 kr. Pinnad, inte hämtad.
  '2026-08': byggPrislista('2026-08', 960),
}

export function currentPriceList(): PriceList {
  return PRICE_LISTS[PRICE_VERSION]
}

/**
 * Historisk prislista. Okänd version → nuvarande, med en varning: ett
 * kostnadstal räknat med fel prislista är värre än inget tal, så det ska
 * synas i loggen.
 */
export function priceListFor(version: string): PriceList {
  const p = PRICE_LISTS[version]
  if (!p) {
    console.warn(`[price-list] okänd prisversion "${version}" — använder ${PRICE_VERSION}`)
    return currentPriceList()
  }
  return p
}

/** Modellpris, eller null när modellen är okänd. Gissa aldrig ett LLM-pris. */
export function llmPriceFor(model: string, p: PriceList = currentPriceList()): LlmPrice | null {
  return p.llm[model] ?? null
}
