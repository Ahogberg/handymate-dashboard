'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
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
  Lock,
  Eye,
  ChevronLeft,
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
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { getLeadCategory } from '@/lib/lead-categories'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { SCORE_FACTOR_LABELS, getTemperatureLabel, getTemperatureColor, LOSS_REASONS } from '@/lib/lead-scoring'
import { todayDateStr, nowTimeStr } from '@/lib/datetime-defaults'
import TaskPresetPicker from '@/components/TaskPresetPicker'
import SmartTaskTitleInput from '@/components/SmartTaskTitleInput'
import { TimelineView } from './components/TimelineView'
import FlowPipeline from '@/components/pipeline/unified/FlowPipeline'
import { ProjectStageModal } from '@/components/pipeline/unified/ProjectStageModal'
import { PipelineStats as PipelineStatsView } from './components/PipelineStats'
import { PipelineHeader } from './components/PipelineHeader'
import { SiteVisitModal } from './components/SiteVisitModal'
import { LossModal } from './components/LossModal'
import { QuickSmsModal } from './components/QuickSmsModal'
import { StageSettingsModal } from './components/StageSettingsModal'
import { NewDealModal } from './components/NewDealModal'
import { DealCard } from './components/DealCard'
import { KanbanView } from './components/KanbanView'
import { DealModal } from './components/DealModal'
import { CopyId } from '@/components/CopyId'
import { DealTimeline } from '@/components/pipeline/DealTimeline'
import type {
  Stage,
  Deal,
  CustomerDocument,
  Task,
  TaskActivity,
  TeamMember,
  DealNote,
  CustomerTag,
  Activity,
  PipelineStats,
  Toast,
  CustomerOption,
} from './types'
import {
  formatValue,
  formatValueCompact,
  formatColumnValue,
  timeAgo,
  getPriorityDot,
  getPriorityLabel,
  getPriorityBadgeStyle,
  getTriggeredByLabel,
  getTriggeredByStyle,
} from './helpers'
import { PipelineProvider, type PipelineContextValue } from './context'

