'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Sparkles,
  Send,
  X,
  Mic,
  Square,
  Camera,
  Upload,
  RotateCcw,
  Loader2,
  MessageSquare,
  CheckCircle,
  ChevronRight,
  Clock,
  FileText,
  Receipt,
  Zap,
  Package,
} from 'lucide-react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useJobbuddy } from '@/lib/JobbuddyContext'
import { useBusiness } from '@/lib/BusinessContext'
import { getAgentById } from '@/lib/agents/team'
import { useMoments } from '@/components/moments/MomentsProvider'
import { pageContextFromPathname } from '@/lib/matte/page-context'
import { formatKr } from '@/lib/moments/derive'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { AgentMessage } from '@/components/agents/AgentMessage'
import type { InteractionStatus } from '@/lib/agents/interaction'
import type { BusinessScenarioPresentation } from '@/lib/business-twin/scenario-contract'
import type { MissionPlanPresentation } from '@/lib/mission/mission-presentation'
import { useMission } from '@/lib/mission/MissionProvider'
import { deriveBubbleState } from '@/lib/mission/bubble-state'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  actions?: AIAction[]
  /** Vilken agent i teamet som skrev svaret (matte/lars/karin/daniel/hanna/lisa). */
  agent?: string | null
  is_handoff_announcement?: boolean
  /** Orkestreringens status på Mattes sammanfattning (Epic 2) — aldrig gissad i UI:t. */
  status?: InteractionStatus | null
  presentation?: BusinessScenarioPresentation | MissionPlanPresentation
}

/** Fas 0-säkerhetsräcke: kort som visas när Matte vill skicka något ut ur huset. */
interface PendingConfirmation {
  tool_name: string
  args: Record<string, any>
  summary: string
  token: string
}

const EXAMPLE_COMMANDS = [
  'Skicka påminnelse till kunder med sena fakturor',
  'Boka platsbesök hos [kund]',
  'Följ upp offerten till [kund]',
]

const EXAMPLE_QUESTIONS = [
  'Vilka offerter väntar på svar?',
  'Vilka fakturor är förfallna?',
]

interface AIAction {
  id: string
  type: string
  label: string
  description: string
  data: Record<string, any>
  status: 'pending' | 'executing' | 'done' | 'error'
}

interface VoiceAnalysis {
  understood: string
  actions: AIAction[]
}

type Tab = 'chat' | 'voice' | 'photo'

// ── Main Component ────────────────────────────────────────────────────────────

