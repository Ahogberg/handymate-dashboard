'use client'

import Link from 'next/link'
import { Plus, Upload, Users } from 'lucide-react'

interface CustomerEmptyStateProps {
  hasSearch: boolean
  onCreate: () => void
}

export function CustomerEmptyState({ hasSearch, onCreate }: CustomerEmptyStateProps) {
  if (hasSearch) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl py-12 px-6 text-center">
        <Users className="w-10 h-10 text-slate-300 mx-auto mb-4" strokeWidth={1.5} />
        <p className="text-sm text-slate-500">Inga kunder matchade din sökning</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl py-14 px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center mx-auto mb-4">
        <Users className="w-5 h-5" />
      </div>
      <h3 className="font-heading text-base font-bold text-slate-900 tracking-tight mb-1">Inga kunder än</h3>
      <p className="text-sm text-slate-500 mb-5 max-w-sm mx-auto leading-relaxed">
        Importera dina befintliga kunder från Excel/CSV — eller lägg till manuellt.
      </p>
      <div className="inline-flex items-center gap-2 flex-wrap justify-center">
        <Link
          href="/dashboard/customers/import"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-primary-700 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
        >
          <Upload className="w-3.5 h-3.5" />
          Importera kunder
        </Link>
        <button
          onClick={onCreate}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Lägg till manuellt
        </button>
      </div>
    </div>
  )
}
