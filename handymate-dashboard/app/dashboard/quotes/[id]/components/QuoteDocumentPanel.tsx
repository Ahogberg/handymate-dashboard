'use client'

import { Loader2 } from 'lucide-react'
import QuoteDocument from '@/components/quotes/document/QuoteDocument'
import { DocumentScaler } from '@/components/quotes/document/DocumentScaler'
import TemplatePreviewFrame, { type TemplatePreviewPayload } from '@/components/quotes/TemplatePreviewFrame'
import type { QuoteTemplateData } from '@/lib/quote-templates/types'

interface QuoteDocumentPanelProps {
  /** Fullt byggd via buildQuoteTemplateData — krävs för Modern (renderas
      inline genom samma dokumentmotor som skaparen/PDF:en). null medan
      businessConfig/creator fortfarande laddar. */
  data: QuoteTemplateData | null
  style: 'modern' | 'premium' | 'friendly'
  /** Premium/Friendly saknar (ännu) en React-motor (ETAPP 2a tog bara
      Modern) — dessa stilar renderas via samma iframe-preview som skaparen
      (/api/quotes/preview-html) så offerten alltid visar RÄTT dokument,
      inte en fjärde rendering-dialekt. null medan quote fortfarande laddar. */
  payload: TemplatePreviewPayload | null
}

/**
 * ETAPP 4 (offert-masterplan.md): "Dokumentet i centrum" — ersätter
 * QuoteSpecificationTable + QuoteDescriptionCard-dialekten (som tappade
 * tillvalsrader tyst, se den gamla filens `default: return null` för
 * item_type 'option'). Detaljsidan visar nu SAMMA dokument som PDF:en och
 * kundens signeringslänk, inte en tredje tolkning av datat.
 *
 * Modern: samma dokumentmotor som canvasen (QuoteDocument mode="static"),
 * skalad till skärmbredd under `lg` via DocumentScaler (ETAPP 3-mönstret).
 * Premium/Friendly: iframe mot preview-html-routen (samma som
 * TemplatePreviewFrame används i skaparen) tills E2a:s motor täcker fler
 * stilar — se planens ETAPP 2a-ordning (Modern → Premium/Friendly).
 */
export function QuoteDocumentPanel({ data, style, payload }: QuoteDocumentPanelProps) {
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

  if (!payload) return <DocumentSkeleton />

  return (
    <div className="w-full max-w-[900px] mx-auto aspect-[210/297]">
      <TemplatePreviewFrame payload={payload} className="w-full h-full" />
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
