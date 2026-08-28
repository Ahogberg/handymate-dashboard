'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Circle, Plus, AlertTriangle } from 'lucide-react'

/**
 * ProjectTasksBlock — projektets egna arbetsuppgifter på Översikt (2026-08-27).
 *
 * Bakgrund: efter statusbandet (26 aug) var Översikt hela projektvyn i
 * praktiken, och "Att göra" där bestod bara av agenternas godkännandekort +
 * härledda knappar — noll rader ur `task`-tabellen. Uppgiftsytan låg kvar
 * under Planering, efter delmomenten, efter scroll. Hantverkarens egna ord
 * ("Beställ blandaren", "Ring elektrikern") hade ingen plats där dagen börjar.
 *
 * Det här blocket är hantverkarens lista: öppna uppgifter överst, bock direkt,
 * inline-skapande med ansvarig + datum. Agenternas förslag ligger under
 * ("Väntar på ditt OK"). Raderna kommer från sidans `projectTasks` så räknare
 * och flik håller samma sanning; skrivningar går genom /api/tasks.
 */

export interface ProjectTaskLite {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  assigned_user: { id: string; name: string; color?: string } | null
}

interface ProjectTasksBlockProps {
  projectId: string
  tasks: ProjectTaskLite[]
  teamMembers: { id: string; name: string }[]
  /** Anropas efter varje lyckad skrivning så sidan hämtar om. */
  onChanged: () => void | Promise<void>
  /** Öppnar fliken Uppgifter. */
  onOpenAll: () => void
  /** Ökas av "Ny uppgift"-snabbåtgärden → fältet får fokus. */
  focusSignal?: number
  onError?: (message: string) => void
  /** 'own' = anställd utan ledarroll i projektet: ser bara egna. Sägs rakt ut. */
  scope?: 'all' | 'own'
}

const MAX_VISIBLE = 5

function formatDue(iso: string, todayIso: string): { text: string; overdue: boolean; today: boolean } {
  const d = iso.slice(0, 10)
  if (d === todayIso) return { text: 'i dag', overdue: false, today: true }
  const overdue = d < todayIso
  const text = new Date(d).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })
  return { text, overdue, today: false }
}

