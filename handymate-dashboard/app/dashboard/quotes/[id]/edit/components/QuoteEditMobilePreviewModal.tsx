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

/**
 * Floating "Förhandsgranska"-knapp på mobil + modal som öppnas av den.
 * Renderas alltid (knappen är fixed bottom-right på <lg) — modalen visas
 * när `open` är true.
 */
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
        className="fixed bottom-6 right-6 z-40 lg:hidden flex items-center gap-2 px-4 py-3 bg-[#0F766E] text-white rounded-full shadow-lg hover:bg-[#0D655D] transition-colors"
      >
        <Eye className="w-4 h-4" />
        <span className="text-sm font-medium">Förhandsgranska</span>
      </button>

      {open && data && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto lg:hidden"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-[#F8FAFC] rounded-xl w-full max-w-lg relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#E2E8F0]">
              <span className="text-sm font-medium text-[#1E293B]">Förhandsgranska offert</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 text-[#94A3B8] hover:text-[#1E293B] transition-colors"
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
