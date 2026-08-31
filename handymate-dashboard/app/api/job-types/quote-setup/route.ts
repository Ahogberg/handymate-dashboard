import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { linkTemplateItem, linkTemplateToJobType, loadQuoteSetup, QuoteSetupError } from '@/lib/quotes/job-type-setup-server'

export const dynamic = 'force-dynamic'

function failure(error: unknown) {
  if (error instanceof QuoteSetupError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('[quote-setup] Request failed', error)
  return NextResponse.json({ error: 'Kunde inte läsa offertunderlaget. Försök igen.' }, { status: 503 })
}

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Inte inloggad' }, { status: 401 })
    const user = await getCurrentUser(request, business.business_id)
    if (!user || !hasPermission(user, 'see_financials')) return NextResponse.json({ error: 'Behörighet saknas' }, { status: 403 })
    return NextResponse.json({ ...(await loadQuoteSetup(getServerSupabase(), business.business_id)), canManage: isOwnerOrAdmin(user) })
  } catch (error) { return failure(error) }
}

export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Inte inloggad' }, { status: 401 })
    const user = await getCurrentUser(request, business.business_id)
    if (!user || !isOwnerOrAdmin(user)) return NextResponse.json({ error: 'Bara ägare och administratörer kan ändra upplägget.' }, { status: 403 })
    const body = await request.json().catch(() => null)
    const template = await linkTemplateToJobType(getServerSupabase(), business.business_id, body)
    return NextResponse.json({ template })
  } catch (error) { return failure(error) }
}

export async function PATCH(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Inte inloggad' }, { status: 401 })
    const user = await getCurrentUser(request, business.business_id)
    if (!user || !isOwnerOrAdmin(user)) return NextResponse.json({ error: 'Bara ägare och administratörer kan ändra upplägget.' }, { status: 403 })
    const body = await request.json().catch(() => null)
    const template = await linkTemplateItem(getServerSupabase(), business.business_id, body)
    return NextResponse.json({ template })
  } catch (error) { return failure(error) }
}
