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
  DollarSign,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Edit3,
  Save,
  Sparkles
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
  created_at: string
  updated_at: string
  customer?: {
    customer_id: string
    name: string
    phone_number: string
    email: string
  } | null
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
  wonThisMonth: number
  wonValueThisMonth: number
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
  if (v >= 1000) {
    const formatted = v.toLocaleString('sv-SE')
    return `${formatted} kr`
  }
  return `${v} kr`
}

function formatValueCompact(v: number | null | undefined): string {
  if (v == null || v === 0) return '0 kr'
  if (v >= 1000000) {
    const m = (v / 1000000).toFixed(1).replace('.0', '')
    return `~${m}M kr`
  }
  if (v >= 1000) {
    const k = Math.round(v / 1000)
    return `~${k}k kr`
  }
  return `${v} kr`
}

function formatColumnValue(v: number): string {
  if (v === 0) return '0 kr'
  if (v >= 1000000) {
    const m = (v / 1000000).toFixed(1).replace('.0', '')
    return `${m}M kr`
  }
  if (v >= 1000) {
    const k = Math.round(v / 1000)
    return `${k}k kr`
  }
  return `${v} kr`
}

function timeAgo(date: string): string {
  const now = new Date()
  const d = new Date(date)
  const diffMs = now.getTime() - d.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  const diffWeek = Math.floor(diffDay / 7)
  const diffMonth = Math.floor(diffDay / 30)

  if (diffSec < 60) return 'just nu'
  if (diffMin < 60) return `${diffMin} min`
  if (diffHour < 24) return `${diffHour}h`
  if (diffDay < 7) return `${diffDay}d`
  if (diffWeek < 5) return `${diffWeek}v`
  return `${diffMonth} mån`
}

