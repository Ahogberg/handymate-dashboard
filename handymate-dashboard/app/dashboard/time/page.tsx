'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  Clock,
  Plus,
  Calendar,
  User,
  Play,
  Square,
  Trash2,
  Edit2,
  X,
  Check,
  Loader2,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  List,
  LayoutGrid,
  FileText,
  Filter,
  CheckSquare
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addWeeks,
  subWeeks,
  addDays,
  parseISO,
  isSameDay,
  getISOWeek
} from 'date-fns'
import { sv } from 'date-fns/locale'

interface TimeEntry {
  time_entry_id: string
  booking_id: string | null
  customer_id: string | null
  work_type_id: string | null
  description: string | null
  work_date: string
  start_time: string | null
  end_time: string | null
  duration_minutes: number
  hourly_rate: number | null
  is_billable: boolean
  invoiced: boolean
  invoice_id: string | null
  created_at: string
  customer?: { customer_id: string; name: string }
  booking?: { booking_id: string; notes: string }
  work_type?: { work_type_id: string; name: string; multiplier: number }
}

interface WorkType {
  work_type_id: string
  name: string
  multiplier: number
  billable_default: boolean
  sort_order: number
}

interface Customer {
  customer_id: string
  name: string
}

interface Booking {
  booking_id: string
  notes: string
  customer_id: string
  customer?: { name: string }
}

interface Stats {
  totalMinutesWeek: number
  billableMinutesWeek: number
  totalMinutesMonth: number
  entriesThisWeek: number
  uninvoicedMinutes: number
  uninvoicedRevenue: number
}

