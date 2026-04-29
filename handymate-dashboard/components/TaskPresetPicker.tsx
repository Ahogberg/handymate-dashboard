'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Loader2, X, Calendar, User as UserIcon, Wand2 } from 'lucide-react'
import { TASK_PRESETS, TASK_PRESET_CATEGORIES, type TaskPreset } from '@/lib/task-presets'

export interface PickedTask {
  /** Visningstitel + det som hamnar i task.title */
  title: string
  /** business_users.id eller null */
  assigned_to: string | null
  /** ISO yyyy-mm-dd eller null */
  due_date: string | null
  /** Ärvd från preset om satt, annars 'medium' (defaultas serverside) */
  priority?: 'low' | 'medium' | 'high'
}

interface TeamMember {
  id: string
  name: string
  color?: string | null
}

interface TaskPresetPickerProps {
  /** Visas som modal när true */
  open: boolean
  /** Stäng modalen */
  onClose: () => void
  /**
   * Anropas med valda tasks (presets + custom) inkl. assignee + deadline.
   * Parent ansvarar för att POSTa till /api/tasks/batch.
   */
  onCreate: (tasks: PickedTask[]) => Promise<void> | void
  /** Visas i headern, t.ex. "Deal: Renovering villa Karlsson" */
  contextLabel?: string
  /** Förladdat team — om saknas hämtas från /api/team */
  teamMembers?: TeamMember[]
  /** Förvald deadline-default (ISO yyyy-mm-dd). T.ex. nu + 7 dagar. */
  defaultDueDate?: string
  /** Förvald assignee — t.ex. den inloggade användarens business_user_id */
  defaultAssignedTo?: string | null
}

/**
 * Multi-select picker för task-biblioteket. Per task kan hantverkaren
 * välja deadline + tilldelad person. En "Tilldela alla"-rad ovanför
 * listan låter dem fylla i samma värde på alla valda items i ett klick.
 *
 * Custom-uppgifter (utanför biblioteket) skrivs i en separat input och
 * får samma per-task-controls som presets.
 */
