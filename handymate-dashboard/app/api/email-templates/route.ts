import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/email-templates - Hämta e-postmallar
 * Query: category
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const category = request.nextUrl.searchParams.get('category')

    let query = supabase
      .from('email_template')
      .select('*')
      .eq('business_id', business.business_id)
      .order('category')
      .order('name')

    if (category) query = query.eq('category', category)

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ templates: data || [] })
  } catch (error: any) {
    console.error('Get templates error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/email-templates - Skapa e-postmall
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { name, subject, body, category, variables } = await request.json()

    if (!name || !subject || !body) {
      return NextResponse.json({ error: 'Namn, ämne och innehåll krävs' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('email_template')
      .insert({
        business_id: business.business_id,
        name,
        subject,
        body,
        category: category || 'general',
        variables: variables || [],
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
 * PUT /api/email-templates - Uppdatera e-postmall
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { template_id, ...updates } = body

    if (!template_id) {
      return NextResponse.json({ error: 'template_id krävs' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('email_template')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('template_id', template_id)
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
 * DELETE /api/email-templates - Ta bort e-postmall
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const templateId = request.nextUrl.searchParams.get('templateId')

    if (!templateId) {
      return NextResponse.json({ error: 'templateId krävs' }, { status: 400 })
    }

    const { error } = await supabase
      .from('email_template')
      .delete()
      .eq('template_id', templateId)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete template error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
