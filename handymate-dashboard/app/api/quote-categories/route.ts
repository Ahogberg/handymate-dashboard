import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET - Hämta egna kategorier för företaget
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('custom_quote_categories')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at')

    if (error) throw error

    return NextResponse.json({ categories: data || [] })
  } catch (error: any) {
    console.error('Get custom categories error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa ny egen kategori
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    if (!body.label?.trim()) {
      return NextResponse.json({ error: 'Label krävs' }, { status: 400 })
    }

    const slug = body.slug || ('custom_' + body.label.toLowerCase()
      .replace(/[åä]/g, 'a').replace(/ö/g, 'o')
      .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''))

    const { data, error } = await supabase
      .from('custom_quote_categories')
      .insert({
        business_id: business.business_id,
        slug,
        label: body.label.trim(),
        rot_eligible: body.rot_eligible || false,
        rut_eligible: body.rut_eligible || false,
      })
      .select('*')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'En kategori med det namnet finns redan' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json({ category: data })
  } catch (error: any) {
    console.error('Create custom category error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera egen kategori
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    if (!body.id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const updates: Record<string, any> = {}
    if (body.label !== undefined) updates.label = body.label.trim()
    if (body.rot_eligible !== undefined) updates.rot_eligible = body.rot_eligible
    if (body.rut_eligible !== undefined) updates.rut_eligible = body.rut_eligible

    const { data, error } = await supabase
      .from('custom_quote_categories')
      .update(updates)
      .eq('id', body.id)
      .eq('business_id', business.business_id)
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ category: data })
  } catch (error: any) {
    console.error('Update custom category error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort egen kategori
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
      .from('custom_quote_categories')
      .delete()
      .eq('id', id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete custom category error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
