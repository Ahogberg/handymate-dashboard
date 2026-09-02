import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { phoneCandidates } from '@/lib/voice/find-customer-by-phone'
import {
  emptyTimelineProjectContext,
  resolveTimelineProject,
  type TimelineProjectReference,
} from '@/lib/customers/timeline-project-context'

interface TimelineEvent {
  id: string
  type: string
  title: string
  description: string | null
  timestamp: string
  metadata: Record<string, unknown>
  project?: TimelineProjectReference | null
}

export const dynamic = 'force-dynamic'

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
    .eq('business_id', businessId)
    .single()

  const customerPhone = customer?.phone_number || null
  // Kundminne-revisionen (2026-09-02, gap 1): skrivarna sparar alltid E.164,
  // men kunden kan vara sparad i valfri form ("070-123 45 67"). Ett rått
  // .eq(phone_number, customerPhone) gjorde SMS-historiken osynlig för
  // varannan kund. phoneCandidates ger [rå, E.164] att slå upp med .in().
  const smsPhoneCandidates = phoneCandidates(customerPhone)

  // Projektkontexten läses tenant- OCH kundfiltrerat. Den används bara för
  // verifierade id-kedjor; en kontakt utan sådan kedja lämnas okopplad.
  const [projectContextRows, dealContextRows, quoteContextRows, invoiceContextRows, bookingContextRows] = await Promise.all([
    supabase
      .from('project')
      .select('project_id, name, project_number, status')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .limit(100),
    supabase
      .from('deal')
      .select('id, project_id, lead_id')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .limit(100),
    supabase
      .from('quotes')
      .select('quote_id, deal_id')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .limit(100),
    supabase
      .from('invoice')
      .select('invoice_id, project_id')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .limit(100),
    supabase
      .from('booking')
      .select('booking_id, project_id')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .limit(100),
  ])

  const projectContext = emptyTimelineProjectContext()
  for (const project of projectContextRows.data || []) {
    projectContext.projects[project.project_id] = {
      project_id: project.project_id,
      name: project.name || 'Namnlöst projekt',
      project_number: project.project_number || null,
      status: project.status || null,
    }
  }
  for (const deal of dealContextRows.data || []) {
    if (!deal.project_id || !projectContext.projects[deal.project_id]) continue
    projectContext.dealToProject[deal.id] = deal.project_id
    if (deal.lead_id) projectContext.leadToProject[deal.lead_id] = deal.project_id
  }
  for (const quote of quoteContextRows.data || []) {
    const projectId = quote.deal_id ? projectContext.dealToProject[quote.deal_id] : null
    if (projectId) projectContext.quoteToProject[quote.quote_id] = projectId
  }
  for (const invoice of invoiceContextRows.data || []) {
    if (invoice.project_id && projectContext.projects[invoice.project_id]) {
      projectContext.invoiceToProject[invoice.invoice_id] = invoice.project_id
    }
  }
  for (const booking of bookingContextRows.data || []) {
    if (booking.project_id && projectContext.projects[booking.project_id]) {
      projectContext.bookingToProject[booking.booking_id] = booking.project_id
    }
  }

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
  if ((filter === 'all' || filter === 'sms') && smsPhoneCandidates.length > 0) {
    const { data: smsRows } = await supabase
      .from('sms_conversation')
      .select('id, role, content, created_at')
      .eq('business_id', businessId)
      .in('phone_number', smsPhoneCandidates)
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

  // ═══ Sektionerna 3b-3f: kontextrevisionen 2026-08-16 ═══
  // Tidslinjen såg ut som en "allt"-vy men saknade samtal/möten (nuvarande
  // pipeline), e-post, portal-tråden, utgående transaktions-SMS och offert-
  // öppningar — dvs. INGEN komplett per-kund-kommunikationslogg fanns
  // någonstans i produkten. Direkt blockerare för Compliance Agent-idén
  // (kunna peka på vad som sades när, per kanal, vid tvist/redovisning).

  // ── 3b. call_recording — riktiga samtal + platsbesök/möten ────
  if (filter === 'all' || filter === 'calls') {
    const { data: recordings } = await supabase
      .from('call_recording')
      // v180 project_id is optional during manual deployment; DTO below is explicit.
      .select('*')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(30)

    for (const r of recordings || []) {
      const arMote = r.source === 'site_visit'
      events.push({
        id: `rec_${r.recording_id}`,
        type: arMote ? 'meeting_recorded' : 'call_recorded',
        title: arMote ? 'Platsbesök inspelat' : 'Samtal inspelat',
        description: r.transcript_summary ? String(r.transcript_summary).substring(0, 300) : null,
        timestamp: r.created_at,
        metadata: {
          phone: r.phone_number,
          source: r.source,
          duration_seconds: r.duration_seconds,
          recording_id: r.recording_id,
          booking_id: r.booking_id,
          project_id: r.project_id || null,
        },
      })
    }
  }

  // ── 3c. email_conversations — e-post, båda riktningar ─────────
  if ((filter === 'all' || filter === 'email') ) {
    const { data: emails } = await supabase
      .from('email_conversations')
      .select('id, direction, subject, body_text, received_at')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .order('received_at', { ascending: false })
      .limit(50)

    for (const e of emails || []) {
      const utgaende = e.direction === 'outbound'
      events.push({
        id: `email_${e.id}`,
        type: utgaende ? 'email_sent' : 'email_received',
        title: utgaende ? `E-post skickad: ${e.subject || '(utan ämne)'}` : `E-post mottagen: ${e.subject || '(utan ämne)'}`,
        description: e.body_text ? String(e.body_text).substring(0, 300) : null,
        timestamp: e.received_at,
        metadata: { direction: e.direction, subject: e.subject },
      })
    }
  }

  // ── 3d. customer_message — portal-tråden ──────────────────────
  if (filter === 'all' || filter === 'portal') {
    const { data: portalMsgs } = await supabase
      .from('customer_message')
      .select('id, direction, message, created_at')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(50)

    for (const p of portalMsgs || []) {
      const utgaende = p.direction === 'outbound'
      events.push({
        id: `portal_${p.id}`,
        type: utgaende ? 'portal_message_sent' : 'portal_message_received',
        title: utgaende ? 'Portalmeddelande skickat' : 'Portalmeddelande mottaget',
        description: p.message,
        timestamp: p.created_at,
        metadata: { direction: p.direction, channel: 'portal' },
      })
    }
  }

  // ── 3e. sms_log — utgående transaktions-/proaktiva SMS ────────
  // sms_log är revisionskällan och bär related_id. Efter 2026-08-16 finns
  // samma utskick även i sms_conversation; dubbletten tas bort mekaniskt
  // längre ned så den mer precisa sms_log-raden (med projektkedja) vinner.
  if ((filter === 'all' || filter === 'sms')) {
    const { data: smsLogRows } = await supabase
      .from('sms_log')
      .select('sms_id, message, message_type, related_id, status, sent_at')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .eq('direction', 'outbound')
      .in('status', ['sent', 'delivered'])
      .order('sent_at', { ascending: false })
      .limit(50)

    for (const s of smsLogRows || []) {
      events.push({
        id: `smslog_${s.sms_id}`,
        type: 'sms_sent',
        title: 'SMS skickat',
        description: s.message,
        timestamp: s.sent_at,
        metadata: {
          message_type: s.message_type,
          related_id: s.related_id,
          source: 'sms_log',
          ...smsRelationMetadata(s.message_type, s.related_id),
        },
      })
    }
  }

  // ── 3f. quote_tracking_events — kunden öppnade offerten ───────
  if (filter === 'all' || filter === 'quotes') {
    const { data: quoteIdRows } = await supabase
      .from('quotes')
      .select('quote_id, quote_number')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
    const quoteIds = (quoteIdRows || []).map((q: any) => q.quote_id)
    if (quoteIds.length > 0) {
      const nummerAv = new Map((quoteIdRows || []).map((q: any) => [q.quote_id, q.quote_number]))
      const { data: views } = await supabase
        .from('quote_tracking_events')
        .select('id, quote_id, event_type, created_at')
        .eq('business_id', businessId)
        .in('quote_id', quoteIds)
        .eq('event_type', 'opened')
        .order('created_at', { ascending: false })
        .limit(30)
      for (const v of views || []) {
        events.push({
          id: `qtrack_${v.id}`,
          type: 'quote_viewed',
          title: `Kunden öppnade offert ${nummerAv.get(v.quote_id) || ''}`.trim(),
          description: null,
          timestamp: v.created_at,
          metadata: { quote_id: v.quote_id, event_type: v.event_type },
        })
      }
    }
  }

  // ── 3g. widget_conversation — försäljningschatten på hemsidan ─
  // Ingen customer_id-länk finns (spekulanten var inte kund än) — matchas
  // via telefon/e-post besökaren själv angav. AI-gjorda prisuttalanden
  // före köpet blir därmed åtkomliga i kundens historik efteråt.
  if ((filter === 'all' || filter === 'chat') && (customerPhone || customer?.email)) {
    const orVillkor = [
      customerPhone ? `visitor_phone.eq.${customerPhone}` : null,
      customer?.email ? `visitor_email.eq.${customer.email}` : null,
    ].filter(Boolean).join(',')
    const { data: widgetConvos } = await supabase
      .from('widget_conversation')
      .select('id, messages, message_count, created_at')
      .eq('business_id', businessId)
      .or(orVillkor)
      .order('created_at', { ascending: false })
      .limit(5)

    for (const w of widgetConvos || []) {
      const msgs = Array.isArray(w.messages) ? w.messages : []
      const preview = msgs
        .slice(0, 6)
        .map((m: any) => `${m.role === 'user' ? 'Kund' : 'AI'}: ${String(m.content || '').substring(0, 80)}`)
        .join(' · ')
      events.push({
        id: `widget_${w.id}`,
        type: 'widget_chat',
        title: `Webbchatt (${w.message_count || msgs.length} meddelanden)`,
        description: preview || null,
        timestamp: w.created_at,
        metadata: { conversation_id: w.id, message_count: w.message_count },
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
      .select('invoice_id, invoice_number, project_id, status, total, due_date, rot_rut_type, created_at, sent_at, paid_at')
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
        metadata: { invoice_id: inv.invoice_id, project_id: inv.project_id, total: inv.total, status: inv.status, invoice_number: inv.invoice_number },
      })

      if (inv.sent_at) {
        events.push({
          id: `inv_sent_${inv.invoice_id}`,
          type: 'invoice_sent',
          title: `Faktura #${inv.invoice_number || '–'} skickad`,
          description: `Förfallodatum: ${inv.due_date || '–'}`,
          timestamp: inv.sent_at,
          metadata: { invoice_id: inv.invoice_id, project_id: inv.project_id, due_date: inv.due_date },
        })
      }

      if (inv.status === 'paid' && inv.paid_at) {
        events.push({
          id: `inv_paid_${inv.invoice_id}`,
          type: 'invoice_paid',
          title: `Faktura #${inv.invoice_number || '–'} betald`,
          description: `${formatSEK(inv.total)} betald`,
          timestamp: inv.paid_at,
          metadata: { invoice_id: inv.invoice_id, project_id: inv.project_id, total: inv.total },
        })
      } else if (inv.status === 'overdue') {
        events.push({
          id: `inv_overdue_${inv.invoice_id}`,
          type: 'invoice_overdue',
          title: `Faktura #${inv.invoice_number || '–'} förfallen`,
          description: `Förfallodatum: ${inv.due_date || '–'}`,
          timestamp: inv.due_date || inv.created_at,
          metadata: { invoice_id: inv.invoice_id, project_id: inv.project_id },
        })
      }
    }
  }

  // ── 6. bookings — Bokningar ───────────────────────────────────
  if (filter === 'all' || filter === 'bookings') {
    const { data: bookingRows } = await supabase
      .from('booking')
      .select('booking_id, project_id, status, job_status, notes, scheduled_start, completed_at, created_at')
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
        metadata: { booking_id: b.booking_id, project_id: b.project_id, status: b.status, job_status: b.job_status, scheduled_start: b.scheduled_start },
      })

      if (b.job_status === 'completed' && b.completed_at) {
        events.push({
          id: `book_done_${b.booking_id}`,
          type: 'booking_completed',
          title: 'Jobb slutfört',
          description: b.notes ? b.notes.substring(0, 100) : null,
          timestamp: b.completed_at,
          metadata: { booking_id: b.booking_id, project_id: b.project_id },
        })
      }
    }
  }

  // ── 7. leads — Lead-händelser ─────────────────────────────────
  if (filter === 'all' || filter === 'leads') {
    const { data: leads } = await supabase
      .from('leads')
      .select('lead_id, status, score, urgency, job_type, source, notes, created_at, converted_at')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(10)

    for (const l of leads || []) {
      // Kundminne-revisionen (2026-09-02, gap 5): kundens egna ord från
      // webben/leadformuläret (leads.notes) syntes ingenstans — bara
      // score/källa. Trimmad till 300 tecken, samma tak som övriga
      // kroppar i tidslinjen.
      const kundensOrd = l.notes ? String(l.notes).trim().substring(0, 300) : null
      events.push({
        id: `lead_${l.lead_id}`,
        type: 'lead_created',
        title: 'Lead skapad',
        description: kundensOrd || `Score: ${l.score || 0}, ${l.job_type || 'Okänd typ'}, Källa: ${l.source || '–'}`,
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
            project_id: triggerData.project_id,
            booking_id: triggerData.booking_id,
            quote_id: triggerData.quote_id,
            invoice_id: triggerData.invoice_id,
            deal_id: triggerData.deal_id,
          },
        })
      }
    }
  }

  // ── 10. time_entry — Tidrapportering ──────────────────────────
  if (filter === 'all' || filter === 'time') {
    const { data: timeEntries } = await supabase
      .from('time_entry')
      // `notes:description` — ALIAS. Tabellen har `description`, aldrig `notes`
      // (sql/new_tables.sql:14). Frågan bad om `notes`, PostgREST svarade 42703,
      // och eftersom `error` inte plockas ut nedan blev `data` null och hela
      // tidrapporterings-sektionen tyst tom. Inte ett fel i loggen på månader.
      .select('time_entry_id, project_id, work_date, start_time, end_time, duration_minutes, hourly_rate, is_billable, notes:description, created_at')
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
          project_id: te.project_id,
          work_date: te.work_date,
          duration_minutes: te.duration_minutes,
          hourly_rate: te.hourly_rate,
          is_billable: te.is_billable,
        },
      })
    }
  }

  // ── 11. projects — Projekt-händelser ──────────────────────────
  if (filter === 'all' || filter === 'projects') {
    // Sanering 2026-08-05: project (PK project_id, budget_amount) — gamla
    // namnet projects gjorde att projekt-händelser aldrig syntes i timelinen.
    const { data: projects } = await supabase
      .from('project')
      .select('id:project_id, name, status, created_at, completed_at, budget:budget_amount')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(20)

    for (const p of projects || []) {
      events.push({
        id: `proj_created_${p.id}`,
        type: 'project_created',
        title: `Projekt skapat: ${p.name}`,
        description: p.budget ? `Budget: ${formatSEK(p.budget)}` : null,
        timestamp: p.created_at,
        metadata: { project_id: p.id, status: p.status, budget: p.budget },
      })

      if (p.status === 'completed' && p.completed_at) {
        events.push({
          id: `proj_done_${p.id}`,
          type: 'project_completed',
          title: `Projekt avslutat: ${p.name}`,
          description: null,
          timestamp: p.completed_at,
          metadata: { project_id: p.id },
        })
      }
    }

    // Project log entries (byggdagbok)
    const projectIds = (projects || []).map((p: any) => p.id)
    if (projectIds.length > 0) {
      // Byggdagboken (project_log) heter i LIVE-schemat order_id/date/
      // work_performed/description — inte project_id/log_date/
      // work_description/notes (sql/rot_rut_documents.sql DEL 4 beskrev fel
      // schema fram till 2026-09-02 och den här frågan 42703:ade tyst i
      // månader: byggdagboken har aldrig synts i tidslinjen).
      const { data: logEntries, error: logErr } = await supabase
        .from('project_log')
        .select('id, work_performed, description, order_id, date, created_at')
        .eq('business_id', businessId)
        .in('order_id', projectIds)
        .order('date', { ascending: false })
        .limit(20)

      if (logErr) console.error('[timeline] byggdagbok:', logErr.message)

      for (const le of logEntries || []) {
        const proj = (projects || []).find((p: any) => p.id === le.order_id)
        const text = le.work_performed || le.description || null
        events.push({
          id: `plog_${le.id}`,
          type: 'project_log',
          title: `Byggdagbok: ${proj?.name || 'Projekt'}`,
          description: text ? String(text).substring(0, 150) : null,
          timestamp: le.date || le.created_at,
          metadata: { project_id: le.order_id },
        })
      }
    }
  }

  // ── 12. deals — Pipeline-händelser ──────────────────────────
  if (filter === 'all' || filter === 'leads') {
    const { data: dealRows } = await supabase
      .from('deal')
      .select('id, title, deal_number, stage_id, value, created_at, stage:pipeline_stage(name)')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(10)

    for (const d of dealRows || []) {
      events.push({
        id: `deal_${d.id}`,
        type: 'deal_created',
        title: `Ärende #${d.deal_number || d.id.slice(0, 6)} skapat`,
        description: `${d.title}${d.value ? ` — ${formatSEK(d.value)}` : ''}`,
        timestamp: d.created_at,
        metadata: { deal_id: d.id, deal_number: d.deal_number, stage: (d.stage as any)?.name, value: d.value },
      })
    }

    // Pipeline activity log
    const dealIds = (dealRows || []).map((d: any) => d.id)
    if (dealIds.length > 0) {
      // Kolumnerna heter `from_stage_id`/`to_stage_id`/`description`
      // (sql/pipeline.sql:52). Frågan bad om `from_stage`/`to_stage`/`note`
      // och gav 42703 — pipeline-händelser har aldrig synts i timelinen.
      //
      // Stegnamnen hämtas separat i stället för som embed. En embed hade krävt
      // en FK som inte är bekräftat körd i prod, och en PGRST200 hade fällt
      // frågan lika tyst som den bugg som just rättades här.
      const [actsRes, stagesRes] = await Promise.all([
        supabase
          .from('pipeline_activity')
          .select('id, deal_id, from_stage_id, to_stage_id, description, created_at')
          .in('deal_id', dealIds)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('pipeline_stage')
          .select('id, name')
          .eq('business_id', businessId),
      ])

      if (actsRes.error) console.error('[timeline] ärendehändelser:', actsRes.error.message)

      const stegNamn = new Map<string, string>(
        (stagesRes.data || []).map((s: any) => [s.id, s.name]),
      )

      for (const pa of actsRes.data || []) {
        // Bara faktiska stegbyten är en "flytt". Övriga aktiviteter saknar
        // stegfält och ska inte renderas som "? → ?".
        if (!pa.from_stage_id && !pa.to_stage_id) continue
        const fran = stegNamn.get(pa.from_stage_id) || 'Nytt'
        const till = stegNamn.get(pa.to_stage_id) || 'Okänt steg'
        events.push({
          id: `pa_${pa.id}`,
          type: 'pipeline_stage_changed',
          title: `Ärende flyttat: ${fran} → ${till}`,
          description: pa.description || null,
          timestamp: pa.created_at,
          metadata: { deal_id: pa.deal_id, from_stage: fran, to_stage: till },
        })
      }
    }
  }

  // ── 13. customer_fact — Bekräftade kundfakta ────────────────────
  // Customer Facts V1 (2026-08-12). Egen try/catch: tabellen skapas av
  // sql/v122 (körs senare) — en saknad tabell ska bara tömma den här
  // sektionen av tidslinjen, aldrig hela svaret.
  if (filter === 'all' || filter === 'facts') {
    try {
      const { data: facts, error: factsErr } = await supabase
        .from('customer_fact')
        .select('id, fact_type, content, evidence_quote, created_at, confirmed_at')
        .eq('business_id', businessId)
        .eq('customer_id', customerId)
        .is('superseded_by', null)
        .order('created_at', { ascending: false })
        .limit(20)

      if (factsErr) {
        console.error('[timeline] kundfakta:', factsErr.message)
      } else {
        for (const f of facts || []) {
          events.push({
            id: `fact_${f.id}`,
            type: 'customer_fact_confirmed',
            title: 'Kundfakta bekräftad',
            description: f.content,
            timestamp: f.confirmed_at || f.created_at,
            metadata: { fact_type: f.fact_type, evidence_quote: f.evidence_quote },
          })
        }
      }
    } catch (err) {
      console.error('[timeline] kundfakta oväntat fel:', err)
    }
  }

  // ── Deduplicate, sort, paginate ───────────────────────────────
  const authoritativeSmsRows = events.filter(event => event.metadata.source === 'sms_log')
  const withoutMirroredSms = events.filter(event => {
    if (event.metadata.role !== 'assistant' || event.type !== 'sms_sent') return true
    return !authoritativeSmsRows.some(logged => (
      logged.description === event.description
      && Math.abs(new Date(logged.timestamp).getTime() - new Date(event.timestamp).getTime()) < 120_000
    ))
  })

  // Deduplicate by id
  const seen = new Set<string>()
  const unique = withoutMirroredSms.filter(e => {
    if (seen.has(e.id)) return false
    seen.add(e.id)
    return true
  })

  // Sort by timestamp descending
  unique.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  // Projektet sätts först när ett explicit id eller en verifierad relationskedja
  // pekar på ett av kundens projekt i samma företag.
  const enriched = unique.map(event => ({
    ...event,
    project: resolveTimelineProject(event.metadata, projectContext),
  }))

  // Paginate
  const total = enriched.length
  const paginated = enriched.slice(offset, offset + limit)

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

function smsRelationMetadata(
  messageType: string | null,
  relatedId: string | null,
): Record<string, string> {
  if (!messageType || !relatedId) return {}
  if (messageType === 'quote' || messageType === 'quote_nudge' || messageType === 'quote_expiry_nudge') {
    return { quote_id: relatedId }
  }
  if (messageType === 'invoice' || messageType === 'invoice_reminder') {
    return { invoice_id: relatedId }
  }
  if (messageType === 'booking_confirmation' || messageType === 'booking_reminder' || messageType === 'reschedule') {
    return { booking_id: relatedId }
  }
  if (messageType.startsWith('project_stage_')) return { project_id: relatedId }
  return {}
}
