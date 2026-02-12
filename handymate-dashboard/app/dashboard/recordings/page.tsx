'use client'

import { useEffect, useState } from 'react'
import {
  Mic,
  Play,
  Pause,
  FileText,
  Sparkles,
  Clock,
  Phone,
  User,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  Check,
  X,
  RefreshCw
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { format, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'

interface Recording {
  recording_id: string
  call_id: string | null
  customer_id: string | null
  recording_url: string
  duration_seconds: number
  transcript: string | null
  transcript_summary: string | null
  transcribed_at: string | null
  phone_number: string | null
  direction: 'inbound' | 'outbound'
  created_at: string
  customer?: {
    name: string
    phone_number: string
  }
  ai_suggestion?: {
    suggestion_id: string
    suggestion_type: string
    title: string
    status: string
  }[]
}

interface AISuggestion {
  suggestion_id: string
  suggestion_type: string
  title: string
  description: string
  priority: string
  status: string
  confidence_score: number
  source_text: string | null
  action_data: any
  created_at: string
}

export default function RecordingsPage() {
  const business = useBusiness()
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null)

  // Actions state
  const [transcribing, setTranscribing] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  const [editingTranscript, setEditingTranscript] = useState<string | null>(null)
  const [transcriptDraft, setTranscriptDraft] = useState('')
  const [savingTranscript, setSavingTranscript] = useState(false)

  // Suggestions for expanded recording
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  // Toast
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false, message: '', type: 'success'
  })

  useEffect(() => {
    fetchRecordings()
  }, [business.business_id])

  useEffect(() => {
    // Cleanup audio on unmount
    return () => {
      if (audioElement) {
        audioElement.pause()
        audioElement.src = ''
      }
    }
  }, [audioElement])

  async function fetchRecordings() {
    const { data } = await supabase
      .from('call_recording')
      .select(`
        *,
        customer (
          name,
          phone_number
        )
      `)
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })
      .limit(50)

    setRecordings(data || [])
    setLoading(false)
  }

  async function fetchSuggestions(recordingId: string) {
    setLoadingSuggestions(true)
    const { data } = await supabase
      .from('ai_suggestion')
      .select('*')
      .eq('recording_id', recordingId)
      .order('created_at', { ascending: false })

    setSuggestions(data || [])
    setLoadingSuggestions(false)
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const formatDuration = (seconds: number) => {
    if (!seconds) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const toggleExpand = async (recordingId: string) => {
    if (expandedId === recordingId) {
      setExpandedId(null)
      setSuggestions([])
    } else {
      setExpandedId(recordingId)
      await fetchSuggestions(recordingId)
    }
  }

  const togglePlay = (recording: Recording) => {
    if (playingId === recording.recording_id) {
      // Pausa
      audioElement?.pause()
      setPlayingId(null)
    } else {
      // Spela
      if (audioElement) {
        audioElement.pause()
      }

      const audio = new Audio(recording.recording_url)
      audio.onended = () => setPlayingId(null)
      audio.onerror = () => {
        showToast('Kunde inte spela upp inspelningen', 'error')
        setPlayingId(null)
      }
      audio.play()
      setAudioElement(audio)
      setPlayingId(recording.recording_id)
    }
  }

  const handleTranscribe = async (recordingId: string) => {
    setTranscribing(recordingId)
    try {
      const response = await fetch('/api/voice/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recording_id: recordingId })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Transcription failed')
      }

      showToast('Transkribering klar!', 'success')
      fetchRecordings()

      // Refresh suggestions after transcription (analysis should have run)
      setTimeout(() => {
        if (expandedId === recordingId) {
          fetchSuggestions(recordingId)
        }
      }, 2000)

    } catch (error: any) {
      showToast(error.message || 'Transkribering misslyckades', 'error')
    } finally {
      setTranscribing(null)
    }
  }

  const handleAnalyze = async (recordingId: string) => {
    setAnalyzing(recordingId)
    try {
      const response = await fetch('/api/voice/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recording_id: recordingId })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Analysis failed')
      }

      showToast(`Analys klar! ${result.suggestions_created} förslag skapade.`, 'success')
      fetchRecordings()
      fetchSuggestions(recordingId)

    } catch (error: any) {
      showToast(error.message || 'Analys misslyckades', 'error')
    } finally {
      setAnalyzing(null)
    }
  }

  const startEditTranscript = (recording: Recording) => {
    setEditingTranscript(recording.recording_id)
    setTranscriptDraft(recording.transcript || '')
  }

  const cancelEditTranscript = () => {
    setEditingTranscript(null)
    setTranscriptDraft('')
  }

  const saveTranscript = async (recordingId: string) => {
    setSavingTranscript(true)
    try {
      const response = await fetch('/api/recordings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recording_id: recordingId,
          transcript: transcriptDraft
        })
      })

      if (!response.ok) {
        throw new Error('Failed to save transcript')
      }

      showToast('Transkript sparat!', 'success')
      setEditingTranscript(null)
      fetchRecordings()

    } catch (error: any) {
      showToast(error.message || 'Kunde inte spara', 'error')
    } finally {
      setSavingTranscript(false)
    }
  }

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-600 border-red-200'
      case 'high': return 'bg-orange-100 text-orange-600 border-orange-500/30'
      case 'medium': return 'bg-yellow-100 text-yellow-400 border-yellow-500/30'
      default: return 'bg-gray-100 text-gray-500 border-gray-300'
    }
  }

  const getSuggestionTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      booking: 'Boka',
      follow_up: 'Uppföljning',
      quote: 'Offert',
      reminder: 'Påminnelse',
      sms: 'SMS',
      callback: 'Ring tillbaka',
      other: 'Övrigt'
    }
    return labels[type] || type
  }

  if (loading) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Laddar...</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]"></div>
      </div>

      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-100 border-emerald-200 text-emerald-600' : 'bg-red-100 border-red-200 text-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div className="flex items-center">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 mr-4">
              <Mic className="w-6 h-6 text-gray-900" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Samtalsinspelningar</h1>
              <p className="text-gray-500">Lyssna, transkribera och analysera samtal</p>
            </div>
          </div>
        </div>

        {/* Info box */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-300 rounded-xl">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-gray-900 font-medium">AI-analys av samtal</p>
              <p className="text-sm text-gray-500 mt-1">
                När ett samtal transkriberas analyserar AI:n innehållet och skapar förslag på åtgärder
                som bokningar, uppföljningar och offerter. Du hittar förslagen i AI Inbox.
              </p>
            </div>
          </div>
        </div>

        {/* Recordings list */}
        <div className="bg-white shadow-sm rounded-xl sm:rounded-2xl border border-gray-200">
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">Inspelningar</h2>
          </div>

          <div className="divide-y divide-gray-200">
            {recordings.length === 0 ? (
              <div className="p-8 sm:p-12 text-center">
                <Mic className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Inga inspelningar ännu</p>
                <p className="text-gray-400 text-sm mt-2">
                  Inspelningar visas här när samtal spelas in via 46elks
                </p>
              </div>
            ) : (
              recordings.map((recording) => (
                <div key={recording.recording_id} className="hover:bg-gray-100/30 transition-all">
                  {/* Main row */}
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => toggleExpand(recording.recording_id)}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center min-w-0 flex-1">
                        {/* Play button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            togglePlay(recording)
                          }}
                          className={`w-10 h-10 rounded-xl flex items-center justify-center border flex-shrink-0 transition-all ${
                            playingId === recording.recording_id
                              ? 'bg-gradient-to-br from-blue-500 to-cyan-500 border-blue-300'
                              : 'bg-gray-50 border-gray-300 hover:border-blue-300'
                          }`}
                        >
                          {playingId === recording.recording_id ? (
                            <Pause className="w-5 h-5 text-gray-900" />
                          ) : (
                            <Play className="w-5 h-5 text-gray-500" />
                          )}
                        </button>

                        <div className="ml-4 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-gray-900">
                              {recording.customer?.name || recording.phone_number || 'Okänd'}
                            </p>
                            <span className={`px-2 py-0.5 text-xs rounded-full border ${
                              recording.direction === 'inbound'
                                ? 'bg-emerald-100 text-emerald-600 border-emerald-200'
                                : 'bg-blue-100 text-blue-400 border-blue-500/30'
                            }`}>
                              {recording.direction === 'inbound' ? 'Inkommande' : 'Utgående'}
                            </span>
                            {recording.transcript && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-600 border border-blue-300">
                                Transkriberad
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDuration(recording.duration_seconds)}
                            </span>
                            <span>
                              {format(parseISO(recording.created_at), 'd MMM yyyy HH:mm', { locale: sv })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {expandedId === recording.recording_id ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded content */}
                  {expandedId === recording.recording_id && (
                    <div className="px-4 pb-4 space-y-4">
                      {/* Summary */}
                      {recording.transcript_summary && (
                        <div className="p-4 bg-gray-50 rounded-xl">
                          <p className="text-sm text-gray-500 mb-1">Sammanfattning</p>
                          <p className="text-gray-900">{recording.transcript_summary}</p>
                        </div>
                      )}

                      {/* Transcript */}
                      <div className="p-4 bg-gray-50 rounded-xl">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm text-gray-500">Transkript</p>
                          <div className="flex items-center gap-2">
                            {!recording.transcript && (
                              <button
                                onClick={() => handleTranscribe(recording.recording_id)}
                                disabled={transcribing === recording.recording_id}
                                className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                              >
                                {transcribing === recording.recording_id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <FileText className="w-3 h-3" />
                                )}
                                Transkribera
                              </button>
                            )}
                            {editingTranscript !== recording.recording_id && (
                              <button
                                onClick={() => startEditTranscript(recording)}
                                className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 rounded-lg text-xs font-medium text-gray-900 hover:bg-gray-300"
                              >
                                {recording.transcript ? 'Redigera' : 'Skriv manuellt'}
                              </button>
                            )}
                          </div>
                        </div>

                        {editingTranscript === recording.recording_id ? (
                          <div className="space-y-3">
                            <textarea
                              value={transcriptDraft}
                              onChange={(e) => setTranscriptDraft(e.target.value)}
                              placeholder="Skriv transkriptet här..."
                              rows={6}
                              className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={cancelEditTranscript}
                                className="px-3 py-1.5 text-gray-500 hover:text-gray-900"
                              >
                                Avbryt
                              </button>
                              <button
                                onClick={() => saveTranscript(recording.recording_id)}
                                disabled={savingTranscript}
                                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-100 border border-emerald-200 rounded-lg text-emerald-600 hover:bg-emerald-500/30 disabled:opacity-50"
                              >
                                {savingTranscript ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Check className="w-3 h-3" />
                                )}
                                Spara
                              </button>
                            </div>
                          </div>
                        ) : recording.transcript ? (
                          <p className="text-gray-700 text-sm whitespace-pre-wrap">{recording.transcript}</p>
                        ) : (
                          <p className="text-gray-400 text-sm italic">Ingen transkribering tillgänglig</p>
                        )}
                      </div>

                      {/* AI Analysis */}
                      {recording.transcript && (
                        <div className="p-4 bg-gray-50 rounded-xl">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-blue-600" />
                              <p className="text-sm text-gray-500">AI-förslag</p>
                            </div>
                            <button
                              onClick={() => handleAnalyze(recording.recording_id)}
                              disabled={analyzing === recording.recording_id}
                              className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                            >
                              {analyzing === recording.recording_id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3 h-3" />
                              )}
                              {suggestions.length > 0 ? 'Analysera igen' : 'Analysera'}
                            </button>
                          </div>

                          {loadingSuggestions ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                            </div>
                          ) : suggestions.length > 0 ? (
                            <div className="space-y-2">
                              {suggestions.map((suggestion) => (
                                <div
                                  key={suggestion.suggestion_id}
                                  className="p-3 bg-white rounded-lg border border-gray-300"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`px-2 py-0.5 text-xs rounded-full border ${getPriorityStyle(suggestion.priority)}`}>
                                          {suggestion.priority === 'urgent' ? 'Akut' :
                                           suggestion.priority === 'high' ? 'Hög' :
                                           suggestion.priority === 'medium' ? 'Medium' : 'Låg'}
                                        </span>
                                        <span className="px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-700">
                                          {getSuggestionTypeLabel(suggestion.suggestion_type)}
                                        </span>
                                        <span className="text-xs text-gray-400">
                                          {Math.round(suggestion.confidence_score * 100)}% säkerhet
                                        </span>
                                      </div>
                                      <p className="font-medium text-gray-900 mt-2">{suggestion.title}</p>
                                      <p className="text-sm text-gray-500 mt-1">{suggestion.description}</p>
                                      {suggestion.source_text && (
                                        <p className="text-xs text-gray-400 mt-2 italic">
                                          "{suggestion.source_text}"
                                        </p>
                                      )}
                                    </div>
                                    <span className={`px-2 py-0.5 text-xs rounded-full flex-shrink-0 ${
                                      suggestion.status === 'pending' ? 'bg-yellow-100 text-yellow-400' :
                                      suggestion.status === 'approved' ? 'bg-emerald-100 text-emerald-600' :
                                      suggestion.status === 'completed' ? 'bg-blue-100 text-blue-400' :
                                      'bg-gray-100 text-gray-500'
                                    }`}>
                                      {suggestion.status === 'pending' ? 'Väntar' :
                                       suggestion.status === 'approved' ? 'Godkänd' :
                                       suggestion.status === 'completed' ? 'Klar' :
                                       suggestion.status === 'rejected' ? 'Avvisad' : suggestion.status}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-400 text-sm">
                              Inga förslag ännu. Klicka "Analysera" för att låta AI:n föreslå åtgärder.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
