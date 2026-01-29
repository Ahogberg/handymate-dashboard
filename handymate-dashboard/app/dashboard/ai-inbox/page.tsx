'use client'

import { useEffect, useState } from 'react'
import { 
  Sparkles, 
  AlertTriangle, 
  Phone,
  CheckCircle,
  MessageSquare,
  Zap,
  Send,
  X,
  Loader2
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'

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
  const business = useBusiness()
  const [followups, setFollowups] = useState<FollowupItem[]>([])
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([])
  const [openCases, setOpenCases] = useState<OpenCase[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'followups' | 'calls' | 'cases'>('followups')
  
  const [smsModal, setSmsModal] = useState<{ open: boolean; phone: string; name: string }>({ open: false, phone: '', name: '' })
  const [smsMessage, setSmsMessage] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  useEffect(() => {
    fetchData()
  }, [business.business_id])

  async function fetchData() {
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
      .eq('business_id', business.business_id)
      .is('resolved_at', null)
      .order('queued_at', { ascending: false })
      .limit(10)

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
      .eq('business_id', business.business_id)
      .order('started_at', { ascending: false })
      .limit(10)

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
      .eq('business_id', business.business_id)
      .in('status', ['new', 'open', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(10)

    setFollowups(followupData || [])
    setRecentCalls(callsData || [])
    setOpenCases(casesData || [])
    setLoading(false)
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const handleAction = async (actionType: string, data: any, itemId: string) => {
    setActionLoading(itemId)
    try {
      const response = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionType, data }),
      })
      
      const result = await response.json()
      
      if (!response.ok) throw new Error(result.error)
      
      showToast(
        actionType === 'send_sms' ? 'SMS skickat!' :
        actionType === 'initiate_call' ? 'Samtal initierat!' :
        actionType === 'mark_resolved' ? 'Markerat som klart!' :
        'Åtgärd utförd!',
        'success'
      )
      
      fetchData()
    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleSendSms = async () => {
    if (!smsMessage.trim()) return
    await handleAction('send_sms', { to: smsModal.phone, message: smsMessage }, 'sms')
    setSmsModal({ open: false, phone: '', name: '' })
    setSmsMessage('')
  }

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

      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-red-500/20 border-red-500/30 text-red-400'
        }`}>
          {toast.message}
        </div>
      )}

      {smsModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Skicka SMS</h3>
              <button onClick={() => setSmsModal({ open: false, phone: '', name: '' })} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-zinc-400 mb-4">Till: {smsModal.name} ({smsModal.phone})</p>
            <textarea
              value={smsMessage}
              onChange={(e) => setSmsMessage(e.target.value)}
              placeholder="Skriv ditt meddelande..."
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
              rows={4}
            />
            <div className="flex justify-end space-x-3 mt-4">
              <button
                onClick={() => setSmsModal({ open: false, phone: '', name: '' })}
                className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
              >
                Avbryt
              </button>
              <button
                onClick={handleSendSms}
                disabled={!smsMessage.trim() || actionLoading === 'sms'}
                className="flex items-center px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {actionLoading === 'sms' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Skicka
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
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

        <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800">
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
                      <div className="flex items-center space-x-2">
                        <span className={`px-2.5 py-1 text-xs rounded-full border ${getPriorityStyle(item.priority)}`}>
                          {item.priority === 'urgent' ? 'Akut' : item.priority === 'high' ? 'Hög' : 'Normal'}
                        </span>
                        <span className="text-xs text-zinc-500">{formatTime(item.queued_at)}</span>
                        <button 
                          onClick={() => handleAction('initiate_call', { to: item.case_record?.customer?.phone_number }, item.queue_id)}
                          disabled={actionLoading === item.queue_id || !item.case_record?.customer?.phone_number}
                          className="px-3 py-1.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-lg text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 flex items-center"
                        >
                          {actionLoading === item.queue_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Phone className="w-3 h-3 mr-1" />}
                          Ring
                        </button>
                        <button 
                          onClick={() => setSmsModal({ 
                            open: true, 
                            phone: item.case_record?.customer?.phone_number || '', 
                            name: item.case_record?.customer?.name || 'Kund'
                          })}
                          disabled={!item.case_record?.customer?.phone_number}
                          className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 flex items-center"
                        >
                          <Send className="w-3 h-3 mr-1" />
                          SMS
                        </button>
                        <button 
                          onClick={() => handleAction('mark_resolved', { queueId: item.queue_id }, `resolve-${item.queue_id}`)}
                          disabled={actionLoading === `resolve-${item.queue_id}`}
                          className="px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-xs font-medium text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50 flex items-center"
                        >
                          {actionLoading === `resolve-${item.queue_id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                          Klar
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'calls' && (
            <div className="divide-y divide-zinc-800">
              {recentCalls.length === 0 ? (
                <div className="p-12 text-center">
                  <Phone className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                  <p className="text-zinc-400">Inga samtal ännu</p>
                  <p className="text-zinc-600 text-sm mt-2">Samtal visas här när AI-assistenten är aktiv</p>
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
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-zinc-500">{formatTime(call.started_at)}</span>
                        <button 
                          onClick={() => handleAction('initiate_call', { to: call.phone_number }, call.call_id)}
                          disabled={actionLoading === call.call_id}
                          className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 flex items-center"
                        >
                          {actionLoading === call.call_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Phone className="w-3 h-3 mr-1" />}
                          Ring tillbaka
                        </button>
                        <button 
                          onClick={() => setSmsModal({ 
                            open: true, 
                            phone: call.phone_number, 
                            name: call.customer?.name || 'Kund'
                          })}
                          className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs font-medium text-white hover:bg-zinc-700 flex items-center"
                        >
                          <Send className="w-3 h-3 mr-1" />
                          SMS
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

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
                      <div className="flex items-center space-x-2">
                        <span className={`px-2.5 py-1 text-xs rounded-full border ${getUrgencyStyle(caseItem.urgency)}`}>
                          {caseItem.urgency === 'emergency' ? 'Akut' : 
                           caseItem.urgency === 'urgent' ? 'Brådskande' : 
                           caseItem.urgency === 'same_day' ? 'Idag' : 'Normal'}
                        </span>
                        <span className="text-xs text-zinc-500">{formatTime(caseItem.created_at)}</span>
                        <button 
                          onClick={() => handleAction('initiate_call', { to: caseItem.customer?.phone_number }, caseItem.case_id)}
                          disabled={actionLoading === caseItem.case_id || !caseItem.customer?.phone_number}
                          className="px-3 py-1.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-lg text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 flex items-center"
                        >
                          {actionLoading === caseItem.case_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Phone className="w-3 h-3 mr-1" />}
                          Ring
                        </button>
                        <button 
                          onClick={() => handleAction('update_case_status', { caseId: caseItem.case_id, status: 'resolved' }, `close-${caseItem.case_id}`)}
                          disabled={actionLoading === `close-${caseItem.case_id}`}
                          className="px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-xs font-medium text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50 flex items-center"
                        >
                          {actionLoading === `close-${caseItem.case_id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                          Stäng
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
