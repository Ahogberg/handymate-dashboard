'use client'

import { ChevronDown } from 'lucide-react'
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
    <div className="bg-white border-thin border-[#E2E8F0] rounded-xl">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-7 py-4 text-left"
      >
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#475569]">Referenser och texter</span>
        <ChevronDown className={`w-4 h-4 text-[#64748B] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-7 pb-6 space-y-4">
          {/* Reference fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[12px] text-[#64748B] mb-1">Er referens</label>
              <input
                type="text"
                value={referencePerson}
                onChange={e => setReferencePerson(e.target.value)}
                placeholder="Namn"
                className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
              />
            </div>
            <div>
              <label className="block text-[12px] text-[#64748B] mb-1">Kundens referens</label>
              <input
                type="text"
                value={customerReference}
                onChange={e => setCustomerReference(e.target.value)}
                placeholder="Referensnummer"
                className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
              />
            </div>
            <div>
              <label className="block text-[12px] text-[#64748B] mb-1">Arbetsplatsadress</label>
              <AddressAutocomplete
                value={projectAddress}
                onChange={setProjectAddress}
                onSelect={r => setProjectAddress(r.full_address)}
                placeholder="Sök adress..."
                className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
              />
            </div>
          </div>

          {/* Standard texts */}
          <div className="border-t border-thin border-[#E2E8F0] pt-4 space-y-3">
            <TextField
              label="Inledningstext"
              placeholder="Hälsningsfras och inledning..."
              value={introductionText}
              onChange={setIntroductionText}
              picker={textsByType.introduction}
              onPick={setIntroductionText}
            />
            <TextField
              label="Avslutningstext"
              placeholder="Avslutande text..."
              value={conclusionText}
              onChange={setConclusionText}
              picker={textsByType.conclusion}
              onPick={setConclusionText}
            />
            <TextField
              label="Ej inkluderat"
              placeholder="Vad ingår inte..."
              value={notIncluded}
              onChange={setNotIncluded}
              picker={textsByType.not_included}
              onPick={setNotIncluded}
            />
            <TextField
              label="ÄTA-villkor"
              placeholder="Ändrings- och tilläggsarbeten..."
              value={ataTerms}
              onChange={setAtaTerms}
              picker={textsByType.ata_terms}
              onPick={setAtaTerms}
            />
            <TextField
              label="Betalningsvillkor"
              placeholder="Betalningsvillkor..."
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
      <div className="flex items-center justify-between mb-1">
        <label className="block text-[12px] text-[#64748B]">{label}</label>
        <StandardTextPicker texts={picker} onSelect={onPick} />
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E] resize-y"
      />
    </div>
  )
}
