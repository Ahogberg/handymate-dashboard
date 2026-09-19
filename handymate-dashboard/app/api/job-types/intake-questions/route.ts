import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { IntakeQuestionError } from '@/lib/quotes/intake-questions'
import { loadIntakeQuestions, writeIntakeQuestions } from '@/lib/quotes/intake-questions-server'

/**
 * Frågeflöde per jobbtyp (2026-09-17). GET läser frågorna som ställs när en
 * offert startas från jobbtypen (sparade eller seedade), PUT sparar firmans
 * egna. Samma behörighetsgränser som /api/job-types/quote-setup: den som får
 * bygga offerter läser, ägare och administratörer ändrar.
 */
export const dynamic = 'force-dynamic'

function failure(error: unknown) {
  if (error instanceof IntakeQuestionError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('[intake-questions] Request failed', error)
  return NextResponse.json({ error: 'Kunde inte läsa frågorna. Försök igen.' }, { status: 503 })
}

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Inte inloggad' }, { status: 401 })
    const user = await getCurrentUser(request, business.business_id)
    if (!user || !hasPermission(user, 'see_financials')) return NextResponse.json({ error: 'Behörighet saknas' }, { status: 403 })
    const view = await loadIntakeQuestions(getServerSupabase(), business.business_id, request.nextUrl.searchParams.get('jobType'))
    return NextResponse.json({ ...view, canManage: isOwnerOrAdmin(user) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return failure(error) }
}

export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Inte inloggad' }, { status: 401 })
    const user = await getCurrentUser(request, business.business_id)
    if (!user || !isOwnerOrAdmin(user)) return NextResponse.json({ error: 'Bara ägare och administratörer kan ändra frågorna.' }, { status: 403 })
    const body = await request.json().catch(() => null)
    const view = await writeIntakeQuestions(getServerSupabase(), business.business_id, body)
    return NextResponse.json({ ...view, canManage: true })
  } catch (error) { return failure(error) }
}