function getPriorityColor(p: string): string {
  switch (p) {
    case 'urgent': return 'border-l-red-500'
    case 'high': return 'border-l-orange-500'
    case 'medium': return 'border-l-yellow-500'
    case 'low': return 'border-l-transparent'
    default: return 'border-l-transparent'
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
    case 'urgent': return 'bg-red-500/20 text-red-400 border-red-500/30'
    case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    case 'low': return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
    default: return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
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
    case 'ai': return 'bg-violet-500/20 text-violet-400 border-violet-500/30'
    case 'user': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    case 'system': return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
    default: return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function PipelinePage() {
  const business = useBusiness()

  // Core data
  const [stages, setStages] = useState<Stage[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [stats, setStats] = useState<PipelineStats | null>(null)
  const [aiActivities, setAiActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  // Drag & drop
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null)
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null)

  // Detail panel
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)
  const [detailActivities, setDetailActivities] = useState<Activity[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')
  const [editingValue, setEditingValue] = useState(false)
  const [editValueInput, setEditValueInput] = useState('')
  const [editingPriority, setEditingPriority] = useState(false)

  // New deal modal
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [newDealForm, setNewDealForm] = useState({
    title: '',
    customer_id: '',
    value: '',
    priority: 'medium',
    description: ''
  })
  const [newDealSubmitting, setNewDealSubmitting] = useState(false)
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [customerSearch, setCustomerSearch] = useState('')

  // AI activity panel
  const [aiPanelOpen, setAiPanelOpen] = useState(false)

  // Filter
  const [showFilter, setShowFilter] = useState(false)
  const [filterSearch, setFilterSearch] = useState('')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const filterRef = useRef<HTMLDivElement>(null)

  // Mobile
  const [mobileStageIndex, setMobileStageIndex] = useState(0)

  // Toast
  const [toast, setToast] = useState<Toast>({ show: false, message: '', type: 'info' })
  const toastTimeout = useRef<NodeJS.Timeout | null>(null)

  // ------------------------------------------
  // Toast helper
  // ------------------------------------------

  function showToast(message: string, type: Toast['type'] = 'info') {
    if (toastTimeout.current) clearTimeout(toastTimeout.current)
    setToast({ show: true, message, type })
    toastTimeout.current = setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }))
    }, 3500)
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
      // API returns deals grouped by stage_id — flatten to array
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
      const res = await fetch(
        `/api/pipeline/activity?business_id=${business.business_id}&triggered_by=ai&limit=10`
      )
      if (!res.ok) return
      const data = await res.json()
      setAiActivities(data.activities || [])
    } catch {
      // silent
    }
  }, [business.business_id])

  const fetchDealActivities = useCallback(async (dealId: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(
        `/api/pipeline/deals/${dealId}/activity?business_id=${business.business_id}`
      )
      if (!res.ok) throw new Error()
      const data = await res.json()
      setDetailActivities(data.activities || [])
    } catch {
      setDetailActivities([])
    } finally {
      setDetailLoading(false)
    }
  }, [business.business_id])

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

  async function moveDeal(dealId: string, toStageSlug: string) {
    try {
      const res = await fetch(`/api/pipeline/deals/${dealId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toStageSlug, business_id: business.business_id })
      })
      if (!res.ok) throw new Error()
      const data = await res.json()

      // Optimistically update the deal's stage_id locally
      const targetStage = stages.find(s => s.slug === toStageSlug)
      if (targetStage) {
        setDeals(prev =>
          prev.map(d =>
            d.id === dealId ? { ...d, stage_id: targetStage.id, updated_at: new Date().toISOString() } : d
          )
        )
        // Update selected deal if open
        if (selectedDeal?.id === dealId) {
          setSelectedDeal(prev => prev ? { ...prev, stage_id: targetStage.id, updated_at: new Date().toISOString() } : prev)
        }
      }

      showToast(data.message || 'Deal flyttad', 'success')
      fetchAiActivities()
    } catch {
      showToast('Kunde inte flytta deal', 'error')
      fetchPipeline()
    }
  }

  async function createDeal() {
    if (!newDealForm.title.trim()) {
      showToast('Ange en titel', 'error')
      return
    }
    setNewDealSubmitting(true)
    try {
      const res = await fetch('/api/pipeline/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.business_id,
          title: newDealForm.title.trim(),
          customer_id: newDealForm.customer_id || null,
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
      setDeals(prev =>
        prev.map(d =>
          d.id === dealId ? { ...d, [field]: value, updated_at: new Date().toISOString() } : d
        )
      )
      if (selectedDeal?.id === dealId) {
        setSelectedDeal(prev => prev ? { ...prev, [field]: value, updated_at: new Date().toISOString() } : prev)
      }
      showToast('Deal uppdaterad', 'success')
    } catch {
      showToast('Kunde inte uppdatera deal', 'error')
    }
  }

  async function markDealLost(dealId: string) {
    const lostStage = stages.find(s => s.is_lost)
    if (!lostStage) {
      showToast('Ingen "förlorad" kolumn finns', 'error')
      return
    }
    await moveDeal(dealId, lostStage.slug)
  }

  async function undoActivity(activityId: string) {
    try {
      const res = await fetch(`/api/pipeline/activity/${activityId}/undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.business_id })
      })
      if (!res.ok) throw new Error()
      showToast('Åtgärd ångrad', 'success')
      fetchPipeline()
      fetchAiActivities()
      if (selectedDeal) {
        fetchDealActivities(selectedDeal.id)
      }
    } catch {
      showToast('Kunde inte ångra åtgärd', 'error')
    }
  }

  // ------------------------------------------
  // Open deal detail
  // ------------------------------------------

  function openDealDetail(deal: Deal) {
    setSelectedDeal(deal)
    setEditingTitle(false)
    setEditingValue(false)
    setEditingPriority(false)
    setEditTitleValue(deal.title)
    setEditValueInput(deal.value?.toString() || '')
    fetchDealActivities(deal.id)
  }

  function closeDealDetail() {
    setSelectedDeal(null)
    setDetailActivities([])
    setEditingTitle(false)
    setEditingValue(false)
    setEditingPriority(false)
  }

  // ------------------------------------------
  // Drag & Drop handlers
  // ------------------------------------------

  function handleDragStart(e: React.DragEvent, dealId: string) {
    e.dataTransfer.setData('text/plain', dealId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingDealId(dealId)
  }

  function handleDragEnd() {
    setDraggingDealId(null)
    setDragOverStageId(null)
  }

  function handleDragOver(e: React.DragEvent, stageId: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStageId(stageId)
  }

  function handleDragLeave(e: React.DragEvent) {
    // Only clear if leaving the column entirely
    const relatedTarget = e.relatedTarget as HTMLElement | null
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDragOverStageId(null)
    }
  }

  function handleDrop(e: React.DragEvent, stage: Stage) {
    e.preventDefault()
    const dealId = e.dataTransfer.getData('text/plain')
    setDragOverStageId(null)
    setDraggingDealId(null)
    if (dealId) {
      const deal = deals.find(d => d.id === dealId)
      if (deal && deal.stage_id !== stage.id) {
        moveDeal(dealId, stage.slug)
      }
    }
  }

  // ------------------------------------------
  // Close filter on outside click
  // ------------------------------------------

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilter(false)
      }
    }
    if (showFilter) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showFilter])

  // ------------------------------------------
  // Filtered deals
  // ------------------------------------------

  const filteredDeals = deals.filter(d => {
    if (filterSearch && !d.title.toLowerCase().includes(filterSearch.toLowerCase())) {
      return false
    }
    if (filterPriority !== 'all' && d.priority !== filterPriority) {
      return false
    }
    return true
  })

  function dealsForStage(stageId: string): Deal[] {
    return filteredDeals.filter(d => d.stage_id === stageId)
  }

  function stageValue(stageId: string): number {
    return dealsForStage(stageId).reduce((sum, d) => sum + (d.value || 0), 0)
  }

  // ------------------------------------------
  // Active filters indicator
  // ------------------------------------------

  const hasActiveFilters = filterSearch !== '' || filterPriority !== 'all'

  // ------------------------------------------
  // Customer filter for new deal modal
  // ------------------------------------------

  const filteredCustomers = customers.filter(c => {
    if (!customerSearch) return true
    const search = customerSearch.toLowerCase()
    return (
      c.name?.toLowerCase().includes(search) ||
      c.phone_number?.toLowerCase().includes(search) ||
      c.email?.toLowerCase().includes(search)
    )
  })

  // ------------------------------------------
  // Get stage for a deal
  // ------------------------------------------

  function getStageForDeal(deal: Deal): Stage | undefined {
    return stages.find(s => s.id === deal.stage_id)
  }

  // ------------------------------------------
  // Render
  // ------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 -left-32 w-96 h-96 bg-violet-500/10 rounded-full blur-[128px]" />
          <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-fuchsia-500/10 rounded-full blur-[128px]" />
        </div>
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#09090b] relative">
      {/* Decorative background blobs */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-violet-500/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-fuchsia-500/10 rounded-full blur-[128px]" />
      </div>

      <div className="relative z-10 flex flex-col h-screen">
        {/* ============================================================== */}
        {/* Header */}
        {/* ============================================================== */}
        <header className="flex-shrink-0 px-4 lg:px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                <FolderKanban className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Pipeline</h1>
                <p className="text-sm text-zinc-400 hidden sm:block">
                  {stats ? `${stats.totalDeals} aktiva deals` : 'Hantera dina affärer'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Filter button */}
              <div className="relative" ref={filterRef}>
                <button
                  onClick={() => {
                    setShowFilter(!showFilter)
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                    hasActiveFilters
                      ? 'bg-violet-500/20 border-violet-500/30 text-violet-300'
                      : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                  }`}
                >
                  <Filter className="w-4 h-4" />
                  <span className="hidden sm:inline text-sm">Filter</span>
                  {hasActiveFilters && (
                    <span className="w-2 h-2 rounded-full bg-violet-400" />
                  )}
                </button>

                {/* Filter dropdown */}
                {showFilter && (
                  <div className="absolute right-0 top-full mt-2 w-72 bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-xl z-50">
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-zinc-500 uppercase tracking-wider mb-1 block">
                          Sök
                        </label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                          <input
                            type="text"
                            placeholder="Sök deals..."
                            value={filterSearch}
                            onChange={e => setFilterSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-violet-500/50"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 uppercase tracking-wider mb-1 block">
                          Prioritet
                        </label>
                        <select
                          value={filterPriority}
                          onChange={e => setFilterPriority(e.target.value)}
                          className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500/50"
                        >
                          <option value="all">Alla</option>
                          <option value="urgent">Brådskande</option>
                          <option value="high">Hög</option>
                          <option value="medium">Medium</option>
                          <option value="low">Låg</option>
                        </select>
                      </div>
                      {hasActiveFilters && (
                        <button
                          onClick={() => {
                            setFilterSearch('')
                            setFilterPriority('all')
                          }}
                          className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                        >
                          Rensa filter
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* New deal button */}
              <button
                onClick={() => {
                  setShowNewDeal(true)
                  fetchCustomers()
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-sm font-medium hover:from-violet-600 hover:to-fuchsia-600 transition-all shadow-lg shadow-violet-500/20"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Ny deal</span>
              </button>
            </div>
          </div>

          {/* Mobile stage tabs */}
          <div className="mt-3 flex gap-1 overflow-x-auto pb-1 lg:hidden scrollbar-hide">
            {stages.map((stage, idx) => (
              <button
                key={stage.id}
                onClick={() => setMobileStageIndex(idx)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  mobileStageIndex === idx
                    ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                    : 'bg-zinc-800/50 text-zinc-400 hover:text-white'
                }`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1.5"
                  style={{ backgroundColor: stage.color }}
                />
                {stage.name}
                <span className="ml-1 text-[10px] opacity-70">
                  {dealsForStage(stage.id).length}
                </span>
              </button>
            ))}
          </div>
        </header>

        {/* ============================================================== */}
        {/* Kanban Board */}
        {/* ============================================================== */}
        <div className="flex-1 overflow-hidden">
          {/* Desktop: horizontal scroll */}
          <div className="hidden lg:flex h-full overflow-x-auto px-4 py-4 gap-4">
            {stages.map(stage => {
              const stageDeals = dealsForStage(stage.id)
              const total = stageValue(stage.id)
              const isDropTarget = dragOverStageId === stage.id

              return (
                <div
                  key={stage.id}
                  className={`flex-shrink-0 w-[300px] flex flex-col rounded-xl border transition-all duration-200 ${
                    isDropTarget
                      ? 'border-dashed border-violet-500 bg-violet-500/10'
                      : 'border-zinc-800 bg-zinc-900/30'
                  }`}
                  onDragOver={e => handleDragOver(e, stage.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={e => handleDrop(e, stage)}
                >
                  {/* Column header */}
                  <div className="flex-shrink-0 px-4 py-3 border-b border-zinc-800/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: stage.color }}
                        />
                        <h3 className="text-sm font-semibold text-white truncate">
                          {stage.name}
                        </h3>
                        <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-full">
                          {stageDeals.length}
                        </span>
                      </div>
                      <span className="text-xs text-zinc-500">
                        {formatColumnValue(total)}
                      </span>
                    </div>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                    {stageDeals.length === 0 && (
                      <div className="flex items-center justify-center py-8 text-zinc-600 text-xs">
                        {isDropTarget ? 'Släpp här' : 'Inga deals'}
                      </div>
                    )}
                    {stageDeals.map(deal => (
                      <DealCard
                        key={deal.id}
                        deal={deal}
                        isDragging={draggingDealId === deal.id}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onClick={() => openDealDetail(deal)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Mobile: one column at a time */}
          <div className="lg:hidden h-full flex flex-col">
            {stages[mobileStageIndex] && (
              <div
                className="flex-1 overflow-y-auto p-4 space-y-2"
                onDragOver={e => handleDragOver(e, stages[mobileStageIndex].id)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, stages[mobileStageIndex])}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: stages[mobileStageIndex].color }}
                    />
                    <h3 className="text-sm font-semibold text-white">
                      {stages[mobileStageIndex].name}
                    </h3>
                    <span className="text-xs text-zinc-500">
                      {dealsForStage(stages[mobileStageIndex].id).length} deals
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {formatColumnValue(stageValue(stages[mobileStageIndex].id))}
                  </span>
                </div>

                {dealsForStage(stages[mobileStageIndex].id).length === 0 && (
                  <div className="flex items-center justify-center py-12 text-zinc-600 text-sm">
                    Inga deals i detta steg
                  </div>
                )}

                {dealsForStage(stages[mobileStageIndex].id).map(deal => (
                  <DealCard
                    key={deal.id}
                    deal={deal}
                    isDragging={draggingDealId === deal.id}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onClick={() => openDealDetail(deal)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ============================================================== */}
        {/* AI Activity Panel (collapsible bottom) */}
        {/* ============================================================== */}
        {aiActivities.length > 0 && (
          <div className="flex-shrink-0 border-t border-zinc-800">
            <button
              onClick={() => setAiPanelOpen(!aiPanelOpen)}
              className="w-full flex items-center justify-between px-4 lg:px-6 py-3 hover:bg-zinc-900/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-medium text-white">AI-aktivitet</span>
                <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-full">
                  {aiActivities.length}
                </span>
              </div>
              {aiPanelOpen ? (
                <ChevronDown className="w-4 h-4 text-zinc-500" />
              ) : (
                <ChevronUp className="w-4 h-4 text-zinc-500" />
              )}
            </button>

            {aiPanelOpen && (
              <div className="max-h-64 overflow-y-auto px-4 lg:px-6 pb-4 space-y-2">
                {aiActivities.map(activity => (
                  <div
                    key={activity.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      activity.undone_at
                        ? 'bg-zinc-900/30 border-zinc-800/50 opacity-60'
                        : 'bg-zinc-900/50 border-zinc-800'
                    }`}
                  >
                    <Bot className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-white">
                          {activity.description || 'AI-åtgärd'}
                        </span>
                        {activity.deal_title && (
                          <span className="text-xs text-zinc-500">
                            ({activity.deal_title})
                          </span>
                        )}
                      </div>
                      {activity.ai_reason && (
                        <p className="text-xs text-zinc-500 mt-1">{activity.ai_reason}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-zinc-600">
                          {timeAgo(activity.created_at)}
                        </span>
                        {activity.ai_confidence != null && (
                          <span className="text-xs text-violet-400/70">
                            {Math.round(activity.ai_confidence * 100)}% konfidens
                          </span>
                        )}
                      </div>
                    </div>
                    {!activity.undone_at && (
                      <button
                        onClick={() => undoActivity(activity.id)}
                        className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800 border border-zinc-700 text-xs text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
                      >
                        <Undo2 className="w-3 h-3" />
                        Ångra
                      </button>
                    )}
                    {activity.undone_at && (
                      <span className="flex-shrink-0 text-xs text-zinc-600 italic">Ångrad</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* Statistics Footer */}
        {/* ============================================================== */}
        {stats && (
          <div className="flex-shrink-0 border-t border-zinc-800 px-4 lg:px-6 py-3 bg-zinc-900/30">
            <div className="flex items-center gap-4 lg:gap-8 overflow-x-auto text-xs">
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-violet-400" />
                <span className="text-zinc-400">Aktiva deals:</span>
                <span className="text-white font-medium">{stats.totalDeals}</span>
                <span className="text-zinc-500">({formatValueCompact(stats.totalValue)})</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-zinc-400">Vunna denna månad:</span>
                <span className="text-white font-medium">
                  {formatValueCompact(stats.wonValueThisMonth)}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-zinc-400">Nya leads idag:</span>
                <span className="text-white font-medium">{stats.newLeadsToday}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-zinc-400">Behöver uppföljning:</span>
                <span className="text-white font-medium">{stats.needsFollowUp}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* Deal Detail Panel (slide-over from right) */}
      {/* ============================================================== */}
      {selectedDeal && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={closeDealDetail}
          />
          {/* Panel */}
          <div className="fixed inset-y-0 right-0 z-50 w-full lg:w-[480px] bg-zinc-900 border-l border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Panel header */}
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-3 min-w-0">
                {(() => {
                  const stage = getStageForDeal(selectedDeal)
                  return stage ? (
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-medium text-white flex-shrink-0"
                      style={{ backgroundColor: stage.color + '33', color: stage.color, border: `1px solid ${stage.color}55` }}
                    >
                      {stage.name}
                    </span>
                  ) : null
                })()}
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getPriorityBadgeStyle(selectedDeal.priority)}`}>
                  {getPriorityLabel(selectedDeal.priority)}
                </span>
              </div>
              <button
                onClick={closeDealDetail}
                className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-5 space-y-6">
                {/* Title */}
                <div>
                  {editingTitle ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editTitleValue}
                        onChange={e => setEditTitleValue(e.target.value)}
                        className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-white text-lg font-bold focus:outline-none focus:border-violet-500/50"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            updateDealField(selectedDeal.id, 'title', editTitleValue)
                            setEditingTitle(false)
                          }
                          if (e.key === 'Escape') {
                            setEditTitleValue(selectedDeal.title)
                            setEditingTitle(false)
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          updateDealField(selectedDeal.id, 'title', editTitleValue)
                          setEditingTitle(false)
                        }}
                        className="p-2 rounded-lg bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 transition-colors"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditTitleValue(selectedDeal.title)
                        setEditingTitle(true)
                      }}
                      className="group flex items-center gap-2 text-left w-full"
                    >
                      <h2 className="text-lg font-bold text-white">{selectedDeal.title}</h2>
                      <Edit3 className="w-3.5 h-3.5 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}
                  {selectedDeal.description && (
                    <p className="text-sm text-zinc-400 mt-1">{selectedDeal.description}</p>
                  )}
                </div>

                {/* Value */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Värde</span>
                  {editingValue ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={editValueInput}
                        onChange={e => setEditValueInput(e.target.value)}
                        className="w-32 bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-1.5 text-white text-sm text-right focus:outline-none focus:border-violet-500/50"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const v = editValueInput ? parseFloat(editValueInput) : null
                            updateDealField(selectedDeal.id, 'value', v)
                            setEditingValue(false)
                          }
                          if (e.key === 'Escape') {
                            setEditValueInput(selectedDeal.value?.toString() || '')
                            setEditingValue(false)
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          const v = editValueInput ? parseFloat(editValueInput) : null
                          updateDealField(selectedDeal.id, 'value', v)
                          setEditingValue(false)
                        }}
                        className="p-1.5 rounded-lg bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 transition-colors"
                      >
                        <Save className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditValueInput(selectedDeal.value?.toString() || '')
                        setEditingValue(true)
                      }}
                      className="group flex items-center gap-1.5 text-white font-medium text-sm"
                    >
                      {formatValue(selectedDeal.value)}
                      <Edit3 className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}
                </div>

                {/* Priority */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Prioritet</span>
                  {editingPriority ? (
                    <select
                      value={selectedDeal.priority}
                      onChange={e => {
                        updateDealField(selectedDeal.id, 'priority', e.target.value)
                        setEditingPriority(false)
                      }}
                      onBlur={() => setEditingPriority(false)}
                      autoFocus
                      className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-violet-500/50"
                    >
                      <option value="low">Låg</option>
                      <option value="medium">Medium</option>
                      <option value="high">Hög</option>
                      <option value="urgent">Brådskande</option>
                    </select>
                  ) : (
                    <button
                      onClick={() => setEditingPriority(true)}
                      className={`group flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${getPriorityBadgeStyle(selectedDeal.priority)}`}
                    >
                      {getPriorityLabel(selectedDeal.priority)}
                      <Edit3 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}
                </div>

                {/* Source */}
                {selectedDeal.source && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500">Källa</span>
                    <div className="flex items-center gap-1.5">
                      {selectedDeal.source === 'ai' && <Bot className="w-3.5 h-3.5 text-violet-400" />}
                      <span className="text-sm text-white capitalize">{selectedDeal.source}</span>
                    </div>
                  </div>
                )}

                {/* Timestamps */}
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>Skapad {timeAgo(selectedDeal.created_at)}</span>
                  <span>Uppdaterad {timeAgo(selectedDeal.updated_at)}</span>
                </div>

                {/* Customer info */}
                {selectedDeal.customer && (
                  <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-800/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500 uppercase tracking-wider">Kund</span>
                      <Link
                        href={`/dashboard/customers?id=${selectedDeal.customer.customer_id}`}
                        className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors"
                      >
                        Visa <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-zinc-500" />
                      <span className="text-sm text-white">{selectedDeal.customer.name}</span>
                    </div>
                    {selectedDeal.customer.phone_number && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-zinc-500" />
                        <span className="text-sm text-zinc-400">{selectedDeal.customer.phone_number}</span>
                      </div>
                    )}
                    {selectedDeal.customer.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-zinc-500" />
                        <span className="text-sm text-zinc-400">{selectedDeal.customer.email}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Quick actions */}
                <div className="space-y-2">
                  <h4 className="text-xs text-zinc-500 uppercase tracking-wider">Snabbåtgärder</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedDeal.customer_id && (
                      <Link
                        href={`/dashboard/quotes/new?customerId=${selectedDeal.customer_id}`}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700 text-sm text-white hover:border-violet-500/50 hover:bg-violet-500/10 transition-colors"
                      >
                        <FileText className="w-4 h-4 text-violet-400" />
                        Skapa offert
                      </Link>
                    )}
                    {!selectedDeal.customer_id && (
                      <Link
                        href="/dashboard/quotes/new"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700 text-sm text-white hover:border-violet-500/50 hover:bg-violet-500/10 transition-colors"
                      >
                        <FileText className="w-4 h-4 text-violet-400" />
                        Skapa offert
                      </Link>
                    )}
                    {!getStageForDeal(selectedDeal)?.is_lost && (
                      <button
                        onClick={() => markDealLost(selectedDeal.id)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700 text-sm text-red-400 hover:border-red-500/50 hover:bg-red-500/10 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        Markera förlorad
                      </button>
                    )}
                    {selectedDeal.quote_id && (
                      <Link
                        href={`/dashboard/quotes/${selectedDeal.quote_id}`}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700 text-sm text-white hover:border-violet-500/50 hover:bg-violet-500/10 transition-colors"
                      >
                        <FileText className="w-4 h-4 text-emerald-400" />
                        Visa offert
                      </Link>
                    )}
                  </div>
                </div>

                {/* Activity log */}
                <div>
                  <h4 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
                    Aktivitetslogg
                  </h4>
                  {detailLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                    </div>
                  ) : detailActivities.length === 0 ? (
                    <p className="text-sm text-zinc-600 text-center py-4">Ingen aktivitet ännu</p>
                  ) : (
                    <div className="space-y-2">
                      {detailActivities.map(act => (
                        <div
                          key={act.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border ${
                            act.undone_at
                              ? 'bg-zinc-900/30 border-zinc-800/50 opacity-50'
                              : 'bg-zinc-800/30 border-zinc-800'
                          }`}
                        >
                          <div className="mt-0.5">
                            {act.triggered_by === 'ai' ? (
                              <Bot className="w-4 h-4 text-violet-400" />
                            ) : act.triggered_by === 'system' ? (
                              <Sparkles className="w-4 h-4 text-zinc-500" />
                            ) : (
                              <User className="w-4 h-4 text-blue-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-white">
                                {act.description || act.activity_type}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${getTriggeredByStyle(act.triggered_by)}`}
                              >
                                {getTriggeredByLabel(act.triggered_by)}
                              </span>
                            </div>
                            {act.from_stage_name && act.to_stage_name && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-zinc-500">
                                <span>{act.from_stage_name}</span>
                                <ArrowRight className="w-3 h-3" />
                                <span>{act.to_stage_name}</span>
                              </div>
                            )}
                            {act.ai_reason && (
                              <p className="text-xs text-zinc-500 mt-1">{act.ai_reason}</p>
                            )}
                            <span className="text-xs text-zinc-600 mt-1 block">
                              {timeAgo(act.created_at)}
                            </span>
                          </div>
                          {act.triggered_by === 'ai' && !act.undone_at && (
                            <button
                              onClick={() => undoActivity(act.id)}
                              className="flex-shrink-0 p-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
                              title="Ångra"
                            >
                              <Undo2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {act.undone_at && (
                            <span className="text-[10px] text-zinc-600 italic flex-shrink-0">
                              Ångrad
                            </span>
                          )}
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

      {/* ============================================================== */}
      {/* New Deal Modal */}
      {/* ============================================================== */}
      {showNewDeal && (
        <>
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={() => setShowNewDeal(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-lg">
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                <h2 className="text-lg font-bold text-white">Ny deal</h2>
                <button
                  onClick={() => setShowNewDeal(false)}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal body */}
              <div className="p-6 space-y-4">
                {/* Title */}
                <div>
                  <label className="text-xs text-zinc-500 uppercase tracking-wider mb-1 block">
                    Titel *
                  </label>
                  <input
                    type="text"
                    value={newDealForm.title}
                    onChange={e =>
                      setNewDealForm(prev => ({ ...prev, title: e.target.value }))
                    }
                    placeholder="T.ex. Badrumsrenovering Andersson"
                    className="w-full px-3 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-violet-500/50"
                  />
                </div>

                {/* Customer */}
                <div>
                  <label className="text-xs text-zinc-500 uppercase tracking-wider mb-1 block">
                    Kund
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={e => setCustomerSearch(e.target.value)}
                      placeholder="Sök kund..."
                      className="w-full pl-9 pr-3 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-violet-500/50"
                    />
                  </div>
                  {newDealForm.customer_id && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-xs text-violet-400">
                        Vald: {customers.find(c => c.customer_id === newDealForm.customer_id)?.name || 'Okänd'}
                      </span>
                      <button
                        onClick={() =>
                          setNewDealForm(prev => ({ ...prev, customer_id: '' }))
                        }
                        className="text-xs text-zinc-500 hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {customerSearch && !newDealForm.customer_id && (
                    <div className="mt-1 max-h-32 overflow-y-auto bg-zinc-800 border border-zinc-700 rounded-lg">
                      {filteredCustomers.length === 0 && (
                        <div className="px-3 py-2 text-xs text-zinc-500">Inga kunder hittades</div>
                      )}
                      {filteredCustomers.slice(0, 8).map(c => (
                        <button
                          key={c.customer_id}
                          onClick={() => {
                            setNewDealForm(prev => ({
                              ...prev,
                              customer_id: c.customer_id
                            }))
                            setCustomerSearch('')
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-zinc-700/50 transition-colors flex items-center justify-between"
                        >
                          <span>{c.name}</span>
                          <span className="text-xs text-zinc-500">{c.phone_number}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Value */}
                <div>
                  <label className="text-xs text-zinc-500 uppercase tracking-wider mb-1 block">
                    Värde (kr)
                  </label>
                  <input
                    type="number"
                    value={newDealForm.value}
                    onChange={e =>
                      setNewDealForm(prev => ({ ...prev, value: e.target.value }))
                    }
                    placeholder="0"
                    className="w-full px-3 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-violet-500/50"
                  />
                </div>

                {/* Priority */}
                <div>
                  <label className="text-xs text-zinc-500 uppercase tracking-wider mb-1 block">
                    Prioritet
                  </label>
                  <select
                    value={newDealForm.priority}
                    onChange={e =>
                      setNewDealForm(prev => ({ ...prev, priority: e.target.value }))
                    }
                    className="w-full px-3 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500/50"
                  >
                    <option value="low">Låg</option>
                    <option value="medium">Medium</option>
                    <option value="high">Hög</option>
                    <option value="urgent">Brådskande</option>
                  </select>
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs text-zinc-500 uppercase tracking-wider mb-1 block">
                    Beskrivning
                  </label>
                  <textarea
                    value={newDealForm.description}
                    onChange={e =>
                      setNewDealForm(prev => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="Kort beskrivning av dealen..."
                    rows={3}
                    className="w-full px-3 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-violet-500/50 resize-none"
                  />
                </div>
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800">
                <button
                  onClick={() => setShowNewDeal(false)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
                >
                  Avbryt
                </button>
                <button
                  onClick={createDeal}
                  disabled={newDealSubmitting || !newDealForm.title.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-sm font-medium hover:from-violet-600 hover:to-fuchsia-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {newDealSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Skapa deal
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ============================================================== */}
      {/* Toast */}
      {/* ============================================================== */}
      {toast.show && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border shadow-xl text-sm font-medium ${
              toast.type === 'success'
                ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                : toast.type === 'error'
                ? 'bg-red-500/20 border-red-500/30 text-red-300'
                : 'bg-zinc-800 border-zinc-700 text-white'
            }`}
          >
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
// Deal Card Component
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
    <div
      draggable
      onDragStart={e => onDragStart(e, deal.id)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`group p-3 rounded-lg border-l-[3px] border border-zinc-800 bg-zinc-900/50 backdrop-blur-xl cursor-pointer transition-all hover:border-zinc-700 hover:bg-zinc-800/50 ${
        getPriorityColor(deal.priority)
      } ${isDragging ? 'opacity-40 scale-95' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h4 className="text-sm font-medium text-white truncate">{deal.title}</h4>
            {deal.source === 'ai' && (
              <Bot className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
            )}
          </div>
          {deal.customer?.name && (
            <p className="text-xs text-zinc-400 mt-0.5 truncate">{deal.customer.name}</p>
          )}
        </div>
        <GripVertical className="w-4 h-4 text-zinc-700 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-xs font-medium text-zinc-300">
          {deal.value != null && deal.value > 0
            ? formatValueCompact(deal.value)
            : ''}
        </span>
        <span className="text-[10px] text-zinc-600 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {timeAgo(deal.updated_at)}
        </span>
      </div>
    </div>
  )
}
