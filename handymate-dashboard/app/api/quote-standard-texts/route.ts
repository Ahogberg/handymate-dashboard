import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET - Lista standardtexter per business + typ
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const textType = request.nextUrl.searchParams.get('type')

    let query = supabase
      .from('quote_standard_texts')
      .select('*')
      .eq('business_id', business.business_id)
      .order('is_default', { ascending: false })
      .order('name')

    if (textType) {
      query = query.eq('text_type', textType)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ texts: data || [] })
  } catch (error: any) {
    console.error('Get standard texts error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa ny standardtext
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { text_type, name, content, is_default } = body

    if (!text_type || !name) {
      return NextResponse.json({ error: 'text_type and name are required' }, { status: 400 })
    }

    // If setting as default, unset other defaults of same type
    if (is_default) {
      await supabase
        .from('quote_standard_texts')
        .update({ is_default: false })
        .eq('business_id', business.business_id)
        .eq('text_type', text_type)
    }

    const id = 'qst_' + Math.random().toString(36).substr(2, 9)

    const { data, error } = await supabase
      .from('quote_standard_texts')
      .insert({
        id,
        business_id: business.business_id,
        text_type,
        name,
        content: content || '',
        is_default: is_default || false,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ text: data })
  } catch (error: any) {
    console.error('Create standard text error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera standardtext
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

    // If setting as default, unset other defaults of same type
    if (fields.is_default) {
      const { data: existing } = await supabase
        .from('quote_standard_texts')
        .select('text_type')
        .eq('id', id)
        .single()

      if (existing) {
        await supabase
          .from('quote_standard_texts')
          .update({ is_default: false })
          .eq('business_id', business.business_id)
          .eq('text_type', existing.text_type)
      }
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (fields.name !== undefined) updates.name = fields.name
    if (fields.content !== undefined) updates.content = fields.content
    if (fields.is_default !== undefined) updates.is_default = fields.is_default

    const { data, error } = await supabase
      .from('quote_standard_texts')
      .update(updates)
      .eq('id', id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ text: data })
  } catch (error: any) {
    console.error('Update standard text error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort standardtext
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
      .from('quote_standard_texts')
      .delete()
      .eq('id', id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete standard text error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
