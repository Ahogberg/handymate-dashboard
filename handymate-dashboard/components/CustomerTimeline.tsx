'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  PhoneIncoming,
  PhoneOutgoing,
  PhoneCall,
  MessageSquare,
  Send,
  FileText,
  Calendar,
  CheckCircle,
  Star,
  Clock,
  Mail,
  Target,
  Bot,
  Timer,
  Loader2,
  Play,
  ChevronDown,
  DollarSign,
  AlertCircle,
  Receipt,
  FolderOpen,
  List,
} from 'lucide-react'
import Link from 'next/link'

interface TimelineEvent {
  id: string
  type: string
  title: string
  description: string | null
  timestamp: string
  metadata: Record<string, unknown>
  project: TimelineProjectReference | null
}

interface TimelineProjectReference {
  project_id: string
  name: string
  project_number: string | null
  status: string | null
}

type TimelineDisplayItem =
  | { id: string; type: 'event'; date: Date; data: TimelineEvent }
  | { id: string; type: 'email_thread'; date: Date; data: any }

interface TimelineProjectGroup {
  key: string
  project: TimelineProjectReference | null
  items: TimelineDisplayItem[]
  channels: string[]
  latestAt: number
}

type TimelineFilter = 'all' | 'calls' | 'sms' | 'quotes' | 'invoices' | 'bookings' | 'leads' | 'agent' | 'time' | 'notes' | 'email' | 'portal' | 'chat'
type TimelineView = 'projects' | 'chronological'

const TIMELINE_PAGE_SIZE = 150

interface Props {
  customerId: string
  customerEmail?: string | null
}

const FILTERS: { key: TimelineFilter; label: string }[] = [
  { key: 'all', label: 'Alla' },
  { key: 'calls', label: 'Samtal' },
  { key: 'sms', label: 'SMS' },
  { key: 'email', label: 'E-post' },
  // API-nycklarna matchar timeline-routens sektioner 3d/3g exakt.
  { key: 'portal', label: 'Portal' },
  { key: 'chat', label: 'Webbchatt' },
  { key: 'quotes', label: 'Offerter' },
  { key: 'invoices', label: 'Fakturor' },
  { key: 'bookings', label: 'Bokningar' },
  { key: 'leads', label: 'Leads' },
  { key: 'agent', label: 'AI-agent' },
  { key: 'time', label: 'Tid' },
]

function projectForItem(item: TimelineDisplayItem): TimelineProjectReference | null {
  return item.type === 'event' ? item.data.project : null
}

function channelForItem(item: TimelineDisplayItem): string | null {
  if (item.type === 'email_thread') return 'E-post'
  const type = item.data.type
  if (type.startsWith('sms_')) return 'SMS'
  if (type.startsWith('email_')) return 'E-post'
  if (type.startsWith('call_') || type.startsWith('meeting_')) return 'Samtal & möten'
  if (type.startsWith('portal_')) return 'Kundportal'
  if (type === 'widget_chat') return 'Webbchatt'
  return null
}

export function groupTimelineItemsByProject(items: TimelineDisplayItem[]): TimelineProjectGroup[] {
  const byProject = new Map<string, TimelineProjectGroup>()

  for (const item of items) {
    const project = projectForItem(item)
    const key = project ? `project:${project.project_id}` : 'other'
    const existing = byProject.get(key) || {
      key,
      project,
      items: [],
      channels: [],
      latestAt: item.date.getTime(),
    }
    existing.items.push(item)
    existing.latestAt = Math.max(existing.latestAt, item.date.getTime())
    const channel = channelForItem(item)
    if (channel && !existing.channels.includes(channel)) existing.channels.push(channel)
    byProject.set(key, existing)
  }

  return Array.from(byProject.values())
    .map(group => ({
      ...group,
      items: group.items.sort((a, b) => b.date.getTime() - a.date.getTime()),
    }))
    .sort((a, b) => {
      if (a.key === 'other') return 1
      if (b.key === 'other') return -1
      return b.latestAt - a.latestAt
    })
}

