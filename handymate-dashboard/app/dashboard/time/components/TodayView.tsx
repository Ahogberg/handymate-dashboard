'use client'

import { useEffect, useState, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import TimeEntryModal from '@/components/time/TimeEntryModal'
import TravelSection from '@/components/time/TravelSection'
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  parseISO,
  getISOWeek
} from 'date-fns'
import { calculateWeeklyOvertime } from '@/lib/overtime'
import TodayToolbar from './today/TodayToolbar'
import TodayCheckIn from './today/TodayCheckIn'
import TodaySummary from './today/TodaySummary'
import TodayEntries from './today/TodayEntries'
import type { TimeEntry, TeamMemberBasic, WorkType, Customer, Booking, Stats } from './today/types'

/**
 * TodayView — container (R4-A/B, tasks/resurs-masterplan.md).
 *
 * Ren refaktor 2026-08: 1030-raders komponenten delades i presentations-
 * komponenter under ./today/ (TodayToolbar, TodayCheckIn, TodaySummary,
 * TodayEntries). Allt state (entries, filter, urval, formulär, vy-läge)
 * bor kvar HÄR — samma state-flöde som innan, bara lyft till containern
 * och skickat ner som props. Noll beteendeförändring.
 *
 * R4-B: TravelSection (traktamente/resor) flyttad in i huvudflödet —
 * renderas nu inline mellan sammanfattningen och dagens poster-lista
 * istället för som en fristående sektion efter allt annat (Easoft-
 * mönstret, se resurs-masterplan.md). Ren placeringsändring — TravelSection
 * själv är orörd.
 */
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

  // Timer handled by TimerWidget

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

      const entryData: Record<string, unknown> = {
        customer_id: formData.customer_id || null,
        booking_id: formData.booking_id || null,
        work_type_id: formData.work_type_id || null,
        project_id: formData.project_id || null,
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

      const response = await fetch('/api/time-entry', {
        method: editingEntry ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingEntry
          ? { entry_id: editingEntry.time_entry_id, ...entryData }
          : entryData),
      })
      const result = await response.json().catch(() => ({ error: 'Kunde inte spara tidposten' }))
      if (!response.ok) throw new Error(result.error || 'Kunde inte spara tidposten')
      showToast(editingEntry ? 'Tidpost uppdaterad!' : 'Tid registrerad!', 'success')
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
      const response = await fetch(`/api/time-entry?entryId=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      const result = await response.json().catch(() => ({ error: 'Kunde inte ta bort tidposten' }))
      if (!response.ok) throw new Error(result.error || 'Kunde inte ta bort tidposten')
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

      <TodayToolbar
        isOwnerOrAdmin={isOwnerOrAdmin}
        teamMembers={teamMembers}
        filterPerson={filterPerson}
        setFilterPerson={setFilterPerson}
        weekStart={weekStart}
        weekEnd={weekEnd}
        onAddClick={() => openAddModal()}
      />

      <TodayCheckIn onCheckInOut={handleTimerCheckInOut} />

      <TodaySummary stats={stats} weekOvertime={weekOvertime} />

      {/* Reseersättning & traktamente — R4-B: flyttad in i huvudflödet som
          inline-sektion i dagens rapportflöde (Easoft-mönstret), istället
          för en fristående sektion efter poster-listan. */}
      <div className="mb-6">
        <TravelSection currentWeek={currentWeek} />
      </div>

      <TodayEntries
        viewMode={viewMode}
        setViewMode={setViewMode}
        currentWeek={currentWeek}
        setCurrentWeek={setCurrentWeek}
        weekStart={weekStart}
        weekEnd={weekEnd}
        weekNumber={weekNumber}
        weekDates={weekDates}
        weekGrid={weekGrid}
        columnTotals={columnTotals}
        grandTotal={grandTotal}
        openAddModal={openAddModal}
        openEditModal={openEditModal}
        handleDelete={handleDelete}
        filteredEntries={filteredEntries}
        customers={customers}
        workTypes={workTypes}
        filterCustomer={filterCustomer}
        setFilterCustomer={setFilterCustomer}
        filterWorkType={filterWorkType}
        setFilterWorkType={setFilterWorkType}
        filterInvoiced={filterInvoiced}
        setFilterInvoiced={setFilterInvoiced}
        filterApproval={filterApproval}
        setFilterApproval={setFilterApproval}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        isOwnerOrAdmin={isOwnerOrAdmin}
        selectedIds={selectedIds}
        toggleSelect={toggleSelect}
        selectAll={selectAll}
        bulkLoading={bulkLoading}
        approvingIds={approvingIds}
        handleBulkMarkInvoiced={handleBulkMarkInvoiced}
        handleBulkApproval={handleBulkApproval}
      />
    </div>
  )
}
