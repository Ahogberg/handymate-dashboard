'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  FolderKanban,
  Plus,
  Filter,
  X,
  Loader2,
  Bot,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  GripVertical,
  ExternalLink,
  FileText,
  XCircle,
  Undo2,
  Search,
  User,
  Phone,
  Mail,
  Clock,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Edit3,
  Save,
  Sparkles,
  Settings,
  Trash2,
  MoveUp,
  MoveDown,
  Upload,
  MapPin,
  File as FileIcon,
  Image as ImageIcon,
  Download,
  CheckSquare,
  StickyNote,
  Tag,
  Calendar,
  MessageSquare,
  Target,
  Lightbulb,
  Zap,
  BarChart3,
  Pencil,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { SCORE_FACTOR_LABELS, getTemperatureLabel, getTemperatureColor, LOSS_REASONS } from '@/lib/lead-scoring'
import { TimelineView } from '@/components/pipeline/TimelineView'

const ProjectCanvas = dynamic(() => import('@/components/project/ProjectCanvas'), {
  loading: () => (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
    </div>
  ),
  ssr: false,
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Stage {
  id: string
  name: string
  slug: string
  color: string
  sort_order: number
  is_system: boolean
  is_won: boolean
  is_lost: boolean
}

interface Deal {
  id: string
  title: string
  description: string | null
  value: number | null
  stage_id: string
  priority: string
  customer_id: string | null
  quote_id: string | null
  invoice_id: string | null
  source: string | null
  source_call_id: string | null
  lead_source_platform: string | null
  lead_temperature: string | null
  lead_score: number | null
  lead_score_factors: Record<string, number> | null
  lead_reasoning: string | null
  suggested_action: string | null
  estimated_value: number | null
  first_response_at: string | null
  response_time_seconds: number | null
  loss_reason: string | null
  loss_reason_detail: string | null
  assigned_to: string | null
  created_at: string
  updated_at: string
  customer?: {
    customer_id: string
    name: string
    phone_number: string
    email: string
    address_line: string | null
    customer_type?: string
    org_number?: string
    contact_person?: string
    personal_number?: string
    customer_number?: string
  } | null
}

interface CustomerDocument {
  id: string
  file_name: string
  file_url: string
  file_type: string | null
  file_size: number | null
  category: string
  uploaded_at: string
}

interface Task {
  id: string
  title: string
  description: string | null
  status: 'pending' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  due_time: string | null
  customer_id: string | null
  deal_id: string | null
  project_id: string | null
  assigned_to: string | null
  assigned_user: { id: string; name: string; color: string } | null
  completed_at: string | null
  created_by: string | null
  created_at: string
}

interface TaskActivity {
  id: string
  task_id: string
  actor: string | null
  action: string
  description: string
  old_value: string | null
  new_value: string | null
  created_at: string
}

interface TeamMember {
  id: string
  name: string
  color: string
  role: string
}

interface DealNote {
  id: string
  deal_id: string
  content: string
  created_by: string | null
  created_at: string
  updated_at: string
}

interface CustomerTag {
  name: string
  color: string
}

interface Activity {
  id: string
  deal_id: string
  activity_type: string
  description: string | null
  from_stage_name?: string
  to_stage_name?: string
  triggered_by: string
  ai_confidence: number | null
  ai_reason: string | null
  undone_at: string | null
  created_at: string
  deal_title?: string
}

interface PipelineStats {
  totalDeals: number
  totalValue: number
  wonValue: number
  newLeadsToday: number
  needsFollowUp: number
}

interface Toast {
  show: boolean
  message: string
  type: 'success' | 'error' | 'info'
}

interface CustomerOption {
  customer_id: string
  name: string
  phone_number: string
  email: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatValue(v: number | null | undefined): string {
  if (v == null || v === 0) return '0 kr'
  return `${v.toLocaleString('sv-SE')} kr`
}

function formatValueCompact(v: number | null | undefined): string {
  if (v == null || v === 0) return '0 kr'
  if (v >= 1000000) return `${(v / 1000000).toFixed(1).replace('.0', '')}M kr`
  if (v >= 1000) return `${Math.round(v / 1000)}k kr`
  return `${v} kr`
}

function formatColumnValue(v: number): string {
  if (v === 0) return '0 kr'
  if (v >= 1000000) return `${(v / 1000000).toFixed(1).replace('.0', '')}M kr`
  if (v >= 1000) return `${Math.round(v / 1000)}k kr`
  return `${v} kr`
}

function timeAgo(date: string): string {
  const now = new Date()
  const d = new Date(date)
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  const diffWeek = Math.floor(diffDay / 7)

  if (diffMin < 1) return 'just nu'
  if (diffMin < 60) return `${diffMin} min`
  if (diffHour < 24) return `${diffHour}h`
  if (diffDay < 7) return `${diffDay}d`
  if (diffWeek < 5) return `${diffWeek}v`
  return `${Math.floor(diffDay / 30)} mån`
}

function getPriorityDot(p: string): string {
  switch (p) {
    case 'urgent': return 'bg-red-500'
    case 'high': return 'bg-orange-500'
    case 'medium': return 'bg-yellow-400'
    case 'low': return 'bg-green-400'
    default: return 'bg-gray-300'
  }
}

function getPriorityLabel(p: string): string {
  switch (p) {
    case 'urgent': return 'Brådskande'
    case 'high': return 'Hög'
    case 'medium': return 'Medium'
    case 'low': return 'Låg'
    default: return 'Låg'
  }
}

function getPriorityBadgeStyle(p: string): string {
  switch (p) {
    case 'urgent': return 'bg-red-100 text-red-600 border-red-200'
    case 'high': return 'bg-orange-100 text-orange-600 border-orange-200'
    case 'medium': return 'bg-yellow-100 text-yellow-600 border-yellow-200'
    case 'low': return 'bg-gray-100 text-gray-500 border-gray-200'
    default: return 'bg-gray-100 text-gray-500 border-gray-200'
  }
}

function getTriggeredByLabel(t: string): string {
  switch (t) {
    case 'ai': return 'AI'
    case 'user': return 'Användare'
    case 'system': return 'System'
    default: return t
  }
}

function getTriggeredByStyle(t: string): string {
  switch (t) {
    case 'ai': return 'bg-teal-100 text-sky-700 border-teal-200'
    case 'user': return 'bg-gray-100 text-gray-600 border-gray-200'
    case 'system': return 'bg-gray-100 text-gray-500 border-gray-200'
    default: return 'bg-gray-100 text-gray-500 border-gray-200'
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function PipelinePage() {
  const business = useBusiness()

  const [stages, setStages] = useState<Stage[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [stats, setStats] = useState<PipelineStats | null>(null)
  const [aiActivities, setAiActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  const [draggingDealId, setDraggingDealId] = useState<string | null>(null)
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null)

  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)
  const [detailActivities, setDetailActivities] = useState<Activity[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')
  const [editingValue, setEditingValue] = useState(false)
  const [editValueInput, setEditValueInput] = useState('')
  const [editingPriority, setEditingPriority] = useState(false)
  const [dealTab, setDealTab] = useState<'general' | 'tasks' | 'documents' | 'messages' | 'canvas'>('general')

  // Loss reason modal
  const [showLossModal, setShowLossModal] = useState(false)
  const [lossDealId, setLossDealId] = useState<string | null>(null)
  const [lossReason, setLossReason] = useState('')
  const [lossReasonDetail, setLossReasonDetail] = useState('')

  // Quick actions
  function handleQuickSms(deal: Deal) {
    if (!deal.customer?.phone_number) return
    setQuickSmsTarget({ dealId: deal.id, name: deal.customer.name || 'Kund', phone: deal.customer.phone_number })
    setQuickSmsText('')
  }

  function handleOpenTasks(deal: Deal) {
    // Öppna deal-detaljen direkt (som har uppgifter, anteckningar etc.)
    openDealDetail(deal)
  }

  // Quick SMS modal
  const [quickSmsTarget, setQuickSmsTarget] = useState<{ dealId: string; name: string; phone: string } | null>(null)
  const [quickSmsText, setQuickSmsText] = useState('')
  const [quickSmsSending, setQuickSmsSending] = useState(false)

  async function sendQuickSms() {
    if (!quickSmsTarget || !quickSmsText.trim()) return
    setQuickSmsSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/sms/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ to: quickSmsTarget.phone, message: quickSmsText }),
      })
      showToast(`SMS skickat till ${quickSmsTarget.name}`, 'success')
      setQuickSmsTarget(null)
      setQuickSmsText('')
    } catch {
      showToast('Kunde inte skicka SMS', 'error')
    } finally {
      setQuickSmsSending(false)
    }
  }

  // Deal documents
  const [dealDocuments, setDealDocuments] = useState<CustomerDocument[]>([])
  const [dealUploading, setDealUploading] = useState(false)
  const [dealUploadCategory, setDealUploadCategory] = useState('other')

  // Deal notes
  const [dealNotes, setDealNotes] = useState<DealNote[]>([])
  const [newNoteContent, setNewNoteContent] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editNoteContent, setEditNoteContent] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)

  // Deal emails (Gmail)
  const [dealEmailThreads, setDealEmailThreads] = useState<{ threadId: string; subject: string; snippet: string; from: string; to: string; date: string; messageCount: number; isUnread: boolean }[]>([])
  const [dealEmailLoading, setDealEmailLoading] = useState(false)
  const [dealExpandedThread, setDealExpandedThread] = useState<string | null>(null)
  const [dealThreadMessages, setDealThreadMessages] = useState<Record<string, { messageId: string; from: string; date: string; bodyText: string | null; snippet: string }[]>>({})
  const [dealThreadLoading, setDealThreadLoading] = useState(false)

  // Deal tasks
  const [dealTasks, setDealTasks] = useState<Task[]>([])
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDueDate, setNewTaskDueDate] = useState('')
  const [newTaskDueTime, setNewTaskDueTime] = useState('')
  const [newTaskAssignee, setNewTaskAssignee] = useState('')
  const [taskSaving, setTaskSaving] = useState(false)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [taskActivities, setTaskActivities] = useState<TaskActivity[]>([])

  // Link customer to deal
  const [linkCustomerSearch, setLinkCustomerSearch] = useState('')
  const [showLinkCustomer, setShowLinkCustomer] = useState(false)

  // Customer enrichment
  const [customerTags, setCustomerTags] = useState<CustomerTag[]>([])
  const [lastContact, setLastContact] = useState<{ date: string; type: string } | null>(null)

  const [showNewDeal, setShowNewDeal] = useState(false)
  const [newDealForm, setNewDealForm] = useState({ title: '', customer_id: '', value: '', priority: 'medium', description: '' })
  const [newDealSubmitting, setNewDealSubmitting] = useState(false)
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false)
  const [newCustomerForm, setNewCustomerForm] = useState({ firstName: '', lastName: '', phone: '', email: '' })
  const [newCustomerSubmitting, setNewCustomerSubmitting] = useState(false)
  const [newDealFiles, setNewDealFiles] = useState<File[]>([])
  const [newDealUploading, setNewDealUploading] = useState(false)

  // View toggle
  const [pipelineView, setPipelineView] = useState<'kanban' | 'timeline'>('kanban')

  // Site visit booking
  const [showSiteVisit, setShowSiteVisit] = useState(false)
  const [siteVisitForm, setSiteVisitForm] = useState({ date: '', time: '09:00', duration: '60', notes: '', sendSms: true })
  const [siteVisitSaving, setSiteVisitSaving] = useState(false)

  // Stage management
  const [showStageSettings, setShowStageSettings] = useState(false)
  const [stageEdits, setStageEdits] = useState<Record<string, { name: string; color: string }>>({})
  const [newStageName, setNewStageName] = useState('')
  const [stageSaving, setStageSaving] = useState(false)

  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  const [filterSearch, setFilterSearch] = useState('')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const filterRef = useRef<HTMLDivElement>(null)
  const [lostExpanded, setLostExpanded] = useState(false)
  const [mobileStageIndex, setMobileStageIndex] = useState(0)
  const [toast, setToast] = useState<Toast>({ show: false, message: '', type: 'info' })
  const toastTimeout = useRef<NodeJS.Timeout | null>(null)

  function showToast(message: string, type: Toast['type'] = 'info') {
    if (toastTimeout.current) clearTimeout(toastTimeout.current)
    setToast({ show: true, message, type })
    toastTimeout.current = setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3500)
  }

  // ------------------------------------------
  // Data fetching
  // ------------------------------------------

  const fetchPipeline = useCallback(async () => {
    try {
      const res = await fetch(`/api/pipeline?business_id=${business.business_id}`)
      if (!res.ok) throw new Error('Failed to fetch pipeline')
      const data = await res.json()
      setStages((data.stages || []).sort((a: Stage, b: Stage) => a.sort_order - b.sort_order))
      const groupedDeals = data.deals || {}
      const flatDeals: Deal[] = Object.values(groupedDeals).flat() as Deal[]
      setDeals(flatDeals)
      setStats(data.stats || null)
    } catch {
      showToast('Kunde inte ladda pipeline', 'error')
    }
  }, [business.business_id])

  const fetchAiActivities = useCallback(async () => {
    try {
      const res = await fetch(`/api/pipeline/activity?business_id=${business.business_id}&triggered_by=ai&limit=10`)
      if (!res.ok) return
      const data = await res.json()
      setAiActivities(data.activities || [])
    } catch { /* silent */ }
  }, [business.business_id])

  const fetchDealActivities = useCallback(async (dealId: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/pipeline/deals/${dealId}/activity?business_id=${business.business_id}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setDetailActivities(data.activities || [])
    } catch {
      setDetailActivities([])
    } finally {
      setDetailLoading(false)
    }
  }, [business.business_id])

  const fetchDealDocuments = useCallback(async (customerId: string) => {
    try {
      const res = await fetch(`/api/customers/${customerId}/documents`)
      if (!res.ok) return
      const data = await res.json()
      setDealDocuments(data.documents || [])
    } catch {
      setDealDocuments([])
    }
  }, [])

  async function handleDealFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0 || !selectedDeal) return

    setDealUploading(true)
    let successCount = 0
    let failCount = 0
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        failCount++
        continue
      }

      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('category', dealUploadCategory)

        const res = await fetch(`/api/deals/${selectedDeal.id}/documents/upload`, {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          console.error('Document upload failed:', errData)
          failCount++
          continue
        }

        successCount++
      } catch (err) {
        console.error('Document upload failed:', err)
        failCount++
      }
    }

    setDealUploading(false)
    e.target.value = ''
    if (successCount > 0) {
      fetchDealDocuments(selectedDeal.customer_id || selectedDeal.id)
      showToast(successCount === 1 ? 'Dokument uppladdat' : `${successCount} dokument uppladdade`, 'success')
    }
    if (failCount > 0) {
      showToast(failCount === 1 ? 'Ett dokument kunde inte laddas upp' : `${failCount} dokument misslyckades`, 'error')
    }
  }

  // Deal notes
  async function fetchDealEmails(email: string) {
    setDealEmailLoading(true)
    setDealEmailThreads([])
    setDealExpandedThread(null)
    setDealThreadMessages({})
    try {
      const res = await fetch(`/api/gmail/customer-emails?email=${encodeURIComponent(email)}`)
      if (res.ok) {
        const data = await res.json()
        setDealEmailThreads(data.threads || [])
      }
    } catch {
      // Gmail not configured — silent
    } finally {
      setDealEmailLoading(false)
    }
  }

  async function fetchDealThreadMessages(threadId: string) {
    if (dealThreadMessages[threadId]) {
      setDealExpandedThread(dealExpandedThread === threadId ? null : threadId)
      return
    }
    setDealExpandedThread(threadId)
    setDealThreadLoading(true)
    try {
      const res = await fetch(`/api/gmail/thread-messages?threadId=${encodeURIComponent(threadId)}`)
      if (res.ok) {
        const data = await res.json()
        setDealThreadMessages(prev => ({ ...prev, [threadId]: data.messages || [] }))
      }
    } catch {
      // silent
    } finally {
      setDealThreadLoading(false)
    }
  }

  const extractEmailName = (from: string): string => {
    const match = from.match(/^"?([^"<]+)"?\s*</)
    return match ? match[1].trim() : from.split('@')[0]
  }

  const fetchDealNotes = useCallback(async (dealId: string) => {
    try {
      const res = await fetch(`/api/pipeline/notes?dealId=${dealId}`)
      if (!res.ok) return
      const data = await res.json()
      setDealNotes(data.notes || [])
    } catch {
      setDealNotes([])
    }
  }, [])

  async function handleAddNote() {
    if (!newNoteContent.trim() || !selectedDeal) return
    setNoteSaving(true)
    try {
      const res = await fetch('/api/pipeline/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId: selectedDeal.id, content: newNoteContent.trim() })
      })
      if (!res.ok) throw new Error()
      setNewNoteContent('')
      fetchDealNotes(selectedDeal.id)
      showToast('Anteckning sparad', 'success')
    } catch {
      showToast('Kunde inte spara anteckning', 'error')
    } finally {
      setNoteSaving(false)
    }
  }

  async function handleUpdateNote(noteId: string) {
    if (!editNoteContent.trim()) return
    try {
      const res = await fetch('/api/pipeline/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId, content: editNoteContent.trim() })
      })
      if (!res.ok) throw new Error()
      setEditingNoteId(null)
      setEditNoteContent('')
      if (selectedDeal) fetchDealNotes(selectedDeal.id)
      showToast('Anteckning uppdaterad', 'success')
    } catch {
      showToast('Kunde inte uppdatera', 'error')
    }
  }

  async function handleDeleteNote(noteId: string) {
    if (!confirm('Ta bort anteckning?')) return
    try {
      const res = await fetch(`/api/pipeline/notes?noteId=${noteId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      if (selectedDeal) fetchDealNotes(selectedDeal.id)
      showToast('Anteckning borttagen', 'success')
    } catch {
      showToast('Kunde inte ta bort', 'error')
    }
  }

  // Team members (for task assignment)
  const fetchTeamMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/team')
      if (!res.ok) return
      const data = await res.json()
      setTeamMembers((data.members || []).filter((m: any) => m.is_active).map((m: any) => ({
        id: m.id, name: m.name, color: m.color || '#3B82F6', role: m.role
      })))
    } catch { /* silent */ }
  }, [])

  // Deal tasks
  const fetchDealTasks = useCallback(async (dealId: string) => {
    try {
      const res = await fetch(`/api/tasks?deal_id=${dealId}`)
      if (!res.ok) return
      const data = await res.json()
      setDealTasks(data.tasks || [])
    } catch {
      setDealTasks([])
    }
  }, [])

  const fetchTaskActivities = useCallback(async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks?id=${taskId}&include_activities=true`)
      if (!res.ok) return
      const data = await res.json()
      setTaskActivities(data.activities || [])
    } catch {
      setTaskActivities([])
    }
  }, [])

  async function handleAddTask() {
    if (!newTaskTitle.trim() || !selectedDeal) return
    setTaskSaving(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          deal_id: selectedDeal.id,
          customer_id: selectedDeal.customer_id,
          due_date: newTaskDueDate || null,
          due_time: newTaskDueTime || null,
          assigned_to: newTaskAssignee || null,
        })
      })
      if (!res.ok) throw new Error()
      setNewTaskTitle('')
      setNewTaskDueDate('')
      setNewTaskDueTime('')
      setNewTaskAssignee('')
      fetchDealTasks(selectedDeal.id)
      showToast('Uppgift skapad', 'success')
    } catch {
      showToast('Kunde inte skapa uppgift', 'error')
    } finally {
      setTaskSaving(false)
    }
  }

  async function handleToggleTask(taskId: string, currentStatus: string) {
    const newStatus = currentStatus === 'done' ? 'pending' : 'done'
    try {
      const res = await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, status: newStatus })
      })
      if (!res.ok) throw new Error()
      if (selectedDeal) fetchDealTasks(selectedDeal.id)
    } catch {
      showToast('Kunde inte uppdatera uppgift', 'error')
    }
  }

  async function handleDeleteTask(taskId: string) {
    try {
      const res = await fetch(`/api/tasks?id=${taskId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      if (selectedDeal) fetchDealTasks(selectedDeal.id)
    } catch {
      showToast('Kunde inte ta bort uppgift', 'error')
    }
  }

  async function handleLinkCustomer(customerId: string) {
    if (!selectedDeal) return
    try {
      const res = await fetch(`/api/pipeline/deals/${selectedDeal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.business_id, customer_id: customerId })
      })
      if (!res.ok) throw new Error()
      setShowLinkCustomer(false)
      setLinkCustomerSearch('')
      showToast('Kund kopplad', 'success')
      // Refresh pipeline to get updated customer data
      await fetchPipeline()
      // Re-open the deal with fresh data
      const updatedDeals = await fetch(`/api/pipeline?business_id=${business.business_id}`).then(r => r.json())
      const allDeals: Deal[] = Object.values(updatedDeals.deals || {}).flat() as Deal[]
      const updatedDeal = allDeals.find(d => d.id === selectedDeal.id)
      if (updatedDeal) {
        openDealDetail(updatedDeal)
      }
    } catch {
      showToast('Kunde inte koppla kund', 'error')
    }
  }

  // Customer enrichment
  const fetchCustomerEnrichment = useCallback(async (customerId: string) => {
    // Fetch tags
    try {
      const { data: assignments } = await supabase
        .from('customer_tag_assignment')
        .select('tag_id')
        .eq('customer_id', customerId)
      if (assignments && assignments.length > 0) {
        const tagIds = assignments.map((a: any) => a.tag_id)
        const { data: tags } = await supabase
          .from('customer_tag')
          .select('name, color')
          .in('tag_id', tagIds)
        setCustomerTags(tags || [])
      } else {
        setCustomerTags([])
      }
    } catch {
      setCustomerTags([])
    }

    // Fetch last contact
    try {
      const { data: activity } = await supabase
        .from('customer_activity')
        .select('activity_type, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (activity) {
        const typeLabel: Record<string, string> = {
          call: 'samtal', sms: 'SMS', email: 'e-post', quote_sent: 'offert', booking: 'bokning', note: 'anteckning'
        }
        setLastContact({
          date: activity.created_at,
          type: typeLabel[activity.activity_type] || activity.activity_type
        })
      } else {
        setLastContact(null)
      }
    } catch {
      setLastContact(null)
    }
  }, [])

  function formatFileSize(bytes: number | null) {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const fetchCustomers = useCallback(async () => {
    const { data } = await supabase
      .from('customer')
      .select('customer_id, name, phone_number, email')
      .eq('business_id', business.business_id)
      .order('name', { ascending: true })
    setCustomers(data || [])
  }, [business.business_id])

  useEffect(() => {
    async function load() {
      setLoading(true)
      await Promise.all([fetchPipeline(), fetchAiActivities(), fetchTeamMembers()])
      setLoading(false)
    }
    load()
  }, [fetchPipeline, fetchAiActivities, fetchTeamMembers])

  // ------------------------------------------
  // Deal actions
  // ------------------------------------------

  async function moveDealAction(dealId: string, toStageSlug: string, extraData?: Record<string, any>) {
    const targetStage = stages.find(s => s.slug === toStageSlug)

    // Intercept: if moving to lost stage, show loss reason modal
    if (targetStage?.is_lost && !extraData?.loss_reason) {
      setLossDealId(dealId)
      setLossReason('')
      setLossReasonDetail('')
      setShowLossModal(true)
      return
    }

    try {
      const res = await fetch(`/api/pipeline/deals/${dealId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toStageSlug, business_id: business.business_id })
      })
      if (!res.ok) throw new Error()

      if (targetStage) {
        setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage_id: targetStage.id, updated_at: new Date().toISOString() } : d))
        if (selectedDeal?.id === dealId) {
          setSelectedDeal(prev => prev ? { ...prev, stage_id: targetStage.id, updated_at: new Date().toISOString() } : prev)
        }
      }

      // Save extra data (loss_reason, won_value)
      if (extraData && Object.keys(extraData).length > 0) {
        await fetch(`/api/pipeline/deals/${dealId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: business.business_id, ...extraData })
        })
      }

      // Auto-save won_value when moving to won stage
      if (targetStage?.is_won) {
        const deal = deals.find(d => d.id === dealId)
        if (deal?.value) {
          await fetch(`/api/pipeline/deals/${dealId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ business_id: business.business_id, won_value: deal.value })
          })
        }
      }

      showToast('Deal flyttad', 'success')
      fetchAiActivities()
    } catch {
      showToast('Kunde inte flytta deal', 'error')
      fetchPipeline()
    }
  }

  async function confirmLossReason() {
    if (!lossDealId || !lossReason) return
    const lostStage = stages.find(s => s.is_lost)
    if (!lostStage) return
    setShowLossModal(false)
    const deal = deals.find(d => d.id === lossDealId)
    await moveDealAction(lossDealId, lostStage.slug, {
      loss_reason: LOSS_REASONS.find(r => r.value === lossReason)?.label || lossReason,
      loss_reason_detail: lossReasonDetail || null,
      lost_value: deal?.value || null,
    })
    setLossDealId(null)
  }

  async function createDeal() {
    if (!newDealForm.title.trim()) { showToast('Ange en titel', 'error'); return }
    setNewDealSubmitting(true)
    try {
      const res = await fetch('/api/pipeline/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.business_id,
          title: newDealForm.title.trim(),
          customerId: newDealForm.customer_id || null,
          value: newDealForm.value ? parseFloat(newDealForm.value) : null,
          priority: newDealForm.priority,
          description: newDealForm.description.trim() || null
        })
      })
      if (!res.ok) throw new Error()
      const dealData = await res.json()
      const createdDeal = dealData.deal

      // Upload attached documents if customer is linked
      if (newDealFiles.length > 0 && createdDeal.customer_id) {
        let uploadFails = 0
        for (const file of newDealFiles) {
          try {
            const filePath = `${business.business_id}/${createdDeal.customer_id}/${Date.now()}_${file.name}`
            const { error: uploadError } = await supabase.storage
              .from('customer-documents')
              .upload(filePath, file)
            if (uploadError) { uploadFails++; continue }

            const { data: urlData } = supabase.storage
              .from('customer-documents')
              .getPublicUrl(filePath)

            const docRes = await fetch(`/api/customers/${createdDeal.customer_id}/documents`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                file_name: file.name,
                file_url: urlData.publicUrl,
                file_type: file.type,
                file_size: file.size,
                category: 'other',
              })
            })
            if (!docRes.ok) uploadFails++
          } catch {
            uploadFails++
          }
        }
        if (uploadFails > 0) {
          showToast(`Deal skapad, men ${uploadFails} dokument misslyckades`, 'error')
        } else {
          showToast('Deal skapad med dokument', 'success')
        }
      } else {
        showToast('Deal skapad', 'success')
      }

      setShowNewDeal(false)
      setNewDealForm({ title: '', customer_id: '', value: '', priority: 'medium', description: '' })
      setCustomerSearch('')
      setNewDealFiles([])
      setShowNewCustomerForm(false)
      fetchPipeline()
    } catch {
      showToast('Kunde inte skapa deal', 'error')
    } finally {
      setNewDealSubmitting(false)
    }
  }

  async function updateDealField(dealId: string, field: string, value: any) {
    try {
      const res = await fetch(`/api/pipeline/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.business_id, [field]: value })
      })
      if (!res.ok) throw new Error()
      setDeals(prev => prev.map(d => d.id === dealId ? { ...d, [field]: value, updated_at: new Date().toISOString() } : d))
      if (selectedDeal?.id === dealId) {
        setSelectedDeal(prev => prev ? { ...prev, [field]: value, updated_at: new Date().toISOString() } : prev)
      }
      showToast('Uppdaterad', 'success')
    } catch {
      showToast('Kunde inte uppdatera', 'error')
    }
  }

  async function markDealLost(dealId: string) {
    const lost = stages.find(s => s.is_lost)
    if (!lost) return
    // This will trigger the loss reason modal via moveDealAction intercept
    await moveDealAction(dealId, lost.slug)
  }

  async function undoActivity(activityId: string) {
    try {
      const res = await fetch(`/api/pipeline/activity/${activityId}/undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.business_id })
      })
      if (!res.ok) throw new Error()
      showToast('Ångrad', 'success')
      fetchPipeline()
      fetchAiActivities()
      if (selectedDeal) fetchDealActivities(selectedDeal.id)
    } catch {
      showToast('Kunde inte ångra', 'error')
    }
  }

  // ------------------------------------------
  // Site visit booking
  // ------------------------------------------

  async function bookSiteVisit() {
    if (!selectedDeal || !siteVisitForm.date) return
    setSiteVisitSaving(true)
    try {
      const start = new Date(`${siteVisitForm.date}T${siteVisitForm.time}:00`)
      const end = new Date(start.getTime() + Number(siteVisitForm.duration) * 60000)

      // Create booking
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedDeal.customer_id,
          scheduled_start: start.toISOString(),
          scheduled_end: end.toISOString(),
          service_type: 'Platsbesök',
          notes: siteVisitForm.notes || `Platsbesök — ${selectedDeal.title}`,
        }),
      })

      if (!res.ok) throw new Error('Booking failed')

      // Send SMS to customer if enabled
      if (siteVisitForm.sendSms && selectedDeal.customer?.phone_number) {
        const dateStr = start.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
        const timeStr = start.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
        await fetch('/api/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: selectedDeal.customer.phone_number,
            message: `Hej ${selectedDeal.customer.name}! Vi kommer på platsbesök ${dateStr} kl ${timeStr}. Välkommen att höra av dig om tiden inte passar. //${business.contact_name}`,
          }),
        }).catch(() => {})
      }

      showToast('Platsbesök bokat!', 'success')
      setShowSiteVisit(false)
      setSiteVisitForm({ date: '', time: '09:00', duration: '60', notes: '', sendSms: true })
    } catch {
      showToast('Kunde inte boka platsbesök', 'error')
    }
    setSiteVisitSaving(false)
  }

  // ------------------------------------------
  // Stage management
  // ------------------------------------------

  function openStageSettings() {
    const edits: Record<string, { name: string; color: string }> = {}
    stages.forEach(s => { edits[s.id] = { name: s.name, color: s.color } })
    setStageEdits(edits)
    setNewStageName('')
    setShowStageSettings(true)
  }

  async function saveStageEdits() {
    setStageSaving(true)
    try {
      // Collect changes
      const updates = stages
        .filter(s => {
          const edit = stageEdits[s.id]
          return edit && (edit.name !== s.name || edit.color !== s.color)
        })
        .map(s => ({
          id: s.id,
          name: stageEdits[s.id].name,
          color: stageEdits[s.id].color,
          sort_order: s.sort_order
        }))

      if (updates.length > 0) {
        await fetch('/api/pipeline/stages', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stages: updates })
        })
      }

      showToast('Steg uppdaterade', 'success')
      setShowStageSettings(false)
      fetchPipeline()
    } catch {
      showToast('Kunde inte spara', 'error')
    }
    setStageSaving(false)
  }

  async function addNewStage() {
    if (!newStageName.trim()) return
    setStageSaving(true)
    try {
      const res = await fetch('/api/pipeline/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newStageName.trim(), color: '#6366F1' })
      })
      if (!res.ok) throw new Error()
      showToast('Nytt steg tillagt', 'success')
      setNewStageName('')
      fetchPipeline()
      // Re-open with updated stages
      setTimeout(() => {
        const edits: Record<string, { name: string; color: string }> = {}
        stages.forEach(s => { edits[s.id] = { name: s.name, color: s.color } })
        setStageEdits(edits)
      }, 500)
    } catch {
      showToast('Kunde inte skapa steg', 'error')
    }
    setStageSaving(false)
  }

  async function deleteStage(stageId: string) {
    const stage = stages.find(s => s.id === stageId)
    if (!stage) return
    const dealCount = dealsForStage(stageId).length
    const msg = dealCount > 0
      ? `Ta bort "${stage.name}"? ${dealCount} deals flyttas till första steget.`
      : `Ta bort "${stage.name}"?`
    if (!confirm(msg)) return

    setStageSaving(true)
    try {
      const res = await fetch(`/api/pipeline/stages?id=${stageId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      showToast('Steg borttaget', 'success')
      setShowStageSettings(false)
      fetchPipeline()
    } catch {
      showToast('Kunde inte ta bort steg', 'error')
    }
    setStageSaving(false)
  }

  async function moveStageOrder(stageId: string, direction: 'up' | 'down') {
    const sortedNonTerminal = stages
      .filter(s => !s.is_won && !s.is_lost)
      .sort((a, b) => a.sort_order - b.sort_order)
    const idx = sortedNonTerminal.findIndex(s => s.id === stageId)
    if (idx === -1) return
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === sortedNonTerminal.length - 1) return

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    const tempOrder = sortedNonTerminal[idx].sort_order
    sortedNonTerminal[idx].sort_order = sortedNonTerminal[swapIdx].sort_order
    sortedNonTerminal[swapIdx].sort_order = tempOrder

    try {
      await fetch('/api/pipeline/stages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stages: sortedNonTerminal.map(s => ({ id: s.id, name: s.name, color: s.color, sort_order: s.sort_order }))
        })
      })
      fetchPipeline()
    } catch {
      showToast('Kunde inte ändra ordning', 'error')
    }
  }

  function openDealDetail(deal: Deal) {
    setSelectedDeal(deal)
    setDealTab('general')
    setEditingTitle(false)
    setEditingValue(false)
    setEditingPriority(false)
    setEditTitleValue(deal.title)
    setEditValueInput(deal.value?.toString() || '')
    setDealDocuments([])
    setDealUploadCategory('other')
    setDealNotes([])
    setDealTasks([])
    setNewNoteContent('')
    setNewTaskTitle('')
    setNewTaskDueDate('')
    setNewTaskDueTime('')
    setNewTaskAssignee('')
    setExpandedTaskId(null)
    setTaskActivities([])
    setCustomerTags([])
    setLastContact(null)
    setShowLinkCustomer(false)
    setLinkCustomerSearch('')
    fetchDealActivities(deal.id)
    fetchDealNotes(deal.id)
    fetchDealTasks(deal.id)
    fetchDealDocuments(deal.customer_id || deal.id)
    if (deal.customer_id) {
      fetchCustomerEnrichment(deal.customer_id)
    }
    // Fetch emails if customer has email
    if (deal.customer?.email) {
      fetchDealEmails(deal.customer.email)
    } else {
      setDealEmailThreads([])
    }
  }

  function closeDealDetail() {
    setSelectedDeal(null)
    setDetailActivities([])
    setDealDocuments([])
    setDealNotes([])
    setDealTasks([])
    setDealEmailThreads([])
    setDealExpandedThread(null)
    setDealThreadMessages({})
    setEditingTitle(false)
    setEditingValue(false)
    setEditingPriority(false)
    setCustomerTags([])
    setLastContact(null)
  }

  // ------------------------------------------
  // Drag & Drop
  // ------------------------------------------

  function handleDragStart(e: React.DragEvent, dealId: string) {
    e.dataTransfer.setData('text/plain', dealId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingDealId(dealId)
  }

  function handleDragEnd() { setDraggingDealId(null); setDragOverStageId(null) }

  function handleDragOver(e: React.DragEvent, stageId: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStageId(stageId)
  }

  function handleDragLeave(e: React.DragEvent) {
    const relatedTarget = e.relatedTarget as HTMLElement | null
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) setDragOverStageId(null)
  }

  function handleDrop(e: React.DragEvent, stage: Stage) {
    e.preventDefault()
    const dealId = e.dataTransfer.getData('text/plain')
    setDragOverStageId(null)
    setDraggingDealId(null)
    if (dealId) {
      const deal = deals.find(d => d.id === dealId)
      if (deal && deal.stage_id !== stage.id) moveDealAction(dealId, stage.slug)
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false)
    }
    if (showFilter) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showFilter])

  // ------------------------------------------
  // Filtering
  // ------------------------------------------

  const filteredDeals = deals.filter(d => {
    if (filterSearch) {
      const s = filterSearch.toLowerCase()
      if (!d.title.toLowerCase().includes(s) && !(d.customer?.name || '').toLowerCase().includes(s)) return false
    }
    if (filterPriority !== 'all' && d.priority !== filterPriority) return false
    return true
  })

  function dealsForStage(stageId: string): Deal[] { return filteredDeals.filter(d => d.stage_id === stageId) }
  function stageValue(stageId: string): number { return dealsForStage(stageId).reduce((sum, d) => sum + (d.value || 0), 0) }
  const hasActiveFilters = filterSearch !== '' || filterPriority !== 'all'

  const filteredCustomers = customers.filter(c => {
    if (!customerSearch) return true
    const s = customerSearch.toLowerCase()
    return c.name?.toLowerCase().includes(s) || c.phone_number?.toLowerCase().includes(s)
  })

  function getStageForDeal(deal: Deal): Stage | undefined { return stages.find(s => s.id === deal.stage_id) }

  const activeStages = stages.filter(s => !s.is_lost)
  const lostStage = stages.find(s => s.is_lost)

  // ------------------------------------------
  // Render
  // ------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-sky-700 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 relative">
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-teal-50 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-teal-50 rounded-full blur-[128px]" />
      </div>

      <div className="relative z-10 flex flex-col h-screen">
        {/* Header */}
        <header className="flex-shrink-0 px-4 lg:px-6 py-4 border-b border-gray-200 bg-white/60 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center">
                <FolderKanban className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Pipeline</h1>
                <p className="text-sm text-gray-500 hidden sm:block">
                  {stats ? `${stats.totalDeals} aktiva deals · ${formatValueCompact(stats.totalValue)}` : 'Hantera dina affärer'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Kanban / Tidslinje toggle */}
              <div className="hidden sm:flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setPipelineView('kanban')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${pipelineView === 'kanban' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Kanban
                </button>
                <button
                  onClick={() => setPipelineView('timeline')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${pipelineView === 'timeline' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Tidslinje
                </button>
              </div>

              <div className="relative" ref={filterRef}>
                <button onClick={() => setShowFilter(!showFilter)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${hasActiveFilters ? 'bg-teal-50 border-teal-300 text-sky-700' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300'}`}>
                  <Filter className="w-4 h-4" />
                  <span className="hidden sm:inline text-sm">Filter</span>
                  {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-teal-600" />}
                </button>
                {showFilter && (
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-xl p-4 shadow-xl z-50">
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Sök</label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input type="text" placeholder="Sök deal eller kund..." value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-teal-400" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Prioritet</label>
                        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-teal-400">
                          <option value="all">Alla</option>
                          <option value="urgent">Brådskande</option>
                          <option value="high">Hög</option>
                          <option value="medium">Medium</option>
                          <option value="low">Låg</option>
                        </select>
                      </div>
                      {hasActiveFilters && <button onClick={() => { setFilterSearch(''); setFilterPriority('all') }} className="text-xs text-sky-700 hover:text-teal-600">Rensa filter</button>}
                    </div>
                  </div>
                )}
              </div>
              <button onClick={openStageSettings}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-white border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-colors"
                title="Hantera steg">
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline text-sm">Steg</span>
              </button>
              <button onClick={() => { setShowNewDeal(true); fetchCustomers() }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium transition-all shadow-lg shadow-teal-500/10">
                <Plus className="w-4 h-4" /><span className="hidden sm:inline">Ny deal</span>
              </button>
            </div>
          </div>

          {/* Mobile tabs */}
          <div className="mt-3 flex gap-1 overflow-x-auto pb-1 lg:hidden scrollbar-hide">
            {stages.map((stage, idx) => (
              <button key={stage.id} onClick={() => setMobileStageIndex(idx)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${mobileStageIndex === idx ? 'text-white shadow-sm' : 'bg-gray-100 text-gray-500'}`}
                style={mobileStageIndex === idx ? { backgroundColor: stage.color } : undefined}>
                {stage.name}<span className="ml-1 opacity-70">{dealsForStage(stage.id).length}</span>
              </button>
            ))}
          </div>
        </header>

        {/* Kanban / Timeline */}
        <div className="flex-1 overflow-hidden">
          {pipelineView === 'timeline' ? (
            <TimelineView
              deals={filteredDeals as any}
              stages={stages}
              onDealClick={openDealDetail as any}
            />
          ) : (
          <>
          {/* Desktop */}
          <div className="hidden lg:flex h-full overflow-x-auto px-4 py-4 gap-3">
            {activeStages.map(stage => {
              const stageDeals = dealsForStage(stage.id)
              const total = stageValue(stage.id)
              const isDropTarget = dragOverStageId === stage.id
              return (
                <div key={stage.id}
                  className={`flex-shrink-0 w-[280px] flex flex-col rounded-xl border transition-all duration-200 ${isDropTarget ? 'border-dashed border-teal-400 bg-teal-50/50 shadow-inner' : 'border-gray-200 bg-white/50'}`}
                  onDragOver={e => handleDragOver(e, stage.id)} onDragLeave={handleDragLeave} onDrop={e => handleDrop(e, stage)}>
                  <div className="flex-shrink-0 px-3 py-2.5 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                        <h3 className="text-sm font-semibold text-gray-900">{stage.name}</h3>
                        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full font-medium">{stageDeals.length}</span>
                      </div>
                      <span className="text-xs text-gray-400 font-medium">{formatColumnValue(total)}</span>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {stageDeals.length === 0 && <div className="flex items-center justify-center py-8 text-gray-300 text-xs">{isDropTarget ? 'Släpp här' : 'Inga deals'}</div>}
                    {stageDeals.map(deal => (
                      <DealCard key={deal.id} deal={deal} isDragging={draggingDealId === deal.id}
                        onDragStart={handleDragStart} onDragEnd={handleDragEnd} onClick={() => openDealDetail(deal)} onQuickSms={handleQuickSms} onOpenTasks={handleOpenTasks} />
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Lost column - collapsed by default */}
            {lostStage && (
              <div
                className={`flex-shrink-0 flex flex-col rounded-xl border transition-all duration-200 ${lostExpanded ? 'w-[280px]' : 'w-[52px]'} ${dragOverStageId === lostStage.id ? 'border-dashed border-red-400 bg-red-50/50' : 'border-gray-200 bg-gray-50/50'}`}
                onDragOver={e => handleDragOver(e, lostStage.id)} onDragLeave={handleDragLeave} onDrop={e => handleDrop(e, lostStage)}>
                {lostExpanded ? (
                  <>
                    <div className="flex-shrink-0 px-3 py-2.5 border-b border-gray-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                          <h3 className="text-sm font-semibold text-gray-900">Förlorad</h3>
                          <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full font-medium">{dealsForStage(lostStage.id).length}</span>
                        </div>
                        <button onClick={() => setLostExpanded(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><ChevronRight className="w-4 h-4" /></button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                      {dealsForStage(lostStage.id).map(deal => (
                        <DealCard key={deal.id} deal={deal} isDragging={draggingDealId === deal.id}
                          onDragStart={handleDragStart} onDragEnd={handleDragEnd} onClick={() => openDealDetail(deal)} onQuickSms={handleQuickSms} onOpenTasks={handleOpenTasks} />
                      ))}
                    </div>
                  </>
                ) : (
                  <button onClick={() => setLostExpanded(true)}
                    className="flex flex-col items-center justify-center h-full py-4 gap-2 text-gray-400 hover:text-gray-600 transition-colors">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <span className="text-xs font-medium [writing-mode:vertical-lr] rotate-180">Förlorad ({dealsForStage(lostStage.id).length})</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Mobile */}
          <div className="lg:hidden h-full flex flex-col">
            {stages[mobileStageIndex] && (
              <div className="flex-1 overflow-y-auto p-4 space-y-2"
                onDragOver={e => handleDragOver(e, stages[mobileStageIndex].id)} onDragLeave={handleDragLeave} onDrop={e => handleDrop(e, stages[mobileStageIndex])}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: stages[mobileStageIndex].color }} />
                    <h3 className="text-sm font-semibold text-gray-900">{stages[mobileStageIndex].name}</h3>
                    <span className="text-xs text-gray-400">{dealsForStage(stages[mobileStageIndex].id).length} deals</span>
                  </div>
                  <span className="text-xs text-gray-400">{formatColumnValue(stageValue(stages[mobileStageIndex].id))}</span>
                </div>
                {dealsForStage(stages[mobileStageIndex].id).length === 0 && <div className="flex items-center justify-center py-12 text-gray-400 text-sm">Inga deals i detta steg</div>}
                {dealsForStage(stages[mobileStageIndex].id).map(deal => (
                  <DealCard key={deal.id} deal={deal} isDragging={draggingDealId === deal.id}
                    onDragStart={handleDragStart} onDragEnd={handleDragEnd} onClick={() => openDealDetail(deal)} onQuickSms={handleQuickSms} onOpenTasks={handleOpenTasks} />
                ))}
              </div>
            )}
          </div>
          </>
          )}
        </div>

        {/* AI Activity Panel */}
        {aiActivities.length > 0 && (
          <div className="flex-shrink-0 border-t border-gray-200 bg-white/60 backdrop-blur-sm">
            <button onClick={() => setAiPanelOpen(!aiPanelOpen)} className="w-full flex items-center justify-between px-4 lg:px-6 py-3 hover:bg-white/80 transition-colors">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-sky-700" />
                <span className="text-sm font-medium text-gray-900">AI-aktivitet</span>
                <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{aiActivities.length}</span>
              </div>
              {aiPanelOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
            </button>
            {aiPanelOpen && (
              <div className="max-h-64 overflow-y-auto px-4 lg:px-6 pb-4 space-y-2">
                {aiActivities.map(act => (
                  <div key={act.id} className={`flex items-start gap-3 p-3 rounded-lg border ${act.undone_at ? 'bg-gray-50 border-gray-100 opacity-50' : 'bg-white border-gray-200'}`}>
                    <Bot className="w-4 h-4 text-sky-700 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-900">{act.description || 'AI-åtgärd'}</span>
                      {act.deal_title && <span className="text-xs text-gray-400 ml-1">({act.deal_title})</span>}
                      {act.ai_reason && <p className="text-xs text-gray-400 mt-1">{act.ai_reason}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">{timeAgo(act.created_at)}</span>
                        {act.ai_confidence != null && <span className="text-xs text-teal-600">{Math.round(act.ai_confidence * 100)}%</span>}
                      </div>
                    </div>
                    {!act.undone_at ? (
                      <button onClick={() => undoActivity(act.id)} className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 border border-gray-200 text-xs text-gray-500 hover:text-gray-900 transition-colors">
                        <Undo2 className="w-3 h-3" /> Ångra
                      </button>
                    ) : <span className="flex-shrink-0 text-xs text-gray-400 italic">Ångrad</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stats Footer */}
        {stats && (
          <div className="flex-shrink-0 border-t border-gray-200 px-4 lg:px-6 py-3 bg-white/60 backdrop-blur-sm">
            <div className="flex items-center gap-4 lg:gap-8 overflow-x-auto text-xs">
              <div className="flex items-center gap-2 flex-shrink-0"><div className="w-2 h-2 rounded-full bg-teal-600" /><span className="text-gray-500">Aktiva:</span><span className="text-gray-900 font-medium">{stats.totalDeals}</span><span className="text-gray-400">({formatValueCompact(stats.totalValue)})</span></div>
              <div className="flex items-center gap-2 flex-shrink-0"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-gray-500">Vunna:</span><span className="text-gray-900 font-medium">{formatValueCompact(stats.wonValue)}</span></div>
              <div className="flex items-center gap-2 flex-shrink-0"><div className="w-2 h-2 rounded-full bg-teal-500" /><span className="text-gray-500">Nya idag:</span><span className="text-gray-900 font-medium">{stats.newLeadsToday}</span></div>
              <div className="flex items-center gap-2 flex-shrink-0"><div className="w-2 h-2 rounded-full bg-amber-400" /><span className="text-gray-500">Uppföljning:</span><span className="text-gray-900 font-medium">{stats.needsFollowUp}</span></div>
            </div>
          </div>
        )}
      </div>

      {/* Deal Detail Modal */}
      {selectedDeal && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={closeDealDetail} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              {/* Modal Header */}
              <div className="flex-shrink-0 px-6 pt-5 pb-0">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {(() => { const stage = getStageForDeal(selectedDeal); return stage ? (<span className="px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0" style={{ backgroundColor: stage.color + '22', color: stage.color, border: `1px solid ${stage.color}44` }}>{stage.name}</span>) : null })()}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getPriorityBadgeStyle(selectedDeal.priority)}`}>{getPriorityLabel(selectedDeal.priority)}</span>
                    <div className="flex-1 min-w-0 ml-2">
                      {editingTitle ? (
                        <div className="flex items-center gap-2">
                          <input type="text" value={editTitleValue} onChange={e => setEditTitleValue(e.target.value)}
                            className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-gray-900 font-bold focus:outline-none focus:border-teal-400" autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') { updateDealField(selectedDeal.id, 'title', editTitleValue); setEditingTitle(false) }; if (e.key === 'Escape') { setEditTitleValue(selectedDeal.title); setEditingTitle(false) } }} />
                          <button onClick={() => { updateDealField(selectedDeal.id, 'title', editTitleValue); setEditingTitle(false) }} className="p-1.5 rounded-lg bg-teal-50 text-sky-700 hover:bg-teal-100 transition-colors"><Save className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditTitleValue(selectedDeal.title); setEditingTitle(true) }} className="group flex items-center gap-2 text-left w-full min-w-0">
                          <h2 className="text-lg font-bold text-gray-900 truncate">{selectedDeal.title}</h2>
                          <Edit3 className="w-3.5 h-3.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        </button>
                      )}
                    </div>
                  </div>
                  <button onClick={closeDealDetail} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors ml-3 flex-shrink-0"><X className="w-5 h-5" /></button>
                </div>
                {selectedDeal.description && <p className="text-sm text-gray-500 mb-4 -mt-1">{selectedDeal.description}</p>}

                {/* Tabs */}
                <div className="flex gap-0 border-b border-gray-200 -mx-6 px-6">
                  {([
                    { key: 'general' as const, label: 'Allmänt', icon: FolderKanban },
                    { key: 'tasks' as const, label: 'Uppgifter', icon: CheckSquare, count: dealTasks.filter(t => t.status !== 'done').length },
                    { key: 'documents' as const, label: 'Dokument', icon: FileIcon, count: dealDocuments.length },
                    { key: 'messages' as const, label: 'Anteckningar', icon: MessageSquare, count: dealNotes.length + dealEmailThreads.length },
                    { key: 'canvas' as const, label: 'Rityta', icon: Pencil },
                  ]).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setDealTab(tab.key)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                        dealTab === tab.key
                          ? 'border-teal-600 text-sky-700'
                          : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <tab.icon className="w-4 h-4" />
                      <span className="hidden sm:inline">{tab.label}</span>
                      {tab.count !== undefined && tab.count > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          dealTab === tab.key ? 'bg-teal-100 text-sky-700' : 'bg-gray-100 text-gray-500'
                        }`}>{tab.count}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-6">

                {/* TAB: Allmänt */}
                {dealTab === 'general' && (
                  <div className="space-y-5">
                    {/* Value + Priority row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3">
                        <span className="text-sm text-gray-400">Värde</span>
                        {editingValue ? (
                          <div className="flex items-center gap-2">
                            <input type="number" value={editValueInput} onChange={e => setEditValueInput(e.target.value)}
                              className="w-28 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-900 text-sm text-right focus:outline-none focus:border-teal-400" autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') { updateDealField(selectedDeal.id, 'value', editValueInput ? parseFloat(editValueInput) : null); setEditingValue(false) }; if (e.key === 'Escape') { setEditValueInput(selectedDeal.value?.toString() || ''); setEditingValue(false) } }} />
                            <button onClick={() => { updateDealField(selectedDeal.id, 'value', editValueInput ? parseFloat(editValueInput) : null); setEditingValue(false) }} className="p-1.5 rounded-lg bg-teal-50 text-sky-700 hover:bg-teal-100 transition-colors"><Save className="w-3.5 h-3.5" /></button>
                          </div>
                        ) : (
                          <button onClick={() => { setEditValueInput(selectedDeal.value?.toString() || ''); setEditingValue(true) }} className="group flex items-center gap-1.5 text-gray-900 font-semibold text-sm">
                            {formatValue(selectedDeal.value)}<Edit3 className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3">
                        <span className="text-sm text-gray-400">Prioritet</span>
                        {editingPriority ? (
                          <select value={selectedDeal.priority} onChange={e => { updateDealField(selectedDeal.id, 'priority', e.target.value); setEditingPriority(false) }} onBlur={() => setEditingPriority(false)} autoFocus
                            className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-900 text-sm focus:outline-none focus:border-teal-400">
                            <option value="low">Låg</option><option value="medium">Medium</option><option value="high">Hög</option><option value="urgent">Brådskande</option>
                          </select>
                        ) : (
                          <button onClick={() => setEditingPriority(true)} className={`group flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${getPriorityBadgeStyle(selectedDeal.priority)}`}>
                            {getPriorityLabel(selectedDeal.priority)}<Edit3 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Lead Score Card */}
                    {selectedDeal.lead_score != null && selectedDeal.lead_score > 0 && (
                      <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Target className="w-4 h-4 text-sky-700" />
                            <span className="text-sm font-medium text-gray-900">Lead-kvalificering</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-gray-900">{selectedDeal.lead_score}/100</span>
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{
                              backgroundColor: getTemperatureColor(selectedDeal.lead_temperature || 'cold') + '20',
                              color: getTemperatureColor(selectedDeal.lead_temperature || 'cold'),
                            }}>
                              {getTemperatureLabel(selectedDeal.lead_temperature || 'cold')}
                            </span>
                          </div>
                        </div>
                        {/* Score bar */}
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div className="h-2 rounded-full transition-all" style={{
                            width: `${selectedDeal.lead_score}%`,
                            backgroundColor: getTemperatureColor(selectedDeal.lead_temperature || 'cold'),
                          }} />
                        </div>
                        {/* Factor bars */}
                        {selectedDeal.lead_score_factors && (
                          <div className="space-y-1.5">
                            {(Object.entries(selectedDeal.lead_score_factors) as [string, number][]).map(([key, val]) => {
                              const meta = SCORE_FACTOR_LABELS[key as keyof typeof SCORE_FACTOR_LABELS]
                              if (!meta) return null
                              return (
                                <div key={key} className="flex items-center gap-2 text-xs">
                                  <span className="w-16 text-gray-400 truncate">{meta.label}</span>
                                  <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                                    <div className="h-1.5 rounded-full bg-teal-600 transition-all" style={{ width: `${(val / meta.max) * 100}%` }} />
                                  </div>
                                  <span className="text-gray-500 w-10 text-right">{val}/{meta.max}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                        {selectedDeal.suggested_action && (
                          <div className="flex items-start gap-2 pt-1">
                            <Lightbulb className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-gray-600">{selectedDeal.suggested_action}</p>
                          </div>
                        )}
                        {selectedDeal.estimated_value != null && selectedDeal.estimated_value > 0 && (
                          <div className="text-xs text-gray-400">
                            Uppskattat värde: <span className="font-medium text-gray-600">{formatValue(selectedDeal.estimated_value)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Response time badge */}
                    {selectedDeal.response_time_seconds != null && selectedDeal.response_time_seconds > 0 && (
                      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-2.5">
                        <Zap className="w-4 h-4 text-amber-500" />
                        <span className="text-sm text-gray-400">Svarstid:</span>
                        <span className={`text-sm font-medium ${selectedDeal.response_time_seconds < 60 ? 'text-green-600' : selectedDeal.response_time_seconds < 900 ? 'text-amber-600' : 'text-red-600'}`}>
                          {selectedDeal.response_time_seconds < 60
                            ? `${selectedDeal.response_time_seconds}s`
                            : selectedDeal.response_time_seconds < 3600
                            ? `${Math.round(selectedDeal.response_time_seconds / 60)} min`
                            : `${Math.round(selectedDeal.response_time_seconds / 3600)}h ${Math.round((selectedDeal.response_time_seconds % 3600) / 60)}m`
                          }
                        </span>
                      </div>
                    )}

                    {/* Move to stage */}
                    <div>
                      <span className="text-sm text-gray-400 block mb-2">Flytta till</span>
                      <div className="flex flex-wrap gap-1.5">
                        {stages.filter(s => s.id !== selectedDeal.stage_id).map(s => (
                          <button key={s.id} onClick={() => moveDealAction(selectedDeal.id, s.slug)}
                            className="px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors">
                            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: s.color }} />{s.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>Skapad {timeAgo(selectedDeal.created_at)}</span>
                      <span>Uppdaterad {timeAgo(selectedDeal.updated_at)}</span>
                    </div>

                    {/* Link Customer (when no customer is assigned) */}
                    {!selectedDeal.customer && (
                      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 p-4">
                        {!showLinkCustomer ? (
                          <button
                            onClick={() => { setShowLinkCustomer(true); fetchCustomers() }}
                            className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-500 hover:text-sky-700 transition-colors"
                          >
                            <User className="w-4 h-4" />
                            Koppla kund till denna deal
                          </button>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-400 uppercase tracking-wider">Koppla kund</span>
                              <button onClick={() => { setShowLinkCustomer(false); setLinkCustomerSearch('') }} className="text-gray-400 hover:text-gray-600">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <input
                              type="text"
                              value={linkCustomerSearch}
                              onChange={e => setLinkCustomerSearch(e.target.value)}
                              placeholder="Sök kund..."
                              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-teal-400"
                              autoFocus
                            />
                            <div className="max-h-40 overflow-y-auto space-y-1">
                              {customers
                                .filter(c => !linkCustomerSearch || c.name.toLowerCase().includes(linkCustomerSearch.toLowerCase()) || c.phone_number?.includes(linkCustomerSearch))
                                .slice(0, 8)
                                .map(c => (
                                  <button
                                    key={c.customer_id}
                                    onClick={() => handleLinkCustomer(c.customer_id)}
                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-teal-50 transition-colors"
                                  >
                                    <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                    <div className="min-w-0">
                                      <p className="text-sm text-gray-900 truncate">{c.name}</p>
                                      <p className="text-xs text-gray-400 truncate">{c.phone_number}{c.email ? ` · ${c.email}` : ''}</p>
                                    </div>
                                  </button>
                                ))}
                              {customers.filter(c => !linkCustomerSearch || c.name.toLowerCase().includes(linkCustomerSearch.toLowerCase()) || c.phone_number?.includes(linkCustomerSearch)).length === 0 && (
                                <p className="text-xs text-gray-400 text-center py-2">Inga kunder hittades</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Customer */}
                    {selectedDeal.customer && (
                      <div className="rounded-lg border border-gray-200 bg-gray-50/50 overflow-hidden">
                        <div className="p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-400 uppercase tracking-wider">Kund</span>
                            {selectedDeal.customer.customer_type && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                selectedDeal.customer.customer_type === 'company' ? 'bg-teal-50 text-sky-700 border-teal-200' :
                                selectedDeal.customer.customer_type === 'brf' ? 'bg-purple-50 text-purple-600 border-purple-200' :
                                'bg-gray-100 text-gray-500 border-gray-200'
                              }`}>
                                {selectedDeal.customer.customer_type === 'company' ? 'Företag' : selectedDeal.customer.customer_type === 'brf' ? 'BRF' : 'Privat'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2"><User className="w-4 h-4 text-gray-400" /><span className="text-sm font-medium text-gray-900">{selectedDeal.customer.name}</span></div>
                          {selectedDeal.customer.phone_number && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-500">{selectedDeal.customer.phone_number}</span></div>}
                          {selectedDeal.customer.email && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-500 truncate">{selectedDeal.customer.email}</span></div>}
                          {selectedDeal.customer.address_line && <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-500">{selectedDeal.customer.address_line}</span></div>}
                          {selectedDeal.customer.customer_type !== 'private' && selectedDeal.customer.org_number && (
                            <div className="text-xs text-gray-400">Org.nr: {selectedDeal.customer.org_number}</div>
                          )}
                          {selectedDeal.customer.customer_type !== 'private' && selectedDeal.customer.contact_person && (
                            <div className="text-xs text-gray-400">Kontakt: {selectedDeal.customer.contact_person}</div>
                          )}
                          {customerTags.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {customerTags.map((tag, i) => (
                                <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border" style={{ backgroundColor: tag.color + '20', color: tag.color, borderColor: tag.color + '40' }}>
                                  <Tag className="w-2.5 h-2.5" />{tag.name}
                                </span>
                              ))}
                            </div>
                          )}
                          {lastContact && (
                            <div className="text-xs text-gray-400">Senast kontaktad: {new Date(lastContact.date).toLocaleDateString('sv-SE')} ({lastContact.type})</div>
                          )}
                        </div>
                        <Link
                          href={`/dashboard/customers/${selectedDeal.customer.customer_id}`}
                          className="flex items-center justify-between px-4 py-2.5 bg-gray-100/80 border-t border-gray-200 text-sm text-sky-700 hover:bg-teal-50 hover:text-teal-700 transition-colors"
                        >
                          <span className="font-medium">Visa kundkort</span>
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </div>
                    )}

                    {/* Quick actions */}
                    <div className="space-y-2">
                      <h4 className="text-xs text-gray-400 uppercase tracking-wider">Snabbåtgärder</h4>
                      <div className="flex flex-wrap gap-2">
                        <Link href={selectedDeal.quote_id
                          ? `/dashboard/quotes/${selectedDeal.quote_id}`
                          : selectedDeal.customer_id
                            ? `/dashboard/quotes/new?customerId=${selectedDeal.customer_id}&deal_id=${selectedDeal.id}`
                            : `/dashboard/quotes/new?deal_id=${selectedDeal.id}`}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700 hover:border-teal-300 hover:bg-teal-50 transition-colors">
                          <FileText className="w-4 h-4 text-sky-700" /> {selectedDeal.quote_id ? 'Visa offert' : 'Skapa offert'}
                        </Link>
                        <button onClick={() => { setShowSiteVisit(true); setSiteVisitForm({ date: '', time: '09:00', duration: '60', notes: '', sendSms: true }) }}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700 hover:border-teal-300 hover:bg-teal-50 transition-colors">
                          <Calendar className="w-4 h-4 text-teal-600" /> Platsbesök
                        </button>
                        {!getStageForDeal(selectedDeal)?.is_lost && (
                          <button onClick={() => markDealLost(selectedDeal.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-red-600 hover:border-red-300 hover:bg-red-50 transition-colors">
                            <XCircle className="w-4 h-4" /> Markera förlorad
                          </button>
                        )}
                        {/* Visa offert-länk hanteras nu av knappen ovan */}
                  </div>
                </div>

                    {/* Activity log */}
                    <div>
                      <h4 className="text-xs text-gray-400 uppercase tracking-wider mb-3">Aktivitetslogg</h4>
                      {detailLoading ? <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 text-sky-700 animate-spin" /></div>
                        : detailActivities.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">Ingen aktivitet ännu</p>
                        : (
                          <div className="space-y-2">
                            {detailActivities.map(act => (
                              <div key={act.id} className={`flex items-start gap-3 p-3 rounded-lg border ${act.undone_at ? 'bg-gray-50 border-gray-100 opacity-50' : 'bg-gray-50/50 border-gray-200'}`}>
                                <div className="mt-0.5">
                                  {act.triggered_by === 'ai' ? <Bot className="w-4 h-4 text-sky-700" /> : act.triggered_by === 'system' ? <Sparkles className="w-4 h-4 text-gray-400" /> : <User className="w-4 h-4 text-gray-500" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm text-gray-900">{act.description || act.activity_type}</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${getTriggeredByStyle(act.triggered_by)}`}>{getTriggeredByLabel(act.triggered_by)}</span>
                                  </div>
                                  {act.from_stage_name && act.to_stage_name && (
                                    <div className="flex items-center gap-1 mt-1 text-xs text-gray-400"><span>{act.from_stage_name}</span><ArrowRight className="w-3 h-3" /><span>{act.to_stage_name}</span></div>
                                  )}
                                  {act.ai_reason && <p className="text-xs text-gray-400 mt-1">{act.ai_reason}</p>}
                                  <span className="text-xs text-gray-400 mt-1 block">{timeAgo(act.created_at)}</span>
                                </div>
                                {act.triggered_by === 'ai' && !act.undone_at && (
                                  <button onClick={() => undoActivity(act.id)} className="flex-shrink-0 p-1.5 rounded-md bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-900 transition-colors" title="Ångra"><Undo2 className="w-3.5 h-3.5" /></button>
                                )}
                                {act.undone_at && <span className="text-[10px] text-gray-400 italic flex-shrink-0">Ångrad</span>}
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                  </div>
                )}

                {/* TAB: Uppgifter */}
                {dealTab === 'tasks' && (
                  <div className="space-y-4">
                    {/* Add task form */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newTaskTitle}
                          onChange={e => setNewTaskTitle(e.target.value)}
                          placeholder="Ny uppgift..."
                          className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-teal-400"
                          onKeyDown={e => { if (e.key === 'Enter') handleAddTask() }}
                        />
                        <button
                          onClick={handleAddTask}
                          disabled={!newTaskTitle.trim() || taskSaving}
                          className="flex items-center gap-1.5 px-3 py-2 bg-teal-700 text-white text-sm rounded-lg hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                        >
                          {taskSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                          <span className="hidden sm:inline">Lägg till</span>
                        </button>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="date"
                          value={newTaskDueDate}
                          onChange={e => setNewTaskDueDate(e.target.value)}
                          className="px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 focus:outline-none focus:border-teal-400 w-32"
                        />
                        <select
                          value={newTaskDueTime}
                          onChange={e => setNewTaskDueTime(e.target.value)}
                          className="px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 focus:outline-none focus:border-teal-400 w-24"
                        >
                          <option value="">Tid</option>
                          {Array.from({ length: 24 * 4 }, (_, i) => {
                            const h = String(Math.floor(i / 4)).padStart(2, '0')
                            const m = String((i % 4) * 15).padStart(2, '0')
                            return <option key={i} value={`${h}:${m}`}>{h}:{m}</option>
                          })}
                        </select>
                        {teamMembers.length > 0 && (
                          <select
                            value={newTaskAssignee}
                            onChange={e => setNewTaskAssignee(e.target.value)}
                            className="px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 focus:outline-none focus:border-teal-400 flex-1 min-w-[120px]"
                          >
                            <option value="">Tilldela...</option>
                            {teamMembers.map(m => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>

                    {/* Task list */}
                    {dealTasks.length > 0 ? (
                      <div className="space-y-1">
                        {dealTasks.map(task => {
                          const isOverdue = task.due_date && new Date(task.due_date + (task.due_time ? `T${task.due_time}` : 'T23:59:59')) < new Date() && task.status !== 'done'
                          const isExpanded = expandedTaskId === task.id
                          const initials = task.assigned_user?.name
                            ? task.assigned_user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                            : null
                          return (
                            <div key={task.id} className="rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
                              <div className={`flex items-center gap-3 px-3 py-2.5 group ${isOverdue ? 'bg-red-50/50' : ''}`}>
                                <button onClick={() => handleToggleTask(task.id, task.status)} className="flex-shrink-0">
                                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${task.status === 'done' ? 'bg-green-500 border-green-500' : isOverdue ? 'border-red-400 hover:border-red-500' : 'border-gray-300 hover:border-teal-400'}`}>
                                    {task.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                                  </div>
                                </button>
                                <button onClick={() => { if (isExpanded) { setExpandedTaskId(null) } else { setExpandedTaskId(task.id); fetchTaskActivities(task.id) } }} className="flex-1 text-left min-w-0">
                                  <span className={`text-sm block truncate ${task.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{task.title}</span>
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    {task.due_date && (
                                      <span className={`text-[11px] flex items-center gap-0.5 ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                                        <Calendar className="w-3 h-3" />
                                        {new Date(task.due_date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
                                        {task.due_time && ` ${task.due_time.slice(0, 5)}`}
                                        {isOverdue && ' (försenad)'}
                                      </span>
                                    )}
                                    <span className="text-[11px] text-gray-300">
                                      {new Date(task.created_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} {new Date(task.created_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                </button>
                                {initials && (
                                  <div
                                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                                    style={{ backgroundColor: task.assigned_user?.color || '#3B82F6' }}
                                    title={task.assigned_user?.name || ''}
                                  >
                                    {initials}
                                  </div>
                                )}
                                <button onClick={() => handleDeleteTask(task.id)} className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0" title="Ta bort">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              {/* Expanded detail with activity timeline */}
                              {isExpanded && (
                                <div className="px-3 pb-3 border-t border-gray-100">
                                  <div className="flex items-center gap-2 mt-2 mb-2 flex-wrap">
                                    {teamMembers.length > 0 && (
                                      <select
                                        value={task.assigned_to || ''}
                                        onChange={async e => {
                                          const val = e.target.value || null
                                          await fetch('/api/tasks', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, assigned_to: val }) })
                                          if (selectedDeal) fetchDealTasks(selectedDeal.id)
                                          fetchTaskActivities(task.id)
                                        }}
                                        className="px-2 py-1 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600 focus:outline-none focus:border-teal-400"
                                      >
                                        <option value="">Ej tilldelad</option>
                                        {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                      </select>
                                    )}
                                    <select
                                      value={task.priority}
                                      onChange={async e => {
                                        await fetch('/api/tasks', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, priority: e.target.value }) })
                                        if (selectedDeal) fetchDealTasks(selectedDeal.id)
                                        fetchTaskActivities(task.id)
                                      }}
                                      className="px-2 py-1 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600 focus:outline-none focus:border-teal-400"
                                    >
                                      <option value="low">Låg</option>
                                      <option value="medium">Medium</option>
                                      <option value="high">Hög</option>
                                    </select>
                                  </div>
                                  {/* Activity timeline */}
                                  <div className="mt-2">
                                    <span className="text-[10px] text-gray-400 uppercase tracking-wider">Händelselogg</span>
                                    {taskActivities.length > 0 ? (
                                      <div className="mt-1 space-y-1">
                                        {taskActivities.map(act => (
                                          <div key={act.id} className="flex items-start gap-2 text-[11px]">
                                            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                                              act.action === 'created' ? 'bg-teal-600' :
                                              act.action === 'completed' ? 'bg-green-500' :
                                              act.action === 'assigned' ? 'bg-purple-500' :
                                              act.action === 'deleted' ? 'bg-red-500' :
                                              'bg-gray-400'
                                            }`} />
                                            <div className="flex-1 min-w-0">
                                              <span className="text-gray-600">{act.description}</span>
                                              <span className="text-gray-300 ml-1.5">
                                                {new Date(act.created_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} {new Date(act.created_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                                              </span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-[11px] text-gray-300 mt-1">Ingen aktivitet ännu</p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <CheckSquare className="w-8 h-8 mb-2 opacity-40" />
                        <p className="text-sm">Inga uppgifter ännu</p>
                        <p className="text-xs mt-1">Lägg till en uppgift ovan</p>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: Dokument */}
                {dealTab === 'documents' && (
                  <div className="space-y-4">
                    {/* Upload area */}
                    <div className="flex items-center gap-2">
                      <select
                        value={dealUploadCategory}
                        onChange={(e) => setDealUploadCategory(e.target.value)}
                        className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm focus:outline-none focus:border-teal-400"
                      >
                        <option value="drawing">Ritning</option>
                        <option value="sketch">Skiss</option>
                        <option value="description">Beskrivning</option>
                        <option value="contract">Kontrakt</option>
                        <option value="photo">Foto</option>
                        <option value="other">Övrigt</option>
                      </select>
                      <label className="flex items-center gap-1.5 px-4 py-2 bg-teal-50 border border-teal-200 rounded-lg text-sm text-sky-700 font-medium hover:bg-teal-100 cursor-pointer transition-colors">
                        {dealUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {dealUploading ? 'Laddar upp...' : 'Ladda upp fil'}
                        <input type="file" className="hidden" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={handleDealFileUpload} disabled={dealUploading} />
                      </label>
                      {selectedDeal.customer_id && (
                        <Link href={`/dashboard/customers/${selectedDeal.customer_id}?tab=documents`} className="ml-auto text-xs text-sky-700 hover:text-teal-600">
                          Visa alla i kundkort
                        </Link>
                      )}
                    </div>

                    {/* Document list */}
                    {dealDocuments.length > 0 ? (
                      <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                        {dealDocuments.map((doc) => (
                          <div key={doc.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                              {doc.file_type?.startsWith('image/') ? (
                                <ImageIcon className="w-4 h-4 text-teal-600" />
                              ) : doc.file_type?.includes('pdf') ? (
                                <FileText className="w-4 h-4 text-red-500" />
                              ) : (
                                <FileIcon className="w-4 h-4 text-gray-400" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-900 truncate">{doc.file_name}</p>
                              <div className="flex items-center gap-2 text-xs text-gray-400">
                                <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">
                                  {{ drawing: 'Ritning', sketch: 'Skiss', description: 'Beskrivning', contract: 'Kontrakt', photo: 'Foto', other: 'Övrigt' }[doc.category] || doc.category}
                                </span>
                                {doc.file_size && <span>{formatFileSize(doc.file_size)}</span>}
                                <span>{new Date(doc.uploaded_at).toLocaleDateString('sv-SE')}</span>
                              </div>
                            </div>
                            <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-400 hover:text-sky-700 rounded-lg hover:bg-teal-50 transition-colors" title="Öppna">
                              <Download className="w-4 h-4" />
                            </a>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <Upload className="w-8 h-8 mb-2 opacity-40" />
                        <p className="text-sm">Inga dokument ännu</p>
                        <p className="text-xs mt-1">Ladda upp dokument med knappen ovan</p>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: Anteckningar */}
                {dealTab === 'messages' && (
                  <div className="space-y-4">
                    {/* Add note form */}
                    <div className="flex gap-2">
                      <textarea
                        value={newNoteContent}
                        onChange={e => setNewNoteContent(e.target.value)}
                        placeholder="Skriv en anteckning..."
                        className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-teal-400 resize-none"
                        rows={3}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote() }}
                      />
                      <button
                        onClick={handleAddNote}
                        disabled={!newNoteContent.trim() || noteSaving}
                        className="self-end px-4 py-2 bg-teal-700 text-white text-sm rounded-lg hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {noteSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Spara'}
                      </button>
                    </div>

                    {/* Notes list */}
                    {dealNotes.length > 0 && (
                      <div className="space-y-3">
                        {dealNotes.map(note => (
                          <div key={note.id} className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 group">
                            {editingNoteId === note.id ? (
                              <div className="space-y-2">
                                <textarea
                                  value={editNoteContent}
                                  onChange={e => setEditNoteContent(e.target.value)}
                                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-teal-400 resize-none"
                                  rows={4}
                                />
                                <div className="flex gap-2">
                                  <button onClick={() => handleUpdateNote(note.id)} className="px-3 py-1.5 text-xs bg-teal-700 text-white rounded-lg hover:bg-teal-800">Spara</button>
                                  <button onClick={() => { setEditingNoteId(null); setEditNoteContent('') }} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Avbryt</button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                                <div className="flex items-center justify-between mt-3">
                                  <span className="text-xs text-gray-400">
                                    {note.created_by && <span className="mr-1">{note.created_by} &middot;</span>}
                                    {timeAgo(note.created_at)}
                                  </span>
                                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => { setEditingNoteId(note.id); setEditNoteContent(note.content) }} className="p-1.5 text-gray-400 hover:text-sky-700 rounded-lg hover:bg-teal-50 transition-colors" title="Redigera"><Edit3 className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => handleDeleteNote(note.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors" title="Ta bort"><Trash2 className="w-3.5 h-3.5" /></button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Gmail threads */}
                    {(dealEmailThreads.length > 0 || dealEmailLoading) && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-purple-500" />
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">E-post</span>
                          {dealEmailLoading && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                        </div>
                        {dealEmailThreads.map(thread => (
                          <div key={thread.threadId} className="rounded-lg border border-purple-100 bg-purple-50/30 p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{thread.subject}</p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {extractEmailName(thread.from)}
                                  {thread.messageCount > 1 && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">
                                      {thread.messageCount} meddelanden
                                    </span>
                                  )}
                                </p>
                              </div>
                              <span className="text-[10px] text-gray-400 whitespace-nowrap">
                                {timeAgo(thread.date)}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{thread.snippet}</p>
                            <button
                              onClick={() => fetchDealThreadMessages(thread.threadId)}
                              className="mt-2 text-xs text-purple-600 hover:text-purple-500 flex items-center gap-1"
                            >
                              {dealThreadLoading && dealExpandedThread === thread.threadId ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Mail className="w-3 h-3" />
                              )}
                              {dealExpandedThread === thread.threadId && dealThreadMessages[thread.threadId] ? 'Dölj' : 'Visa konversation'}
                            </button>
                            {dealExpandedThread === thread.threadId && dealThreadMessages[thread.threadId] && (
                              <div className="mt-3 space-y-2">
                                {dealThreadMessages[thread.threadId].map((msg, idx) => (
                                  <div key={msg.messageId || idx} className="p-3 bg-white rounded-lg border border-gray-100">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-xs font-medium text-gray-700">{extractEmailName(msg.from)}</span>
                                      <span className="text-[10px] text-gray-400">{timeAgo(msg.date)}</span>
                                    </div>
                                    <div className="text-xs text-gray-600 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                                      {msg.bodyText || msg.snippet}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Empty state - only when no notes AND no emails */}
                    {dealNotes.length === 0 && dealEmailThreads.length === 0 && !dealEmailLoading && (
                      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <MessageSquare className="w-8 h-8 mb-2 opacity-40" />
                        <p className="text-sm">Inga anteckningar ännu</p>
                        <p className="text-xs mt-1">Skriv en anteckning ovan</p>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: Rityta */}
                {dealTab === 'canvas' && selectedDeal && (
                  <div className="h-[500px]">
                    <ProjectCanvas
                      entityType="lead"
                      entityId={selectedDeal.id}
                      title={`Skiss — ${selectedDeal.title}`}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* New Deal Modal */}
      {showNewDeal && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => setShowNewDeal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10 rounded-t-2xl">
                <h2 className="text-lg font-bold text-gray-900">Ny deal</h2>
                <button onClick={() => { setShowNewDeal(false); setNewDealFiles([]) }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Titel *</label>
                  <input type="text" value={newDealForm.title} onChange={e => setNewDealForm(prev => ({ ...prev, title: e.target.value }))} placeholder="T.ex. Badrumsrenovering Andersson"
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-teal-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Kund</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" value={customerSearch}
                      onChange={e => {
                        setCustomerSearch(e.target.value)
                        setShowCustomerDropdown(true)
                        setShowNewCustomerForm(false)
                        if (newDealForm.customer_id) setNewDealForm(prev => ({ ...prev, customer_id: '' }))
                      }}
                      onFocus={() => { if (customerSearch && !newDealForm.customer_id) setShowCustomerDropdown(true) }}
                      placeholder="Sök kund..."
                      className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-teal-400" />
                  </div>
                  {newDealForm.customer_id && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                      <span className="text-xs text-teal-700 font-medium">{customers.find(c => c.customer_id === newDealForm.customer_id)?.name || customerSearch}</span>
                      <button onClick={() => { setNewDealForm(prev => ({ ...prev, customer_id: '' })); setCustomerSearch('') }} className="text-xs text-gray-400 hover:text-gray-900"><X className="w-3 h-3" /></button>
                    </div>
                  )}
                  {showCustomerDropdown && customerSearch && !newDealForm.customer_id && (
                    <div className="mt-1 max-h-40 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                      {filteredCustomers.slice(0, 8).map(c => (
                        <button key={c.customer_id} onClick={() => { setNewDealForm(prev => ({ ...prev, customer_id: c.customer_id })); setCustomerSearch(c.name || ''); setShowCustomerDropdown(false) }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-900 hover:bg-gray-50 transition-colors flex items-center justify-between">
                          <span>{c.name}</span><span className="text-xs text-gray-400">{c.phone_number}</span>
                        </button>
                      ))}
                      {filteredCustomers.length === 0 && (
                        <>
                          <div className="px-3 py-2 text-xs text-gray-400">Inga kunder hittades för &ldquo;{customerSearch}&rdquo;</div>
                          <button
                            onClick={() => {
                              setShowCustomerDropdown(false)
                              setShowNewCustomerForm(true)
                              const parts = customerSearch.trim().split(/\s+/)
                              setNewCustomerForm({ firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '', phone: '', email: '' })
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-teal-700 font-medium hover:bg-teal-50 transition-colors flex items-center gap-2 border-t border-gray-100">
                            <Plus className="w-3.5 h-3.5" /> Skapa ny kund: &ldquo;{customerSearch}&rdquo;
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {showNewCustomerForm && !newDealForm.customer_id && (
                    <div className="mt-2 p-3 bg-teal-50/50 border border-teal-200 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-teal-800">Ny kund</span>
                        <button onClick={() => setShowNewCustomerForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" value={newCustomerForm.firstName} onChange={e => setNewCustomerForm(prev => ({ ...prev, firstName: e.target.value }))} placeholder="Förnamn *"
                          className="px-2.5 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-teal-400" />
                        <input type="text" value={newCustomerForm.lastName} onChange={e => setNewCustomerForm(prev => ({ ...prev, lastName: e.target.value }))} placeholder="Efternamn"
                          className="px-2.5 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-teal-400" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="tel" value={newCustomerForm.phone} onChange={e => setNewCustomerForm(prev => ({ ...prev, phone: e.target.value }))} placeholder="Telefon *"
                          className="px-2.5 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-teal-400" />
                        <input type="email" value={newCustomerForm.email} onChange={e => setNewCustomerForm(prev => ({ ...prev, email: e.target.value }))} placeholder="E-post (valfritt)"
                          className="px-2.5 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-teal-400" />
                      </div>
                      <button
                        onClick={async () => {
                          const fullName = [newCustomerForm.firstName, newCustomerForm.lastName].filter(Boolean).join(' ').trim()
                          if (!fullName) { showToast('Ange ett namn', 'error'); return }
                          if (!newCustomerForm.phone.trim()) { showToast('Ange telefonnummer', 'error'); return }
                          setNewCustomerSubmitting(true)
                          try {
                            const res = await fetch('/api/customers', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                name: fullName,
                                phone_number: newCustomerForm.phone.trim(),
                                email: newCustomerForm.email.trim() || null,
                              })
                            })
                            if (!res.ok) throw new Error()
                            const data = await res.json()
                            const created = data.customer
                            setCustomers(prev => [{ customer_id: created.customer_id, name: created.name, phone_number: created.phone_number || '', email: created.email }, ...prev])
                            setNewDealForm(prev => ({ ...prev, customer_id: created.customer_id }))
                            setCustomerSearch(created.name)
                            setShowNewCustomerForm(false)
                            setNewCustomerForm({ firstName: '', lastName: '', phone: '', email: '' })
                            showToast('Kund skapad', 'success')
                          } catch {
                            showToast('Kunde inte skapa kund', 'error')
                          } finally {
                            setNewCustomerSubmitting(false)
                          }
                        }}
                        disabled={newCustomerSubmitting || !newCustomerForm.firstName.trim() || !newCustomerForm.phone.trim()}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium transition-all disabled:opacity-50">
                        {newCustomerSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Skapa och välj
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Värde (kr)</label>
                    <input type="number" value={newDealForm.value} onChange={e => setNewDealForm(prev => ({ ...prev, value: e.target.value }))} placeholder="0"
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Prioritet</label>
                    <select value={newDealForm.priority} onChange={e => setNewDealForm(prev => ({ ...prev, priority: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-teal-400">
                      <option value="low">Låg</option><option value="medium">Medium</option><option value="high">Hög</option><option value="urgent">Brådskande</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Beskrivning</label>
                  <textarea value={newDealForm.description} onChange={e => setNewDealForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Kort beskrivning..." rows={2}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-teal-400 resize-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Dokument (valfritt)</label>
                  <label className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 border-dashed rounded-lg cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 transition-colors">
                    <Upload className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-500">Bifoga fil</span>
                    <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" className="hidden"
                      onChange={e => {
                        const files = e.target.files
                        if (!files) return
                        setNewDealFiles(prev => [...prev, ...Array.from(files).filter(f => f.size <= 10 * 1024 * 1024)])
                        e.target.value = ''
                      }} />
                    <span className="text-xs text-gray-400 ml-auto">PDF, bilder, Word (max 10 MB)</span>
                  </label>
                  {newDealFiles.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {newDealFiles.map((f, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-200 rounded-full text-xs text-gray-700">
                          <FileIcon className="w-3 h-3 text-gray-400" />
                          {f.name.length > 25 ? f.name.slice(0, 22) + '...' : f.name}
                          <button onClick={() => setNewDealFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-gray-700"><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
                <button onClick={() => { setShowNewDeal(false); setNewDealFiles([]) }} className="px-4 py-2 rounded-lg bg-gray-100 border border-gray-200 text-sm text-gray-600 hover:text-gray-900 transition-colors">Avbryt</button>
                <button onClick={createDeal} disabled={newDealSubmitting || !newDealForm.title.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium transition-all disabled:opacity-50">
                  {newDealSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Skapa deal
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Stage Settings Modal */}
      {showStageSettings && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
          <div className="bg-white border border-gray-200 rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Hantera pipeline-steg</h3>
              <button onClick={() => setShowStageSettings(false)} className="text-gray-400 hover:text-gray-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 mb-6">
              {stages
                .filter(s => !s.is_won && !s.is_lost)
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((stage, idx, arr) => (
                <div key={stage.id} className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
                  <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />

                  {/* Color picker */}
                  <input
                    type="color"
                    value={stageEdits[stage.id]?.color || stage.color}
                    onChange={(e) => setStageEdits(prev => ({ ...prev, [stage.id]: { ...prev[stage.id], color: e.target.value } }))}
                    className="w-6 h-6 rounded-md border border-gray-200 cursor-pointer flex-shrink-0"
                    style={{ padding: 0 }}
                  />

                  {/* Name input */}
                  <input
                    type="text"
                    value={stageEdits[stage.id]?.name || stage.name}
                    onChange={(e) => setStageEdits(prev => ({ ...prev, [stage.id]: { ...prev[stage.id], name: e.target.value } }))}
                    className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  />

                  {/* Reorder */}
                  <button onClick={() => moveStageOrder(stage.id, 'up')} disabled={idx === 0}
                    className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded-lg hover:bg-gray-100 transition-all">
                    <MoveUp className="w-4 h-4" />
                  </button>
                  <button onClick={() => moveStageOrder(stage.id, 'down')} disabled={idx === arr.length - 1}
                    className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded-lg hover:bg-gray-100 transition-all">
                    <MoveDown className="w-4 h-4" />
                  </button>

                  {/* Delete */}
                  <button onClick={() => deleteStage(stage.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-all"
                    title="Ta bort steg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {/* System stages (non-editable name) */}
              {stages.filter(s => s.is_won || s.is_lost).sort((a, b) => a.sort_order - b.sort_order).map(stage => (
                <div key={stage.id} className="flex items-center gap-2 p-3 bg-gray-50/50 rounded-xl opacity-70">
                  <div className="w-4" />
                  <span className="w-6 h-6 rounded-md flex-shrink-0" style={{ backgroundColor: stage.color }} />
                  <span className="flex-1 text-sm text-gray-500 px-3 py-1.5">{stage.name}</span>
                  <span className="text-xs text-gray-400 px-2">Systemsteg</span>
                </div>
              ))}
            </div>

            {/* Add new stage */}
            <div className="flex items-center gap-2 mb-6">
              <input
                type="text"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="Nytt steg, t.ex. 'Platsbedömning'"
                className="flex-1 px-4 py-2.5 bg-gray-100 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 min-h-[44px]"
                onKeyDown={(e) => e.key === 'Enter' && addNewStage()}
              />
              <button
                onClick={addNewStage}
                disabled={stageSaving || !newStageName.trim()}
                className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 rounded-xl text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                Lägg till
              </button>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setShowStageSettings(false)} className="px-4 py-2.5 text-gray-500 hover:text-gray-900 min-h-[44px]">
                Avbryt
              </button>
              <button
                onClick={saveStageEdits}
                disabled={stageSaving}
                className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50 min-h-[44px]"
              >
                {stageSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Spara ändringar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loss Reason Modal */}
      {showLossModal && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]" onClick={() => setShowLossModal(false)} />
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-900">Varför förlorades denna deal?</h2>
                <button onClick={() => setShowLossModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-3">
                {LOSS_REASONS.map(r => (
                  <label key={r.value} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${lossReason === r.value ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <input type="radio" name="loss_reason" value={r.value} checked={lossReason === r.value} onChange={() => setLossReason(r.value)} className="text-red-600 focus:ring-red-500" />
                    <span className="text-sm text-gray-700">{r.label}</span>
                  </label>
                ))}
                {lossReason === 'other' && (
                  <textarea
                    value={lossReasonDetail}
                    onChange={e => setLossReasonDetail(e.target.value)}
                    placeholder="Beskriv orsaken..."
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-red-400 resize-none"
                    rows={2}
                  />
                )}
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
                <button onClick={() => setShowLossModal(false)} className="px-4 py-2 rounded-lg bg-gray-100 border border-gray-200 text-sm text-gray-600 hover:text-gray-900 transition-colors">Avbryt</button>
                <button
                  onClick={confirmLossReason}
                  disabled={!lossReason}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  Markera förlorad
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Quick SMS Modal */}
      {quickSmsTarget && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40" onClick={() => setQuickSmsTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-1">SMS till {quickSmsTarget.name}</h3>
            <p className="text-xs text-gray-400 mb-3">{quickSmsTarget.phone}</p>
            <textarea
              value={quickSmsText}
              onChange={e => setQuickSmsText(e.target.value)}
              placeholder="Skriv ditt meddelande..."
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none resize-none"
              rows={3}
              maxLength={320}
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">{quickSmsText.length}/320</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={sendQuickSms}
                disabled={!quickSmsText.trim() || quickSmsSending}
                className="flex-1 bg-teal-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {quickSmsSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                Skicka
              </button>
              <button onClick={() => setQuickSmsTarget(null)} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Avbryt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.show && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100]">
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border shadow-xl text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-900'}`}>
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4" />}
            {toast.message}
          </div>
        </div>
      )}
      {/* Site Visit Modal */}
      {showSiteVisit && selectedDeal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) setShowSiteVisit(false) }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Boka platsbesök</h3>
            <p className="text-sm text-gray-500 mb-4">{selectedDeal.title}{selectedDeal.customer?.name ? ` · ${selectedDeal.customer.name}` : ''}</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Datum *</label>
                  <input type="date" value={siteVisitForm.date} onChange={e => setSiteVisitForm(p => ({ ...p, date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tid</label>
                  <input type="time" value={siteVisitForm.time} onChange={e => setSiteVisitForm(p => ({ ...p, time: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Längd</label>
                <select value={siteVisitForm.duration} onChange={e => setSiteVisitForm(p => ({ ...p, duration: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                  <option value="30">30 min</option>
                  <option value="60">1 timme</option>
                  <option value="90">1,5 timmar</option>
                  <option value="120">2 timmar</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Anteckning</label>
                <input type="text" value={siteVisitForm.notes} onChange={e => setSiteVisitForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="T.ex. adress eller vad som ska inspekteras"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              {selectedDeal.customer?.phone_number && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={siteVisitForm.sendSms} onChange={e => setSiteVisitForm(p => ({ ...p, sendSms: e.target.checked }))}
                    className="rounded border-gray-300 text-teal-700 focus:ring-teal-500" />
                  <span className="text-sm text-gray-600">Skicka SMS till kund</span>
                </label>
              )}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={bookSiteVisit} disabled={siteVisitSaving || !siteVisitForm.date}
                className="flex-1 bg-teal-700 text-white py-2.5 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-teal-800 transition-colors">
                {siteVisitSaving ? 'Bokar...' : 'Boka platsbesök'}
              </button>
              <button onClick={() => setShowSiteVisit(false)} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500">
                Avbryt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Deal Card
// ---------------------------------------------------------------------------

interface DealCardProps {
  deal: Deal
  isDragging: boolean
  onDragStart: (e: React.DragEvent, dealId: string) => void
  onDragEnd: () => void
  onClick: () => void
  onQuickSms?: (deal: Deal) => void
  onOpenTasks?: (deal: Deal) => void
}

function DealCard({ deal, isDragging, onDragStart, onDragEnd, onClick, onQuickSms, onOpenTasks }: DealCardProps) {
  return (
    <div draggable onDragStart={e => onDragStart(e, deal.id)} onDragEnd={onDragEnd} onClick={onClick}
      className={`group relative p-3 rounded-lg border border-gray-200 bg-white shadow-sm cursor-pointer transition-all hover:shadow-md hover:border-gray-300 ${isDragging ? 'opacity-40 scale-95 rotate-1' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-[10px] text-gray-400 font-mono ml-3.5">
            D-{deal.id.slice(0, 6)}
            {deal.customer?.customer_number && ` · ${deal.customer.customer_number}`}
          </span>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getPriorityDot(deal.priority)}`} />
            <h4 className="text-sm font-medium text-gray-900 truncate">{deal.title}</h4>
            {(deal.source === 'ai' || deal.source === 'call') && <span title="AI-skapad"><Bot className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" /></span>}
            {deal.lead_source_platform && <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded-full flex-shrink-0 ${
              deal.lead_source_platform === 'offerta' ? 'bg-orange-100 text-orange-700' :
              deal.lead_source_platform === 'servicefinder' ? 'bg-teal-100 text-teal-700' :
              deal.lead_source_platform === 'byggahus' ? 'bg-yellow-100 text-yellow-700' :
              'bg-gray-100 text-gray-600'
            }`}>{
              deal.lead_source_platform === 'offerta' ? 'Offerta' :
              deal.lead_source_platform === 'servicefinder' ? 'SF' :
              deal.lead_source_platform === 'byggahus' ? 'Byggahus' :
              deal.lead_source_platform
            }</span>}
            {!deal.lead_source_platform && deal.source && !['manual', 'ai', 'call', 'website_form', 'vapi_call', 'inbound_sms'].includes(deal.source) && (
              <span className="px-1.5 py-0.5 text-[9px] font-medium rounded-full flex-shrink-0 bg-violet-100 text-violet-700">
                via {deal.source}
              </span>
            )}
          </div>
          {deal.customer?.name && <p className="text-xs text-gray-500 mt-0.5 truncate ml-3.5">{deal.customer.customer_number && <span className="font-medium">{deal.customer.customer_number} · </span>}{deal.customer.name}</p>}
          {deal.description && !deal.customer?.name && <p className="text-xs text-gray-400 mt-0.5 truncate ml-3.5">{deal.description}</p>}
        </div>
        <GripVertical className="w-4 h-4 text-gray-200 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
      </div>
      <div className="flex items-center justify-between mt-2 ml-3.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-gray-700">{deal.value != null && deal.value > 0 ? formatValueCompact(deal.value) : ''}</span>{deal.value != null && deal.value > 0 && <span className="text-[9px] text-gray-400 ml-0.5">exkl.</span>}
          {deal.lead_temperature && <span className={`w-1.5 h-1.5 rounded-full ${deal.lead_temperature === 'hot' ? 'bg-red-500' : deal.lead_temperature === 'warm' ? 'bg-amber-500' : 'bg-teal-500'}`} title={deal.lead_temperature === 'hot' ? 'Het lead' : deal.lead_temperature === 'warm' ? 'Varm lead' : 'Kall lead'} />}
        </div>
        <div className="flex items-center gap-2">
          {deal.response_time_seconds != null && deal.response_time_seconds > 0 && (
            <span className={`text-[10px] flex items-center gap-0.5 ${deal.response_time_seconds < 60 ? 'text-green-500' : deal.response_time_seconds < 3600 ? 'text-amber-500' : 'text-red-400'}`} title="Svarstid">
              <Zap className="w-2.5 h-2.5" />{deal.response_time_seconds < 60 ? `${deal.response_time_seconds}s` : deal.response_time_seconds < 3600 ? `${Math.round(deal.response_time_seconds / 60)}m` : `${Math.round(deal.response_time_seconds / 3600)}h`}
            </span>
          )}
          <span className="text-[10px] text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(deal.updated_at)}</span>
        </div>
      </div>

      {/* Snabbknappar — hover desktop, alltid mobil */}
      <div className="flex items-center justify-around mt-2 pt-2 border-t border-gray-100 opacity-0 group-hover:opacity-100 md:transition-opacity" onClick={e => e.stopPropagation()}>
        {deal.customer?.phone_number && (
          <a href={`tel:${deal.customer.phone_number}`} className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-teal-600 transition-colors" title="Ring">
            <Phone className="w-3.5 h-3.5" />
            <span className="text-[10px]">Ring</span>
          </a>
        )}
        {deal.customer?.phone_number && onQuickSms && (
          <button onClick={() => onQuickSms(deal)} className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-teal-600 transition-colors" title="SMS">
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="text-[10px]">SMS</span>
          </button>
        )}
        {deal.customer?.address_line ? (
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(deal.customer.address_line)}`}
            target="_blank" rel="noopener noreferrer"
            className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-teal-600 transition-colors" title={deal.customer.address_line} onClick={e => e.stopPropagation()}>
            <MapPin className="w-3.5 h-3.5" />
            <span className="text-[10px]">Karta</span>
          </a>
        ) : (
          <Link href={deal.quote_id
            ? `/dashboard/quotes/${deal.quote_id}`
            : `/dashboard/quotes/new?customer_id=${deal.customer_id || ''}&title=${encodeURIComponent(deal.title || '')}&deal_id=${deal.id}`}
            className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-teal-600 transition-colors" title={deal.quote_id ? 'Visa offert' : 'Skapa offert'} onClick={e => e.stopPropagation()}>
            <FileText className="w-3.5 h-3.5" />
            <span className="text-[10px]">{deal.quote_id ? 'Offert' : 'Ny offert'}</span>
          </Link>
        )}
        {onOpenTasks && (
          <button onClick={() => onOpenTasks(deal)} className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-purple-600 transition-colors" title="Uppgifter">
            <CheckSquare className="w-3.5 h-3.5" />
            <span className="text-[10px]">Uppgifter</span>
          </button>
        )}
      </div>
    </div>
  )
}
