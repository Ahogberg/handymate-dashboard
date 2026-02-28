// Operations tools — quotes, invoices, calendar, time logging
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

function generateId(prefix: string): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let id = prefix + "_"
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

interface QuoteItem {
  type: "labor" | "material"
  name: string
  quantity: number
  unit: string
  unit_price: number
}

// ── Quotes ──────────────────────────────────────────────

export async function createQuote(
  supabase: SupabaseClient,
  businessId: string,
  params: {
    customer_id: string
    title: string
    items: QuoteItem[]
    rot_rut_type?: "rot" | "rut"
    valid_days?: number
  }
): Promise<ToolResult> {
  console.log(`[Tool] create_quote: "${params.title}" for ${params.customer_id}`)

  // Verify customer exists
  const { data: customer, error: custErr } = await supabase
    .from("customer")
    .select("customer_id, name")
    .eq("business_id", businessId)
    .eq("customer_id", params.customer_id)
    .single()

  if (custErr || !customer) {
    return { success: false, error: "Kunden hittades inte" }
  }

  // Calculate totals
  const items = params.items.map((item) => ({
    ...item,
    total: item.quantity * item.unit_price,
  }))

  const laborTotal = items
    .filter((i) => i.type === "labor")
    .reduce((sum, i) => sum + i.total, 0)
  const materialTotal = items
    .filter((i) => i.type === "material")
    .reduce((sum, i) => sum + i.total, 0)
  const total = laborTotal + materialTotal

  // ROT/RUT calculation
  let rotRutDeduction = 0
  if (params.rot_rut_type === "rot") {
    rotRutDeduction = Math.min(laborTotal * 0.3, 50000)
  } else if (params.rot_rut_type === "rut") {
    rotRutDeduction = Math.min(laborTotal * 0.5, 75000)
  }
  const customerPays = total - rotRutDeduction

  const validDays = params.valid_days || 30
  const validUntil = new Date()
  validUntil.setDate(validUntil.getDate() + validDays)

  const quoteId = generateId("quote")
  const { data, error } = await supabase
    .from("quotes")
    .insert({
      quote_id: quoteId,
      business_id: businessId,
      customer_id: params.customer_id,
      title: params.title,
      status: "draft",
      items: JSON.stringify(items),
      labor_total: laborTotal,
      material_total: materialTotal,
      total,
      rot_rut_type: params.rot_rut_type || null,
      rot_rut_deduction: rotRutDeduction,
      customer_pays: customerPays,
      valid_until: validUntil.toISOString(),
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    return {
      success: false,
      error: `Kunde inte skapa offert: ${error.message}`,
    }
  }

  return {
    success: true,
    data: {
      quote_id: quoteId,
      message: `Offert "${params.title}" skapad för ${customer.name}`,
      summary: {
        labor_total: laborTotal,
        material_total: materialTotal,
        total,
        rot_rut_type: params.rot_rut_type || "ingen",
        rot_rut_deduction: rotRutDeduction,
        customer_pays: customerPays,
        valid_until: validUntil.toISOString().split("T")[0],
        item_count: items.length,
      },
    },
  }
}

export async function getQuotes(
  supabase: SupabaseClient,
  businessId: string,
  params: { customer_id?: string; status?: string; limit?: number }
): Promise<ToolResult> {
  console.log(`[Tool] get_quotes: customer=${params.customer_id || "all"}, status=${params.status || "all"}`)

  let query = supabase
    .from("quotes")
    .select(
      "quote_id, customer_id, title, status, total, rot_rut_type, rot_rut_deduction, customer_pays, valid_until, created_at"
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(params.limit || 20)

  if (params.customer_id) {
    query = query.eq("customer_id", params.customer_id)
  }
  if (params.status) {
    query = query.eq("status", params.status)
  }

  const { data, error } = await query

  if (error) {
    return { success: false, error: `Kunde inte hämta offerter: ${error.message}` }
  }

  return {
    success: true,
    data: {
      count: data.length,
      quotes: data,
    },
  }
}

// ── Invoices ─────────────────────────────────────────────

export async function createInvoice(
  supabase: SupabaseClient,
  businessId: string,
  params: {
    customer_id: string
    quote_id?: string
    items?: QuoteItem[]
    rot_rut_type?: "rot" | "rut"
    due_days?: number
  }
): Promise<ToolResult> {
  console.log(`[Tool] create_invoice: customer=${params.customer_id}, quote=${params.quote_id || "none"}`)

  // Verify customer
  const { data: customer, error: custErr } = await supabase
    .from("customer")
    .select("customer_id, name")
    .eq("business_id", businessId)
    .eq("customer_id", params.customer_id)
    .single()

  if (custErr || !customer) {
    return { success: false, error: "Kunden hittades inte" }
  }

  let items: Array<QuoteItem & { total: number }> = []
  let rotRutType = params.rot_rut_type || null

  // If from quote, fetch items
  if (params.quote_id) {
    const { data: quote, error: qErr } = await supabase
      .from("quotes")
      .select("items, rot_rut_type")
      .eq("business_id", businessId)
      .eq("quote_id", params.quote_id)
      .single()

    if (qErr || !quote) {
      return { success: false, error: "Offerten hittades inte" }
    }

    items =
      typeof quote.items === "string"
        ? JSON.parse(quote.items)
        : quote.items
    rotRutType = rotRutType || quote.rot_rut_type
  } else if (params.items) {
    items = params.items.map((item) => ({
      ...item,
      total: item.quantity * item.unit_price,
    }))
  } else {
    return {
      success: false,
      error: "Antingen quote_id eller items måste anges",
    }
  }

  // Calculate totals
  const laborTotal = items
    .filter((i) => i.type === "labor")
    .reduce((sum, i) => sum + i.total, 0)
  const materialTotal = items
    .filter((i) => i.type === "material")
    .reduce((sum, i) => sum + i.total, 0)
  const subtotal = laborTotal + materialTotal
  const vatRate = 25
  const vatAmount = subtotal * (vatRate / 100)
  const total = subtotal + vatAmount

  let rotRutDeduction = 0
  if (rotRutType === "rot") {
    rotRutDeduction = Math.min(laborTotal * 0.3, 50000)
  } else if (rotRutType === "rut") {
    rotRutDeduction = Math.min(laborTotal * 0.5, 75000)
  }
  const customerPays = total - rotRutDeduction

  // Generate invoice number (YYYY-NNN)
  const year = new Date().getFullYear()
  const { count } = await supabase
    .from("invoice")
    .select("invoice_id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .ilike("invoice_number", `${year}-%`)

  const invoiceNumber = `${year}-${String((count || 0) + 1).padStart(3, "0")}`

  const dueDays = params.due_days || 30
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + dueDays)

  const invoiceId = generateId("inv")
  const { error } = await supabase.from("invoice").insert({
    invoice_id: invoiceId,
    business_id: businessId,
    customer_id: params.customer_id,
    quote_id: params.quote_id || null,
    invoice_number: invoiceNumber,
    status: "draft",
    items: JSON.stringify(items),
    subtotal,
    vat_rate: vatRate,
    vat_amount: vatAmount,
    total,
    rot_rut_type: rotRutType,
    rot_rut_deduction: rotRutDeduction,
    customer_pays: customerPays,
    invoice_date: new Date().toISOString().split("T")[0],
    due_date: dueDate.toISOString().split("T")[0],
    created_at: new Date().toISOString(),
  })

  if (error) {
    return {
      success: false,
      error: `Kunde inte skapa faktura: ${error.message}`,
    }
  }

  return {
    success: true,
    data: {
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      message: `Faktura ${invoiceNumber} skapad för ${customer.name}`,
      summary: {
        subtotal,
        vat_amount: vatAmount,
        total,
        rot_rut_deduction: rotRutDeduction,
        customer_pays: customerPays,
        due_date: dueDate.toISOString().split("T")[0],
      },
    },
  }
}

// ── Calendar ─────────────────────────────────────────────

export async function checkCalendar(
  supabase: SupabaseClient,
  businessId: string,
  params: { from_date: string; to_date: string }
): Promise<ToolResult> {
  console.log(`[Tool] check_calendar: ${params.from_date} → ${params.to_date}`)

  const { data: bookings, error } = await supabase
    .from("booking")
    .select(
      "booking_id, customer_id, service_type, scheduled_start, scheduled_end, status, notes"
    )
    .eq("business_id", businessId)
    .gte("scheduled_start", `${params.from_date}T00:00:00`)
    .lte("scheduled_start", `${params.to_date}T23:59:59`)
    .neq("status", "cancelled")
    .order("scheduled_start", { ascending: true })

  if (error) {
    return {
      success: false,
      error: `Kunde inte hämta kalender: ${error.message}`,
    }
  }

  // Enrich with customer names
  const customerIds = [...new Set((bookings || []).map((b) => b.customer_id))]
  let customerMap: Record<string, string> = {}
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from("customer")
      .select("customer_id, name")
      .in("customer_id", customerIds)

    customerMap = Object.fromEntries(
      (customers || []).map((c) => [c.customer_id, c.name])
    )
  }

  const enriched = (bookings || []).map((b) => ({
    ...b,
    customer_name: customerMap[b.customer_id] || "Okänd",
  }))

  return {
    success: true,
    data: {
      period: `${params.from_date} – ${params.to_date}`,
      booking_count: enriched.length,
      bookings: enriched,
    },
  }
}

export async function createBooking(
  supabase: SupabaseClient,
  businessId: string,
  params: {
    customer_id: string
    service_type: string
    scheduled_start: string
    scheduled_end: string
    notes?: string
  }
): Promise<ToolResult> {
  console.log(`[Tool] create_booking: ${params.service_type} @ ${params.scheduled_start}`)

  // Verify customer
  const { data: customer } = await supabase
    .from("customer")
    .select("customer_id, name")
    .eq("business_id", businessId)
    .eq("customer_id", params.customer_id)
    .single()

  if (!customer) {
    return { success: false, error: "Kunden hittades inte" }
  }

  const bookingId = generateId("book")
  const { error } = await supabase.from("booking").insert({
    booking_id: bookingId,
    business_id: businessId,
    customer_id: params.customer_id,
    service_type: params.service_type,
    scheduled_start: params.scheduled_start,
    scheduled_end: params.scheduled_end,
    status: "pending",
    notes: params.notes || null,
    source: "ai_suggestion",
    created_at: new Date().toISOString(),
  })

  if (error) {
    return {
      success: false,
      error: `Kunde inte skapa bokning: ${error.message}`,
    }
  }

  return {
    success: true,
    data: {
      booking_id: bookingId,
      message: `Bokning skapad: ${params.service_type} med ${customer.name}`,
      details: {
        customer_name: customer.name,
        service_type: params.service_type,
        start: params.scheduled_start,
        end: params.scheduled_end,
        status: "pending",
      },
    },
  }
}

export async function updateProject(
  supabase: SupabaseClient,
  businessId: string,
  params: {
    booking_id: string
    status?: string
    notes?: string
  }
): Promise<ToolResult> {
  console.log(`[Tool] update_project: ${params.booking_id}`)

  const updates: Record<string, unknown> = {}
  if (params.status) updates.status = params.status
  if (params.notes) {
    // Append notes
    const { data: existing } = await supabase
      .from("booking")
      .select("notes")
      .eq("business_id", businessId)
      .eq("booking_id", params.booking_id)
      .single()

    const existingNotes = existing?.notes || ""
    updates.notes = existingNotes
      ? `${existingNotes}\n---\n${params.notes}`
      : params.notes
  }

  if (Object.keys(updates).length === 0) {
    return { success: false, error: "Inga fält att uppdatera" }
  }

  const { data, error } = await supabase
    .from("booking")
    .update(updates)
    .eq("business_id", businessId)
    .eq("booking_id", params.booking_id)
    .select("booking_id, service_type, status, notes")
    .single()

  if (error) {
    return {
      success: false,
      error: `Kunde inte uppdatera: ${error.message}`,
    }
  }

  return {
    success: true,
    data: {
      message: `Bokning ${params.booking_id} uppdaterad`,
      booking: data,
    },
  }
}

// ── Time Logging ─────────────────────────────────────────

export async function logTime(
  supabase: SupabaseClient,
  businessId: string,
  params: {
    customer_id: string
    booking_id?: string
    work_date: string
    start_time: string
    end_time: string
    description?: string
    is_billable?: boolean
  }
): Promise<ToolResult> {
  console.log(`[Tool] log_time: ${params.work_date} ${params.start_time}-${params.end_time}`)

  // Calculate duration
  const [startH, startM] = params.start_time.split(":").map(Number)
  const [endH, endM] = params.end_time.split(":").map(Number)
  const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM)

  if (durationMinutes <= 0) {
    return { success: false, error: "Sluttid måste vara efter starttid" }
  }

  // Get hourly rate from business config
  const { data: config } = await supabase
    .from("business_config")
    .select("pricing_settings")
    .eq("business_id", businessId)
    .single()

  const hourlyRate = config?.pricing_settings?.hourly_rate || 695

  const entryId = generateId("time")
  const { error } = await supabase.from("time_entry").insert({
    time_entry_id: entryId,
    business_id: businessId,
    booking_id: params.booking_id || null,
    customer_id: params.customer_id,
    work_date: params.work_date,
    start_time: params.start_time,
    end_time: params.end_time,
    duration_minutes: durationMinutes,
    description: params.description || null,
    hourly_rate: hourlyRate,
    is_billable: params.is_billable !== false,
    created_at: new Date().toISOString(),
  })

  if (error) {
    return {
      success: false,
      error: `Kunde inte logga tid: ${error.message}`,
    }
  }

  return {
    success: true,
    data: {
      time_entry_id: entryId,
      message: `Tid loggad: ${(durationMinutes / 60).toFixed(1)} timmar`,
      summary: {
        duration_minutes: durationMinutes,
        duration_hours: +(durationMinutes / 60).toFixed(2),
        hourly_rate: hourlyRate,
        total_cost: +((durationMinutes / 60) * hourlyRate).toFixed(0),
        is_billable: params.is_billable !== false,
      },
    },
  }
}
