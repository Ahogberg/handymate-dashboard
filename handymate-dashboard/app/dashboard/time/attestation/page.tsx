'use client'

import { useEffect, useState } from 'react'
import { useBusiness } from '@/lib/BusinessContext'
import { supabase } from '@/lib/supabase'
import {
  CheckCircle,
  XCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Clock,
  ArrowLeft,
} from 'lucide-react'
import Link from 'next/link'

interface Checkin {
  id: string
  user_id: string
  user_name: string | null
  project_id: string | null
  project_name: string | null
  checked_in_at: string
  checked_out_at: string | null
  duration_minutes: number | null
  lat_in: number | null
  lng_in: number | null
  status: string
  approved_by: string | null
  note: string | null
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}min`
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })
}

function getWeekNumber(d: Date): number {
  const oneJan = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7)
}

function getWeekRange(date: Date): { start: Date; end: Date } {
  const d = new Date(date)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  d.setHours(0, 0, 0, 0)
  const start = new Date(d)
  const end = new Date(d)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

export default function AttestationPage() {
  const business = useBusiness()
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [loading, setLoading] = useState(true)
  const [weekOffset, setWeekOffset] = useState(0)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const currentWeekDate = new Date()
  currentWeekDate.setDate(currentWeekDate.getDate() + weekOffset * 7)
  const { start: weekStart, end: weekEnd } = getWeekRange(currentWeekDate)
  const weekNum = getWeekNumber(weekStart)

  useEffect(() => {
    if (business.business_id) fetchCheckins()
  }, [business.business_id, weekOffset])

  async function fetchCheckins() {
    setLoading(true)
    const { data } = await supabase
      .from('time_checkins')
      .select('*')
      .eq('business_id', business.business_id)
      .gte('checked_in_at', weekStart.toISOString())
      .lte('checked_in_at', weekEnd.toISOString())
      .order('checked_in_at', { ascending: false })

    setCheckins(data || [])
    setLoading(false)
  }

  async function handleApprove(checkin: Checkin) {
    setActionLoading(checkin.id)
    try {
      await fetch('/api/checkin/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkin_id: checkin.id,
          action: 'approve',
          adjusted_minutes: checkin.duration_minutes,
        }),
      })
      fetchCheckins()
    } catch { /* silent */ }
    setActionLoading(null)
  }

  async function handleReject(checkin: Checkin) {
    setActionLoading(checkin.id)
    try {
      await fetch('/api/checkin/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkin_id: checkin.id, action: 'reject' }),
      })
      fetchCheckins()
    } catch { /* silent */ }
    setActionLoading(null)
  }

  async function approveAll() {
    const pending = checkins.filter(c => c.status === 'completed')
    for (const c of pending) {
      await handleApprove(c)
    }
  }

  const pending = checkins.filter(c => c.status === 'completed')
  const approved = checkins.filter(c => c.status === 'approved')
  const rejected = checkins.filter(c => c.status === 'rejected')

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/time" className="text-gray-400 hover:text-gray-900 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attestering</h1>
          <p className="text-gray-500 text-sm">Godkänn teamets incheckade timmar</p>
        </div>
      </div>

      {/* Week nav */}
      <div className="flex items-center justify-between bg-white border border-[#E2E8F0] rounded-xl px-4 py-3 mb-6">
        <button onClick={() => setWeekOffset(w => w - 1)} className="p-1 text-gray-400 hover:text-gray-900">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-900">Vecka {weekNum}</p>
          <p className="text-xs text-gray-500">
            {weekStart.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} — {weekEnd.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
          </p>
        </div>
        <button
          onClick={() => setWeekOffset(w => w + 1)}
          disabled={weekOffset >= 0}
          className="p-1 text-gray-400 hover:text-gray-900 disabled:opacity-30"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pending */}
          {pending.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                  Oattesterade ({pending.length})
                </h2>
                {pending.length > 1 && (
                  <button
                    onClick={approveAll}
                    className="text-xs font-medium text-primary-700 hover:underline"
                  >
                    Attestera alla
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {pending.map(c => (
                  <CheckinRow
                    key={c.id}
                    checkin={c}
                    onApprove={() => handleApprove(c)}
                    onReject={() => handleReject(c)}
                    loading={actionLoading === c.id}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Approved */}
          {approved.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">
                Attesterade ({approved.length})
              </h2>
              <div className="space-y-2">
                {approved.map(c => (
                  <CheckinRow key={c.id} checkin={c} done />
                ))}
              </div>
            </div>
          )}

          {/* Rejected */}
          {rejected.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Avvisade ({rejected.length})
              </h2>
              <div className="space-y-2 opacity-60">
                {rejected.map(c => (
                  <CheckinRow key={c.id} checkin={c} done rejected />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {checkins.length === 0 && (
            <div className="text-center py-16">
              <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Inga incheckningar denna vecka</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CheckinRow({
  checkin,
  onApprove,
  onReject,
  loading,
  done,
  rejected,
}: {
  checkin: Checkin
  onApprove?: () => void
  onReject?: () => void
  loading?: boolean
  done?: boolean
  rejected?: boolean
}) {
  return (
    <div className={`flex items-center gap-3 bg-white border rounded-xl px-4 py-3 ${
      rejected ? 'border-red-200' : done ? 'border-gray-100' : 'border-gray-200'
    }`}>
      {/* User avatar */}
      <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center text-xs font-semibold text-primary-700 shrink-0">
        {(checkin.user_name || '??').slice(0, 2).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900 truncate">{checkin.user_name || 'Okänd'}</p>
          <span className="text-xs text-gray-400">{formatDate(checkin.checked_in_at)}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
          <span>{formatDuration(checkin.duration_minutes)}</span>
          {checkin.project_name && <span>· {checkin.project_name}</span>}
          {checkin.lat_in && (
            <span className="flex items-center gap-0.5 text-green-600">
              <MapPin className="w-3 h-3" />
              GPS
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      {!done && onApprove && onReject && (
        <div className="flex gap-1 shrink-0">
          <button
            onClick={onApprove}
            disabled={loading}
            className="p-2 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors disabled:opacity-50"
            title="Attestera"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          </button>
          <button
            onClick={onReject}
            disabled={loading}
            className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
            title="Avvisa"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Done indicator */}
      {done && !rejected && (
        <CheckCircle className="w-5 h-5 text-primary-600 shrink-0" />
      )}
      {rejected && (
        <XCircle className="w-5 h-5 text-red-400 shrink-0" />
      )}
    </div>
  )
}
