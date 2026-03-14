'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Loader2,
  Clock,
  User,
  Info,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HandymateEvent {
  id: string
  title: string
  start: string
  end: string
  status: string
  customerId: string
  customerName: string
  customerPhone: string | null
}

interface GoogleEvent {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
}

interface Customer {
  customer_id: string
  name: string
  phone_number: string
}

type ViewMode = 'week' | 'day'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOUR_START = 6
const HOUR_END = 20
const HOUR_COUNT = HOUR_END - HOUR_START
const CELL_HEIGHT = 60 // px per hour
const DAY_NAMES = ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön']

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function isToday(date: Date): boolean {
  return isSameDay(date, new Date())
}

function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0]
}

function formatWeekRange(monday: Date): string {
  const sunday = addDays(monday, 6)
  const startStr = monday.toLocaleDateString('sv-SE', { day: 'numeric' })
  const endStr = sunday.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })

  if (monday.getMonth() === sunday.getMonth()) {
    return `${startStr}–${endStr}`
  }
  const startWithMonth = monday.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })
  return `${startWithMonth} – ${endStr}`
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}

// ---------------------------------------------------------------------------
// Event positioning helpers
// ---------------------------------------------------------------------------

/** Calculate top offset and height for an event block */
function getEventPosition(startStr: string, endStr: string): { top: number; height: number } | null {
  const start = new Date(startStr)
  const end = new Date(endStr)
  const startHour = start.getHours() + start.getMinutes() / 60
  const endHour = end.getHours() + end.getMinutes() / 60

  // Clamp to visible range
  const clampedStart = Math.max(startHour, HOUR_START)
  const clampedEnd = Math.min(endHour, HOUR_END)

  if (clampedEnd <= clampedStart) return null

  const top = (clampedStart - HOUR_START) * CELL_HEIGHT
  const height = Math.max((clampedEnd - clampedStart) * CELL_HEIGHT, 20)

  return { top, height }
}

