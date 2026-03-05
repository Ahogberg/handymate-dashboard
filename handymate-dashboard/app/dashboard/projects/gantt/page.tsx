'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Users,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'

interface Project {
  project_id: string
  name: string
  status: string
  start_date: string | null
  end_date: string | null
  progress_percent: number
  customer?: { name: string } | null
  milestones?: Milestone[]
}

interface Milestone {
  milestone_id: string
  name: string
  due_date: string | null
  status: string
}

interface Booking {
  booking_id: string
  scheduled_start: string
  scheduled_end: string
  status: string
  notes: string | null
  customer?: { name: string } | null
}

type ViewMode = 'week' | 'month' | 'quarter'

export default function GanttPage() {
  const business = useBusiness()
  const [projects, setProjects] = useState<Project[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [viewStart, setViewStart] = useState(() => {
    const d = new Date()
    d.setDate(1) // Start of month
    return d
  })

  useEffect(() => {
    if (business.business_id) fetchData()
  }, [business.business_id])

  async function fetchData() {
    setLoading(true)
    try {
      const [projRes, bookRes] = await Promise.all([
        fetch('/api/projects'),
        fetch(`/api/bookings?limit=100`),
      ])
      const projData = await projRes.json()
      const bookData = await bookRes.json()

      setProjects((projData.projects || []).filter((p: Project) => p.start_date || p.end_date))
      setBookings(bookData.bookings || [])
    } catch {
      // ignore
    }
    setLoading(false)
  }

  // Calculate visible date range
  const { days, totalDays, rangeStart, rangeEnd } = useMemo(() => {
    const start = new Date(viewStart)
    let numDays: number
    switch (viewMode) {
      case 'week': numDays = 14; break
      case 'quarter': numDays = 90; break
      default: numDays = 42; break // ~6 weeks
    }
    const end = new Date(start)
    end.setDate(end.getDate() + numDays - 1)

    const daysArr: Date[] = []
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      daysArr.push(new Date(d))
    }

    return {
      days: daysArr,
      totalDays: numDays,
      rangeStart: start.toISOString().split('T')[0],
      rangeEnd: end.toISOString().split('T')[0],
    }
  }, [viewStart, viewMode])

  // Navigate
  const navigate = (direction: number) => {
    const d = new Date(viewStart)
    switch (viewMode) {
      case 'week': d.setDate(d.getDate() + direction * 14); break
      case 'quarter': d.setDate(d.getDate() + direction * 90); break
      default: d.setMonth(d.getMonth() + direction); break
    }
    setViewStart(d)
  }

  const goToday = () => {
    const d = new Date()
    if (viewMode === 'month' || viewMode === 'quarter') d.setDate(1)
    else d.setDate(d.getDate() - d.getDay() + 1) // Monday
    setViewStart(d)
  }

  // Calculate bar position for a date range
  const getBarStyle = (start: string, end: string) => {
    const s = new Date(start)
    const e = new Date(end)
    const rs = new Date(rangeStart)

    const startOffset = Math.max(0, (s.getTime() - rs.getTime()) / (1000 * 60 * 60 * 24))
    const endOffset = Math.min(totalDays, (e.getTime() - rs.getTime()) / (1000 * 60 * 60 * 24) + 1)
    const width = Math.max(0, endOffset - startOffset)

    if (width <= 0 || endOffset <= 0 || startOffset >= totalDays) return null

    return {
      left: `${(startOffset / totalDays) * 100}%`,
      width: `${(width / totalDays) * 100}%`,
    }
  }

  // Group days by month for header
  const monthGroups = useMemo(() => {
    const groups: Array<{ label: string; span: number }> = []
    let currentMonth = ''
    let currentSpan = 0

    for (const day of days) {
      const month = day.toLocaleDateString('sv-SE', { month: 'short', year: 'numeric' })
      if (month !== currentMonth) {
        if (currentMonth) groups.push({ label: currentMonth, span: currentSpan })
        currentMonth = month
        currentSpan = 1
      } else {
        currentSpan++
      }
    }
    if (currentMonth) groups.push({ label: currentMonth, span: currentSpan })
    return groups
  }, [days])

  const todayStr = new Date().toISOString().split('T')[0]

  if (loading) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Laddar...</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      <div className="relative max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Gantt-vy</h1>
            <p className="text-gray-500 mt-1">Visualisera projekt och bokningar på en tidslinje</p>
          </div>
          <Link href="/dashboard/projects" className="text-sm text-sky-700 hover:text-teal-600">
            ← Tillbaka till projekt
          </Link>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex bg-white border border-gray-200 rounded-xl p-1">
            {(['week', 'month', 'quarter'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  viewMode === mode ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {mode === 'week' ? '2 veckor' : mode === 'month' ? 'Månad' : 'Kvartal'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={goToday} className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50">
              Idag
            </button>
            <button onClick={() => navigate(1)} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <span className="text-sm text-gray-500">
            {new Date(rangeStart).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} – {new Date(rangeEnd).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>

        {/* Gantt Chart */}
        <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Timeline header */}
              <div className="border-b border-gray-200">
                {/* Month row */}
                <div className="flex">
                  <div className="w-52 flex-shrink-0 px-4 py-2 bg-gray-50 border-r border-gray-200">
                    <span className="text-xs font-medium text-gray-400 uppercase">Projekt</span>
                  </div>
                  <div className="flex-1 flex">
                    {monthGroups.map((g, i) => (
                      <div
                        key={i}
                        className="text-center text-xs font-medium text-gray-500 py-2 border-r border-gray-100"
                        style={{ width: `${(g.span / totalDays) * 100}%` }}
                      >
                        {g.label}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Day row */}
                <div className="flex">
                  <div className="w-52 flex-shrink-0 border-r border-gray-200" />
                  <div className="flex-1 flex">
                    {days.map((day, i) => {
                      const isWeekend = day.getDay() === 0 || day.getDay() === 6
                      const isToday = day.toISOString().split('T')[0] === todayStr
                      const showLabel = viewMode === 'week' || (viewMode === 'month' && (day.getDay() === 1 || day.getDate() === 1)) || (viewMode === 'quarter' && day.getDate() === 1)
                      return (
                        <div
                          key={i}
                          className={`text-center text-[10px] py-1 border-r border-gray-50 ${isWeekend ? 'bg-gray-50/50' : ''} ${isToday ? 'bg-teal-50' : ''}`}
                          style={{ width: `${100 / totalDays}%` }}
                        >
                          {showLabel ? day.getDate() : ''}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Project rows */}
              {projects.length === 0 && bookings.length === 0 ? (
                <div className="p-12 text-center">
                  <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-400">Inga projekt eller bokningar med datum att visa</p>
                </div>
              ) : (
                <div>
                  {/* Projects */}
                  {projects.map(project => {
                    const bar = project.start_date && project.end_date
                      ? getBarStyle(project.start_date, project.end_date)
                      : null

                    return (
                      <div key={project.project_id}>
                        <div className="flex border-b border-gray-100 hover:bg-gray-50/30">
                          <div className="w-52 flex-shrink-0 px-4 py-3 border-r border-gray-200">
                            <Link href={`/dashboard/projects/${project.project_id}`} className="text-sm font-medium text-gray-900 hover:text-sky-700 truncate block">
                              {project.name}
                            </Link>
                            <p className="text-xs text-gray-400 truncate">{project.customer?.name || ''}</p>
                          </div>
                          <div className="flex-1 relative py-3 px-1">
                            {bar && (
                              <div
                                className="absolute top-2 h-7 rounded-md flex items-center px-2 text-[10px] text-white font-medium overflow-hidden"
                                style={{
                                  left: bar.left,
                                  width: bar.width,
                                  background: `linear-gradient(90deg, #6366f1, #a855f7)`,
                                }}
                              >
                                <div
                                  className="absolute inset-y-0 left-0 bg-white/20 rounded-md"
                                  style={{ width: `${project.progress_percent}%` }}
                                />
                                <span className="relative z-10 truncate">{project.progress_percent}%</span>
                              </div>
                            )}
                            {/* Milestones as diamonds */}
                            {(project.milestones || []).map(m => {
                              if (!m.due_date) return null
                              const mBar = getBarStyle(m.due_date, m.due_date)
                              if (!mBar) return null
                              return (
                                <div
                                  key={m.milestone_id}
                                  className="absolute top-4 w-3 h-3 bg-amber-400 border-2 border-white shadow-sm transform rotate-45 z-10"
                                  style={{ left: mBar.left }}
                                  title={`${m.name} - ${new Date(m.due_date).toLocaleDateString('sv-SE')}`}
                                />
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {/* Bookings section */}
                  {bookings.length > 0 && (
                    <>
                      <div className="flex border-b border-gray-200 bg-gray-50">
                        <div className="w-52 flex-shrink-0 px-4 py-2 border-r border-gray-200">
                          <span className="text-xs font-medium text-gray-400 uppercase">Bokningar</span>
                        </div>
                        <div className="flex-1" />
                      </div>
                      {bookings.slice(0, 20).map(booking => {
                        const startDate = booking.scheduled_start?.split('T')[0]
                        const endDate = booking.scheduled_end?.split('T')[0] || startDate
                        if (!startDate) return null
                        const bar = getBarStyle(startDate, endDate)
                        if (!bar) return null
                        return (
                          <div key={booking.booking_id} className="flex border-b border-gray-100 hover:bg-gray-50/30">
                            <div className="w-52 flex-shrink-0 px-4 py-3 border-r border-gray-200">
                              <p className="text-sm text-gray-700 truncate">{booking.customer?.name || booking.notes || 'Bokning'}</p>
                              <p className="text-xs text-gray-400">{new Date(booking.scheduled_start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                            <div className="flex-1 relative py-3 px-1">
                              <div
                                className="absolute top-2 h-7 rounded-md bg-gradient-to-r from-emerald-400 to-teal-400 flex items-center px-2 text-[10px] text-white font-medium"
                                style={{ left: bar.left, width: bar.width, minWidth: '4px' }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </>
                  )}

                  {/* Today line */}
                  {(() => {
                    const todayBar = getBarStyle(todayStr, todayStr)
                    if (!todayBar) return null
                    return (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-20 pointer-events-none"
                        style={{ left: `calc(208px + (100% - 208px) * ${parseFloat(todayBar.left) / 100})` }}
                      />
                    )
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-3 rounded bg-gradient-to-r from-teal-600 to-teal-600" />
            Projekt
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-3 rounded bg-gradient-to-r from-emerald-400 to-teal-400" />
            Bokning
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-amber-400 transform rotate-45" />
            Delmål
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-0.5 h-4 bg-red-400" />
            Idag
          </div>
        </div>
      </div>
    </div>
  )
}
