/**
 * Matte Resolver — Vem är det? Vilket projekt?
 * Tar avsändarens telefon/e-post och returnerar all relevant kontext.
 */

import { getServerSupabase } from '@/lib/supabase'

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
    channel: 'sms' | 'email'
  }[]
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
    const { data: customer } = await supabase
      .from('customer')
      .select('customer_id, name')
      .eq('business_id', businessId)
      .eq('phone_number', cleanFrom)
      .maybeSingle()

    if (customer) {
      customerId = customer.customer_id
      customerName = customer.name
    } else {
      const { data: lead } = await supabase
        .from('leads')
        .select('lead_id, name')
        .eq('business_id', businessId)
        .eq('phone', cleanFrom)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

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
    }
  }

  // ── Steg 2: Hämta kontext parallellt ──

  const [projects, deals, invoices, smsHistory] = await Promise.all([
    customerId
      ? supabase
          .from('booking')
          .select('booking_id, notes, status, scheduled_start')
          .eq('business_id', businessId)
          .eq('customer_id', customerId)
          .not('status', 'eq', 'cancelled')
          .not('status', 'eq', 'completed')
          .order('scheduled_start', { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] as any[] }),

    supabase
      .from('leads')
      .select('lead_id, job_type, status, pipeline_stage, estimated_value')
      .eq('business_id', businessId)
      .eq(customerId ? 'customer_id' : 'lead_id', (customerId ?? leadId)!)
      .not('status', 'in', '("won","lost","completed")')
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
  ])

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
      pipelineStage: l.pipeline_stage || l.status,
      estimatedValue: l.estimated_value,
    })),
    recentInvoices: (invoices.data || []).map((i: any) => ({
      id: i.invoice_id,
      number: i.invoice_number,
      amount: i.total,
      status: i.status,
      dueDate: i.due_date,
    })),
    conversationHistory: (smsHistory.data || [])
      .reverse()
      .map((m: any) => ({
        direction: m.role === 'user' ? 'in' as const : 'out' as const,
        body: m.content,
        timestamp: m.created_at,
        channel: 'sms' as const,
      })),
  }
}
