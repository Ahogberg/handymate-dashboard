import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/form-submissions?projectId=xxx
 * Lista formulärinlämningar för ett projekt
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const projectId = request.nextUrl.searchParams.get('projectId')

    let query = supabase
      .from('form_submissions')
      .select('*, template:template_id(name, category)')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    if (projectId) query = query.eq('project_id', projectId)

    const { data, error } = await query

    if (error) throw error

    // Add progress info
    const submissions = (data || []).map((s: any) => {
      const fields = s.fields || []
      const answers = s.answers || {}
      const requiredFields = fields.filter((f: any) => f.required && f.type !== 'header')
      const answeredRequired = requiredFields.filter((f: any) => {
        const a = answers[f.id]
        if (!a) return false
        if (f.type === 'checkbox') return a.checked === true
        if (f.type === 'text') return !!a.value
        if (f.type === 'photo') return !!a.photo_url
        if (f.type === 'signature') return !!a.signature_data
        return false
      })
      return {
        ...s,
        progress: {
          total: requiredFields.length,
          completed: answeredRequired.length,
          percent: requiredFields.length > 0
            ? Math.round((answeredRequired.length / requiredFields.length) * 100)
            : 100,
        },
      }
    })

    return NextResponse.json({ submissions })
  } catch (error: any) {
    console.error('GET form-submissions error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/form-submissions — Skapa ny formulärinlämning från mall
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    if (!body.template_id && !body.name) {
      return NextResponse.json({ error: 'Mall eller namn krävs' }, { status: 400 })
    }

    let name = body.name || ''
    let fields: any[] = body.fields || []

    // If template_id provided, copy fields from template
    if (body.template_id) {
      const { data: template } = await supabase
        .from('form_templates')
        .select('name, fields')
        .eq('id', body.template_id)
        .single()

      if (template) {
        if (!name) name = template.name
        fields = template.fields || []
      }
    }

    const { data, error } = await supabase
      .from('form_submissions')
      .insert({
        business_id: business.business_id,
        project_id: body.project_id || null,
        template_id: body.template_id || null,
        name,
        fields,
        answers: {},
        status: 'draft',
      })
      .select('*, template:template_id(name, category)')
      .single()

    if (error) throw error

    return NextResponse.json({ submission: data })
  } catch (error: any) {
    console.error('POST form-submissions error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH /api/form-submissions — Uppdatera svar, status, signatur
 */
export async function PATCH(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    if (!body.id) {
      return NextResponse.json({ error: 'id krävs' }, { status: 400 })
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }

    if (body.answers !== undefined) updates.answers = body.answers
    if (body.fields !== undefined) updates.fields = body.fields
    if (body.name !== undefined) updates.name = body.name
    if (body.notes !== undefined) updates.notes = body.notes

    // Status transitions
    if (body.status === 'completed') {
      updates.status = 'completed'
      updates.completed_at = new Date().toISOString()
      if (body.completed_by) updates.completed_by = body.completed_by
    } else if (body.status === 'signed') {
      updates.status = 'signed'
      updates.signed_at = new Date().toISOString()
      if (body.signed_by_name) updates.signed_by_name = body.signed_by_name
      if (body.signature_data) updates.signature_data = body.signature_data
    } else if (body.status !== undefined) {
      updates.status = body.status
    }

    const { data, error } = await supabase
      .from('form_submissions')
      .update(updates)
      .eq('id', body.id)
      .eq('business_id', business.business_id)
      .select('*, template:template_id(name, category)')
      .single()

    if (error) throw error

    return NextResponse.json({ submission: data })
  } catch (error: any) {
    console.error('PATCH form-submissions error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/form-submissions?id=xxx
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
      return NextResponse.json({ error: 'id krävs' }, { status: 400 })
    }

    // Don't allow deleting signed submissions
    const { data: existing } = await supabase
      .from('form_submissions')
      .select('status')
      .eq('id', id)
      .eq('business_id', business.business_id)
      .single()

    if (existing?.status === 'signed') {
      return NextResponse.json({ error: 'Kan inte ta bort signerat formulär' }, { status: 400 })
    }

    const { error } = await supabase
      .from('form_submissions')
      .delete()
      .eq('id', id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE form-submissions error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
