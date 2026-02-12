import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { renderDocumentHTML } from '@/lib/document-generator'

/**
 * GET - Get single document
 * Query param: format=html returns rendered HTML
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const format = request.nextUrl.searchParams.get('format')

    const { data: doc, error } = await supabase
      .from('generated_document')
      .select(`
        *,
        template:template_id(id, name, category_id, category:category_id(id, name, slug, icon)),
        customer:customer_id(customer_id, name, phone_number, email),
        project:project_id(project_id, name)
      `)
      .eq('id', id)
      .eq('business_id', business.business_id)
      .single()

    if (error || !doc) {
      return NextResponse.json({ error: 'Dokument hittades inte' }, { status: 404 })
    }

    // Return rendered HTML for preview/PDF
    if (format === 'html') {
      const html = renderDocumentHTML(doc, {
        business_name: business.business_name,
        org_number: business.org_number,
        contact_email: business.contact_email,
        phone_number: business.phone_number,
      })
      return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    return NextResponse.json({ document: doc })
  } catch (error: any) {
    console.error('Get document error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH - Update document (variables, content, status, signatures)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    // Verify ownership
    const { data: existing } = await supabase
      .from('generated_document')
      .select('id')
      .eq('id', id)
      .eq('business_id', business.business_id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Dokument hittades inte' }, { status: 404 })
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (body.title !== undefined) updates.title = body.title
    if (body.content !== undefined) updates.content = body.content
    if (body.variables_data !== undefined) updates.variables_data = body.variables_data
    if (body.status !== undefined) updates.status = body.status
    if (body.notes !== undefined) updates.notes = body.notes
    if (body.project_id !== undefined) updates.project_id = body.project_id
    if (body.customer_id !== undefined) updates.customer_id = body.customer_id

    // Signing
    if (body.signed_by_name) {
      updates.signed_by_name = body.signed_by_name
      updates.signed_at = new Date().toISOString()
      updates.signature_data = body.signature_data || null
      updates.signed_by_ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      if (updates.status === undefined) updates.status = 'completed'
    }

    // Customer signing
    if (body.customer_signed_name) {
      updates.customer_signed_name = body.customer_signed_name
      updates.customer_signed_at = new Date().toISOString()
      updates.customer_signature = body.customer_signature || null
      if (updates.status === undefined) updates.status = 'signed'
    }

    const { data: doc, error } = await supabase
      .from('generated_document')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        template:template_id(id, name, category_id, category:category_id(id, name, slug, icon)),
        customer:customer_id(customer_id, name, phone_number, email),
        project:project_id(project_id, name)
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ document: doc })
  } catch (error: any) {
    console.error('Update document error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Delete document
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    const { error } = await supabase
      .from('generated_document')
      .delete()
      .eq('id', id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete document error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
