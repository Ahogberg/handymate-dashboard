'use client'

import { useEffect, useState } from 'react'
import {
  Bot,
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
  FileText,
  Receipt,
  Calendar,
  RefreshCw,
  AlertTriangle,
  Pencil,
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

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; bgColor: string; textColor: string }> = {
  send_sms: { label: 'SMS', icon: MessageSquare, bgColor: 'bg-blue-50', textColor: 'text-blue-600' },
  send_quote: { label: 'Offert', icon: FileText, bgColor: 'bg-teal-50', textColor: 'text-teal-600' },
  send_invoice: { label: 'Faktura', icon: Receipt, bgColor: 'bg-green-50', textColor: 'text-green-600' },
  create_booking: { label: 'Bokning', icon: Calendar, bgColor: 'bg-purple-50', textColor: 'text-purple-600' },
  other: { label: 'Övrigt', icon: Bot, bgColor: 'bg-gray-50', textColor: 'text-gray-600' },
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const hours = date.getHours().toString().padStart(2, '0')
  const mins = date.getMinutes().toString().padStart(2, '0')
  if (isToday) return `${hours}:${mins} idag`
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `${hours}:${mins} igår`
  return `${date.getDate()}/${date.getMonth() + 1} ${hours}:${mins}`
}

function timeUntilExpiry(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'Utgången'
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return `${Math.floor(diff / 60000)} min kvar`
  if (hours < 24) return `${hours} tim kvar`
  return `${Math.floor(hours / 24)} dag kvar`
}

function getRecipient(payload: Record<string, unknown>): string {
  if (payload.customer_name) return payload.customer_name as string
  if (payload.to) return payload.to as string
  if (payload.phone) return payload.phone as string
  return ''
}

function getMessagePreview(payload: Record<string, unknown>): string {
  if (payload.message) return payload.message as string
  if (payload.sms_text) return payload.sms_text as string
  if (payload.body) return payload.body as string
  return ''
}

