'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, LayoutGrid, Loader2, Users } from 'lucide-react'
import { format, parseISO, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns'
import { sv } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import { fetchPersonDays, type PersonDay, type PersonDayShift } from '@/lib/schedule/person-day'
import { computePersonWeekUtilization, type PersonWeekUtilization } from '@/lib/schedule/utilization'
import type { DispatchAssessment } from '@/lib/schedule/dispatch-assessment'
import { LaneView } from '@/app/dashboard/calendar/components/LaneView'
import { PersonWeekGrid } from './components/PersonWeekGrid'
import { MobileResourceList } from './components/MobileResourceList'
import { ShiftDetailSheet, type ShiftDetailContext } from './components/ShiftDetailSheet'
import { AssignConfirmDialog, type AssignFlowState } from './components/AssignConfirmDialog'
import { MemberPickerSheet } from './components/MemberPickerSheet'
import { bookingTitle, type ResourceTeamMember, type WeekBooking } from './components/types'

type ViewMode = 'person' | 'project'

/**
 * Schema → Översikt — resurstavlan (R2, tasks/resurs-masterplan.md).
 * Ersätter R0-placeholdern. Veckotavla per person (persondagen, R1) med
 * beläggnings-%, obemannat-spår och drag-drop-tilldelning; Person/Projekt-
 * toggle (Projekt = befintliga LaneView, återanvänd rakt av — den visade
 * sig INTE hårt kopplad till calendar/page.tsx, bara props-driven); mobil
 * (<1024px) = förenklad dag/personlista, inte en krympt tavla.
 */
export default function SchemaOverviewPage() {
  const business = useBusiness()
  const { isOwnerOrAdmin } = useCurrentUser()

  const [viewMode, setViewMode] = useState<ViewMode>('person')
  const [isMobile, setIsMobile] = useState(false)
  const [currentDate, setCurrentDate] = useState<Date>(new Date())

  const [members, setMembers] = useState<ResourceTeamMember[]>([])
  const [personDays, setPersonDays] = useState<PersonDay[]>([])
  const [weekBookings, setWeekBookings] = useState<WeekBooking[]>([])
  const [projectNames, setProjectNames] = useState<Map<string, string>>(new Map())

  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false,
    message: '',
    type: 'success',
  })
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }, [])

  // ── Responsive breakpoint — 1024px (R2 punkt 6, INTE samma 640px-brytpunkt
  // som kalender-/schemasidans egen mobilvy) ──────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // ── Veckoberäkning ───────────────────────────────────────────────────
  const monday = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate])
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday])
  const weekDates = useMemo(() => weekDays.map((d) => format(d, 'yyyy-MM-dd')), [weekDays])
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const [selectedMobileDate, setSelectedMobileDate] = useState<string>(todayStr)
  useEffect(() => {
    // Vecka bytt via nav — håll dag-väljaren inom veckan (annars kvar om redan i veckan)
    if (!weekDates.includes(selectedMobileDate)) {
      setSelectedMobileDate(weekDates.includes(todayStr) ? todayStr : weekDates[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekDates])

  const headerLabel = useMemo(() => {
    const start = weekDays[0]
    const end = weekDays[6]
    return `${format(start, 'd MMM', { locale: sv })} – ${format(end, 'd MMM yyyy', { locale: sv })}`
  }, [weekDays])

  const navigate = (dir: 'prev' | 'next') => setCurrentDate((prev) => (dir === 'prev' ? subWeeks(prev, 1) : addWeeks(prev, 1)))
  const goToday = () => setCurrentDate(new Date())

  // ── Datahämtning ─────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!business.business_id) return
    const from = weekDates[0]
    const to = weekDates[6]

    const [teamRes, bookingsRes] = await Promise.all([
      fetch('/api/team').then((r) => (r.ok ? r.json() : { members: [] })),
      fetch(`/api/bookings?from=${from}&to=${to}`).then((r) => (r.ok ? r.json() : { bookings: [] })),
    ])

    const activeMembers: ResourceTeamMember[] = (teamRes.members || []).filter((m: any) => m.is_active)
    setMembers(activeMembers)
    setWeekBookings(bookingsRes.bookings || [])

    if (activeMembers.length > 0) {
      const days = await fetchPersonDays(supabase, business.business_id, activeMembers.map((m) => m.id), from, to)
      setPersonDays(days)
    } else {
      setPersonDays([])
    }

    if (projectNames.size === 0) {
      const { data } = await supabase
        .from('project')
        .select('project_id, name')
        .eq('business_id', business.business_id)
        .in('status', ['planning', 'active', 'paused'])
      const map = new Map<string, string>()
      for (const p of data || []) map.set(p.project_id, p.name)
      setProjectNames(map)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.business_id, weekDates])

  useEffect(() => {
    setLoading(true)
    fetchAll().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.business_id, weekDates[0], refreshKey])

  const refetch = useCallback(() => setRefreshKey((k) => k + 1), [])

  // ── Avledda strukturer ───────────────────────────────────────────────
  const weekBookingsById = useMemo(() => {
    const map = new Map<string, WeekBooking>()
    for (const b of weekBookings) map.set(b.booking_id, b)
    return map
  }, [weekBookings])

  const unassignedByDate = useMemo(() => {
    const map = new Map<string, WeekBooking[]>()
    for (const b of weekBookings) {
      if (b.assigned_user_id) continue
      const date = format(parseISO(b.scheduled_start), 'yyyy-MM-dd')
      if (!weekDates.includes(date)) continue
      const arr = map.get(date) || []
      arr.push(b)
      map.set(date, arr)
    }
    for (const arr of Array.from(map.values())) arr.sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start))
    return map
  }, [weekBookings, weekDates])

  const utilByMember = useMemo(() => {
    const map = new Map<string, PersonWeekUtilization>()
    for (const m of members) map.set(m.id, computePersonWeekUtilization(personDays, m.id, weekDates))
    return map
  }, [members, personDays, weekDates])

  // ── Chip-detaljer (punkt 1) ─────────────────────────────────────────
  const [detailContext, setDetailContext] = useState<ShiftDetailContext | null>(null)

  const openShiftDetail = useCallback(
    (shift: PersonDayShift, member: ResourceTeamMember) => {
      let customerName: string | null = null
      let projectName: string | null = null
      if (shift.source === 'booking') {
        const b = weekBookingsById.get(shift.refId)
        customerName = b?.customer?.name || null
        projectName = b?.project?.name || (shift.projectId ? projectNames.get(shift.projectId) || null : null)
      } else if (shift.projectId) {
        projectName = projectNames.get(shift.projectId) || null
      }
      setDetailContext({ shift, memberName: member.name, customerName, projectName })
    },
    [weekBookingsById, projectNames],
  )

  // Obemannade bokningar har ingen person än — bygger en motsvarande
  // ShiftDetailContext direkt från WeekBooking så samma sheet kan visa
  // dem (klick på en obemannad chip ska inte vara en dead click).
  const openUnassignedDetail = useCallback(
    (booking: WeekBooking) => {
      const shift: PersonDayShift = {
        source: 'booking',
        type: 'booking',
        start: booking.scheduled_start,
        end: booking.scheduled_end || booking.scheduled_start,
        title: bookingTitle(booking),
        refId: booking.booking_id,
        projectId: booking.project_id,
        customerId: booking.customer_id,
        allDay: false,
        conflict: false,
      }
      setDetailContext({
        shift,
        memberName: 'Obemannad',
        customerName: booking.customer?.name || null,
        projectName: booking.project?.name || (booking.project_id ? projectNames.get(booking.project_id) || null : null),
      })
    },
    [projectNames],
  )

  // ── Tilldelningsflödet (punkt 4 + 6) — delad mellan drag-drop och
  // mobilens Tilldela-knapp ────────────────────────────────────────────
  const [pickerBooking, setPickerBooking] = useState<WeekBooking | null>(null)
  const [assignFlow, setAssignFlow] = useState<AssignFlowState | null>(null)
  const [assignAssessment, setAssignAssessment] = useState<DispatchAssessment | null>(null)
  const [assignLoading, setAssignLoading] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [assignConfirming, setAssignConfirming] = useState(false)

  const requestAssign = useCallback(
    async (bookingId: string, candidateMemberId: string) => {
      const booking = weekBookingsById.get(bookingId)
      const candidate = members.find((m) => m.id === candidateMemberId)
      if (!booking || !candidate) return

      const start = parseISO(booking.scheduled_start)
      const end = booking.scheduled_end ? parseISO(booking.scheduled_end) : null
      const bookingTime = `${format(start, 'd MMM', { locale: sv })} · ${format(start, 'HH:mm')}${end ? `–${format(end, 'HH:mm')}` : ''}`

      setAssignFlow({
        bookingId,
        bookingTitle: bookingTitle(booking),
        bookingTime,
        candidateId: candidate.id,
        candidateName: candidate.name,
      })
      setAssignAssessment(null)
      setAssignError(null)
      setAssignLoading(true)

      try {
        const res = await fetch('/api/schema/assign-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: bookingId, member_id: candidateMemberId }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Kunde inte bedöma tilldelningen')
        setAssignAssessment(data.assessment)
      } catch (err) {
        setAssignError(err instanceof Error ? err.message : 'Något gick fel')
      } finally {
        setAssignLoading(false)
      }
    },
    [weekBookingsById, members],
  )

  const cancelAssign = useCallback(() => {
    setAssignFlow(null)
    setAssignAssessment(null)
    setAssignError(null)
  }, [])

  const confirmAssign = useCallback(async () => {
    if (!assignFlow) return
    setAssignConfirming(true)
    try {
      const res = await fetch('/api/bookings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: assignFlow.bookingId, assigned_user_id: assignFlow.candidateId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kunde inte tilldela')
      showToast(`Tilldelad till ${assignFlow.candidateName}`, 'success')
      cancelAssign()
      refetch()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Något gick fel', 'error')
    } finally {
      setAssignConfirming(false)
    }
  }, [assignFlow, showToast, cancelAssign, refetch])

  const activeMembersForPicker = useMemo(
    () => members.map((m) => ({ id: m.id, name: m.name, color: m.color })),
    [members],
  )

  if (loading) {
    return (
      <div className="pt-16 sm:pt-8 p-4 sm:p-8 bg-[#F8FAFC] min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
      </div>
    )
  }

  return (
    <div className="pt-16 sm:pt-8 p-4 sm:p-8 bg-[#F8FAFC] min-h-screen">
      {toast.show && (
        <div
          className={`fixed top-4 right-4 z-[70] px-4 py-3 rounded-xl border backdrop-blur-sm ${
            toast.type === 'success' ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : 'bg-red-100 border-red-200 text-red-700'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Sidhuvud */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Schema</h1>
            <p className="text-gray-500 text-sm mt-1">Resurstavlan — teamets vecka</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Person/Projekt-toggle */}
            <div className="inline-flex bg-white border border-[#E2E8F0] rounded-xl p-1">
              <button
                onClick={() => setViewMode('person')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  viewMode === 'person' ? 'bg-primary-700 text-white' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Person
              </button>
              <button
                onClick={() => setViewMode('project')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  viewMode === 'project' ? 'bg-primary-700 text-white' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Projekt
              </button>
            </div>

            {/* Veckonavigering */}
            <div className="inline-flex items-center gap-1 bg-white border border-[#E2E8F0] rounded-xl p-1">
              <button onClick={() => navigate('prev')} className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-500">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={goToday} className="px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 rounded-lg">
                Idag
              </button>
              <button onClick={() => navigate('next')} className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-500">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <span className="text-sm font-medium text-gray-700 capitalize">{headerLabel}</span>
          </div>
        </div>

        {/* Innehåll */}
        {viewMode === 'project' ? (
          <LaneView monday={monday} weekDays={weekDays} today={new Date()} />
        ) : isMobile ? (
          <MobileResourceList
            weekDates={weekDates}
            todayStr={todayStr}
            selectedDate={selectedMobileDate}
            onSelectDate={setSelectedMobileDate}
            members={members}
            personDays={personDays}
            unassignedByDate={unassignedByDate}
            utilByMember={utilByMember}
            canAssign={isOwnerOrAdmin}
            onShiftClick={openShiftDetail}
            onUnassignedAssignClick={(b) => setPickerBooking(b)}
          />
        ) : (
          <PersonWeekGrid
            weekDates={weekDates}
            todayStr={todayStr}
            members={members}
            personDays={personDays}
            unassignedByDate={unassignedByDate}
            utilByMember={utilByMember}
            canAssign={isOwnerOrAdmin}
            onShiftClick={openShiftDetail}
            onUnassignedClick={openUnassignedDetail}
            onRequestAssign={requestAssign}
          />
        )}
      </div>

      <ShiftDetailSheet context={detailContext} onClose={() => setDetailContext(null)} />

      <MemberPickerSheet
        bookingTitle={pickerBooking ? bookingTitle(pickerBooking) : null}
        members={activeMembersForPicker}
        onPick={(memberId) => {
          const booking = pickerBooking
          setPickerBooking(null)
          if (booking) requestAssign(booking.booking_id, memberId)
        }}
        onClose={() => setPickerBooking(null)}
      />

      <AssignConfirmDialog
        flow={assignFlow}
        loading={assignLoading}
        assessment={assignAssessment}
        error={assignError}
        confirming={assignConfirming}
        onConfirm={confirmAssign}
        onCancel={cancelAssign}
      />
    </div>
  )
}