export default function Jobbkompisen() {
  const { activeTimer, isOpen, setIsOpen, activeTab, setActiveTab, suggestions, clearSuggestion, pendingPrompt, setPendingPrompt } = useJobbuddy()
  const business = useBusiness()

  // ═══ Matte 2.0 (2026-08-08) ═══
  //
  // Bubblan är inte längre bara en dörr till chatten — den bär teamets
  // fynd. useMoments ger badge-listan och osedd-summan; pathname ger
  // sidkontexten så chatten vet var hantverkaren står (API:et har läst
  // context.customerId/projectId hela tiden — ingen skickade in dem).
  const { badge: momentBadge, panel: momentPanel, unseenKr, markSeen } = useMoments()
  // Goal-to-Plan V1 (Etapp C, tasks/jaunty-pondering-hummingbird.md): det
  // aktiva uppdraget styr bubblans stängda pillar (deriveBubbleState nedan)
  // och MissionPlanCards "Starta uppdraget"-knapp (startMissionFromCard).
  const { mission, progress, refresh: refreshMission } = useMission()
  const pathname = usePathname()
  const pageContext = pageContextFromPathname(pathname)

  // Chat state — riktiga Matte (/api/matte/chat), se Fas 0-spec i tasks/ui-ux-audit.md
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Hej! Matte här. Chatta, prata eller fota — jag och teamet hjälper dig med allt.' }
  ])
  const [chatInput, setChatInput] = useState('')

  // Snabbknapparna på Hem lämnar en påbörjad mening här (2026-08-11):
  // "Skicka ett SMS till " — chatten öppnas med den ifylld så hantverkaren
  // bara fyller i vem och vad. Nollas direkt så den inte spökar nästa gång.
  useEffect(() => {
    if (isOpen && pendingPrompt) {
      setActiveTab('chat')
      setChatInput(pendingPrompt)
      setPendingPrompt(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pendingPrompt])
  const [chatLoading, setChatLoading] = useState(false)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Voice state
  const [isRecording, setIsRecording] = useState(false)
  const [voiceDuration, setVoiceDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [voiceProcessing, setVoiceProcessing] = useState(false)
  const [voiceResult, setVoiceResult] = useState<VoiceAnalysis | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const voiceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Photo state (Matte-flytten 2026-08-03: bara analys-flaggan + kamera-ref
  // kvar — preview/result/fileInputRef hörde till den borttagna foto-fliken)
  const [photoAnalyzing, setPhotoAnalyzing] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // Action execution
  const [executingActions, setExecutingActions] = useState<Set<string>>(new Set())

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (voiceTimerRef.current) clearInterval(voiceTimerRef.current)
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [])

  // ── Chat ────────────────────────────────────────────────────────────────────

  // Chat-fliken pratar med RIKTIGA Matte (multi-agent, utför via delade
  // tool-router:n) istället för den svagare /api/ai-copilot. Bubbelskalet är
  // oförändrat — bara hjärnan har bytts. require_confirm_external: true ger
  // säkerhetsräcket (bekräftelsekort) för externa utskick (SMS/e-post).
  //
  // payloadOverride (Matte-flytten 2026-08-03): det som VISAS som
  // användarmeddelande kan skilja sig från det som SKICKAS till Matte —
  // fotoflödet visar "📷 Skickade ett foto" men skickar hela bildanalysen
  // som kontext. Rösten behöver det inte (transkriptet ÄR meddelandet).
  async function sendChat(overrideText?: string, payloadOverride?: string) {
    const userMessage = (overrideText ?? chatInput).trim()
    if (!userMessage || chatLoading) return

    setChatInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setChatLoading(true)
    setPendingConfirmation(null)

    try {
      const response = await fetch('/api/matte/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: (payloadOverride ?? userMessage).trim() }],
          context: {
            threadId,
            userName: business.contact_name,
            businessName: business.business_name,
            // Sidkontexten: API:et läser customerId/projectId sedan länge —
            // det här är första gången någon faktiskt skickar dem.
            pathname,
            page: pageContext.page,
            customerId: pageContext.customerId,
            projectId: pageContext.projectId,
            quoteId: pageContext.quoteId,
            invoiceId: pageContext.invoiceId,
          },
          require_confirm_external: true,
        }),
      })

      const data = await response.json()
      if (data.thread_id) setThreadId(data.thread_id)

      // Ev. text Matte redan sa innan den försökte skicka något externt
      // ("Visst, skickar nu...") renderas alltid, oavsett om ett kort följer.
      if (Array.isArray(data.messages) && data.messages.length > 0) {
        setMessages(prev => [
          ...prev,
          ...data.messages.map((m: {
            agent?: string
            content: string
            is_handoff_announcement?: boolean
            status?: InteractionStatus | null
            presentation?: BusinessScenarioPresentation | MissionPlanPresentation
          }) => ({
            role: 'assistant' as const,
            content: m.content,
            agent: m.agent,
            is_handoff_announcement: m.is_handoff_announcement,
            status: m.status ?? null,
            presentation: m.presentation,
          })),
        ])
      } else if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply, agent: data.current_agent }])
      }

      if (data.pending_confirmation) {
        setPendingConfirmation(data.pending_confirmation)
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ett fel uppstod. Försök igen.' }])
    } finally {
      setChatLoading(false)
    }
  }

  // MissionPlanCards "Starta uppdraget"-knapp (Etapp C): skickar chatt-
  // meddelandet genom SAMMA sendChat som allt annat, och hämtar sedan om
  // det aktiva uppdraget — confirm_mission må ha skapat mis_-raden på
  // servern, men bubblan/Uppdragsraden vet inget om det förrän en ny
  // /api/mission/active-läsning gjorts.
  async function startMissionFromCard(text: string) {
    await sendChat(text)
    refreshMission()
  }

  // Vid [Skicka]: återanropar matte/chat med bekräftelse-token:en — routen
  // kör EXAKT det verktygsanrop token:en signerade, och bara det.
  async function confirmPendingAction() {
    if (!pendingConfirmation || chatLoading) return
    const token = pendingConfirmation.token
    setPendingConfirmation(null)
    setChatLoading(true)

    try {
      const response = await fetch('/api/matte/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: { token } }),
      })
      const data = await response.json()
      if (data.thread_id) setThreadId(data.thread_id)

      if (Array.isArray(data.messages) && data.messages.length > 0) {
        setMessages(prev => [
          ...prev,
          ...data.messages.map((m: {
            agent?: string
            content: string
            is_handoff_announcement?: boolean
            status?: InteractionStatus | null
            presentation?: BusinessScenarioPresentation | MissionPlanPresentation
          }) => ({
            role: 'assistant' as const,
            content: m.content,
            agent: m.agent,
            is_handoff_announcement: m.is_handoff_announcement,
            status: m.status ?? null,
            presentation: m.presentation,
          })),
        ])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply || data.error || 'Klart!' }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Kunde inte skicka — försök igen.' }])
    } finally {
      setChatLoading(false)
    }
  }

  // [Avbryt]: rent klientsidigt — verktyget kördes aldrig, så det finns
  // inget att ångra på servern.
  function cancelPendingAction() {
    setPendingConfirmation(null)
    setMessages(prev => [...prev, { role: 'assistant', content: 'Avbrutet — inget skickades.' }])
  }

  // ── Voice ───────────────────────────────────────────────────────────────────

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        setAudioBlob(blob)
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setVoiceDuration(0)
      setVoiceResult(null)

      voiceTimerRef.current = setInterval(() => {
        setVoiceDuration(d => d + 1)
      }, 1000)
    } catch {
      // Microphone not available
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current)
      voiceTimerRef.current = null
    }
  }

  // Matte-flytten (Andreas 2026-08-03): rösten är nu "prata istället för
  // skriva" in i SAMMA Matte-tråd som chatten — Whisper transkriberar
  // (transcribe_only, jobbuddy/voice:s egna Claude-analys hoppas över),
  // transkriptet skickas genom sendChat → multi-agent-dirigering +
  // Fas 0-säkerhetsräcket, istället för den gamla parallella
  // understood/actions-vägen utan endera.
  async function processVoice() {
    if (!audioBlob) return

    setVoiceProcessing(true)
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')
      formData.append('transcribe_only', '1')

      const response = await fetch('/api/jobbuddy/voice', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      const transcript = (data.transcript || '').trim()
      if (transcript.length < 3) {
        setVoiceResult({
          understood: 'Kunde inte uppfatta vad du sa. Försök igen.',
          actions: [],
        })
        return
      }

      resetVoice()
      setActiveTab('chat')
      sendChat(transcript)
    } catch {
      setVoiceResult({
        understood: 'Kunde inte bearbeta inspelningen. Försök igen.',
        actions: [],
      })
    } finally {
      setVoiceProcessing(false)
    }
  }

  function resetVoice() {
    setAudioBlob(null)
    setVoiceDuration(0)
    setVoiceResult(null)
    setVoiceProcessing(false)
  }

  // ── Photo ───────────────────────────────────────────────────────────────────

  // Matte-flytten (Andreas 2026-08-03): fotot går nu in i SAMMA Matte-tråd
  // som chatten — vision-analysen (jobbuddy/photo) behålls som ren
  // bildtolkning, men resultatet skickas som kontext till Matte
  // (payloadOverride) så uppföljningsfrågor har både analysen i tråden och
  // multi-agent-dirigeringen. Användaren ser bara "📷 Skickade ett foto".
  // Triggas direkt vid fotoval från kameraknappen i chatt-inputen (den
  // gamla foto-FLIKEN var onåbar död kod — ingen tab-knapp pekade på den).
  async function analyzePhotoIntoChat(file: File) {
    if (!file.type.startsWith('image/') || photoAnalyzing) return

    setPhotoAnalyzing(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => resolve(e.target?.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const base64 = dataUrl.split(',')[1]

      const response = await fetch('/api/jobbuddy/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      })

      const data = await response.json()
      const analysis = (data.analysis || '').trim()
      if (!analysis) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Kunde inte analysera bilden. Försök igen.' }])
        return
      }

      sendChat(
        '📷 Skickade ett foto',
        `Hantverkaren skickade ett foto. Bildanalys: ${analysis}\n\nHjälp hantverkaren vidare utifrån vad fotot visar — föreslå en konkret åtgärd om det är lämpligt.`,
      )
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Kunde inte analysera bilden. Försök igen.' }])
    } finally {
      setPhotoAnalyzing(false)
    }
  }

  // ── Action execution ────────────────────────────────────────────────────────

  async function executeAction(action: AIAction) {
    setExecutingActions(prev => new Set(prev).add(action.id))

    try {
      const response = await fetch('/api/jobbuddy/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: action.type,
          data: action.data,
        }),
      })

      if (response.ok) {
        // Update the action status in voice result
        if (voiceResult) {
          setVoiceResult(prev => prev ? {
            ...prev,
            actions: prev.actions.map(a =>
              a.id === action.id ? { ...a, status: 'done' } : a
            ),
          } : null)
        }
        // Update in chat messages
        setMessages(prev => prev.map(msg => ({
          ...msg,
          actions: msg.actions?.map(a =>
            a.id === action.id ? { ...a, status: 'done' } : a
          ),
        })))
      }
    } catch {
      // Mark as error
    } finally {
      setExecutingActions(prev => {
        const next = new Set(prev)
        next.delete(action.id)
        return next
      })
    }
  }

  async function executeAllActions(actions: AIAction[]) {
    for (const action of actions.filter(a => a.status === 'pending')) {
      await executeAction(action)
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const actionIcon = (type: string) => {
    switch (type) {
      case 'log_time': return <Clock className="w-4 h-4" />
      case 'create_invoice': return <Receipt className="w-4 h-4" />
      case 'create_quote': return <FileText className="w-4 h-4" />
      case 'update_project': return <Zap className="w-4 h-4" />
      case 'send_sms': return <MessageSquare className="w-4 h-4" />
      case 'order_material': return <Package className="w-4 h-4" />
      default: return <ChevronRight className="w-4 h-4" />
    }
  }

  // ── Render: Closed bubble ───────────────────────────────────────────────────

  if (!isOpen) {
    const antalFynd = suggestions.length + momentBadge.length
    const hasActiveJob = !!activeTimer
    const matte = getAgentById('matte')
    // Bubblans EN pill-slot (Etapp C, tasks/jaunty-pondering-hummingbird.md):
    // ett aktivt uppdrag vinner alltid över kronpillen (precedensen bor i
    // deriveBubbleState, inte här) — hasActiveJob (pågående samtal) tystar
    // kronläget precis som förut, genom att aldrig mata in ett unseenKr som
    // når tröskeln.
    const bubbleState = deriveBubbleState({
      hasActiveMission: !!mission && mission.status === 'active',
      decisionsOutstanding: progress?.decisions_outstanding ?? 0,
      unseenKr: hasActiveJob ? 0 : unseenKr,
    })
    // Beloppsläget: när osedda fynd summerar till riktiga pengar bär bubblan
    // summan i stället för en anonym siffra — bara när bubbelstate faktiskt
    // landar på kr-läget (mission-lägena har redan företräde ovan).
    const visaBelopp = bubbleState === 'kr_pill'

    return (
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-1.5">
        {bubbleState === 'kraver_beslut' && (
          <button
            onClick={() => setIsOpen(true)}
            className="px-3 h-8 rounded-full bg-amber-500 text-white text-xs font-bold shadow-lg shadow-amber-500/20 whitespace-nowrap"
          >
            Matte behöver ditt beslut
          </button>
        )}
        {bubbleState === 'aktivt_uppdrag' && (
          <button
            onClick={() => setIsOpen(true)}
            className="px-3 h-8 rounded-full bg-primary-700 text-white text-xs font-bold shadow-lg shadow-primary-700/20 whitespace-nowrap"
          >
            Uppdrag pågår · öppna
          </button>
        )}
        {visaBelopp && (
          <button
            onClick={() => setIsOpen(true)}
            className="px-3 h-8 rounded-full bg-primary-700 text-white text-xs font-bold shadow-lg shadow-primary-700/20 whitespace-nowrap"
          >
            {formatKr(unseenKr)} hittat
          </button>
        )}
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Öppna Matte"
          className={`w-14 h-14 rounded-2xl shadow-lg flex items-center justify-center hover:scale-105 transition-all overflow-hidden relative ${
            hasActiveJob
              ? 'bg-gradient-to-br from-emerald-500 to-primary-600 shadow-emerald-500/20 ring-2 ring-emerald-300'
              : 'bg-white shadow-primary-600/10 ring-1 ring-primary-200'
          }`}
        >
          {hasActiveJob ? (
            <Mic className="w-6 h-6 text-white animate-pulse" />
          ) : matte?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={matte.avatar}
              alt="Matte"
              className="w-full h-full object-cover"
            />
          ) : (
            <Sparkles className="w-6 h-6 text-primary-700" />
          )}
          {antalFynd > 0 && !visaBelopp && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 flex items-center justify-center text-[10px] font-bold bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full">
              {antalFynd}
            </span>
          )}
        </button>
      </div>
    )
  }

  // ── Render: Open panel ──────────────────────────────────────────────────────

  return (
    <div className="fixed bottom-6 right-6 w-[400px] max-w-[calc(100vw-48px)] h-[560px] max-h-[calc(100vh-48px)] bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-primary-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-gray-900" />
          {/* "Matte rakt av" — Andreas 2026-08-03; Jobbkompisen-namnet utgår. */}
          <span className="font-semibold text-gray-900">Matte</span>
          {activeTimer && (
            <span className="text-xs bg-white/30 text-gray-900 px-2 py-0.5 rounded-full">
              {activeTimer.customer?.name || 'Aktivt jobb'}
            </span>
          )}
        </div>
        <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 p-1 rounded-lg transition-colors">
          <X className="w-5 h-5 text-gray-900" />
        </button>
      </div>

      {/* Värdebandet — vad Handymate hittat senaste månaden, i de tre
          ärlighetsnivåerna. Renderas bara när något finns att visa: ett
          band med nollor hade sagt "vi hittade inget" med stora siffror. */}
      <MatteValueStrip />

      {/* Tabs */}
      <div className="flex border-b border-gray-200 flex-shrink-0">
        {([
          { id: 'chat' as Tab, icon: MessageSquare, label: 'Chat' },
          { id: 'voice' as Tab, icon: Mic, label: 'Röst' },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'text-primary-700 border-b-2 border-primary-600 bg-primary-50/50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Context banner when timer is active */}
      {activeTimer && (
        <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2 flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-emerald-700">
            Jobbar hos <strong>{activeTimer.customer?.name || 'kund'}</strong>
            {activeTimer.work_category && ` \· ${activeTimer.work_category}`}
          </span>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'chat' && (
          <ChatTab
            messages={messages}
            input={chatInput}
            loading={chatLoading}
            messagesEndRef={messagesEndRef}
            suggestions={suggestions}
            executingActions={executingActions}
            pendingConfirmation={pendingConfirmation}
            onInputChange={setChatInput}
            onSend={() => sendChat()}
            onSendChat={startMissionFromCard}
            onExecuteAction={executeAction}
            onClearSuggestion={clearSuggestion}
            onConfirmPending={confirmPendingAction}
            onCancelPending={cancelPendingAction}
            actionIcon={actionIcon}
            onPhotoClick={() => cameraInputRef.current?.click()}
            photoAnalyzing={photoAnalyzing}
          />
        )}

        {activeTab === 'voice' && (
          <VoiceTab
            isRecording={isRecording}
            duration={voiceDuration}
            audioBlob={audioBlob}
            processing={voiceProcessing}
            result={voiceResult}
            executingActions={executingActions}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            onProcess={processVoice}
            onReset={resetVoice}
            onExecuteAction={executeAction}
            onExecuteAll={executeAllActions}
            formatTime={formatTime}
            actionIcon={actionIcon}
          />
        )}

        {/* Foto-fliken borttagen (Matte-flytten 2026-08-03) — den var redan
            onåbar (ingen tab-knapp pekade på 'photo'). Foto går nu via
            kameraknappen i chatt-inputen → analyzePhotoIntoChat. */}
      </div>

      {/* Dolda file-inputs för kameraknappen i chatten */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) analyzePhotoIntoChat(f); e.target.value = '' }}
      />
    </div>
  )
}

// ── ChatTab ─────────────────────────────────────────────────────────────────

function ChatTab({
  messages,
  input,
  loading,
  messagesEndRef,
  suggestions,
  executingActions,
  pendingConfirmation,
  onInputChange,
  onSend,
  onSendChat,
  onExecuteAction,
  onClearSuggestion,
  onConfirmPending,
  onCancelPending,
  actionIcon,
  onPhotoClick,
  photoAnalyzing,
}: {
  messages: ChatMessage[]
  input: string
  loading: boolean
  messagesEndRef: React.RefObject<HTMLDivElement>
  suggestions: { id: string; type: string; title: string; description: string }[]
  executingActions: Set<string>
  pendingConfirmation: PendingConfirmation | null
  onInputChange: (v: string) => void
  onSend: () => void
  /** MissionPlanCards "Starta uppdraget" — se Jobbkompisen.startMissionFromCard. */
  onSendChat: (text: string) => void
  onExecuteAction: (action: AIAction) => void
  onClearSuggestion: (id: string) => void
  onConfirmPending: () => void
  onCancelPending: () => void
  actionIcon: (type: string) => React.ReactNode
  onPhotoClick: () => void
  photoAnalyzing: boolean
}) {
  // Matte som chef över teamet: innan konversationen börjat visas dagens
  // fynd — med agentens ansikte, inte som systemnotiser. ChatTab ligger
  // under MomentsProvider och hämtar dem själv i stället för prop-trädning.
  const { panel: dagensFynd, markSeen } = useMoments()
  // Hopfällt som default (2026-08-11) — chatten är primär, fynden sekundära.
  const [fyndUtfallda, setFyndUtfallda] = useState(false)
  const chatPathname = usePathname()
  const quickActions = pageContextFromPathname(chatPathname).quickActions

  // Tomt läge: bara hälsningen finns kvar — visa exempel-kommandon som chips
  // (fyller inputen, skickar inte automatiskt) så riktiga Matte blir upptäckbar.
  const showExamples = messages.length <= 1 && suggestions.length === 0
  const visaFynd = messages.length <= 1 && dagensFynd.length > 0
  return (
    <>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Dagens fynd — HOPFÄLLDA (2026-08-11, Andreas UX-fynd): tre stora
            fyndkort ovanpå tomma chatten fick ytan att kännas som en logg,
            inte ett samtal med Matte. Chatten är primär; fynden är en rad
            man kan fälla ut om man vill. */}
        {visaFynd && !pendingConfirmation && (
          <div className="mb-3">
            <button
              type="button"
              onClick={() => setFyndUtfallda(v => !v)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-left hover:border-primary-200 transition-colors"
            >
              <span className="text-xs font-medium text-gray-600">
                Teamet har hittat {dagensFynd.length} {dagensFynd.length === 1 ? 'sak' : 'saker'}
              </span>
              <span className="text-xs text-primary-700 font-semibold shrink-0">
                {fyndUtfallda ? 'Dölj' : 'Visa'}
              </span>
            </button>
            {fyndUtfallda && (
              <div className="space-y-2 mt-2">
                {dagensFynd.slice(0, 3).map(m => (
                  <Link
                    key={m.id}
                    href={m.action.href}
                    onClick={() => markSeen(m.id)}
                    className="flex items-start gap-2.5 p-2.5 bg-white border border-slate-200 rounded-xl hover:border-primary-300 transition-colors"
                  >
                    <AgentAvatar agentKey={m.agentId} size="sm" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-900 leading-snug">
                        {m.headline}
                      </span>
                      <span className="block text-xs text-primary-700 font-semibold mt-0.5">
                        {m.action.label} →
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Smart suggestions */}
        {suggestions.length > 0 && (
          <div className="space-y-2 mb-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Smarta f\örslag</p>
            {suggestions.map(s => (
              <div key={s.id} className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  {actionIcon(s.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{s.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>
                </div>
                <button
                  onClick={() => onClearSuggestion(s.id)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Chat messages — Epic 3: samma bubbla som MatteChatModal.
            Dirigeringen syntes tidigare bara som en fotnot ("💬 via Karin")
            med Mattes formspråk runt; nu ÄR porträttet avsändaren, och
            överlämningar och statusar ser likadana ut på båda ytorna. */}
        {messages.map((message, i) => (
          <AgentMessage key={i} message={message} index={i} onSendChat={onSendChat} onPrefill={onInputChange}>
            {/* Actions from AI */}
            {message.actions && message.actions.length > 0 && (
              <div className="mt-2 ml-1 space-y-1.5">
                {message.actions.map(action => (
                  <button
                    key={action.id}
                    onClick={() => action.status === 'pending' && onExecuteAction(action)}
                    disabled={action.status !== 'pending' || executingActions.has(action.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all w-full text-left ${
                      action.status === 'done'
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                        : executingActions.has(action.id)
                          ? 'bg-gray-50 border border-gray-200 text-gray-400'
                          : 'bg-primary-50 border border-primary-200 text-primary-700 hover:bg-primary-100'
                    }`}
                  >
                    {executingActions.has(action.id) ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : action.status === 'done' ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      actionIcon(action.type)
                    )}
                    <span className="flex-1">{action.label}</span>
                    {action.status === 'pending' && !executingActions.has(action.id) && (
                      <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </AgentMessage>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-500 px-3.5 py-2.5 rounded-2xl text-sm border border-gray-200">
              <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" />
              T\änker...
            </div>
          </div>
        )}

        {/* Säkerhetsräcke: bekräftelsekort för externa utskick (SMS/e-post) */}
        {pendingConfirmation && (
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-2.5">
            <p className="text-sm text-gray-900">{pendingConfirmation.summary}</p>
            <div className="flex gap-2">
              <button
                onClick={onConfirmPending}
                disabled={loading}
                className="flex-1 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                Skicka
              </button>
              <button
                onClick={onCancelPending}
                disabled={loading}
                className="flex-1 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                Avbryt
              </button>
            </div>
          </div>
        )}

        {/* Kontextchips — Matte vet vilken sida hantverkaren står på och
            föreslår frågor som är relevanta HÄR. Fyller inputen, skickar
            aldrig automatiskt. */}
        {quickActions.length > 0 && !pendingConfirmation && messages.length <= 1 && (
          <div className="pt-1 space-y-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Om den här sidan</p>
            <div className="flex flex-wrap gap-1.5">
              {quickActions.map(fraga => (
                <button
                  key={fraga}
                  onClick={() => onInputChange(fraga)}
                  className="px-2.5 py-1.5 bg-primary-50 border border-primary-200 rounded-full text-xs text-primary-800 hover:border-primary-400 transition-colors text-left"
                >
                  {fraga}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Exempel-kommandon — upptäckbarhet för riktiga Matte */}
        {showExamples && !pendingConfirmation && (
          <div className="pt-1 space-y-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Prova till exempel</p>
            <div className="flex flex-wrap gap-1.5">
              {[...EXAMPLE_COMMANDS, ...EXAMPLE_QUESTIONS].map((example) => (
                <button
                  key={example}
                  onClick={() => onInputChange(example)}
                  className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-600 hover:border-primary-400 hover:text-primary-700 transition-colors text-left"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Kameraknapp (Matte-flytten 2026-08-03): foto → vision-analys →
              in i samma Matte-tråd. Ersätter den onåbara foto-fliken. */}
          <button
            onClick={onPhotoClick}
            disabled={loading || photoAnalyzing}
            aria-label="Skicka ett foto till Matte"
            className="w-10 h-10 bg-gray-100 border border-gray-200 text-gray-500 rounded-xl flex items-center justify-center hover:text-primary-700 hover:border-primary-300 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            {photoAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSend()}
            placeholder="Be Matte göra något…"
            className="flex-1 px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/50 focus:border-primary-600"
          />
          <button
            onClick={onSend}
            disabled={loading}
            className="w-10 h-10 bg-primary-700 text-white rounded-xl flex items-center justify-center hover:opacity-90 disabled:opacity-50 transition-opacity flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  )
}

// ── VoiceTab ────────────────────────────────────────────────────────────────

function VoiceTab({
  isRecording,
  duration,
  audioBlob,
  processing,
  result,
  executingActions,
  onStartRecording,
  onStopRecording,
  onProcess,
  onReset,
  onExecuteAction,
  onExecuteAll,
  formatTime,
  actionIcon,
}: {
  isRecording: boolean
  duration: number
  audioBlob: Blob | null
  processing: boolean
  result: VoiceAnalysis | null
  executingActions: Set<string>
  onStartRecording: () => void
  onStopRecording: () => void
  onProcess: () => void
  onReset: () => void
  onExecuteAction: (action: AIAction) => void
  onExecuteAll: (actions: AIAction[]) => void
  formatTime: (s: number) => string
  actionIcon: (type: string) => React.ReactNode
}) {
  // Show result
  if (result) {
    const pendingActions = result.actions.filter(a => a.status === 'pending')
    const allDone = result.actions.length > 0 && result.actions.every(a => a.status === 'done')

    return (
      <div className="flex-1 overflow-y-auto p-4">
        {/* What AI understood */}
        <div className="mb-4 p-3 bg-primary-50 border border-primary-200 rounded-xl">
          <p className="text-xs font-medium text-primary-700 mb-1">F\örstod:</p>
          <p className="text-sm text-gray-900">{result.understood}</p>
        </div>

        {/* Actions */}
        {result.actions.length > 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Åtg\ärder</p>
            {result.actions.map(action => (
              <button
                key={action.id}
                onClick={() => action.status === 'pending' && onExecuteAction(action)}
                disabled={action.status !== 'pending' || executingActions.has(action.id)}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all w-full text-left ${
                  action.status === 'done'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                    : executingActions.has(action.id)
                      ? 'bg-gray-50 border border-gray-200 text-gray-400'
                      : 'bg-white border border-gray-200 text-gray-900 hover:bg-primary-50 hover:border-primary-200'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  action.status === 'done' ? 'bg-emerald-100' : 'bg-primary-100'
                }`}>
                  {executingActions.has(action.id) ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary-700" />
                  ) : action.status === 'done' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <span className="text-primary-700">{actionIcon(action.type)}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{action.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{action.description}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Batch execute button */}
        {pendingActions.length > 1 && (
          <button
            onClick={() => onExecuteAll(result.actions)}
            className="w-full py-3 bg-primary-700 text-white rounded-xl font-medium text-sm hover:opacity-90 transition-opacity mb-3"
          >
            Utf\ör alla ({pendingActions.length} \åtg\ärder)
          </button>
        )}

        {allDone && (
          <div className="text-center p-4">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-900">Allt klart!</p>
          </div>
        )}

        {/* Start over */}
        <button
          onClick={onReset}
          className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Ny inspelning
        </button>
      </div>
    )
  }

  // Processing
  if (processing) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <Loader2 className="w-10 h-10 text-primary-700 animate-spin mb-3" />
        <p className="text-gray-900 font-medium">Analyserar...</p>
        <p className="text-xs text-gray-400 mt-1">Transkriberar och f\örst\år dina instruktioner</p>
      </div>
    )
  }

  // Have recording, ready to process
  if (audioBlob) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-20 h-20 rounded-full bg-emerald-100 border-2 border-emerald-500 flex items-center justify-center mb-4">
          <Mic className="w-8 h-8 text-emerald-600" />
        </div>
        <p className="text-gray-900 font-medium mb-1">Inspelning klar</p>
        <p className="text-sm text-gray-400 mb-6">{formatTime(duration)}</p>

        <div className="flex gap-3 w-full px-4">
          <button
            onClick={onReset}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-700 font-medium text-sm hover:bg-gray-200"
          >
            <RotateCcw className="w-4 h-4" />
            Igen
          </button>
          <button
            onClick={onProcess}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary-700 rounded-xl text-white font-medium text-sm hover:opacity-90"
          >
            <Zap className="w-4 h-4" />
            Analysera
          </button>
        </div>
      </div>
    )
  }

  // Ready to record
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <p className="text-sm text-gray-500 mb-6 text-center max-w-[260px]">
        Ber\ätta vad du gjort, vad som beh\övs eller s\äg ett kommando.
        AI:n f\örst\år och utf\ör.
      </p>

      <button
        onClick={isRecording ? onStopRecording : onStartRecording}
        className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all ${
          isRecording
            ? 'bg-red-500 shadow-lg shadow-red-500/30'
            : 'bg-primary-700 shadow-lg shadow-primary-600/20 hover:scale-105'
        }`}
      >
        {isRecording ? (
          <Square className="w-8 h-8 text-white" />
        ) : (
          <Mic className="w-8 h-8 text-white" />
        )}
        {isRecording && (
          <span className="absolute inset-0 rounded-full border-2 border-red-300 animate-ping" />
        )}
      </button>

      {isRecording ? (
        <p className="mt-4 text-lg font-mono text-gray-900 tabular-nums">{formatTime(duration)}</p>
      ) : (
        <p className="mt-4 text-xs text-gray-400">Tryck f\ör att b\örja</p>
      )}

      {/* Quick examples */}
      {!isRecording && (
        <div className="mt-6 space-y-1.5 w-full px-2">
          <p className="text-xs text-gray-400 text-center mb-2">Exempel:</p>
          {[
            'Jag \är klar hos kunden, bytte tv\å uttag',
            'Skapa offert f\ör badrumsrenovering',
            'Skicka p\åminnelse till senaste kunden',
          ].map((example, i) => (
            <p key={i} className="text-xs text-gray-400 text-center italic">
              "{example}"
            </p>
          ))}
        </div>
      )}
    </div>
  )
}


/**
 * Värdebandet i Mattes panel — "vad har det här gett mig?"
 *
 * Tre nivåer, aldrig ihopblandade (samma epistemik som lib/weekly-value):
 * bekräftade kronor leder, potential och tid är tydligt märkta som sådana.
 * Siffrorna kommer från attributionskärnan — här hittas ingenting på, och
 * därför renderas bandet inte alls innan det finns något att visa.
 */
function MatteValueStrip() {
  const [varde, setVarde] = useState<{
    confirmed_kr: number
    captured_kr: number
    time_hours: number
    confirmed_items: Array<{ label: string; amount: number; agent: string; dagar: number }>
  } | null>(null)
  const [oppen, setOppen] = useState(false)

  useEffect(() => {
    let aktiv = true
    fetch('/api/dashboard/weekly-value?days=30')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (aktiv && d) setVarde(d) })
      .catch(() => { /* bandet är grädde, aldrig mjölk */ })
    return () => { aktiv = false }
  }, [])

  if (!varde) return null
  const harNagot = varde.confirmed_kr > 0 || varde.captured_kr > 0 || varde.time_hours > 0
  if (!harNagot) return null

  const bevis = varde.confirmed_items ?? []

  return (
    <div className="flex-shrink-0 border-b border-primary-100">
      <button
        type="button"
        onClick={() => setOppen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-2 bg-primary-50/60 text-[11px] leading-tight overflow-x-auto"
      >
        <span className="font-semibold text-primary-900 whitespace-nowrap">Senaste 30 dagarna</span>
        {varde.confirmed_kr > 0 && (
          <span className="whitespace-nowrap text-primary-800">
            <b className="font-bold">{formatKr(varde.confirmed_kr)}</b> bekräftat
          </span>
        )}
        {varde.captured_kr > 0 && (
          <span className="whitespace-nowrap text-primary-700/80">
            {formatKr(varde.captured_kr)} potential
          </span>
        )}
        {varde.time_hours > 0 && (
          <span className="whitespace-nowrap text-primary-700/80">
            ≈ {varde.time_hours} h sparade
          </span>
        )}
        {bevis.length > 0 && (
          <ChevronRight className={`w-3.5 h-3.5 text-primary-400 ml-auto shrink-0 transition-transform ${oppen ? 'rotate-90' : ''}`} />
        )}
      </button>

      {/* Värdebevisen: varje bekräftad krona bär sin berättelse — vilken
          agent, vilket utskick, hur många dagar till utfallet. Det är
          kvittot på varför man betalar, och det går aldrig att expandera
          fram en rad som attributionskärnan inte verifierat. */}
      {oppen && bevis.length > 0 && (
        <div className="px-4 py-2 bg-white border-t border-primary-50 max-h-40 overflow-y-auto">
          {bevis.slice(0, 6).map((b, i) => (
            <div key={`${b.label}-${i}`} className="flex items-center gap-2 py-1.5">
              <AgentAvatar agentKey={b.agent} size="sm" />
              <span className="flex-1 min-w-0 text-xs text-gray-600 truncate">{b.label}</span>
              <span className="shrink-0 text-right">
                <span className="block text-xs font-bold text-gray-900">+{formatKr(b.amount)}</span>
                <span className="block text-[10px] text-gray-400">
                  {b.dagar === 0 ? 'samma dag' : `inom ${b.dagar} ${b.dagar === 1 ? 'dag' : 'dagar'}`}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
