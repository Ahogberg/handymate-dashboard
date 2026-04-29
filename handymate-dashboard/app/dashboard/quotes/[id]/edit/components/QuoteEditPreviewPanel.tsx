'use client'

import { useState } from 'react'
import { ChevronDown, Eye, Loader2, Maximize2, X } from 'lucide-react'
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
  const [fullscreen, setFullscreen] = useState(false)
  const [previewPending, setPreviewPending] = useState(false)

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden hidden lg:flex lg:flex-col h-full">
        <div className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50/50 transition-colors">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex items-center gap-3 flex-1 min-w-0 text-left"
          >
            <div className="w-9 h-9 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
              <Eye className="w-4.5 h-4.5" />
            </div>
            <h2 className="font-heading text-base font-bold text-slate-900 tracking-tight flex-1">
              Förhandsgranska
            </h2>
            {previewMode === 'design' && previewPending && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                Uppdaterar
              </span>
            )}
          </button>
          {open && (
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Maximera"
              title="Visa i fullskärm"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Dölj' : 'Visa'}
            className="p-1 text-slate-400"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
        {open && (
          <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3 flex-1 min-h-0 flex flex-col">
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 flex-shrink-0">
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
                className="flex-1 min-h-0"
                onPendingChange={setPreviewPending}
              />
            ) : (
              debouncedPreviewData && (
                <div className="flex-1 min-h-0 overflow-auto">
                  <QuotePreview
                    data={debouncedPreviewData}
                    businessName={businessName || ''}
                    contactName={contactName || ''}
                  />
                </div>
              )
            )}
          </div>
        )}
      </div>

      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
          <div className="bg-white rounded-2xl w-full h-full max-w-5xl flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center">
                  <Eye className="w-4.5 h-4.5" />
                </div>
                <h2 className="font-heading text-base font-bold text-slate-900 tracking-tight">
                  Förhandsgranska — fullskärm
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setFullscreen(false)}
                aria-label="Stäng"
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-3">
              {previewMode === 'design' ? (
                <TemplatePreviewFrame
                  payload={templatePreviewPayload}
                  className="h-full"
                  onPendingChange={setPreviewPending}
                />
              ) : (
                debouncedPreviewData && (
                  <div className="h-full overflow-auto">
                    <QuotePreview
                      data={debouncedPreviewData}
                      businessName={businessName || ''}
                      contactName={contactName || ''}
                    />
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
