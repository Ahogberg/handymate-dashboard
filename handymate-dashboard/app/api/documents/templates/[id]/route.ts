import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET - Get single template with full details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    const { data: template, error } = await supabase
      .from('document_template')
      .select('*, category:category_id(id, name, slug, icon)')
      .eq('id', id)
      .or(`business_id.is.null,business_id.eq.${business.business_id}`)
      .single()

    if (error || !template) {
      return NextResponse.json({ error: 'Mall hittades inte' }, { status: 404 })
    }

    return NextResponse.json({ template })
  } catch (error: any) {
    console.error('Get template error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH - Update custom template (only own templates)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    // Verify it's a custom template owned by this business
    const { data: existing } = await supabase
      .from('document_template')
      .select('id, is_system, business_id')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Mall hittades inte' }, { status: 404 })
    }

    if (existing.is_system) {
      return NextResponse.json({ error: 'Systemmallar kan inte redigeras' }, { status: 403 })
    }

    if (existing.business_id !== business.business_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.category_id !== undefined) updates.category_id = body.category_id
    if (body.content !== undefined) updates.content = body.content
    if (body.variables !== undefined) updates.variables = body.variables
    if (body.is_active !== undefined) updates.is_active = body.is_active

    const { data: template, error } = await supabase
      .from('document_template')
      .update(updates)
      .eq('id', id)
      .select('*, category:category_id(id, name, slug, icon)')
      .single()

    if (error) throw error

    return NextResponse.json({ template })
  } catch (error: any) {
    console.error('Update template error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Delete custom template
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    // Verify ownership
    const { data: existing } = await supabase
      .from('document_template')
      .select('id, is_system, business_id')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Mall hittades inte' }, { status: 404 })
    }

    if (existing.is_system) {
      return NextResponse.json({ error: 'Systemmallar kan inte tas bort' }, { status: 403 })
    }

    if (existing.business_id !== business.business_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { error } = await supabase
      .from('document_template')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete template error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
