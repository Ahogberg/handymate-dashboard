'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Undo2,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import TeamActivityStrip, { TeamActivitySummary } from '@/components/TeamActivityStrip'

/**
 * IdagCore — kärnstacken i nya Idag-vyn (2026-07-11, från Idag-vy.html-designen).
 *
 * Hierarkin är inverterad mot gamla startsidan: teamets arbete först,
 * godkänn-kön som primär interaktion, datan sist som drill-down.
 *
 *   1. Bevisband      — vad teamet gjort sedan igår (riktiga siffror)
 *   2. Agentremsa     — TeamActivityStrip (befintlig, riktig data)
 *   3. Väntar på dig  — godkänn-kön: max 2 fulla kort, resten kompakta rader
 *   4. Klart idag     — utförda åtgärder med AUTO-märkning
 *   5. Drill-rad      — Dagens plan · Verksamhetsöversikt · Fakturor
 *   6. KPI-fot        — veckans siffror i en rad
 *
 * Godkänn/Avvisa skickas med 5 sekunders ångra-fönster: POST:en går iväg
 * först när fönstret löpt ut. Ångra avbryter timern — ärendet ligger då
 * kvar orört i kön (stängd flik = inget skickat, inget förlorat).
 */

// ── Agent-metadata (samma mapp som PendingApprovalsBlock/approvals-sidan) ──
const AGENT_INFO: Record<string, { name: string; role: string; color: string; initials: string; dot: string }> = {
  matte: { name: 'Matte', role: 'Chefsassistent', color: 'bg-primary-700', dot: '#0f766e', initials: 'M' },
  karin: { name: 'Karin', role: 'Ekonom', color: 'bg-blue-600', dot: '#2563eb', initials: 'K' },
  hanna: { name: 'Hanna', role: 'Marknadschef', color: 'bg-purple-600', dot: '#9333ea', initials: 'H' },
  daniel: { name: 'Daniel', role: 'Säljare', color: 'bg-amber-600', dot: '#d97706', initials: 'D' },
  lars: { name: 'Lars', role: 'Projektledare', color: 'bg-emerald-600', dot: '#059669', initials: 'L' },
  lisa: { name: 'Lisa', role: 'Kundservice', color: 'bg-sky-500', dot: '#0ea5e9', initials: 'Li' },
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

interface DoneRow {
  key: string
  time: string
  agent: string
  text: string
  auto: boolean
  fresh?: boolean
}

interface BookingRow {
  booking_id: string
  scheduled_start: string
  notes: string
  customer?: { name: string } | null
}

interface PipelineStats {
  totalDeals: number
  totalValue: number
  newLeadsToday: number
}

interface Economics {
  unpaidCount: number
  unpaidAmount: number
}

interface IdagCoreProps {
  bookings: BookingRow[]
  bookingsLoaded: boolean
  pipelineStats: PipelineStats | null
  economics: Economics | null
}

function getAgentKey(approval: Approval): string {
  const routed = (approval.payload?.routed_agent as string) || (approval.payload?.agent_id as string) || null
  if (routed && AGENT_INFO[routed]) return routed
  const t = approval.approval_type
  if (t.includes('invoice') || t.includes('payment') || t === 'profitability_warning') return 'karin'
  if (t.includes('campaign') || t.includes('neighbour') || t.includes('reactivat') || t.includes('review')) return 'hanna'
  if (t.includes('quote') || t.includes('lead') || t.includes('pipeline')) return 'daniel'
  if (t.includes('booking') || t.includes('project') || t.includes('dispatch') || t.includes('job_report') || t.includes('warranty')) return 'lars'
  if (t.includes('call') || t.includes('sms')) return 'lisa'
  return 'matte'
}

function getPreview(approval: Approval): string {
  const pl = approval.payload as any
  if (approval.approval_type === 'lead_review' && pl.parsed) {
    const parts = [pl.parsed.name, pl.parsed.phone].filter(Boolean).join(' · ')
    return parts || approval.description || ''
  }
  if (pl.message) return String(pl.message).slice(0, 200)
  if (pl.sms_text) return String(pl.sms_text).slice(0, 200)
  return ''
}

function getRecipient(approval: Approval): string {
  const pl = approval.payload as any
  if (pl.customer_name) return String(pl.customer_name)
  if (pl.parsed?.name) return String(pl.parsed.name)
  if (pl.to) return String(pl.to)
  return ''
}

// Nyckeln i payload som "Ändra" redigerar. Bara meddelandetexter är
// redigerbara inline — övriga typer saknar Ändra-knapp.
function getEditableKey(approval: Approval): 'message' | 'sms_text' | null {
  if (typeof approval.payload?.message === 'string') return 'message'
  if (typeof approval.payload?.sms_text === 'string') return 'sms_text'
  return null
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

function formatKr(amount: number): string {
  return `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(amount)} kr`
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}

function getServiceFromNotes(notes: string): string {
  if (!notes) return 'Tjänst'
  return notes.split(' - ')[0] || notes.substring(0, 20)
}

// Agent-attribution för Klart idag-rader från /api/automations/activity.
function doneRowAgent(item: { type: string; action?: string; description?: string; source: string }): string {
  if (item.source === 'communication' || item.type === 'sms') return 'lisa'
  if (item.source === 'pipeline') return 'daniel'
  const s = `${item.type} ${item.action || ''} ${item.description || ''}`.toLowerCase()
  if (/(invoice|faktura|påminnelse|payment)/.test(s)) return 'karin'
  if (/(quote|offert|lead)/.test(s)) return 'daniel'
  if (/(booking|bokning|schedule|project)/.test(s)) return 'lars'
  if (/(campaign|utskick|review|recension)/.test(s)) return 'hanna'
  if (/(call|samtal)/.test(s)) return 'lisa'
  return 'matte'
}

const MAX_FULL_CARDS = 2
const UNDO_WINDOW_MS = 5000

export default function IdagCore({
  bookings,
  bookingsLoaded,
  pipelineStats,
  economics,
}: IdagCoreProps) {
  const business = useBusiness()

  // ── Kö-state ──
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [queueLoaded, setQueueLoaded] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  // Kort som lämnat kön visuellt: väntar på ångra-fönstret eller är skickade.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [snack, setSnack] = useState<{ approvalId: string; text: string } | null>(null)
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null)
  // id → timer för fördröjda POST:ar. Ref så timers överlever re-renders.
  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Klart idag-state ──
  const [doneRows, setDoneRows] = useState<DoneRow[]>([])
  const [doneLoaded, setDoneLoaded] = useState(false)
  const [doneOpen, setDoneOpen] = useState(false)

  // ── Bevisband ──
  const [teamSummary, setTeamSummary] = useState<TeamActivitySummary | null>(null)
  const handleStripLoaded = useCallback((summary: TeamActivitySummary) => {
    setTeamSummary(summary)
  }, [])

  const fetchQueue = useCallback(async () => {
    if (!business?.business_id) return
    const { data, error } = await supabase
      .from('pending_approvals')
      .select('*')
      .eq('business_id', business.business_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(15)
    if (!error) setApprovals(data || [])
    setQueueLoaded(true)
  }, [business?.business_id])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  useEffect(() => {
    if (!business?.business_id) return
    const channel = supabase
      .channel('idag-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_approvals', filter: `business_id=eq.${business.business_id}` }, () => fetchQueue())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [business?.business_id, fetchQueue])

  useEffect(() => {
    let cancelled = false
    fetch('/api/automations/activity?limit=30')
      .then(r => (r.ok ? r.json() : null))
      .then(res => {
        if (cancelled || !res?.data) { setDoneLoaded(true); return }
        const midnight = new Date()
        midnight.setHours(0, 0, 0, 0)
        const rows: DoneRow[] = (res.data as Array<{ id: string; type: string; action?: string; description?: string; status: string; created_at: string; source: string }>)
          .filter(a => new Date(a.created_at) >= midnight && a.status !== 'failed' && a.description)
          .slice(0, 12)
          .map(a => ({
            key: `${a.source}-${a.id}`,
            time: formatClock(a.created_at),
            agent: doneRowAgent(a),
            text: String(a.description),
            auto: true,
          }))
        setDoneRows(rows)
        setDoneLoaded(true)
      })
      .catch(() => setDoneLoaded(true))
    return () => { cancelled = true }
  }, [business?.business_id])

  // Rensa timers vid unmount. Medvetet: en o-flushad timer innebär att
  // ärendet ligger kvar som pending i DB — inget går förlorat.
  useEffect(() => {
    const timers = pendingTimers.current
    return () => { timers.forEach(t => clearTimeout(t)) }
  }, [])

  function showFeedback(text: string, isError: boolean, ms = isError ? 8000 : 3000) {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setFeedback({ text, isError })
    feedbackTimer.current = setTimeout(() => setFeedback(null), ms)
  }

  async function executeSend(approval: Approval, action: 'approve' | 'reject' | 'edit', editedText?: string) {
    pendingTimers.current.delete(approval.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const body: Record<string, unknown> = { action }
      if (action === 'edit') {
        const key = getEditableKey(approval)
        if (key && editedText != null) body.edited_payload = { [key]: editedText }
      }
      const res = await fetch(`/api/approvals/${approval.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        // Återställ kortet — ärendet är orört i DB (eller redan hanterat någon annanstans).
        setHiddenIds(prev => { const n = new Set(prev); n.delete(approval.id); return n })
        if (res.status === 409) {
          showFeedback('Ärendet hanterades redan någon annanstans', true)
          fetchQueue()
        } else {
          showFeedback('Kunde inte spara — försök igen', true)
        }
        return
      }

      const result = await res.json().catch(() => null) as {
        execution?: {
          action?: string
          granted?: boolean
          error?: string
          sms_sent?: boolean
          ok?: boolean
          reason?: 'fail' | 'four_eyes_required' | 'permission_denied' | 'rate_limited'
        }
      } | null
      const execution = result?.execution
      const agentKey = getAgentKey(approval)

      // Ärendet är avgjort i DB — plocka bort från kö-listan på riktigt.
      setApprovals(prev => prev.filter(a => a.id !== approval.id))

      if (action === 'reject') {
        if (approval.approval_type !== 'autonomy_offer') {
          setDoneRows(prev => [{
            key: `local-${approval.id}`,
            time: 'nyss',
            agent: agentKey,
            text: `avvisade: ${approval.title}`,
            auto: false,
            fresh: true,
          }, ...prev])
        }
        return
      }

      const reason = execution?.reason
      const errText = execution?.error || 'Handlingen kunde inte utföras'
      if (reason === 'four_eyes_required') {
        showFeedback(`Värdet kräver ny granskning: ${errText}`, true)
      } else if (reason === 'permission_denied') {
        showFeedback(`Saknar behörighet: ${errText}`, true)
      } else if (reason === 'rate_limited') {
        showFeedback(`För många försök: ${errText}`, true)
      } else if (execution && (execution.error || execution.sms_sent === false || execution.ok === false)) {
        showFeedback(`Handling misslyckades: ${errText}`, true)
      } else if (execution?.action === 'autonomy_offer' && execution.granted === true) {
        showFeedback('Självständighet beviljad — teamet sköter detta framöver. Du kan alltid ta tillbaka ratten.', false, 8000)
        setDoneRows(prev => [{
          key: `local-${approval.id}`,
          time: 'nyss',
          agent: agentKey,
          text: `${approval.title} — fullt förtroende beviljat`,
          auto: false,
          fresh: true,
        }, ...prev])
      } else {
        setDoneRows(prev => [{
          key: `local-${approval.id}`,
          time: 'nyss',
          agent: agentKey,
          text: `skickade: ${approval.title}${action === 'edit' ? ' (med din ändring)' : ''}`,
          auto: false,
          fresh: true,
        }, ...prev])
      }
    } catch {
      setHiddenIds(prev => { const n = new Set(prev); n.delete(approval.id); return n })
      showFeedback('Kunde inte spara — försök igen', true)
    }
  }

  // Startar ångra-fönstret: kortet lämnar kön visuellt, POST:en går efter 5 s.
  function queueAction(approval: Approval, action: 'approve' | 'reject' | 'edit', editedText?: string) {
    setEditingId(null)
    setHiddenIds(prev => new Set(prev).add(approval.id))
    const isAutonomy = approval.approval_type === 'autonomy_offer'
    const snackText = action === 'reject'
      ? (isAutonomy ? 'Ok — teamet fortsätter fråga dig' : 'Förslaget avvisas')
      : isAutonomy
        ? 'Förtroende beviljas'
        : `Skickar: ${approval.title.slice(0, 60)}`
    setSnack({ approvalId: approval.id, text: snackText })
    const timer = setTimeout(() => {
      setSnack(prev => (prev?.approvalId === approval.id ? null : prev))
      executeSend(approval, action, editedText)
    }, UNDO_WINDOW_MS)
    pendingTimers.current.set(approval.id, timer)
  }

  function undo(approvalId: string) {
    const timer = pendingTimers.current.get(approvalId)
    if (timer) {
      clearTimeout(timer)
      pendingTimers.current.delete(approvalId)
    }
    setHiddenIds(prev => { const n = new Set(prev); n.delete(approvalId); return n })
    setSnack(null)
  }

  function startEdit(approval: Approval) {
    setEditingId(approval.id)
    setEditText(getPreview(approval))
  }

  const visible = approvals.filter(a => !hiddenIds.has(a.id))
  const pending = visible.length
  // Regel, inte data-flagga: de två senaste renderas fullt, resten kompakt.
  // Ett expanderat kompakt kort renderas fullt på sin plats.
  const fullIds = new Set(visible.slice(0, MAX_FULL_CARDS).map(a => a.id))

  const queueEmpty = queueLoaded && pending === 0
  const doneExpanded = doneOpen || queueEmpty

  return (
    <div>
      {/* ── 1. Bevisband ── */}
      <ProofBand summary={teamSummary} pending={queueLoaded ? pending : null} />

      {/* ── 2. Agentremsa (riktig data, befintlig komponent) ── */}
      <TeamActivityStrip onLoaded={handleStripLoaded} />

      {/* ── 3. Väntar på dig ── */}
      <div className="mb-6">
        <div className="flex items-baseline gap-2 mb-3">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary-700" />
            Väntar på dig
          </h2>
          {pending > 0 && (
            <span className="font-heading text-xs font-bold bg-primary-700 text-white rounded-full min-w-[21px] h-[21px] px-1.5 inline-flex items-center justify-center">
              {pending}
            </span>
          )}
          <span className="ml-auto text-xs text-gray-400">Allt annat sköter teamet själva</span>
        </div>

        {feedback && (
          <div className={`mb-3 px-3 py-2 border rounded-lg text-sm font-medium ${
            feedback.isError
              ? 'bg-amber-50 border-amber-300 text-amber-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}>
            {feedback.text}
          </div>
        )}

        {!queueLoaded ? (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex items-center justify-center min-h-[80px]">
            <Loader2 className="w-4 h-4 text-gray-300 animate-spin" />
          </div>
        ) : queueEmpty ? (
          <div className="bg-white border border-dashed border-[#E2E8F0] rounded-xl px-5 py-7 text-center">
            <span className="w-11 h-11 rounded-full bg-primary-50 text-primary-700 inline-flex items-center justify-center mb-2">
              <Check className="w-5 h-5" strokeWidth={2.5} />
            </span>
            <h3 className="font-semibold text-gray-900">Allt klart</h3>
            <p className="text-sm text-gray-500 mt-0.5">Teamet jobbar vidare — vi säger till när något behöver dig.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map(approval => {
              const isFull = fullIds.has(approval.id) || expandedIds.has(approval.id)
              return isFull ? (
                <QueueCard
                  key={approval.id}
                  approval={approval}
                  editing={editingId === approval.id}
                  editText={editText}
                  onEditText={setEditText}
                  onStartEdit={() => startEdit(approval)}
                  onCancelEdit={() => setEditingId(null)}
                  onApprove={() => queueAction(approval, 'approve')}
                  onApproveEdited={() => queueAction(approval, 'edit', editText)}
                  onReject={() => queueAction(approval, 'reject')}
                />
              ) : (
                <button
                  key={approval.id}
                  onClick={() => setExpandedIds(prev => new Set(prev).add(approval.id))}
                  className="w-full bg-white border border-[#E2E8F0] rounded-xl px-4 py-3 min-h-[44px] flex items-center gap-3 text-left hover:border-primary-200 transition-colors"
                >
                  <AgentAvatar agentKey={getAgentKey(approval)} size="sm" />
                  <span className="flex-1 min-w-0 text-sm text-gray-600 truncate">
                    <b className="font-semibold text-gray-900">{AGENT_INFO[getAgentKey(approval)].name}</b>
                    {' · '}{approval.title}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </button>
              )
            })}
            {approvals.length >= 15 && (
              <Link
                href="/dashboard/approvals"
                className="block text-center text-xs font-semibold text-primary-700 hover:text-primary-800 py-2"
              >
                Se alla i Godkännanden <ArrowRight className="w-3 h-3 inline" />
              </Link>
            )}
          </div>
        )}
      </div>

      {/* ── 4. Klart idag ── */}
      {doneLoaded && doneRows.length > 0 && (
        <div className="mb-6 bg-white border border-[#E2E8F0] rounded-xl">
          <button
            onClick={() => setDoneOpen(o => !o)}
            className="w-full flex items-center gap-2 px-4 py-3 min-h-[44px] text-sm font-semibold text-gray-700"
          >
            <Check className="w-4 h-4 text-primary-700" />
            Klart idag · {doneRows.length} åtgärder
            <ChevronDown className={`w-4 h-4 text-gray-400 ml-auto transition-transform ${doneExpanded ? 'rotate-180' : ''}`} />
          </button>
          {doneExpanded && (
            <div className="px-2 pb-2">
              {doneRows.map(row => (
                <div
                  key={row.key}
                  className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[13px] text-gray-500 ${row.fresh ? 'bg-primary-50' : ''}`}
                >
                  <span className="font-mono text-[11px] text-gray-400 w-[42px] flex-shrink-0">{row.time}</span>
                  <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: AGENT_INFO[row.agent]?.dot || '#94a3b8' }} />
                  <span className="flex-1 min-w-0 leading-snug">
                    <b className={`font-medium ${row.fresh ? 'text-primary-800' : 'text-gray-700'}`}>{AGENT_INFO[row.agent]?.name || 'Teamet'}</b>
                    {' — '}{row.text}
                  </span>
                  {row.auto && (
                    <span className="text-[10px] font-semibold tracking-wider text-gray-400 border border-gray-200 rounded px-1 py-px flex-shrink-0">
                      AUTO
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 5. Drill-rad ── */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Dagens plan */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <Link href="/dashboard/schedule" className="flex items-center justify-between text-sm font-semibold text-gray-900 mb-3 hover:text-primary-700 transition-colors">
            Dagens plan
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </Link>
          {!bookingsLoaded ? (
            <div className="animate-pulse space-y-2">
              <div className="h-8 bg-gray-100 rounded" />
              <div className="h-8 bg-gray-100 rounded" />
            </div>
          ) : bookings.length === 0 ? (
            <p className="text-sm text-gray-400">Inget bokat idag</p>
          ) : (
            <div className="space-y-2">
              {bookings.slice(0, 3).map(b => (
                <Link
                  key={b.booking_id}
                  href={`/dashboard/bookings/${b.booking_id}`}
                  className="flex items-center gap-2.5 group"
                >
                  <span className="font-mono text-[13px] text-primary-700 w-11 flex-shrink-0">{formatClock(b.scheduled_start)}</span>
                  <span className="w-[3px] h-8 rounded-full bg-primary-500 flex-shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-900 truncate group-hover:text-primary-700 transition-colors">
                      {b.customer?.name || 'Kund'}
                    </span>
                    <span className="block text-xs text-gray-400 truncate">{getServiceFromNotes(b.notes)}</span>
                  </span>
                </Link>
              ))}
              {bookings.length > 3 && (
                <Link href="/dashboard/schedule" className="block text-xs font-medium text-primary-700 pt-1">
                  Visa alla {bookings.length} bokningar
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Verksamhetsöversikt */}
        <Link href="/dashboard/pipeline" className="bg-white border border-[#E2E8F0] rounded-xl p-4 hover:border-primary-200 transition-colors">
          <span className="flex items-center justify-between text-sm font-semibold text-gray-900 mb-3">
            Verksamhetsöversikt
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </span>
          {pipelineStats ? (
            <>
              <span className="block font-heading text-2xl font-bold text-gray-900">{formatKr(pipelineStats.totalValue)}</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                {pipelineStats.totalDeals} affärer
                {pipelineStats.newLeadsToday > 0 ? ` · ${pipelineStats.newLeadsToday} nya leads idag` : ''}
              </span>
            </>
          ) : (
            <div className="animate-pulse h-8 bg-gray-100 rounded w-24" />
          )}
        </Link>

        {/* Fakturor */}
        <Link href="/dashboard/invoices?status=sent" className="bg-white border border-[#E2E8F0] rounded-xl p-4 hover:border-primary-200 transition-colors">
          <span className="flex items-center justify-between text-sm font-semibold text-gray-900 mb-3">
            Fakturor
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </span>
          {economics ? (
            <>
              <span className="block font-heading text-2xl font-bold text-gray-900">{formatKr(economics.unpaidAmount)}</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                {economics.unpaidCount === 0
                  ? 'Inga obetalda — Karin bevakar'
                  : `${economics.unpaidCount} obetalda · Karin bevakar`}
              </span>
            </>
          ) : (
            <div className="animate-pulse h-8 bg-gray-100 rounded w-24" />
          )}
        </Link>
      </div>

      {/* KPI-veckoraden bor numera som diskret rad under hälsningen i
          page.tsx — flyttad 2026-07-11 (Andreas: orientering, inte sektion). */}

      {/* ── Ångra-snackbar ── */}
      {snack && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white rounded-xl px-4 py-3 flex items-center gap-3 text-sm shadow-lg max-w-[calc(100vw-2rem)]">
          <Check className="w-4 h-4 text-teal-300 flex-shrink-0" />
          <span className="truncate">{snack.text}</span>
          <button
            onClick={() => undo(snack.approvalId)}
            className="ml-2 font-semibold text-teal-300 hover:text-teal-200 inline-flex items-center gap-1 flex-shrink-0"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Ångra
          </button>
        </div>
      )}
    </div>
  )
}

// ── Bevisband ──
function ProofBand({ summary, pending }: { summary: TeamActivitySummary | null; pending: number | null }) {
  const parts: string[] = []
  if (summary) {
    if (summary.total_calls > 0) parts.push(`tog ${summary.total_calls} samtal`)
    if (summary.total_sms > 0) parts.push(`skickade ${summary.total_sms} SMS`)
    if (summary.total_quotes > 0) parts.push(`förberedde ${summary.total_quotes} offert${summary.total_quotes > 1 ? 'er' : ''}`)
    if (summary.total_bookings_updated > 0) parts.push(`uppdaterade ${summary.total_bookings_updated} bokning${summary.total_bookings_updated > 1 ? 'ar' : ''}`)
    if (parts.length === 0 && summary.total_automations > 0) {
      parts.push(`utförde ${summary.total_automations} åtgärd${summary.total_automations > 1 ? 'er' : ''}`)
    }
  }

  const activityText = parts.length === 0
    ? 'Teamet är på plats — inget nytt att hantera sedan igår kväll.'
    : parts.length === 1
      ? `Sedan igår kväll ${parts[0]} teamet`
      : `Sedan igår kväll ${parts.slice(0, -1).join(', ')} och ${parts[parts.length - 1]} teamet`

  return (
    <div className="mb-4 flex items-center gap-3.5 px-4 py-3.5 rounded-xl border border-primary-100 bg-gradient-to-br from-[#f0fdf9] to-[#f8fafc]">
      <span className="font-heading text-3xl font-bold leading-none text-primary-700 min-w-[30px] text-center">
        {pending == null ? '·' : pending > 0 ? pending : <Check className="w-6 h-6 inline" strokeWidth={2.5} />}
      </span>
      <p className="text-sm text-gray-600 leading-snug">
        {activityText}
        {pending != null && (
          <b className="text-gray-900">
            {' '}— {pending === 0 ? 'allt är klart.' : pending === 1 ? '1 sak väntar på ditt OK.' : `${pending} saker väntar på ditt OK.`}
          </b>
        )}
      </p>
    </div>
  )
}

// ── Fullt kö-kort ──
function QueueCard({
  approval,
  editing,
  editText,
  onEditText,
  onStartEdit,
  onCancelEdit,
  onApprove,
  onApproveEdited,
  onReject,
}: {
  approval: Approval
  editing: boolean
  editText: string
  onEditText: (t: string) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onApprove: () => void
  onApproveEdited: () => void
  onReject: () => void
}) {
  const agentKey = getAgentKey(approval)
  const agent = AGENT_INFO[agentKey]
  const isAutonomy = approval.approval_type === 'autonomy_offer'
  const preview = getPreview(approval)
  const recipient = getRecipient(approval)
  const editable = getEditableKey(approval) != null
  const label = TYPE_LABEL[approval.approval_type] || approval.approval_type

  return (
    <div className={`rounded-xl border p-4 ${
      isAutonomy
        ? 'bg-gradient-to-br from-primary-700/10 to-primary-500/[0.03] border-primary-700/30'
        : 'bg-white border-[#E2E8F0]'
    }`}>
      <div className="flex items-center gap-2.5 mb-2">
        <AgentAvatar agentKey={agentKey} />
        <span className="text-xs text-gray-500 flex-1 min-w-0 truncate">
          <b className="font-semibold text-gray-900">{agent.name}</b> · {agent.role} föreslår
        </span>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-primary-50 text-primary-700">{label}</span>
        <span className="text-xs text-gray-400">{timeAgo(approval.created_at)}</span>
      </div>

      <h3 className="text-[15px] font-semibold text-gray-900 leading-snug mb-1">{approval.title}</h3>
      {approval.description && (
        <p className="text-[13px] text-gray-500 leading-relaxed mb-2">{approval.description}</p>
      )}
      {recipient && !approval.description && (
        <p className="text-[13px] text-gray-500 mb-2">Till: {recipient}</p>
      )}

      {preview && !editing && (
        <div className="text-[13px] text-gray-600 italic bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5 mb-3">
          &quot;{preview}&quot;
        </div>
      )}
      {editing && (
        <textarea
          value={editText}
          onChange={e => onEditText(e.target.value)}
          className="w-full text-sm text-gray-800 border border-primary-300 rounded-lg px-3 py-2.5 mb-3 min-h-[76px] resize-y focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {isAutonomy ? (
          <>
            <button
              onClick={onApprove}
              className="inline-flex items-center gap-1.5 h-9 px-4 bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Check className="w-4 h-4" />
              Ja, kör automatiskt
            </button>
            <button
              onClick={onReject}
              className="inline-flex items-center h-9 px-4 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg border border-gray-300 transition-colors"
            >
              Fortsätt fråga mig
            </button>
          </>
        ) : editing ? (
          <>
            <button
              onClick={onApproveEdited}
              className="inline-flex items-center gap-1.5 h-9 px-4 bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Check className="w-4 h-4" />
              Spara &amp; godkänn
            </button>
            <button
              onClick={onCancelEdit}
              className="inline-flex items-center h-9 px-3 text-gray-400 hover:text-gray-600 text-sm font-medium transition-colors"
            >
              Avbryt
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onApprove}
              className="inline-flex items-center gap-1.5 h-9 px-4 bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Check className="w-4 h-4" />
              Godkänn
            </button>
            {editable && (
              <button
                onClick={onStartEdit}
                className="inline-flex items-center h-9 px-4 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg border border-gray-300 transition-colors"
              >
                Ändra
              </button>
            )}
            <button
              onClick={onReject}
              className="inline-flex items-center gap-1 h-9 px-3 text-gray-400 hover:text-gray-600 text-sm font-medium transition-colors"
            >
              <X className="w-4 h-4" />
              Avvisa
            </button>
            <Link
              href={`/dashboard/approvals#approval-${approval.id}`}
              className="ml-auto text-xs font-medium text-gray-400 hover:text-gray-600 inline-flex items-center gap-1"
            >
              Detaljer
              <ArrowRight className="w-3 h-3" />
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

function AgentAvatar({ agentKey, size = 'md' }: { agentKey: string; size?: 'sm' | 'md' }) {
  const agent = AGENT_INFO[agentKey]
  const cls = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs'
  if (!agent) {
    return (
      <div className={`${cls} rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0`}>
        <Bot className="w-4 h-4 text-gray-500" />
      </div>
    )
  }
  return (
    <div className={`${cls} rounded-full ${agent.color} flex items-center justify-center flex-shrink-0 text-white font-bold`}>
      {agent.initials}
    </div>
  )
}
