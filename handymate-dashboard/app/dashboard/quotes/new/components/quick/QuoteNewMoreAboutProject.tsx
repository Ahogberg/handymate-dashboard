'use client'

import { ChevronRight } from 'lucide-react'

interface QuoteNewMoreAboutProjectProps {
  referencePerson: string
  setReferencePerson: (s: string) => void
  customerReference: string
  setCustomerReference: (s: string) => void
  projectAddress: string
  setProjectAddress: (s: string) => void
}

/**
 * "Mer om projektet" — Del 3 (jaunty-pondering-hummingbird.md).
 *
 * Vår referens, kundens referens och arbetsplatsadress renderas inte i
 * dokumentet någonstans (verifierat: noll träffar i lib/quote-templates/*
 * eller QuoteDocument.tsx) — rena bakgrundsfält utan "plats" att dimma via
 * sektionsmekanismen. De hör naturligt ihop med kundvalet i granskningens
 * delade header (review + overview) i stället.
 *
 * Stängd som default, samma "valfritt, stör inte"-princip som resten av
 * det guidade flödet — det här är bakgrundsmetadata, inte något varje
 * offert behöver. Binder till EXAKT samma state som gamla editorns
 * Villkor-flik (QuoteEditStandardTextsSection) redan skriver till, ingen
 * ny sanning skapas.
 */
export function QuoteNewMoreAboutProject({
  referencePerson,
  setReferencePerson,
  customerReference,
  setCustomerReference,
  projectAddress,
  setProjectAddress,
}: QuoteNewMoreAboutProjectProps) {
  return (
    <details className="relative shrink-0 group">
      <summary
        className="cursor-pointer list-none inline-flex items-center gap-1 px-1.5 py-1.5 text-xs font-medium text-slate-500 hover:text-primary-700 transition-colors select-none [&::-webkit-details-marker]:hidden"
      >
        <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
        <span className="hidden sm:inline whitespace-nowrap">Mer om projektet</span>
      </summary>
      <div className="absolute right-0 top-full mt-2 z-20 w-72 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-3">
        <MoreField
          label="Er referens"
          value={referencePerson}
          onChange={setReferencePerson}
          placeholder="Namn"
        />
        <MoreField
          label="Kundens referens"
          value={customerReference}
          onChange={setCustomerReference}
          placeholder="Referensnummer"
        />
        <MoreField
          label="Arbetsplatsadress"
          value={projectAddress}
          onChange={setProjectAddress}
          placeholder="Adress…"
        />
      </div>
    </details>
  )
}

function MoreField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (s: string) => void
  placeholder: string
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors"
      />
    </div>
  )
}
