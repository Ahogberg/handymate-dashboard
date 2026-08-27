'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
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
  Phone,
  ExternalLink,
  Star,
  Globe,
  ClipboardCheck,
  ClipboardList,
  Sparkles,
  FileDiff,
  Award,
  KeyRound,
  Lightbulb,
  Users,
  ListChecks,
  Camera,
  FlaskConical,
  Wrench,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { AGENT_INFO } from '@/components/dashboard/agentPersonas'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { agentForApproval, ringUppmaning } from '@/lib/jarvis/approval-view'
import { MandagskortCard } from '@/components/jarvis/MandagskortCard'
import { GuardianOrsaker } from '@/components/projects/GuardianOrsaker'
import { DispatchReasoning } from '@/components/dispatch/DispatchReasoning'
import { buildValueReceipt } from '@/lib/approvals/value-receipt'
import ProjectCloseoutModal from '@/components/projects/ProjectCloseoutModal'

// Reskin 2026-08-18 (Command Center-språket, docs/HANDYMATE_DESIGN_SYSTEM.md):
// den lokala agent-kartan (SPÅR D1:s fjärde kopia, nämnd i
// agentPersonas.ts:s filhuvud) är borttagen — agenten härleds nu genom
// samma agentForApproval() som hemskärmen/GorDettaForst redan använder,
// och ritas med <AgentAvatar>. Ren visuell konsolidering, ingen ändrad
// routing (samma explicit-payload-först-regel, bara med 'matte' som
// ärligt fallback i stället för att tyst falla tillbaka på typ-ikonen).

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
  send_quote: { label: 'Offert', icon: FileText, bgColor: 'bg-primary-50', textColor: 'text-primary-700' },
  send_invoice: { label: 'Faktura', icon: Receipt, bgColor: 'bg-green-50', textColor: 'text-green-600' },
  create_booking: { label: 'Bokning', icon: Calendar, bgColor: 'bg-cyan-50', textColor: 'text-cyan-700' },
  autopilot_package: { label: 'Autopilot', icon: Zap, bgColor: 'bg-amber-50', textColor: 'text-amber-600' },
  quote_nudge: { label: 'Manuell åtgärd', icon: Phone, bgColor: 'bg-primary-50', textColor: 'text-primary-700' },
  low_stock_alert: { label: 'Lager', icon: Package, bgColor: 'bg-red-50', textColor: 'text-red-600' },
  seasonal_campaign: { label: 'Säsong', icon: Calendar, bgColor: 'bg-orange-50', textColor: 'text-orange-600' },
  time_attestation: { label: 'Tid', icon: Clock, bgColor: 'bg-primary-50', textColor: 'text-primary-600' },
  create_invoice_from_report: { label: 'Faktura', icon: Receipt, bgColor: 'bg-green-50', textColor: 'text-green-600' },
  dispatch_suggestion: { label: 'Tilldelning', icon: Zap, bgColor: 'bg-slate-100', textColor: 'text-slate-600' },
  review_request: { label: 'Recension', icon: Star, bgColor: 'bg-amber-50', textColor: 'text-amber-700' },
  publish_microsite: { label: 'Hemsida', icon: Globe, bgColor: 'bg-teal-50', textColor: 'text-teal-700' },
  // Förtjänad autonomi: erbjudande om att låta agenten sköta typen själv.
  autonomy_offer: { label: 'Förtroende', icon: CheckCircle, bgColor: 'bg-emerald-50', textColor: 'text-emerald-700' },
  lead_review: { label: 'Ny lead', icon: Phone, bgColor: 'bg-amber-50', textColor: 'text-amber-700' },
  // Akut: kund tror de har ett projekt men auto-skapande failade. Röd för
  // att signalera att hantverkaren måste agera nu (skapa projekt manuellt
  // eller kontakta support). Skapas från /api/quotes/public/[token] när
  // createProjectFromQuote() returnerar success=false eller kastar exception.
  manual_project_create: { label: 'Skapa projekt', icon: AlertTriangle, bgColor: 'bg-red-50', textColor: 'text-red-700' },
  // Egenkontroll-agenten (etapp 1b, tasks/easoft-gap-plan.md).
  egenkontroll_foto: { label: 'Egenkontroll', icon: ClipboardCheck, bgColor: 'bg-primary-50', textColor: 'text-primary-700' },
  egenkontroll_avvikelse: { label: 'Egenkontroll-avvikelse', icon: AlertTriangle, bgColor: 'bg-amber-50', textColor: 'text-amber-700' },
  // Checklistförslag vid projektskapande (etapp 1d, tasks/easoft-gap-plan.md).
  checklist_forslag: { label: 'Checklista', icon: ClipboardList, bgColor: 'bg-primary-50', textColor: 'text-primary-700' },
  // Tidrapport-förslag (etapp 2a, tasks/easoft-gap-plan.md) — projektnivå,
  // inte person (se lib/egenkontroll/suggest-time-entry.ts).
  tidrapport_forslag: { label: 'Tidrapport', icon: Clock, bgColor: 'bg-primary-50', textColor: 'text-primary-700' },
  // Auto-offertutkast från kvalificerad lead (etapp 2a, tasks/value-chain-plan.md).
  create_quote_draft: { label: 'Offertutkast', icon: Sparkles, bgColor: 'bg-primary-50', textColor: 'text-primary-700' },
  // ÄTA-kedjan (etapp 2b, tasks/value-chain-plan.md).
  create_ata_draft: { label: 'ÄTA-förslag', icon: FileDiff, bgColor: 'bg-primary-50', textColor: 'text-primary-700' },
  // Certifikatpåminnelsen (R3, tasks/resurs-masterplan.md).
  cert_expiry_reminder: { label: 'Certifikat', icon: Award, bgColor: 'bg-amber-50', textColor: 'text-amber-700' },
  // v3-automationsreglernas kort ("Faktura obetald 7+ dagar", "Ring kund om
  // offert") — visades som "Övrigt" (buggfix 2026-08-11).
  automation: { label: 'Påminnelse', icon: Clock, bgColor: 'bg-amber-50', textColor: 'text-amber-700' },
  // Meeting Intelligence Epic 2.
  meeting_summary: { label: 'Möte', icon: MessageSquare, bgColor: 'bg-primary-50', textColor: 'text-primary-700' },
  meeting_followup: { label: 'Uppföljning från möte', icon: Clock, bgColor: 'bg-primary-50', textColor: 'text-primary-700' },
  // Förtjänad autonomi — nedgradering vid upprepade fel (lib/autonomy/earned-autonomy.ts recordAutonomyFailure).
  autonomy_revoked: { label: 'Förtroende', icon: KeyRound, bgColor: 'bg-amber-50', textColor: 'text-amber-700' },
  // Project Debrief Capture (2026-08-12) — de korta frågorna vid projektstängning.
  project_debrief: { label: 'Efter jobbet', icon: Lightbulb, bgColor: 'bg-amber-50', textColor: 'text-amber-700' },
  // Startkorten (docs/design/FORSTA-30-MINUTERNA.md) — teamet presenterar
  // sig genom kortmekaniken vid onboarding-slut.
  team_intro: { label: 'Ditt team', icon: Users, bgColor: 'bg-primary-50', textColor: 'text-primary-700' },
  // Måndagskortet (Måndagsmötet etapp 1, 2026-08-13) — se lib/jarvis/monday-brief.ts.
  monday_brief: { label: 'Måndagskortet', icon: ListChecks, bgColor: 'bg-primary-50', textColor: 'text-primary-700' },
  // Jobbpass (Etapp Ä, Closeout-to-Lifetime, 2026-08-18) — se lib/jobbpass/jobbpass.ts.
  jobbpass_proposal: { label: 'Jobbpass', icon: Camera, bgColor: 'bg-primary-50', textColor: 'text-primary-700' },
  // OperatingExperiment Etapp 2 (2026-08-19) — se lib/experiment/propose.ts + report.ts.
  operating_experiment_proposal: { label: 'Försök', icon: FlaskConical, bgColor: 'bg-primary-50', textColor: 'text-primary-700' },
  operating_experiment_readout: { label: 'Försöksresultat', icon: FlaskConical, bgColor: 'bg-primary-50', textColor: 'text-primary-700' },
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

