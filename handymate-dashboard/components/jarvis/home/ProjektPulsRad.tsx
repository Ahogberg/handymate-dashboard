'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { RailCard } from '@/components/jarvis/RailCard'

/**
 * Projektpulsen — "en rad per projekt" i högerspalten (Etapp C5,
 * 2026-08-17, tunn version).
 *
 * EN listhämtning (/api/projects) — aldrig N+1 mot profitability. Varje
 * rad visar bara signaler som svaret FAKTISKT bär:
 *
 *   - "klart · ofakturerat" — den härledda livscykeln
 *     (lib/projects/derive-lifecycle.ts, fakturafakta, aldrig
 *     progress_percent). Fasen som ska göra ont: pengar ligger och väntar.
 *   - "{N} d försenad" — end_date har passerat och projektet är inte
 *     avslutat/avbrutet (exakt samma regel som ruttens is_late).
 *   - annars livscykelns egen etikett (Pågår/Planering) — INTE mockupens
 *     "i fas": vi mäter ingen plan-mot-verklighet ännu och påstår den
 *     därför inte (planens skärlista: gantt/prognos är X2-grindat).
 *
 * Signalrader först, max 7 totalt, resten som "+ N utan avvikelser"
 * (avvikelse = någon av signalerna ovan — det är exakt vad vi mätt).
 * Inga aktiva projekt → inget kort.
 */

interface PulsProjekt {
  project_id: string
  name: string | null
  status: string | null
  end_date: string | null
  lifecycle?: { phase: string; label: string; needsAction: boolean } | null
}

interface PulsRad {
  id: string
  namn: string
  signal: 'klart_ofakturerat' | 'forsenad' | null
  etikett: string
  etikettClass: string
  dotClass: string
}

const MAX_RADER = 7

function byggRad(p: PulsProjekt, nu: number): PulsRad {
  const namn = p.name || 'Projekt utan namn'

  if (p.lifecycle?.phase === 'klart_ofakturerat') {
    return {
      id: p.project_id,
      namn,
      signal: 'klart_ofakturerat',
      etikett: 'klart · ofakturerat',
      etikettClass: 'text-red-700',
      dotClass: 'bg-red-500',
    }
  }

  // Samma regel som ruttens is_late — deadline passerad, inte avslutat.
  const forsenadDagar =
    p.end_date && new Date(p.end_date).getTime() < nu &&
    p.status !== 'completed' && p.status !== 'cancelled'
      ? Math.max(1, Math.floor((nu - new Date(p.end_date).getTime()) / 86_400_000))
      : null
  if (forsenadDagar != null) {
    return {
      id: p.project_id,
      namn,
      signal: 'forsenad',
      etikett: `${forsenadDagar} d försenad`,
      etikettClass: 'text-amber-700',
      dotClass: 'bg-amber-500',
    }
  }

  return {
    id: p.project_id,
    namn,
    signal: null,
    etikett: p.lifecycle?.label || 'Pågår',
    etikettClass: 'text-slate-400',
    dotClass: p.lifecycle?.phase === 'planering' ? 'bg-slate-300' : 'bg-emerald-500',
  }
}

export function ProjektPulsRad() {
  const [projekt, setProjekt] = useState<PulsProjekt[] | null>(null)

  useEffect(() => {
    let aktiv = true
    fetch('/api/projects')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (aktiv && d && Array.isArray(d.projects)) setProjekt(d.projects) })
      .catch(() => { /* kortet är grädde, aldrig mjölk */ })
    return () => { aktiv = false }
  }, [])

  if (!projekt) return null

  const nu = Date.now()
  const aktuella = projekt.filter(p => {
    const fas = p.lifecycle?.phase
    return fas === 'planering' || fas === 'pagar' || fas === 'klart_ofakturerat'
  })
  if (aktuella.length === 0) return null

  const rader = aktuella.map(p => byggRad(p, nu))
  // Signalraderna först — det är dem man ska se; ordningen inom respektive
  // grupp är ruttens (senast skapad först).
  const medSignal = rader.filter(r => r.signal !== null)
  const utanSignal = rader.filter(r => r.signal === null)
  const visade = [...medSignal, ...utanSignal].slice(0, MAX_RADER)
  const dolda = rader.length - visade.length
  // "utan avvikelser" är bara sant när ALLA dolda rader saknar signal —
  // döljs en signalrad säger vi bara antalet, aldrig att de är lugna.
  const doldaArLugna = medSignal.length <= visade.filter(r => r.signal !== null).length

  return (
    <RailCard title="Projekten" href="/dashboard/projects">
      <div className="flex flex-col">
        {visade.map((r, i) => (
          <Link
            key={r.id}
            href={`/dashboard/projects/${r.id}`}
            className={`flex items-center gap-2.5 py-2 min-h-[36px] ${i > 0 ? 'border-t border-slate-50' : ''}`}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${r.dotClass}`} aria-hidden />
            <span className="flex-1 min-w-0 text-[13px] text-slate-700 truncate">{r.namn}</span>
            <span className={`text-xs shrink-0 ${r.etikettClass}`}>{r.etikett}</span>
          </Link>
        ))}
        {dolda > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
            <span className="flex-1 text-xs text-slate-400">
              + {dolda} {doldaArLugna ? 'utan avvikelser' : 'till'}
            </span>
            <Link href="/dashboard/projects" className="text-xs font-medium text-primary-700 hover:text-primary-800">
              Alla projekt
            </Link>
          </div>
        )}
      </div>
    </RailCard>
  )
}
