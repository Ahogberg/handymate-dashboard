/**
 * Internal utility for triggering the AI agent from server-side code
 * (webhooks, cron jobs, other API routes) without user session auth.
 *
 * Uses X-Internal-Secret header with CRON_SECRET for authentication.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const INTERNAL_SECRET = process.env.CRON_SECRET || ''

// Log config on first use to help debug missing env vars in Vercel logs
let configLogged = false
function logConfig() {
  if (configLogged) return
  configLogged = true
  console.log(`[agent-trigger] URL=${APP_URL}, SECRET=${INTERNAL_SECRET ? 'set' : 'MISSING'}`)
}

interface AgentResult {
  success: boolean
  run_id?: string
  trigger_type?: string
  steps?: number
  tool_calls?: number
  tokens_used?: number
  duration_ms?: number
  final_response?: string
  duplicate?: boolean
  skipped?: string
  status?: string
  error?: string
}

/**
 * Trigger the agent and wait for the result.
 * Use for cron jobs or contexts where you need the agent's response.
 */
export async function triggerAgentInternal(
  businessId: string,
  triggerType: string,
  triggerData?: Record<string, unknown>,
  idempotencyKey?: string
): Promise<AgentResult> {
  logConfig()
  try {
    const res = await fetch(`${APP_URL}/api/agent/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({
        business_id: businessId,
        trigger_type: triggerType,
        trigger_data: triggerData,
        idempotency_key: idempotencyKey,
      }),
    })

    const data = await res.json()
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { success: false, error: 'Agenten returnerade ingen giltig körningskvittens.' }
    }
    if (!res.ok) return { ...data, success: false, error: data.error || `HTTP ${res.status}` }
    // A 200 can mean paused, out of fuel, or an unfinished duplicate run.
    // Callers must not advance a workflow just because transport succeeded.
    if (data.skipped || data.agent_paused || data.fuel_stopped || data.success === false || data.error
      || (data.status != null && data.status !== 'completed')
      || (data.duplicate && data.status !== 'completed')
      || typeof data.run_id !== 'string' || !data.run_id.trim()) {
      return { ...data, success: false, error: data.error || data.skipped || 'Agentens genomförda körning kunde inte bekräftas.' }
    }
    // This confirms a run, not delivery of an SMS, email, quote or invoice.
    return { ...data, success: true }
  } catch (err: any) {
    console.error('[triggerAgentInternal] Error:', err.message)
    return { success: false, error: err.message }
  }
}

/**
 * Trigger the agent without waiting for the result.
 * Use for webhooks that need to return 200 quickly.
 * Returns true if the request was sent successfully.
 */
export function triggerAgentFireAndForget(
  businessId: string,
  triggerType: string,
  triggerData?: Record<string, unknown>,
  idempotencyKey?: string
): void {
  logConfig()
  if (!INTERNAL_SECRET) {
    console.error('[triggerAgentFireAndForget] CRON_SECRET is not set — agent trigger will fail')
    return
  }
  fetch(`${APP_URL}/api/agent/trigger`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': INTERNAL_SECRET,
    },
    body: JSON.stringify({
      business_id: businessId,
      trigger_type: triggerType,
      trigger_data: triggerData,
      idempotency_key: idempotencyKey,
    }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error(`[triggerAgentFireAndForget] HTTP ${res.status}: ${body.substring(0, 200)}`)
      }
    })
    .catch(err => {
      console.error('[triggerAgentFireAndForget] Fetch error:', err.message)
    })
}

/**
 * Generate a deterministic idempotency key from components.
 * Used to prevent duplicate agent runs for the same event.
 */
export function makeIdempotencyKey(...parts: string[]): string {
  return parts.filter(Boolean).join('::')
}
