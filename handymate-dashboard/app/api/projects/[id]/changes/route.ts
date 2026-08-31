import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { maybeStripAtaList } from '@/lib/ata/strip-prices'
import { canTransitionAta, isAtaEditable, ataTransitionError } from '@/lib/ata/lifecycle'
// Auth via request.headers i importerad helper — utan force-dynamic kan
// rutten frysas i Full Route Cache och servera fel företags data
// (2026-08-22-klassen, se CLAUDE.md; residualsvep 2026-08-31).
export const dynamic = 'force-dynamic'


/**
 * GET - Lista ÄTA för ett projekt
 *
 * Rollskydd (Etapp 4b steg 2 + TD-77, 2026-05-23): see_financials-
 * stripping via maybeStripAtaList-helpern. Konsekvent med
 * /api/projects/[id] och /api/ata. Helpern hanterar canSeePrices-
 * check + fält-stripping. Tunn route-skal.
 *
 * Publik signering via ?token= går INTE här — den ligger på
 * /api/ata/sign/[token]. Skicka-ÄTA-flödet via /api/ata/[id]/send
 * är opåverkat.
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

    const { data: changes, error } = await supabase
      .from('project_change')
      .select('*')
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    if (error) throw error

    const result = await maybeStripAtaList(request, changes || [])
    return NextResponse.json({ changes: result.atas, ...result.flag })

  } catch (error: any) {
    console.error('Get changes error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa ny ÄTA
 */
export async function POST(
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

    if (!body.description || !body.change_type) {
      return NextResponse.json({ error: 'Description and change_type required' }, { status: 400 })
    }

    const { data: change, error } = await supabase
      .from('project_change')
      .insert({
        business_id: business.business_id,
        project_id: params.id,
        change_type: body.change_type,
        description: body.description,
        amount: body.amount || 0,
        hours: body.hours || 0,
        status: 'pending'
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ change })

  } catch (error: any) {
    console.error('Create change error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera ÄTA (godkänn/avslå)
 */
export async function PUT(
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

    if (!body.change_id) {
      return NextResponse.json({ error: 'Missing change_id' }, { status: 400 })
    }

    /**
     * ═══ SAMMA LIVSCYKEL SOM /api/ata (P1-6, 2026-08-09) ═══
     *
     * Den här rutten var den konkurrerande maskinen: vilken status som helst
     * accepterades, och belopp/typ gick att redigera i vilket läge som helst
     * — även efter att kunden signerat. En signerad ÄTA vars belopp kan
     * skrivas om är samma felklass som den olåsta accepterade offerten.
     * Nu frågar båda rutterna samma matris i lib/ata/lifecycle.ts.
     */
    const { data: existing, error: fetchError } = await supabase
      .from('project_change')
      .select('status')
      .eq('change_id', body.change_id)
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'ÄTA hittades inte' }, { status: 404 })
    }

    const updates: Record<string, any> = {}

    if (isAtaEditable(existing.status)) {
      if (body.description !== undefined) updates.description = body.description
      if (body.amount !== undefined) updates.amount = body.amount
      if (body.hours !== undefined) updates.hours = body.hours
      if (body.change_type !== undefined) updates.change_type = body.change_type
    } else if (
      body.description !== undefined || body.amount !== undefined ||
      body.hours !== undefined || body.change_type !== undefined
    ) {
      return NextResponse.json(
        { error: 'ÄTA:ns innehåll är låst efter att den skickats. Skapa en ny ÄTA för ändringar.' },
        { status: 400 }
      )
    }

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
      } else {
        updates.approved_at = null
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Inget att uppdatera' }, { status: 400 })
    }

    const { data: change, error } = await supabase
      .from('project_change')
      .update(updates)
      .eq('change_id', body.change_id)
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    // If approved/rejected, update project budget with all approved changes
    if (body.status === 'approved' || body.status === 'rejected') {
      const { data: project } = await supabase
        .from('project')
        .select('budget_amount, budget_hours')
        .eq('project_id', params.id)
        .single()

      if (project) {
        await supabase
          .from('project')
          .update({ updated_at: new Date().toISOString() })
          .eq('project_id', params.id)
      }
    }

    return NextResponse.json({ change })

  } catch (error: any) {
    console.error('Update change error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort ÄTA (bara pending)
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
    const changeId = request.nextUrl.searchParams.get('changeId')

    if (!changeId) {
      return NextResponse.json({ error: 'Missing changeId' }, { status: 400 })
    }

    // Only allow deleting pending changes
    const { data: existing } = await supabase
      .from('project_change')
      .select('status')
      .eq('change_id', changeId)
      .single()

    if (existing?.status !== 'pending') {
      return NextResponse.json(
        { error: 'Kan bara ta bort väntande ÄTA' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('project_change')
      .delete()
      .eq('change_id', changeId)
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Delete change error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
