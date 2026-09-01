/**
 * Offertens fullständighet — sammanfattning per ämne (spår A, 2026-08-06).
 *
 * ═══ HISTORIK (Fas 1, offert-omtaget 2026-08-31) ═══
 *
 * Den här filen hette tidigare `section-handlers.ts` och gjorde TVÅ saker:
 * dessa rena sammanfattningsfunktioner, OCH en gating-mekanism
 * (`sectionHandlers`/`SECTION_KEYS`/`nextSection`) som filtrerade
 * dokumentets handlers till EN sektion i taget för en tvingad
 * steg-för-steg-granskning ("Inkluderat → Ej inkluderat → Reservationer →
 * Prisbild", en sektion åt gången innan nästa låstes upp).
 *
 * Den granskningssekvensen är borttagen — grundaren konstaterade att den
 * inte fungerade i praktiken, och koden höll själv med:
 * `lib/quotes/quick-preferences.ts` hade `SKIP_SEQUENCE_AFTER = 5` som
 * kopplade bort hela sekvensen efter fem genomförda snabbofferter, med en
 * kommentar om att användare börjar undvika tvingade repetitiva steg.
 *
 * Kvar är BARA `sectionSummary` + etikett-/ordningskonstanterna nedan. De
 * konsumeras nu av en alltid synlig, icke-blockerande chip-rad (se
 * `app/dashboard/quotes/_shared/QuoteCompletenessStrip.tsx`) i stället för
 * av en grind — varje chip visar sammanfattningen och scrollar till
 * relevant del av dokumentet (via QuoteDocuments `data-section`-attribut,
 * som redan sätts oavsett fokus), men blockerar aldrig och filtrerar aldrig
 * bort handlers.
 *
 * `sectionReviewState`/`unreviewedCount` (det gamla kvittots tre-tillstånds-
 * ikon och "hoppat över"-räknare) är BORTA, inte bara trimmade hit — deras
 * enda konsument var `QuickReceipt.tsx` (borttagen i samma pass) och dess
 * "godkänd"-lista. Chip-raden har ingen godkänn-handling att spegla; den
 * visar bara `attention` (amber) eller inte, samma tvåläges-mönster som
 * "Mer"-radens statusprickar redan använder.
 */

export type QuoteSection = 'inkluderat' | 'exkluderat' | 'reservationer' | 'prisbild'

export const SECTION_ORDER: QuoteSection[] = ['inkluderat', 'exkluderat', 'reservationer', 'prisbild']

export const SECTION_LABELS: Record<QuoteSection, string> = {
  inkluderat: 'Inkluderat',
  exkluderat: 'Ej inkluderat',
  reservationer: 'Reservationer',
  prisbild: 'Prisbild',
}

/**
 * Kort förklaring under ämnesnamnet. Skriven till en hantverkare som står
 * hemma hos kund, inte till någon som läser dokumentation.
 */
export const SECTION_HINTS: Record<QuoteSection, string> = {
  inkluderat: 'Stämmer raderna? Lägg till, ta bort eller ändra.',
  exkluderat: 'Vad ingår INTE? Det här är vad som stoppar diskussioner efteråt.',
  reservationer: 'Förbehåll som skyddar dig om något oväntat dyker upp.',
  prisbild: 'Summan, avdraget och när kunden betalar.',
}

export interface SectionSummaryInput {
  itemCount: number
  /** Rader utan pris — det enda som gör "Inkluderat" ofärdig. */
  itemsWithoutPrice: number
  notIncludedFilled: boolean
  reservationCount: number
  /** Osedda reservationsförslag — hantverkaren har inte tagit ställning
      till dem än. */
  reservationSuggestions: number
  amountToPay: number
  /** ROT/RUT valt men personnummer saknas — avdraget går inte att begära. */
  deductionMissingPersonnummer: boolean
  paymentPlanValid: boolean
  hasPaymentPlan: boolean
}

export interface SectionSummary {
  /** Kort sammanfattning i chip-raden, t.ex. "8 rader · 46 500 kr". */
  text: string
  /** Något som behöver ögon INNAN offerten skickas. Färgas amber. */
  attention: string | null
}

const formatSek = (amount: number): string => `${Math.round(amount).toLocaleString('sv-SE')} kr`

/**
 * Vad chip-raden ska visa för ett ämne.
 *
 * `attention` används lika sparsamt som i Mer-radens statusprickar (se
 * lib/quotes/panel-status.ts): bara verkliga hinder, aldrig "det här är tomt".
 * En offert utan reservationer är helt normal, och att färga den amber hade
 * lärt hantverkaren att ignorera färgen — då hade signalen varit värre än
 * ingen alls.
 */
export function sectionSummary(section: QuoteSection, input: SectionSummaryInput): SectionSummary {
  switch (section) {
    case 'inkluderat': {
      const text = `${input.itemCount} ${input.itemCount === 1 ? 'rad' : 'rader'} · ${formatSek(input.amountToPay)}`
      if (input.itemCount === 0) {
        return { text: 'Inga rader än', attention: 'Offerten har inga rader' }
      }
      return {
        text,
        attention: input.itemsWithoutPrice > 0
          ? `${input.itemsWithoutPrice} ${input.itemsWithoutPrice === 1 ? 'rad' : 'rader'} utan pris`
          : null,
      }
    }
    case 'exkluderat':
      // Tomt är inte fel. En offert kan mycket väl sakna avgränsningar.
      return { text: input.notIncludedFilled ? 'Ifyllt' : 'Inget angivet', attention: null }

    case 'reservationer': {
      const text = input.reservationCount === 0
        ? 'Inga förbehåll'
        : `${input.reservationCount} ${input.reservationCount === 1 ? 'förbehåll' : 'förbehåll'}`
      return {
        text,
        attention: input.reservationSuggestions > 0
          ? `${input.reservationSuggestions} förslag att ta ställning till`
          : null,
      }
    }
    case 'prisbild': {
      const parts = [formatSek(input.amountToPay)]
      if (input.hasPaymentPlan) parts.push('betalplan')
      if (input.deductionMissingPersonnummer) {
        return { text: parts.join(' · '), attention: 'Personnummer saknas för avdraget' }
      }
      if (input.hasPaymentPlan && !input.paymentPlanValid) {
        return { text: parts.join(' · '), attention: 'Betalplanen går inte ihop' }
      }
      return { text: parts.join(' · '), attention: null }
    }
  }
}

/**
 * Ordnar SECTION_ORDER så att chips med `attention` (amber) hamnar FÖRST,
 * lugna (slate) chips efter — men bevarar SECTION_ORDER:s inbördes ordning
 * inom respektive grupp. Ren funktion, ingen sidoeffekt.
 *
 * Tillkom med bottenfältets horisontellt scrollbara chip-rad (mobil,
 * QuoteBuilderBottomBar, Fas B offertskaparen-design-polish, 2026-08-31):
 * bara en bråkdel av raden syns innan man scrollar, så det som behöver
 * ögon ska stå längst till vänster. Header-radens QuoteCompletenessStrip
 * (desktop, gott om bredd för alla fyra) använder INTE detta — den
 * behåller SECTION_ORDER rakt av, oförändrat.
 */
export function sortSectionsByAttention(
  summaries: Record<QuoteSection, SectionSummary>
): QuoteSection[] {
  const withAttention = SECTION_ORDER.filter(section => !!summaries[section].attention)
  const calm = SECTION_ORDER.filter(section => !summaries[section].attention)
  return [...withAttention, ...calm]
}
