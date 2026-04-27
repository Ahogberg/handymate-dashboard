import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

// Helper: log task activity
async function logTaskActivity(
  supabase: ReturnType<typeof getServerSupabase>,
  taskId: string,
  businessId: string,
  actor: string | null,
  action: string,
  description: string,
  oldValue?: string | null,
  newValue?: string | null,
  metadata?: Record<string, unknown>
) {
  await supabase.from('task_activity_log').insert({
    task_id: taskId,
    business_id: businessId,
    actor,
    action,
    description,
    old_value: oldValue || null,
    new_value: newValue || null,
    metadata: metadata || {},
  }).then(() => {}, (err: Error) => {
    console.error('[TaskActivity] Failed to log:', err.message)
  })
}

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
  const taskId = searchParams.get('id')
  const includeActivities = searchParams.get('include_activities') === 'true'

  // Single task with activities
  if (taskId && includeActivities) {
    const { data: task, error } = await supabase
      .from('task')
      .select('*')
      .eq('id', taskId)
      .eq('business_id', auth.business_id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: activities } = await supabase
      .from('task_activity_log')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
      .limit(50)

    // Resolve assigned user name
    let assignedUser = null
    if (task?.assigned_to) {
      const { data: user } = await supabase
        .from('business_users')
        .select('id, name, color')
        .eq('id', task.assigned_to)
        .single()
      assignedUser = user
    }

    return NextResponse.json({ task: { ...task, assigned_user: assignedUser }, activities: activities || [] })
  }

  const myOnly = searchParams.get('my') === 'true'
  const userId = auth.user_id

  let query = supabase
    .from('task')
    .select('*')
    .eq('business_id', auth.business_id)
    .order('created_at', { ascending: false })

  if (status && status !== 'all') query = query.eq('status', status)
  if (customerId) query = query.eq('customer_id', customerId)
  if (dealId) query = query.eq('deal_id', dealId)
  if (projectId) query = query.eq('project_id', projectId)

  // "Mina uppgifter" — bara tilldelade till mig eller skapade av mig
  if (myOnly && userId) {
    query = query.or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
  }

  const { data, error } = await query

  // Filtrera privata uppgifter — visa bara om jag är skapare eller tilldelad
  const filtered = (data || []).filter((t: any) => {
    if (t.visibility === 'private') {
      return t.created_by === userId || t.assigned_to === userId
    }
    return true // team + project synliga för alla
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Resolve assigned user names for all tasks
  const tasks: any[] = filtered
  const assignedIds = Array.from(new Set(tasks.filter((t: any) => t.assigned_to).map((t: any) => t.assigned_to as string)))
  let userMap: Record<string, { id: string; name: string; color: string }> = {}
  if (assignedIds.length > 0) {
    const { data: users } = await supabase
      .from('business_users')
      .select('id, name, color')
      .in('id', assignedIds)
    if (users) {
      userMap = Object.fromEntries(users.map((u: any) => [u.id, u]))
    }
  }

  const enrichedTasks = tasks.map((t: any) => ({
    ...t,
    assigned_user: t.assigned_to ? userMap[t.assigned_to] || null : null,
  }))

  return NextResponse.json({ tasks: enrichedTasks })
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
      visibility: body.visibility || (body.project_id ? 'project' : 'private'),
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Log creation
  await logTaskActivity(supabase, data.id, auth.business_id, auth.user_id, 'created', `Uppgift skapad: ${data.title}`)

  // Log assignment if assigned
  if (body.assigned_to) {
    const { data: assignee } = await supabase
      .from('business_users')
      .select('name')
      .eq('id', body.assigned_to)
      .single()
    await logTaskActivity(supabase, data.id, auth.business_id, auth.user_id, 'assigned',
      `Tilldelad ${assignee?.name || body.assigned_to}`, null, body.assigned_to)
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

  // Fetch current task for comparison
  const { data: oldTask } = await supabase
    .from('task')
    .select('*')
    .eq('id', body.id)
    .eq('business_id', auth.business_id)
    .single()

  if (!oldTask) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

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
  if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to
  if (body.visibility !== undefined) updates.visibility = body.visibility
  if (body.project_id !== undefined) updates.project_id = body.project_id || null
  if (body.customer_id !== undefined) updates.customer_id = body.customer_id || null
  if (body.deal_id !== undefined) updates.deal_id = body.deal_id || null

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

  // Log changes
  if (body.status !== undefined && body.status !== oldTask.status) {
    const statusLabels: Record<string, string> = { pending: 'Att göra', in_progress: 'Pågår', done: 'Klar' }
    await logTaskActivity(supabase, body.id, auth.business_id, auth.user_id,
      body.status === 'done' ? 'completed' : 'status_changed',
      `Status ändrad: ${statusLabels[oldTask.status] || oldTask.status} → ${statusLabels[body.status] || body.status}`,
      oldTask.status, body.status)
  }

  if (body.assigned_to !== undefined && body.assigned_to !== oldTask.assigned_to) {
    let assigneeName = body.assigned_to
    if (body.assigned_to) {
      const { data: assignee } = await supabase
        .from('business_users')
        .select('name')
        .eq('id', body.assigned_to)
        .single()
      assigneeName = assignee?.name || body.assigned_to
    }
    await logTaskActivity(supabase, body.id, auth.business_id, auth.user_id, 'assigned',
      body.assigned_to ? `Tilldelad ${assigneeName}` : 'Tilldelning borttagen',
      oldTask.assigned_to, body.assigned_to)
  }

  if (body.priority !== undefined && body.priority !== oldTask.priority) {
    const prioLabels: Record<string, string> = { low: 'Låg', medium: 'Medium', high: 'Hög' }
    await logTaskActivity(supabase, body.id, auth.business_id, auth.user_id, 'priority_changed',
      `Prioritet ändrad: ${prioLabels[oldTask.priority] || oldTask.priority} → ${prioLabels[body.priority] || body.priority}`,
      oldTask.priority, body.priority)
  }

  if ((body.due_date !== undefined && body.due_date !== oldTask.due_date) ||
      (body.due_time !== undefined && body.due_time !== oldTask.due_time)) {
    const oldDeadline = [oldTask.due_date, oldTask.due_time].filter(Boolean).join(' ') || 'ingen'
    const newDeadline = [body.due_date ?? oldTask.due_date, body.due_time ?? oldTask.due_time].filter(Boolean).join(' ') || 'ingen'
    await logTaskActivity(supabase, body.id, auth.business_id, auth.user_id, 'deadline_changed',
      `Deadline ändrad: ${oldDeadline} → ${newDeadline}`,
      oldDeadline, newDeadline)
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

  // Get task title for log
  const { data: task } = await supabase
    .from('task')
    .select('title')
    .eq('id', taskId)
    .eq('business_id', auth.business_id)
    .single()

  const { error } = await supabase
    .from('task')
    .delete()
    .eq('id', taskId)
    .eq('business_id', auth.business_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Log deletion
  await logTaskActivity(supabase, taskId, auth.business_id, auth.user_id, 'deleted',
    `Uppgift borttagen: ${task?.title || taskId}`)

  return NextResponse.json({ success: true })
}
