import { arUtgangen } from './sales-case'

/**
 * Vad hände med en säljgenomgång efter att den skickades?
 *
 * Partnern kör mötet, trycker Skicka och får en länk. Sedan tystnad: idag
 * finns svaret bara i databasen (`opened_at` stämplas när prospektet öppnar
 * /case/<token>, `consumed_at` när onboardingen förbrukar caset), och ingen
 * yta läser det. Den här funktionen är enda stället som avgör läget, så
 * portalen och alla framtida ytor säger samma sak.
 *
 * Ordningen spelar roll: ett förbrukat case har vunnit även om länken
 * hunnit gå ut efteråt. Därför prövas `consumed_at` FÖRE utgången.
 *
 * `kanDelas` är sant bara när länken faktiskt fortfarande leder någonstans.
 * En delningsknapp på en utgången eller förbrukad länk är ett löfte som
 * bryts i kundens webbläsare.
 */
export type CaseLageKod = 'konto_skapat' | 'utgangen' | 'oppnad' | 'skickad'

export interface CaseLage {
  kod: CaseLageKod
  rubrik: string
  /** Tidpunkten läget hänger på — null när läget är "inget har hänt än". */
  tidpunkt: string | null
  kanDelas: boolean
}

export interface CaseRad {
  opened_at?: string | null
  consumed_at?: string | null
  expires_at?: string | null
}

export function caseLage(rad: CaseRad, nuMs: number): CaseLage {
  if (rad.consumed_at) {
    return { kod: 'konto_skapat', rubrik: 'Kunden startade sitt konto', tidpunkt: rad.consumed_at, kanDelas: false }
  }
  if (arUtgangen(rad.expires_at, nuMs)) {
    return { kod: 'utgangen', rubrik: 'Länken har gått ut', tidpunkt: rad.expires_at || null, kanDelas: false }
  }
  if (rad.opened_at) {
    return { kod: 'oppnad', rubrik: 'Kunden öppnade länken', tidpunkt: rad.opened_at, kanDelas: true }
  }
  return { kod: 'skickad', rubrik: 'Väntar på att kunden öppnar länken', tidpunkt: null, kanDelas: true }
}
