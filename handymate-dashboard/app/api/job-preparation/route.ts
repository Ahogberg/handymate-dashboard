import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { loadJobPreparation } from '@/lib/job-preparation/load'
import { PreparationError } from '@/lib/job-preparation/types'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Du behöver logga in.' }, { status: 401, headers })
    const user = await getCurrentUser(request, business.business_id)
    if (!user || !user.is_active || user.business_id !== business.business_id) return NextResponse.json({ error: 'Du saknar behörighet.' }, { status: 403, headers })
    const query = request.nextUrl.searchParams
    const bookingId = query.get('booking_id')
    const projectId = query.get('project_id')
    if (Number(query.has('booking_id')) + Number(query.has('project_id')) !== 1 ||
      !/^[a-zA-Z0-9_-]{1,150}$/.test(bookingId || projectId || '') ||
      query.getAll('booking_id').length > 1 || query.getAll('project_id').length > 1) {
      return NextResponse.json({ error: 'Ange ett giltigt boknings- eller projekt-ID.' }, { status: 400, headers })
    }
    const preparation = await loadJobPreparation(getServerSupabase(), business.business_id, user,
      bookingId ? { bookingId } : { projectId: projectId! })
    return NextResponse.json({ preparation }, { headers })
  } catch (error) {
    const known = error instanceof PreparationError
    if (!known) console.error('[job-preparation] Read failed') // no customer data or raw DB errors
    return NextResponse.json({ error: known ? error.message : 'Förberedelsen kunde inte läsas. Försök igen.' }, { status: known ? error.status : 503, headers })
  }
}
