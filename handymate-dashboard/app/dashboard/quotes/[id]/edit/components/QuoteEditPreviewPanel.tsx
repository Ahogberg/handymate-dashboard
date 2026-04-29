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
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
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
          {previewMode === 'design' ? (
            <TemplatePreviewFrame
              payload={templatePreviewPayload}
              className="h-[calc(100vh-200px)] min-h-[700px]"
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
