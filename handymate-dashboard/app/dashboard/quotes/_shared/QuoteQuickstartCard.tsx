'use client'

import { Bookmark, Plus, Sparkles } from 'lucide-react'

export interface QuickstartRow {
  name: string
  unit: string
  sales_price: number
  category_slug: string
  is_rot_eligible: boolean
  is_rut_eligible: boolean
}

/**
 * Branschneutrala defaults som täcker 80%+ av en hantverkares offerter.
 * Klick på en rad lägger till den i offerten. Användaren kan sedan klicka
 * bookmark-ikonen för att även spara raden i sin prislista (kvarstår
 * mellan offerter).
 */
export const QUICKSTART_ROWS: ReadonlyArray<QuickstartRow> = [
  {
    name: 'Startavgift',
    unit: 'st',
    sales_price: 500,
    category_slug: 'ovrigt',
    is_rot_eligible: false,
    is_rut_eligible: false,
  },
  {
    name: 'Arbetstid hantverkare',
    unit: 'tim',
    sales_price: 650,
    category_slug: 'arbete_bygg',
    is_rot_eligible: true,
    is_rut_eligible: false,
  },
  {
    name: 'Material — efter åtgång',
    unit: 'st',
    sales_price: 0,
    category_slug: 'material_bygg',
    is_rot_eligible: false,
    is_rut_eligible: false,
  },
  {
    name: 'Framkörning',
    unit: 'st',
    sales_price: 350,
    category_slug: 'ovrigt',
    is_rot_eligible: false,
    is_rut_eligible: false,
  },
  {
    name: 'Bortforsling avfall',
    unit: 'st',
    sales_price: 800,
    category_slug: 'ovrigt',
    is_rot_eligible: false,
    is_rut_eligible: false,
  },
]

interface QuoteQuickstartCardProps {
  onAddRow: (row: QuickstartRow) => void
}

/**
 * Snabbstart-kort för hantverkare som inte har byggt sin prislista än.
 * Renderas av orchestrators när items.length === 0 && productsCount === 0.
 */
export function QuoteQuickstartCard({ onAddRow }: QuoteQuickstartCardProps) {
  return (
    <div className="bg-gradient-to-br from-primary-50 via-white to-white border border-primary-100 rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-full bg-primary-700 text-white flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4.5 h-4.5" />
        </div>
        <div>
          <h2 className="font-heading text-base font-bold text-slate-900 tracking-tight">Snabbstart</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Vanliga rader — klicka för att lägga till i offerten
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {QUICKSTART_ROWS.map(row => (
          <button
            key={row.name}
            type="button"
            onClick={() => onAddRow(row)}
            className="flex items-center justify-between gap-3 px-3 py-2.5 bg-white border border-slate-200 hover:border-primary-300 hover:bg-primary-50/40 rounded-xl text-left transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{row.name}</p>
              <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                1 {row.unit}
                {row.sales_price > 0 && ` × ${row.sales_price} kr`}
                {row.is_rot_eligible && (
                  <span className="ml-1.5 text-primary-700 font-semibold uppercase tracking-wider">
                    · ROT
                  </span>
                )}
              </p>
            </div>
            <Plus className="w-4 h-4 text-slate-400 group-hover:text-primary-700 flex-shrink-0" />
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-500 mt-4 leading-relaxed flex items-center gap-1.5">
        <Bookmark className="w-3 h-3 flex-shrink-0" />
        Tips — klicka bookmark-ikonen på en rad efter du lagt till den för att spara den i din prislista.
      </p>
    </div>
  )
}
