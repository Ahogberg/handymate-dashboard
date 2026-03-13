// Tool router for Next.js runtime
// Executes tools against Supabase using the server-side client

import { SupabaseClient } from '@supabase/supabase-js'
import { getCalendarEvents, createGoogleEvent } from '@/lib/google-calendar'
import { getCustomerEmails, sendGmailEmail } from '@/lib/gmail'
import { getNextCustomerNumber, getNextProjectNumber } from '@/lib/numbering'

interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

interface GoogleConnection {
  access_token: string
  refresh_token: string
  token_expires_at: string | null
  calendar_id: string
  account_email: string
  gmail_scope_granted: boolean
  gmail_send_scope_granted: boolean
  gmail_sync_enabled: boolean
  sync_enabled: boolean
}

interface ToolContext {
  businessName: string
  contactEmail: string
  googleConnection: GoogleConnection | null
}

function generateId(prefix: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = prefix + '_'
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  supabase: SupabaseClient,
  businessId: string,
  context: ToolContext
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'get_customer':
        return await getCustomer(supabase, businessId, input)
      case 'search_customers':
        return await searchCustomers(supabase, businessId, input)
      case 'create_customer':
        return await createCustomer(supabase, businessId, input)
      case 'update_customer':
        return await updateCustomer(supabase, businessId, input)
      case 'create_quote':
        return await createQuote(supabase, businessId, input)
      case 'get_quotes':
        return await getQuotes(supabase, businessId, input)
      case 'create_invoice':
        return await createInvoice(supabase, businessId, input)
      case 'check_calendar':
        return await checkCalendar(supabase, businessId, input, context)
      case 'create_booking':
        return await createBooking(supabase, businessId, input, context)
      case 'update_project':
        return await updateProject(supabase, businessId, input)
      case 'log_time':
        return await logTime(supabase, businessId, input)
      case 'send_sms':
        return await sendSms(supabase, businessId, input, context)
      case 'send_email':
        return await sendEmail(input, context)
      case 'read_customer_emails':
        return await readCustomerEmails(input, context)
      case 'qualify_lead':
        return await qualifyLead(supabase, businessId, input)
      case 'update_lead_status':
        return await updateLeadStatus(supabase, businessId, input)
      case 'get_lead':
        return await getLeadTool(supabase, businessId, input)
      case 'search_leads':
        return await searchLeads(supabase, businessId, input)
      case 'get_daily_stats':
        return await getDailyStats(supabase, businessId, input)
      case 'create_approval_request':
        return await createApprovalRequest(supabase, businessId, input)
      case 'check_pending_approvals':
        return await checkPendingApprovals(supabase, businessId)
      case 'update_business_preference':
        return await updateBusinessPreference(supabase, businessId, input)
      case 'get_automation_settings':
        return await getAutomationSettings(supabase, businessId)
      case 'log_automation_action':
        return await logAutomationAction(supabase, businessId, input)
      default:
        return { success: false, error: `Okänt verktyg: ${name}` }
    }
  } catch (err: any) {
    return { success: false, error: `Tool error (${name}): ${err.message}` }
  }
}

// ── CRM ─────────────────────────────────────────────────

async function getCustomer(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('customer')
    .select('customer_id, name, phone_number, email, address_line, customer_rating, created_at')
    .eq('business_id', businessId)
    .eq('customer_id', params.customer_id)
    .single()

  if (error) return { success: false, error: `Kunden hittades inte: ${error.message}` }

  const { data: bookings } = await supabase
    .from('booking')
    .select('booking_id, scheduled_start, scheduled_end, status, notes')
    .eq('customer_id', params.customer_id as string)
    .eq('business_id', businessId)
    .order('scheduled_start', { ascending: false })
    .limit(5)

  return { success: true, data: { ...data, recent_bookings: bookings || [] } }
}

async function searchCustomers(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const query = (params.query as string).trim()
  if (query.length < 2) return { success: false, error: 'Söktermen måste vara minst 2 tecken' }

  const { data, error } = await supabase
    .from('customer')
    .select('customer_id, name, phone_number, email, address_line')
    .eq('business_id', businessId)
    .or(`name.ilike.%${query}%,phone_number.ilike.%${query}%,email.ilike.%${query}%`)
    .limit((params.limit as number) || 10)

  if (error) return { success: false, error: error.message }
  return { success: true, data: { count: data.length, customers: data } }
}

async function createCustomer(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const { data: existing } = await supabase
    .from('customer')
    .select('customer_id, name')
    .eq('business_id', businessId)
    .eq('phone_number', params.phone_number as string)
    .single()

  if (existing) {
    return { success: false, error: `Kund med detta nummer finns redan: ${existing.name} (${existing.customer_id})` }
  }

  const customerId = generateId('cust')
  const customerNumber = await getNextCustomerNumber(supabase, businessId)
  const { error } = await supabase.from('customer').insert({
    customer_id: customerId,
    business_id: businessId,
    name: params.name,
    phone_number: params.phone_number,
    email: params.email || null,
    address_line: params.address_line || null,
    customer_number: customerNumber,
    created_at: new Date().toISOString(),
  })

  if (error) return { success: false, error: error.message }
  return { success: true, data: { customer_id: customerId, customer_number: customerNumber, message: `Kund "${params.name}" skapad (${customerNumber})` } }
}

