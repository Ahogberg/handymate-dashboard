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
import { useJobbuddy } from '@/lib/JobbuddyContext'
import { useBusiness } from '@/lib/BusinessContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  actions?: AIAction[]
}

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
  const { activeTimer, isOpen, setIsOpen, activeTab, setActiveTab, suggestions, clearSuggestion } = useJobbuddy()
  const business = useBusiness()

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Hej! Jag är din Jobbkompis. Chatta, prata eller fota - jag hjälper dig med allt.' }
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
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

  // Photo state
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoAnalyzing, setPhotoAnalyzing] = useState(false)
  const [photoResult, setPhotoResult] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return

    const userMessage = chatInput.trim()
    setChatInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setChatLoading(true)

    try {
      const response = await fetch('/api/ai-copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage,
          mode: 'jobbuddy',
          context: {
            activeTimer: activeTimer ? {
              customer: activeTimer.customer?.name,
              duration: activeTimer.check_in_time,
              category: activeTimer.work_category,
            } : null,
          }
        }),
      })

      const data = await response.json()
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer,
        actions: data.actions || undefined,
      }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ett fel uppstod. Försök igen.' }])
    } finally {
      setChatLoading(false)
    }
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

  async function processVoice() {
    if (!audioBlob) return

    setVoiceProcessing(true)
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')
      formData.append('mode', 'jobbuddy')
      if (activeTimer?.customer) {
        formData.append('active_customer', activeTimer.customer.name)
        formData.append('active_customer_id', activeTimer.customer.customer_id)
      }

      const response = await fetch('/api/jobbuddy/voice', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      setVoiceResult({
        understood: data.understood || data.transcript || '',
        actions: data.actions || [],
      })
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

  function handlePhotoFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      setPhotoPreview(e.target?.result as string)
      setPhotoResult(null)
    }
    reader.readAsDataURL(file)
  }

  async function analyzePhoto() {
    if (!photoPreview) return

    setPhotoAnalyzing(true)
    try {
      const base64 = photoPreview.split(',')[1]
      const response = await fetch('/api/jobbuddy/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      })

      const data = await response.json()
      setPhotoResult(data.analysis || 'Ingen analys tillgänglig.')
    } catch {
      setPhotoResult('Kunde inte analysera bilden. Försök igen.')
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
    const hasSuggestions = suggestions.length > 0
    const hasActiveJob = !!activeTimer

    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 w-14 h-14 rounded-2xl shadow-lg flex items-center justify-center hover:scale-105 transition-all z-50 ${
          hasActiveJob
            ? 'bg-gradient-to-br from-emerald-500 to-teal-500 shadow-emerald-500/20'
            : 'bg-teal-600 shadow-teal-500/10'
        }`}
      >
        {hasActiveJob ? (
          <Mic className="w-6 h-6 text-white animate-pulse" />
        ) : (
          <Sparkles className="w-6 h-6 text-white" />
        )}
        {hasSuggestions && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 flex items-center justify-center text-[10px] font-bold bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full">
            {suggestions.length}
          </span>
        )}
      </button>
    )
  }

  // ── Render: Open panel ──────────────────────────────────────────────────────

  return (
    <div className="fixed bottom-6 right-6 w-[400px] max-w-[calc(100vw-48px)] h-[560px] max-h-[calc(100vh-48px)] bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-teal-600 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-gray-900" />
          <span className="font-semibold text-gray-900">Jobbkompisen</span>
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
                ? 'text-sky-700 border-b-2 border-teal-500 bg-teal-50/50'
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
            onInputChange={setChatInput}
            onSend={sendChat}
            onExecuteAction={executeAction}
            onClearSuggestion={clearSuggestion}
            actionIcon={actionIcon}
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

        {activeTab === 'photo' && (
          <PhotoTab
            preview={photoPreview}
            analyzing={photoAnalyzing}
            result={photoResult}
            fileInputRef={fileInputRef}
            cameraInputRef={cameraInputRef}
            onFile={handlePhotoFile}
            onAnalyze={analyzePhoto}
            onReset={() => { setPhotoPreview(null); setPhotoResult(null) }}
            onCreateQuote={() => setIsOpen(false)}
          />
        )}
      </div>
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
  onInputChange,
  onSend,
  onExecuteAction,
  onClearSuggestion,
  actionIcon,
}: {
  messages: ChatMessage[]
  input: string
  loading: boolean
  messagesEndRef: React.RefObject<HTMLDivElement>
  suggestions: { id: string; type: string; title: string; description: string }[]
  executingActions: Set<string>
  onInputChange: (v: string) => void
  onSend: () => void
  onExecuteAction: (action: AIAction) => void
  onClearSuggestion: (id: string) => void
  actionIcon: (type: string) => React.ReactNode
}) {
  return (
    <>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
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

        {/* Chat messages */}
        {messages.map((message, i) => (
          <div key={i}>
            <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  message.role === 'user'
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-800 border border-gray-200'
                }`}
              >
                {message.content}
              </div>
            </div>
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
                          : 'bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100'
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
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-500 px-3.5 py-2.5 rounded-2xl text-sm border border-gray-200">
              <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" />
              T\änker...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSend()}
            placeholder="Fr\åga din jobbkompis..."
            className="flex-1 px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
          />
          <button
            onClick={onSend}
            disabled={loading}
            className="w-10 h-10 bg-teal-600 text-white rounded-xl flex items-center justify-center hover:opacity-90 disabled:opacity-50 transition-opacity flex-shrink-0"
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
        <div className="mb-4 p-3 bg-teal-50 border border-teal-200 rounded-xl">
          <p className="text-xs font-medium text-sky-700 mb-1">F\örstod:</p>
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
                      : 'bg-white border border-gray-200 text-gray-900 hover:bg-teal-50 hover:border-teal-200'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  action.status === 'done' ? 'bg-emerald-100' : 'bg-teal-100'
                }`}>
                  {executingActions.has(action.id) ? (
                    <Loader2 className="w-4 h-4 animate-spin text-sky-700" />
                  ) : action.status === 'done' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <span className="text-sky-700">{actionIcon(action.type)}</span>
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
            className="w-full py-3 bg-teal-600 text-white rounded-xl font-medium text-sm hover:opacity-90 transition-opacity mb-3"
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
        <Loader2 className="w-10 h-10 text-teal-600 animate-spin mb-3" />
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
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-teal-600 rounded-xl text-white font-medium text-sm hover:opacity-90"
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
            : 'bg-teal-600 shadow-lg shadow-teal-500/20 hover:scale-105'
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

// ── PhotoTab ────────────────────────────────────────────────────────────────

function PhotoTab({
  preview,
  analyzing,
  result,
  fileInputRef,
  cameraInputRef,
  onFile,
  onAnalyze,
  onReset,
  onCreateQuote,
}: {
  preview: string | null
  analyzing: boolean
  result: string | null
  fileInputRef: React.RefObject<HTMLInputElement>
  cameraInputRef: React.RefObject<HTMLInputElement>
  onFile: (file: File) => void
  onAnalyze: () => void
  onReset: () => void
  onCreateQuote?: () => void
}) {
  if (analyzing) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {preview && (
          <div className="w-24 h-24 rounded-xl overflow-hidden mb-4 border border-gray-200">
            <img src={preview} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin mb-3" />
        <p className="text-gray-900 font-medium">Analyserar bild...</p>
        <div className="mt-2 space-y-1 text-xs text-gray-400 text-center">
          <p>Identifierar arbete och material...</p>
          <p>Ber\äknar ungef\ärlig omfattning...</p>
        </div>
      </div>
    )
  }

  if (result && preview) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="rounded-xl overflow-hidden mb-4 border border-gray-200">
          <img src={preview} alt="" className="w-full max-h-[150px] object-cover" />
        </div>
        <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl mb-4">
          <p className="text-xs font-medium text-sky-700 mb-1">Analys</p>
          <p className="text-sm text-gray-900 whitespace-pre-wrap">{result}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onReset}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-gray-700 text-sm hover:bg-gray-200"
          >
            <RotateCcw className="w-4 h-4" />
            Ny bild
          </button>
          <a
            href={`/dashboard/quotes/new?transcript=${encodeURIComponent(result)}`}
            onClick={onCreateQuote}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-teal-600 rounded-xl text-white text-sm font-medium hover:opacity-90"
          >
            <FileText className="w-4 h-4" />
            Skapa offert
          </a>
        </div>
      </div>
    )
  }

  // Preview with analyze button
  if (preview) {
    return (
      <div className="flex-1 flex flex-col p-4">
        <div className="rounded-xl overflow-hidden mb-4 border border-gray-200">
          <img src={preview} alt="" className="w-full max-h-[200px] object-contain bg-gray-50" />
        </div>
        <div className="flex gap-3">
          <button
            onClick={onReset}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-700 text-sm hover:bg-gray-200"
          >
            <RotateCcw className="w-4 h-4" />
            Ny bild
          </button>
          <button
            onClick={onAnalyze}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-teal-600 rounded-xl text-white font-medium text-sm hover:opacity-90"
          >
            <Zap className="w-4 h-4" />
            Analysera
          </button>
        </div>
      </div>
    )
  }

  // No photo yet
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center w-full mb-4">
        <Camera className="w-10 h-10 text-gray-400 mx-auto mb-3" />
        <p className="text-sm text-gray-500 mb-4">Fota jobbet f\ör analys</p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 rounded-xl text-white font-medium text-sm hover:opacity-90"
          >
            <Camera className="w-4 h-4" />
            Ta bild
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-700 text-sm hover:bg-gray-200"
          >
            <Upload className="w-4 h-4" />
            V\älj bild
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-400 text-center">
        AI:n identifierar material, arbete och ger offertf\örslag.
      </p>

      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
    </div>
  )
}
