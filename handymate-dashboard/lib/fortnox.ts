import { createClient } from '@supabase/supabase-js'

const FORTNOX_CLIENT_ID = process.env.FORTNOX_CLIENT_ID!
const FORTNOX_CLIENT_SECRET = process.env.FORTNOX_CLIENT_SECRET!
const FORTNOX_REDIRECT_URI = process.env.FORTNOX_REDIRECT_URI || 'https://handymate.se/api/fortnox/callback'
const FORTNOX_API_BASE = 'https://api.fortnox.se/3'
const FORTNOX_AUTH_BASE = 'https://apps.fortnox.se/oauth-v1'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface FortnoxTokens {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope: string
}

interface FortnoxConfig {
  fortnox_access_token: string | null
  fortnox_refresh_token: string | null
  fortnox_token_expires_at: string | null
  fortnox_connected_at: string | null
  fortnox_company_name: string | null
}

/**
 * Generate the Fortnox OAuth authorization URL
 */
export function getFortnoxAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: FORTNOX_CLIENT_ID,
    redirect_uri: FORTNOX_REDIRECT_URI,
    scope: 'invoice customer article companyinformation',
    state: state,
    response_type: 'code',
    access_type: 'offline'
  })

  return `${FORTNOX_AUTH_BASE}/auth?${params.toString()}`
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<FortnoxTokens> {
  const response = await fetch(`${FORTNOX_AUTH_BASE}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${FORTNOX_CLIENT_ID}:${FORTNOX_CLIENT_SECRET}`).toString('base64')
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: FORTNOX_REDIRECT_URI
    }).toString()
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Fortnox token exchange error:', error)
    throw new Error('Failed to exchange code for tokens')
  }

  return response.json()
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<FortnoxTokens> {
  const response = await fetch(`${FORTNOX_AUTH_BASE}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${FORTNOX_CLIENT_ID}:${FORTNOX_CLIENT_SECRET}`).toString('base64')
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString()
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Fortnox token refresh error:', error)
    throw new Error('Failed to refresh token')
  }

  return response.json()
}

/**
 * Get Fortnox config for a business
 */
export async function getFortnoxConfig(businessId: string): Promise<FortnoxConfig | null> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('business_config')
    .select('fortnox_access_token, fortnox_refresh_token, fortnox_token_expires_at, fortnox_connected_at, fortnox_company_name')
    .eq('business_id', businessId)
    .single()

  if (error || !data) {
    return null
  }

  return data as FortnoxConfig
}

/**
 * Save Fortnox tokens for a business
 */
export async function saveFortnoxTokens(
  businessId: string,
  tokens: FortnoxTokens,
  companyName?: string
): Promise<void> {
  const supabase = getSupabase()
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  const updateData: Record<string, unknown> = {
    fortnox_access_token: tokens.access_token,
    fortnox_refresh_token: tokens.refresh_token,
    fortnox_token_expires_at: expiresAt,
    fortnox_connected: true,
  }

  // Set connected_at only on first connection
  const config = await getFortnoxConfig(businessId)
  if (!config?.fortnox_connected_at) {
    updateData.fortnox_connected_at = new Date().toISOString()
  }

  if (companyName) {
    updateData.fortnox_company_name = companyName
  }

  const { error } = await supabase
    .from('business_config')
    .update(updateData)
    .eq('business_id', businessId)

  if (error) {
    console.error('Save Fortnox tokens error:', error)
    throw new Error('Failed to save Fortnox tokens')
  }
}

/**
 * Clear Fortnox connection for a business
 */
export async function clearFortnoxConnection(businessId: string): Promise<void> {
  const supabase = getSupabase()

  const { error } = await supabase
    .from('business_config')
    .update({
      fortnox_access_token: null,
      fortnox_refresh_token: null,
      fortnox_token_expires_at: null,
      fortnox_connected_at: null,
      fortnox_company_name: null,
      fortnox_connected: false,
    })
    .eq('business_id', businessId)

  if (error) {
    console.error('Clear Fortnox connection error:', error)
    throw new Error('Failed to clear Fortnox connection')
  }
}

