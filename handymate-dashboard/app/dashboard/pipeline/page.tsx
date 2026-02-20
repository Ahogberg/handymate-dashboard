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
  Calendar
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'

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
  completed_at: string | null
  created_at: string
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
    case 'ai': return 'bg-blue-100 text-blue-600 border-blue-200'
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

  // Deal tasks
  const [dealTasks, setDealTasks] = useState<Task[]>([])
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDueDate, setNewTaskDueDate] = useState('')
  const [taskSaving, setTaskSaving] = useState(false)

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
    if (!files || files.length === 0 || !selectedDeal?.customer_id) return

    setDealUploading(true)
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) continue

      const filePath = `${business.business_id}/${selectedDeal.customer_id}/${Date.now()}_${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('customer-documents')
        .upload(filePath, file)

      if (uploadError) {
        console.error('Upload error:', uploadError)
        continue
      }

      const { data: urlData } = supabase.storage
        .from('customer-documents')
        .getPublicUrl(filePath)

      await fetch(`/api/customers/${selectedDeal.customer_id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_type: file.type,
          file_size: file.size,
          category: dealUploadCategory,
        })
      })
    }

    setDealUploading(false)
    e.target.value = ''
    fetchDealDocuments(selectedDeal.customer_id)
    showToast('Dokument uppladdat', 'success')
  }

  // Deal notes
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
        })
      })
      if (!res.ok) throw new Error()
      setNewTaskTitle('')
      setNewTaskDueDate('')
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
      await Promise.all([fetchPipeline(), fetchAiActivities()])
      setLoading(false)
    }
    load()
  }, [fetchPipeline, fetchAiActivities])

  // ------------------------------------------
  // Deal actions
  // ------------------------------------------

  async function moveDealAction(dealId: string, toStageSlug: string) {
    try {
      const res = await fetch(`/api/pipeline/deals/${dealId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toStageSlug, business_id: business.business_id })
      })
      if (!res.ok) throw new Error()
      const targetStage = stages.find(s => s.slug === toStageSlug)
      if (targetStage) {
        setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage_id: targetStage.id, updated_at: new Date().toISOString() } : d))
        if (selectedDeal?.id === dealId) {
          setSelectedDeal(prev => prev ? { ...prev, stage_id: targetStage.id, updated_at: new Date().toISOString() } : prev)
        }
      }
      showToast('Deal flyttad', 'success')
      fetchAiActivities()
    } catch {
      showToast('Kunde inte flytta deal', 'error')
      fetchPipeline()
    }
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
      showToast('Deal skapad', 'success')
      setShowNewDeal(false)
      setNewDealForm({ title: '', customer_id: '', value: '', priority: 'medium', description: '' })
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
    setCustomerTags([])
    setLastContact(null)
    setShowLinkCustomer(false)
    setLinkCustomerSearch('')
    fetchDealActivities(deal.id)
    fetchDealNotes(deal.id)
    fetchDealTasks(deal.id)
    if (deal.customer_id) {
      fetchDealDocuments(deal.customer_id)
      fetchCustomerEnrichment(deal.customer_id)
    }
  }

  function closeDealDetail() {
    setSelectedDeal(null)
    setDetailActivities([])
    setDealDocuments([])
    setDealNotes([])
    setDealTasks([])
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
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 relative">
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-50 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-cyan-50 rounded-full blur-[128px]" />
      </div>

      <div className="relative z-10 flex flex-col h-screen">
        {/* Header */}
        <header className="flex-shrink-0 px-4 lg:px-6 py-4 border-b border-gray-200 bg-white/60 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
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
              <div className="relative" ref={filterRef}>
                <button onClick={() => setShowFilter(!showFilter)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${hasActiveFilters ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300'}`}>
                  <Filter className="w-4 h-4" />
                  <span className="hidden sm:inline text-sm">Filter</span>
                  {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                </button>
                {showFilter && (
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-xl p-4 shadow-xl z-50">
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Sök</label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input type="text" placeholder="Sök deal eller kund..." value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-400" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Prioritet</label>
                        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-400">
                          <option value="all">Alla</option>
                          <option value="urgent">Brådskande</option>
                          <option value="high">Hög</option>
                          <option value="medium">Medium</option>
                          <option value="low">Låg</option>
                        </select>
                      </div>
                      {hasActiveFilters && <button onClick={() => { setFilterSearch(''); setFilterPriority('all') }} className="text-xs text-blue-600 hover:text-blue-500">Rensa filter</button>}
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
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-medium hover:from-blue-600 hover:to-cyan-600 transition-all shadow-lg shadow-blue-500/10">
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

        {/* Kanban Board */}
        <div className="flex-1 overflow-hidden">
          {/* Desktop */}
          <div className="hidden lg:flex h-full overflow-x-auto px-4 py-4 gap-3">
            {activeStages.map(stage => {
              const stageDeals = dealsForStage(stage.id)
              const total = stageValue(stage.id)
              const isDropTarget = dragOverStageId === stage.id
              return (
                <div key={stage.id}
                  className={`flex-shrink-0 w-[280px] flex flex-col rounded-xl border transition-all duration-200 ${isDropTarget ? 'border-dashed border-blue-400 bg-blue-50/50 shadow-inner' : 'border-gray-200 bg-white/50'}`}
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
                        onDragStart={handleDragStart} onDragEnd={handleDragEnd} onClick={() => openDealDetail(deal)} />
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
                          onDragStart={handleDragStart} onDragEnd={handleDragEnd} onClick={() => openDealDetail(deal)} />
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
                    onDragStart={handleDragStart} onDragEnd={handleDragEnd} onClick={() => openDealDetail(deal)} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* AI Activity Panel */}
        {aiActivities.length > 0 && (
          <div className="flex-shrink-0 border-t border-gray-200 bg-white/60 backdrop-blur-sm">
            <button onClick={() => setAiPanelOpen(!aiPanelOpen)} className="w-full flex items-center justify-between px-4 lg:px-6 py-3 hover:bg-white/80 transition-colors">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-gray-900">AI-aktivitet</span>
                <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{aiActivities.length}</span>
              </div>
              {aiPanelOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
            </button>
            {aiPanelOpen && (
              <div className="max-h-64 overflow-y-auto px-4 lg:px-6 pb-4 space-y-2">
                {aiActivities.map(act => (
                  <div key={act.id} className={`flex items-start gap-3 p-3 rounded-lg border ${act.undone_at ? 'bg-gray-50 border-gray-100 opacity-50' : 'bg-white border-gray-200'}`}>
                    <Bot className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-900">{act.description || 'AI-åtgärd'}</span>
                      {act.deal_title && <span className="text-xs text-gray-400 ml-1">({act.deal_title})</span>}
                      {act.ai_reason && <p className="text-xs text-gray-400 mt-1">{act.ai_reason}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">{timeAgo(act.created_at)}</span>
                        {act.ai_confidence != null && <span className="text-xs text-blue-500">{Math.round(act.ai_confidence * 100)}%</span>}
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
              <div className="flex items-center gap-2 flex-shrink-0"><div className="w-2 h-2 rounded-full bg-blue-500" /><span className="text-gray-500">Aktiva:</span><span className="text-gray-900 font-medium">{stats.totalDeals}</span><span className="text-gray-400">({formatValueCompact(stats.totalValue)})</span></div>
              <div className="flex items-center gap-2 flex-shrink-0"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-gray-500">Vunna:</span><span className="text-gray-900 font-medium">{formatValueCompact(stats.wonValue)}</span></div>
              <div className="flex items-center gap-2 flex-shrink-0"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className="text-gray-500">Nya idag:</span><span className="text-gray-900 font-medium">{stats.newLeadsToday}</span></div>
              <div className="flex items-center gap-2 flex-shrink-0"><div className="w-2 h-2 rounded-full bg-amber-400" /><span className="text-gray-500">Uppföljning:</span><span className="text-gray-900 font-medium">{stats.needsFollowUp}</span></div>
            </div>
          </div>
        )}
      </div>

      {/* Deal Detail Panel */}
      {selectedDeal && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={closeDealDetail} />
          <div className="fixed inset-y-0 right-0 z-50 w-full lg:w-[460px] bg-white border-l border-gray-200 shadow-2xl flex flex-col">
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2 min-w-0">
                {(() => { const stage = getStageForDeal(selectedDeal); return stage ? (<span className="px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0" style={{ backgroundColor: stage.color + '22', color: stage.color, border: `1px solid ${stage.color}44` }}>{stage.name}</span>) : null })()}
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getPriorityBadgeStyle(selectedDeal.priority)}`}>{getPriorityLabel(selectedDeal.priority)}</span>
              </div>
              <button onClick={closeDealDetail} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="p-5 space-y-5">
                {/* Title */}
                <div>
                  {editingTitle ? (
                    <div className="flex items-center gap-2">
                      <input type="text" value={editTitleValue} onChange={e => setEditTitleValue(e.target.value)}
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-lg font-bold focus:outline-none focus:border-blue-400" autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') { updateDealField(selectedDeal.id, 'title', editTitleValue); setEditingTitle(false) }; if (e.key === 'Escape') { setEditTitleValue(selectedDeal.title); setEditingTitle(false) } }} />
                      <button onClick={() => { updateDealField(selectedDeal.id, 'title', editTitleValue); setEditingTitle(false) }} className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"><Save className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditTitleValue(selectedDeal.title); setEditingTitle(true) }} className="group flex items-center gap-2 text-left w-full">
                      <h2 className="text-lg font-bold text-gray-900">{selectedDeal.title}</h2>
                      <Edit3 className="w-3.5 h-3.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}
                  {selectedDeal.description && <p className="text-sm text-gray-500 mt-1">{selectedDeal.description}</p>}
                </div>

                {/* Value */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Värde</span>
                  {editingValue ? (
                    <div className="flex items-center gap-2">
                      <input type="number" value={editValueInput} onChange={e => setEditValueInput(e.target.value)}
                        className="w-32 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-gray-900 text-sm text-right focus:outline-none focus:border-blue-400" autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') { updateDealField(selectedDeal.id, 'value', editValueInput ? parseFloat(editValueInput) : null); setEditingValue(false) }; if (e.key === 'Escape') { setEditValueInput(selectedDeal.value?.toString() || ''); setEditingValue(false) } }} />
                      <button onClick={() => { updateDealField(selectedDeal.id, 'value', editValueInput ? parseFloat(editValueInput) : null); setEditingValue(false) }} className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"><Save className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditValueInput(selectedDeal.value?.toString() || ''); setEditingValue(true) }} className="group flex items-center gap-1.5 text-gray-900 font-medium text-sm">
                      {formatValue(selectedDeal.value)}<Edit3 className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}
                </div>

                {/* Priority */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Prioritet</span>
                  {editingPriority ? (
                    <select value={selectedDeal.priority} onChange={e => { updateDealField(selectedDeal.id, 'priority', e.target.value); setEditingPriority(false) }} onBlur={() => setEditingPriority(false)} autoFocus
                      className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-gray-900 text-sm focus:outline-none focus:border-blue-400">
                      <option value="low">Låg</option><option value="medium">Medium</option><option value="high">Hög</option><option value="urgent">Brådskande</option>
                    </select>
                  ) : (
                    <button onClick={() => setEditingPriority(true)} className={`group flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${getPriorityBadgeStyle(selectedDeal.priority)}`}>
                      {getPriorityLabel(selectedDeal.priority)}<Edit3 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}
                </div>

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
                        className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-500 hover:text-blue-600 transition-colors"
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
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-400"
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
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-blue-50 transition-colors"
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
                            selectedDeal.customer.customer_type === 'company' ? 'bg-blue-50 text-blue-600 border-blue-200' :
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
                      className="flex items-center justify-between px-4 py-2.5 bg-gray-100/80 border-t border-gray-200 text-sm text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                    >
                      <span className="font-medium">Visa kundkort</span>
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                )}

                {/* Documents */}
                {selectedDeal.customer_id && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Upload className="w-3.5 h-3.5" /> Dokument
                      </h4>
                      <Link href={`/dashboard/customers/${selectedDeal.customer_id}?tab=documents`} className="text-xs text-blue-600 hover:text-blue-500">
                        Visa alla
                      </Link>
                    </div>

                    {/* Upload area */}
                    <div className="flex items-center gap-2">
                      <select
                        value={dealUploadCategory}
                        onChange={(e) => setDealUploadCategory(e.target.value)}
                        className="px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-xs focus:outline-none focus:border-blue-400"
                      >
                        <option value="drawing">Ritning</option>
                        <option value="sketch">Skiss</option>
                        <option value="description">Beskrivning</option>
                        <option value="contract">Kontrakt</option>
                        <option value="photo">Foto</option>
                        <option value="other">Övrigt</option>
                      </select>
                      <label className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-600 font-medium hover:bg-blue-100 cursor-pointer transition-colors">
                        {dealUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        {dealUploading ? 'Laddar upp...' : 'Ladda upp'}
                        <input type="file" className="hidden" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={handleDealFileUpload} disabled={dealUploading} />
                      </label>
                    </div>

                    {/* Document list */}
                    {dealDocuments.length > 0 && (
                      <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                        {dealDocuments.slice(0, 5).map((doc) => (
                          <div key={doc.id} className="flex items-center gap-3 px-3 py-2">
                            <div className="w-7 h-7 bg-gray-100 rounded flex items-center justify-center flex-shrink-0">
                              {doc.file_type?.startsWith('image/') ? (
                                <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                              ) : doc.file_type?.includes('pdf') ? (
                                <FileText className="w-3.5 h-3.5 text-red-500" />
                              ) : (
                                <FileIcon className="w-3.5 h-3.5 text-gray-400" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-900 truncate">{doc.file_name}</p>
                              <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                                <span className="px-1 py-0.5 bg-gray-100 rounded text-gray-500">
                                  {{ drawing: 'Ritning', sketch: 'Skiss', description: 'Beskrivning', contract: 'Kontrakt', photo: 'Foto', other: 'Övrigt' }[doc.category] || doc.category}
                                </span>
                                {doc.file_size && <span>{formatFileSize(doc.file_size)}</span>}
                              </div>
                            </div>
                            <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors" title="Öppna">
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                    {dealDocuments.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-2">Inga dokument ännu</p>
                    )}
                  </div>
                )}

                {/* Notes */}
                <div className="space-y-2">
                  <h4 className="text-xs text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <StickyNote className="w-3.5 h-3.5" /> Anteckningar
                  </h4>
                  {dealNotes.length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {dealNotes.map(note => (
                        <div key={note.id} className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 group">
                          {editingNoteId === note.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={editNoteContent}
                                onChange={e => setEditNoteContent(e.target.value)}
                                className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-900 focus:outline-none focus:border-blue-400 resize-none"
                                rows={3}
                              />
                              <div className="flex gap-2">
                                <button onClick={() => handleUpdateNote(note.id)} className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">Spara</button>
                                <button onClick={() => { setEditingNoteId(null); setEditNoteContent('') }} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">Avbryt</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-[10px] text-gray-400">{timeAgo(note.created_at)}</span>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => { setEditingNoteId(note.id); setEditNoteContent(note.content) }} className="p-1 text-gray-400 hover:text-blue-600 rounded" title="Redigera"><Edit3 className="w-3 h-3" /></button>
                                  <button onClick={() => handleDeleteNote(note.id)} className="p-1 text-gray-400 hover:text-red-600 rounded" title="Ta bort"><Trash2 className="w-3 h-3" /></button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <textarea
                      value={newNoteContent}
                      onChange={e => setNewNoteContent(e.target.value)}
                      placeholder="Skriv en anteckning..."
                      className="flex-1 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-400 resize-none"
                      rows={2}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote() }}
                    />
                    <button
                      onClick={handleAddNote}
                      disabled={!newNoteContent.trim() || noteSaving}
                      className="self-end px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {noteSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Spara'}
                    </button>
                  </div>
                </div>

                {/* Tasks */}
                <div className="space-y-2">
                  <h4 className="text-xs text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckSquare className="w-3.5 h-3.5" /> Uppgifter
                    {dealTasks.filter(t => t.status !== 'done').length > 0 && (
                      <span className="ml-auto text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">{dealTasks.filter(t => t.status !== 'done').length}</span>
                    )}
                  </h4>
                  {dealTasks.length > 0 && (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {dealTasks.map(task => (
                        <div key={task.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 group">
                          <button onClick={() => handleToggleTask(task.id, task.status)} className="flex-shrink-0">
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${task.status === 'done' ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-blue-400'}`}>
                              {task.status === 'done' && <CheckCircle2 className="w-3 h-3 text-white" />}
                            </div>
                          </button>
                          <span className={`flex-1 text-sm ${task.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{task.title}</span>
                          {task.due_date && (
                            <span className={`text-[10px] flex-shrink-0 ${new Date(task.due_date) < new Date() && task.status !== 'done' ? 'text-red-500' : 'text-gray-400'}`}>
                              {new Date(task.due_date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                          <button onClick={() => handleDeleteTask(task.id)} className="p-0.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0" title="Ta bort">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newTaskTitle}
                      onChange={e => setNewTaskTitle(e.target.value)}
                      placeholder="Ny uppgift..."
                      className="flex-1 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-400"
                      onKeyDown={e => { if (e.key === 'Enter') handleAddTask() }}
                    />
                    <input
                      type="date"
                      value={newTaskDueDate}
                      onChange={e => setNewTaskDueDate(e.target.value)}
                      className="px-1.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 focus:outline-none focus:border-blue-400 w-28"
                    />
                    <button
                      onClick={handleAddTask}
                      disabled={!newTaskTitle.trim() || taskSaving}
                      className="px-2 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                    >
                      {taskSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="space-y-2">
                  <h4 className="text-xs text-gray-400 uppercase tracking-wider">Snabbåtgärder</h4>
                  <div className="flex flex-wrap gap-2">
                    <Link href={selectedDeal.customer_id ? `/dashboard/quotes/new?customerId=${selectedDeal.customer_id}` : '/dashboard/quotes/new'}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700 hover:border-blue-300 hover:bg-blue-50 transition-colors">
                      <FileText className="w-4 h-4 text-blue-600" /> Skapa offert
                    </Link>
                    {!getStageForDeal(selectedDeal)?.is_lost && (
                      <button onClick={() => markDealLost(selectedDeal.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-red-600 hover:border-red-300 hover:bg-red-50 transition-colors">
                        <XCircle className="w-4 h-4" /> Markera förlorad
                      </button>
                    )}
                    {selectedDeal.quote_id && (
                      <Link href={`/dashboard/quotes/${selectedDeal.quote_id}`} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700 hover:border-blue-300 hover:bg-blue-50 transition-colors">
                        <FileText className="w-4 h-4 text-emerald-600" /> Visa offert
                      </Link>
                    )}
                  </div>
                </div>

                {/* Activity log */}
                <div>
                  <h4 className="text-xs text-gray-400 uppercase tracking-wider mb-3">Aktivitetslogg</h4>
                  {detailLoading ? <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 text-blue-600 animate-spin" /></div>
                    : detailActivities.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">Ingen aktivitet ännu</p>
                    : (
                      <div className="space-y-2">
                        {detailActivities.map(act => (
                          <div key={act.id} className={`flex items-start gap-3 p-3 rounded-lg border ${act.undone_at ? 'bg-gray-50 border-gray-100 opacity-50' : 'bg-gray-50/50 border-gray-200'}`}>
                            <div className="mt-0.5">
                              {act.triggered_by === 'ai' ? <Bot className="w-4 h-4 text-blue-600" /> : act.triggered_by === 'system' ? <Sparkles className="w-4 h-4 text-gray-400" /> : <User className="w-4 h-4 text-gray-500" />}
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
            </div>
          </div>
        </>
      )}

      {/* New Deal Modal */}
      {showNewDeal && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => setShowNewDeal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-lg">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-900">Ny deal</h2>
                <button onClick={() => setShowNewDeal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Titel *</label>
                  <input type="text" value={newDealForm.title} onChange={e => setNewDealForm(prev => ({ ...prev, title: e.target.value }))} placeholder="T.ex. Badrumsrenovering Andersson"
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Kund</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Sök kund..."
                      className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-400" />
                  </div>
                  {newDealForm.customer_id && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-xs text-blue-600">Vald: {customers.find(c => c.customer_id === newDealForm.customer_id)?.name || 'Okänd'}</span>
                      <button onClick={() => setNewDealForm(prev => ({ ...prev, customer_id: '' }))} className="text-xs text-gray-400 hover:text-gray-900"><X className="w-3 h-3" /></button>
                    </div>
                  )}
                  {customerSearch && !newDealForm.customer_id && (
                    <div className="mt-1 max-h-32 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                      {filteredCustomers.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">Inga kunder hittades</div>}
                      {filteredCustomers.slice(0, 8).map(c => (
                        <button key={c.customer_id} onClick={() => { setNewDealForm(prev => ({ ...prev, customer_id: c.customer_id })); setCustomerSearch('') }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-900 hover:bg-gray-50 transition-colors flex items-center justify-between">
                          <span>{c.name}</span><span className="text-xs text-gray-400">{c.phone_number}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Värde (kr)</label>
                    <input type="number" value={newDealForm.value} onChange={e => setNewDealForm(prev => ({ ...prev, value: e.target.value }))} placeholder="0"
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Prioritet</label>
                    <select value={newDealForm.priority} onChange={e => setNewDealForm(prev => ({ ...prev, priority: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-400">
                      <option value="low">Låg</option><option value="medium">Medium</option><option value="high">Hög</option><option value="urgent">Brådskande</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Beskrivning</label>
                  <textarea value={newDealForm.description} onChange={e => setNewDealForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Kort beskrivning..." rows={2}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-400 resize-none" />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
                <button onClick={() => setShowNewDeal(false)} className="px-4 py-2 rounded-lg bg-gray-100 border border-gray-200 text-sm text-gray-600 hover:text-gray-900 transition-colors">Avbryt</button>
                <button onClick={createDeal} disabled={newDealSubmitting || !newDealForm.title.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-medium hover:from-blue-600 hover:to-cyan-600 transition-all disabled:opacity-50">
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
                    className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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
                className="flex-1 px-4 py-2.5 bg-gray-100 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[44px]"
                onKeyDown={(e) => e.key === 'Enter' && addNewStage()}
              />
              <button
                onClick={addNewStage}
                disabled={stageSaving || !newStageName.trim()}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all min-h-[44px]"
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
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50 min-h-[44px]"
              >
                {stageSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Spara ändringar
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
}

function DealCard({ deal, isDragging, onDragStart, onDragEnd, onClick }: DealCardProps) {
  return (
    <div draggable onDragStart={e => onDragStart(e, deal.id)} onDragEnd={onDragEnd} onClick={onClick}
      className={`group p-3 rounded-lg border border-gray-200 bg-white shadow-sm cursor-pointer transition-all hover:shadow-md hover:border-gray-300 ${isDragging ? 'opacity-40 scale-95 rotate-1' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getPriorityDot(deal.priority)}`} />
            <h4 className="text-sm font-medium text-gray-900 truncate">{deal.title}</h4>
            {(deal.source === 'ai' || deal.source === 'call') && <span title="AI-skapad"><Bot className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" /></span>}
          </div>
          {deal.customer?.name && <p className="text-xs text-gray-500 mt-0.5 truncate ml-3.5">{deal.customer.name}</p>}
          {deal.description && !deal.customer?.name && <p className="text-xs text-gray-400 mt-0.5 truncate ml-3.5">{deal.description}</p>}
        </div>
        <GripVertical className="w-4 h-4 text-gray-200 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
      </div>
      <div className="flex items-center justify-between mt-2 ml-3.5">
        <span className="text-xs font-semibold text-gray-700">{deal.value != null && deal.value > 0 ? formatValueCompact(deal.value) : ''}</span>
        <span className="text-[10px] text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(deal.updated_at)}</span>
      </div>
    </div>
  )
}
