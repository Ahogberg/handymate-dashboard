'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Banknote, Check, ChevronDown, ChevronRight, ChevronUp, FileText, Loader2, Mic, Phone, Undo2, User } from 'lucide-react'
import { nyhetsAtgard, type NyhetsIkon } from '@/lib/jarvis/news-actions'
import { byggNarvaro } from '@/lib/jarvis/team-presence'
import { TeamPresenceBand } from '@/components/jarvis/TeamPresenceBand'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useJobbuddy } from '@/lib/JobbuddyContext'
import { AgentDecisionCard, CardFactBox } from '@/components/agents/AgentDecisionCard'
import { AgentNewsRow } from '@/components/agents/AgentNewsRow'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { RailCard } from '@/components/jarvis/RailCard'
import { ScheduleTimeline, parseKonflikter, minuterFranIso } from '@/components/jarvis/ScheduleTimeline'
import { AGENT_INFO } from '@/components/dashboard/agentPersonas'
import { QuoteDraftDetail, QuoteToolExit } from '@/components/jarvis/QuoteDraftDetail'
import { KarinCalendarWidget } from '@/components/karin/KarinCalendarWidget'
import { PengarRailCard } from '@/components/jarvis/PengarRailCard'
import { approvalPreview, isEditable, buildApprovalEdit } from '@/lib/jarvis/approval-preview'
import {
  agentForApproval,
  approveLabel,
  deepLinkFor,
  needsAttention,
  typeLabel,
} from '@/lib/jarvis/approval-view'
import { quoteDraftSummary } from '@/lib/jarvis/quote-preview-summary'
import { cardContext } from '@/lib/jarvis/card-context'
import type { CardAction } from '@/lib/jarvis/voice'
import { voiceFor, reviewAlternatives, doneRowText } from '@/lib/jarvis/card-voice'
import { mayExecute } from '@/lib/approvals/action-contract'

/**
 * JarvisHome — teamets rapportbord (2026-08-07).
 *
 * ═══ VAD YTAN ÄR ═══
 *
 * Allt teamet gjort, föreslår eller undrar landar här som färdiga, tryckbara
 * resultat. Sidorna finns kvar bakom varje kort — men arbetet kommer till
 * hantverkaren, han navigerar inte till det.
 *
 * **Det är inte en chatbot.** Skrivraden ligger SIST, inte först, och öppnar
 * den befintliga Jobbkompisen. Allt ovanför klaras utan tangentbord. En
 * textruta som svarar hade varit en sämre meny med extra skrivarbete.
 *
 * ═══ DEN BÄRANDE IDÉN: ANATOMI, INTE FÄRG ═══
 *
 *   Kräver ditt beslut → vitt kort med ram och knappar, resultatet läsbart
 *                        på plats (AgentDecisionCard)
 *   Värt att veta      → platt rad, ingen ram, inga knappar (AgentNewsRow)
 *
 * Man skummar sidan på två sekunder och vet exakt vad som är ens jobb.
 *
 * ═══ ORÖRT FRÅN IdagCore ═══
 *
 * 5-sekundersfönstret är kopierat med flit i stället för delat: POST:en går
 * iväg först när fönstret löpt ut, och stängd flik betyder att ingenting
 * skickats. Att bryta ut den mekaniken medan Idag-vyn fortfarande är i prod
 * hade riskerat den vyn för en refaktorering som inte behövs ännu.
 */

/** Ikonen hålls här, inte i logiken — lib/jarvis/news-actions.ts ska gå att
 *  facit-testa utan att dra in React. */
const NYHETS_IKON: Record<NyhetsIkon, React.ReactNode> = {
  telefon: <Phone className="w-3.5 h-3.5" />,
  person: <User className="w-3.5 h-3.5" />,
  dokument: <FileText className="w-3.5 h-3.5" />,
  pengar: <Banknote className="w-3.5 h-3.5" />,
}

const UNDO_WINDOW_MS = 5000
const MAX_FULL_CARDS = 3

interface Approval {
  id: string
  approval_type: string
  title: string
  description: string | null
  payload: Record<string, unknown>
  risk_level: string | null
  created_at: string
}

interface Observation {
  id: string
  agent_id: string
  title: string
  observation: string
  suggestion: string | null
  related_approval_id: string | null
  /** Sätts av rutten när kortet funnits men inte längre är pending. */
  had_approval?: boolean
  created_at: string
}

