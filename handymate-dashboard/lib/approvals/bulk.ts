import { classify, type ActionClass } from './action-contract'
import type { ApprovalReview } from './review-contract'

/**
 * Vad får göras med flera kort i ett svep?
 *
 * ═══ VARFÖR EN EGEN MODUL, OCH VARFÖR SÅ SNÄV ═══
 *
 * Ett väntande kort är ett beslut. Bee Service hade 24 kort i kön 2026-09-18,
 * det äldsta från 31 augusti — en kö ingen svarar på är en signal ingen
 * lyssnar på. Bulk är svaret, men bulk är också exakt det verktyg som gör
 * det lätt att godkänna något man inte läst.
 *
 * Därför uppfinner den här modulen INGEN ny behörighet och ingen ny klass.
 * Den läser husets befintliga klassificering (lib/approvals/action-contract)
 * och tillåter bulk precis där servern redan säger att ingen granskning
 * krävs — INFORMATIONAL och ACKNOWLEDGEMENT (se review-guard.ts rad 20).
 * Allt annat får sitt eget kort och sin egen granskning, som förut.
 *
 * ═══ GRINDEN SOM INTE FÅR RUNDAS ═══
 *
 * Varje kort skickas fortfarande som ett eget beslut till
 * POST /api/approvals/<id>, med sin egen granskningsnyckel. Bulk är en
 * bekräftelse för användaren, inte en genväg runt servern: en enda
 * bekräftelse där ALLA delar syns, och sedan N beslut som var och ett går
 * genom samma grindar som ett klick på ett kort.
 *
 * Ett kort vars granskning bär ett meddelande till kund, en bilaga som ska
 * bockas, eller ett delbeslut, får ALDRIG gå i bulk — då är den samlade
 * bekräftelsen inte längre en ärlig sammanfattning av vad som händer.
 */

/** De två klasser servern inte kräver granskning för vid godkännande. */
export const BULK_KLASSER: ActionClass[] = ['INFORMATIONAL', 'ACKNOWLEDGEMENT']

export type BulkHandling = 'approve' | 'reject' | 'snooze'

export interface BulkKort {
  id: string
  approval_type: string
  title?: string | null
}

export interface BulkNekat {
  id: string
  titel: string
  skal: string
}

export interface BulkUrval {
  tillatna: BulkKort[]
  nekade: BulkNekat[]
}

const SKAL: Record<string, string> = {
  REVIEW_REQUIRED: 'behöver öppnas och granskas för sig',
  EXECUTABLE_ACTION: 'utför något på riktigt och kräver egen bekräftelse',
  okand: 'är en korttyp vi inte vet vad den gör',
}

function titelFor(kort: BulkKort): string {
  return kort.title || kort.approval_type
}

/**
 * Dela urvalet i det som får gå i bulk och det som inte får.
 *
 * `snooze` är undantaget: att skjuta upp är inget beslut om innehållet —
 * ingen status ändras och ingenting utförs (route.ts, snooze-grenen), och
 * granskningsvakten hoppar över den handlingen helt. Därför får vilket
 * väntande kort som helst skjutas upp i bulk.
 */
export function delaUrval(kort: BulkKort[], handling: BulkHandling): BulkUrval {
  if (handling === 'snooze') return { tillatna: [...kort], nekade: [] }
  const tillatna: BulkKort[] = []
  const nekade: BulkNekat[] = []
  for (const k of kort) {
    const klass = classify(k.approval_type)
    if (klass && BULK_KLASSER.includes(klass)) tillatna.push(k)
    else nekade.push({ id: k.id, titel: titelFor(k), skal: SKAL[klass || 'okand'] || SKAL.okand })
  }
  return { tillatna, nekade }
}

/**
 * Får det här kortets granskning sammanfattas i en samlad bekräftelse?
 *
 * Nej så snart granskningen bär något som kräver en egen handling av
 * användaren: ett meddelande med mottagare, en bilaga att bocka, ett
 * delbeslut. Då är korten inte utbytbara rader i en lista längre.
 */
export function farSammanfattas(review: ApprovalReview | null | undefined): boolean {
  if (!review) return false
  if (!review.confirmLabel) return false
  if (review.messages && review.messages.length > 0) return false
  if (review.attachments && review.attachments.length > 0) return false
  if (review.choices && review.choices.length > 0) return false
  return true
}

/** Svenska för vad bulkhandlingen gör, till bekräftelsens rubrik. */
export function bulkRubrik(handling: BulkHandling, antal: number): string {
  if (handling === 'snooze') return `Skjut upp ${antal} kort?`
  if (handling === 'reject') return `Avvisa ${antal} kort?`
  return `Godkänn ${antal} kort?`
}

export function bulkEffekt(handling: BulkHandling, antal: number): string {
  if (handling === 'snooze') {
    return `Korten ligger kvar men försvinner ur kön i fyra timmar. Inget beslut tas och ingenting utförs.`
  }
  if (handling === 'reject') {
    return `${antal} kort markeras som avvisade. Ingenting skickas till någon kund.`
  }
  return `${antal} kort markeras som lästa och tas bort ur kön. Ingenting skickas till någon kund.`
}
