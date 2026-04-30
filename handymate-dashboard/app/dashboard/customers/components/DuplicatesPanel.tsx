'use client'

import { AlertTriangle, CheckCircle } from 'lucide-react'
import { CustomerMatchBadge } from './CustomerMatchBadge'
import type { DuplicateGroup } from './types'

interface DuplicatesPanelProps {
  duplicates: DuplicateGroup[]
  actionLoading: boolean
  onMerge: (keepId: string, mergeIds: string[]) => void
}

export function DuplicatesPanel({ duplicates, actionLoading, onMerge }: DuplicatesPanelProps) {
  if (duplicates.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl py-14 px-6 text-center">
        <div className="w-12 h-12 rounded-full bg-green-50 text-green-700 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-5 h-5" />
        </div>
        <p className="text-sm font-medium text-slate-700 mb-1">Inga dubbletter hittades</p>
        <p className="text-xs text-slate-500">Alla kunder verkar vara unika.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-4.5 h-4.5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-heading text-sm font-bold text-amber-900 tracking-tight">
            Potentiella dubbletter hittade
          </p>
          <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
            {duplicates.length} grupp{duplicates.length !== 1 ? 'er' : ''} med möjliga dubbletter. Granska och slå
            ihop vid behov.
          </p>
        </div>
      </div>
      {duplicates.map((group, gi) => (
        <div key={gi} className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <CustomerMatchBadge matchType={group.match_type} />
          </div>
          <div className="space-y-2">
            {group.customers.map(c => (
              <div
                key={c.customer_id}
                className="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-slate-900 truncate">{c.name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {c.phone_number} {c.email && `· ${c.email}`}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Skapad {new Date(c.created_at).toLocaleDateString('sv-SE')}
                  </p>
                </div>
                <button
                  onClick={() =>
                    onMerge(
                      c.customer_id,
                      group.customers.filter(o => o.customer_id !== c.customer_id).map(o => o.customer_id),
                    )
                  }
                  disabled={actionLoading}
                  className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 text-slate-700 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  Behåll denna
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