interface RescheduleSuggestion {
  suggestion_id: string
  title: string
  description: string
  suggested_data: Record<string, any> | null
  created_at: string
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

interface JarvisHomeProps {
  greetingName: string
  bookings: BookingRow[]
  bookingsLoaded: boolean
  pipelineStats: { totalDeals: number; totalValue: number; newLeadsToday: number } | null
  economics: { unpaidCount: number; unpaidAmount: number } | null
}

function formatKr(n: number): string {
  return `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)} kr`
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'nyss'
  if (mins < 60) return `${mins} min sen`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} tim sen`
  return `${Math.floor(hours / 24)} dag sen`
}

/** "igår 15:40" · "i morse 07:42" · "3 augusti 15:40" */
function whenLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sammaDag = d.toDateString() === now.toDateString()
  const igar = new Date(now.getTime() - 86400000).toDateString() === d.toDateString()
  const klocka = formatClock(iso)
  if (sammaDag) return `idag ${klocka}`
  if (igar) return `igår ${klocka}`
  return `${d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })} ${klocka}`
}

function getServiceFromNotes(notes: string): string {
  if (!notes) return 'Tjänst'
  return notes.split(' - ')[0] || notes.substring(0, 20)
}

export default function JarvisHome({
  greetingName,
  bookings,
  bookingsLoaded,
  pipelineStats,
  economics,
}: JarvisHomeProps) {
  const business = useBusiness()
  const { setIsOpen: openJobbkompisen } = useJobbuddy()

  const [approvals, setApprovals] = useState<Approval[]>([])
  const [queueLoaded, setQueueLoaded] = useState(false)
  const [observations, setObservations] = useState<Observation[]>([])
  const [reschedules, setReschedules] = useState<RescheduleSuggestion[]>([])
  const [doneRows, setDoneRows] = useState<DoneRow[]>([])
  const [doneOpen, setDoneOpen] = useState(false)
  const [lastResolvedAt, setLastResolvedAt] = useState<string | null>(null)

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [detailIds, setDetailIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [snack, setSnack] = useState<{ approvalId: string; text: string } | null>(null)
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null)
  const [proof, setProof] = useState<string | null>(null)

  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
  }, [])

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/approvals?status=pending&limit=15', { headers: await authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setApprovals(data.approvals || [])
      }
    } catch { /* tomt är rätt svar — hemskärmen får aldrig krascha på kön */ }
    setQueueLoaded(true)
  }, [authHeaders])

  useEffect(() => { void fetchQueue() }, [fetchQueue])

  useEffect(() => {
    if (!business?.business_id) return
    const ch = supabase
      .channel('jarvis-queue')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'pending_approvals', filter: `business_id=eq.${business.business_id}` },
        () => { void fetchQueue() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [business?.business_id, fetchQueue])

  // Värt att veta: observationerna agenterna skrivit, minus de som redan har
  // ett kort i beslutssektionen — annars stod samma sak på två ställen.
  useEffect(() => {
    let active = true
    fetch('/api/observations?limit=12')
      .then(r => (r.ok ? r.json() : { observations: [] }))
      .then(d => { if (active) setObservations(d.observations || []) })
      .catch(() => { if (active) setObservations([]) })
    return () => { active = false }
  }, [])

  // Frågeläget: bokningskrockar som AI:n stötte på och inte kunde lösa.
  useEffect(() => {
    let active = true
    fetch('/api/suggestions?type=reschedule&status=pending')
      .then(r => (r.ok ? r.json() : { suggestions: [] }))
      .then(d => { if (active) setReschedules(d.suggestions || d.data || []) })
      .catch(() => { if (active) setReschedules([]) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    fetch('/api/automations/activity?limit=30')
      .then(r => (r.ok ? r.json() : null))
      .then(res => {
        if (!active || !res?.data) return
        const midnatt = new Date(); midnatt.setHours(0, 0, 0, 0)
        setDoneRows(
          (res.data as Array<any>)
            .filter(a => new Date(a.created_at) >= midnatt && a.status !== 'failed' && a.description)
            .slice(0, 12)
            .map(a => ({
              key: `${a.source}-${a.id}`,
              time: formatClock(a.created_at),
              agent: a.agent_id || 'matte',
              text: String(a.description),
              // AUTO kommer nu från servern (approval_id IS NULL), inte från
              // en klientgissning. Ett märke som gissar är värre än inget.
              auto: a.auto !== false,
            })),
        )
      })
      .catch(() => { /* loggen är en bekvämlighet, aldrig blockerande */ })
    return () => { active = false }
  }, [])

  // Tomma lägets tidsstämpel: när behövde något dig senast?
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/approvals?status=resolved&limit=1', { headers: await authHeaders() })
        if (!res.ok || !active) return
        const d = await res.json()
        const senaste = (d.approvals || [])[0]
        if (senaste?.resolved_at) setLastResolvedAt(senaste.resolved_at)
      } catch { /* tomt läge klarar sig utan tidsstämpeln */ }
    })()
    return () => { active = false }
  }, [authHeaders])

  useEffect(() => {
    let active = true
    fetch('/api/dashboard/team-activity')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!active || !d?.summary) return
        const s = d.summary
        // Substantivfraser, inte verbfraser. "Senaste dygnet tog 7 samtal …
        // teamet" är svengelska med subjektet på fel plats; en uppräkning
        // slipper böjningen helt och läses snabbare.
        const delar: string[] = []
        if (s.total_calls > 0) delar.push(`${s.total_calls} samtal`)
        if (s.total_sms > 0) delar.push(`${s.total_sms} SMS`)
        if (s.total_quotes > 0) delar.push(`${s.total_quotes} offert${s.total_quotes > 1 ? 'er' : ''}`)
        if (s.total_bookings_updated > 0) delar.push(`${s.total_bookings_updated} bokning${s.total_bookings_updated > 1 ? 'ar' : ''}`)
        if (delar.length === 0 && s.total_automations > 0) delar.push(`${s.total_automations} åtgärd${s.total_automations > 1 ? 'er' : ''}`)
        setProof(delar.length ? delar.join(', ').replace(/,([^,]*)$/, ' och$1') : null)
      })
      .catch(() => { /* bandet är inte kritiskt */ })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const timers = pendingTimers.current
    return () => { timers.forEach(t => clearTimeout(t)) }
  }, [])

  function flash(text: string, isError = false) {
    setFeedback({ text, isError })
    setTimeout(() => setFeedback(null), 4000)
  }

  async function executeSend(approval: Approval, action: 'approve' | 'reject' | 'edit', editedText?: string) {
    pendingTimers.current.delete(approval.id)
    try {
      const body: Record<string, unknown> = { action }
      if (action === 'edit') {
        const fragment = editedText != null ? buildApprovalEdit(approval, editedText) : null
        if (fragment) body.edited_payload = fragment
      }
      const res = await fetch(`/api/approvals/${approval.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        setHiddenIds(prev => { const n = new Set(prev); n.delete(approval.id); return n })
        flash(res.status === 409
          ? 'Ärendet hanterades redan någon annanstans'
          : 'Kunde inte spara — försök igen', true)
        if (res.status === 409) void fetchQueue()
        return
      }
      // ═══ SVARET LÄSES (innehållskontraktet, 2026-08-08) ═══
      //
      // Servern har hela tiden svarat ärligt: ett kort som inte kan utföras
      // returnerar { executed: false, note: 'Öppna ärendet och granska det
      // innan något skickas.' } (lib/approvals/action-contract.ts). Klienten
      // kastade svaret och skrev "skickade: …" oavsett — hantverkaren fick
      // veta att något gått iväg när ingenting hade hänt.
      // Fälten ligger nästlade under `execution` (route.ts returnerar
      // { success, action, execution, execution_outcome }), inte på toppnivå.
      const svar = await res.json().catch(() => ({} as any))
      const utforande = svar?.execution ?? {}

      setApprovals(prev => prev.filter(a => a.id !== approval.id))
      setDoneRows(prev => [{
        key: `fresh-${approval.id}`,
        time: formatClock(new Date().toISOString()),
        agent: agentForApproval(approval),
        text: doneRowText({
          action,
          title: approval.title,
          executed: utforande?.executed,
          note: utforande?.note,
        }),
        auto: false,
        fresh: true,
      }, ...prev])
    } catch {
      setHiddenIds(prev => { const n = new Set(prev); n.delete(approval.id); return n })
      flash('Kunde inte spara — försök igen', true)
    }
  }

  function queueAction(approval: Approval, action: 'approve' | 'reject' | 'edit', editedText?: string) {
    setEditingId(null)
    setHiddenIds(prev => new Set(prev).add(approval.id))
    setSnack({
      approvalId: approval.id,
      // Ångra-rutan sa "Skickar: …" även för kort som inte kan skicka något.
      // Samma lögn som Klart idag-raden, bara några sekunder tidigare.
      text: action === 'reject'
        ? 'Förslaget avvisas'
        : mayExecute(approval.approval_type)
          ? `Skickar: ${approval.title.slice(0, 60)}`
          : `Behandlar: ${approval.title.slice(0, 60)}`,
    })
    const timer = setTimeout(() => {
      setSnack(null)
      void executeSend(approval, action, editedText)
    }, UNDO_WINDOW_MS)
    pendingTimers.current.set(approval.id, timer)
  }

  function undo(approvalId: string) {
    const t = pendingTimers.current.get(approvalId)
    if (t) clearTimeout(t)
    pendingTimers.current.delete(approvalId)
    setHiddenIds(prev => { const n = new Set(prev); n.delete(approvalId); return n })
    setSnack(null)
  }

  function onCardAction(approval: Approval, action: CardAction) {
    if (action.id === 'approve') return queueAction(approval, 'approve')
    if (action.id === 'reject') return queueAction(approval, 'reject')
    // 'open' finns bara på kort som INTE får utföras med ett klick
    // (REVIEW_REQUIRED m.fl., se lib/jarvis/card-voice.ts). Det öppnar
    // detaljvyn i stället för att skicka något — vilket är exakt vad serverns
    // note säger att man ska göra.
    if (action.id === 'open') {
      setDetailIds(prev => new Set(prev).add(approval.id))
      setExpandedIds(prev => new Set(prev).add(approval.id))
      return
    }
    if (action.id === 'edit') {
      setEditingId(approval.id)
      setEditText(approvalPreview(approval).text)
      setExpandedIds(prev => new Set(prev).add(approval.id))
    }
  }

  const synliga = approvals.filter(a => !hiddenIds.has(a.id))
  const beslut = synliga.length + reschedules.length
  const koTom = queueLoaded && beslut === 0

  // Observationer vars ärende redan står som kort ovanför filtreras bort —
  // samma sak på två ställen gör att man slutar läsa båda.
  // Nyhetsrader = observationer som ALDRIG haft ett beslutskort. had_approval
  // sätts av /api/observations när kortet funnits men är hanterat — utan den
  // dök ett nyss avfärdat kort upp igen som nyhet längre ned på sidan.
  const nyheter = observations.filter(o => !o.related_approval_id && !o.had_approval)

  // Närvarobandet: samma två källor som resten av sidan visar, omformade per
  // agent. Observationerna först — de är vad agenten SÄGER — och Klart idag
  // efter, som är vad hon GJORT. Ingen extra hämtning.
  const narvaro = byggNarvaro([
    ...observations.map(o => ({ agentId: o.agent_id, text: o.observation, vid: o.created_at })),
    ...doneRows.map(r => ({ agentId: r.agent, text: r.text, vid: r.time })),
  ])

  return (
    <div className="max-w-[1180px] mx-auto px-4 sm:px-8 pt-6 sm:pt-7 pb-9">
      <div className="grid lg:grid-cols-[1fr_320px] gap-6 lg:gap-7">
        {/* ── Huvudspalten ─────────────────────────────────────────────── */}
        <div className="min-w-0 lg:row-start-1 lg:col-start-1">
          <h1 className="font-heading text-[22px] sm:text-[26px] font-bold tracking-[-0.02em] text-slate-900 m-0">
            {greetingName ? `God morgon, ${greetingName}` : 'God morgon'}
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 leading-normal">
            {new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
            {/* Tidsfönstret är ett RULLANDE dygn (team-activity, HOURS_BACK=24).
                Texten säger det den mäter — inte "sedan igår kväll". */}
            {proof && <> · Teamet har senaste dygnet hanterat <b className="font-semibold text-slate-800">{proof}</b>.</>}
          </p>

          {/* Teamets ansikten före besluten. Härlett ur observationerna och
              Klart idag — ingen egen hämtning, ingen påhittad aktivitet. */}
          <TeamPresenceBand rader={narvaro} />

          {feedback && (
            <div className={`mt-4 px-3.5 py-2.5 border rounded-xl text-sm font-medium ${
              feedback.isError
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}>
              {feedback.text}
            </div>
          )}

          {/* ── Kräver ditt beslut ── */}
          <div className="flex items-baseline gap-2 mt-6 mb-2.5">
            <h2 className="m-0 text-[15px] font-semibold text-slate-900">Kräver ditt beslut</h2>
            {beslut > 0 && (
              <span className="font-heading text-xs font-bold bg-primary-700 text-white rounded-full min-w-[21px] h-[21px] px-1.5 inline-flex items-center justify-center">
                {beslut}
              </span>
            )}
            {/* Göms under sm — vid 390px trängde den ut rubriken. */}
            <span className="ml-auto text-xs text-slate-400 hidden sm:inline">Allt annat sköter teamet själva</span>
          </div>

          {!queueLoaded ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-center min-h-[88px]">
              <Loader2 className="w-4 h-4 text-slate-300 animate-spin" />
            </div>
          ) : koTom ? (
            <EmptyQueue lastResolvedAt={lastResolvedAt} />
          ) : (
            <div className="space-y-2.5">
              {synliga.map((approval, i) => (
                <ApprovalCard
                  key={approval.id}
                  approval={approval}
                  expanded={i < MAX_FULL_CARDS || expandedIds.has(approval.id)}
                  editing={editingId === approval.id}
                  editText={editText}
                  onEditText={setEditText}
                  onExpand={() => setExpandedIds(prev => new Set(prev).add(approval.id))}
                  onAction={a => onCardAction(approval, a)}
                  detailOpen={detailIds.has(approval.id)}
                  onToggleDetail={() => setDetailIds(prev => { const n = new Set(prev); n.has(approval.id) ? n.delete(approval.id) : n.add(approval.id); return n })}
                  onSaveEdit={() => queueAction(approval, 'edit', editText)}
                  onCancelEdit={() => setEditingId(null)}
                />
              ))}

              {/* Frågeläget — bokningskrockar AI:n inte kunde lösa själv. */}
              {reschedules.map(s => {
                // Tiderna finns i suggested_data (lib/approve-actions.ts):
                // önskad start/slut som ISO, krockarna som formaterade
                // strängar. Går de att läsa ritar vi överlappet; går de inte
                // det står beskrivningen kvar. Aldrig både och — två
                // beskrivningar av samma krock är en för mycket.
                const bokat = parseKonflikter(s.suggested_data?.conflicts)
                const oStart = minuterFranIso(s.suggested_data?.requested_start)
                const oSlut = minuterFranIso(s.suggested_data?.requested_end)
                const onskad = oStart !== null
                  ? { titel: s.suggested_data?.service || 'Ny bokning', startMin: oStart, slutMin: oSlut ?? oStart + 60 }
                  : null
                const harTidslinje = bokat.length > 0 || onskad !== null

                return (
                  <AgentDecisionCard
                    key={s.suggestion_id}
                    agentKey="lars"
                    voice="fragar"
                    typeLabel="Schema"
                    timeLabel={timeAgo(s.created_at)}
                    title={s.title}
                    alternatives={[
                      { id: 'kalender', label: 'Välj en annan tid' },
                      { id: 'kund', label: 'Fråga kunden' },
                    ]}
                    onAction={() => { window.location.href = '/dashboard/schedule' }}
                    deepLink={{ label: 'Öppna kalendern →', href: '/dashboard/schedule' }}
                  >
                    {harTidslinje ? (
                      <ScheduleTimeline bokat={bokat} onskad={onskad} />
                    ) : s.description ? (
                      <CardFactBox>
                        <p className="m-0 text-[13px] text-slate-600 leading-relaxed whitespace-pre-line">
                          {s.description}
                        </p>
                      </CardFactBox>
                    ) : null}
                  </AgentDecisionCard>
                )
              })}

              {approvals.length >= 15 && (
                <Link href="/dashboard/approvals" className="block text-center text-xs font-semibold text-primary-700 hover:text-primary-800 py-2">
                  Se alla i Godkännanden
                </Link>
              )}
            </div>
          )}

          {/* ── Värt att veta ── */}
          {nyheter.length > 0 && (
            <>
              <div className="flex items-baseline gap-2 mt-6 mb-2">
                <h2 className="m-0 text-[15px] font-semibold text-slate-900">Värt att veta</h2>
                <span className="text-xs text-slate-400">Inget att godkänna — bara läget</span>
              </div>
              <div>
                {nyheter.slice(0, 5).map(o => {
                  const atgard = nyhetsAtgard(o.agent_id)
                  return (
                    <AgentNewsRow
                      key={o.id}
                      agentKey={o.agent_id}
                      link={atgard ? { label: atgard.label, href: atgard.href, icon: NYHETS_IKON[atgard.ikon] } : undefined}
                    >
                      {o.observation}
                      {o.suggestion && <span className="text-slate-500"> {o.suggestion}</span>}
                    </AgentNewsRow>
                  )
                })}
              </div>
            </>
          )}

          {/* ── Klart idag ── */}
          {doneRows.length > 0 && (
            <div className="mt-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setDoneOpen(o => !o)}
                className="w-full flex items-center gap-2 px-4 py-3 min-h-[44px] text-left"
              >
                <Check className="w-4 h-4 text-primary-700 shrink-0" />
                <span className="text-sm font-semibold text-slate-700">
                  Klart idag · {doneRows.length} åtgärd{doneRows.length > 1 ? 'er' : ''}
                </span>
                <span className="text-xs text-slate-400">
                  {doneRows.filter(r => r.auto).length} automatiskt · {doneRows.filter(r => !r.auto).length} godkända av dig
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 ml-auto shrink-0 transition-transform ${doneOpen ? 'rotate-180' : ''}`} />
              </button>
              {doneOpen && (
                <ul className="border-t border-slate-100 divide-y divide-slate-50">
                  {doneRows.map(r => (
                    <li key={r.key} className={`flex items-center gap-2.5 px-4 py-2.5 ${r.fresh ? 'bg-primary-50/50' : ''}`}>
                      <span className="font-mono text-[11px] text-slate-400 w-10 shrink-0">{r.time}</span>
                      <AgentAvatar agentKey={r.agent} size="sm" />
                      <span className="flex-1 min-w-0 text-[13px] text-slate-600 truncate">{r.text}</span>
                      {/* Bocken är reserverad för mänskliga beslut. Maskinens
                          eget arbete får ett eget, neutralt märke. */}
                      {r.auto ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 shrink-0">
                          Automatiskt
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary-700 bg-primary-50 rounded-full px-2 py-0.5 shrink-0">
                          <Check className="w-3 h-3" /> Godkänt av dig
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

        </div>

        {/* ── Högerspalten — gräv-ingångarna ───────────────────────────── */}
        <aside className="flex flex-col gap-3 min-w-0 lg:row-start-1 lg:col-start-2">
          <RailCard title="Dagens plan" href="/dashboard/schedule">
            {!bookingsLoaded ? (
              <div className="h-16 bg-slate-50 rounded-lg animate-pulse" />
            ) : bookings.length === 0 ? (
              <p className="text-[13px] text-slate-400 m-0">Inget bokat idag.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {bookings.slice(0, 3).map(b => (
                  <Link key={b.booking_id} href={`/dashboard/bookings/${b.booking_id}`} className="flex items-center gap-2.5 min-h-[44px] -my-1">
                    <span className="font-heading text-[13px] text-primary-700 w-11 shrink-0">{formatClock(b.scheduled_start)}</span>
                    <span className="w-[3px] h-8 rounded-sm bg-primary-500 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900 truncate">{b.customer?.name || 'Kund'}</span>
                      <span className="block text-xs text-slate-400 truncate">{getServiceFromNotes(b.notes)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </RailCard>

          <RailCard title="Verksamheten" href="/dashboard/pipeline">
            {pipelineStats ? (
              <>
                <span className="block font-heading text-2xl font-bold text-slate-900">{formatKr(pipelineStats.totalValue)}</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  {pipelineStats.totalDeals} affärer i flödet · {pipelineStats.newLeadsToday} nya idag
                </span>
              </>
            ) : (
              <div className="h-10 bg-slate-50 rounded-lg animate-pulse" />
            )}
          </RailCard>

          <RailCard title="Fakturor" href="/dashboard/invoices?status=sent">
            {economics ? (
              <>
                <span className="block font-heading text-2xl font-bold text-slate-900">{formatKr(economics.unpaidAmount)}</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  {economics.unpaidCount > 0 ? `${economics.unpaidCount} obetalda · Karin bevakar` : 'Inga obetalda — Karin bevakar'}
                </span>
              </>
            ) : (
              <div className="h-10 bg-slate-50 rounded-lg animate-pulse" />
            )}
          </RailCard>

          {/* Karins bolagskalender. Renderar ingenting för anställda, och
              inget när profilen saknar uppgifter — en widget som säger
              "inget på gång" när vi inte vet vore osann. */}
          <PengarRailCard />
          <KarinCalendarWidget />
        </aside>

        {/* ── Skrivraden ───────────────────────────────────────────────────
             SIST, inte först. Allt ovanför klaras utan tangentbord — en
             textruta som svarar hade varit en sämre meny med extra
             skrivarbete. Öppnar befintliga Jobbkompisen (riktiga Matte, med
             röst), så ingen ny chattbackend behövs.

             Eget rutnätsbarn i stället för sist i huvudspalten: på mobil
             hamnar den då efter gräv-korten, som en hantverkare på bygget har
             mer nytta av än en skrivrad. På desktop ligger den kvar under
             huvudspalten precis som i mockupen. */}
        <button
          type="button"
          onClick={() => openJobbkompisen(true)}
          className="lg:row-start-2 lg:col-start-1 w-full flex items-center gap-2.5 h-12 pl-[18px] pr-2 bg-white border border-slate-200 rounded-full text-sm text-slate-400 hover:border-slate-300 transition-colors"
        >
          <span className="flex-1 text-left truncate">Skriv till teamet — eller tryck. Allt ovanför klaras utan tangentbord.</span>
          <span className="w-9 h-9 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center shrink-0">
            <Mic className="w-4 h-4" />
          </span>
        </button>
      </div>

      {/* Ångra-snackbaren. POST:en har INTE gått iväg än. */}
      {snack && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-800 text-white rounded-xl pl-4 pr-2 py-2.5 shadow-lg">
          <span className="text-sm">{snack.text}</span>
          <button
            type="button"
            onClick={() => undo(snack.approvalId)}
            className="inline-flex items-center gap-1.5 px-3 min-h-[36px] text-sm font-semibold text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <Undo2 className="w-4 h-4" /> Ångra
          </button>
        </div>
      )}
    </div>
  )
}

function EmptyQueue({ lastResolvedAt }: { lastResolvedAt: string | null }) {
  return (
    <div className="bg-white border border-dashed border-slate-200 rounded-2xl px-5 py-7 text-center">
      <span className="w-11 h-11 rounded-full bg-primary-50 text-primary-700 inline-flex items-center justify-center mb-2">
        <Check className="w-5 h-5" strokeWidth={2.5} />
      </span>
      <h3 className="font-semibold text-slate-900 m-0">Inget väntar på dig</h3>
      <p className="text-sm text-slate-500 mt-0.5 m-0">Teamet jobbar vidare — vi säger till när något behöver dig.</p>
      {/* Tystnaden får ett bevis. Ytan hittar aldrig på sysslor. */}
      {lastResolvedAt && (
        <p className="text-xs text-slate-400 mt-3 m-0">
          Senast något behövde dig: {whenLabel(lastResolvedAt)}
        </p>
      )}
    </div>
  )
}

function ApprovalCard({
  approval,
  expanded,
  editing,
  editText,
  onEditText,
  onExpand,
  onAction,
  onSaveEdit,
  onCancelEdit,
  detailOpen,
  onToggleDetail,
}: {
  approval: Approval
  expanded: boolean
  editing: boolean
  editText: string
  onEditText: (t: string) => void
  onExpand: () => void
  onAction: (a: CardAction) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  detailOpen: boolean
  onToggleDetail: () => void
}) {
  const agentKey = agentForApproval(approval)
  const preview = approvalPreview(approval)
  const pl = (approval.payload || {}) as Record<string, any>
  const summary =
    approval.approval_type === 'create_quote_draft' ? quoteDraftSummary(pl.preview) : null

  // Kompakt rad när kortet inte är utfällt — samma mönster som Idag-vyn, så
  // en lång kö inte blir en vägg.
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={onExpand}
        className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 min-h-[44px] flex items-center gap-3 text-left hover:border-primary-200 transition-colors"
      >
        <AgentAvatar agentKey={agentKey} size="sm" />
        <span className="flex-1 min-w-0 text-sm text-slate-600 truncate">
          <b className="font-semibold text-slate-900">{AGENT_INFO[agentKey]?.name || 'Teamet'}</b>
          {' · '}{approval.title}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-300 shrink-0" />
      </button>
    )
  }

  // ═══ RÖSTEN HÄRLEDS UR KONTRAKTET (2026-08-08) ═══
  //
  // Stod tidigare hårdkodat som "foreslar" här, för VARJE korttyp. Men
  // missad_intakt, review_auto_invoice och four_eyes_* är REVIEW_REQUIRED —
  // de kan inte utföras. Kortet sa alltså "föreslår" och visade Godkänn, och
  // ett klick gav "skickade: …" i Klart idag fast servern svarat att
  // ingenting skickades. Se lib/jarvis/card-voice.ts.
  const rost = voiceFor(approval.approval_type)

  return (
    <AgentDecisionCard
      agentKey={agentKey}
      voice={rost}
      // 'fragar' bygger sina knappar ur alternativen — och sätter approves:false
      // på allihop, så ett granskningskort inte KAN utlösa ett godkännande.
      alternatives={rost === 'fragar' ? reviewAlternatives(approval.approval_type) : undefined}
      typeLabel={typeLabel(approval.approval_type)}
      timeLabel={timeAgo(approval.created_at)}
      title={approval.title}
      // Vem och vad — alltid. Utan den fick hantverkaren "Kunden har en fråga
      // om offerten" utan att veta vilken kund eller vilken offert.
      context={cardContext(approval.payload)}
      description={approval.description}
      attention={needsAttention(approval)}
      approveLabel={approveLabel(approval.approval_type, approval.payload)}
      editable={isEditable(approval)}
      onAction={onAction}
      deepLink={deepLinkFor(approval) || undefined}
      // I redigeringsläget äger kortet sina egna knappar. Två uppsättningar
      // Godkänn på samma kort gör valet oklart.
      actionsHidden={editing}
      expanded={detailOpen}
      // Kortet växer på sin plats i stället för att navigera bort — inget
      // tappas, och bakgrunden ligger kvar. Tidsstämpeln står kvar i hopfällt
      // läge; uppfällt tar "Fäll ihop" dess plats, som i mockupen.
      headerSlot={
        summary?.ready ? (
          <span className="inline-flex items-center gap-2 shrink-0">
            {!detailOpen && <span className="text-xs text-slate-400 hidden sm:inline">{timeAgo(approval.created_at)}</span>}
            <button
              type="button"
              onClick={onToggleDetail}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-primary-700 min-h-[32px] px-1 whitespace-nowrap transition-colors"
            >
              {detailOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {detailOpen ? 'Fäll ihop' : 'Läs raderna'}
            </button>
          </span>
        ) : undefined
      }
    >
      {detailOpen && summary?.ready && (
        <>
          <QuoteDraftDetail
            summary={summary}
            conditions={['Sparas som utkast', pl.job_type ? String(pl.job_type) : ''].filter(Boolean)}
            notIncluded={pl.preview?.not_included_suggestions || undefined}
          />
          <div className="flex mb-3">
            <QuoteToolExit href="/dashboard/quotes" />
          </div>
        </>
      )}

      {/* Beloppsrutan — samma räknare som offerteditorn, så kortets siffra
          inte kan gå isär med den offert som sparas. */}
      {!detailOpen && summary?.ready && (
        <CardFactBox>
          {summary.rows.map(r => (
            <div key={r.label} className="flex justify-between text-[13px] text-slate-600 py-0.5">
              <span>{r.label}</span>
              <span className={`font-heading font-semibold ${r.deduction ? 'text-primary-700' : ''}`}>
                {r.deduction ? '−' : ''}{formatKr(r.amount)}
              </span>
            </div>
          ))}
          <div className="flex justify-between items-baseline border-t border-slate-200 mt-1.5 pt-2">
            <span className="text-[13px] font-semibold text-slate-900">Kunden betalar</span>
            <span className="font-heading text-lg font-bold text-slate-900">{formatKr(summary.customerPays)}</span>
          </div>
        </CardFactBox>
      )}

      {!summary?.ready && preview.text && !editing && (
        <CardFactBox quote>&quot;{preview.text}&quot;</CardFactBox>
      )}

      {editing && (
        <div className="mb-3">
          <textarea
            value={editText}
            onChange={e => onEditText(e.target.value)}
            className="w-full text-sm text-slate-800 border border-primary-300 rounded-xl px-3.5 py-2.5 min-h-[88px] resize-y focus:outline-none focus:ring-4 focus:ring-primary-600/[0.08]"
          />
          <div className="flex items-center gap-2 mt-2">
            <button type="button" onClick={onSaveEdit} className="inline-flex items-center gap-1.5 h-[38px] px-4 bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold rounded-xl transition-colors">
              <Check className="w-4 h-4" /> Spara &amp; godkänn
            </button>
            <button type="button" onClick={onCancelEdit} className="h-[38px] px-3 text-sm font-medium text-slate-400 hover:text-slate-600 rounded-xl">
              Avbryt
            </button>
          </div>
        </div>
      )}
    </AgentDecisionCard>
  )
}
