/**
 * Projektets datumrad — REN härledning (2026-08-26, projektöversikten Del A).
 *
 * Projektlistan visade bara nästa milstolpes förfallodag; start_date/
 * end_date renderades aldrig trots att de finns på raden. Den här funktionen
 * formulerar EN ärlig datumrad ur det som faktiskt är känt:
 *
 *   planerat start/slut   project.start_date / project.end_date (användarsatta)
 *   faktisk start         första tidrapporten eller första bekräftade
 *                         bokningsstarten (härleds i GET /api/projects,
 *                         lagras aldrig)
 *   klart                 project.completed_at
 *
 * Regler: ingen gissning. Saknas slutdatum står det "Slut ej satt", inte ett
 * påhittat datum. "Försenad" kräver ett passerat end_date OCH att projektet
 * inte är klart/avbrutet. weekChip (ProjectStatusCard) återanvänds för
 * "vecka X av Y" — en beräkning, två ytor.
 */

/** "Vecka X av Y" ur projektets start/slutdatum. Flyttad hit från
    ProjectStatusCard (2026-08-26) så både API-lagret (GET /api/projects) och
    komponenterna delar EN beräkning utan att servern importerar en
    'use client'-modul. ProjectStatusCard re-exporterar den. */
export function weekChip(start: string | null | undefined, end: string | null | undefined): string | null {
  if (!start || !end) return null
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return null
  const now = Date.now()
  const totalWeeks = Math.max(1, Math.ceil((e - s) / (7 * 86400000)))
  const elapsedWeeks = Math.min(totalWeeks, Math.max(1, Math.ceil((now - s) / (7 * 86400000))))
  return `Vecka ${elapsedWeeks} av ${totalWeeks}`
}

export interface ProjectDateInput {
  status?: string | null
  start_date?: string | null
  end_date?: string | null
  completed_at?: string | null
  /** Första faktiska arbetsdagen (ISO-datum), härledd — aldrig lagrad. */
  actual_start?: string | null
}

export type ProjectDateTone = 'neutral' | 'upcoming' | 'late' | 'done' | 'cancelled'

export interface ProjectDateLine {
  /** Huvudtexten, t.ex. "12 aug – 30 sep" eller "Klart 14 aug". */
  label: string
  /** Kompletterande, t.ex. "vecka 3 av 7" eller "startade 14 aug (planerat 12 aug)". */
  sublabel: string | null
  tone: ProjectDateTone
  is_late: boolean
  days_late: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function dag(iso: string, withYear = false): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
}

function dagStart(iso: string): number {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? NaN : new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function deriveProjectDates(p: ProjectDateInput, now: Date = new Date()): ProjectDateLine {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const status = p.status || ''

  if (status === 'cancelled') {
    return { label: 'Avbrutet', sublabel: p.start_date ? `planerat ${dag(p.start_date)}` : null, tone: 'cancelled', is_late: false, days_late: 0 }
  }

  if (status === 'completed' || p.completed_at) {
    const klart = p.completed_at ? `Klart ${dag(p.completed_at)}` : 'Klart'
    let sub: string | null = null
    if (p.end_date && p.completed_at) {
      const diff = Math.round((dagStart(p.completed_at) - dagStart(p.end_date)) / DAY_MS)
      if (Number.isFinite(diff) && diff > 0) sub = `${diff} dagar efter planerat slut`
      else if (Number.isFinite(diff) && diff < 0) sub = `${-diff} dagar före planerat slut`
      else if (Number.isFinite(diff)) sub = 'på planerat slutdatum'
    }
    return { label: klart, sublabel: sub, tone: 'done', is_late: false, days_late: 0 }
  }

  const endMs = p.end_date ? dagStart(p.end_date) : NaN
  const startMs = p.start_date ? dagStart(p.start_date) : NaN
  const isLate = Number.isFinite(endMs) && endMs < today
  const daysLate = isLate ? Math.round((today - endMs) / DAY_MS) : 0

  // Huvudtext: planerat spann.
  let label: string
  if (p.start_date && p.end_date) label = `${dag(p.start_date)} – ${dag(p.end_date)}`
  else if (p.start_date) label = Number.isFinite(startMs) && startMs > today ? `Startar ${dag(p.start_date)}` : `Start ${dag(p.start_date)} · slut ej satt`
  else if (p.end_date) label = `Klart senast ${dag(p.end_date)}`
  else label = p.actual_start ? `Startade ${dag(p.actual_start)}` : 'Inga datum satta'

  // Undertext: faktisk start vs planerad, annars vecka X av Y.
  const parts: string[] = []
  if (p.actual_start && p.start_date) {
    const a = dagStart(p.actual_start)
    if (Number.isFinite(a) && Number.isFinite(startMs) && Math.abs(a - startMs) >= DAY_MS) {
      parts.push(`startade ${dag(p.actual_start)} (planerat ${dag(p.start_date)})`)
    }
  } else if (p.actual_start && !p.start_date && (p.end_date)) {
    parts.push(`startade ${dag(p.actual_start)}`)
  }
  if (isLate) {
    parts.push(daysLate === 1 ? 'försenad 1 dag' : `försenad ${daysLate} dagar`)
  } else {
    const vecka = weekChip(p.start_date, p.end_date)
    if (vecka && Number.isFinite(startMs) && startMs <= today) parts.push(vecka.toLowerCase())
  }

  const tone: ProjectDateTone = isLate
    ? 'late'
    : Number.isFinite(startMs) && startMs > today
      ? 'upcoming'
      : 'neutral'

  return { label, sublabel: parts.length ? parts.join(' · ') : null, tone, is_late: isLate, days_late: daysLate }
}
