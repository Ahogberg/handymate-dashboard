/**
 * Kortets röst — härledd, inte hårdkodad (innehållskontraktet regel 4).
 *
 * ═══ VAD SOM VAR FEL ═══
 *
 * `voice="foreslar"` stod hårdkodat på VARJE beslutskort i JarvisHome,
 * oavsett typ. Samtidigt är `missad_intakt`, `review_auto_invoice`,
 * `manual_project_create` och `four_eyes_*` klassade REVIEW_REQUIRED i
 * lib/approvals/action-contract.ts — de KAN inte utföras.
 *
 * Följden: kortet sa "Karin föreslår" och visade en Godkänn-knapp. Trycker
 * man svarar servern ärligt `{ executed: false, note: 'Öppna ärendet och
 * granska det innan något skickas.' }` — och klienten skrev "skickade: …" i
 * Klart idag. Hantverkaren fick veta att något gått iväg när ingenting hade
 * hänt.
 *
 * Sanningen fanns alltså redan strukturerad i systemet. Den nådde bara inte
 * fram till ytan. Den här filen är den saknade kopplingen, och inget mer:
 * `lib/jarvis/voice.ts` gör redan exakt rätt sak när den får rätt röst.
 *
 * ═══ REGELN ═══
 *
 *   EXECUTABLE_ACTION  → 'foreslar'  (Godkänn tillåts — ett klick utför något)
 *   allt annat/okänt   → 'fragar'    (ingen Godkänn — kortet öppnar i stället)
 *
 * Okänd typ blir medvetet 'fragar' och inte ett fel: ett kort vi inte känner
 * igen ska kunna öppnas och läsas, aldrig godkännas blint. Samma resonemang
 * som ACTION_CONTRACT själv för när `classify` returnerar null.
 */

import { classify, mayExecute } from '@/lib/approvals/action-contract'
import type { Voice } from '@/lib/jarvis/voice'

export function voiceFor(approvalType: string | null | undefined): Extract<Voice, 'foreslar' | 'fragar'> {
  return mayExecute(approvalType) ? 'foreslar' : 'fragar'
}

/**
 * Alternativen ett 'fragar'-kort visar i stället för Godkänn.
 *
 * `cardActions('fragar', …)` bygger knapparna ur den här listan och sätter
 * `approves: false` på allihop — det är den mekaniken som gör att ett
 * REVIEW_REQUIRED-kort inte KAN utlösa ett godkännande, inte bara att det
 * låter bli att visa knappen.
 *
 * Första alternativet får den fyllda formen (läsbarhet), men fortfarande
 * approves:false.
 */
export function reviewAlternatives(approvalType: string | null | undefined): Array<{ id: string; label: string }> {
  const klass = classify(approvalType)

  // ACKNOWLEDGEMENT = "jag har sett det här". Att öppna är fortfarande rätt
  // primärhandling, men avfärdandet ska heta något annat än "avvisa" — man
  // avvisar inte ett konstaterande.
  if (klass === 'ACKNOWLEDGEMENT') {
    return [
      { id: 'open', label: 'Öppna och granska' },
      { id: 'reject', label: 'Noterat' },
    ]
  }

  if (klass === 'INFORMATIONAL') {
    return [
      { id: 'open', label: 'Öppna' },
      { id: 'reject', label: 'Läst' },
    ]
  }

  // REVIEW_REQUIRED och okänd typ.
  return [
    { id: 'open', label: 'Öppna och granska' },
    { id: 'reject', label: 'Avvisa' },
  ]
}

/**
 * Vad "Klart idag"-raden ska säga efter ett klick.
 *
 * Servern returnerar redan `executed` och `note` (se
 * lib/approvals/action-contract.ts `nonExecutableResult`). Klienten kastade
 * bort dem och skrev alltid "skickade: …". Nu bär raden serverns egna ord när
 * ingenting utfördes.
 */
export function doneRowText(opts: {
  action: 'approve' | 'reject' | 'edit'
  title: string
  executed?: boolean
  note?: string | null
}): string {
  if (opts.action === 'reject') return `avvisade: ${opts.title}`

  // executed === false är serverns uttryckliga besked om att inget skickades.
  // Undefined betyder att svaret inte bar fältet (äldre väg) — då faller vi
  // tillbaka på det gamla ordet hellre än att hitta på ett nytt.
  if (opts.executed === false) {
    return opts.note ? `${opts.title} — ${opts.note}` : `öppnade: ${opts.title}`
  }

  return `skickade: ${opts.title}${opts.action === 'edit' ? ' (med din ändring)' : ''}`
}
