'use client'

import { Users } from 'lucide-react'

interface CustomerEmptyStateProps {
  hasSearch: boolean
  onCreate: () => void
}

export function CustomerEmptyState({ hasSearch, onCreate }: CustomerEmptyStateProps) {
  return (
    <div className="text-center py-12">
      <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
      <p className="text-gray-400">{hasSearch ? 'Inga kunder hittades' : 'Inga kunder ännu'}</p>
      {!hasSearch && (
        <button onClick={onCreate} className="mt-4 text-secondary-700 hover:text-primary-700">
          Skapa din första kund →
        </button>
      )}
    </div>
  )
}
