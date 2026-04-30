'use client'

import type { DuplicateGroup } from './types'

interface CustomerMatchBadgeProps {
  matchType: DuplicateGroup['match_type']
}

/**
 * Badge som visar vilken typ av match en dubblett-grupp har.
 * Designsystem-konform: tre neutrala/semantiska toner istället för
 * det tidigare avvikande lila för 'email'.
 */
export function CustomerMatchBadge({ matchType }: CustomerMatchBadgeProps) {
  const cfg = {
    phone: { label: 'Samma telefon', cls: 'bg-primary-50 text-primary-700 border border-primary-100' },
    email: { label: 'Samma e-post', cls: 'bg-blue-50 text-blue-700 border border-blue-100' },
    name_address: { label: 'Samma namn + adress', cls: 'bg-amber-50 text-amber-700 border border-amber-100' },
  }[matchType]

  return (
    <span className={`px-2.5 py-0.5 text-[11px] rounded-full font-semibold uppercase tracking-wider ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}
