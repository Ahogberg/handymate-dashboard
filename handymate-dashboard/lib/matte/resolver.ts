/**
 * Matte Resolver — Vem är det? Vilket projekt?
 * Tar avsändarens telefon/e-post och returnerar all relevant kontext.
 */

import { getServerSupabase } from '@/lib/supabase'
import { findCustomerByPhone, phoneCandidates } from '@/lib/voice/find-customer-by-phone'

export interface ResolvedEntity {
  type: 'known_customer' | 'known_lead' | 'unknown'
  customerId?: string
  leadId?: string
  customerName?: string
  phone?: string
  email?: string
  activeProjects: {
    id: string
    title: string
    status: string
    scheduledStart?: string
  }[]
  activeDeals: {
    id: string
    title: string
    pipelineStage: string
    estimatedValue?: number
  }[]
  recentInvoices: {
    id: string
    number: string
    amount: number
    status: string
    dueDate: string
  }[]
  conversationHistory: {
    direction: 'in' | 'out'
    body: string
    timestamp: string
    channel: 'sms' | 'email' | 'portal' | 'call'
  }[]
  // Customer Facts V1 (2026-08-12): godkända kundfakta ur möten
  // (customer_fact, superseded_by IS NULL). Tom array för leads/okänd —
  // fakta är alltid kundknutna.
  confirmedFacts: { fact_type: string; content: string }[]
}

/**
 * Parsea ut ren e-postadress från "Name <email@domain.com>" format.
 */
function extractCleanEmail(from: string): string {
  const match = from.match(/<([^>]+)>/)
  return match ? match[1].toLowerCase() : from.toLowerCase().trim()
}

