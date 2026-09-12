import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { reconcileFortnoxInvoice } from '@/lib/invoices/reconcile-fortnox'
export const maxDuration = 60
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const headers = { 'Cache-Control': 'no-store' }
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Logga in först.' }, { status: 401, headers })
  const user = await getCurrentUser(request, business.business_id)
  if (!user?.is_active || !isOwnerOrAdmin(user)) return NextResponse.json({ error: 'Endast ägare och administratör kan stämma av Fortnox.' }, { status: 403, headers })
  try {
    const result = await reconcileFortnoxInvoice(getServerSupabase(), business.business_id, params.id)
    return NextResponse.json(result, { status: result.outcome === 'unavailable' ? 503 : result.outcome === 'not_eligible' ? 404 : 200, headers })
  } catch {
    return NextResponse.json({ error: 'Kontrollen kunde inte slutföras.' }, { status: 503, headers })
  }
}
