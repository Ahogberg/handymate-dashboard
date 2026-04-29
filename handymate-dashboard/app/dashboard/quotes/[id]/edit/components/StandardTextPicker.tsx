'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { QuoteStandardText } from '@/lib/types/quote'

interface StandardTextPickerProps {
  texts: QuoteStandardText[]
  onSelect: (content: string) => void
}

export function StandardTextPicker({ texts, onSelect }: StandardTextPickerProps) {
  const [open, setOpen] = useState(false)

  if (texts.length === 0) return null

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-xs text-primary-700 hover:text-primary-600 transition-colors"
      >
        Välj standardtext
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-6 z-20 bg-white border border-slate-200 rounded-xl shadow-lg w-64 max-h-48 overflow-y-auto py-1">
            {texts.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onSelect(t.content)
                  setOpen(false)
                }}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
              >
                <span className="font-medium truncate">{t.name}</span>
                {t.is_default && (
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded">
                    Standard
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
