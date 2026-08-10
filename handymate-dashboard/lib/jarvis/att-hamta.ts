/**
 * "Att hämta" — hemskärmens EN sanning om pengar som väntar (Tur 4 etapp 5).
 *
 * ═══ VARFÖR KORTET ERSÄTTER TVÅ ═══
 *
 * Högerspalten visade samma pengar som två saker: Fakturor-kortet (obetalda)
 * och Pengar på bordet (potential med förfallet inräknat). Samma krona syntes
 * två gånger under två rubriker — och ingen av dem sa vad man skulle GÖRA.
 * Att hämta är tre rader med varsin väg: obetalda fakturor, ofakturerade
 * jobb, offerter utan svar.
 *
 * ═══ ÄRLIGHETEN (facit i tests/att-hamta.spec.ts) ═══
 *
 * - `totalKr` är summan av de TRE raderna — aldrig pengar-sidans totalKr,
 *   som även räknar marginalrisk och möjliga ÄTA. De kategorierna är
 *   prognoser, inte pengar att hämta, och bor kvar på helsidan.
 * - Rader med antal 0 utelämnas. Allt noll är LUGNT LÄGE — ett besked,
 *   inte ett tomt hål (ersätter Fakturor-kortets "Inga obetalda").
 * - `null` när pengar-data saknas (403/fel): beloppen är see_financials-
 *   data — anställda ser inget kort alls, aldrig ett halvt.
 * - `vantarOvan` på ofakturerat-raden när ett faktureringskort redan ligger
 *   i beslutskön — raden pekar då UPP till kortet i stället för ut till en
 *   sida, så samma ärende inte ser ut som två.
 */
import type { PengarSummary } from '@/lib/value/pengar-pa-bordet'

export interface AttHamtaRad {
  key: 'obetalda' | 'ofakturerat' | 'utan_svar'
  text: string
  summaKr: number
  /** Bara på ofakturerat: beslutskortet ligger redan ovanför — scrolla dit. */
  vantarOvan?: boolean
}

export interface AttHamtaVy {
  totalKr: number
  rader: AttHamtaRad[]
  /** Allt noll — rendera lugnt besked i stället för siffror. */
  lugn: boolean
}

const kr = (n: number) => `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(Math.round(n))} kr`

export function byggAttHamta(input: {
  /** economics ur hem-sidan (sent+overdue). null = inte laddat. */
  obetalda: { antal: number; summaKr: number } | null
  /** Svaret från /api/dashboard/pengar. null = 403/fel ⇒ inget kort. */
  pengar: PengarSummary | null
  /** Ligger ett fakturera_projekt/missad_intakt-kort redan i kön? */
  harFaktureringskort: boolean
}): AttHamtaVy | null {
  // Beloppen är ägardata. Utan pengar-svar (anställd, fel) — inget kort.
  if (!input.pengar) return null

  const rader: AttHamtaRad[] = []

  if (input.obetalda && input.obetalda.antal > 0) {
    const n = input.obetalda.antal
    rader.push({
      key: 'obetalda',
      text: `${n} obetald${n === 1 ? ' faktura' : 'a fakturor'} · ${kr(input.obetalda.summaKr)}`,
      summaKr: Math.round(input.obetalda.summaKr),
    })
  }

  const ofakturerat = input.pengar.kategorier.find(k => k.key === 'ofakturerat')
  if (ofakturerat) {
    const n = ofakturerat.antal + (ofakturerat.antalUtanBelopp ?? 0)
    if (n > 0) {
      rader.push({
        key: 'ofakturerat',
        text: `${n} ofakturera${n === 1 ? 't' : 'de'} jobb · ${kr(ofakturerat.summaKr)}`,
        summaKr: ofakturerat.summaKr,
        ...(input.harFaktureringskort ? { vantarOvan: true } : {}),
      })
    }
  }

  const offerter = input.pengar.kategorier.find(k => k.key === 'offerter')
  if (offerter && offerter.antal > 0) {
    const n = offerter.antal
    rader.push({
      key: 'utan_svar',
      text: `${n} offert${n === 1 ? '' : 'er'} utan svar · ${kr(offerter.summaKr)}`,
      summaKr: offerter.summaKr,
    })
  }

  // Marginalrisk och möjliga ÄTA räknas ALDRIG in — prognoser är inte
  // pengar att hämta. De bor kvar på /dashboard/pengar.
  return {
    totalKr: rader.reduce((s, r) => s + r.summaKr, 0),
    rader,
    lugn: rader.length === 0,
  }
}
