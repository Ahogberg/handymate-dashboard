'use client'

import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Check,
  X,
  Loader2,
  ClipboardCheck,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import { PermissionGate } from '@/components/PermissionGate'
import Link from 'next/link'

interface PendingWeek {
  weekKey: string
  user: { id: string; name: string; color: string; email: string }
  weekNumber: number
  year: number
  entries: any[]
  totalMinutes: number
  billableMinutes: number
  overtimeMinutes: number
  revenue: number
  entryCount: number
}

export default function ApprovePage() {
  const business = useBusiness()
  const [weeks, setWeeks] = useState<PendingWeek[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false, message: '', type: 'success'
  })

  useEffect(() => {
    if (business.business_id) fetchPending()
  }, [business.business_id])

  async function fetchPending() {
    try {
      const res = await fetch('/api/time-reports/approve')
      if (res.ok) {
        const data = await res.json()
        setWeeks(data.pendingWeeks || [])
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  async function handleAction(week: PendingWeek, action: 'approve' | 'reject') {
    let reason = ''
    if (action === 'reject') {
      reason = prompt('Ange anledning till avslag:') || ''
      if (!reason) return
    }

    setActionLoading(week.weekKey)
    try {
      const entryIds = week.entries.map((e: any) => e.time_entry_id)
      const res = await fetch('/api/time-reports/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry_ids: entryIds,
          action,
          ...(reason ? { rejection_reason: reason } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      showToast(
        action === 'approve'
          ? `${data.count} poster godkända for ${week.user.name}`
          : `${data.count} poster avslagna`,
        'success'
      )
      fetchPending()
    } catch (err: any) {
      showToast(err.message || 'Något gick fel', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const fmtH = (mins: number) => {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    if (h === 0 && m === 0) return '0h'
    if (m === 0) return `${h}h`
    return `${h}h ${m}m`
  }

  return (
    <PermissionGate permission="approve_time">
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-100 border-emerald-200 text-emerald-600' : 'bg-red-100 border-red-200 text-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="relative">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/time"
            className="p-2 bg-white border border-gray-200 rounded-xl text-gray-500 hover:text-gray-900">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center">
            <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 mr-4">
              <ClipboardCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Att godkänna</h1>
              <p className="text-gray-500 text-sm">{weeks.length} veckorapport{weeks.length !== 1 ? 'er' : ''} väntar</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
          </div>
        ) : weeks.length === 0 ? (
          <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-12 text-center">
            <Check className="w-12 h-12 text-emerald-300 mx-auto mb-3" />
            <p className="text-gray-900 font-medium">Allt godkänt!</p>
            <p className="text-gray-500 text-sm mt-1">Inga veckorapporter väntar på godkännande</p>
          </div>
        ) : (
          <div className="space-y-4">
            {weeks.map(week => {
              const isExpanded = expanded === week.weekKey
              const isLoading = actionLoading === week.weekKey

              return (
                <div key={week.weekKey} className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
                  {/* Week header */}
                  <button
                    onClick={() => setExpanded(isExpanded ? null : week.weekKey)}
                    className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                        style={{ backgroundColor: week.user.color }}>
                        {week.user.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{week.user.name}</p>
                        <p className="text-xs text-gray-500">
                          Vecka {week.weekNumber}, {week.year} &middot; {week.entryCount} poster
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">{fmtH(week.totalMinutes)}</p>
                        {week.overtimeMinutes > 0 && (
                          <p className="text-xs text-orange-600 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {fmtH(week.overtimeMinutes)} övertid
                          </p>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Expanded entries */}
                  {isExpanded && (
                    <div className="border-t border-gray-100">
                      <div className="divide-y divide-gray-50">
                        {week.entries.map((entry: any) => (
                          <div key={entry.time_entry_id} className="px-4 py-2.5 flex items-center gap-3">
                            <span className="text-lg">
                              {({ work: '🔨', travel: '🚗', material_pickup: '📦', meeting: '👥', admin: '📋' } as Record<string, string>)[entry.work_category] || '🔨'}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900">{fmtH(entry.duration_minutes)}</span>
                                <span className="text-xs text-gray-500">{entry.work_date}</span>
                              </div>
                              {entry.description && (
                                <p className="text-xs text-gray-500 truncate">{entry.description}</p>
                              )}
                              {entry.customer?.name && (
                                <p className="text-xs text-gray-400">{entry.customer.name}</p>
                              )}
                            </div>
                            {entry.hourly_rate > 0 && (
                              <span className="text-xs text-gray-500">
                                {Math.round((entry.duration_minutes / 60) * entry.hourly_rate).toLocaleString('sv-SE')} kr
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="p-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleAction(week, 'reject')}
                      disabled={isLoading}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-red-200 rounded-xl text-red-600 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                      Avslå
                    </button>
                    <button
                      onClick={() => handleAction(week, 'approve')}
                      disabled={isLoading}
                      className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 rounded-xl text-white text-sm font-medium disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Godkänn
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
    </PermissionGate>
  )
}
