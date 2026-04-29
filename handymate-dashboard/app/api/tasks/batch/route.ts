import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

interface BatchTaskInput {
  title: string
  description?: string | null
  priority?: 'low' | 'medium' | 'high'
  assigned_to?: string | null
  due_date?: string | null
  due_time?: string | null
}

interface BatchBody {
  tasks: BatchTaskInput[]
  /** Default-fält som appliceras på varje task om respektive fält saknas. */
  defaults?: {
    deal_id?: string | null
    project_id?: string | null
    customer_id?: string | null
    assigned_to?: string | null
    due_date?: string | null
    visibility?: 'private' | 'team' | 'project'
  }
}

/**
 * POST /api/tasks/batch
 *
 * Skapar flera tasks i ett anrop. Används av TaskPresetPicker när hantverkaren
 * väljer 3-5 uppgifter ur biblioteket vid deal/projekt-creation.
 *
 * Body:
 *   {
 *     tasks: [{ title, description?, priority?, assigned_to?, due_date?, due_time? }, ...],
 *     defaults?: { deal_id?, project_id?, customer_id?, assigned_to?, due_date?, visibility? }
 *   }
 *
 * Returnerar:
 *   { created: Task[], errors?: string[] }
 *
 * Valideringar:
 *   - tasks-array måste vara non-empty och max 50 items (skydd mot misbruk)
 *   - Varje task kräver `title`
 *   - assigned_to + dates på items overrideas av defaults om items saknar
 *   - default visibility = 'team' (samma som /api/tasks POST när deal_id finns)
 *
 * Varje task loggas i task_activity_log som 'created' (+ 'assigned' om tilldelad).
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedBusiness(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: BatchBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!Array.isArray(body.tasks) || body.tasks.length === 0) {
    return NextResponse.json({ error: 'tasks-array krävs och får ej vara tom' }, { status: 400 })
  }
  if (body.tasks.length > 50) {
    return NextResponse.json({ error: 'Max 50 tasks per anrop' }, { status: 400 })
  }

  const defaults = body.defaults || {}
  const supabase = getServerSupabase()

  // Bygg insert-rader. Default visibility = 'team' när det finns en deal/project,
  // annars 'private' — matchar singel-POST-logiken i ../route.ts.
  const inferredVisibility = defaults.visibility
    || (defaults.deal_id || defaults.project_id ? 'team' : 'private')

  const rowsToInsert = body.tasks
    .filter(t => t.title && t.title.trim().length > 0)
    .map(t => ({
      business_id: auth.business_id,
      title: t.title.trim(),
      description: t.description || null,
      status: 'pending',
      priority: t.priority || 'medium',
      due_date: t.due_date ?? defaults.due_date ?? null,
      due_time: t.due_time ?? null,
      assigned_to: t.assigned_to ?? defaults.assigned_to ?? null,
      customer_id: defaults.customer_id ?? null,
      deal_id: defaults.deal_id ?? null,
      project_id: defaults.project_id ?? null,
      created_by: auth.user_id,
      visibility: inferredVisibility,
    }))

  if (rowsToInsert.length === 0) {
    return NextResponse.json({ error: 'Inga giltiga titlar i tasks-array' }, { status: 400 })
  }

  const { data: created, error } = await supabase
    .from('task')
    .insert(rowsToInsert)
    .select()

  if (error) {
    console.error('[tasks/batch] insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Logga 'created' + 'assigned' per task — non-blocking, sväljs vid fel
  if (created && created.length > 0) {
    // Slå upp assignee-namn i en query
    const assignedIds = Array.from(
      new Set(created.filter((t: any) => t.assigned_to).map((t: any) => t.assigned_to as string))
    )
    let nameById: Record<string, string> = {}
    if (assignedIds.length > 0) {
      const { data: users } = await supabase
        .from('business_users')
        .select('id, name')
        .in('id', assignedIds)
      nameById = Object.fromEntries((users || []).map((u: any) => [u.id, u.name as string]))
    }

    const logRows = created.flatMap((t: any) => {
      const rows: Record<string, unknown>[] = [{
        task_id: t.id,
        business_id: auth.business_id,
        actor: auth.user_id,
        action: 'created',
        description: `Uppgift skapad: ${t.title}`,
        metadata: { batch: true },
      }]
      if (t.assigned_to) {
        rows.push({
          task_id: t.id,
          business_id: auth.business_id,
          actor: auth.user_id,
          action: 'assigned',
          description: `Tilldelad ${nameById[t.assigned_to] || t.assigned_to}`,
          new_value: t.assigned_to,
          metadata: { batch: true },
        })
      }
      return rows
    })

    await supabase.from('task_activity_log').insert(logRows).then(
      () => {},
      (err: Error) => console.error('[tasks/batch] activity log failed:', err.message)
    )
  }

  return NextResponse.json({ created: created || [] })
}
