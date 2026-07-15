'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle,
  Loader2,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'

/**
 * PendingApprovalsBlock (Dashboard Steg 1A, 2026-05-28).
 *
 * Inline-block på dashboard-startsidan som visar de 3 senaste pending
 * approvals som agent-cards. Approve/avvisa direkt utan att lämna
 * dashboard. Övriga går till /dashboard/approvals.
 *
 * Designprincip (Andreas, 2026-05-28): "agenterna är primära arbetare,
 * användaren är godkännare". Detta är första manifesteringen — agent-
 * förslag är inte gömda på en sub-sida, de möter användaren direkt.
 */

// Återanvänd agent-routing-logik från /dashboard/approvals (men håll
// komponenten autonom — duplicera den lilla metadata-mappen istället
// för att importera den stora approvals/page.tsx).
const AGENT_INFO: Record<string, { name: string; role: string; color: string; initials: string }> = {
  matte: { name: 'Matte', role: 'Chefsassistent', color: 'bg-primary-700', initials: 'M' },
  karin: { name: 'Karin', role: 'Ekonom', color: 'bg-blue-600', initials: 'K' },
  hanna: { name: 'Hanna', role: 'Marknadschef', color: 'bg-purple-600', initials: 'H' },
  daniel: { name: 'Daniel', role: 'Säljare', color: 'bg-amber-600', initials: 'D' },
  lars: { name: 'Lars', role: 'Projektledare', color: 'bg-emerald-600', initials: 'L' },
  lisa: { name: 'Lisa', role: 'Kundservice', color: 'bg-sky-500', initials: 'Li' },
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
}

function getAgent(approval: Approval) {
  const routed = (approval.payload?.routed_agent as string) || (approval.payload?.agent_id as string) || null
  if (routed && AGENT_INFO[routed]) return AGENT_INFO[routed]
  const t = approval.approval_type
  if (t.includes('invoice') || t.includes('payment') || t === 'profitability_warning') return AGENT_INFO.karin
  if (t.includes('campaign') || t.includes('neighbour') || t.includes('reactivat') || t.includes('review')) return AGENT_INFO.hanna
  if (t.includes('quote') || t.includes('lead') || t.includes('pipeline')) return AGENT_INFO.daniel
  if (t.includes('booking') || t.includes('project') || t.includes('dispatch') || t.includes('job_report') || t.includes('warranty')) return AGENT_INFO.lars
  if (t.includes('call') || t.includes('sms')) return AGENT_INFO.lisa
  return null
}

function getPreview(approval: Approval): string {
  const pl = approval.payload as any
  // lead_review (email-webhook-flöde): visa parsed.name + phone
  if (approval.approval_type === 'lead_review' && pl.parsed) {
    const parts = [pl.parsed.name, pl.parsed.phone].filter(Boolean).join(' · ')
    return parts || approval.description || ''
  }
  if (pl.message) return String(pl.message).slice(0, 140)
  if (pl.sms_text) return String(pl.sms_text).slice(0, 140)
  if (approval.description) return approval.description.slice(0, 140)
  return ''
}

function getRecipient(approval: Approval): string {
  const pl = approval.payload as any
  if (pl.customer_name) return String(pl.customer_name)
  if (pl.parsed?.name) return String(pl.parsed.name)
  if (pl.to) return String(pl.to)
  return ''
}

