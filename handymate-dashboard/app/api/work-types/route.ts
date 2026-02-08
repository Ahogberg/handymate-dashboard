import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedBusiness } from '@/lib/auth'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET - Hämta arbetstyper för företaget
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('work_type')
      .select('*')
      .eq('business_id', business.business_id)
      .order('sort_order')

    if (error) throw error

    return NextResponse.json({ workTypes: data || [] })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch work types'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST - Skapa ny arbetstyp
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabase()
    const { name, multiplier, billable_default } = await request.json()

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })
    }

    // Get max sort_order
    const { data: existing } = await supabase
      .from('work_type')
      .select('sort_order')
      .eq('business_id', business.business_id)
      .order('sort_order', { ascending: false })
      .limit(1)

    const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1

    const { data, error } = await supabase
      .from('work_type')
      .insert({
        business_id: business.business_id,
        name: name.trim(),
        multiplier: multiplier ?? 1.0,
        billable_default: billable_default ?? true,
        sort_order: nextOrder
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ workType: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create work type'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera arbetstyp
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabase()
    const { work_type_id, name, multiplier, billable_default } = await request.json()

    if (!work_type_id) {
      return NextResponse.json({ error: 'work_type_id krävs' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('work_type')
      .update({
        name: name?.trim(),
        multiplier,
        billable_default
      })
      .eq('work_type_id', work_type_id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ workType: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update work type'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort arbetstyp
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabase()
    const workTypeId = request.nextUrl.searchParams.get('id')

    if (!workTypeId) {
      return NextResponse.json({ error: 'id krävs' }, { status: 400 })
    }

    // Check if any time entries reference this work type
    const { count } = await supabase
      .from('time_entry')
      .select('*', { count: 'exact', head: true })
      .eq('work_type_id', workTypeId)

    if (count && count > 0) {
      return NextResponse.json(
        { error: `Kan inte ta bort - ${count} tidposter använder denna arbetstyp` },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('work_type')
      .delete()
      .eq('work_type_id', workTypeId)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete work type'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
