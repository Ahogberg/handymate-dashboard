'use client'

import { useEffect, useState } from 'react'
import {
  Inbox,
  Sparkles,
  Mic,
  Play,
  Pause,
  Check,
  X,
  Edit2,
  Phone,
  MapPin,
  Briefcase,
  Calendar,
  FileText,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Loader2,
  Clock,
  AlertTriangle,
  CheckCircle,
  Volume2,
  Wand2
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { format, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'

interface AISuggestion {
  suggestion_id: string
  recording_id: string | null
  customer_id: string | null
  suggestion_type: string
  title: string
  description: string | null
  priority: string
  status: string
  action_data: any
  confidence_score: number | null
  source_text: string | null
  created_at: string
  expires_at: string | null
}

interface Recording {
  recording_id: string
  recording_url: string | null
  duration_seconds: number
  transcript: string | null
  transcript_summary: string | null
  phone_number: string | null
  direction: string
  created_at: string
  customer?: {
    customer_id: string
    name: string
    phone_number: string
    email: string | null
    address: string | null
  }
}

interface GroupedSuggestions {
  recording: Recording | null
  suggestions: AISuggestion[]
  extractedInfo: {
    customerName?: string
    phoneNumber?: string
    address?: string
    jobType?: string
    preferredDate?: string
  }
}

export default function InboxPage() {
  const business = useBusiness()

  // Tab state
  const [activeTab, setActiveTab] = useState<'suggestions' | 'recordings'>('suggestions')

  // AI Suggestions state
  const [groups, setGroups] = useState<GroupedSuggestions[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all' | 'completed'>('pending')
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0 })

  // Recordings state
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [recordingsLoading, setRecordingsLoading] = useState(true)

  // Shared state
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})

  // Toast
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false, message: '', type: 'success'
  })

  useEffect(() => {
    if (activeTab === 'suggestions') {
      fetchSuggestions()
    } else {
      fetchRecordings()
    }
  }, [business.business_id, activeTab, statusFilter])

  useEffect(() => {
    return () => {
      if (audioElement) {
        audioElement.pause()
        audioElement.src = ''
      }
    }
  }, [audioElement])

  // Fetch AI Suggestions
  async function fetchSuggestions() {
    setSuggestionsLoading(true)

    // Get stats
    const { data: allSuggestions } = await supabase
      .from('ai_suggestion')
      .select('status')
      .eq('business_id', business.business_id)

    const pending = allSuggestions?.filter((s: { status: string }) => s.status === 'pending').length || 0
    const approved = allSuggestions?.filter((s: { status: string }) => s.status === 'approved' || s.status === 'completed').length || 0
    const rejected = allSuggestions?.filter((s: { status: string }) => s.status === 'rejected').length || 0
    setStats({ pending, approved, rejected })

    // Get filtered suggestions
    let query = supabase
      .from('ai_suggestion')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    if (statusFilter === 'pending') {
      query = query.eq('status', 'pending')
    } else if (statusFilter === 'completed') {
      query = query.in('status', ['approved', 'completed', 'rejected'])
    }

    const { data: suggestions } = await query

    // Get unique recording IDs
    const recordingIds = Array.from(new Set(suggestions?.map((s: AISuggestion) => s.recording_id).filter(Boolean)))

    // Fetch recordings
    const { data: recordingsData } = await supabase
      .from('call_recording')
      .select(`
        *,
        customer (
          customer_id,
          name,
          phone_number,
          email,
          address
        )
      `)
      .in('recording_id', recordingIds.length > 0 ? recordingIds : ['none'])

    // Group suggestions by recording
    const grouped: GroupedSuggestions[] = []
    const recordingMap = new Map<string, Recording>(recordingsData?.map((r: Recording) => [r.recording_id, r] as [string, Recording]) || [])
    const suggestionsByRecording = new Map<string, AISuggestion[]>()

    suggestions?.forEach((s: AISuggestion) => {
      const key = s.recording_id || 'no-recording'
      if (!suggestionsByRecording.has(key)) {
        suggestionsByRecording.set(key, [])
      }
      suggestionsByRecording.get(key)!.push(s)
    })

    suggestionsByRecording.forEach((suggs, recordingId) => {
      const recording = recordingId !== 'no-recording' ? (recordingMap.get(recordingId) || null) : null
      const extractedInfo: GroupedSuggestions['extractedInfo'] = {}

      suggs.forEach(s => {
        if (s.action_data) {
          if (s.action_data.customer_name) extractedInfo.customerName = s.action_data.customer_name
          if (s.action_data.phone_number) extractedInfo.phoneNumber = s.action_data.phone_number
          if (s.action_data.address) extractedInfo.address = s.action_data.address
          if (s.action_data.service) extractedInfo.jobType = s.action_data.service
          if (s.action_data.date) extractedInfo.preferredDate = s.action_data.date
        }
      })

      if (recording?.customer) {
        if (!extractedInfo.customerName) extractedInfo.customerName = recording.customer.name
        if (!extractedInfo.phoneNumber) extractedInfo.phoneNumber = recording.customer.phone_number
        if (!extractedInfo.address) extractedInfo.address = recording.customer.address || undefined
      }

      if (!extractedInfo.phoneNumber && recording?.phone_number) {
        extractedInfo.phoneNumber = recording.phone_number
      }

      grouped.push({ recording, suggestions: suggs, extractedInfo })
    })

    grouped.sort((a, b) => {
      const dateA = a.recording?.created_at || a.suggestions[0]?.created_at || ''
      const dateB = b.recording?.created_at || b.suggestions[0]?.created_at || ''
      return dateB.localeCompare(dateA)
    })

    setGroups(grouped)
    setSuggestionsLoading(false)
  }

  // Fetch Recordings
  async function fetchRecordings() {
    setRecordingsLoading(true)

    const { data } = await supabase
      .from('call_recording')
      .select(`
        *,
        customer (
          customer_id,
          name,
          phone_number,
          email,
          address
        )
      `)
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })
      .limit(50)

    setRecordings(data || [])
    setRecordingsLoading(false)
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

  const togglePlay = (recording: Recording) => {
    if (!recording.recording_url) {
      showToast('Ingen inspelning tillgänglig', 'error')
      return
    }

    if (playingId === recording.recording_id) {
      audioElement?.pause()
      setPlayingId(null)
    } else {
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

  const handleApprove = async (suggestion: AISuggestion) => {
    setActionLoading(suggestion.suggestion_id)
    try {
      const response = await fetch('/api/suggestions/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestion_id: suggestion.suggestion_id,
          action_data: editingId === suggestion.suggestion_id ? editForm : suggestion.action_data
        })
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Kunde inte godkänna förslag')

      showToast(result.message || 'Förslag godkänt!', 'success')
      setEditingId(null)
      fetchSuggestions()
    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (suggestionId: string) => {
    setActionLoading(suggestionId)
    try {
      const { error } = await supabase
        .from('ai_suggestion')
        .update({ status: 'rejected' })
        .eq('suggestion_id', suggestionId)

      if (error) throw error
      showToast('Förslag avvisat', 'success')
      fetchSuggestions()
    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleTranscribe = async (recordingId: string) => {
    setActionLoading(recordingId)
    try {
      const response = await fetch('/api/voice/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recording_id: recordingId })
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Kunde inte transkribera')

      showToast('Transkribering startad', 'success')

      // Analyze after transcription
      await fetch('/api/voice/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recording_id: recordingId })
      })

      fetchRecordings()
      fetchSuggestions()
    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const startEdit = (suggestion: AISuggestion) => {
    setEditingId(suggestion.suggestion_id)
    setEditForm(suggestion.action_data || {})
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({})
  }

  const getSuggestionIcon = (type: string) => {
    switch (type) {
      case 'booking': return Calendar
      case 'quote': return FileText
      case 'follow_up': return Phone
      case 'callback': return Phone
      case 'sms': return MessageSquare
      case 'reminder': return Clock
      default: return Sparkles
    }
  }

  const getSuggestionLabel = (type: string) => {
    const labels: Record<string, string> = {
      booking: 'Skapa bokning',
      quote: 'Skapa offert',
      follow_up: 'Uppföljning',
      callback: 'Ring tillbaka',
      sms: 'Skicka SMS',
      reminder: 'Påminnelse',
      other: 'Övrigt'
    }
    return labels[type] || type
  }

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
      default: return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
    }
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-500/20 text-amber-400'
      case 'approved':
      case 'completed': return 'bg-emerald-500/20 text-emerald-400'
      case 'rejected': return 'bg-red-500/20 text-red-400'
      default: return 'bg-zinc-500/20 text-zinc-400'
    }
  }

  const pendingRecordings = recordings.filter(r => !r.transcript).length

  return (
    <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[128px]"></div>
      </div>

      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-red-500/20 border-red-500/30 text-red-400'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="relative max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center mb-6">
          <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 mr-4">
            <Inbox className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Inbox</h1>
            <p className="text-zinc-400">AI-förslag och samtalsinspelningar</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('suggestions')}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all min-h-[44px] flex-1 sm:flex-none ${
              activeTab === 'suggestions'
                ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                : 'bg-zinc-900/50 border border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">AI-förslag</span>
            <span className="sm:hidden">Förslag</span>
            {stats.pending > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-white/20">
                {stats.pending}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('recordings')}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all min-h-[44px] flex-1 sm:flex-none ${
              activeTab === 'recordings'
                ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                : 'bg-zinc-900/50 border border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            <Mic className="w-4 h-4" />
            Inspelningar
            {pendingRecordings > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-amber-500/30 text-amber-400">
                {pendingRecordings}
              </span>
            )}
          </button>
        </div>

        {/* AI Suggestions Tab */}
        {activeTab === 'suggestions' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <button
                onClick={() => setStatusFilter('pending')}
                className={`p-4 rounded-xl border transition-all ${
                  statusFilter === 'pending'
                    ? 'bg-amber-500/20 border-amber-500/30'
                    : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <AlertTriangle className={`w-5 h-5 ${statusFilter === 'pending' ? 'text-amber-400' : 'text-zinc-500'}`} />
                  <span className={`text-2xl font-bold ${statusFilter === 'pending' ? 'text-amber-400' : 'text-white'}`}>
                    {stats.pending}
                  </span>
                </div>
                <p className="text-sm text-zinc-500 mt-2">Väntar</p>
              </button>

              <button
                onClick={() => setStatusFilter('completed')}
                className={`p-4 rounded-xl border transition-all ${
                  statusFilter === 'completed'
                    ? 'bg-emerald-500/20 border-emerald-500/30'
                    : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <CheckCircle className={`w-5 h-5 ${statusFilter === 'completed' ? 'text-emerald-400' : 'text-zinc-500'}`} />
                  <span className={`text-2xl font-bold ${statusFilter === 'completed' ? 'text-emerald-400' : 'text-white'}`}>
                    {stats.approved}
                  </span>
                </div>
                <p className="text-sm text-zinc-500 mt-2">Hanterade</p>
              </button>

              <button
                onClick={() => setStatusFilter('all')}
                className={`p-4 rounded-xl border transition-all ${
                  statusFilter === 'all'
                    ? 'bg-violet-500/20 border-violet-500/30'
                    : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Sparkles className={`w-5 h-5 ${statusFilter === 'all' ? 'text-violet-400' : 'text-zinc-500'}`} />
                  <span className={`text-2xl font-bold ${statusFilter === 'all' ? 'text-violet-400' : 'text-white'}`}>
                    {stats.pending + stats.approved + stats.rejected}
                  </span>
                </div>
                <p className="text-sm text-zinc-500 mt-2">Alla</p>
              </button>
            </div>

            {/* Suggestions List */}
            {suggestionsLoading ? (
              <div className="text-center py-12 text-zinc-400">Laddar...</div>
            ) : groups.length === 0 ? (
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-12 text-center">
                <Sparkles className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-400">
                  {statusFilter === 'pending' ? 'Inga väntande förslag' : 'Inga förslag att visa'}
                </p>
                <p className="text-zinc-600 text-sm mt-2">
                  AI-förslag skapas automatiskt när samtal transkriberas
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {groups.map((group) => {
                  const groupId = group.recording?.recording_id || group.suggestions[0]?.suggestion_id
                  const isExpanded = expandedId === groupId
                  const hasPending = group.suggestions.some(s => s.status === 'pending')

                  return (
                    <div
                      key={groupId}
                      className={`bg-zinc-900/50 backdrop-blur-xl rounded-2xl border transition-all ${
                        hasPending ? 'border-amber-500/30' : 'border-zinc-800'
                      }`}
                    >
                      {/* Header */}
                      <div
                        className="p-4 sm:p-6 cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : groupId)}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-4 min-w-0 flex-1">
                            {group.recording && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  togglePlay(group.recording!)
                                }}
                                className={`w-12 h-12 rounded-xl flex items-center justify-center border flex-shrink-0 transition-all ${
                                  playingId === group.recording.recording_id
                                    ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 border-violet-500/50'
                                    : 'bg-zinc-800/50 border-zinc-700 hover:border-violet-500/50'
                                }`}
                              >
                                {playingId === group.recording.recording_id ? (
                                  <Pause className="w-5 h-5 text-white" />
                                ) : (
                                  <Play className="w-5 h-5 text-zinc-400" />
                                )}
                              </button>
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h3 className="font-semibold text-white text-lg">
                                  {group.extractedInfo.customerName || group.extractedInfo.phoneNumber || 'Okänd kund'}
                                </h3>
                                {hasPending && (
                                  <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                    {group.suggestions.filter(s => s.status === 'pending').length} väntar
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-4 text-sm text-zinc-500 flex-wrap">
                                {group.extractedInfo.phoneNumber && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    {group.extractedInfo.phoneNumber}
                                  </span>
                                )}
                                {group.extractedInfo.jobType && (
                                  <span className="flex items-center gap-1">
                                    <Briefcase className="w-3 h-3" />
                                    {group.extractedInfo.jobType}
                                  </span>
                                )}
                                {group.recording && (
                                  <span className="flex items-center gap-1">
                                    <Volume2 className="w-3 h-3" />
                                    {formatDuration(group.recording.duration_seconds)}
                                  </span>
                                )}
                                {group.recording && (
                                  <span>
                                    {format(parseISO(group.recording.created_at), 'd MMM HH:mm', { locale: sv })}
                                  </span>
                                )}
                              </div>

                              {group.recording?.transcript_summary && (
                                <p className="text-sm text-zinc-400 mt-2 line-clamp-2">
                                  {group.recording.transcript_summary}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="hidden sm:flex gap-1">
                              {Array.from(new Set(group.suggestions.map(s => s.suggestion_type))).slice(0, 3).map(type => {
                                const Icon = getSuggestionIcon(type)
                                return (
                                  <div
                                    key={type}
                                    className="p-2 bg-zinc-800/50 rounded-lg"
                                    title={getSuggestionLabel(type)}
                                  >
                                    <Icon className="w-4 h-4 text-zinc-400" />
                                  </div>
                                )
                              })}
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-zinc-500" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-zinc-500" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-4 border-t border-zinc-800 pt-4">
                          {(group.extractedInfo.address || group.extractedInfo.preferredDate) && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {group.extractedInfo.address && (
                                <div className="flex items-center gap-2 p-3 bg-zinc-800/50 rounded-xl">
                                  <MapPin className="w-4 h-4 text-violet-400" />
                                  <span className="text-sm text-zinc-300">{group.extractedInfo.address}</span>
                                </div>
                              )}
                              {group.extractedInfo.preferredDate && (
                                <div className="flex items-center gap-2 p-3 bg-zinc-800/50 rounded-xl">
                                  <Calendar className="w-4 h-4 text-violet-400" />
                                  <span className="text-sm text-zinc-300">{group.extractedInfo.preferredDate}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {group.recording?.transcript && (
                            <div className="p-4 bg-zinc-800/30 rounded-xl">
                              <p className="text-xs text-zinc-500 mb-2">Transkript</p>
                              <p className="text-sm text-zinc-400 whitespace-pre-wrap max-h-32 overflow-y-auto">
                                {group.recording.transcript}
                              </p>
                            </div>
                          )}

                          <div className="space-y-3">
                            <p className="text-sm text-zinc-500">AI-förslag ({group.suggestions.length})</p>

                            {group.suggestions.map((suggestion) => {
                              const Icon = getSuggestionIcon(suggestion.suggestion_type)
                              const isEditing = editingId === suggestion.suggestion_id

                              return (
                                <div
                                  key={suggestion.suggestion_id}
                                  className={`p-4 rounded-xl border ${
                                    suggestion.status === 'pending'
                                      ? 'bg-zinc-800/50 border-zinc-700'
                                      : suggestion.status === 'approved' || suggestion.status === 'completed'
                                      ? 'bg-emerald-500/5 border-emerald-500/20'
                                      : 'bg-zinc-800/30 border-zinc-800 opacity-60'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-3 min-w-0 flex-1">
                                      <div className={`p-2 rounded-lg ${
                                        suggestion.status === 'pending' ? 'bg-violet-500/20' : 'bg-zinc-700/50'
                                      }`}>
                                        <Icon className={`w-4 h-4 ${
                                          suggestion.status === 'pending' ? 'text-violet-400' : 'text-zinc-500'
                                        }`} />
                                      </div>

                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="font-medium text-white">{suggestion.title}</span>
                                          <span className={`px-2 py-0.5 text-xs rounded-full border ${getPriorityStyle(suggestion.priority)}`}>
                                            {suggestion.priority === 'urgent' ? 'Akut' :
                                             suggestion.priority === 'high' ? 'Hög' :
                                             suggestion.priority === 'medium' ? 'Medium' : 'Låg'}
                                          </span>
                                        </div>

                                        {suggestion.description && (
                                          <p className="text-sm text-zinc-400 mt-1">{suggestion.description}</p>
                                        )}

                                        {suggestion.source_text && (
                                          <p className="text-xs text-zinc-600 mt-2 italic">
                                            "{suggestion.source_text}"
                                          </p>
                                        )}

                                        {isEditing && (
                                          <div className="mt-4 p-4 bg-zinc-900/50 rounded-xl space-y-3">
                                            <p className="text-sm text-zinc-400 mb-2">Redigera:</p>
                                            {suggestion.suggestion_type === 'booking' && (
                                              <>
                                                <input
                                                  type="text"
                                                  value={editForm.service || ''}
                                                  onChange={(e) => setEditForm({ ...editForm, service: e.target.value })}
                                                  placeholder="Tjänst"
                                                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
                                                />
                                                <input
                                                  type="text"
                                                  value={editForm.date || ''}
                                                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                                                  placeholder="Datum (YYYY-MM-DD)"
                                                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
                                                />
                                              </>
                                            )}
                                            {suggestion.suggestion_type === 'sms' && (
                                              <textarea
                                                value={editForm.message_template || ''}
                                                onChange={(e) => setEditForm({ ...editForm, message_template: e.target.value })}
                                                placeholder="SMS-meddelande"
                                                rows={3}
                                                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm resize-none"
                                              />
                                            )}
                                            <div className="flex gap-2">
                                              <button onClick={cancelEdit} className="px-3 py-1.5 text-zinc-400 hover:text-white text-sm">
                                                Avbryt
                                              </button>
                                              <button
                                                onClick={() => handleApprove(suggestion)}
                                                disabled={actionLoading === suggestion.suggestion_id}
                                                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm hover:bg-emerald-500/30"
                                              >
                                                {actionLoading === suggestion.suggestion_id ? (
                                                  <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                  <Check className="w-3 h-3" />
                                                )}
                                                Godkänn
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {suggestion.status === 'pending' && !isEditing && (
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() => startEdit(suggestion)}
                                          className="p-2.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
                                        >
                                          <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => handleApprove(suggestion)}
                                          disabled={actionLoading === suggestion.suggestion_id}
                                          className="flex items-center gap-1 px-3 py-2 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm hover:bg-emerald-500/30 disabled:opacity-50 min-h-[44px]"
                                        >
                                          {actionLoading === suggestion.suggestion_id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                          ) : (
                                            <Check className="w-4 h-4" />
                                          )}
                                          <span className="hidden sm:inline">Godkänn</span>
                                        </button>
                                        <button
                                          onClick={() => handleReject(suggestion.suggestion_id)}
                                          disabled={actionLoading === suggestion.suggestion_id}
                                          className="p-2.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      </div>
                                    )}

                                    {suggestion.status !== 'pending' && (
                                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusStyle(suggestion.status)}`}>
                                        {suggestion.status === 'approved' || suggestion.status === 'completed' ? 'Godkänd' :
                                         suggestion.status === 'rejected' ? 'Avvisad' : suggestion.status}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* Recordings Tab */}
        {activeTab === 'recordings' && (
          <>
            {recordingsLoading ? (
              <div className="text-center py-12 text-zinc-400">Laddar...</div>
            ) : recordings.length === 0 ? (
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-12 text-center">
                <Mic className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-400">Inga inspelningar ännu</p>
                <p className="text-zinc-600 text-sm mt-2">
                  Inspelningar skapas automatiskt från inkommande samtal
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {recordings.map((recording) => (
                  <div
                    key={recording.recording_id}
                    className={`bg-zinc-900/50 backdrop-blur-xl rounded-xl border p-4 ${
                      !recording.transcript ? 'border-amber-500/30' : 'border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <button
                          onClick={() => togglePlay(recording)}
                          disabled={!recording.recording_url}
                          className={`w-11 h-11 rounded-xl flex items-center justify-center border flex-shrink-0 transition-all ${
                            playingId === recording.recording_id
                              ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 border-violet-500/50'
                              : recording.recording_url
                              ? 'bg-zinc-800/50 border-zinc-700 hover:border-violet-500/50'
                              : 'bg-zinc-800/30 border-zinc-800 opacity-50'
                          }`}
                        >
                          {playingId === recording.recording_id ? (
                            <Pause className="w-5 h-5 text-white" />
                          ) : (
                            <Play className="w-5 h-5 text-zinc-400" />
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium text-white">
                              {recording.customer?.name || recording.phone_number || 'Okänt nummer'}
                            </h3>
                            {!recording.transcript && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                Ej transkriberad
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-sm text-zinc-500 mt-1">
                            <span className="flex items-center gap-1">
                              {recording.direction === 'inbound' ? 'Inkommande' : 'Utgående'}
                            </span>
                            <span>{formatDuration(recording.duration_seconds)}</span>
                            <span>{format(parseISO(recording.created_at), 'd MMM HH:mm', { locale: sv })}</span>
                          </div>
                          {recording.transcript_summary && (
                            <p className="text-sm text-zinc-400 mt-2 line-clamp-1">
                              {recording.transcript_summary}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!recording.transcript && (
                          <button
                            onClick={() => handleTranscribe(recording.recording_id)}
                            disabled={actionLoading === recording.recording_id}
                            className="flex items-center gap-2 px-3 py-2.5 bg-violet-500/20 border border-violet-500/30 rounded-lg text-violet-400 text-sm hover:bg-violet-500/30 disabled:opacity-50 min-h-[44px]"
                          >
                            {actionLoading === recording.recording_id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Wand2 className="w-4 h-4" />
                            )}
                            <span className="hidden sm:inline">Analysera</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
