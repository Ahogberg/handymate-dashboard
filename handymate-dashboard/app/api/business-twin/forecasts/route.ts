import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import {
  createProjectMarginForecast,
  isProjectMarginWatchRequest,
  listProjectMarginForecasts,
  readProjectMarginForecast,
} from '@/lib/business-twin/watch-forecast'

export const dynamic = 'force-dynamic'

async function authorize(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const currentUser = await getCurrentUser(request, business.business_id)
  if (!currentUser || !isOwnerOrAdmin(currentUser)) {
    return { response: NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 }) }
  }
  return { business, currentUser }
}

/** Läs status för exakt den prognos som scenariokortet visar. */
export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if ('response' in auth) return auth.response

    const fingerprint = request.nextUrl.searchParams.get('fingerprint') || ''
    const projectId = request.nextUrl.searchParams.get('project_id') || ''
    if (projectId) {
      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(projectId)) {
        return NextResponse.json({ error: 'Ogiltig projektreferens' }, { status: 400 })
      }
      const result = await listProjectMarginForecasts(
        getServerSupabase(),
        auth.business.business_id,
        projectId,
      )
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
      return NextResponse.json({ available: result.available, forecasts: result.forecasts })
    }
    if (!/^btw_v1_[a-f0-9]{64}$/.test(fingerprint)) {
      return NextResponse.json({ error: 'Ogiltig prognosreferens' }, { status: 400 })
    }

    const result = await readProjectMarginForecast(
      getServerSupabase(),
      auth.business.business_id,
      fingerprint,
    )
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
    return NextResponse.json({ available: result.available, forecast: result.forecast })
  } catch (error) {
    console.error('[business-twin/forecasts] GET misslyckades:', error)
    return NextResponse.json({ error: 'Kunde inte läsa bevakningen' }, { status: 500 })
  }
}

/**
 * Frys en prognos efter uttryckligt klick. Klientens tal används aldrig:
 * requesten körs om genom Business Twin-motorn innan servern skriver raden.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if ('response' in auth) return auth.response

    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const expectedFingerprint = typeof body?.fingerprint === 'string' ? body.fingerprint : ''
    if (!isProjectMarginWatchRequest(body?.request)) {
      return NextResponse.json({ error: 'Ogiltigt bevakningsunderlag' }, { status: 400 })
    }

    const result = await createProjectMarginForecast({
      supabase: getServerSupabase(),
      businessId: auth.business.business_id,
      businessUserId: auth.currentUser.id,
      expectedFingerprint,
      request: body.request,
    })

    if (result.ok) {
      return NextResponse.json({ available: result.available, forecast: result.forecast })
    }
    if (result.code === 'invalid_request') {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    if (result.code === 'stale_scenario' || result.code === 'not_watchable') {
      return NextResponse.json({ error: result.error, latestScenario: result.latestScenario }, { status: 409 })
    }
    return NextResponse.json({ error: result.error || 'Bevakningen kunde inte sparas' }, { status: result.available ? 500 : 503 })
  } catch (error) {
    console.error('[business-twin/forecasts] POST misslyckades:', error)
    return NextResponse.json({ error: 'Bevakningen kunde inte sparas' }, { status: 500 })
  }
}
