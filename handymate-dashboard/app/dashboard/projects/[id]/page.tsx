Warning: truncated output (original token count: 71640)
Total output lines: 6233

﻿'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { formatKronor } from '@/lib/format-price'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Loader2,
  ChevronDown,
  Clock,
  Plus,
  Edit,
  Trash2,
  Check,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Calendar,
  FileText,
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
  RefreshCw,
  Zap,
  Send,
  Eye,
  Copy,
  FileSignature,
  ChevronRight,
  Lock,
  MapPin,
  Phone,
  Printer,
  MessageSquare,
  GripVertical,
  MoreVertical,
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
import { isLaunchHidden } from '@/lib/launch-visibility'
import { SelectedProduct } from '@/lib/suppliers/types'
import { DEFAULT_TASKS, TASK_CATEGORIES } from '@/lib/task-defaults'
import TaskPresetPicker from '@/components/TaskPresetPicker'
import SmartTaskTitleInput from '@/components/SmartTaskTitleInput'
import Link from 'next/link'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import dynamic from 'next/dynamic'
import ProjectInvoiceModal from '@/components/invoices/ProjectInvoiceModal'
import DayClose from '@/components/day-close/DayClose'
import ProjectCloseoutModal from '@/components/projects/ProjectCloseoutModal'
import TimeEntryModal from '@/components/time/TimeEntryModal'
import { ProjectBookingsTable } from './components/ProjectBookingsTable'
import { ProjectStageModal } from '@/components/pipeline/unified/ProjectStageModal'
import { ProjectEconomicsCard } from '@/components/projects/ProjectEconomicsCard'
import { GuardianOrsaker } from '@/components/projects/GuardianOrsaker'
import { ProjectCustomerFactsCard } from '@/components/projects/ProjectCustomerFactsCard'
import { FramdriftCard } from '@/components/projects/economy/FramdriftCard'
import { ProjectQuoteSpec } from '@/components/projects/ProjectQuoteSpec'
import { useFilePreview } from '@/components/documents/FilePreviewProvider'
import AtaCard from '@/components/projects/ata/AtaCard'
import ChangeModal from '@/components/projects/ata/ChangeModal'
import SendAtaDialog from '@/components/projects/ata/SendAtaDialog'
import DiaryTab from '@/components/projects/diary/DiaryTab'
import { ProjectQuoteDocumentCard } from '@/components/projects/ProjectQuoteDocumentCard'
import { getStageBucket } from '@/components/projects/ProjectStatusCard'
import ProjectTodoBlock, { type TodoMode, type TodoRow, type OverBudgetAlert } from '@/components/projects/ProjectTodoBlock'
import ProjectTasksBlock from '@/components/projects/ProjectTasksBlock'
import JobPreparation from '@/components/projects/JobPreparation'
import type { LarsTip } from '@/lib/tasks/lars-tips'
import { deriveTodoMode, TODO_PRIMARY_LABEL } from '@/lib/projects/derive-todo'
import { ProjectStatusBand } from '@/components/projects/ProjectStatusBand'
import { ProjectDatesInline } from '@/components/projects/ProjectDatesInline'
import { deriveProjectLifecycle, type LifecyclePhase } from '@/lib/projects/derive-lifecycle'
import { beraknaFakturaberedskap } from '@/lib/projects/fakturaberedskap'
import { invoiceableProjectAmount, projectInvoicePath } from '@/lib/projects/invoice-path'
import { formatSEK } from '@/lib/format-price'
import type { ProjectEconomics } from '@/lib/projects/compute-economics'
import type { LonsamhetsVarning } from '@/lib/projects/margin-guardian'
import { svDateStr, svDateStrPlusDays, svStartOfDay } from '@/lib/dates'
import {
  findProjectsMissingTimeEntry,
  pickUnambiguousAssignee,
  type BookingForTimeMatch,
  type TimeEntryForTimeMatch,
} from '@/lib/egenkontroll/suggest-time-entry'

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
  /** P-<löpnummer> per företag (v176: trigger garanterar, unikt). */
  project_number: string | null
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
  // Etapp 4a.1: behövs för ProjectStageStrip på förstasidan
  current_workflow_stage_id?: string | null
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
  hourly_rate: number | null
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

type TabKey = 'overview' | 'team' | 'schedule' | 'milestones' | 'changes' | 'time' | 'material' | 'economy' | 'quote_spec' | 'documents' | 'log' | 'checklists' | 'arbetsorder' | 'leverantorer' | 'canvas' | 'field_reports' | 'tasks'

// Projektvy Fas 1 (2026-07-31) — ny IA: 16 gamla flikar grupperas i 6 nya.
// `canvas` hör inte till någon grupp (TD-75: dold, nås bara via ?tab=canvas,
// oförändrat). Se handoff/projektvy/HANDOFF.md.
type GroupKey = 'overview' | 'economy_offert' | 'changes' | 'planning' | 'tasks' | 'time_team' | 'documentation'

