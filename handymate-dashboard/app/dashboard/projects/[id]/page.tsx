'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
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
  UserPlus,
  Upload,
  Download,
  Image,
  FolderOpen,
  CloudSun,
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  PenTool,
  Activity,
  RefreshCw,
  Zap,
  Send,
  Eye,
  Copy,
  FileSignature,
  ChevronRight,
  MapPin,
  Phone,
  Printer,
  MessageSquare,
  GripVertical,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import ProductSearchModal from '@/components/ProductSearchModal'
import { SelectedProduct } from '@/lib/suppliers/types'
import { DEFAULT_TASKS, TASK_CATEGORIES } from '@/lib/task-defaults'
import Link from 'next/link'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import dynamic from 'next/dynamic'
import ProjectInvoiceModal from '@/components/invoices/ProjectInvoiceModal'
import TimeEntryModal from '@/components/time/TimeEntryModal'

const ProjectCanvas = dynamic(() => import('@/components/project/ProjectCanvas'), {
  loading: () => (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
    </div>
  ),
  ssr: false,
})

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
  ai_health_score: number | null
  ai_health_summary: string | null
  ai_auto_created: boolean
  ai_last_analyzed_at: string | null
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
  actual_hours: number
  actual_revenue: number
}

interface AtaItem {
  name: string
  description?: string
  quantity: number
  unit: string
  unit_price: number
  rot_rut_type?: string | null
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
  ata_number?: number
  items?: AtaItem[]
  total?: number
  sign_token?: string
  sent_at?: string | null
  signed_at?: string | null
  signed_by_name?: string | null
  declined_at?: string | null
  declined_reason?: string | null
  notes?: string | null
  invoice_id?: string | null
  invoiced_at?: string | null
  customer_id?: string | null
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
  revenue: { quote_amount: number; ata_additions: number; ata_removals: number; material_sell: number; total: number }
  costs: { actual_hours: number; actual_amount: number; material_purchase: number; subcontractor: number; other: number; total: number }
  extra_costs: ExtraCost[]
  budget: {
    hours: number; hours_with_ata: number; amount: number; amount_with_ata: number
    hours_usage_percent: number; amount_usage_percent: number
  }
  invoicing: { invoiced_amount: number; invoiced_hours: number; uninvoiced_hours: number; uninvoiced_amount: number; invoiced_material: number; uninvoiced_material: number }
  margin: { amount: number; percent: number }
}

interface ExtraCost {
  id: string
  category: string
  description: string | null
  amount: number
  date: string
}

type TabKey = 'overview' | 'team' | 'schedule' | 'milestones' | 'changes' | 'time' | 'material' | 'economy' | 'documents' | 'log' | 'checklists' | 'ai_log' | 'arbetsorder' | 'leverantorer' | 'canvas' | 'field_reports'

interface ScheduleEntry {
  id: string
  title: string
  start_datetime: string
  end_datetime: string
  all_day: boolean
  type: string
  status: string
  color: string | null
  business_user?: { id: string; name: string; color: string }
}

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
  planning: 'bg-primary-700/20 text-primary-600 border-primary-600/30',
  active: 'bg-emerald-100 text-emerald-600 border-emerald-500/30',
  paused: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  completed: 'bg-gray-100 text-gray-500 border-gray-300',
  cancelled: 'bg-red-100 text-red-600 border-red-500/30'
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

// --- Sortable Milestone Row ---

