import { createClient } from '@supabase/supabase-js'

const FORTNOX_CLIENT_ID = process.env.FORTNOX_CLIENT_ID!
const FORTNOX_CLIENT_SECRET = process.env.FORTNOX_CLIENT_SECRET!
// OAuth-flödet (auth-URL, code-exchange, redirect-URI) ägs helt av
// app/api/integrations/fortnox/connect + callback — det enda rutt-trädet
// sedan konsolideringen 2026-08-10. Redirect-URI:n som ska vara registrerad
// hos Fortnox: {APP_URL}/api/integrations/fortnox/callback.
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

  const [{ data: credentials, error: credentialsError }, { data: metadata, error: metadataError }] = await Promise.all([
    supabase
      .from('business_integration_credentials')
      .select('fortnox_access_token, fortnox_refresh_token, fortnox_token_expires_at')
      .eq('business_id', businessId)
      .maybeSingle(),
    supabase
    .from('business_config')
      .select('fortnox_connected_at, fortnox_company_name')
      .eq('business_id', businessId)
      .maybeSingle(),
  ])

  if (credentialsError || metadataError || !metadata) {
    return null
  }

  return {
    fortnox_access_token: credentials?.fortnox_access_token ?? null,
    fortnox_refresh_token: credentials?.fortnox_refresh_token ?? null,
    fortnox_token_expires_at: credentials?.fortnox_token_expires_at ?? null,
    fortnox_connected_at: metadata.fortnox_connected_at ?? null,
    fortnox_company_name: metadata.fortnox_company_name ?? null,
  }
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

  const { error: credentialError } = await supabase
    .from('business_integration_credentials')
    .upsert({
      business_id: businessId,
      fortnox_access_token: tokens.access_token,
      fortnox_refresh_token: tokens.refresh_token,
      fortnox_token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id' })

  if (credentialError) {
    console.error('Save Fortnox credentials error:', credentialError)
    throw new Error('Failed to save Fortnox tokens')
  }

  const updateData: Record<string, unknown> = {
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

  const { error: credentialError } = await supabase
    .from('business_integration_credentials')
    .delete()
    .eq('business_id', businessId)

  if (credentialError) {
    console.error('Clear Fortnox credentials error:', credentialError)
    throw new Error('Failed to clear Fortnox connection')
  }

  const { error } = await supabase
    .from('business_config')
    .update({
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
  Type?: 'PRIVATE' | 'COMPANY'
  OrganisationNumber?: string
  /** 13-siffrigt GLN — adressen Fortnox e-fakturaoperatoren routar mot. */
  GLN?: string
  GLNDelivery?: string
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

    // Create in Fortnox. Type/OrganisationNumber/GLN skickas med redan vid
    // skapandet om ifyllda (E-faktura, 2026-08-21) — sync-to-fortnox.ts gör
    // dessutom en egen uppdatering vid varje fakturasynk, så en GLN som
    // läggs till EFTER att kunden redan synkats når Fortnox ändå.
    const fortnoxCustomer = await createFortnoxCustomer(businessId, {
      Name: customer.name,
      Email: customer.email || undefined,
      Phone1: customer.phone_number || undefined,
      Address1: address1 || undefined,
      ZipCode: zipCode || undefined,
      City: city || undefined,
      Type: customer.customer_type === 'company' || customer.customer_type === 'brf' ? 'COMPANY' : 'PRIVATE',
      OrganisationNumber: customer.org_number || undefined,
      GLN: customer.gln_number || undefined,
      GLNDelivery: customer.gln_number || undefined,
    })

    // Update customer in DB.
    //
    // BUGFIX (2026-08-26, verifierat mot prod): kolumnen fortnox_sync_error
    // saknades i prod (sql/v70 la bara till två av tre) → PostgREST avvisade
    // HELA den här UPDATE:en → Fortnox-numret sparades aldrig → felet bara
    // console.error:ades OCH funktionen returnerade success:true ändå →
    // nästa fakturasynk skapade kunden PÅ NYTT i Fortnox. Dubblettkunder i
    // bokföringen vid varje faktura. sql/v169 lägger till kolumnen; koden
    // här får ALDRIG mer påstå success när numret inte persisterats —
    // Fortnox-kunden finns då, men Handymate vet inte om det, vilket är
    // exakt dubblettläget. Scopat på business_id (saknades).
    const { error: updateError } = await supabase
      .from('customer')
      .update({
        fortnox_customer_number: fortnoxCustomer.CustomerNumber,
        fortnox_synced_at: new Date().toISOString(),
        fortnox_sync_error: null
      })
      .eq('customer_id', customerId)
      .eq('business_id', businessId)

    if (updateError) {
      console.error('[syncCustomerToFortnox] Fortnox-kund skapad men numret kunde inte sparas:', updateError.message)
      try {
        const { rapporteraTystFel } = await import('@/lib/observability/driftlarm')
        await rapporteraTystFel(
          supabase,
          businessId,
          'fortnox:customer-number-not-persisted',
          updateError.message,
          { customerId, fortnoxCustomerNumber: fortnoxCustomer.CustomerNumber },
        )
      } catch { /* driftlarmet får aldrig fälla synken */ }
      return {
        success: false,
        customerNumber: fortnoxCustomer.CustomerNumber,
        error: `Kunden skapades i Fortnox (${fortnoxCustomer.CustomerNumber}) men numret kunde inte sparas lokalt: ${updateError.message}`,
      }
    }

    return { success: true, customerNumber: fortnoxCustomer.CustomerNumber }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Sync failed'

    // Log error to customer record — och läs felet: en misslyckad
    // felloggning ska synas i serverloggen, inte försvinna.
    const { error: markError } = await supabase
      .from('customer')
      .update({ fortnox_sync_error: errorMessage })
      .eq('customer_id', customerId)
      .eq('business_id', businessId)
    if (markError) {
      console.error('[syncCustomerToFortnox] kunde inte skriva fortnox_sync_error:', markError.message)
    }

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

// createFortnoxInvoice borttagen 2026-08-20 (konsolidering) — var bara
// använd av den nedan borttagna syncInvoiceToFortnox. Ersatt av
// lib/invoices/sync-to-fortnox.ts, som alla fyra tidigare separata
// fakturasynk-vägar nu pekar mot.

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

export interface FortnoxSupplierInvoiceListItem {
  GivenNumber?: string
  InvoiceNumber?: string
  SupplierNumber?: string
  SupplierName?: string
  InvoiceDate?: string
  DueDate?: string
  Total?: number
  Balance?: number
  Currency?: string
  Cancelled?: boolean
  Booked?: boolean
}

interface FortnoxSupplierInvoicesListResponse {
  SupplierInvoices?: FortnoxSupplierInvoiceListItem[]
  MetaInformation?: { '@TotalPages'?: number; '@CurrentPage'?: number }
}

interface FortnoxInvoicesListResponse {
  Invoices?: FortnoxInvoiceListItem[]
  MetaInformation?: {
    '@TotalResources'?: number
    '@TotalPages'?: number
    '@CurrentPage'?: number
  }
}

const INVOICE_PULL_MAX_PAGES = 4 // ~500/sida × 4 = 2000, rimlig cap PER pull

/**
 * Paginerad hämtning mot Fortnox /invoices med givna query-parametrar.
 * Loopar via `?page=N` tills MetaInformation säger att vi är på sista sidan,
 * med en säkerhetscap (INVOICE_PULL_MAX_PAGES) så en trasig meta inte ger
 * oändlig loop. Återanvänder fortnoxRequest → token-refresh + audit-logg
 * sköts där.
 */
async function fetchFortnoxInvoicePages(
  businessId: string,
  queryParams: string,
): Promise<FortnoxInvoiceListItem[]> {
  const all: FortnoxInvoiceListItem[] = []
  for (let page = 1; page <= INVOICE_PULL_MAX_PAGES; page++) {
    const response = await fortnoxRequest<FortnoxInvoicesListResponse>(
      businessId,
      'GET',
      `/invoices?${queryParams}&page=${page}`
    )

    const rows = response.Invoices ?? []
    all.push(...rows)

    const totalPages = response.MetaInformation?.['@TotalPages'] ?? 1
    const currentPage = response.MetaInformation?.['@CurrentPage'] ?? page
    if (rows.length === 0 || currentPage >= totalPages) break
  }
  return all
}

/**
 * Hämtar leverantörsfakturor från Fortnox — samma två-pull-strategi som
 * getFortnoxInvoices (obetalda utan tidsgräns + senaste 12 månaderna),
 * pull-only (Fortnox förblir bokföringens källa, se
 * docs/superpowers/specs/2026-08-19-leverantorsfakturor-design.md).
 */
export async function getFortnoxSupplierInvoices(
  businessId: string
): Promise<FortnoxSupplierInvoiceListItem[]> {
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setUTCMonth(twelveMonthsAgo.getUTCMonth() - 12)
  const fromDate = twelveMonthsAgo.toISOString().slice(0, 10)

  try {
    const [unpaid, recent] = await Promise.all([
      fetchFortnoxSupplierInvoicePages(businessId, 'filter=unpaid'),
      fetchFortnoxSupplierInvoicePages(businessId, `fromdate=${fromDate}`),
    ])
    const seen = new Set<string>()
    const merged: FortnoxSupplierInvoiceListItem[] = []
    for (const inv of [...unpaid, ...recent]) {
      const key = inv.GivenNumber ?? inv.InvoiceNumber
      if (!key || seen.has(key)) continue
      seen.add(key)
      merged.push(inv)
    }
    return merged.filter(inv => !inv.Cancelled)
  } catch (error) {
    console.error('Get Fortnox supplier invoices error:', error)
    throw error
  }
}

/**
 * Paginerad hämtning mot Fortnox /supplierinvoices med givna query-
 * parametrar. Speglar fetchFortnoxInvoicePages ovan. Återanvänder
 * fortnoxRequest → token-refresh + audit-logg sköts där.
 */
async function fetchFortnoxSupplierInvoicePages(
  businessId: string,
  queryParams: string,
): Promise<FortnoxSupplierInvoiceListItem[]> {
  const all: FortnoxSupplierInvoiceListItem[] = []
  for (let page = 1; page <= INVOICE_PULL_MAX_PAGES; page++) {
    const response = await fortnoxRequest<FortnoxSupplierInvoicesListResponse>(
      businessId,
      'GET',
      `/supplierinvoices?${queryParams}&page=${page}`
    )

    const rows = response.SupplierInvoices ?? []
    all.push(...rows)

    const totalPages = response.MetaInformation?.['@TotalPages'] ?? 1
    const currentPage = response.MetaInformation?.['@CurrentPage'] ?? page
    if (rows.length === 0 || currentPage >= totalPages) break
  }
  return all
}

/**
 * Ren. Ingen I/O. Deduperar två Fortnox-fakturalistor på DocumentNumber
 * (fallback InvoiceNumber, samma identitetslogik som mapFortnoxInvoice
 * använder senare) — `primary` vinner vid krock. Rader utan identitet i
 * NÅGON av listorna hoppas tyst över här (mapFortnoxInvoice hade gjort
 * detsamma längre fram i kedjan ändå — samma "gissa aldrig ett dokument-id"
 * -princip, bara tillämpad en gång i stället för två).
 */
export function mergeFortnoxInvoiceLists(
  primary: FortnoxInvoiceListItem[],
  secondary: FortnoxInvoiceListItem[],
): FortnoxInvoiceListItem[] {
  const keyFor = (inv: FortnoxInvoiceListItem): string | null => inv.DocumentNumber ?? inv.InvoiceNumber ?? null
  const byDoc = new Map<string, FortnoxInvoiceListItem>()
  for (const inv of primary) {
    const key = keyFor(inv)
    if (key) byDoc.set(key, inv)
  }
  for (const inv of secondary) {
    const key = keyFor(inv)
    if (key && !byDoc.has(key)) byDoc.set(key, inv)
  }
  return Array.from(byDoc.values())
}

/**
 * Hämta Fortnox-fakturor: alla ÖPPNA/OBETALDA (oavsett ålder) + betalda/
 * övriga senaste 12 månaderna (2026-08-15, historik-widening — se
 * tasks/todo.md).
 *
 * TVÅ separata Fortnox-anrop, ihopslagna:
 *   1. `?filter=unpaid`, ingen tidsgräns — ett obetalt ärende ska ALDRIG
 *      tappas bort för att det är gammalt (Karin ska fortfarande kunna jaga
 *      en tvåårig obetald faktura).
 *   2. `?fromdate=<12 månader sedan>`, inget filter — ger betalda fakturor
 *      (historik för marginal-/omsättningsanalys) OCH senaste årets öppna,
 *      men INTE äldre öppna (de täcks redan av pull 1). `fromdate` är ett
 *      dokumenterat Fortnox-parameter för invoices (format YYYY-MM-DD).
 *
 * Krockar (samma faktura i båda pullarna) dedupas — pull 1:s data vinner,
 * även om innehållet är identiskt i praktiken.
 *
 * PAGINERINGSCAP gäller PER pull (INVOICE_PULL_MAX_PAGES vardera) — värsta
 * fall alltså ~4000 rader totalt, inte 2000. Rimligt för pilot-volym; om ett
 * etablerat bolags obetalda lista ensam skulle slå taket är det redan ett
 * tecken på att importen behöver ses över separat.
 *
 * Filtrerar bort Cancelled klient-sidan som skyddsnät. FullyPaid filtreras
 * INTE längre bort (det är hela poängen med historik-pullen) — mappningen
 * (lib/fortnox/map-invoice.ts) sätter status:'paid' och outstanding:0 för
 * dem.
 */
export async function getFortnoxInvoices(
  businessId: string
): Promise<FortnoxInvoiceListItem[]> {
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setUTCMonth(twelveMonthsAgo.getUTCMonth() - 12)
  const fromDate = twelveMonthsAgo.toISOString().slice(0, 10)

  try {
    const [unpaid, recent] = await Promise.all([
      fetchFortnoxInvoicePages(businessId, 'filter=unpaid'),
      fetchFortnoxInvoicePages(businessId, `fromdate=${fromDate}`),
    ])
    const merged = mergeFortnoxInvoiceLists(unpaid, recent)
    return merged.filter(inv => !inv.Cancelled)
  } catch (error) {
    console.error('Get Fortnox invoices error:', error)
    throw error
  }
}

// syncInvoiceToFortnox (kundfaktura-versionen) borttagen 2026-08-20
// (konsolidering). Fanns tidigare här som en egen, oberoende
// implementation av samma sak som lib/invoices/sync-to-fortnox.ts gör —
// två separata implementationer råkade ha samma InvoiceNumber-bugg
// (se git-historik för fulla detaljer). Alla fyra anropsställen som
// använde denna (fakturalistans synk-knapp, Inställningars bulk-synk,
// agent-verktyget och automationsmotorn via lib/fortnox/sync.ts) pekar
// nu mot lib/invoices/sync-to-fortnox.ts istället — en källa, inte två.

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
