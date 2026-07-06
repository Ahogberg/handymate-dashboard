/**
 * Aha-onboardingens testfönster ("Ring ditt nummer nu").
 * State bor i business_config.onboarding_data.test_call (JSONB — ingen
 * migrering). Spec: tasks/aha-onboarding-spec.md.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export const ARM_WINDOW_MINUTES = 10

export interface TestCallState {
  armed_until?: string | null
  called_at?: string | null
  sms_sent?: boolean
  sms_error?: string | null
  lead_id?: string | null
  customer_id?: string | null
  deal_id?: string | null
}

/** Ren: är fönstret armerat vid `nowMs`? Fail-safe: allt tveksamt = false. */
export function isTestCallArmed(
  state: TestCallState | null | undefined,
  nowMs: number
): boolean {
  const until = state?.armed_until
  if (!until) return false
  const t = new Date(until).getTime()
  return isFinite(t) && t > nowMs
}

/** Läs test_call-staten (tom om saknas/fel — fail-safe mot gated). */
export async function readTestCall(
  supabase: SupabaseClient,
  businessId: string
): Promise<TestCallState> {
  const { data } = await supabase
    .from('business_config')
    .select('onboarding_data')
    .eq('business_id', businessId)
    .maybeSingle()
  return ((data?.onboarding_data as Record<string, unknown>)?.test_call as TestCallState) || {}
}

/**
 * Skriv test_call-staten med SPREAD-MERGE på onboarding_data (klipp aldrig
 * andra nycklar — samma mönster som app/api/onboarding/route.ts:80-88).
 * `patch` mergas in i befintlig test_call; { replace: true } ersätter helt.
 */
export async function writeTestCall(
  supabase: SupabaseClient,
  businessId: string,
  patch: TestCallState,
  { replace = false }: { replace?: boolean } = {}
): Promise<void> {
  const { data, error: readError } = await supabase
    .from('business_config')
    .select('onboarding_data')
    .eq('business_id', businessId)
    .maybeSingle()
  if (readError) throw new Error(`test_call read failed: ${readError.message}`)
  const existing = (data?.onboarding_data as Record<string, unknown>) || {}
  const current = (existing.test_call as TestCallState) || {}
  const next = replace ? patch : { ...current, ...patch }
  const { error } = await supabase
    .from('business_config')
    .update({ onboarding_data: { ...existing, test_call: next } })
    .eq('business_id', businessId)
  if (error) throw new Error(`test_call write failed: ${error.message}`)
}
