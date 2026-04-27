'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Plus, Search, Filter, CheckSquare, Square, Clock, AlertCircle,
  Calendar, User, Trash2, X, Loader2, ChevronDown, Edit3,
  Users, FolderKanban, ArrowUpRight,
} from 'lucide-react'
import { todayDateStr, nowTimeStr } from '@/lib/datetime-defaults'

interface Task {
  id: string
  title: string
  description: string | null
  status: 'pending' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  due_time: string | null
  assigned_to: string | null
  assigned_user: { id: string; name: string; color: string } | null
  customer_id: string | null
  deal_id: string | null
  project_id: string | null
  visibility: 'private' | 'team' | 'project'
  created_by: string | null
  created_at: string
}

interface TeamMember {
  id: string
  name: string
  color: string
}

type ViewFilter = 'mine' | 'all'
type TimeFilter = 'today' | 'week' | 'upcoming' | 'overdue' | 'all'
type StatusFilter = 'pending' | 'in_progress' | 'done' | 'all'

const PRIORITY_LABELS: Record<string, string> = { low: 'Låg', medium: 'Medium', high: 'Hög' }
const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-red-50 text-red-700',
}
const STATUS_LABELS: Record<string, string> = { pending: 'Att göra', in_progress: 'Pågår', done: 'Klar' }

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [search, setSearch] = useState('')
  const [viewFilter, setViewFilter] = useState<ViewFilter>('mine')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('upcoming')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formPriority, setFormPriority] = useState<'low' | 'medium' | 'high'>('medium')
  // Default till idag/nu så hantverkaren slipper klicka för att fylla i tid
  const [formDueDate, setFormDueDate] = useState(todayDateStr())
  const [formDueTime, setFormDueTime] = useState(nowTimeStr())
  const [formAssignee, setFormAssignee] = useState('')
  const [formStatus, setFormStatus] = useState<'pending' | 'in_progress' | 'done'>('pending')
  const [formVisibility, setFormVisibility] = useState<'private' | 'team' | 'project'>('team')
  const [formProjectId, setFormProjectId] = useState<string>('')

  // Aktiva projekt för dropdown
  const [projectOptions, setProjectOptions] = useState<Array<{ id: string; name: string }>>([])

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000)
  }

  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (viewFilter === 'mine') params.set('my', 'true')
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await fetch(`/api/tasks?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTasks(data.tasks || [])
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [viewFilter, statusFilter])

  const fetchTeam = useCallback(async () => {
    try {
      const res = await fetch('/api/team')
      if (res.ok) {
        const data = await res.json()
        setTeamMembers(data.members || [])
      }
    } catch { /* ignore */ }
  }, [])

  const fetchProjectOptions = useCallback(async () => {
    try {
      const res = await fetch('/api/projects?status=active')
      if (res.ok) {
        const data = await res.json()
        const list = (data.projects || data.data || []).map((p: any) => ({
          id: p.id || p.project_id,
          name: p.name || p.title || 'Projekt',
        })).filter((p: any) => p.id)
        setProjectOptions(list)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchTasks() }, [fetchTasks])
  useEffect(() => { fetchTeam() }, [fetchTeam])
  useEffect(() => { fetchProjectOptions() }, [fetchProjectOptions])

  const today = new Date().toISOString().split('T')[0]
  const weekEnd = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().split('T')[0]
  })()

  const filteredTasks = tasks.filter(t => {
    if (search) {
      const q = search.toLowerCase()
      if (!t.title.toLowerCase().includes(q) && !(t.description || '').toLowerCase().includes(q)) return false
    }
    if (timeFilter === 'today') return t.due_date === today
    if (timeFilter === 'week') return t.due_date && t.due_date >= today && t.due_date <= weekEnd
    if (timeFilter === 'upcoming') return !t.due_date || t.due_date >= today
    if (timeFilter === 'overdue') return t.due_date && t.due_date < today && t.status !== 'done'
    return true
  }).sort((a, b) => {
    if (a.status === 'done' && b.status !== 'done') return 1
    if (a.status !== 'done' && b.status === 'done') return -1
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date && !b.due_date) return -1
    if (!a.due_date && b.due_date) return 1
    return 0
  })

  const overdueCount = tasks.filter(t => t.due_date && t.due_date < today && t.status !== 'done').length

  async function toggleStatus(task: Task) {
    const newStatus = task.status === 'done' ? 'pending' : 'done'
    try {
      const res = await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, status: newStatus }),
      })
      if (res.ok) fetchTasks()
    } catch { showToast('Kunde inte uppdatera', 'error') }
  }

  function openCreate() {
    setFormTitle('')
    setFormDesc('')
    setFormPriority('medium')
    setFormDueDate(todayDateStr())
    setFormDueTime(nowTimeStr())
    setFormAssignee('')
    setFormStatus('pending')
    setFormVisibility('team')
    setFormProjectId('')
    setEditTask(null)
    setShowCreate(true)
  }

  function openEdit(task: Task) {
    setFormTitle(task.title)
    setFormDesc(task.description || '')
    setFormPriority(task.priority)
    setFormDueDate(task.due_date || '')
    setFormDueTime(task.due_time || '')
    setFormAssignee(task.assigned_to || '')
    setFormStatus(task.status)
    setFormVisibility(task.visibility)
    setFormProjectId(task.project_id || '')
    setEditTask(task)
    setShowCreate(true)
  }

  async function handleSave() {
    if (!formTitle.trim()) return
    setSaving(true)
    try {
      if (editTask) {
        const res = await fetch('/api/tasks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editTask.id,
            title: formTitle.trim(),
            description: formDesc || null,
            priority: formPriority,
            due_date: formDueDate || null,
            due_time: formDueTime || null,
            assigned_to: formAssignee || null,
            status: formStatus,
            visibility: formVisibility,
            project_id: formProjectId || null,
          }),
        })
        if (!res.ok) throw new Error()
        showToast('Uppgift uppdaterad')
      } else {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formTitle.trim(),
            description: formDesc || null,
            priority: formPriority,
            due_date: formDueDate || null,
            due_time: formDueTime || null,
            assigned_to: formAssignee || null,
            visibility: formVisibility,
            project_id: formProjectId || null,
          }),
        })
        if (!res.ok) throw new Error()
        showToast('Uppgift skapad')
      }
      setShowCreate(false)
      setEditTask(null)
      fetchTasks()
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(taskId: string) {
    try {
      const res = await fetch(`/api/tasks?id=${taskId}`, { method: 'DELETE' })
      if (res.ok) {
        showToast('Uppgift borttagen')
        fetchTasks()
      }
    } catch { showToast('Kunde inte ta bort', 'error') }
  }

  function formatDueDate(date: string | null) {
    if (!date) return null
    if (date === today) return 'Idag'
    const d = new Date(date)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (date === tomorrow.toISOString().split('T')[0]) return 'Imorgon'
    return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
  }

  function isOverdue(task: Task) {
    return task.due_date && task.due_date < today && task.status !== 'done'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Uppgifter</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {filteredTasks.filter(t => t.status !== 'done').length} aktiva
              {overdueCount > 0 && <span className="text-red-600 ml-1">({overdueCount} försenade)</span>}
            </p>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-primary-700 hover:bg-primary-800 text-white rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Ny uppgift
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* View: mine / all */}
          <div className="flex bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
            <button
              onClick={() => setViewFilter('mine')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewFilter === 'mine' ? 'bg-primary-700 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >Mina</button>
            <button
              onClick={() => setViewFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewFilter === 'all' ? 'bg-primary-700 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >Alla</button>
          </div>

          {/* Time filter */}
          <div className="flex bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
            {([
              ['today', 'Idag'],
              ['week', 'Veckan'],
              ['upcoming', 'Kommande'],
              ['overdue', 'Försenade'],
              ['all', 'Alla'],
            ] as [TimeFilter, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTimeFilter(key)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${timeFilter === key ? 'bg-primary-700 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >{label}{key === 'overdue' && overdueCount > 0 ? ` (${overdueCount})` : ''}</button>
            ))}
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-1.5 text-xs font-medium bg-white border border-[#E2E8F0] rounded-lg text-gray-600"
          >
            <option value="all">Alla statusar</option>
            <option value="pending">Att göra</option>
            <option value="in_progress">Pågår</option>
            <option value="done">Klara</option>
          </select>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Sök uppgifter..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-lg focus:border-primary-700 focus:outline-none"
            />
          </div>
        </div>

        {/* Task list */}
        {filteredTasks.length === 0 ? (
          <div className="text-center py-16">
            <CheckSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Inga uppgifter att visa</p>
            <button onClick={openCreate} className="mt-3 text-sm text-primary-700 hover:underline">Skapa en uppgift</button>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTasks.map(task => (
              <div
                key={task.id}
                className={`bg-white border rounded-xl p-3 sm:p-4 transition-all hover:border-gray-300 cursor-pointer ${
                  isOverdue(task) ? 'border-red-200 bg-red-50/30' : 'border-[#E2E8F0]'
                } ${task.status === 'done' ? 'opacity-60' : ''}`}
                onClick={() => openEdit(task)}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={e => { e.stopPropagation(); toggleStatus(task) }}
                    className="mt-0.5 flex-shrink-0"
                  >
                    {task.status === 'done' ? (
                      <CheckSquare className="w-5 h-5 text-primary-700" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-300 hover:text-primary-700 transition-colors" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {task.title}
                      </span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${PRIORITY_COLORS[task.priority]}`}>
                        {PRIORITY_LABELS[task.priority]}
                      </span>
                      {task.status === 'in_progress' && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">Pågår</span>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-xs text-gray-500 truncate mb-1">{task.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                      {task.due_date && (
                        <span className={`flex items-center gap-1 ${isOverdue(task) ? 'text-red-600 font-medium' : ''}`}>
                          <Calendar className="w-3 h-3" />
                          {formatDueDate(task.due_date)}
                          {task.due_time && ` ${task.due_time.slice(0, 5)}`}
                        </span>
                      )}
                      {task.assigned_user && (
                        <span className="flex items-center gap-1">
                          <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] text-white font-bold" style={{ backgroundColor: task.assigned_user.color || '#64748B' }}>
                            {task.assigned_user.name.charAt(0)}
                          </span>
                          {task.assigned_user.name}
                        </span>
                      )}
                      {task.project_id && (() => {
                        const proj = projectOptions.find(p => p.id === task.project_id)
                        if (!proj) return null
                        return (
                          <a
                            href={`/dashboard/projects/${task.project_id}`}
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1 text-primary-700 hover:underline"
                          >
                            📁 {proj.name}
                          </a>
                        )
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(task)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(task.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-gray-100">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {editTask ? 'Redigera uppgift' : 'Ny uppgift'}
              </h2>
              <button onClick={() => { setShowCreate(false); setEditTask(null) }} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-[#64748B] font-medium mb-1 block">Titel *</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="Vad ska göras?"
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:border-primary-700 focus:outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-[#64748B] font-medium mb-1 block">Beskrivning</label>
                <textarea
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  placeholder="Valfri beskrivning..."
                  rows={3}
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:border-primary-700 focus:outline-none resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#64748B] font-medium mb-1 block">Datum</label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={e => setFormDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:border-primary-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#64748B] font-medium mb-1 block">Tid</label>
                  <input
                    type="time"
                    value={formDueTime}
                    onChange={e => setFormDueTime(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:border-primary-700 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#64748B] font-medium mb-1 block">Prioritet</label>
                  <select
                    value={formPriority}
                    onChange={e => setFormPriority(e.target.value as any)}
                    className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:border-primary-700 focus:outline-none"
                  >
                    <option value="low">Låg</option>
                    <option value="medium">Medium</option>
                    <option value="high">Hög</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[#64748B] font-medium mb-1 block">Tilldela</label>
                  <select
                    value={formAssignee}
                    onChange={e => setFormAssignee(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:border-primary-700 focus:outline-none"
                  >
                    <option value="">Ingen tilldelad</option>
                    {teamMembers.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Koppla till projekt — valfritt */}
              <div>
                <label className="text-xs text-[#64748B] font-medium mb-1 block">Koppla till projekt (valfritt)</label>
                <select
                  value={formProjectId}
                  onChange={e => {
                    setFormProjectId(e.target.value)
                    // Sätt automatiskt synlighet=projekt om man kopplar till ett projekt
                    if (e.target.value && formVisibility === 'private') {
                      setFormVisibility('project')
                    }
                  }}
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:border-primary-700 focus:outline-none"
                >
                  <option value="">Inget projekt</option>
                  {projectOptions.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              {editTask && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-[#64748B] font-medium mb-1 block">Status</label>
                    <select
                      value={formStatus}
                      onChange={e => setFormStatus(e.target.value as any)}
                      className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:border-primary-700 focus:outline-none"
                    >
                      <option value="pending">Att göra</option>
                      <option value="in_progress">Pågår</option>
                      <option value="done">Klar</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[#64748B] font-medium mb-1 block">Synlighet</label>
                    <select
                      value={formVisibility}
                      onChange={e => setFormVisibility(e.target.value as any)}
                      className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:border-primary-700 focus:outline-none"
                    >
                      <option value="private">Privat</option>
                      <option value="team">Team</option>
                      <option value="project">Projekt</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between p-5 border-t border-gray-100">
              {editTask ? (
                <button
                  onClick={() => { handleDelete(editTask.id); setShowCreate(false); setEditTask(null) }}
                  className="text-xs text-red-500 hover:text-red-700"
                >Ta bort uppgift</button>
              ) : <div />}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowCreate(false); setEditTask(null) }}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
                >Avbryt</button>
                <button
                  onClick={handleSave}
                  disabled={saving || !formTitle.trim()}
                  className="px-5 py-2 bg-primary-700 hover:bg-primary-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editTask ? 'Spara' : 'Skapa'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.show && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white ${toast.type === 'error' ? 'bg-red-600' : 'bg-primary-700'}`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
