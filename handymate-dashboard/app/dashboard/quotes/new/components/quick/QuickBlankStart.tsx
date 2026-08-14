'use client'

import { ArrowLeft, ArrowRight } from 'lucide-react'

/** Samma strukturella typ som QuickIntake — se den filens motivering. */
interface BlankStartCustomer {
  customer_id: string
  name: string
}

interface QuickBlankStartProps {
  customers: BlankStartCustomer[]
  selectedCustomer: string
  onSelectCustomer: (id: string) => void
  title: string
  onTitleChange: (v: string) => void
  onStart: () => void
  onClose: () => void
  /** "Öppna fullständiga editorn" — samma väg ut som QuickIntake erbjuder. */
  onOpenFullEditor: () => void
}

/**
 * Snabbofferten utan AI-beskrivning (2026-08-14, Andreas fynd).
 *
 * ═══ VARFÖR DEN FINNS ═══
 *
 * "Steg-för-steg ska vara standard oavsett hur man startar" — den som inte
 * vill beskriva jobbet med AI ska ändå in i samma guidade, sektion-för-
 * sektion-granskning, inte rakt in i den fulla editorn. Men review-läget
 * behöver EN sak intaget annars härleder ur AI-svaret: en titel. Den här
 * skärmen frågar bara det — kund är, precis som i QuickIntake, medvetet
 * frivilligt.
 *
 * Review-läget tål redan noll rader gracefullt (sectionSummary ger "Inga
 * rader än" som ett vanligt attention-läge) — "+ Lägg till rad"-knappen
 * som redan finns i varje sektion är hela byggverktyget härifrån. Ingen ny
 * maskin, bara en kortare väg in i den som redan finns.
 */
export function QuickBlankStart({
  customers,
  selectedCustomer,
  onSelectCustomer,
  title,
  onTitleChange,
  onStart,
  onClose,
  onOpenFullEditor,
}: QuickBlankStartProps) {
  const canStart = title.trim().length > 0

  return (
    <div className="fixed inset-0 bg-slate-50 z-50 overflow-y-auto">
      <div className="max-w-xl mx-auto min-h-screen flex flex-col px-4 py-5 sm:py-8">
        <div className="flex items-center justify-between mb-5">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 -ml-1 px-2 py-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Tillbaka
          </button>
          <button
            type="button"
            onClick={onOpenFullEditor}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-primary-700 px-2 py-2 transition-colors"
          >
            Öppna editorn direkt
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="mb-5">
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Sätt igång
          </h1>
          <p className="text-slate-500 mt-2">
            Kund och titel — sen bygger du offerten sektion för sektion.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Titel <span className="text-primary-700">*</span>
            </label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={e => onTitleChange(e.target.value)}
              placeholder="T.ex. Badrumsrenovering"
              className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 bg-white focus:outline-none focus:border-primary-700 focus:ring-4 focus:ring-primary-100 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Kund <span className="text-slate-400 font-normal">(frivillig)</span>
            </label>
            <select
              value={selectedCustomer}
              onChange={e => onSelectCustomer(e.target.value)}
              className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-slate-900 bg-white focus:outline-none focus:border-primary-700 focus:ring-4 focus:ring-primary-100 transition-colors"
            >
              <option value="">Välj kund…</option>
              {customers.map(c => (
                <option key={c.customer_id} value={c.customer_id}>{c.name}</option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-1.5">Du kan välja kund senare — börja med titeln.</p>
          </div>
        </div>

        <div className="mt-auto pt-6">
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-4 bg-primary-700 hover:bg-primary-600 text-white text-base font-semibold rounded-2xl transition-[background-color,opacity] duration-base ease-standard disabled:opacity-40 shadow-sm"
          >
            Sätt igång
          </button>
          <p className="text-center text-xs text-slate-400 mt-2.5 min-h-[16px] m-0">
            {!canStart ? 'Skriv en titel först.' : ''}
          </p>
        </div>
      </div>
    </div>
  )
}
