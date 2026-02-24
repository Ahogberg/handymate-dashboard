import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET - Lista offertmallar per business
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const branch = request.nextUrl.searchParams.get('branch')

    let query = supabase
      .from('quote_templates')
      .select('*')
      .eq('business_id', business.business_id)
      .order('is_favorite', { ascending: false })
      .order('usage_count', { ascending: false })

    if (branch) {
      query = query.eq('branch', branch)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ templates: data || [] })
  } catch (error: any) {
    console.error('Get templates error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa ny mall
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    const id = 'qtpl_' + Math.random().toString(36).substr(2, 9)

    const { data, error } = await supabase
      .from('quote_templates')
      .insert({
        id,
        business_id: business.business_id,
        name: body.name || 'Ny mall',
        description: body.description || null,
        branch: body.branch || null,
        category: body.category || null,
        introduction_text: body.introduction_text || null,
        conclusion_text: body.conclusion_text || null,
        not_included: body.not_included || null,
        ata_terms: body.ata_terms || null,
        payment_terms_text: body.payment_terms_text || null,
        default_items: body.default_items || [],
        default_payment_plan: body.default_payment_plan || [],
        detail_level: body.detail_level || 'detailed',
        show_unit_prices: body.show_unit_prices ?? true,
        show_quantities: body.show_quantities ?? true,
        rot_enabled: body.rot_enabled || false,
        rut_enabled: body.rut_enabled || false,
        is_favorite: body.is_favorite || false,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ template: data })
  } catch (error: any) {
    console.error('Create template error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera mall
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { id, ...fields } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    const allowedFields = [
      'name', 'description', 'branch', 'category',
      'introduction_text', 'conclusion_text', 'not_included', 'ata_terms', 'payment_terms_text',
      'default_items', 'default_payment_plan',
      'detail_level', 'show_unit_prices', 'show_quantities',
      'rot_enabled', 'rut_enabled', 'is_favorite',
    ]

    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        updates[key] = fields[key]
      }
    }

    const { data, error } = await supabase
      .from('quote_templates')
      .update(updates)
      .eq('id', id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ template: data })
  } catch (error: any) {
    console.error('Update template error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH - Toggle favorite
 */
export async function PATCH(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    // Get current state
    const { data: current } = await supabase
      .from('quote_templates')
      .select('is_favorite')
      .eq('id', id)
      .eq('business_id', business.business_id)
      .single()

    if (!current) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('quote_templates')
      .update({ is_favorite: !current.is_favorite, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ template: data })
  } catch (error: any) {
    console.error('Toggle favorite error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort mall
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const id = request.nextUrl.searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const { error } = await supabase
      .from('quote_templates')
      .delete()
      .eq('id', id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete template error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
