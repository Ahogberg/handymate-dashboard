'use client'

import { Loader2 } from 'lucide-react'
import QuoteDocument from '@/components/quotes/document/QuoteDocument'
import { DocumentScaler } from '@/components/quotes/document/DocumentScaler'
import type { InvoiceTemplateData } from '@/lib/invoice-templates/types'

interface InvoiceDocumentPanelProps {
  /** Byggd via buildInvoiceTemplateData — krävs för Modern (renderas inline
      genom samma dokumentmotor som PDF:en/kundvyn, se lib/invoice-templates/
      render-react.tsx). null medan businessConfig fortfarande laddar. */
  data: (InvoiceTemplateData & { docType: 'invoice' }) | null
  style: 'modern' | 'premium' | 'friendly'
  invoiceId: string
}

/**
 * ETAPP 6d (offert-masterplan.md, faktura-sprinten), punkt 1: "dokumentet i
 * centrum" — fakturans motsvarighet till QuoteDocumentPanel
 * (app/dashboard/quotes/[id]/components/QuoteDocumentPanel.tsx). Ersätter
 * den gamla <table>-renderingen av fakturarader + en separat Kund/Datum-
 * grid — detaljsidan visar nu SAMMA dokument som PDF:en och kundens
 * fakturaportal, inte en fjärde tolkning av datat.
 *
 * Egen komponent snarare än att generalisera QuoteDocumentPanel: den senare
 * är byggd kring TemplatePreviewFrame, som POST:ar ett LEVANDE
 * (osparat) redigerings-payload till /api/quotes/preview-html för
 * Premium/Friendly — nödvändigt i skaparen där data ännu inte finns i DB.
 * Den här sidan visar bara en REDAN SPARAD faktura, så Premium/Friendly kan
 * peka en vanlig <iframe src> direkt mot den befintliga GET-routen
 * (/api/invoices/pdf?invoiceId=…, format=html som default — se
 * app/api/invoices/pdf/route.ts) utan payload-byggande eller debounce.
 *
 * Modern: samma dokumentmotor som fakturaskaparen (QuoteDocument
 * mode="static", docType='invoice'), skalad till skärmbredd under `lg`
 * via DocumentScaler (samma ETAPP 3-mönster som offerten).
 */
export function InvoiceDocumentPanel({ data, style, invoiceId }: InvoiceDocumentPanelProps) {
  if (style === 'modern') {
    if (!data) return <DocumentSkeleton />
    return (
      <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-auto p-4 sm:p-6">
        <DocumentScaler>
          <QuoteDocument data={data} mode="static" />
        </DocumentScaler>
      </div>
    )
  }

  return (
    <div className="w-full max-w-[900px] mx-auto aspect-[210/297] bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
      <iframe
        src={`/api/invoices/pdf?invoiceId=${invoiceId}`}
        className="w-full h-full bg-white border-0"
        title="Faktura-förhandsgranskning"
      />
    </div>
  )
}

function DocumentSkeleton() {
  return (
    <div className="bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-center py-24">
      <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
    </div>
  )
}
