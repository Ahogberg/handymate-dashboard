import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import {
  resolveAutoVariables,
  fillTemplateContent,
  fetchResolveContext,
} from '@/lib/document-generator'
import { GENERATED_DOCUMENT_SELECT, attachDocumentRelations } from '@/lib/documents/enrich'

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

    // OBS: inga customer/project-embeds — FK saknas i prod (PGRST200 dödade
    // tidigare HELA listan). Relationerna fästs separat via enrich-hjälparen.
    let query = supabase
      .from('generated_document')
      .select(GENERATED_DOCUMENT_SELECT)
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    if (projectId) query = query.eq('project_id', projectId)
    if (customerId) query = query.eq('customer_id', customerId)
    if (status) query = query.eq('status', status)

    const { data: rawDocuments, error } = await query

    if (error) throw error

    const documents = await attachDocumentRelations(supabase, business.business_id, rawDocuments || [])

    // Also fetch uploaded files from customer_document and project_document
    // (samma sak här: embeds borttagna, relationer fästs i JS nedan)
    const [custDocsRes, projDocsRes] = await Promise.all([
      supabase
        .from('customer_document')
        .select('*')
        .eq('business_id', business.business_id)
        .order('uploaded_at', { ascending: false }),
      supabase
        .from('project_document')
        .select('*')
        .eq('business_id', business.business_id)
        .order('created_at', { ascending: false }),
    ])

    const [custDocs, projDocs] = await Promise.all([
      attachDocumentRelations(supabase, business.business_id, custDocsRes.data || []),
      attachDocumentRelations(supabase, business.business_id, projDocsRes.data || []),
    ])

    // Normalize uploaded files into a unified shape
    const customerUploads = (custDocs || []).map((d: any) => ({
      id: d.id,
      source: 'customer' as const,
      file_name: d.file_name,
      file_url: d.file_url,
      file_type: d.file_type,
      file_size: d.file_size,
      category: d.category,
      customer_id: d.customer_id,
      customer_name: d.customer?.name || null,
      project_id: null,
      project_name: null,
      created_at: d.uploaded_at,
    }))

    const projectUploads = (projDocs || []).map((d: any) => ({
      id: d.id,
      source: 'project' as const,
      file_name: d.name,
      file_url: d.file_path,
      file_type: d.mime_type,
      file_size: d.file_size,
      category: d.category,
      customer_id: null,
      customer_name: null,
      project_id: d.project_id,
      project_name: d.project?.name || null,
      created_at: d.created_at,
    }))

    const uploaded_files = [...customerUploads, ...projectUploads]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json({ documents: documents || [], uploaded_files })
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

    // Create document. OBS: selecten får INTE innehålla customer/project-
    // embeds — FK saknas i prod, och en ogiltig select avvisar HELA insert-
    // statementet (samma tysta-fel-klass som Fortnox-kundimporten). Det var
    // därför noll dokument någonsin skapades i prod.
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
      .select(GENERATED_DOCUMENT_SELECT)
      .single()

    if (createError) throw createError

    const [enriched] = await attachDocumentRelations(supabase, business.business_id, [doc])

    return NextResponse.json({ document: enriched })
  } catch (error: any) {
    console.error('Generate document error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