export default function TaskPresetPicker({
  open,
  onClose,
  onCreate,
  contextLabel,
  teamMembers: teamProp,
  defaultDueDate,
  defaultAssignedTo,
}: TaskPresetPickerProps) {
  // Map<key, PickedTask> där key = preset.key eller `custom:${idx}` för egna
  const [picked, setPicked] = useState<Map<string, PickedTask>>(new Map())
  const [customInput, setCustomInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [team, setTeam] = useState<TeamMember[]>(teamProp || [])

  // Bulk-fält
  const [bulkAssignee, setBulkAssignee] = useState<string>(defaultAssignedTo || '')
  const [bulkDueDate, setBulkDueDate] = useState<string>(defaultDueDate || '')

  // Reset state varje gång modalen öppnas så användaren startar fräsch
  useEffect(() => {
    if (open) {
      setPicked(new Map())
      setCustomInput('')
      setBulkAssignee(defaultAssignedTo || '')
      setBulkDueDate(defaultDueDate || '')
    }
  }, [open, defaultAssignedTo, defaultDueDate])

  // Hämta team om inte förladdat
  useEffect(() => {
    if (!open || teamProp || team.length > 0) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/team')
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        const members: TeamMember[] = (data.members || [])
          .filter((m: any) => m.is_active && m.accepted_at)
          .map((m: any) => ({ id: m.id, name: m.name, color: m.color }))
        setTeam(members)
      } catch { /* non-blocking */ }
    })()
    return () => { cancelled = true }
  }, [open, teamProp, team.length])

  if (!open) return null

  const totalSelected = picked.size

  function isPicked(key: string) {
    return picked.has(key)
  }

  function togglePreset(preset: TaskPreset) {
    setPicked(prev => {
      const next = new Map(prev)
      if (next.has(preset.key)) {
        next.delete(preset.key)
      } else {
        next.set(preset.key, {
          title: preset.title,
          assigned_to: bulkAssignee || null,
          due_date: bulkDueDate || null,
          priority: preset.priority,
        })
      }
      return next
    })
  }

  function addCustom() {
    const t = customInput.trim()
    if (!t) return
    setPicked(prev => {
      const next = new Map(prev)
      // Unik key för custom — använd timestamp så den inte krockar
      const key = `custom:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`
      next.set(key, {
        title: t,
        assigned_to: bulkAssignee || null,
        due_date: bulkDueDate || null,
      })
      return next
    })
    setCustomInput('')
  }

  function removeItem(key: string) {
    setPicked(prev => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }

  function updateItem(key: string, patch: Partial<PickedTask>) {
    setPicked(prev => {
      const next = new Map(prev)
      const cur = next.get(key)
      if (!cur) return prev
      next.set(key, { ...cur, ...patch })
      return next
    })
  }

  /** Applicera bulk-värden på alla valda items */
  function applyBulkToAll() {
    if (!bulkAssignee && !bulkDueDate) return
    setPicked(prev => {
      const next = new Map(prev)
      next.forEach((task, key) => {
        next.set(key, {
          ...task,
          ...(bulkAssignee ? { assigned_to: bulkAssignee } : {}),
          ...(bulkDueDate ? { due_date: bulkDueDate } : {}),
        })
      })
      return next
    })
  }

  async function handleSave() {
    if (totalSelected === 0) return
    setSaving(true)
    try {
      const tasks: PickedTask[] = Array.from(picked.values())
      await onCreate(tasks)
      // Reset + stäng efter framgång
      setPicked(new Map())
      setCustomInput('')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Lägg till uppgifter</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {contextLabel ? `Skapas på: ${contextLabel}` : 'Kryssa i de uppgifter du vill skapa'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Bulk-rad */}
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Tilldela alla
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <UserIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select
                value={bulkAssignee}
                onChange={e => setBulkAssignee(e.target.value)}
                className="w-full pl-8 pr-3 py-2 border border-[#E2E8F0] rounded-lg text-sm bg-white focus:border-primary-700 focus:outline-none"
              >
                <option value="">Tilldela till…</option>
                {team.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="relative flex-1 min-w-[160px]">
              <Calendar className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="date"
                value={bulkDueDate}
                onChange={e => setBulkDueDate(e.target.value)}
                className="w-full pl-8 pr-3 py-2 border border-[#E2E8F0] rounded-lg text-sm bg-white focus:border-primary-700 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={applyBulkToAll}
              disabled={totalSelected === 0 || (!bulkAssignee && !bulkDueDate)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-primary-700 border border-primary-300 rounded-lg hover:bg-primary-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Använd ovanstående värden på alla valda uppgifter"
            >
              <Wand2 className="w-3.5 h-3.5" />
              Använd på alla valda
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {TASK_PRESET_CATEGORIES.map(cat => {
            const presets = TASK_PRESETS.filter(p => p.category === cat.key)
            return (
              <div key={cat.key}>
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  {cat.label}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {presets.map(p => (
                    <PresetRow
                      key={p.key}
                      preset={p}
                      picked={picked.get(p.key)}
                      isPicked={isPicked(p.key)}
                      team={team}
                      onToggle={() => togglePreset(p)}
                      onUpdate={patch => updateItem(p.key, patch)}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {/* Egna uppgifter */}
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Egna uppgifter
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
                placeholder="Lägg till egen uppgift…"
                className="flex-1 px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:border-primary-700 focus:outline-none"
              />
              <button
                type="button"
                onClick={addCustom}
                disabled={!customInput.trim()}
                className="flex items-center gap-1 px-3 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {/* Lista över custom items i picked-Map */}
            <CustomList
              picked={picked}
              team={team}
              onUpdate={updateItem}
              onRemove={removeItem}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-gray-100">
          <span className="text-sm text-gray-500">
            {totalSelected === 0
              ? 'Inga uppgifter valda'
              : `${totalSelected} ${totalSelected === 1 ? 'uppgift' : 'uppgifter'} vald${totalSelected === 1 ? '' : 'a'}`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Avbryt
            </button>
            <button
              onClick={handleSave}
              disabled={totalSelected === 0 || saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Lägg till {totalSelected > 0 && `(${totalSelected})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-komponenter ──────────────────────────────────────────────────────

interface PresetRowProps {
  preset: TaskPreset
  picked: PickedTask | undefined
  isPicked: boolean
  team: TeamMember[]
  onToggle: () => void
  onUpdate: (patch: Partial<PickedTask>) => void
}

function PresetRow({ preset, picked, isPicked, team, onToggle, onUpdate }: PresetRowProps) {
  return (
    <div
      className={`rounded-lg transition-colors ${
        isPicked ? 'bg-primary-50 border-2 border-primary-300' : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 px-3 py-2 w-full text-left text-sm"
      >
        <span
          className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
            isPicked ? 'bg-primary-700 border-primary-700' : 'border-gray-300'
          }`}
        >
          {isPicked && (
            <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <span className={`flex-1 ${isPicked ? 'text-primary-900' : 'text-gray-700'}`}>{preset.title}</span>
        {preset.priority === 'high' && (
          <span className="text-[10px] font-semibold uppercase text-red-600">Hög</span>
        )}
      </button>
      {isPicked && picked && (
        <PerTaskControls
          team={team}
          assignedTo={picked.assigned_to}
          dueDate={picked.due_date}
          onChangeAssigned={val => onUpdate({ assigned_to: val })}
          onChangeDueDate={val => onUpdate({ due_date: val })}
        />
      )}
    </div>
  )
}

interface CustomListProps {
  picked: Map<string, PickedTask>
  team: TeamMember[]
  onUpdate: (key: string, patch: Partial<PickedTask>) => void
  onRemove: (key: string) => void
}

function CustomList({ picked, team, onUpdate, onRemove }: CustomListProps) {
  const customs = useMemo(() => {
    return Array.from(picked.entries()).filter(([k]) => k.startsWith('custom:'))
  }, [picked])

  if (customs.length === 0) return null

  return (
    <ul className="mt-2 space-y-1.5">
      {customs.map(([key, task]) => (
        <li key={key} className="rounded-lg border-2 border-primary-300 bg-primary-50">
          <div className="flex items-center justify-between px-3 py-1.5 text-sm text-primary-900">
            <span className="flex-1 truncate">{task.title}</span>
            <button
              onClick={() => onRemove(key)}
              className="text-primary-700 hover:text-primary-900 p-0.5"
              title="Ta bort"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <PerTaskControls
            team={team}
            assignedTo={task.assigned_to}
            dueDate={task.due_date}
            onChangeAssigned={val => onUpdate(key, { assigned_to: val })}
            onChangeDueDate={val => onUpdate(key, { due_date: val })}
          />
        </li>
      ))}
    </ul>
  )
}

interface PerTaskControlsProps {
  team: TeamMember[]
  assignedTo: string | null
  dueDate: string | null
  onChangeAssigned: (val: string | null) => void
  onChangeDueDate: (val: string | null) => void
}

function PerTaskControls({ team, assignedTo, dueDate, onChangeAssigned, onChangeDueDate }: PerTaskControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2 pt-0">
      <select
        value={assignedTo || ''}
        onChange={e => onChangeAssigned(e.target.value || null)}
        onClick={e => e.stopPropagation()}
        className="flex-1 min-w-[120px] px-2 py-1 text-[11px] border border-[#E2E8F0] rounded bg-white text-gray-700 focus:border-primary-700 focus:outline-none"
      >
        <option value="">Ingen tilldelad</option>
        {team.map(m => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      <input
        type="date"
        value={dueDate || ''}
        onChange={e => onChangeDueDate(e.target.value || null)}
        onClick={e => e.stopPropagation()}
        className="px-2 py-1 text-[11px] border border-[#E2E8F0] rounded bg-white text-gray-700 focus:border-primary-700 focus:outline-none"
      />
    </div>
  )
}
