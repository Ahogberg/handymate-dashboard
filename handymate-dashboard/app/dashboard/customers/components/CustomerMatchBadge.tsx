'use client'

import type { DuplicateGroup } from './types'

interface CustomerMatchBadgeProps {
  matchType: DuplicateGroup['match_type']
}

/**
 * Badge som visar vilken typ av match en dubblett-grupp har. Lila-färgen
 * för 'email' är en designsystem-avvikelse som åtgärdas i DEL 2.
 */
export function CustomerMatchBadge({ matchType }: CustomerMatchBadgeProps) {
  const cfg = {
    phone: { label: 'Samma telefon', cls: 'bg-primary-100 text-primary-700' },
    email: { label: 'Samma e-post', cls: 'bg-purple-100 text-purple-700' },
    name_address: { label: 'Samma namn + adress', cls: 'bg-amber-100 text-amber-700' },
  }[matchType]

  return (
    <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}
