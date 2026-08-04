'use client'

import { Loader2 } from 'lucide-react'
import QuoteDocument from '@/components/quotes/document/QuoteDocument'
import { DocumentScaler } from '@/components/quotes/document/DocumentScaler'
import type { QuoteTemplateData } from '@/lib/quote-templates/types'

interface PublicQuoteDocumentProps {
  style: 'modern' | 'premium' | 'friendly'
  /** Modern: byggd server-side (buildQuoteTemplateData) + uppdaterad live på
      klienten när kunden kryssar i tillval (se applyLiveSelectionToTemplateData,
      lib/quotes/public-document.ts). Krävs för style === 'modern'. */
  templateData: QuoteTemplateData | null
  /** Premium/Friendly: färdig, statisk HTML-sträng byggd server-side i
      app/api/quotes/public/[token]/route.ts (samma renderare som PDF:en/
      "Visa offert"). Dokumentet uppdateras INTE när kunden kryssar i tillval
      — se not-texten i "Anpassa din offert"-kortet (app/quote/[token]/page.tsx),
      dokumenterad begränsning tills E2a:s motor täcker fler stilar. */
  documentHtml: string | null
}

/**
 * ETAPP 5 (offert-masterplan.md): kundens signeringssida renderar ÄNTLIGEN
 * samma dokument som hantverkaren valde, istället för en fjärde egen
 * tolkning av offertdatat (den gamla 1300-radersidan hade sin egen "Quote
 * Details"-kortlayout som ignorerade mallvalet helt).
 *
 * Modern: samma dokumentmotor som skaparen/offertrummet
 * (QuoteDocument mode="static"), skalad till skärmbredd under `lg` via
 * DocumentScaler (samma ETAPP 3-mönster som QuoteDocumentPanel i E4).
 * Premium/Friendly: iframe mot serverns färdiga HTML — se dokumenterad
 * begränsning ovan.
 */
export function PublicQuoteDocument({ style, templateData, documentHtml }: PublicQuoteDocumentProps) {
  if (style === 'modern') {
    if (!templateData) return <DocumentSkeleton />
    return (
      <div className="bg-slate-50 rounded-2xl border border-gray-200 overflow-auto p-3 sm:p-6">
        <DocumentScaler>
          <QuoteDocument data={templateData} mode="static" />
        </DocumentScaler>
      </div>
    )
  }

  if (!documentHtml) return <DocumentSkeleton />

  return (
    <div className="w-full max-w-[900px] mx-auto aspect-[210/297] rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
      <iframe
        srcDoc={documentHtml}
        className="w-full h-full bg-white"
        // sandbox utan allow-scripts — ren statisk rendering, samma som
        // TemplatePreviewFrame (skaparens förhandsgranskning).
        sandbox=""
        title="Offert"
      />
    </div>
  )
}

function DocumentSkeleton() {
  return (
    <div className="bg-slate-50 rounded-2xl border border-gray-200 flex items-center justify-center py-24">
      <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
    </div>
  )
}
