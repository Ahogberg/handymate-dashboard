'use client'

import { Eye } from 'lucide-react'

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
    <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-6 py-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#475569]">Offertstil</span>
        {templateStyle && (
          <button
            type="button"
            onClick={() => setTemplateStyle(null)}
            className="text-[10px] text-[#94A3B8] hover:text-primary-700"
          >
            Återställ till standard
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
              className={`p-2.5 rounded-lg border-2 text-left transition-all ${
                isSelected ? 'border-primary-600 bg-primary-50' : 'border-[#E2E8F0] hover:border-primary-300'
              }`}
            >
              <div className="text-xs font-semibold text-[#1E293B]">{opt.label}</div>
              <div className="text-[10px] text-[#94A3B8]">{opt.tagline}</div>
              {isDefault && <div className="text-[9px] text-primary-700 mt-0.5">Standard</div>}
            </button>
          )
        })}
      </div>
      <a
        href={`/api/quotes/pdf?id=${quoteId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-primary-700 hover:text-primary-800 font-medium"
      >
        <Eye className="w-3 h-3" />
        Förhandsgranska design (sparas först)
      </a>
    </div>
  )
}