async function updateCustomer(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const { customer_id, ...updates } = params
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) { if (v !== undefined) clean[k] = v }

  if (Object.keys(clean).length === 0) return { success: false, error: 'Inga fält att uppdatera' }

  const { data, error } = await supabase
    .from('customer').update(clean)
    .eq('business_id', businessId).eq('customer_id', customer_id)
    .select().single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: { message: `Kund uppdaterad`, customer: data } }
}

// ── Operations ──────────────────────────────────────────

async function createQuote(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const items = (params.items as any[]).map(i => ({ ...i, total: i.quantity * i.unit_price }))
  const laborTotal = items.filter(i => i.type === 'labor').reduce((s, i) => s + i.total, 0)
  const materialTotal = items.filter(i => i.type === 'material').reduce((s, i) => s + i.total, 0)
  const subtotal = laborTotal + materialTotal

  // Fetch VAT rate from business_config (default 25%)
  const { data: bizVat } = await supabase
    .from('business_config').select('default_vat_rate, pricing_settings')
    .eq('business_id', businessId).single()
  const vatRate = bizVat?.default_vat_rate ?? bizVat?.pricing_settings?.vat_rate ?? 25
  const vatAmount = Math.round(subtotal * (vatRate / 100))
  const total = subtotal + vatAmount

  let rotRutDeduction = 0
  if (params.rot_rut_type === 'rot') rotRutDeduction = Math.min(laborTotal * 0.3, 50000)
  if (params.rot_rut_type === 'rut') rotRutDeduction = Math.min(laborTotal * 0.5, 75000)

  const validUntil = new Date()
  validUntil.setDate(validUntil.getDate() + ((params.valid_days as number) || 30))

  const quoteId = generateId('quote')
  const { error } = await supabase.from('quotes').insert({
    quote_id: quoteId, business_id: businessId, customer_id: params.customer_id,
    title: params.title, status: 'draft', items: JSON.stringify(items),
    labor_total: laborTotal, material_total: materialTotal,
    subtotal, vat_rate: vatRate, vat_amount: vatAmount, total,
    rot_rut_type: params.rot_rut_type || null,
    rot_rut_deduction: rotRutDeduction, customer_pays: total - rotRutDeduction,
    valid_until: validUntil.toISOString(), created_at: new Date().toISOString(),
  })

  if (error) return { success: false, error: error.message }
  return { success: true, data: {
    quote_id: quoteId, message: `Offert "${params.title}" skapad`,
    summary: {
      labor_total: laborTotal, material_total: materialTotal,
      subtotal_ex_vat: subtotal, vat_rate: vatRate, vat_amount: vatAmount, total_incl_vat: total,
      rot_rut_deduction: rotRutDeduction, customer_pays: total - rotRutDeduction,
    }
  }}
}

async function getQuotes(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  let q = supabase.from('quotes')
    .select('quote_id, customer_id, title, status, total, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit((params.limit as number) || 20)

  if (params.customer_id) q = q.eq('customer_id', params.customer_id as string)
  if (params.status) q = q.eq('status', params.status as string)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }
  return { success: true, data: { count: data.length, quotes: data } }
}

async function createInvoice(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  let items: any[] = []
  let rotRutType = params.rot_rut_type as string | null

  if (params.quote_id) {
    const { data: quote } = await supabase.from('quotes')
      .select('items, rot_rut_type')
      .eq('business_id', businessId).eq('quote_id', params.quote_id).single()
    if (!quote) return { success: false, error: 'Offerten hittades inte' }
    items = typeof quote.items === 'string' ? JSON.parse(quote.items) : quote.items
    rotRutType = rotRutType || quote.rot_rut_type
  } else if (params.items) {
    items = (params.items as any[]).map(i => ({ ...i, total: i.quantity * i.unit_price }))
  } else {
    return { success: false, error: 'Ange quote_id eller items' }
  }

  const subtotal = items.reduce((s: number, i: any) => s + (i.total || i.quantity * i.unit_price), 0)

  // Fetch VAT rate from business_config (default 25%)
  const { data: bizVat } = await supabase
    .from('business_config').select('default_vat_rate, pricing_settings')
    .eq('business_id', businessId).single()
  const vatRate = bizVat?.default_vat_rate ?? bizVat?.pricing_settings?.vat_rate ?? 25
  const vatAmount = Math.round(subtotal * (vatRate / 100))
  const total = subtotal + vatAmount

  const laborTotal = items.filter((i: any) => i.type === 'labor').reduce((s: number, i: any) => s + (i.total || 0), 0)
  let rotRutDeduction = 0
  if (rotRutType === 'rot') rotRutDeduction = Math.min(laborTotal * 0.3, 50000)
  if (rotRutType === 'rut') rotRutDeduction = Math.min(laborTotal * 0.5, 75000)

  const year = new Date().getFullYear()
  const { count } = await supabase.from('invoice')
    .select('invoice_id', { count: 'exact', head: true })
    .eq('business_id', businessId).ilike('invoice_number', `${year}-%`)
  const invoiceNumber = `${year}-${String((count || 0) + 1).padStart(3, '0')}`

  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + ((params.due_days as number) || 30))

  const invoiceId = generateId('inv')
  const { error } = await supabase.from('invoice').insert({
    invoice_id: invoiceId, business_id: businessId, customer_id: params.customer_id,
    quote_id: params.quote_id || null, invoice_number: invoiceNumber, status: 'draft',
    items: JSON.stringify(items), subtotal, vat_rate: vatRate, vat_amount: vatAmount, total,
    rot_rut_type: rotRutType, rot_rut_deduction: rotRutDeduction, customer_pays: total - rotRutDeduction,
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: dueDate.toISOString().split('T')[0],
    created_at: new Date().toISOString(),
  })

  if (error) return { success: false, error: error.message }
  return { success: true, data: { invoice_id: invoiceId, invoice_number: invoiceNumber, message: `Faktura ${invoiceNumber} skapad`, total, customer_pays: total - rotRutDeduction } }
}

