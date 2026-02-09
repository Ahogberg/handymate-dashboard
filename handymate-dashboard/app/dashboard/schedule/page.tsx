'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  CalendarDays,
  Plus,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  Trash2,
  Check,
  XCircle,
  Users,
  BarChart3,
  Clock,
  Car,
  Briefcase,
  Coffee,
  Palmtree,
  AlertTriangle,
  ChevronDown,
  Filter
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addWeeks,
  addMonths,
  subDays,
  subWeeks,
  subMonths,
  isSameDay,
  isToday,
  parseISO,
  differenceInMinutes,
  eachDayOfInterval,
  getDay,
  startOfDay,
  isBefore,
  isAfter,
  isSameMonth,
  setHours,
  setMinutes
} from 'date-fns'
import { sv } from 'date-fns/locale'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduleEntry {
  id: string
  business_user_id: string
  project_id: string | null
  title: string
  description: string | null
  start_datetime: string
  end_datetime: string
  all_day: boolean
  type: 'project' | 'internal' | 'time_off' | 'travel'
  status: 'scheduled' | 'completed' | 'cancelled'
  color: string | null
  business_user?: { id: string; name: string; color: string }
  project?: { project_id: string; name: string } | null
}

interface TeamMember {
  id: string
  name: string
  color: string
  role: string
  is_active: boolean
  accepted_at: string | null
}

interface TimeOffRequest {
  id: string
  business_user_id: string
  start_date: string
  end_date: string
  type: string
  note: string | null
  status: 'pending' | 'approved' | 'rejected'
  business_user?: { id: string; name: string }
}

interface Project {
  project_id: string
  name: string
}

type CalendarView = 'day' | 'week' | 'month'
type PageMode = 'calendar' | 'utilization'

interface EntryForm {
  business_user_id: string
  project_id: string
  title: string
  date: string
  all_day: boolean
  start_time: string
  end_time: string
  type: 'project' | 'internal' | 'travel'
  description: string
  color: string
}

interface TimeOffForm {
  start_date: string
  end_date: string
  type: string
  note: string
}

const HOUR_HEIGHT = 60
const START_HOUR = 6
const END_HOUR = 20
const TOTAL_HOURS = END_HOUR - START_HOUR

const COLOR_OPTIONS = [
  '#8b5cf6', '#d946ef', '#3b82f6', '#10b981',
  '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'
]

const TIME_OFF_TYPES = [
  { value: 'semester', label: 'Semester' },
  { value: 'sjuk', label: 'Sjuk' },
  { value: 'foraldraledig', label: 'Foraldraledig' },
  { value: 'ovrigt', label: 'Ovrigt' }
]

const ENTRY_TYPE_OPTIONS: { value: 'project' | 'internal' | 'travel'; label: string }[] = [
  { value: 'project', label: 'Projekt' },
  { value: 'internal', label: 'Internt' },
  { value: 'travel', label: 'Restid' }
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'project':
      return <Briefcase className="w-3 h-3" />
    case 'internal':
      return <Coffee className="w-3 h-3" />
    case 'travel':
      return <Car className="w-3 h-3" />
    case 'time_off':
      return <Palmtree className="w-3 h-3" />
    default:
      return null
  }
}

