'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Loader2,
  ChevronDown,
  Clock,
  Plus,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Calendar,
  FileText,
  DollarSign,
  TrendingUp,
  BarChart3,
  Layers,
  ArrowRightCircle,
  Receipt,
  Timer,
  Briefcase,
  ExternalLink,
  Target,
  CircleDot,
  X,
  Package,
  Search,
  Users,
  UserPlus
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import ProductSearchModal from '@/components/ProductSearchModal'
import { SelectedProduct } from '@/lib/suppliers/types'
import Link from 'next/link'

// --- Types ---

interface Project {
  project_id: string
  business_id: string
  customer_id: string
  quote_id: string | null
  name: string
  description: string | null
  project_type: string
  status: string
  budget_hours: number | null
  budget_amount: number | null
  progress_percent: number
  start_date: string | null
  end_date: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  customer?: {
    customer_id: string
    name: string
    phone_number: string
    email: string
    address_line: string
  }
}

interface Quote {
  quote_id: string
  title: string
  total: number
  status: string
}

interface Milestone {
  milestone_id: string
  project_id: string
  name: string
  description: string | null
  budget_hours: number | null
  budget_amount: number | null
  due_date: string | null
  sort_order: number
  status: string
  completed_at: string | null
}

interface Change {
  change_id: string
  project_id: string
  change_type: string
  description: string
  amount: number
  hours: number
  status: string
  approved_at: string | null
  created_at: string
}

interface TimeEntry {
  time_entry_id: string
  project_id: string
  customer_id: string
  work_date: string
  description: string | null
  start_time: string | null
  end_time: string | null
  duration_minutes: number
  hourly_rate: number
  is_billable: boolean
  invoiced: boolean
  work_type?: { name: string; multiplier: number } | null
  customer?: { name: string } | null
}

interface Summary {
  total_hours: number
  billable_hours: number
  total_revenue: number
  uninvoiced_hours: number
  uninvoiced_revenue: number
  ata_additions: number
  ata_removals: number
  ata_net: number
  ata_hours: number
}

interface Profitability {
  revenue: { quote_amount: number; ata_additions: number; ata_removals: number; total: number }
  costs: { actual_hours: number; actual_amount: number }
  budget: {
    hours: number; hours_with_ata: number; amount: number; amount_with_ata: number
    hours_usage_percent: number; amount_usage_percent: number
  }
  invoicing: { invoiced_amount: number; invoiced_hours: number; uninvoiced_hours: number; uninvoiced_amount: number }
  margin: { amount: number; percent: number }
}

type TabKey = 'overview' | 'team' | 'milestones' | 'changes' | 'time' | 'material' | 'economy'

interface ProjectAssignment {
  id: string
  business_user_id: string
  role: string
  assigned_at: string
  business_user: {
    id: string
    name: string
    email: string
    role: string
    title: string | null
    color: string
    avatar_url: string | null
    is_active: boolean
  }
}

interface TeamMemberOption {
  id: string
  name: string
  email: string
  role: string
  title: string | null
  color: string
}

interface ProjectMaterial {
  material_id: string
  project_id: string
  grossist_product_id: string | null
  supplier_product_id: string | null
  name: string
  sku: string | null
  supplier_name: string | null
  quantity: number
  unit: string
  purchase_price: number | null
  sell_price: number | null
  markup_percent: number
  total_purchase: number | null
  total_sell: number | null
  invoiced: boolean
  invoice_id: string | null
  notes: string | null
  created_at: string
}

interface MaterialSummary {
  total_purchase: number
  total_sell: number
  margin_amount: number
  margin_percent: number
  uninvoiced_count: number
  uninvoiced_sell: number
}

// --- Helpers ---

const STATUS_MAP: Record<string, string> = {
  planning: 'Planering',
  active: 'Aktivt',
  paused: 'Pausat',
  completed: 'Avslutat',
  cancelled: 'Avbrutet'
}

const STATUS_STYLES: Record<string, string> = {
  planning: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  paused: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  completed: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30'
}

const PROJECT_TYPE_LABELS: Record<string, string> = {
  hourly: 'Lopande',
  fixed_price: 'Fast pris',
  mixed: 'Blandat'
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('sv-SE') + ' kr'
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('sv-SE')
}

function formatHours(hours: number): string {
  return hours.toFixed(2) + ' tim'
}

function budgetBarColor(percent: number): string {
  if (percent > 100) return 'bg-red-500'
  if (percent >= 80) return 'bg-amber-500'
  return 'bg-emerald-500'
}

