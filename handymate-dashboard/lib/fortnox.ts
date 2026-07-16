import { createClient } from '@supabase/supabase-js'

const FORTNOX_CLIENT_ID = process.env.FORTNOX_CLIENT_ID!
const FORTNOX_CLIENT_SECRET = process.env.FORTNOX_CLIENT_SECRET!
// FORTNOX_REDIRECT_URI saknas typiskt i env — fallback bygger från
// NEXT_PUBLIC_APP_URL (vilket sätts av Vercel/lokal config). MÅSTE matcha
// exakt det som är registrerat i Fortnox developer console:
// https://app.handymate.se/api/integrations/fortnox/callback
//
// OBS: callback ligger under /api/integrations/fortnox/* (nya route-stacket
// med förstärkt audit-loggning), inte /api/fortnox/* (gamla). Settings-
// sidan anropar fortfarande /api/fortnox/connect — det är OK eftersom
// state-cookien sätts med path=/ och kan läsas av callback på vilken path
// som helst på samma domän. TD att konsolidera båda route-trees.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
const FORTNOX_REDIRECT_URI = process.env.FORTNOX_REDIRECT_URI || `${APP_URL}/api/integrations/fortnox/callback`
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
 * Generate the Fortnox OAuth authorization URL.
 *
 * Scope-strategi v1: begär bara MINIMAL set som finns i alla Fortnox-plans
 * (även gratis/basic). Andreas pilot-test 2026-05-18 fick
 * 'error_missing_license' eftersom test-Fortnox-kontot saknade
 * prenumeration för `article`-scope. Bee Services riktiga Fortnox-konto
 * har sannolikt full licens — men för att tryggt fungera mot ALLA
 * pilot-kunder begränsar vi till bas-scopes som funkar överallt.
 *
 * Utöka scope-listan i en separat sprint när vi vet vilka moduler
 * pilot-kunder faktiskt har, eller bygg en plan-aware scope-selection.
 *
 * TD-49: Article + Payment + Bookkeeping + Project + Time scopes
 * kräver Fortnox-moduler som inte alla kunder har. Vid 'error_missing_license'
 * måste vi kunna återanvända koppling med reducerade scopes.
 */
export function getFortnoxAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: FORTNOX_CLIENT_ID,
    redirect_uri: FORTNOX_REDIRECT_URI,
    // Minimal scope-set som finns i alla Fortnox-plans:
    scope: 'invoice customer companyinformation',
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
 * Fel vid token-refresh. `permanent = true` betyder att refresh_token är
 * definitivt ogiltig (revokerad/utgången) och anslutningen måste rensas.
 * `permanent = false` = transient fel (Fortnox 5xx, nätverk/timeout) —
 * lämna tokens intakta så nästa cron-körning kan försöka igen.
 */
export class FortnoxRefreshError extends Error {
  permanent: boolean
  constructor(message: string, permanent: boolean) {
    super(message)
    this.name = 'FortnoxRefreshError'
    this.permanent = permanent
  }
}

/**
 * Refresh access token using refresh token.
 *
 * Kastar FortnoxRefreshError med `permanent`-flagga:
 * - HTTP 400/401 med `invalid_grant` (eller annat auth-fel) → permanent
 * - HTTP 5xx / nätverksfel / timeout → transient (permanent = false)
 */
