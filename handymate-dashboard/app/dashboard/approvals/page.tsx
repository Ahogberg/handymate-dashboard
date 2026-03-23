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
  Zap,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Package,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'

// Agent avatar lookup
const AVATAR_BASE = 'https://pktaqedooyzgvzwipslu.supabase.co/storage/v1/object/sign/team-avatars'
const AGENT_INFO: Record<string, { name: string; role: string; color: string; initials: string }> = {
  matte: { name: 'Matte', role: 'Chefsassistent', color: 'bg-teal-600', initials: 'M' },
  karin: { name: 'Karin', role: 'Ekonom', color: 'bg-blue-600', initials: 'K' },
  hanna: { name: 'Hanna', role: 'Marknadschef', color: 'bg-purple-600', initials: 'H' },
  daniel: { name: 'Daniel', role: 'Säljare', color: 'bg-amber-600', initials: 'D' },
  lars: { name: 'Lars', role: 'Projektledare', color: 'bg-emerald-600', initials: 'L' },
  lisa: { name: 'Lisa', role: 'Kundservice', color: 'bg-sky-500', initials: 'Li' },
}

function getAgentFromApproval(approval: Approval): { name: string; role: string; color: string; initials: string } | null {
  const agentId = (approval.payload?.agent_id as string) || null
  if (agentId && AGENT_INFO[agentId]) return AGENT_INFO[agentId]

  // Infer from approval_type
  const type = approval.approval_type
  if (type.includes('invoice') || type.includes('payment') || type === 'profitability_warning') return AGENT_INFO.karin
  if (type.includes('campaign') || type.includes('neighbour') || type.includes('reactivat')) return AGENT_INFO.hanna
  if (type.includes('quote') || type.includes('lead') || type.includes('pipeline')) return AGENT_INFO.daniel
  if (type.includes('booking') || type.includes('project') || type.includes('dispatch') || type.includes('job_report') || type.includes('warranty')) return AGENT_INFO.lars
  if (type.includes('call') || type.includes('sms')) return AGENT_INFO.lisa
  return null
}

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
  package_id?: string | null
  package_type?: string | null
  package_data?: {
    quote_id?: string
    customer_id?: string
    project_id?: string
    customer_name?: string
    customer_phone?: string
    actions?: Array<{
      id: string
      type: string
      title: string
      description: string
      data: Record<string, unknown>
    }>
  } | null
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; bgColor: string; textColor: string }> = {
  send_sms: { label: 'SMS', icon: MessageSquare, bgColor: 'bg-blue-50', textColor: 'text-blue-600' },
  send_quote: { label: 'Offert', icon: FileText, bgColor: 'bg-teal-50', textColor: 'text-teal-600' },
  send_invoice: { label: 'Faktura', icon: Receipt, bgColor: 'bg-green-50', textColor: 'text-green-600' },
  create_booking: { label: 'Bokning', icon: Calendar, bgColor: 'bg-purple-50', textColor: 'text-purple-600' },
  autopilot_package: { label: 'Autopilot', icon: Zap, bgColor: 'bg-amber-50', textColor: 'text-amber-600' },
  quote_nudge: { label: 'Nudge', icon: MessageSquare, bgColor: 'bg-amber-50', textColor: 'text-amber-600' },
  low_stock_alert: { label: 'Lager', icon: Package, bgColor: 'bg-red-50', textColor: 'text-red-600' },
  seasonal_campaign: { label: 'Säsong', icon: Calendar, bgColor: 'bg-orange-50', textColor: 'text-orange-600' },
  time_attestation: { label: 'Tid', icon: Clock, bgColor: 'bg-sky-50', textColor: 'text-sky-600' },
  create_invoice_from_report: { label: 'Faktura', icon: Receipt, bgColor: 'bg-green-50', textColor: 'text-green-600' },
  dispatch_suggestion: { label: 'Tilldelning', icon: Zap, bgColor: 'bg-violet-50', textColor: 'text-violet-600' },
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
  const [expandedPackage, setExpandedPackage] = useState<string | null>(null)
  const [rejectedActions, setRejectedActions] = useState<Record<string, Set<string>>>({})

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

  async function handleAutopilotApprove(approval: Approval, rejectIds?: string[]) {
    setActionLoading(approval.id + 'approve')
    try {
      const overrides: Record<string, string> = {}
      if (rejectIds) {
        for (const id of rejectIds) {
          overrides[id] = 'rejected'
        }
      }

      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/approvals/${approval.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          action: 'approve',
          action_overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
        }),
      })
      if (res.ok) {
        setApprovals(prev => prev.filter(a => a.id !== approval.id))
        setExpandedPackage(null)
      }
    } finally {
      setActionLoading(null)
    }
  }

  function toggleActionRejected(approvalId: string, actionId: string) {
    setRejectedActions(prev => {
      const set = new Set(prev[approvalId] || [])
      if (set.has(actionId)) set.delete(actionId)
      else set.add(actionId)
      return { ...prev, [approvalId]: set }
    })
  }

  const ACTION_ICONS: Record<string, React.ElementType> = {
    project_info: FolderOpen,
    booking_suggestion: Calendar,
    customer_sms: MessageSquare,
    material_list: Package,
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
              // Autopilot-paket — specialvy
              if (approval.approval_type === 'autopilot_package' && approval.package_data?.actions) {
                const pkgActions = approval.package_data.actions
                const isExpanded = expandedPackage === approval.id
                const rejectedSet = rejectedActions[approval.id] || new Set<string>()
                const pendingActions = pkgActions.filter(a => a.type !== 'project_info')
                const activeCount = pendingActions.filter(a => !rejectedSet.has(a.id)).length

                return (
                  <div key={approval.id} className={`border-2 rounded-xl transition-all ${
                    approval.status === 'pending' ? 'border-teal-200 bg-teal-50/30' : 'border-gray-100 opacity-75'
                  }`}>
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">🤖</span>
                            <span className="font-semibold text-gray-900">{approval.title}</span>
                          </div>
                          <p className="text-sm text-gray-500">{approval.package_data.customer_name} · {approval.description}</p>
                        </div>
                        {approval.status === 'pending' && (
                          <span className="text-xs bg-teal-100 text-teal-700 px-2 py-1 rounded-full font-medium">
                            {activeCount} förslag
                          </span>
                        )}
                        {approval.status !== 'pending' && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            approval.status === 'approved' ? 'bg-green-50 text-green-700' :
                            approval.status === 'rejected' ? 'bg-red-50 text-red-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {approval.status === 'approved' ? 'Godkänd' : approval.status === 'rejected' ? 'Avvisad' : 'Utgången'}
                          </span>
                        )}
                      </div>

                      <div className="space-y-2 mb-4">
                        {pkgActions.map(act => {
                          const ActIcon = ACTION_ICONS[act.type] || Zap
                          const isDone = act.type === 'project_info'
                          const isRejected = rejectedSet.has(act.id)

                          return (
                            <div key={act.id} className={`flex items-center gap-3 p-3 rounded-lg ${
                              isDone ? 'bg-green-50 border border-green-200' :
                              isRejected ? 'bg-gray-50 border border-gray-200 opacity-50' :
                              'bg-white border border-gray-200'
                            }`}>
                              <ActIcon className={`w-4 h-4 flex-shrink-0 ${isDone ? 'text-green-600' : isRejected ? 'text-gray-400' : 'text-teal-600'}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900">{act.title}</p>
                                <p className="text-xs text-gray-500 truncate">{act.description}</p>
                              </div>
                              {isDone && <span className="text-green-600 text-xs font-medium">✓ Klar</span>}
                              {!isDone && approval.status === 'pending' && (
                                <span className="text-xs text-gray-400">{isRejected ? 'Exkluderad' : 'Väntar'}</span>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      {approval.status === 'pending' && (
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleAutopilotApprove(approval, Array.from(rejectedSet))}
                            disabled={actionLoading !== null || activeCount === 0}
                            className="flex-1 bg-teal-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-teal-700 disabled:opacity-50 transition-all"
                          >
                            {actionLoading === approval.id + 'approve' ? 'Godkänner...' : `✅ Godkänn allt (${activeCount})`}
                          </button>
                          <button
                            onClick={() => setExpandedPackage(isExpanded ? null : approval.id)}
                            className="px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-all flex items-center gap-1"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            Granska
                          </button>
                          <button
                            onClick={() => handleAction(approval.id, 'reject')}
                            disabled={actionLoading !== null}
                            className="px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-all"
                          >
                            Avvisa
                          </button>
                        </div>
                      )}

                      {/* Expanderad granskning */}
                      {isExpanded && approval.status === 'pending' && (
                        <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
                          {pendingActions.map(act => {
                            const isRejected = rejectedSet.has(act.id)
                            return (
                              <div key={act.id} className="bg-white border border-gray-200 rounded-xl p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-semibold text-gray-900">{act.title}</span>
                                  <button
                                    onClick={() => toggleActionRejected(approval.id, act.id)}
                                    className={`text-xs font-medium px-3 py-1 rounded-full transition-all ${
                                      isRejected
                                        ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                        : 'bg-green-50 text-green-600 hover:bg-green-100'
                                    }`}
                                  >
                                    {isRejected ? '✕ Exkluderad' : '✓ Inkluderad'}
                                  </button>
                                </div>

                                {act.type === 'booking_suggestion' && (
                                  <div className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-sm text-gray-600">Föreslagen tid: <strong>{act.description}</strong></p>
                                    <p className="text-xs text-gray-400 mt-1">Baserat på din kalender</p>
                                  </div>
                                )}

                                {act.type === 'customer_sms' && (
                                  <div className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-xs text-gray-400 mb-1">SMS-text:</p>
                                    <p className="text-sm text-gray-700 italic">"{(act.data as any).message}"</p>
                                    <p className="text-xs text-gray-400 mt-1">Till: {(act.data as any).to}</p>
                                  </div>
                                )}

                                {act.type === 'material_list' && (
                                  <div className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-xs text-gray-400 mb-2">Material:</p>
                                    {((act.data as any).materials || []).map((m: any, i: number) => (
                                      <p key={i} className="text-sm text-gray-700">□ {m.name} ({m.quantity} {m.unit})</p>
                                    ))}
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

              // Standard approval card
              const config = TYPE_CONFIG[approval.approval_type] || TYPE_CONFIG.other
              const Icon = config.icon
              const agent = getAgentFromApproval(approval)
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
                      {agent ? (
                        <div className={`w-9 h-9 rounded-full ${agent.color} flex items-center justify-center flex-shrink-0 text-white text-xs font-bold`}>
                          {agent.initials}
                        </div>
                      ) : (
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${config.bgColor}`}>
                          <Icon className={`w-4 h-4 ${config.textColor}`} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {agent && (
                            <span className="text-xs text-gray-400">{agent.name} · {agent.role}</span>
                          )}
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
                        {/* Seasonal campaign details */}
                        {approval.approval_type === 'seasonal_campaign' && approval.payload && (
                          <div className="mt-2 space-y-2">
                            {(approval.payload as any).angle && (
                              <p className="text-xs text-gray-500 italic">"{(approval.payload as any).angle}"</p>
                            )}
                            {(approval.payload as any).projectTypes?.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {((approval.payload as any).projectTypes as string[]).map((pt: string) => (
                                  <span key={pt} className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{pt}</span>
                                ))}
                              </div>
                            )}
                            {(approval.payload as any).customer_count > 0 && (
                              <p className="text-xs text-gray-400">{(approval.payload as any).customer_count} kunder kommer att kontaktas</p>
                            )}
                          </div>
                        )}
                        {/* Time attestation details */}
                        {approval.approval_type === 'time_attestation' && approval.payload && (() => {
                          const pl = approval.payload as any
                          return (
                            <div className="mt-2 bg-sky-50 rounded-lg p-3 space-y-2">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-sky-100 rounded-full flex items-center justify-center text-xs font-semibold text-sky-700">
                                  {(pl.user_name || '??').slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{pl.user_name}</p>
                                  <p className="text-xs text-gray-400">{pl.project_name || 'Inget projekt'}</p>
                                </div>
                                {pl.lat_in && (
                                  <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">GPS</span>
                                )}
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div>
                                  <p className="text-gray-400">In</p>
                                  <p className="font-medium text-gray-700">{pl.checked_in_at ? new Date(pl.checked_in_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                                </div>
                                <div>
                                  <p className="text-gray-400">Ut</p>
                                  <p className="font-medium text-gray-700">{pl.checked_out_at ? new Date(pl.checked_out_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                                </div>
                                <div>
                                  <p className="text-gray-400">Tid</p>
                                  <p className="font-medium text-gray-700">{pl.duration_minutes ? `${Math.floor(pl.duration_minutes / 60)}h ${pl.duration_minutes % 60}min` : '—'}</p>
                                </div>
                              </div>
                            </div>
                          )
                        })()}
                        {/* Dispatch suggestion details */}
                        {approval.approval_type === 'dispatch_suggestion' && approval.payload && (() => {
                          const pl = approval.payload as any
                          return (
                            <div className="mt-2 bg-violet-50 rounded-lg p-3 space-y-2">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-violet-100 rounded-full flex items-center justify-center text-xs font-semibold text-violet-700">
                                  {(pl.member_name || '??').slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{pl.member_name}</p>
                                  <p className="text-xs text-gray-400">{pl.job_title}</p>
                                </div>
                              </div>
                              {pl.reasons && (
                                <div className="flex flex-wrap gap-1">
                                  {(pl.reasons as string[]).map((r: string, i: number) => (
                                    <span key={i} className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">{r}</span>
                                  ))}
                                </div>
                              )}
                              {pl.alternatives && (pl.alternatives as any[]).length > 0 && (
                                <p className="text-[10px] text-gray-400">Alternativ: {(pl.alternatives as any[]).map((a: any) => a.name).join(', ')}</p>
                              )}
                            </div>
                          )
                        })()}
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
