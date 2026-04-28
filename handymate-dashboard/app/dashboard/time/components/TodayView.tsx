'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  Check,
  X,
  MapPin,
  Download,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import Link from 'next/link'
import TimerWidget from '@/components/time/TimerWidget'
import TimeEntryModal from '@/components/time/TimeEntryModal'
import TravelSection from '@/components/time/TravelSection'
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
import { calculateWeeklyOvertime, formatMinutes } from '@/lib/overtime'

interface TimeEntry {
  time_entry_id: string
  booking_id: string | null
  customer_id: string | null
  work_type_id: string | null
  business_user_id: string | null
  description: string | null
  work_date: string
  start_time: string | null
  end_time: string | null
  duration_minutes: number
  hourly_rate: number | null
  is_billable: boolean
  invoiced: boolean
  invoice_id: string | null
  approval_status?: 'pending' | 'approved' | 'rejected'
  rejection_reason?: string | null
  break_minutes?: number
  created_at: string
  start_latitude?: number | null
  start_longitude?: number | null
  start_address?: string | null
  end_latitude?: number | null
  end_longitude?: number | null
  end_address?: string | null
  customer?: { customer_id: string; name: string }
  booking?: { booking_id: string; notes: string }
  work_type?: { work_type_id: string; name: string; multiplier: number }
  business_user?: { id: string; name: string; color: string } | null
}