// --- Main Component ---

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const business = useBusiness()
  const { can } = useCurrentUser()
  const projectId = params.id as string

  // Core data
  const [project, setProject] = useState<Project | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [changes, setChanges] = useState<Change[]>([])
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [materials, setMaterials] = useState<ProjectMaterial[]>([])
  const [materialSummary, setMaterialSummary] = useState<MaterialSummary | null>(null)
  const [showProductSearch, setShowProductSearch] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<{ quantity: number; markup_percent: number }>({ quantity: 1, markup_percent: 20 })

  // Team state
  const [projectTeam, setProjectTeam] = useState<ProjectAssignment[]>([])
  const [allTeamMembers, setAllTeamMembers] = useState<TeamMemberOption[]>([])
  const [assignLoading, setAssignLoading] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)

  // UI state
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  // Modals
  const [milestoneModal, setMilestoneModal] = useState<{ open: boolean; editing: Milestone | null }>({ open: false, editing: null })
  const [changeModal, setChangeModal] = useState(false)

  // Profitability (lazy loaded)
  const [profitability, setProfitability] = useState<Profitability | null>(null)
  const [profitLoading, setProfitLoading] = useState(false)

  // Saving states
  const [savingStatus, setSavingStatus] = useState(false)
  const [creatingInvoice, setCreatingInvoice] = useState(false)

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }, [])

  // --- Data Fetching ---

  const fetchProjectData = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`)
      if (!res.ok) throw new Error('Not found')
      const data = await res.json()
      setProject(data.project)
      setQuote(data.quote)
      setMilestones(data.milestones)
      setChanges(data.changes)
      setTimeEntries(data.time_entries)
      setSummary(data.summary)
      setMaterials(data.materials || [])
      // Compute material summary from response
      const mats = data.materials || []
      const totalPurchase = mats.reduce((s: number, m: any) => s + (m.total_purchase || 0), 0)
      const totalSell = mats.reduce((s: number, m: any) => s + (m.total_sell || 0), 0)
      const uninvoicedMats = mats.filter((m: any) => !m.invoiced)
      setMaterialSummary({
        total_purchase: totalPurchase,
        total_sell: totalSell,
        margin_amount: totalSell - totalPurchase,
        margin_percent: totalSell > 0 ? ((totalSell - totalPurchase) / totalSell) * 100 : 0,
        uninvoiced_count: uninvoicedMats.length,
        uninvoiced_sell: uninvoicedMats.reduce((s: number, m: any) => s + (m.total_sell || 0), 0)
      })
    } catch {
      setProject(null)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const fetchProfitability = useCallback(async () => {
    if (profitability) return
    setProfitLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/profitability`)
      if (res.ok) {
        const data = await res.json()
        setProfitability(data)
      }
    } catch {
      showToast('Kunde inte ladda ekonomidata', 'error')
    } finally {
      setProfitLoading(false)
    }
  }, [projectId, profitability, showToast])

  useEffect(() => {
    fetchProjectData()
  }, [fetchProjectData])

  useEffect(() => {
    if (activeTab === 'economy') {
      fetchProfitability()
    }
  }, [activeTab, fetchProfitability])

  const fetchProjectTeam = useCallback(async () => {
    try {
      const [teamRes, membersRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/team`),
        fetch('/api/team')
      ])
      if (teamRes.ok) {
        const data = await teamRes.json()
        setProjectTeam(data.assignments || [])
      }
      if (membersRes.ok) {
        const data = await membersRes.json()
        setAllTeamMembers(
          (data.members || [])
            .filter((m: any) => m.is_active && m.accepted_at)
            .map((m: any) => ({ id: m.id, name: m.name, email: m.email, role: m.role, title: m.title, color: m.color }))
        )
      }
    } catch { /* ignore */ }
  }, [projectId])

  useEffect(() => {
    if (activeTab === 'team') {
      fetchProjectTeam()
    }
  }, [activeTab, fetchProjectTeam])

  const handleAssignMember = async (businessUserId: string) => {
    setAssignLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessUserId, role: 'member' })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error)
      }
      showToast('Teammedlem tillagd', 'success')
      setShowAddMember(false)
      fetchProjectTeam()
    } catch (err: any) {
      showToast(err.message || 'Kunde inte tilldela', 'error')
    } finally {
      setAssignLoading(false)
    }
  }

  const handleRemoveMember = async (businessUserId: string) => {
    if (!confirm('Ta bort denna person från projektet?')) return
    try {
      const res = await fetch(`/api/projects/${projectId}/team?userId=${businessUserId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      showToast('Tilldelning borttagen', 'success')
      fetchProjectTeam()
    } catch {
      showToast('Kunde inte ta bort tilldelning', 'error')
    }
  }

  // --- Actions ---

  const updateProjectStatus = async (newStatus: string) => {
    if (!project) return
    setSavingStatus(true)
    setStatusDropdownOpen(false)
    try {
      const res = await fetch('/api/projects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.project_id, status: newStatus })
      })
      if (!res.ok) throw new Error()
      showToast(`Status andrad till ${STATUS_MAP[newStatus]}`, 'success')
      // Invalidate profitability cache on status change
      setProfitability(null)
      await fetchProjectData()
    } catch {
      showToast('Kunde inte uppdatera status', 'error')
    } finally {
      setSavingStatus(false)
    }
  }

  const cycleMilestoneStatus = async (milestone: Milestone) => {
    const order = ['pending', 'in_progress', 'completed']
    const idx = order.indexOf(milestone.status)
    const nextStatus = order[(idx + 1) % order.length]
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestone_id: milestone.milestone_id, status: nextStatus })
      })
      if (!res.ok) throw new Error()
      setProfitability(null)
      await fetchProjectData()
    } catch {
      showToast('Kunde inte uppdatera delmoment', 'error')
    }
  }

  const deleteMilestone = async (milestoneId: string) => {
    if (!confirm('Vill du ta bort detta delmoment?')) return
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones?milestoneId=${milestoneId}`, {
        method: 'DELETE'
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error')
      }
      showToast('Delmoment borttaget', 'success')
      await fetchProjectData()
    } catch (err: any) {
      showToast(err.message || 'Kunde inte ta bort', 'error')
    }
  }

  const updateChangeStatus = async (changeId: string, status: 'approved' | 'rejected') => {
    try {
      const res = await fetch(`/api/projects/${projectId}/changes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ change_id: changeId, status })
      })
      if (!res.ok) throw new Error()
      showToast(status === 'approved' ? 'ATA godkand' : 'ATA avslagen', 'success')
      setProfitability(null)
      await fetchProjectData()
    } catch {
      showToast('Kunde inte uppdatera ATA', 'error')
    }
  }

  const deleteChange = async (changeId: string) => {
    if (!confirm('Vill du ta bort denna ATA?')) return
    try {
      const res = await fetch(`/api/projects/${projectId}/changes?changeId=${changeId}`, {
        method: 'DELETE'
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error')
      }
      showToast('ATA borttagen', 'success')
      setProfitability(null)
      await fetchProjectData()
    } catch (err: any) {
      showToast(err.message || 'Kunde inte ta bort', 'error')
    }
  }

  const createInvoiceFromTime = async () => {
    if (!project || !summary) return
    const uninvoicedEntries = timeEntries.filter(e => !e.invoiced && e.is_billable)
    if (uninvoicedEntries.length === 0) {
      showToast('Inga ofakturerade tidrapporter', 'error')
      return
    }
    setCreatingInvoice(true)
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: project.customer_id,
          time_entry_ids: uninvoicedEntries.map(e => e.time_entry_id)
        })
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      showToast('Faktura skapad!', 'success')
      router.push(`/dashboard/invoices/${data.invoice?.invoice_id || ''}`)
    } catch {
      showToast('Kunde inte skapa faktura', 'error')
    } finally {
      setCreatingInvoice(false)
    }
  }

  const handleAddMaterial = async (product: SelectedProduct) => {
    try {
      const res = await fetch(`/api/projects/${project?.project_id}/materials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grossist_product_id: product.grossist_product_id,
          supplier_product_id: product.supplier_product_id,
          name: product.name,
          sku: product.sku,
          supplier_name: product.supplier_name,
          unit: product.unit,
          purchase_price: product.purchase_price,
          markup_percent: product.markup_percent,
          sell_price: product.sell_price
        })
      })
      if (!res.ok) throw new Error('Failed')
      setShowProductSearch(false)
      fetchProjectData()
      setToast({ show: true, message: 'Material tillagt', type: 'success' })
    } catch {
      setToast({ show: true, message: 'Kunde inte lägga till material', type: 'error' })
    }
  }

  const handleUpdateMaterial = async (materialId: string) => {
    try {
      const res = await fetch(`/api/projects/${project?.project_id}/materials`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          material_id: materialId,
          quantity: editValues.quantity,
          markup_percent: editValues.markup_percent
        })
      })
      if (!res.ok) throw new Error('Failed')
      setEditingMaterial(null)
      fetchProjectData()
    } catch {
      setToast({ show: true, message: 'Kunde inte uppdatera', type: 'error' })
    }
  }

  const handleDeleteMaterial = async (materialId: string) => {
    if (!confirm('Ta bort material?')) return
    try {
      const res = await fetch(`/api/projects/${project?.project_id}/materials?materialId=${materialId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      fetchProjectData()
      setToast({ show: true, message: 'Material borttaget', type: 'success' })
    } catch {
      setToast({ show: true, message: 'Kunde inte ta bort', type: 'error' })
    }
  }

  const handleInvoiceMaterials = async () => {
    const uninvoiced = materials.filter(m => !m.invoiced)
    if (uninvoiced.length === 0) return
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: project?.customer_id,
          project_material_ids: uninvoiced.map(m => m.material_id)
        })
      })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      fetchProjectData()
      setToast({ show: true, message: `Faktura ${data.invoice?.invoice_number} skapad`, type: 'success' })
    } catch {
      setToast({ show: true, message: 'Kunde inte skapa faktura', type: 'error' })
    }
  }

  // --- Loading / Not Found ---

  if (loading) {
    return (
      <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <div className="text-zinc-400">Projektet hittades inte</div>
      </div>
    )
  }

  // --- Computed values ---

  const budgetHoursPercent = project.budget_hours && summary
    ? Math.round((summary.total_hours / project.budget_hours) * 100)
    : 0
  const budgetAmountPercent = project.budget_amount && summary
    ? Math.round((summary.total_revenue / project.budget_amount) * 100)
    : 0

  // --- Tab definitions ---

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: 'Oversikt' },
    { key: 'team', label: 'Team' },
    { key: 'milestones', label: 'Delmoment' },
    { key: 'changes', label: 'ATA' },
    { key: 'time', label: 'Tidrapporter' },
    { key: 'material', label: 'Material' },
    { key: 'economy', label: 'Ekonomi' }
  ]

  // --- Render ---

  return (
    <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen">
      {/* Background blurs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[128px]"></div>
      </div>

      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${
          toast.type === 'success'
            ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
            : 'bg-red-500/20 border-red-500/30 text-red-400'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/projects" className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">{project.name}</h1>
              {project.customer && (
                <p className="text-sm text-zinc-400">{project.customer.name}</p>
              )}
            </div>
          </div>

          {/* Status badge + dropdown */}
          <div className="flex items-center gap-3 relative">
            <button
              onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
              disabled={savingStatus}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-full border transition-all ${STATUS_STYLES[project.status] || 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'}`}
            >
              {savingStatus ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : null}
              {STATUS_MAP[project.status] || project.status}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {statusDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-20 w-44 overflow-hidden">
                {Object.entries(STATUS_MAP).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => updateProjectStatus(key)}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-zinc-800 transition-all ${
                      key === project.status ? 'text-violet-400 bg-zinc-800/50' : 'text-zinc-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Close dropdown when clicking outside */}
        {statusDropdownOpen && (
          <div className="fixed inset-0 z-10" onClick={() => setStatusDropdownOpen(false)} />
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.key
                  ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* === TAB: Oversikt === */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Project info card */}
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4 sm:p-6">
              <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-violet-400" />
                Projektinfo
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-zinc-500">Typ</p>
                  <p className="text-white">{PROJECT_TYPE_LABELS[project.project_type] || project.project_type}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Startdatum</p>
                  <p className="text-white">{project.start_date ? formatDate(project.start_date) : '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Slutdatum</p>
                  <p className="text-white">{project.end_date ? formatDate(project.end_date) : '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Kund</p>
                  {project.customer ? (
                    <Link href={`/dashboard/customers/${project.customer.customer_id}`} className="text-violet-400 hover:text-violet-300">
                      {project.customer.name}
                    </Link>
                  ) : (
                    <p className="text-zinc-400">-</p>
                  )}
                </div>
                {quote && (
                  <div>
                    <p className="text-sm text-zinc-500">Kopplad offert</p>
                    <Link href={`/dashboard/quotes/${quote.quote_id}`} className="text-violet-400 hover:text-violet-300 flex items-center gap-1">
                      {quote.title || 'Offert'} <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                )}
                {project.description && (
                  <div className="sm:col-span-2 lg:col-span-4">
                    <p className="text-sm text-zinc-500">Beskrivning</p>
                    <p className="text-zinc-300">{project.description}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <Target className="w-5 h-5 text-fuchsia-400" />
                  Framsteg
                </h2>
                <span className="text-2xl font-bold text-white">{project.progress_percent}%</span>
              </div>
              <div className="w-full h-4 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(project.progress_percent, 100)}%` }}
                />
              </div>
            </div>

            {/* Budget vs Actual */}
            {(project.budget_hours || project.budget_amount) && summary && (
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4 sm:p-6">
                <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-cyan-400" />
                  Budget vs Utfall
                </h2>
                <div className="space-y-4">
                  {project.budget_hours != null && project.budget_hours > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-zinc-400">Timmar</span>
                        <span className="text-sm text-white">{formatHours(summary.total_hours)} / {formatHours(project.budget_hours)}</span>
                      </div>
                      <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${budgetBarColor(budgetHoursPercent)}`}
                          style={{ width: `${Math.min(budgetHoursPercent, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-zinc-500 mt-1">{budgetHoursPercent}% anvant</p>
                    </div>
                  )}
                  {project.budget_amount != null && project.budget_amount > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-zinc-400">Belopp</span>
                        <span className="text-sm text-white">{formatCurrency(summary.total_revenue)} / {formatCurrency(project.budget_amount)}</span>
                      </div>
                      <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${budgetBarColor(budgetAmountPercent)}`}
                          style={{ width: `${Math.min(budgetAmountPercent, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-zinc-500 mt-1">{budgetAmountPercent}% anvant</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Link
                href="/dashboard/time"
                className="flex flex-col items-center gap-2 p-4 bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 hover:border-violet-500/50 transition-all text-center"
              >
                <Timer className="w-5 h-5 text-violet-400" />
                <span className="text-sm text-zinc-300">Lagg till tid</span>
              </Link>
              <button
                onClick={() => { setActiveTab('milestones'); setMilestoneModal({ open: true, editing: null }) }}
                className="flex flex-col items-center gap-2 p-4 bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 hover:border-violet-500/50 transition-all text-center"
              >
                <Layers className="w-5 h-5 text-cyan-400" />
                <span className="text-sm text-zinc-300">Nytt delmoment</span>
              </button>
              <button
                onClick={() => { setActiveTab('changes'); setChangeModal(true) }}
                className="flex flex-col items-center gap-2 p-4 bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 hover:border-violet-500/50 transition-all text-center"
              >
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <span className="text-sm text-zinc-300">Ny ATA</span>
              </button>
              <button
                onClick={() => setActiveTab('economy')}
                className="flex flex-col items-center gap-2 p-4 bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 hover:border-violet-500/50 transition-all text-center"
              >
                <Receipt className="w-5 h-5 text-emerald-400" />
                <span className="text-sm text-zinc-300">Fakturera</span>
              </button>
            </div>
          </div>
        )}

        {/* === TAB: Delmoment === */}
        {activeTab === 'milestones' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Delmoment</h2>
              <button
                onClick={() => setMilestoneModal({ open: true, editing: null })}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl text-white text-sm font-medium hover:opacity-90"
              >
                <Plus className="w-4 h-4" />
                Lagg till delmoment
              </button>
            </div>

            {milestones.length === 0 ? (
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-12 text-center">
                <Layers className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-500">Inga delmoment annu</p>
                <p className="text-xs text-zinc-600 mt-1">Lagg till delmoment for att spara framsteg</p>
              </div>
            ) : (
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 divide-y divide-zinc-800">
                {milestones.map(ms => (
                  <div key={ms.milestone_id} className="p-4 hover:bg-zinc-800/30 transition-all">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => cycleMilestoneStatus(ms)}
                        className="flex-shrink-0"
                        title="Byt status"
                      >
                        {ms.status === 'completed' ? (
                          <CheckCircle className="w-6 h-6 text-emerald-400" />
                        ) : ms.status === 'in_progress' ? (
                          <CircleDot className="w-6 h-6 text-blue-400" />
                        ) : (
                          <div className="w-6 h-6 rounded-full border-2 border-zinc-600" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className={`font-medium text-sm ${ms.status === 'completed' ? 'text-zinc-500 line-through' : 'text-white'}`}>
                            {ms.name}
                          </p>
                          <span className={`px-2 py-0.5 text-xs rounded-full border ${
                            ms.status === 'completed'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : ms.status === 'in_progress'
                              ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                              : 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
                          }`}>
                            {ms.status === 'completed' ? 'Klart' : ms.status === 'in_progress' ? 'Pagaende' : 'Vantande'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                          {ms.due_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(ms.due_date)}
                            </span>
                          )}
                          {ms.budget_hours != null && (
                            <span>{formatHours(ms.budget_hours)}</span>
                          )}
                          {ms.budget_amount != null && (
                            <span>{formatCurrency(ms.budget_amount)}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => setMilestoneModal({ open: true, editing: ms })}
                          className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteMilestone(ms.milestone_id)}
                          className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* === TAB: ATA === */}
        {activeTab === 'changes' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">ATA (Andring/Tillagg/Avgaende)</h2>
              <button
                onClick={() => setChangeModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl text-white text-sm font-medium hover:opacity-90"
              >
                <Plus className="w-4 h-4" />
                Ny ATA
              </button>
            </div>

            {/* ATA summary */}
            {summary && (summary.ata_additions > 0 || summary.ata_removals > 0) && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                  <p className="text-xs text-emerald-400 mb-1">Tillagg</p>
                  <p className="text-lg font-bold text-emerald-400">+{formatCurrency(summary.ata_additions)}</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
                  <p className="text-xs text-red-400 mb-1">Avgaende</p>
                  <p className="text-lg font-bold text-red-400">-{formatCurrency(summary.ata_removals)}</p>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-center">
                  <p className="text-xs text-zinc-400 mb-1">Netto</p>
                  <p className={`text-lg font-bold ${summary.ata_net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {summary.ata_net >= 0 ? '+' : ''}{formatCurrency(summary.ata_net)}
                  </p>
                </div>
              </div>
            )}

            {changes.length === 0 ? (
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-12 text-center">
                <AlertTriangle className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-500">Inga ATA annu</p>
                <p className="text-xs text-zinc-600 mt-1">Registrera tillagg, andringar eller avgaende arbeten</p>
              </div>
            ) : (
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 divide-y divide-zinc-800">
                {changes.map(change => (
                  <div key={change.change_id} className="p-4 hover:bg-zinc-800/30 transition-all">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 text-xs rounded-full border ${
                            change.change_type === 'addition'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : change.change_type === 'change'
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              : 'bg-red-500/20 text-red-400 border-red-500/30'
                          }`}>
                            {change.change_type === 'addition' ? 'Tillagg' : change.change_type === 'change' ? 'Andring' : 'Avgaende'}
                          </span>
                          <span className={`px-2 py-0.5 text-xs rounded-full border ${
                            change.status === 'approved'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : change.status === 'rejected'
                              ? 'bg-red-500/20 text-red-400 border-red-500/30'
                              : 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
                          }`}>
                            {change.status === 'approved' ? 'Godkand' : change.status === 'rejected' ? 'Avslagen' : 'Vantande'}
                          </span>
                        </div>
                        <p className="text-white text-sm mb-1">{change.description}</p>
                        <div className="flex gap-3 text-xs text-zinc-500">
                          {change.amount > 0 && <span>{formatCurrency(change.amount)}</span>}
                          {change.hours > 0 && <span>{formatHours(change.hours)}</span>}
                          <span>{formatDate(change.created_at)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        {change.status === 'pending' && (
                          <>
                            <button
                              onClick={() => updateChangeStatus(change.change_id, 'approved')}
                              className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all"
                              title="Godkann"
                            >
                              <CheckCircle className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => updateChangeStatus(change.change_id, 'rejected')}
                              className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                              title="Avsla"
                            >
                              <XCircle className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => deleteChange(change.change_id)}
                              className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* === TAB: Tidrapporter === */}
        {activeTab === 'time' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Tidrapporter</h2>
              <Link
                href="/dashboard/time"
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl text-white text-sm font-medium hover:opacity-90"
              >
                <Plus className="w-4 h-4" />
                Lagg till tid
              </Link>
            </div>

            {/* Time summary */}
            {summary && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-center">
                  <p className="text-xs text-zinc-500 mb-1">Totalt</p>
                  <p className="text-lg font-bold text-white">{formatHours(summary.total_hours)}</p>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-center">
                  <p className="text-xs text-zinc-500 mb-1">Debiterbart</p>
                  <p className="text-lg font-bold text-white">{formatHours(summary.billable_hours)}</p>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-center">
                  <p className="text-xs text-zinc-500 mb-1">Ofakturerat</p>
                  <p className="text-lg font-bold text-amber-400">{formatHours(summary.uninvoiced_hours)}</p>
                </div>
              </div>
            )}

            {timeEntries.length === 0 ? (
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-12 text-center">
                <Clock className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-500">Inga tidrapporter annu</p>
                <Link href="/dashboard/time" className="text-sm text-violet-400 hover:text-violet-300 mt-2 inline-block">
                  Lagg till din forsta tidrapport
                </Link>
              </div>
            ) : (
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 divide-y divide-zinc-800">
                {/* Table header */}
                <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-3 text-xs text-zinc-500 font-medium">
                  <div className="col-span-2">Datum</div>
                  <div className="col-span-3">Beskrivning</div>
                  <div className="col-span-1 text-right">Tid</div>
                  <div className="col-span-2 text-right">Timpris</div>
                  <div className="col-span-2 text-right">Totalt</div>
                  <div className="col-span-2 text-right">Status</div>
                </div>

                {timeEntries.map(entry => {
                  const hours = (entry.duration_minutes || 0) / 60
                  const total = hours * (entry.hourly_rate || 0)
                  return (
                    <div key={entry.time_entry_id} className="p-4 hover:bg-zinc-800/30 transition-all">
                      {/* Mobile layout */}
                      <div className="sm:hidden space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-white">{formatDate(entry.work_date)}</span>
                          <div className="flex items-center gap-2">
                            {entry.work_type?.name && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">
                                {entry.work_type.name}
                              </span>
                            )}
                            <span className={`px-2 py-0.5 text-xs rounded-full border ${
                              entry.invoiced
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                : 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
                            }`}>
                              {entry.invoiced ? 'Fakturerad' : 'Ofakturerad'}
                            </span>
                          </div>
                        </div>
                        {entry.description && <p className="text-sm text-zinc-400">{entry.description}</p>}
                        <div className="flex items-center justify-between text-xs text-zinc-500">
                          <span>{formatHours(hours)}</span>
                          <span>{formatCurrency(Math.round(total))}</span>
                        </div>
                      </div>

                      {/* Desktop layout */}
                      <div className="hidden sm:grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-2 text-sm text-white">{formatDate(entry.work_date)}</div>
                        <div className="col-span-3 text-sm text-zinc-400 truncate">{entry.description || '-'}</div>
                        <div className="col-span-1 text-sm text-white text-right">{formatHours(hours)}</div>
                        <div className="col-span-2 text-sm text-zinc-400 text-right">{formatCurrency(entry.hourly_rate)}/tim</div>
                        <div className="col-span-2 text-sm text-white text-right font-medium">{formatCurrency(Math.round(total))}</div>
                        <div className="col-span-2 flex items-center justify-end gap-2">
                          {entry.work_type?.name && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">
                              {entry.work_type.name}
                            </span>
                          )}
                          <span className={`px-2 py-0.5 text-xs rounded-full border ${
                            entry.invoiced
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
                          }`}>
                            {entry.invoiced ? 'Fakturerad' : 'Ofakturerad'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* === TAB: Material === */}
        {activeTab === 'material' && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl p-4 border border-zinc-800">
                <p className="text-xs text-zinc-500 mb-1">Inköpskostnad</p>
                <p className="text-xl font-bold text-white">{formatCurrency(materialSummary?.total_purchase || 0)}</p>
              </div>
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl p-4 border border-zinc-800">
                <p className="text-xs text-zinc-500 mb-1">Kundpris</p>
                <p className="text-xl font-bold text-white">{formatCurrency(materialSummary?.total_sell || 0)}</p>
              </div>
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl p-4 border border-zinc-800">
                <p className="text-xs text-zinc-500 mb-1">Marginal</p>
                <p className="text-xl font-bold text-emerald-400">
                  {formatCurrency(materialSummary?.margin_amount || 0)}
                  <span className="text-sm ml-1">({Math.round(materialSummary?.margin_percent || 0)}%)</span>
                </p>
              </div>
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl p-4 border border-zinc-800">
                <p className="text-xs text-zinc-500 mb-1">Ofakturerat</p>
                <p className="text-xl font-bold text-amber-400">{formatCurrency(materialSummary?.uninvoiced_sell || 0)}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Material ({materials.length})</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowProductSearch(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-xl text-sm hover:opacity-90"
                >
                  <Plus className="w-4 h-4" /> Lägg till material
                </button>
                {(materialSummary?.uninvoiced_count || 0) > 0 && (
                  <button
                    onClick={handleInvoiceMaterials}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-sm hover:bg-emerald-500/30"
                  >
                    <Receipt className="w-4 h-4" /> Fakturera ({formatCurrency(materialSummary?.uninvoiced_sell || 0)})
                  </button>
                )}
              </div>
            </div>

            {/* Material list */}
            {materials.length === 0 ? (
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-12 text-center">
                <Package className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400 mb-1">Inga material tillagda</p>
                <p className="text-sm text-zinc-600">Sök och lägg till material från grossister</p>
              </div>
            ) : (
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-zinc-800 text-xs text-zinc-500 font-medium">
                  <div className="col-span-3">Produkt</div>
                  <div className="col-span-2">Leverantör</div>
                  <div className="col-span-1 text-right">Antal</div>
                  <div className="col-span-1 text-right">Inköp</div>
                  <div className="col-span-1 text-right">Påslag</div>
                  <div className="col-span-1 text-right">Kundpris</div>
                  <div className="col-span-1 text-right">Totalt</div>
                  <div className="col-span-2 text-right">Status</div>
                </div>
                {/* Rows */}
                {materials.map(mat => (
                  <div key={mat.material_id} className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-zinc-800/50 items-center hover:bg-zinc-800/30">
                    <div className="col-span-3">
                      <p className="text-sm font-medium text-white truncate">{mat.name}</p>
                      {mat.sku && <p className="text-xs text-zinc-500">Art: {mat.sku}</p>}
                    </div>
                    <div className="col-span-2 text-sm text-zinc-400 truncate">{mat.supplier_name || '-'}</div>
                    {editingMaterial === mat.material_id ? (
                      <>
                        <div className="col-span-1">
                          <input
                            type="number"
                            value={editValues.quantity}
                            onChange={e => setEditValues(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                            className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm text-white text-right"
                          />
                        </div>
                        <div className="col-span-1 text-sm text-zinc-400 text-right">{mat.purchase_price} kr</div>
                        <div className="col-span-1">
                          <input
                            type="number"
                            value={editValues.markup_percent}
                            onChange={e => setEditValues(prev => ({ ...prev, markup_percent: parseFloat(e.target.value) || 0 }))}
                            className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm text-white text-right"
                          />
                        </div>
                        <div className="col-span-1 text-sm text-zinc-400 text-right">
                          {Math.round((mat.purchase_price || 0) * (1 + editValues.markup_percent / 100))} kr
                        </div>
                        <div className="col-span-1 text-sm text-white text-right font-medium">
                          {formatCurrency(Math.round(editValues.quantity * (mat.purchase_price || 0) * (1 + editValues.markup_percent / 100)))}
                        </div>
                        <div className="col-span-2 flex justify-end gap-1">
                          <button
                            onClick={() => handleUpdateMaterial(mat.material_id)}
                            className="p-1 text-emerald-400 hover:text-emerald-300"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingMaterial(null)}
                            className="p-1 text-zinc-500 hover:text-zinc-300"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="col-span-1 text-sm text-zinc-400 text-right">{mat.quantity} {mat.unit}</div>
                        <div className="col-span-1 text-sm text-zinc-400 text-right">{mat.purchase_price} kr</div>
                        <div className="col-span-1 text-sm text-zinc-400 text-right">{mat.markup_percent}%</div>
                        <div className="col-span-1 text-sm text-zinc-400 text-right">{mat.sell_price} kr</div>
                        <div className="col-span-1 text-sm text-white text-right font-medium">{formatCurrency(mat.total_sell || 0)}</div>
                        <div className="col-span-2 flex items-center justify-end gap-1">
                          {mat.invoiced ? (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              Fakturerad
                            </span>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setEditingMaterial(mat.material_id)
                                  setEditValues({ quantity: mat.quantity, markup_percent: mat.markup_percent })
                                }}
                                className="p-1 text-zinc-500 hover:text-violet-400"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteMaterial(mat.material_id)}
                                className="p-1 text-zinc-500 hover:text-red-400"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Product search modal */}
            <ProductSearchModal
              isOpen={showProductSearch}
              onClose={() => setShowProductSearch(false)}
              onSelect={handleAddMaterial}
              businessId={business.business_id}
            />
          </div>
        )}

        {/* === TAB: Team === */}
        {activeTab === 'team' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-violet-400" />
                Tilldelade ({projectTeam.length})
              </h2>
              {can('see_all_projects') && (
                <div className="relative">
                  <button
                    onClick={() => setShowAddMember(!showAddMember)}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl text-white text-sm font-medium hover:opacity-90"
                  >
                    <UserPlus className="w-4 h-4" />
                    Lagg till
                  </button>
                  {showAddMember && (
                    <div className="absolute right-0 top-full mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-30 overflow-hidden">
                      {allTeamMembers
                        .filter(m => !projectTeam.some(a => a.business_user_id === m.id))
                        .map(member => (
                          <button
                            key={member.id}
                            onClick={() => handleAssignMember(member.id)}
                            disabled={assignLoading}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800 transition-all disabled:opacity-50"
                          >
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: member.color }}
                            >
                              <span className="text-white text-xs font-bold">
                                {member.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm text-white truncate">{member.name}</p>
                              <p className="text-xs text-zinc-500 truncate">{member.title || member.role}</p>
                            </div>
                          </button>
                        ))}
                      {allTeamMembers.filter(m => !projectTeam.some(a => a.business_user_id === m.id)).length === 0 && (
                        <p className="px-4 py-3 text-sm text-zinc-500">Alla teammedlemmar ar redan tillagda</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {projectTeam.length === 0 ? (
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-12 text-center">
                <Users className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400 font-medium">Ingen tilldelad annu</p>
                <p className="text-zinc-600 text-sm mt-1">Lagg till teammedlemmar for att tilldela dem detta projekt</p>
              </div>
            ) : (
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 divide-y divide-zinc-800">
                {projectTeam.map(assignment => (
                  <div key={assignment.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: assignment.business_user.color }}
                      >
                        <span className="text-white text-sm font-bold">
                          {assignment.business_user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-white font-medium">{assignment.business_user.name}</p>
                        <p className="text-xs text-zinc-500">{assignment.business_user.title || assignment.business_user.role}</p>
                      </div>
                      <span className="px-2 py-0.5 text-xs rounded-full bg-zinc-500/20 text-zinc-400 border border-zinc-500/30">
                        {assignment.role === 'lead' ? 'Ansvarig' : 'Medlem'}
                      </span>
                    </div>
                    {can('see_all_projects') && (
                      <button
                        onClick={() => handleRemoveMember(assignment.business_user_id)}
                        className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* === TAB: Ekonomi === */}
        {activeTab === 'economy' && (
          <div className="space-y-6">
            {profitLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
              </div>
            ) : profitability ? (
              <>
                {/* Revenue / Costs / Result / Invoicing cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Intakter */}
                  <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                      <p className="text-sm font-medium text-zinc-400">Intakter</p>
                    </div>
                    <p className="text-2xl font-bold text-white mb-2">{formatCurrency(profitability.revenue.total)}</p>
                    <div className="space-y-1 text-xs text-zinc-500">
                      <div className="flex justify-between">
                        <span>Offert</span>
                        <span>{formatCurrency(profitability.revenue.quote_amount)}</span>
                      </div>
                      {profitability.revenue.ata_additions > 0 && (
                        <div className="flex justify-between text-emerald-400">
                          <span>+ ATA tillagg</span>
                          <span>+{formatCurrency(profitability.revenue.ata_additions)}</span>
                        </div>
                      )}
                      {profitability.revenue.ata_removals > 0 && (
                        <div className="flex justify-between text-red-400">
                          <span>- ATA avgaende</span>
                          <span>-{formatCurrency(profitability.revenue.ata_removals)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Kostnader */}
                  <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <p className="text-sm font-medium text-zinc-400">Kostnader</p>
                    </div>
                    <p className="text-2xl font-bold text-white mb-2">{formatCurrency(profitability.costs.actual_amount)}</p>
                    <div className="text-xs text-zinc-500">
                      <div className="flex justify-between">
                        <span>{formatHours(profitability.costs.actual_hours)} arbetad tid</span>
                      </div>
                    </div>
                  </div>

                  {/* Resultat */}
                  <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="w-4 h-4 text-violet-400" />
                      <p className="text-sm font-medium text-zinc-400">Resultat</p>
                    </div>
                    <p className={`text-2xl font-bold mb-1 ${profitability.margin.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {profitability.margin.amount >= 0 ? '+' : ''}{formatCurrency(profitability.margin.amount)}
                    </p>
                    <p className={`text-sm font-medium ${profitability.margin.percent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {profitability.margin.percent}% marginal
                    </p>
                  </div>

                  {/* Fakturering */}
                  <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Receipt className="w-4 h-4 text-cyan-400" />
                      <p className="text-sm font-medium text-zinc-400">Fakturering</p>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="text-xs text-zinc-500">Fakturerat</p>
                        <p className="text-lg font-bold text-white">{formatCurrency(profitability.invoicing.invoiced_amount)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Ofakturerat</p>
                        <p className="text-lg font-bold text-amber-400">{formatCurrency(profitability.invoicing.uninvoiced_amount)}</p>
                        <p className="text-xs text-zinc-600">{formatHours(profitability.invoicing.uninvoiced_hours)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Budget usage bars */}
                <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4 sm:p-6">
                  <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-cyan-400" />
                    Budgetforbrukning
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-zinc-400">Timmar</span>
                        <span className="text-sm text-white">
                          {formatHours(profitability.costs.actual_hours)} / {formatHours(profitability.budget.hours_with_ata)}
                        </span>
                      </div>
                      <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${budgetBarColor(profitability.budget.hours_usage_percent)}`}
                          style={{ width: `${Math.min(profitability.budget.hours_usage_percent, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-zinc-500 mt-1">{profitability.budget.hours_usage_percent}%</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-zinc-400">Belopp</span>
                        <span className="text-sm text-white">
                          {formatCurrency(profitability.costs.actual_amount)} / {formatCurrency(profitability.budget.amount_with_ata)}
                        </span>
                      </div>
                      <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${budgetBarColor(profitability.budget.amount_usage_percent)}`}
                          style={{ width: `${Math.min(profitability.budget.amount_usage_percent, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-zinc-500 mt-1">{profitability.budget.amount_usage_percent}%</p>
                    </div>
                  </div>
                </div>

                {/* Create invoice button */}
                {profitability.invoicing.uninvoiced_amount > 0 && (
                  <button
                    onClick={createInvoiceFromTime}
                    disabled={creatingInvoice}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {creatingInvoice ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Receipt className="w-5 h-5" />
                    )}
                    Skapa faktura ({formatCurrency(profitability.invoicing.uninvoiced_amount)})
                  </button>
                )}
              </>
            ) : (
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-12 text-center">
                <BarChart3 className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-500">Kunde inte ladda ekonomidata</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* === Milestone Modal === */}
      {milestoneModal.open && (
        <MilestoneModal
          projectId={projectId}
          editing={milestoneModal.editing}
          onClose={() => setMilestoneModal({ open: false, editing: null })}
          onSaved={() => {
            setMilestoneModal({ open: false, editing: null })
            fetchProjectData()
            showToast(milestoneModal.editing ? 'Delmoment uppdaterat' : 'Delmoment skapat', 'success')
          }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {/* === Change (ATA) Modal === */}
      {changeModal && (
        <ChangeModal
          projectId={projectId}
          onClose={() => setChangeModal(false)}
          onSaved={() => {
            setChangeModal(false)
            setProfitability(null)
            fetchProjectData()
            showToast('ATA skapad', 'success')
          }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}
    </div>
  )
}

// --- Milestone Modal ---

function MilestoneModal({ projectId, editing, onClose, onSaved, onError }: {
  projectId: string
  editing: Milestone | null
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [name, setName] = useState(editing?.name || '')
  const [description, setDescription] = useState(editing?.description || '')
  const [budgetHours, setBudgetHours] = useState(editing?.budget_hours?.toString() || '')
  const [budgetAmount, setBudgetAmount] = useState(editing?.budget_amount?.toString() || '')
  const [dueDate, setDueDate] = useState(editing?.due_date || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) {
      onError('Namn kravs')
      return
    }
    setSaving(true)
    try {
      const body: Record<string, any> = {
        name: name.trim(),
        description: description.trim() || null,
        budget_hours: budgetHours ? parseFloat(budgetHours) : null,
        budget_amount: budgetAmount ? parseFloat(budgetAmount) : null,
        due_date: dueDate || null
      }

      if (editing) {
        body.milestone_id = editing.milestone_id
      }

      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error')
      }
      onSaved()
    } catch (err: any) {
      onError(err.message || 'Kunde inte spara')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            {editing ? 'Redigera delmoment' : 'Nytt delmoment'}
          </h2>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Namn *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="T.ex. Stomresning"
              autoFocus
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Beskrivning</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Valfri beskrivning"
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-zinc-400 mb-2 block">Budgettimmar</label>
              <input
                type="number"
                value={budgetHours}
                onChange={e => setBudgetHours(e.target.value)}
                placeholder="0"
                min="0"
                step="0.5"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-2 block">Budgetbelopp (kr)</label>
              <input
                type="number"
                value={budgetAmount}
                onChange={e => setBudgetAmount(e.target.value)}
                placeholder="0"
                min="0"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Forfallodatum</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white hover:bg-zinc-700"
          >
            Avbryt
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {editing ? 'Spara' : 'Skapa'}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Change (ATA) Modal ---

function ChangeModal({ projectId, onClose, onSaved, onError }: {
  projectId: string
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [changeType, setChangeType] = useState<'addition' | 'change' | 'removal'>('addition')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [hours, setHours] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!description.trim()) {
      onError('Beskrivning kravs')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          change_type: changeType,
          description: description.trim(),
          amount: amount ? parseFloat(amount) : 0,
          hours: hours ? parseFloat(hours) : 0
        })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error')
      }
      onSaved()
    } catch (err: any) {
      onError(err.message || 'Kunde inte skapa ATA')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Ny ATA</h2>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Typ</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'addition' as const, label: 'Tillagg', color: 'emerald' },
                { key: 'change' as const, label: 'Andring', color: 'amber' },
                { key: 'removal' as const, label: 'Avgaende', color: 'red' }
              ]).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setChangeType(opt.key)}
                  className={`p-3 rounded-xl text-sm font-medium text-center transition-all border ${
                    changeType === opt.key
                      ? opt.color === 'emerald'
                        ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                        : opt.color === 'amber'
                        ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                        : 'bg-red-500/20 border-red-500/30 text-red-400'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Beskrivning *</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Beskriv andringar/tillagg..."
              autoFocus
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-zinc-400 mb-2 block">Belopp (kr)</label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                min="0"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-2 block">Timmar</label>
              <input
                type="number"
                value={hours}
                onChange={e => setHours(e.target.value)}
                placeholder="0"
                min="0"
                step="0.5"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white hover:bg-zinc-700"
          >
            Avbryt
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !description.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Skapa
          </button>
        </div>
      </div>
    </div>
  )
}