export default function ApprovalsPage() {
  const business = useBusiness()
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'pending' | 'resolved'>('pending')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  useEffect(() => {
    if (!business?.business_id) return
    fetchApprovals()

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
      let query = supabase
        .from('pending_approvals')
        .select('*')
        .eq('business_id', business.business_id)
        .order('created_at', { ascending: false })
        .limit(50)

      if (activeTab === 'pending') {
        query = query.eq('status', 'pending')
      } else {
        query = query.in('status', ['approved', 'rejected', 'expired', 'auto_approved'])
      }

      const { data, error } = await query
      if (!error) setApprovals(data || [])
    } finally {
      setLoading(false)
    }
  }

  async function handleAction(id: string, action: 'approve' | 'reject', editedPayload?: Record<string, unknown>) {
    setActionLoading(id + action)
    try {
      const body: Record<string, unknown> = { action }
      if (editedPayload) body.edited_payload = editedPayload

      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/approvals/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setApprovals(prev => prev.filter(a => a.id !== id))
        setEditingId(null)
      }
    } finally {
      setActionLoading(null)
    }
  }

  function startEdit(approval: Approval) {
    const msg = getMessagePreview(approval.payload)
    setEditText(msg)
    setEditingId(approval.id)
  }

  function submitEdit(approval: Approval) {
    const editedPayload = { ...approval.payload }
    if (editedPayload.message !== undefined) editedPayload.message = editText
    else if (editedPayload.sms_text !== undefined) editedPayload.sms_text = editText
    else if (editedPayload.body !== undefined) editedPayload.body = editText
    handleAction(approval.id, 'approve', editedPayload)
  }

  const pendingCount = approvals.filter(a => a.status === 'pending').length

  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="px-4 sm:px-8 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
              <Bot className="w-5 h-5 text-teal-700" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Godkännanden</h1>
              <p className="text-sm text-gray-500">AI-agentens förslag som kräver din bekräftelse</p>
            </div>
          </div>
          <button
            onClick={fetchApprovals}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 sm:px-8 pb-4">
        <div className="flex gap-1 p-1 bg-white rounded-xl border border-gray-200">
          {(['pending', 'resolved'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab
                  ? 'bg-teal-50 text-teal-700 border border-teal-200'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {tab === 'pending' ? (
                <span className="flex items-center justify-center gap-2">
                  Väntande
                  {pendingCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
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
      </div>

      {/* Content */}
      <div className="px-4 sm:px-8 pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : approvals.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-teal-600" />
            </div>
            <p className="text-gray-900 font-medium text-lg mb-1">
              {activeTab === 'pending' ? 'Inget att godkänna' : 'Inga hanterade ännu'}
            </p>
            <p className="text-gray-500 text-sm">
              {activeTab === 'pending'
                ? 'AI-agenten har inga förslag som väntar på din bekräftelse just nu.'
                : 'Hanterade godkännanden visas här.'}
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
              const recipient = getRecipient(approval.payload)
              const messagePreview = getMessagePreview(approval.payload)
              const isEditing = editingId === approval.id

              return (
                <div
                  key={approval.id}
                  className={`bg-white border rounded-xl transition-all ${
                    approval.status === 'pending'
                      ? 'border-gray-200 shadow-sm'
                      : 'border-gray-100 opacity-75'
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${config.bgColor}`}>
                        <Icon className={`w-4 h-4 ${config.textColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${config.bgColor} ${config.textColor}`}>
                            {config.label}
                          </span>
                          {isExpiringSoon && (
                            <span className="flex items-center gap-1 text-xs text-amber-600">
                              <AlertTriangle className="w-3 h-3" />
                              {timeUntilExpiry(approval.expires_at)}
                            </span>
                          )}
                          {approval.status !== 'pending' && (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              approval.status === 'approved'
                                ? 'bg-green-50 text-green-700'
                                : approval.status === 'rejected'
                                ? 'bg-red-50 text-red-700'
                                : approval.status === 'auto_approved'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}>
                              {approval.status === 'approved' ? 'Godkänd' :
                               approval.status === 'rejected' ? 'Avvisad' :
                               approval.status === 'auto_approved' ? 'Auto-utförd' :
                               'Utgången'}
                            </span>
                          )}
                          <span className="text-xs text-gray-400 ml-auto">{formatTime(approval.created_at)}</span>
                        </div>
                        <p className="text-gray-900 font-medium mt-1.5">{approval.title}</p>
                        {recipient && (
                          <p className="text-sm text-gray-500 mt-0.5">Till: {recipient}</p>
                        )}
                        {approval.description && (
                          <p className="text-sm text-gray-500 mt-1">{approval.description}</p>
                        )}
                        {messagePreview && !isEditing && (
                          <div className="mt-2 px-3 py-2 bg-gray-50 rounded-lg border-l-2 border-gray-200">
                            <p className="text-sm text-gray-600 italic line-clamp-3">"{messagePreview}"</p>
                          </div>
                        )}
                        {isEditing && (
                          <div className="mt-2">
                            <textarea
                              value={editText}
                              onChange={e => setEditText(e.target.value)}
                              rows={4}
                              className="w-full px-3 py-2 border border-teal-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {approval.status === 'pending' && (
                    <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => submitEdit(approval)}
                            disabled={actionLoading !== null}
                            className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Godkänn med ändringar
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-all"
                          >
                            Avbryt
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleAction(approval.id, 'approve')}
                            disabled={actionLoading !== null}
                            className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all"
                          >
                            <CheckCircle className="w-4 h-4" />
                            {actionLoading === approval.id + 'approve' ? 'Godkänner...' : 'Godkänn'}
                          </button>
                          {messagePreview && (
                            <button
                              onClick={() => startEdit(approval)}
                              className="flex items-center gap-2 px-3 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-all"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Redigera
                            </button>
                          )}
                          <button
                            onClick={() => handleAction(approval.id, 'reject')}
                            disabled={actionLoading !== null}
                            className="flex items-center gap-2 px-3 py-2 border border-gray-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-gray-700 text-sm font-medium rounded-lg transition-all"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            {actionLoading === approval.id + 'reject' ? 'Avvisar...' : 'Avvisa'}
                          </button>
                          <span className="ml-auto flex items-center gap-1 text-xs text-gray-400">
                            <Clock className="w-3 h-3" />
                            {timeUntilExpiry(approval.expires_at)}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
