/**
 * Vad ett godkännandekort VISAR, och vad "Ändra" skriver tillbaka (2026-08-07).
 *
 * ═══ VARFÖR MODULEN FINNS ═══
 *
 * Previewen och redigerbarheten låg som två fristående funktioner i
 * IdagCore.tsx (`getPreview`, `getEditableKey`) som båda bara kände till
 * `payload.message` och `payload.sms_text`.
 *
 * Följden: **fakturapåminnelserna visade ingenting.** Cronen lägger den exakta
 * SMS-texten i `payload.delivery.messages.sms`
 * (app/api/cron/send-reminders/route.ts), men eftersom ingen läste den vägen
 * fick hantverkaren ett kort utan förhandsvisning och utan Ändra-knapp — han
 * ombads godkänna ett SMS han inte kunde läsa.
 *
 * ═══ VARFÖR "ÄNDRA" INTE ÄR EN PLATT NYCKEL ═══
 *
 * `POST /api/approvals/[id]` gör en SHALLOW merge:
 * `{ ...approval.payload, ...edited_payload }` (route.ts:178). Att skicka
 * `{ delivery: { messages: { sms } } }` hade alltså kastat bort resten av
 * delivery-objektet — mottagarens telefonnummer, e-post, nivå, avgifter — och
 * `deliverInvoiceReminder` hade fallit på `!delivery?.invoiceId`.
 *
 * Därför returnerar `buildApprovalEdit` ett FÄRDIGT fragment där hela
 * delvägen är återuppbyggd. Nästlingskunskapen finns på ett ställe, och den
 * är facit-testad.
 *
 * Rena funktioner — tests/approval-preview.spec.ts.
 */

/** Var previewtexten kommer ifrån — avgör också hur en ändring skrivs tillbaka. */
export type PreviewSource =
  /** payload.message — de flesta SMS- och meddelandetyper. */
  | 'message'
  /** payload.sms_text — äldre typer. */
  | 'sms_text'
  /** payload.delivery.messages.sms — fakturapåminnelser. */
  | 'delivery_sms'
  /** Sammansatt visningstext utan en enda redigerbar källa. */
  | 'sammansatt'

export interface ApprovalPreview {
  /** Texten kortet visar. Tom sträng → ingen previewruta ska renderas. */
  text: string
  /** null → ingen Ändra-knapp. */
  source: PreviewSource | null
}

interface ApprovalLike {
  approval_type: string
  description?: string | null
  payload?: Record<string, unknown> | null
}

const MAX_PREVIEW = 200

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * Texten kortet ska visa, och om den går att ändra.
 *
 * Ordningen är medveten: de sammansatta specialfallen först (de har en egen
 * visningsform som inte motsvarar ett enda fält), sedan de redigerbara
 * källorna från mest till minst specifik.
 */
export function approvalPreview(approval: ApprovalLike): ApprovalPreview {
  const pl = (approval.payload || {}) as Record<string, any>

  // Sammansatta: visas men går inte att ändra — det finns inget enda fält att
  // skriva tillbaka till, och en Ändra-knapp som sparar fel vore värre än ingen.
  if (approval.approval_type === 'lead_review' && pl.parsed) {
    const parts = [pl.parsed.name, pl.parsed.phone].filter(Boolean).join(' · ')
    return { text: parts || str(approval.description), source: parts ? 'sammansatt' : null }
  }
  if (approval.approval_type === 'publish_microsite' && pl.preview) {
    const parts = [pl.preview.headline, pl.preview.description].filter(Boolean)
    const text = parts.join(' — ').slice(0, MAX_PREVIEW)
    return { text, source: text ? 'sammansatt' : null }
  }

  if (typeof pl.message === 'string' && pl.message) {
    return { text: pl.message.slice(0, MAX_PREVIEW), source: 'message' }
  }
  if (typeof pl.sms_text === 'string' && pl.sms_text) {
    return { text: pl.sms_text.slice(0, MAX_PREVIEW), source: 'sms_text' }
  }

  // Fakturapåminnelsen. Kräver att hela delivery-objektet finns — utan
  // invoiceId kan `deliverInvoiceReminder` ändå inte skicka något, och då ska
  // kortet inte låtsas att texten är verksam.
  const sms = pl.delivery?.messages?.sms
  if (typeof sms === 'string' && sms && pl.delivery?.invoiceId) {
    return { text: sms.slice(0, MAX_PREVIEW), source: 'delivery_sms' }
  }

  return { text: '', source: null }
}

/** Går kortets text att ändra inline? */
export function isEditable(approval: ApprovalLike): boolean {
  const source = approvalPreview(approval).source
  return source === 'message' || source === 'sms_text' || source === 'delivery_sms'
}

/**
 * Fragmentet som skickas som `edited_payload`.
 *
 * OBS: servern gör en shallow merge, så `delivery_sms` returnerar HELA det
 * återuppbyggda delivery-objektet — inte bara den nästlade nyckeln. Ett
 * fragment som bara bar `{ messages: { sms } }` hade tömt delivery på allt
 * annat och gjort påminnelsen oskickbar.
 *
 * Returnerar null när det inte finns någon säker väg tillbaka; anroparen ska
 * då inte visa någon Ändra-knapp alls.
 */
export function buildApprovalEdit(
  approval: ApprovalLike,
  newText: string,
): Record<string, unknown> | null {
  const pl = (approval.payload || {}) as Record<string, any>
  const { source } = approvalPreview(approval)

  if (source === 'message') return { message: newText }
  if (source === 'sms_text') return { sms_text: newText }
  if (source === 'delivery_sms') {
    return {
      delivery: {
        ...pl.delivery,
        messages: { ...pl.delivery.messages, sms: newText },
      },
    }
  }
  return null
}