/** Group overlapping events to position them side by side */
function layoutOverlapping<T extends { start: string; end: string }>(
  events: T[]
): Array<T & { colIndex: number; colTotal: number }> {
  if (events.length === 0) return []

  // Sort by start time
  const sorted = [...events].sort((a, b) =>
    new Date(a.start).getTime() - new Date(b.start).getTime()
  )

  const result: Array<T & { colIndex: number; colTotal: number }> = []
  const groups: T[][] = []
  let currentGroup: T[] = []
  let groupEnd = 0

  for (const event of sorted) {
    const eventStart = new Date(event.start).getTime()
    if (currentGroup.length === 0 || eventStart < groupEnd) {
      currentGroup.push(event)
      groupEnd = Math.max(groupEnd, new Date(event.end).getTime())
    } else {
      groups.push(currentGroup)
      currentGroup = [event]
      groupEnd = new Date(event.end).getTime()
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup)

  for (const group of groups) {
    const colTotal = group.length
    for (let i = 0; i < group.length; i++) {
      result.push({ ...group[i], colIndex: i, colTotal })
    }
  }

  return result
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function CalendarPage() {
  const business = useBusiness()

  // ─── Calendar navigation ──────────────────────────────────────────────────
  const [monday, setMonday] = useState(() => getMondayOfWeek(new Date()))
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [selectedDay, setSelectedDay] = useState(new Date())

  // ─── Events data ──────────────────────────────────────────────────────────
  const [handymateEvents, setHandymateEvents] = useState<HandymateEvent[]>([])
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([])
  const [googleConnected, setGoogleConnected] = useState(true) // optimistic
  const [loading, setLoading] = useState(true)

  // ─── Booking modal ────────────────────────────────────────────────────────
  const [bookingModalOpen, setBookingModalOpen] = useState(false)
  const [editingBooking, setEditingBooking] = useState<HandymateEvent | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [actionLoading, setActionLoading] = useState(false)
  const [bookingForm, setBookingForm] = useState({
    customer_id: '',
    date: '',
    start_time: '09:00',
    end_time: '10:00',
    notes: '',
    status: 'confirmed',
  })

  // ─── Detail panel ─────────────────────────────────────────────────────────
  const [selectedEvent, setSelectedEvent] = useState<HandymateEvent | null>(null)

  // ─── Toast ────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false, message: '', type: 'success',
  })
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  // ─── Mobile detection ─────────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Auto-switch to day view on mobile
  useEffect(() => {
    if (isMobile) setViewMode('day')
  }, [isMobile])

  // ─── Computed week dates ──────────────────────────────────────────────────
  const weekDates = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(monday, i)),
    [monday]
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // Data fetching
  // ═══════════════════════════════════════════════════════════════════════════

  const fetchEvents = useCallback(async () => {
    if (!business.business_id) return
    setLoading(true)

    const start = formatDateISO(monday)
    const end = formatDateISO(addDays(monday, 6))

    try {
      const res = await fetch(`/api/calendar/events?start=${start}&end=${end}`)
      if (res.ok) {
        const data = await res.json()
        setHandymateEvents(data.handymate || [])
        setGoogleEvents(data.google || [])
        setGoogleConnected(data.googleConnected ?? false)
      }
    } catch (err) {
      console.error('Failed to fetch calendar events:', err)
    }
    setLoading(false)
  }, [business.business_id, monday])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  // Fetch customers for booking modal
  useEffect(() => {
    if (!business.business_id) return
    supabase
      .from('customer')
      .select('customer_id, name, phone_number')
      .eq('business_id', business.business_id)
      .then(({ data }: { data: Customer[] | null }) => setCustomers(data || []))
  }, [business.business_id])

  // ═══════════════════════════════════════════════════════════════════════════
  // Navigation
  // ═══════════════════════════════════════════════════════════════════════════

  function goToday() {
    const now = new Date()
    setMonday(getMondayOfWeek(now))
    setSelectedDay(now)
  }

  function navigate(direction: number) {
    if (viewMode === 'week') {
      setMonday(prev => addDays(prev, direction * 7))
    } else {
      const newDay = addDays(selectedDay, direction)
      setSelectedDay(newDay)
      // If new day is in a different week, update monday
      const newMonday = getMondayOfWeek(newDay)
      if (newMonday.getTime() !== monday.getTime()) {
        setMonday(newMonday)
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Booking CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  function openCreateModal(date?: string, time?: string) {
    setEditingBooking(null)
    setSelectedEvent(null)
    setBookingForm({
      customer_id: '',
      date: date || formatDateISO(new Date()),
      start_time: time || '09:00',
      end_time: time ? `${String(parseInt(time.split(':')[0]) + 1).padStart(2, '0')}:${time.split(':')[1]}` : '10:00',
      notes: '',
      status: 'confirmed',
    })
    setBookingModalOpen(true)
  }

  function openEditModal(event: HandymateEvent) {
    setEditingBooking(event)
    setSelectedEvent(null)
    const startDate = new Date(event.start)
    const endDate = new Date(event.end)
    setBookingForm({
      customer_id: event.customerId,
      date: formatDateISO(startDate),
      start_time: startDate.toTimeString().substring(0, 5),
      end_time: endDate.toTimeString().substring(0, 5),
      notes: event.title,
      status: event.status,
    })
    setBookingModalOpen(true)
  }

  async function handleBookingSubmit() {
    if (!bookingForm.customer_id || !bookingForm.date || !bookingForm.start_time) {
      showToast('Kund, datum och tid krävs', 'error')
      return
    }

    const scheduledStart = `${bookingForm.date}T${bookingForm.start_time}:00`
    const scheduledEnd = `${bookingForm.date}T${bookingForm.end_time}:00`

    setActionLoading(true)
    try {
      const response = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: editingBooking ? 'update_booking' : 'create_booking',
          data: editingBooking
            ? { bookingId: editingBooking.id, scheduledStart, scheduledEnd, status: bookingForm.status, notes: bookingForm.notes }
            : { customerId: bookingForm.customer_id, scheduledStart, scheduledEnd, notes: bookingForm.notes, businessId: business.business_id },
        }),
      })

      if (!response.ok) throw new Error('Något gick fel')

      showToast(editingBooking ? 'Bokning uppdaterad!' : 'Bokning skapad!', 'success')
      setBookingModalOpen(false)
      fetchEvents()
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleBookingDelete(bookingId: string) {
    if (!confirm('Är du säker på att du vill ta bort denna bokning?')) return

    try {
      const response = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_booking', data: { bookingId } }),
      })

      if (!response.ok) throw new Error('Något gick fel')

      showToast('Bokning borttagen!', 'success')
      setSelectedEvent(null)
      fetchEvents()
    } catch {
      showToast('Något gick fel', 'error')
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Cell click → new booking
  // ═══════════════════════════════════════════════════════════════════════════

  function handleCellClick(date: Date, hour: number) {
    const dateStr = formatDateISO(date)
    const timeStr = `${String(hour).padStart(2, '0')}:00`
    openCreateModal(dateStr, timeStr)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Filter events for a given day
  // ═══════════════════════════════════════════════════════════════════════════

  function getEventsForDay(date: Date) {
    const hm = handymateEvents.filter(e => isSameDay(new Date(e.start), date))
    const gc = googleEvents.filter(e => !e.allDay && isSameDay(new Date(e.start), date))
    const allDay = googleEvents.filter(e => e.allDay && isSameDay(new Date(e.start), date))
    return { hm, gc, allDay }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Render helpers
  // ═══════════════════════════════════════════════════════════════════════════

  const hours = useMemo(() =>
    Array.from({ length: HOUR_COUNT }, (_, i) => HOUR_START + i),
    []
  )

  const headerLabel = viewMode === 'week'
    ? formatWeekRange(monday)
    : selectedDay.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  // ═══════════════════════════════════════════════════════════════════════════
  // Day column renderer (shared by week and day views)
  // ═══════════════════════════════════════════════════════════════════════════

  function renderDayColumn(date: Date, widthClass: string) {
    const { hm, gc } = getEventsForDay(date)

    // Combine for overlap detection
    type UnifiedEvent = { start: string; end: string; source: 'hm' | 'gc'; event: HandymateEvent | GoogleEvent }
    const unified: UnifiedEvent[] = [
      ...hm.map(e => ({ start: e.start, end: e.end, source: 'hm' as const, event: e })),
      ...gc.map(e => ({ start: e.start, end: e.end, source: 'gc' as const, event: e })),
    ]
    const positioned = layoutOverlapping(unified)

    return (
      <div
        key={formatDateISO(date)}
        className={`relative ${widthClass}`}
        style={{ height: HOUR_COUNT * CELL_HEIGHT }}
      >
        {/* Hour grid lines */}
        {hours.map((hour) => (
          <div
            key={hour}
            onClick={() => handleCellClick(date, hour)}
            className="absolute left-0 right-0 border-b border-[#F1F5F9] cursor-pointer hover:bg-[#F8FAFC] transition-colors"
            style={{ top: (hour - HOUR_START) * CELL_HEIGHT, height: CELL_HEIGHT }}
          />
        ))}

        {/* Current time indicator */}
        {isToday(date) && (() => {
          const now = new Date()
          const currentHour = now.getHours() + now.getMinutes() / 60
          if (currentHour >= HOUR_START && currentHour <= HOUR_END) {
            const top = (currentHour - HOUR_START) * CELL_HEIGHT
            return (
              <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top }}>
                <div className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                  <div className="flex-1 h-[2px] bg-red-500" />
                </div>
              </div>
            )
          }
          return null
        })()}

        {/* Events */}
        {positioned.map((item) => {
          const pos = getEventPosition(item.start, item.end)
          if (!pos) return null

          const widthPercent = 100 / item.colTotal
          const leftPercent = widthPercent * item.colIndex
          const isHandymate = item.source === 'hm'
          const evt = item.event

          if (isHandymate) {
            const hmEvent = evt as HandymateEvent
            return (
              <div
                key={`hm-${hmEvent.id}`}
                onClick={(e) => { e.stopPropagation(); setSelectedEvent(hmEvent) }}
                className="absolute z-10 rounded-lg px-2 py-1 cursor-pointer overflow-hidden border-l-[3px] border-[#0F766E] bg-[#CCFBF1] hover:bg-[#99F6E4] transition-colors"
                style={{
                  top: pos.top,
                  height: pos.height,
                  left: `calc(${leftPercent}% + 2px)`,
                  width: `calc(${widthPercent}% - 4px)`,
                }}
              >
                <p className="text-[11px] font-medium text-[#0F766E] truncate leading-tight">
                  {hmEvent.customerName}
                </p>
                {pos.height > 30 && (
                  <p className="text-[10px] text-[#0F766E]/70 truncate leading-tight">
                    {hmEvent.title}
                  </p>
                )}
                {pos.height > 44 && (
                  <p className="text-[10px] text-[#0F766E]/60 truncate">
                    {formatTime(hmEvent.start)} – {formatTime(hmEvent.end)}
                  </p>
                )}
              </div>
            )
          } else {
            const gcEvent = evt as GoogleEvent
            return (
              <div
                key={`gc-${gcEvent.id}`}
                className="absolute z-10 rounded-lg px-2 py-1 overflow-hidden border-l-[3px] border-[#94A3B8] bg-[#F1F5F9]"
                style={{
                  top: pos.top,
                  height: pos.height,
                  left: `calc(${leftPercent}% + 2px)`,
                  width: `calc(${widthPercent}% - 4px)`,
                }}
              >
                <p className="text-[11px] font-medium text-[#475569] truncate leading-tight">
                  {gcEvent.title}
                </p>
                {pos.height > 30 && (
                  <p className="text-[10px] text-[#94A3B8] truncate leading-tight">
                    {formatTime(gcEvent.start)} – {formatTime(gcEvent.end)}
                  </p>
                )}
              </div>
            )
          }
        })}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="p-4 sm:p-6 bg-[#F8FAFC] min-h-screen">
      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border text-sm ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {toast.message}
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="max-w-[1400px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            {/* Navigation */}
            <div className="flex items-center bg-white border border-[#E2E8F0] rounded-lg">
              <button
                onClick={() => navigate(-1)}
                className="p-2 text-[#64748B] hover:text-[#1E293B] transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={goToday}
                className="px-3 py-1.5 text-[13px] font-medium text-[#0F766E] hover:bg-[#F0FDFA] transition-colors border-x border-[#E2E8F0]"
              >
                Idag
              </button>
              <button
                onClick={() => navigate(1)}
                className="p-2 text-[#64748B] hover:text-[#1E293B] transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Date label */}
            <h2 className="text-[15px] sm:text-[17px] font-semibold text-[#1E293B] capitalize">
              {headerLabel}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {/* View switcher */}
            <div className="flex bg-white border border-[#E2E8F0] rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('week')}
                className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
                  viewMode === 'week' ? 'bg-[#0F766E] text-white' : 'text-[#64748B] hover:text-[#1E293B]'
                }`}
              >
                Vecka
              </button>
              <button
                onClick={() => { setViewMode('day'); setSelectedDay(weekDates.find(d => isToday(d)) || monday) }}
                className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
                  viewMode === 'day' ? 'bg-[#0F766E] text-white' : 'text-[#64748B] hover:text-[#1E293B]'
                }`}
              >
                Dag
              </button>
            </div>

            {/* New booking button */}
            <button
              onClick={() => openCreateModal()}
              className="flex items-center gap-2 px-3 py-2 bg-[#0F766E] text-white rounded-lg text-[13px] font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Ny bokning</span>
            </button>
          </div>
        </div>

        {/* Google Calendar banner */}
        {!googleConnected && (
          <div className="flex items-center gap-2 px-4 py-2.5 mb-3 bg-amber-50 border border-amber-200 rounded-lg text-[13px] text-amber-700">
            <Info className="w-4 h-4 flex-shrink-0" />
            <span>Koppla Google Calendar i <a href="/dashboard/settings" className="underline font-medium">Inställningar</a> för att se alla händelser.</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-[#0F766E] animate-spin" />
          </div>
        )}

        {/* ── Calendar Grid ──────────────────────────────────────────── */}
        {!loading && (
          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            {/* All-day events row */}
            {viewMode === 'week' && (() => {
              const allDayEvents = weekDates.flatMap(date =>
                getEventsForDay(date).allDay.map(e => ({ ...e, date }))
              )
              if (allDayEvents.length === 0) return null
              return (
                <div className="border-b border-[#E2E8F0] px-[52px]">
                  <div className="grid grid-cols-7 gap-px">
                    {weekDates.map(date => {
                      const dayAllDay = getEventsForDay(date).allDay
                      return (
                        <div key={formatDateISO(date)} className="px-1 py-1">
                          {dayAllDay.map(e => (
                            <div key={e.id} className="text-[10px] bg-[#F1F5F9] text-[#475569] px-1.5 py-0.5 rounded truncate mb-0.5">
                              {e.title}
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Day headers (week view) */}
            {viewMode === 'week' && (
              <div className="border-b border-[#E2E8F0] grid grid-cols-[52px_repeat(7,1fr)]">
                <div /> {/* Time gutter spacer */}
                {weekDates.map((date) => {
                  const today = isToday(date)
                  return (
                    <div
                      key={formatDateISO(date)}
                      className={`py-2.5 text-center border-l border-[#F1F5F9] cursor-pointer hover:bg-[#F8FAFC] transition-colors ${today ? 'bg-[#F0FDFA]' : ''}`}
                      onClick={() => { setSelectedDay(date); setViewMode('day') }}
                    >
                      <div className="text-[11px] text-[#94A3B8] uppercase">{DAY_NAMES[weekDates.indexOf(date)]}</div>
                      <div className={`text-[15px] font-semibold mt-0.5 ${today ? 'text-[#0F766E]' : 'text-[#1E293B]'}`}>
                        {date.getDate()}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Scrollable grid area */}
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
              <div className={`grid ${viewMode === 'week' ? 'grid-cols-[52px_repeat(7,1fr)]' : 'grid-cols-[52px_1fr]'}`}>
                {/* Time gutter */}
                <div className="relative" style={{ height: HOUR_COUNT * CELL_HEIGHT }}>
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 flex items-start justify-end pr-2 text-[11px] text-[#94A3B8] border-b border-[#F1F5F9]"
                      style={{ top: (hour - HOUR_START) * CELL_HEIGHT, height: CELL_HEIGHT }}
                    >
                      <span className="-mt-[7px]">{String(hour).padStart(2, '0')}:00</span>
                    </div>
                  ))}
                </div>

                {/* Day columns */}
                {viewMode === 'week'
                  ? weekDates.map((date) => (
                      <div key={formatDateISO(date)} className="border-l border-[#F1F5F9]">
                        {renderDayColumn(date, 'w-full')}
                      </div>
                    ))
                  : (
                      <div className="border-l border-[#F1F5F9]">
                        {renderDayColumn(selectedDay, 'w-full')}
                      </div>
                    )
                }
              </div>
            </div>
          </div>
        )}

        {/* ── Day view: day selector pills (mobile) ──────────────────── */}
        {viewMode === 'day' && (
          <div className="flex gap-1 mt-3 overflow-x-auto pb-1">
            {weekDates.map((date) => {
              const active = isSameDay(date, selectedDay)
              const today = isToday(date)
              return (
                <button
                  key={formatDateISO(date)}
                  onClick={() => setSelectedDay(date)}
                  className={`flex flex-col items-center px-3 py-2 rounded-lg text-center min-w-[48px] transition-colors ${
                    active
                      ? 'bg-[#0F766E] text-white'
                      : today
                        ? 'bg-[#F0FDFA] text-[#0F766E] border border-[#0F766E]/20'
                        : 'bg-white border border-[#E2E8F0] text-[#64748B]'
                  }`}
                >
                  <span className="text-[10px] uppercase">{DAY_NAMES[weekDates.indexOf(date)]}</span>
                  <span className="text-[14px] font-semibold">{date.getDate()}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Event detail panel ────────────────────────────────────── */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30" onClick={() => setSelectedEvent(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-sm sm:mx-4 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-[16px] font-semibold text-[#1E293B]">{selectedEvent.customerName}</h3>
                <p className="text-[13px] text-[#64748B]">{selectedEvent.title}</p>
              </div>
              <button onClick={() => setSelectedEvent(null)} className="p-1 text-[#94A3B8] hover:text-[#1E293B]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 mb-5">
              <div className="flex items-center gap-2 text-[13px] text-[#64748B]">
                <Clock className="w-4 h-4" />
                <span>
                  {new Date(selectedEvent.start).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-[#64748B]">
                <Clock className="w-4 h-4" />
                <span>{formatTime(selectedEvent.start)} – {formatTime(selectedEvent.end)}</span>
              </div>
              {selectedEvent.customerPhone && (
                <div className="flex items-center gap-2 text-[13px] text-[#64748B]">
                  <User className="w-4 h-4" />
                  <a href={`tel:${selectedEvent.customerPhone}`} className="text-[#0F766E] underline">{selectedEvent.customerPhone}</a>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className={`inline-flex px-2.5 py-1 text-[11px] rounded-full font-medium ${
                  selectedEvent.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' :
                  selectedEvent.status === 'completed' ? 'bg-teal-50 text-teal-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {selectedEvent.status === 'confirmed' ? 'Bekräftad' :
                   selectedEvent.status === 'completed' ? 'Slutförd' :
                   selectedEvent.status}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => openEditModal(selectedEvent)}
                className="flex-1 py-2.5 bg-[#0F766E] text-white rounded-lg text-[13px] font-medium hover:opacity-90"
              >
                Redigera
              </button>
              <button
                onClick={() => handleBookingDelete(selectedEvent.id)}
                className="px-4 py-2.5 border border-red-200 text-red-600 rounded-lg text-[13px] hover:bg-red-50 transition-colors"
              >
                Ta bort
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Booking Modal ────────────────────────────────────────── */}
      {bookingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30" onClick={() => setBookingModalOpen(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-md sm:mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[16px] font-semibold text-[#1E293B]">
                {editingBooking ? 'Redigera bokning' : 'Ny bokning'}
              </h3>
              <button onClick={() => setBookingModalOpen(false)} className="p-1 text-[#94A3B8] hover:text-[#1E293B]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[12px] text-[#64748B] mb-1">Kund *</label>
                <select
                  value={bookingForm.customer_id}
                  onChange={(e) => setBookingForm({ ...bookingForm, customer_id: e.target.value })}
                  className="w-full px-3 py-[9px] text-[13px] border border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                >
                  <option value="">Välj kund...</option>
                  {customers.map(c => (
                    <option key={c.customer_id} value={c.customer_id}>{c.name} ({c.phone_number})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[12px] text-[#64748B] mb-1">Datum *</label>
                <input
                  type="date"
                  value={bookingForm.date}
                  onChange={(e) => setBookingForm({ ...bookingForm, date: e.target.value })}
                  className="w-full px-3 py-[9px] text-[13px] border border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] text-[#64748B] mb-1">Starttid *</label>
                  <input
                    type="time"
                    value={bookingForm.start_time}
                    onChange={(e) => setBookingForm({ ...bookingForm, start_time: e.target.value })}
                    className="w-full px-3 py-[9px] text-[13px] border border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] text-[#64748B] mb-1">Sluttid *</label>
                  <input
                    type="time"
                    value={bookingForm.end_time}
                    onChange={(e) => setBookingForm({ ...bookingForm, end_time: e.target.value })}
                    className="w-full px-3 py-[9px] text-[13px] border border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                  />
                </div>
              </div>
              {editingBooking && (
                <div>
                  <label className="block text-[12px] text-[#64748B] mb-1">Status</label>
                  <select
                    value={bookingForm.status}
                    onChange={(e) => setBookingForm({ ...bookingForm, status: e.target.value })}
                    className="w-full px-3 py-[9px] text-[13px] border border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                  >
                    <option value="confirmed">Bekräftad</option>
                    <option value="completed">Slutförd</option>
                    <option value="cancelled">Avbokad</option>
                    <option value="no_show">Uteblev</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-[12px] text-[#64748B] mb-1">Anteckningar</label>
                <textarea
                  value={bookingForm.notes}
                  onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })}
                  placeholder="T.ex. Elinstallation - 3 nya uttag"
                  rows={3}
                  className="w-full px-3 py-[9px] text-[13px] border border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E] resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setBookingModalOpen(false)} className="px-4 py-2.5 text-[#64748B] text-[13px] hover:text-[#1E293B]">
                Avbryt
              </button>
              <button
                onClick={handleBookingSubmit}
                disabled={actionLoading || customers.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#0F766E] rounded-lg text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingBooking ? 'Spara' : 'Skapa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
