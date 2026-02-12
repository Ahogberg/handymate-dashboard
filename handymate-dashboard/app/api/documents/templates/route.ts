import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET - List templates (system + business custom)
 * Query params: category_id, branch
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const categoryId = request.nextUrl.searchParams.get('category_id')
    const branch = request.nextUrl.searchParams.get('branch')

    let query = supabase
      .from('document_template')
      .select('*, category:category_id(id, name, slug, icon)')
      .or(`business_id.is.null,business_id.eq.${business.business_id}`)
      .eq('is_active', true)
      .order('is_system', { ascending: false })
      .order('name', { ascending: true })

    if (categoryId) {
      query = query.eq('category_id', categoryId)
    }

    if (branch) {
      query = query.or(`branch.is.null,branch.eq.${branch}`)
    }

    const { data: templates, error } = await query

    if (error) throw error

    return NextResponse.json({ templates: templates || [] })
  } catch (error: any) {
    console.error('Get templates error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Create custom template
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { name, description, category_id, content, variables, branch } = body

    if (!name || !content) {
      return NextResponse.json({ error: 'Namn och innehåll krävs' }, { status: 400 })
    }

    const { data: template, error } = await supabase
      .from('document_template')
      .insert({
        business_id: business.business_id,
        category_id: category_id || null,
        name,
        description: description || '',
        content,
        variables: variables || [],
        branch: branch || null,
        is_system: false,
        is_active: true,
      })
      .select('*, category:category_id(id, name, slug, icon)')
      .single()

    if (error) throw error

    return NextResponse.json({ template })
  } catch (error: any) {
    console.error('Create template error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
