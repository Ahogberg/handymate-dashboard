import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { maybeStripAtaList } from '@/lib/ata/strip-prices'
import { canTransitionAta, isAtaEditable, ataTransitionError } from '@/lib/ata/lifecycle'
// Auth via request.headers i importerad helper — utan force-dynamic kan
// rutten frysas i Full Route Cache och servera fel företags data
// (2026-08-22-klassen, se CLAUDE.md; residualsvep 2026-08-31).
export const dynamic = 'force-dynamic'


/**
 * GET /api/ata/[id] — Hämta en ÄTA
 *
 * Rollskydd (TD-77, 2026-05-23): see_financials-stripping på belopp
 * för icke-behörig. Konsekvent med /api/ata och /api/projects/[id].
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    const { data, error } = await supabase
      .from('project_change')
      .select('*')
      .eq('change_id', params.id)
      .eq('business_id', business.business_id)
      .single()

    if (error) throw error

    // Återanvänd list-helpern via singel-array-wrap
    const result = await maybeStripAtaList(request, data ? [data] : [])
    return NextResponse.json({ ata: result.atas[0] ?? null, ...result.flag })
  } catch (error: any) {
    console.error('GET /api/ata/[id] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH /api/ata/[id] — Uppdatera ÄTA (redigera, godkänn, avslå)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    // Fetch current state
    const { data: existing, error: fetchError } = await supabase
      .from('project_change')
      .select('status')
      .eq('change_id', params.id)
      .eq('business_id', business.business_id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'ÄTA hittades inte' }, { status: 404 })
    }

    const updates: Record<string, any> = {}

    // Editable fields — bara i redigerbara lägen (lib/ata/lifecycle.ts)
    if (isAtaEditable(existing.status)) {
      if (body.description !== undefined) updates.description = body.description
      if (body.change_type !== undefined) updates.change_type = body.change_type
      if (body.items !== undefined) {
        updates.items = body.items
        const total = (body.items || []).reduce((sum: number, item: any) => {
          return sum + ((item.quantity || 0) * (item.unit_price || 0))
        }, 0)
        updates.total = total
        updates.amount = Math.abs(total)
      }
      if (body.hours !== undefined) updates.hours = body.hours
      if (body.notes !== undefined) updates.notes = body.notes
    }

    // Status transitions — matrisen bor i lib/ata/lifecycle.ts (P1-6):
    // en sanning, delad med projects/[id]/changes som tidigare var en
    // konkurrerande maskin utan regler alls.
    if (body.status !== undefined) {
      if (!canTransitionAta(existing.status, body.status)) {
        return NextResponse.json(
          { error: ataTransitionError(existing.status, body.status) },
          { status: 400 }
        )
      }

      updates.status = body.status

      if (body.status === 'approved') {
        updates.approved_at = new Date().toISOString()
      } else if (body.status === 'rejected') {
        updates.approved_at = null
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Inget att uppdatera' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('project_change')
      .update(updates)
      .eq('change_id', params.id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    // Update project timestamp
    if (data?.project_id) {
      await supabase
        .from('project')
        .update({ updated_at: new Date().toISOString() })
        .eq('project_id', data.project_id)
    }

    return NextResponse.json({ ata: data })
  } catch (error: any) {
    console.error('PATCH /api/ata/[id] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/ata/[id] — Ta bort ÄTA (bara draft/pending)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    // Only allow deleting draft/pending
    const { data: existing } = await supabase
      .from('project_change')
      .select('status')
      .eq('change_id', params.id)
      .eq('business_id', business.business_id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'ÄTA hittades inte' }, { status: 404 })
    }

    if (existing.status !== 'draft' && existing.status !== 'pending') {
      return NextResponse.json({ error: 'Kan bara ta bort utkast eller väntande ÄTA' }, { status: 400 })
    }

    const { error } = await supabase
      .from('project_change')
      .delete()
      .eq('change_id', params.id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE /api/ata/[id] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