/**
 * Refresh token if it expires within 1 hour
 */
export async function refreshTokenIfNeeded(businessId: string): Promise<string | null> {
  const config = await getFortnoxConfig(businessId)

  if (!config?.fortnox_access_token || !config?.fortnox_refresh_token) {
    return null
  }

  const expiresAt = config.fortnox_token_expires_at
    ? new Date(config.fortnox_token_expires_at)
    : new Date(0)

  const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000)

  // Token is still valid for more than 1 hour
  if (expiresAt > oneHourFromNow) {
    return config.fortnox_access_token
  }

  // Refresh the token
  try {
    const newTokens = await refreshAccessToken(config.fortnox_refresh_token)
    await saveFortnoxTokens(businessId, newTokens)
    return newTokens.access_token
  } catch (error) {
    console.error('Token refresh failed:', error)
    return null
  }
}

/**
 * Make an authenticated request to Fortnox API.
 * Loggar alla anrop till fortnox_api_log för debugging.
 */
export async function fortnoxRequest<T = unknown>(
  businessId: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  data?: unknown
): Promise<T> {
  const { logFortnoxApi } = await import('@/lib/fortnox/api-log')
  const startTime = Date.now()

  const accessToken = await refreshTokenIfNeeded(businessId)

  if (!accessToken) {
    await logFortnoxApi({
      business_id: businessId,
      endpoint,
      method,
      error_message: 'Fortnox not connected or token refresh failed',
      duration_ms: Date.now() - startTime,
    })
    throw new Error('Fortnox not connected or token refresh failed')
  }

  const url = `${FORTNOX_API_BASE}${endpoint}`

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }

  const options: RequestInit = {
    method,
    headers
  }

  if (data && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(data)
  }

  let response: Response
  try {
    response = await fetch(url, options)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error'
    await logFortnoxApi({
      business_id: businessId,
      endpoint,
      method,
      request_payload: data,
      error_message: msg,
      duration_ms: Date.now() - startTime,
    })
    throw err
  }

  const text = await response.text()
  let parsed: unknown = null
  if (text) {
    try { parsed = JSON.parse(text) } catch { parsed = text }
  }

  await logFortnoxApi({
    business_id: businessId,
    endpoint,
    method,
    status_code: response.status,
    request_payload: data,
    response_payload: response.ok ? parsed : null,
    error_message: response.ok ? null : (typeof parsed === 'string' ? parsed : (parsed ? JSON.stringify(parsed).slice(0, 1000) : `HTTP ${response.status}`)),
    duration_ms: Date.now() - startTime,
  })

  if (!response.ok) {
    console.error(`Fortnox API error (${endpoint}):`, text)
    throw new Error(`Fortnox API error: ${response.status}`)
  }

  return (parsed ?? ({} as T)) as T
}

/**
 * Get company information from Fortnox
 */
export async function getFortnoxCompanyInfo(businessId: string): Promise<{ CompanyName: string } | null> {
  try {
    const response = await fortnoxRequest<{ CompanySettings: { CompanyName: string } }>(
      businessId,
      'GET',
      '/companyinformation'
    )
    return { CompanyName: response.CompanySettings?.CompanyName || 'Okänt företag' }
  } catch (error) {
    console.error('Get company info error:', error)
    return null
  }
}

// ============================================
// CUSTOMER SYNC FUNCTIONS
// ============================================

export interface FortnoxCustomer {
  CustomerNumber?: string
  Name: string
  Email?: string
  Phone1?: string
  Address1?: string
  ZipCode?: string
  City?: string
}

export interface FortnoxCustomerResponse {
  Customer: FortnoxCustomer
}

export interface FortnoxCustomersListResponse {
  Customers: FortnoxCustomer[]
}

/**
 * Get all customers from Fortnox
 */
