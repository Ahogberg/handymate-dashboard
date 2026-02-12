'use client'

import { useEffect, useState } from 'react'
import {
  FolderKanban,
  Plus,
  Search,
  Clock,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Calendar,
  User,
  Loader2,
  X,
  Trash2,
  TrendingUp
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import Link from 'next/link'

interface Project {
  project_id: string
  name: string
  description: string | null
  customer_id: string | null
  quote_id: string | null
  project_type: 'fixed_price' | 'hourly' | 'mixed'
  status: 'planning' | 'active' | 'paused' | 'completed' | 'cancelled'
  budget_hours: number | null
  budget_amount: number | null
  progress_percent: number
  start_date: string | null
  end_date: string | null
  created_at: string
  customer?: { customer_id: string; name: string }
  actual_hours: number
  actual_amount: number
  uninvoiced_hours: number
  next_deadline: string | null
}

interface Customer {
  customer_id: string
  name: string
}

export default function ProjectsPage() {
  const business = useBusiness()
  const { user: currentUser, can } = useCurrentUser()
  const [projects, setProjects] = useState<Project[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [projectAssignments, setProjectAssignments] = useState<Record<string, { id: string; name: string; color: string }[]>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'cancelled'>('active')
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  const [newProject, setNewProject] = useState({
    name: '',
    customer_id: '',
    project_type: 'hourly' as string,
    budget_hours: '',
    budget_amount: '',
    start_date: '',
    end_date: ''
  })

  useEffect(() => {
    if (business.business_id) {
      fetchProjects()
      fetchCustomers()
      fetchProjectAssignments()
    }
  }, [business.business_id, filter])

  async function fetchProjectAssignments() {
    const { data } = await supabase
      .from('project_assignment')
      .select('project_id, business_user:business_user_id (id, name, color)')
      .eq('business_id', business.business_id)

    const map: Record<string, { id: string; name: string; color: string }[]> = {}
    for (const a of (data || [])) {
      if (!map[a.project_id]) map[a.project_id] = []
      const bu = a.business_user as any
      if (bu) map[a.project_id].push({ id: bu.id, name: bu.name, color: bu.color })
    }
    setProjectAssignments(map)
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  async function fetchProjects() {
    setLoading(true)
    try {
      const response = await fetch(`/api/projects?status=${filter}`)
      if (response.ok) {
        const data = await response.json()
        setProjects(data.projects || [])
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchCustomers() {
    const { data } = await supabase
      .from('customer')
      .select('customer_id, name')
      .eq('business_id', business.business_id)
      .order('name')
    setCustomers(data || [])
  }

  async function handleCreateProject() {
    if (!newProject.name.trim()) {
      showToast('Ange ett projektnamn', 'error')
      return
    }

    setCreating(true)
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProject.name,
          customer_id: newProject.customer_id || null,
          project_type: newProject.project_type,
          budget_hours: newProject.budget_hours ? parseFloat(newProject.budget_hours) : null,
          budget_amount: newProject.budget_amount ? parseFloat(newProject.budget_amount) : null,
          start_date: newProject.start_date || null,
          end_date: newProject.end_date || null
        })
      })

      if (!response.ok) throw new Error('Kunde inte skapa projekt')

      showToast('Projekt skapat!', 'success')
      setShowCreateModal(false)
      setNewProject({ name: '', customer_id: '', project_type: 'hourly', budget_hours: '', budget_amount: '', start_date: '', end_date: '' })
      fetchProjects()
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteProject(projectId: string) {
    if (!confirm('Är du säker på att du vill ta bort detta projekt?')) return

    try {
      const response = await fetch(`/api/projects?projectId=${projectId}`, { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kunde inte ta bort')
      showToast('Projekt borttaget', 'success')
      fetchProjects()
    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    }
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'planning': return 'bg-gray-100 text-gray-500 border-gray-300'
      case 'active': return 'bg-blue-100 text-blue-400 border-blue-500/30'
      case 'paused': return 'bg-amber-100 text-amber-600 border-amber-200'
      case 'completed': return 'bg-emerald-100 text-emerald-600 border-emerald-200'
      case 'cancelled': return 'bg-red-100 text-red-600 border-red-200'
      default: return 'bg-gray-100 text-gray-500 border-gray-300'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'planning': return 'Planering'
      case 'active': return 'Aktivt'
      case 'paused': return 'Pausat'
      case 'completed': return 'Avslutat'
      case 'cancelled': return 'Avbrutet'
      default: return status
    }
  }

  const getBudgetColor = (actual: number, budget: number) => {
    if (!budget || budget === 0) return 'text-gray-500'
    const usage = (actual / budget) * 100
    if (usage > 100) return 'text-red-600'
    if (usage > 80) return 'text-amber-600'
    return 'text-emerald-600'
  }

  const getBudgetBarColor = (actual: number, budget: number) => {
    if (!budget || budget === 0) return 'bg-gray-300'
    const usage = (actual / budget) * 100
    if (usage > 100) return 'bg-red-500'
    if (usage > 80) return 'bg-amber-500'
    return 'bg-gradient-to-r from-blue-500 to-cyan-500'
  }

  const visibleProjects = projects.filter(p => {
    // Employee without can_see_all_projects: only show assigned projects
    if (currentUser && !can('see_all_projects')) {
      const assignees = projectAssignments[p.project_id] || []
      if (!assignees.some(a => a.id === currentUser.id)) return false
    }
    return true
  })

  const filteredProjects = visibleProjects.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Stats
  const activeCount = projects.filter(p => p.status === 'active' || p.status === 'planning').length
  const overBudget = projects.filter(p =>
    p.budget_hours && p.actual_hours > p.budget_hours
  ).length
  const totalUninvoiced = projects.reduce((sum, p) => {
    if (!p.budget_amount) return sum
    const rate = p.budget_amount / (p.budget_hours || 1)
    return sum + (p.uninvoiced_hours * rate)
  }, 0)

  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]"></div>
      </div>

      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-100 border-emerald-200 text-emerald-600' : 'bg-red-100 border-red-200 text-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Projekt</h1>
            <p className="text-gray-500">Hantera projekt, delmoment och ÄTA</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90"
          >
            <Plus className="w-5 h-5" />
            Nytt projekt
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white shadow-sm border border-gray-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <FolderKanban className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-gray-400">Aktiva</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{activeCount}</p>
          </div>
          <div className="bg-white shadow-sm border border-gray-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span className="text-xs text-gray-400">Över budget</span>
            </div>
            <p className={`text-2xl font-bold ${overBudget > 0 ? 'text-red-600' : 'text-gray-900'}`}>{overBudget}</p>
          </div>
          <div className="bg-white shadow-sm border border-gray-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-amber-600" />
              <span className="text-xs text-gray-400">Ofakturerat</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{Math.round(totalUninvoiced).toLocaleString('sv-SE')} kr</p>
          </div>
          <div className="bg-white shadow-sm border border-gray-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span className="text-xs text-gray-400">Totalt</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{projects.length}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex gap-2 overflow-x-auto">
            {[
              { key: 'active', label: 'Aktiva' },
              { key: 'completed', label: 'Avslutade' },
              { key: 'all', label: 'Alla' }
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key as any)}
                className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                  filter === f.key
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                    : 'bg-white text-gray-500 hover:text-white border border-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Sök projekt..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
        </div>

        {/* Project List */}
        <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-20">
              <FolderKanban className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">Inga projekt ännu</p>
              <p className="text-sm text-gray-400">Skapa ett projekt eller konvertera en accepterad offert</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredProjects.map(project => (
                <Link
                  key={project.project_id}
                  href={`/dashboard/projects/${project.project_id}`}
                  className="block p-5 hover:bg-gray-100/30 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-gray-900 truncate">{project.name}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full border ${getStatusStyle(project.status)}`}>
                          {getStatusText(project.status)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-400">
                        {/* Avatar stack */}
                        {projectAssignments[project.project_id]?.length > 0 && (
                          <div className="flex -space-x-1.5">
                            {projectAssignments[project.project_id].slice(0, 3).map((user, i) => (
                              <div
                                key={i}
                                className="w-5 h-5 rounded-full border border-white flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: user.color }}
                                title={user.name}
                              >
                                <span className="text-gray-900 text-[8px] font-bold">{user.name[0]}</span>
                              </div>
                            ))}
                            {projectAssignments[project.project_id].length > 3 && (
                              <div className="w-5 h-5 rounded-full border border-white bg-gray-200 flex items-center justify-center flex-shrink-0">
                                <span className="text-gray-900 text-[8px]">+{projectAssignments[project.project_id].length - 3}</span>
                              </div>
                            )}
                          </div>
                        )}
                        {project.customer && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {project.customer.name}
                          </span>
                        )}
                        {project.next_deadline && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(project.next_deadline).toLocaleDateString('sv-SE')}
                          </span>
                        )}
                        {project.project_type === 'hourly' && <span>Löpande</span>}
                        {project.project_type === 'fixed_price' && <span>Fast pris</span>}
                        {project.project_type === 'mixed' && <span>Blandat</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      {/* Budget */}
                      {project.budget_hours ? (
                        <div className="text-right min-w-[120px]">
                          <div className="flex items-center gap-1 justify-end mb-1">
                            <Clock className="w-3 h-3 text-gray-400" />
                            <span className={`text-sm font-medium ${getBudgetColor(project.actual_hours, project.budget_hours)}`}>
                              {project.actual_hours}/{project.budget_hours} tim
                            </span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full w-24 ml-auto">
                            <div
                              className={`h-full rounded-full transition-all ${getBudgetBarColor(project.actual_hours, project.budget_hours)}`}
                              style={{ width: `${Math.min(100, (project.actual_hours / project.budget_hours) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ) : null}

                      {project.budget_amount ? (
                        <div className="text-right min-w-[130px] hidden md:block">
                          <div className="flex items-center gap-1 justify-end mb-1">
                            <DollarSign className="w-3 h-3 text-gray-400" />
                            <span className={`text-sm font-medium ${getBudgetColor(project.actual_amount, project.budget_amount)}`}>
                              {Math.round(project.actual_amount).toLocaleString('sv-SE')} / {Math.round(project.budget_amount).toLocaleString('sv-SE')} kr
                            </span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full w-28 ml-auto">
                            <div
                              className={`h-full rounded-full transition-all ${getBudgetBarColor(project.actual_amount, project.budget_amount)}`}
                              style={{ width: `${Math.min(100, (project.actual_amount / project.budget_amount) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ) : null}

                      {/* Progress */}
                      <div className="text-right min-w-[60px]">
                        <span className="text-sm font-medium text-gray-900">{project.progress_percent}%</span>
                        <div className="h-1.5 bg-gray-100 rounded-full w-14 ml-auto mt-1">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all"
                            style={{ width: `${project.progress_percent}%` }}
                          />
                        </div>
                      </div>

                      {/* Delete button (only planning with no entries) */}
                      {project.status === 'planning' && project.actual_hours === 0 && (
                        <button
                          onClick={(e) => { e.preventDefault(); handleDeleteProject(project.project_id) }}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Nytt projekt</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 mb-2">Projektnamn *</label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={e => setNewProject({ ...newProject, name: e.target.value })}
                  placeholder="T.ex. Badrumsrenovering Svensson"
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-2">Kund</label>
                <select
                  value={newProject.customer_id}
                  onChange={e => setNewProject({ ...newProject, customer_id: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="">Välj kund...</option>
                  {customers.map(c => <option key={c.customer_id} value={c.customer_id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-2">Projekttyp</label>
                <select
                  value={newProject.project_type}
                  onChange={e => setNewProject({ ...newProject, project_type: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="hourly">Löpande räkning</option>
                  <option value="fixed_price">Fast pris</option>
                  <option value="mixed">Blandat</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-2">Budget timmar</label>
                  <input
                    type="number"
                    value={newProject.budget_hours}
                    onChange={e => setNewProject({ ...newProject, budget_hours: e.target.value })}
                    placeholder="0"
                    className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-2">Budget belopp (kr)</label>
                  <input
                    type="number"
                    value={newProject.budget_amount}
                    onChange={e => setNewProject({ ...newProject, budget_amount: e.target.value })}
                    placeholder="0"
                    className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-2">Startdatum</label>
                  <input
                    type="date"
                    value={newProject.start_date}
                    onChange={e => setNewProject({ ...newProject, start_date: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-2">Slutdatum</label>
                  <input
                    type="date"
                    value={newProject.end_date}
                    onChange={e => setNewProject({ ...newProject, end_date: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleCreateProject}
                  disabled={creating || !newProject.name.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                  Skapa projekt
                </button>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-6 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-500 hover:text-gray-900"
                >
                  Avbryt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
