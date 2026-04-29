'use client'

import { ChevronDown, LayoutTemplate } from 'lucide-react'
import TemplateSelector from '@/components/quotes/TemplateSelector'

interface QuoteNewTemplatePanelProps {
  open: boolean
  setOpen: (b: boolean) => void
  onSelect: (template: any) => void
}

export function QuoteNewTemplatePanel({ open, setOpen, onSelect }: QuoteNewTemplatePanelProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50/50 transition-colors"
      >
        <div className="w-9 h-9 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
          <LayoutTemplate className="w-4.5 h-4.5" />
        </div>
        <h2 className="font-heading text-base font-bold text-slate-900 tracking-tight flex-1">Mallar</h2>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-2 pb-3 border-t border-slate-100 pt-3">
          <TemplateSelector onSelect={onSelect} onBack={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}
