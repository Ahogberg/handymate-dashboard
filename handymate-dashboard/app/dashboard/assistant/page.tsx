'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Mic,
  MicOff,
  Loader2,
  CheckCircle,
  XCircle,
  MessageSquare,
  Calendar,
  FileText,
  HelpCircle,
  ChevronRight,
  Volume2
} from 'lucide-react'
import { useVoiceCommand } from '@/hooks/useVoiceCommand'
import { useBusiness } from '@/lib/BusinessContext'

interface CommandHistory {
  id: string
  text: string
  response: string
  action: string
  timestamp: Date
  success: boolean
}

interface CommandResponse {
  action: string
  params: Record<string, any>
  response: string
  needsConfirmation: boolean
  suggestions?: string[]
}

const quickCommands = [
  { icon: FileText, label: 'Skapa offert', example: 'Skapa offert till [kund] på [jobb]' },
  { icon: Calendar, label: 'Boka kund', example: 'Boka [kund] på [dag] klockan [tid]' },
  { icon: MessageSquare, label: 'Skicka påminnelse', example: 'Skicka påminnelse till [kund]' },
]

export default function AssistantPage() {
  const router = useRouter()
  const business = useBusiness()

  const [isProcessing, setIsProcessing] = useState(false)
  const [currentResponse, setCurrentResponse] = useState<CommandResponse | null>(null)
  const [history, setHistory] = useState<CommandHistory[]>([])
  const [showHelp, setShowHelp] = useState(false)

  const {
    isListening,
    transcript,
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript
  } = useVoiceCommand({
    language: 'sv-SE',
    onResult: handleVoiceResult,
    onError: (err) => console.error('Voice error:', err)
  })

  async function handleVoiceResult(text: string) {
    if (!text.trim()) return

    setIsProcessing(true)
    setCurrentResponse(null)

    try {
      const response = await fetch('/api/assistant/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          businessId: business.business_id
        })
      })

      const data: CommandResponse = await response.json()
      setCurrentResponse(data)

      // Add to history
      const historyItem: CommandHistory = {
        id: Date.now().toString(),
        text,
        response: data.response,
        action: data.action,
        timestamp: new Date(),
        success: data.action !== 'unknown'
      }
      setHistory(prev => [historyItem, ...prev].slice(0, 10))

      // Speak the response (if browser supports it)
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(data.response)
        utterance.lang = 'sv-SE'
        utterance.rate = 1.1
        window.speechSynthesis.speak(utterance)
      }

    } catch (error) {
      console.error('Command error:', error)
      setCurrentResponse({
        action: 'unknown',
        params: {},
        response: 'Något gick fel. Försök igen.',
        needsConfirmation: false
      })
    } finally {
      setIsProcessing(false)
      resetTranscript()
    }
  }

  async function handleConfirm() {
    if (!currentResponse) return

    const { action, params } = currentResponse

    try {
      switch (action) {
        case 'create_quote':
          router.push(`/dashboard/quotes/new?customerId=${params.customer_id || ''}&description=${encodeURIComponent(params.job_type || '')}`)
          break

        case 'create_booking':
          router.push(`/dashboard/calendar?action=new&customerId=${params.customer_id || ''}`)
          break

        case 'send_reminder':
          // TODO: Implement send reminder action
          alert('Påminnelse-funktion kommer snart!')
          break

        case 'get_stats':
          router.push('/dashboard')
          break

        case 'search_customer':
          if (params.customer_id) {
            router.push(`/dashboard/customers/${params.customer_id}`)
          } else {
            router.push(`/dashboard/customers?search=${encodeURIComponent(params.customer_search || '')}`)
          }
          break

        case 'create_invoice':
          router.push(`/dashboard/invoices/new?customerId=${params.customer_id || ''}`)
          break
      }

      setCurrentResponse(null)
    } catch (error) {
      console.error('Action error:', error)
    }
  }

  function handleCancel() {
    setCurrentResponse(null)
    resetTranscript()
  }

  function handleQuickCommand(example: string) {
    // Simulate voice input with the example
    handleVoiceResult(example.replace(/\[.*?\]/g, ''))
  }

  const toggleListening = () => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }

  return (
    <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-violet-500/20 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Röstassistent</h1>
          <p className="text-zinc-400">Säg ett kommando eller tryck på mikrofonen</p>
        </div>

        {/* Not supported warning */}
        {!isSupported && (
          <div className="mb-8 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-center">
            Din webbläsare stöder inte röstinmatning. Prova Chrome eller Edge.
          </div>
        )}

        {/* Main mic button */}
        <div className="flex flex-col items-center mb-8">
          <button
            onClick={toggleListening}
            disabled={!isSupported || isProcessing}
            className={`relative w-32 h-32 rounded-full flex items-center justify-center transition-all ${
              isListening
                ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/50'
                : 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700'
            } disabled:opacity-50`}
          >
            {isProcessing ? (
              <Loader2 className="w-12 h-12 text-white animate-spin" />
            ) : isListening ? (
              <Mic className="w-12 h-12 text-white animate-pulse" />
            ) : (
              <MicOff className="w-12 h-12 text-zinc-400" />
            )}

            {/* Pulse rings when listening */}
            {isListening && (
              <>
                <span className="absolute inset-0 rounded-full bg-violet-500/30 animate-ping"></span>
                <span className="absolute inset-[-8px] rounded-full border-2 border-violet-500/50 animate-pulse"></span>
              </>
            )}
          </button>

          <p className="mt-4 text-sm text-zinc-500">
            {isListening ? 'Lyssnar...' : isProcessing ? 'Bearbetar...' : 'Tryck för att börja'}
          </p>
        </div>

        {/* Transcript */}
        {(transcript || isListening) && (
          <div className="mb-6 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
            <p className="text-sm text-zinc-500 mb-1">Du sa:</p>
            <p className="text-white text-lg">{transcript || '...'}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
            {error}
          </div>
        )}

        {/* Response */}
        {currentResponse && (
          <div className="mb-8 p-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl">
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                currentResponse.action !== 'unknown'
                  ? 'bg-violet-500/20'
                  : 'bg-amber-500/20'
              }`}>
                {currentResponse.action !== 'unknown' ? (
                  <Volume2 className="w-5 h-5 text-violet-400" />
                ) : (
                  <HelpCircle className="w-5 h-5 text-amber-400" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-white text-lg">{currentResponse.response}</p>

                {/* Suggestions for unknown commands */}
                {currentResponse.suggestions && currentResponse.suggestions.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm text-zinc-500 mb-2">Prova att säga:</p>
                    <div className="space-y-2">
                      {currentResponse.suggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleVoiceResult(suggestion)}
                          className="block w-full text-left px-3 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-700"
                        >
                          "{suggestion}"
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Confirmation buttons */}
                {currentResponse.needsConfirmation && currentResponse.action !== 'unknown' && (
                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={handleConfirm}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl text-white font-medium hover:opacity-90"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Ja, fortsätt
                    </button>
                    <button
                      onClick={handleCancel}
                      className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white hover:bg-zinc-700"
                    >
                      <XCircle className="w-4 h-4" />
                      Avbryt
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Quick commands */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Snabbkommandon</h2>
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="text-sm text-violet-400 hover:text-violet-300"
            >
              {showHelp ? 'Dölj hjälp' : 'Visa hjälp'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {quickCommands.map((cmd, idx) => (
              <button
                key={idx}
                onClick={() => handleQuickCommand(cmd.example)}
                className="flex items-center gap-3 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl hover:bg-zinc-800/50 transition-all text-left"
              >
                <div className="w-10 h-10 bg-violet-500/20 rounded-xl flex items-center justify-center">
                  <cmd.icon className="w-5 h-5 text-violet-400" />
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium">{cmd.label}</p>
                  {showHelp && (
                    <p className="text-xs text-zinc-500 mt-1">"{cmd.example}"</p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600" />
              </button>
            ))}
          </div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Historik</h2>
            <div className="space-y-2">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 bg-zinc-900/50 border border-zinc-800 rounded-xl"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    item.success ? 'bg-emerald-500/20' : 'bg-zinc-500/20'
                  }`}>
                    {item.success ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <HelpCircle className="w-4 h-4 text-zinc-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">"{item.text}"</p>
                    <p className="text-xs text-zinc-500 mt-1">{item.response}</p>
                  </div>
                  <p className="text-xs text-zinc-600 flex-shrink-0">
                    {item.timestamp.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
