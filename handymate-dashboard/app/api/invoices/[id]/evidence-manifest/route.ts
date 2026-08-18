import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { manifestId, isManifestSchemaMissing } from '@/lib/invoices/evidence-manifest'

export const dynamic = 'force-dynamic'

/**
 * GET /api/invoices/[id]/evidence-manifest
 *
 * Läser det frusna fakturaunderlaget (Etapp P, sql/v148). Owner/admin-only
 * — samma finansiella känslighet som value/ledger (verklig/utfall). Ledger-
 * idiomet (getCurrentUser + isOwnerOrAdmin), registrerat i
 * tests/permission-contract.spec.ts.
 *
 * Ren läsning, inget skrivs. Manifestet kan saknas helt (fakturan skickad
 * innan v148 kördes, prepare misslyckades, eller schemat inte körd än) —
 * det är ett normalt, förväntat läge, inte ett fel: { manifest: null }.
 * Ingen UI i V1 — det här är enbart läs-API:et.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('invoice_evidence_manifest')
      .select('*')
      .eq('id', manifestId(params.id))
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (error) {
      if (isManifestSchemaMissing(error)) {
        return NextResponse.json({ manifest: null })
      }
      console.error('[invoices/evidence-manifest] read error:', error)
      return NextResponse.json({ error: 'Underlaget kunde inte läsas' }, { status: 500 })
    }

    return NextResponse.json({ manifest: data || null })
  } catch (error: any) {
    console.error('[invoices/evidence-manifest] error:', error)
    return NextResponse.json({ error: error?.message || 'Serverfel' }, { status: 500 })
  }
}
