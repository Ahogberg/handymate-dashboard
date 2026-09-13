import type { ProjectReceiptPresentation } from './project-receipt-presentation'

export interface ProjectReceiptReadSummary {
  status: 'loading' | 'ready' | 'error'
  receipts: ProjectReceiptPresentation[]
  hasMore: boolean
}

/** Presentation of already permission-filtered reads, never a monitoring engine. */
export function projectAdministrationSummary(
  approvals: { status: 'loading' | 'complete' | 'partial' | 'error'; count: number },
  receiptRead: ProjectReceiptReadSummary,
) {
  const pending = approvals.status === 'loading' ? 'Hämtar projektets ärenden…'
    : approvals.status === 'error' ? 'Ärendena kunde inte läsas. Uppdatera listan nedan.'
    : approvals.status === 'partial' ? `${approvals.count} ärenden i den lästa delen. Fler kan finnas.`
    : approvals.count ? `${approvals.count} ärenden att granska nedan.`
    : 'Inga väntande ärenden hittades i den lästa kön.'

  let handled = 'Hämtar projektets kvitton…'
  let waiting = 'Utfallet kan bedömas när kvittona har lästs.'
  if (receiptRead.status === 'error') {
    handled = 'Kvittona kunde inte läsas. Uppdatera kvittolistan nedan.'
    waiting = 'Det går inte att avgöra vad som återstår från kvittona.'
  } else if (receiptRead.status === 'ready') {
    const rows = receiptRead.receipts
    const saved = rows.filter(r => r.complete && r.state === 'saved').length
    const sent = rows.filter(r => r.complete && r.state === 'sent').length
    const queued = rows.filter(r => r.state === 'queued').length
    const uncertain = rows.filter(r => !r.complete && !['acknowledged', 'rejected', 'queued'].includes(r.state)).length
    const scope = receiptRead.hasMore ? 'I den lästa delen' : 'I de lästa kvittona'
    handled = `${scope}: ${saved} ${saved === 1 ? 'sparad handling' : 'sparade handlingar'}, ${sent} utskick ${sent === 1 ? 'accepterat' : 'accepterade'} av sändtjänsten.`
    waiting = `${scope}: ${queued} ${queued === 1 ? 'köad handling' : 'köade handlingar'}, ${uncertain} utfall att kontrollera.`
    if (receiptRead.hasMore) waiting += ' Fler beslut finns att läsa.'
  }
  return { pending, handled, waiting }
}