async function checkCalendar(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  // 1. Query Handymate bookings
  const { data: bookings, error } = await supabase.from('booking')
    .select('booking_id, customer_id, scheduled_start, scheduled_end, status, notes, google_event_id')
    .eq('business_id', businessId)
    .gte('scheduled_start', `${params.from_date}T00:00:00`)
    .lte('scheduled_start', `${params.to_date}T23:59:59`)
    .neq('status', 'cancelled')
    .order('scheduled_start', { ascending: true })

  if (error) return { success: false, error: error.message }

  // 2. Enrich with customer names
  const customerIds = Array.from(new Set((bookings || []).map((b: any) => b.customer_id)))
  let customerMap: Record<string, string> = {}
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('customer').select('customer_id, name').in('customer_id', customerIds)
    customerMap = Object.fromEntries(
      (customers || []).map((c: any) => [c.customer_id, c.name])
    )
  }

  const enrichedBookings = (bookings || []).map((b: any) => ({
    ...b,
    customer_name: customerMap[b.customer_id] || 'Okänd',
    source: 'handymate',
  }))

  // 3. Fetch Google Calendar events if connected
  let googleEvents: Array<{
    id: string; summary: string; description: string | null
    start: string; end: string; allDay: boolean; source: string
  }> = []

  if (context.googleConnection?.sync_enabled) {
    try {
      const fromDate = new Date(`${params.from_date}T00:00:00`)
      const toDate = new Date(`${params.to_date}T23:59:59`)
      const gEvents = await getCalendarEvents(
        context.googleConnection.access_token,
        context.googleConnection.calendar_id || 'primary',
        fromDate, toDate
      )

      // Deduplicate: exclude Google events already linked to a booking
      const syncedIds = new Set(
        (bookings || []).filter((b: any) => b.google_event_id).map((b: any) => b.google_event_id)
      )

      googleEvents = gEvents
        .filter(e => !syncedIds.has(e.id))
        .map(e => ({
          id: e.id,
          summary: e.summary,
          description: e.description,
          start: e.start.toISOString(),
          end: e.end.toISOString(),
          allDay: e.allDay,
          source: 'google_calendar',
        }))
    } catch (err: any) {
      console.error('[checkCalendar] Google Calendar error:', err.message)
    }
  }

  return {
    success: true,
    data: {
      period: `${params.from_date} – ${params.to_date}`,
      booking_count: enrichedBookings.length,
      google_event_count: googleEvents.length,
      bookings: enrichedBookings,
      google_events: googleEvents,
      google_calendar_connected: !!context.googleConnection?.sync_enabled,
    },
  }
}

async function createBooking(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const bookingId = generateId('book')
  const { error } = await supabase.from('booking').insert({
    booking_id: bookingId, business_id: businessId, customer_id: params.customer_id,
    scheduled_start: params.scheduled_start,
    scheduled_end: params.scheduled_end, status: 'pending',
    notes: [params.service_type, params.notes].filter(Boolean).join(' — ') || null,
    created_at: new Date().toISOString(),
  })

  if (error) return { success: false, error: error.message }

  // Sync to Google Calendar if connected
  let googleEventId: string | null = null
  if (context.googleConnection?.sync_enabled) {
    try {
      const { data: customer } = await supabase
        .from('customer').select('name, address_line, phone_number')
        .eq('customer_id', params.customer_id as string).single()

      const customerName = customer?.name || 'Kund'
      const summary = `${params.service_type} – ${customerName}`
      const description = [
        `Bokning: ${bookingId}`,
        `Kund: ${customerName}`,
        customer?.phone_number ? `Tel: ${customer.phone_number}` : '',
        customer?.address_line ? `Adress: ${customer.address_line}` : '',
        `Tjänst: ${params.service_type}`,
        params.notes ? `Anteckningar: ${params.notes}` : '',
      ].filter(Boolean).join('\n')

      googleEventId = await createGoogleEvent(
        context.googleConnection.access_token,
        context.googleConnection.calendar_id || 'primary',
        {
          summary,
          description,
          start: new Date(params.scheduled_start as string),
          end: new Date(params.scheduled_end as string),
        }
      )

      if (googleEventId) {
        await supabase.from('booking').update({
          google_event_id: googleEventId,
          synced_to_google_at: new Date().toISOString(),
        }).eq('booking_id', bookingId)
      }
    } catch (err: any) {
      console.error('[createBooking] Google Calendar sync error:', err.message)
    }
  }

  return { success: true, data: {
    booking_id: bookingId,
    message: `Bokning skapad: ${params.service_type}`,
    google_synced: !!googleEventId,
    google_event_id: googleEventId,
  }}
}

async function updateProject(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const updates: Record<string, unknown> = {}
  if (params.status) updates.status = params.status
  if (params.notes) updates.notes = params.notes

  const { data, error } = await supabase.from('booking')
    .update(updates).eq('business_id', businessId).eq('booking_id', params.booking_id)
    .select().single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: { message: 'Bokning uppdaterad', booking: data } }
}

