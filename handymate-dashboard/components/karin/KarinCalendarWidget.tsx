'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Loader2 } from 'lucide-react'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import type { CalendarEvent } from '@/lib/karin/calendar'

/**
 * "Karin · kommande 30 dagar" — bolagskalendern på hemskärmen (2026-08-07).
 *
 * ═══ VARFÖR TRETTIO DAGAR OCH INTE NITTIO ═══
 *
 * Kalendersidan visar kvartalet. Widgeten ska svara på en enda fråga — vad
 * ligger närmast — och en lista på tolv datum svarar inte på den. Trettio
 * dagar rymmer nästa moms och nästa arbetsgivardeklaration, vilket är precis
 * det en hantverkare behöver veta utan att öppna något.
 *
 * ═══ NÄR DEN INTE VISAS ═══
 *
 * - För anställda. Moms och bokslut hör till den som driver bolaget.
 * - När profilen saknar uppgifter. Då är kalendern tom av fel skäl, och en
 *   widget som säger "inget på gång" hade varit osann. Kalendersidan ber om
 *   uppgifterna i stället; widgeten tiger.
 * - När inget ligger inom trettio dagar. Ytan hittar aldrig på sysslor.
 *
 * Funktionell yta. **Claude Design ritar den efteråt** — mekanik först, som
 * med Snabbofferten och Jarvis-vyn.
 */

interface Svar {
  missing: string[]
  months: Array<{ key: string; label: string; events: CalendarEvent[] }>
}

function dagarKvar(due: string): number {
  const d = new Date(due + 'T12:00:00')
  const i = new Date()
  return Math.round((d.getTime() - new Date(i.getFullYear(), i.getMonth(), i.getDate()).getTime()) / 86400000)
}

function nedrakning(due: string): string {
  const n = dagarKvar(due)
  if (n < 0) return 'försenad'
  if (n === 0) return 'idag'
  if (n === 1) return 'i morgon'
  return `${n} dgr`
}

export function KarinCalendarWidget() {
  const { isOwnerOrAdmin, loading: userLoading } = useCurrentUser()
  const [data, setData] = useState<Svar | null>(null)
  const [laddar, setLaddar] = useState(true)

  useEffect(() => {
    if (userLoading || !isOwnerOrAdmin) return
    let aktiv = true
    fetch('/api/karin/calendar?days=30')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (aktiv && d) setData(d) })
      .catch(() => { /* widgeten är aldrig kritisk */ })
      .finally(() => { if (aktiv) setLaddar(false) })
    return () => { aktiv = false }
  }, [userLoading, isOwnerOrAdmin])

  if (userLoading || !isOwnerOrAdmin) return null

  if (laddar) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center justify-between text-sm font-semibold text-slate-900 mb-3 min-h-[24px]">
          Bolagskalendern
        </div>
        <div className="h-10 bg-slate-50 rounded-lg animate-pulse" />
      </div>
    )
  }

  // Saknas uppgifter är kalendern tom av fel skäl. Hellre tyst än osann.
  if (!data || data.missing.length > 0) return null

  const kommande = data.months.flatMap(m => m.events).slice(0, 4)
  if (kommande.length === 0) return null

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <Link
        href="/dashboard/karin"
        className="flex items-center justify-between text-sm font-semibold text-slate-900 mb-2 min-h-[44px] -mt-2 -mx-1 px-1"
      >
        Bolagskalendern
        <ChevronRight className="w-4 h-4 text-slate-300" />
      </Link>

      <div className="flex flex-col gap-2.5">
        {kommande.map(e => {
          const forsenad = dagarKvar(e.due_date) < 0
          return (
            <div key={e.id} className="flex items-center gap-2.5">
              <span className="font-heading text-[13px] text-primary-700 w-11 shrink-0 tabular-nums">
                {new Date(e.due_date + 'T12:00:00').toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
              </span>
              <span className="w-[3px] h-8 rounded-sm bg-primary-500 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900 truncate">{e.title}</span>
                <span className="block text-xs text-slate-400 truncate">{e.authority}</span>
              </span>
              <span className={`text-xs shrink-0 whitespace-nowrap ${forsenad ? 'text-amber-700 font-semibold' : 'text-slate-400'}`}>
                {nedrakning(e.due_date)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
