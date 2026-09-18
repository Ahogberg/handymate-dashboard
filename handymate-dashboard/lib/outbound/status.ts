import type { OutboundStatus } from './intents'
import type { ChannelReason } from '@/lib/channels/preflight'

export interface OutboundReceipt {
  status: OutboundStatus
  defer_reason?: ChannelReason | null
  finished_at?: string | null
  cancel_requested?: boolean
  /** Operatörens leveransbesked (v261). Ett EGET faktum vid sidan av status. */
  delivery_status?: LeveransStatus | null
  delivered_at?: string | null
}

/** Vad operatören sa. 'failed' = kom aldrig fram; studs och spamanmälan räknas dit. */
export type LeveransStatus = 'delivered' | 'failed' | 'bounced' | 'complained' | 'delayed'

function klockslag(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return null
  return new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' }).format(date)
}

/**
 * Leveransbeskedet i klartext, eller null när operatören inte sagt något än.
 *
 * "Skickat" har alltid betytt "sändtjänsten svarade 200". Det är inte samma
 * sak som att kunden fick meddelandet, och skillnaden är hela poängen med
 * spår 2: hantverkaren ska slippa ringa och fråga "fick du mitt SMS?".
 */
export function leveransText(row: { delivery_status?: LeveransStatus | null; delivered_at?: string | null }): string | null {
  const s = row.delivery_status
  if (!s) return null
  if (s === 'delivered') {
    const tid = klockslag(row.delivered_at)
    return tid ? `Levererat ${tid}` : 'Levererat'
  }
  if (s === 'delayed') return 'Försenat hos operatören'
  // failed, bounced och complained betyder alla: det nådde inte kunden.
  return 'Kom inte fram'
}

export function outboundStatusText(row: OutboundReceipt): string {
  let text: string
  if (row.status === 'sent') {
    // Leveransbeskedet vinner över sändningsbeskedet när det finns — det är
    // ett senare och mer sant faktum om samma utskick.
    const levererat = leveransText(row)
    if (levererat) {
      text = levererat
    } else {
      const tid = klockslag(row.finished_at)
      text = tid ? `Skickat ${tid}` : 'Skickat'
    }
  } else if (row.status === 'unknown') text = 'Utfallet är inte bekräftat'
  else if (row.status === 'skipped') text = 'Utskicket avbröts'
  else if (row.status === 'failed') text = 'Kunde inte skickas'
  else if (row.status === 'attempting') text = 'Utskicket behandlas'
  else text = row.defer_reason === 'saldo' ? 'Väntar på saldo'
    : row.defer_reason === 'mottagare' ? 'Väntar på mottagare'
    : row.defer_reason === 'konfiguration' ? 'Väntar på inställningar'
    : row.defer_reason === 'kontrollfel' ? 'Väntar på kontroll av sändtjänsten'
    : 'Väntar på utskick'
  return row.cancel_requested ? `${text}. Avstängningen kom efter att utskicket påbörjats.` : text
}
