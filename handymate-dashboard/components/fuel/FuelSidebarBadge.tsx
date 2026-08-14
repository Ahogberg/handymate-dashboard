'use client'

import Link from 'next/link'
import { useFuel } from './FuelProvider'

/**
 * Ambient-indikator i Sidebar — tyst tills nivån blir låg. Tre lägen:
 * normal (osynlig), low (gul ring), critical (röd, pulserande ring).
 */
export function FuelSidebarBadge() {
  const { level } = useFuel()
  if (!level || level.state === 'normal') return null

  const critical = level.state === 'critical'
  const color = critical ? '#ef4444' : '#d97706'
  const bg = critical ? '#fee2e2' : '#fde68a'

  return (
    <Link
      href="/dashboard/settings/billing"
      className="relative w-[22px] h-[22px] rounded-full flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: bg }}
      title={`${level.remainingPercent}% bränsle kvar${level.weeksRemaining != null ? `, räcker ~${level.weeksRemaining} veckor` : ''} — klicka för att tanka`}
    >
      <span className="w-3.5 h-3.5 rounded-full" style={{ border: `2px solid ${color}` }} />
      {critical && (
        <span
          className="absolute inset-0 rounded-full fuel-badge-pulse"
          style={{ border: `2px solid ${color}` }}
        />
      )}
    </Link>
  )
}
