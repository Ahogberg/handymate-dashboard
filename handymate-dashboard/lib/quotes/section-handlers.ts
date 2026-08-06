/**
 * Delmängder av dokumentets handlers, en per granskningssektion.
 *
 * ═══ VARFÖR DET HÄR ÄR EN REN FUNKTION OCH INTE UI-LOGIK ═══
 *
 * Snabbofferten granskas sektionsvis: "Inkluderat, Exkluderat, Reservationer,
 * Prisbild". Dokumentmotorn gatar redan varje redigerbart fält på att
 * motsvarande handler finns — saknas den renderas fältet som ren text. Ett
 * PARTIELLT handlers-objekt ger alltså "bara den här sektionen är redigerbar"
 * utan en enda rad ny renderingslogik.
 *
 * Det gör valet av NYCKLAR till hela mekanismen. Läcker en nyckel in i fel
 * sektion blir ett fält redigerbart mitt i en dimmad yta — hantverkaren kan
 * ändra något han inte tittar på och märker det inte. Läcker en nyckel UT
 * blir sektionen han granskar oredigerbar, och granskningen meningslös.
 * Därför är kartan data, inte utspridda if-satser, och därför facit-testas
 * den exakt: tests/section-handlers.spec.ts.
 *
 * Kompletterar `focusSection` i QuoteDocument, som sköter DIMNINGEN. Två
 * oberoende spakar med flit: dimning utan handler-gating hade sett låst ut men
 * fortfarande varit redigerbart, och handler-gating utan dimning hade lämnat
 * hantverkaren utan att veta vad han förväntas titta på.
 */
import type { QuoteDocumentHandlers } from '@/components/quotes/document/types'

export type QuoteSection = 'inkluderat' | 'exkluderat' | 'reservationer' | 'prisbild'

export const SECTION_ORDER: QuoteSection[] = ['inkluderat', 'exkluderat', 'reservationer', 'prisbild']

export const SECTION_LABELS: Record<QuoteSection, string> = {
  inkluderat: 'Inkluderat',
  exkluderat: 'Ej inkluderat',
  reservationer: 'Reservationer',
  prisbild: 'Prisbild',
}

/**
 * Kort förklaring under sektionsnamnet. Skriven till en hantverkare som står
 * hemma hos kund, inte till någon som läser dokumentation.
 */
export const SECTION_HINTS: Record<QuoteSection, string> = {
  inkluderat: 'Stämmer raderna? Lägg till, ta bort eller ändra.',
  exkluderat: 'Vad ingår INTE? Det här är vad som stoppar diskussioner efteråt.',
  reservationer: 'Förbehåll som skyddar dig om något oväntat dyker upp.',
  prisbild: 'Summan, avdraget och när kunden betalar.',
}

/**
 * Vilka handler-nycklar som hör till varje sektion.
 *
 * Titeln och beskrivningen hör till "Inkluderat": de beskriver vad jobbet
 * omfattar, vilket är samma fråga som raderna svarar på. Att ge dem en egen
 * sektion hade lagt till ett steg utan att lägga till ett beslut.
 */
const SECTION_KEYS: Record<QuoteSection, Array<keyof QuoteDocumentHandlers>> = {
  inkluderat: [
    'onTitleChange',
    'onDescriptionChange',
    'onItemChange',
    'onItemAdd',
    'onItemRemove',
    'onItemMove',
    'onItemRotRutCycle',
    'onOptionDefaultToggle',
  ],
  exkluderat: ['onNotIncludedChange', 'onTermsChange'],
  reservationer: ['onReservationRemove'],
  prisbild: ['onDiscountChange', 'onPaymentTermsChange', 'onValidUntilChange'],
}

/**
 * Bygger handlers-objektet för EN sektion ur det fullständiga.
 *
 * `null` betyder helhetsvyn — då returneras det fullständiga objektet oförändrat
 * (samma referens, så React inte ser en ny prop och renderar om i onödan).
 *
 * Nycklar som saknas i det fullständiga objektet hoppas över i stället för att
 * sättas till undefined. Skillnaden spelar roll: `{ onItemAdd: undefined }` och
 * `{}` beter sig likadant i dokumentmotorn, men bara det senare gör det
 * uppenbart vid felsökning att handlern aldrig fanns.
 */
export function sectionHandlers(
  section: QuoteSection | null,
  full: QuoteDocumentHandlers,
): QuoteDocumentHandlers {
  if (!section) return full
  const keys = SECTION_KEYS[section]
  const result: QuoteDocumentHandlers = {}
  for (const key of keys) {
    const handler = full[key]
    if (handler) {
      // Cast: nycklarna kommer ur samma typ som målet, men TypeScript kan inte
      // härleda att värdet matchar nyckeln vid dynamisk indexering.
      ;(result as Record<string, unknown>)[key] = handler
    }
  }
  return result
}

/** Nästa sektion i granskningsordningen, eller null när den sista är klar. */
export function nextSection(current: QuoteSection): QuoteSection | null {
  const index = SECTION_ORDER.indexOf(current)
  return index >= 0 && index < SECTION_ORDER.length - 1 ? SECTION_ORDER[index + 1] : null
}

export interface SectionSummaryInput {
  itemCount: number
  /** Rader utan pris — det enda som gör "Inkluderat" ofärdig. */
  itemsWithoutPrice: number
  notIncludedFilled: boolean
  reservationCount: number
  /** Osedda reservationsförslag — sektionen är inte färdiggranskad förrän
      hantverkaren tagit ställning till dem. */
  reservationSuggestions: number
  amountToPay: number
  /** ROT/RUT valt men personnummer saknas — avdraget går inte att begära. */
  deductionMissingPersonnummer: boolean
  paymentPlanValid: boolean
  hasPaymentPlan: boolean
}

export interface SectionSummary {
  /** Kort sammanfattning i granskningsbaren, t.ex. "8 rader · 46 500 kr". */
  text: string
  /** Något som behöver ögon INNAN offerten skickas. Färgas amber. */
  attention: string | null
}

const formatSek = (amount: number): string => `${Math.round(amount).toLocaleString('sv-SE')} kr`

/**
 * Sammanfattningen som visas i granskningsbaren för en sektion.
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