const NEW_GROUPS: { key: GroupKey; label: string; tabs: TabKey[] }[] = [
  { key: 'overview', label: 'Översikt', tabs: ['overview'] },
  { key: 'economy_offert', label: 'Ekonomi & offert', tabs: ['economy', 'quote_spec', 'material', 'leverantorer'] },
  { key: 'changes', label: 'ÄTA', tabs: ['changes'] },
  { key: 'planning', label: 'Planering', tabs: ['milestones', 'schedule', 'arbetsorder'] },
  // Uppgifter (2026-08-27): egen flik. Låg under Planering efter delmomenten —
  // ingen hittade den. Nås också från Översikt (ProjectTasksBlock).
  { key: 'tasks', label: 'Uppgifter', tabs: ['tasks'] },
  { key: 'time_team', label: 'Tid & team', tabs: ['time', 'team'] },
  { key: 'documentation', label: 'Dokumentation', tabs: ['checklists', 'field_reports', 'log', 'documents'] },
]

// Gammal flik-nyckel → ny grupp. Används både för att derivera activeGroup
// från ?tab=<gammal nyckel> och för att den befintliga setActiveTab-wrappern
// automatiskt ska öppna rätt grupp när gammal kod anropar setActiveTab('x').
const GROUP_OF_TAB: Record<TabKey, GroupKey | null> = {
  overview: 'overview',
  economy: 'economy_offert',
  quote_spec: 'economy_offert',
  material: 'economy_offert',
  leverantorer: 'economy_offert',
  changes: 'changes',
  milestones: 'planning',
  tasks: 'tasks',
  schedule: 'planning',
  arbetsorder: 'planning',
  time: 'time_team',
  team: 'time_team',
  checklists: 'documentation',
  field_reports: 'documentation',
  log: 'documentation',
  documents: 'documentation',
  canvas: null,
}

const ALL_TAB_KEYS: TabKey[] = ['overview', 'team', 'schedule', 'milestones', 'changes', 'time', 'material', 'economy', 'quote_spec', 'documents', 'log', 'checklists', 'arbetsorder', 'leverantorer', 'canvas', 'field_reports', 'tasks']

/** Läser ?tab=X — accepterar både gamla flik-nycklar och de nya
    grupp-nycklarna (Del 3b: deep-länkar ska fungera med båda). */
function readInitialTabAndGroup(): { tab: TabKey; group: GroupKey } {
  if (typeof window !== 'undefined') {
    const tabParam = new URLSearchParams(window.location.search).get('tab')
    if (tabParam) {
      const group = NEW_GROUPS.find(g => g.key === tabParam)
      if (group) return { tab: group.tabs[0], group: group.key }
      if ((ALL_TAB_KEYS as string[]).includes(tabParam)) {
        const tab = tabParam as TabKey
        return { tab, group: GROUP_OF_TAB[tab] || 'overview' }
      }
    }
  }
  return { tab: 'overview', group: 'overview' }
}

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
  supplier_invoice_id: string | null
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

const PROJECT_TYPE_LABELS: Record<string, string> = {
  hourly: 'Lopande',
  fixed_price: 'Fast pris',
  mixed: 'Blandat'
}

function formatCurrency(amount: number | null | undefined): string {
  return typeof amount === 'number' && Number.isFinite(amount)
    ? formatKronor(amount)
    : '—'
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('sv-SE')
}

