'use client'

import { useEffect, useState } from 'react'
import { 
  Sparkles, 
  AlertTriangle, 
  Phone,
  Clock,
  CheckCircle,
  ArrowRight,
  User,
  MessageSquare,
  Zap
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface FollowupItem {
  queue_id: string
  case_id: string
  reason: string
  priority: string
  notes: string | null
  queued_at: string
  case_record?: {
    customer_id: string
    service_type: string
    problem_summary: string
    urgency: string
    customer?: {
      name: string
      phone_number: string
    }
  }
}

interface RecentCall {
  call_id: string
  phone_number: string
  direction: string
  started_at: string
  duration_seconds: number
  outcome: string
  customer?: {
    name: string
  }
}

interface OpenCase {
  case_id: string
  service_type: string
  urgency: string
  problem_summary: string
  status: string
  created_at: string
  customer?: {
    name: string
    phone_number: string
  }
}

export default function AIInboxPage() {
  const [followups, setFollowups] = useState<FollowupItem[]>([])
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([])
  const [openCases, setOpenCases] = useState<OpenCase[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'followups' | 'calls' | 'cases'>('followups')

  useEffect(() => {
    async function fetchData() {
      // Hämta followup-kön
      const { data: followupData } = await supabase
        .from('human_followup_queue')
        .select(`
          queue_id,
          case_id,
          reason,
          priority,
          notes,
          queued_at,
          case_record (
            customer_id,
            service_type,
            problem_summary,
            urgency,
            customer (
              name,
              phone_number
            )
          )
        `)
        .eq('business_id', 'elexperten_sthlm')
        .is('resolved_at', null)
        .order('queued_at', { ascending: false })
        .limit(10)

      // Hämta senaste samtal
      const { data: callsData } = await supabase
        .from('call')
        .select(`
          call_id,
          phone_number,
          direction,
          started_at,
          duration_seconds,
          outcome,
          customer (
            name
          )
        `)
        .eq('business_id', 'elexperten_sthlm')
        .order('started_at', { ascending: false })
        .limit(10)

      // Hämta öppna ärenden
      const { data: casesData } = await supabase
        .from('case_record')
        .select(`
          case_id,
          service_type,
          urgency,
          problem_summary,
          status,
          created_at,
          customer (
            name,
            phone_number
          )
        `)
        .eq('business_id', 'elexperten_sthlm')
        .in('status', ['new', 'open', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(10)

      setFollowups(followupData || [])
      setRecentCalls(callsData || [])
      setOpenCases(casesData || [])
      setLoading(false)
    }

    fetchData()
  }, [])

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 60) return `${diffMins} min sedan`
    if (diffHours < 24) return `${diffHours} tim sedan`
    return `${diffDays} dagar sedan`
  }

  const formatDuration = (seconds: number) => {
    if (!seconds) return '-'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
      case 'normal': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      default: return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
    }
  }

  const getUrgencyStyle = (urgency: string) => {
    switch (urgency) {
      case 'emergency': return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'urgent': return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
      case 'same_day': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
      default: return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    }
  }

  // AI-genererade insikter baserat på data
  const generateInsights = () => {
    const insights = []
    
    if (followups.length > 0) {
      const urgentFollowups = followups.filter(f => f.priority === 'urgent' || f.priority === 'high')
      if (urgentFollowups.length > 0) {
        insights.push({
          type: 'warning',
          title: `${urgentFollowups.length} ärende${urgentFollowups.length > 1 ? 'n' : ''} kräver omedelbar åtgärd`,
          description: 'Kunder väntar på återkoppling. Prioritera dessa först.'
        })
      }
    }

    if (openCases.length > 5) {
      insights.push({
        type: 'suggestion',
        title: 'Hög ärendebelastning',
        description: `${openCases.length} öppna ärenden. Överväg att boka in extra resurser.`
      })
    }

    if (recentCalls.length > 0) {
      const missedCalls = recentCalls.filter(c => c.outcome === 'missed' || c.outcome === 'no_answer')
      if (missedCalls.length > 0) {
        insights.push({
          type: 'info',
          title: `${missedCalls.length} missat samtal`,
          description: 'Ring tillbaka dessa kunder för att inte tappa affärer.'
        })
      }
    }

    if (insights.length === 0) {
      insights.push({
        type: 'success',
        title: 'Allt under kontroll!',
        description: 'Inga akuta ärenden just nu. Bra jobbat!'
      })
    }

    return insights
  }

  const insights = generateInsights()

  if (loading) {
    return (
      <div className="p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <div className="text-zinc-400">Laddar...</div>
      </div>
    )
  }

  return (
    <div className="p-8 bg-[#09090b] min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center">
            <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 mr-4">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">AI Inbox</h1>
              <p className="text-zinc-400">Intelligenta förslag och åtgärder</p>
            </div>
          </div>
        </div>

        {/* AI Insights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {insights.map((insight, i) => (
            <div 
              key={i}
              className={`p-4 rounded-xl border ${
                insight.type === 'warning' ? 'bg-red-500/10 border-red-500/30' :
                insight.type === 'suggestion' ? 'bg-violet-500/10 border-violet-500/30' :
                insight.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30' :
                'bg-zinc-800/50 border-zinc-700'
              }`}
            >
              <div className="flex items-start">
                {insight.type === 'warning' && <AlertTriangle className="w-5 h-5 text-red-400 mr-3 mt-0.5" />}
                {insight.type === 'suggestion' && <Zap className="w-5 h-5 text-violet-400 mr-3 mt-0.5" />}
                {insight.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-400 mr-3 mt-0.5" />}
                {insight.type === 'info' && <Phone className="w-5 h-5 text-blue-400 mr-3 mt-0.5" />}
                <div>
                  <p className="font-medium text-white text-sm">{insight.title}</p>
                  <p className="text-xs text-zinc-400 mt-1">{insight.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex space-x-2 mb-6">
          {[
            { id: 'followups', label: 'Uppföljning', count: followups.length },
            { id: 'calls', label: 'Samtal', count: recentCalls.length },
            { id: 'cases', label: 'Ärenden', count: openCases.length }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
              }`}
            >
              {tab.label}
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === tab.id ? 'bg-white/20' : 'bg-zinc-800'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800">
          {/* Followups Tab */}
          {activeTab === 'followups' && (
            <div className="divide-y divide-zinc-800">
              {followups.length === 0 ? (
                <div className="p-12 text-center">
                  <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                  <p className="text-zinc-400">Inga väntande uppföljningar!</p>
                </div>
              ) : (
                followups.map((item) => (
                  <div key={item.queue_id} className="p-4 hover:bg-zinc-800/30 transition-all">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start">
                        <div className="w-10 h-10 bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-xl flex items-center justify-center border border-orange-500/30">
                          <AlertTriangle className="w-5 h-5 text-orange-400" />
                        </div>
                        <div className="ml-4">
                          <p className="font-medium text-white">
                            {item.case_record?.customer?.name || 'Okänd kund'}
                          </p>
                          <p className="text-sm text-zinc-400 mt-1">{item.reason}</p>
                          {item.case_record?.problem_summary && (
                            <p className="text-xs text-zinc-500 mt-1">{item.case_record.problem_summary}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className={`px-2.5 py-1 text-xs rounded-full border ${getPriorityStyle(item.priority)}`}>
                          {item.priority === 'urgent' ? 'Akut' : item.priority === 'high' ? 'Hög' : 'Normal'}
                        </span>
                        <span className="text-xs text-zinc-500">{formatTime(item.queued_at)}</span>
                        <button className="px-3 py-1.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-lg text-xs font-medium text-white hover:opacity-90">
                          Ring upp
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Calls Tab */}
          {activeTab === 'calls' && (
            <div className="divide-y divide-zinc-800">
              {recentCalls.length === 0 ? (
                <div className="p-12 text-center">
                  <Phone className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                  <p className="text-zinc-400">Inga samtal ännu</p>
                </div>
              ) : (
                recentCalls.map((call) => (
                  <div key={call.call_id} className="p-4 hover:bg-zinc-800/30 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                          call.direction === 'inbound' 
                            ? 'bg-emerald-500/20 border-emerald-500/30' 
                            : 'bg-blue-500/20 border-blue-500/30'
                        }`}>
                          <Phone className={`w-5 h-5 ${
                            call.direction === 'inbound' ? 'text-emerald-400' : 'text-blue-400'
                          }`} />
                        </div>
                        <div className="ml-4">
                          <p className="font-medium text-white">
                            {call.customer?.name || call.phone_number}
                          </p>
                          <p className="text-sm text-zinc-500">
                            {call.direction === 'inbound' ? 'Inkommande' : 'Utgående'} • {formatDuration(call.duration_seconds)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className="text-xs text-zinc-500">{formatTime(call.started_at)}</span>
                        <button className="text-violet-400 hover:text-violet-300 text-sm">
                          Visa detaljer
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Cases Tab */}
          {activeTab === 'cases' && (
            <div className="divide-y divide-zinc-800">
              {openCases.length === 0 ? (
                <div className="p-12 text-center">
                  <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                  <p className="text-zinc-400">Inga öppna ärenden</p>
                </div>
              ) : (
                openCases.map((caseItem) => (
                  <div key={caseItem.case_id} className="p-4 hover:bg-zinc-800/30 transition-all">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start">
                        <div className="w-10 h-10 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-xl flex items-center justify-center border border-violet-500/30">
                          <MessageSquare className="w-5 h-5 text-violet-400" />
                        </div>
                        <div className="ml-4">
                          <p className="font-medium text-white">
                            {caseItem.customer?.name || 'Okänd kund'}
                          </p>
                          <p className="text-sm text-zinc-400">{caseItem.service_type || 'Tjänst ej angiven'}</p>
                          {caseItem.problem_summary && (
                            <p className="text-xs text-zinc-500 mt-1">{caseItem.problem_summary}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className={`px-2.5 py-1 text-xs rounded-full border ${getUrgencyStyle(caseItem.urgency)}`}>
                          {caseItem.urgency === 'emergency' ? 'Akut' : 
                           caseItem.urgency === 'urgent' ? 'Brådskande' : 
                           caseItem.urgency === 'same_day' ? 'Idag' : 'Normal'}
                        </span>
                        <span className="text-xs text-zinc-500">{formatTime(caseItem.created_at)}</span>
                        <button className="text-violet-400 hover:text-violet-300 text-sm">
                          Hantera
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
