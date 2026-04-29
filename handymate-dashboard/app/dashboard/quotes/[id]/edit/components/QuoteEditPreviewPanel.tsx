'use client'

import { ChevronDown, Eye } from 'lucide-react'
import QuotePreview, { type QuotePreviewData } from '@/components/quotes/QuotePreview'
import TemplatePreviewFrame, { type TemplatePreviewPayload } from '@/components/quotes/TemplatePreviewFrame'

interface QuoteEditPreviewPanelProps {
  open: boolean
  setOpen: (b: boolean) => void
  previewMode: 'design' | 'compact'
  setPreviewMode: (m: 'design' | 'compact') => void
  templatePreviewPayload: TemplatePreviewPayload
  debouncedPreviewData: QuotePreviewData | null
  businessName?: string
  contactName?: string
}

export function QuoteEditPreviewPanel({
  open,
  setOpen,
  previewMode,
  setPreviewMode,
  templatePreviewPayload,
  debouncedPreviewData,
  businessName,
  contactName,
}: QuoteEditPreviewPanelProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden hidden lg:block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50/50 transition-colors"
      >
        <div className="w-9 h-9 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
          <Eye className="w-4.5 h-4.5" />
        </div>
        <h2 className="font-heading text-base font-bold text-slate-900 tracking-tight flex-1">Förhandsgranska</h2>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3">
          {/* Tab toggle — slutdesign vs kompakt */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setPreviewMode('design')}
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                previewMode === 'design'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Slutdesign
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('compact')}
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                previewMode === 'compact'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Kompakt
            </button>
          </div>
          {previewMode === 'design' ? (
            <TemplatePreviewFrame
              payload={templatePreviewPayload}
              className="h-[calc(100vh-220px)] min-h-[700px]"
            />
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
