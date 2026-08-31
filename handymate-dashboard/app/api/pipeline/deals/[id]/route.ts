import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
// Auth via request.headers i importerad helper — utan force-dynamic kan
// rutten frysas i Full Route Cache och servera fel företags data
// (2026-08-22-klassen, se CLAUDE.md; residualsvep 2026-08-31).
export const dynamic = 'force-dynamic'


/**
 * GET - Hämta en deal
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

    // Rollgrind (2026-08-11, behörighetskontraktet): getAuthenticatedBusiness
    // avgör vilket FÖRETAG anropet gäller — inte vad användaren får se i det.
    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !hasPermission(currentUser, 'see_financials')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const { id } = params

    const { data: deal, error } = await supabase
      .from('deal')
      .select('*')
      .eq('id', id)
      .eq('business_id', business.business_id)
      .single()

    if (error || !deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
    }

    return NextResponse.json({ deal })
  } catch (error: any) {
    console.error('Get deal error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH - Uppdatera deal-fält
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

    // Ingen rollgrind på själva skrivningen — länka kund, sätta prioritet,
    // tilldela, flytta steg m.m. är vardaglig pipelinehantering för VARJE
    // anställd (samma resonemang som gör att /api/pipeline/deals POST är
    // självbetjäning). Men .select().single() nedan returnerar HELA raden,
    // inklusive value/won_value/lost_value, oavsett vilket fält som
    // patchades — det är en implicit läsning och degraderas därför
    // (2026-08-11), samma mönster som app/api/projects/route.ts redan
    // använder för budget_amount/budget_hours/actual_amount.
    const currentUser = await getCurrentUser(request, business.business_id)
    const canSeeFinancials = !currentUser || hasPermission(currentUser, 'see_financials')

    const supabase = getServerSupabase()
    const body = await request.json()
    const { id } = params

    // Only allow specific fields to be updated
    const allowedFields = [
      'title',
      'description',
      'value',
      'priority',
      'assigned_to',
      'customer_id',
      'quote_id',
      'invoice_id',
      'expected_close_date',
      'lost_reason',
    ]

    const updates: Record<string, any> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    // Always set updated_at
    updates.updated_at = new Date().toISOString()

    const { data: deal, error } = await supabase
      .from('deal')
      .update(updates)
      .eq('id', id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    const responseDeal = canSeeFinancials
      ? deal
      : (() => {
          const { value: _value, won_value: _wonValue, lost_value: _lostValue, ...rest } = deal as any
          return rest
        })()

    return NextResponse.json({ deal: responseDeal })
  } catch (error: any) {
    console.error('Update deal error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort deal
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
    const { id } = params

    // Verify deal belongs to business
    const { data: existing } = await supabase
      .from('deal')
      .select('id')
      .eq('id', id)
      .eq('business_id', business.business_id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
    }

    // Delete related pipeline_activity records first
    await supabase
      .from('pipeline_activity')
      .delete()
      .eq('deal_id', id)

    // Delete the deal
    const { error } = await supabase
      .from('deal')
      .delete()
      .eq('id', id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete deal error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