export default function CustomerTimeline({ customerId, customerEmail }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filter, setFilter] = useState<TimelineFilter>('all')
  const [view, setView] = useState<TimelineView>('projects')
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Gmail threads (kept separate for expand/collapse)
  const [emailThreads, setEmailThreads] = useState<any[]>([])
  const [emailLoading, setEmailLoading] = useState(false)
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null)
  const [threadMessages, setThreadMessages] = useState<Record<string, any[]>>({})
  const [threadLoading, setThreadLoading] = useState(false)

  const fetchTimeline = useCallback(async (currentFilter: TimelineFilter, offset = 0) => {
    const isMore = offset > 0
    if (isMore) setLoadingMore(true)
    else setLoading(true)

    try {
      const res = await fetch(`/api/customers/${customerId}/timeline?filter=${currentFilter}&offset=${offset}&limit=${TIMELINE_PAGE_SIZE}`)
      if (!res.ok) throw new Error()
      const data = await res.json()

      if (isMore) {
        setEvents(prev => [...prev, ...(data.events || [])])
      } else {
        setEvents(data.events || [])
      }
      setHasMore(data.has_more || false)
      setTotal(data.total || 0)
    } catch {
      if (!isMore) setEvents([])
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [customerId])

  const fetchEmailThreads = useCallback(async () => {
    if (!customerEmail) return
    setEmailLoading(true)
    try {
      const res = await fetch(`/api/gmail/customer-emails?email=${encodeURIComponent(customerEmail)}`)
      if (res.ok) {
        const data = await res.json()
        setEmailThreads(data.threads || [])
      }
    } catch { /* Gmail not configured */ }
    finally { setEmailLoading(false) }
  }, [customerEmail])

  useEffect(() => {
    fetchTimeline(filter)
    if (customerEmail) fetchEmailThreads()
  }, [filter, fetchTimeline, fetchEmailThreads, customerEmail])

  async function fetchThreadMsgs(threadId: string) {
    if (threadMessages[threadId]) {
      setExpandedThreadId(expandedThreadId === threadId ? null : threadId)
      return
    }
    setExpandedThreadId(threadId)
    setThreadLoading(true)
    try {
      const res = await fetch(`/api/gmail/thread-messages?threadId=${encodeURIComponent(threadId)}`)
      if (res.ok) {
        const data = await res.json()
        setThreadMessages(prev => ({ ...prev, [threadId]: data.messages || [] }))
      }
    } catch { /* silent */ }
    finally { setThreadLoading(false) }
  }

  function getIcon(type: string) {
    if (type.startsWith('call_inbound') || type === 'call_inbound') return <PhoneIncoming className="w-4 h-4 text-emerald-600" />
    if (type.startsWith('call_outbound') || type === 'call_outbound') return <PhoneOutgoing className="w-4 h-4 text-primary-600" />
    if (type === 'call_logged') return <PhoneCall className="w-4 h-4 text-primary-700" />
    if (type === 'sms_sent') return <Send className="w-4 h-4 text-primary-700" />
    if (type === 'sms_received') return <MessageSquare className="w-4 h-4 text-primary-500" />
    if (type.startsWith('quote_')) return <FileText className="w-4 h-4 text-primary-600" />
    if (type === 'invoice_created' || type === 'invoice_sent') return <Receipt className="w-4 h-4 text-amber-500" />
    if (type === 'invoice_paid') return <DollarSign className="w-4 h-4 text-emerald-600" />
    if (type === 'invoice_overdue') return <AlertCircle className="w-4 h-4 text-red-500" />
    if (type === 'booking_created') return <Calendar className="w-4 h-4 text-amber-400" />
    if (type === 'booking_completed') return <CheckCircle className="w-4 h-4 text-emerald-600" />
    if (type.startsWith('lead_')) return <Target className="w-4 h-4 text-orange-500" />
    if (type === 'agent_action') return <Bot className="w-4 h-4 text-primary-700" />
    if (type === 'time_entry') return <Timer className="w-4 h-4 text-primary-600" />
    if (type === 'note_added') return <FileText className="w-4 h-4 text-gray-500" />
    if (type === 'rating_received') return <Star className="w-4 h-4 text-yellow-400" />
    if (type === 'job_completed') return <CheckCircle className="w-4 h-4 text-emerald-600" />
    return <Clock className="w-4 h-4 text-gray-400" />
  }

  function getIconBg(type: string): string {
    if (type.startsWith('call_') || type === 'call_logged') return 'bg-emerald-50'
    if (type.startsWith('sms_')) return 'bg-primary-50'
    if (type.startsWith('quote_')) return 'bg-primary-50'
    if (type.startsWith('invoice_paid')) return 'bg-emerald-50'
    if (type.startsWith('invoice_overdue')) return 'bg-red-50'
    if (type.startsWith('invoice_')) return 'bg-amber-50'
    if (type.startsWith('booking_')) return 'bg-amber-50'
    if (type.startsWith('lead_')) return 'bg-orange-50'
    if (type === 'agent_action') return 'bg-primary-50'
    if (type === 'time_entry') return 'bg-primary-50'
    return 'bg-gray-100'
  }

  function getLinkForEvent(e: TimelineEvent): string | null {
    const m = e.metadata
    if (m.quote_id) return `/dashboard/quotes/${m.quote_id}`
    if (m.invoice_id) return `/dashboard/invoices/${m.invoice_id}`
    if (m.booking_id) return `/dashboard/calendar`
    if (m.lead_id) return `/dashboard/pipeline`
    if (m.project_id) return `/dashboard/projects/${m.project_id}`
    return null
  }

  function formatTimestamp(ts: string): string {
    return new Date(ts).toLocaleDateString('sv-SE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function extractEmailName(from: string): string {
    const match = from.match(/^"?([^"<]+)"?\s*</)
    return match ? match[1].trim() : from.split('@')[0]
  }

  // Merge timeline events with email threads for "all" and "email" filters
  const showEmails = filter === 'all' || filter === 'email'
  const emailItems: TimelineDisplayItem[] = showEmails ? emailThreads.map(t => ({
    id: `email_${t.threadId}`,
    type: 'email_thread' as const,
    date: new Date(t.date),
    data: t,
  })) : []

  const eventItems: TimelineDisplayItem[] = events.map(e => ({
    id: e.id,
    type: 'event' as const,
    date: new Date(e.timestamp),
    data: e,
  }))

  const allItems: TimelineDisplayItem[] = [...eventItems, ...emailItems]
  allItems.sort((a, b) => b.date.getTime() - a.date.getTime())

  // For email-only filter, only show emails
  const displayItems = filter === 'email' ? emailItems.sort((a, b) => b.date.getTime() - a.date.getTime()) : allItems
  const projectGroups = groupTimelineItemsByProject(displayItems)
  const groupedItems = projectGroups.flatMap(group => group.items)
  const itemsToRender = view === 'projects' ? groupedItems : displayItems
  const groupByItemId = new Map(
    projectGroups.flatMap(group => group.items.map(item => [item.id, group] as const)),
  )

  function renderProjectGroupHeader(group: TimelineProjectGroup) {
    const project = group.project
    return (
      <div className="border-b border-gray-100 bg-gradient-to-r from-primary-50/80 to-white px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg ${project ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500'}`}>
              {project ? <FolderOpen className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">
                {project?.name || 'Övrig kunddialog'}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {project
                  ? `${project.project_number ? `${project.project_number} · ` : ''}${group.items.length} händelser`
                  : 'Saknar en säker koppling till ett specifikt projekt'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
            {group.channels.map(channel => (
              <span key={channel} className="rounded-full border border-primary-100 bg-white px-2 py-1 text-[10px] font-medium text-primary-700">
                {channel}
              </span>
            ))}
            {project && (
              <Link
                href={`/dashboard/projects/${project.project_id}`}
                className="ml-1 inline-flex items-center rounded-lg px-2 py-1 text-xs font-semibold text-primary-700 hover:bg-primary-100"
              >
                Öppna projekt
              </Link>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 text-primary-700 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">Kunddialog och historik</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {view === 'projects'
              ? 'Samlat per projekt när kopplingen kan bevisas.'
              : 'Alla händelser i tidsordning.'}
          </p>
        </div>
        <div className="inline-flex self-start rounded-xl border border-gray-200 bg-gray-50 p-1" aria-label="Välj tidslinjevy">
          <button
            type="button"
            onClick={() => setView('projects')}
            aria-pressed={view === 'projects'}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              view === 'projects' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Per projekt
          </button>
          <button
            type="button"
            onClick={() => setView('chronological')}
            aria-pressed={view === 'chronological'}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              view === 'chronological' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <List className="h-3.5 w-3.5" />
            Kronologiskt
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setExpandedId(null) }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === f.key
                ? 'bg-primary-100 text-primary-700 border border-primary-300'
                : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
            }`}
          >
            {f.label}
          </button>
        ))}
        {emailLoading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin self-center ml-1" />}
      </div>

      {/* Timeline */}
      <div className="bg-white shadow-sm rounded-xl border border-gray-200">
        {itemsToRender.length === 0 ? (
          <div className="p-8 text-center">
            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">Ingen historik ännu</p>
            <p className="text-xs text-gray-400 mt-1">
              Händelser visas här efterhand som de skapas
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {itemsToRender.map((item, index) => {
              const group = groupByItemId.get(item.id)
              const previousGroup = index > 0 ? groupByItemId.get(itemsToRender[index - 1].id) : null
              const showGroupHeader = view === 'projects' && group && group.key !== previousGroup?.key

              if (item.type === 'email_thread') {
                const thread = item.data
                const isExpanded = expandedThreadId === thread.threadId
                const msgs = threadMessages[thread.threadId]
                return (
                  <div key={item.id}>
                    {showGroupHeader ? renderProjectGroupHeader(group) : null}
                    <div className="p-4 hover:bg-gray-50/50 transition-all">
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 relative">
                        <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center">
                          <Mail className="w-4 h-4 text-blue-500" />
                        </div>
                        {/* Timeline line */}
                        <div className="absolute top-8 left-1/2 -translate-x-1/2 w-px h-[calc(100%-2rem)] bg-gray-100" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 text-sm truncate">{thread.subject}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {extractEmailName(thread.from)}
                              {thread.messageCount > 1 && (
                                <span className="ml-1.5 px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">{thread.messageCount} meddelanden</span>
                              )}
                              {thread.isUnread && <span className="ml-1.5 w-2 h-2 bg-primary-700 rounded-full inline-block" />}
                            </p>
                          </div>
                          <span className="text-xs text-gray-400 whitespace-nowrap">{formatTimestamp(new Date(thread.date).toISOString())}</span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{thread.snippet}</p>
                        <button
                          onClick={() => fetchThreadMsgs(thread.threadId)}
                          className="mt-2 text-xs text-blue-600 hover:text-blue-500 flex items-center gap-1"
                        >
                          {threadLoading && expandedThreadId === thread.threadId
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Mail className="w-3 h-3" />}
                          {isExpanded && msgs ? 'Dolj konversation' : 'Visa konversation'}
                        </button>
                        {isExpanded && msgs && (
                          <div className="mt-3 space-y-2">
                            {msgs.map((msg: any) => (
                              <div key={msg.messageId} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-medium text-gray-700">{extractEmailName(msg.from)}</span>
                                  <span className="text-[10px] text-gray-400">{formatTimestamp(new Date(msg.date).toISOString())}</span>
                                </div>
                                <div className="text-xs text-gray-600 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">{msg.bodyText || msg.snippet}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    </div>
                  </div>
                )
              }

              // Regular event
              const event = item.data as TimelineEvent
              const isExpanded = expandedId === event.id
              const link = getLinkForEvent(event)
              const hasDetails = !!(event.description || event.metadata.transcript || event.metadata.recording_url)

              return (
                <div key={item.id}>
                  {showGroupHeader ? renderProjectGroupHeader(group) : null}
                  <div className="p-4 hover:bg-gray-50/50 transition-all">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 relative">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getIconBg(event.type)}`}>
                        {getIcon(event.type)}
                      </div>
                      <div className="absolute top-8 left-1/2 -translate-x-1/2 w-px h-[calc(100%-2rem)] bg-gray-100" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">{event.title}</p>
                          {link && (
                            <Link href={link} className="text-primary-700 hover:text-primary-700 flex-shrink-0">
                              <ChevronDown className="w-3.5 h-3.5 rotate-[-90deg]" />
                            </Link>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                          {Boolean(event.metadata.created_by) && event.metadata.created_by !== 'user' && event.metadata.created_by !== 'system' && (
                            <span className="mr-1">{String(event.metadata.created_by)} &middot;</span>
                          )}
                          {formatTimestamp(event.timestamp)}
                        </span>
                      </div>

                      {/* Compact description */}
                      {event.description && !isExpanded && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{event.description}</p>
                      )}

                      {/* Duration for calls */}
                      {(() => {
                        const dur = event.metadata.duration_seconds
                        if (isExpanded || typeof dur !== 'number') return null
                        return (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Langd: {Math.floor(dur / 60)}:{String(dur % 60).padStart(2, '0')}
                          </p>
                        )
                      })()}

                      {/* Expand/collapse for items with details */}
                      {hasDetails && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : event.id)}
                          className="mt-1.5 text-xs text-primary-700 hover:text-primary-700 flex items-center gap-1"
                        >
                          <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          {isExpanded ? 'Visa mindre' : 'Visa detaljer'}
                        </button>
                      )}

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="mt-2 space-y-2">
                          {event.description && (
                            <p className="text-sm text-gray-600 whitespace-pre-wrap">{event.description}</p>
                          )}
                          {typeof event.metadata.duration_seconds === 'number' && (
                            <p className="text-xs text-gray-400">
                              Langd: {Math.floor(Number(event.metadata.duration_seconds) / 60)}:{String(Number(event.metadata.duration_seconds) % 60).padStart(2, '0')}
                            </p>
                          )}
                          {Boolean(event.metadata.transcript) ? (
                            <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-500 whitespace-pre-wrap max-h-60 overflow-y-auto">
                              {String(event.metadata.transcript)}
                            </div>
                          ) : null}
                          {Boolean(event.metadata.recording_url) ? (
                            <button className="flex items-center gap-1 text-xs text-primary-700 hover:text-primary-700">
                              <Play className="w-3 h-3" />
                              Spela upp inspelning
                            </button>
                          ) : null}
                          {event.metadata.tool_calls != null && (
                            <p className="text-xs text-gray-400">
                              Verktygsanrop: {String(event.metadata.tool_calls)}, Tid: {String(event.metadata.duration_ms)}ms
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Load more */}
        {hasMore && (
          <div className="p-3 border-t border-gray-100 text-center">
            <button
              onClick={() => fetchTimeline(filter, events.length)}
              disabled={loadingMore}
              className="text-sm text-primary-700 hover:text-primary-700 disabled:opacity-50"
            >
              {loadingMore ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : null}
              Visa fler ({total - events.length} kvar)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
