'use client'

import { ChevronDown, FileText } from 'lucide-react'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import { StandardTextPicker } from './StandardTextPicker'
import type { QuoteStandardText } from '@/lib/types/quote'

interface QuoteEditStandardTextsSectionProps {
  open: boolean
  setOpen: (b: boolean) => void
  textsByType: Record<string, QuoteStandardText[]>
  referencePerson: string
  setReferencePerson: (s: string) => void
  customerReference: string
  setCustomerReference: (s: string) => void
  projectAddress: string
  setProjectAddress: (s: string) => void
  introductionText: string
  setIntroductionText: (s: string) => void
  conclusionText: string
  setConclusionText: (s: string) => void
  notIncluded: string
  setNotIncluded: (s: string) => void
  ataTerms: string
  setAtaTerms: (s: string) => void
  paymentTermsText: string
  setPaymentTermsText: (s: string) => void
}

export function QuoteEditStandardTextsSection({
  open,
  setOpen,
  textsByType,
  referencePerson,
  setReferencePerson,
  customerReference,
  setCustomerReference,
  projectAddress,
  setProjectAddress,
  introductionText,
  setIntroductionText,
  conclusionText,
  setConclusionText,
  notIncluded,
  setNotIncluded,
  ataTerms,
  setAtaTerms,
  paymentTermsText,
  setPaymentTermsText,
}: QuoteEditStandardTextsSectionProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 sm:px-6 py-4 text-left hover:bg-slate-50/50 transition-colors"
      >
        <div className="w-9 h-9 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
          <FileText className="w-4.5 h-4.5" />
        </div>
        <h2 className="font-heading text-base font-bold text-slate-900 tracking-tight flex-1">
          Referenser och texter
        </h2>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 sm:px-6 pb-6 space-y-4 border-t border-slate-100 pt-5">
          {/* Reference fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Er referens">
              <input
                type="text"
                value={referencePerson}
                onChange={e => setReferencePerson(e.target.value)}
                placeholder="Namn"
                className={INPUT_CLS}
              />
            </Field>
            <Field label="Kundens referens">
              <input
                type="text"
                value={customerReference}
                onChange={e => setCustomerReference(e.target.value)}
                placeholder="Referensnummer"
                className={INPUT_CLS}
              />
            </Field>
            <Field label="Arbetsplatsadress">
              <AddressAutocomplete
                value={projectAddress}
                onChange={setProjectAddress}
                onSelect={r => setProjectAddress(r.full_address)}
                placeholder="Sök adress…"
                className={INPUT_CLS}
              />
            </Field>
          </div>

          {/* Standard texts */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <TextField
              label="Inledningstext"
              placeholder="Hälsningsfras och inledning…"
              value={introductionText}
              onChange={setIntroductionText}
              picker={textsByType.introduction}
              onPick={setIntroductionText}
            />
            <TextField
              label="Avslutningstext"
              placeholder="Avslutande text…"
              value={conclusionText}
              onChange={setConclusionText}
              picker={textsByType.conclusion}
              onPick={setConclusionText}
            />
            <TextField
              label="Ej inkluderat"
              placeholder="Vad ingår inte…"
              value={notIncluded}
              onChange={setNotIncluded}
              picker={textsByType.not_included}
              onPick={setNotIncluded}
            />
            <TextField
              label="ÄTA-villkor"
              placeholder="Ändrings- och tilläggsarbeten…"
              value={ataTerms}
              onChange={setAtaTerms}
              picker={textsByType.ata_terms}
              onPick={setAtaTerms}
            />
            <TextField
              label="Betalningsvillkor"
              placeholder="Betalningsvillkor…"
              value={paymentTermsText}
              onChange={setPaymentTermsText}
              picker={textsByType.payment_terms}
              onPick={setPaymentTermsText}
            />
          </div>
        </div>
      )}
    </div>
  )
}

const INPUT_CLS =
  'w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function TextField({
  label,
  placeholder,
  value,
  onChange,
  picker,
  onPick,
}: {
  label: string
  placeholder: string
  value: string
  onChange: (s: string) => void
  picker: QuoteStandardText[]
  onPick: (s: string) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</label>
        <StandardTextPicker texts={picker} onSelect={onPick} />
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className={`${INPUT_CLS} resize-y leading-relaxed font-body`}
      />
    </div>
  )
}