function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`
}

function getEntryPosition(entry: ScheduleEntry): { top: number; height: number } {
  const start = parseISO(entry.start_datetime)
  const end = parseISO(entry.end_datetime)
  const startMinutes = start.getHours() * 60 + start.getMinutes()
  const endMinutes = end.getHours() * 60 + end.getMinutes()
  const clampedStart = Math.max(startMinutes, START_HOUR * 60)
  const clampedEnd = Math.min(endMinutes, END_HOUR * 60)
  const top = ((clampedStart - START_HOUR * 60) / 60) * HOUR_HEIGHT
  const height = Math.max(((clampedEnd - clampedStart) / 60) * HOUR_HEIGHT, 20)
  return { top, height }
}

function getEntryColor(entry: ScheduleEntry, members: TeamMember[]): string {
  if (entry.color) return entry.color
  if (entry.type === 'time_off') return '#6b7280'
  const member = members.find((m) => m.id === entry.business_user_id)
  return member?.color || '#8b5cf6'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SchedulePage() {
  const business = useBusiness()
  const { user: currentUser, isOwnerOrAdmin } = useCurrentUser()

  // View state
  const [view, setView] = useState<CalendarView>('week')
  const [mode, setMode] = useState<PageMode>('calendar')
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [isMobile, setIsMobile] = useState(false)

  // Data state
  const [entries, setEntries] = useState<ScheduleEntry[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())

  // Loading state
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // Modal state
  const [entryModalOpen, setEntryModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<ScheduleEntry | null>(null)
  const [timeOffModalOpen, setTimeOffModalOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)

  // Conflict warning
  const [conflicts, setConflicts] = useState<ScheduleEntry[]>([])

  // Forms
  const [entryForm, setEntryForm] = useState<EntryForm>({
    business_user_id: '',
    project_id: '',
    title: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    all_day: false,
    start_time: '08:00',
    end_time: '16:00',
    type: 'project',
    description: '',
    color: ''
  })

  const [timeOffForm, setTimeOffForm] = useState<TimeOffForm>({
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    type: 'semester',
    note: ''
  })

  // Toast
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false,
    message: '',
    type: 'success'
  })

  const gridRef = useRef<HTMLDivElement>(null)

  // ---------------------------------------------------------------------------
  // Responsive check
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (isMobile && view === 'week') {
      setView('day')
    }
  }, [isMobile, view])

  // ---------------------------------------------------------------------------
  // Date range computation
  // ---------------------------------------------------------------------------

  const dateRange = useMemo(() => {
    switch (view) {
      case 'day':
        return { start: startOfDay(currentDate), end: startOfDay(currentDate) }
      case 'week': {
        const s = startOfWeek(currentDate, { weekStartsOn: 1 })
        const e = endOfWeek(currentDate, { weekStartsOn: 1 })
        return { start: s, end: e }
      }
      case 'month': {
        const s = startOfMonth(currentDate)
        const e = endOfMonth(currentDate)
        return { start: s, end: e }
      }
    }
  }, [view, currentDate])

  const weekDays = useMemo(() => {
    if (view === 'day') return [currentDate]
    if (view === 'week') {
      const s = startOfWeek(currentDate, { weekStartsOn: 1 })
      return Array.from({ length: 7 }, (_, i) => addDays(s, i))
    }
    return []
  }, [view, currentDate])

  const monthDays = useMemo(() => {
    if (view !== 'month') return []
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [view, currentDate])

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }, [])

  const fetchTeam = useCallback(async () => {
    try {
      const res = await fetch('/api/team')
      if (!res.ok) throw new Error('Fetch team failed')
      const data = await res.json()
      const members: TeamMember[] = data.members || []
      setTeamMembers(members)
      // Select all members by default if no selection yet
      setSelectedMembers((prev) => {
        if (prev.size === 0) return new Set(members.map((m) => m.id))
        return prev
      })
    } catch {
      console.error('Could not fetch team')
    }
  }, [])

  const fetchEntries = useCallback(async () => {
    if (!business.business_id) return
    const startDate = format(dateRange.start, 'yyyy-MM-dd')
    const endDate = format(dateRange.end, 'yyyy-MM-dd')
    const userIds = Array.from(selectedMembers).join(',')
    try {
      const res = await fetch(
        `/api/schedule?start_date=${startDate}&end_date=${endDate}${userIds ? `&user_ids=${userIds}` : ''}`
      )
      if (!res.ok) throw new Error('Fetch entries failed')
      const data = await res.json()
      setEntries(data.entries || [])
    } catch {
      console.error('Could not fetch schedule entries')
    }
  }, [business.business_id, dateRange, selectedMembers])

  const fetchTimeOff = useCallback(async () => {
    if (!isOwnerOrAdmin) return
    try {
      const res = await fetch('/api/time-off?status=pending')
      if (!res.ok) throw new Error('Fetch time off failed')
      const data = await res.json()
      setTimeOffRequests(data.requests || [])
    } catch {
      console.error('Could not fetch time off requests')
    }
  }, [isOwnerOrAdmin])

  const fetchProjects = useCallback(async () => {
    if (!business.business_id) return
    try {
      const { data } = await supabase
        .from('project')
        .select('project_id, name')
        .eq('business_id', business.business_id)
        .in('status', ['planning', 'active', 'paused'])
      setProjects(data || [])
    } catch {
      console.error('Could not fetch projects')
    }
  }, [business.business_id])

  // Initial load
  useEffect(() => {
    if (business.business_id) {
      setLoading(true)
      Promise.all([fetchTeam(), fetchProjects()]).finally(() => setLoading(false))
    }
  }, [business.business_id, fetchTeam, fetchProjects])

  // Refetch entries when date range / selected members change
  useEffect(() => {
    if (business.business_id && selectedMembers.size > 0) {
      fetchEntries()
    }
  }, [business.business_id, fetchEntries, selectedMembers])

  // Fetch time off for admins
  useEffect(() => {
    fetchTimeOff()
  }, [fetchTimeOff])

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  const navigate = (direction: 'prev' | 'next') => {
    setCurrentDate((prev) => {
      switch (view) {
        case 'day':
          return direction === 'prev' ? subDays(prev, 1) : addDays(prev, 1)
        case 'week':
          return direction === 'prev' ? subWeeks(prev, 1) : addWeeks(prev, 1)
        case 'month':
          return direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1)
      }
    })
  }

  const goToday = () => setCurrentDate(new Date())

  const headerLabel = useMemo(() => {
    switch (view) {
      case 'day':
        return format(currentDate, 'EEEE d MMMM yyyy', { locale: sv })
      case 'week': {
        const s = startOfWeek(currentDate, { weekStartsOn: 1 })
        const e = endOfWeek(currentDate, { weekStartsOn: 1 })
        return `${format(s, 'd MMM', { locale: sv })} - ${format(e, 'd MMM yyyy', { locale: sv })}`
      }
      case 'month':
        return format(currentDate, 'MMMM yyyy', { locale: sv })
    }
  }, [view, currentDate])

  // ---------------------------------------------------------------------------
  // Team member selection
  // ---------------------------------------------------------------------------

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = selectedMembers.size === teamMembers.length
  const toggleAll = () => {
    if (allSelected) {
      setSelectedMembers(new Set())
    } else {
      setSelectedMembers(new Set(teamMembers.map((m) => m.id)))
    }
  }

  // ---------------------------------------------------------------------------
  // Filtered entries helper
  // ---------------------------------------------------------------------------

  const filteredEntries = useMemo(
    () => entries.filter((e) => selectedMembers.has(e.business_user_id)),
    [entries, selectedMembers]
  )

  const getEntriesForDay = useCallback(
    (day: Date) =>
      filteredEntries.filter((e) => {
        const eDate = parseISO(e.start_datetime)
        return isSameDay(eDate, day)
      }),
    [filteredEntries]
  )

  const getAllDayEntries = useCallback(
    (day: Date) => getEntriesForDay(day).filter((e) => e.all_day),
    [getEntriesForDay]
  )

  const getTimedEntries = useCallback(
    (day: Date) => getEntriesForDay(day).filter((e) => !e.all_day),
    [getEntriesForDay]
  )

  // ---------------------------------------------------------------------------
  // Conflict detection
  // ---------------------------------------------------------------------------

  const checkConflicts = useCallback(
    (userId: string, date: string, startTime: string, endTime: string, allDay: boolean, excludeId?: string) => {
      if (allDay) {
        setConflicts([])
        return
      }
      const startDt = `${date}T${startTime}:00`
      const endDt = `${date}T${endTime}:00`
      const found = entries.filter((e) => {
        if (e.id === excludeId) return false
        if (e.business_user_id !== userId) return false
        if (e.all_day) return false
        return e.start_datetime < endDt && e.end_datetime > startDt
      })
      setConflicts(found)
    },
    [entries]
  )

  // ---------------------------------------------------------------------------
  // Entry modal
  // ---------------------------------------------------------------------------

  const openCreateModal = (prefillDate?: Date, prefillHour?: number) => {
    const d = prefillDate || new Date()
    const hour = prefillHour ?? 8
    setEditingEntry(null)
    setConflicts([])
    setEntryForm({
      business_user_id: currentUser?.id || (teamMembers[0]?.id ?? ''),
      project_id: '',
      title: '',
      date: format(d, 'yyyy-MM-dd'),
      all_day: false,
      start_time: `${hour.toString().padStart(2, '0')}:00`,
      end_time: `${Math.min(hour + 1, END_HOUR).toString().padStart(2, '0')}:00`,
      type: 'project',
      description: '',
      color: ''
    })
    setEntryModalOpen(true)
  }

  const openEditModal = (entry: ScheduleEntry) => {
    setEditingEntry(entry)
    setConflicts([])
    const start = parseISO(entry.start_datetime)
    const end = parseISO(entry.end_datetime)
    setEntryForm({
      business_user_id: entry.business_user_id,
      project_id: entry.project_id || '',
      title: entry.title,
      date: format(start, 'yyyy-MM-dd'),
      all_day: entry.all_day,
      start_time: format(start, 'HH:mm'),
      end_time: format(end, 'HH:mm'),
      type: entry.type === 'time_off' ? 'internal' : entry.type,
      description: entry.description || '',
      color: entry.color || ''
    })
    setEntryModalOpen(true)
  }

  const handleEntrySubmit = async () => {
    if (!entryForm.title.trim()) {
      showToast('Titel kravs', 'error')
      return
    }
    if (!entryForm.business_user_id) {
      showToast('Valj en person', 'error')
      return
    }

    setActionLoading(true)
    try {
      const startDatetime = entryForm.all_day
        ? `${entryForm.date}T00:00:00`
        : `${entryForm.date}T${entryForm.start_time}:00`
      const endDatetime = entryForm.all_day
        ? `${entryForm.date}T23:59:59`
        : `${entryForm.date}T${entryForm.end_time}:00`

      const body: Record<string, unknown> = {
        business_user_id: entryForm.business_user_id,
        project_id: entryForm.project_id || null,
        title: entryForm.title.trim(),
        description: entryForm.description.trim() || null,
        start_datetime: startDatetime,
        end_datetime: endDatetime,
        all_day: entryForm.all_day,
        type: entryForm.type,
        color: entryForm.color || null
      }

      let res: Response
      if (editingEntry) {
        res = await fetch(`/api/schedule/${editingEntry.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
      } else {
        res = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.error || 'Nagot gick fel')
      }

      const data = await res.json()
      if (data.conflicts && data.conflicts.length > 0) {
        showToast('Sparad, men det finns overlappande poster', 'success')
      } else {
        showToast(editingEntry ? 'Post uppdaterad!' : 'Post skapad!', 'success')
      }

      setEntryModalOpen(false)
      fetchEntries()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Nagot gick fel', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleEntryDelete = async () => {
    if (!editingEntry) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/schedule/${editingEntry.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Nagot gick fel')
      showToast('Post borttagen!', 'success')
      setEntryModalOpen(false)
      setDeleteConfirmId(null)
      fetchEntries()
    } catch {
      showToast('Kunde inte ta bort posten', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Update conflict check when form changes
  useEffect(() => {
    if (entryModalOpen && entryForm.business_user_id && entryForm.date) {
      checkConflicts(
        entryForm.business_user_id,
        entryForm.date,
        entryForm.start_time,
        entryForm.end_time,
        entryForm.all_day,
        editingEntry?.id
      )
    }
  }, [
    entryModalOpen,
    entryForm.business_user_id,
    entryForm.date,
    entryForm.start_time,
    entryForm.end_time,
    entryForm.all_day,
    editingEntry,
    checkConflicts
  ])

  // Auto-fill title from project
  const handleProjectChange = (projectId: string) => {
    setEntryForm((prev) => {
      const project = projects.find((p) => p.project_id === projectId)
      return {
        ...prev,
        project_id: projectId,
        title: project && !prev.title ? project.name : prev.title
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Time off
  // ---------------------------------------------------------------------------

  const handleTimeOffSubmit = async () => {
    if (!timeOffForm.start_date || !timeOffForm.end_date) {
      showToast('Start- och slutdatum kravs', 'error')
      return
    }
    setActionLoading(true)
    try {
      const res = await fetch('/api/time-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(timeOffForm)
      })
      if (!res.ok) throw new Error('Nagot gick fel')
      showToast('Ledighetsansokan skickad!', 'success')
      setTimeOffModalOpen(false)
      fetchTimeOff()
    } catch {
      showToast('Kunde inte skicka ansokan', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleTimeOffAction = async (id: string, action: 'approve' | 'reject') => {
    try {
      const res = await fetch(`/api/time-off/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      })
      if (!res.ok) throw new Error('Nagot gick fel')
      showToast(action === 'approve' ? 'Godkand!' : 'Nekad!', 'success')
      fetchTimeOff()
      fetchEntries()
    } catch {
      showToast('Nagot gick fel', 'error')
    }
  }

  // ---------------------------------------------------------------------------
  // Utilization calculations
  // ---------------------------------------------------------------------------

  const utilizationData = useMemo(() => {
    const days = view === 'month' ? monthDays.filter((d) => isSameMonth(d, currentDate)) : weekDays
    const workingHours = 8

    return teamMembers.map((member) => {
      const dayData = days.map((day) => {
        const dayEntries = entries.filter(
          (e) =>
            e.business_user_id === member.id &&
            isSameDay(parseISO(e.start_datetime), day) &&
            e.status !== 'cancelled'
        )

        const isTimeOff = dayEntries.some((e) => e.type === 'time_off')
        const isWeekend = getDay(day) === 0 || getDay(day) === 6

        let hours = 0
        dayEntries.forEach((e) => {
          if (e.all_day) {
            hours += workingHours
          } else {
            hours += differenceInMinutes(parseISO(e.end_datetime), parseISO(e.start_datetime)) / 60
          }
        })

        const utilization = Math.min((hours / workingHours) * 100, 100)

        return { day, hours, utilization, isTimeOff, isWeekend }
      })

      const workDays = dayData.filter((d) => !d.isWeekend)
      const totalHours = workDays.reduce((sum, d) => sum + d.hours, 0)
      const totalCapacity = workDays.length * workingHours
      const avgUtilization = totalCapacity > 0 ? (totalHours / totalCapacity) * 100 : 0

      return { member, dayData, totalHours, avgUtilization }
    })
  }, [teamMembers, entries, weekDays, monthDays, view, currentDate])

  const teamUtilization = useMemo(() => {
    if (utilizationData.length === 0) return 0
    const total = utilizationData.reduce((sum, d) => sum + d.avgUtilization, 0)
    return total / utilizationData.length
  }, [utilizationData])

  // ---------------------------------------------------------------------------
  // Click handlers for calendar grid
  // ---------------------------------------------------------------------------

  const handleGridClick = (day: Date, hour?: number) => {
    openCreateModal(day, hour)
  }

  const handleMonthDayClick = (day: Date) => {
    setCurrentDate(day)
    setView('day')
  }

  // ---------------------------------------------------------------------------
  // Render: Loading
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="pt-16 sm:pt-8 p-4 sm:p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: Utilization cell color
  // ---------------------------------------------------------------------------

  function getUtilColor(util: number, isTimeOff: boolean, isWeekend: boolean): string {
    if (isWeekend) return 'bg-zinc-900/30'
    if (isTimeOff) return 'bg-zinc-600/30'
    if (util <= 0) return 'bg-zinc-800/50'
    if (util < 50) return 'bg-emerald-500/20'
    if (util < 80) return 'bg-amber-500/20'
    return 'bg-red-500/20'
  }

  function getUtilTextColor(util: number, isTimeOff: boolean, isWeekend: boolean): string {
    if (isWeekend || isTimeOff) return 'text-zinc-600'
    if (util <= 0) return 'text-zinc-600'
    if (util < 50) return 'text-emerald-400'
    if (util < 80) return 'text-amber-400'
    return 'text-red-400'
  }

  // ---------------------------------------------------------------------------
  // Render: Entry block (week/day view)
  // ---------------------------------------------------------------------------

  function renderEntryBlock(entry: ScheduleEntry) {
    const { top, height } = getEntryPosition(entry)
    const color = getEntryColor(entry, teamMembers)
    const memberName = entry.business_user?.name || teamMembers.find((m) => m.id === entry.business_user_id)?.name || ''
    const startTime = format(parseISO(entry.start_datetime), 'HH:mm')
    const endTime = format(parseISO(entry.end_datetime), 'HH:mm')

    return (
      <button
        key={entry.id}
        onClick={(e) => {
          e.stopPropagation()
          openEditModal(entry)
        }}
        className="absolute left-1 right-1 rounded-lg px-2 py-1 text-left overflow-hidden cursor-pointer transition-opacity hover:opacity-90 z-10"
        style={{
          top: `${top}px`,
          height: `${height}px`,
          backgroundColor: `${color}20`,
          borderLeft: `3px solid ${color}`
        }}
        title={`${entry.title} (${startTime}-${endTime})`}
      >
        <div className="flex items-center gap-1 text-xs font-medium text-white truncate">
          {getTypeIcon(entry.type)}
          <span className="truncate">{entry.title}</span>
        </div>
        {height > 36 && (
          <p className="text-[10px] text-zinc-400 mt-0.5 truncate">
            {startTime} - {endTime}
          </p>
        )}
        {height > 52 && (
          <div className="flex items-center gap-1 mt-0.5">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-zinc-500 truncate">{memberName}</span>
          </div>
        )}
      </button>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: All-day row
  // ---------------------------------------------------------------------------

  function renderAllDayRow(days: Date[]) {
    const hasAllDay = days.some((d) => getAllDayEntries(d).length > 0)
    if (!hasAllDay) return null

    return (
      <div className="flex border-b border-zinc-800">
        <div className="w-14 flex-shrink-0 text-[10px] text-zinc-600 p-1 text-right pr-2">Heldag</div>
        <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
          {days.map((day) => {
            const allDay = getAllDayEntries(day)
            return (
              <div key={day.toISOString()} className="border-l border-zinc-800 min-h-[28px] p-0.5 flex flex-col gap-0.5">
                {allDay.map((entry) => {
                  const color = getEntryColor(entry, teamMembers)
                  return (
                    <button
                      key={entry.id}
                      onClick={() => openEditModal(entry)}
                      className="text-[10px] px-1.5 py-0.5 rounded truncate text-left"
                      style={{ backgroundColor: `${color}30`, color: color }}
                    >
                      {entry.title}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: Time grid (week & day views)
  // ---------------------------------------------------------------------------

  function renderTimeGrid(days: Date[]) {
    return (
      <div className="overflow-auto max-h-[calc(100vh-280px)]" ref={gridRef}>
        {/* All-day row */}
        {renderAllDayRow(days)}

        <div className="flex">
          {/* Hour labels */}
          <div className="w-14 flex-shrink-0">
            {Array.from({ length: TOTAL_HOURS }, (_, i) => (
              <div
                key={i}
                className="text-[10px] text-zinc-600 text-right pr-2 border-b border-zinc-800/50"
                style={{ height: `${HOUR_HEIGHT}px` }}
              >
                {formatHour(START_HOUR + i)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
            {days.map((day) => {
              const timedEntries = getTimedEntries(day)
              const todayHighlight = isToday(day)
              return (
                <div
                  key={day.toISOString()}
                  className={`relative border-l border-zinc-800 ${todayHighlight ? 'bg-violet-500/[0.03]' : ''}`}
                >
                  {/* Hour grid lines & click zones */}
                  {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                    <div
                      key={i}
                      className="border-b border-zinc-800/50 cursor-pointer hover:bg-zinc-800/20 transition-colors"
                      style={{ height: `${HOUR_HEIGHT}px` }}
                      onClick={() => handleGridClick(day, START_HOUR + i)}
                    />
                  ))}

                  {/* Entry blocks */}
                  {timedEntries.map((entry) => renderEntryBlock(entry))}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: Month grid
  // ---------------------------------------------------------------------------

  function renderMonthGrid() {
    const dayNames = ['Mon', 'Tis', 'Ons', 'Tor', 'Fre', 'Lor', 'Son']

    return (
      <div>
        {/* Day name headers */}
        <div className="grid grid-cols-7 border-b border-zinc-800">
          {dayNames.map((name) => (
            <div key={name} className="text-center text-xs font-medium text-zinc-500 py-2">
              {name}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {monthDays.map((day) => {
            const dayEntries = getEntriesForDay(day)
            const inMonth = isSameMonth(day, currentDate)
            const today = isToday(day)
            const maxVisible = 3
            const visibleEntries = dayEntries.slice(0, maxVisible)
            const moreCount = dayEntries.length - maxVisible

            return (
              <div
                key={day.toISOString()}
                className={`min-h-[80px] sm:min-h-[100px] border-b border-r border-zinc-800 p-1 cursor-pointer hover:bg-zinc-800/20 transition-colors ${
                  !inMonth ? 'opacity-30' : ''
                }`}
                onClick={() => handleMonthDayClick(day)}
              >
                <div
                  className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                    today ? 'bg-violet-500 text-white' : 'text-zinc-400'
                  }`}
                >
                  {format(day, 'd')}
                </div>
                <div className="space-y-0.5">
                  {visibleEntries.map((entry) => {
                    const color = getEntryColor(entry, teamMembers)
                    return (
                      <button
                        key={entry.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditModal(entry)
                        }}
                        className="flex items-center gap-1 w-full text-left"
                      >
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-[10px] text-zinc-300 truncate">{entry.title}</span>
                      </button>
                    )
                  })}
                  {moreCount > 0 && (
                    <p className="text-[10px] text-zinc-500 pl-2.5">+{moreCount} fler</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: Utilization view
  // ---------------------------------------------------------------------------

  function renderUtilizationView() {
    const days = view === 'month'
      ? monthDays.filter((d) => isSameMonth(d, currentDate))
      : weekDays

    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left text-xs font-medium text-zinc-500 uppercase py-3 px-4 w-48">Person</th>
              {days.map((day) => (
                <th
                  key={day.toISOString()}
                  className={`text-center text-xs font-medium py-3 px-1 ${
                    isToday(day) ? 'text-violet-400' : 'text-zinc-500'
                  } ${getDay(day) === 0 || getDay(day) === 6 ? 'opacity-50' : ''}`}
                >
                  <div>{format(day, 'EEE', { locale: sv })}</div>
                  <div>{format(day, 'd')}</div>
                </th>
              ))}
              <th className="text-center text-xs font-medium text-zinc-500 uppercase py-3 px-3">Snitt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {utilizationData.map(({ member, dayData, avgUtilization }) => (
              <tr key={member.id} className="hover:bg-zinc-800/20">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: member.color }}
                    >
                      {getInitials(member.name)}
                    </div>
                    <span className="text-sm text-white truncate">{member.name}</span>
                  </div>
                </td>
                {dayData.map((d) => (
                  <td key={d.day.toISOString()} className="text-center py-2 px-1">
                    <div
                      className={`rounded-md py-1.5 text-xs font-medium ${getUtilColor(
                        d.utilization,
                        d.isTimeOff,
                        d.isWeekend
                      )} ${getUtilTextColor(d.utilization, d.isTimeOff, d.isWeekend)}`}
                    >
                      {d.isWeekend ? '-' : d.isTimeOff ? 'Ledig' : `${d.hours.toFixed(1)}h`}
                    </div>
                  </td>
                ))}
                <td className="text-center py-2 px-3">
                  <span
                    className={`text-xs font-bold ${
                      avgUtilization < 50
                        ? 'text-emerald-400'
                        : avgUtilization < 80
                        ? 'text-amber-400'
                        : 'text-red-400'
                    }`}
                  >
                    {avgUtilization.toFixed(0)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-700">
              <td className="py-3 px-4 text-sm font-medium text-zinc-400">Teamsnitt</td>
              <td colSpan={days.length} />
              <td className="text-center py-3 px-3">
                <span
                  className={`text-sm font-bold ${
                    teamUtilization < 50
                      ? 'text-emerald-400'
                      : teamUtilization < 80
                      ? 'text-amber-400'
                      : 'text-red-400'
                  }`}
                >
                  {teamUtilization.toFixed(0)}%
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: Sidebar
  // ---------------------------------------------------------------------------

  function renderSidebar() {
    return (
      <div className="hidden lg:block w-64 flex-shrink-0">
        <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-4 sticky top-8">
          {/* Team heading */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Team</h3>
            <button onClick={toggleAll} className="text-xs text-violet-400 hover:text-violet-300">
              {allSelected ? 'Avmarkera' : 'Markera alla'}
            </button>
          </div>

          {/* Member checkboxes */}
          <div className="space-y-1.5 mb-6">
            {teamMembers.map((member) => (
              <label
                key={member.id}
                className="flex items-center gap-2 cursor-pointer group px-2 py-1.5 rounded-lg hover:bg-zinc-800/50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedMembers.has(member.id)}
                  onChange={() => toggleMember(member.id)}
                  className="sr-only"
                />
                <div
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                    selectedMembers.has(member.id)
                      ? 'border-transparent'
                      : 'border-zinc-600 group-hover:border-zinc-500'
                  }`}
                  style={selectedMembers.has(member.id) ? { backgroundColor: member.color } : {}}
                >
                  {selectedMembers.has(member.id) && <Check className="w-3 h-3 text-white" />}
                </div>
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: member.color }}
                />
                <span className="text-sm text-zinc-300 truncate">{member.name}</span>
              </label>
            ))}
          </div>

          {/* Time off request button */}
          <button
            onClick={() => {
              setTimeOffForm({
                start_date: format(new Date(), 'yyyy-MM-dd'),
                end_date: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
                type: 'semester',
                note: ''
              })
              setTimeOffModalOpen(true)
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-white border border-zinc-800 rounded-xl hover:bg-zinc-800/50 transition-colors mb-4"
          >
            <Palmtree className="w-4 h-4" />
            Ansok om ledighet
          </button>

          {/* Pending time off requests (admin only) */}
          {isOwnerOrAdmin && timeOffRequests.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-white">Ledighetsansokningar</h3>
                <span className="text-xs bg-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full">
                  {timeOffRequests.length}
                </span>
              </div>
              <div className="space-y-2">
                {timeOffRequests.map((req) => (
                  <div key={req.id} className="bg-zinc-800/50 rounded-lg p-2.5">
                    <p className="text-xs font-medium text-white">{req.business_user?.name || 'Okand'}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      {format(parseISO(req.start_date), 'd MMM', { locale: sv })} -{' '}
                      {format(parseISO(req.end_date), 'd MMM', { locale: sv })}
                    </p>
                    <p className="text-[10px] text-zinc-500 capitalize">{req.type}</p>
                    {req.note && <p className="text-[10px] text-zinc-600 mt-0.5 truncate">{req.note}</p>}
                    <div className="flex gap-1 mt-2">
                      <button
                        onClick={() => handleTimeOffAction(req.id, 'approve')}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded transition-colors"
                      >
                        <Check className="w-3 h-3" />
                        Godkann
                      </button>
                      <button
                        onClick={() => handleTimeOffAction(req.id, 'reject')}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded transition-colors"
                      >
                        <XCircle className="w-3 h-3" />
                        Neka
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="pt-16 sm:pt-8 p-4 sm:p-8 bg-[#09090b] min-h-screen">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[128px]" />
      </div>

      {/* Toast */}
      {toast.show && (
        <div
          className={`fixed top-4 right-4 z-[60] px-4 py-3 rounded-xl border backdrop-blur-sm ${
            toast.type === 'success'
              ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/20 border-red-500/30 text-red-400'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* ============================================================== */}
      {/* ENTRY MODAL */}
      {/* ============================================================== */}
      {entryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-lg sm:mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">
                {editingEntry ? 'Redigera post' : 'Ny post'}
              </h3>
              <button onClick={() => setEntryModalOpen(false)} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Person */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Person *</label>
                <select
                  value={entryForm.business_user_id}
                  onChange={(e) => setEntryForm({ ...entryForm, business_user_id: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                >
                  <option value="">Valj person...</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Project */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Projekt (valfritt)</label>
                <select
                  value={entryForm.project_id}
                  onChange={(e) => handleProjectChange(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                >
                  <option value="">Inget projekt</option>
                  {projects.map((p) => (
                    <option key={p.project_id} value={p.project_id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Titel *</label>
                <input
                  type="text"
                  value={entryForm.title}
                  onChange={(e) => setEntryForm({ ...entryForm, title: e.target.value })}
                  placeholder="Vad ska goras?"
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Datum *</label>
                <input
                  type="date"
                  value={entryForm.date}
                  onChange={(e) => setEntryForm({ ...entryForm, date: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              {/* All-day toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <button
                  type="button"
                  onClick={() => setEntryForm({ ...entryForm, all_day: !entryForm.all_day })}
                  className={`w-10 h-6 rounded-full transition-colors ${
                    entryForm.all_day ? 'bg-violet-500' : 'bg-zinc-700'
                  } relative`}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      entryForm.all_day ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm text-zinc-300">Heldag</span>
              </label>

              {/* Times (if not all day) */}
              {!entryForm.all_day && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Starttid</label>
                    <input
                      type="time"
                      value={entryForm.start_time}
                      onChange={(e) => setEntryForm({ ...entryForm, start_time: e.target.value })}
                      className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Sluttid</label>
                    <input
                      type="time"
                      value={entryForm.end_time}
                      onChange={(e) => setEntryForm({ ...entryForm, end_time: e.target.value })}
                      className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                    />
                  </div>
                </div>
              )}

              {/* Type */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Typ</label>
                <div className="flex gap-2">
                  {ENTRY_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEntryForm({ ...entryForm, type: opt.value })}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                        entryForm.type === opt.value
                          ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      {opt.value === 'project' && <Briefcase className="w-3.5 h-3.5" />}
                      {opt.value === 'internal' && <Coffee className="w-3.5 h-3.5" />}
                      {opt.value === 'travel' && <Car className="w-3.5 h-3.5" />}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Anteckningar</label>
                <textarea
                  value={entryForm.description}
                  onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })}
                  rows={2}
                  placeholder="Valfria anteckningar..."
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
                />
              </div>

              {/* Color override */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Farg (valfritt)</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEntryForm({ ...entryForm, color: '' })}
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center ${
                      !entryForm.color ? 'border-white' : 'border-zinc-700'
                    } bg-zinc-800`}
                  >
                    {!entryForm.color && <X className="w-3 h-3 text-zinc-500" />}
                  </button>
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEntryForm({ ...entryForm, color: c })}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${
                        entryForm.color === c ? 'border-white scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Conflict warning */}
              {conflicts.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-amber-400 font-medium">Overlappning</p>
                    <p className="text-xs text-amber-400/70 mt-0.5">
                      Denna person har redan {conflicts.length} post{conflicts.length > 1 ? 'er' : ''} under denna tid.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between mt-6">
              <div>
                {editingEntry && (
                  <>
                    {deleteConfirmId === editingEntry.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-400">Radera?</span>
                        <button
                          onClick={handleEntryDelete}
                          disabled={actionLoading}
                          className="px-3 py-1.5 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg hover:bg-red-500/20"
                        >
                          Ja
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
                        >
                          Nej
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(editingEntry.id)}
                        className="flex items-center gap-1 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Radera
                      </button>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setEntryModalOpen(false)}
                  className="px-4 py-2 text-zinc-400 hover:text-white"
                >
                  Avbryt
                </button>
                <button
                  onClick={handleEntrySubmit}
                  disabled={actionLoading}
                  className="flex items-center px-5 py-2.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingEntry ? 'Spara' : 'Skapa'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TIME OFF MODAL */}
      {/* ============================================================== */}
      {timeOffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-md sm:mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Ansok om ledighet</h3>
              <button onClick={() => setTimeOffModalOpen(false)} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Fran *</label>
                  <input
                    type="date"
                    value={timeOffForm.start_date}
                    onChange={(e) => setTimeOffForm({ ...timeOffForm, start_date: e.target.value })}
                    className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Till *</label>
                  <input
                    type="date"
                    value={timeOffForm.end_date}
                    onChange={(e) => setTimeOffForm({ ...timeOffForm, end_date: e.target.value })}
                    className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1">Typ</label>
                <select
                  value={timeOffForm.type}
                  onChange={(e) => setTimeOffForm({ ...timeOffForm, type: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                >
                  {TIME_OFF_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1">Anteckning</label>
                <textarea
                  value={timeOffForm.note}
                  onChange={(e) => setTimeOffForm({ ...timeOffForm, note: e.target.value })}
                  rows={2}
                  placeholder="Valfri kommentar..."
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setTimeOffModalOpen(false)} className="px-4 py-2 text-zinc-400 hover:text-white">
                Avbryt
              </button>
              <button
                onClick={handleTimeOffSubmit}
                disabled={actionLoading}
                className="flex items-center px-5 py-2.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Skicka ansokan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MOBILE FILTER DROPDOWN */}
      {/* ============================================================== */}
      {mobileFilterOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobileFilterOpen(false)}>
          <div className="absolute top-28 left-4 right-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Filtrera team</h3>
              <button onClick={toggleAll} className="text-xs text-violet-400 hover:text-violet-300">
                {allSelected ? 'Avmarkera' : 'Markera alla'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {teamMembers.map((member) => (
                <label
                  key={member.id}
                  className="flex items-center gap-2 cursor-pointer px-2 py-2 rounded-lg hover:bg-zinc-800/50 transition-colors"
                >
                  <input type="checkbox" checked={selectedMembers.has(member.id)} onChange={() => toggleMember(member.id)} className="sr-only" />
                  <div
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                      selectedMembers.has(member.id) ? 'border-transparent' : 'border-zinc-600'
                    }`}
                    style={selectedMembers.has(member.id) ? { backgroundColor: member.color } : {}}
                  >
                    {selectedMembers.has(member.id) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: member.color }} />
                  <span className="text-sm text-zinc-300 truncate">{member.name}</span>
                </label>
              ))}
            </div>
            <button
              onClick={() => {
                setTimeOffForm({
                  start_date: format(new Date(), 'yyyy-MM-dd'),
                  end_date: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
                  type: 'semester',
                  note: ''
                })
                setTimeOffModalOpen(true)
                setMobileFilterOpen(false)
              }}
              className="w-full flex items-center justify-center gap-2 mt-3 px-3 py-2 text-sm text-zinc-400 hover:text-white border border-zinc-800 rounded-xl hover:bg-zinc-800/50 transition-colors"
            >
              <Palmtree className="w-4 h-4" />
              Ansok om ledighet
            </button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* PAGE CONTENT */}
      {/* ============================================================== */}
      <div className="relative">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-xl flex items-center justify-center border border-violet-500/30">
              <CalendarDays className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Resursplanering</h1>
              <p className="text-sm text-zinc-500 hidden sm:block">Planera och overblicka teamets schema</p>
            </div>
          </div>
          <button
            onClick={() => openCreateModal()}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 transition-opacity min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            Ny post
          </button>
        </div>

        {/* Controls row */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          {/* Mode toggle */}
          <div className="flex bg-zinc-900/50 border border-zinc-800 rounded-xl p-1">
            <button
              onClick={() => setMode('calendar')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === 'calendar'
                  ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              Kalender
            </button>
            <button
              onClick={() => setMode('utilization')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === 'utilization'
                  ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Belaggning
            </button>
          </div>

          {/* View switcher */}
          {mode === 'calendar' && (
            <div className="flex bg-zinc-900/50 border border-zinc-800 rounded-xl p-1">
              <button
                onClick={() => setView('day')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  view === 'day' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Dag
              </button>
              <button
                onClick={() => {
                  if (!isMobile) setView('week')
                }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  view === 'week' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                } ${isMobile ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                Vecka
              </button>
              <button
                onClick={() => setView('month')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  view === 'month' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Manad
              </button>
            </div>
          )}

          {/* Date navigation */}
          <div className="flex items-center gap-1 sm:ml-auto">
            <button
              onClick={() => navigate('prev')}
              className="p-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={goToday}
              className="px-3 py-2 text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors min-h-[44px]"
            >
              Idag
            </button>
            <button
              onClick={() => navigate('next')}
              className="p-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <span className="ml-2 text-sm font-medium text-white capitalize hidden sm:inline">{headerLabel}</span>
          </div>

          {/* Mobile filter button */}
          <button
            onClick={() => setMobileFilterOpen(!mobileFilterOpen)}
            className="lg:hidden flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-white border border-zinc-800 rounded-xl hover:bg-zinc-800/50 transition-colors min-h-[44px]"
          >
            <Filter className="w-4 h-4" />
            Team ({selectedMembers.size}/{teamMembers.length})
          </button>
        </div>

        {/* Mobile date label */}
        <div className="sm:hidden mb-3">
          <p className="text-sm font-medium text-white capitalize">{headerLabel}</p>
        </div>

        {/* Main layout: sidebar + content */}
        <div className="flex gap-6">
          {/* Sidebar (desktop) */}
          {renderSidebar()}

          {/* Calendar / Utilization content */}
          <div className="flex-1 min-w-0">
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 overflow-hidden">
              {mode === 'calendar' ? (
                <>
                  {/* Week view */}
                  {view === 'week' && (
                    <>
                      {/* Day headers */}
                      <div className="flex border-b border-zinc-800">
                        <div className="w-14 flex-shrink-0" />
                        <div className="flex-1 grid grid-cols-7">
                          {weekDays.map((day) => {
                            const today = isToday(day)
                            return (
                              <div
                                key={day.toISOString()}
                                className={`text-center py-3 border-l border-zinc-800 ${
                                  today ? 'bg-violet-500/[0.05]' : ''
                                }`}
                              >
                                <p className="text-xs text-zinc-500 uppercase">
                                  {format(day, 'EEE', { locale: sv })}
                                </p>
                                <p
                                  className={`text-lg font-semibold ${
                                    today ? 'text-violet-400' : 'text-white'
                                  }`}
                                >
                                  {format(day, 'd')}
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      {renderTimeGrid(weekDays)}
                    </>
                  )}

                  {/* Day view */}
                  {view === 'day' && (
                    <>
                      <div className="flex border-b border-zinc-800">
                        <div className="w-14 flex-shrink-0" />
                        <div className="flex-1">
                          <div
                            className={`text-center py-3 ${
                              isToday(currentDate) ? 'bg-violet-500/[0.05]' : ''
                            }`}
                          >
                            <p className="text-xs text-zinc-500 uppercase">
                              {format(currentDate, 'EEEE', { locale: sv })}
                            </p>
                            <p
                              className={`text-lg font-semibold ${
                                isToday(currentDate) ? 'text-violet-400' : 'text-white'
                              }`}
                            >
                              {format(currentDate, 'd MMMM', { locale: sv })}
                            </p>
                          </div>
                        </div>
                      </div>
                      {renderTimeGrid([currentDate])}
                    </>
                  )}

                  {/* Month view */}
                  {view === 'month' && renderMonthGrid()}

                  {/* Empty state */}
                  {filteredEntries.length === 0 && !loading && (
                    <div className="text-center py-12">
                      <CalendarDays className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                      <p className="text-zinc-500">Inga poster under denna period</p>
                      <button
                        onClick={() => openCreateModal()}
                        className="mt-4 text-violet-400 hover:text-violet-300 text-sm"
                      >
                        Lagg till en post
                      </button>
                    </div>
                  )}
                </>
              ) : (
                /* Utilization view */
                <>
                  {teamMembers.length === 0 ? (
                    <div className="text-center py-12">
                      <Users className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                      <p className="text-zinc-500">Inga teammedlemmar hittades</p>
                    </div>
                  ) : (
                    renderUtilizationView()
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
