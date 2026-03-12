'use client'

import { useEffect, useState } from 'react'
import {
  ClipboardCheck,
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
  FileText,
  Receipt,
  Calendar,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'

interface Approval {
  id: string
  business_id: string
  approval_type: string
  title: string
  description: string | null
  payload: Record<string, unknown>
  status: string
  risk_level: string | null
  created_at: string
  expires_at: string
  resolved_at: string | null
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  send_sms: { label: 'Skicka SMS', icon: MessageSquare, color: 'text-blue-400' },
  send_quote: { label: 'Skicka offert', icon: FileText, color: 'text-teal-400' },
  send_invoice: { label: 'Skicka faktura', icon: Receipt, color: 'text-green-400' },
  create_booking: { label: 'Skapa bokning', icon: Calendar, color: 'text-purple-400' },
  other: { label: 'Övrigt', icon: ClipboardCheck, color: 'text-zinc-400' },
}

function timeUntilExpiry(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'Utgången'
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return `${Math.floor(diff / 60000)} min kvar`
  if (hours < 24) return `${hours} tim kvar`
  return `${Math.floor(hours / 24)} dag kvar`
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just nu'
  if (mins < 60) return `${mins} min sedan`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} tim sedan`
  return `${Math.floor(hours / 24)} dag sedan`
}

export default function ApprovalsPage() {
  const business = useBusiness()
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'pending' | 'resolved'>('pending')

  useEffect(() => {
    if (!business?.business_id) return
    fetchApprovals()

    // Realtime subscription
    const channel = supabase
      .channel('approvals_page')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pending_approvals',
          filter: `business_id=eq.${business.business_id}`,
        },
        () => { fetchApprovals() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [business?.business_id, activeTab])

  async function fetchApprovals() {
    if (!business?.business_id) return
    setLoading(true)
    try {
      const status = activeTab === 'pending' ? 'pending' : undefined
      let query = supabase
        .from('pending_approvals')
        .select('*')
        .eq('business_id', business.business_id)
        .order('created_at', { ascending: false })
        .limit(50)

      if (status) {
        query = query.eq('status', status)
      } else {
        query = query.in('status', ['approved', 'rejected', 'expired', 'auto_approved'])
      }

      const { data, error } = await query
      if (!error) setApprovals(data || [])
    } finally {
      setLoading(false)
    }
  }

  async function handleAction(id: string, action: 'approve' | 'reject') {
    setActionLoading(id + action)
    try {
      const res = await fetch(`/api/approvals/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) {
        setApprovals(prev => prev.filter(a => a.id !== id))
      }
    } finally {
      setActionLoading(null)
    }
  }

  const pendingCount = approvals.filter(a => a.status === 'pending').length

  return (
    <div className="p-4 sm:p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center">
            <ClipboardCheck className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Godkännanden</h1>
            <p className="text-sm text-zinc-400">AI-agentens förslag som kräver din bekräftelse</p>
          </div>
        </div>
        <button
          onClick={fetchApprovals}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-zinc-900 rounded-xl p-1">
        {(['pending', 'resolved'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {tab === 'pending' ? (
              <span className="flex items-center justify-center gap-2">
                Väntande
                {pendingCount > 0 && (
                  <span className="bg-orange-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                    {pendingCount}
                  </span>
                )}
              </span>
            ) : (
              'Hanterade'
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 text-zinc-500 animate-spin" />
        </div>
      ) : approvals.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardCheck className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400">
            {activeTab === 'pending' ? 'Inga väntande godkännanden' : 'Inga hanterade ännu'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map(approval => {
            const config = TYPE_CONFIG[approval.approval_type] || TYPE_CONFIG.other
            const Icon = config.icon
            const isExpiringSoon =
              approval.status === 'pending' &&
              new Date(approval.expires_at).getTime() - Date.now() < 3600000

            return (
              <div
                key={approval.id}
                className={`bg-zinc-900 border rounded-xl p-4 transition-all ${
                  approval.status === 'pending'
                    ? 'border-zinc-700'
                    : 'border-zinc-800 opacity-70'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex-shrink-0 ${config.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                        {config.label}
                      </span>
                      {isExpiringSoon && (
                        <span className="flex items-center gap-1 text-xs text-amber-400">
                          <AlertTriangle className="w-3 h-3" />
                          {timeUntilExpiry(approval.expires_at)}
                        </span>
                      )}
                      {approval.status !== 'pending' && (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          approval.status === 'approved'
                            ? 'bg-green-500/20 text-green-400'
                            : approval.status === 'rejected'
                            ? 'bg-red-500/20 text-red-400'
                            : approval.status === 'auto_approved'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-zinc-700 text-zinc-400'
                        }`}>
                          {approval.status === 'approved' ? 'Godkänd' :
                           approval.status === 'rejected' ? 'Avvisad' :
                           approval.status === 'auto_approved' ? 'Auto-utförd' :
                           'Utgången'}
                        </span>
                      )}
                    </div>
                    <p className="text-white font-medium mt-1">{approval.title}</p>
                    {approval.description && (
                      <p className="text-sm text-zinc-400 mt-1">{approval.description}</p>
                    )}
                    <p className="text-xs text-zinc-600 mt-2">{timeAgo(approval.created_at)}</p>
                  </div>
                </div>

                {approval.status === 'pending' && (
                  <div className="flex gap-2 mt-4 pt-3 border-t border-zinc-800">
                    <button
                      onClick={() => handleAction(approval.id, 'approve')}
                      disabled={actionLoading !== null}
                      className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all"
                    >
                      <CheckCircle className="w-4 h-4" />
                      {actionLoading === approval.id + 'approve' ? 'Godkänner...' : 'Godkänn'}
                    </button>
                    <button
                      onClick={() => handleAction(approval.id, 'reject')}
                      disabled={actionLoading !== null}
                      className="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all"
                    >
                      <XCircle className="w-4 h-4" />
                      {actionLoading === approval.id + 'reject' ? 'Avvisar...' : 'Avvisa'}
                    </button>
                    <span className="ml-auto flex items-center gap-1 text-xs text-zinc-500">
                      <Clock className="w-3 h-3" />
                      {timeUntilExpiry(approval.expires_at)}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