const TYPE_LABEL: Record<string, string> = {
  send_sms: 'SMS',
  send_quote: 'Offert',
  send_invoice: 'Faktura',
  create_booking: 'Bokning',
  lead_review: 'Ny lead',
  quote_nudge: 'Manuell åtgärd',
  review_request: 'Recension',
  manual_project_create: 'Skapa projekt',
  autonomy_offer: 'Förtroende',
  confirm_payment: 'Betalning',
  review_auto_invoice: 'Faktura',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'nyss'
  if (mins < 60) return `${mins} min sen`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} tim sen`
  return `${Math.floor(hours / 24)} dag sen`
}

export function PendingApprovalsBlock() {
  const business = useBusiness()
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const fetchApprovals = useCallback(async () => {
    if (!business?.business_id) return
    setLoading(true)
    try {
      // Total count för "Se alla (X)"-link
      const { count } = await supabase
        .from('pending_approvals')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', business.business_id)
        .eq('status', 'pending')
      setTotalCount(count || 0)

      // Top 3 senaste
      const { data, error } = await supabase
        .from('pending_approvals')
        .select('*')
        .eq('business_id', business.business_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(3)
      if (!error) setApprovals(data || [])
    } finally {
      setLoading(false)
    }
  }, [business?.business_id])

  useEffect(() => {
    fetchApprovals()
  }, [fetchApprovals])

  // Realtime — uppdatera direkt när approvals ändras
  useEffect(() => {
    if (!business?.business_id) return
    const channel = supabase
      .channel('dashboard-pending-approvals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_approvals', filter: `business_id=eq.${business.business_id}` }, () => fetchApprovals())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [business?.business_id, fetchApprovals])

  async function handleAction(approvalId: string, action: 'approve' | 'reject') {
    setActionLoading(approvalId + action)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/approvals/${approvalId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ action }),
      })
      if (res.ok) {
        // Audit-3 Fix C + Audit-4 Fix DEF (2026-06-02):
        //   Fix C: kolla execution-resultat (sms_sent=false / error).
        //   Fix DEF: kolla execution.reason för kontext-känslig feedback
        //   (permission_denied, four_eyes_required, rate_limited, fail).
        // Status='approved' är redan satt i DB (status-flip-före-execution
        // är logged som TD); vi filtrerar bort approval från listan oavsett
        // utfall för att inte ge dubbel-tryck-illusion.
        const result = await res.json().catch(() => null) as {
          execution?: {
            action?: string
            granted?: boolean
            error?: string
            sms_sent?: boolean
            ok?: boolean
            reason?: 'fail' | 'four_eyes_required' | 'permission_denied' | 'rate_limited'
            metadata?: Record<string, unknown>
          }
        } | null
        const execution = result?.execution

        setApprovals(prev => prev.filter(a => a.id !== approvalId))
        setTotalCount(prev => Math.max(0, prev - 1))

        if (action !== 'approve') {
          setFeedback('Avvisat')
          setTimeout(() => setFeedback(null), 3000)
          return
        }

        // Approve-path — differentierad feedback
        const reason = execution?.reason
        const errText = execution?.error || 'Handlingen kunde inte utföras'

        if (reason === 'four_eyes_required') {
          setFeedback(`Värdet kräver ny granskning: ${errText}`)
          setTimeout(() => setFeedback(null), 8000)
        } else if (reason === 'permission_denied') {
          setFeedback(`Saknar behörighet: ${errText}`)
          setTimeout(() => setFeedback(null), 8000)
        } else if (reason === 'rate_limited') {
          setFeedback(`För många försök: ${errText}`)
          setTimeout(() => setFeedback(null), 8000)
        } else if (execution && (execution.error || execution.sms_sent === false || execution.ok === false)) {
          setFeedback(`Handling misslyckades: ${errText}`)
          setTimeout(() => setFeedback(null), 8000)
        } else if (execution?.action === 'autonomy_offer' && execution.granted === true) {
          // Hjärtat i förtjänad autonomi — beviljandet förtjänar egen copy.
          setFeedback('Självständighet beviljad — teamet sköter detta framöver. Du kan alltid ta tillbaka ratten.')
          setTimeout(() => setFeedback(null), 8000)
        } else {
          setFeedback('Godkänt och skickat')
          setTimeout(() => setFeedback(null), 3000)
        }
      } else {
        setFeedback('Kunde inte spara — försök igen')
        setTimeout(() => setFeedback(null), 4000)
      }
    } finally {
      setActionLoading(null)
    }
  }

  if (loading && approvals.length === 0) {
    return (
      <div className="mb-6 bg-white border border-[#E2E8F0] rounded-xl p-4 flex items-center justify-center min-h-[80px]">
        <Loader2 className="w-4 h-4 text-gray-300 animate-spin" />
      </div>
    )
  }

  // Inga pending → visa kompakt "allt-i-ordning"-banner
  if (approvals.length === 0) {
    return (
      <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-2.5 text-sm text-emerald-700">
        <CheckCircle className="w-4 h-4 flex-shrink-0" />
        <span className="font-medium">Inget väntar på dig just nu — teamet sköter det.</span>
      </div>
    )
  }

  return (
    <div className="mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <Bot className="w-4 h-4 text-primary-700" />
          Väntar på ditt godkännande
          <span className="text-xs font-normal bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full">{totalCount}</span>
        </h2>
        {totalCount > 3 && (
          <Link
            href="/dashboard/approvals"
            className="text-xs font-semibold text-primary-700 hover:text-primary-800 flex items-center gap-1"
          >
            Se alla ({totalCount})
            <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>

      {/* Feedback toast — amber för execution-fel/varning, emerald för success */}
      {feedback && (() => {
        const isError =
          feedback.startsWith('Handling misslyckades') ||
          feedback.startsWith('Saknar behörighet') ||
          feedback.startsWith('För många försök') ||
          feedback.startsWith('Värdet kräver') ||
          feedback.startsWith('Kunde inte')
        const cls = isError
          ? 'bg-amber-50 border-amber-300 text-amber-800'
          : 'bg-emerald-50 border-emerald-200 text-emerald-700'
        return (
          <div className={`mb-3 px-3 py-2 border rounded-lg text-sm font-medium ${cls}`}>
            {feedback}
          </div>
        )
      })()}

      {/* Cards */}
      <div className="space-y-2">
        {approvals.map(approval => {
          const agent = getAgent(approval)
          const recipient = getRecipient(approval)
          const preview = getPreview(approval)
          const label = TYPE_LABEL[approval.approval_type] || approval.approval_type
          const isLoadingApprove = actionLoading === approval.id + 'approve'
          const isLoadingReject = actionLoading === approval.id + 'reject'

          return (
            <div
              key={approval.id}
              id={`approval-${approval.id}`}
              className="bg-white border border-[#E2E8F0] rounded-xl p-4 hover:border-primary-200 transition-colors"
            >
              <div className="flex items-start gap-3">
                {/* Agent avatar */}
                {agent ? (
                  <div className={`w-9 h-9 rounded-full ${agent.color} flex items-center justify-center flex-shrink-0 text-white text-xs font-bold`}>
                    {agent.initials}
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-gray-500" />
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {agent && <span className="text-xs text-gray-400">{agent.name} · {agent.role}</span>}
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-700 uppercase tracking-wide">
                      {label}
                    </span>
                    <span className="text-xs text-gray-400 ml-auto">{timeAgo(approval.created_at)}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{approval.title}</p>
                  {recipient && (
                    <p className="text-xs text-gray-500 mt-0.5">Till: {recipient}</p>
                  )}
                  {preview && (
                    <p className="text-xs text-gray-500 mt-1 italic line-clamp-2">"{preview}"</p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => handleAction(approval.id, 'approve')}
                      disabled={isLoadingApprove || isLoadingReject}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {isLoadingApprove ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Godkänn
                    </button>
                    <button
                      onClick={() => handleAction(approval.id, 'reject')}
                      disabled={isLoadingApprove || isLoadingReject}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg border border-gray-300 disabled:opacity-50 transition-colors"
                    >
                      {isLoadingReject ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                      Avvisa
                    </button>
                    <Link
                      href={`/dashboard/approvals#approval-${approval.id}`}
                      className="ml-auto text-xs font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1"
                    >
                      Detaljer
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
