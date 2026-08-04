'use client'

import { FileText } from 'lucide-react'

const INPUT_CLS =
  'w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors'

interface InvoiceTextsSectionProps {
  ourReference: string
  setOurReference: (s: string) => void
  yourReference: string
  setYourReference: (s: string) => void
  introductionText: string
  setIntroductionText: (s: string) => void
  conclusionText: string
  setConclusionText: (s: string) => void
}

/**
 * ETAPP 6c (offert-masterplan.md, faktura-sprinten): "Textblock"-panelen.
 * Kartläggningen visade att `invoice.payment_terms_text` LÄSES av
 * data-builder.ts men kolumnen finns INTE i `invoice`-tabellen (bara på
 * `quotes`, sql/quote_overhaul.sql — grep-verifierat) — därför INGEN
 * betalvillkor-textyta här (skulle bryta save med ett DB-fel). De fält som
 * faktiskt finns och är trådade i POST/PUT (app/api/invoices/route.ts):
 * introduction_text, conclusion_text, our_reference, your_reference.
 * Referenserna är REDAN redigerbara direkt i dokumentet (QuoteDocument.tsx,
 * ETAPP 6c) — dubbleras här som formulärfält för den som föredrar det
 * (samma mönster som offertens QuoteEditStandardTextsSection).
 */
export function InvoiceTextsSection({
  ourReference,
  setOurReference,
  yourReference,
  setYourReference,
  introductionText,
  setIntroductionText,
  conclusionText,
  setConclusionText,
}: InvoiceTextsSectionProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
          <FileText className="w-4.5 h-4.5" />
        </div>
        <h2 className="font-heading text-base font-bold text-slate-900 tracking-tight">Referenser &amp; texter</h2>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Vår referens</label>
            <input
              type="text"
              value={ourReference}
              onChange={e => setOurReference(e.target.value)}
              placeholder="Namn"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Er referens</label>
            <input
              type="text"
              value={yourReference}
              onChange={e => setYourReference(e.target.value)}
              placeholder="Kundens referens"
              className={INPUT_CLS}
            />
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Inledningstext</label>
            <textarea
              value={introductionText}
              onChange={e => setIntroductionText(e.target.value)}
              placeholder="Kort text under fakturans titel…"
              rows={2}
              className={`${INPUT_CLS} resize-y leading-relaxed`}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Avslutningstext</label>
            <textarea
              value={conclusionText}
              onChange={e => setConclusionText(e.target.value)}
              placeholder="T.ex. Tack för förtroendet!"
              rows={2}
              className={`${INPUT_CLS} resize-y leading-relaxed`}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