const ProjectCanvas = dynamic(() => import('@/components/project/ProjectCanvas'), {
  loading: () => (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
    </div>
  ),
  ssr: false,
})

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function PipelinePage() {
  const business = useBusiness()
  const searchParams = useSearchParams()

  const [stages, setStages] = useState<Stage[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [orphanProjects, setOrphanProjects] = useState<NonNullable<Deal['project']>[]>([])
  const [stats, setStats] = useState<PipelineStats | null>(null)
  const [aiActivities, setAiActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  const [draggingDealId, setDraggingDealId] = useState<string | null>(null)
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null)

  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)
  // ProjectStageModal — projektet vars stage-tidslinje vi visar i en modal
  const [openProjectStageId, setOpenProjectStageId] = useState<string | null>(null)
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
  const [showDealTaskPresetPicker, setShowDealTaskPresetPicker] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDescription, setNewTaskDescription] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [newTaskDueDate, setNewTaskDueDate] = useState(todayDateStr())
  const [newTaskDueTime, setNewTaskDueTime] = useState(nowTimeStr())
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
  const [newDealForm, setNewDealForm] = useState({ title: '', customer_id: '', value: '', priority: 'medium', description: '', job_type: '', source: '', assigned_to: '' })
  const [leadSourceOptions, setLeadSourceOptions] = useState<Array<{ id: string; name: string; source_type: string; color: string | null }>>([])
  const [jobTypeOptions, setJobTypeOptions] = useState<Array<{ id: string; name: string; slug: string; color: string }>>([])
  const [jobTypes, setJobTypes] = useState<string[]>([])
  const [newDealSubmitting, setNewDealSubmitting] = useState(false)
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false)
  const [newCustomerForm, setNewCustomerForm] = useState({ firstName: '', lastName: '', phone: '', email: '' })
  const [newCustomerSubmitting, setNewCustomerSubmitting] = useState(false)
  const [newDealFiles, setNewDealFiles] = useState<File[]>([])
  const [newDealUploading, setNewDealUploading] = useState(false)
  // Efter ny deal skapas öppnas TaskPresetPicker automatiskt med dessa context-data.
  // Tidigare visades NextStepPrompt med en hårdkodad strängsuggestion via
  // getSuggestedTask() — ersatt av multi-select från task-biblioteket.
  const [pendingNewDealTasks, setPendingNewDealTasks] = useState<{
    dealId: string
    dealTitle: string
    customerId: string | null
  } | null>(null)

  // View toggle
  const [pipelineView, setPipelineView] = useState<'kanban' | 'timeline' | 'flow'>('flow')

  // Site visit booking
  const [showSiteVisit, setShowSiteVisit] = useState(false)
  const [siteVisitForm, setSiteVisitForm] = useState({ date: '', time: '09:00', duration: '60', notes: '', sendSms: true, invitedTeam: [] as string[], externalUe: '' })
  const [siteVisitTeam, setSiteVisitTeam] = useState<Array<{ id: string; name: string; phone: string | null }>>([])
  const [siteVisitTeamLoaded, setSiteVisitTeamLoaded] = useState(false)
  const [siteVisitSaving, setSiteVisitSaving] = useState(false)

  // Stage management
  const [showStageSettings, setShowStageSettings] = useState(false)
  const [stageEdits, setStageEdits] = useState<Record<string, { name: string; color: string }>>({})
  const [newStageName, setNewStageName] = useState('')
  const [stageSaving, setStageSaving] = useState(false)

  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [filterSearch, setFilterSearch] = useState('')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [filterCustomerType, setFilterCustomerType] = useState<string>('all')
  const [filterAssignedTo, setFilterAssignedTo] = useState<string>('all')
  const [filterSource, setFilterSource] = useState<string>('all')
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
      // Parallell fetch: `/api/pipeline` ger stages + stats + grupperade deals,
      // `/api/pipeline/deals` ger samma deals BERIKADE med project (deal.project)
      // samt orphanProjects (aktiva projekt utan deal_id) — båda används av Flödet.
      const [pipelineRes, dealsRes] = await Promise.all([
        fetch(`/api/pipeline?business_id=${business.business_id}`),
        fetch(`/api/pipeline/deals?business_id=${business.business_id}`),
      ])
      if (!pipelineRes.ok) throw new Error('Failed to fetch pipeline')
      const data = await pipelineRes.json()
      setStages((data.stages || []).sort((a: Stage, b: Stage) => a.sort_order - b.sort_order))
      setStats(data.stats || null)

      // Default: deals från `/api/pipeline` (utan project). Om `/api/pipeline/deals`
      // svarade OK byter vi mot de berikade dealsen så `deal.project` är satt.
      let flatDeals: Deal[] = Object.values(data.deals || {}).flat() as Deal[]
      if (dealsRes.ok) {
        const dealsData = await dealsRes.json()
        const enriched: Deal[] = Array.isArray(dealsData.deals) ? dealsData.deals : []
        if (enriched.length > 0) {
          // Merge: behåll customer/category från /api/pipeline (kommer inte från
          // /api/pipeline/deals) men ta project från berikningen.
          const projectByDealId: Record<string, any> = {}
          for (const d of enriched) projectByDealId[d.id] = (d as any).project || null
          flatDeals = flatDeals.map(d => ({ ...d, project: projectByDealId[d.id] || null }))
        }
        setOrphanProjects(Array.isArray(dealsData.orphanProjects) ? dealsData.orphanProjects : [])
      }
      setDeals(flatDeals)
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
        id: m.id, name: m.name, color: m.color || '#3B82F6', role: m.role, specialties: m.specialties || []
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

  // Skapa flera uppgifter på dealen samtidigt (från preset-picker)
  const createDealTaskBatch = useCallback(async (tasks: import('@/components/TaskPresetPicker').PickedTask[]) => {
    if (!selectedDeal || tasks.length === 0) return
    try {
      const res = await fetch('/api/tasks/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tasks,
          defaults: {
            deal_id: selectedDeal.id,
            customer_id: selectedDeal.customer_id || null,
            visibility: 'team',
          },
        }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      const count = (data.created || []).length
      fetchDealTasks(selectedDeal.id)
      showToast(`${count} ${count === 1 ? 'uppgift' : 'uppgifter'} skapad${count === 1 ? '' : 'a'}`, 'success')
    } catch {
      showToast('Kunde inte skapa uppgifter', 'error')
    }
  }, [selectedDeal, fetchDealTasks])

  // Skapas direkt efter att en ny deal är committad. Använder samma batch-endpoint
  // men med pendingNewDealTasks-context (selectedDeal är inte satt än vid creation).
  const createPendingNewDealTaskBatch = useCallback(async (tasks: import('@/components/TaskPresetPicker').PickedTask[]) => {
    if (!pendingNewDealTasks || tasks.length === 0) return
    try {
      const res = await fetch('/api/tasks/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tasks,
          defaults: {
            deal_id: pendingNewDealTasks.dealId,
            customer_id: pendingNewDealTasks.customerId,
            visibility: 'team',
          },
        }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      const count = (data.created || []).length
      showToast(`${count} ${count === 1 ? 'uppgift' : 'uppgifter'} skapad${count === 1 ? '' : 'a'} på dealen`, 'success')
    } catch {
      showToast('Kunde inte skapa uppgifter', 'error')
    } finally {
      setPendingNewDealTasks(null)
    }
  }, [pendingNewDealTasks])

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
          description: newTaskDescription.trim() || null,
          priority: newTaskPriority,
          deal_id: selectedDeal.id,
          customer_id: selectedDeal.customer_id,
          due_date: newTaskDueDate || null,
          due_time: newTaskDueTime || null,
          assigned_to: newTaskAssignee || null,
        })
      })
      if (!res.ok) throw new Error()
      setNewTaskTitle('')
      setNewTaskDescription('')
      setNewTaskPriority('medium')
      setNewTaskDueDate(todayDateStr())
      setNewTaskDueTime(nowTimeStr())
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

  const fetchJobTypes = useCallback(async () => {
    const { data } = await supabase
      .from('business_config')
      .select('services_offered')
      .eq('business_id', business.business_id)
      .single()
    setJobTypes(data?.services_offered || [])
  }, [business.business_id])

  const fetchLeadSources = useCallback(async () => {
    try {
      const res = await fetch('/api/lead-sources/list')
      if (!res.ok) return
      const data = await res.json()
      setLeadSourceOptions(data.sources || [])
    } catch { /* non-blocking */ }
  }, [])

  const fetchJobTypeOptions = useCallback(async () => {
    try {
      const res = await fetch('/api/job-types')
      if (!res.ok) return
      const data = await res.json()
      setJobTypeOptions(data.job_types || [])
    } catch { /* non-blocking */ }
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      await Promise.all([fetchPipeline(), fetchAiActivities(), fetchTeamMembers()])
      setLoading(false)
    }
    load()
  }, [fetchPipeline, fetchAiActivities, fetchTeamMembers])

  // Realtime + polling: uppdatera pipelinen när deals/uppgifter ändras
  useRealtimeRefresh({
    tables: ['deal', 'task', 'sms_conversation'],
    businessId: business.business_id,
    onChange: () => { fetchPipeline(); fetchAiActivities() },
    pollIntervalMs: 30_000,
  })

  // Öppna ny deal-modal om redirect från kundregistrering
  useEffect(() => {
    if (searchParams?.get('newDeal') === 'true') {
      const custId = searchParams.get('customer_id') || ''
      const custName = searchParams.get('customer_name') || ''
      setShowNewDeal(true)
      setNewDealForm(prev => ({ ...prev, customer_id: custId, title: custName ? `Jobb för ${custName}` : '' }))
      fetchCustomers()
      fetchJobTypes()
      fetchLeadSources()
      fetchJobTypeOptions()
      // Rensa URL:en
      window.history.replaceState(null, '', '/dashboard/pipeline')
    }
  }, [searchParams])

  // Deep-link: ?deal=X → öppna deal-detalj direkt (från dashboardens "Att göra idag")
  const dealDeepLinkHandled = useRef(false)
  useEffect(() => {
    const dealId = searchParams?.get('deal')
    if (!dealId || dealDeepLinkHandled.current) return
    if (deals.length === 0) return // vänta på att deals laddats
    const deal = deals.find(d => d.id === dealId)
    if (deal) {
      dealDeepLinkHandled.current = true
      openDealDetail(deal)
      window.history.replaceState(null, '', '/dashboard/pipeline')
    }
  }, [searchParams, deals])

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

    // Optimistisk uppdatering — flytta kortet direkt i UI
    const previousStageId = deals.find(d => d.id === dealId)?.stage_id
    if (targetStage) {
      setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage_id: targetStage.id, updated_at: new Date().toISOString() } : d))
      if (selectedDeal?.id === dealId) {
        setSelectedDeal(prev => prev ? { ...prev, stage_id: targetStage.id, updated_at: new Date().toISOString() } : prev)
      }
    }

    try {
      const res = await fetch(`/api/pipeline/deals/${dealId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toStageSlug,
          business_id: business.business_id,
          ...(extraData?.loss_reason ? { lost_reason: extraData.loss_reason } : {}),
        })
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        // Revert optimistisk uppdatering vid fel
        if (previousStageId) {
          setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage_id: previousStageId } : d))
          if (selectedDeal?.id === dealId) {
            setSelectedDeal(prev => prev ? { ...prev, stage_id: previousStageId } : prev)
          }
        }
        if (errData.error) alert(errData.error)
        return
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
          description: newDealForm.description.trim() || null,
          job_type: newDealForm.job_type || null,
          source: newDealForm.source || null,
          assigned_to: newDealForm.assigned_to || null,
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

      const createdTitle = newDealForm.title.trim()
      const createdCustomerId = newDealForm.customer_id || null
      setShowNewDeal(false)
      setNewDealForm({ title: '', customer_id: '', value: '', priority: 'medium', description: '', job_type: '', source: '', assigned_to: '' })
      setCustomerSearch('')
      setNewDealFiles([])
      setShowNewCustomerForm(false)
      fetchPipeline()

      // Öppna TaskPresetPicker direkt — multi-select av relevanta uppgifter
      // ur biblioteket istället för en hårdkodad strängsuggestion.
      setPendingNewDealTasks({
        dealId: createdDeal.id,
        dealTitle: createdTitle,
        customerId: createdCustomerId,
      })
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

  // Load team for site visit invite
  useEffect(() => {
    if (showSiteVisit && !siteVisitTeamLoaded) {
      supabase
        .from('business_users')
        .select('id, name, phone')
        .eq('business_id', business.business_id)
        .eq('is_active', true)
        .then(({ data }: { data: any }) => {
          setSiteVisitTeam(data || [])
          setSiteVisitTeamLoaded(true)
        })
    }
  }, [showSiteVisit])

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

      // Send SMS to invited team members
      const dateStr = start.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
      const timeStr2 = start.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
      for (const memberId of siteVisitForm.invitedTeam) {
        const member = siteVisitTeam.find(m => m.id === memberId)
        if (member?.phone) {
          fetch('/api/sms/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: member.phone,
              message: `Platsbesök: ${selectedDeal.title} hos ${selectedDeal.customer?.name || 'kund'}, ${dateStr} kl ${timeStr2}. ${siteVisitForm.notes || ''} //${business.business_name}`,
            }),
          }).catch(() => {})
        }
      }

      // SMS to external UE
      if (siteVisitForm.externalUe) {
        const phonePart = siteVisitForm.externalUe.match(/\+?\d[\d\s-]{7,}/)
        if (phonePart) {
          const uePhone = '+' + phonePart[0].replace(/\D/g, '')
          fetch('/api/sms/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: uePhone,
              message: `Inbjudan till platsbesök: ${selectedDeal.title}, ${dateStr} kl ${timeStr2}. ${siteVisitForm.notes || ''} //${business.business_name}`,
            }),
          }).catch(() => {})
        }
      }

      showToast('Platsbesök bokat!', 'success')
      setShowSiteVisit(false)
      setSiteVisitForm({ date: '', time: '09:00', duration: '60', notes: '', sendSms: true, invitedTeam: [], externalUe: '' })
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
    setNewTaskDueDate(todayDateStr())
    setNewTaskDueTime(nowTimeStr())
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

  // ------------------------------------------
  // Filtering
  // ------------------------------------------

  const filteredDeals = deals.filter(d => {
    if (filterSearch) {
      const s = filterSearch.toLowerCase()
      const matches =
        d.title.toLowerCase().includes(s) ||
        (d.customer?.name || '').toLowerCase().includes(s) ||
        (d.customer?.phone_number || '').toLowerCase().includes(s) ||
        (d.customer?.email || '').toLowerCase().includes(s) ||
        (d.customer?.customer_number || '').toLowerCase().includes(s) ||
        String(d.deal_number || '').includes(s)
      if (!matches) return false
    }
    if (filterPriority !== 'all' && d.priority !== filterPriority) return false
    if (filterCustomerType !== 'all') {
      // 'unknown' matchar deals utan kundtyp eller utan kund alls
      const ct = d.customer?.customer_type || ''
      if (filterCustomerType === 'unknown') {
        if (ct !== '') return false
      } else if (ct !== filterCustomerType) {
        return false
      }
    }
    if (filterAssignedTo !== 'all') {
      if (filterAssignedTo === 'unassigned') {
        if (d.assigned_to) return false
      } else if (d.assigned_to !== filterAssignedTo) {
        return false
      }
    }
    if (filterSource !== 'all') {
      const src = d.lead_source_platform || d.source || ''
      if (filterSource === 'unknown') {
        if (src !== '') return false
      } else if (src !== filterSource) {
        return false
      }
    }
    return true
  })

  function dealsForStage(stageId: string): Deal[] { return filteredDeals.filter(d => d.stage_id === stageId) }
  function stageValue(stageId: string): number { return dealsForStage(stageId).reduce((sum, d) => sum + (d.value || 0), 0) }
  const activeFilterCount =
    (filterSearch !== '' ? 1 : 0) +
    (filterPriority !== 'all' ? 1 : 0) +
    (filterCustomerType !== 'all' ? 1 : 0) +
    (filterAssignedTo !== 'all' ? 1 : 0) +
    (filterSource !== 'all' ? 1 : 0)
  const hasActiveFilters = activeFilterCount > 0

  // Unika värden för filter-dropdowns
  const customerTypeOptions = Array.from(
    new Set(deals.map(d => d.customer?.customer_type || '').filter(Boolean))
  ).sort()
  const sourceOptions = Array.from(
    new Set(deals.map(d => d.lead_source_platform || d.source || '').filter(Boolean))
  ).sort()

  // Mänskliga etiketter för filter-dropdowns
  function customerTypeLabel(t: string): string {
    const map: Record<string, string> = {
      private: 'Privatperson',
      company: 'Företag',
      brf: 'Bostadsrättsförening',
      property: 'Fastighetsbolag',
      insurance: 'Försäkringsärende',
    }
    return map[t.toLowerCase()] || t
  }
  function sourceLabel(s: string): string {
    const map: Record<string, string> = {
      manual: 'Manuell',
      ai: 'AI-skapad',
      call: 'Telefonsamtal',
      vapi_call: 'Inkommande samtal',
      inbound_sms: 'Inkommande SMS',
      website_form: 'Webbformulär',
      gmail: 'E-post',
    }
    return map[s.toLowerCase()] || s
  }

  const filteredCustomers = customers.filter(c => {
    if (!customerSearch) return true
    const s = customerSearch.toLowerCase()
    return c.name?.toLowerCase().includes(s) || c.phone_number?.toLowerCase().includes(s)
  })

  function getStageForDeal(deal: Deal): Stage | undefined { return stages.find(s => s.id === deal.stage_id) }

  const [hideEmpty, setHideEmpty] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('hm_pipeline_hide_empty') === '1'
    return false
  })
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const toggleHideEmpty = () => {
    const next = !hideEmpty
    setHideEmpty(next)
    localStorage.setItem('hm_pipeline_hide_empty', next ? '1' : '0')
  }

  const scrollPipeline = (dir: 'left' | 'right') => {
    scrollContainerRef.current?.scrollBy({ left: dir === 'right' ? 300 : -300, behavior: 'smooth' })
  }


  // ------------------------------------------
  // Render
  // ------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-sky-700 animate-spin" />
      </div>
    )
  }

  // Bygg context-värdet — passthrough av befintlig state + handlers så
  // utbrutna komponenter (DealModal, DealCard, modaler) kan läsa/skriva
  // utan att vi prop-drillar 36+ värden per nivå.
  const pipelineContextValue: PipelineContextValue = {
    business,
    stages,
    deals,
    filteredDeals,
    customers,
    teamMembers,
    jobTypeOptions,
    leadSourceOptions,
    jobTypes,

    selectedDeal,
    setSelectedDeal,
    dealTab,
    setDealTab,
    editingTitle,
    setEditingTitle,
    editTitleValue,
    setEditTitleValue,
    editingValue,
    setEditingValue,
    editValueInput,
    setEditValueInput,
    editingPriority,
    setEditingPriority,
    detailActivities,
    detailLoading,

    dealDocuments,
    dealUploading,
    dealUploadCategory,
    setDealUploadCategory,

    dealNotes,
    newNoteContent,
    setNewNoteContent,
    editingNoteId,
    setEditingNoteId,
    editNoteContent,
    setEditNoteContent,
    noteSaving,

    dealEmailThreads,
    dealEmailLoading,
    dealExpandedThread,
    setDealExpandedThread,
    dealThreadMessages,
    dealThreadLoading,

    dealTasks,
    showDealTaskPresetPicker,
    setShowDealTaskPresetPicker,
    newTaskTitle,
    setNewTaskTitle,
    newTaskDescription,
    setNewTaskDescription,
    newTaskPriority,
    setNewTaskPriority,
    newTaskDueDate,
    setNewTaskDueDate,
    newTaskDueTime,
    setNewTaskDueTime,
    newTaskAssignee,
    setNewTaskAssignee,
    taskSaving,
    expandedTaskId,
    setExpandedTaskId,
    taskActivities,

    linkCustomerSearch,
    setLinkCustomerSearch,
    showLinkCustomer,
    setShowLinkCustomer,

    customerTags,
    lastContact,

    showSiteVisit,
    setShowSiteVisit,
    siteVisitForm,
    setSiteVisitForm,
    siteVisitSaving,
    siteVisitTeam,
    bookSiteVisit,

    quickSmsTarget,
    setQuickSmsTarget,
    quickSmsText,
    setQuickSmsText,
    quickSmsSending,
    sendQuickSms,

    showLossModal,
    setShowLossModal,
    lossDealId,
    setLossDealId,
    lossReason,
    setLossReason,
    lossReasonDetail,
    setLossReasonDetail,
    confirmLossReason,

    showStageSettings,
    setShowStageSettings,
    stageEdits,
    setStageEdits,
    newStageName,
    setNewStageName,
    stageSaving,
    saveStageEdits,
    addNewStage,
    deleteStage,
    moveStageOrder,

    pipelineView,
    setPipelineView,
    draggingDealId,
    dragOverStageId,
    setDragOverStageId,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,

    filterSearch,
    setFilterSearch,
    filterPriority,
    setFilterPriority,
    filterCustomerType,
    setFilterCustomerType,
    filterAssignedTo,
    setFilterAssignedTo,
    filterSource,
    setFilterSource,
    customerTypeOptions,
    sourceOptions,
    customerTypeLabel,
    sourceLabel,
    hasActiveFilters,
    activeFilterCount,

    hideEmpty,
    toggleHideEmpty,
    scrollPipeline,
    scrollContainerRef,
    mobileStageIndex,
    setMobileStageIndex,
    lostExpanded,
    setLostExpanded,

    showNewDeal,
    setShowNewDeal,
    fetchCustomers,
    fetchJobTypes,
    fetchLeadSources,
    fetchJobTypeOptions,

    newDealForm,
    setNewDealForm,
    newDealSubmitting,
    newDealFiles,
    setNewDealFiles,
    customerSearch,
    setCustomerSearch,
    showCustomerDropdown,
    setShowCustomerDropdown,
    showNewCustomerForm,
    setShowNewCustomerForm,
    newCustomerForm,
    setNewCustomerForm,
    newCustomerSubmitting,
    setNewCustomerSubmitting,
    setCustomers,
    filteredCustomers,
    createDeal,

    toast,
    showToast,

    openDealDetail,
    closeDealDetail,
    moveDealAction,
    updateDealField,
    markDealLost,
    undoActivity,
    handleQuickSms,
    handleOpenTasks,

    handleDealFileUpload,
    fetchDealEmails,
    fetchDealThreadMessages,

    handleAddNote,
    handleUpdateNote,
    handleDeleteNote,

    handleAddTask,
    handleToggleTask,
    handleDeleteTask,
    fetchTaskActivities,
    fetchDealTasks,
    createDealTaskBatch,

    handleLinkCustomer,

    getStageForDeal,
    dealsForStage,
    stageValue,
  }

  return (
    <PipelineProvider value={pipelineContextValue}>
    <div className="min-h-screen bg-[#F8FAFC] relative">
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary-50 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-primary-50 rounded-full blur-[128px]" />
      </div>

      <div className="relative z-10 flex flex-col h-screen">
        <PipelineHeader
          stats={stats}
          mobileStageIndex={mobileStageIndex}
          setMobileStageIndex={setMobileStageIndex}
        />

        {/* Översikt / Kanban / Tidslinje */}
        <div className="flex-1 overflow-hidden">
          {pipelineView === 'flow' ? (
            <FlowPipeline
              deals={filteredDeals}
              orphanProjects={orphanProjects}
              stages={stages}
              onDealClick={openDealDetail}
              onProjectClick={(projectId) => setOpenProjectStageId(projectId)}
              density="comfortable"
              split="50-50"
            />
          ) : pipelineView === 'timeline' ? (
            <TimelineView
              deals={filteredDeals as any}
              stages={stages}
              onDealClick={openDealDetail as any}
            />
          ) : (
          <KanbanView />
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
                        {act.ai_confidence != null && <span className="text-xs text-primary-700">{Math.round(act.ai_confidence * 100)}%</span>}
                      </div>
                    </div>
                    {!act.undone_at ? (
                      <button onClick={() => undoActivity(act.id)} className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 border border-[#E2E8F0] text-xs text-gray-500 hover:text-gray-900 transition-colors">
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
        <PipelineStatsView stats={stats} />
      </div>

      <DealModal />

      <ProjectStageModal
        projectId={openProjectStageId}
        onClose={() => setOpenProjectStageId(null)}
      />

      <NewDealModal />

      <StageSettingsModal />
      <LossModal />
      <QuickSmsModal />

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
      <SiteVisitModal />

      {/* Next step prompt after deal creation */}
      {/* Task preset picker — öppnas från Uppgifter-fliken i deal-modalen */}
      <TaskPresetPicker
        open={showDealTaskPresetPicker}
        onClose={() => setShowDealTaskPresetPicker(false)}
        onCreate={createDealTaskBatch}
        contextLabel={selectedDeal ? `Ärende ${selectedDeal.deal_number ? `#${selectedDeal.deal_number}` : ''} · ${selectedDeal.title}`.trim() : undefined}
      />

      {/* Task preset picker — öppnas direkt efter en ny deal skapas */}
      <TaskPresetPicker
        open={!!pendingNewDealTasks}
        onClose={() => setPendingNewDealTasks(null)}
        onCreate={createPendingNewDealTaskBatch}
        contextLabel={pendingNewDealTasks ? `Ny deal: ${pendingNewDealTasks.dealTitle}` : undefined}
      />
    </div>
    </PipelineProvider>
  )
}
