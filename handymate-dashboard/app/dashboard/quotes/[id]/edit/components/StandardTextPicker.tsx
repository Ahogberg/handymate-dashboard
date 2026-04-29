'use client'

import { useState } from 'react'
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
        className="text-xs text-sky-700 hover:text-primary-800 transition-colors"
      >
        Välj standardtext
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-6 z-20 bg-white border border-[#E2E8F0] rounded-lg shadow-lg w-64 max-h-48 overflow-y-auto">
            {texts.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onSelect(t.content)
                  setOpen(false)
                }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-100 last:border-0"
              >
                <span className="font-medium">{t.name}</span>
                {t.is_default && (
                  <span className="ml-1 text-[10px] text-sky-700 bg-primary-50 px-1 rounded">standard</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
