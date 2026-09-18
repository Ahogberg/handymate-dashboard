'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { phoneCandidates } from '@/lib/voice/find-customer-by-phone'
import { acceptanceOriginDate, acceptanceOriginLabel } from '@/lib/quotes/lifecycle'

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

      // 2. SMS för kunden
      //
      // ═══ TELEFONNUMMER JÄMFÖRT MED ETT KUND-ID (fynd 2026-09-18) ═══
      //
      // Filtret var `.or(\`phone_to.ilike.%${customerId}%\`)` — kundens ID
      // ("cust_a1b2c3") söktes som delsträng i ett TELEFONNUMMER. Det kan
      // aldrig träffa, så SMS-grenen i dealtidslinjen har varit tom sedan den
      // skrevs: hantverkaren såg aktiviteter, offerter och anteckningar men
      // aldrig ett enda SMS.
      //
      // Nu hämtas kundens nummer och slås upp med samma kandidatlista som
      // resten av kundminnet (lib/voice/find-customer-by-phone), både som
      // mottagare (utgående) och avsändare (inkommande) — kunden kan vara
      // sparad som "070-123 45 67" medan 46elks skriver "+46701234567".
      if (customerId) {
        const { data: kund } = await supabase
          .from('customer')
          .select('phone_number')
          .eq('business_id', businessId)
          .eq('customer_id', customerId)
          .maybeSingle()

        const kandidater = phoneCandidates(kund?.phone_number)
        if (kandidater.length > 0) {
          const lista = kandidater.map(n => `"${n}"`).join(',')
          const { data: sms } = await supabase
            .from('sms_log')
            .select('sms_id, direction, message, phone_to, created_at')
            .eq('business_id', businessId)
            .or(`phone_to.in.(${lista}),phone_from.in.(${lista})`)
            .order('created_at', { ascending: false })
            .limit(10)

          sms?.forEach((s: any) => {
            allEvents.push({
              id: `sms-${s.sms_id}`,
              type: s.direction === 'inbound' ? 'sms_received' : 'sms_sent',
              timestamp: s.created_at,
              title: s.direction === 'inbound' ? 'SMS mottaget' : 'SMS skickat',
              subtitle: s.message?.slice(0, 60) + (s.message && s.message.length > 60 ? '...' : ''),
              icon: ICONS.sms_sent,
            })
          })
        }

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
        .select('quote_id, status, title, total_amount:total, sent_at, accepted_at, accepted_via, accepted_by, signed_at, signed_by_name, created_at')
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
        // Tidslinjen påstod att kunden hade signerat VARJE accepterad
        // offert — även den hantverkaren själv bockade av efter ett samtal.
        // Ursprunget kommer nu från lib/quotes/lifecycle (v263).
        const ursprung = acceptanceOriginLabel(q)
        if (q.accepted_at && ursprung) {
          allEvents.push({
            id: `q-signed-${q.quote_id}`,
            type: 'quote_signed',
            timestamp: acceptanceOriginDate(q) || q.accepted_at,
            title: `${ursprung}: ${q.title || 'Offert'}`,
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
