import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import {
  resolveAutoVariables,
  fillTemplateContent,
  fetchResolveContext,
} from '@/lib/document-generator'

/**
 * GET - List generated documents
 * Query params: project_id, customer_id, status, template_id
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const projectId = request.nextUrl.searchParams.get('project_id')
    const customerId = request.nextUrl.searchParams.get('customer_id')
    const status = request.nextUrl.searchParams.get('status')

    let query = supabase
      .from('generated_document')
      .select(`
        *,
        template:template_id(id, name, category_id, category:category_id(id, name, slug, icon)),
        customer:customer_id(customer_id, name, phone_number, email),
        project:project_id(project_id, name)
      `)
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    if (projectId) query = query.eq('project_id', projectId)
    if (customerId) query = query.eq('customer_id', customerId)
    if (status) query = query.eq('status', status)

    const { data: documents, error } = await query

    if (error) throw error

    return NextResponse.json({ documents: documents || [] })
  } catch (error: any) {
    console.error('Get documents error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Generate a document from template
 * Body: { template_id, title, customer_id?, project_id?, variables_data? }
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { template_id, title, customer_id, project_id, variables_data } = body

    if (!template_id) {
      return NextResponse.json({ error: 'template_id krävs' }, { status: 400 })
    }

    // Fetch template
    const { data: template, error: tplError } = await supabase
      .from('document_template')
      .select('*')
      .eq('id', template_id)
      .single()

    if (tplError || !template) {
      return NextResponse.json({ error: 'Mall hittades inte' }, { status: 404 })
    }

    // Resolve auto variables
    const context = await fetchResolveContext(business.business_id, customer_id, project_id)
    const autoResolved = resolveAutoVariables(template.variables || [], context)

    // Merge: auto-resolved + user-provided (user overrides auto)
    const mergedVars = { ...autoResolved, ...(variables_data || {}) }

    // Fill template content
    const filledContent = fillTemplateContent(template.content || [], mergedVars)

    // Create document
    const { data: doc, error: createError } = await supabase
      .from('generated_document')
      .insert({
        business_id: business.business_id,
        template_id,
        project_id: project_id || null,
        customer_id: customer_id || null,
        title: title || template.name,
        content: filledContent,
        variables_data: mergedVars,
        status: 'draft',
        created_by: business.contact_name || null,
      })
      .select(`
        *,
        template:template_id(id, name, category_id, category:category_id(id, name, slug, icon)),
        customer:customer_id(customer_id, name, phone_number, email),
        project:project_id(project_id, name)
      `)
      .single()

    if (createError) throw createError

    return NextResponse.json({ document: doc })
  } catch (error: any) {
    console.error('Generate document error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