interface TeamMemberBasic {
  id: string
  name: string
  color: string
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

export default function TodayView() {
  const business = useBusiness()
  const { user: currentUser, isOwnerOrAdmin } = useCurrentUser()
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [workTypes, setWorkTypes] = useState<WorkType[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [projects, setProjects] = useState<{ project_id: string; name: string; customer_id: string | null }[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMemberBasic[]>([])
  const [filterPerson, setFilterPerson] = useState<string>('')
  const [formPersonId, setFormPersonId] = useState<string>('')
  const [stats, setStats] = useState<Stats>({
    totalMinutesWeek: 0, billableMinutesWeek: 0, totalMinutesMonth: 0,
    entriesThisWeek: 0, uninvoicedMinutes: 0, uninvoicedRevenue: 0
  })
  const [loading, setLoading] = useState(true)

  // View state
  const [viewMode, setViewMode] = useState<'week' | 'list'>('week')
  const [currentWeek, setCurrentWeek] = useState(new Date())

  // Timer handled by TimerWidget component

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [formData, setFormData] = useState({
    customer_id: '',
    booking_id: '',
    work_type_id: '',
    project_id: '',
    work_category: 'work' as string,
    description: '',
    internal_notes: '',
    work_date: format(new Date(), 'yyyy-MM-dd'),
    start_time: '',
    end_time: '',
    duration_hours: 0,
    duration_minutes: 0,
    break_minutes: 0,
    hourly_rate: '',
    is_billable: true
  })
  const [saving, setSaving] = useState(false)

  // List filters
  const [filterCustomer, setFilterCustomer] = useState('')
  const [filterWorkType, setFilterWorkType] = useState('')
  const [filterInvoiced, setFilterInvoiced] = useState<'all' | 'yes' | 'no'>('all')
  const [filterApproval, setFilterApproval] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [showFilters, setShowFilters] = useState(false)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [approvingIds, setApprovingIds] = useState(false)

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
  }, [currentWeek, business.business_id, filterPerson])

  // Timer tick handled by TimerWidget

  async function fetchAll() {
    await Promise.all([fetchEntries(), fetchWorkTypes(), fetchCustomersAndBookings(), fetchStats(), fetchTeamMembers()])
    setLoading(false)
  }

  async function fetchTeamMembers() {
    try {
      const res = await fetch('/api/team')
      if (res.ok) {
        const data = await res.json()
        setTeamMembers(
          (data.members || [])
            .filter((m: any) => m.is_active && m.accepted_at)
            .map((m: any) => ({ id: m.id, name: m.name, color: m.color }))
        )
      }
    } catch { /* ignore */ }
  }

  async function fetchEntries() {
    const ws = format(startOfWeek(currentWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const we = format(endOfWeek(currentWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd')

    let query = supabase
      .from('time_entry')
      .select(`
        *,
        customer:customer_id (customer_id, name),
        booking:booking_id (booking_id, notes),
        work_type:work_type_id (work_type_id, name, multiplier),
        business_user:business_user_id (id, name, color)
      `)
      .eq('business_id', business.business_id)
      .gte('work_date', ws)
      .lte('work_date', we)
      .order('work_date', { ascending: false })
      .order('created_at', { ascending: false })

    // Person filter
    if (!isOwnerOrAdmin && currentUser) {
      // Employee only sees own entries
      query = query.eq('business_user_id', currentUser.id)
    } else if (filterPerson) {
      query = query.eq('business_user_id', filterPerson)
    }

    const { data } = await query
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

  // Timer functions moved to TimerWidget
  const handleTimerCheckInOut = () => {
    fetchEntries()
    fetchStats()
  }

  // Modal
  const openAddModal = (prefillDate?: string, prefillCustomer?: string) => {
    setEditingEntry(null)
    setFormData({
      customer_id: prefillCustomer || '',
      booking_id: '',
      work_type_id: '',
      project_id: '',
      work_category: 'work',
      description: '',
      internal_notes: '',
      work_date: prefillDate || format(new Date(), 'yyyy-MM-dd'),
      start_time: '',
      end_time: '',
      duration_hours: 0,
      duration_minutes: 0,
      break_minutes: 0,
      hourly_rate: '',
      is_billable: true
    })
    setFormPersonId(currentUser?.id || '')
    setShowModal(true)
  }

  const openEditModal = (entry: TimeEntry) => {
    setEditingEntry(entry)
    const breakMins = entry.break_minutes || 0
    const netMins = entry.duration_minutes || 0
    const grossMins = netMins + breakMins
    setFormData({
      customer_id: entry.customer_id || '',
      booking_id: entry.booking_id || '',
      work_type_id: entry.work_type_id || '',
      project_id: (entry as any).project_id || '',
      work_category: (entry as any).work_category || 'work',
      description: entry.description || '',
      internal_notes: (entry as any).internal_notes || '',
      work_date: entry.work_date,
      start_time: entry.start_time || '',
      end_time: entry.end_time || '',
      duration_hours: Math.floor(grossMins / 60),
      duration_minutes: grossMins % 60,
      break_minutes: breakMins,
      hourly_rate: entry.hourly_rate?.toString() || '',
      is_billable: entry.is_billable
    })
    setFormPersonId(entry.business_user_id || currentUser?.id || '')
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const grossMins = (formData.duration_hours * 60) + formData.duration_minutes
      const breakMins = formData.break_minutes || 0
      const totalMins = Math.max(0, grossMins - breakMins)
      if (totalMins <= 0) { showToast('Ange en tid längre än 0 (efter rast)', 'error'); setSaving(false); return }

      // Determine which user to assign the entry to
      const assignToUser = isOwnerOrAdmin && formPersonId ? formPersonId : currentUser?.id || null

      const entryData: any = {
        business_id: business.business_id,
        customer_id: formData.customer_id || null,
        booking_id: formData.booking_id || null,
        work_type_id: formData.work_type_id || null,
        work_category: formData.work_category || 'work',
        business_user_id: assignToUser,
        description: formData.description || null,
        internal_notes: formData.internal_notes || null,
        work_date: formData.work_date,
        start_time: formData.start_time || null,
        end_time: formData.end_time || null,
        duration_minutes: totalMins,
        break_minutes: breakMins,
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

  const handleBulkApproval = async (action: 'approve' | 'reject') => {
    if (selectedIds.size === 0) return
    let reason = ''
    if (action === 'reject') {
      reason = prompt('Ange anledning till avslag:') || ''
      if (!reason) return
    }
    setApprovingIds(true)
    try {
      const res = await fetch('/api/time-entry/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry_ids: Array.from(selectedIds),
          action,
          ...(action === 'reject' ? { rejection_reason: reason } : {}),
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(`${data.count} poster ${action === 'approve' ? 'godkända' : 'avslagna'}`, 'success')
      setSelectedIds(new Set())
      fetchEntries()
    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    } finally {
      setApprovingIds(false)
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
      work_category: 'work',
      description: '',
      internal_notes: '',
      work_date: format(new Date(), 'yyyy-MM-dd'),
      start_time: '',
      end_time: '',
      duration_hours: Math.floor(minutes / 60),
      duration_minutes: minutes % 60,
      break_minutes: 0,
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
      if (filterApproval !== 'all' && e.approval_status !== filterApproval) return false
      return true
    })
  }, [entries, filterCustomer, filterWorkType, filterInvoiced, filterApproval])

  // Övertidsberäkning för aktuell vecka
  const weekOvertime = useMemo(() => {
    const weekEntries = entries.filter(e => {
      const d = parseISO(e.work_date)
      return d >= weekStart && d <= weekEnd
    })
    if (weekEntries.length === 0) return null
    return calculateWeeklyOvertime(weekEntries.map(e => ({
      work_date: e.work_date,
      duration_minutes: e.duration_minutes,
      break_minutes: e.break_minutes,
    })))
  }, [entries, weekStart, weekEnd])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-[#0F766E]" />
      </div>
    )
  }

  return (
    <div>
      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-lg border-thin text-[13px] ${
          toast.type === 'success' ? 'bg-[#CCFBF1] border-[#0F766E] text-[#0F766E]' : 'bg-red-50 border-red-300 text-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Add/Edit Modal */}
      <TimeEntryModal
        show={showModal}
        onClose={() => setShowModal(false)}
        editing={!!editingEntry}
        locked={!!editingEntry && (editingEntry as any).approval_status === 'approved' && !isOwnerOrAdmin}
        formData={formData}
        setFormData={setFormData}
        customers={customers}
        bookings={bookings}
        projects={projects}
        workTypes={workTypes}
        teamMembers={teamMembers}
        isOwnerOrAdmin={isOwnerOrAdmin}
        formPersonId={formPersonId}
        setFormPersonId={setFormPersonId}
        currentUserId={currentUser?.id}
        saving={saving}
        onSave={handleSave}
        onBookingChange={handleBookingChange}
        onWorkTypeChange={handleWorkTypeChange}
      />

      {/* Toolbar — person-filter + CSV-export + lägg till */}
      <div className="flex items-center justify-end gap-2 flex-wrap mb-4">
        {isOwnerOrAdmin && teamMembers.length > 1 && (
          <select
            value={filterPerson}
            onChange={e => setFilterPerson(e.target.value)}
            className="px-3 py-[7px] border-thin border-[#E2E8F0] rounded-lg text-[13px] text-[#1E293B] bg-white focus:outline-none focus:border-[#0F766E]"
          >
            <option value="">Alla i teamet</option>
            {teamMembers.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}

        <a
          href={`/api/time-entry/report?startDate=${format(weekStart, 'yyyy-MM-dd')}&endDate=${format(weekEnd, 'yyyy-MM-dd')}&format=csv&groupBy=day`}
          className="px-[14px] py-[7px] bg-transparent border-thin border-[#E2E8F0] rounded-lg text-[13px] text-[#64748B] hover:text-[#1E293B]"
        >
          CSV
        </a>

        <Link href="/dashboard/time/allowances"
          className="px-[14px] py-[7px] bg-transparent border-thin border-[#E2E8F0] rounded-lg text-[13px] text-[#64748B] hover:text-[#1E293B]">
          Ersättningar
        </Link>

        <button onClick={() => openAddModal()}
          className="px-4 py-[8px] bg-[#0F766E] text-white border-none rounded-lg text-[13px] font-medium cursor-pointer hover:bg-[#0F766E]/90">
          + Lägg till
        </button>
      </div>

      {/* Stämpelklocka — inline card */}
      <TimerWidget onCheckInOut={handleTimerCheckInOut} />

      {/* Metrics — gray cards, no icons */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-[#F1F5F9] rounded-lg px-4 py-[14px]">
          <div className="text-[10px] tracking-[0.08em] uppercase text-[#94A3B8] mb-[6px]">Vecka totalt</div>
          <div className="text-[20px] font-medium text-[#1E293B]">{fmtDuration(stats.totalMinutesWeek)}</div>
        </div>
        <div className="bg-[#F1F5F9] rounded-lg px-4 py-[14px]">
          <div className="text-[10px] tracking-[0.08em] uppercase text-[#94A3B8] mb-[6px]">Fakturerbart</div>
          <div className="text-[20px] font-medium text-[#0F766E]">{fmtDuration(stats.billableMinutesWeek)}</div>
        </div>
        <div className="bg-[#F1F5F9] rounded-lg px-4 py-[14px]">
          <div className="text-[10px] tracking-[0.08em] uppercase text-[#94A3B8] mb-[6px]">Ofakturerat</div>
          <div className="text-[20px] font-medium text-[#1E293B]">{Math.round(stats.uninvoicedRevenue).toLocaleString('sv-SE')} kr</div>
        </div>
        <div className="bg-[#F1F5F9] rounded-lg px-4 py-[14px]">
          <div className="text-[10px] tracking-[0.08em] uppercase text-[#94A3B8] mb-[6px]">Månad totalt</div>
          <div className="text-[20px] font-medium text-[#1E293B]">{fmtDuration(stats.totalMinutesMonth)}</div>
        </div>
      </div>

      {/* Övertidsindikator */}
      {weekOvertime && weekOvertime.total_overtime_minutes > 0 && (
        <div className="bg-orange-50 border-thin border-orange-200 rounded-lg px-4 py-3 mb-6 flex items-center justify-between">
          <div>
            <span className="text-[13px] font-medium text-orange-700">Övertid vecka {weekOvertime.week_number}</span>
            <span className="text-[12px] text-orange-600 ml-2">
              {weekOvertime.daily_overtime_minutes > 0 && `Daglig: ${formatMinutes(weekOvertime.daily_overtime_minutes)}`}
              {weekOvertime.daily_overtime_minutes > 0 && weekOvertime.weekly_overtime_minutes > 0 && ' · '}
              {weekOvertime.weekly_overtime_minutes > 0 && `Vecko: ${formatMinutes(weekOvertime.weekly_overtime_minutes)}`}
            </span>
          </div>
          <span className="text-[16px] font-medium text-orange-700">{formatMinutes(weekOvertime.total_overtime_minutes)}</span>
        </div>
      )}

      {/* Week nav */}
      <div className="flex items-center justify-between mb-[14px]">
        <div className="flex items-center">
          <div className="flex gap-1 mr-[10px]">
            <button onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
              className="w-7 h-7 border-thin border-[#E2E8F0] rounded-md bg-transparent text-[#64748B] flex items-center justify-center cursor-pointer hover:text-[#1E293B]">
              <ChevronLeft className="w-[14px] h-[14px]" />
            </button>
            <button onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
              className="w-7 h-7 border-thin border-[#E2E8F0] rounded-md bg-transparent text-[#64748B] flex items-center justify-center cursor-pointer hover:text-[#1E293B]">
              <ChevronRight className="w-[14px] h-[14px]" />
            </button>
          </div>
          <button onClick={() => setCurrentWeek(new Date())}
            className="text-[14px] font-medium text-[#1E293B] bg-transparent border-none cursor-pointer hover:text-[#0F766E]">
            V{weekNumber} · {format(weekStart, 'd MMMM', { locale: sv })} – {format(weekEnd, 'd MMMM', { locale: sv })}
          </button>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setViewMode('week')}
            className={`px-3 py-[5px] text-[12px] rounded-full border-thin cursor-pointer ${
              viewMode === 'week' ? 'bg-[#F1F5F9] text-[#1E293B] border-[#E2E8F0]' : 'bg-transparent text-[#64748B] border-[#E2E8F0]'
            }`}>
            Vecka
          </button>
          <button onClick={() => setViewMode('list')}
            className={`px-3 py-[5px] text-[12px] rounded-full border-thin cursor-pointer ${
              viewMode === 'list' ? 'bg-[#F1F5F9] text-[#1E293B] border-[#E2E8F0]' : 'bg-transparent text-[#64748B] border-[#E2E8F0]'
            }`}>
            Lista
          </button>
        </div>
      </div>

      {/* WEEK GRID VIEW */}
      {viewMode === 'week' && (
        <div className="bg-white border-thin border-[#E2E8F0] rounded-xl overflow-hidden mb-6">
          {/* Grid header */}
          <div className="grid grid-cols-[180px_repeat(7,1fr)_72px] border-b border-thin border-[#E2E8F0]">
            <div className="px-4 py-[10px] text-[10px] tracking-[0.07em] uppercase text-[#CBD5E1] text-left">Projekt</div>
            {weekDates.map((date, i) => {
              const isToday = isSameDay(date, new Date())
              return (
                <div key={i} className={`px-2 py-[10px] text-[10px] tracking-[0.07em] uppercase text-center ${isToday ? 'text-[#0F766E]' : 'text-[#CBD5E1]'}`}>
                  {format(date, 'EEE', { locale: sv }).toUpperCase()} {format(date, 'd')}
                </div>
              )
            })}
            <div className="px-2 py-[10px] text-[10px] tracking-[0.07em] uppercase text-[#CBD5E1] text-center">Summa</div>
          </div>

          {/* Grid rows */}
          {weekGrid.length === 0 ? (
            <div className="py-12 text-center text-[13px] text-[#94A3B8]">
              <p>Inga tidposter denna vecka</p>
              <p className="text-[12px] text-[#CBD5E1] mt-1">Klicka på en cell eller &quot;Lägg till&quot; för att registrera tid</p>
            </div>
          ) : (
            <>
              {weekGrid.map(row => (
                <div key={row.customerId} className="grid grid-cols-[180px_repeat(7,1fr)_72px] border-b border-thin border-[#E2E8F0] last:border-b-0 min-h-[50px] items-center">
                  <div className="px-4 text-[13px] font-medium text-[#1E293B] min-h-[50px] flex items-center">{row.label}</div>
                  {row.days.map((day, i) => {
                    const isToday = isSameDay(day.date, new Date())
                    return (
                      <div
                        key={i}
                        onClick={() => day.entries.length > 0 ? openEditModal(day.entries[0]) : openAddModal(day.dayKey, row.customerId !== 'none' ? row.customerId : undefined)}
                        className={`px-2 min-h-[50px] flex items-center justify-center cursor-pointer text-[13px] hover:bg-[#F8FAFC] ${isToday ? 'bg-[#F0FDFA]' : ''}`}
                      >
                        {day.totalMinutes > 0 ? (
                          <span className="bg-[#CCFBF1] text-[#0F766E] text-[12px] font-medium px-[10px] py-[3px] rounded-full">
                            {fmtDuration(day.totalMinutes)}
                          </span>
                        ) : (
                          <span className="text-[#CBD5E1] text-[18px] hover:text-[#0F766E]">+</span>
                        )}
                      </div>
                    )
                  })}
                  <div className="px-2 min-h-[50px] flex items-center justify-center text-[13px] font-medium text-[#1E293B]">
                    {fmtDuration(row.totalMinutes)}
                  </div>
                </div>
              ))}

              {/* Add new customer/project row */}
              <div className="grid grid-cols-[180px_repeat(7,1fr)_72px] min-h-[50px] items-center">
                <div
                  onClick={() => openAddModal()}
                  className="px-4 text-[12px] text-[#CBD5E1] min-h-[50px] flex items-center cursor-pointer hover:text-[#0F766E]"
                >
                  + Ny kund / projekt
                </div>
                {weekDates.map((_, i) => (
                  <div key={i} onClick={() => openAddModal(format(weekDates[i], 'yyyy-MM-dd'))}
                    className="min-h-[50px] flex items-center justify-center cursor-pointer text-[#CBD5E1] text-[18px] hover:text-[#0F766E] hover:bg-[#F0FDFA]">
                    +
                  </div>
                ))}
                <div className="min-h-[50px] flex items-center justify-center text-[13px] text-[#CBD5E1]">—</div>
              </div>
            </>
          )}

          {/* Column totals footer */}
          {weekGrid.length > 0 && (
            <div className="grid grid-cols-[180px_repeat(7,1fr)_72px] border-t border-thin border-[#E2E8F0] bg-[#F8FAFC]">
              <div className="px-4 py-[10px] text-[13px] font-medium text-[#64748B]">Summa</div>
              {columnTotals.map((total, i) => (
                <div key={i} className="px-2 py-[10px] text-center text-[13px] font-medium text-[#1E293B]">
                  {total > 0 ? fmtDuration(total) : '–'}
                </div>
              ))}
              <div className="px-2 py-[10px] text-center text-[13px] font-medium text-[#0F766E]">
                {fmtDuration(grandTotal)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* LIST VIEW */}
      {(viewMode === 'list' || viewMode === 'week') && (
        <div className={`${viewMode === 'week' ? 'sm:hidden' : ''} bg-white border-thin border-[#E2E8F0] rounded-xl`}>
          {/* Filters header */}
          <div className="px-4 py-3 border-b border-thin border-[#E2E8F0]">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#1E293B]">
                Tidposter <span className="text-[#94A3B8] font-normal ml-1">({filteredEntries.length})</span>
              </span>
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <>
                    <button onClick={() => handleBulkApproval('approve')} disabled={approvingIds}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#CCFBF1] border-thin border-[#0F766E] rounded-lg text-[12px] text-[#0F766E] disabled:opacity-50">
                      {approvingIds ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Godkänn ({selectedIds.size})
                    </button>
                    <button onClick={() => handleBulkApproval('reject')} disabled={approvingIds}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border-thin border-red-200 rounded-lg text-[12px] text-red-600 disabled:opacity-50">
                      <X className="w-3 h-3" />
                      Avslå
                    </button>
                    <button onClick={handleBulkMarkInvoiced} disabled={bulkLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#CCFBF1] border-thin border-[#0F766E] rounded-lg text-[12px] text-[#0F766E] disabled:opacity-50">
                      {bulkLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Fakturera ({selectedIds.size})
                    </button>
                  </>
                )}
                <button onClick={() => setShowFilters(!showFilters)}
                  className={`px-3 py-[5px] text-[12px] border-thin rounded-lg cursor-pointer ${showFilters ? 'bg-[#CCFBF1] text-[#0F766E] border-[#0F766E]' : 'bg-transparent text-[#64748B] border-[#E2E8F0]'}`}>
                  Filter
                </button>
              </div>
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
                <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)}
                  className="px-3 py-[7px] border-thin border-[#E2E8F0] rounded-lg text-[13px] text-[#1E293B] bg-white focus:outline-none focus:border-[#0F766E]">
                  <option value="">Alla kunder</option>
                  {customers.map(c => <option key={c.customer_id} value={c.customer_id}>{c.name}</option>)}
                </select>
                <select value={filterWorkType} onChange={e => setFilterWorkType(e.target.value)}
                  className="px-3 py-[7px] border-thin border-[#E2E8F0] rounded-lg text-[13px] text-[#1E293B] bg-white focus:outline-none focus:border-[#0F766E]">
                  <option value="">Alla arbetstyper</option>
                  {workTypes.map(wt => <option key={wt.work_type_id} value={wt.work_type_id}>{wt.name}</option>)}
                </select>
                <select value={filterInvoiced} onChange={e => setFilterInvoiced(e.target.value as any)}
                  className="px-3 py-[7px] border-thin border-[#E2E8F0] rounded-lg text-[13px] text-[#1E293B] bg-white focus:outline-none focus:border-[#0F766E]">
                  <option value="all">Alla</option>
                  <option value="no">Ej fakturerade</option>
                  <option value="yes">Fakturerade</option>
                </select>
                <select value={filterApproval} onChange={e => setFilterApproval(e.target.value as any)}
                  className="px-3 py-[7px] border-thin border-[#E2E8F0] rounded-lg text-[13px] text-[#1E293B] bg-white focus:outline-none focus:border-[#0F766E]">
                  <option value="all">Alla status</option>
                  <option value="pending">Väntar godkännande</option>
                  <option value="approved">Godkända</option>
                  <option value="rejected">Avslagna</option>
                </select>
              </div>
            )}
          </div>

          {/* List items */}
          <div>
            {filteredEntries.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-[#94A3B8]">
                Inga tidposter denna vecka
              </div>
            ) : (
              <>
                {viewMode === 'list' && filteredEntries.some(e => !e.invoiced) && (
                  <div className="px-4 py-2 border-b border-thin border-[#E2E8F0]">
                    <button onClick={selectAll} className="flex items-center gap-2 text-[12px] text-[#94A3B8] hover:text-[#1E293B]">
                      <div className={`w-4 h-4 rounded border-thin ${selectedIds.size === filteredEntries.filter(e => !e.invoiced).length && selectedIds.size > 0 ? 'bg-[#0F766E] border-[#0F766E]' : 'border-[#E2E8F0]'} flex items-center justify-center`}>
                        {selectedIds.size === filteredEntries.filter(e => !e.invoiced).length && selectedIds.size > 0 && <Check className="w-3 h-3 text-white" />}
                      </div>
                      Välj alla ej fakturerade
                    </button>
                  </div>
                )}

                {filteredEntries.map(entry => {
                  const catLabel = ({ work: 'Arbete', travel: 'Restid', material_pickup: 'Material', meeting: 'Möte', admin: 'Admin' } as Record<string, string>)[(entry as any).work_category] || 'Arbete'
                  return (
                    <div key={entry.time_entry_id} className="px-4 py-3 border-b border-thin border-[#F1F5F9] last:border-b-0 hover:bg-[#F8FAFC]">
                      <div className="flex items-start gap-3">
                        {viewMode === 'list' && !entry.invoiced && (
                          <button onClick={() => toggleSelect(entry.time_entry_id)} className="mt-1 flex-shrink-0">
                            <div className={`w-4 h-4 rounded border-thin ${selectedIds.has(entry.time_entry_id) ? 'bg-[#0F766E] border-[#0F766E]' : 'border-[#E2E8F0] hover:border-[#94A3B8]'} flex items-center justify-center`}>
                              {selectedIds.has(entry.time_entry_id) && <Check className="w-3 h-3 text-white" />}
                            </div>
                          </button>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-medium text-[#1E293B]">
                              {fmtDuration(entry.duration_minutes)}
                            </span>
                            <span className="text-[11px] text-[#94A3B8]">{catLabel}</span>
                            {entry.work_type && (
                              <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#CCFBF1] text-[#0F766E]">
                                {entry.work_type.name}
                              </span>
                            )}
                            {entry.invoiced ? (
                              <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#CCFBF1] text-[#0F766E]">
                                Fakturerad
                              </span>
                            ) : entry.is_billable ? (
                              <span className="px-2 py-0.5 text-[11px] rounded-full bg-amber-50 text-amber-600">
                                Ofakturerad
                              </span>
                            ) : null}
                            {entry.approval_status === 'pending' && (
                              <span className="px-2 py-0.5 text-[11px] rounded-full bg-yellow-50 text-yellow-600">
                                Väntar
                              </span>
                            )}
                            {entry.approval_status === 'approved' && (
                              <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#CCFBF1] text-[#0F766E]">
                                Godkänd
                              </span>
                            )}
                            {entry.approval_status === 'rejected' && (
                              <span className="px-2 py-0.5 text-[11px] rounded-full bg-red-50 text-red-600" title={entry.rejection_reason || ''}>
                                Avslagen
                              </span>
                            )}
                          </div>
                          {entry.description && (
                            <p className="text-[12px] text-[#64748B] mt-1 truncate">{entry.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-[#94A3B8] flex-wrap">
                            <span>{format(parseISO(entry.work_date), 'EEE d MMM', { locale: sv })}</span>
                            {isOwnerOrAdmin && entry.business_user && (
                              <span className="flex items-center gap-1">
                                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: entry.business_user.color }} />
                                {entry.business_user.name}
                              </span>
                            )}
                            {entry.customer && <span>{entry.customer.name}</span>}
                            {(entry as any).start_latitude && (
                              <a
                                href={`https://www.google.com/maps?q=${(entry as any).start_latitude},${(entry as any).start_longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-[#0F766E] hover:underline"
                                title={entry.start_address || 'Visa på karta'}
                                onClick={e => e.stopPropagation()}
                              >
                                <MapPin className="w-3 h-3" />
                                GPS
                              </a>
                            )}
                            {entry.hourly_rate && <span>{entry.hourly_rate} kr/tim</span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          {!entry.invoiced && (
                            <>
                              <button onClick={() => openEditModal(entry)}
                                className="w-7 h-7 border-thin border-[#E2E8F0] rounded-md bg-transparent text-[#94A3B8] hover:text-[#1E293B] flex items-center justify-center">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDelete(entry.time_entry_id)}
                                className="w-7 h-7 border-thin border-[#E2E8F0] rounded-md bg-transparent text-[#94A3B8] hover:text-red-500 flex items-center justify-center">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>
      )}

      {/* Reseersättning & traktamente */}
      <div className="mt-6">
        <TravelSection currentWeek={currentWeek} />
      </div>
    </div>
  )
}
