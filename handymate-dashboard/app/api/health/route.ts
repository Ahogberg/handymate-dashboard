import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {}

  // Check database connectivity
  try {
    const supabase = getServerSupabase()
    const { error } = await supabase.from('business_config').select('business_id').limit(1)
    checks.database = error ? 'error' : 'ok'
  } catch {
    checks.database = 'error'
  }

  // Check env vars
  checks.supabase_url = process.env.NEXT_PUBLIC_SUPABASE_URL ? 'ok' : 'error'
  checks.anthropic_key = process.env.ANTHROPIC_API_KEY ? 'ok' : 'error'
  checks.elks_credentials = (process.env.ELKS_API_USER && process.env.ELKS_API_PASSWORD) ? 'ok' : 'error'

  const allOk = Object.values(checks).every(v => v === 'ok')

  return NextResponse.json({
    status: allOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'dev',
    checks
  }, { status: allOk ? 200 : 503 })
}
