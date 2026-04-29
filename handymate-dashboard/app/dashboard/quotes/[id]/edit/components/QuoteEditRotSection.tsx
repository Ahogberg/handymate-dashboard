'use client'

import type { QuoteItem } from '@/lib/types/quote'

interface QuoteEditRotSectionProps {
  items: QuoteItem[]
  setItems: React.Dispatch<React.SetStateAction<QuoteItem[]>>
  hasRotItems: boolean
  personnummer: string
  setPersonnummer: (s: string) => void
  fastighetsbeteckning: string
  setFastighetsbeteckning: (s: string) => void
}

/**
 * ROT-avdrag-toggle + personnummer/fastighet-fält. Klick på toggle
 * sätter is_rot_eligible på alla rader (eller plockar bort när AV).
 */
export function QuoteEditRotSection({
  items,
  setItems,
  hasRotItems,
  personnummer,
  setPersonnummer,
  fastighetsbeteckning,
  setFastighetsbeteckning,
}: QuoteEditRotSectionProps) {
  return (
    <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-7 py-6">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => {
          if (hasRotItems) {
            setItems(prev => prev.map(item => ({ ...item, is_rot_eligible: false })))
          } else {
            setItems(prev =>
              prev.map(item => ({
                ...item,
                is_rot_eligible: item.item_type === 'item' && item.unit === 'tim',
              })),
            )
          }
        }}
      >
        <span className="text-[13px] text-[#1E293B]">ROT-avdrag</span>
        <div className={`w-9 h-5 rounded-full relative transition-colors ${hasRotItems ? 'bg-[#0F766E]' : 'bg-[#CBD5E1]'}`}>
          <div className={`absolute w-3.5 h-3.5 bg-white rounded-full top-[3px] transition-all ${hasRotItems ? 'left-[19px]' : 'left-[3px]'}`} />
        </div>
      </div>
      {hasRotItems && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[12px] text-[#64748B] mb-1">Personnummer</label>
            <input
              type="text"
              value={personnummer}
              onChange={e => setPersonnummer(e.target.value)}
              placeholder="YYYYMMDD-XXXX"
              className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
            />
          </div>
          <div>
            <label className="block text-[12px] text-[#64748B] mb-1">Fastighetsbeteckning</label>
            <input
              type="text"
              value={fastighetsbeteckning}
              onChange={e => setFastighetsbeteckning(e.target.value)}
              placeholder="T.ex. Stockholm Söder 1:23"
              className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
            />
          </div>
          <p className="text-[12px] text-[#0F766E] sm:col-span-2">
            Kunden betalar 70% — Skatteverket betalar resterande 30% direkt till dig.
          </p>
        </div>
      )}
    </div>
  )
}
