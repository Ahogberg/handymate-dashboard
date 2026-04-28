import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface LogEntry {
  business_id: string
  endpoint: string
  method: string
  status_code?: number | null
  request_payload?: unknown
  response_payload?: unknown
  error_message?: string | null
  duration_ms?: number
}

/**
 * Logga ett Fortnox-API-anrop. Non-blocking — fel sväljs.
 *
 * Storleksgränser: payloads truncas till 50KB var för att undvika
 * att fylla DB med stora response-bodies (t.ex. listor med 1000+ fakturor).
 */
export async function logFortnoxApi(entry: LogEntry): Promise<void> {
  try {
    const supabase = getSupabase()
    await supabase.from('fortnox_api_log').insert({
      business_id: entry.business_id,
      endpoint: entry.endpoint,
      method: entry.method,
      status_code: entry.status_code ?? null,
      request_payload: truncatePayload(entry.request_payload),
      response_payload: truncatePayload(entry.response_payload),
      error_message: entry.error_message ?? null,
      duration_ms: entry.duration_ms ?? null,
    })
  } catch {
    /* non-blocking */
  }
}

function truncatePayload(payload: unknown): unknown {
  if (!payload) return null
  try {
    const str = typeof payload === 'string' ? payload : JSON.stringify(payload)
    if (str.length > 50_000) {
      return { _truncated: true, preview: str.slice(0, 2_000), original_size: str.length }
    }
    return typeof payload === 'string' ? payload : payload
  } catch {
    return null
  }
}
