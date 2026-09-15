import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin, AuthError } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { setBusinessPreference } from '@/lib/business-preferences'
import { loadPlanningStart } from '@/lib/onboarding/planning-start-data'
import { PLANNING_TEAM_KEY, PLANNING_CALENDAR_KEY } from '@/lib/onboarding/planning-start'

export const dynamic = 'force-dynamic'
async function context(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) throw new AuthError('Logga in för att fortsätta.', 401)
  const user = await getCurrentUser(request)
  if (!user || user.business_id !== business.business_id || !isOwnerOrAdmin(user)) throw new AuthError('Otillräcklig behörighet.', 403)
  return business.business_id
}
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Kunde inte läsa planeringen.' },
    { status: error instanceof AuthError ? error.status : 500 })
}
export async function GET(request: NextRequest) {
  try {
    const businessId = await context(request)
    const { view } = await loadPlanningStart(getServerSupabase(), businessId)
    return NextResponse.json(view)
  } catch (error) { return failure(error) }
}
export async function POST(request: NextRequest) {
  try {
    const businessId = await context(request)
    const body = await request.json().catch(() => null)
    if (!body || !['team', 'solo', 'calendar'].includes(body.action) || typeof body.revision !== 'string') {
      return NextResponse.json({ error: 'Välj vilket startsteg du vill bekräfta.' }, { status: 400 })
    }
    const { view, memberIds } = await loadPlanningStart(getServerSupabase(), businessId)
    if (body.revision !== view.revision) return NextResponse.json({ error: 'Underlaget har ändrats. Läs in det igen innan du bekräftar.' }, { status: 409 })
    if (!memberIds.length || (body.action === 'solo' && memberIds.length !== 1)) {
      return NextResponse.json({ error: 'Kontrollera medlemslistan innan du bekräftar.' }, { status: 409 })
    }
    if (body.action === 'calendar' && (!view.teamConfirmed || view.unresolvedCount > 0 || body.weekStart !== view.weekStart)) {
      return NextResponse.json({ error: 'Bekräfta teamet och kontrollera jobbens personer och tider först.' }, { status: 409 })
    }
    const key = body.action === 'calendar' ? PLANNING_CALENDAR_KEY : PLANNING_TEAM_KEY
    const value = JSON.stringify({ version: 1, confirmedAt: new Date().toISOString(), memberIds,
      ...(body.action === 'calendar' ? { weekStart: view.weekStart, revision: view.revision } : { mode: body.action }) })
    if (!await setBusinessPreference(businessId, key, value, 'user')) throw new Error('Bekräftelsen kunde inte sparas. Försök igen.')
    return NextResponse.json({ saved: true })
  } catch (error) { return failure(error) }
}
