'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface TimelineEvent {
  id: string
  type: string
  timestamp: string
  title: string
  subtitle?: string
  icon: string
  link?: { label: string; href: string }
}

const ICONS: Record<string, string> = {
  lead_received: '📥',
  sms_sent: '💬',
  sms_received: '💬',
  call_outbound: '📞',
  call_inbound: '📞',
  calendar_event_booked: '📅',
  calendar_event_completed: '✅',
  quote_created: '📄',
  quote_sent: '📤',
  quote_opened: '👁',
  quote_signed: '✅',
  project_created: '🚀',
  invoice_sent: '🧾',
  invoice_paid: '💚',
  note_added: '📝',
  stage_changed: '🔄',
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just nu'
  if (mins < 60) return `${mins} min sedan`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h sedan`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d sedan`
  return new Date(date).toLocaleDateString('sv-SE')
}

interface Props {
  dealId: string
  customerId?: string | null
  businessId: string
}

export function DealTimeline({ dealId, customerId, businessId }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTimeline()
  }, [dealId, customerId])

  async function fetchTimeline() {
    setLoading(true)
    const allEvents: TimelineEvent[] = []

    try {
      // 1. Pipeline activities
      const { data: activities } = await supabase
        .from('pipeline_activity')
        .select('id, activity_type, description, triggered_by, created_at')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
        .limit(20)

      activities?.forEach((a: any) => {
        allEvents.push({
          id: `act-${a.id}`,
          type: 'stage_changed',
          timestamp: a.created_at,
          title: a.description || a.activity_type,
          subtitle: a.triggered_by === 'ai' ? 'AI-agent' : a.triggered_by === 'system' ? 'Automation' : undefined,
          icon: ICONS.stage_changed,
        })
      })

      // 2. SMS logs (if customer has phone)
      if (customerId) {
        const { data: sms } = await supabase
          .from('sms_log')
          .select('id, direction, message, phone_to, created_at')
          .eq('business_id', businessId)
          .or(`phone_to.ilike.%${customerId}%`)
          .order('created_at', { ascending: false })
          .limit(10)

        sms?.forEach((s: any) => {
          allEvents.push({
            id: `sms-${s.id}`,
            type: s.direction === 'inbound' ? 'sms_received' : 'sms_sent',
            timestamp: s.created_at,
            title: s.direction === 'inbound' ? 'SMS mottaget' : 'SMS skickat',
            subtitle: s.message?.slice(0, 60) + (s.message && s.message.length > 60 ? '...' : ''),
            icon: ICONS.sms_sent,
          })
        })

        // 3. Customer activities
        const { data: custActivities } = await supabase
          .from('customer_activity')
          .select('id, activity_type, description, created_at')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false })
          .limit(10)

        custActivities?.forEach((ca: any) => {
          const type = ca.activity_type || 'note_added'
          allEvents.push({
            id: `ca-${ca.id}`,
            type,
            timestamp: ca.created_at,
            title: ca.description || type,
            icon: ICONS[type] || '📌',
          })
        })
      }

      // 4. Quotes linked to this deal
      const { data: quotes } = await supabase
        .from('quotes')
        .select('quote_id, status, title, total_amount, sent_at, accepted_at, created_at')
        .eq('deal_id', dealId)

      quotes?.forEach((q: any) => {
        allEvents.push({
          id: `q-created-${q.quote_id}`,
          type: 'quote_created',
          timestamp: q.created_at,
          title: `Offert skapad: ${q.title || 'Offert'}`,
          icon: ICONS.quote_created,
          link: { label: 'Visa offert', href: `/dashboard/quotes/${q.quote_id}` },
        })
        if (q.sent_at) {
          allEvents.push({
            id: `q-sent-${q.quote_id}`,
            type: 'quote_sent',
            timestamp: q.sent_at,
            title: `Offert skickad (${new Intl.NumberFormat('sv-SE').format(q.total_amount || 0)} kr)`,
            icon: ICONS.quote_sent,
          })
        }
        if (q.accepted_at) {
          allEvents.push({
            id: `q-signed-${q.quote_id}`,
            type: 'quote_signed',
            timestamp: q.accepted_at,
            title: 'Offert signerad av kund',
            icon: ICONS.quote_signed,
          })
        }
      })

      // Sort all events by timestamp descending
      allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      setEvents(allEvents)
    } catch (err) {
      console.error('[DealTimeline] Error fetching:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="py-4 text-center text-xs text-gray-400">Laddar tidslinje...</div>
  }

  if (events.length === 0) {
    return <div className="py-4 text-center text-xs text-gray-400">Ingen aktivitet ännu</div>
  }

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div className="absolute left-2 top-0 bottom-0 w-px bg-gray-200" />

      {events.map((event, i) => (
        <div key={event.id} className="relative pb-4 last:pb-0">
          {/* Dot */}
          <div className="absolute -left-4 top-0.5 w-5 h-5 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center text-[10px]">
            {event.icon}
          </div>

          {/* Content */}
          <div className="ml-2">
            <p className="text-[13px] font-medium text-gray-900">{event.title}</p>
            {event.subtitle && (
              <p className="text-[11px] text-gray-500 mt-0.5">{event.subtitle}</p>
            )}
            <p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(event.timestamp)}</p>
            {event.link && (
              <a href={event.link.href} className="text-[11px] text-primary-700 hover:underline mt-0.5 inline-block">
                {event.link.label} →
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
