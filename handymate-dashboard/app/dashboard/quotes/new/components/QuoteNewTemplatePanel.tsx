'use client'

import { ChevronDown } from 'lucide-react'
import TemplateSelector from '@/components/quotes/TemplateSelector'

interface QuoteNewTemplatePanelProps {
  open: boolean
  setOpen: (b: boolean) => void
  onSelect: (template: any) => void
}

export function QuoteNewTemplatePanel({ open, setOpen, onSelect }: QuoteNewTemplatePanelProps) {
  return (
    <div className="bg-white border-thin border-[#E2E8F0] rounded-xl">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#475569]">Mallar</span>
        <ChevronDown className={`w-4 h-4 text-[#64748B] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-2 pb-3">
          <TemplateSelector onSelect={onSelect} onBack={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}
