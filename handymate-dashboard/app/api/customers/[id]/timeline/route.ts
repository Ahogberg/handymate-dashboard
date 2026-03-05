import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

interface TimelineEvent {
  id: string
  type: string
  title: string
  description: string | null
  timestamp: string
  metadata: Record<string, unknown>
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthenticatedBusiness(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const customerId = params.id
  const { searchParams } = request.nextUrl
  const filter = searchParams.get('filter') || 'all'
  const offset = parseInt(searchParams.get('offset') || '0')
  const limit = parseInt(searchParams.get('limit') || '50')
  const businessId = auth.business_id

  const supabase = getServerSupabase()
  const events: TimelineEvent[] = []

  // Fetch customer phone for SMS matching
  const { data: customer } = await supabase
    .from('customer')
    .select('phone_number, email')
    .eq('customer_id', customerId)
    .single()

  const customerPhone = customer?.phone_number || null

  // ── 1. customer_activity (existing activity log) ──────────────
  if (filter === 'all' || filter === 'calls' || filter === 'sms' || filter === 'notes') {
    let actQuery = supabase
      .from('customer_activity')
      .select('activity_id, activity_type, title, description, recording_url, transcript, duration_seconds, metadata, created_at, created_by')
      .eq('customer_id', customerId)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (filter === 'calls') actQuery = actQuery.like('activity_type', 'call_%')
    else if (filter === 'sms') actQuery = actQuery.like('activity_type', 'sms_%')
    else if (filter === 'notes') actQuery = actQuery.eq('activity_type', 'note_added')

    const { data: acts } = await actQuery

    for (const a of acts || []) {
      events.push({
        id: `act_${a.activity_id}`,
        type: a.activity_type,
        title: a.title,
        description: a.description,
        timestamp: a.created_at,
        metadata: {
          recording_url: a.recording_url,
          transcript: a.transcript,
          duration_seconds: a.duration_seconds,
          created_by: a.created_by,
          ...(a.metadata || {}),
        },
      })
    }
  }

  // ── 2. sms_conversation — SMS history ─────────────────────────
  if ((filter === 'all' || filter === 'sms') && customerPhone) {
    const { data: smsRows } = await supabase
      .from('sms_conversation')
      .select('id, role, content, created_at')
      .eq('business_id', businessId)
      .eq('phone_number', customerPhone)
      .order('created_at', { ascending: false })
      .limit(50)

    for (const s of smsRows || []) {
      events.push({
        id: `sms_${s.id}`,
        type: s.role === 'user' ? 'sms_received' : 'sms_sent',
        title: s.role === 'user' ? 'SMS mottaget' : 'SMS skickat',
        description: s.content,
        timestamp: s.created_at,
        metadata: { phone: customerPhone, role: s.role },
      })
    }
  }

  // ── 3. conversations (vapi/46elks) ────────────────────────────
  if (filter === 'all' || filter === 'calls') {
    const { data: convos } = await supabase
      .from('conversations')
      .select('conversation_id, type, phone_number, content, metadata, created_at')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(30)

    for (const c of convos || []) {
      events.push({
        id: `conv_${c.conversation_id}`,
        type: c.type === 'sms' ? 'sms_received' : 'call_inbound',
        title: c.type === 'sms' ? 'SMS-konversation' : 'Samtal',
        description: c.content ? c.content.substring(0, 200) : null,
        timestamp: c.created_at,
        metadata: { phone: c.phone_number, conversation_type: c.type, ...(c.metadata || {}) },
      })
    }
  }

  // ── 4. quotes — Offerter ──────────────────────────────────────
  if (filter === 'all' || filter === 'quotes') {
    const { data: quotes } = await supabase
      .from('quotes')
      .select('quote_id, status, total, customer_pays, rot_rut_type, valid_until, created_at, sent_at, accepted_at')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(20)

    for (const q of quotes || []) {
      // Creation event
      events.push({
        id: `quote_created_${q.quote_id}`,
        type: 'quote_created',
        title: 'Offert skapad',
        description: `Belopp: ${formatSEK(q.customer_pays || q.total)}${q.rot_rut_type ? ` (${q.rot_rut_type.toUpperCase()})` : ''}`,
        timestamp: q.created_at,
        metadata: { quote_id: q.quote_id, total: q.total, customer_pays: q.customer_pays, status: q.status },
      })

      // Sent event
      if (q.sent_at) {
        events.push({
          id: `quote_sent_${q.quote_id}`,
          type: 'quote_sent',
          title: 'Offert skickad',
          description: `Offert skickad till kund`,
          timestamp: q.sent_at,
          metadata: { quote_id: q.quote_id },
        })
      }

      // Accepted/Declined
      if (q.status === 'accepted' && q.accepted_at) {
        events.push({
          id: `quote_accepted_${q.quote_id}`,
          type: 'quote_accepted',
          title: 'Offert accepterad',
          description: `Kunden accepterade offerten på ${formatSEK(q.customer_pays || q.total)}`,
          timestamp: q.accepted_at,
          metadata: { quote_id: q.quote_id, total: q.customer_pays || q.total },
        })
      } else if (q.status === 'declined') {
        events.push({
          id: `quote_declined_${q.quote_id}`,
          type: 'quote_declined',
          title: 'Offert avböjd',
          description: 'Kunden avböjde offerten',
          timestamp: q.created_at, // No specific declined_at column
          metadata: { quote_id: q.quote_id },
        })
      } else if (q.status === 'expired' && q.valid_until) {
        events.push({
          id: `quote_expired_${q.quote_id}`,
          type: 'quote_expired',
          title: 'Offert utgången',
          description: `Offerten gick ut ${q.valid_until}`,
          timestamp: q.valid_until,
          metadata: { quote_id: q.quote_id },
        })
      }
    }
  }

  // ── 5. invoices — Fakturor ────────────────────────────────────
  if (filter === 'all' || filter === 'invoices') {
    const { data: invoices } = await supabase
      .from('invoice')
      .select('invoice_id, invoice_number, status, total, due_date, rot_rut_type, created_at, sent_at, paid_at')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(20)

    for (const inv of invoices || []) {
      events.push({
        id: `inv_created_${inv.invoice_id}`,
        type: 'invoice_created',
        title: `Faktura #${inv.invoice_number || '–'} skapad`,
        description: `Belopp: ${formatSEK(inv.total)}${inv.rot_rut_type ? ` (${inv.rot_rut_type.toUpperCase()})` : ''}`,
        timestamp: inv.created_at,
        metadata: { invoice_id: inv.invoice_id, total: inv.total, status: inv.status, invoice_number: inv.invoice_number },
      })

      if (inv.sent_at) {
        events.push({
          id: `inv_sent_${inv.invoice_id}`,
          type: 'invoice_sent',
          title: `Faktura #${inv.invoice_number || '–'} skickad`,
          description: `Förfallodatum: ${inv.due_date || '–'}`,
          timestamp: inv.sent_at,
          metadata: { invoice_id: inv.invoice_id, due_date: inv.due_date },
        })
      }

      if (inv.status === 'paid' && inv.paid_at) {
        events.push({
          id: `inv_paid_${inv.invoice_id}`,
          type: 'invoice_paid',
          title: `Faktura #${inv.invoice_number || '–'} betald`,
          description: `${formatSEK(inv.total)} betald`,
          timestamp: inv.paid_at,
          metadata: { invoice_id: inv.invoice_id, total: inv.total },
        })
      } else if (inv.status === 'overdue') {
        events.push({
          id: `inv_overdue_${inv.invoice_id}`,
          type: 'invoice_overdue',
          title: `Faktura #${inv.invoice_number || '–'} förfallen`,
          description: `Förfallodatum: ${inv.due_date || '–'}`,
          timestamp: inv.due_date || inv.created_at,
          metadata: { invoice_id: inv.invoice_id },
        })
      }
    }
  }

  // ── 6. bookings — Bokningar ───────────────────────────────────
  if (filter === 'all' || filter === 'bookings') {
    const { data: bookingRows } = await supabase
      .from('booking')
      .select('booking_id, status, job_status, notes, scheduled_start, completed_at, created_at')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(20)

    for (const b of bookingRows || []) {
      events.push({
        id: `book_${b.booking_id}`,
        type: 'booking_created',
        title: 'Bokning skapad',
        description: b.notes ? b.notes.substring(0, 150) : `Schemalagd: ${b.scheduled_start ? new Date(b.scheduled_start).toLocaleDateString('sv-SE') : '–'}`,
        timestamp: b.created_at,
        metadata: { booking_id: b.booking_id, status: b.status, job_status: b.job_status, scheduled_start: b.scheduled_start },
      })

      if (b.job_status === 'completed' && b.completed_at) {
        events.push({
          id: `book_done_${b.booking_id}`,
          type: 'booking_completed',
          title: 'Jobb slutfört',
          description: b.notes ? b.notes.substring(0, 100) : null,
          timestamp: b.completed_at,
          metadata: { booking_id: b.booking_id },
        })
      }
    }
  }

  // ── 7. leads — Lead-händelser ─────────────────────────────────
  if (filter === 'all' || filter === 'leads') {
    const { data: leads } = await supabase
      .from('leads')
      .select('lead_id, status, score, urgency, job_type, source, created_at, converted_at')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(10)

    for (const l of leads || []) {
      events.push({
        id: `lead_${l.lead_id}`,
        type: 'lead_created',
        title: 'Lead skapad',
        description: `Score: ${l.score || 0}, ${l.job_type || 'Okänd typ'}, Källa: ${l.source || '–'}`,
        timestamp: l.created_at,
        metadata: { lead_id: l.lead_id, score: l.score, urgency: l.urgency, status: l.status },
      })

      if (l.status === 'won' && l.converted_at) {
        events.push({
          id: `lead_won_${l.lead_id}`,
          type: 'lead_won',
          title: 'Lead konverterad',
          description: `Lead konverterad till kund`,
          timestamp: l.converted_at,
          metadata: { lead_id: l.lead_id },
        })
      }
    }
  }

  // ── 8. lead_activities ────────────────────────────────────────
  if (filter === 'all' || filter === 'leads') {
    // Get lead IDs for this customer
    const { data: customerLeads } = await supabase
      .from('leads')
      .select('lead_id')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)

    const leadIds = (customerLeads || []).map((l: any) => l.lead_id)

    if (leadIds.length > 0) {
      const { data: leadActs } = await supabase
        .from('lead_activities')
        .select('activity_id, lead_id, activity_type, description, metadata, created_at')
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false })
        .limit(30)