async function logTime(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const [sH, sM] = (params.start_time as string).split(':').map(Number)
  const [eH, eM] = (params.end_time as string).split(':').map(Number)
  const duration = (eH * 60 + eM) - (sH * 60 + sM)
  if (duration <= 0) return { success: false, error: 'Sluttid måste vara efter starttid' }

  const { data: config } = await supabase.from('business_config')
    .select('pricing_settings').eq('business_id', businessId).single()
  const rate = config?.pricing_settings?.hourly_rate || 695

  const entryId = generateId('time')
  const { error } = await supabase.from('time_entry').insert({
    time_entry_id: entryId, business_id: businessId,
    booking_id: params.booking_id || null, customer_id: params.customer_id,
    work_date: params.work_date, start_time: params.start_time, end_time: params.end_time,
    duration_minutes: duration, description: params.description || null,
    hourly_rate: rate, is_billable: params.is_billable !== false,
    created_at: new Date().toISOString(),
  })

  if (error) return { success: false, error: error.message }
  return { success: true, data: { time_entry_id: entryId, duration_minutes: duration, message: `${(duration/60).toFixed(1)} timmar loggade` } }
}

// ── Communications ──────────────────────────────────────

async function sendSms(
  supabase: SupabaseClient, businessId: string,
  params: Record<string, unknown>, context: { businessName: string }
): Promise<ToolResult> {
  const to = params.to as string
  const message = params.message as string

  if (!to.startsWith('+')) return { success: false, error: 'Telefonnumret måste börja med +46' }
  if (message.length > 1600) return { success: false, error: `Meddelandet är ${message.length} tecken (max 1600)` }

  // Night block: queue SMS for 08:00 next morning (skip if DISABLE_SMS_NIGHT_BLOCK is set)
  const now = new Date()
  const swedenHour = parseInt(
    new Intl.DateTimeFormat('sv-SE', { hour: 'numeric', hour12: false, timeZone: 'Europe/Stockholm' }).format(now)
  )
  if ((swedenHour >= 21 || swedenHour < 8) && !process.env.DISABLE_SMS_NIGHT_BLOCK) {
    // Calculate next 08:00 Stockholm time
    const stockholm = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now) // "YYYY-MM-DD"
    const [y, m, d] = stockholm.split('-').map(Number)
    // If before 08:00 → today at 08:00, otherwise → tomorrow at 08:00
    const sendDate = swedenHour < 8 ? new Date(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T08:00:00+01:00`)
      : new Date(`${y}-${String(m).padStart(2,'0')}-${String(d + 1).padStart(2,'0')}T08:00:00+01:00`)
    const sendAfter = sendDate.toISOString()

    const queueId = 'smq_' + Math.random().toString(36).substring(2, 14)
    const senderName = (context.businessName || 'Handymate').substring(0, 11)
    await supabase.from('sms_queue').insert({
      queue_id: queueId, business_id: businessId,
      phone_to: to, sender_name: senderName, message,
      send_after: sendAfter, status: 'queued', created_at: now.toISOString(),
    })

    console.log(`[SMS Queued] Nattspärr kl ${swedenHour}:xx → köat till ${sendAfter} → ${to}`)
    return { success: true, data: { queued: true, queue_id: queueId, send_after: sendAfter, message: `SMS köat — skickas ${swedenHour < 8 ? 'idag' : 'imorgon'} kl 08:00` } }
  }

  const elksUser = process.env.ELKS_API_USER!
  const elksPassword = process.env.ELKS_API_PASSWORD!
  const senderName = (context.businessName || 'Handymate').substring(0, 11)

  const response = await fetch('https://api.46elks.com/a1/sms', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${elksUser}:${elksPassword}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ from: senderName, to, message }),
  })

  const result = await response.json()
  if (!response.ok) return { success: false, error: `46elks-fel: ${result.message || response.statusText}` }

  // Log SMS
  await supabase.from('sms_log').insert({
    sms_id: 'sms_' + Math.random().toString(36).substring(2, 14),
    business_id: businessId, direction: 'outbound',
    phone_from: senderName, phone_to: to, message,
    status: 'sent', elks_id: result.id, created_at: new Date().toISOString(),
  }).catch(() => {})

  // Also log to sms_conversation for conversation history continuity
  await supabase.from('sms_conversation').insert({
    business_id: businessId,
    phone_number: to,
    role: 'assistant',
    content: message,
    created_at: new Date().toISOString(),
  }).catch(() => {})

  return { success: true, data: { message: `SMS skickat till ${to}`, sms_id: result.id } }
}

async function sendEmail(
  params: Record<string, unknown>, context: ToolContext
): Promise<ToolResult> {
  // Prefer Gmail API if connected with send scope
  if (context.googleConnection?.gmail_send_scope_granted && context.googleConnection?.gmail_sync_enabled) {
    try {
      const result = await sendGmailEmail(
        context.googleConnection.access_token,
        { to: params.to as string, subject: params.subject as string, body: params.body as string }
      )
      return { success: true, data: {
        message: `E-post skickad via Gmail till ${params.to}`,
        message_id: result.messageId, thread_id: result.threadId, sent_via: 'gmail',
      }}
    } catch (err: any) {
      console.error('[sendEmail] Gmail send failed, falling back to Resend:', err.message)
    }
  }

  // Fallback: Resend API
  const resendKey = process.env.RESEND_API_KEY!
  const from = context.contactEmail
    ? `${context.businessName} <${context.contactEmail}>`
    : `${context.businessName} <noreply@handymate.se>`

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from, to: params.to, subject: params.subject, text: params.body,
    }),
  })

  const result = await response.json()
  if (!response.ok) return { success: false, error: `E-postfel: ${result.message}` }
  return { success: true, data: { message: `E-post skickad till ${params.to}`, email_id: result.id, sent_via: 'resend' } }
}

// ── Gmail ────────────────────────────────────────────────

async function readCustomerEmails(
  params: Record<string, unknown>, context: ToolContext
): Promise<ToolResult> {
  if (!context.googleConnection?.gmail_scope_granted || !context.googleConnection?.gmail_sync_enabled) {
    return { success: false, error: 'Gmail är inte anslutet eller aktiverat' }
  }

  const customerEmail = params.customer_email as string
  if (!customerEmail || !customerEmail.includes('@')) {
    return { success: false, error: 'Ogiltig e-postadress' }
  }

  try {
    const threads = await getCustomerEmails(
      context.googleConnection.access_token,
      customerEmail,
      (params.max_results as number) || 10
    )

    return { success: true, data: {
      customer_email: customerEmail,
      thread_count: threads.length,
      threads: threads.map(t => ({
        threadId: t.threadId, subject: t.subject, snippet: t.snippet,
        from: t.from, date: t.date, messageCount: t.messageCount, isUnread: t.isUnread,
      })),
    }}
  } catch (err: any) {
    return { success: false, error: `Gmail-fel: ${err.message}` }
  }
}

// ── Pipeline ─────────────────────────────────────────────

async function qualifyLead(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const conversationId = params.conversation_id as string

  // Fetch conversation or call recording
  const { data: conversation } = await supabase
    .from('conversations')
    .select('*')
    .eq('business_id', businessId)
    .eq('conversation_id', conversationId)
    .single()

  let transcript = conversation?.content || ''
  let phone = (params.phone as string) || conversation?.phone_number || ''
  let contactName = (params.name as string) || ''
  let source = (params.source as string) || 'manual'

  if (!transcript) {
    const { data: recording } = await supabase
      .from('call_recording')
      .select('*')
      .eq('business_id', businessId)
      .eq('recording_id', conversationId)
      .single()
    if (recording) {
      transcript = recording.transcript || recording.transcript_summary || ''
      phone = phone || recording.phone_from || recording.phone_to || ''
      source = 'vapi_call'
    }
  }

  if (!transcript) return { success: false, error: 'Ingen transkription hittades' }

  // Fetch scoring rules
  const { data: rules } = await supabase
    .from('lead_scoring_rules')
    .select('*')
    .eq('business_id', businessId)
    .eq('enabled', true)

  const { data: existingLead } = await supabase
    .from('leads')
    .select('lead_id, score')
    .eq('business_id', businessId)
    .eq('conversation_id', conversationId)
    .single()

  // Score the lead
  const lowerTranscript = transcript.toLowerCase()
  const scoreReasons: Array<{ rule: string; points: number; matched: boolean }> = []
  let score = 0

  for (const rule of (rules || []) as any[]) {
    const condition = rule.condition?.type || ''
    let matched = false
    switch (condition) {
      case 'answered_call': matched = transcript.length > 50; break
      case 'specific_job': matched = /installera|reparera|byta|montera|fixa|laga|bygga|renovera|måla/i.test(lowerTranscript); break
      case 'urgency_mentioned': matched = /akut|bråttom|snabbt|omedelbart|idag|imorgon|snarast|läcker|kortslut/i.test(lowerTranscript); break
      case 'in_service_area': matched = /adress|gata|väg|området/i.test(lowerTranscript); break
      case 'returning_customer':
        if (phone) {
          const { data: cust } = await supabase.from('customer').select('customer_id').eq('business_id', businessId).eq('phone_number', phone).single()
          matched = !!cust
        }
        break
      case 'budget_mentioned': matched = /budget|pris|kosta|kronor|kr|tusen/i.test(lowerTranscript); break
      case 'unclear_request': matched = transcript.length < 30 && !/installera|reparera|byta|fixa/i.test(lowerTranscript); break
    }
    scoreReasons.push({ rule: rule.rule_name, points: rule.points, matched })
    if (matched) score += rule.points
  }

  score = Math.max(0, Math.min(100, score))

  let urgency: string = 'medium'
  if (/nödfall|akut omedelbart|kortslut|brand/i.test(lowerTranscript)) urgency = 'emergency'
  else if (/akut|bråttom|idag|snarast/i.test(lowerTranscript)) urgency = 'high'
  else if (/ingen brådska|när som helst/i.test(lowerTranscript)) urgency = 'low'

  let jobType = 'Okänt'
  const jobPatterns: Array<[RegExp, string]> = [
    [/elinstallation|elarbete|elsäkerhet|jordfelsbrytare/i, 'Elinstallation'],
    [/rör|vatten|avlopp|läck|kran|vvs/i, 'VVS/Rörarbete'],
    [/snickeri|bygga|renovera|kök|badrum/i, 'Renovering'],
    [/målning|måla|tapetser/i, 'Målning'],
    [/lås|inbrott|säkerhet/i, 'Låssmed'],
    [/städ|flytt|rengör/i, 'Städning'],
    [/värme|kyla|ventilation|värmepump/i, 'VVS/Värme'],
  ]
  for (const [pattern, type] of jobPatterns) {
    if (pattern.test(lowerTranscript)) { jobType = type; break }
  }

  let estimatedValue: number | null = null
  const priceMatch = lowerTranscript.match(/(\d+)\s*(tusen|tkr|000\s*kr)/i)
  if (priceMatch) estimatedValue = parseInt(priceMatch[1]) * 1000

  const now = new Date().toISOString()

  if (existingLead) {
    await supabase.from('leads').update({
      score, score_reasons: scoreReasons.filter(r => r.matched),
      urgency, job_type: jobType, estimated_value: estimatedValue, updated_at: now,
    }).eq('lead_id', existingLead.lead_id)

    await supabase.from('lead_activities').insert({
      activity_id: generateId('la'), lead_id: existingLead.lead_id, business_id: businessId,
      activity_type: 'score_updated', description: `Score uppdaterad: ${score}, urgency ${urgency}`,
      created_at: now,
    }).catch(() => {})

    return { success: true, data: { lead_id: existingLead.lead_id, action: 'updated', score, urgency, job_type: jobType, estimated_value: estimatedValue } }
  }

  const leadId = generateId('lead')
  const projectNumber = await getNextProjectNumber(supabase, businessId)
  const { error } = await supabase.from('leads').insert({
    lead_id: leadId, business_id: businessId, phone, name: contactName || null,
    source, status: 'new', score, score_reasons: scoreReasons.filter(r => r.matched),
    estimated_value: estimatedValue, job_type: jobType, urgency,
    conversation_id: conversationId, project_number: projectNumber, created_at: now, updated_at: now,
  })

  if (error) return { success: false, error: error.message }

  await supabase.from('lead_activities').insert({
    activity_id: generateId('la'), lead_id: leadId, business_id: businessId,
    activity_type: 'created', description: `Ny lead: ${contactName || phone || 'Okänd'} (${projectNumber}), score ${score}`,
    created_at: now,
  }).catch(() => {})

  // V3 Automation Engine: fire lead_created event
  try {
    const { fireEvent } = await import('@/lib/automation-engine')
    await fireEvent(supabase, 'lead_created', businessId, {
      lead_id: leadId, customer_name: contactName, phone, job_type: jobType,
      urgency, estimated_value: estimatedValue, source,
    })
  } catch { /* non-blocking */ }

  return { success: true, data: { lead_id: leadId, project_number: projectNumber, action: 'created', score, urgency, job_type: jobType, estimated_value: estimatedValue, message: `Lead skapad ${projectNumber} (score ${score})` } }
}

async function updateLeadStatus(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const updates: Record<string, unknown> = { status: params.status, updated_at: new Date().toISOString() }
  if (params.lost_reason) updates.lost_reason = params.lost_reason
  if (params.notes) updates.notes = params.notes
  if (params.customer_id) updates.customer_id = params.customer_id
  if (params.status === 'won') updates.converted_at = new Date().toISOString()

  const { data, error } = await supabase.from('leads').update(updates)
    .eq('lead_id', params.lead_id).eq('business_id', businessId).select().single()

  if (error) return { success: false, error: error.message }

  await supabase.from('lead_activities').insert({
    activity_id: generateId('la'), lead_id: params.lead_id as string, business_id: businessId,
    activity_type: 'status_changed', description: `Status → ${params.status}`,
    created_at: new Date().toISOString(),
  }).catch(() => {})

  return { success: true, data: { message: `Lead status → ${params.status}`, lead: data } }
}

async function getLeadTool(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const { data: lead, error } = await supabase.from('leads').select('*')
    .eq('lead_id', params.lead_id).eq('business_id', businessId).single()

  if (error) return { success: false, error: `Lead hittades inte: ${error.message}` }

  const { data: activities } = await supabase.from('lead_activities').select('*')
    .eq('lead_id', params.lead_id as string).order('created_at', { ascending: false }).limit(20)

  let customer = null
  if (lead.customer_id) {
    const { data: cust } = await supabase.from('customer').select('customer_id, name, phone_number, email')
      .eq('customer_id', lead.customer_id).single()
    customer = cust
  }

  return { success: true, data: { ...lead, activities: activities || [], customer } }
}

async function searchLeads(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  let q = supabase.from('leads')
    .select('lead_id, name, phone, status, score, urgency, job_type, estimated_value, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit((params.limit as number) || 20)

  if (params.status) q = q.eq('status', params.status as string)
  if (params.urgency) q = q.eq('urgency', params.urgency as string)
  if (params.min_score !== undefined) q = q.gte('score', params.min_score as number)
  if (params.max_score !== undefined) q = q.lte('score', params.max_score as number)
  if (params.job_type) q = q.ilike('job_type', `%${params.job_type}%`)
  if (params.from_date) q = q.gte('created_at', `${params.from_date}T00:00:00`)
  if (params.to_date) q = q.lte('created_at', `${params.to_date}T23:59:59`)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }
  return { success: true, data: { count: data.length, leads: data } }
}

// ── Stats ─────────────────────────────────────────────────

async function getDailyStats(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const date = (params.date as string) || new Date().toISOString().split('T')[0]
  const dayStart = `${date}T00:00:00`
  const dayEnd = `${date}T23:59:59`

  // Previous day for comparison
  const prevDate = new Date(date)
  prevDate.setDate(prevDate.getDate() - 1)
  const prevDateStr = prevDate.toISOString().split('T')[0]

  const [
    callsToday, smsInToday, smsOutToday,
    newCustomers, leadsToday, quotesToday,
    invoicesMonth, bookingsToday, timeEntriesToday,
    agentRuns, pendingQueue
  ] = await Promise.all([
    // Calls today
    supabase.from('call_recording').select('recording_id', { count: 'exact', head: true })
      .eq('business_id', businessId).gte('created_at', dayStart).lte('created_at', dayEnd),
    // Inbound SMS today
    supabase.from('sms_conversation').select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('role', 'user').gte('created_at', dayStart).lte('created_at', dayEnd),
    // Outbound SMS today
    supabase.from('sms_log').select('sms_id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('direction', 'outbound').gte('created_at', dayStart).lte('created_at', dayEnd),
    // New customers today
    supabase.from('customer').select('customer_id', { count: 'exact', head: true })
      .eq('business_id', businessId).gte('created_at', dayStart).lte('created_at', dayEnd),
    // Leads today (with details)
    supabase.from('leads').select('lead_id, status, urgency, score, job_type')
      .eq('business_id', businessId).gte('created_at', dayStart).lte('created_at', dayEnd),
    // Quotes today
    supabase.from('quotes').select('quote_id, status, subtotal, total')
      .eq('business_id', businessId).gte('created_at', dayStart).lte('created_at', dayEnd),
    // Invoices this month (for revenue)
    supabase.from('invoice').select('invoice_id, status, subtotal, total')
      .eq('business_id', businessId).gte('invoice_date', date.substring(0, 7) + '-01'),
    // Bookings scheduled for today
    supabase.from('booking').select('booking_id, status, scheduled_start, notes')
      .eq('business_id', businessId).gte('scheduled_start', dayStart).lte('scheduled_start', dayEnd),
    // Time entries today
    supabase.from('time_entry').select('duration_minutes, is_billable, hourly_rate')
      .eq('business_id', businessId).eq('work_date', date),
    // Agent runs today
    supabase.from('agent_runs').select('run_id, trigger_type, status', { count: 'exact', head: true })
      .eq('business_id', businessId).gte('created_at', dayStart).lte('created_at', dayEnd),
    // Queued SMS pending
    supabase.from('sms_queue').select('queue_id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('status', 'queued'),
  ])

  const leads = leadsToday.data || []
  const quotes = quotesToday.data || []
  const invoices = invoicesMonth.data || []
  const bookings = bookingsToday.data || []
  const timeEntries = timeEntriesToday.data || []

  const totalHours = timeEntries.reduce((s: number, e: any) => s + (e.duration_minutes || 0), 0) / 60
  const billableHours = timeEntries.filter((e: any) => e.is_billable).reduce((s: number, e: any) => s + (e.duration_minutes || 0), 0) / 60
  const paidInvoices = invoices.filter((i: any) => i.status === 'paid')
  const monthlyRevenue = paidInvoices.reduce((s: number, i: any) => s + (i.total || 0), 0)
  const monthlyRevenueExVat = paidInvoices.reduce((s: number, i: any) => s + (i.subtotal || Math.round((i.total || 0) / 1.25)), 0)
  const pendingInvoices = invoices.filter((i: any) => i.status === 'sent' || i.status === 'overdue')
  const quotesTotal = quotes.reduce((s: number, q: any) => s + (q.total || 0), 0)
  const quotesTotalExVat = quotes.reduce((s: number, q: any) => s + (q.subtotal || Math.round((q.total || 0) / 1.25)), 0)

  return {
    success: true,
    data: {
      date,
      communication: {
        calls: callsToday.count || 0,
        sms_inbound: smsInToday.count || 0,
        sms_outbound: smsOutToday.count || 0,
        sms_queued: pendingQueue.count || 0,
      },
      customers: {
        new_today: newCustomers.count || 0,
      },
      leads: {
        new_today: leads.length,
        by_urgency: {
          emergency: leads.filter((l: any) => l.urgency === 'emergency').length,
          high: leads.filter((l: any) => l.urgency === 'high').length,
          medium: leads.filter((l: any) => l.urgency === 'medium').length,
          low: leads.filter((l: any) => l.urgency === 'low').length,
        },
        avg_score: leads.length > 0 ? Math.round(leads.reduce((s: number, l: any) => s + (l.score || 0), 0) / leads.length) : 0,
      },
      quotes: {
        created_today: quotes.length,
        total_value_incl_vat: quotesTotal,
        total_value_ex_vat: quotesTotalExVat,
      },
      bookings: {
        scheduled_today: bookings.length,
        by_status: {
          pending: bookings.filter((b: any) => b.status === 'pending').length,
          confirmed: bookings.filter((b: any) => b.status === 'confirmed').length,
          completed: bookings.filter((b: any) => b.status === 'completed').length,
        },
      },
      time_tracking: {
        total_hours: +totalHours.toFixed(1),
        billable_hours: +billableHours.toFixed(1),
      },
      revenue: {
        monthly_paid_incl_vat: monthlyRevenue,
        monthly_paid_ex_vat: monthlyRevenueExVat,
        pending_invoices: pendingInvoices.length,
        pending_amount_incl_vat: pendingInvoices.reduce((s: number, i: any) => s + (i.total || 0), 0),
      },
      agent: {
        runs_today: agentRuns.count || 0,
      },
    },
  }
}

// ── Approval Flow ────────────────────────────────────────────

async function createApprovalRequest(
  supabase: SupabaseClient,
  businessId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const { approval_type, title, description, payload } = params
  const risk_level = (params.risk_level as string) || 'high'

  if (!approval_type || !title || !payload) {
    return { success: false, error: 'approval_type, title och payload krävs' }
  }

  const id = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

  // ── LOW risk: execute immediately, no notification, audit trail only ──
  if (risk_level === 'low') {
    const execResult = await executeApprovalPayloadInternal(appUrl, businessId, {
      approval_type: approval_type as string,
      payload: payload as Record<string, unknown>,
    })

    await supabase.from('pending_approvals').insert({
      id,
      business_id: businessId,
      approval_type,
      title,
      description: description || null,
      payload,
      status: 'auto_approved',
      risk_level: 'low',
      resolved_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })

    return {
      success: true,
      data: {
        message: `Åtgärd utförd direkt: "${title}".`,
        approval_id: id,
        execution: execResult,
      },
    }
  }

  // ── MEDIUM risk: execute immediately + log to dashboard ──
  if (risk_level === 'medium') {
    const execResult = await executeApprovalPayloadInternal(appUrl, businessId, {
      approval_type: approval_type as string,
      payload: payload as Record<string, unknown>,
    })

    await supabase.from('pending_approvals').insert({
      id,
      business_id: businessId,
      approval_type,
      title,
      description: description || null,
      payload,
      status: 'auto_approved',
      risk_level: 'medium',
      resolved_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })

    return {
      success: true,
      data: {
        message: `Åtgärd utförd automatiskt och loggad: "${title}".`,
        approval_id: id,
        execution: execResult,
      },
    }
  }

  // ── HIGH risk (default): create pending, send push, await human ──
  const { error } = await supabase
    .from('pending_approvals')
    .insert({
      id,
      business_id: businessId,
      approval_type,
      title,
      description: description || null,
      payload,
      status: 'pending',
      risk_level: 'high',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })

  if (error) return { success: false, error: error.message }

  // Send push notification (fire-and-forget)
  fetch(`${appUrl}/api/push/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_id: businessId,
      title: 'Nytt att godkänna',
      body: title,
      url: '/dashboard/approvals',
    }),
  }).catch(() => {})

  return {
    success: true,
    data: {
      message: `Godkännandebegäran skapad: "${title}". Hantverkaren måste godkänna i dashboard.`,
      approval_id: id,
    },
  }
}

