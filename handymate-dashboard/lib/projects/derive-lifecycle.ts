/**
 * Projektets driftläge — HÄRLETT ur fakta, aldrig lagrat
 * (2026-08-09, projektauditen P1-2).
 *
 * ═══ VARFÖR ═══
 *
 * Fem representationer konkurrerade om att beskriva var ett projekt står:
 * status-kolumnen, workflow-steget, portalens egen tracker, progress_percent
 * (två oförenliga skrivare, auditens P1-4) och milstolparna. Ingen var
 * sanningen; alla kunde säga olika saker samtidigt.
 *
 * Det här är auditens "derived read model" i minsta möjliga form: en REN
 * funktion från obestridliga fakta — projektets status/avslutsdatum och
 * fakturornas faktiska tillstånd — till ETT driftläge. Ingenting lagras;
 * det som inte lagras kan inte drifta.
 *
 * progress_percent och workflow-steget deltar MEDVETET inte i härledningen:
 * båda är skrivbara påståenden. Fakturatabellen är verklighet.
 *
 * Faserna är hantverkarens svar på "var står jobbet?", i pengarnas ordning:
 *
 *   planering → pågår → klart_ofakturerat → fakturerat → betalt
 *
 * `klart_ofakturerat` är den fas som ska GÖRA ONT i listan — det är där
 * pengar ligger och väntar (samma signal som intäktssvepet jagar).
 */

export type LifecyclePhase =
  | 'planering'
  | 'pagar'
  | 'klart_ofakturerat'
  | 'fakturerat'
  | 'betalt'
  | 'avbrutet'

export interface LifecycleInput {
  status: string | null
  completed_at: string | null
  /** Projektets fakturor — bara status behövs. Tom lista = inga fakturor. */
  invoices: Array<{ status: string | null }>
}

export interface DerivedLifecycle {
  phase: LifecyclePhase
  /** Svensk etikett för listor och kort. */
  label: string
  /** Sant när fasen kräver hantverkarens handling för att pengar ska röra sig. */
  needsAction: boolean
}

const LABELS: Record<LifecyclePhase, string> = {
  planering: 'Planering',
  pagar: 'Pågår',
  klart_ofakturerat: 'Klart — ofakturerat',
  fakturerat: 'Fakturerat',
  betalt: 'Betalt',
  avbrutet: 'Avbrutet',
}

export function deriveProjectLifecycle(input: LifecycleInput): DerivedLifecycle {
  const status = (input.status || '').toLowerCase()
  const fakturor = input.invoices || []

  const harBetald = fakturor.some(f => f.status === 'paid')
  // En skickad faktura är ute hos kund; ett utkast är det inte — men båda
  // betyder att underlaget finns och att nästa steg är känt.
  const harSkickad = fakturor.some(f => f.status === 'sent' || f.status === 'overdue')
  const harUtkast = fakturor.some(f => f.status === 'draft')

  if (status === 'cancelled') {
    return { phase: 'avbrutet', label: LABELS.avbrutet, needsAction: false }
  }

  const avslutat = status === 'completed' || !!input.completed_at

  if (avslutat) {
    // Pengarnas ordning: betalt slår skickat slår utkast slår ingenting.
    if (harBetald) return { phase: 'betalt', label: LABELS.betalt, needsAction: false }
    if (harSkickad) return { phase: 'fakturerat', label: LABELS.fakturerat, needsAction: false }
    if (harUtkast) {
      // Utkastet finns men har inte lämnat huset — granska och skicka.
      return { phase: 'klart_ofakturerat', label: 'Klart — faktura väntar på granskning', needsAction: true }
    }
    return { phase: 'klart_ofakturerat', label: LABELS.klart_ofakturerat, needsAction: true }
  }

  // Pågående projekt kan ha delfakturor — fakturafakta ändrar inte fasen
  // (jobbet pågår), men ett betalt/skickat läge är aldrig "planering".
  if (status === 'active' || harSkickad || harBetald || harUtkast) {
    return { phase: 'pagar', label: LABELS.pagar, needsAction: false }
  }

  return { phase: 'planering', label: LABELS.planering, needsAction: false }
}
