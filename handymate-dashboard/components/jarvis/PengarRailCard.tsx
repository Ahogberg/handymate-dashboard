'use client'

import { useEffect, useState } from 'react'
import { RailCard } from '@/components/jarvis/RailCard'
import { formatKr } from '@/lib/moments/derive'
import type { PengarSummary } from '@/lib/value/pengar-pa-bordet'

/**
 * Hemskärmens ingång till Pengar på bordet.
 *
 * Samma tystnadsregler som kalenderwidgeten: renderar ingenting för
 * anställda (API:et svarar 403), ingenting vid fel, och ingenting när
 * bordet är tomt — ett kort med "0 kr" hade varit brus, och tomt bord är
 * ett bra besked som inte behöver ta plats i högerspalten.
 */
export function PengarRailCard() {
  const [data, setData] = useState<PengarSummary | null>(null)

  useEffect(() => {
    let aktiv = true
    fetch('/api/dashboard/pengar')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (aktiv && d) setData(d) })
      .catch(() => { /* kortet är grädde, aldrig mjölk */ })
    return () => { aktiv = false }
  }, [])

  if (!data || data.totalKr <= 0) return null

  return (
    <RailCard title="Pengar på bordet" href="/dashboard/pengar">
      <span className="block font-heading text-2xl font-bold text-slate-900">
        {formatKr(data.totalKr)}
      </span>
      <span className="block text-xs text-slate-500 mt-0.5">
        identifierad potential i {data.kategorier.length} kategorier
      </span>
    </RailCard>
  )
}

export default PengarRailCard
