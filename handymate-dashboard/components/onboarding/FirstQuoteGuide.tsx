'use client'

import { useState } from 'react'
import { ArrowRight, MessageCircle, X } from 'lucide-react'
import type { QuoteSection } from '@/lib/quotes/quote-completeness'

/** Frivillig vägledning, aldrig en andra spar-/granskningsgrind.
 * Kundvalet kommer från editorn; ett visat tips räknas aldrig som granskat. */
export function FirstQuoteGuide({ companyName, hasCustomer, onCustomer, onSection }: {
  companyName: string
  hasCustomer: boolean
  onCustomer: () => void
  onSection: (section: QuoteSection) => void
}) {
  const [hidden, setHidden] = useState(false)
  const [review, setReview] = useState(false)
  if (hidden) return <button type="button" className="min-h-[44px] mb-3 text-sm text-teal-800 flex items-center gap-2" onClick={() => setHidden(false)}>
    <MessageCircle size={17} /> Visa offertguiden
  </button>
  const stage = !hasCustomer ? 'customer' : review ? 'review' : 'content'
  return <aside className="relative rounded-2xl rounded-tl-sm border border-teal-200 bg-teal-50 p-4 mb-4" aria-label="Guide till första offerten">
    <div className="flex items-start gap-3">
      <MessageCircle size={20} className="shrink-0 text-teal-700 mt-1" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-teal-800 m-0">{companyName} · din första offert</p>
        <h2 className="text-base font-semibold text-slate-900 mt-1">
          {stage === 'customer' ? 'Vem gäller jobbet?' : stage === 'content' ? 'Gör underlaget till ditt eget' : 'Se helheten innan du skickar'}
        </h2>
        <p className="text-sm text-slate-700 mt-1" aria-live="polite">
          {stage === 'customer'
            ? 'Ditt valda upplägg följer med från onboardingen. Välj kunden och beskriv det riktiga jobbet.'
            : stage === 'content'
              ? 'Kontrollera mängder och priser för just det här jobbet. Artikelkopplingarna finns kvar. Du väljer själv om ett ändrat pris också ska sparas i artikelregistret.'
              : 'Kontrollera prisbild och föreslagna reservationer. Spara utkast när du vill fortsätta senare. Skicka-knappen leder till mottagargranskningen.'}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
          {stage === 'customer' ? <button type="button" onClick={onCustomer} className="min-h-[44px] text-sm font-semibold text-teal-900 flex items-center gap-2">Välj kund <ArrowRight size={16} /></button>
            : stage === 'content' ? <>
              <button type="button" className="min-h-[44px] text-sm font-semibold text-teal-900" onClick={() => onSection('inkluderat')}>Visa rader och priser</button>
              <button type="button" className="min-h-[44px] text-sm text-teal-800" onClick={() => { setReview(true); onSection('prisbild') }}>Visa tips inför granskning →</button>
            </> : <>
              <button type="button" className="min-h-[44px] text-sm font-semibold text-teal-900" onClick={() => onSection('reservationer')}>Visa reservationer</button>
              <button type="button" className="min-h-[44px] text-sm text-teal-800" onClick={() => { setReview(false); onSection('inkluderat') }}>Till rader och priser</button>
            </>}
        </div>
      </div>
      <button type="button" onClick={() => setHidden(true)} aria-label="Dölj offertguiden" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-teal-800 hover:bg-teal-100"><X size={18} /></button>
    </div>
  </aside>
}