/**
 * Execute an approval payload inline (used for low/medium risk auto-approvals).
 * Mirrors the switch in app/api/approvals/[id]/route.ts.
 */
async function executeApprovalPayloadInternal(
  appUrl: string,
  businessId: string,
  approval: { approval_type: string; payload: Record<string, unknown> }
): Promise<Record<string, unknown>> {
  const { approval_type, payload } = approval
  try {
    switch (approval_type) {
      case 'send_sms': {
        const res = await fetch(`${appUrl}/api/sms/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: businessId, to: payload.to, message: payload.message }),
        })
        return { action: 'send_sms', ok: res.ok }
      }
      case 'send_quote': {
        if (!payload.quote_id) return { action: 'send_quote', skipped: 'no quote_id' }
        const res = await fetch(`${appUrl}/api/quotes/${payload.quote_id}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: businessId }),
        })
        return { action: 'send_quote', ok: res.ok }
      }
      case 'send_invoice': {
        if (!payload.invoice_id) return { action: 'send_invoice', skipped: 'no invoice_id' }
        const res = await fetch(`${appUrl}/api/invoices/${payload.invoice_id}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: businessId }),
        })
        return { action: 'send_invoice', ok: res.ok }
      }
      case 'create_booking': {
        const res = await fetch(`${appUrl}/api/bookings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, business_id: businessId }),
        })
        return { action: 'create_booking', ok: res.ok }
      }
      default:
        return { action: approval_type, skipped: 'no handler', payload }
    }
  } catch (err: any) {
    return { action: approval_type, error: err.message }
  }
}

