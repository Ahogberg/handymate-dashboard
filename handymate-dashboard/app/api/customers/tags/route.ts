import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/customers/tags - Hämta alla taggar för företaget
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { data: tags, error } = await supabase
      .from('customer_tag')
      .select('*, customer_tag_assignment(customer_id)')
      .eq('business_id', business.business_id)
      .order('name')

    if (error) throw error

    // Add customer count to each tag
    const tagsWithCount = (tags || []).map((tag: any) => ({
      ...tag,
      customer_count: tag.customer_tag_assignment?.length || 0,
      customer_tag_assignment: undefined,
    }))

    return NextResponse.json({ tags: tagsWithCount })
  } catch (error: any) {
    console.error('Get tags error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/customers/tags - Skapa ny tagg
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { name, color } = await request.json()

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('customer_tag')
      .insert({
        business_id: business.business_id,
        name: name.trim(),
        color: color || '#6366f1',
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Taggen finns redan' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json({ tag: data })
  } catch (error: any) {
    console.error('Create tag error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT /api/customers/tags - Tilldela/ta bort tagg från kund
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { customer_id, tag_id, action } = await request.json()

    if (!customer_id || !tag_id) {
      return NextResponse.json({ error: 'customer_id och tag_id krävs' }, { status: 400 })
    }

    // Verify ownership
    const { data: customer } = await supabase
      .from('customer')
      .select('customer_id')
      .eq('customer_id', customer_id)
      .eq('business_id', business.business_id)
      .single()

    if (!customer) {
      return NextResponse.json({ error: 'Kund hittades inte' }, { status: 404 })
    }

    if (action === 'remove') {
      const { error } = await supabase
        .from('customer_tag_assignment')
        .delete()
        .eq('customer_id', customer_id)
        .eq('tag_id', tag_id)

      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // Assign tag
    const { error } = await supabase
      .from('customer_tag_assignment')
      .insert({ customer_id, tag_id })

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: true }) // Already assigned
      }
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Assign tag error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/customers/tags - Ta bort tagg
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const tagId = request.nextUrl.searchParams.get('tagId')

    if (!tagId) {
      return NextResponse.json({ error: 'tagId krävs' }, { status: 400 })
    }

    const { error } = await supabase
      .from('customer_tag')
      .delete()
      .eq('tag_id', tagId)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete tag error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