      for (const la of leadActs || []) {
        events.push({
          id: `la_${la.activity_id}`,
          type: `lead_activity_${la.activity_type}`,
          title: getLeadActivityTitle(la.activity_type),
          description: la.description,
          timestamp: la.created_at,
          metadata: { lead_id: la.lead_id, activity_type: la.activity_type, ...(la.metadata || {}) },
        })
      }
    }
  }

  // ── 9. agent_runs — Agent-actions ─────────────────────────────
  if (filter === 'all' || filter === 'agent') {
    // Agent runs linked via conversations or trigger_data
    const { data: agentRuns } = await supabase
      .from('agent_runs')
      .select('run_id, trigger_type, trigger_data, final_response, tool_calls, duration_ms, created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(50)

    for (const ar of agentRuns || []) {
      // Check if agent run relates to this customer
      const triggerData = ar.trigger_data || {}
      const relatedCustomerId = triggerData.customer_id as string | undefined
      const relatedPhone = triggerData.phone as string | undefined

      if (relatedCustomerId === customerId ||
          (customerPhone && relatedPhone && relatedPhone.includes(customerPhone.replace('+', '')))) {
        events.push({
          id: `agent_${ar.run_id}`,
          type: 'agent_action',
          title: `AI-agent: ${getAgentTriggerLabel(ar.trigger_type)}`,
          description: ar.final_response ? ar.final_response.substring(0, 200) : null,
          timestamp: ar.created_at,
          metadata: {
            run_id: ar.run_id,
            trigger_type: ar.trigger_type,
            tool_calls: ar.tool_calls,
            duration_ms: ar.duration_ms,
          },
        })
      }
    }
  }

  // ── 10. time_entry — Tidrapportering ──────────────────────────
  if (filter === 'all' || filter === 'time') {
    const { data: timeEntries } = await supabase
      .from('time_entry')
      .select('time_entry_id, work_date, start_time, end_time, duration_minutes, hourly_rate, is_billable, notes, created_at')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .order('work_date', { ascending: false })
      .limit(20)

    for (const te of timeEntries || []) {
      const hours = te.duration_minutes ? Math.floor(te.duration_minutes / 60) : 0
      const mins = te.duration_minutes ? te.duration_minutes % 60 : 0
      events.push({
        id: `time_${te.time_entry_id}`,
        type: 'time_entry',
        title: 'Tid registrerad',
        description: `${te.work_date}: ${hours}h ${mins}m${te.is_billable ? ' (fakturerbar)' : ''}${te.notes ? ` — ${te.notes.substring(0, 80)}` : ''}`,
        timestamp: te.created_at || te.work_date,
        metadata: {
          time_entry_id: te.time_entry_id,
          work_date: te.work_date,
          duration_minutes: te.duration_minutes,
          hourly_rate: te.hourly_rate,
          is_billable: te.is_billable,
        },
      })
    }
  }

  // ── Deduplicate, sort, paginate ───────────────────────────────
  // Deduplicate by id
  const seen = new Set<string>()
  const unique = events.filter(e => {
    if (seen.has(e.id)) return false
    seen.add(e.id)
    return true
  })

  // Sort by timestamp descending
  unique.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  // Paginate
  const total = unique.length
  const paginated = unique.slice(offset, offset + limit)

  return NextResponse.json({
    events: paginated,
    total,
    offset,
    limit,
    has_more: offset + limit < total,
  })
}

// ── Helpers ─────────────────────────────────────────────────────

function formatSEK(amount: number | null): string {
  if (!amount) return '0 kr'
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(amount) + ' kr'
}

function getLeadActivityTitle(type: string): string {
  const map: Record<string, string> = {
    created: 'Lead skapad',
    status_changed: 'Lead-status ändrad',
    score_updated: 'Lead-score uppdaterad',
    note_added: 'Anteckning på lead',
    contacted: 'Lead kontaktad',
    qualified: 'Lead kvalificerad',
  }
  return map[type] || `Lead: ${type}`
}

function getAgentTriggerLabel(trigger: string): string {
  const map: Record<string, string> = {
    phone_call: 'Samtal hanterat',
    incoming_sms: 'SMS besvarat',
    cron: 'Schemalagd genomgång',
    manual: 'Manuell åtgärd',
  }
  return map[trigger] || trigger
}
