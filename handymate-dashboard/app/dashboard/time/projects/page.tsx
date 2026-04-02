'use client'

import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  BarChart3,
  Loader2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Clock,
} from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'

interface ProjectComparison {
  project_id: string
  name: string
  status: string
  customer: { customer_id: string; name: string } | null
  budget: { hours: number; labor: number; material: number; total: number }
  actual: { hours: number; billableHours: number; revenue: number; travelKm: number; travelCost: number; categories: Record<string, number> }
  variance: { hours: number; hoursPercent: number; margin: number; marginPercent: number }
}

export default function ProjectComparisonPage() {
  const business = useBusiness()
  const [projects, setProjects] = useState<ProjectComparison[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('active')

  useEffect(() => {
    if (business.business_id) fetchData()
  }, [business.business_id, statusFilter])

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetch(`/api/time-reports/project-comparison?status=${statusFilter}`)
      if (res.ok) {
        const data = await res.json()
        setProjects(data.projects || [])
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  const fmtH = (hours: number) => {
    if (hours === 0) return '–'
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    if (m === 0) return `${h}h`
    return `${h}h ${m}m`
  }

  const fmtKr = (amount: number) => Math.round(amount).toLocaleString('sv-SE') + ' kr'

  const getProgressColor = (percent: number) => {
    if (percent <= 75) return 'bg-emerald-500'
    if (percent <= 100) return 'bg-primary-700'
    if (percent <= 120) return 'bg-orange-500'
    return 'bg-red-500'
  }

  const getMarginColor = (percent: number) => {
    if (percent >= 30) return 'text-emerald-600'
    if (percent >= 10) return 'text-sky-700'
    if (percent >= 0) return 'text-orange-600'
    return 'text-red-600'
  }

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-primary-50 rounded-full blur-[128px]" />
      </div>

      <div className="relative">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/time"
            className="p-2 bg-white border border-gray-200 rounded-xl text-gray-500 hover:text-gray-900">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center">
            <div className="p-3 rounded-xl bg-primary-700 mr-4">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Projekt-jämförelse</h1>
              <p className="text-gray-500 text-sm">Rapporterad tid vs offerterad tid</p>
            </div>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-6">
          {[
            { value: 'active', label: 'Aktiva' },
            { value: 'planning', label: 'Planering' },
            { value: 'completed', label: 'Avslutade' },
            { value: 'all', label: 'Alla' },
          ].map(opt => (
            <button key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                statusFilter === opt.value
                  ? 'bg-primary-100 text-primary-700 border border-primary-300'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-12 text-center">
            <BarChart3 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Inga projekt att visa</p>
          </div>
        ) : (
          <div className="space-y-4">
            {projects.map(proj => (
              <div key={proj.project_id} className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
                {/* Project header */}
                <div className="p-4 border-b border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{proj.name}</h3>
                      <p className="text-xs text-gray-500">
                        {proj.customer?.name || 'Ingen kund'}
                        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                          proj.status === 'active' ? 'bg-emerald-50 text-emerald-600' :
                          proj.status === 'completed' ? 'bg-primary-50 text-sky-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{proj.status}</span>
                      </p>
                    </div>
                    {proj.budget.total > 0 && (
                      <div className="text-right">
                        <p className={`text-lg font-bold ${getMarginColor(proj.variance.marginPercent)}`}>
                          {proj.variance.marginPercent > 0 ? '+' : ''}{proj.variance.marginPercent}%
                        </p>
                        <p className="text-xs text-gray-500">marginal</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Time progress */}
                <div className="p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-gray-500">Offererat</p>
                      <p className="text-sm font-bold text-gray-900">{proj.budget.hours > 0 ? fmtH(proj.budget.hours) : '–'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Rapporterat</p>
                      <p className="text-sm font-bold text-gray-900">{fmtH(proj.actual.hours)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Avvikelse</p>
                      <p className={`text-sm font-bold flex items-center gap-1 ${
                        proj.variance.hours > 0 ? 'text-red-600' : proj.variance.hours < 0 ? 'text-emerald-600' : 'text-gray-500'
                      }`}>
                        {proj.variance.hours > 0 ? (
                          <><TrendingUp className="w-3.5 h-3.5" /> +{fmtH(proj.variance.hours)}</>
                        ) : proj.variance.hours < 0 ? (
                          <><TrendingDown className="w-3.5 h-3.5" /> {fmtH(Math.abs(proj.variance.hours))}</>
                        ) : '–'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Marginal</p>
                      <p className={`text-sm font-bold ${getMarginColor(proj.variance.marginPercent)}`}>
                        {proj.budget.total > 0 ? fmtKr(proj.variance.margin) : '–'}
                      </p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {proj.budget.hours > 0 && (
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>{proj.variance.hoursPercent}% av budget</span>
                        <span>{fmtH(proj.actual.hours)} / {fmtH(proj.budget.hours)}</span>
                      </div>
                      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${getProgressColor(proj.variance.hoursPercent)}`}
                          style={{ width: `${Math.min(100, proj.variance.hoursPercent)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Warning */}
                  {proj.variance.hoursPercent > 100 && (
                    <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-2">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      Projektet har överskridit budgeterad tid med {fmtH(proj.variance.hours)}
                    </div>
                  )}

                  {/* Budget breakdown */}
                  {proj.budget.total > 0 && (
                    <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-gray-100">
                      <div className="text-center">
                        <p className="text-xs text-gray-500">Budget</p>
                        <p className="text-sm font-medium text-gray-900">{fmtKr(proj.budget.total)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-500">Arbetskostnad</p>
                        <p className="text-sm font-medium text-gray-900">{fmtKr(proj.actual.revenue)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-500">Resor</p>
                        <p className="text-sm font-medium text-gray-900">
                          {proj.actual.travelKm > 0 ? `${proj.actual.travelKm} km (${fmtKr(proj.actual.travelCost)})` : '–'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
