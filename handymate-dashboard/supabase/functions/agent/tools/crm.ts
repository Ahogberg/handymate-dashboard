// CRM tools — customer management
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

export async function getCustomer(
  supabase: SupabaseClient,
  businessId: string,
  params: { customer_id: string }
): Promise<ToolResult> {
  console.log(`[Tool] get_customer: ${params.customer_id}`)

  const { data, error } = await supabase
    .from("customer")
    .select(
      "customer_id, name, phone_number, email, address_line, customer_rating, created_at"
    )
    .eq("business_id", businessId)
    .eq("customer_id", params.customer_id)
    .single()

  if (error) {
    return { success: false, error: `Kunden hittades inte: ${error.message}` }
  }

  // Fetch recent bookings for context
  const { data: bookings } = await supabase
    .from("booking")
    .select("booking_id, scheduled_start, scheduled_end, status, notes")
    .eq("customer_id", params.customer_id)
    .eq("business_id", businessId)
    .order("scheduled_start", { ascending: false })
    .limit(5)

  // Fetch recent quotes
  const { data: quotes } = await supabase
    .from("quotes")
    .select("quote_id, title, status, total, created_at")
    .eq("customer_id", params.customer_id)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(5)

  return {
    success: true,
    data: {
      ...data,
      recent_bookings: bookings || [],
      recent_quotes: quotes || [],
    },
  }
}

export async function searchCustomers(
  supabase: SupabaseClient,
  businessId: string,
  params: { query: string; limit?: number }
): Promise<ToolResult> {
  const limit = params.limit || 10
  console.log(`[Tool] search_customers: "${params.query}" (limit ${limit})`)

  const query = params.query.trim()
  if (query.length < 2) {
    return { success: false, error: "Söktermen måste vara minst 2 tecken" }
  }

  // Search by name (ilike), phone, or email
  const { data, error } = await supabase
    .from("customer")
    .select(
      "customer_id, name, phone_number, email, address_line"
    )
    .eq("business_id", businessId)
    .or(
      `name.ilike.%${query}%,phone_number.ilike.%${query}%,email.ilike.%${query}%`
    )
    .limit(limit)

  if (error) {
    return { success: false, error: `Sökning misslyckades: ${error.message}` }
  }

  return {
    success: true,
    data: {
      count: data.length,
      customers: data,
    },
  }
}

export async function createCustomer(
  supabase: SupabaseClient,
  businessId: string,
  params: {
    name: string
    phone_number: string
    email?: string
    address_line?: string
  }
): Promise<ToolResult> {
  console.log(`[Tool] create_customer: ${params.name} (${params.phone_number})`)

  // Check if customer already exists with this phone number
  const { data: existing } = await supabase
    .from("customer")
    .select("customer_id, name")
    .eq("business_id", businessId)
    .eq("phone_number", params.phone_number)
    .single()

  if (existing) {
    return {
      success: false,
      error: `Kund med detta telefonnummer finns redan: ${existing.name} (${existing.customer_id})`,
    }
  }

  const customerId = generateId("cust")
  const { data, error } = await supabase
    .from("customer")
    .insert({
      customer_id: customerId,
      business_id: businessId,
      name: params.name,
      phone_number: params.phone_number,
      email: params.email || null,
      address_line: params.address_line || null,
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    return {
      success: false,
      error: `Kunde inte skapa kund: ${error.message}`,
    }
  }

  return {
    success: true,
    data: {
      customer_id: customerId,
      message: `Kund "${params.name}" skapad`,
      customer: data,
    },
  }
}

export async function updateCustomer(
  supabase: SupabaseClient,
  businessId: string,
  params: {
    customer_id: string
    name?: string
    phone_number?: string
    email?: string
    address_line?: string
    customer_rating?: number
  }
): Promise<ToolResult> {
  console.log(`[Tool] update_customer: ${params.customer_id}`)

  const { customer_id, ...updates } = params

  // Remove undefined fields
  const cleanUpdates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      cleanUpdates[key] = value
    }
  }

  if (Object.keys(cleanUpdates).length === 0) {
    return { success: false, error: "Inga fält att uppdatera" }
  }

  const { data, error } = await supabase
    .from("customer")
    .update(cleanUpdates)
    .eq("business_id", businessId)
    .eq("customer_id", customer_id)
    .select()
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
      message: `Kund "${data.name}" uppdaterad`,
      updated_fields: Object.keys(cleanUpdates),
      customer: data,
    },
  }
}
