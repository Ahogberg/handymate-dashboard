import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('job_template')
      .select('*')
      .eq('business_id', business.business_id)
      .order('is_favorite', { ascending: false, nullsFirst: false })
      .order('usage_count', { ascending: false })

    if (error) throw error

    return NextResponse.json({ templates: data || [] })
  } catch (error: any) {
    console.error('Get templates error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, branch, estimatedHours, laborCost, materials, totalEstimate,
            items, rot_rut_type, terms, category, is_favorite } = body

    if (!name) {
      return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('job_template')
      .insert({
        business_id: business.business_id,
        name,
        description: description || null,
        branch: branch || business.industry || null,
        estimated_hours: estimatedHours || null,
        labor_cost: laborCost || null,
        materials: materials || [],
        total_estimate: totalEstimate || null,
        items: items || [],
        rot_rut_type: rot_rut_type || null,
        terms: terms || {},
        category: category || null,
        is_favorite: is_favorite || false,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, template: data })
  } catch (error: any) {
    console.error('Create template error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, is_favorite } = body

    if (!id) {
      return NextResponse.json({ error: 'ID krävs' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('job_template')
      .update({ is_favorite: !!is_favorite })
      .eq('id', id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, template: data })
  } catch (error: any) {
    console.error('Update template error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await request.json()
    if (!id) {
      return NextResponse.json({ error: 'ID krävs' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const { error } = await supabase
      .from('job_template')
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