export default function ProjectTasksBlock({ projectId, tasks, teamMembers, onChanged, onOpenAll, focusSignal = 0, onError, scope = 'all' }: ProjectTasksBlockProps) {
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const todayIso = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    if (focusSignal > 0) inputRef.current?.focus()
  }, [focusSignal])

  const open = tasks.filter(t => t.status !== 'done')
  const done = tasks.filter(t => t.status === 'done')
  // Försenade först, sedan förfallodatum, sedan prioritet.
  const sorted = [...open].sort((a, b) => {
    const ad = a.due_date ? a.due_date.slice(0, 10) : '9999'
    const bd = b.due_date ? b.due_date.slice(0, 10) : '9999'
    if (ad !== bd) return ad < bd ? -1 : 1
    const p = { high: 0, medium: 1, low: 2 }
    return p[a.priority] - p[b.priority]
  })
  const visible = sorted.slice(0, MAX_VISIBLE)
  const hidden = sorted.length - visible.length

  async function create() {
    const t = title.trim()
    if (!t) return
    setSaving(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t, project_id: projectId, assigned_to: assignee || null, due_date: dueDate || null, priority: 'medium', visibility: 'project' }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        onError?.(d.error || 'Kunde inte skapa uppgiften')
        return
      }
      setTitle('')
      setAssignee('')
      setDueDate('')
      await onChanged()
      inputRef.current?.focus()
    } catch {
      onError?.('Kunde inte skapa uppgiften')
    } finally {
      setSaving(false)
    }
  }

  async function toggle(task: ProjectTaskLite) {
    setBusyId(task.id)
    try {
      const res = await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, status: task.status === 'done' ? 'pending' : 'done' }),
      })
      if (!res.ok) { onError?.('Kunde inte uppdatera uppgiften'); return }
      await onChanged()
    } catch {
      onError?.('Kunde inte uppdatera uppgiften')
    } finally {
      setBusyId(null)
    }
  }

  const inputCls = 'h-10 px-3 text-[13.5px] bg-white border border-[#E2E8F0] rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40'

  return (
    <div className="space-y-3" data-testid="project-tasks-block">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-gray-900">Uppgifter</h2>
          {open.length > 0 && (
            <span className="font-heading text-xs font-bold bg-slate-800 text-white rounded-full min-w-[21px] h-[21px] px-1.5 inline-flex items-center justify-center">
              {open.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {scope === 'own' && <span className="text-[12px] text-slate-500">Du ser dina egna uppgifter</span>}
          <button type="button" onClick={onOpenAll} className="text-[13px] font-semibold text-primary-700 hover:text-primary-800">
            {tasks.length > 0 ? `Visa alla (${tasks.length}) →` : 'Öppna fliken →'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl divide-y divide-[#EEF2F6]">
        {visible.map(task => {
          const due = task.due_date ? formatDue(task.due_date, todayIso) : null
          return (
            <div key={task.id} className="flex items-center gap-3 px-4 py-2.5 min-h-[46px]">
              <button
                type="button"
                onClick={() => toggle(task)}
                disabled={busyId === task.id}
                aria-label="Markera som klar"
                className="w-6 h-6 rounded-full border-2 border-slate-300 hover:border-primary-600 text-transparent hover:text-primary-600 inline-flex items-center justify-center flex-shrink-0 transition disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium text-slate-900 truncate">{task.title}</div>
                <div className="text-[12px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                  {task.assigned_user ? <span>{task.assigned_user.name}</span> : <span className="text-slate-400">Ingen ansvarig</span>}
                  {due && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className={due.overdue ? 'text-red-600 font-semibold inline-flex items-center gap-1' : due.today ? 'text-amber-700 font-semibold' : ''}>
                        {due.overdue && <AlertTriangle className="w-3 h-3" />}
                        {due.overdue ? `försenad · ${due.text}` : due.text}
                      </span>
                    </>
                  )}
                  {task.priority === 'high' && <span className="px-1.5 rounded bg-red-50 text-red-700 text-[10.5px] font-semibold">Hög</span>}
                </div>
              </div>
            </div>
          )
        })}
        {hidden > 0 && (
          <button type="button" onClick={onOpenAll} className="w-full text-left px-4 py-2 text-[12.5px] text-slate-500 hover:text-primary-700">
            … {hidden} till
          </button>
        )}
        {open.length === 0 && (
          <div className="px-4 py-3 text-[13px] text-slate-500 flex items-center gap-2">
            <Circle className="w-3.5 h-3.5 text-slate-300" />
            {done.length > 0 ? `Alla ${done.length} uppgifter klara.` : 'Inga uppgifter ännu — skriv den första nedan.'}
          </div>
        )}

        {/* Inline-skapande: titel + ansvarig + datum. Enter skapar. */}
        <form
          onSubmit={e => { e.preventDefault(); create() }}
          className="px-3 py-2.5 flex flex-col sm:flex-row gap-2 bg-slate-50/60 rounded-b-xl"
        >
          <input
            ref={inputRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ny uppgift — t.ex. Beställ blandaren"
            className={`${inputCls} flex-1 min-w-0`}
            data-testid="project-task-new-title"
          />
          <select value={assignee} onChange={e => setAssignee(e.target.value)} className={`${inputCls} sm:w-40`} aria-label="Ansvarig">
            <option value="">Ansvarig…</option>
            {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={`${inputCls} sm:w-40`} aria-label="Förfallodatum" />
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="h-10 px-3.5 inline-flex items-center justify-center gap-1.5 bg-primary-700 hover:bg-primary-800 text-white text-[13px] font-semibold rounded-lg disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {saving ? 'Sparar…' : 'Lägg till'}
          </button>
        </form>
      </div>
    </div>
  )
}
