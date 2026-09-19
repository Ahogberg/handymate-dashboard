'use client'

import type { QuoteItem } from '@/lib/types/quote'
import { SaveJobStandardFromQuote } from '@/components/onboarding/SaveJobStandardFromQuote'

/**
 * RIVNING PAKET C (2026-09-17, rad 2.20): två implementationer av "Spara
 * som mall" (den här modalen, som redan hade BÅDE ett fritt mallnamn+
 * `/api/quote-templates`-anrop OCH — sen tidigare — SaveJobStandardFromQuote
 * bredvid, och detaljsidans egen handkopierade inline-modal i
 * `[id]/page.tsx` med bara den förra) slås ihop till EN väg: "Spara som
 * upplägg för jobbtypen", via SaveJobStandardFromQuote →
 * `/api/job-types/quote-setup` → lib/quotes/job-standard-server.ts
 * (writeJobStandard, operation replace/append). Det fria mallnamnet och
 * `/api/quote-templates`-skrivningen är borta ur BÅDA anroparna (se
 * QuoteBuilder.tsx och [id]/page.tsx) — routen och mallistan i
 * inställningar (rad 3.10, kräver Andreas) rörs inte.
 *
 * Saknar offerten en jobbtyp visas "Välj jobbtyp först" i stället för att
 * spara utan koppling — SaveJobStandardFromQuote kräver `jobType` för att
 * veta vilket upplägg raderna ska bindas till.
 */
interface QuoteSaveTemplateModalProps {
  jobType?: string | null
  items?: QuoteItem[]
  show: boolean
  onClose: () => void
}

export function QuoteSaveTemplateModal({
  jobType, items,
  show,
  onClose,
}: QuoteSaveTemplateModalProps) {
  if (!show) return null

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-xl max-h-[90dvh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-heading text-lg font-bold text-slate-900 mb-4 tracking-tight">Spara som upplägg för jobbtypen</h3>
        {jobType && items ? (
          <SaveJobStandardFromQuote jobType={jobType} items={items} />
        ) : (
          <p className="text-sm text-slate-600 mb-5">Välj jobbtyp först — offerten behöver vara kopplad till en jobbtyp innan raderna kan sparas som upplägg.</p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-sm font-semibold rounded-xl transition-colors"
        >
          Stäng
        </button>
      </div>
    </div>
  )
}
