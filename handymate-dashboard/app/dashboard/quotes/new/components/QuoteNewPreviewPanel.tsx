'use client'

import { ChevronDown, Eye } from 'lucide-react'
import QuotePreview, { type QuotePreviewData } from '@/components/quotes/QuotePreview'
import TemplatePreviewFrame, { type TemplatePreviewPayload } from '@/components/quotes/TemplatePreviewFrame'
import ModernCanvas, { type ModernCanvasHandlers } from '@/components/quotes/editable/ModernCanvas'
import type { QuoteTemplateData } from '@/lib/quote-templates/types'

type PreviewMode = 'live' | 'design' | 'compact'

interface QuoteNewPreviewPanelProps {
  open: boolean
  setOpen: (b: boolean) => void
  previewMode: PreviewMode
  setPreviewMode: (m: PreviewMode) => void
  liveAvailable: boolean
  liveTemplateData: QuoteTemplateData
  liveHandlers: ModernCanvasHandlers
  templatePreviewPayload: TemplatePreviewPayload
  debouncedPreviewData: QuotePreviewData | null
  businessName?: string
  contactName?: string
}

export function QuoteNewPreviewPanel({
  open,
  setOpen,
  previewMode,
  setPreviewMode,
  liveAvailable,
  liveTemplateData,
  liveHandlers,
  templatePreviewPayload,
  debouncedPreviewData,
  businessName,
  contactName,
}: QuoteNewPreviewPanelProps) {
  return (
    <div className="bg-white border-thin border-[#E2E8F0] rounded-xl hidden lg:block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <span className="flex items-center gap-2">
          <Eye className="w-3.5 h-3.5 text-[#64748B]" />
          <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#475569]">Förhandsgranska</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-[#64748B] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {/* Toggle: Live-redigera / Slutdesign / Kompakt */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => liveAvailable && setPreviewMode('live')}
              disabled={!liveAvailable}
              className={`flex-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                previewMode === 'live' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              } ${!liveAvailable ? 'opacity-40 cursor-not-allowed' : ''}`}
              title={liveAvailable ? 'Inline-redigera direkt i mallen' : 'Live-redigering kommer snart för Premium/Friendly'}
            >
              Live ✏️
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('design')}
              className={`flex-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                previewMode === 'design' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Slutdesign
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('compact')}
              className={`flex-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                previewMode === 'compact' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Kompakt
            </button>
          </div>
          {previewMode === 'live' && liveAvailable ? (
            <div className="bg-gray-50 rounded-xl overflow-auto border border-[#E2E8F0] h-[calc(100vh-200px)] min-h-[700px] p-4">
              <ModernCanvas data={liveTemplateData} handlers={liveHandlers} />
            </div>
          ) : previewMode === 'design' || (previewMode === 'live' && !liveAvailable) ? (
            <TemplatePreviewFrame payload={templatePreviewPayload} className="h-[calc(100vh-200px)] min-h-[700px]" />
          ) : (
            debouncedPreviewData && (
              <QuotePreview
                data={debouncedPreviewData}
                businessName={businessName || ''}
                contactName={contactName || ''}
              />
            )
          )}
        </div>
      )}
    </div>
  )
}