export async function resolveEntity(
  from: string,
  businessId: string
): Promise<ResolvedEntity> {
  const supabase = getServerSupabase()
  const isPhone = from.startsWith('+') || /^\d/.test(from)
  const cleanFrom = isPhone ? from : extractCleanEmail(from)

  // ── Steg 1: Hitta entitet ──

  let customerId: string | undefined
  let leadId: string | undefined
  let customerName: string | undefined

  if (isPhone) {
    // Kundminne-revisionen (2026-09-02, gap 2): ett rått .eq(phone_number,
    // cleanFrom) missade kunder vars sparade nummer inte var exakt samma
    // sträng som avsändarens (E.164 vs "070-123 45 67"). Den delade
    // findCustomerByPhone gör samma jobb som samtalsvägen redan gör.
    let customer: { customer_id: string; name: string | null } | null = null
    try {
      customer = await findCustomerByPhone(supabase, businessId, cleanFrom)
    } catch (lookupErr) {
      console.error('[matte/resolver] kundmatchning på telefonnummer misslyckades (fail-soft):', lookupErr)
    }

    if (customer) {
      customerId = customer.customer_id
      customerName = customer.name || undefined
    } else {
      const leadCandidates = phoneCandidates(cleanFrom)
      const { data: lead } = leadCandidates.length > 0
        ? await supabase
            .from('leads')
            .select('lead_id, name')
            .eq('business_id', businessId)
            .in('phone', leadCandidates)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null }

      if (lead) {
        leadId = lead.lead_id
        customerName = lead.name || undefined
      }
    }
  } else {
    const { data: customer } = await supabase
      .from('customer')
      .select('customer_id, name')
      .eq('business_id', businessId)
      .eq('email', cleanFrom)
      .maybeSingle()

    if (customer) {
      customerId = customer.customer_id
      customerName = customer.name
    } else {
      const { data: lead } = await supabase
        .from('leads')
        .select('lead_id, name')
        .eq('business_id', businessId)
        .eq('email', cleanFrom)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lead) {
        leadId = lead.lead_id
        customerName = lead.name || undefined
      }
    }
  }

  const type = customerId ? 'known_customer' : leadId ? 'known_lead' : 'unknown'

  if (type === 'unknown') {
    return {
      type: 'unknown',
      phone: isPhone ? cleanFrom : undefined,
      email: isPhone ? undefined : cleanFrom,
      activeProjects: [],
      activeDeals: [],
      recentInvoices: [],
      conversationHistory: [],
      confirmedFacts: [],
    }
  }

  // ── Steg 2: Hämta kontext parallellt ──

  const [projects, deals, invoices, smsHistory, emailHistory, portalHistory, customerFacts, callHistory] = await Promise.all([
    customerId
      ? supabase
          .from('booking')
          .select('booking_id, notes, status, scheduled_start')
          .eq('business_id', businessId)
          .eq('customer_id', customerId)
          .not('status', 'eq', 'cancelled')
          // Sanering 2026-08-05: booking.status blir aldrig 'completed' —
          // avslut markeras i job_status (complete-job-routen). Det gamla
          // filtret var dött → avslutade jobb listades som aktiva i Mattes
          // kontext. or-formen behövs: neq exkluderar null i SQL-semantik.
          .or('job_status.is.null,job_status.neq.completed')
          .order('scheduled_start', { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] as any[] }),

    supabase
      .from('leads')
      // Sanering 2026-08-05: kolumnen heter pipeline_stage_key — det gamla
      // namnet pipeline_stage fällde hela queryn → Mattes deal-kontext var
      // alltid tom. ('completed' i status-filtret var också dött — CHECK:en
      // har bara new/contacted/qualified/quote_sent/won/lost.)
      .select('lead_id, job_type, status, pipeline_stage_key, estimated_value')
      .eq('business_id', businessId)
      .eq(customerId ? 'customer_id' : 'lead_id', (customerId ?? leadId)!)
      .not('status', 'in', '("won","lost")')
      .order('created_at', { ascending: false })
      .limit(3),

    customerId
      ? supabase
          .from('invoice')
          .select('invoice_id, invoice_number, total, status, due_date')
          .eq('business_id', businessId)
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] as any[] }),

    isPhone
      ? supabase
          .from('sms_conversation')
          .select('role, content, created_at')
          .eq('business_id', businessId)
          .eq('phone_number', cleanFrom)
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] as any[] }),

    // E-posthistorik (kontextrevisionen 2026-08-16, fynd 2): channel:'email'
    // var deklarerad i typen men frågan fanns aldrig — Mattes e-post-
    // intelligens körde på VARJE inkommande mejl med tom historik trots att
    // brödtexterna låg sparade i email_conversations. Nu läses de senaste 10
    // mejlen (båda riktningar — direction-kolumnen skiljer dem åt).
    !isPhone
      ? supabase
          .from('email_conversations')
          .select('direction, subject, body_text, received_at')
          .eq('business_id', businessId)
          .eq('from_email', cleanFrom)
          .order('received_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] as any[] }),

    // Portal-tråden (kontextrevisionen 2026-08-16, fynd 5): customer_message
    // fångades väl men lästes av NOLL kontextkonsumenter — en kund som
    // frågade något i portalen och sedan följde upp via SMS/mejl mötte en
    // Matte utan portal-halvan av dialogen.
    customerId
      ? supabase
          .from('customer_message')
          .select('direction, message, created_at')
          .eq('business_id', businessId)
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] as any[] }),

    // Customer Facts V1: senaste 10 icke-ersatta godkända fakta för kunden.
    // Fail-safe genom formen — Supabase returnerar {data:null, error} om
    // tabellen inte finns än (sql/v122 körs senare), och (customerFacts.data
    // || []) längre ner ger tom lista i stället för att kasta.
    customerId
      ? supabase
          .from('customer_fact')
          .select('fact_type, content')
          .eq('business_id', businessId)
          .eq('customer_id', customerId)
          .is('superseded_by', null)
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] as any[] }),

    // Kundminne-revisionen (2026-09-02, gap 3): resolvern läste aldrig
    // samtal — Mattes SMS/mejl-intelligens agerade utan att veta vad kunden
    // sagt i telefon. Bara sammanfattade, transkriberade samtal räknas.
    // Fail-soft: fel på frågan hanteras nedan (tom lista + console.warn),
    // aldrig kastat.
    customerId
      ? supabase
          .from('call_recording')
          .select('recording_id, transcript_summary, created_at, direction')
          .eq('business_id', businessId)
          .eq('customer_id', customerId)
          .not('transcript_summary', 'is', null)
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as any[] }),
  ])

  if ((callHistory as { error?: { message: string } }).error) {
    console.warn(
      '[matte/resolver] samtalshistorik kunde inte hämtas (fail-soft):',
      (callHistory as { error?: { message: string } }).error!.message,
    )
  }

  return {
    type,
    customerId,
    leadId,
    customerName,
    phone: isPhone ? cleanFrom : undefined,
    email: isPhone ? undefined : cleanFrom,
    activeProjects: (projects.data || []).map((b: any) => ({
      id: b.booking_id,
      title: b.notes || 'Bokning',
      status: b.status,
      scheduledStart: b.scheduled_start,
    })),
    activeDeals: (deals.data || []).map((l: any) => ({
      id: l.lead_id,
      title: l.job_type || 'Ärende',
      pipelineStage: l.pipeline_stage_key || l.status,
      estimatedValue: l.estimated_value,
    })),
    recentInvoices: (invoices.data || []).map((i: any) => ({
      id: i.invoice_id,
      number: i.invoice_number,
      amount: i.total,
      status: i.status,
      dueDate: i.due_date,
    })),
    // Alla tre kanaler sammanflätade kronologiskt (äldst först — samma
    // ordning som den gamla SMS-enkanaliga listan hade efter .reverse()).
    conversationHistory: [
      ...(smsHistory.data || []).map((m: any) => ({
        direction: m.role === 'user' ? 'in' as const : 'out' as const,
        body: m.content as string,
        timestamp: m.created_at as string,
        channel: 'sms' as const,
      })),
      ...(emailHistory.data || []).map((m: any) => ({
        direction: m.direction === 'outbound' ? 'out' as const : 'in' as const,
        body: [m.subject, m.body_text].filter(Boolean).join(' — ') as string,
        timestamp: m.received_at as string,
        channel: 'email' as const,
      })),
      ...(portalHistory.data || []).map((m: any) => ({
        direction: m.direction === 'outbound' ? 'out' as const : 'in' as const,
        body: m.message as string,
        timestamp: m.created_at as string,
        channel: 'portal' as const,
      })),
      ...(callHistory.data || []).map((c: any) => ({
        direction: c.direction === 'outbound' ? 'out' as const : 'in' as const,
        body: c.transcript_summary as string,
        timestamp: c.created_at as string,
        channel: 'call' as const,
      })),
    ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    confirmedFacts: (customerFacts.data || []).map((f: any) => ({
      fact_type: f.fact_type,
      content: f.content,
    })),
  }
}
