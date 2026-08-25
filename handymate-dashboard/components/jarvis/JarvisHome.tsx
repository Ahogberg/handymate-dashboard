'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Banknote, Check, ChevronDown, ChevronRight, ChevronUp, FileText, Loader2, Mic, Phone, Undo2, User } from 'lucide-react'
import { nyhetsAtgard, type NyhetsIkon } from '@/lib/jarvis/news-actions'
import { byggBevakning, fyndPerAgent, type BevakningsRad } from '@/lib/jarvis/bevakning'
import { byggDygnsdigest, halsningsBevis, type DigestAktivitet } from '@/lib/jarvis/dygnsdigest'
import { TeamBevakning } from '@/components/jarvis/TeamBevakning'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useJobbuddy } from '@/lib/JobbuddyContext'
import { AgentDecisionCard, CardFactBox } from '@/components/agents/AgentDecisionCard'
import { AgentNewsRow } from '@/components/agents/AgentNewsRow'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { SkrivRad } from '@/components/jarvis/SkrivRad'
import { RailCard } from '@/components/jarvis/RailCard'
import { KomIgangRail } from '@/components/jarvis/KomIgangRail'
import HemTur from '@/components/tour/HemTur'
import CompanyScan from '@/components/tour/CompanyScan'
import MandagsmoteTakeover from '@/components/jarvis/MandagsmoteTakeover'
import {
  mandagsmoteSeenKey,
  onboardingGatesResolved,
  shouldAutoOpenMandagsmote,
  mandagsmoteSectionOrder,
  UNDO_WINDOW_MS,
} from '@/lib/jarvis/mandagsmote'
import { ScheduleTimeline, parseKonflikter, minuterFranIso } from '@/components/jarvis/ScheduleTimeline'
import { AGENT_INFO } from '@/components/dashboard/agentPersonas'
import { QuoteDraftDetail, QuoteToolExit } from '@/components/jarvis/QuoteDraftDetail'
import { KarinCalendarWidget } from '@/components/karin/KarinCalendarWidget'
import { PengarBand } from '@/components/jarvis/PengarBand'
import type { PengarSummary } from '@/lib/value/pengar-pa-bordet'
import type { Vardekvitto } from '@/lib/value/vardekvitto'
import type { ManadsLedger } from '@/lib/value/ledger'
import { retentionRad, type Agarrapport } from '@/lib/value/agarrapport'
import { approvalPreview, isEditable, buildApprovalEdit } from '@/lib/jarvis/approval-preview'
import {
  agentForApproval,
  approveLabel,
  deepLinkFor,
  needsAttention,
  ringUppmaning,
  typeLabel,
} from '@/lib/jarvis/approval-view'
import { quoteDraftSummary } from '@/lib/jarvis/quote-preview-summary'
import { cardContext } from '@/lib/jarvis/card-context'
import type { CardAction } from '@/lib/jarvis/voice'
import { voiceFor, reviewAlternatives, doneRowText } from '@/lib/jarvis/card-voice'
import { mayExecute } from '@/lib/approvals/action-contract'
import { groupApprovals, groupTitle, groupTotalKr } from '@/lib/jarvis/group-approvals'
import { grindaNyheter, entityFrom } from '@/lib/jarvis/news-gates'
import { pengaFynd } from '@/lib/jarvis/moment-rows'
import type { AgentMoment } from '@/lib/moments/derive'
import { GorDettaForst, type NextBestActionRecommendation } from '@/components/jarvis/GorDettaForst'
import { ProjektCaseKort, type ProjektCaseData } from '@/components/jarvis/ProjektCaseKort'
import { KundCaseKort, type KundCaseData } from '@/components/jarvis/KundCaseKort'
import { ProjectCloseoutCopilotCard } from '@/components/jarvis/ProjectCloseoutCopilotCard'
import type { CloseoutCandidate } from '@/lib/agents/lars/closeout-copilot'
import { RevenueRecoveryCaseKort } from '@/components/jarvis/RevenueRecoveryCaseKort'
import type { RevenueRecoveryCase } from '@/lib/value/revenue-recovery-case'
import { MalNudge } from '@/components/jarvis/MalNudge'
import { FuelWarningCard } from '@/components/jarvis/FuelWarningCard'
import { ReaktiveringsInsikt, type ReaktiveringsSignal } from '@/components/jarvis/ReaktiveringsInsikt'
import { useFuel } from '@/components/fuel/FuelProvider'
import { MatteHero } from '@/components/jarvis/home/MatteHero'
import { AbsenceBand } from '@/components/jarvis/home/AbsenceBand'
import { Uppdragsrad } from '@/components/jarvis/home/Uppdragsrad'
import type { MissionSuggestion } from '@/lib/mission/suggestions'
import { SkottUtanDig } from '@/components/jarvis/home/SkottUtanDig'
import { FirmanJustNu } from '@/components/jarvis/home/FirmanJustNu'
import { ProjektPulsRad } from '@/components/jarvis/home/ProjektPulsRad'

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
 *   Det här behöver dig idag → vitt kort med ram och knappar, resultatet
 *                              läsbart på plats (AgentDecisionCard)
 *   Värt att veta            → platt rad, ingen ram, inga knappar (AgentNewsRow)
 *
 * Man skummar sidan på två sekunder och vet exakt vad som är ens jobb.
 *
 * ═══ SKELETTET — FYRA FRÅGOR, INTE EN WIDGETSTAPEL (designkontrakt 2026-08-12) ═══
 *
 *   0. Mattes dagsbesked (home/MatteHero, Etapp C 2026-08-17) — mörka
 *      heron med hälsningen, beslut-räknaren och dygnets auto-count.
 *      Ingen egen fråga — den SAMMANFATTAR fråga 1 och 3.
 *   1. Det här behöver dig idag — beslutskorten, agenten leder varje kort.
 *   2. Det här sköter teamet    — dygnsdigestens auto-rader synliga
 *                                 (home/SkottUtanDig) + TeamBevakning
 *                                 (✓-lista) under samma rubrik.
 *   3. Pengar just nu           — PengarBand, tyst utelämnad utan ägarsvar.
 *                                 (Flyttad NED under teamet 2026-08-18,
 *                                 c241d8c7 — bandet knuffade agentlistan
 *                                 utanför no-scroll. Denna lista rättad
 *                                 2026-08-25: den listade gamla ordningen
 *                                 medan JSX:en var korrekt, vilket lurade
 *                                 designkontrakts-skanningen i
 *                                 tests/jarvis-hem.spec.ts som läser
 *                                 första förekomsten av varje rubrik.)
 *   4. Värdekvittoraden         — sist, som tidigare (grad-tint-teasern).
 *
 * "Värt att veta" (agentobservationerna) är inte en av de fyra — den är kvar
 * som ett eget litet flöde mellan 3 och 4, oförändrad sedan innan.
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

const MAX_FULL_CARDS = 3
/** Sedd-nyckel för nyhetsraderna — samma mönster som hm_moments_seen. */
const NYHETER_SEDDA_KEY = 'hm_nyheter_sedda'
const NYHETER_SEDDA_MAX = 200
/** En rad ska hinna läsas innan den räknas som sedd. */
const NYHET_SEDD_EFTER_MS = 8000
/** Momentraderna i Värt att veta — en permanent yta, inte en kö. */
const MAX_MOMENT_RADER = 3

/**
 * Måndagsmötets auto-öppningsgrind läser SAMMA localStorage-nyckel HemTur.tsx
 * skriver (SEEN_KEY där, 'hm_hemtur_klar') — literalen upprepas här hellre än
 * att exportera konstanten ur en fil som annars är helt orörd av det här
 * spåret (docs/design/FORSTA-30-MINUTERNA.md). Se lib/jarvis/mandagsmote.ts
 * onboardingGatesResolved för varför både denna OCH business.welcome_tour_seen
 * kollas — PUT:en HemTur skickar vid avslut är fire-and-forget.
 */
