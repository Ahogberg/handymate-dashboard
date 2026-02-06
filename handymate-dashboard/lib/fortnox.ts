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
    fortnox_token_expires_at: expiresAt
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
      fortnox_company_name: null
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
 * Make an authenticated request to Fortnox API
 */
export async function fortnoxRequest<T = unknown>(
  businessId: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  data?: unknown
): Promise<T> {
  const accessToken = await refreshTokenIfNeeded(businessId)

  if (!accessToken) {
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

  const response = await fetch(url, options)

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`Fortnox API error (${endpoint}):`, errorText)
    throw new Error(`Fortnox API error: ${response.status}`)
  }

  // Some endpoints return empty response
  const text = await response.text()
  if (!text) {
    return {} as T
  }

  return JSON.parse(text)
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