// Reskin 2026-08-18: dag-rubriken för den nya grupperingen. Listan kommer
// redan sorterad `created_at desc` från /api/approvals (samma ordning som
// innan — se app/api/approvals/route.ts) så samma-dags-rader ligger redan
// intill varandra. Rubriken ändrar alltså aldrig ORDNINGEN, bara lägger en
// synlig rad mellan dagarna.
function dayLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return 'Idag'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Igår'
  return date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })
}

// Reskin 2026-08-18: åldern på den äldsta väntande raden — headerns andra
// stat-tile. Ren klientberäkning ur samma `approvals`-lista som redan är
// hämtad (ingen ny endpoint, inget gissat tal).
function oldestPendingAgeLabel(pending: { created_at: string }[]): string | null {
  if (pending.length === 0) return null
  const oldest = pending.reduce((min, a) =>
    new Date(a.created_at).getTime() < new Date(min.created_at).getTime() ? a : min,
  pending[0])
  const diffMs = Date.now() - new Date(oldest.created_at).getTime()
  const hours = Math.floor(diffMs / 3600000)
  if (hours < 1) return `${Math.max(1, Math.floor(diffMs / 60000))} min`
  if (hours < 24) return `${hours} tim`
  return `${Math.floor(hours / 24)} dygn`
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

const QUOTE_RELATED_TYPES = ['quote_nudge', 'send_quote', 'quote_followup', 'quote_reminder']

function getQuoteId(approval: Approval): string | null {
  const p = approval.payload
  if (p?.quote_id) return p.quote_id as string
  if ((p?.context as any)?.quote_id) return (p.context as any).quote_id as string
  if (approval.package_data?.quote_id) return approval.package_data.quote_id
  return null
}

// Reskin 2026-08-18 (Kvittoprincipen — belopp inline, aldrig bakom en
// toggle): typer som redan bygger en egen detaljruta med sitt eget belopp
// (GuardianOrsaker, DispatchReasoning, tidrapportens grid osv.) ska inte
// FÅ en andra, konkurrerande summa på kortets header-rad.
const AMOUNT_HANDLED_TYPES = new Set([
  'time_attestation', 'dispatch_suggestion', 'profitability_warning',
  'monday_brief', 'lead_review', 'publish_microsite', 'seasonal_campaign',
  'autopilot_package',
])

/** Kortets header-belopp — bara kända, strukturerade payloadfält. Aldrig en
    gissning: samma fältnamn som approveLabel()/exekveraren redan litar på. */
function getPrimaryAmount(approval: Approval): number | null {
  if (AMOUNT_HANDLED_TYPES.has(approval.approval_type)) return null
  const p = (approval.payload || {}) as Record<string, any>
  const candidates = [
    p.amount_kr,
    p.preview?.customer_pays,
    p.estimated_value,
    p.amount_estimate,
    p.suggested_price,
    p.total,
  ]
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  }
  return null
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
  const [confirmModal, setConfirmModal] = useState<{ approval: Approval; editedPayload?: Record<string, unknown> } | null>(null)
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)
  // 2026-08-04 ("kritisk söm"-fixen): create_quote_draft/quote_addition/
  // create_ata_draft skapar nu ett riktigt offertutkast vid godkännande
  // (app/api/approvals/[id]/route.ts) — visa en direktlänk till det istället
  // för bara "Godkänt", annars vet hantverkaren inte var utkastet hamnade.
  const [feedbackLink, setFeedbackLink] = useState<string | null>(null)
  const [feedbackLinkLabel, setFeedbackLinkLabel] = useState('Öppna utkastet')
  // Fas 0-härdning (exec-chain-arvet 2026-08-05): tidigare visade sidan
  // "Godkänt" ÄVEN när utförandet misslyckats (fallback-grenen) och kortet
  // försvann ur kön — felet fanns bara i DB:n där ingen såg det. Nu: ärligt
  // felbesked som står kvar tills det stängs + "Försök igen", och en sektion
  // för misslyckade utföranden (fångar även fel vars HTTP-svar aldrig nådde
  // klienten — mobilkrasch, stängd flik).
  const [failedFeedback, setFailedFeedback] = useState<{ id: string; text: string } | null>(null)
  const [failedExecutions, setFailedExecutions] = useState<Approval[]>([])
  const [retryLoading, setRetryLoading] = useState<string | null>(null)
  // Project Debrief Capture (2026-08-12): kortet ska ALDRIG godkännas rakt
  // av — knappen öppnar den här modalen med de 2-3 frågorna som textareor.
  const [debriefModal, setDebriefModal] = useState<Approval | null>(null)
  const [debriefAnswers, setDebriefAnswers] = useState<string[]>([])
  const [closeoutProject, setCloseoutProject] = useState<{
    id: string
    name: string
    warnings: string[]
  } | null>(null)

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
      // Etapp 3a (multi-employee-parity-plan.md): hämtar via GET
      // /api/approvals istället för direkt Supabase-query — routing-
      // filtret (canActOnApproval) körs server-side där. Realtime-
      // subscriptionen nedan används fortfarande, men bara som "något
      // ändrades, hämta om"-trigger — inte längre som datakälla.
      // status='resolved' motsvarar den tidigare
      // .in('status', ['approved','rejected','expired','auto_approved']).
      const { data: { session } } = await supabase.auth.getSession()
      const status = activeTab === 'pending' ? 'pending' : 'resolved'
      const res = await fetch(`/api/approvals?status=${status}&limit=50`, {
        headers: {
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      })
      if (res.ok) {
        const result = await res.json().catch(() => null)
        setApprovals(result?.approvals || [])
      }
      // Misslyckade utföranden (senaste 7 dagarna) — egen pseudo-status i
      // GET-routen. Hämtas tyst; ett fel här får aldrig störa huvudkön.
      const failedRes = await fetch(`/api/approvals?status=execution_failed&limit=20`, {
        headers: {
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      }).catch(() => null)
      if (failedRes?.ok) {
        const failedResult = await failedRes.json().catch(() => null)
        setFailedExecutions(failedResult?.approvals || [])
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleRetry(id: string) {
    setRetryLoading(id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/approvals/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ action: 'retry' }),
      })
      const result = await res.json().catch(() => null)
      if (res.ok && result?.execution_outcome?.outcome === 'success') {
        const retriedItem = failedExecutions.find(a => a.id === id)
        const receipt = buildValueReceipt(retriedItem, result?.execution, result.execution_outcome.outcome)
        setFailedFeedback(null)
        setFailedExecutions(prev => prev.filter(a => a.id !== id))
        setFeedbackMsg(receipt?.text || 'Utfört!')
        setFeedbackLink(receipt?.link || null)
        setFeedbackLinkLabel(receipt?.linkLabel || 'Öppna utkastet')
        setTimeout(() => {
          setFeedbackMsg(null)
          setFeedbackLink(null)
        }, receipt?.link ? 10000 : 4000)
      } else if (res.status === 409) {
        setFailedFeedback({ id, text: 'Omkörning pågår redan — vänta en stund' })
      } else {
        const errText = result?.execution_outcome?.error_text || result?.error || 'Handlingen kunde inte utföras'
        setFailedFeedback({ id, text: `Misslyckades igen: ${errText}` })
        fetchApprovals()
      }
    } finally {
      setRetryLoading(null)
    }
  }

  // Agera-länkarna (#approval-<id> från insiktskorten/IdagCore) ska landa
  // PÅ kortet — browserns egen hash-scroll hinner köra innan listan är
  // hämtad, så vi scrollar själva när approvals väl finns. Highlight i
  // samma stil som TeamActivityStrips scrollIntoView-mönster.
  useEffect(() => {
    const hash = window.location.hash
    if (!hash.startsWith('#approval-') || approvals.length === 0) return
    const target = document.getElementById(hash.slice(1))
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.classList.add('ring-2', 'ring-primary-400', 'ring-offset-2')
    const timer = setTimeout(() => {
      target.classList.remove('ring-2', 'ring-primary-400', 'ring-offset-2')
    }, 2000)
    return () => clearTimeout(timer)
  }, [approvals])

  // Typer som INTE behöver bekräftelse (rena acknowledgements)
  const SKIP_CONFIRM = ['time_attestation', 'low_stock_alert', 'profitability_warning', 'dispatch_suggestion', 'quote_nudge', 'egenkontroll_foto', 'egenkontroll_avvikelse', 'checklist_forslag', 'tidrapport_forslag']

  function requestApprove(approval: Approval, editedPayload?: Record<string, unknown>) {
    if (SKIP_CONFIRM.includes(approval.approval_type)) {
      handleAction(approval.id, 'approve', editedPayload)
    } else {
      setConfirmModal({ approval, editedPayload })
    }
  }

  function confirmAndExecute() {
    if (!confirmModal) return
    handleAction(confirmModal.approval.id, 'approve', confirmModal.editedPayload)
    setConfirmModal(null)
  }

  async function handleAction(id: string, action: 'approve' | 'reject', editedPayload?: Record<string, unknown>) {
    setActionLoading(id + action)
    try {
      // Servern slår bara ihop edited_payload (och stämplar payload.edited,
      // som streak/approve_rate läser) vid action:'edit' — ett 'approve' med
      // ändringar skickade tidigare originaltexten och kastade redigeringen.
      const body: Record<string, unknown> = { action: action === 'approve' && editedPayload ? 'edit' : action }
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
        const result = await res.json().catch(() => null)
        // Hämta approval-typen innan vi filtrerar bort den
        const approvedItem = approvals.find(a => a.id === id)
        setApprovals(prev => prev.filter(a => a.id !== id))
        setEditingId(null)

        // Visa feedback baserat på vad som hände
        if (action === 'approve') {
          setFeedbackLink(null)
          setFeedbackLinkLabel('Öppna utkastet')
          const closeout = result?.execution?.closeout
          if (
            approvedItem?.approval_type === 'four_eyes_project_close'
            && closeout?.completed
            && closeout?.project?.project_id
          ) {
            setCloseoutProject({
              id: closeout.project.project_id,
              name: closeout.project.name || approvedItem.title,
              warnings: Array.isArray(closeout.warnings) ? closeout.warnings : [],
            })
          }
          // Ärlighets-grenen FÖRST (Fas 0-härdningen): säg aldrig "Godkänt"
          // när utförandet misslyckades. Server-klassningen
          // (classifyExecutionResult) är facit — inte klientens fälttolkning.
          if (result?.execution_outcome?.outcome === 'failed') {
            setFailedFeedback({
              id,
              text: `Godkänt — men utförandet misslyckades: ${result.execution_outcome.error_text || 'okänt fel'}`,
            })
            fetchApprovals()
            return
          }
          if (result?.execution_outcome?.outcome === 'skipped') {
            setFeedbackMsg(result?.execution?.note || 'Noterat — ingen handling utfördes')
          } else if (approvedItem?.approval_type === 'quote_nudge') {
            setFeedbackMsg('Påminnelse noterad — ring kunden när du har möjlighet')
          } else {
            const exec = result?.execution
            const valueReceipt = buildValueReceipt(approvedItem, exec, result?.execution_outcome?.outcome)
            if (valueReceipt) {
              setFeedbackMsg(valueReceipt.text)
              if (valueReceipt.link) setFeedbackLink(valueReceipt.link)
              if (valueReceipt.linkLabel) setFeedbackLinkLabel(valueReceipt.linkLabel)
            } else if (exec?.quote_id) {
              setFeedbackMsg(
                approvedItem?.approval_type === 'create_ata_draft' ? 'ÄTA-utkast skapat!' : 'Offertutkast skapat!',
              )
              setFeedbackLink(`/dashboard/quotes/${exec.quote_id}`)
            } else if (exec?.sms_sent) {
              setFeedbackMsg('SMS skickat!')
            } else if (exec?.acknowledged) {
              setFeedbackMsg('Godkänt')
            } else if (exec?.ok) {
              setFeedbackMsg('Utfört!')
            } else {
              setFeedbackMsg('Godkänt')
            }
          }
          // Länken (offertutkastet) får stå kvar längre — 4s räcker inte att
          // hinna klicka, en enkel textbekräftelse gör.
          setTimeout(() => {
            setFeedbackMsg(null)
            setFeedbackLink(null)
          }, result?.execution?.quote_id ? 10000 : 4000)
        }
      } else {
        // Buggfix 2026-08-11 (Andreas skärmdump): serverfel svaldes tyst —
        // kortet låg kvar, modalen stängdes, och "ingenting hände". Routen
        // returnerar svenska felmeddelanden skrivna för att VISAS (t.ex.
        // "Kortet ... går därför inte att godkänna härifrån") — visa dem.
        const errData = await res.json().catch(() => null)
        setFailedFeedback({
          id,
          text: errData?.error || `Något gick fel (HTTP ${res.status}) — kortet ligger kvar.`,
        })
      }
    } catch {
      setFailedFeedback({ id, text: 'Nätverksfel — kortet ligger kvar, prova igen.' })
    } finally {
      setActionLoading(null)
    }
  }

  // Project Debrief Capture (2026-08-12): öppnar modalen istället för att
  // godkänna direkt. Frågorna ligger i payload.questions
  // (lib/debrief/build-debrief-questions.ts) — en tom textarea per fråga.
  function openDebriefModal(approval: Approval) {
    const questions = (approval.payload?.questions as string[] | undefined) || []
    setDebriefAnswers(questions.map(() => ''))
    setDebriefModal(approval)
  }

  // Skickar action:'edit' (inte 'approve') — det är den enda action som
  // faktiskt slår ihop edited_payload in i payloaden innan exekveringen
  // (app/api/approvals/[id]/route.ts, finalPayload). Status blir ändå
  // 'approved', som en vanlig godkänn-med-ändringar.
  async function submitDebrief() {
    if (!debriefModal) return
    const id = debriefModal.id
    const questions = (debriefModal.payload?.questions as string[] | undefined) || []
    const answers: Record<string, string> = {}
    questions.forEach((q, i) => {
      const svar = (debriefAnswers[i] || '').trim()
      if (svar) answers[q] = svar
    })

    setActionLoading(id + 'approve')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/approvals/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ action: 'edit', edited_payload: { answers } }),
      })
      const result = await res.json().catch(() => null)
      if (res.ok) {
        setApprovals(prev => prev.filter(a => a.id !== id))
        setDebriefModal(null)
        if (result?.execution_outcome?.outcome === 'failed') {
          setFailedFeedback({
            id,
            text: `Godkänt — men utförandet misslyckades: ${result.execution_outcome.error_text || 'okänt fel'}`,
          })
          fetchApprovals()
          return
        }
        setFeedbackMsg(Object.keys(answers).length > 0 ? 'Tack — sparat till nästa offert' : 'Noterat')
        setTimeout(() => setFeedbackMsg(null), 4000)
      } else {
        setFailedFeedback({
          id,
          text: result?.error || `Något gick fel (HTTP ${res.status}) — kortet ligger kvar.`,
        })
      }
    } catch {
      setFailedFeedback({ id, text: 'Nätverksfel — kortet ligger kvar, prova igen.' })
    } finally {
      setActionLoading(null)
    }
  }

  function skipDebrief() {
    if (!debriefModal) return
    handleAction(debriefModal.id, 'reject')
    setDebriefModal(null)
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
    requestApprove(approval, editedPayload)
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
  // Reskin 2026-08-18 — headerns andra stat-tile. Samma `approvals`-lista
  // som pendingCount ovan (ingen ny fetch); se dayLabel/oldestPendingAgeLabel
  // filhuvud för varför den bara är sann på "Väntande"-fliken.
  const oldestPendingAge = oldestPendingAgeLabel(approvals.filter(a => a.status === 'pending'))

  return (
    <div className="bg-[#F8FAFC] min-h-screen">
      {/* Header — ljust block (JarvisHome äger den enda mörka heron, se
          docs/HANDYMATE_DESIGN_SYSTEM.md §4.0), boss-frame-undertitel +
          ärliga stat-tiles ur samma redan hämtade lista. */}
      <div className="px-4 sm:px-8 pt-6 pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5 text-primary-700" />
            </div>
            <div className="min-w-0">
              <h1 className="font-heading text-xl font-bold text-slate-900">Godkännanden</h1>
              <p className="text-sm text-slate-500">Inget når en kund utan ditt OK — här är allt som väntar.</p>
            </div>
          </div>
          <button
            onClick={fetchApprovals}
            className="p-2.5 min-h-[44px] min-w-[44px] rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all shrink-0"
            aria-label="Uppdatera"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {(feedbackMsg || failedFeedback) && (
          <div className="mt-3">
            {feedbackMsg && (
              <div className="px-4 py-2 bg-primary-50 border border-primary-100 rounded-input text-sm text-primary-700 font-medium flex items-center gap-2">
                <span>✓ {feedbackMsg}</span>
                {feedbackLink && (
                  <Link href={feedbackLink} className="underline hover:text-primary-900">
                    {feedbackLinkLabel}
                  </Link>
                )}
              </div>
            )}
            {failedFeedback && (
              <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-input text-sm text-red-700 font-medium flex items-center gap-3">
                <span>{failedFeedback.text}</span>
                <button
                  onClick={() => handleRetry(failedFeedback.id)}
                  disabled={retryLoading === failedFeedback.id}
                  className="px-3 py-1 min-h-[32px] rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {retryLoading === failedFeedback.id ? 'Försöker...' : 'Försök igen'}
                </button>
                <button
                  onClick={() => setFailedFeedback(null)}
                  className="text-red-400 hover:text-red-700"
                  aria-label="Stäng"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        )}

        {/* Stat-tiles — bara "väntar nu" + "äldsta väntande ålder", båda
            ur samma lista som redan är hämtad. "Avklarade idag" utelämnas
            medvetet: den datan finns bara när "Hanterade"-fliken varit
            aktiv, och kravet är att aldrig fetcha mer för en siffra. */}
        <div className="mt-4 flex gap-3">
          <div className="bg-white border border-slate-200 rounded-card px-4 py-3 flex-1 sm:flex-none sm:min-w-[140px]">
            <div className="font-heading tabular-nums text-2xl font-bold text-slate-900">{pendingCount}</div>
            <div className="text-xs text-slate-500 mt-0.5">väntar nu</div>
          </div>
          {oldestPendingAge && (
            <div className="bg-white border border-slate-200 rounded-card px-4 py-3 flex-1 sm:flex-none sm:min-w-[140px]">
              <div className="font-heading tabular-nums text-2xl font-bold text-slate-900">{oldestPendingAge}</div>
              <div className="text-xs text-slate-500 mt-0.5">äldsta väntande</div>
            </div>
          )}
        </div>
      </div>

      {/* Tabbar — segmenterad kontroll, samma idiom som QuotePreviewPanels
          Live/Slutdesign-toggle (bg-slate-100 rack + vit "pill" på aktivt
          läge i stället för den gamla ramade primary-50-varianten). */}
      <div className="px-4 sm:px-8 pb-4">
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
          {(['pending', 'resolved'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 px-4 min-h-[44px] rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
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

      {/* Misslyckade utföranden (Fas 0-härdningen) — godkända rader vars
          exekvering gick fel, oavsett från vilken yta godkännandet gjordes.
          Renderas bara när sådana finns; annars noll visuellt brus. */}
      {activeTab === 'pending' && failedExecutions.length > 0 && (
        <div className="px-4 sm:px-8 pb-4">
          <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
            <div className="px-4 py-3 bg-red-50 border-b border-red-200">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                Godkända men ej utförda ({failedExecutions.length})
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                Du godkände dessa, men handlingen gick inte igenom — inget har skickats till kunden.
              </p>
            </div>
            <div className="divide-y divide-red-100">
              {failedExecutions.map(item => {
                const execResult = item.payload?.execution_result as { error_text?: string | null; outcome?: string } | undefined
                return (
                  <div key={item.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                      <p className="text-xs text-red-600 truncate">
                        {execResult?.outcome === 'retrying'
                          ? 'Omkörning avbröts — försök igen'
                          : execResult?.error_text || 'Handlingen kunde inte utföras'}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRetry(item.id)}
                      disabled={retryLoading === item.id}
                      className="px-3 py-1.5 min-h-[44px] rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
                    >
                      {retryLoading === item.id ? 'Försöker...' : 'Försök igen'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="px-4 sm:px-8 pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : approvals.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-primary-50 rounded-card flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-primary-700" />
            </div>
            <p className="font-heading text-slate-900 font-semibold text-lg mb-1">
              {activeTab === 'pending' ? 'Kön är tom' : 'Inget hanterat än'}
            </p>
            <p className="text-slate-500 text-sm max-w-xs mx-auto">
              {activeTab === 'pending'
                ? 'Kön är tom — teamet jobbar vidare och säger till när något behöver dig.'
                : 'Här samlas allt du har tagit beslut om, så fort något är klart.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {approvals.map((approval, idx) => {
              const day = dayLabel(approval.created_at)
              const prevDay = idx > 0 ? dayLabel(approvals[idx - 1].created_at) : null
              // Dag-rubrik — bara en visuell markör mellan redan-intilliggande
              // dagar (listan kommer sorterad created_at desc), aldrig en
              // omsortering. Se dayLabel-filhuvudet ovanför formatTime.
              const dayHeader = day !== prevDay ? (
                <div key={`day-${approval.id}`} className="flex items-center gap-2 px-1 pt-1 first:pt-0">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">{day}</span>
                  <span className="flex-1 h-px bg-slate-200" aria-hidden />
                </div>
              ) : null
              // Autopilot-paket — specialvy
              if (approval.approval_type === 'autopilot_package' && approval.package_data?.actions) {
                const pkgActions = approval.package_data.actions
                const isExpanded = expandedPackage === approval.id
                const rejectedSet = rejectedActions[approval.id] || new Set<string>()
                const pendingActions = pkgActions.filter(a => a.type !== 'project_info')
                const activeCount = pendingActions.filter(a => !rejectedSet.has(a.id)).length

                const card = (
                  <div key={approval.id} id={`approval-${approval.id}`} className={`border rounded-card transition-all ${
                    approval.status === 'pending' ? 'border-primary-200 bg-primary-50/30' : 'border-slate-100 opacity-75'
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
                          <span className="text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded-full font-medium">
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
                              isRejected ? 'bg-gray-50 border border-[#E2E8F0] opacity-50' :
                              'bg-white border border-[#E2E8F0]'
                            }`}>
                              <ActIcon className={`w-4 h-4 flex-shrink-0 ${isDone ? 'text-green-600' : isRejected ? 'text-gray-400' : 'text-primary-700'}`} />
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
                            className="flex-1 bg-primary-700 text-white py-3 min-h-[44px] rounded-xl font-semibold text-sm hover:bg-primary-800 disabled:opacity-50 transition-all"
                          >
                            {actionLoading === approval.id + 'approve' ? 'Godkänner...' : `✅ Godkänn allt (${activeCount})`}
                          </button>
                          <button
                            onClick={() => setExpandedPackage(isExpanded ? null : approval.id)}
                            className="px-4 py-3 min-h-[44px] border border-slate-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-all flex items-center gap-1"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            Granska
                          </button>
                          <button
                            onClick={() => handleAction(approval.id, 'reject')}
                            disabled={actionLoading !== null}
                            className="px-4 py-3 min-h-[44px] border border-slate-200 rounded-xl text-sm text-gray-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-all"
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
                              <div key={act.id} className="bg-white border border-[#E2E8F0] rounded-xl p-4">
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
                return dayHeader ? [dayHeader, card] : card
              }

              // Standard approval card
              const config = TYPE_CONFIG[approval.approval_type] || TYPE_CONFIG.other
              const agentKey = agentForApproval(approval)
              const agent = AGENT_INFO[agentKey]
              const primaryAmount = getPrimaryAmount(approval)
              const isExpiringSoon =
                approval.status === 'pending' &&
                new Date(approval.expires_at).getTime() - Date.now() < 3600000
              const recipient = getRecipient(approval.payload)
              const messagePreview = getMessagePreview(approval.payload)
              const isEditing = editingId === approval.id

              const card = (
                <div
                  key={approval.id}
                  id={`approval-${approval.id}`}
                  className={`bg-white border rounded-card transition-all ${
                    approval.status === 'pending'
                      ? 'border-slate-200'
                      : 'border-slate-100 opacity-75'
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <AgentAvatar agentKey={agentKey} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {agent && (
                            <span className="text-xs text-slate-500">{agent.name} · {agent.role}</span>
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
                          {primaryAmount != null && (
                            <span className="font-heading tabular-nums font-semibold text-slate-700 ml-auto shrink-0">
                              {primaryAmount.toLocaleString('sv-SE')} kr
                            </span>
                          )}
                          <span className={`text-xs text-slate-400 whitespace-nowrap ${primaryAmount != null ? '' : 'ml-auto'}`}>{formatTime(approval.created_at)}</span>
                        </div>
                        <p className="font-heading text-[15px] font-semibold text-slate-900 mt-1.5">{approval.title}</p>
                        {recipient && (
                          <p className="text-sm text-slate-500 mt-0.5">Till: {recipient}</p>
                        )}
                        {approval.description && (
                          <p className="text-sm text-slate-500 mt-1">{approval.description}</p>
                        )}
                        {/* Visa offert-länk för quote-relaterade approvals */}
                        {QUOTE_RELATED_TYPES.includes(approval.approval_type) && (() => {
                          const quoteId = getQuoteId(approval)
                          if (!quoteId) return null
                          return (
                            <a
                              href={`/dashboard/quotes/${quoteId}`}
                              className="inline-flex items-center gap-1 text-sm text-primary-700 hover:text-primary-800 hover:underline mt-1.5"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Visa offert
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )
                        })()}
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
                            <div className="mt-2 bg-primary-50 rounded-lg p-3 space-y-2">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-xs font-semibold text-primary-700">
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
                        {/* Dispatch suggestion details — "Visa varför"-utrullning
                            Fall 4 (docs/design/SYNLIG-INTELLIGENS.md): delad
                            komponent, samma mönster som GuardianOrsaker. */}
                        {approval.approval_type === 'dispatch_suggestion' && approval.payload && (() => {
                          const pl = approval.payload as any
                          return (
                            <div className="mt-2 bg-primary-50 rounded-lg p-3 space-y-2">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-xs font-semibold text-primary-700">
                                  {(pl.member_name || '??').slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{pl.member_name}</p>
                                  <p className="text-xs text-gray-400">{pl.job_title}</p>
                                </div>
                              </div>
                              <DispatchReasoning
                                reasons={pl.reasons}
                                alternatives={pl.alternatives}
                                week_utilization_pct={pl.week_utilization_pct}
                                certificates={pl.certificates}
                              />
                            </div>
                          )
                        })()}
                        {/* Lönsamhetsvarning (Margin Guardian) — Kvittoprincipen Fall 2
                            (docs/design/SYNLIG-INTELLIGENS.md, 2026-08-13): delad
                            komponent med projektsidans motsvarande vy, en sanning. */}
                        {approval.approval_type === 'profitability_warning' && approval.payload && (() => {
                          const pl = approval.payload as any
                          const orsaker = Array.isArray(pl.orsaker) ? pl.orsaker : []
                          return (
                            <GuardianOrsaker
                              varning={{
                                status: pl.status === 'over_budget' ? 'over_budget' : 'at_risk',
                                cost_percent: pl.cost_percent ?? 0,
                                margin_percent: pl.margin_percent ?? null,
                                // Äldre pending-kort saknar målfälten och
                                // degraderar därför till "inget bevisat mål".
                                margin_target_percent: pl.margin_target_percent ?? null,
                                margin_target_breached: Boolean(pl.margin_target_breached),
                                projected_overrun: pl.projected_overrun ?? 0,
                                orsaker,
                                ata_signal: Boolean(pl.ata_signal),
                              }}
                              variant="rows"
                              projectId={pl.project_id}
                            />
                          )
                        })()}
                        {/* Måndagskortet (Måndagsmötet etapp 1, 2026-08-13) — de fyra
                            sektionerna ur lib/jarvis/monday-brief.ts, egen
                            komponent eftersom raderna är grupperade (till
                            skillnad från profitability_warnings platta
                            orsakslista ovan). Rent INFORMATIONAL. */}
                        {approval.approval_type === 'monday_brief' && approval.payload && (() => {
                          const pl = approval.payload as any
                          return (
                            <MandagskortCard
                              resultat={pl.resultat ?? null}
                              lardomar={pl.lardomar ?? null}
                              risker={pl.risker ?? null}
                              fortroende={pl.fortroende ?? null}
                            />
                          )
                        })()}
                        {/* Lead review details (email-forwarding-flöde) */}
                        {approval.approval_type === 'lead_review' && approval.payload && (() => {
                          const pl = approval.payload as any
                          const parsed = (pl.parsed || {}) as Record<string, any>
                          const rawEmail = (pl.raw_email || {}) as Record<string, any>
                          const sourceMatched = !!pl.lead_source_id
                          return (
                            <div className="mt-2 bg-amber-50 rounded-lg p-3 space-y-2 border border-amber-200">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                                <div>
                                  <span className="text-amber-700 font-semibold">Namn:</span>{' '}
                                  <span className="text-gray-900">{parsed.name || <em className="text-gray-400">saknas</em>}</span>
                                </div>
                                <div>
                                  <span className="text-amber-700 font-semibold">Telefon:</span>{' '}
                                  <span className="text-gray-900 tabular-nums">{parsed.phone || <em className="text-gray-400">saknas</em>}</span>
                                </div>
                                <div>
                                  <span className="text-amber-700 font-semibold">Email:</span>{' '}
                                  <span className="text-gray-900">{parsed.email || <em className="text-gray-400">saknas</em>}</span>
                                </div>
                                <div>
                                  <span className="text-amber-700 font-semibold">Adress:</span>{' '}
                                  <span className="text-gray-900">{parsed.address || <em className="text-gray-400">saknas</em>}</span>
                                </div>
                                <div className="sm:col-span-2">
                                  <span className="text-amber-700 font-semibold">Källa:</span>{' '}
                                  <span className="text-gray-900">{pl.resolved_source_name || parsed.source || <em className="text-gray-400">okänd</em>}</span>
                                  {sourceMatched ? (
                                    <span className="ml-1.5 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">matchad</span>
                                  ) : (parsed.source && (
                                    <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">fritext</span>
                                  ))}
                                </div>
                              </div>
                              {parsed.description && (
                                <div className="text-xs text-gray-700 italic border-t border-amber-200 pt-2">
                                  "{parsed.description}"
                                </div>
                              )}
                              <details className="text-xs">
                                <summary className="cursor-pointer text-amber-700 hover:text-amber-800 font-medium select-none">
                                  Visa raw email
                                </summary>
                                <div className="mt-2 px-3 py-2 bg-white rounded border border-amber-200 space-y-1">
                                  <div><span className="text-gray-400">Från:</span> {rawEmail.from_name ? `${rawEmail.from_name} <${rawEmail.from}>` : rawEmail.from}</div>
                                  <div><span className="text-gray-400">Ämne:</span> {rawEmail.subject || '—'}</div>
                                  <div><span className="text-gray-400">Datum:</span> {rawEmail.date || '—'}</div>
                                  <pre className="mt-2 whitespace-pre-wrap text-[11px] text-gray-700 font-mono max-h-48 overflow-y-auto">{rawEmail.body_preview || ''}</pre>
                                </div>
                              </details>
                            </div>
                          )
                        })()}
                        {/* Publish microsite details (hemsida-nudgen) */}
                        {approval.approval_type === 'publish_microsite' && approval.payload && (() => {
                          const pl = approval.payload as any
                          const preview = pl.preview || {}
                          return (
                            <div className="mt-2 bg-teal-50 rounded-lg p-3 space-y-2 border border-teal-100">
                              {preview.headline && (
                                <p className="text-sm font-medium text-gray-900">{preview.headline}</p>
                              )}
                              {preview.description && (
                                <p className="text-xs text-gray-600">{preview.description}</p>
                              )}
                              <div className="flex items-center gap-3 flex-wrap">
                                {pl.public_url && (
                                  <a
                                    href={pl.public_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-sm text-primary-700 hover:text-primary-800 hover:underline"
                                  >
                                    <Globe className="w-3.5 h-3.5" />
                                    Visa hemsidan
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                                <a
                                  href="/dashboard/website"
                                  className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 hover:underline"
                                >
                                  Redigera först
                                </a>
                              </div>
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
                              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-600 resize-none"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {approval.status === 'pending' && (
                    <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-100 flex-wrap">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => submitEdit(approval)}
                            disabled={actionLoading !== null}
                            className="flex items-center gap-2 px-4 py-2 min-h-[44px] bg-primary-700 hover:bg-primary-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Godkänn med ändringar
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-2 min-h-[44px] text-sm text-slate-500 hover:text-slate-700 transition-all"
                          >
                            Avbryt
                          </button>
                        </>
                      ) : approval.approval_type === 'installation_register' ? (
                        // Installationsregistret — bekräftas rad för rad på egen sida, aldrig med ett kö-klick.
                        <>
                          <Link
                            href={(approval.payload?.target_route as string) || `/dashboard/projects/${approval.payload?.project_id}/installationer`}
                            className="flex items-center gap-2 px-4 py-2 min-h-[44px] bg-primary-700 hover:bg-primary-800 text-white text-sm font-medium rounded-lg transition-all"
                          >
                            <Wrench className="w-4 h-4" />
                            Registrera installationer
                          </Link>
                        </>
                      ) : approval.approval_type === 'jobbpass_proposal' ? (
                        // Får INTE godkännas rakt av — det finns inget att
                        // "godkänna", ägaren väljer foton/samtycke och
                        // publicerar i sin egen yta. "Hoppa över" avvisar
                        // (kunden får inget jobbpass för det här projektet).
                        <>
                          <Link
                            href={(approval.payload?.target_route as string) || `/dashboard/projects/${approval.payload?.project_id}/jobbpass`}
                            className="flex items-center gap-2 px-4 py-2 min-h-[44px] bg-primary-700 hover:bg-primary-800 text-white text-sm font-medium rounded-lg transition-all"
                          >
                            <Camera className="w-4 h-4" />
                            Välj foton & publicera
                          </Link>
                          <button
                            onClick={() => handleAction(approval.id, 'reject')}
                            disabled={actionLoading !== null}
                            className="flex items-center gap-2 px-3 py-2 min-h-[44px] border border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-slate-700 text-sm font-medium rounded-lg transition-all"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            {actionLoading === approval.id + 'reject' ? 'Avvisar...' : 'Hoppa över'}
                          </button>
                        </>
                      ) : approval.approval_type === 'operating_experiment_readout' ? (
                        // OperatingExperiment Etapp 2 (2026-08-19): tre val
                        // (fortsätt testa / avvisa / gör till standard) ryms
                        // inte i kön — samma idiom som jobbpass_proposal:
                        // Link till en egen beslutssida för det fulla valet,
                        // "Avvisa" här som en snabb genväg för det tredje.
                        <>
                          <Link
                            href={(approval.payload?.target_route as string) || `/dashboard/experiments/${approval.id}`}
                            className="flex items-center gap-2 px-4 py-2 min-h-[44px] bg-primary-700 hover:bg-primary-800 text-white text-sm font-medium rounded-lg transition-all"
                          >
                            <FlaskConical className="w-4 h-4" />
                            Se resultat & besluta
                          </Link>
                          <button
                            onClick={() => handleAction(approval.id, 'reject')}
                            disabled={actionLoading !== null}
                            className="flex items-center gap-2 px-3 py-2 min-h-[44px] border border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-slate-700 text-sm font-medium rounded-lg transition-all"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            {actionLoading === approval.id + 'reject' ? 'Avvisar...' : 'Avvisa'}
                          </button>
                        </>
                      ) : approval.approval_type === 'project_debrief' ? (
                        // Får INTE godkännas rakt av — knappen öppnar modalen
                        // med de korta frågorna. "Hoppa över" i modalen och
                        // "Avvisa" här gör samma sak (avvisar, tomt kostar
                        // ingenting).
                        <>
                          <button
                            onClick={() => openDebriefModal(approval)}
                            disabled={actionLoading !== null}
                            className="flex items-center gap-2 px-4 py-2 min-h-[44px] bg-primary-700 hover:bg-primary-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all"
                          >
                            <Lightbulb className="w-4 h-4" />
                            Svara
                          </button>
                          <button
                            onClick={() => handleAction(approval.id, 'reject')}
                            disabled={actionLoading !== null}
                            className="flex items-center gap-2 px-3 py-2 min-h-[44px] border border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-slate-700 text-sm font-medium rounded-lg transition-all"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            {actionLoading === approval.id + 'reject' ? 'Avvisar...' : 'Hoppa över'}
                          </button>
                          <span className="ml-auto flex items-center gap-1 text-xs text-slate-400">
                            <Clock className="w-3 h-3" />
                            {timeUntilExpiry(approval.expires_at)}
                          </span>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => requestApprove(approval)}
                            disabled={actionLoading !== null}
                            className="flex items-center gap-2 px-4 py-2 min-h-[44px] bg-primary-700 hover:bg-primary-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all"
                          >
                            {approval.approval_type === 'quote_nudge' ? (
                              <>
                                <Phone className="w-4 h-4" />
                                {actionLoading === approval.id + 'approve' ? 'Noterar...' : 'Noterat, jag ringer'}
                              </>
                            ) : (
                              <>
                                <CheckCircle className="w-4 h-4" />
                                {actionLoading === approval.id + 'approve' ? 'Godkänner...' : 'Godkänn'}
                              </>
                            )}
                          </button>
                          {messagePreview && (
                            <button
                              onClick={() => startEdit(approval)}
                              className="flex items-center gap-2 px-3 py-2 min-h-[44px] border border-slate-200 hover:bg-gray-50 text-slate-700 text-sm font-medium rounded-lg transition-all"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Redigera
                            </button>
                          )}
                          <button
                            onClick={() => handleAction(approval.id, 'reject')}
                            disabled={actionLoading !== null}
                            className="flex items-center gap-2 px-3 py-2 min-h-[44px] border border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-slate-700 text-sm font-medium rounded-lg transition-all"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            {actionLoading === approval.id + 'reject' ? 'Avvisar...' : 'Avvisa'}
                          </button>
                          <span className="ml-auto flex items-center gap-1 text-xs text-slate-400">
                            <Clock className="w-3 h-3" />
                            {timeUntilExpiry(approval.expires_at)}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
              return dayHeader ? [dayHeader, card] : card
            })}
          </div>
        )}
      </div>

      {/* Bekräftelse-modal för SMS/kampanjer */}
      {confirmModal && (() => {
        const a = confirmModal.approval
        const payload = confirmModal.editedPayload || a.payload
        const msg = (payload.message || payload.sms_text || payload.body || payload.suggested_sms || payload.customer_reply_pending || '') as string
        const recipient = getRecipient(payload)
        const recipientCount = (payload.customers as any[])?.length || (recipient ? 1 : 0)
        const isCampaign = a.approval_type.includes('campaign') || recipientCount > 1
        const type = a.approval_type

        // Ring-uppmaningen: kortet vars hela poäng är att MÄNNISKAN ringer.
        // Modalen sa tidigare bara "Bekräfta åtgärd" och godkännandet utförde
        // ingenting — nu är primärhandlingen kundens nummer (tel:).
        const ring = ringUppmaning({ ...a, payload })

        // Dynamisk rubrik och knapptext per typ
        const getModalInfo = () => {
          if (ring) return { title: 'Ring kunden?', btn: 'Noterat', icon: '📞' }
          if (isCampaign) return { title: `Skicka kampanj till ${recipientCount} mottagare?`, btn: `Skicka till ${recipientCount} mottagare`, icon: '📢' }
          if (type === 'job_report') return { title: 'Skicka jobbrapport till kund?', btn: 'Skicka rapport', icon: '📋' }
          if (type === 'price_adjustment') return { title: 'Ändra pris i prislistan?', btn: 'Ändra pris', icon: '💰' }
          if (type === 'create_invoice_from_report') return { title: 'Skapa faktura?', btn: 'Skapa faktura', icon: '🧾' }
          if (type === 'autopilot_package') {
            const actionCount = (payload.actions as any[])?.length || 0
            return { title: `Utför ${actionCount} automatiska åtgärder?`, btn: `Utför ${actionCount} åtgärder`, icon: '🤖' }
          }
          if (msg && recipient) return { title: `Skicka SMS till ${recipient}?`, btn: 'Skicka SMS', icon: '💬' }
          if (type.includes('quote')) return { title: 'Utför offertåtgärd?', btn: 'Utför', icon: '📄' }
          return { title: 'Bekräfta åtgärd', btn: 'Bekräfta', icon: '✓' }
        }

        const info = getModalInfo()

        return (
          <>
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setConfirmModal(null)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
                <div className="p-6 border-b border-gray-100">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <span>{info.icon}</span> {info.title}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">{a.title}</p>
                  {a.description && <p className="text-xs text-gray-400 mt-1">{a.description}</p>}
                </div>

                <div className="p-6 space-y-4">
                  {msg && (
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">
                        {type.includes('sms') || type.includes('nudge') || type.includes('care') || type.includes('reactivation') || type.includes('followup')
                          ? 'SMS som skickas'
                          : 'Innehåll'}
                      </label>
                      <div className="bg-gray-50 border border-[#E2E8F0] rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap">
                        {msg}
                      </div>
                    </div>
                  )}

                  {recipient && !isCampaign && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <MessageSquare className="w-4 h-4 text-primary-700" />
                      <span>Till: <strong>{recipient}</strong></span>
                    </div>
                  )}

                  {type === 'price_adjustment' && (payload as any).suggested_price && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700">
                      Nytt pris: <strong>{Number((payload as any).suggested_price).toLocaleString('sv-SE')} kr</strong>
                    </div>
                  )}

                  {isCampaign && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>Detta skickar SMS till <strong>{recipientCount} mottagare</strong>. Kontrollera meddelandet ovan innan du fortsätter.</span>
                    </div>
                  )}
                </div>

                <div className="p-6 border-t border-gray-100 flex gap-3">
                  <button
                    onClick={() => setConfirmModal(null)}
                    className="flex-1 px-4 py-3 border border-[#E2E8F0] rounded-xl text-sm text-gray-600 hover:bg-gray-50"
                  >
                    Avbryt
                  </button>
                  {/* Ring-kortet: den fyllda knappen ÄR samtalet — direkt ur
                      påminnelsen, ingen omväg via Bekräfta. "Noterat" kvitterar
                      kortet efteråt (servern utför ingenting). */}
                  {ring && (
                    <a
                      href={ring.href}
                      className="flex-1 px-4 py-3 bg-primary-700 text-white rounded-xl text-sm font-semibold hover:bg-primary-800 text-center"
                    >
                      📞 {ring.label}
                    </a>
                  )}
                  <button
                    onClick={confirmAndExecute}
                    disabled={actionLoading !== null}
                    className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 ${
                      ring
                        ? 'border border-[#E2E8F0] text-gray-600 hover:bg-gray-50'
                        : 'bg-primary-700 text-white hover:bg-primary-800'
                    }`}
                  >
                    {actionLoading ? 'Utför...' : info.btn}
                  </button>
                </div>
              </div>
            </div>
          </>
        )
      })()}

      {/* Project Debrief Capture — modal med de korta frågorna. Öppnas i
          stället för direkt-godkännande (approval_type === 'project_debrief'
          hoppar aldrig via requestApprove). */}
      {debriefModal && (() => {
        const questions = (debriefModal.payload?.questions as string[] | undefined) || []
        return (
          <>
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setDebriefModal(null)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
                <div className="p-6 border-b border-gray-100">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-amber-500" /> {debriefModal.title}
                  </h3>
                  {debriefModal.description && (
                    <p className="text-sm text-gray-500 mt-1">{debriefModal.description}</p>
                  )}
                </div>

                <div className="p-6 space-y-4">
                  {questions.map((q, i) => (
                    <div key={i}>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">{q}</label>
                      <textarea
                        value={debriefAnswers[i] || ''}
                        onChange={e => {
                          const value = e.target.value
                          setDebriefAnswers(prev => {
                            const next = [...prev]
                            next[i] = value
                            return next
                          })
                        }}
                        rows={2}
                        placeholder="Frivilligt — hoppa över om inget att säga"
                        className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-600 resize-none"
                      />
                    </div>
                  ))}
                </div>

                <div className="p-6 border-t border-gray-100 flex gap-3">
                  <button
                    onClick={skipDebrief}
                    disabled={actionLoading !== null}
                    className="flex-1 px-4 py-3 border border-[#E2E8F0] rounded-xl text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Hoppa över
                  </button>
                  <button
                    onClick={submitDebrief}
                    disabled={actionLoading !== null}
                    className="flex-1 px-4 py-3 bg-primary-700 text-white rounded-xl text-sm font-semibold hover:bg-primary-800 disabled:opacity-50"
                  >
                    {actionLoading ? 'Sparar...' : 'Spara'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )
      })()}

      {closeoutProject && (
        <ProjectCloseoutModal
          projectId={closeoutProject.id}
          projectName={closeoutProject.name}
          warnings={closeoutProject.warnings}
          onClose={() => setCloseoutProject(null)}
        />
      )}
    </div>
  )
}
