import type { OutboundStatus } from './intents'
import type { ChannelReason } from '@/lib/channels/preflight'

export interface OutboundReceipt {
  status: OutboundStatus
  defer_reason?: ChannelReason | null
  finished_at?: string | null
  cancel_requested?: boolean
}
export function outboundStatusText(row: OutboundReceipt): string {
  let text: string
  if (row.status === 'sent') {
    const date = row.finished_at ? new Date(row.finished_at) : null
    text = date && Number.isFinite(date.getTime())
      ? `Skickat ${new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' }).format(date)}`
      : 'Skickat'
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