export async function getFortnoxCustomers(businessId: string): Promise<FortnoxCustomer[]> {
  try {
    const response = await fortnoxRequest<FortnoxCustomersListResponse>(
      businessId,
      'GET',
      '/customers'
    )
    return response.Customers || []
  } catch (error) {
    console.error('Get Fortnox customers error:', error)
    throw error
  }
}

/**
 * Create a customer in Fortnox
 */
export async function createFortnoxCustomer(
  businessId: string,
  customer: Omit<FortnoxCustomer, 'CustomerNumber'>
): Promise<FortnoxCustomer> {
  try {
    const response = await fortnoxRequest<FortnoxCustomerResponse>(
      businessId,
      'POST',
      '/customers',
      { Customer: customer }
    )
    return response.Customer
  } catch (error) {
    console.error('Create Fortnox customer error:', error)
    throw error
  }
}

/**
 * Update a customer in Fortnox
 */
export async function updateFortnoxCustomer(
  businessId: string,
  customerNumber: string,
  customer: Partial<FortnoxCustomer>
): Promise<FortnoxCustomer> {
  try {
    const response = await fortnoxRequest<FortnoxCustomerResponse>(
      businessId,
      'PUT',
      `/customers/${customerNumber}`,
      { Customer: customer }
    )
    return response.Customer
  } catch (error) {
    console.error('Update Fortnox customer error:', error)
    throw error
  }
}

/**
 * Check if business has Fortnox connected
 */
export async function isFortnoxConnected(businessId: string): Promise<boolean> {
  const config = await getFortnoxConfig(businessId)
  return !!(config?.fortnox_access_token && config?.fortnox_connected_at)
}

/**
 * Sync a single customer to Fortnox (fire-and-forget safe)
 */
export async function syncCustomerToFortnox(
  businessId: string,
  customerId: string
): Promise<{ success: boolean; skipped?: boolean; customerNumber?: string; error?: string }> {
  const supabase = getSupabase()

  try {
    // Check if Fortnox is connected
    const connected = await isFortnoxConnected(businessId)
    if (!connected) {
      return { success: false, skipped: true, error: 'fortnox_not_connected' }
    }

    // Get customer data
    const { data: customer, error: fetchError } = await supabase
      .from('customer')
      .select('*')
      .eq('customer_id', customerId)
      .eq('business_id', businessId)
      .single()

    if (fetchError || !customer) {
      return { success: false, error: 'Customer not found' }
    }

    // Already synced?
    if (customer.fortnox_customer_number) {
      return { success: true, customerNumber: customer.fortnox_customer_number }
    }

    // Parse address if available
    let address1 = ''
    let zipCode = ''
    let city = ''
    if (customer.address_line) {
      // Try to parse "Gatuadress, 12345 Stad"
      const parts = customer.address_line.split(',').map((p: string) => p.trim())
      if (parts.length >= 1) address1 = parts[0]
      if (parts.length >= 2) {
        const cityParts = parts[1].match(/(\d{5})\s*(.*)/)
        if (cityParts) {
          zipCode = cityParts[1]
          city = cityParts[2] || ''
        } else {
          city = parts[1]
        }
      }
    }

    // Create in Fortnox
    const fortnoxCustomer = await createFortnoxCustomer(businessId, {
      Name: customer.name,
      Email: customer.email || undefined,
      Phone1: customer.phone_number || undefined,
      Address1: address1 || undefined,
      ZipCode: zipCode || undefined,
      City: city || undefined
    })

    // Update customer in DB
    const { error: updateError } = await supabase
      .from('customer')
      .update({
        fortnox_customer_number: fortnoxCustomer.CustomerNumber,
        fortnox_synced_at: new Date().toISOString(),
        fortnox_sync_error: null
      })
      .eq('customer_id', customerId)

    if (updateError) {
      console.error('Failed to update customer after Fortnox sync:', updateError)
    }

    return { success: true, customerNumber: fortnoxCustomer.CustomerNumber }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Sync failed'

    // Log error to customer record
    await supabase
      .from('customer')
      .update({ fortnox_sync_error: errorMessage })
      .eq('customer_id', customerId)

    return { success: false, error: errorMessage }
  }
}

