'use client'

import { Eye, X } from 'lucide-react'
import QuotePreview, { type QuotePreviewData } from '@/components/quotes/QuotePreview'

interface QuoteEditMobilePreviewModalProps {
  open: boolean
  setOpen: (b: boolean) => void
  data: QuotePreviewData | null
  businessName?: string
  contactName?: string
}

export function QuoteEditMobilePreviewModal({
  open,
  setOpen,
  data,
  businessName,
  contactName,
}: QuoteEditMobilePreviewModalProps) {
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 lg:hidden inline-flex items-center gap-2 px-4 py-3 bg-primary-700 hover:bg-primary-600 text-white text-sm font-semibold rounded-full shadow-lg transition-colors"
      >
        <Eye className="w-4 h-4" />
        Förhandsgranska
      </button>

      {open && data && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto lg:hidden"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-slate-50 rounded-2xl w-full max-w-lg relative shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-white rounded-t-2xl">
              <span className="font-heading text-sm font-bold text-slate-900 tracking-tight">
                Förhandsgranska offert
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 -m-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                aria-label="Stäng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <QuotePreview data={data} businessName={businessName || ''} contactName={contactName || ''} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
