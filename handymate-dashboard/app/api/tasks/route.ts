import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedBusiness(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const { searchParams } = request.nextUrl
  const status = searchParams.get('status')
  const customerId = searchParams.get('customer_id')
  const dealId = searchParams.get('deal_id')
  const projectId = searchParams.get('project_id')

  let query = supabase
    .from('task')
    .select('*')
    .eq('business_id', auth.business_id)
    .order('created_at', { ascending: false })

  if (status && status !== 'all') query = query.eq('status', status)
  if (customerId) query = query.eq('customer_id', customerId)
  if (dealId) query = query.eq('deal_id', dealId)
  if (projectId) query = query.eq('project_id', projectId)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ tasks: data || [] })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedBusiness(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'Title required' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('task')
    .insert({
      business_id: auth.business_id,
      title: body.title.trim(),
      description: body.description || null,
      status: body.status || 'pending',
      priority: body.priority || 'medium',
      due_date: body.due_date || null,
      due_time: body.due_time || null,
      assigned_to: body.assigned_to || null,
      customer_id: body.customer_id || null,
      deal_id: body.deal_id || null,
      project_id: body.project_id || null,
      created_by: auth.user_id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ task: data })
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthenticatedBusiness(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  if (!body.id) {
    return NextResponse.json({ error: 'Task id required' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const updates: Record<string, any> = {}
  if (body.title !== undefined) updates.title = body.title
  if (body.description !== undefined) updates.description = body.description
  if (body.status !== undefined) {
    updates.status = body.status
    if (body.status === 'done') updates.completed_at = new Date().toISOString()
    else updates.completed_at = null
  }
  if (body.priority !== undefined) updates.priority = body.priority
  if (body.due_date !== undefined) updates.due_date = body.due_date
  if (body.due_time !== undefined) updates.due_time = body.due_time

  const { data, error } = await supabase
    .from('task')
    .update(updates)
    .eq('id', body.id)
    .eq('business_id', auth.business_id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ task: data })
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedBusiness(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const taskId = request.nextUrl.searchParams.get('id')
  if (!taskId) {
    return NextResponse.json({ error: 'Task id required' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const { error } = await supabase
    .from('task')
    .delete()
    .eq('id', taskId)
    .eq('business_id', auth.business_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