function formatHours(hours: number): string {
  return hours.toFixed(2) + ' tim'
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

  // Canvas mrow-stil (DESIGN-NOTES §Accordion): ✓-cirkel teal fylld = klar,
  // teal-ring + fet text = pågår, grå ring = kommande. Högerställd
  // statuschip med datum. Funktionalitet (cycle/edit/delete/drag) orörd —
  // bara presentationen byts (Projektvy Fas 2, Del 2a).
  const chip =
    ms.status === 'completed'
      ? { cls: 'bg-green-100 text-green-700', text: ms.due_date ? `Klart ${formatDate(ms.due_date)}` : 'Klart' }
      : ms.status === 'in_progress'
        ? { cls: 'bg-primary-50 text-primary-700', text: ms.due_date ? formatDate(ms.due_date) : 'Pågående' }
        : { cls: 'bg-gray-100 text-gray-500', text: ms.due_date ? formatDate(ms.due_date) : 'Väntande' }

  return (
    <div ref={setNodeRef} style={style} className="p-4 hover:bg-gray-50 transition-all">
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
            <span className="w-6 h-6 rounded-full bg-primary-700 flex items-center justify-center">
              <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
            </span>
          ) : ms.status === 'in_progress' ? (
            <span className="w-6 h-6 rounded-full ring-2 ring-primary-600 flex items-center justify-center bg-white">
              <span className="w-2 h-2 rounded-full bg-primary-600" />
            </span>
          ) : (
            <span className="w-6 h-6 rounded-full ring-2 ring-gray-300 bg-white block" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className={`text-sm mb-0.5 ${
            ms.status === 'completed'
              ? 'text-gray-400 line-through font-medium'
              : ms.status === 'in_progress'
                ? 'text-gray-900 font-semibold'
                : 'text-gray-900 font-medium'
          }`}>
            {ms.name}
          </p>
          <div className="flex flex-wrap gap-3 text-xs text-gray-400">
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

        <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full whitespace-nowrap flex-shrink-0 ${chip.cls}`}>
          {chip.text}
        </span>

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
  const { openFilePreview } = useFilePreview()
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const business = useBusiness()
  const { can, user: currentUser, isOwnerOrAdmin } = useCurrentUser()
  const projectId = (params as any)?.id as string

  // Core data
  const [project, setProject] = useState<Project | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [changes, setChanges] = useState<Change[]>([])
  // TD-77 (2026-05-23): server strippar ÄTA-belopp för icke-see_financials.
  // Flagga sätts från response.prices_redacted, UI kan dölja pris-fält
  // i ÄTA-fliken (samma princip som AtaCard i Ekonomi-fliken).
  const [ataPricesRedacted, setAtaPricesRedacted] = useState(false)
  // Uppgifter kopplade till projektet (synk med /dashboard/tasks)
  type ProjectTaskRow = {
    id: string
    title: string
    description: string | null
    status: 'pending' | 'in_progress' | 'done'
    priority: 'low' | 'medium' | 'high'
    due_date: string | null
    due_time: string | null
    assigned_to: string | null
    assigned_user: { id: string; name: string; color: string } | null
  }
  const [projectTasks, setProjectTasks] = useState<ProjectTaskRow[]>([])
  const [taskScope, setTaskScope] = useState<'all' | 'own'>('all')
  const [larsTips, setLarsTips] = useState<LarsTip[]>([])
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDescription, setNewTaskDescription] = useState('')
  const [newTaskAssignee, setNewTaskAssignee] = useState('')
  const [newTaskDueDate, setNewTaskDueDate] = useState(() => new Date().toISOString().split('T')[0])
  const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [savingNewTask, setSavingNewTask] = useState(false)
  const [showTaskPresetPicker, setShowTaskPresetPicker] = useState(false)
  // "Ny uppgift"-snabbåtgärden fokuserar blockets fält på Översikt.
  const [nyUppgiftFokus, setNyUppgiftFokus] = useState(0)
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [materials, setMaterials] = useState<ProjectMaterial[]>([])
  const [materialSummary, setMaterialSummary] = useState<MaterialSummary | null>(null)
  // Att tänka på — Customer Facts V1 (injektionspunkt 2, 2026-08-12).
  const [projectCustomerFacts, setProjectCustomerFacts] = useState<Array<{
    id: string
    fact_type: 'preference' | 'constraint' | 'commitment' | 'contact'
    content: string
  }>>([])
  const [showProductSearch, setShowProductSearch] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<{ quantity: number; markup_percent: number }>({ quantity: 1, markup_percent: 20 })
  const [projectPriceList, setProjectPriceList] = useState<Array<{ id: string; name: string; unit: string; unit_price: number; default_quantity: number; category: string }>>([])

  // Team state
  const [projectTeam, setProjectTeam] = useState<ProjectAssignment[]>([])
  const [allTeamMembers, setAllTeamMembers] = useState<TeamMemberOption[]>([])
  const [assignLoading, setAssignLoading] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)
  // Multi-select: valda medlemmar + ev. utsedd ansvarig
  const [pickerSelectedIds, setPickerSelectedIds] = useState<Set<string>>(new Set())
  const [pickerLeadId, setPickerLeadId] = useState<string | null>(null)

  // Schedule state
  const [projectSchedule, setProjectSchedule] = useState<ScheduleEntry[]>([])

  // DEL 3-5: Documents, Logs, Checklists
  const [documents, setDocuments] = useState<any[]>([])
  const [docCategory, setDocCategory] = useState('all')
  const [uploading, setUploading] = useState(false)
  const [generatedDocs, setGeneratedDocs] = useState<any[]>([])
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

  // UI state
  const [loading, setLoading] = useState(true)
  // Initialisera activeTab/activeGroup från ?tab=X — gör att deep-länkar
  // (t.ex. dashboardens "Att göra"-lista) öppnar rätt flik-grupp direkt utan
  // flicker. Fas 1 (2026-07-31): activeTab finns kvar (canvas + lazy-fetch-
  // effekter beror på den), activeGroup styr den nya 6-grupps-navigationen.
  const [activeTab, setActiveTabRaw] = useState<TabKey>(() => readInitialTabAndGroup().tab)
  const [activeGroup, setActiveGroup] = useState<GroupKey>(() => readInitialTabAndGroup().group)
  // Wrapper: alla befintliga setActiveTab('x')-anrop i filen (quick actions,
  // "Hantera"-länkar, EkonomiPulsCard.onOpenFull m.fl.) öppnar nu automatiskt
  // rätt ny flik-grupp också — inget anropsställe behövde ändras.
  const setActiveTab = useCallback((tab: TabKey) => {
    setActiveTabRaw(tab)
    const group = GROUP_OF_TAB[tab]
    if (group) setActiveGroup(group)
  }, [])
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  // Etapp 4a.1: klick på fas-strip öppnar modal med byt-stage + tasks
  const [stageModalOpen, setStageModalOpen] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  // Modals
  const [milestoneModal, setMilestoneModal] = useState<{ open: boolean; editing: Milestone | null }>({ open: false, editing: null })
  const [changeModal, setChangeModal] = useState<{ open: boolean; editing: Change | null }>({ open: false, editing: null })
  // Räknare som triggar ProjectEconomicsCard att refetcha när något
  // utanför komponenten ändras (status, milestones, tid). Ersätter
  // tidigare setEconomicsRefreshKey(k => k + 1)-mönster.
  const [economicsRefreshKey, setEconomicsRefreshKey] = useState(0)
  // Vilken ÄTA som just nu skickas (öppnar SendAtaDialog)
  const [sendAtaId, setSendAtaId] = useState<string | null>(null)
  const [expandedAtaId, setExpandedAtaId] = useState<string | null>(null)

  // Projektvy Fas 1 (2026-07-31): statuskortets ekonomistaplar/prognosrad
  // delar samma /api/projects/[id]/profitability-payload som EkonomiPulsCard
  // — hämtas här en gång (parent) så både ProjectStatusCard och läges-
  // logiken i "Att göra" kan använda samma data utan dubbel-fetch.
  // Ägar-gating: hämtas bara om can('see_financials').
  const [statusEconomics, setStatusEconomics] = useState<ProjectEconomics | null>(null)
  const [statusEconomicsLoading, setStatusEconomicsLoading] = useState(true)
  // Kvittoprincipen Fall 2 (docs/design/SYNLIG-INTELLIGENS.md, 2026-08-13):
  // samma /api/projects/[id]/profitability-svar bär nu även Guardians
  // live-bedömning — en kanonisk källa, inget separat anrop.
  const [guardianVarning, setGuardianVarning] = useState<LonsamhetsVarning | null>(null)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  // Etapp D1 (2026-08-17): godkännandekortens antal, rapporterat upp från
  // ProjectTodoBlock (samma räkning som dess badge) så twin-stripens
  // "Nästa steg"-kort kan visa "X förslag väntar" utan egen hämtning.
  const [projectApprovalsCount, setProjectApprovalsCount] = useState(0)

  // Work orders
  const [workOrders, setWorkOrders] = useState<any[]>([])
  const [woModal, setWoModal] = useState<{ open: boolean; editing: any | null }>({ open: false, editing: null })
  const [woDetail, setWoDetail] = useState<any | null>(null)
  const [woSending, setWoSending] = useState<string | null>(null)

  // Supplier invoices
  const [supplierInvoices, setSupplierInvoices] = useState<any[]>([])
  const [siModal, setSiModal] = useState<{ open: boolean; editing: any | null }>({ open: false, editing: null })

  // Kundfakturor kopplade till projektet (Fakturor-panelen, canvas desktop-
  // frame 2). Ägar-gated — hämtas bara i economy_offert-gruppens effekt.
  const [projectInvoices, setProjectInvoices] = useState<{
    invoice_id: string
    invoice_number: string | null
    status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | 'credited'
    total: number | null
    invoice_date: string | null
    paid_at: string | null
    due_date: string | null
  }[]>([])

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

  // "Ingen tidrapport i går" (Etapp 2b, tasks/easoft-gap-plan.md) — körs
  // LIVE mot gårdagens bokning/tidrapport-data för DETTA projekt (inte
  // bara läst ur en redan skapad pending_approval, se fetchYesterdayTimeGap
  // nedan). personName kommer från samma entydig-tilldelning-logik som
  // Etapp 2a (pickUnambiguousAssignee) — null om 0 eller 2+ tilldelade.
  const [yesterdayTimeGap, setYesterdayTimeGap] = useState<{ missing: boolean; personName: string | null } | null>(null)
  // Dedup (Etapp 2b, punkt 4): sant om ett 'tidrapport_forslag'-kort redan
  // syns i ProjectApprovalsBlock för samma projekt+dag — då hoppas raden
  // över, länken i kortet räcker.
  const [hasPendingTimeApproval, setHasPendingTimeApproval] = useState(false)

  // Saving states
  const [savingStatus, setSavingStatus] = useState(false)
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [showCloseoutModal, setShowCloseoutModal] = useState(false)
  const [closeoutWarnings, setCloseoutWarnings] = useState<string[]>([])

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

      const response = await fetch('/api/time-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entryData),
      })
      const result = await response.json().catch(() => ({ error: 'Kunde inte registrera tiden' }))
      if (!response.ok) throw new Error(result.error || 'Kunde inte registrera tiden')
      showToast('Tid registrerad!', 'success')
      setShowTimeModal(false)
      try {
        await fetchProjectData(true)
        setEconomicsRefreshKey(k => k + 1)
      } catch {
        showToast('Tiden är sparad, men projektvyn kunde inte uppdateras. Ladda om sidan.', 'error')
      }
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

  const projectReadVersion = useRef(0)
  const fetchProjectData = useCallback(async (preserveOnError = false) => {
    const version = ++projectReadVersion.current
    try {
      const res = await fetch(`/api/projects/${projectId}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Not found')
      const data = await res.json()
      if (version !== projectReadVersion.current) return
      setProject(data.project)
      setQuote(data.quote)
      setMilestones(data.milestones)
      setChanges(data.changes)
      // TD-77: server strippar ÄTA-belopp för icke-see_financials.
      // Flagga propageras till UI så pris-kolumner kan döljas.
      setAtaPricesRedacted(data.prices_redacted === true)
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
      if (version !== projectReadVersion.current) return
      if (preserveOnError) throw new Error('Projektet kunde inte läsas om.')
      setProject(null)
    } finally {
      if (version === projectReadVersion.current) setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchProjectData()
  }, [fetchProjectData])

  // Att tänka på — Customer Facts V1 (injektionspunkt 2, 2026-08-12): samma
  // läs-API som kundkortet (/api/customers/[id]/facts). Fail-safe: fel eller
  // saknad kund ger tom lista, sektionen renderas då inte alls.
  useEffect(() => {
    const customerId = project?.customer?.customer_id
    if (!customerId) {
      setProjectCustomerFacts([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/customers/${customerId}/facts`)
        if (!res.ok) {
          if (!cancelled) setProjectCustomerFacts([])
          return
        }
        const data = await res.json()
        if (!cancelled) setProjectCustomerFacts(data.facts || [])
      } catch {
        if (!cancelled) setProjectCustomerFacts([])
      }
    })()
    return () => { cancelled = true }
  }, [project?.customer?.customer_id])

  // Livscykel-chipen i sidhuvudet (Statusbandet, 2026-08-26) härleds ur
  // fakturafakta — hämta fakturorna direkt, inte först när Ekonomi-fliken
  // öppnas. Samma endpoint, bara tidigare.
  useEffect(() => {
    if (!projectId) return
    fetchProjectInvoices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    // Projektvy Fas 1: economy/quote_spec/material/leverantorer är nu grupperade
    // under "Ekonomi & offert" och renderas staplade — en gemensam grupp-check
    // ersätter de fyra separata activeTab===-villkoren (economy + leverantorer
    // delade ändå samma fetchSupplierInvoices-anrop).
    if (activeGroup === 'economy_offert' && can('see_financials')) {
      // ProjectEconomicsCard hämtar /api/projects/[id]/profitability själv.
      // Icke-ägare ser bara offert-specen i denna grupp — inga ekonomihämtningar.
      fetchSupplierInvoices()
      fetchProjectInvoices()
      if (projectPriceList.length === 0) {
        // B1 (Prisslingan V2): kanoniska products via API:t (samma väg som
        // offertens snabbval) — price_list var tom sedan dag ett, så
        // snabbvalen har aldrig visats här. Prislösa filtreras (blir annars
        // 0 kr-material). default_quantity fanns bara på price_list → 1.
        fetch('/api/products')
          .then(r => (r.ok ? r.json() : { products: [] }))
          .then((d: any) => {
            const rader = (d.products || [])
              .filter((p: any) => Number(p.sales_price) > 0)
              .map((p: any) => ({
                id: p.id,
                name: p.name,
                unit: p.unit,
                unit_price: Number(p.sales_price),
                default_quantity: 1,
                category: p.category,
              }))
            if (rader.length) setProjectPriceList(rader)
          })
          .catch(() => {})
      }
    }
  }, [activeGroup])

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

  // "Ingen tidrapport i går" (Etapp 2b) — samma matchningskärna som cronen
  // (lib/egenkontroll/suggest-time-entry.ts findProjectsMissingTimeEntry),
  // körd LIVE mot gårdagens bokning/tidrapport-data för bara DETTA
  // projekt, så raden är korrekt även om dagens cron-körning inte hunnit
  // köra än. Fail-safe: fel här döljer bara raden, kraschar aldrig sidan.
  const fetchYesterdayTimeGap = useCallback(async () => {
    if (!business?.business_id || !projectId) return
    try {
      const yesterday = svDateStrPlusDays(-1)
      const today = svDateStr()
      const rangeStart = svStartOfDay(new Date(`${yesterday}T12:00:00Z`))
      const rangeEnd = svStartOfDay(new Date(`${today}T12:00:00Z`))

      const [bookingsRes, entriesRes, approvalsRes] = await Promise.all([
        supabase
          .from('booking')
          .select('booking_id, project_id, job_status, scheduled_start, scheduled_end')
          .eq('business_id', business.business_id)
          .eq('project_id', projectId)
          .eq('job_status', 'completed')
          .gte('scheduled_start', rangeStart.toISOString())
          .lt('scheduled_start', rangeEnd.toISOString()),
        supabase
          .from('time_entry')
          .select('project_id')
          .eq('business_id', business.business_id)
          .eq('project_id', projectId)
          .eq('work_date', yesterday),
        // Dedup-underlag (punkt 4): finns redan ett pending tidrapport_forslag-
        // kort för samma projekt+dag i ProjectApprovalsBlock?
        supabase
          .from('pending_approvals')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', business.business_id)
          .eq('approval_type', 'tidrapport_forslag')
          .eq('status', 'pending')
          .contains('payload', { project_id: projectId, booking_date: yesterday }),
      ])

      setHasPendingTimeApproval(!!approvalsRes.count && approvalsRes.count > 0)

      const missing = findProjectsMissingTimeEntry(
        (bookingsRes.data || []) as BookingForTimeMatch[],
        (entriesRes.data || []) as TimeEntryForTimeMatch[],
        yesterday,
      )
      if (missing.length === 0) {
        setYesterdayTimeGap({ missing: false, personName: null })
        return
      }

      // Entydig tilldelning? Samma ärlighetsregel/funktion som Etapp 2a
      // (pickUnambiguousAssignee) — ett namn ENDAST om project_assignment
      // har exakt en rad för projektet, annars null.
      const { data: assignments } = await supabase
        .from('project_assignment')
        .select('business_user:business_user_id (name)')
        .eq('business_id', business.business_id)
        .eq('project_id', projectId)

      const personName = pickUnambiguousAssignee(
        ((assignments || []) as { business_user: { name: string | null } | null }[]).map(row => ({
          name: row.business_user?.name ?? null,
        })),
      )

      setYesterdayTimeGap({ missing: true, personName })
    } catch {
      setYesterdayTimeGap(null)
    }
  }, [business?.business_id, projectId])

  useEffect(() => {
    fetchYesterdayTimeGap()
  }, [fetchYesterdayTimeGap])

  const fetchProjectTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks?project_id=${projectId}`)
      if (res.ok) {
        const data = await res.json()
        setProjectTasks(data.tasks || [])
        setTaskScope(data.scope === 'own' ? 'own' : 'all')
        // Lars tipsar — räknas ur samma data, fel visar inget (aldrig ett påhittat tips).
        try {
          const tr = await fetch(`/api/projects/${projectId}/tips`)
          if (tr.ok) { const tj = await tr.json(); setLarsTips(tj.tips || []) } else setLarsTips([])
        } catch { setLarsTips([]) }
      }
    } catch { /* ignore */ }
  }, [projectId])

  useEffect(() => {
    // Projektvy Fas 1: grupp-check istället för exakt gammal flik-nyckel,
    // eftersom "Planering" (schema/uppgifter/arbetsorder/delmoment) och
    // "Tid & team" (tid/team) och "Dokumentation" (checklistor/fältrapporter/
    // logg/dokument) nu renderar sina gamla flikars innehåll staplat.
    if (activeGroup === 'time_team') {
      fetchProjectTeam()
    }
    if (activeGroup === 'planning') {
      fetchProjectSchedule()
      fetchWorkOrders()
    }
    // Uppgifter behövs på Översikt (blocket), i egna fliken och för räknaren i flikraden.
    if (activeGroup === 'overview' || activeGroup === 'tasks') {
      fetchProjectTasks()
      // Återanvänd team-listan om vi inte redan hämtat den (för assignee-dropdown)
      if (allTeamMembers.length === 0) fetchProjectTeam()
    }
    if (activeGroup === 'documentation') {
      fetchDocuments()
      fetchGeneratedDocs()
      fetchChecklists()
      fetchChecklistTemplates()
      fetchFormSubmissions()
      fetchFormTemplates()
    }
  }, [activeGroup, fetchProjectTeam, fetchProjectTasks, allTeamMembers.length])

  // Re-fetch documents when category filter changes
  useEffect(() => {
    if (activeGroup === 'documentation') {
      fetchDocuments()
    }
  }, [docCategory])

  // Statuskortets ekonomidata — ägar-gated, delas mellan ProjectStatusCard
  // och läges-avgöringen i "Att göra" (se render-sektionen längre ned).
  useEffect(() => {
    if (!can('see_financials')) {
      setStatusEconomicsLoading(false)
      return
    }
    let cancelled = false
    setStatusEconomicsLoading(true)
    fetch(`/api/projects/${projectId}/profitability`)
      .then(res => (res.ok ? res.json() : null))
      .then((data: (ProjectEconomics & { guardian?: LonsamhetsVarning | null }) | null) => {
        if (cancelled) return
        setStatusEconomics(data)
        setGuardianVarning(data?.guardian ?? null)
      })
      .catch(() => { if (!cancelled) { setStatusEconomics(null); setGuardianVarning(null) } })
      .finally(() => { if (!cancelled) setStatusEconomicsLoading(false) })
    return () => { cancelled = true }
  }, [projectId, economicsRefreshKey, can])

  async function createProjectTask() {
    if (!newTaskTitle.trim()) return
    setSavingNewTask(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          description: newTaskDescription.trim() || null,
          priority: newTaskPriority,
          project_id: projectId,
          assigned_to: newTaskAssignee || null,
          due_date: newTaskDueDate || null,
          visibility: 'project',
        }),
      })
      if (res.ok) {
        setNewTaskTitle('')
        setNewTaskDescription('')
        setNewTaskAssignee('')
        setNewTaskPriority('medium')
        // Återställ till idag så nästa task får default-datumet på nytt
        setNewTaskDueDate(new Date().toISOString().split('T')[0])
        fetchProjectTasks()
      } else {
        showToast('Kunde inte skapa uppgift', 'error')
      }
    } catch {
      showToast('Något gick fel', 'error')
    }
    setSavingNewTask(false)
  }

  async function toggleProjectTask(taskId: string, currentStatus: string) {
    const newStatus = currentStatus === 'done' ? 'pending' : 'done'
    try {
      const res = await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, status: newStatus }),
      })
      if (res.ok) fetchProjectTasks()
    } catch { /* ignore */ }
  }

  async function deleteProjectTask(taskId: string) {
    if (!confirm('Ta bort uppgiften?')) return
    try {
      const res = await fetch(`/api/tasks?id=${taskId}`, { method: 'DELETE' })
      if (res.ok) fetchProjectTasks()
    } catch { /* ignore */ }
  }

  async function createProjectTaskBatch(tasks: import('@/components/TaskPresetPicker').PickedTask[]) {
    if (tasks.length === 0) return
    try {
      const res = await fetch('/api/tasks/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tasks,
          defaults: {
            project_id: projectId,
            visibility: 'project',
          },
        }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      const count = (data.created || []).length
      fetchProjectTasks()
      showToast(`${count} ${count === 1 ? 'uppgift' : 'uppgifter'} skapad${count === 1 ? '' : 'a'}`, 'success')
    } catch {
      showToast('Kunde inte skapa uppgifter', 'error')
    }
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

  const fetchProjectInvoices = async () => {
    try {
      // GET /api/invoices kräver see_financials server-side — anropas bara
      // från den ägar-gatade economy_offert-effekten.
      const res = await fetch(`/api/invoices?projectId=${projectId}&sortBy=invoice_date&sortOrder=asc`)
      if (res.ok) {
        const data = await res.json()
        setProjectInvoices(data.invoices || data || [])
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
      if (!res.ok) {
        // Surface server's faktiska felmeddelande så vi inte tappar diagnostik.
        const errData = await res.json().catch(() => ({} as any))
        const msg = errData?.error || `HTTP ${res.status}`
        console.error('[upload-doc] projekt-upload misslyckades:', msg, errData)
        throw new Error(msg)
      }
      showToast('Dokument uppladdat!', 'success')
      fetchDocuments()
      // Reset input så samma fil kan laddas upp igen om något gick snett
      e.target.value = ''
    } catch (err: any) {
      showToast(err?.message || 'Kunde inte ladda upp fil', 'error')
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

  const handleDocOpen = (doc: any) => {
    openFilePreview({
      name: doc.name || 'Dokument',
      mimeType: doc.mime_type,
      inlineUrl: `/api/projects/${projectId}/documents/${doc.id}?view=inline`,
      downloadUrl: `/api/projects/${projectId}/documents/${doc.id}?view=download`,
    })
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

  const handleAssignBatch = async (memberIds: string[], leadId: string | null) => {
    if (memberIds.length === 0) return
    setAssignLoading(true)
    try {
      // Skapa alla tilldelningar parallellt
      const results = await Promise.allSettled(
        memberIds.map(id =>
          fetch(`/api/projects/${projectId}/team`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ businessUserId: id, role: id === leadId ? 'lead' : 'member' }),
          }).then(r => { if (!r.ok) throw new Error(); return r })
        )
      )
      const ok = results.filter(r => r.status === 'fulfilled').length
      const failed = memberIds.length - ok
      if (failed > 0) showToast(`${ok} tillagda, ${failed} misslyckades`, 'error')
      else showToast(`${ok} ${ok === 1 ? 'medlem tillagd' : 'medlemmar tillagda'}`, 'success')
      setShowAddMember(false)
      fetchProjectTeam()
    } catch (err: any) {
      showToast(err.message || 'Kunde inte tilldela', 'error')
    } finally {
      setAssignLoading(false)
    }
  }

  const handleSetLead = async (businessUserId: string, makeLeader: boolean) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/team`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessUserId, role: makeLeader ? 'lead' : 'member' }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Kunde inte uppdatera roll')
      }
      showToast(makeLeader ? 'Markerad som ansvarig' : 'Roll borttagen', 'success')
      fetchProjectTeam()
    } catch (err: any) {
      showToast(err.message || 'Kunde inte uppdatera', 'error')
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

    // Optimistic UI — uppdatera status omedelbart så användaren ser feedback
    const prevStatus = project.status
    setProject({ ...project, status: newStatus })

    try {
      const res = await fetch('/api/projects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.project_id, status: n…41640 tokens truncated…lassName={inputCls}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-500 mb-2 block">Budgetbelopp (kr, exkl. moms)</label>
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

// ÄTA-modalen bor i components/projects/ata/ChangeModal.tsx (2026-09-02).

// Dagboksmodalen bor i components/projects/diary/DiaryEntryModal.tsx (2026-09-02).

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

/**
 * Länk-/avlänkningsaffordans mellan en project_material-rad och den
 * supplier_invoices-rad kostnaden faktiskt hör till (Etapp 1 leverantörs-
 * fakturor). Egen lokal state — rör INTE editingMaterial/editValues, som
 * äger kvantitet/påslag-redigeringen.
 */
function MaterialInvoiceLink({
  materialId,
  projectId,
  currentInvoiceId,
  invoices,
  onLinked,
}: {
  materialId: string
  projectId: string
  currentInvoiceId: string | null
  invoices: any[]
  onLinked: () => void
}) {
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)

  const linked = invoices.find(inv => inv.id === currentInvoiceId)

  const save = async (invoiceId: string | null) => {
    setSaving(true)
    try {
      await fetch(`/api/projects/${projectId}/materials`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ material_id: materialId, supplier_invoice_id: invoiceId }),
      })
      onLinked()
    } finally {
      setSaving(false)
      setPicking(false)
    }
  }

  if (linked) {
    return (
      <button
        onClick={() => save(null)}
        disabled={saving}
        className="text-xs text-primary-700 hover:text-primary-800 underline underline-offset-2 disabled:opacity-50"
        title="Klicka för att avlänka"
      >
        {linked.supplier_name} · {linked.invoice_number || 'utan nr'}
      </button>
    )
  }

  if (picking) {
    return (
      <select
        autoFocus
        disabled={saving}
        onChange={e => { if (e.target.value) save(e.target.value) }}
        onBlur={() => setPicking(false)}
        className="text-xs bg-gray-50 border border-[#E2E8F0] rounded px-1 py-0.5"
      >
        <option value="">Välj faktura…</option>
        {invoices.map(inv => (
          <option key={inv.id} value={inv.id}>
            {inv.supplier_name} · {inv.invoice_number || 'utan nr'} · {inv.total_amount} kr
          </option>
        ))}
      </select>
    )
  }

  return (
    <button
      onClick={() => setPicking(true)}
      className="text-xs text-gray-400 hover:text-primary-700 underline underline-offset-2"
    >
      Koppla faktura
    </button>
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
  const [subcontractorId, setSubcontractorId] = useState<string>(editing?.subcontractor_id || '')
  const [subcontractors, setSubcontractors] = useState<any[]>([])

  useEffect(() => {
    // Fail-soft: /api/subcontractors är feature-gated ('subcontractors'-
    // planfunktionen) — ett konto utan den ska bara se fritext-fältet,
    // aldrig ett fel. 403/nätverksfel lämnar bara listan tom.
    fetch('/api/subcontractors?status=active')
      .then(r => (r.ok ? r.json() : { subcontractors: [] }))
      .then(d => setSubcontractors(d.subcontractors || []))
      .catch(() => setSubcontractors([]))
  }, [])

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
        subcontractor_id: subcontractorId || null,
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

          {subcontractors.length > 0 && (
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Underentreprenör (valfritt)</label>
              <select
                value={subcontractorId}
                onChange={e => {
                  setSubcontractorId(e.target.value)
                  const chosen = subcontractors.find(s => s.subcontractor_id === e.target.value)
                  if (chosen) setSupplierName(chosen.name)
                }}
                className={inputCls}
              >
                <option value="">Ingen — fritext ovan</option>
                {subcontractors.map(s => (
                  <option key={s.subcontractor_id} value={s.subcontractor_id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

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
                {formatKronor(total)}
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
                  → {formatKronor(customerPrice)} till kund
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
                  ? 'bg-primary-50 border-primary-300 ring-1 ring-primary-300'
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
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary-700 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
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

  const inputCls = 'w-full px-3 py-2.5 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-primary-400'

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-primary-700 hover:text-primary-800"
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
                ? 'bg-primary-100 text-primary-700'
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
              <div className="h-full bg-primary-500 rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
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
                    className="w-4 h-4 mt-0.5 rounded border-gray-300 text-primary-700 focus:ring-primary-500"
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
                    <label className="flex items-center gap-2 px-4 py-3 bg-gray-50 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-primary-400 transition">
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
                          className="text-xs text-primary-700 hover:text-primary-800 ml-auto"
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
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-700 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
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
            className="flex items-center gap-1 text-xs text-primary-700 hover:text-primary-800"
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
                  onClick={async () => {
                    let url = `${window.location.origin}/sign/report/${r.signature_token}`
                    if (customerId) {
                      try {
                        const res = await fetch(`/api/portal/link?customer_id=${customerId}&tab=reports`)
                        if (res.ok) {
                          const { url: portalUrl } = await res.json()
                          if (portalUrl) url = portalUrl
                        }
                      } catch { /* fallback ovan */ }
                    }
                    navigator.clipboard.writeText(url)
                  }}
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