export async function refreshAccessToken(refreshToken: string): Promise<FortnoxTokens> {
  let response: Response
  try {
    response = await fetch(`${FORTNOX_AUTH_BASE}/token`, {
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
  } catch (err) {
    // Nätverksfel/timeout — transient, inte kundens fel
    const msg = err instanceof Error ? err.message : 'Network error'
    throw new FortnoxRefreshError(`Fortnox refresh network error: ${msg}`, false)
  }

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('Fortnox token refresh error:', response.status, errorBody)

    // Permanent auth-fel: 400/401 med invalid_grant (revokerad/utgången
    // refresh_token). Allt annat (5xx, 429, tillfälliga fel) = transient.
    const isAuthStatus = response.status === 400 || response.status === 401
    const isInvalidGrant = /invalid_grant|invalid_token|revoked/i.test(errorBody)
    const permanent = isAuthStatus && isInvalidGrant

    throw new FortnoxRefreshError(
      `Failed to refresh token (HTTP ${response.status})`,
      permanent
    )
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
 * Refresh token if it expires within 1 hour.
 *
 * Vid PERMANENT refresh-failure (token revokerad på Fortnox-sidan eller
 * refresh_token utgånget → invalid_grant): rensar fortnox_connected = false
 * så UI inte fortsätter visa 'Kopplad'-status. Detta förebygger den 'ghost-
 * connected'-bugg som funnits sedan v46 — kunder såg grön status men
 * synkar fungerade aldrig.
 *
 * Vid TRANSIENT failure (Fortnox 5xx, nätverksblipp/timeout): behåller
 * tokens intakta och returnerar null. Nästa cron-körning försöker igen —
 * inget är revokerat, så kunden ska inte tvingas göra om OAuth.
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
    // Skilj på permanent auth-fel (revokerad token) och transient fel
    // (Fortnox 5xx, nätverksblipp). Bara PERMANENTA fel rensar anslutningen —
    // annars tvingas kunden göra om OAuth i onödan vid varje tillfälligt fel.
    const permanent = error instanceof FortnoxRefreshError ? error.permanent : false

    console.error(
      `[fortnox/refresh] failed for ${businessId} (permanent=${permanent}):`,
      error
    )

    // Logga till fortnox_api_log med pseudo-endpoint så audit-trail visar
    // exakt när/varför refresh failade (Fortnox returnerar typiskt
    // 'invalid_grant' när refresh_token är revokerad).
    try {
      const { logFortnoxApi } = await import('@/lib/fortnox/api-log')
      await logFortnoxApi({
        business_id: businessId,
        endpoint: 'token_refresh',
        method: 'POST',
        error_message: error instanceof Error ? error.message : 'Unknown refresh error',
      })
    } catch { /* logging är non-blocking */ }

    // Rensa ENDAST vid permanent fel (revokerad/utgången refresh_token).
    // Vid transient fel: lämna tokens intakta så nästa cron-körning
    // försöker igen — inget är revokerat på Fortnox-sidan.
    if (permanent) {
      try {
        await clearFortnoxConnection(businessId)
      } catch (clearErr) {
        console.error(`[fortnox/refresh] failed to mark disconnected for ${businessId}:`, clearErr)
      }
    } else {
      console.warn(`[fortnox/refresh] transient fel för ${businessId} — behåller tokens, försöker igen nästa körning`)
    }

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
 * Slimmad rad från Fortnox LIST-endpoint /invoices. Listan returnerar
 * lättviktade poster (inte fulla InvoiceRows) — precis vad importen behöver
 * för att skapa lokala huvud-rader utan att slå ett anrop per faktura.
 *
 * Fält enligt Fortnox API v3 /invoices-listan. `Total` = fakturans totalbelopp,
 * `Balance` = utestående (0 när betald). `FinalPayDate` finns men vi förlitar
 * oss på DueDate + Balance-filtret.
 */
export interface FortnoxInvoiceListItem {
  DocumentNumber?: string
  InvoiceNumber?: string
  CustomerNumber?: string
  CustomerName?: string
  InvoiceDate?: string
  DueDate?: string
  Total?: number
  Balance?: number
  Currency?: string
  FullyPaid?: boolean
  Cancelled?: boolean
  Booked?: boolean
}

interface FortnoxInvoicesListResponse {
  Invoices?: FortnoxInvoiceListItem[]
  MetaInformation?: {
    '@TotalResources'?: number
    '@TotalPages'?: number
    '@CurrentPage'?: number
  }
}

/**
 * Hämta ÖPPNA/OBETALDA fakturor från Fortnox.
 *
 * Använder Fortnox list-filter `?filter=unpaid` (öppna, ej fullbetalda — inte
 * bara förfallna, så Karin ser hela bilden). Fortnox stödjer även
 * `unpaidoverdue`, men vi vill ha ALLA obetalda. Se Fortnox API v3-docs:
 * GET /3/invoices?filter=unpaid.
 *
 * PAGINERING: Fortnox paginerar (~500/sida). Vi loopar via `?page=N` tills
 * MetaInformation säger att vi är på sista sidan, med en säkerhetscap
 * (MAX_PAGES) så en trasig meta inte ger oändlig loop.
 *
 * Filtrerar bort Cancelled/FullyPaid klient-sidan som skyddsnät (om Fortnox-
 * filtret skulle släppa igenom något).
 *
 * Återanvänder fortnoxRequest → token-refresh + audit-logg sköts där.
 */
export async function getFortnoxInvoices(
  businessId: string
): Promise<FortnoxInvoiceListItem[]> {
  const MAX_PAGES = 4 // ~500/sida × 4 = 2000, rimlig cap för pilot-volym
  const all: FortnoxInvoiceListItem[] = []

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const response = await fortnoxRequest<FortnoxInvoicesListResponse>(
        businessId,
        'GET',
        `/invoices?filter=unpaid&page=${page}`
      )

      const rows = response.Invoices ?? []
      all.push(...rows)

      const totalPages = response.MetaInformation?.['@TotalPages'] ?? 1
      const currentPage = response.MetaInformation?.['@CurrentPage'] ?? page
      if (rows.length === 0 || currentPage >= totalPages) break
    }
  } catch (error) {
    console.error('Get Fortnox invoices error:', error)
    throw error
  }

  // Skyddsnät: filtrera bort makulerade och fullbetalda även om filtret missar.
  return all.filter(inv => !inv.Cancelled && !inv.FullyPaid)
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

    // Get invoice — invoice saknar FK till customer i prod, en embed
    // (`customer(...)`) avvisar HELA queryn (PGRST200). Hämta kund separat.
    const { data: invoice, error: fetchError } = await supabase
      .from('invoice')
      .select('*')
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

    // Kunden är KRÄVD för Fortnox-synk — degradera inte tyst till null.
    if (invoice.customer_id) {
      const { data: customerData, error: customerErr } = await supabase
        .from('customer')
        .select('customer_id, name, email, phone_number, address_line, fortnox_customer_number')
        .eq('customer_id', invoice.customer_id)
        .maybeSingle()
      if (customerErr) {
        return { success: false, error: `Could not fetch customer: ${customerErr.message}` }
      }
      invoice.customer = customerData
    } else {
      invoice.customer = null
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
 *
 * @deprecated 2026-06-03 — kräver `bookkeeping`-scope som inte längre
 * ingår i `FORTNOX_SCOPES` (slimmad till invoice/customer/companyinformation
 * per tasks/fortnox-scope-audit.md). Lägg tillbaka scope + kräv re-OAuth
 * innan du anropar denna. Fortnox bokför automatiskt vid betalning så
 * manuell bokföring från Handymate är sällan motiverat.
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
 *
 * @deprecated 2026-06-03 — kräver `payment`-scope som inte längre ingår
 * i `FORTNOX_SCOPES` (slimmad per tasks/fortnox-scope-audit.md). Lägg
 * tillbaka scope + kräv re-OAuth innan användning. Cron-jobbet syncar
 * inkommande betalningsstatus via GET /invoices/{id} (Balance-fältet),
 * vilket kräver bara `invoice`-scope — `payment` behövs endast om vi
 * vill PUSHA betalningar (kräver bank-integration som inte finns).
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
 *
 * @deprecated 2026-06-03 — kräver `offer`-scope som inte längre ingår
 * i `FORTNOX_SCOPES`. Strategiskt val: Handymate äger offert-flödet
 * (signering, portal, status-tracking); Fortnox behöver bara se den
 * resulterande fakturan.
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
 *
 * @deprecated 2026-06-03 — kräver `offer`-scope (slimmad bort per
 * tasks/fortnox-scope-audit.md). Kallar createFortnoxOffer som också
 * är deprecated. Lägg tillbaka `offer`-scope + re-OAuth innan
 * användning.
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

    // Get quote — quotes saknar FK till customer i prod, en embed
    // (`customer(...)`) avvisar HELA queryn (PGRST200). Hämta kund separat.
    const { data: quote, error: fetchError } = await supabase
      .from('quotes')
      .select('*')
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

    // Kunden är KRÄVD för Fortnox-synk — degradera inte tyst till null.
    if (quote.customer_id) {
      const { data: customerData, error: customerErr } = await supabase
        .from('customer')
        .select('customer_id, name, email, phone_number, address_line, fortnox_customer_number')
        .eq('customer_id', quote.customer_id)
        .maybeSingle()
      if (customerErr) {
        return { success: false, error: `Could not fetch customer: ${customerErr.message}` }
      }
      quote.customer = customerData
    } else {
      quote.customer = null
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
