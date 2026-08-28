'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Plus, X, AlertTriangle } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import type { HomeTip } from '@/lib/tasks/lars-tips-batch'

/**
 * DagensPlanExtra — resten av "Dagens plan" under dagens bokningar (2026-08-28):
 * dina uppgifter i dag (förfallna + dagens) och Lars tips över alla projekt.
 * Läser /api/tips/home; skriver bara via befintliga rutter (/api/tasks,
 * /api/projects/[id]/tips). Tyst vid fel — aldrig en påhittad rad.
 */

interface HomeTask {
  id: string
  title: string
  due_date: string | null
  overdue: boolean
  project_id: string | null
  project_number: string | null
  project_name: string | null
}

export default function DagensPlanExtra() {
  const [tasks, setTasks] = useState<HomeTask[]>([])
  const [tasksTotal, setTasksTotal] = useState(0)
  const [tips, setTips] = useState<HomeTip[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tips/home')
      if (!res.ok) return
      const d = await res.json()
      setTasks(d.tasks || [])
      setTasksTotal(d.tasks_total || 0)
      setTips(d.tips || [])
    } catch {
      /* tyst — kortet visar inget hellre än något påhittat */
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function doneTask(t: HomeTask) {
    setBusy(t.id)
    setTasks(prev => prev.filter(x => x.id !== t.id))
    try {
      await fetch('/api/tasks', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, status: 'done' }) })
    } finally {
      setBusy(null)
      load()
    }
  }

  async function decideTip(tip: HomeTip, action: 'accept' | 'dismiss') {
    setBusy(tip.project_id + tip.key)
    setTips(prev => prev.filter(x => !(x.project_id === tip.project_id && x.key === tip.key)))
    try {
      await fetch(`/api/projects/${tip.project_id}/tips`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, key: tip.key, title: tip.title, due_date: tip.dueDate }),
      })
    } finally {
      setBusy(null)
      load()
    }
  }

  if (!loaded || (tasks.length === 0 && tips.length === 0)) return null

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-3" data-testid="dagens-plan-extra">
      {tasks.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-slate-400">Dina uppgifter i dag</span>
            <Link href="/dashboard/tasks" className="text-[12px] font-semibold text-primary-700 hover:text-primary-800">
              {tasksTotal > tasks.length ? `Alla (${tasksTotal}) →` : 'Alla →'}
            </Link>
          </div>
          <div className="flex flex-col gap-1">
            {tasks.map(t => (
              <div key={t.id} className="flex items-center gap-2 min-h-[36px]">
                <button
                  type="button"
                  onClick={() => doneTask(t)}
                  disabled={busy === t.id}
                  aria-label="Markera som klar"
                  className="w-5 h-5 rounded-full border-2 border-slate-300 hover:border-primary-600 text-transparent hover:text-primary-600 inline-flex items-center justify-center shrink-0 disabled:opacity-50"
                >
                  <Check className="w-3 h-3" />
                </button>
                <Link href={t.project_id ? `/dashboard/projects/${t.project_id}?tab=tasks` : '/dashboard/tasks'} className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-slate-900 truncate">{t.title}</span>
                  <span className={`block text-[11.5px] truncate ${t.overdue ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
                    {t.project_number ? `${t.project_number} · ` : ''}{t.overdue ? 'försenad' : 'i dag'}
                  </span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {tips.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <AgentAvatar agentKey="lars" size="sm" />
            <span className="text-[12px] font-semibold text-primary-800">Lars tipsar</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {tips.map(tip => (
              <div key={tip.project_id + tip.key} className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy === tip.project_id + tip.key}
                  onClick={() => decideTip(tip, 'accept')}
                  title="Lägg till som uppgift"
                  className="flex-1 min-w-0 text-left inline-flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary-50/60 border border-primary-100 hover:border-primary-400 disabled:opacity-50 transition"
                >
                  <Plus className="w-3.5 h-3.5 text-primary-700 shrink-0 mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium text-slate-900 truncate">{tip.title}</span>
                    <span className="block text-[11px] text-slate-500 truncate">
                      {tip.booking_today && <AlertTriangle className="inline w-3 h-3 text-amber-600 mr-1 -mt-0.5" />}
                      {tip.project_number ? `${tip.project_number} · ` : ''}{tip.reason}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  disabled={busy === tip.project_id + tip.key}
                  onClick={() => decideTip(tip, 'dismiss')}
                  title="Visa inte det här tipset för projektet"
                  aria-label="Inte aktuellt"
                  className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
