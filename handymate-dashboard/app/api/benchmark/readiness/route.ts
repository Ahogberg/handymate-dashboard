import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import {
  BENCHMARK_POLICY,
  readBenchmarkReadiness,
} from '@/lib/benchmark/readiness'

export const dynamic = 'force-dynamic'

async function authorize(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const currentUser = await getCurrentUser(request, business.business_id)
  if (!currentUser || !isOwnerOrAdmin(currentUser)) {
    return {
      response: NextResponse.json(
        { error: 'Endast ägare och administratör' },
        { status: 403 },
      ),
    }
  }
  return { business, currentUser }
}
export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if ('response' in auth) return auth.response

    const snapshot = await readBenchmarkReadiness(
      getServerSupabase(),
      auth.business.business_id,
    )
    return NextResponse.json(snapshot, { status: snapshot.available ? 200 : 503 })
  } catch (error) {
    console.error('[benchmark/readiness] GET misslyckades:', error)
    return NextResponse.json(
      { error: 'Benchmark-status kunde inte läsas' },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if ('response' in auth) return auth.response

    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (typeof body?.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled måste vara boolean' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const { error } = await supabase.rpc('set_benchmark_consent', {
      p_business_id: auth.business.business_id,
      p_actor_business_user_id: auth.currentUser.id,
      p_enabled: body.enabled,
      p_consent_version: BENCHMARK_POLICY.consent_version,
    })

    if (error) {
      console.error('[benchmark/readiness] samtyckesändring misslyckades:', error)
      const forbidden = error.code === '42501'
      return NextResponse.json(
        { error: forbidden ? 'Benchmark-samtycke är inte tillåtet för kontot' : 'Samtycket kunde inte sparas' },
        { status: forbidden ? 403 : 503 },
      )
    }

    const snapshot = await readBenchmarkReadiness(supabase, auth.business.business_id)
    return NextResponse.json(snapshot, { status: snapshot.available ? 200 : 503 })
  } catch (error) {
    console.error('[benchmark/readiness] PUT misslyckades:', error)
    return NextResponse.json(
      { error: 'Samtycket kunde inte sparas' },
      { status: 500 },
    )
  }
}
