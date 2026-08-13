'use client'

import { useEffect, useState } from 'react'
import {
  FolderKanban,
  Plus,
  Search,
  Clock,
  DollarSign,
  AlertTriangle,
  Calendar,
  User,
  Loader2,
  X,
  Trash2,
  TrendingUp,
  Activity,
  Paperclip,
  FileText,
  Upload,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import Link from 'next/link'
import { JobTypeBadge, type JobTypeMeta } from './components/JobTypeBadge'
import { ProjectDeleteConfirmModal } from '@/components/projects/ProjectDeleteConfirmModal'

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
  /** Härlett driftläge (P1-2): fakta ur fakturatabellen, inte statusfältet. */
  lifecycle?: { phase: string; label: string; needsAction: boolean }
  ai_health_score: number | null
  ai_health_summary: string | null
  ai_auto_created: boolean
  project_number: string | null
  job_type: string | null
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
  const [jobTypes, setJobTypes] = useState<JobTypeMeta[]>([])
  const [jobTypeFilter, setJobTypeFilter] = useState<string>('') // slug eller '' = alla
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [newProject, setNewProject] = useState({
    name: '',
    customer_id: '',
    project_type: 'hourly' as string,
    job_type: '' as string,
    budget_hours: '',
    budget_amount: '',
    start_date: '',
    end_date: '',
  })
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string; role: string }[]>([])
  const [selectedTeam, setSelectedTeam] = useState<string[]>([])

  useEffect(() => {
    if (business.business_id) {
      fetchProjects()
      fetchCustomers()
      fetchProjectAssignments()
      fetchTeamMembers()
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
        setJobTypes(data.job_types || [])
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchCustomers() {
    try {
      const res = await fetch('/api/customers')
      const json = await res.json()
      setCustomers(json?.customers || json?.data || [])
    } catch (err) {
      console.error('[Projects] Kunde inte hämta kunder:', err)
      setCustomers([])
    }
  }

  async function fetchTeamMembers() {
    const { data } = await supabase
      .from('business_users')
      .select('id, name, role')
      .eq('business_id', business.business_id)
      .eq('is_active', true)
      .order('name')
    setTeamMembers(data || [])
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
          job_type: newProject.job_type || null,
          budget_hours: newProject.budget_hours ? parseFloat(newProject.budget_hours) : null,
          budget_amount: newProject.budget_amount ? parseFloat(newProject.budget_amount) : null,
          start_date: newProject.start_date || null,
          end_date: newProject.end_date || null,
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || 'Kunde inte skapa projekt')
      }

      const { project } = await response.json()
      const newProjectId = project?.project_id

      // Assign team members
      if (newProjectId && selectedTeam.length > 0) {
        const assignments = selectedTeam.map(userId => ({
          project_id: newProjectId,
          business_id: business.business_id,
          business_user_id: userId,
        }))
        await supabase.from('project_assignment').insert(assignments)
      }

      // Upload pending files if any
      if (newProjectId && pendingFiles.length > 0) {
        let uploadedCount = 0
        for (const file of pendingFiles) {
          try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('category', 'other')
            const uploadRes = await fetch(`/api/projects/${newProjectId}/documents`, { method: 'POST', body: formData })
            if (uploadRes.ok) uploadedCount++
          } catch { /* continue with next file */ }
        }
        if (uploadedCount > 0) {
          showToast(`Projekt skapat med ${uploadedCount} dokument!`, 'success')
        } else {
          showToast('Projekt skapat, men dokumenten kunde inte laddas upp', 'error')
        }
      } else {
        showToast('Projekt skapat!', 'success')
      }

      setShowCreateModal(false)
      setNewProject({ name: '', customer_id: '', project_type: 'hourly', job_type: '', budget_hours: '', budget_amount: '', start_date: '', end_date: '' })
      setPendingFiles([])
      setSelectedTeam([])
      fetchProjects()
    } catch (err: any) {
      showToast(err.message || 'Något gick fel', 'error')
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteProject(projectId: string) {
    setDeleting(true)
    try {
      const response = await fetch(`/api/projects?projectId=${projectId}`, { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kunde inte ta bort')
      showToast('Projekt borttaget', 'success')
      setDeleteTarget(null)
      fetchProjects()
    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'planning': return 'bg-slate-100 text-slate-500 border-slate-300'
      case 'active': return 'bg-primary-100 text-primary-600 border-primary-600/30'
      case 'paused': return 'bg-amber-100 text-amber-600 border-amber-200'
      case 'completed': return 'bg-emerald-100 text-emerald-600 border-emerald-200'
      case 'cancelled': return 'bg-red-100 text-red-600 border-red-200'
      default: return 'bg-slate-100 text-slate-500 border-slate-300'
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

  /**
   * Driftläges-badgen (P2-1): svarar "var står jobbet?" ur fakturafakta.
   * klart_ofakturerat är fasen som ska göra ont — där ligger pengar och
   * väntar. Saknas lifecycle (cachat svar från före deployen) faller raden
   * tillbaka på gamla statusbadgen.
   */
  // Fyra semantiska lägen, inte nio nyanser (redesign 2026-08-14): slate =
  // ej igång, teal = pågår, amber = kräver handling, emerald = klart/betalt.
  // 'fakturerat' delar emerald med 'betalt' — båda är "pengarna är i rörelse
  // eller hemma", ingen anledning till en egen sky-nyans mellan dem.
  const getLifecycleStyle = (phase: string, needsAction: boolean) => {
    if (needsAction) return 'bg-amber-100 text-amber-700 border-amber-300 font-medium'
    switch (phase) {
      case 'planering': return 'bg-slate-100 text-slate-500 border-slate-300'
      case 'pagar': return 'bg-primary-100 text-primary-600 border-primary-600/30'
      case 'fakturerat': return 'bg-emerald-100 text-emerald-600 border-emerald-200'
      case 'betalt': return 'bg-emerald-100 text-emerald-600 border-emerald-200'
      case 'avbrutet': return 'bg-red-100 text-red-600 border-red-200'
      default: return 'bg-slate-100 text-slate-500 border-slate-300'
    }
  }

  const getBudgetColor = (actual: number, budget: number) => {
    if (!budget || budget === 0) return 'text-slate-500'
    const usage = (actual / budget) * 100
    if (usage > 100) return 'text-red-600'
    if (usage > 80) return 'text-amber-600'
    return 'text-emerald-600'
  }

  const getBudgetBarColor = (actual: number, budget: number) => {
    if (!budget || budget === 0) return 'bg-slate-300'
    const usage = (actual / budget) * 100
    if (usage > 100) return 'bg-red-500'
    if (usage > 80) return 'bg-amber-500'
    return 'bg-primary-700'
  }

  const visibleProjects = projects.filter(p => {
    // Employee without can_see_all_projects: only show assigned projects
    if (currentUser && !can('see_all_projects')) {
      const assignees = projectAssignments[p.project_id] || []
      if (!assignees.some(a => a.id === currentUser.id)) return false
    }
    return true
  })

  const filteredProjects = visibleProjects
    .filter(p => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesJobType = !jobTypeFilter || p.job_type === jobTypeFilter
      return matchesSearch && matchesJobType
    })
    // Det som kräver handling (klart men ofakturerat — pengar som väntar)
    // ligger överst. Stabil sortering: inbördes ordning behålls.
    .sort((a, b) => Number(b.lifecycle?.needsAction ?? false) - Number(a.lifecycle?.needsAction ?? false))

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
    <div className="p-8 bg-[#F8FAFC] min-h-screen">
      {toast.show && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl border ${
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
            className="flex items-center gap-2 px-6 py-3 bg-primary-700 rounded-xl font-medium text-white hover:opacity-90"
          >
            <Plus className="w-5 h-5" />
            Nytt projekt
          </button>
        </div>

        {/* Läget — besked i stället för fyra statiska kort (2026-08-10).
            "Aktiva 8" + "Totalt 8" var samma siffra två gånger, och nollorna
            stod på paradplats. Nu: kontexten som text, varningarna som chips
            BARA när de bär något, och tomt sägs som lugn — inte som en nolla. */}
        <div className="flex flex-wrap items-center gap-2.5 mb-8">
          <span className="inline-flex items-center gap-2 px-3.5 min-h-[36px] bg-white border border-[#E2E8F0] rounded-full text-sm font-medium text-gray-700">
            <FolderKanban className="w-4 h-4 text-primary-600" />
            {activeCount} aktiva projekt
          </span>
          {overBudget > 0 && (
            <span className="inline-flex items-center gap-2 px-3.5 min-h-[36px] bg-red-50 border border-red-200 rounded-full text-sm font-semibold text-red-700">
              <AlertTriangle className="w-4 h-4" />
              {overBudget} över budget
            </span>
          )}
          {totalUninvoiced > 0 && (
            <Link
              href="/dashboard/pengar"
              className="inline-flex items-center gap-2 px-3.5 min-h-[36px] bg-amber-50 border border-amber-200 rounded-full text-sm font-semibold text-amber-700 hover:border-amber-300 transition-colors"
            >
              <DollarSign className="w-4 h-4" />
              {Math.round(totalUninvoiced).toLocaleString('sv-SE')} kr ofakturerat
            </Link>
          )}
          {overBudget === 0 && totalUninvoiced <= 0 && (
            <span className="text-sm text-gray-400">Inget över budget · inget ofakturerat</span>
          )}
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
                    ? 'bg-primary-700 text-white'
                    : 'bg-white text-gray-500 hover:text-gray-900 hover:bg-gray-50 border border-[#E2E8F0]'
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
              className="w-full pl-11 pr-4 py-2.5 bg-white border border-[#E2E8F0] rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
            />
          </div>
        </div>

        {/* Filter på jobbtyp — chips. Visas bara om business har jobbtyper */}
        {jobTypes.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mb-6">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 mr-1">Jobbtyp:</span>
            <button
              onClick={() => setJobTypeFilter('')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                !jobTypeFilter
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              Alla
            </button>
            {jobTypes.map(jt => {
              const active = jobTypeFilter === jt.slug
              return (
                <button
                  key={jt.slug}
                  onClick={() => setJobTypeFilter(active ? '' : jt.slug)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border whitespace-nowrap"
                  style={
                    active
                      ? { backgroundColor: jt.color, color: 'white', borderColor: jt.color }
                      : { backgroundColor: `${jt.color}10`, color: jt.color, borderColor: `${jt.color}40` }
                  }
                >
                  {jt.name}
                </button>
              )
            })}
          </div>
        )}

        {/* Project List */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-20">
              <FolderKanban className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-500 mb-2">Inga projekt ännu</p>
              <p className="text-sm text-slate-400">Skapa ett projekt eller konvertera en accepterad offert</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredProjects.map(project => (
                <Link
                  key={project.project_id}
                  href={`/dashboard/projects/${project.project_id}`}
                  className="group block p-5 hover:bg-slate-100/30 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {/* Bara riktiga projektnummer — ett rått id-fragment
                            (P-877e3f) är tekniskt läckage, inte information. */}
                        {project.project_number && (
                          <span className="text-xs font-mono text-slate-400 flex-shrink-0">{project.project_number}</span>
                        )}
                        <h3 className="font-semibold text-slate-900 truncate">{project.name}</h3>
                        <JobTypeBadge slug={project.job_type} jobTypes={jobTypes} />
                        {project.lifecycle ? (
                          <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full border ${getLifecycleStyle(project.lifecycle.phase, project.lifecycle.needsAction)}`}>
                            {project.lifecycle.label}
                          </span>
                        ) : (
                          <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full border ${getStatusStyle(project.status)}`}>
                            {getStatusText(project.status)}
                          </span>
                        )}
                        {/* Hälsan syns BARA när den avviker, och med ORD. Ett
                            "80" på varje frisk rad är ett hittepå-score som
                            blir tapet efter dag två (rådets Business Health-
                            regel). Sammanfattningen bor i tooltipen. */}
                        {project.ai_health_score != null && project.ai_health_score < 80 && project.status !== 'completed' && project.status !== 'cancelled' && (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${
                              project.ai_health_score >= 50
                                ? 'bg-amber-50 text-amber-600 border-amber-200'
                                : 'bg-red-50 text-red-600 border-red-200'
                            }`}
                            title={project.ai_health_summary || ''}
                          >
                            <Activity className="w-3 h-3" />
                            {project.ai_health_score >= 50 ? 'Behöver koll' : 'Risk'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-slate-500">
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
                        {project.ai_auto_created && (
                          <span className="text-xs" title="Projektet skapades automatiskt när offerten accepterades">
                            Skapad automatiskt
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      {project.actual_hours === 0 && project.actual_amount === 0 && project.progress_percent === 0 ? (
                        /* Inte påbörjat: "0/24 tim", "0/34 480 kr" och "0 %"
                           med tre staplar sa samma sak tre gånger. Ett besked
                           plus det offererade räcker — staplarna kommer när
                           det finns något att rita. */
                        <div className="text-right">
                          <span className="block text-sm font-medium text-slate-500">Inte påbörjat</span>
                          {project.budget_amount ? (
                            <span className="block text-xs text-slate-400">
                              offererat {Math.round(project.budget_amount).toLocaleString('sv-SE')} kr <span className="text-[10px]">exkl. moms</span>
                            </span>
                          ) : project.budget_hours ? (
                            <span className="block text-xs text-slate-400">{project.budget_hours} tim budgeterat</span>
                          ) : null}
                        </div>
                      ) : (
                        /* En stapel — den som faktiskt begränsar jobbet —
                           inte tre som säger samma sak tre gånger (redesign
                           2026-08-14). Löpande/blandade projekt begränsas av
                           timmarna, fastprisprojekt av kronorna; resten blir
                           läsbar brödtext under stapeln i stället för en till
                           mätare. */
                        <div className="text-right min-w-[150px]">
                          {project.project_type !== 'fixed_price' && project.budget_hours ? (
                            <>
                              <div className="flex items-center gap-1 justify-end mb-1">
                                <Clock className="w-3 h-3 text-slate-400" />
                                <span className={`text-sm font-medium ${getBudgetColor(project.actual_hours, project.budget_hours)}`}>
                                  {project.actual_hours}/{project.budget_hours} tim
                                </span>
                              </div>
                              <div className="h-1.5 bg-slate-100 rounded-full w-full ml-auto">
                                <div
                                  className={`h-full rounded-full transition-all ${getBudgetBarColor(project.actual_hours, project.budget_hours)}`}
                                  style={{ width: `${Math.min(100, (project.actual_hours / project.budget_hours) * 100)}%` }}
                                />
                              </div>
                              <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
                                {project.budget_amount ? (
                                  <>
                                    <b className="text-slate-700 font-semibold">{Math.round(project.actual_amount).toLocaleString('sv-SE')} kr</b> av {Math.round(project.budget_amount).toLocaleString('sv-SE')} kr
                                    <br />
                                  </>
                                ) : null}
                                {project.progress_percent}% färdigt
                              </p>
                            </>
                          ) : project.budget_amount ? (
                            <>
                              <div className="flex items-center gap-1 justify-end mb-1">
                                <DollarSign className="w-3 h-3 text-slate-400" />
                                <span className={`text-sm font-medium ${getBudgetColor(project.actual_amount, project.budget_amount)}`}>
                                  {Math.round(project.actual_amount).toLocaleString('sv-SE')}/{Math.round(project.budget_amount).toLocaleString('sv-SE')} kr
                                </span>
                              </div>
                              <div className="h-1.5 bg-slate-100 rounded-full w-full ml-auto">
                                <div
                                  className={`h-full rounded-full transition-all ${getBudgetBarColor(project.actual_amount, project.budget_amount)}`}
                                  style={{ width: `${Math.min(100, (project.actual_amount / project.budget_amount) * 100)}%` }}
                                />
                              </div>
                              <p className="mt-1.5 text-xs text-slate-500">{project.progress_percent}% färdigt</p>
                            </>
                          ) : (
                            <>
                              <span className="text-sm font-medium text-slate-900">{project.progress_percent}%</span>
                              <div className="h-1.5 bg-slate-100 rounded-full w-full ml-auto mt-1">
                                <div
                                  className="h-full rounded-full bg-primary-700 transition-all"
                                  style={{ width: `${project.progress_percent}%` }}
                                />
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* Radering — destruktiv åtgärd, inte blickfång. Syns
                          vid hover/fokus (alltid på mobil, där hover saknas)
                          och bara på oskrivna planeringsprojekt. */}
                      {project.status === 'planning' && project.actual_hours === 0 && (
                        <button
                          onClick={(e) => { e.preventDefault(); setDeleteTarget({ id: project.project_id, name: project.name }) }}
                          aria-label="Ta bort projektet"
                          title="Ta bort projektet"
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
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
          <div className="bg-white border border-[#E2E8F0] rounded-[14px] p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-heading text-lg font-bold text-slate-900 tracking-[-0.02em]">Nytt projekt</h3>
              <button onClick={() => { setShowCreateModal(false); setPendingFiles([]) }} className="text-slate-400 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-2">Projektnamn *</label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={e => setNewProject({ ...newProject, name: e.target.value })}
                  placeholder="T.ex. Badrumsrenovering Svensson"
                  className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-[10px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#0F766E]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-2">Kund</label>
                <select
                  value={newProject.customer_id}
                  onChange={e => setNewProject({ ...newProject, customer_id: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-[10px] text-slate-900 focus:outline-none focus:border-[#0F766E]"
                >
                  <option value="">Välj kund...</option>
                  {customers.map(c => <option key={c.customer_id} value={c.customer_id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-2">Projekttyp</label>
                <select
                  value={newProject.project_type}
                  onChange={e => setNewProject({ ...newProject, project_type: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-[10px] text-slate-900 focus:outline-none focus:border-[#0F766E]"
                >
                  <option value="hourly">Löpande räkning</option>
                  <option value="fixed_price">Fast pris</option>
                  <option value="mixed">Blandat</option>
                </select>
              </div>

              {/* Jobbtyp — branschtagg som visas som färgad badge på projekt-listan */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-2">
                  Jobbtyp <span className="text-xs text-slate-400 font-normal">(valfri)</span>
                </label>
                {jobTypes.length === 0 ? (
                  <Link
                    href="/dashboard/settings/job-types"
                    className="block px-4 py-3 bg-slate-50 border border-dashed border-[#E2E8F0] rounded-[10px] text-sm text-slate-500 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 transition-colors"
                  >
                    + Lägg till jobbtyper i Inställningar
                  </Link>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setNewProject({ ...newProject, job_type: '' })}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        !newProject.job_type
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      Ingen
                    </button>
                    {jobTypes.map(jt => {
                      const active = newProject.job_type === jt.slug
                      return (
                        <button
                          key={jt.slug}
                          type="button"
                          onClick={() => setNewProject({ ...newProject, job_type: jt.slug })}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap"
                          style={
                            active
                              ? { backgroundColor: jt.color, color: 'white', borderColor: jt.color }
                              : { backgroundColor: `${jt.color}10`, color: jt.color, borderColor: `${jt.color}40` }
                          }
                        >
                          {jt.name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-2">Budget timmar</label>
                  <input
                    type="number"
                    value={newProject.budget_hours}
                    onChange={e => setNewProject({ ...newProject, budget_hours: e.target.value })}
                    placeholder="0"
                    className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-[10px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#0F766E]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-2">Budget belopp (kr exkl. moms)</label>
                  <input
                    type="number"
                    value={newProject.budget_amount}
                    onChange={e => setNewProject({ ...newProject, budget_amount: e.target.value })}
                    placeholder="0"
                    className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-[10px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#0F766E]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-2">Startdatum</label>
                  <input
                    type="date"
                    value={newProject.start_date}
                    onChange={e => setNewProject({ ...newProject, start_date: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-[10px] text-slate-900 focus:outline-none focus:border-[#0F766E]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-2">Slutdatum</label>
                  <input
                    type="date"
                    value={newProject.end_date}
                    onChange={e => setNewProject({ ...newProject, end_date: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-[10px] text-slate-900 focus:outline-none focus:border-[#0F766E]"
                  />
                </div>
              </div>

              {/* Teammedlemmar */}
              {teamMembers.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-2">Utförare</label>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {teamMembers.map(member => (
                      <label key={member.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-[10px] border border-[#E2E8F0] cursor-pointer hover:bg-slate-100 transition">
                        <input
                          type="checkbox"
                          checked={selectedTeam.includes(member.id)}
                          onChange={e => {
                            if (e.target.checked) setSelectedTeam(prev => [...prev, member.id])
                            else setSelectedTeam(prev => prev.filter(id => id !== member.id))
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-primary-700 focus:ring-primary-600"
                        />
                        <span className="text-sm text-slate-700">{member.name}</span>
                        <span className="text-xs text-slate-400 ml-auto">{member.role === 'owner' ? 'Ägare' : member.role === 'admin' ? 'Admin' : 'Anställd'}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Dokument */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-2">Dokument</label>
                <label className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-50 border-2 border-dashed border-slate-300 rounded-[10px] text-slate-500 cursor-pointer hover:border-primary-500 hover:text-primary-700 transition">
                  <Upload className="w-4 h-4" />
                  <span className="text-sm">Välj filer att bifoga...</span>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) {
                        setPendingFiles(prev => [...prev, ...Array.from(e.target.files!)])
                      }
                      e.target.value = ''
                    }}
                  />
                </label>
                {pendingFiles.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {pendingFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-[10px] border border-[#E2E8F0]">
                        <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <span className="text-sm text-slate-700 truncate flex-1">{file.name}</span>
                        <span className="text-xs text-slate-400 flex-shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
                        <button
                          type="button"
                          onClick={() => setPendingFiles(prev => prev.filter((_, i) => i !== idx))}
                          className="p-0.5 text-slate-400 hover:text-red-500 transition"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleCreateProject}
                  disabled={creating || !newProject.name.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-b from-primary-600 to-primary-700 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50 shadow-brand"
                >
                  {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                  {creating && pendingFiles.length > 0 ? 'Skapar & laddar upp...' : 'Skapa projekt'}
                </button>
                <button
                  onClick={() => { setShowCreateModal(false); setPendingFiles([]) }}
                  className="px-6 py-3 bg-white border border-[#E2E8F0] rounded-xl text-slate-500 hover:text-slate-900"
                >
                  Avbryt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ProjectDeleteConfirmModal
        show={deleteTarget !== null}
        projectName={deleteTarget?.name || ''}
        deleting={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDeleteProject(deleteTarget.id)}
      />
    </div>
  )
}