const HEMTUR_SEEN_KEY = 'hm_hemtur_klar'

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
  /**
   * Agentens strukturerade underlag (quote_id, invoice_id, metric …).
   * Selectades redan av /api/observations men togs aldrig emot här — därför
   * nåddes aldrig grenen i news-actions som ger "Öppna offerten →".
   */
  data_basis?: Record<string, unknown> | null
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
}: JarvisHomeProps) {
  const business = useBusiness()
  const { level: fuelLevel } = useFuel()
  const fuelCritical = fuelLevel?.state === 'critical'
  const { setIsOpen: openJobbkompisen, setPendingPrompt } = useJobbuddy()

  const [approvals, setApprovals] = useState<Approval[]>([])
  const [queueLoaded, setQueueLoaded] = useState(false)
  const [observations, setObservations] = useState<Observation[]>([])
  const [reschedules, setReschedules] = useState<RescheduleSuggestion[]>([])
  const [doneRows, setDoneRows] = useState<DoneRow[]>([])
  const [lastResolvedAt, setLastResolvedAt] = useState<string | null>(null)

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [detailIds, setDetailIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())

  // Måndagsmötets kort — ur SAMMA lista JarvisHome redan hämtar
  // (/api/approvals?status=pending, se fetchQueue). Beräknad tidigt (inte
  // bara vid synliga/grupper längre ned) eftersom auto-öppnings-effekten
  // ovan i komponenten behöver den. !hiddenIds.has(...) speglar synliga —
  // bannern/takeovern ska försvinna direkt när godkännandet köas, precis
  // som ett vanligt kort.
  const mandagskortApproval = approvals.find(a => a.approval_type === 'monday_brief' && !hiddenIds.has(a.id)) ?? null

  // Next Best Action Engine (2026-08-13) — dagens rangordnade rekommendation,
  // egen hämtning (se app/api/next-best-action/route.ts för varför: den
  // vanliga kön är begränsad till 15 senaste, toppvalet kan vara äldre).
  // nbaHiddenIds är en LOKAL, optimistisk döljning per kandidat: "Inte nu"
  // döljer BARA den rankade ytan — ärendet lever kvar och återgår till att
  // vara en vanlig rad i kön nedanför. Ett godkännande går via queueAction
  // (hiddenIds) precis som varje annat kort.
  const [nba, setNba] = useState<NextBestActionRecommendation | null>(null)
  // Veckomötets beslutskort (2026-08-14) — SAMMA dagens rangordning, bara
  // fler av dem (upp till tre). Ingen egen hämtning: kommer ur samma svar
  // som `nba` ovan, se fetch-effekten nedan.
  const [nbaList, setNbaList] = useState<NextBestActionRecommendation[]>([])
  // "Låt Matte väga in det" (tasks/jaunty-pondering-hummingbird.md) — Hannas
  // agenttips om en tyst kundgrupp, se app/api/jarvis/reactivation-signal
  // och components/jarvis/ReaktiveringsInsikt.tsx. Egen hämtning, samma
  // mönster som NBA-hämtningen nedan.
  const [reactivationSignal, setReactivationSignal] = useState<ReaktiveringsSignal | null>(null)
  // Uppdragsradens förslagschips (Goal-to-Plan V1, Etapp C,
  // tasks/jaunty-pondering-hummingbird.md) — null = fortfarande laddar (så
  // Uppdragsrad kan visa en skelettrad i stället för att blinka tom→chips).
  // Samma tysta-utfall-mönster som reaktiveringssignalen ovan.
  const [missionSuggestions, setMissionSuggestions] = useState<MissionSuggestion[] | null>(null)
  // Etapp D-härdning: /api/mission/suggestions (och /api/mission/active)
  // grindades ägare/admin. En anställd som får 403 ska INTE se en evig
  // skelettrad (missionSuggestions stannar null = "laddar" annars för
  // alltid) — hela Uppdragsrad döljs i stället, se renderingen nedan.
  const [missionSurfaceAllowed, setMissionSurfaceAllowed] = useState(true)
  // Cross-Agent Case (2026-08-14) — flera agenters signaler om samma
  // projekt, se app/api/project-cases/route.ts. Egen hämtning av samma
  // skäl som NBA ovan (huvudkön är kapad till 15 senaste).
  const [projektCases, setProjektCases] = useState<ProjektCaseData[]>([])
  const [kundCases, setKundCases] = useState<KundCaseData[]>([])
  const [revenueRecoveryCases, setRevenueRecoveryCases] = useState<RevenueRecoveryCase[]>([])
  const [closeoutCandidates, setCloseoutCandidates] = useState<CloseoutCandidate[]>([])
  const [revenueRecoveryError, setRevenueRecoveryError] = useState(false)
  const [nbaHiddenIds, setNbaHiddenIds] = useState<Set<string>>(new Set())
  const [snack, setSnack] = useState<{ approvalId: string; text: string } | null>(null)
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null)
  const [proof, setProof] = useState<string | null>(null)
  const [bevakning, setBevakning] = useState<BevakningsRad[]>([])
  const [pengarData, setPengarData] = useState<PengarSummary | null>(null)
  const [moments, setMoments] = useState<AgentMoment[]>([])
  const [aktiviteter, setAktiviteter] = useState<DigestAktivitet[]>([])
  const [samtal, setSamtal] = useState<{ antal: number; bokade: number } | null>(null)
  const [kvitto, setKvitto] = useState<Vardekvitto | null>(null)
  const [ledger, setLedger] = useState<ManadsLedger | null>(null)
  const [retentionText, setRetentionText] = useState<string | null>(null)
  // Kedjningen (tasks/jaunty-pondering-hummingbird.md): CompanyScan renderas
  // FÖRST — Hemturen släpps inte fram förrän skannen anropat onClose (klar,
  // hoppad, eller aldrig aktuell för kontot). HemTur behåller sina egna
  // gates orörda — den öppnar bara inte förrän den här flaggan är sann.
  const [scanKlar, setScanKlar] = useState(false)

  // Måndagsmötet-takeovern (Måndagsmötet etapp 2, 2026-08-13): egen,
  // OBEROENDE gate — rör inte scanKlar/CompanyScan/HemTur-kedjan ovan, läser
  // bara samma "är onboardingen förbi"-signaler (se
  // lib/jarvis/mandagsmote.ts onboardingGatesResolved).
  const [mandagsmoteOpen, setMandagsmoteOpen] = useState(false)
  const mandagsmoteAutoOpenTried = useRef(false)

  // ═══ GRIND 1: HAR NÅGOT HÄNT SEDAN DU TITTADE SIST? ═══
  //
  // Samma mekanik som momentlagret (hm_moments_seen): sedd-status hör hemma
  // hos klienten, och observation.id är redan stabilt så ingen ny kolumn
  // behövs. Raderna markeras som sedda när sidan renderat dem — de får en
  // visning, sedan är de inte längre nyheter.
  const [seddaNyheter, setSeddaNyheter] = useState<Set<string>>(new Set())

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NYHETER_SEDDA_KEY)
      if (raw) setSeddaNyheter(new Set(JSON.parse(raw) as string[]))
    } catch { /* trasig localStorage får aldrig fälla sidan */ }
  }, [])

  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  // Det köade beslutet i sin helhet — så att en sidlämning kan SKICKA det i
  // stället för att tyst kasta det (Andreas fynd 2026-08-10: godkända kort
  // återuppstod, för unmount-städningen clearTimeout:ade bort själva beslutet).
  const pendingActions = useRef<Map<string, { approval: Approval; action: 'approve' | 'reject' | 'edit'; editedText?: string }>>(new Map())

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
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/next-best-action', { headers: await authHeaders() })
        if (res.ok) {
          const data = await res.json()
          if (active) {
            setNba(data.recommendation || null)
            setNbaList(data.recommendations || [])
          }
        }
      } catch { /* ingen rankning idag är ett giltigt, tyst utfall */ }
    })()
    return () => { active = false }
  }, [authHeaders])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/jarvis/reactivation-signal', { headers: await authHeaders() })
        if (res.ok) {
          const data = await res.json()
          if (active) setReactivationSignal(data.signal || null)
        }
      } catch { /* ingen signal idag är ett giltigt, tyst utfall */ }
    })()
    return () => { active = false }
  }, [authHeaders])

  // Uppdragsradens förslag (Etapp C) — samma mönster som reaktiverings-
  // signalen ovan. Ett fel lämnar missionSuggestions som null (Uppdragsrad
  // tolkar det som "fortfarande laddar", aldrig som ett tomt förslagsläge —
  // en permanent skelettrad är ärligare än ett gissat "inget att göra").
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/mission/suggestions', { headers: await authHeaders() })
        if (res.status === 403) {
          // Anställd utan ägare/admin-behörighet (Etapp D-härdning) — dölj
          // hela Uppdragsrad, aldrig en evig skelettrad.
          if (active) setMissionSurfaceAllowed(false)
          return
        }
        if (res.ok) {
          const data = await res.json()
          if (active) setMissionSuggestions(data.suggestions || [])
        }
      } catch { /* laddningsläget består — se kommentaren ovan */ }
    })()
    return () => { active = false }
  }, [authHeaders])

  const fetchCustomerCases = useCallback(async () => {
    try {
      const res = await fetch('/api/customer-cases', { headers: await authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setKundCases(data.cases || [])
      }
    } catch { /* inga kund-case idag är ett giltigt, tyst utfall */ }
  }, [authHeaders])

  useEffect(() => { void fetchCustomerCases() }, [fetchCustomerCases])

  const fetchRevenueRecoveryCases = useCallback(async () => {
    try {
      const res = await fetch('/api/revenue-recovery-cases', { headers: await authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setRevenueRecoveryCases(data.cases || [])
        setRevenueRecoveryError(false)
      } else if (res.status >= 500) {
        setRevenueRecoveryError(true)
      }
    } catch {
      // Ett nätfel får aldrig se ut som att intäktskedjan är tom. 401/403
      // hanteras däremot tyst ovan eftersom ytan är owner/admin-grindad.
      setRevenueRecoveryError(true)
    }
  }, [authHeaders])

  useEffect(() => { void fetchRevenueRecoveryCases() }, [fetchRevenueRecoveryCases])

  const fetchCloseoutCandidates = useCallback(async () => {
    try {
      const res = await fetch('/api/project-closeout-copilot', { headers: await authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setCloseoutCandidates(data.candidates || [])
      } else {
        setCloseoutCandidates([])
      }
    } catch {
      // Ett gammalt förslag får aldrig ligga kvar när underlaget inte längre
      // går att verifiera. Avsaknad av kort är UI:ts fail-closed-läge.
      setCloseoutCandidates([])
    }
  }, [authHeaders])

  useEffect(() => { void fetchCloseoutCandidates() }, [fetchCloseoutCandidates])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/project-cases', { headers: await authHeaders() })
        if (res.ok) {
          const data = await res.json()
          if (active) setProjektCases(data.cases || [])
        }
      } catch { /* inga case idag är ett giltigt, tyst utfall */ }
    })()
    return () => { active = false }
  }, [authHeaders])

  useEffect(() => {
    if (!business?.business_id) return
    const ch = supabase
      .channel('jarvis-queue')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'pending_approvals', filter: `business_id=eq.${business.business_id}` },
        () => {
          void fetchQueue()
          void fetchCustomerCases()
          void fetchRevenueRecoveryCases()
          void fetchCloseoutCandidates()
        })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'project_change', filter: `business_id=eq.${business.business_id}` },
        () => { void fetchRevenueRecoveryCases() })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'project', filter: `business_id=eq.${business.business_id}` },
        () => {
          void fetchRevenueRecoveryCases()
          void fetchCloseoutCandidates()
        })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'booking', filter: `business_id=eq.${business.business_id}` },
        () => { void fetchCloseoutCandidates() })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'invoice', filter: `business_id=eq.${business.business_id}` },
        () => { void fetchRevenueRecoveryCases() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [business?.business_id, fetchCloseoutCandidates, fetchCustomerCases, fetchQueue, fetchRevenueRecoveryCases])

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

  // Momenten (teamets penga-fynd) i Värt att veta: samma härledning som
  // MomentsProvider läser (/api/moments, ägargrindad) — providerns flyktiga
  // globala kort rörs inte, det här är en separat, permanent rad-yta.
  useEffect(() => {
    let aktiv = true
    fetch('/api/moments')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (aktiv && d?.moments) setMoments(d.moments as AgentMoment[]) })
      .catch(() => { /* momentraderna är grädde, aldrig mjölk */ })
    return () => { aktiv = false }
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
        // Rådata till digesten — fönstret (24 h rullande) och grindarna
        // bor i lib/jarvis/dygnsdigest.ts, inte här.
        setAktiviteter(res.data as DigestAktivitet[])
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
        // Digestens dåtidsaggregat: samtalen bor i agent_runs, inte i
        // aktivitetsloggen. Bokade besök kan inte attribueras ärligt ännu —
        // 0 gör att raden aldrig påstår det (regeln bor i dygnsdigest.ts).
        if (typeof s.total_calls === 'number') setSamtal({ antal: s.total_calls, bokade: 0 })
        // Bevakningen ur samma svar — watch-blocket bär bara antal och datum.
        if (d.watch) setBevakning(byggBevakning(d.watch))
      })
      .catch(() => { /* bandet är inte kritiskt */ })
    return () => { active = false }
  }, [])

  // Att hämta: tyst hämtning — 403 (anställd) eller fel betyder inget kort,
  // aldrig ett halvt. Samma tystnadsregel som kalenderwidgeten.
  useEffect(() => {
    let aktiv = true
    fetch('/api/dashboard/pengar')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (aktiv && d) setPengarData(d) })
      .catch(() => { /* kortet är grädde, aldrig mjölk */ })
    return () => { aktiv = false }
  }, [])

  // Värdekvittot (etapp 7): månadens bekräftade kronor — samma tystnad.
  useEffect(() => {
    let aktiv = true
    fetch('/api/value/kvitto')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (aktiv && d?.kvitto) setKvitto(d.kvitto) })
      .catch(() => { /* raden är information, aldrig blockerande */ })
    return () => { aktiv = false }
  }, [])

  // Value Ledger-fyrstegsvyn (2026-08-12): värdekvittoraden får ett
  // miniformat av de fyra stadierna när datat finns. Fail-safe med flit —
  // ett uteblivet svar (fel/403) lämnar `ledger` null och raden faller
  // tillbaka på exakt dagens beteende (pengarData-klausulen nedan).
  useEffect(() => {
    let aktiv = true
    fetch('/api/value/ledger')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (aktiv && d?.ledger) setLedger(d.ledger) })
      .catch(() => { /* raden faller tillbaka på dagens beteende */ })
    return () => { aktiv = false }
  }, [])

  // Retentionraden (Spår A1): en gång per månad, bara de FÖRSTA 3 dagarna —
  // datumvillkoret räcker, ingen ny lagring behövs. Samma tysta 403-regel.
  useEffect(() => {
    if (new Date().getDate() > 3) return
    let aktiv = true
    fetch('/api/value/agarrapport')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (aktiv && d?.rapport) setRetentionText(retentionRad(d.rapport as Agarrapport)) })
      .catch(() => { /* raden är extra, aldrig blockerande */ })
    return () => { aktiv = false }
  }, [])

  useEffect(() => {
    // pagehide täcker stängd flik/mobilens app-byte; unmount-returen täcker
    // SPA-navigering. Båda SKICKAR det köade — clearTimeout utan flush var
    // buggen som lät godkända kort återuppstå.
    const onPagehide = () => flushRef.current()
    window.addEventListener('pagehide', onPagehide)
    return () => {
      window.removeEventListener('pagehide', onPagehide)
      flushRef.current()
    }
  }, [])

  // ═══ MÅNDAGSMÖTETS AUTO-ÖPPNING ═══
  //
  // Öppnar takeovern EN gång per vecka (mandagsmoteSeenKey är skopad på
  // approval-id:t, som redan är deterministiskt per företag+ISO-vecka).
  // Väntar in queueLoaded (så mandagskortApproval hunnit bli sant/falskt
  // innan grinden prövas — annars kunde en tom första render permanent
  // stämpla "sett" på ingenting) OCH onboardingGatesResolved (CompanyScan/
  // HemTur-kedjan ska ALDRIG avbrytas av en till takeover ovanpå). Ett
  // ref-vakt (inte bara localStorage) förhindrar att effekten öppnar om igen
  // om användaren stänger takeovern och något annat i listan triggar en
  // omrendering samma session.
  useEffect(() => {
    if (!queueLoaded || !mandagskortApproval) return
    if (mandagsmoteAutoOpenTried.current) return
    let hemturSeenLocally = false
    try { hemturSeenLocally = localStorage.getItem(HEMTUR_SEEN_KEY) === '1' } catch { /* fail-closed nedan */ }
    const onboardingResolved = onboardingGatesResolved({
      welcomeTourSeen: Boolean(business.welcome_tour_seen),
      hemturSeenLocally,
    })
    let alreadySeen = true // trasig localStorage → fail-closed, precis som CompanyScan/HemTur
    try { alreadySeen = localStorage.getItem(mandagsmoteSeenKey(mandagskortApproval.id)) === '1' } catch { /* alreadySeen stannar true */ }

    if (!shouldAutoOpenMandagsmote({ approvalId: mandagskortApproval.id, onboardingResolved, alreadySeen })) return

    mandagsmoteAutoOpenTried.current = true
    try { localStorage.setItem(mandagsmoteSeenKey(mandagskortApproval.id), '1') } catch { /* best effort */ }
    setMandagsmoteOpen(true)
  }, [queueLoaded, mandagskortApproval, business.welcome_tour_seen])

  /** Manuell öppning — den ständiga bannern i "Det här behöver dig idag".
   *  Sätter samma sedd-flagga (defensivt/idempotent) så en efterföljande
   *  sidladdning inte auto-öppnar ovanpå ett kort användaren redan valt att
   *  öppna själv. */
  function openMandagsmote() {
    if (!mandagskortApproval) return
    try { localStorage.setItem(mandagsmoteSeenKey(mandagskortApproval.id), '1') } catch { /* best effort */ }
    setMandagsmoteOpen(true)
  }

  /** Escape-luckan: döljer takeovern UTAN att godkänna — kortet ligger kvar
   *  pending, bannern kvar synlig. */
  function dismissMandagsmote() {
    setMandagsmoteOpen(false)
  }

  /** "Jag har läst det" — SAMMA godkänn-väg som varje annat kort
   *  (queueAction → executeSend → POST /api/approvals/:id), aldrig en egen
   *  endpoint. Stänger takeovern direkt; queueAction sköter sitt eget
   *  ångra-fönster precis som vanligt. */
  function approveMandagsmote() {
    if (!mandagskortApproval) return
    queueAction(mandagskortApproval, 'approve')
    setMandagsmoteOpen(false)
  }

  function flash(text: string, isError = false) {
    setFeedback({ text, isError })
    setTimeout(() => setFeedback(null), 4000)
  }

  async function executeSend(approval: Approval, action: 'approve' | 'reject' | 'edit', editedText?: string) {
    pendingTimers.current.delete(approval.id)
    pendingActions.current.delete(approval.id)
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
        // Överlever sidlämning: flushen vid pagehide/unmount hinner annars
        // inte få iväg anropet innan sidan rivs.
        keepalive: true,
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

  /**
   * Kör åtgärden på ett kort — eller på en hel sammanslagen grupp.
   *
   * En grupp är ETT beslut men flera åtgärder: två förfallna fakturor slås
   * ihop till ett kort, och ett godkännande skickar båda påminnelserna. Varje
   * medlem exekveras för sig och får sin egen rad i Klart idag — ett beslut,
   * men N saker hände, och loggen ska visa vad som faktiskt gjordes.
   */
  function queueAction(
    target: Approval | Approval[],
    action: 'approve' | 'reject' | 'edit',
    editedText?: string,
  ) {
    const medlemmar = Array.isArray(target) ? target : [target]
    if (medlemmar.length === 0) return
    const forsta = medlemmar[0]

    setEditingId(null)
    setHiddenIds(prev => {
      const n = new Set(prev)
      medlemmar.forEach(m => n.add(m.id))
      return n
    })

    const flera = medlemmar.length > 1
    setSnack({
      approvalId: forsta.id,
      // Ångra-rutan sa "Skickar: …" även för kort som inte kan skicka något.
      // Samma lögn som Klart idag-raden, bara några sekunder tidigare.
      text: action === 'reject'
        ? flera ? `${medlemmar.length} förslag avvisas` : 'Förslaget avvisas'
        : mayExecute(forsta.approval_type)
          ? flera ? `Skickar ${medlemmar.length} st` : `Skickar: ${forsta.title.slice(0, 60)}`
          : flera ? `Behandlar ${medlemmar.length} st` : `Behandlar: ${forsta.title.slice(0, 60)}`,
    })

    const timer = setTimeout(() => {
      setSnack(null)
      // Sekventiellt: varje utskick ska hinna få sitt eget svar läst innan
      // nästa, så en delvis lyckad grupp syns som just delvis lyckad.
      void (async () => {
        for (const m of medlemmar) await executeSend(m, action, editedText)
      })()
    }, UNDO_WINDOW_MS)

    // Ångra-knappen adresserar gruppen via första kortets id; alla timers
    // pekar på samma timeout så en ångring stoppar hela gruppen.
    medlemmar.forEach(m => {
      pendingTimers.current.set(m.id, timer)
      pendingActions.current.set(m.id, { approval: m, action, editedText })
    })
  }

  /**
   * ═══ ETT KÖAT BESLUT ÖVERLEVER SIDLÄMNING (2026-08-10) ═══
   *
   * 5-sekundersfönstret fanns för ångra — men unmount-städningen gjorde
   * clearTimeout och KASTADE beslutet. Navigerade man vidare (eller stängde
   * fliken) inom fem sekunder skickades ingenting, korten låg kvar som
   * pending i databasen och återuppstod vid nästa besök, fast ytan sagt
   * "Skickar…". Att lämna sidan betyder nu "skicka direkt": ångra-fönstret
   * är ett erbjudande medan man tittar, aldrig en tyst papperskorg.
   */
  function flushQueued() {
    if (pendingActions.current.size === 0) return
    const koade = Array.from(pendingActions.current.values())
    pendingActions.current.clear()
    const timers = new Set(pendingTimers.current.values())
    timers.forEach(t => clearTimeout(t))
    pendingTimers.current.clear()
    setSnack(null)
    void (async () => {
      for (const k of koade) await executeSend(k.approval, k.action, k.editedText)
    })()
  }
  const flushRef = useRef<() => void>(() => {})
  flushRef.current = flushQueued

  function undo(approvalId: string) {
    const t = pendingTimers.current.get(approvalId)
    if (t) clearTimeout(t)
    // En sammanslagen grupp delar EN timeout över flera id:n. Ångrar man
    // gruppen måste alla dess kort tillbaka, inte bara det man klickade på —
    // annars försvinner resten tyst utan att någonsin ha skickats.
    const gruppens: string[] = []
    pendingTimers.current.forEach((timer, id) => { if (timer === t) gruppens.push(id) })
    gruppens.forEach(id => pendingTimers.current.delete(id))
    if (gruppens.length === 0) pendingTimers.current.delete(approvalId)
    // Även ur flush-kön — annars skickar en senare sidlämning det ångrade.
    ;(gruppens.length ? gruppens : [approvalId]).forEach(id => pendingActions.current.delete(id))

    setHiddenIds(prev => {
      const n = new Set(prev)
      ;(gruppens.length ? gruppens : [approvalId]).forEach(id => n.delete(id))
      return n
    })
    setSnack(null)
  }

  function onCardAction(approval: Approval, action: CardAction, group?: Approval[]) {
    const mal = group && group.length > 1 ? group : approval
    if (action.id === 'approve') return queueAction(mal, 'approve')
    if (action.id === 'reject') return queueAction(mal, 'reject')
    // 'ring' finns bara på ring-uppmaningskorten (ringUppmaning) — öppnar
    // telefonens uppringare direkt ur kortet. Kortet ligger kvar tills
    // hantverkaren avfärdar det själv efter samtalet.
    if (action.id === 'ring') {
      const ring = ringUppmaning(approval)
      if (ring) window.location.href = ring.href
      return
    }
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

  // Den rankade kön (GorDettaForst) äger sina kandidater helt — utesluter
  // dem HÄR, innan gruppering, i stället för att försöka dölja dem efteråt.
  // Ett försök att dölja EFTER gruppering missade fallet där en kandidat
  // hamnar i en hopslagen grupp (samma agent+typ+dygn som ett annat kort):
  // gruppen döljs aldrig i sig (rätt — syskonkort ska synas), men den
  // hopslagna kortets EGEN radvisning visar ändå kandidatens titel som
  // källrad, vilket dubblerade den bredvid hero'n (hittat live 2026-08-14).
  // Att plocka bort kandidaterna INNAN groupApprovals ser dem löser båda
  // fallen enhetligt: en ensam kandidat försvinner helt från kön, en
  // kandidat som annars hade slagits ihop med syskon lämnar bara syskonen
  // kvar som en egen, orörd grupp. En "Inte nu"-dold kandidat (nbaHiddenIds)
  // är INTE synlig i rankningen och återgår därför till kön nedanför.
  const nbaKandidater = nbaList.length > 0 ? nbaList : nba ? [nba] : []
  const synligaNba = nbaKandidater.filter(
    r => !nbaHiddenIds.has(r.approval.id) && !hiddenIds.has(r.approval.id),
  )
  const synligaNbaIds = new Set(synligaNba.map(r => r.approval.id))
  const synliga = approvals.filter(a => !hiddenIds.has(a.id) && !synligaNbaIds.has(a.id))

  // Dygnsdigesten: 24 h rullande fönster + grindar (lib/jarvis/dygnsdigest.ts).
  // Färska rader från executeSend (doneRows) står alltid först — de är det
  // man nyss beslutade och ska synas direkt.
  const dygnsRader: DoneRow[] = [
    ...doneRows,
    ...byggDygnsdigest({ aktiviteter, samtal, nu: new Date() }).map(r => ({
      key: r.key,
      time: formatClock(r.tid),
      agent: r.agentId,
      text: r.text,
      auto: r.auto,
    })),
  ]
  // Räknaren visar BESLUT, inte databasrader. Två förfallna fakturor från
  // samma agent samma dygn är ett beslut — "4" när tre av korten är samma
  // ärende läser som att man ligger efter mer än man gör. De rankade
  // NBA-kandidaterna räknas MED (Etapp C, 2026-08-17): de är beslut som
  // väntar, bara visade i en annan yta — utan dem sa räknaren, hälsningens
  // bevisrad och heron "inget behöver dig" fast tre kort stod ovanför.
  const grupper = groupApprovals(synliga)
  const beslut = grupper.length + reschedules.length + (fuelCritical ? 1 : 0) + (closeoutCandidates.length > 0 ? 1 : 0) + synligaNba.length
  const koTom = queueLoaded && beslut === 0

  // Cross-Agent Case — filtrera bort hanterade signaler (samma !hiddenIds-
  // logik som hero'n ovan), och dölj hela caset om under 2 distinkta typer
  // återstår (en enda kvarvarande signal är inte längre en berättelse med
  // flera röster). INGEN borttagning ur kön nedanför — bara den här ytans
  // egen, oberoende vy. Se lib/jarvis/project-case.ts för samma regel.
  const synligaCases = projektCases
    .map(c => ({ ...c, signals: c.signals.filter(s => !hiddenIds.has(s.approval_id)) }))
    .filter(c => new Set(c.signals.map(s => s.approval_type)).size >= 2)

  // Samma lokala sanningsregel som projekt-caset: när en signal hanteras
  // försvinner den direkt, och ett kvarvarande ensamt ärende är inte längre
  // ett tvärfunktionellt kund-case.
  const synligaKundCases = kundCases
    .map(c => ({ ...c, signals: c.signals.filter(s => !hiddenIds.has(s.approval_id)) }))
    .filter(c => new Set(c.signals.map(s => s.approval_type)).size >= 2)

  // Hälsningens bevisrad — rullande dygn, ärligt om något behövde ägaren.
  const bevis = halsningsBevis(proof, beslut)

  // Observationer vars ärende redan står som kort ovanför filtreras bort —
  // samma sak på två ställen gör att man slutar läsa båda.
  // Nyhetsrader = observationer som ALDRIG haft ett beslutskort. had_approval
  // sätts av /api/observations när kortet funnits men är hanterat — utan den
  // dök ett nyss avfärdat kort upp igen som nyhet längre ned på sidan.
  // Nyhetsrader = observationer som ALDRIG haft ett beslutskort, och som
  // dessutom klarar de tre grindarna (lib/jarvis/news-gates.ts): något har
  // hänt sedan sist, den handlar om ett namngivet objekt, och den säger något
  // högerspalten inte redan säger. Fem rader om samma tio offerter blir en.
  const nyheter = grindaNyheter(
    observations.filter(o => !o.related_approval_id && !o.had_approval),
    seddaNyheter,
  )

  // Momentraderna: penga-fynden (potential/risk) som INTE redan står som ett
  // beslutskort ovanför. Beslutskortens id-mängd är exakt det som visas i
  // "Det här behöver dig idag" just nu — synliga, inte den råa approvals-
  // listan, för avfärdade/godkända kort (hiddenIds) ska räknas som lediga.
  const beslutskortIds = new Set(synliga.map(a => a.id))
  const momentRader = pengaFynd(moments, beslutskortIds, MAX_MOMENT_RADER)

  // Fynd-pekaren på bevakningskorten: "N nya fynd ↓" scrollar till agentens
  // rad i Värt att veta. Pekare, aldrig kopia — fyndtexten bor bara där.
  const fynd = fyndPerAgent(nyheter.map(o => ({ id: o.id, agent_id: o.agent_id })))

  // Värt att veta blandar nyhetsraderna och momentraderna, nyast först —
  // "blandat" enligt uppdraget, inte två separata block under samma rubrik.
  type VardAttVetaRad =
    | { kind: 'nyhet'; obs: (typeof nyheter)[number] }
    | { kind: 'moment'; moment: AgentMoment }
  const vardAttVetaRader: VardAttVetaRad[] = [
    ...nyheter.map(obs => ({ kind: 'nyhet' as const, obs })),
    ...momentRader.map(moment => ({ kind: 'moment' as const, moment })),
  ].sort((a, b) => {
    const ta = a.kind === 'nyhet' ? a.obs.created_at : a.moment.createdAt
    const tb = b.kind === 'nyhet' ? b.obs.created_at : b.moment.createdAt
    return tb.localeCompare(ta)
  })

  // Markera som sedda EFTER renderingen, inte under den — annars filtreras
  // raderna bort i samma render de visas i och man ser dem aldrig.
  useEffect(() => {
    if (nyheter.length === 0) return
    const ids = nyheter.map(o => o.id)
    const timer = setTimeout(() => {
      setSeddaNyheter(prev => {
        const n = new Set(prev)
        ids.forEach(id => n.add(id))
        try {
          localStorage.setItem(
            NYHETER_SEDDA_KEY,
            JSON.stringify(Array.from(n).slice(-NYHETER_SEDDA_MAX)),
          )
        } catch { /* non-blocking */ }
        return n
      })
    }, NYHET_SEDD_EFTER_MS)
    return () => clearTimeout(timer)
    // Avsiktligt bara id-listan i beroendet: seddaNyheter ändras av effekten
    // själv, och att lyssna på den hade gett en oändlig loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nyheter.map(o => o.id).join(',')])

  return (
    <div className="max-w-[1180px] mx-auto px-4 sm:px-8 pt-6 sm:pt-7 pb-9">
      <div className="grid lg:grid-cols-[1fr_320px] gap-6 lg:gap-7">
        {/* ── Mattes dagsbesked — egen fullbreddsrad (Etapp C1, 2026-08-17).
             Ersätter hälsningsradens visuella roll; hälsningen bor kvar
             INUTI heron. Spänner över båda kolumnerna som förut, så railen
             börjar i linje med "Det här behöver dig idag" — symmetrin
             Andreas efterfrågade 2026-08-10 består.
             Tidsfönstret för bevisraden är ett RULLANDE dygn (team-activity,
             HOURS_BACK=24) — halsningsBevis säger det den mäter. */}
        <div className="min-w-0 lg:col-span-2">
          <MatteHero
            greetingName={greetingName}
            queueLoaded={queueLoaded}
            beslut={beslut}
            nbaKandidater={synligaNba}
            bevis={bevis}
            autoCount={dygnsRader.filter(r => r.auto).length}
            // Uppdragsradens band (Goal-to-Plan V1, Etapp C → Etapp E:
            // Hero-integrationen, tasks/jaunty-pondering-hummingbird.md).
            // Etapp E flyttade Uppdragsrad IN i heron som ett band i dess
            // nederkant i stället för ett eget syskon under den — heron
            // frågar, bandet svarar. missionSurfaceAllowed (Etapp D-
            // härdning): 403 på ägare/admin-grindade uppdragsrutter döljer
            // bandet helt, aldrig en evig skelettrad för anställda.
            uppdragBand={missionSurfaceAllowed ? <Uppdragsrad suggestions={missionSuggestions} /> : null}
            // Owner Absence V1 (Etapp Å) — AbsenceBand sköter sin egen
            // hämtning/403-degradering (samma tålighetsmönster som
            // Uppdragsrad), så den monteras ovillkorligt här.
            absenceBand={<AbsenceBand />}
          />
        </div>

        {/* ── Huvudspalten ─────────────────────────────────────────────── */}
        <div className="min-w-0 lg:row-start-2 lg:col-start-1">
          {feedback && (
            <div className={`mb-4 px-3.5 py-2.5 border rounded-xl text-sm font-medium ${
              feedback.isError
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}>
              {feedback.text}
            </div>
          )}

          {/* ── Det här behöver dig idag (designkontraktet, fråga 1) — varje
              kort nedan leder med agentens avatar och namn, se
              AgentDecisionCard/ApprovalCard.
              data-tour-target: Hemturens första stopp (components/tour/HemTur.tsx). ── */}
          <div data-tour-target="hemtur-attn" className="mb-2.5">
            <div className="flex items-baseline gap-2">
              <h2 className="m-0 font-heading text-[15px] font-semibold text-slate-900">Det här behöver dig idag</h2>
              {beslut > 0 && (
                <span className="font-heading tabular-nums text-xs font-bold bg-primary-700 text-white rounded-full min-w-[21px] h-[21px] px-1.5 inline-flex items-center justify-center">
                  {beslut}
                </span>
              )}
            </div>
            {beslut > 0 && (
              <p className="mt-0.5 mb-0 text-xs text-slate-400">
                {beslut} {beslut === 1 ? 'sak' : 'saker'} behöver ditt beslut
              </p>
            )}
          </div>

          {/* Måndagsmötets ständiga återingång (Måndagsmötet etapp 2,
              2026-08-13) — så länge kortet är pending, oavsett om
              auto-öppningen redan visats/stängts. Egen, teal-accentuerad
              stil (inte AgentDecisionCard) så den läses som något annat än
              de vanliga besluten — ett möte, inte ett ärende. Kortets egen
              rad i "Det här behöver dig idag" utelämnas nedan (se
              approval.approval_type === 'monday_brief'-gaten i .map) — den
              här bannern ÄR dess representation här, takeovern är detaljvyn. */}
          {mandagskortApproval && (() => {
            const pl = (mandagskortApproval.payload || {}) as Record<string, unknown>
            const isoWeek = typeof pl.iso_week === 'number' ? (pl.iso_week as number) : null
            const antal = mandagsmoteSectionOrder({
              resultat: pl.resultat as unknown[] | null,
              lardomar: pl.lardomar,
              risker: pl.risker as unknown[] | null,
              fortroende: pl.fortroende as unknown[] | null,
            }).length
            return (
              <button
                type="button"
                onClick={openMandagsmote}
                className="w-full flex items-center gap-3 bg-primary-50 border border-primary-200 rounded-2xl px-4 py-3.5 mb-2.5 text-left hover:border-primary-300 transition-colors"
              >
                <AgentAvatar agentKey="matte" size="md" />
                <div className="flex-1 min-w-0">
                  <p className="m-0 text-sm font-semibold text-primary-900">Veckomötet väntar</p>
                  <p className="m-0 text-xs text-primary-700">
                    {antal} punkt{antal === 1 ? '' : 'er'}{isoWeek ? ` — vecka ${isoWeek}` : ''}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-primary-400 shrink-0" />
              </button>
            )
          })()}

          <MalNudge />

          {closeoutCandidates[0] && (
            <ProjectCloseoutCopilotCard candidate={closeoutCandidates[0]} />
          )}

          {synligaCases.map(c => (
            <ProjektCaseKort key={c.project_id} data={c} />
          ))}

          {synligaKundCases.map(c => (
            <KundCaseKort key={c.customer_id} data={c} />
          ))}

          {fuelCritical && (
            <div className="mb-2.5">
              <FuelWarningCard />
            </div>
          )}

          <ReaktiveringsInsikt signal={reactivationSignal} />

          {synligaNba.length > 0 && (
            <GorDettaForst
              recommendations={synligaNba}
              onApprove={rec => {
                // GorDettaForst deklarerar en minimal Approval-form (samma
                // konvention som varje annan konsument i kodbasen — se
                // ProjectApprovalsBlock/IdagCore/approvals/page.tsx, alla
                // har sin egen lokala Approval-interface). Den faktiska
                // raden bär alla fält (API:t gör select('*') mot
                // pending_approvals), så dubbel-cast här är säker.
                // queueAction lägger id:t i hiddenIds → kortet försvinner
                // ur rankningen OCH kön i samma rörelse.
                queueAction(rec.approval as unknown as Approval, 'approve')
              }}
              onDismiss={rec => {
                // "Inte nu" döljer BARA den rankade ytan — ärendet lever
                // kvar och blir en vanlig rad i kön nedanför.
                setNbaHiddenIds(prev => new Set(prev).add(rec.approval.id))
              }}
            />
          )}

          {!queueLoaded ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-center min-h-[88px]">
              <Loader2 className="w-4 h-4 text-slate-300 animate-spin" />
            </div>
          ) : koTom ? (
            <EmptyQueue lastResolvedAt={lastResolvedAt} />
          ) : (
            <div className="space-y-2.5">
              {grupper.map((grupp, i) => {
                const approval = grupp.primary
                // Måndagsmötet representeras av den egna bannern +
                // takeovern ovan, inte av ett generiskt kort här — annars
                // hade samma veckosammanfattning stått på två ställen i
                // samma sektion (se bannern strax ovanför). Den räknas
                // fortfarande med i `beslut`/`grupper` (oförändrat), bara
                // själva raden hoppas över vid rendering.
                if (approval.approval_type === 'monday_brief') return null

                // "En händelse → hela företaget" (2026-08-13): projekt-
                // stängningens kort (faktura/debrief/recension) delar ett
                // completion_batch_id (app/api/projects/route.ts). Visar en
                // gemensam rubrik ovanför klustret FÖRSTA gången det dyker
                // upp i listan — varje kort behåller sin egen knapp, aldrig
                // ett bundlat "godkänn allt" (en faktura förtjänar sitt eget
                // medvetna klick, samma resonemang som fyra-ögon-grinden).
                const batchId = (approval.payload as any)?.completion_batch_id as string | undefined
                const prevBatchId = i > 0
                  ? ((grupper[i - 1].primary.payload as any)?.completion_batch_id as string | undefined)
                  : undefined
                const batchMembers = batchId
                  ? grupper.filter(g => (g.primary.payload as any)?.completion_batch_id === batchId)
                  : []
                const batchSize = batchMembers.length
                // project_debrief bär inget project_name i sin payload (bara
                // project_id) — leta i HELA klustret, inte bara det egna
                // kortet, annars visar rubriken det generiska fallbacket
                // varje gång debriefkortet råkar renderas först.
                const batchProjectName = batchMembers
                  .map(g => (g.primary.payload as any)?.project_name as string | undefined)
                  .find(Boolean)
                const showBatchHeader = !!batchId && batchId !== prevBatchId && batchSize > 1

                return (
                <div key={approval.id} id={`beslut-${approval.id}`}>
                {showBatchHeader && (
                  <p className="m-0 mb-1.5 px-1 text-xs font-medium text-slate-400">
                    {batchProjectName ? `Projektet ${batchProjectName} avslutades` : 'Ett projekt avslutades'}
                    {' — '}{batchSize} sak{batchSize === 1 ? '' : 'er'} väntar
                  </p>
                )}
                <ApprovalCard
                  approval={approval}
                  // Sammanslagen grupp: samma agent, samma typ, samma dygn.
                  // Två förfallna fakturor är ETT beslut, inte två identiska
                  // kort — men källraderna ligger kvar synliga i kortet.
                  group={grupp.merged ? grupp.members : undefined}
                  expanded={i < MAX_FULL_CARDS || expandedIds.has(approval.id)}
                  editing={editingId === approval.id}
                  editText={editText}
                  onEditText={setEditText}
                  onExpand={() => setExpandedIds(prev => new Set(prev).add(approval.id))}
                  onAction={a => onCardAction(approval, a, grupp.members)}
                  detailOpen={detailIds.has(approval.id)}
                  onToggleDetail={() => setDetailIds(prev => { const n = new Set(prev); n.has(approval.id) ? n.delete(approval.id) : n.add(approval.id); return n })}
                  onSaveEdit={() => queueAction(approval, 'edit', editText)}
                  onCancelEdit={() => setEditingId(null)}
                />
                </div>
                )
              })}

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

          {/* ── Det här sköter teamet (designkontraktet, fråga 3) —
              bevakningen (TeamBevakning) och dygnsdigesten under SAMMA
              rubrik, inte två sektioner. ── */}
          <div className="flex items-baseline gap-2 mt-6 mb-2.5">
            <h2 className="m-0 font-heading text-[15px] font-semibold text-slate-900">Det här sköter teamet</h2>
            <span className="text-xs text-slate-400">Ingen åtgärd behövs — bara läget</span>
          </div>

          {/* Dygnsdigesten — 24 h rullande fönster, grindarna i
              lib/jarvis/dygnsdigest.ts. Lyft ur sin hopfällda undanskymdhet
              till home/SkottUtanDig (Etapp C3): auto-raderna som synlig
              checklista, hela listan bakom "Visa alla". Samma dygnsRader
              som förut — EN sanning, ingen andra hämtning. */}
          <SkottUtanDig rader={dygnsRader} />

          {/* data-tour-target: Hemturens andra stopp. */}
          <div data-tour-target="hemtur-team">
            <TeamBevakning rader={bevakning} kompakt={beslut >= 2} fynd={fynd} />
          </div>

          {/* ── Pengar just nu — flyttad NED under teamet (Andreas
              2026-08-18: bandet knuffade agentlistan utanför no-scroll;
              heron bär redan kronsumman och /dashboard/pengar detaljerna).
              /api/dashboard/pengar är ägargrindad (403 för anställda); ett
              uteblivet svar utelämnar sektionen helt och tyst, samma regel
              som kalenderwidgeten. ── */}
          {(pengarData || revenueRecoveryCases.length > 0 || revenueRecoveryError) && (
            // data-tour-target: Hemturens tredje stopp — hoppas över
            // automatiskt om sektionen inte renderas (ingen pengarData).
            <div data-tour-target="hemtur-pengar">
              <div className="flex items-baseline gap-2 mt-6 mb-2.5">
                <h2 className="m-0 font-heading text-[15px] font-semibold text-slate-900">Pengar just nu</h2>
              </div>
              {pengarData && <PengarBand summary={pengarData} />}
              {revenueRecoveryCases.map(recoveryCase => (
                <RevenueRecoveryCaseKort key={recoveryCase.case_id} data={recoveryCase} />
              ))}
              {revenueRecoveryError && (
                <div className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Intäktskedjan kunde inte läsas. Uppdatera sidan och försök igen.
                </div>
              )}
            </div>
          )}

          {/* ── Värt att veta ── */}
          {vardAttVetaRader.length > 0 && (
            <>
              <div className="flex items-baseline gap-2 mt-6 mb-2">
                <h2 className="m-0 font-heading text-[15px] font-semibold text-slate-900">Värt att veta</h2>
                <span className="text-xs text-slate-400">Inget att godkänna — bara läget</span>
              </div>
              <div>
                {vardAttVetaRader.map(rad => {
                  if (rad.kind === 'moment') {
                    const m = rad.moment
                    return (
                      <div key={m.id} id={`moment-${m.id}`}>
                        <AgentNewsRow
                          agentKey={m.agentId}
                          link={{ label: m.action.label, href: m.action.href, icon: NYHETS_IKON.pengar }}
                        >
                          {/* Beloppsbadgen visas bara när källraden bär ett
                              verkligt belopp — samma ärlighetsregel som
                              momentlagret (lib/moments/derive.ts). */}
                          {typeof m.amountKr === 'number' && (
                            <span className="mr-1.5 inline-block text-[11px] font-semibold text-primary-700 bg-primary-50 rounded-full px-1.5 py-0.5 align-middle">
                              ~{formatKr(m.amountKr)}
                            </span>
                          )}
                          {m.headline}
                        </AgentNewsRow>
                      </div>
                    )
                  }
                  const o = rad.obs
                  // Entiteten kommer ur data_basis och skickas vidare — utan
                  // andra argumentet nåddes grenen som ger "Öppna offerten →"
                  // aldrig, och alla Daniels rader fick samma generiska länk
                  // till pipeline.
                  const atgard = nyhetsAtgard(o.agent_id, entityFrom(o.data_basis))
                  return (
                    // Ankaret är fynd-pekarens mål — bevakningskortets
                    // "N nya fynd ↓" scrollar hit.
                    <div key={o.id} id={`nyhet-${o.id}`}>
                      <AgentNewsRow
                        agentKey={o.agent_id}
                        link={atgard ? { label: atgard.label, href: atgard.href, icon: NYHETS_IKON[atgard.ikon] } : undefined}
                      >
                        {o.observation}
                        {o.suggestion && <span className="text-slate-500"> {o.suggestion}</span>}
                      </AgentNewsRow>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* ── Värdekvittot — grad-tint-teasern (Etapp C6, ersätter den
              ramlösa textraden). Fortfarande ALDRIG ett beslutskort: inga
              knappar, bara månadens bekräftade kronor och länken till
              Value Ledger. Renderas bara för den som får se ekonomi
              (kvittot är ägargrindat, 403 lämnar `kvitto` null) och bara
              när det finns bekräftade kronor att visa — de vilande kronorna
              berättas redan av Pengar just nu och Firman just nu, ingen
              andra sanning om samma pengar här. */}
          {kvitto && kvitto.confirmed_kr > 0 && (
            <div className="mt-6 bg-grad-tint border border-primary-600/30 rounded-card p-5">
              <div className="text-[11px] tracking-[0.14em] uppercase text-primary-600 font-semibold">
                Värdekvitto · Handymate i {new Date().toLocaleDateString('sv-SE', { month: 'long' })}
              </div>
              <div className="mt-1.5 font-heading tabular-nums text-[26px] font-bold tracking-[-0.02em] text-primary-700">
                {formatKr(kvitto.confirmed_kr)}
              </div>
              <p className="m-0 mt-1 text-[13px] text-slate-600 leading-relaxed">
                bekräftat den här månaden
                {ledger ? (
                  <> — av {formatKr(ledger.identifierat.kr)} identifierat är {formatKr(ledger.betalt.kr)} verifierat betalt.</>
                ) : (
                  <> — varje krona spårbar till kortet som startade den.</>
                )}
              </p>
              <Link
                href="/dashboard/pengar"
                className="inline-block mt-2.5 text-[13px] font-semibold text-primary-700 hover:text-primary-800"
              >
                Se varje krona →
              </Link>
            </div>
          )}

          {/* Retentionraden — en gång per månad, de första 3 dagarna. */}
          {retentionText && (
            <p className="mt-1.5 px-1 text-[12px] text-slate-400 m-0">{retentionText}</p>
          )}

        </div>

        {/* ── Högerspalten — gräv-ingångarna ───────────────────────────── */}
        <aside className="flex flex-col gap-3 min-w-0 lg:row-start-2 lg:col-start-2">
          {/* Kom igång-railen (docs/design/FORSTA-30-MINUTERNA.md DEL 4) —
              bara nya konton, döljs för gott när alla tre uppdrag är klara. */}
          <KomIgangRail />

          <RailCard title="Dagens plan" href="/dashboard/schedule">
            {!bookingsLoaded ? (
              <div className="h-16 bg-slate-50 rounded-lg animate-pulse" />
            ) : bookings.length === 0 ? (
              <p className="text-[13px] text-slate-400 m-0">Inget bokat idag.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {bookings.slice(0, 3).map(b => (
                  <Link key={b.booking_id} href={`/dashboard/bookings/${b.booking_id}`} className="flex items-center gap-2.5 min-h-[44px] -my-1">
                    <span className="font-heading tabular-nums text-[13px] text-primary-700 w-11 shrink-0">{formatClock(b.scheduled_start)}</span>
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

          {/* Firman just nu (Etapp C4): kassaradarn (see_financials-grindad,
              rad döljs tyst vid 403), beläggningen (nya tunna
              /api/dashboard/belaggning) och Pengar på bordet-totalen ur
              redan hämtad pengarData. Inga rader → inget kort. */}
          <FirmanJustNu pengarTotalKr={pengarData ? pengarData.totalKr : null} />

          <RailCard title="Verksamheten" href="/dashboard/pipeline">
            {pipelineStats ? (
              <>
                <span className="block font-heading tabular-nums text-2xl font-bold text-slate-900">{formatKr(pipelineStats.totalValue)}</span>
                {/* "0 nya idag" är en nolla, inte ett besked. Mönstret finns
                    redan två kort ned ("Inga obetalda — Karin bevakar"):
                    tomt ska sägas som lugn, inte som frånvaro. */}
                <span className="block text-xs text-slate-500 mt-0.5">
                  {pipelineStats.totalDeals} affärer i flödet
                  {pipelineStats.newLeadsToday > 0
                    ? ` · ${pipelineStats.newLeadsToday} nya idag`
                    : ' · inga nya idag'}
                </span>
              </>
            ) : (
              <div className="h-10 bg-slate-50 rounded-lg animate-pulse" />
            )}
          </RailCard>

          {/* Projektpulsen (Etapp C5, tunn version): en rad per aktivt
              projekt ur EN listhämtning — bara signaler svaret bär
              (försenad/klart·ofakturerat/livscykelns etikett), aldrig N+1
              mot profitability. */}
          <ProjektPulsRad />

          {/* Karins bolagskalender. Renderar ingenting för anställda, och
              inget när profilen saknar uppgifter — en widget som säger
              "inget på gång" när vi inte vet vore osann. */}
          <KarinCalendarWidget />

          {/* Mötesassistenten (2026-08-13): byggd 08-11/12 men obesökt —
              ingen genväg fanns någonstans i navigationen. Sist i spalten,
              inte i huvudflödets fyra sektioner (designkontraktet rörs ej). */}
          <RailCard
            title="Möte idag?"
            href="/dashboard/inkorg?tab=mote"
            leading={<Mic className="w-4 h-4 text-primary-600 shrink-0" />}
            tourTarget="hemtur-mote"
          >
            <p className="text-[13px] text-slate-500 m-0">
              Spela in platsbesöket — Matte sammanfattar och skriver offertutkastet.
            </p>
          </RailCard>
        </aside>

        {/* ── Skrivraden ───────────────────────────────────────────────────
             SIST, inte först. Allt ovanför klaras utan tangentbord — en
             textruta som svarar hade varit en sämre meny med extra
             skrivarbete. Öppnar befintliga Jobbkompisen (riktiga Matte, med
             röst), så ingen ny chattbackend behövs.

             Två lägen (etapp 4): stor med chips när kön är lugn, pill när
             besluten väntar — samma tröskel som bevakningen.

             Eget rutnätsbarn i stället för sist i huvudspalten: på mobil
             hamnar den då efter gräv-korten, som en hantverkare på bygget har
             mer nytta av än en skrivrad. På desktop ligger den kvar under
             huvudspalten precis som i mockupen. */}
        <SkrivRad
          stor={beslut <= 1}
          onOppna={() => openJobbkompisen(true)}
          onChip={prompt => { setPendingPrompt(prompt); openJobbkompisen(true) }}
          tourTarget="hemtur-skriv"
        />
      </div>

      {/* Company Scan (tasks/jaunty-pondering-hummingbird.md) — dashboardens
          allra första ögonblick, INNAN Hemturen. Äger sin egen gate
          (welcome_tour_seen + hm_scan_klar) och anropar onClose när den
          stängs oavsett anledning; Hemturen renderas inte förrän dess. */}
      <CompanyScan onClose={() => setScanKlar(true)} />

      {/* Hemturen (docs/design/FORSTA-30-MINUTERNA.md) — spotlightar de fem
          data-tour-target-noderna ovan. Gatead på welcome_tour_seen +
          localStorage; renderar ingenting förrän gaten öppnar OCH skannen
          har stängts (scanKlar). */}
      {scanKlar && <HemTur />}

      {/* Måndagsmötet — egen, oberoende gate (se useEffect ovan). Kan öppna
          sig SAMTIDIGT som CompanyScan/HemTur teoretiskt existerar i DOM:en,
          men auto-öppningen kan aldrig TRIGGA förrän onboardingGatesResolved
          är sant — vilket i praktiken betyder att HemTur redan är färdig. */}
      {mandagsmoteOpen && mandagskortApproval && (
        <MandagsmoteTakeover
          approval={mandagskortApproval}
          greetingName={greetingName}
          approveLabel={approveLabel('monday_brief', mandagskortApproval.payload)}
          decisionCandidates={nbaList.filter(r => !hiddenIds.has(r.approval.id))}
          onApprove={approveMandagsmote}
          onDismiss={dismissMandagsmote}
          onApproveDecision={c => {
            // INTE setHeroHidden — den flaggan hör bara till hero-kortets
            // egen "Inte nu" (döljning utan att köa något). Ett beslutskort
            // som faktiskt godkänns/avvisas läggs i hiddenIds av queueAction
            // nedan, vilket räcker för att hero'n (om samma kandidat) och
            // beslutskortet själva döljer sig — ett dubbelt döljningsspår
            // hade dolt FEL kort om detta inte var hero'ns egen kandidat.
            //
            // Samma dubbel-cast-motivering som Gör detta först-hero'n ovan
            // (rad ~938): API:t gör select('*') mot pending_approvals, så
            // formen bär alla fält Approval kräver, bara typad smalare här.
            queueAction(c.approval as unknown as Approval, 'approve')
          }}
          onRejectDecision={c => {
            queueAction(c.approval as unknown as Approval, 'reject')
          }}
          onUndoDecision={undo}
        />
      )}

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
  group,
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
  /** Sammanslagen grupp (samma agent+typ+dygn). Odefinierad = ensamt kort. */
  group?: Approval[]
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
  //
  // RING-UPPMANINGEN (2026-08-10): "Ring kund om offert" kan inte utföras av
  // servern — den enda ärliga primärhandlingen är kundens nummer. Kortet
  // frågar, och första alternativet ÄR ring-knappen (tel:).
  const ring = ringUppmaning(approval)
  const rost = ring ? 'fragar' : voiceFor(approval.approval_type)

  // Sammanslagning: samma agent, samma typ, samma dygn. Summan visas bara om
  // ALLA medlemmar bär ett belopp — annars vore den en gissning som ser exakt
  // ut (samma ärlighetsregel som momentlagret).
  const arGrupp = Boolean(group && group.length > 1)
  const gruppSumma = arGrupp
    ? groupTotalKr(
        { primary: approval, members: group!, merged: true },
        a => {
          const p = (a.payload || {}) as Record<string, any>
          const v = p.amount_kr ?? p.total ?? p.estimated_value
          return typeof v === 'number' ? v : null
        },
      )
    : null

  return (
    <AgentDecisionCard
      agentKey={agentKey}
      voice={rost}
      // 'fragar' bygger sina knappar ur alternativen — och sätter approves:false
      // på allihop, så ett granskningskort inte KAN utlösa ett godkännande.
      // Ring-kortet får ring-knappen som fyllt förstaval + Avvisa.
      alternatives={
        ring
          ? [{ id: 'ring', label: ring.label }, { id: 'reject', label: 'Avvisa' }]
          : rost === 'fragar' ? reviewAlternatives(approval.approval_type) : undefined
      }
      typeLabel={typeLabel(approval.approval_type)}
      timeLabel={timeAgo(approval.created_at)}
      // Sammanslagen grupp får en rubrik som säger ANTALET — det är den nya
      // informationen. Beloppet tas med bara när varje medlem bär ett.
      title={arGrupp ? groupTitle({ primary: approval, members: group!, merged: true }, gruppSumma) : approval.title}
      // Vem och vad — alltid. Utan den fick hantverkaren "Kunden har en fråga
      // om offerten" utan att veta vilken kund eller vilken offert.
      // Gruppens kontextrad vore missvisande (den beskriver bara ett av
      // korten), så den utelämnas när flera slagits ihop.
      context={arGrupp ? undefined : cardContext(approval.payload)}
      description={arGrupp ? null : approval.description}
      attention={needsAttention(approval)}
      approveLabel={
        arGrupp
          ? `Skicka alla ${group!.length}`
          : approveLabel(approval.approval_type, approval.payload)
      }
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
      {/* ═══ SAMMANSLAGNING FÅR ALDRIG DÖLJA NÅGOT (2026-08-08) ═══
          Källraderna ligger kvar synliga. Poängen är att sluta UPPREPA
          samma rubrik och knappar, inte att gömma vilka ärenden det gäller. */}
      {arGrupp && (
        <CardFactBox>
          <div className="divide-y divide-slate-100">
            {group!.map(m => {
              const mp = (m.payload || {}) as Record<string, any>
              const belopp = mp.amount_kr ?? mp.total ?? mp.estimated_value
              return (
                <div key={m.id} className="flex items-center gap-3 py-2 text-[13px] text-slate-600">
                  <span className="flex-1 min-w-0 truncate">{cardContext(m.payload) || m.title}</span>
                  <span className="text-xs text-slate-400 shrink-0">{timeAgo(m.created_at)}</span>
                  {typeof belopp === 'number' && belopp > 0 && (
                    <span className="font-heading tabular-nums font-semibold w-[76px] text-right shrink-0">
                      {formatKr(belopp)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </CardFactBox>
      )}

      {/* ═══ ENKLA UTKASTRADER (innehållskontraktet regel 1, 2026-08-08) ═══
          missad_intakt, create_ata_draft och review_auto_invoice bär numera
          payload.preview.items. Formen är enklare än offertutkastets (ingen
          moms- eller ROT-beräkning), så de renderas här i stället för genom
          QuoteDraftDetail. Poängen är densamma: man ska se VAD man tar
          ställning till utan att öppna något. */}
      {!arGrupp && Array.isArray(pl.preview?.items) && pl.preview.items.length > 0
        && approval.approval_type !== 'create_quote_draft' && (
        <CardFactBox>
          <div className="divide-y divide-slate-100">
            {pl.preview.items.slice(0, 6).map((rad: any, i: number) => {
              const belopp = rad.amount_kr ?? (Number(rad.quantity) || 0) * (Number(rad.unit_price) || 0)
              return (
                <div key={i} className="flex items-center gap-3 py-2 text-[13px] text-slate-600">
                  <span className="flex-1 min-w-0 truncate">{rad.description || rad.name || 'Rad'}</span>
                  {typeof belopp === 'number' && belopp > 0 && (
                    <span className="font-heading tabular-nums font-semibold shrink-0">{formatKr(belopp)}</span>
                  )}
                </div>
              )
            })}
          </div>
          {/* Full summering (Tur 4 etapp 2): fakturera_projekt persisterar
              hela previewn — Delsumma/Moms/ROT/Kunden betalar, samma rader
              som fakturan får. Äldre kort utan customer_pays behåller den
              enkla "Att fakturera"-raden (bakåtkompatibelt). */}
          {typeof pl.preview.customer_pays === 'number' && pl.preview.customer_pays > 0 ? (
            <div className="border-t border-slate-200 mt-1.5 pt-2">
              {typeof pl.preview.subtotal === 'number' && (
                <div className="flex justify-between text-[13px] text-slate-600 py-0.5">
                  <span>Delsumma</span>
                  <span className="font-heading tabular-nums font-semibold">{formatKr(pl.preview.subtotal)}</span>
                </div>
              )}
              {typeof pl.preview.vat_amount === 'number' && (
                <div className="flex justify-between text-[13px] text-slate-600 py-0.5">
                  <span>Moms</span>
                  <span className="font-heading tabular-nums font-semibold">{formatKr(pl.preview.vat_amount)}</span>
                </div>
              )}
              {typeof pl.preview.rot_rut_deduction === 'number' && pl.preview.rot_rut_deduction > 0 && (
                <div className="flex justify-between text-[13px] text-slate-600 py-0.5">
                  <span>ROT-avdrag</span>
                  <span className="font-heading tabular-nums font-semibold text-primary-700">−{formatKr(pl.preview.rot_rut_deduction)}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between border-t border-slate-200 mt-1 pt-2">
                <span className="text-[13px] font-semibold text-slate-900">Kunden betalar</span>
                <span className="font-heading tabular-nums text-[17px] font-bold text-slate-900">
                  {formatKr(pl.preview.customer_pays)}
                </span>
              </div>
            </div>
          ) : typeof pl.preview.total_before_vat === 'number' && pl.preview.total_before_vat > 0 ? (
            <div className="flex items-baseline justify-between border-t border-slate-200 mt-1.5 pt-2">
              <span className="text-[13px] font-semibold text-slate-700">Att fakturera</span>
              <span className="font-heading tabular-nums text-[17px] font-bold text-slate-900">
                {formatKr(pl.preview.total_before_vat)}
              </span>
            </div>
          ) : null}
        </CardFactBox>
      )}

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
              <span className={`font-heading tabular-nums font-semibold ${r.deduction ? 'text-primary-700' : ''}`}>
                {r.deduction ? '−' : ''}{formatKr(r.amount)}
              </span>
            </div>
          ))}
          <div className="flex justify-between items-baseline border-t border-slate-200 mt-1.5 pt-2">
            <span className="text-[13px] font-semibold text-slate-900">Kunden betalar</span>
            <span className="font-heading tabular-nums text-lg font-bold text-slate-900">{formatKr(summary.customerPays)}</span>
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
