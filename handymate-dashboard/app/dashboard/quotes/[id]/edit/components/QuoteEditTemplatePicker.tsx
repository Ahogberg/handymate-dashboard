'use client'

import { Check, Eye } from 'lucide-react'

type TemplateStyle = 'modern' | 'premium' | 'friendly'

interface QuoteEditTemplatePickerProps {
  quoteId: string
  templateStyle: TemplateStyle | null
  setTemplateStyle: (s: TemplateStyle | null) => void
  businessDefaultStyle: TemplateStyle
}

const OPTIONS: ReadonlyArray<{ id: TemplateStyle; label: string; tagline: string }> = [
  { id: 'modern', label: 'Modern', tagline: 'Ren & tidlös' },
  { id: 'premium', label: 'Premium', tagline: 'Påkostad' },
  { id: 'friendly', label: 'Friendly', tagline: 'Varm' },
]

export function QuoteEditTemplatePicker({
  quoteId,
  templateStyle,
  setTemplateStyle,
  businessDefaultStyle,
}: QuoteEditTemplatePickerProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Offertstil</p>
        {templateStyle && (
          <button
            type="button"
            onClick={() => setTemplateStyle(null)}
            className="text-xs text-slate-500 hover:text-primary-700 transition-colors"
          >
            Återställ
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map(opt => {
          const effective = templateStyle || businessDefaultStyle
          const isSelected = effective === opt.id
          const isDefault = !templateStyle && businessDefaultStyle === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTemplateStyle(opt.id)}
              className={`relative p-3 rounded-xl border text-left transition-all ${
                isSelected
                  ? 'border-primary-700 bg-primary-50 shadow-sm'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {isSelected && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary-700 text-white inline-flex items-center justify-center">
                  <Check className="w-2.5 h-2.5" strokeWidth={3} />
                </span>
              )}
              <div className={`text-xs font-bold tracking-tight ${isSelected ? 'text-primary-700' : 'text-slate-900'}`}>
                {opt.label}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">{opt.tagline}</div>
              {isDefault && (
                <div className="text-[9px] font-semibold uppercase tracking-wider text-primary-700 mt-1.5">
                  Standard
                </div>
              )}
            </button>
          )
        })}
      </div>
      <a
        href={`/api/quotes/pdf?id=${quoteId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-600 transition-colors"
      >
        <Eye className="w-3 h-3" />
        Förhandsgranska design (sparas först)
      </a>
    </div>
  )
}
