import { AlertCircle, CheckCircle2, FileText, ShieldCheck } from 'lucide-react'
import { buildJobTypeQuotePreview } from '@/lib/quotes/job-type-preview'
import type { SetupProduct, SetupTemplate } from '@/lib/quotes/job-type-setup'
import type { ReservationWithTriggers } from '@/lib/reservations/match'

interface Props {
  jobName: string
  template: SetupTemplate
  products: SetupProduct[]
  reservationLibrary: ReservationWithTriggers[] | null
}

const kronor = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 })

function rowTruth(status: ReturnType<typeof buildJobTypeQuotePreview>['rows'][number]['status']) {
  if (status === 'price_missing') return 'Pris behöver sättas'
  if (status === 'unit_mismatch') return 'Kontrollera artikelns enhet'
  return 'Artikel behöver kopplas'
}

/** Presentation av befintligt underlag. Inga knappar, skrivningar eller egna offertrader. */
export function JobTypeQuotePreview({ jobName, template, products, reservationLibrary }: Props) {
  const preview = buildJobTypeQuotePreview(template, products, reservationLibrary || [])
  const visibleRows = preview.rows.slice(0, 5)

  return <section className="job-setup-preview" aria-label={`Så här börjar nästa offert för ${jobName}`}>
    <div className="job-setup-preview-top">
      <div className="job-setup-preview-title"><FileText size={20} aria-hidden="true" /><div>
        <span>Så här börjar nästa offert</span>
        <h4>{jobName} · {template.name}</h4>
      </div></div>
      <span className="job-setup-preview-badge">Förhandsvisning · Inget skickas</span>
    </div>

    <div className="job-setup-preview-rows">
      {visibleRows.map(row => <div className="job-setup-preview-row" key={row.index}>
        <div>
          <strong>{row.description}</strong>
          <span>{row.itemType === 'option' ? 'Tillval · ' : ''}{row.productName && row.productName !== row.description ? `${row.productName} · ` : ''}{row.unit || 'enhet saknas'}</span>
        </div>
        {row.status === 'priced'
          ? <span className="job-setup-preview-price"><CheckCircle2 size={15} aria-hidden="true" />{kronor.format(row.unitPrice!)} kr/{row.unit}</span>
          : <span className="job-setup-preview-gap"><AlertCircle size={15} aria-hidden="true" />{rowTruth(row.status)}</span>}
      </div>)}
      {preview.rows.length > visibleRows.length && <p className="job-setup-preview-more">+ {preview.rows.length - visibleRows.length} rader till följer med till offertvyn</p>}
      {preview.rows.length === 0 && <p className="job-setup-preview-more">Mallen saknar artikelrader. Lägg till rader i offertmallen innan den kan ge en snabb start.</p>}
    </div>

    <div className="job-setup-preview-reservations">
      <ShieldCheck size={18} aria-hidden="true" />
      <div>{preview.reservations.length > 0 ? <>
        <strong>Daniel kommer att föreslå förbehåll</strong>
        <p>{preview.reservations.map(item => item.title).join(' · ')}</p>
      </> : <>
        <strong>Förbehåll kontrolleras i offertvyn</strong>
        <p>{reservationLibrary === null ? 'Förhandsvisningen kunde inte läsa biblioteket just nu.' : 'En ny kontroll görs mot offertens faktiska rader när den öppnas.'}</p>
      </>}</div>
    </div>
    <p className="job-setup-preview-foot">Artikelpriser exkl. moms. Mängder och villkor granskar du i offerten innan något skickas.</p>
  </section>
}