// ============================================
// INVOICE SYNC FUNCTIONS
// ============================================

export interface FortnoxInvoiceRow {
  ArticleNumber?: string
  Description: string
  DeliveredQuantity: number
  Price: number
  Unit?: string
}

export interface FortnoxInvoice {
  DocumentNumber?: string
  InvoiceNumber?: string
  CustomerNumber: string
  InvoiceDate: string
  DueDate: string
  YourReference?: string
  OurReference?: string
  InvoiceRows: FortnoxInvoiceRow[]
  Balance?: number
  FullyPaid?: boolean
  Booked?: boolean
  Cancelled?: boolean
}

export interface FortnoxInvoiceResponse {
  Invoice: FortnoxInvoice
}

/**
 * Create an invoice in Fortnox
 */
export async function createFortnoxInvoice(
  businessId: string,
  invoice: Omit<FortnoxInvoice, 'DocumentNumber' | 'InvoiceNumber' | 'Balance' | 'FullyPaid' | 'Booked' | 'Cancelled'>
): Promise<FortnoxInvoice> {
  const response = await fortnoxRequest<FortnoxInvoiceResponse>(
    businessId,
    'POST',
    '/invoices',
    { Invoice: invoice }
  )
  return response.Invoice
}

/**
 * Get invoice from Fortnox by document number
 */
export async function getFortnoxInvoice(
  businessId: string,
  documentNumber: string
): Promise<FortnoxInvoice> {
  const response = await fortnoxRequest<FortnoxInvoiceResponse>(
    businessId,
    'GET',
    `/invoices/${documentNumber}`
  )
  return response.Invoice
}

/**
 * Sync a single Handymate invoice to Fortnox
 */
