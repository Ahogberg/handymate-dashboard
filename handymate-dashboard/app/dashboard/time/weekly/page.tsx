'use client'

import { useEffect, useState } from 'react'
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Users,
  TrendingUp,
  Car,
  ArrowLeft,
} from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import { format, addWeeks, subWeeks, startOfWeek } from 'date-fns'
import { sv } from 'date-fns/locale'
import Link from 'next/link'

interface DayData {
  date: string
  minutes: number
  billable: number
  overtime: number
  entries: number
  categories: Record<string, number>
}

interface Employee {
  user: { id: string; name: string; color: string }
  daysArray: DayData[]
  totalMinutes: number
  billableMinutes: number
  overtimeMinutes: number
  totalEntries: number
  revenue: number
  travelKm: number
  travelAmount: number
  allowanceAmount: number
}

interface WeekData {
  week: { start: string; end: string; dates: string[] }
  employees: Employee[]
  totals: {
    minutes: number
    billable: number
    overtime: number
    revenue: number
    travelKm: number
    travelAmount: number
  }
  config: { dailyLimit: number; weeklyLimit: number }
}

const DAY_NAMES = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön']

export default function WeeklyReportPage() {
  const business = useBusiness()
  const [currentWeek, setCurrentWeek] = useState(new Date())
  const [data, setData] = useState<WeekData | null>(null)
  const [loading, setLoading] = useState(true)

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 })

  useEffect(() => {
    if (business.business_id) fetchWeekly()
  }, [business.business_id, currentWeek])

  async function fetchWeekly() {
    setLoading(true)
    try {
      const ws = format(weekStart, 'yyyy-MM-dd')
      const res = await fetch(`/api/time-reports/weekly?week=${ws}`)
      if (res.ok) {
        setData(await res.json())
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  const fmtH = (mins: number) => {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    if (h === 0 && m === 0) return '–'
    if (m === 0) return `${h}h`
    return `${h}h ${m}m`
  }

  const getDayColor = (day: DayData, dailyLimit: number) => {
    if (day.minutes === 0) return 'bg-gray-50 text-gray-400'
    if (day.overtime > 0) return 'bg-orange-50 text-orange-700 border-orange-200'
    if (day.minutes >= dailyLimit * 60) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    return 'bg-blue-50 text-blue-700 border-blue-200'
  }

  const getWeekNumber = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 3)
    const yearStart = new Date(d.getFullYear(), 0, 1)
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  }

  if (loading && !data) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]" />
      </div>

      <div className="relative">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/time"
            className="p-2 bg-white border border-gray-200 rounded-xl text-gray-500 hover:text-gray-900">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 mr-4">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Veckorapport</h1>
              <p className="text-gray-500 text-sm">Översikt per medarbetare</p>
            </div>
          </div>
        </div>

        {/* Week Nav */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
            className="p-2 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-gray-900">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setCurrentWeek(new Date())}
            className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm font-medium hover:border-blue-300 min-w-[200px] text-center">
            V{getWeekNumber()} &middot; {format(weekStart, 'd MMM', { locale: sv })} – {format(new Date(weekStart.getTime() + 6 * 86400000), 'd MMM yyyy', { locale: sv })}
          </button>
          <button onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
            className="p-2 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-gray-900">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Totaler */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            <div className="bg-white shadow-sm rounded-xl p-4 border border-gray-200">
              <p className="text-xs text-gray-500">Total tid</p>
              <p className="text-xl font-bold text-gray-900">{fmtH(data.totals.minutes)}</p>
            </div>
            <div className="bg-white shadow-sm rounded-xl p-4 border border-gray-200">
              <p className="text-xs text-gray-500">Fakturerbar</p>
              <p className="text-xl font-bold text-emerald-600">{fmtH(data.totals.billable)}</p>
            </div>
            <div className="bg-white shadow-sm rounded-xl p-4 border border-gray-200">
              <p className="text-xs text-gray-500">Övertid</p>
              <p className={`text-xl font-bold ${data.totals.overtime > 0 ? 'text-orange-600' : 'text-gray-900'}`}>{fmtH(data.totals.overtime)}</p>
            </div>
            <div className="bg-white shadow-sm rounded-xl p-4 border border-gray-200">
              <p className="text-xs text-gray-500">Intäkter</p>
              <p className="text-xl font-bold text-gray-900">{Math.round(data.totals.revenue).toLocaleString('sv-SE')} kr</p>
            </div>
            <div className="bg-white shadow-sm rounded-xl p-4 border border-gray-200">
              <p className="text-xs text-gray-500">Resor</p>
              <p className="text-xl font-bold text-gray-900">{data.totals.travelKm.toFixed(0)} km</p>
            </div>
          </div>
        )}

        {/* Per-person grid */}
        {data && data.employees.length > 0 ? (
          <div className="space-y-4">
            {data.employees.map(emp => (
              <div key={emp.user.id} className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
                {/* Person header */}
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                      style={{ backgroundColor: emp.user.color }}>
                      {emp.user.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{emp.user.name}</p>
                      <p className="text-xs text-gray-500">
                        {fmtH(emp.totalMinutes)} total
                        {emp.overtimeMinutes > 0 && ` · ${fmtH(emp.overtimeMinutes)} övertid`}
                        {emp.travelKm > 0 && ` · ${emp.travelKm.toFixed(0)} km resa`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{Math.round(emp.revenue).toLocaleString('sv-SE')} kr</p>
                    <p className="text-xs text-gray-500">{emp.totalEntries} poster</p>
                  </div>
                </div>

                {/* Day grid */}
                <div className="grid grid-cols-7 divide-x divide-gray-100">
                  {emp.daysArray.map((day, i) => {
                    const isToday = day.date === format(new Date(), 'yyyy-MM-dd')
                    return (
                      <div
                        key={day.date}
                        className={`p-3 text-center ${isToday ? 'ring-2 ring-inset ring-blue-400' : ''}`}
                      >
                        <p className={`text-xs font-medium mb-1 ${isToday ? 'text-blue-600' : 'text-gray-500'}`}>
                          {DAY_NAMES[i]}
                        </p>
                        <div className={`rounded-lg p-2 border ${getDayColor(day, data!.config.dailyLimit)}`}>
                          <p className="text-sm font-bold">{day.minutes > 0 ? fmtH(day.minutes) : '–'}</p>
                          {day.overtime > 0 && (
                            <p className="text-xs text-orange-600 mt-0.5">+{fmtH(day.overtime)} ÖT</p>
                          )}
                        </div>
                        {day.entries > 0 && (
                          <p className="text-xs text-gray-400 mt-1">{day.entries} post{day.entries > 1 ? 'er' : ''}</p>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Travel + allowance summary */}
                {(emp.travelKm > 0 || emp.allowanceAmount > 0) && (
                  <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
                    {emp.travelKm > 0 && (
                      <span className="flex items-center gap-1">
                        <Car className="w-3.5 h-3.5" />
                        {emp.travelKm.toFixed(1)} km · {Math.round(emp.travelAmount).toLocaleString('sv-SE')} kr
                      </span>
                    )}
                    {emp.allowanceAmount > 0 && (
                      <span>Traktamente: {Math.round(emp.allowanceAmount).toLocaleString('sv-SE')} kr</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-12 text-center">
            <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Inga tidposter denna vecka</p>
          </div>
        )}
      </div>
    </div>
  )
}