export default function TimePage() {
  const business = useBusiness()
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [workTypes, setWorkTypes] = useState<WorkType[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [projects, setProjects] = useState<{ project_id: string; name: string; customer_id: string | null }[]>([])
  const [stats, setStats] = useState<Stats>({
    totalMinutesWeek: 0, billableMinutesWeek: 0, totalMinutesMonth: 0,
    entriesThisWeek: 0, uninvoicedMinutes: 0, uninvoicedRevenue: 0
  })
  const [loading, setLoading] = useState(true)

  // View state
  const [viewMode, setViewMode] = useState<'week' | 'list'>('week')
  const [currentWeek, setCurrentWeek] = useState(new Date())

  // Timer
  const [activeTimer, setActiveTimer] = useState(false)
  const [timerStart, setTimerStart] = useState<Date | null>(null)
  const [timerElapsed, setTimerElapsed] = useState(0)

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [formData, setFormData] = useState({
    customer_id: '',
    booking_id: '',
    work_type_id: '',
    project_id: '',
    description: '',
    work_date: format(new Date(), 'yyyy-MM-dd'),
    duration_hours: 0,
    duration_minutes: 0,
    hourly_rate: '',
    is_billable: true
  })
  const [saving, setSaving] = useState(false)

  // List filters
  const [filterCustomer, setFilterCustomer] = useState('')
  const [filterWorkType, setFilterWorkType] = useState('')
  const [filterInvoiced, setFilterInvoiced] = useState<'all' | 'yes' | 'no'>('all')
  const [showFilters, setShowFilters] = useState(false)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  // Toast
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false, message: '', type: 'success'
  })

  // Week dates
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 })
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekNumber = getISOWeek(currentWeek)

  useEffect(() => {
    if (business.business_id) {
      fetchAll()
    }
  }, [business.business_id])

  useEffect(() => {
    if (business.business_id) {
      fetchEntries()
    }
  }, [currentWeek, business.business_id])

  // Timer tick
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (activeTimer && timerStart) {
      interval = setInterval(() => {
        setTimerElapsed(Math.floor((Date.now() - timerStart.getTime()) / 1000))
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [activeTimer, timerStart])

  async function fetchAll() {
    await Promise.all([fetchEntries(), fetchWorkTypes(), fetchCustomersAndBookings(), fetchStats()])
    setLoading(false)
  }

  async function fetchEntries() {
    const ws = format(startOfWeek(currentWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const we = format(endOfWeek(currentWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd')

    const { data } = await supabase
      .from('time_entry')
      .select(`
        *,
        customer:customer_id (customer_id, name),
        booking:booking_id (booking_id, notes),
        work_type:work_type_id (work_type_id, name, multiplier)
      `)
      .eq('business_id', business.business_id)
      .gte('work_date', ws)
      .lte('work_date', we)
      .order('work_date', { ascending: false })
      .order('created_at', { ascending: false })

    setEntries(data || [])
  }

  async function fetchWorkTypes() {
    const { data } = await supabase
      .from('work_type')
      .select('*')
      .eq('business_id', business.business_id)
      .order('sort_order')

    setWorkTypes(data || [])
  }

  async function fetchCustomersAndBookings() {
    const { data: c } = await supabase
      .from('customer')
      .select('customer_id, name')
      .eq('business_id', business.business_id)
      .order('name')

    const { data: b } = await supabase
      .from('booking')
      .select('booking_id, notes, customer_id, customer (name)')
      .eq('business_id', business.business_id)
      .in('status', ['confirmed', 'pending'])
      .order('scheduled_start', { ascending: false })
      .limit(50)

    const { data: p } = await supabase
      .from('project')
      .select('project_id, name, customer_id')
      .eq('business_id', business.business_id)
      .in('status', ['planning', 'active'])
      .order('name')

    setCustomers(c || [])
    setBookings(b || [])
    setProjects(p || [])
  }

  async function fetchStats() {
    const today = new Date()
    const ws = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const we = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const ms = format(startOfMonth(today), 'yyyy-MM-dd')
    const me = format(endOfMonth(today), 'yyyy-MM-dd')

    const [weekRes, monthRes, uninvoicedRes] = await Promise.all([
      supabase.from('time_entry').select('duration_minutes, is_billable').eq('business_id', business.business_id).gte('work_date', ws).lte('work_date', we),
      supabase.from('time_entry').select('duration_minutes').eq('business_id', business.business_id).gte('work_date', ms).lte('work_date', me),
      supabase.from('time_entry').select('duration_minutes, hourly_rate').eq('business_id', business.business_id).eq('invoiced', false).eq('is_billable', true)
    ])

    const weekData = weekRes.data || []
    const monthData = monthRes.data || []
    const uninvoicedData = uninvoicedRes.data || []

    setStats({
      totalMinutesWeek: weekData.reduce((s: number, e: any) => s + (e.duration_minutes || 0), 0),
      billableMinutesWeek: weekData.filter((e: any) => e.is_billable).reduce((s: number, e: any) => s + (e.duration_minutes || 0), 0),
      totalMinutesMonth: monthData.reduce((s: number, e: any) => s + (e.duration_minutes || 0), 0),
      entriesThisWeek: weekData.length,
      uninvoicedMinutes: uninvoicedData.reduce((s: number, e: any) => s + (e.duration_minutes || 0), 0),
      uninvoicedRevenue: uninvoicedData.reduce((s: number, e: any) => s + ((e.duration_minutes || 0) / 60) * (e.hourly_rate || 0), 0)
    })
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const fmtDuration = (min: number) => {
    const h = Math.floor(min / 60)
    const m = min % 60
    if (h === 0) return `${m}m`
    if (m === 0) return `${h}h`
    return `${h}h ${m}m`
  }

  const fmtTimer = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  // Timer
  const startTimer = () => { setActiveTimer(true); setTimerStart(new Date()); setTimerElapsed(0) }
  const stopTimer = () => {
    if (timerStart) {
      const mins = Math.floor((Date.now() - timerStart.getTime()) / 60000)
      setFormData(prev => ({ ...prev, duration_hours: Math.floor(mins / 60), duration_minutes: mins % 60, work_date: format(new Date(), 'yyyy-MM-dd') }))
      setEditingEntry(null)
      setShowModal(true)
    }
    setActiveTimer(false); setTimerStart(null); setTimerElapsed(0)
  }

  // Modal
  const openAddModal = (prefillDate?: string, prefillCustomer?: string) => {
    setEditingEntry(null)
    setFormData({
      customer_id: prefillCustomer || '',
      booking_id: '',
      work_type_id: '',
      project_id: '',
      description: '',
      work_date: prefillDate || format(new Date(), 'yyyy-MM-dd'),
      duration_hours: 0,
      duration_minutes: 0,
      hourly_rate: '',
      is_billable: true
    })
    setShowModal(true)
  }

  const openEditModal = (entry: TimeEntry) => {
    setEditingEntry(entry)
    const total = entry.duration_minutes || 0
    setFormData({
      customer_id: entry.customer_id || '',
      booking_id: entry.booking_id || '',
      work_type_id: entry.work_type_id || '',
      project_id: (entry as any).project_id || '',
      description: entry.description || '',
      work_date: entry.work_date,
      duration_hours: Math.floor(total / 60),
      duration_minutes: total % 60,
      hourly_rate: entry.hourly_rate?.toString() || '',
      is_billable: entry.is_billable
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const totalMins = (formData.duration_hours * 60) + formData.duration_minutes
      if (totalMins <= 0) { showToast('Ange en tid längre än 0', 'error'); setSaving(false); return }

      const entryData = {
        business_id: business.business_id,
        customer_id: formData.customer_id || null,
        booking_id: formData.booking_id || null,
        work_type_id: formData.work_type_id || null,
        description: formData.description || null,
        work_date: formData.work_date,
        duration_minutes: totalMins,
        hourly_rate: formData.hourly_rate ? parseFloat(formData.hourly_rate) : null,
        is_billable: formData.is_billable
      }

      if (editingEntry) {
        const { error } = await supabase.from('time_entry').update(entryData).eq('time_entry_id', editingEntry.time_entry_id)
        if (error) throw error
        showToast('Tidpost uppdaterad!', 'success')
      } else {
        const { error } = await supabase.from('time_entry').insert(entryData)
        if (error) throw error
        showToast('Tid registrerad!', 'success')
      }

      setShowModal(false)
      fetchEntries()
      fetchStats()
    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Ta bort denna tidpost?')) return
    try {
      const { error } = await supabase.from('time_entry').delete().eq('time_entry_id', id)
      if (error) throw error
      showToast('Tidpost borttagen', 'success')
      fetchEntries()
      fetchStats()
    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    }
  }

  const handleBookingChange = (bookingId: string) => {
    const booking = bookings.find(b => b.booking_id === bookingId)
    setFormData(prev => ({
      ...prev,
      booking_id: bookingId,
      customer_id: booking?.customer_id || prev.customer_id
    }))
  }

  const handleWorkTypeChange = (wtId: string) => {
    const wt = workTypes.find(w => w.work_type_id === wtId)
    setFormData(prev => ({
      ...prev,
      work_type_id: wtId,
      is_billable: wt ? wt.billable_default : prev.is_billable
    }))
  }

  // Bulk actions
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    const nonInvoiced = filteredEntries.filter(e => !e.invoiced)
    if (selectedIds.size === nonInvoiced.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(nonInvoiced.map(e => e.time_entry_id)))
    }
  }

  const handleBulkMarkInvoiced = async () => {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    try {
      const res = await fetch('/api/time-entry/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_ids: Array.from(selectedIds), action: 'mark_invoiced' })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(`${data.updated} poster markerade som fakturerade`, 'success')
      setSelectedIds(new Set())
      fetchEntries()
      fetchStats()
    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    } finally {
      setBulkLoading(false)
    }
  }

  // Quick-add presets (mobile)
  const quickAdd = (minutes: number) => {
    setEditingEntry(null)
    setFormData({
      customer_id: '',
      booking_id: '',
      work_type_id: '',
      project_id: '',
      description: '',
      work_date: format(new Date(), 'yyyy-MM-dd'),
      duration_hours: Math.floor(minutes / 60),
      duration_minutes: minutes % 60,
      hourly_rate: '',
      is_billable: true
    })
    setShowModal(true)
  }

  // Week grid data
  const weekGrid = useMemo(() => {
    const gridMap: Record<string, { label: string; entries: Record<string, TimeEntry[]> }> = {}

    for (const entry of entries) {
      const rowKey = entry.customer_id || 'none'
      const rowLabel = entry.customer?.name || 'Ingen kund'
      if (!gridMap[rowKey]) gridMap[rowKey] = { label: rowLabel, entries: {} }
      const dayKey = entry.work_date
      if (!gridMap[rowKey].entries[dayKey]) gridMap[rowKey].entries[dayKey] = []
      gridMap[rowKey].entries[dayKey].push(entry)
    }

    return Object.entries(gridMap).map(([customerId, { label, entries: dayEntries }]) => ({
      customerId,
      label,
      days: weekDates.map(date => {
        const dayKey = format(date, 'yyyy-MM-dd')
        const dayItems = dayEntries[dayKey] || []
        const totalMinutes = dayItems.reduce((s, e) => s + (e.duration_minutes || 0), 0)
        return { date, dayKey, entries: dayItems, totalMinutes }
      }),
      totalMinutes: Object.values(dayEntries).flat().reduce((s, e) => s + (e.duration_minutes || 0), 0)
    }))
  }, [entries, weekDates])

  // Column totals for week grid
  const columnTotals = useMemo(() =>
    weekDates.map(date => {
      const dayKey = format(date, 'yyyy-MM-dd')
      return entries.filter(e => e.work_date === dayKey).reduce((s, e) => s + (e.duration_minutes || 0), 0)
    }),
    [entries, weekDates]
  )
  const grandTotal = columnTotals.reduce((a, b) => a + b, 0)

  // Filtered entries for list view
  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      if (filterCustomer && e.customer_id !== filterCustomer) return false
      if (filterWorkType && e.work_type_id !== filterWorkType) return false
      if (filterInvoiced === 'yes' && !e.invoiced) return false
      if (filterInvoiced === 'no' && e.invoiced) return false
      return true
    })
  }, [entries, filterCustomer, filterWorkType, filterInvoiced])

  if (loading) {
    return (
      <div className="p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[128px]" />
      </div>

      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-red-500/20 border-red-500/30 text-red-400'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">
                {editingEntry ? 'Redigera tidpost' : 'Registrera tid'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Datum */}
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Datum</label>
                <input
                  type="date"
                  value={formData.work_date}
                  onChange={e => setFormData({ ...formData, work_date: e.target.value })}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              {/* Duration */}
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Tid</label>
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <input type="number" min="0" value={formData.duration_hours}
                      onChange={e => setFormData({ ...formData, duration_hours: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">tim</span>
                  </div>
                  <div className="flex-1 relative">
                    <input type="number" min="0" max="59" value={formData.duration_minutes}
                      onChange={e => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">min</span>
                  </div>
                </div>
                {/* Quick presets */}
                <div className="flex gap-2 mt-2">
                  {[60, 120, 240, 480].map(mins => (
                    <button key={mins} onClick={() => setFormData({ ...formData, duration_hours: Math.floor(mins / 60), duration_minutes: mins % 60 })}
                      className="px-3 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 hover:text-white hover:border-violet-500/30">
                      {mins / 60}h
                    </button>
                  ))}
                </div>
              </div>

              {/* Kund */}
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Kund</label>
                <select value={formData.customer_id}
                  onChange={e => setFormData({ ...formData, customer_id: e.target.value })}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50">
                  <option value="">Välj kund...</option>
                  {customers.map(c => <option key={c.customer_id} value={c.customer_id}>{c.name}</option>)}
                </select>
              </div>

              {/* Bokning */}
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Bokning</label>
                <select value={formData.booking_id}
                  onChange={e => handleBookingChange(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50">
                  <option value="">Välj bokning...</option>
                  {bookings.map(b => (
                    <option key={b.booking_id} value={b.booking_id}>
                      {b.customer?.name || 'Okänd'} - {b.notes?.substring(0, 30) || 'Ingen beskrivning'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Projekt */}
              {projects.length > 0 && (
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Projekt</label>
                  <select value={formData.project_id}
                    onChange={e => setFormData({ ...formData, project_id: e.target.value })}
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50">
                    <option value="">Inget projekt</option>
                    {projects.map(p => <option key={p.project_id} value={p.project_id}>{p.name}</option>)}
                  </select>
                </div>
              )}

              {/* Arbetstyp */}
              {workTypes.length > 0 && (
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Arbetstyp</label>
                  <select value={formData.work_type_id}
                    onChange={e => handleWorkTypeChange(e.target.value)}
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50">
                    <option value="">Normal</option>
                    {workTypes.map(wt => (
                      <option key={wt.work_type_id} value={wt.work_type_id}>
                        {wt.name} ({wt.multiplier}x)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Beskrivning */}
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Beskrivning</label>
                <textarea value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Vad har du gjort?" rows={3}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none" />
              </div>

              {/* Timpris */}
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Timpris</label>
                <div className="relative">
                  <input type="number" min="0" value={formData.hourly_rate}
                    onChange={e => setFormData({ ...formData, hourly_rate: e.target.value })}
                    placeholder="Standard"
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">kr/tim</span>
                </div>
              </div>

              {/* Fakturerbar */}
              <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-xl">
                <span className="text-white">Fakturerbar tid</span>
                <button type="button" onClick={() => setFormData({ ...formData, is_billable: !formData.is_billable })}
                  className={`w-12 h-6 rounded-full transition-all ${formData.is_billable ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500' : 'bg-zinc-700'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${formData.is_billable ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-zinc-400 hover:text-white">Avbryt</button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center px-6 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                {editingEntry ? 'Spara' : 'Registrera'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
          <div className="flex items-center">
            <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 mr-4">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Tidrapportering</h1>
              <p className="text-zinc-400 text-sm">Logga och hantera arbetstid</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {activeTimer ? (
              <div className="flex items-center gap-3 px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 rounded-xl">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-emerald-400 font-mono text-lg">{fmtTimer(timerElapsed)}</span>
                <button onClick={stopTimer} className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg">
                  <Square className="w-4 h-4 text-red-400" />
                </button>
              </div>
            ) : (
              <button onClick={startTimer}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white hover:bg-zinc-700">
                <Play className="w-4 h-4" />
                <span className="hidden sm:inline">Timer</span>
              </button>
            )}

            <button onClick={() => openAddModal()}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Lägg till</span>
            </button>
          </div>
        </div>

        {/* Mobile quick presets */}
        <div className="sm:hidden flex gap-2 mb-4">
          {[{ label: '1h', mins: 60 }, { label: '2h', mins: 120 }, { label: '4h', mins: 240 }, { label: '8h', mins: 480 }].map(p => (
            <button key={p.label} onClick={() => quickAdd(p.mins)}
              className="flex-1 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl text-white font-medium text-center hover:border-violet-500/30">
              + {p.label}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl p-4 border border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500"><Clock className="w-4 h-4 text-white" /></div>
            </div>
            <p className="text-2xl font-bold text-white">{fmtDuration(stats.totalMinutesWeek)}</p>
            <p className="text-xs text-zinc-500">Total tid vecka</p>
          </div>
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl p-4 border border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-green-500"><DollarSign className="w-4 h-4 text-white" /></div>
            </div>
            <p className="text-2xl font-bold text-white">{fmtDuration(stats.billableMinutesWeek)}</p>
            <p className="text-xs text-zinc-500">Fakturerbar vecka</p>
          </div>
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl p-4 border border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500"><FileText className="w-4 h-4 text-white" /></div>
            </div>
            <p className="text-2xl font-bold text-white">{fmtDuration(stats.uninvoicedMinutes)}</p>
            <p className="text-xs text-zinc-500">Ofakturerat ({Math.round(stats.uninvoicedRevenue).toLocaleString('sv-SE')} kr)</p>
          </div>
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl p-4 border border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500"><Calendar className="w-4 h-4 text-white" /></div>
            </div>
            <p className="text-2xl font-bold text-white">{fmtDuration(stats.totalMinutesMonth)}</p>
            <p className="text-xs text-zinc-500">Total tid månad</p>
          </div>
        </div>

        {/* View Toggle + Week Nav */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="hidden sm:flex bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            <button onClick={() => setViewMode('week')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'week' ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white' : 'text-zinc-400 hover:text-white'}`}>
              <LayoutGrid className="w-4 h-4" /> Vecka
            </button>
            <button onClick={() => setViewMode('list')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'list' ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white' : 'text-zinc-400 hover:text-white'}`}>
              <List className="w-4 h-4" /> Lista
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
              className="p-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 hover:text-white">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setCurrentWeek(new Date())}
              className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm font-medium hover:border-violet-500/30 min-w-[180px] text-center">
              V{weekNumber} &middot; {format(weekStart, 'd MMM', { locale: sv })} – {format(weekEnd, 'd MMM', { locale: sv })}
            </button>
            <button onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
              className="p-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 hover:text-white">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* WEEK GRID VIEW (desktop only) */}
        {viewMode === 'week' && (
          <div className="hidden sm:block bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 overflow-hidden mb-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase w-40">Kund</th>
                    {weekDates.map((date, i) => {
                      const isToday = isSameDay(date, new Date())
                      return (
                        <th key={i} className={`px-3 py-3 text-center text-xs font-medium uppercase min-w-[80px] ${isToday ? 'text-violet-400' : 'text-zinc-500'}`}>
                          <div>{format(date, 'EEE', { locale: sv })}</div>
                          <div className={`text-lg font-bold ${isToday ? 'text-violet-400' : 'text-zinc-300'}`}>{format(date, 'd')}</div>
                        </th>
                      )
                    })}
                    <th className="px-4 py-3 text-center text-xs font-medium text-zinc-500 uppercase">Summa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {weekGrid.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-12 text-center">
                        <Clock className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                        <p className="text-zinc-400">Inga tidposter denna vecka</p>
                        <p className="text-zinc-600 text-sm mt-1">Klicka på en cell eller &quot;Lägg till&quot; för att registrera tid</p>
                      </td>
                    </tr>
                  ) : (
                    weekGrid.map(row => (
                      <tr key={row.customerId} className="hover:bg-zinc-800/20">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                            <span className="text-sm text-white truncate">{row.label}</span>
                          </div>
                        </td>
                        {row.days.map((day, i) => {
                          const isToday = isSameDay(day.date, new Date())
                          return (
                            <td key={i}
                              onClick={() => day.entries.length > 0 ? openEditModal(day.entries[0]) : openAddModal(day.dayKey, row.customerId !== 'none' ? row.customerId : undefined)}
                              className={`px-2 py-3 text-center cursor-pointer transition-colors hover:bg-violet-500/10 ${isToday ? 'bg-violet-500/5' : ''}`}>
                              {day.totalMinutes > 0 ? (
                                <div className="flex flex-col items-center gap-1">
                                  <span className="text-sm font-medium text-white">{fmtDuration(day.totalMinutes)}</span>
                                  {day.entries.length > 1 && (
                                    <span className="text-xs text-zinc-500">{day.entries.length} poster</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-zinc-700 text-sm">–</span>
                              )}
                            </td>
                          )
                        })}
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm font-bold text-white">{fmtDuration(row.totalMinutes)}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {weekGrid.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-zinc-700 bg-zinc-800/30">
                      <td className="px-4 py-3 text-sm font-medium text-zinc-400">Summa</td>
                      {columnTotals.map((total, i) => (
                        <td key={i} className="px-3 py-3 text-center text-sm font-medium text-zinc-300">
                          {total > 0 ? fmtDuration(total) : '–'}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-bold text-violet-400">{fmtDuration(grandTotal)}</span>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* LIST VIEW */}
        <div className={`${viewMode === 'week' ? 'sm:hidden' : ''} bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800`}>
          {/* Filters header */}
          <div className="p-4 border-b border-zinc-800">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">
                Tidposter <span className="text-zinc-500 font-normal ml-1">({filteredEntries.length})</span>
              </h2>
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <button onClick={handleBulkMarkInvoiced} disabled={bulkLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-xs text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50">
                    {bulkLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckSquare className="w-3 h-3" />}
                    Fakturera ({selectedIds.size})
                  </button>
                )}
                <button onClick={() => setShowFilters(!showFilters)}
                  className={`p-2 rounded-lg transition-colors ${showFilters ? 'bg-violet-500/20 text-violet-400' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
                  <Filter className="w-4 h-4" />
                </button>
              </div>
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)}
                  className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50">
                  <option value="">Alla kunder</option>
                  {customers.map(c => <option key={c.customer_id} value={c.customer_id}>{c.name}</option>)}
                </select>
                <select value={filterWorkType} onChange={e => setFilterWorkType(e.target.value)}
                  className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50">
                  <option value="">Alla arbetstyper</option>
                  {workTypes.map(wt => <option key={wt.work_type_id} value={wt.work_type_id}>{wt.name}</option>)}
                </select>
                <select value={filterInvoiced} onChange={e => setFilterInvoiced(e.target.value as any)}
                  className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50">
                  <option value="all">Alla</option>
                  <option value="no">Ej fakturerade</option>
                  <option value="yes">Fakturerade</option>
                </select>
              </div>
            )}
          </div>

          {/* List items */}
          <div className="divide-y divide-zinc-800">
            {filteredEntries.length === 0 ? (
              <div className="p-8 text-center">
                <Clock className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400 text-sm">Inga tidposter denna vecka</p>
              </div>
            ) : (
              <>
                {viewMode === 'list' && filteredEntries.some(e => !e.invoiced) && (
                  <div className="px-4 py-2 bg-zinc-800/30">
                    <button onClick={selectAll} className="flex items-center gap-2 text-xs text-zinc-500 hover:text-white">
                      <div className={`w-4 h-4 rounded border ${selectedIds.size === filteredEntries.filter(e => !e.invoiced).length && selectedIds.size > 0 ? 'bg-violet-500 border-violet-500' : 'border-zinc-600'} flex items-center justify-center`}>
                        {selectedIds.size === filteredEntries.filter(e => !e.invoiced).length && selectedIds.size > 0 && <Check className="w-3 h-3 text-white" />}
                      </div>
                      Välj alla ej fakturerade
                    </button>
                  </div>
                )}

                {filteredEntries.map(entry => (
                  <div key={entry.time_entry_id} className="p-4 hover:bg-zinc-800/30 transition-all">
                    <div className="flex items-start gap-3">
                      {viewMode === 'list' && !entry.invoiced && (
                        <button onClick={() => toggleSelect(entry.time_entry_id)} className="mt-1 flex-shrink-0">
                          <div className={`w-5 h-5 rounded border ${selectedIds.has(entry.time_entry_id) ? 'bg-violet-500 border-violet-500' : 'border-zinc-600 hover:border-zinc-400'} flex items-center justify-center`}>
                            {selectedIds.has(entry.time_entry_id) && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </button>
                      )}

                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border flex-shrink-0 ${
                        entry.invoiced ? 'bg-emerald-500/10 border-emerald-500/20'
                        : entry.is_billable ? 'bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border-violet-500/30'
                        : 'bg-zinc-800/50 border-zinc-700'
                      }`}>
                        <Clock className={`w-5 h-5 ${entry.invoiced ? 'text-emerald-400' : entry.is_billable ? 'text-violet-400' : 'text-zinc-500'}`} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-white">{fmtDuration(entry.duration_minutes)}</span>
                          {entry.work_type && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
                              {entry.work_type.name}
                            </span>
                          )}
                          {entry.invoiced ? (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Fakturerad
                            </span>
                          ) : entry.is_billable ? (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              Ofakturerad
                            </span>
                          ) : null}
                        </div>
                        {entry.description && (
                          <p className="text-sm text-zinc-400 mt-1 truncate">{entry.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(parseISO(entry.work_date), 'EEE d MMM', { locale: sv })}
                          </span>
                          {entry.customer && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {entry.customer.name}
                            </span>
                          )}
                          {entry.hourly_rate && (
                            <span className="flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              {entry.hourly_rate} kr/tim
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!entry.invoiced && (
                          <>
                            <button onClick={() => openEditModal(entry)}
                              className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(entry.time_entry_id)}
                              className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
