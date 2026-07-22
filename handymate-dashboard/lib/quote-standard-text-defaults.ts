import { StandardTextType } from '@/lib/types/quote'

interface DefaultText {
  text_type: StandardTextType
  name: string
  content: string
}

/**
 * Returnerar seed-standardtexter per bransch.
 *
 * OBS: 'introduction'/'conclusion' seedas INTE längre (pilot-beslut 2026-07)
 * — quotes.description är numera offertens öppningstext och gjorde dessa
 * redundanta. Befintliga rader av dessa typer på äldre konton rörs inte,
 * de seedas bara inte för nya konton. `branch` behålls i signaturen för
 * bakåtkompatibilitet med anroparna, men behövs inte längre av innehållet
 * nedan (ingen av de kvarvarande texterna är branschspecifik).
 */
export function getDefaultStandardTexts(_branch?: string): DefaultText[] {
  return [
    {
      text_type: 'not_included',
      name: 'Standard ej inkluderat',
      content: `• Eventuella tillstånd och bygglov
• Asbestsanering eller hantering av farligt avfall
• Återställning av ytor utanför arbetsområdet
• Elarbeten (om ej specificerat)
• VVS-arbeten (om ej specificerat)
• Målning och tapetsering (om ej specificerat)`,
    },
    {
      text_type: 'ata_terms',
      name: 'ÄTA-villkor (AB 04)',
      content: `Ändrings- och tilläggsarbeten (ÄTA) utförs enligt AB 04 kap 2.
Beställda ÄTA-arbeten debiteras enligt löpande räkning baserat på angiven timkostnad i denna offert, plus materialkostnad med påslag.
Alla ÄTA-arbeten ska godkännas skriftligen av beställaren innan arbetet påbörjas.
Mindre tilläggsarbeten (under 5 000 kr exkl. moms) kan godkännas muntligt men dokumenteras skriftligt i efterhand.`,
    },
    {
      text_type: 'payment_terms',
      name: 'Standard betalningsvillkor',
      content: `Betalning sker enligt angiven betalningsplan, 30 dagar netto.
Dröjsmålsränta enligt räntelagen.
Vid ROT-/RUT-avdrag ansvarar beställaren för att avdrag kan medges av Skatteverket.`,
    },
  ]
}
