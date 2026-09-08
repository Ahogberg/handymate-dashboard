/**
 * Massutskick — kort som når fler än en mottagare.
 *
 * Beslut Andreas 2026-09-08 (efter Codex godkännandegranskning): ett kort
 * som skickar till flera kunder får aldrig gå ut på ett enda tryck. Servern
 * kräver att den som godkänner bekräftar exakt antalet mottagare efter att
 * ha sett texten — oavsett klient (webb, mobil, direkt API). Klienten visar
 * en mellanskärm; utan bekräftelse svarar rutten 428 med underlaget.
 *
 * Ren modul, ingen DB. Känner igen massutskick på payloadens form, inte på
 * korttypen: `customers` som lista med fler än en post, eller
 * `customer_count > 1`. Nya korttyper med samma form täcks automatiskt.
 */

export const MASSUTSKICK_STATUS = 428
export const MASSUTSKICK_FALT = 'confirm_recipients'

export interface Massutskick {
  recipient_count: number
  message: string
  recipients_preview: string[]
}

type Kund = { name?: string | null; phone_number?: string | null }

export function massutskickAvKort(
  approvalType: string,
  payload: Record<string, unknown> | null | undefined,
): Massutskick | null {
  if (!payload) return null
  const customers = Array.isArray(payload.customers) ? (payload.customers as Kund[]) : []
  const count = customers.length > 0
    ? customers.length
    : Number(payload.customer_count) || 0
  if (count <= 1) return null
  const message = typeof payload.sms_text === 'string'
    ? payload.sms_text
    : typeof payload.message === 'string' ? payload.message : ''
  const recipients_preview = customers
    .slice(0, 5)
    .map(c => (c.name || c.phone_number || '').toString())
    .filter(Boolean)
  return { recipient_count: count, message, recipients_preview }
}

/** Sant när klienten bekräftat exakt det antal servern räknat. */
export function massutskickBekraftat(body: Record<string, unknown>, mass: Massutskick): boolean {
  return Number(body[MASSUTSKICK_FALT]) === mass.recipient_count
}

export function massutskickSvar(mass: Massutskick, approvalType: string) {
  return {
    error: `Massutskick till ${mass.recipient_count} kunder kräver bekräftelse`,
    requires_confirmation: true,
    approval_type: approvalType,
    recipient_count: mass.recipient_count,
    message: mass.message,
    recipients_preview: mass.recipients_preview,
    confirm_field: MASSUTSKICK_FALT,
  }
}