export async function syncInvoiceToFortnox(
  businessId: string,
  invoiceId: string
): Promise<{ success: boolean; skipped?: boolean; fortnoxInvoiceNumber?: string; fortnoxDocumentNumber?: string; error?: string }> {
  const supabase = getSupabase()

  try {
    const connected = await isFortnoxConnected(businessId)
    if (!connected) {
      return { success: false, skipped: true, error: 'fortnox_not_connected' }
    }

    // Get invoice with customer
    const { data: invoice, error: fetchError } = await supabase
      .from('invoice')
      .select('*, customer(customer_id, name, email, phone_number, address_line, fortnox_customer_number)')
      .eq('invoice_id', invoiceId)
      .eq('business_id', businessId)
      .single()

    if (fetchError || !invoice) {
      return { success: false, error: 'Invoice not found' }
    }

    // Already synced?
    if (invoice.fortnox_invoice_number) {
      return { success: true, fortnoxInvoiceNumber: invoice.fortnox_invoice_number, fortnoxDocumentNumber: invoice.fortnox_document_number }
    }

    // Ensure customer exists in Fortnox
    let customerNumber = invoice.customer?.fortnox_customer_number
    if (!customerNumber && invoice.customer) {
      const syncResult = await syncCustomerToFortnox(businessId, invoice.customer.customer_id)
      if (!syncResult.success) {
        return { success: false, error: `Could not sync customer: ${syncResult.error}` }
      }
      customerNumber = syncResult.customerNumber
    }

    if (!customerNumber) {
      return { success: false, error: 'No customer linked to invoice' }
    }

    // Get business info for OurReference
    const { data: config } = await supabase
      .from('business_config')
      .select('business_name, contact_name')
      .eq('business_id', businessId)
      .single()

    // Build invoice rows
    const items = invoice.items || []
    const invoiceRows: FortnoxInvoiceRow[] = items.map((item: { description: string; quantity: number; unit?: string; unit_price: number }) => ({
      Description: item.description,
      DeliveredQuantity: item.quantity,
      Price: item.unit_price,
      Unit: item.unit === 'timmar' ? 'h' : item.unit === 'st' ? 'st' : undefined
    }))

    // Create in Fortnox
    const fortnoxInvoice = await createFortnoxInvoice(businessId, {
      CustomerNumber: customerNumber,
      InvoiceDate: invoice.invoice_date?.split('T')[0] || new Date().toISOString().split('T')[0],
      DueDate: invoice.due_date?.split('T')[0] || '',
      YourReference: invoice.customer?.name || undefined,
      OurReference: config?.contact_name || config?.business_name || undefined,
      InvoiceRows: invoiceRows
    })

    // Update invoice in DB
    const { error: updateError } = await supabase
      .from('invoice')
      .update({
        fortnox_invoice_number: fortnoxInvoice.InvoiceNumber,
        fortnox_document_number: fortnoxInvoice.DocumentNumber,
        fortnox_synced_at: new Date().toISOString(),
        fortnox_sync_error: null
      })
      .eq('invoice_id', invoiceId)

    if (updateError) {
      console.error('Failed to update invoice after Fortnox sync:', updateError)
    }

    return {
      success: true,
      fortnoxInvoiceNumber: fortnoxInvoice.InvoiceNumber,
      fortnoxDocumentNumber: fortnoxInvoice.DocumentNumber
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Sync failed'

    await supabase
      .from('invoice')
      .update({ fortnox_sync_error: errorMessage })
      .eq('invoice_id', invoiceId)

    return { success: false, error: errorMessage }
  }
}

// ============================================
// INVOICE ACTIONS (book, mark paid)
// ============================================

/**
 * Book (bokför) a Fortnox invoice. Makes it final/immutable.
 */
export async function bookFortnoxInvoice(
  businessId: string,
  documentNumber: string
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
  const connected = await isFortnoxConnected(businessId)
  if (!connected) {
    return { success: false, skipped: true, error: 'fortnox_not_connected' }
  }

  try {
    await fortnoxRequest(businessId, 'PUT', `/invoices/${documentNumber}/bookkeep`)
    return { success: true }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Book invoice failed'
    return { success: false, error: msg }
  }
}

/**
 * Register a payment on a Fortnox invoice.
 */
export async function registerFortnoxPayment(
  businessId: string,
  invoiceNumber: string,
  amount: number,
  paymentDate?: string
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
  const connected = await isFortnoxConnected(businessId)
  if (!connected) {
    return { success: false, skipped: true, error: 'fortnox_not_connected' }
  }

  try {
    const date = paymentDate || new Date().toISOString().split('T')[0]
    await fortnoxRequest(businessId, 'POST', '/invoicepayments', {
      InvoicePayment: {
        InvoiceNumber: invoiceNumber,
        Amount: amount,
        AmountCurrency: amount,
        PaymentDate: date,
      },
    })
    return { success: true }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Register payment failed'
    return { success: false, error: msg }
  }
}

// ============================================
// OFFER / QUOTE SYNC
// ============================================

export interface FortnoxOffer {
  DocumentNumber?: string
  OfferNumber?: string
  CustomerNumber: string
  OfferDate: string
  ExpireDate: string
  YourReference?: string
  OurReference?: string
  OfferRows: FortnoxInvoiceRow[]
}

export interface FortnoxOfferResponse {
  Offer: FortnoxOffer
}

/**
 * Create an offer in Fortnox
 */
export async function createFortnoxOffer(
  businessId: string,
  offer: Omit<FortnoxOffer, 'DocumentNumber' | 'OfferNumber'>
): Promise<FortnoxOffer> {
  const response = await fortnoxRequest<FortnoxOfferResponse>(
    businessId,
    'POST',
    '/offers',
    { Offer: offer }
  )
  return response.Offer
}

/**
 * Sync a Handymate quote to Fortnox as an offer.
 */
export async function syncQuoteToFortnox(
  businessId: string,
  quoteId: string
): Promise<{ success: boolean; skipped?: boolean; fortnoxOfferNumber?: string; error?: string }> {
  const supabase = getSupabase()

  try {
    const connected = await isFortnoxConnected(businessId)
    if (!connected) {
      return { success: false, skipped: true, error: 'fortnox_not_connected' }
    }

    // Get quote with customer
    const { data: quote, error: fetchError } = await supabase
      .from('quotes')
      .select('*, customer(customer_id, name, email, phone_number, address_line, fortnox_customer_number)')
      .eq('quote_id', quoteId)
      .eq('business_id', businessId)
      .single()

    if (fetchError || !quote) {
      return { success: false, error: 'Quote not found' }
    }

    // Already synced?
    if (quote.fortnox_offer_number) {
      return { success: true, fortnoxOfferNumber: quote.fortnox_offer_number }
    }

    // Ensure customer exists in Fortnox
    let customerNumber = quote.customer?.fortnox_customer_number
    if (!customerNumber && quote.customer) {
      const syncResult = await syncCustomerToFortnox(businessId, quote.customer.customer_id)
      if (!syncResult.success) {
        return { success: false, error: `Could not sync customer: ${syncResult.error}` }
      }
      customerNumber = syncResult.customerNumber
    }

    if (!customerNumber) {
      return { success: false, error: 'No customer linked to quote' }
    }

    // Build offer rows
    const items = quote.items || []
    const offerRows: FortnoxInvoiceRow[] = items.map((item: { description?: string; name?: string; quantity: number; unit?: string; unit_price: number }) => ({
      Description: item.description || item.name || '',
      DeliveredQuantity: item.quantity,
      Price: item.unit_price,
      Unit: item.unit === 'timmar' ? 'h' : item.unit === 'st' ? 'st' : undefined,
    }))

    // Calculate expire date
    const validDays = quote.valid_days || 30
    const expireDate = new Date()
    expireDate.setDate(expireDate.getDate() + validDays)

    const fortnoxOffer = await createFortnoxOffer(businessId, {
      CustomerNumber: customerNumber,
      OfferDate: quote.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
      ExpireDate: expireDate.toISOString().split('T')[0],
      OfferRows: offerRows,
    })

    // Update quote in DB
    await supabase
      .from('quotes')
      .update({
        fortnox_offer_number: fortnoxOffer.OfferNumber || fortnoxOffer.DocumentNumber,
        fortnox_synced_at: new Date().toISOString(),
      })
      .eq('quote_id', quoteId)

    return { success: true, fortnoxOfferNumber: fortnoxOffer.OfferNumber || fortnoxOffer.DocumentNumber }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Quote sync failed'
    return { success: false, error: errorMessage }
  }
}

// ============================================
// FORTNOX STATUS (for agent tools)
// ============================================

export interface FortnoxStatus {
  connected: boolean
  companyName: string | null
  connectedAt: string | null
  syncStats?: {
    customers: { synced: number; errors: number }
    invoices: { synced: number; errors: number }
    quotes: { synced: number; errors: number }
  }
}

/**
 * Get Fortnox connection status and sync stats for a business.
 */
export async function getFortnoxStatus(businessId: string): Promise<FortnoxStatus> {
  const config = await getFortnoxConfig(businessId)

  if (!config?.fortnox_access_token || !config?.fortnox_connected_at) {
    return { connected: false, companyName: null, connectedAt: null }
  }

  const supabase = getSupabase()

  // Get sync stats from fortnox_sync table
  const { data: syncRows } = await supabase
    .from('fortnox_sync')
    .select('entity_type, sync_status')
    .eq('business_id', businessId)

  const stats = {
    customers: { synced: 0, errors: 0 },
    invoices: { synced: 0, errors: 0 },
    quotes: { synced: 0, errors: 0 },
  }

  if (syncRows) {
    for (const row of syncRows) {
      const key = row.entity_type === 'customer' ? 'customers'
        : row.entity_type === 'invoice' ? 'invoices'
        : row.entity_type === 'quote' ? 'quotes'
        : null
      if (!key) continue
      if (row.sync_status === 'synced') stats[key].synced++
      else if (row.sync_status === 'error') stats[key].errors++
    }
  }

  return {
    connected: true,
    companyName: config.fortnox_company_name,
    connectedAt: config.fortnox_connected_at,
    syncStats: stats,
  }
}