function SortableMilestoneRow({
  milestone: ms,
  onCycleStatus,
  onEdit,
  onDelete,
  formatDate,
  formatHours,
  formatCurrency,
}: {
  milestone: Milestone
  onCycleStatus: (ms: Milestone) => void
  onEdit: (ms: Milestone) => void
  onDelete: (id: string) => void
  formatDate: (d: string) => string
  formatHours: (h: number) => string
  formatCurrency: (v: number) => string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ms.milestone_id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const hasTimeData = ms.actual_hours > 0 || ms.budget_hours != null

  return (
    <div ref={setNodeRef} style={style} className="p-4 hover:bg-gray-100/30 transition-all">
      <div className="flex items-center gap-3">
        <button
          className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none text-gray-300 hover:text-gray-500"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <button
          onClick={() => onCycleStatus(ms)}
          className="flex-shrink-0"
          title="Byt status"
        >
          {ms.status === 'completed' ? (
            <CheckCircle className="w-6 h-6 text-emerald-600" />
          ) : ms.status === 'in_progress' ? (
            <CircleDot className="w-6 h-6 text-primary-600" />
          ) : (
            <div className="w-6 h-6 rounded-full border-2 border-gray-300" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className={`font-medium text-sm ${ms.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
              {ms.name}
            </p>
            <span className={`px-2 py-0.5 text-xs rounded-full border ${
              ms.status === 'completed'
                ? 'bg-emerald-100 text-emerald-600 border-emerald-500/30'
                : ms.status === 'in_progress'
                ? 'bg-primary-700/20 text-primary-600 border-primary-600/30'
                : 'bg-gray-100 text-gray-500 border-gray-300'
            }`}>
              {ms.status === 'completed' ? 'Klart' : ms.status === 'in_progress' ? 'Pågående' : 'Väntande'}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-gray-400">
            {ms.due_date && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(ms.due_date)}
              </span>
            )}
            {hasTimeData && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {ms.actual_hours}h{ms.budget_hours != null ? ` / ${formatHours(ms.budget_hours)}` : ''}
              </span>
            )}
            {ms.budget_amount != null && (
              <span>{formatCurrency(ms.budget_amount)}</span>
            )}
          </div>
          {ms.budget_hours != null && ms.budget_hours > 0 && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[120px]">
                <div
                  className={`h-full rounded-full transition-all ${
                    ms.actual_hours > ms.budget_hours ? 'bg-red-500' : 'bg-primary-600'
                  }`}
                  style={{ width: `${Math.min((ms.actual_hours / ms.budget_hours) * 100, 100)}%` }}
                />
              </div>
              <span className={`text-[10px] ${ms.actual_hours > ms.budget_hours ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                {Math.round((ms.actual_hours / ms.budget_hours) * 100)}%
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onEdit(ms)}
            className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(ms.milestone_id)}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-500/10 rounded-lg transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Main Component ---

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const business = useBusiness()
  const { can, user: currentUser, isOwnerOrAdmin } = useCurrentUser()
  const projectId = (params as any)?.id as string

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
  const [projectPriceList, setProjectPriceList] = useState<Array<{ id: string; name: string; unit: string; unit_price: number; default_quantity: number; category: string }>>([])

  // Team state
  const [projectTeam, setProjectTeam] = useState<ProjectAssignment[]>([])
  const [allTeamMembers, setAllTeamMembers] = useState<TeamMemberOption[]>([])
  const [assignLoading, setAssignLoading] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)

  // Schedule state
  const [projectSchedule, setProjectSchedule] = useState<ScheduleEntry[]>([])

  // DEL 3-5: Documents, Logs, Checklists
  const [documents, setDocuments] = useState<any[]>([])
  const [docCategory, setDocCategory] = useState('all')
  const [uploading, setUploading] = useState(false)
  const [generatedDocs, setGeneratedDocs] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [showLogModal, setShowLogModal] = useState(false)
  const [editingLog, setEditingLog] = useState<any>(null)
  const [checklists, setChecklists] = useState<any[]>([])
  const [checklistTemplates, setChecklistTemplates] = useState<any[]>([])
  const [showChecklistCreate, setShowChecklistCreate] = useState(false)
  const [activeChecklist, setActiveChecklist] = useState<any>(null)

  // Form submissions
  const [formSubmissions, setFormSubmissions] = useState<any[]>([])
  const [formTemplates, setFormTemplates] = useState<any[]>([])
  const [showFormCreate, setShowFormCreate] = useState(false)
  const [activeForm, setActiveForm] = useState<any>(null)
  const [formAnswers, setFormAnswers] = useState<Record<string, any>>({})
  const [formSaving, setFormSaving] = useState(false)
  const [formSignName, setFormSignName] = useState('')
  const [formSignDrawing, setFormSignDrawing] = useState(false)

  // AI log state
  const [aiLogs, setAiLogs] = useState<{ id: string; event_type: string; action: string; details: Record<string, unknown>; created_at: string }[]>([])
  const [aiLogLoading, setAiLogLoading] = useState(false)
  const [analyzingHealth, setAnalyzingHealth] = useState(false)

  // UI state
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  // Modals
  const [milestoneModal, setMilestoneModal] = useState<{ open: boolean; editing: Milestone | null }>({ open: false, editing: null })
  const [changeModal, setChangeModal] = useState<{ open: boolean; editing: Change | null }>({ open: false, editing: null })
  const [costModal, setCostModal] = useState(false)
  const [sendingAtaId, setSendingAtaId] = useState<string | null>(null)
  const [expandedAtaId, setExpandedAtaId] = useState<string | null>(null)
  const [deletingCostId, setDeletingCostId] = useState<string | null>(null)

  // Work orders
  const [workOrders, setWorkOrders] = useState<any[]>([])
  const [woModal, setWoModal] = useState<{ open: boolean; editing: any | null }>({ open: false, editing: null })
  const [woDetail, setWoDetail] = useState<any | null>(null)
  const [woSending, setWoSending] = useState<string | null>(null)

  // Supplier invoices
  const [supplierInvoices, setSupplierInvoices] = useState<any[]>([])
  const [siModal, setSiModal] = useState<{ open: boolean; editing: any | null }>({ open: false, editing: null })

  // Time entry modal
  const [showTimeModal, setShowTimeModal] = useState(false)
  const [timeModalCustomers, setTimeModalCustomers] = useState<{ customer_id: string; name: string }[]>([])
  const [timeModalBookings, setTimeModalBookings] = useState<{ booking_id: string; notes: string; customer_id: string; customer?: { name: string } }[]>([])
  const [timeModalProjects, setTimeModalProjects] = useState<{ project_id: string; name: string; customer_id: string | null }[]>([])
  const [timeModalWorkTypes, setTimeModalWorkTypes] = useState<{ work_type_id: string; name: string; multiplier: number; billable_default: boolean }[]>([])
  const [timeModalTeamMembers, setTimeModalTeamMembers] = useState<{ id: string; name: string; color: string }[]>([])
  const [timeFormPersonId, setTimeFormPersonId] = useState('')
  const [timeFormData, setTimeFormData] = useState({
    customer_id: '',
    booking_id: '',
    work_type_id: '',
    project_id: '',
    work_category: 'work' as string,
    description: '',
    work_date: new Date().toISOString().slice(0, 10),
    start_time: '',
    end_time: '',
    duration_hours: 0,
    duration_minutes: 0,
    break_minutes: 0,
    hourly_rate: '',
    is_billable: true
  })
  const [timeSaving, setTimeSaving] = useState(false)

  // Profitability (lazy loaded)
  const [profitability, setProfitability] = useState<Profitability | null>(null)
  const [profitLoading, setProfitLoading] = useState(false)

  // Saving states
  const [savingStatus, setSavingStatus] = useState(false)
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }, [])

  // --- Time Modal Helpers ---

  async function openTimeModal() {
    // Pre-fill with current project
    setTimeFormData(prev => ({
      ...prev,
      project_id: projectId as string,
      customer_id: project?.customer_id || '',
      work_date: new Date().toISOString().slice(0, 10),
    }))
    setTimeFormPersonId(currentUser?.id || '')
    setShowTimeModal(true)

    // Fetch supporting data for modal
    const [custRes, bookRes, projRes, wtRes, teamRes] = await Promise.all([
      supabase.from('customer').select('customer_id, name').eq('business_id', business.business_id).order('name'),
      supabase.from('booking').select('booking_id, notes, customer_id, customer (name)').eq('business_id', business.business_id).in('status', ['confirmed', 'pending']).order('scheduled_start', { ascending: false }).limit(50),
      supabase.from('project').select('project_id, name, customer_id').eq('business_id', business.business_id).in('status', ['planning', 'active']).order('name'),
      supabase.from('work_type').select('*').eq('business_id', business.business_id).order('sort_order'),
      fetch('/api/team').then(r => r.ok ? r.json() : { members: [] }),
    ])
    setTimeModalCustomers(custRes.data || [])
    setTimeModalBookings(bookRes.data as any || [])
    setTimeModalProjects(projRes.data || [])
    setTimeModalWorkTypes(wtRes.data || [])
    setTimeModalTeamMembers(
      (teamRes.members || [])
        .filter((m: any) => m.is_active && m.accepted_at)
        .map((m: any) => ({ id: m.id, name: m.name, color: m.color }))
    )
  }

  async function handleTimeSave() {
    setTimeSaving(true)
    try {
      const grossMins = (timeFormData.duration_hours * 60) + timeFormData.duration_minutes
      const breakMins = timeFormData.break_minutes || 0
      const totalMins = Math.max(0, grossMins - breakMins)
      if (totalMins <= 0) { showToast('Ange en tid längre än 0 (efter rast)', 'error'); setTimeSaving(false); return }

      const assignToUser = isOwnerOrAdmin && timeFormPersonId ? timeFormPersonId : currentUser?.id || null

      const entryData: Record<string, unknown> = {
        business_id: business.business_id,
        customer_id: timeFormData.customer_id || null,
        booking_id: timeFormData.booking_id || null,
        work_type_id: timeFormData.work_type_id || null,
        project_id: timeFormData.project_id || null,
        work_category: timeFormData.work_category || 'work',
        business_user_id: assignToUser,
        description: timeFormData.description || null,
        work_date: timeFormData.work_date,
        start_time: timeFormData.start_time || null,
        end_time: timeFormData.end_time || null,
        duration_minutes: totalMins,
        break_minutes: breakMins,
        hourly_rate: timeFormData.hourly_rate ? parseFloat(timeFormData.hourly_rate) : null,
        is_billable: timeFormData.is_billable
      }

      const { error } = await supabase.from('time_entry').insert(entryData)
      if (error) throw error
      showToast('Tid registrerad!', 'success')
      setShowTimeModal(false)
      fetchProjectData()
    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    } finally {
      setTimeSaving(false)
    }
  }

  function handleTimeBookingChange(bookingId: string) {
    const booking = timeModalBookings.find(b => b.booking_id === bookingId)
    setTimeFormData(prev => ({
      ...prev,
      booking_id: bookingId,
      customer_id: booking?.customer_id || prev.customer_id
    }))
  }

  function handleTimeWorkTypeChange(wtId: string) {
    const wt = timeModalWorkTypes.find(w => w.work_type_id === wtId)
    setTimeFormData(prev => ({
      ...prev,
      work_type_id: wtId,
      is_billable: wt ? wt.billable_default : prev.is_billable
    }))
  }

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
      fetchSupplierInvoices()
    }
    if (activeTab === 'material' && projectPriceList.length === 0) {
      supabase
        .from('price_list')
        .select('id, name, unit, unit_price, default_quantity, category')
        .eq('business_id', business.business_id)
        .eq('is_active', true)
        .then(({ data }: { data: any }) => { if (data) setProjectPriceList(data) })
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
    if (activeTab === 'schedule') {
      fetchProjectSchedule()
    }
    if (activeTab === 'documents') {
      fetchDocuments()
      fetchGeneratedDocs()
    }
    if (activeTab === 'log') {
      fetchLogs()
    }
    if (activeTab === 'checklists') {
      fetchChecklists()
      fetchChecklistTemplates()
      fetchFormSubmissions()
      fetchFormTemplates()
    }
    if (activeTab === 'arbetsorder') {
      fetchWorkOrders()
    }
    if (activeTab === 'leverantorer') {
      fetchSupplierInvoices()
    }
    if (activeTab === 'ai_log') {
      fetchAiLogs()
    }
  }, [activeTab, fetchProjectTeam])

  // Re-fetch documents when category filter changes
  useEffect(() => {
    if (activeTab === 'documents') {
      fetchDocuments()
    }
  }, [docCategory])

  async function fetchAiLogs() {
    setAiLogLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-log`)
      if (res.ok) {
        const data = await res.json()
        setAiLogs(data.logs || [])
      }
    } catch { /* ignore */ }
    setAiLogLoading(false)
  }

  async function triggerHealthAnalysis() {
    setAnalyzingHealth(true)
    try {
      const res = await fetch('/api/projects/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      })
      if (res.ok) {
        showToast('Hälsoanalys körd', 'success')
        // Re-fetch project data to get updated health score
        fetchProjectData()
        if (activeTab === 'ai_log') fetchAiLogs()
      }
    } catch {
      showToast('Kunde inte köra analys', 'error')
    }
    setAnalyzingHealth(false)
  }

  const fetchProjectSchedule = useCallback(async () => {
    try {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]
      const end = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString().split('T')[0]
      const res = await fetch(`/api/schedule?start_date=${start}&end_date=${end}&project_id=${projectId}`)
      if (res.ok) {
        const data = await res.json()
        setProjectSchedule(data.entries || [])
      }
    } catch { /* ignore */ }
  }, [projectId])

  // --- DEL 3-5: Fetch functions ---
  const fetchDocuments = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/documents${docCategory !== 'all' ? `?category=${docCategory}` : ''}`)
      if (res.ok) {
        const data = await res.json()
        setDocuments(data.documents || [])
      }
    } catch { /* ignore */ }
  }

  const fetchGeneratedDocs = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/documents?project_id=${projectId}`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
      })
      if (res.ok) {
        const data = await res.json()
        setGeneratedDocs(data.documents || [])
      }
    } catch { /* ignore */ }
  }

  const fetchLogs = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/logs`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || [])
      }
    } catch { /* ignore */ }
  }

  const fetchWorkOrders = async () => {
    try {
      const res = await fetch(`/api/work-orders?project_id=${projectId}`)
      if (res.ok) {
        const data = await res.json()
        setWorkOrders(data.work_orders || [])
      }
    } catch { /* ignore */ }
  }

  const fetchSupplierInvoices = async () => {
    try {
      const res = await fetch(`/api/supplier-invoices?project_id=${projectId}`)
      if (res.ok) {
        const data = await res.json()
        setSupplierInvoices(data.invoices || [])
      }
    } catch { /* ignore */ }
  }

  const fetchChecklists = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/checklists`)
      if (res.ok) {
        const data = await res.json()
        setChecklists(data.checklists || [])
      }
    } catch { /* ignore */ }
  }

  const fetchChecklistTemplates = async () => {
    try {
      const res = await fetch('/api/checklists/templates')
      if (res.ok) {
        const data = await res.json()
        setChecklistTemplates(data.templates || [])
      }
    } catch { /* ignore */ }
  }

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', docCategory === 'all' ? 'other' : docCategory)
      const res = await fetch(`/api/projects/${projectId}/documents`, { method: 'POST', body: formData })
      if (!res.ok) throw new Error()
      showToast('Dokument uppladdat!', 'success')
      fetchDocuments()
    } catch {
      showToast('Kunde inte ladda upp fil', 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleDocDelete = async (docId: string) => {
    if (!confirm('Ta bort detta dokument?')) return
    try {
      const res = await fetch(`/api/projects/${projectId}/documents/${docId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      showToast('Dokument borttaget', 'success')
      fetchDocuments()
    } catch {
      showToast('Kunde inte ta bort', 'error')
    }
  }

  const handleDocDownload = async (docId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/documents/${docId}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      window.open(data.url, '_blank')
    } catch {
      showToast('Kunde inte hämta fil', 'error')
    }
  }

  const handleSaveLog = async (logData: any) => {
    try {
      const method = editingLog ? 'PATCH' : 'POST'
      const url = editingLog
        ? `/api/projects/${projectId}/logs/${editingLog.id}`
        : `/api/projects/${projectId}/logs`
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logData),
      })
      if (!res.ok) throw new Error()
      showToast(editingLog ? 'Anteckning uppdaterad!' : 'Anteckning skapad!', 'success')
      setShowLogModal(false)
      setEditingLog(null)
      fetchLogs()
    } catch {
      showToast('Något gick fel', 'error')
    }
  }

  const handleDeleteLog = async (logId: string) => {
    if (!confirm('Ta bort denna dagboksanteckning?')) return
    try {
      const res = await fetch(`/api/projects/${projectId}/logs/${logId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      showToast('Anteckning borttagen', 'success')
      fetchLogs()
    } catch {
      showToast('Kunde inte ta bort', 'error')
    }
  }

  const handleCreateChecklist = async (templateId: string, name: string, items: any[]) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/checklists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, template_id: templateId, items }),
      })
      if (!res.ok) throw new Error()
      showToast('Checklista skapad!', 'success')
      setShowChecklistCreate(false)
      fetchChecklists()
    } catch {
      showToast('Kunde inte skapa checklista', 'error')
    }
  }

  const handleToggleChecklistItem = async (checklistId: string, itemIndex: number) => {
    const cl = checklists.find((c: any) => c.id === checklistId)
    if (!cl) return
    const updatedItems = [...cl.items]
    updatedItems[itemIndex] = { ...updatedItems[itemIndex], checked: !updatedItems[itemIndex].checked }
    try {
      const res = await fetch(`/api/projects/${projectId}/checklists/${checklistId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: updatedItems }),
      })
      if (!res.ok) throw new Error()
      fetchChecklists()
    } catch {
      showToast('Kunde inte uppdatera', 'error')
    }
  }

  const handleDeleteChecklist = async (checklistId: string) => {
    if (!confirm('Ta bort denna checklista?')) return
    try {
      const res = await fetch(`/api/projects/${projectId}/checklists/${checklistId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      showToast('Checklista borttagen', 'success')
      setActiveChecklist(null)
      fetchChecklists()
    } catch {
      showToast('Kunde inte ta bort', 'error')
    }
  }

  // --- Form Submissions ---

  const fetchFormSubmissions = async () => {
    try {
      const res = await fetch(`/api/form-submissions?projectId=${projectId}`)
      if (res.ok) {
        const data = await res.json()
        setFormSubmissions(data.submissions || [])
      }
    } catch { /* ignore */ }
  }

  const fetchFormTemplates = async () => {
    try {
      const res = await fetch('/api/form-templates')
      if (res.ok) {
        const data = await res.json()
        setFormTemplates(data.templates || [])
      }
    } catch { /* ignore */ }
  }

  const handleCreateFormSubmission = async (templateId: string, name?: string) => {
    try {
      const res = await fetch('/api/form-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId, project_id: projectId, name }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      showToast('Formulär skapat!', 'success')
      setShowFormCreate(false)
      fetchFormSubmissions()
      // Open the form immediately
      setActiveForm(data.submission)
      setFormAnswers(data.submission.answers || {})
    } catch {
      showToast('Kunde inte skapa formulär', 'error')
    }
  }

  const handleSaveFormAnswers = async (opts?: { status?: string; signatureName?: string; signatureData?: string }) => {
    if (!activeForm) return
    setFormSaving(true)
    try {
      const payload: any = { id: activeForm.id, answers: formAnswers }
      if (opts?.status) payload.status = opts.status
      if (opts?.signatureName) payload.signed_by_name = opts.signatureName
      if (opts?.signatureData) payload.signature_data = opts.signatureData

      const res = await fetch('/api/form-submissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setActiveForm(data.submission)
      showToast(opts?.status === 'signed' ? 'Formulär signerat!' : 'Sparat!', 'success')
      fetchFormSubmissions()
    } catch {
      showToast('Kunde inte spara', 'error')
    } finally {
      setFormSaving(false)
    }
  }

  const handleDeleteFormSubmission = async (id: string) => {
    if (!confirm('Ta bort detta formulär?')) return
    try {
      const res = await fetch(`/api/form-submissions?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      showToast('Formulär borttaget', 'success')
      if (activeForm?.id === id) setActiveForm(null)
      fetchFormSubmissions()
    } catch {
      showToast('Kunde inte ta bort', 'error')
    }
  }

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

  // Drag-to-reorder milestones
  const milestoneDndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  )

  const handleMilestoneDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = milestones.findIndex(m => m.milestone_id === active.id)
    const newIndex = milestones.findIndex(m => m.milestone_id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    // Optimistic update
    const reordered = [...milestones]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)
    const withOrder = reordered.map((ms, i) => ({ ...ms, sort_order: i }))
    setMilestones(withOrder)

    // Persist
    try {
      await fetch(`/api/projects/${projectId}/milestones`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: withOrder.map(ms => ({ milestone_id: ms.milestone_id, sort_order: ms.sort_order })) })
      })
    } catch {
      showToast('Kunde inte spara ordning', 'error')
      await fetchProjectData()
    }
  }, [milestones, projectId, showToast, fetchProjectData])

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
      const res = await fetch(`/api/ata/${changeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error')
      }
      showToast(status === 'approved' ? 'ÄTA godkänd' : 'ÄTA avslagen', 'success')
      setProfitability(null)
      await fetchProjectData()
    } catch (err: any) {
      showToast(err.message || 'Kunde inte uppdatera ÄTA', 'error')
    }
  }

  const deleteChange = async (changeId: string) => {
    if (!confirm('Vill du ta bort denna ÄTA?')) return
    try {
      const res = await fetch(`/api/ata/${changeId}`, {
        method: 'DELETE'
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error')
      }
      showToast('ÄTA borttagen', 'success')
      setProfitability(null)
      await fetchProjectData()
    } catch (err: any) {
      showToast(err.message || 'Kunde inte ta bort', 'error')
    }
  }

  const sendAta = async (changeId: string) => {
    setSendingAtaId(changeId)
    try {
      const res = await fetch(`/api/ata/${changeId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'sms' })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error')
      }
      showToast('ÄTA skickad till kund', 'success')
      await fetchProjectData()
    } catch (err: any) {
      showToast(err.message || 'Kunde inte skicka ÄTA', 'error')
    }
    setSendingAtaId(null)
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
      <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-secondary-700 animate-spin" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Projektet hittades inte</div>
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

  const tabGroups: { group: string; items: { key: TabKey; label: string }[] }[] = [
    { group: 'ÖVERSIKT', items: [
      { key: 'overview', label: 'Översikt' },
      { key: 'economy', label: 'Ekonomi' },
      { key: 'ai_log', label: 'Projektanalys' },
    ]},
    { group: 'PLANERING', items: [
      { key: 'schedule', label: 'Schema' },
      { key: 'milestones', label: 'Delmoment' },
      { key: 'changes', label: 'ÄTA' },
    ]},
    { group: 'FÄLT', items: [
      { key: 'arbetsorder', label: 'Arbetsorder' },
      { key: 'time', label: 'Tidrapporter' },
      { key: 'field_reports', label: 'Fältrapporter' },
      { key: 'checklists', label: 'Checklistor' },
      { key: 'canvas', label: 'Rityta' },
    ]},
    { group: 'RESURSER', items: [
      { key: 'team', label: 'Team' },
      { key: 'material', label: 'Material' },
      { key: 'leverantorer', label: 'Leverantörer' },
    ]},
    { group: 'DOKUMENTATION', items: [
      { key: 'documents', label: 'Dokument' },
      { key: 'log', label: 'Byggdagbok' },
    ]},
  ]
  const allTabs = tabGroups.flatMap(g => g.items)

  // --- Render ---

  return (
    <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen">
      {/* Background blurs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-primary-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-primary-50 rounded-full blur-[128px]"></div>
      </div>

      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl border ${
          toast.type === 'success'
            ? 'bg-emerald-100 border-emerald-500/30 text-emerald-600'
            : 'bg-red-100 border-red-500/30 text-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/projects" className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{project.name}</h1>
              {project.customer && (
                <p className="text-sm text-gray-500">{project.customer.name}</p>
              )}
            </div>
          </div>

          {/* Status badge + dropdown */}
          <div className="flex items-center gap-3 relative">
            <button
              onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
              disabled={savingStatus}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-full border transition-all ${STATUS_STYLES[project.status] || 'bg-gray-100 text-gray-500 border-gray-300'}`}
            >
              {savingStatus ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : null}
              {STATUS_MAP[project.status] || project.status}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {statusDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 bg-white border border-[#E2E8F0] rounded-xl shadow-xl z-20 w-44 overflow-hidden">
                {Object.entries(STATUS_MAP).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => updateProjectStatus(key)}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 transition-all ${
                      key === project.status ? 'text-secondary-700 bg-gray-50' : 'text-gray-700'
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

        {/* Mobile: horizontal scroll tabs */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 md:hidden">
          {allTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                activeTab === tab.key
                  ? 'bg-primary-700 text-white'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Desktop: sidebar + content grid */}
        <div className="flex gap-6">
          {/* Vertical sidebar nav — desktop only */}
          <nav className="hidden md:block w-[200px] flex-shrink-0">
            <div className="sticky top-4 space-y-4">
              {tabGroups.map(group => (
                <div key={group.group}>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 px-3">{group.group}</p>
                  <div className="space-y-0.5">
                    {group.items.map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                          activeTab === tab.key
                            ? 'text-primary-700 bg-primary-50 font-medium border-l-2 border-primary-700'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 border-l-2 border-transparent'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </nav>

          {/* Content area */}
          <div className="flex-1 min-w-0">

        {/* === TAB: Oversikt === */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Snabbnavigering */}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setActiveTab('material')} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-700 hover:bg-primary-50 hover:border-primary-200 hover:text-primary-700 transition-colors">
                📦 Material
              </button>
              <button onClick={() => setActiveTab('economy')} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-700 hover:bg-primary-50 hover:border-primary-200 hover:text-primary-700 transition-colors">
                💰 Ekonomi
              </button>
              <button onClick={() => setActiveTab('documents')} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-700 hover:bg-primary-50 hover:border-primary-200 hover:text-primary-700 transition-colors">
                📄 Dokument
              </button>
              <button onClick={() => setActiveTab('time')} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-700 hover:bg-primary-50 hover:border-primary-200 hover:text-primary-700 transition-colors">
                🕐 Tidrapporter
              </button>
            </div>

            {/* Project info card */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-secondary-700" />
                Projektinfo
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-400">Typ</p>
                  <p className="text-gray-900">{PROJECT_TYPE_LABELS[project.project_type] || project.project_type}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Startdatum</p>
                  <p className="text-gray-900">{project.start_date ? formatDate(project.start_date) : '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Slutdatum</p>
                  <p className="text-gray-900">{project.end_date ? formatDate(project.end_date) : '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Kund</p>
                  {project.customer ? (
                    <Link href={`/dashboard/customers/${project.customer.customer_id}`} className="text-secondary-700 hover:text-primary-700">
                      {project.customer.name}
                    </Link>
                  ) : (
                    <p className="text-gray-500">-</p>
                  )}
                </div>
                {quote && (
                  <div>
                    <p className="text-sm text-gray-400">Kopplad offert</p>
                    <Link href={`/dashboard/quotes/${quote.quote_id}`} className="text-secondary-700 hover:text-primary-700 flex items-center gap-1">
                      {quote.title || 'Offert'} <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                )}
                {project.description && (
                  <div className="sm:col-span-2 lg:col-span-4">
                    <p className="text-sm text-gray-400">Beskrivning</p>
                    <p className="text-gray-700">{project.description}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Lönsamhets-widget (V25) */}
            {profitability && profitability.budget.amount > 0 && (() => {
              const costPct = profitability.budget.amount_usage_percent
              const budgetTotal = profitability.budget.amount_with_ata
              const costTotal = profitability.costs.total
              const hoursPct = profitability.budget.hours_usage_percent
              const barColor = costPct > 95 ? 'bg-red-500' : costPct > 75 ? 'bg-amber-500' : 'bg-primary-600'
              const statusLabel = costPct > 95 ? '🔴 Över budget' : costPct > 75 ? '⚠️ Håll koll' : '✅ Inom budget'
              const projectedCost = hoursPct > 10 ? Math.round(costTotal / (hoursPct / 100)) : costTotal
              return (
                <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
                  <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-secondary-700" />
                    Lönsamhet
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-gray-400">Budget</p>
                      <p className="text-lg font-bold text-gray-900">{formatCurrency(budgetTotal)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Kostnad</p>
                      <p className="text-lg font-bold text-gray-900">{formatCurrency(costTotal)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Tid</p>
                      <p className="text-sm text-gray-700">{profitability.costs.actual_hours}h / {profitability.budget.hours_with_ata}h</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Material</p>
                      <p className="text-sm text-gray-700">{formatCurrency(profitability.costs.material_purchase)}</p>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3 mb-2">
                    <div className={`h-3 rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(costPct, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">{costPct}% använt</span>
                    <span className={costPct > 95 ? 'text-red-600 font-medium' : costPct > 75 ? 'text-amber-600 font-medium' : 'text-primary-700 font-medium'}>
                      {statusLabel}
                    </span>
                  </div>
                  {hoursPct > 10 && (
                    <p className="text-xs text-gray-400 mt-2">
                      Prognos: {formatCurrency(projectedCost)} {projectedCost <= budgetTotal ? '(inom budget)' : `(${formatCurrency(projectedCost - budgetTotal)} över)`}
                    </p>
                  )}
                </div>
              )
            })()}

            {/* Progress bar */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Target className="w-5 h-5 text-primary-700" />
                  Framsteg
                </h2>
                <span className="text-2xl font-bold text-gray-900">{project.progress_percent}%</span>
              </div>
              <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-700 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(project.progress_percent, 100)}%` }}
                />
              </div>
            </div>

            {/* AI Health Card */}
            {project.ai_health_score != null && project.status !== 'completed' && project.status !== 'cancelled' && (
              <div className={`shadow-sm rounded-xl border p-4 sm:p-6 ${
                project.ai_health_score >= 80
                  ? 'bg-emerald-50 border-emerald-200'
                  : project.ai_health_score >= 50
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Activity className={`w-5 h-5 ${
                      project.ai_health_score >= 80 ? 'text-emerald-600' : project.ai_health_score >= 50 ? 'text-amber-600' : 'text-red-600'
                    }`} />
                    Projekthälsa
                  </h2>
                  <div className="flex items-center gap-3">
                    <span className={`text-2xl font-bold ${
                      project.ai_health_score >= 80 ? 'text-emerald-600' : project.ai_health_score >= 50 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {project.ai_health_score}/100
                    </span>
                    <button
                      onClick={triggerHealthAnalysis}
                      disabled={analyzingHealth}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-white/50 transition-all"
                      title="Kör hälsoanalys"
                    >
                      <RefreshCw className={`w-4 h-4 ${analyzingHealth ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>
                {project.ai_health_summary && (
                  <p className="text-sm text-gray-600">{project.ai_health_summary}</p>
                )}
                {project.ai_last_analyzed_at && (
                  <p className="text-xs text-gray-400 mt-2">
                    Senast analyserat: {new Date(project.ai_last_analyzed_at).toLocaleString('sv-SE')}
                  </p>
                )}
              </div>
            )}

            {/* Budget vs Actual */}
            {(project.budget_hours || project.budget_amount) && summary && (
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
                <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary-500" />
                  Budget vs Utfall
                </h2>
                <div className="space-y-4">
                  {project.budget_hours != null && project.budget_hours > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-500">Timmar</span>
                        <span className="text-sm text-gray-900">{formatHours(summary.total_hours)} / {formatHours(project.budget_hours)}</span>
                      </div>
                      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${budgetBarColor(budgetHoursPercent)}`}
                          style={{ width: `${Math.min(budgetHoursPercent, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{budgetHoursPercent}% anvant</p>
                    </div>
                  )}
                  {project.budget_amount != null && project.budget_amount > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-500">Belopp</span>
                        <span className="text-sm text-gray-900">{formatCurrency(summary.total_revenue)} / {formatCurrency(project.budget_amount)}</span>
                      </div>
                      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${budgetBarColor(budgetAmountPercent)}`}
                          style={{ width: `${Math.min(budgetAmountPercent, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{budgetAmountPercent}% anvant</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Personal (team allocation) */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-secondary-700" />
                  Personal ({projectTeam.length})
                </h2>
                <button
                  onClick={() => setActiveTab('team')}
                  className="text-sm text-secondary-700 hover:text-primary-700 flex items-center gap-1"
                >
                  Hantera <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              {projectTeam.length === 0 ? (
                <div className="text-center py-6">
                  <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400 mb-3">Ingen tilldelad ännu</p>
                  <button
                    onClick={() => { setActiveTab('team'); setTimeout(() => setShowAddMember(true), 100) }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-700 rounded-lg text-white text-sm font-medium hover:opacity-90"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Tilldela personal
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {projectTeam.map(assignment => (
                    <div key={assignment.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-[#E2E8F0]">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: assignment.business_user.color }}
                      >
                        <span className="text-gray-900 text-xs font-bold">
                          {assignment.business_user.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900 font-medium truncate">{assignment.business_user.name}</p>
                        <p className="text-xs text-gray-400">{assignment.role === 'lead' ? 'Ansvarig' : 'Medlem'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                onClick={() => openTimeModal()}
                className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-[#E2E8F0] hover:border-primary-300 transition-all text-center"
              >
                <Timer className="w-5 h-5 text-secondary-700" />
                <span className="text-sm text-gray-700">Lägg till tid</span>
              </button>
              <button
                onClick={() => { setActiveTab('milestones'); setMilestoneModal({ open: true, editing: null }) }}
                className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-[#E2E8F0] hover:border-primary-300 transition-all text-center"
              >
                <Layers className="w-5 h-5 text-primary-500" />
                <span className="text-sm text-gray-700">Nytt delmoment</span>
              </button>
              <button
                onClick={() => { setActiveTab('changes'); setChangeModal({ open: true, editing: null }) }}
                className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-[#E2E8F0] hover:border-primary-300 transition-all text-center"
              >
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <span className="text-sm text-gray-700">Ny ATA</span>
              </button>
              <button
                onClick={() => setActiveTab('economy')}
                className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-[#E2E8F0] hover:border-primary-300 transition-all text-center"
              >
                <Receipt className="w-5 h-5 text-emerald-600" />
                <span className="text-sm text-gray-700">Fakturera</span>
              </button>
            </div>
          </div>
        )}

        {/* === TAB: Schema === */}
        {activeTab === 'schedule' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-secondary-700" />
                Planerade arbetstillfällen ({projectSchedule.length})
              </h2>
              <Link
                href={`/dashboard/schedule?project=${projectId}`}
                className="flex items-center gap-2 px-4 py-2 bg-primary-700 rounded-xl text-white text-sm font-medium hover:opacity-90"
              >
                <Plus className="w-4 h-4" />
                Planera arbete
              </Link>
            </div>

            {projectSchedule.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
                <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-2">Inga schemalagda tillfällen ännu</p>
                <p className="text-gray-400 text-sm">Planera arbete via resursplaneringen</p>
              </div>
            ) : (
              <div className="space-y-2">
                {projectSchedule.map(entry => {
                  const startDate = new Date(entry.start_datetime)
                  const endDate = new Date(entry.end_datetime)
                  const isPast = endDate < new Date()
                  const dateStr = startDate.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })
                  const timeStr = entry.all_day
                    ? 'Heldag'
                    : `${startDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`

                  return (
                    <div
                      key={entry.id}
                      className={`bg-white rounded-xl border border-[#E2E8F0] p-4 flex items-center gap-4 ${isPast ? 'opacity-60' : ''}`}
                    >
                      <div className="w-1 h-12 rounded-full shrink-0" style={{ backgroundColor: entry.color || entry.business_user?.color || '#8B5CF6' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-900 font-medium truncate">{entry.title}</p>
                        <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
                          <span>{dateStr}</span>
                          <span>{timeStr}</span>
                        </div>
                      </div>
                      {entry.business_user && (
                        <div className="flex items-center gap-2 shrink-0">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-900 text-xs font-bold"
                            style={{ backgroundColor: entry.business_user.color }}
                          >
                            {entry.business_user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                          </div>
                          <span className="text-sm text-gray-500 hidden sm:block">{entry.business_user.name}</span>
                        </div>
                      )}
                      <span className={`text-xs px-2 py-1 rounded-full border shrink-0 ${
                        entry.status === 'completed' ? 'bg-emerald-100 text-emerald-600 border-emerald-500/30'
                          : entry.status === 'cancelled' ? 'bg-red-100 text-red-600 border-red-500/30'
                          : 'bg-primary-700/20 text-primary-600 border-primary-600/30'
                      }`}>
                        {entry.status === 'completed' ? 'Klart' : entry.status === 'cancelled' ? 'Avbokat' : 'Planerat'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* === TAB: Delmoment === */}
        {activeTab === 'milestones' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Delmoment</h2>
              <button
                onClick={() => setMilestoneModal({ open: true, editing: null })}
                className="flex items-center gap-2 px-4 py-2 bg-primary-700 rounded-xl text-white text-sm font-medium hover:opacity-90"
              >
                <Plus className="w-4 h-4" />
                Lagg till delmoment
              </button>
            </div>

            {milestones.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
                <Layers className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400">Inga delmoment annu</p>
                <p className="text-xs text-gray-400 mt-1">Lagg till delmoment for att spara framsteg</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#E2E8F0] divide-y divide-gray-200">
                <DndContext sensors={milestoneDndSensors} collisionDetection={closestCenter} onDragEnd={handleMilestoneDragEnd}>
                  <SortableContext items={milestones.map(m => m.milestone_id)} strategy={verticalListSortingStrategy}>
                    {milestones.map(ms => (
                      <SortableMilestoneRow
                        key={ms.milestone_id}
                        milestone={ms}
                        onCycleStatus={cycleMilestoneStatus}
                        onEdit={(m) => setMilestoneModal({ open: true, editing: m })}
                        onDelete={deleteMilestone}
                        formatDate={formatDate}
                        formatHours={formatHours}
                        formatCurrency={formatCurrency}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </div>
        )}

        {/* === TAB: ÄTA === */}
        {activeTab === 'changes' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">ÄTA (Ändring/Tillägg/Avgående)</h2>
              <button
                onClick={() => setChangeModal({ open: true, editing: null })}
                className="flex items-center gap-2 px-4 py-2 bg-primary-700 rounded-xl text-white text-sm font-medium hover:opacity-90"
              >
                <Plus className="w-4 h-4" />
                Ny ÄTA
              </button>
            </div>

            {/* ÄTA summary */}
            {summary && (summary.ata_additions > 0 || summary.ata_removals > 0) && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                  <p className="text-xs text-emerald-600 mb-1">Tillägg</p>
                  <p className="text-lg font-bold text-emerald-600">+{formatCurrency(summary.ata_additions)}</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
                  <p className="text-xs text-red-600 mb-1">Avgående</p>
                  <p className="text-lg font-bold text-red-600">-{formatCurrency(summary.ata_removals)}</p>
                </div>
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">Netto</p>
                  <p className={`text-lg font-bold ${summary.ata_net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {summary.ata_net >= 0 ? '+' : ''}{formatCurrency(summary.ata_net)}
                  </p>
                </div>
              </div>
            )}

            {changes.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
                <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400">Inga ÄTA ännu</p>
                <p className="text-xs text-gray-400 mt-1">Registrera tillägg, ändringar eller avgående arbeten</p>
              </div>
            ) : (
              <div className="space-y-3">
                {changes.map(change => {
                  const isExpanded = expandedAtaId === change.change_id
                  const statusConfig: Record<string, { label: string; bg: string; text: string; border: string }> = {
                    draft: { label: 'Utkast', bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-300' },
                    pending: { label: 'Väntande', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
                    sent: { label: 'Skickad', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
                    signed: { label: 'Signerad', bg: 'bg-primary-50', text: 'text-primary-700', border: 'border-primary-200' },
                    approved: { label: 'Godkänd', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
                    rejected: { label: 'Avslagen', bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' },
                    declined: { label: 'Avböjd', bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' },
                    invoiced: { label: 'Fakturerad', bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200' },
                  }
                  const sc = statusConfig[change.status] || statusConfig.draft

                  return (
                    <div key={change.change_id} className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
                      {/* Header row */}
                      <button
                        onClick={() => setExpandedAtaId(isExpanded ? null : change.change_id)}
                        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-all"
                      >
                        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-semibold text-gray-900">
                              ÄTA-{change.ata_number || '?'}
                            </span>
                            <span className={`px-2 py-0.5 text-xs rounded-full border ${
                              change.change_type === 'addition'
                                ? 'bg-emerald-100 text-emerald-600 border-emerald-500/30'
                                : change.change_type === 'change'
                                ? 'bg-amber-50 text-amber-600 border-amber-200'
                                : 'bg-red-100 text-red-600 border-red-500/30'
                            }`}>
                              {change.change_type === 'addition' ? 'Tillägg' : change.change_type === 'change' ? 'Ändring' : 'Avgående'}
                            </span>
                            <span className={`px-2 py-0.5 text-xs rounded-full border ${sc.bg} ${sc.text} ${sc.border}`}>
                              {sc.label}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 truncate">{change.description}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold text-gray-900">
                            {change.total ? formatCurrency(change.total) : change.amount > 0 ? formatCurrency(change.amount) : '–'}
                          </p>
                          <p className="text-xs text-gray-400">{formatDate(change.created_at)}</p>
                        </div>
                      </button>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 px-4 pb-4">
                          {/* Items table */}
                          {change.items && change.items.length > 0 && (
                            <div className="mt-3">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                                    <th className="text-left py-2 font-medium">Rad</th>
                                    <th className="text-right py-2 font-medium w-16">Antal</th>
                                    <th className="text-left py-2 font-medium w-16 pl-2">Enhet</th>
                                    <th className="text-right py-2 font-medium w-24">à-pris</th>
                                    <th className="text-right py-2 font-medium w-24">Summa</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {change.items.map((item, idx) => (
                                    <tr key={idx} className="border-b border-gray-50">
                                      <td className="py-2 text-gray-700">{item.name}</td>
                                      <td className="py-2 text-right text-gray-600">{item.quantity}</td>
                                      <td className="py-2 text-left pl-2 text-gray-500">{item.unit}</td>
                                      <td className="py-2 text-right text-gray-600">{formatCurrency(item.unit_price)}</td>
                                      <td className="py-2 text-right font-medium text-gray-900">{formatCurrency(item.quantity * item.unit_price)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Notes */}
                          {change.notes && (
                            <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                              <p className="text-xs text-gray-400 mb-1">Anteckning</p>
                              {change.notes}
                            </div>
                          )}

                          {/* Signing info */}
                          {change.signed_at && change.signed_by_name && (
                            <div className="mt-3 flex items-center gap-2 text-xs text-primary-700">
                              <FileSignature className="w-3.5 h-3.5" />
                              Signerad av {change.signed_by_name} {formatDate(change.signed_at)}
                            </div>
                          )}

                          {change.declined_at && (
                            <div className="mt-3 flex items-center gap-2 text-xs text-red-600">
                              <XCircle className="w-3.5 h-3.5" />
                              Avböjd {formatDate(change.declined_at)}
                              {change.declined_reason && <span>— {change.declined_reason}</span>}
                            </div>
                          )}

                          {/* Actions */}
                          <div className="mt-4 flex items-center gap-2 flex-wrap">
                            {/* Send to customer */}
                            {(change.status === 'draft' || change.status === 'pending') && (
                              <button
                                onClick={() => sendAta(change.change_id)}
                                disabled={sendingAtaId === change.change_id}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-sm font-medium hover:bg-blue-100 disabled:opacity-50 transition-all"
                              >
                                {sendingAtaId === change.change_id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Send className="w-3.5 h-3.5" />
                                }
                                Skicka till kund
                              </button>
                            )}

                            {/* Approve */}
                            {(change.status === 'pending' || change.status === 'sent' || change.status === 'signed') && (
                              <button
                                onClick={() => updateChangeStatus(change.change_id, 'approved')}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg text-sm font-medium hover:bg-emerald-100 transition-all"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                Godkänn
                              </button>
                            )}

                            {/* Reject */}
                            {(change.status === 'pending' || change.status === 'sent') && (
                              <button
                                onClick={() => updateChangeStatus(change.change_id, 'rejected')}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 transition-all"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Avslå
                              </button>
                            )}

                            {/* Edit */}
                            {(change.status === 'draft' || change.status === 'pending') && (
                              <button
                                onClick={() => setChangeModal({ open: true, editing: change })}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-600 border border-[#E2E8F0] rounded-lg text-sm font-medium hover:bg-gray-100 transition-all"
                              >
                                <Edit className="w-3.5 h-3.5" />
                                Redigera
                              </button>
                            )}

                            {/* Copy sign link */}
                            {change.sign_token && change.status === 'sent' && (
                              <button
                                onClick={() => {
                                  const url = `${window.location.origin}/sign/ata/${change.sign_token}`
                                  navigator.clipboard.writeText(url)
                                  showToast('Signeringslänk kopierad', 'success')
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-600 border border-[#E2E8F0] rounded-lg text-sm font-medium hover:bg-gray-100 transition-all"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                Kopiera länk
                              </button>
                            )}

                            {/* Delete */}
                            {(change.status === 'draft' || change.status === 'pending') && (
                              <button
                                onClick={() => deleteChange(change.change_id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-red-500 hover:bg-red-50 rounded-lg text-sm transition-all ml-auto"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Ta bort
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* === TAB: Tidrapporter === */}
        {activeTab === 'time' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Tidrapporter</h2>
              <button
                onClick={() => openTimeModal()}
                className="flex items-center gap-2 px-4 py-2 bg-primary-700 rounded-xl text-white text-sm font-medium hover:opacity-90"
              >
                <Plus className="w-4 h-4" />
                Lägg till tid
              </button>
            </div>

            {/* Time summary */}
            {summary && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 text-center">
                  <p className="text-xs text-gray-400 mb-1">Totalt</p>
                  <p className="text-lg font-bold text-gray-900">{formatHours(summary.total_hours)}</p>
                </div>
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 text-center">
                  <p className="text-xs text-gray-400 mb-1">Debiterbart</p>
                  <p className="text-lg font-bold text-gray-900">{formatHours(summary.billable_hours)}</p>
                </div>
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 text-center">
                  <p className="text-xs text-gray-400 mb-1">Ofakturerat</p>
                  <p className="text-lg font-bold text-amber-400">{formatHours(summary.uninvoiced_hours)}</p>
                </div>
              </div>
            )}

            {timeEntries.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
                <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400">Inga tidrapporter annu</p>
                <button onClick={() => openTimeModal()} className="text-sm text-secondary-700 hover:text-primary-700 mt-2 inline-block">
                  Lägg till din första tidrapport
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#E2E8F0] divide-y divide-gray-200">
                {/* Table header */}
                <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-3 text-xs text-gray-400 font-medium">
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
                    <div key={entry.time_entry_id} className="p-4 hover:bg-gray-100/30 transition-all">
                      {/* Mobile layout */}
                      <div className="sm:hidden space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-900">{formatDate(entry.work_date)}</span>
                          <div className="flex items-center gap-2">
                            {entry.work_type?.name && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-primary-100 text-secondary-700 border border-[#E2E8F0]">
                                {entry.work_type.name}
                              </span>
                            )}
                            <span className={`px-2 py-0.5 text-xs rounded-full border ${
                              entry.invoiced
                                ? 'bg-emerald-100 text-emerald-600 border-emerald-500/30'
                                : 'bg-gray-100 text-gray-500 border-gray-300'
                            }`}>
                              {entry.invoiced ? 'Fakturerad' : 'Ofakturerad'}
                            </span>
                          </div>
                        </div>
                        {entry.description && <p className="text-sm text-gray-500">{entry.description}</p>}
                        <div className="flex items-center justify-between text-xs text-gray-400">
                          <span>{formatHours(hours)}</span>
                          <span>{formatCurrency(Math.round(total))}</span>
                        </div>
                      </div>

                      {/* Desktop layout */}
                      <div className="hidden sm:grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-2 text-sm text-gray-900">{formatDate(entry.work_date)}</div>
                        <div className="col-span-3 text-sm text-gray-500 truncate">{entry.description || '-'}</div>
                        <div className="col-span-1 text-sm text-gray-900 text-right">{formatHours(hours)}</div>
                        <div className="col-span-2 text-sm text-gray-500 text-right">{formatCurrency(entry.hourly_rate)}/tim</div>
                        <div className="col-span-2 text-sm text-gray-900 text-right font-medium">{formatCurrency(Math.round(total))}</div>
                        <div className="col-span-2 flex items-center justify-end gap-2">
                          {entry.work_type?.name && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-primary-100 text-secondary-700 border border-[#E2E8F0]">
                              {entry.work_type.name}
                            </span>
                          )}
                          <span className={`px-2 py-0.5 text-xs rounded-full border ${
                            entry.invoiced
                              ? 'bg-emerald-100 text-emerald-600 border-emerald-500/30'
                              : 'bg-gray-100 text-gray-500 border-gray-300'
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
              <div className="bg-white rounded-xl p-4 border border-[#E2E8F0]">
                <p className="text-xs text-gray-400 mb-1">Inköpskostnad</p>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(materialSummary?.total_purchase || 0)}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-[#E2E8F0]">
                <p className="text-xs text-gray-400 mb-1">Kundpris</p>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(materialSummary?.total_sell || 0)}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-[#E2E8F0]">
                <p className="text-xs text-gray-400 mb-1">Marginal</p>
                <p className="text-xl font-bold text-emerald-600">
                  {formatCurrency(materialSummary?.margin_amount || 0)}
                  <span className="text-sm ml-1">({Math.round(materialSummary?.margin_percent || 0)}%)</span>
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-[#E2E8F0]">
                <p className="text-xs text-gray-400 mb-1">Ofakturerat</p>
                <p className="text-xl font-bold text-amber-400">{formatCurrency(materialSummary?.uninvoiced_sell || 0)}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Material ({materials.length})</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowProductSearch(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-700 text-white rounded-xl text-sm hover:opacity-90"
                >
                  <Plus className="w-4 h-4" /> Lägg till material
                </button>
                {(materialSummary?.uninvoiced_count || 0) > 0 && (
                  <button
                    onClick={handleInvoiceMaterials}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-600 border border-emerald-500/30 rounded-xl text-sm hover:bg-emerald-500/30"
                  >
                    <Receipt className="w-4 h-4" /> Fakturera ({formatCurrency(materialSummary?.uninvoiced_sell || 0)})
                  </button>
                )}
              </div>
            </div>

            {/* Snabbval från prislista */}
            {projectPriceList.length > 0 ? (
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                <p className="text-sm text-gray-400 mb-2">Snabbval från prislista:</p>
                <div className="flex flex-wrap gap-2">
                  {projectPriceList.slice(0, 10).map((item) => (
                    <button
                      key={item.id}
                      onClick={async () => {
                        try {
                          await fetch(`/api/projects/${project?.project_id}/materials`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              name: item.name,
                              unit: item.unit,
                              purchase_price: item.unit_price,
                              sell_price: item.unit_price,
                              markup_percent: 0,
                              quantity: item.default_quantity || 1,
                            }),
                          })
                          fetchProjectData()
                          setToast({ show: true, message: `${item.name} tillagt`, type: 'success' })
                        } catch {
                          setToast({ show: true, message: 'Kunde inte lägga till', type: 'error' })
                        }
                      }}
                      className="px-3 py-1.5 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-700 text-sm hover:border-primary-400 hover:text-primary-700 transition-colors"
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                <p className="text-sm text-gray-400">Du har inga sparade artiklar än.</p>
                <a href="/dashboard/settings/my-prices" target="_blank" rel="noopener"
                  className="text-sm text-primary-700 hover:underline mt-1 inline-block">
                  + Bygg din prislista →
                </a>
              </div>
            )}

            {/* Material list */}
            {materials.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
                <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-1">Inga material tillagda</p>
                <p className="text-sm text-gray-400">Sök och lägg till material från grossister</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-gray-200 text-xs text-gray-400 font-medium">
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
                  <div key={mat.material_id} className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-gray-200/50 items-center hover:bg-gray-100/30">
                    <div className="col-span-3">
                      <p className="text-sm font-medium text-gray-900 truncate">{mat.name}</p>
                      {mat.sku && <p className="text-xs text-gray-400">Art: {mat.sku}</p>}
                    </div>
                    <div className="col-span-2 text-sm text-gray-500 truncate">{mat.supplier_name || '-'}</div>
                    {editingMaterial === mat.material_id ? (
                      <>
                        <div className="col-span-1">
                          <input
                            type="number"
                            value={editValues.quantity}
                            onChange={e => setEditValues(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                            className="w-full px-2 py-1 bg-gray-100 border border-gray-300 rounded text-sm text-gray-900 text-right"
                          />
                        </div>
                        <div className="col-span-1 text-sm text-gray-500 text-right">{mat.purchase_price} kr</div>
                        <div className="col-span-1">
                          <input
                            type="number"
                            value={editValues.markup_percent}
                            onChange={e => setEditValues(prev => ({ ...prev, markup_percent: parseFloat(e.target.value) || 0 }))}
                            className="w-full px-2 py-1 bg-gray-100 border border-gray-300 rounded text-sm text-gray-900 text-right"
                          />
                        </div>
                        <div className="col-span-1 text-sm text-gray-500 text-right">
                          {Math.round((mat.purchase_price || 0) * (1 + editValues.markup_percent / 100))} kr
                        </div>
                        <div className="col-span-1 text-sm text-gray-900 text-right font-medium">
                          {formatCurrency(Math.round(editValues.quantity * (mat.purchase_price || 0) * (1 + editValues.markup_percent / 100)))}
                        </div>
                        <div className="col-span-2 flex justify-end gap-1">
                          <button
                            onClick={() => handleUpdateMaterial(mat.material_id)}
                            className="p-1 text-emerald-600 hover:text-emerald-700"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingMaterial(null)}
                            className="p-1 text-gray-400 hover:text-gray-700"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="col-span-1 text-sm text-gray-500 text-right">{mat.quantity} {mat.unit}</div>
                        <div className="col-span-1 text-sm text-gray-500 text-right">{mat.purchase_price} kr</div>
                        <div className="col-span-1 text-sm text-gray-500 text-right">{mat.markup_percent}%</div>
                        <div className="col-span-1 text-sm text-gray-500 text-right">{mat.sell_price} kr</div>
                        <div className="col-span-1 text-sm text-gray-900 text-right font-medium">{formatCurrency(mat.total_sell || 0)}</div>
                        <div className="col-span-2 flex items-center justify-end gap-1">
                          {mat.invoiced ? (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-600 border border-emerald-500/30">
                              Fakturerad
                            </span>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setEditingMaterial(mat.material_id)
                                  setEditValues({ quantity: mat.quantity, markup_percent: mat.markup_percent })
                                }}
                                className="p-1 text-gray-400 hover:text-secondary-700"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteMaterial(mat.material_id)}
                                className="p-1 text-gray-400 hover:text-red-600"
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
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-secondary-700" />
                Tilldelade ({projectTeam.length})
              </h2>
              {can('see_all_projects') && (
                <div className="relative">
                  <button
                    onClick={() => setShowAddMember(!showAddMember)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-700 rounded-xl text-white text-sm font-medium hover:opacity-90"
                  >
                    <UserPlus className="w-4 h-4" />
                    Lagg till
                  </button>
                  {showAddMember && (
                    <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-[#E2E8F0] rounded-xl shadow-xl z-30 overflow-hidden">
                      {allTeamMembers
                        .filter(m => !projectTeam.some(a => a.business_user_id === m.id))
                        .map(member => (
                          <button
                            key={member.id}
                            onClick={() => handleAssignMember(member.id)}
                            disabled={assignLoading}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-100 transition-all disabled:opacity-50"
                          >
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: member.color }}
                            >
                              <span className="text-gray-900 text-xs font-bold">
                                {member.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm text-gray-900 truncate">{member.name}</p>
                              <p className="text-xs text-gray-400 truncate">{member.title || member.role}</p>
                            </div>
                          </button>
                        ))}
                      {allTeamMembers.filter(m => !projectTeam.some(a => a.business_user_id === m.id)).length === 0 && (
                        <p className="px-4 py-3 text-sm text-gray-400">Alla teammedlemmar ar redan tillagda</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {projectTeam.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Ingen tilldelad annu</p>
                <p className="text-gray-400 text-sm mt-1">Lagg till teammedlemmar for att tilldela dem detta projekt</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#E2E8F0] divide-y divide-gray-200">
                {projectTeam.map(assignment => (
                  <div key={assignment.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: assignment.business_user.color }}
                      >
                        <span className="text-gray-900 text-sm font-bold">
                          {assignment.business_user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-gray-900 font-medium">{assignment.business_user.name}</p>
                        <p className="text-xs text-gray-400">{assignment.business_user.title || assignment.business_user.role}</p>
                      </div>
                      <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-500 border border-gray-300">
                        {assignment.role === 'lead' ? 'Ansvarig' : 'Medlem'}
                      </span>
                    </div>
                    {can('see_all_projects') && (
                      <button
                        onClick={() => handleRemoveMember(assignment.business_user_id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-500/10 rounded-lg transition-all"
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

        {/* === TAB: Dokument === */}
        {activeTab === 'documents' && (
          <div className="space-y-6">
            {/* Generated documents from template engine */}
            {generatedDocs.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700">Malldokument</h3>
                  <a href="/dashboard/documents" className="text-xs text-secondary-700 hover:text-primary-700">Alla dokument &rarr;</a>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {generatedDocs.map((gd: any) => (
                    <a
                      key={gd.id}
                      href="/dashboard/documents"
                      className="bg-white rounded-xl border border-[#E2E8F0] p-4 hover:border-primary-300 transition block"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center">
                          <FileText className="w-4 h-4 text-secondary-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{gd.title}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          gd.status === 'signed' ? 'bg-emerald-100 text-emerald-700' :
                          gd.status === 'completed' ? 'bg-primary-100 text-primary-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {gd.status === 'signed' ? 'Signerad' : gd.status === 'completed' ? 'Klar' : 'Utkast'}
                        </span>
                        <span className="text-xs text-gray-400">{new Date(gd.created_at).toLocaleDateString('sv-SE')}</span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Upload + Filter */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                {['all', 'photo', 'drawing', 'contract', 'other'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setDocCategory(cat)}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                      docCategory === cat
                        ? 'bg-primary-100 text-primary-700 border-primary-300'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {cat === 'all' ? 'Alla' : cat === 'photo' ? 'Foton' : cat === 'drawing' ? 'Ritningar' : cat === 'contract' ? 'Kontrakt' : 'Övrigt'}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 px-4 py-2 bg-primary-700 rounded-lg text-white text-sm font-medium cursor-pointer hover:opacity-90">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Ladda upp
                <input type="file" className="hidden" onChange={handleDocUpload} disabled={uploading} />
              </label>
            </div>

            {/* Document Grid */}
            {documents.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {documents.map((doc: any) => {
                  const isImage = doc.mime_type?.startsWith('image/')
                  return (
                    <div key={doc.id} className="bg-white rounded-xl border border-[#E2E8F0] p-4 hover:border-gray-300 transition">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isImage ? 'bg-primary-600/20' : 'bg-primary-100'}`}>
                          {isImage ? <Image className="w-5 h-5 text-primary-500" /> : <FileText className="w-5 h-5 text-secondary-700" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : ''} · {formatDate(doc.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200">
                        <button
                          onClick={() => handleDocDownload(doc.id)}
                          className="flex items-center gap-1 text-xs text-secondary-700 hover:text-primary-700"
                        >
                          <Download className="w-3.5 h-3.5" /> Ladda ner
                        </button>
                        <button
                          onClick={() => handleDocDelete(doc.id)}
                          className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 ml-auto"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Ta bort
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
                <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400">Inga dokument uppladdade</p>
                <p className="text-xs text-gray-400 mt-1">Ladda upp foton, ritningar eller kontrakt</p>
              </div>
            )}
          </div>
        )}

        {/* === TAB: Byggdagbok === */}
        {activeTab === 'log' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-amber-400" />
                Byggdagbok {project?.name ? `\u2014 ${project.name}` : ''}
              </h2>
              <div className="flex items-center gap-2">
                {logs.length > 0 && (
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/projects/${projectId}/logs/pdf`)
                        if (!res.ok) throw new Error()
                        const blob = await res.blob()
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `byggdagbok-${project?.name || projectId}.pdf`
                        a.click()
                        URL.revokeObjectURL(url)
                      } catch {
                        showToast('Kunde inte exportera PDF', 'error')
                      }
                    }}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-600 hover:text-gray-900 hover:border-gray-300 transition-colors"
                  >
                    <Download className="w-4 h-4" /> Exportera PDF
                  </button>
                )}
                <button
                  onClick={() => { setEditingLog(null); setShowLogModal(true) }}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-700 rounded-lg text-white text-sm font-medium hover:opacity-90"
                >
                  <Plus className="w-4 h-4" /> Ny dagbokspost
                </button>
              </div>
            </div>

            {logs.length > 0 ? (
              <div className="space-y-4">
                {logs.map((log: any) => {
                  const weatherMap: Record<string, string> = { sunny: '\u2600\uFE0F Sol', cloudy: '\u26C5 Mulet', rainy: '\uD83C\uDF27\uFE0F Regn', snowy: '\u2744\uFE0F Snö', windy: '\uD83C\uDF2C\uFE0F Blåsigt' }
                  const weatherLabel = log.weather ? weatherMap[log.weather] || log.weather : null
                  return (
                    <div key={log.id} className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-gray-900 font-semibold">
                            {new Date(log.date + 'T00:00:00').toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                          </p>
                          {log.business_user && (
                            <p className="text-xs text-gray-400 mt-0.5">{log.business_user.name}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 flex-shrink-0">
                          {weatherLabel && (
                            <span>{weatherLabel}{log.temperature != null ? `, ${log.temperature}°C` : ''}</span>
                          )}
                          {log.workers_count != null && (
                            <span className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5" />
                              {log.workers_count} arbetare
                            </span>
                          )}
                        </div>
                      </div>

                      {log.work_performed && (
                        <p className="text-sm text-gray-700 mb-2 whitespace-pre-line">{log.work_performed}</p>
                      )}

                      {log.materials_used && (
                        <p className="text-xs text-gray-500 mb-2">
                          <span className="font-medium text-gray-600">Material:</span> {log.materials_used}
                        </p>
                      )}

                      {log.issues && (
                        <div className="flex items-start gap-2 mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-800">{log.issues}</p>
                        </div>
                      )}

                      {log.description && (
                        <p className="text-xs text-gray-400 italic">{log.description}</p>
                      )}

                      {log.photos && log.photos.length > 0 && (
                        <div className="flex gap-2 mt-2 overflow-x-auto">
                          {log.photos.map((photo: any, i: number) => (
                            <a key={i} href={photo.url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                              <img src={photo.url} alt={photo.caption || `Foto ${i + 1}`} className="w-16 h-16 object-cover rounded-lg border border-[#E2E8F0]" />
                            </a>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                        <button
                          onClick={() => { setEditingLog(log); setShowLogModal(true) }}
                          className="flex items-center gap-1 text-xs text-secondary-700 hover:text-primary-700"
                        >
                          <Edit className="w-3.5 h-3.5" /> Redigera
                        </button>
                        <button
                          onClick={() => handleDeleteLog(log.id)}
                          className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 ml-auto"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Ta bort
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
                <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400">Inga dagboksanteckningar ännu</p>
                <p className="text-xs text-gray-400 mt-1">Dokumentera arbetet dag för dag</p>
              </div>
            )}

            {/* Log Modal */}
            {showLogModal && (
              <LogModal
                editing={editingLog}
                onClose={() => { setShowLogModal(false); setEditingLog(null) }}
                onSave={handleSaveLog}
              />
            )}
          </div>
        )}

        {/* === TAB: Checklistor === */}
        {activeTab === 'checklists' && (
          <div className="space-y-6">

            {/* --- Active form fill-in view --- */}
            {activeForm ? (
              <FormFillView
                submission={activeForm}
                answers={formAnswers}
                setAnswers={setFormAnswers}
                saving={formSaving}
                signName={formSignName}
                setSignName={setFormSignName}
                signDrawing={formSignDrawing}
                setSignDrawing={setFormSignDrawing}
                onSave={handleSaveFormAnswers}
                onBack={() => { setActiveForm(null); fetchFormSubmissions() }}
                onDelete={() => handleDeleteFormSubmission(activeForm.id)}
              />
            ) : activeChecklist ? (
              /* Active checklist detail view */
              <div className="space-y-4">
                <button
                  onClick={() => setActiveChecklist(null)}
                  className="flex items-center gap-1 text-sm text-secondary-700 hover:text-primary-700"
                >
                  <ArrowLeft className="w-4 h-4" /> Tillbaka till lista
                </button>
                <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-gray-900 font-semibold">{activeChecklist.name}</h3>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      activeChecklist.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-600'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {activeChecklist.status === 'completed' ? 'Klar' : 'Pågår'}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>{activeChecklist.progress?.checked || 0} av {activeChecklist.progress?.total || 0} klara</span>
                      <span>{activeChecklist.progress?.percent || 0}%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                        style={{ width: `${activeChecklist.progress?.percent || 0}%` }}
                      />
                    </div>
                  </div>
                  {/* Checklist items */}
                  <div className="space-y-2">
                    {(activeChecklist.items || []).map((item: any, idx: number) => (
                      <label
                        key={item.id || idx}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition"
                      >
                        <input
                          type="checkbox"
                          checked={item.checked || false}
                          onChange={() => handleToggleChecklistItem(activeChecklist.id, idx)}
                          className="w-4 h-4 rounded border-gray-300 text-secondary-700 bg-gray-100 focus:ring-primary-600"
                        />
                        <span className={`text-sm ${item.checked ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                          {item.text}
                          {item.required && <span className="text-red-600 ml-1">*</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                  {/* Notes */}
                  {activeChecklist.notes && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-xs text-gray-400">{activeChecklist.notes}</p>
                    </div>
                  )}
                  {/* Delete */}
                  <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end">
                    <button
                      onClick={() => handleDeleteChecklist(activeChecklist.id)}
                      className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Ta bort checklista
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* List view — Checklists + Forms */
              <>
                {/* Checklistor section */}
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <ClipboardCheck className="w-5 h-5 text-emerald-600" />
                    Checklistor
                  </h2>
                  <button
                    onClick={() => setShowChecklistCreate(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-700 rounded-lg text-white text-sm font-medium hover:opacity-90"
                  >
                    <Plus className="w-4 h-4" /> Ny checklista
                  </button>
                </div>

                {checklists.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {checklists.map((cl: any) => (
                      <button
                        key={cl.id}
                        onClick={() => setActiveChecklist(cl)}
                        className="bg-white rounded-xl border border-[#E2E8F0] p-4 text-left hover:border-primary-300 transition"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-medium text-gray-900">{cl.name}</h3>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            cl.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-600'
                              : 'bg-amber-500/20 text-amber-400'
                          }`}>
                            {cl.status === 'completed' ? 'Klar' : 'Pågår'}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${cl.progress?.percent || 0}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-400 mt-1.5">
                          {cl.progress?.checked || 0}/{cl.progress?.total || 0} punkter klara
                        </p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-[#E2E8F0] p-8 text-center">
                    <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">Inga checklistor skapade</p>
                  </div>
                )}

                {/* Formulär section */}
                <div className="flex items-center justify-between mt-8">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-sky-600" />
                    Formulär
                  </h2>
                  <button
                    onClick={() => setShowFormCreate(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-sky-600 rounded-lg text-white text-sm font-medium hover:opacity-90"
                  >
                    <Plus className="w-4 h-4" /> Nytt formulär
                  </button>
                </div>

                {formSubmissions.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {formSubmissions.map((fs: any) => (
                      <button
                        key={fs.id}
                        onClick={() => { setActiveForm(fs); setFormAnswers(fs.answers || {}) }}
                        className="bg-white rounded-xl border border-[#E2E8F0] p-4 text-left hover:border-sky-300 transition"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-medium text-gray-900">{fs.name}</h3>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            fs.status === 'signed'
                              ? 'bg-emerald-100 text-emerald-600'
                              : fs.status === 'completed'
                                ? 'bg-sky-100 text-sky-600'
                                : 'bg-amber-500/20 text-amber-400'
                          }`}>
                            {fs.status === 'signed' ? 'Signerat' : fs.status === 'completed' ? 'Ifyllt' : 'Utkast'}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-secondary-500 rounded-full transition-all"
                            style={{ width: `${fs.progress?.percent || 0}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-400 mt-1.5">
                          {fs.progress?.completed || 0}/{fs.progress?.total || 0} obligatoriska fält klara
                        </p>
                        {fs.signed_at && (
                          <p className="text-xs text-emerald-600 mt-1">
                            Signerat {new Date(fs.signed_at).toLocaleDateString('sv-SE')} av {fs.signed_by_name}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-[#E2E8F0] p-8 text-center">
                    <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">Inga formulär skapade</p>
                    <p className="text-xs text-gray-400 mt-1">Skapa egenkontroll, säkerhetschecklist eller eget formulär</p>
                  </div>
                )}
              </>
            )}

            {/* Create Checklist Modal */}
            {showChecklistCreate && (
              <ChecklistCreateModal
                templates={checklistTemplates}
                onClose={() => setShowChecklistCreate(false)}
                onCreate={handleCreateChecklist}
              />
            )}

            {/* Create Form Modal */}
            {showFormCreate && (
              <FormCreateModal
                templates={formTemplates}
                onClose={() => setShowFormCreate(false)}
                onCreate={handleCreateFormSubmission}
              />
            )}
          </div>
        )}

        {/* === TAB: Canvas === */}
        {activeTab === 'canvas' && (
          <ProjectCanvas projectId={projectId} />
        )}

        {/* === TAB: Ekonomi === */}
        {activeTab === 'economy' && (
          <div className="space-y-6">
            {profitLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-secondary-700 animate-spin" />
              </div>
            ) : profitability ? (
              <>
                {/* Revenue / Costs / Result / Invoicing cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Intakter */}
                  <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <DollarSign className="w-4 h-4 text-emerald-600" />
                      <p className="text-sm font-medium text-gray-500">Intakter</p>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 mb-2">{formatCurrency(profitability.revenue.total)}</p>
                    <div className="space-y-1 text-xs text-gray-400">
                      <div className="flex justify-between">
                        <span>Offert</span>
                        <span>{formatCurrency(profitability.revenue.quote_amount)}</span>
                      </div>
                      {profitability.revenue.ata_additions > 0 && (
                        <div className="flex justify-between text-emerald-600">
                          <span>+ ATA tillagg</span>
                          <span>+{formatCurrency(profitability.revenue.ata_additions)}</span>
                        </div>
                      )}
                      {profitability.revenue.ata_removals > 0 && (
                        <div className="flex justify-between text-red-600">
                          <span>- ATA avgaende</span>
                          <span>-{formatCurrency(profitability.revenue.ata_removals)}</span>
                        </div>
                      )}
                      {profitability.revenue.material_sell > 0 && (
                        <div className="flex justify-between">
                          <span>Material (forsaljning)</span>
                          <span>{formatCurrency(profitability.revenue.material_sell)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Kostnader */}
                  <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <p className="text-sm font-medium text-gray-500">Kostnader</p>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 mb-2">{formatCurrency(profitability.costs.total)}</p>
                    <div className="space-y-1 text-xs text-gray-400">
                      <div className="flex justify-between">
                        <span>Arbetstid ({formatHours(profitability.costs.actual_hours)})</span>
                        <span>{formatCurrency(profitability.costs.actual_amount)}</span>
                      </div>
                      {profitability.costs.material_purchase > 0 && (
                        <div className="flex justify-between">
                          <span>Material (inkop)</span>
                          <span>{formatCurrency(profitability.costs.material_purchase)}</span>
                        </div>
                      )}
                      {profitability.costs.subcontractor > 0 && (
                        <div className="flex justify-between">
                          <span>Underentreprenor</span>
                          <span>{formatCurrency(profitability.costs.subcontractor)}</span>
                        </div>
                      )}
                      {profitability.costs.other > 0 && (
                        <div className="flex justify-between">
                          <span>Ovriga kostnader</span>
                          <span>{formatCurrency(profitability.costs.other)}</span>
                        </div>
                      )}
                      {supplierInvoices.length > 0 && (() => {
                        const siTotal = supplierInvoices.reduce((s, inv) => s + (parseFloat(inv.total_amount) || 0), 0)
                        return siTotal > 0 ? (
                          <div className="flex justify-between">
                            <span>Leverantörsfakturor</span>
                            <span>{formatCurrency(siTotal)}</span>
                          </div>
                        ) : null
                      })()}
                    </div>
                  </div>

                  {/* Resultat */}
                  <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="w-4 h-4 text-secondary-700" />
                      <p className="text-sm font-medium text-gray-500">Resultat</p>
                    </div>
                    <p className={`text-2xl font-bold mb-1 ${profitability.margin.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {profitability.margin.amount >= 0 ? '+' : ''}{formatCurrency(profitability.margin.amount)}
                    </p>
                    <p className={`text-sm font-medium ${profitability.margin.percent >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {profitability.margin.percent}% marginal
                    </p>
                  </div>

                  {/* Fakturering */}
                  <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Receipt className="w-4 h-4 text-primary-500" />
                      <p className="text-sm font-medium text-gray-500">Fakturering</p>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="text-xs text-gray-400">Fakturerat</p>
                        <p className="text-lg font-bold text-gray-900">{formatCurrency(profitability.invoicing.invoiced_amount)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Ofakturerat</p>
                        <p className="text-lg font-bold text-amber-400">{formatCurrency(profitability.invoicing.uninvoiced_amount)}</p>
                        <p className="text-xs text-gray-400">{formatHours(profitability.invoicing.uninvoiced_hours)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Budget usage bars */}
                <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
                  <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-primary-500" />
                    Budgetforbrukning
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-500">Timmar</span>
                        <span className="text-sm text-gray-900">
                          {formatHours(profitability.costs.actual_hours)} / {formatHours(profitability.budget.hours_with_ata)}
                        </span>
                      </div>
                      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${budgetBarColor(profitability.budget.hours_usage_percent)}`}
                          style={{ width: `${Math.min(profitability.budget.hours_usage_percent, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{profitability.budget.hours_usage_percent}%</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-500">Belopp</span>
                        <span className="text-sm text-gray-900">
                          {formatCurrency(profitability.costs.total)} / {formatCurrency(profitability.budget.amount_with_ata)}
                        </span>
                      </div>
                      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${budgetBarColor(profitability.budget.amount_usage_percent)}`}
                          style={{ width: `${Math.min(profitability.budget.amount_usage_percent, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{profitability.budget.amount_usage_percent}%</p>
                    </div>
                  </div>
                </div>

                {/* Extra costs section */}
                <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                      <Briefcase className="w-5 h-5 text-amber-500" />
                      Projektkostnader
                    </h2>
                    <button
                      onClick={() => setCostModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-secondary-700 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Lagg till kostnad
                    </button>
                  </div>

                  {profitability.extra_costs && profitability.extra_costs.length > 0 ? (
                    <div className="space-y-2">
                      {profitability.extra_costs.map((cost) => (
                        <div key={cost.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg group">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                cost.category === 'subcontractor'
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-gray-200 text-gray-600'
                              }`}>
                                {cost.category === 'subcontractor' ? 'UE' : 'Ovrigt'}
                              </span>
                              <span className="text-sm text-gray-900 truncate">{cost.description || 'Ingen beskrivning'}</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">{formatDate(cost.date)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">{formatCurrency(cost.amount)}</span>
                            <button
                              onClick={async () => {
                                if (deletingCostId) return
                                setDeletingCostId(cost.id)
                                try {
                                  const res = await fetch(`/api/projects/${projectId}/costs?cost_id=${cost.id}`, { method: 'DELETE' })
                                  if (res.ok) {
                                    setProfitability(null)
                                    showToast('Kostnad borttagen', 'success')
                                  } else {
                                    showToast('Kunde inte ta bort kostnad', 'error')
                                  }
                                } catch {
                                  showToast('Kunde inte ta bort kostnad', 'error')
                                } finally {
                                  setDeletingCostId(null)
                                }
                              }}
                              className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                              title="Ta bort"
                            >
                              {deletingCostId === cost.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between pt-2 border-t border-gray-100 text-sm">
                        <span className="text-gray-500 font-medium">Totalt</span>
                        <span className="font-bold text-gray-900">
                          {formatCurrency(profitability.extra_costs.reduce((s, c) => s + c.amount, 0))}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-4">
                      Inga extra kostnader registrerade
                    </p>
                  )}
                </div>

                {/* Create invoice button */}
                {profitability.invoicing.uninvoiced_amount > 0 && (
                  <button
                    onClick={() => setShowInvoiceModal(true)}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-700 rounded-xl text-white font-medium hover:opacity-90"
                  >
                    <Receipt className="w-5 h-5" />
                    Fakturera projekt ({formatCurrency(profitability.invoicing.uninvoiced_amount)})
                  </button>
                )}
              </>
            ) : (
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
                <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400">Kunde inte ladda ekonomidata</p>
              </div>
            )}
          </div>
        )}
        {/* === TAB: AI-logg (Projektanalys) === */}
        {activeTab === 'field_reports' && (
          <FieldReportsTab projectId={project.project_id} customerId={project.customer_id} businessId={business.business_id} />
        )}
        {activeTab === 'ai_log' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary-700" />
                Projektanalys
              </h2>
              <button
                onClick={triggerHealthAnalysis}
                disabled={analyzingHealth}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 rounded-xl hover:bg-primary-100 transition-colors disabled:opacity-50"
              >
                {analyzingHealth ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Kör analys
              </button>
            </div>

            {/* Health summary card */}
            {project.ai_health_score != null && (
              <div className={`rounded-xl border p-5 ${
                project.ai_health_score >= 80
                  ? 'bg-emerald-50 border-emerald-200'
                  : project.ai_health_score >= 50
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center gap-4">
                  <div className={`text-4xl font-bold ${
                    project.ai_health_score >= 80 ? 'text-emerald-600' : project.ai_health_score >= 50 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {project.ai_health_score}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Hälsopoäng</p>
                    <p className="text-sm text-gray-600">{project.ai_health_summary || 'Ingen analys körd ännu'}</p>
                    {project.ai_last_analyzed_at && (
                      <p className="text-xs text-gray-400 mt-1">
                        Uppdaterad: {new Date(project.ai_last_analyzed_at).toLocaleString('sv-SE')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Log entries */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-medium text-gray-900">Händelselogg</h3>
              </div>
              {aiLogLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 text-primary-700 animate-spin" />
                </div>
              ) : aiLogs.length === 0 ? (
                <div className="text-center py-12">
                  <Zap className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-400">Inga händelser loggade ännu</p>
                  <p className="text-sm text-gray-300 mt-1">Händelser loggas automatiskt vid tidsrapportering, offertacceptans m.m.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {aiLogs.map(log => (
                    <div key={log.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                            log.event_type === 'daily_health_check' ? 'bg-primary-600'
                              : log.event_type === 'quote_accepted' ? 'bg-emerald-400'
                              : log.event_type === 'time_logged' ? 'bg-primary-400'
                              : log.event_type === 'milestone_completed' ? 'bg-primary-400'
                              : log.event_type === 'invoice_paid' ? 'bg-amber-400'
                              : 'bg-gray-400'
                          }`} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900">{log.action}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {log.event_type === 'daily_health_check' && 'Daglig kontroll'}
                              {log.event_type === 'quote_accepted' && 'Offert accepterad'}
                              {log.event_type === 'time_logged' && 'Tid rapporterad'}
                              {log.event_type === 'milestone_completed' && 'Delmoment klart'}
                              {log.event_type === 'invoice_paid' && 'Faktura betald'}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {/* === TAB: Arbetsorder === */}
        {activeTab === 'arbetsorder' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary-700" />
                Arbetsorder
              </h2>
              <button
                onClick={() => setWoModal({ open: true, editing: null })}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:bg-primary-800"
              >
                <Plus className="w-4 h-4" />
                Ny arbetsorder
              </button>
            </div>

            {workOrders.length === 0 ? (
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center">
                <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <h3 className="font-medium text-gray-900 mb-1">Inga arbetsorder</h3>
                <p className="text-sm text-gray-500">Skapa en arbetsorder för att skicka instruktioner till din personal</p>
              </div>
            ) : woDetail ? (
              /* ── Detail view ── */
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <button onClick={() => setWoDetail(null)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
                    <ArrowLeft className="w-4 h-4" /> Tillbaka
                  </button>
                  <div className="flex items-center gap-2">
                    <a
                      href={`/api/work-orders/${woDetail.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E2E8F0] rounded-lg text-xs text-gray-600 hover:bg-gray-50"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Skriv ut
                    </a>
                    <button
                      onClick={() => { setWoModal({ open: true, editing: woDetail }); setWoDetail(null) }}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E2E8F0] rounded-lg text-xs text-gray-600 hover:bg-gray-50"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      Redigera
                    </button>
                    {woDetail.status !== 'completed' && (
                      <button
                        onClick={async () => {
                          await fetch(`/api/work-orders/${woDetail.id}/complete`, { method: 'POST' })
                          fetchWorkOrders()
                          setWoDetail(null)
                          showToast('Arbetsorder markerad som slutförd', 'success')
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 hover:bg-emerald-100"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Slutförd
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-mono text-gray-400">{woDetail.order_number}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    woDetail.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                    woDetail.status === 'sent' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {woDetail.status === 'completed' ? 'Slutförd' : woDetail.status === 'sent' ? 'Skickad' : 'Utkast'}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">{woDetail.title}</h3>

                <div className="grid gap-4">
                  {woDetail.scheduled_date && (
                    <div>
                      <p className="text-xs font-medium text-primary-700 uppercase mb-1">Datum & tid</p>
                      <p className="text-sm text-gray-900">
                        {new Date(woDetail.scheduled_date + 'T00:00:00').toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
                        {woDetail.scheduled_start && ` kl ${woDetail.scheduled_start.substring(0, 5)}`}
                        {woDetail.scheduled_end && `–${woDetail.scheduled_end.substring(0, 5)}`}
                      </p>
                    </div>
                  )}
                  {woDetail.address && (
                    <div>
                      <p className="text-xs font-medium text-primary-700 uppercase mb-1">Adress</p>
                      <p className="text-sm text-gray-900">{woDetail.address}</p>
                    </div>
                  )}
                  {woDetail.access_info && (
                    <div>
                      <p className="text-xs font-medium text-primary-700 uppercase mb-1">Tillträde / portkod</p>
                      <p className="text-sm text-gray-900">{woDetail.access_info}</p>
                    </div>
                  )}
                  {woDetail.contact_name && (
                    <div>
                      <p className="text-xs font-medium text-primary-700 uppercase mb-1">Kontaktperson</p>
                      <p className="text-sm text-gray-900">{woDetail.contact_name}{woDetail.contact_phone && ` — ${woDetail.contact_phone}`}</p>
                    </div>
                  )}
                  {woDetail.description && (
                    <div>
                      <p className="text-xs font-medium text-primary-700 uppercase mb-1">Uppdragsbeskrivning</p>
                      <p className="text-sm text-gray-900 whitespace-pre-line">{woDetail.description}</p>
                    </div>
                  )}
                  {woDetail.materials_needed && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-primary-700 uppercase">Material att ta med</p>
                        {!woDetail.materials_needed.includes('[ ]') && !woDetail.materials_needed.includes('[x]') && (
                          <button
                            onClick={async () => {
                              const lines = woDetail.materials_needed.split('\n').filter((l: string) => l.trim())
                              const asChecklist = lines.map((l: string) => `[ ] ${l.replace(/^[-•*]\s*/, '')}`).join('\n')
                              await supabase.from('work_order').update({ materials_needed: asChecklist }).eq('id', woDetail.id)
                              fetchWorkOrders()
                            }}
                            className="text-[10px] text-primary-700 hover:underline"
                          >
                            Gör till checklista
                          </button>
                        )}
                      </div>
                      <div className="space-y-1">
                        {woDetail.materials_needed.split('\n').filter((l: string) => l.trim()).map((line: string, i: number) => {
                          const isChecked = line.startsWith('[x]')
                          const isCheckbox = line.startsWith('[x]') || line.startsWith('[ ]')
                          const text = line.replace(/^(\[x\]|\[ \])\s*/, '')
                          return (
                            <div key={i} className="flex items-center gap-2">
                              {isCheckbox ? (
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={async () => {
                                    const lines = woDetail.materials_needed.split('\n')
                                    const targetLine = lines.filter((l: string) => l.trim())[i]
                                    const idx = lines.indexOf(targetLine)
                                    if (idx >= 0) {
                                      lines[idx] = isChecked
                                        ? lines[idx].replace('[x]', '[ ]')
                                        : lines[idx].replace('[ ]', '[x]')
                                      await supabase.from('work_order').update({ materials_needed: lines.join('\n') }).eq('id', woDetail.id)
                                      fetchWorkOrders()
                                    }
                                  }}
                                  className="w-3.5 h-3.5 rounded border-gray-300 text-primary-700 cursor-pointer"
                                />
                              ) : (
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                              )}
                              <span className={`text-sm ${isChecked ? 'line-through text-gray-400' : 'text-gray-900'}`}>{text}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {woDetail.tools_needed && (
                    <div>
                      <p className="text-xs font-medium text-primary-700 uppercase mb-1">Verktyg att ta med</p>
                      <p className="text-sm text-gray-900 whitespace-pre-line">{woDetail.tools_needed}</p>
                    </div>
                  )}
                  {woDetail.notes && (
                    <div>
                      <p className="text-xs font-medium text-primary-700 uppercase mb-1">Övrigt</p>
                      <p className="text-sm text-gray-900 whitespace-pre-line">{woDetail.notes}</p>
                    </div>
                  )}
                  {woDetail.assigned_to && (
                    <div>
                      <p className="text-xs font-medium text-primary-700 uppercase mb-1">Tilldelad</p>
                      <p className="text-sm text-gray-900">{woDetail.assigned_to}{woDetail.assigned_phone && ` — ${woDetail.assigned_phone}`}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ── List view ── */
              <div className="space-y-3">
                {workOrders.map(wo => (
                  <div key={wo.id} className="bg-white border border-[#E2E8F0] rounded-xl px-4 py-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setWoDetail(wo)}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-gray-400">{wo.order_number}</span>
                          <span className="text-sm font-medium text-gray-900">{wo.title}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            wo.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                            wo.status === 'sent' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {wo.status === 'completed' ? 'Slutförd' : wo.status === 'sent' ? 'Skickad' : 'Utkast'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          {wo.scheduled_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(wo.scheduled_date + 'T00:00:00').toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })}
                              {wo.scheduled_start && ` ${wo.scheduled_start.substring(0, 5)}`}
                              {wo.scheduled_end && `–${wo.scheduled_end.substring(0, 5)}`}
                            </span>
                          )}
                          {wo.address && (
                            <span className="flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{wo.address}</span>
                            </span>
                          )}
                          {wo.assigned_to && (
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {wo.assigned_to}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                        <button
                          onClick={() => setWoDetail(wo)}
                          className="px-2.5 py-1 text-xs border border-[#E2E8F0] rounded-lg text-gray-600 hover:bg-gray-50"
                        >
                          Visa
                        </button>
                        {wo.assigned_phone && wo.status !== 'completed' && (
                          <button
                            disabled={woSending === wo.id}
                            onClick={async () => {
                              setWoSending(wo.id)
                              try {
                                const res = await fetch(`/api/work-orders/${wo.id}/send`, { method: 'POST' })
                                if (res.ok) {
                                  showToast('SMS skickat', 'success')
                                  fetchWorkOrders()
                                } else {
                                  const d = await res.json()
                                  showToast(d.error || 'Kunde inte skicka', 'error')
                                }
                              } catch {
                                showToast('Fel vid SMS-utskick', 'error')
                              }
                              setWoSending(null)
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-primary-50 border border-[#E2E8F0] rounded-lg text-primary-700 hover:bg-primary-100 disabled:opacity-50"
                          >
                            {woSending === wo.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageSquare className="w-3 h-3" />}
                            {wo.status === 'sent' ? 'Påminn' : 'Skicka SMS'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════ LEVERANTÖRSFAKTUROR TAB ═══════ */}
        {activeTab === 'leverantorer' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-primary-700" />
                Leverantörsfakturor
              </h2>
              <button
                onClick={() => setSiModal({ open: true, editing: null })}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:bg-primary-800"
              >
                <Plus className="w-4 h-4" />
                Lägg till faktura
              </button>
            </div>

            {/* Summary cards */}
            {supplierInvoices.length > 0 && (() => {
              const totalPurchase = supplierInvoices.reduce((s, inv) => s + (parseFloat(inv.total_amount) || 0), 0)
              const billableInvoices = supplierInvoices.filter(inv => inv.billable_to_customer)
              const avgMarkup = billableInvoices.length > 0
                ? billableInvoices.reduce((s, inv) => s + (parseFloat(inv.markup_percent) || 0), 0) / billableInvoices.length
                : 0
              const totalMarkup = billableInvoices.reduce((s, inv) => {
                const amt = parseFloat(inv.total_amount) || 0
                const pct = parseFloat(inv.markup_percent) || 0
                return s + amt * pct / 100
              }, 0)
              const totalBillable = billableInvoices.reduce((s, inv) => s + (parseFloat(inv.total_amount) || 0), 0) + totalMarkup
              const unpaid = supplierInvoices.filter(inv => inv.status === 'unpaid').reduce((s, inv) => s + (parseFloat(inv.total_amount) || 0), 0)

              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white border border-[#E2E8F0] rounded-xl p-3">
                    <p className="text-xs text-gray-400 mb-1">Totalt inköp</p>
                    <p className="text-lg font-bold text-gray-900">{formatCurrency(totalPurchase)}</p>
                  </div>
                  <div className="bg-white border border-[#E2E8F0] rounded-xl p-3">
                    <p className="text-xs text-gray-400 mb-1">Påslag ({Math.round(avgMarkup)}%)</p>
                    <p className="text-lg font-bold text-gray-900">{formatCurrency(totalMarkup)}</p>
                  </div>
                  <div className="bg-white border border-[#E2E8F0] rounded-xl p-3">
                    <p className="text-xs text-gray-400 mb-1">Debiterbart</p>
                    <p className="text-lg font-bold text-primary-700">{formatCurrency(totalBillable)}</p>
                  </div>
                  <div className="bg-white border border-[#E2E8F0] rounded-xl p-3">
                    <p className="text-xs text-gray-400 mb-1">Ej betalt</p>
                    <p className="text-lg font-bold text-amber-500">{formatCurrency(unpaid)}</p>
                  </div>
                </div>
              )
            })()}

            {supplierInvoices.length === 0 ? (
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center">
                <Receipt className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <h3 className="font-medium text-gray-900 mb-1">Inga leverantörsfakturor</h3>
                <p className="text-sm text-gray-500">Lägg till fakturor från leverantörer för att spåra inköpskostnader</p>
              </div>
            ) : (
              <div className="space-y-3">
                {supplierInvoices.map(inv => {
                  const totalAmt = parseFloat(inv.total_amount) || 0
                  const markup = parseFloat(inv.markup_percent) || 0
                  const customerPrice = totalAmt + totalAmt * markup / 100

                  return (
                    <div key={inv.id} className="bg-white border border-[#E2E8F0] rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-gray-900 truncate">{inv.supplier_name}</h3>
                            {inv.invoice_number && (
                              <span className="text-xs font-mono text-gray-400">{inv.invoice_number}</span>
                            )}
                          </div>
                          <p className="text-lg font-bold text-gray-900">{formatCurrency(totalAmt)}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-400">
                            {inv.invoice_date && (
                              <span>Fakturadatum: {new Date(inv.invoice_date + 'T00:00:00').toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</span>
                            )}
                            {inv.due_date && (
                              <span>Förfall: {new Date(inv.due_date + 'T00:00:00').toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</span>
                            )}
                            {inv.billable_to_customer && markup > 0 && (
                              <span className="text-primary-700">Påslag: {markup}% → {formatCurrency(customerPrice)} till kund</span>
                            )}
                          </div>
                          {inv.notes && <p className="text-xs text-gray-400 mt-1 truncate">{inv.notes}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            inv.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                            inv.status === 'invoiced' ? 'bg-blue-100 text-blue-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {inv.status === 'paid' ? 'Betald' : inv.status === 'invoiced' ? 'Fakturerad' : 'Obetald'}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                        {inv.status === 'unpaid' && (
                          <button
                            onClick={async () => {
                              await fetch('/api/supplier-invoices', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: inv.id, status: 'paid' }),
                              })
                              fetchSupplierInvoices()
                              showToast('Markerad som betald', 'success')
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 hover:bg-emerald-100"
                          >
                            <CheckCircle className="w-3 h-3" />
                            Markera betald
                          </button>
                        )}
                        <button
                          onClick={() => setSiModal({ open: true, editing: inv })}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-600 hover:bg-gray-100"
                        >
                          <Edit className="w-3 h-3" />
                          Redigera
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm('Ta bort leverantörsfakturan?')) return
                            await fetch('/api/supplier-invoices', {
                              method: 'DELETE',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: inv.id }),
                            })
                            fetchSupplierInvoices()
                            showToast('Faktura borttagen', 'success')
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-50 border border-red-200 rounded-lg text-red-600 hover:bg-red-100"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

          </div>{/* /content area */}
        </div>{/* /flex wrapper */}

      {/* === Milestone Modal === */}
      {milestoneModal.open && (
        <MilestoneModal
          projectId={projectId}
          editing={milestoneModal.editing}
          existingNames={milestones.map(m => m.name)}
          onClose={() => setMilestoneModal({ open: false, editing: null })}
          onSaved={() => {
            setMilestoneModal({ open: false, editing: null })
            fetchProjectData()
            showToast(milestoneModal.editing ? 'Delmoment uppdaterat' : 'Delmoment tillagda', 'success')
          }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {/* === Change (ÄTA) Modal === */}
      {changeModal.open && (
        <ChangeModal
          projectId={projectId}
          editing={changeModal.editing}
          customerId={project?.customer_id || null}
          onClose={() => setChangeModal({ open: false, editing: null })}
          onSaved={() => {
            setChangeModal({ open: false, editing: null })
            setProfitability(null)
            fetchProjectData()
            showToast(changeModal.editing ? 'ÄTA uppdaterad' : 'ÄTA skapad', 'success')
          }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {/* === Cost Modal === */}
      {costModal && (
        <CostModal
          projectId={projectId}
          onClose={() => setCostModal(false)}
          onSaved={() => {
            setCostModal(false)
            setProfitability(null)
            showToast('Kostnad tillagd', 'success')
          }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {/* === Work Order Modal === */}
      {woModal.open && (
        <WorkOrderModal
          projectId={projectId}
          editing={woModal.editing}
          projectData={project}
          onClose={() => setWoModal({ open: false, editing: null })}
          onSaved={() => {
            setWoModal({ open: false, editing: null })
            fetchWorkOrders()
            showToast(woModal.editing ? 'Arbetsorder uppdaterad' : 'Arbetsorder skapad', 'success')
          }}
          onSendSMS={async (woId) => {
            try {
              const res = await fetch(`/api/work-orders/${woId}/send`, { method: 'POST' })
              if (res.ok) {
                showToast('SMS skickat', 'success')
              } else {
                showToast('Kunde inte skicka SMS', 'error')
              }
            } catch {
              showToast('Kunde inte skicka SMS', 'error')
            }
            fetchWorkOrders()
          }}
        />
      )}

      {/* === Supplier Invoice Modal === */}
      {siModal.open && (
        <SupplierInvoiceModal
          projectId={projectId}
          editing={siModal.editing}
          onClose={() => setSiModal({ open: false, editing: null })}
          onSaved={() => {
            setSiModal({ open: false, editing: null })
            fetchSupplierInvoices()
            setProfitability(null)
            showToast(siModal.editing ? 'Faktura uppdaterad' : 'Faktura tillagd', 'success')
          }}
        />
      )}

      {/* === Time Entry Modal === */}
      <TimeEntryModal
        show={showTimeModal}
        onClose={() => setShowTimeModal(false)}
        editing={false}
        formData={timeFormData}
        setFormData={setTimeFormData}
        customers={timeModalCustomers}
        bookings={timeModalBookings}
        projects={timeModalProjects}
        workTypes={timeModalWorkTypes}
        teamMembers={timeModalTeamMembers}
        isOwnerOrAdmin={isOwnerOrAdmin}
        formPersonId={timeFormPersonId}
        setFormPersonId={setTimeFormPersonId}
        currentUserId={currentUser?.id}
        saving={timeSaving}
        onSave={handleTimeSave}
        onBookingChange={handleTimeBookingChange}
        onWorkTypeChange={handleTimeWorkTypeChange}
      />

      {/* Fakturera projekt-modal */}
      {showInvoiceModal && project && (
        <ProjectInvoiceModal
          projectId={project.project_id}
          onClose={() => setShowInvoiceModal(false)}
        />
      )}
    </div>
  )
}

// --- Milestone Modal ---

function MilestoneModal({ projectId, editing, existingNames, onClose, onSaved, onError }: {
  projectId: string
  editing: Milestone | null
  existingNames?: string[]
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
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set())
  const [showChips, setShowChips] = useState(!editing)

  const existingSet = new Set((existingNames || []).map(n => n.toLowerCase()))

  const toggleTask = (taskName: string) => {
    setSelectedTasks(prev => {
      const next = new Set(prev)
      if (next.has(taskName)) {
        next.delete(taskName)
      } else {
        next.add(taskName)
      }
      return next
    })
  }

  const handleSave = async () => {
    if (!name.trim()) {
      onError('Namn krävs')
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

  const handleBatchCreate = async () => {
    if (selectedTasks.size === 0) return
    setSaving(true)
    try {
      const tasks = Array.from(selectedTasks)
      for (const taskName of tasks) {
        const res = await fetch(`/api/projects/${projectId}/milestones`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: taskName })
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || `Kunde inte skapa "${taskName}"`)
        }
      }
      onSaved()
    } catch (err: any) {
      onError(err.message || 'Kunde inte skapa delmoment')
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {editing ? 'Redigera delmoment' : 'Lägg till delmoment'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick-add chips for new milestones */}
        {!editing && showChips && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500">Välj arbetsuppgifter</p>
              <button
                onClick={() => setShowChips(false)}
                className="text-xs text-primary-700 hover:text-primary-700"
              >
                Skriv egen istället
              </button>
            </div>
            <div className="space-y-3">
              {Object.entries(TASK_CATEGORIES).map(([catKey, catLabel]) => {
                const tasks = DEFAULT_TASKS.filter(t => t.category === catKey)
                if (tasks.length === 0) return null
                return (
                  <div key={catKey}>
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-1.5">{catLabel}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {tasks.map(task => {
                        const isSelected = selectedTasks.has(task.name)
                        const alreadyExists = existingSet.has(task.name.toLowerCase())
                        return (
                          <button
                            key={task.name}
                            onClick={() => !alreadyExists && toggleTask(task.name)}
                            disabled={alreadyExists}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              alreadyExists
                                ? 'bg-gray-100 text-gray-300 cursor-not-allowed line-through'
                                : isSelected
                                  ? 'bg-primary-100 border border-[#E2E8F0] text-primary-700'
                                  : 'bg-gray-50 border border-[#E2E8F0] text-gray-600 hover:border-primary-300 hover:text-primary-700'
                            }`}
                          >
                            {isSelected && <span className="mr-1">✓</span>}
                            {task.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {selectedTasks.size > 0 && (
              <div className="flex gap-3 mt-4">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200"
                >
                  Avbryt
                </button>
                <button
                  onClick={handleBatchCreate}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary-700 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Lägg till {selectedTasks.size} st
                </button>
              </div>
            )}

            {selectedTasks.size === 0 && (
              <div className="flex items-center gap-3 mt-4">
                <div className="h-px flex-1 bg-gray-100" />
                <span className="text-xs text-gray-400">eller fyll i manuellt</span>
                <div className="h-px flex-1 bg-gray-100" />
              </div>
            )}
          </div>
        )}

        {/* Manual form — always shown when editing, or below chips when creating */}
        {(editing || !showChips || selectedTasks.size === 0) && (
          <>
            {!editing && !showChips && (
              <button
                onClick={() => setShowChips(true)}
                className="text-xs text-primary-700 hover:text-primary-700 mb-3"
              >
                ← Visa förinställda uppgifter
              </button>
            )}
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-500 mb-2 block">Namn *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="T.ex. Stomresning"
                  autoFocus={!showChips}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-sm text-gray-500 mb-2 block">Beskrivning</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Valfri beskrivning"
                  className={inputCls + ' resize-none'}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-500 mb-2 block">Budgettimmar</label>
                  <input
                    type="number"
                    value={budgetHours}
                    onChange={e => setBudgetHours(e.target.value)}
                    placeholder="0"
                    min="0"
                    step="0.5"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-500 mb-2 block">Budgetbelopp (kr)</label>
                  <input
                    type="number"
                    value={budgetAmount}
                    onChange={e => setBudgetAmount(e.target.value)}
                    placeholder="0"
                    min="0"
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-500 mb-2 block">Förfallodatum</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200"
              >
                Avbryt
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary-700 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {editing ? 'Spara' : 'Skapa'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// --- Change (ATA) Modal ---

function ChangeModal({ projectId, editing, customerId, onClose, onSaved, onError }: {
  projectId: string
  editing: Change | null
  customerId: string | null
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [changeType, setChangeType] = useState<'addition' | 'change' | 'removal'>(
    (editing?.change_type as any) || 'addition'
  )
  const [description, setDescription] = useState(editing?.description || '')
  const [notes, setNotes] = useState(editing?.notes || '')
  const [hours, setHours] = useState(editing?.hours?.toString() || '')
  const [saving, setSaving] = useState(false)

  // Item rows
  const [items, setItems] = useState<{ id: string; name: string; quantity: number; unit: string; unit_price: number }[]>(
    editing?.items?.map((item, idx) => ({
      id: `item_${idx}`,
      name: item.name || '',
      quantity: item.quantity || 1,
      unit: item.unit || 'st',
      unit_price: item.unit_price || 0,
    })) || [{ id: 'item_0', name: '', quantity: 1, unit: 'st', unit_price: 0 }]
  )

  const addItem = () => {
    setItems(prev => [...prev, { id: `item_${Date.now()}`, name: '', quantity: 1, unit: 'st', unit_price: 0 }])
  }

  const updateItemField = (id: string, field: string, value: any) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item))
  }

  const removeItem = (id: string) => {
    if (items.length <= 1) return
    setItems(prev => prev.filter(item => item.id !== id))
  }

  const total = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)

  const handleSave = async () => {
    if (!description.trim()) {
      onError('Beskrivning krävs')
      return
    }
    setSaving(true)
    try {
      const validItems = items.filter(i => i.name.trim()).map(i => ({
        name: i.name.trim(),
        quantity: i.quantity,
        unit: i.unit,
        unit_price: i.unit_price,
      }))

      if (editing) {
        // Update existing
        const res = await fetch(`/api/ata/${editing.change_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            change_type: changeType,
            description: description.trim(),
            items: validItems,
            hours: hours ? parseFloat(hours) : 0,
            notes: notes.trim() || null,
          })
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Error')
        }
      } else {
        // Create new
        const res = await fetch('/api/ata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            changeType,
            description: description.trim(),
            items: validItems,
            hours: hours ? parseFloat(hours) : 0,
            notes: notes.trim() || null,
            customerId,
          })
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Error')
        }
      }
      onSaved()
    } catch (err: any) {
      onError(err.message || 'Kunde inte spara ÄTA')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{editing ? 'Redigera ÄTA' : 'Ny ÄTA'}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-500 mb-2 block">Typ</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'addition' as const, label: 'Tillägg', color: 'emerald' },
                { key: 'change' as const, label: 'Ändring', color: 'amber' },
                { key: 'removal' as const, label: 'Avgående', color: 'red' }
              ]).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setChangeType(opt.key)}
                  className={`p-3 rounded-xl text-sm font-medium text-center transition-all border ${
                    changeType === opt.key
                      ? opt.color === 'emerald'
                        ? 'bg-emerald-100 border-emerald-500/30 text-emerald-600'
                        : opt.color === 'amber'
                        ? 'bg-amber-50 border-amber-200 text-amber-600'
                        : 'bg-red-100 border-red-500/30 text-red-600'
                      : 'bg-gray-100 border-gray-300 text-gray-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-500 mb-2 block">Beskrivning *</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Beskriv ändringar/tillägg..."
              autoFocus
              className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E] resize-none"
            />
          </div>

          {/* Item rows */}
          <div>
            <label className="text-sm text-gray-500 mb-2 block">Rader</label>
            <div className="space-y-2">
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={item.name}
                    onChange={e => updateItemField(item.id, 'name', e.target.value)}
                    placeholder="Namn"
                    className="flex-1 min-w-0 px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
                  />
                  <input
                    type="number"
                    value={item.quantity || ''}
                    onChange={e => updateItemField(item.id, 'quantity', Number(e.target.value) || 0)}
                    placeholder="Antal"
                    min="0"
                    step="0.5"
                    className="w-16 px-2 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm text-right focus:outline-none focus:border-[#0F766E]"
                  />
                  <select
                    value={item.unit}
                    onChange={e => updateItemField(item.id, 'unit', e.target.value)}
                    className="w-16 px-1 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-600 text-sm focus:outline-none focus:border-[#0F766E]"
                  >
                    <option value="st">st</option>
                    <option value="timme">tim</option>
                    <option value="kvm">m²</option>
                    <option value="m">m</option>
                    <option value="lpm">lpm</option>
                    <option value="kg">kg</option>
                    <option value="paket">pkt</option>
                  </select>
                  <input
                    type="number"
                    value={item.unit_price || ''}
                    onChange={e => updateItemField(item.id, 'unit_price', Number(e.target.value) || 0)}
                    placeholder="à-pris"
                    min="0"
                    className="w-24 px-2 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm text-right focus:outline-none focus:border-[#0F766E]"
                  />
                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                    disabled={items.length <= 1}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={addItem}
                className="flex items-center gap-1.5 text-sm text-primary-700 hover:text-primary-700 font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                Lägg till rad
              </button>
            </div>
            {total > 0 && (
              <div className="mt-2 text-right text-sm font-semibold text-gray-900">
                Summa: {total.toLocaleString('sv-SE')} kr
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-500 mb-2 block">Timmar (valfritt)</label>
              <input
                type="number"
                value={hours}
                onChange={e => setHours(e.target.value)}
                placeholder="0"
                min="0"
                step="0.5"
                className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
              />
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-2 block">Anteckning</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Intern notering..."
                className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200"
          >
            Avbryt
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !description.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary-700 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {editing ? 'Spara' : 'Skapa'}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Cost Modal (Lägg till kostnad) ---

function CostModal({ projectId, onClose, onSaved, onError }: {
  projectId: string
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [category, setCategory] = useState<'subcontractor' | 'other'>('subcontractor')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      onError('Ange ett belopp')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/costs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          description: description.trim() || null,
          amount: parseFloat(amount),
          date
        })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error')
      }
      onSaved()
    } catch (err: any) {
      onError(err.message || 'Kunde inte lagga till kostnad')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Lagg till kostnad</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-500 mb-2 block">Kategori</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setCategory('subcontractor')}
                className={`p-3 rounded-xl text-sm font-medium text-center transition-all border ${
                  category === 'subcontractor'
                    ? 'bg-purple-100 border-purple-500/30 text-purple-700'
                    : 'bg-gray-100 border-gray-300 text-gray-500'
                }`}
              >
                Underentreprenor
              </button>
              <button
                onClick={() => setCategory('other')}
                className={`p-3 rounded-xl text-sm font-medium text-center transition-all border ${
                  category === 'other'
                    ? 'bg-amber-100 border-amber-500/30 text-amber-700'
                    : 'bg-gray-100 border-gray-300 text-gray-500'
                }`}
              >
                Ovrigt
              </button>
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-500 mb-2 block">Beskrivning</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="T.ex. Elektriker AB, hyra stegar..."
              autoFocus
              className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-500 mb-2 block">Belopp (kr) *</label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                min="0"
                className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
              />
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-2 block">Datum</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200"
          >
            Avbryt
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !amount}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary-700 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Lagg till
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Log Modal (Byggdagbok) ---

function LogModal({ editing, onClose, onSave }: {
  editing: any
  onClose: () => void
  onSave: (data: any) => void
}) {
  const [logDate, setLogDate] = useState(editing?.date || new Date().toISOString().split('T')[0])
  const [weather, setWeather] = useState(editing?.weather || '')
  const [temperature, setTemperature] = useState(editing?.temperature?.toString() || '')
  const [workDescription, setWorkDescription] = useState(editing?.work_performed || '')
  const [materialsUsed, setMaterialsUsed] = useState(editing?.materials_used || '')
  const [hoursWorked, setHoursWorked] = useState(editing?.hours_worked?.toString() || '')
  const [workersPresent, setWorkersPresent] = useState(editing?.workers_count?.toString() || '')
  const [deviations, setDeviations] = useState(editing?.issues || '')
  const [notes, setNotes] = useState(editing?.description || '')
  const [saving, setSaving] = useState(false)

  const weatherOptions = [
    { value: 'sunny', emoji: '\u2600\uFE0F', label: 'Sol' },
    { value: 'cloudy', emoji: '\u26C5', label: 'Mulet' },
    { value: 'rainy', emoji: '\uD83C\uDF27\uFE0F', label: 'Regn' },
    { value: 'snowy', emoji: '\u2744\uFE0F', label: 'Snö' },
  ]

  const handleSubmit = () => {
    if (!workDescription.trim()) return
    setSaving(true)
    onSave({
      log_date: logDate,
      weather: weather || null,
      temperature: temperature ? parseFloat(temperature) : null,
      work_description: workDescription.trim(),
      materials_used: materialsUsed.trim() || null,
      hours_worked: hoursWorked ? parseFloat(hoursWorked) : null,
      workers_present: workersPresent ? parseInt(workersPresent) : null,
      deviations: deviations.trim() || null,
      notes: notes.trim() || null,
    })
  }

  const inputCls = 'w-full px-3 py-2.5 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-primary-400'

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10 rounded-t-2xl">
          <h2 className="text-lg font-semibold text-gray-900">
            {editing ? 'Redigera dagbokspost' : 'Ny dagbokspost'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Datum */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Datum</label>
            <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} className={inputCls} />
          </div>

          {/* Väder — emoji knappar */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Väder</label>
            <div className="flex gap-2">
              {weatherOptions.map(w => (
                <button
                  key={w.value}
                  type="button"
                  onClick={() => setWeather(weather === w.value ? '' : w.value)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 rounded-lg border text-sm transition-all ${
                    weather === w.value
                      ? 'bg-primary-50 border-primary-400 text-primary-700 ring-1 ring-primary-400'
                      : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <span className="text-lg">{w.emoji}</span>
                  <span className="text-xs">{w.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Temperatur + Arbetare */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Temperatur (°C)</label>
              <input type="number" value={temperature} onChange={e => setTemperature(e.target.value)} placeholder="0" className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Antal arbetare</label>
              <input type="number" value={workersPresent} onChange={e => setWorkersPresent(e.target.value)} placeholder="0" min="0" className={inputCls} />
            </div>
          </div>

          {/* Vad gjordes idag */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Vad gjordes idag *</label>
            <textarea
              value={workDescription}
              onChange={e => setWorkDescription(e.target.value)}
              rows={3}
              placeholder="Beskriv dagens arbete..."
              autoFocus
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* Material */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Material som användes</label>
            <textarea
              value={materialsUsed}
              onChange={e => setMaterialsUsed(e.target.value)}
              rows={2}
              placeholder="T.ex. 10m kopparrör, 5 kopplingar..."
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* Avvikelser */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Avvikelser</label>
            <textarea
              value={deviations}
              onChange={e => setDeviations(e.target.value)}
              rows={2}
              placeholder="Avvikelser från plan, problem eller hinder..."
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* Anteckningar */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Anteckningar</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Övriga anteckningar..."
              className={`${inputCls} resize-none`}
            />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-lg text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Avbryt
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !workDescription.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-700 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {editing ? 'Spara' : 'Skapa dagbokspost'}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Work Order Modal ---

function WorkOrderModal({ projectId, editing, projectData, onClose, onSaved, onSendSMS }: {
  projectId: string
  editing: any | null
  projectData?: Project | null
  onClose: () => void
  onSaved: () => void
  onSendSMS?: (id: string) => void
}) {
  const business = useBusiness()
  const [title, setTitle] = useState(editing?.title || '')
  const [scheduledDate, setScheduledDate] = useState(editing?.scheduled_date || '')
  const [scheduledStart, setScheduledStart] = useState(editing?.scheduled_start?.substring(0, 5) || '')
  const [scheduledEnd, setScheduledEnd] = useState(editing?.scheduled_end?.substring(0, 5) || '')
  const [address, setAddress] = useState(editing?.address || (!editing && projectData?.customer?.address_line) || '')
  const [accessInfo, setAccessInfo] = useState(editing?.access_info || '')
  const [contactName, setContactName] = useState(editing?.contact_name || (!editing && projectData?.customer?.name) || '')
  const [contactPhone, setContactPhone] = useState(editing?.contact_phone || (!editing && projectData?.customer?.phone_number) || '')
  const [description, setDescription] = useState(editing?.description || (!editing && projectData?.description) || '')
  const [materialItems, setMaterialItems] = useState<{ text: string; checked: boolean }[]>(() => {
    const raw = editing?.materials_needed || ''
    if (!raw.trim()) return []
    return raw.split('\n').filter((l: string) => l.trim()).map((l: string) => ({
      text: l.replace(/^(\[x\]|\[ \])\s*/, ''),
      checked: l.startsWith('[x]'),
    }))
  })
  const [newMaterialText, setNewMaterialText] = useState('')

  // Serialize material items back to text for saving
  const materialsNeeded = materialItems.length > 0
    ? materialItems.map(m => `${m.checked ? '[x]' : '[ ]'} ${m.text}`).join('\n')
    : ''
  const [toolsNeeded, setToolsNeeded] = useState(editing?.tools_needed || '')
  const [notes, setNotes] = useState(editing?.notes || '')
  const [assignedTo, setAssignedTo] = useState(editing?.assigned_to || '')
  const [assignedPhone, setAssignedPhone] = useState(editing?.assigned_phone || '')
  const [saving, setSaving] = useState(false)
  const [sendAfterSave, setSendAfterSave] = useState(false)
  const [woTeamMembers, setWoTeamMembers] = useState<{ id: string; name: string; phone: string | null }[]>([])

  useEffect(() => {
    if (business.business_id) {
      supabase
        .from('business_users')
        .select('id, name, phone')
        .eq('business_id', business.business_id)
        .eq('is_active', true)
        .order('name')
        .then(({ data }: { data: any }) => setWoTeamMembers(data || []))
    }
  }, [business.business_id])

  const inputCls = 'w-full px-3 py-2.5 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-primary-400'

  const handleSave = async (andSend: boolean) => {
    if (!title.trim()) return
    setSaving(true)
    setSendAfterSave(andSend)

    try {
      const payload: any = {
        project_id: projectId,
        title: title.trim(),
        scheduled_date: scheduledDate || null,
        scheduled_start: scheduledStart || null,
        scheduled_end: scheduledEnd || null,
        address: address.trim() || null,
        access_info: accessInfo.trim() || null,
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
        description: description.trim() || null,
        materials_needed: materialsNeeded.trim() || null,
        tools_needed: toolsNeeded.trim() || null,
        notes: notes.trim() || null,
        assigned_to: assignedTo.trim() || null,
        assigned_phone: assignedPhone.trim() || null,
      }

      let res: Response
      if (editing) {
        payload.id = editing.id
        res = await fetch('/api/work-orders', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      } else {
        res = await fetch('/api/work-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      }

      if (!res.ok) throw new Error('Kunde inte spara')

      if (andSend && onSendSMS) {
        const data = await res.json()
        const woId = editing?.id || data.work_order?.id
        if (woId) {
          onSendSMS(woId)
        }
      }

      onSaved()
    } catch (err) {
      console.error('Save work order error:', err)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10 rounded-t-2xl">
          <h2 className="text-lg font-semibold text-gray-900">
            {editing ? 'Redigera arbetsorder' : 'Ny arbetsorder'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Titel */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Titel *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="T.ex. Montera kök Storgatan 12" className={inputCls} />
          </div>

          {/* Datum + Tid */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Datum</label>
              <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Start</label>
              <input type="time" value={scheduledStart} onChange={e => setScheduledStart(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Slut</label>
              <input type="time" value={scheduledEnd} onChange={e => setScheduledEnd(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Adress */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Adress</label>
            <AddressAutocomplete
              value={address}
              onChange={setAddress}
              onSelect={(r) => setAddress(r.full_address)}
              placeholder="Sök adress..."
              className={inputCls}
            />
          </div>

          {/* Tillträde / portkod */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Tillträde / portkod</label>
            <input type="text" value={accessInfo} onChange={e => setAccessInfo(e.target.value)} placeholder="Portkod 1234, nyckel i låda" className={inputCls} />
          </div>

          {/* Kontaktperson */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Kontaktperson</label>
              <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Namn" className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Telefon</label>
              <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="070-123 45 67" className={inputCls} />
            </div>
          </div>

          {/* Vad ska göras */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Vad ska göras</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Beskriv arbetet som ska utföras..." className={inputCls + ' resize-none'} />
          </div>

          {/* Material — checklista */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Material att ta med</label>
            <div className="space-y-1.5">
              {materialItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 group">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => setMaterialItems(prev => prev.map((m, i) => i === idx ? { ...m, checked: !m.checked } : m))}
                    className="w-4 h-4 rounded border-gray-300 text-primary-700 focus:ring-primary-600"
                  />
                  <span className={`text-sm flex-1 ${item.checked ? 'line-through text-gray-400' : 'text-gray-900'}`}>{item.text}</span>
                  <button
                    type="button"
                    onClick={() => setMaterialItems(prev => prev.filter((_, i) => i !== idx))}
                    className="p-0.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newMaterialText}
                  onChange={e => setNewMaterialText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newMaterialText.trim()) {
                      e.preventDefault()
                      setMaterialItems(prev => [...prev, { text: newMaterialText.trim(), checked: false }])
                      setNewMaterialText('')
                    }
                  }}
                  placeholder="Lägg till material..."
                  className={inputCls + ' flex-1'}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newMaterialText.trim()) {
                      setMaterialItems(prev => [...prev, { text: newMaterialText.trim(), checked: false }])
                      setNewMaterialText('')
                    }
                  }}
                  className="p-2 text-primary-700 hover:bg-primary-50 rounded-lg transition"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Verktyg */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Verktyg att ta med</label>
            <textarea value={toolsNeeded} onChange={e => setToolsNeeded(e.target.value)} rows={2} placeholder="Lista verktyg som behövs..." className={inputCls + ' resize-none'} />
          </div>

          {/* Tilldela till */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Tilldela till</label>
              {woTeamMembers.length > 0 ? (
                <select
                  value={assignedTo}
                  onChange={e => {
                    const name = e.target.value
                    setAssignedTo(name)
                    const member = woTeamMembers.find(m => m.name === name)
                    if (member?.phone) setAssignedPhone(member.phone)
                  }}
                  className={inputCls}
                >
                  <option value="">Välj person...</option>
                  {woTeamMembers.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              ) : (
                <input type="text" value={assignedTo} onChange={e => setAssignedTo(e.target.value)} placeholder="Namn" className={inputCls} />
              )}
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Mottagarens telefon</label>
              <input type="tel" value={assignedPhone} onChange={e => setAssignedPhone(e.target.value)} placeholder="070-123 45 67" className={inputCls} />
            </div>
          </div>

          {/* Övrigt */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Övrigt</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Övrig information..." className={inputCls + ' resize-none'} />
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-lg text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Avbryt
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={saving || !title.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-700 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {saving && !sendAfterSave ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Spara utkast
          </button>
          {assignedPhone.trim() && (
            <button
              onClick={() => handleSave(true)}
              disabled={saving || !title.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-800 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {saving && sendAfterSave ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Spara & skicka
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Supplier Invoice Modal ---

function SupplierInvoiceModal({ projectId, editing, onClose, onSaved }: {
  projectId: string
  editing: any | null
  onClose: () => void
  onSaved: () => void
}) {
  const [supplierName, setSupplierName] = useState(editing?.supplier_name || '')
  const [invoiceNumber, setInvoiceNumber] = useState(editing?.invoice_number || '')
  const [invoiceDate, setInvoiceDate] = useState(editing?.invoice_date || '')
  const [dueDate, setDueDate] = useState(editing?.due_date || '')
  const [amountExclVat, setAmountExclVat] = useState(editing?.amount_excl_vat?.toString() || '')
  const [vatAmount, setVatAmount] = useState(editing?.vat_amount?.toString() || '')
  const [markupPercent, setMarkupPercent] = useState(editing?.markup_percent?.toString() || '15')
  const [billable, setBillable] = useState(editing?.billable_to_customer ?? true)
  const [showToCustomer, setShowToCustomer] = useState(editing?.show_to_customer ?? false)
  const [notes, setNotes] = useState(editing?.notes || '')
  const [saving, setSaving] = useState(false)

  const exclVat = parseFloat(amountExclVat) || 0
  const vat = parseFloat(vatAmount) || 0
  const total = exclVat + vat
  const markup = parseFloat(markupPercent) || 0
  const customerPrice = total + total * markup / 100

  const inputCls = 'w-full px-3 py-2.5 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-primary-400'

  const handleSave = async () => {
    if (!supplierName.trim()) return
    setSaving(true)
    try {
      const payload: any = {
        project_id: projectId,
        supplier_name: supplierName.trim(),
        invoice_number: invoiceNumber.trim() || null,
        invoice_date: invoiceDate || null,
        due_date: dueDate || null,
        amount_excl_vat: exclVat,
        vat_amount: vat,
        total_amount: total,
        markup_percent: markup,
        billable_to_customer: billable,
        show_to_customer: showToCustomer,
        notes: notes.trim() || null,
      }

      if (editing) {
        payload.id = editing.id
        await fetch('/api/supplier-invoices', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      } else {
        await fetch('/api/supplier-invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      }

      onSaved()
    } catch (err) {
      console.error('Save supplier invoice error:', err)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10 rounded-t-2xl">
          <h2 className="text-lg font-semibold text-gray-900">
            {editing ? 'Redigera leverantörsfaktura' : 'Ny leverantörsfaktura'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Leverantör */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Leverantör *</label>
            <input type="text" value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="T.ex. Byggmaterial AB" className={inputCls} />
          </div>

          {/* Fakturanr */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Fakturanummer</label>
            <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="INV-2241" className={inputCls} />
          </div>

          {/* Datum */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Fakturadatum</label>
              <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Förfallodatum</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Belopp */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Exkl. moms</label>
              <div className="relative">
                <input type="number" value={amountExclVat} onChange={e => setAmountExclVat(e.target.value)} placeholder="0" className={inputCls + ' pr-8'} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">kr</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Moms</label>
              <div className="relative">
                <input type="number" value={vatAmount} onChange={e => setVatAmount(e.target.value)} placeholder="0" className={inputCls + ' pr-8'} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">kr</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Totalt</label>
              <div className="px-3 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-lg text-sm font-medium text-gray-900">
                {total.toLocaleString('sv-SE')} kr
              </div>
            </div>
          </div>

          {/* Påslag */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Påslag till kund (%)</label>
            <div className="flex items-center gap-3">
              <div className="relative w-24">
                <input type="number" value={markupPercent} onChange={e => setMarkupPercent(e.target.value)} placeholder="15" className={inputCls + ' pr-6'} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
              </div>
              {total > 0 && markup > 0 && (
                <p className="text-sm text-primary-700 font-medium">
                  → {customerPrice.toLocaleString('sv-SE')} kr till kund
                </p>
              )}
            </div>
          </div>

          {/* Checkboxar */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={billable} onChange={e => setBillable(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-primary-700 focus:ring-primary-600" />
              <span className="text-sm text-gray-700">Debiterbar till kund</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={showToCustomer} onChange={e => setShowToCustomer(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-primary-700 focus:ring-primary-600" />
              <span className="text-sm text-gray-700">Visa för kund i kundportalen</span>
            </label>
          </div>

          {/* Anteckning */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Anteckning</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Valfri anteckning..." className={inputCls + ' resize-none'} />
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-lg text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Avbryt
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !supplierName.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-700 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {editing ? 'Spara' : 'Lägg till'}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Checklist Create Modal ---

function ChecklistCreateModal({ templates, onClose, onCreate }: {
  templates: any[]
  onClose: () => void
  onCreate: (templateId: string, name: string, items: any[]) => void
}) {
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null)
  const [customName, setCustomName] = useState('')
  const [customItems, setCustomItems] = useState('')

  const handleCreate = () => {
    if (selectedTemplate) {
      onCreate(selectedTemplate.id, selectedTemplate.name, selectedTemplate.items)
    } else if (customName.trim() && customItems.trim()) {
      const items = customItems.split('\n').filter(l => l.trim()).map((text, i) => ({
        id: `custom-${i}`,
        text: text.trim(),
        required: false,
        checked: false,
      }))
      onCreate('', customName.trim(), items)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Ny checklista</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Template selection */}
        {templates.length > 0 && (
          <div className="mb-6">
            <label className="text-sm text-gray-500 mb-3 block">Välj mall</label>
            <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
              {templates.map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => { setSelectedTemplate(t); setCustomName(''); setCustomItems('') }}
                  className={`p-3 rounded-xl text-left text-sm border transition ${
                    selectedTemplate?.id === t.id
                      ? 'bg-primary-100 border-primary-300 text-primary-700'
                      : 'bg-gray-100 border-gray-300 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs text-gray-400 ml-2">({(t.items || []).length} punkter)</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Or custom */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-100" />
            <span className="text-xs text-gray-400">eller skapa egen</span>
            <div className="h-px flex-1 bg-gray-100" />
          </div>

          <div>
            <label className="text-sm text-gray-500 mb-2 block">Namn</label>
            <input
              type="text"
              value={customName}
              onChange={e => { setCustomName(e.target.value); setSelectedTemplate(null) }}
              placeholder="T.ex. Slutbesiktning badrum"
              className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
            />
          </div>

          <div>
            <label className="text-sm text-gray-500 mb-2 block">Punkter (en per rad)</label>
            <textarea
              value={customItems}
              onChange={e => { setCustomItems(e.target.value); setSelectedTemplate(null) }}
              rows={5}
              placeholder={"Kontrollera tätskikt\nTesta golvvärme\nKontrollera fall mot brunn"}
              className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E] resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200"
          >
            Avbryt
          </button>
          <button
            onClick={handleCreate}
            disabled={!selectedTemplate && (!customName.trim() || !customItems.trim())}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary-700 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            Skapa checklista
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Form Create Modal ---

function FormCreateModal({ templates, onClose, onCreate }: {
  templates: any[]
  onClose: () => void
  onCreate: (templateId: string, name?: string) => void
}) {
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null)

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Nytt formulär</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-4">Välj en mall att utgå ifrån</p>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {templates.map((t: any) => (
            <button
              key={t.id}
              onClick={() => setSelectedTemplate(t)}
              className={`w-full p-4 rounded-xl text-left border transition ${
                selectedTemplate?.id === t.id
                  ? 'bg-secondary-50 border-sky-300 ring-1 ring-sky-300'
                  : 'bg-gray-50 border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-gray-900">{t.name}</span>
                {t.is_system && (
                  <span className="px-2 py-0.5 text-xs bg-primary-100 text-primary-700 rounded-full">System</span>
                )}
              </div>
              {t.description && (
                <p className="text-xs text-gray-500 mt-1">{t.description}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                {(t.fields || []).filter((f: any) => f.type !== 'header').length} fält
              </p>
            </button>
          ))}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200"
          >
            Avbryt
          </button>
          <button
            onClick={() => selectedTemplate && onCreate(selectedTemplate.id)}
            disabled={!selectedTemplate}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-sky-600 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            Skapa formulär
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Form Fill View ---

function FormFillView({ submission, answers, setAnswers, saving, signName, setSignName, signDrawing, setSignDrawing, onSave, onBack, onDelete }: {
  submission: any
  answers: Record<string, any>
  setAnswers: (a: Record<string, any>) => void
  saving: boolean
  signName: string
  setSignName: (n: string) => void
  signDrawing: boolean
  setSignDrawing: (d: boolean) => void
  onSave: (opts?: { status?: string; signatureName?: string; signatureData?: string }) => void
  onBack: () => void
  onDelete: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const fields: any[] = submission.fields || []
  const isSigned = submission.status === 'signed'
  const isCompleted = submission.status === 'completed'
  const [showSignSection, setShowSignSection] = useState(false)

  const updateAnswer = (fieldId: string, key: string, value: any) => {
    if (isSigned) return
    setAnswers({
      ...answers,
      [fieldId]: { ...(answers[fieldId] || {}), [key]: value },
    })
  }

  // Canvas drawing for signature
  const initCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * 2
    canvas.height = rect.height * 2
    ctx.scale(2, 2)
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  const getCanvasPos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    drawingRef.current = true
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pos = getCanvasPos(e)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    canvas.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pos = getCanvasPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }

  const onPointerUp = () => {
    drawingRef.current = false
  }

  const getSignatureData = (): string | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    return canvas.toDataURL('image/png')
  }

  const handleSign = () => {
    if (!signName.trim()) return
    const sigData = getSignatureData()
    onSave({ status: 'signed', signatureName: signName.trim(), signatureData: sigData || undefined })
    setShowSignSection(false)
  }

  // Calculate progress
  const requiredFields = fields.filter((f: any) => f.required && f.type !== 'header')
  const answeredRequired = requiredFields.filter((f: any) => {
    const a = answers[f.id]
    if (!a) return false
    if (f.type === 'checkbox') return a.checked === true
    if (f.type === 'text') return !!a.value
    if (f.type === 'photo') return !!a.photo_url
    if (f.type === 'signature') return !!a.signature_data
    return false
  })
  const progressPercent = requiredFields.length > 0
    ? Math.round((answeredRequired.length / requiredFields.length) * 100)
    : 100

  const inputCls = 'w-full px-3 py-2.5 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-sky-400'

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-secondary-700 hover:text-primary-700"
      >
        <ArrowLeft className="w-4 h-4" /> Tillbaka till lista
      </button>

      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-gray-900 font-semibold text-lg">{submission.name}</h3>
          <span className={`px-2 py-0.5 text-xs rounded-full ${
            isSigned
              ? 'bg-emerald-100 text-emerald-600'
              : isCompleted
                ? 'bg-sky-100 text-sky-600'
                : 'bg-amber-500/20 text-amber-400'
          }`}>
            {isSigned ? 'Signerat' : isCompleted ? 'Ifyllt' : 'Utkast'}
          </span>
        </div>

        {/* Progress */}
        {requiredFields.length > 0 && (
          <div className="mb-6">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>{answeredRequired.length} av {requiredFields.length} obligatoriska klara</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-secondary-500 rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        )}

        {/* Signed info */}
        {isSigned && submission.signed_at && (
          <div className="mb-6 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
            <p className="text-sm text-emerald-700">
              Signerat {new Date(submission.signed_at).toLocaleDateString('sv-SE')} av {submission.signed_by_name}
            </p>
            {submission.signature_data && (
              <img src={submission.signature_data} alt="Signatur" className="mt-2 h-16 border border-emerald-200 rounded bg-white" />
            )}
          </div>
        )}

        {/* Fields */}
        <div className="space-y-4">
          {fields.map((field: any) => {
            const answer = answers[field.id] || {}

            if (field.type === 'header') {
              return (
                <div key={field.id} className="pt-4 pb-1 border-b border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">{field.label}</h4>
                </div>
              )
            }

            if (field.type === 'checkbox') {
              return (
                <label key={field.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={answer.checked || false}
                    onChange={e => updateAnswer(field.id, 'checked', e.target.checked)}
                    disabled={isSigned}
                    className="w-4 h-4 mt-0.5 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                  />
                  <div>
                    <span className={`text-sm ${answer.checked ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </span>
                    {field.description && <p className="text-xs text-gray-400 mt-0.5">{field.description}</p>}
                  </div>
                </label>
              )
            }

            if (field.type === 'text') {
              return (
                <div key={field.id}>
                  <label className="text-xs text-gray-500 mb-1.5 block">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  {field.description && <p className="text-xs text-gray-400 mb-1">{field.description}</p>}
                  <textarea
                    value={answer.value || ''}
                    onChange={e => updateAnswer(field.id, 'value', e.target.value)}
                    rows={2}
                    disabled={isSigned}
                    placeholder="Skriv här..."
                    className={inputCls + ' resize-none'}
                  />
                </div>
              )
            }

            if (field.type === 'photo') {
              return (
                <div key={field.id}>
                  <label className="text-xs text-gray-500 mb-1.5 block">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  {answer.photo_url ? (
                    <div className="relative inline-block">
                      <img src={answer.photo_url} alt={field.label} className="w-32 h-32 object-cover rounded-lg border border-[#E2E8F0]" />
                      {!isSigned && (
                        <button
                          onClick={() => updateAnswer(field.id, 'photo_url', null)}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ) : !isSigned ? (
                    <label className="flex items-center gap-2 px-4 py-3 bg-gray-50 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-sky-400 transition">
                      <Image className="w-5 h-5 text-gray-400" />
                      <span className="text-sm text-gray-500">Välj foto...</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          // Convert to base64 for simplicity
                          const reader = new FileReader()
                          reader.onload = () => {
                            updateAnswer(field.id, 'photo_url', reader.result as string)
                          }
                          reader.readAsDataURL(file)
                        }}
                      />
                    </label>
                  ) : (
                    <p className="text-sm text-gray-400">Inget foto</p>
                  )}
                </div>
              )
            }

            if (field.type === 'signature') {
              return (
                <div key={field.id}>
                  <label className="text-xs text-gray-500 mb-1.5 block">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  {answer.signature_data ? (
                    <div className="relative inline-block">
                      <img src={answer.signature_data} alt="Signatur" className="h-20 border border-[#E2E8F0] rounded-lg bg-white" />
                      {!isSigned && (
                        <button
                          onClick={() => updateAnswer(field.id, 'signature_data', null)}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ) : !isSigned ? (
                    <div className="border border-[#E2E8F0] rounded-lg overflow-hidden bg-white">
                      <canvas
                        ref={canvasRef}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerLeave={onPointerUp}
                        className="w-full h-24 touch-none cursor-crosshair"
                        style={{ touchAction: 'none' }}
                      />
                      <div className="flex gap-2 p-2 border-t border-gray-100">
                        <button
                          type="button"
                          onClick={() => { initCanvas(); clearCanvas() }}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Rensa
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            initCanvas()
                            const sigData = getSignatureData()
                            if (sigData) updateAnswer(field.id, 'signature_data', sigData)
                          }}
                          className="text-xs text-sky-600 hover:text-secondary-700 ml-auto"
                        >
                          Spara signatur
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">Ingen signatur</p>
                  )}
                </div>
              )
            }

            return null
          })}
        </div>

        {/* Action buttons */}
        {!isSigned && (
          <div className="mt-6 pt-4 border-t border-gray-200 space-y-3">
            {/* Save */}
            <div className="flex gap-3">
              <button
                onClick={() => onSave()}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-600 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Spara
              </button>
              <button
                onClick={() => setShowSignSection(!showSignSection)}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 rounded-lg text-white text-sm font-medium hover:opacity-90"
              >
                <PenTool className="w-4 h-4" /> Signera
              </button>
            </div>

            {/* Sign section */}
            {showSignSection && (
              <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200 space-y-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Namn</label>
                  <input
                    type="text"
                    value={signName}
                    onChange={e => setSignName(e.target.value)}
                    placeholder="Ditt namn"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Signatur</label>
                  <div className="border border-emerald-200 rounded-lg overflow-hidden bg-white">
                    <canvas
                      ref={canvasRef}
                      onPointerDown={onPointerDown}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerLeave={onPointerUp}
                      className="w-full h-24 touch-none cursor-crosshair"
                      style={{ touchAction: 'none' }}
                    />
                    <div className="flex gap-2 p-2 border-t border-emerald-100">
                      <button type="button" onClick={() => { initCanvas(); clearCanvas() }} className="text-xs text-gray-500">
                        Rensa
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleSign}
                  disabled={saving || !signName.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />}
                  Signera formulär
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer: PDF + Delete */}
        <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={() => window.open(`/api/form-submissions/${submission.id}/pdf`, '_blank')}
            className="flex items-center gap-1 text-xs text-secondary-700 hover:text-primary-700"
          >
            <Printer className="w-3.5 h-3.5" /> Exportera PDF
          </button>
          {!isSigned && (
            <button
              onClick={onDelete}
              className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-3.5 h-3.5" /> Ta bort formulär
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Field Reports Tab ───────────────────────────────────────

function FieldReportsTab({ projectId, customerId, businessId }: { projectId: string; customerId: string | null; businessId: string }) {
  const [reports, setReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', work_performed: '', materials_used: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchReports()
  }, [projectId])

  async function fetchReports() {
    try {
      const res = await fetch(`/api/field-reports?project_id=${projectId}`)
      const data = await res.json()
      setReports(data.reports || [])
    } catch { /* silent */ }
    setLoading(false)
  }

  async function createReport() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      await fetch('/api/field-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          customer_id: customerId,
          title: form.title,
          work_performed: form.work_performed,
          materials_used: form.materials_used,
          status: 'sent',
        }),
      })
      setShowModal(false)
      setForm({ title: '', work_performed: '', materials_used: '' })
      fetchReports()
    } catch { /* silent */ }
    setSaving(false)
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'signed': return 'bg-green-100 text-green-700'
      case 'sent': return 'bg-blue-100 text-blue-700'
      case 'rejected': return 'bg-red-100 text-red-700'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  const statusLabel = (status: string) => {
    switch (status) {
      case 'signed': return 'Signerad'
      case 'sent': return 'Skickad'
      case 'rejected': return 'Invändning'
      case 'draft': return 'Utkast'
      default: return status
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Fältrapporter</h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:bg-primary-800"
        >
          + Ny fältrapport
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400">Laddar...</div>
      ) : reports.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center">
          <p className="text-gray-400 mb-2">Inga fältrapporter ännu</p>
          <p className="text-sm text-gray-400">Skapa en rapport som kunden kan signera digitalt</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((r: any) => (
            <div key={r.id} className="bg-white border border-[#E2E8F0] rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 truncate">{r.title}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge(r.status)}`}>
                    {statusLabel(r.status)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                  <span>{r.report_number}</span>
                  <span>{new Date(r.created_at).toLocaleDateString('sv-SE')}</span>
                  {r.signed_by && <span>· Signerad av {r.signed_by}</span>}
                </div>
              </div>
              {r.status === 'sent' && r.signature_token && (
                <button
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/sign/report/${r.signature_token}`)}
                  className="text-xs text-primary-700 hover:underline shrink-0"
                >
                  Kopiera länk
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Ny fältrapport</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Rubrik *</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="T.ex. Elinstallation kök klar" className="w-full border border-gray-300 rounded-lg p-2 mt-1 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Utfört arbete *</label>
                <textarea value={form.work_performed} onChange={e => setForm({ ...form, work_performed: e.target.value })} placeholder="Beskriv arbetet..." rows={3} className="w-full border border-gray-300 rounded-lg p-2 mt-1 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Material</label>
                <textarea value={form.materials_used} onChange={e => setForm({ ...form, materials_used: e.target.value })} placeholder="T.ex. Jordfelsbrytare × 3..." rows={2} className="w-full border border-gray-300 rounded-lg p-2 mt-1 text-sm" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={createReport} disabled={saving || !form.title.trim()} className="flex-1 bg-primary-800 text-white py-2.5 rounded-xl font-medium text-sm disabled:opacity-50">
                {saving ? 'Skapar...' : 'Skapa och skicka'}
              </button>
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 border border-[#E2E8F0] rounded-xl text-sm text-gray-500">Avbryt</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
