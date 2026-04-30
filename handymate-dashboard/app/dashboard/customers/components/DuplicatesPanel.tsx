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
  return (
    <div className="space-y-4">
      {duplicates.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
          <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
          <p className="text-gray-500">Inga dubbletter hittades!</p>
          <p className="text-sm text-gray-400 mt-1">Alla kunder verkar vara unika.</p>
        </div>
      ) : (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">Potentiella dubbletter hittade</p>
              <p className="text-sm text-amber-600 mt-1">
                {duplicates.length} grupp(er) med möjliga dubbletter. Granska och slå ihop vid behov.
              </p>
            </div>
          </div>
          {duplicates.map((group, gi) => (
            <div key={gi} className="bg-white rounded-xl border border-[#E2E8F0] p-5">
              <div className="flex items-center gap-2 mb-4">
                <CustomerMatchBadge matchType={group.match_type} />
              </div>
              <div className="space-y-3">
                {group.customers.map(c => (
                  <div key={c.customer_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div>
                      <p className="font-medium text-gray-900">{c.name}</p>
                      <p className="text-sm text-gray-500">
                        {c.phone_number} {c.email && `· ${c.email}`}
                      </p>
                      <p className="text-xs text-gray-400">
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
                      className="px-3 py-1.5 text-xs font-medium bg-primary-50 text-secondary-700 border border-[#E2E8F0] rounded-lg hover:bg-primary-100 disabled:opacity-50"
                    >
                      Behåll denna
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
