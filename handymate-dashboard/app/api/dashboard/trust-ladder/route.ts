import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { PATTERN_THRESHOLDS } from '@/lib/patterns/sample-thresholds'
import type { ApproveRateValue } from '@/lib/patterns/types'

/**
 * GET /api/dashboard/trust-ladder
 *
 * Läs-väg för "Förtroendetrappan" — exponerar approve_rate-patternet som
 * beräknas/upsertas av patterns-cronen (lib/patterns) men aldrig renderats.
 *
 * En rad per business via UNIQUE(business_id, pattern_key) → enkel single-read.
 *
 * ÄRLIGHET: returnerar rådata (per_agent rate + n + sample_size + confidence).
 * UI:t avgör vad som får visas — under preliminary-tröskeln (5) säger UI:t
 * "för lite data än", aldrig en rate. Vi hittar inte på siffror här.
 */

export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const t = PATTERN_THRESHOLDS.approve_rate
  const thresholds = { preliminary: t.preliminary, medium: t.medium, high: t.high }

  const { data, error } = await supabase
    .from('business_patterns')
    .select('value, sample_size, confidence, is_stale, last_calculated_at')
    .eq('business_id', business.business_id)
    .eq('pattern_key', 'approve_rate')
    .maybeSingle()

  if (error) {
    console.error('[trust-ladder] query error:', error)
    return NextResponse.json({ has_data: false, per_agent: {}, thresholds }, { status: 200 })
  }

  if (!data) {
    return NextResponse.json({
      has_data: false,
      per_agent: {},
      overall_rate: null,
      overall_n: 0,
      sample_size: 0,
      confidence: null,
      is_stale: true,
      thresholds,
      last_calculated_at: null,
    })
  }

  const value = (data.value || {}) as ApproveRateValue

  return NextResponse.json({
    has_data: true,
    per_agent: value.per_agent || {},
    overall_rate: value.overall_rate ?? null,
    overall_n: value.overall_n ?? 0,
    sample_size: data.sample_size ?? 0,
    confidence: data.confidence ?? null,
    is_stale: data.is_stale ?? true,
    thresholds,
    last_calculated_at: data.last_calculated_at ?? null,
  })
}
