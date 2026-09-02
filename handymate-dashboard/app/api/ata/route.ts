import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { maybeStripAtaList } from '@/lib/ata/strip-prices'
import { verifyOwnership } from '@/lib/auth/verify-ownership'
import { skapaAta } from '@/lib/ata/create-ata'

// Auth via request.headers i importerad helper — utan force-dynamic kan
// GET frysas i Full Route Cache och servera fel företags ÄTA (2026-08-22-
// klassen, se CLAUDE.md).
export const dynamic = 'force-dynamic'

/**
 * GET /api/ata?projectId=xxx — Lista ÄTA för ett projekt
 *
 * Rollskydd (TD-77, 2026-05-23): see_financials-stripping på belopp
 * för icke-behörig. Konsekvent med /api/projects/[id]/changes och
 * /api/projects/[id] huvud-endpoint.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const projectId = request.nextUrl.searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId krävs' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('project_change')
      .select('*')
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)
      .order('ata_number', { ascending: true })

    if (error) throw error

    const result = await maybeStripAtaList(request, data || [])
    return NextResponse.json({ atas: result.atas, ...result.flag })
  } catch (error: any) {
    console.error('GET /api/ata error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/ata — Skapa ny ÄTA
 * Body: { projectId, changeType, description, items, notes, customerId }
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    const { projectId, changeType, description, items, notes, customerId } = body

    if (!projectId || !description || !changeType) {
      return NextResponse.json({ error: 'Projekt, beskrivning och typ av ändring krävs' }, { status: 400 })
    }

    // Både projekt och valfri kund kommer från request-body. Service role
    // kringgår RLS, därför verifieras båda länkarna före insert.
    const ownership = await verifyOwnership(supabase, business.business_id, [
      {
        table: 'project',
        idColumn: 'project_id',
        idValue: projectId,
        label: 'projekt',
      },
      {
        table: 'customer',
        idColumn: 'customer_id',
        idValue: customerId,
        label: 'kund',
      },
    ])
    if (!ownership.ok) {
      return NextResponse.json(
        { error: 'Projekt eller kund tillhör inte företaget' },
        { status: 403 },
      )
    }

    // Delad skapande-väg (lib/ata/create-ata.ts): sign_token, normaliserade
    // rader, total, fryst vat_rate, status 'draft'. ata_number sätts av
    // DB-triggern per projekt.
    const resultat = await skapaAta(supabase, business, {
      projectId,
      changeType,
      description,
      items,
      hours: body.hours,
      notes,
      customerId,
    })
    if (!resultat.ok) {
      return NextResponse.json({ error: resultat.error }, { status: resultat.status })
    }

    return NextResponse.json({ ata: resultat.ata })
  } catch (error: any) {
    console.error('POST /api/ata error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
