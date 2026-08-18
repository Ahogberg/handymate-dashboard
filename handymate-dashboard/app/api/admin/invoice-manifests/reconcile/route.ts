import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { reconcileInvoiceManifests } from '@/lib/invoices/evidence-manifest'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/invoice-manifests/reconcile
 *
 * Owner/admin-only, idempotent avstämning av fakturaunderlagets manifest
 * (Etapp P, sql/v148) — samma idiom och gate som
 * app/api/admin/project-outcomes/reconcile/route.ts. Läker prepared/
 * incomplete-rader där extern evidens (invoice.status+sent_at eller
 * customer_activity 'invoice_sent') visar att fakturan faktiskt levererades,
 * men manifestet av något skäl aldrig markerades 'delivered'.
 *
 * Inget schemalagt körschema i V1 — admin-triggad räcker tills incompletes
 * visar sig ackumuleras i praktiken (dokumenterat i evidence-manifest.ts).
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const requestedLimit = Number(body?.limit)
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.floor(requestedLimit), 1), 200)
      : 50

    const result = await reconcileInvoiceManifests(getServerSupabase(), business.business_id, { limit })
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[invoice-manifests/reconcile] error:', error)
    return NextResponse.json({ error: 'Fakturaunderlagen kunde inte stämmas av' }, { status: 500 })
  }
}