async function checkPendingApprovals(
  supabase: SupabaseClient,
  businessId: string
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('pending_approvals')
    .select('id, approval_type, title, description, created_at, expires_at')
    .eq('business_id', businessId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: {
      pending_count: data?.length || 0,
      approvals: data || [],
    },
  }
}

// ── Business Preferences ─────────────────────────────────────

async function updateBusinessPreference(
  supabase: SupabaseClient,
  businessId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const { key, value } = params
  if (!key || !value) {
    return { success: false, error: 'key och value krävs' }
  }

  const { error } = await supabase
    .from('business_preferences')
    .upsert(
      {
        business_id: businessId,
        key: String(key),
        value: String(value),
        source: 'agent',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'business_id,key' }
    )

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: { message: `Preferens sparad: ${key} = ${value}` },
  }
}

// ── V3 Automation Engine ────────────────────────────────

async function getAutomationSettings(
  supabase: SupabaseClient, businessId: string
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('v3_automation_settings')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle()

  if (error) return { success: false, error: error.message }

  if (!data) {
    return {
      success: true,
      data: {
        message: 'Standardinställningar (inga anpassade inställningar sparade)',
        work_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
        work_start: '07:00',
        work_end: '17:00',
        night_mode_enabled: true,
        min_job_value_sek: 0,
        require_approval_send_quote: true,
        require_approval_send_invoice: true,
        require_approval_send_sms: false,
        require_approval_create_booking: false,
        lead_response_target_minutes: 30,
        quote_followup_days: 5,
        invoice_reminder_days: 7,
      },
    }
  }

  return { success: true, data }
}

async function logAutomationAction(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const { rule_name, action_type, status, details } = params

  if (!rule_name || !action_type || !status) {
    return { success: false, error: 'rule_name, action_type och status krävs' }
  }

  const { error } = await supabase.from('v3_automation_logs').insert({
    business_id: businessId,
    rule_id: null,
    rule_name: String(rule_name),
    trigger_type: 'manual',
    action_type: String(action_type),
    status: String(status),
    context: { details: details || null, source: 'agent' },
    result: {},
  })

  if (error) return { success: false, error: error.message }

  return { success: true, data: { message: `Åtgärd loggad: ${rule_name} (${status})` } }
}
