import { ensureOnboardingJobTypes, JobTypeSyncError } from '@/lib/job-types'
import { writeJobStandard } from '@/lib/quotes/job-standard-server'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { linkTemplateItem, linkTemplateToJobType, loadQuoteSetup, QuoteSetupError } from '@/lib/quotes/job-type-setup-server'

export const dynamic = 'force-dynamic'

function failure(error: unknown) {
  if (error instanceof QuoteSetupError || error instanceof JobTypeSyncError) return NextResponse.json({ error: error.message }, { status: error.status })
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

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Inte inloggad' }, { status: 401 })
    const user = await getCurrentUser(request, business.business_id)
    if (!user || !isOwnerOrAdmin(user)) return NextResponse.json({ error: 'Bara ägare och administratörer kan ändra upplägget.' }, { status: 403 })
    const body = await request.json().catch(() => null)
    if (body?.operation === 'syncOnboarding' && Object.keys(body).length === 1) {
      const db = getServerSupabase()
      const { data: config, error } = await db.from('business_config').select('specialties, services_offered').eq('business_id', business.business_id).single()
      if (error) throw new QuoteSetupError(503, 'Kunde inte läsa dina val från onboardingen.')
      const names = Array.isArray(config?.specialties) && config.specialties.length ? config.specialties : (config?.services_offered || [])
      return NextResponse.json({ jobTypes: await ensureOnboardingJobTypes(db, business.business_id, names) })
    }
    const template = await writeJobStandard(getServerSupabase(), business.business_id, body, (business as any).subscription_plan || 'starter')
    return NextResponse.json({ template })
  } catch (error) { return failure(error) }
}
