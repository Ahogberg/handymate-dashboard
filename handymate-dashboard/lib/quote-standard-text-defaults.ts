import { StandardTextType } from '@/lib/types/quote'

interface DefaultText {
  text_type: StandardTextType
  name: string
  content: string
}

/**
 * Returnerar seed-standardtexter per bransch
 */
export function getDefaultStandardTexts(branch?: string): DefaultText[] {
  const companyRef = branch === 'el' ? 'elinstallationer' :
    branch === 'vvs' ? 'VVS-arbeten' :
    branch === 'maleri' ? 'måleriarbeten' :
    'bygg- och renoveringsarbeten'

  return [
    {
      text_type: 'introduction',
      name: 'Standard inledning',
      content: `Tack för ert intresse! Vi har nöjet att presentera denna offert för ${companyRef} enligt vår överenskommelse. Offerten baseras på vår besiktning av arbetsplatsen och era önskemål. Vi ser fram emot att utföra arbetet åt er.`,
    },
    {
      text_type: 'conclusion',
      name: 'Standard avslutning',
      content: `Vi hoppas att offerten motsvarar era förväntningar. Tveka inte att höra av er om ni har frågor eller önskar justeringar. Vi ser fram emot ert svar och att kunna påbörja arbetet.

Med vänliga hälsningar`,
    },
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
