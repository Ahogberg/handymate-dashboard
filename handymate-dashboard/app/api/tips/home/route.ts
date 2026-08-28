import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { resolveTaskScope, taskListOrFilter, canSeeTask } from '@/lib/tasks/visibility'
import { loadTipInputs, suggestHomeTips, type ProjectLite, type HomeTip } from '@/lib/tasks/lars-tips-batch'

export const dynamic = 'force-dynamic'

const MAX_TASKS = 3

interface HomeTaskDto {
  id: string
  title: string
  due_date: string | null
  overdue: boolean
  project_id: string | null
  project_number: string | null
  project_name: string | null
}

/**
 * GET /api/tips/home — "Dagens plan" på startsidan (2026-08-28).
 *
 * Dina uppgifter i dag (förfallna + dagens, samma rollgräns som /api/tasks)
 * och Lars tips över alla projekt du är med i — batchat, deterministiskt,
 * noll tokens. Läser bara. Ägare/admin ser alla aktiva projekt; anställd
 * ser projekt hen är med i (project_assignment).
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = getServerSupabase()
    const businessId = business.business_id
    const todayIso = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date())
    const currentUser = await getCurrentUser(request).catch(() => null)
    const scope = await resolveTaskScope(supabase, businessId, currentUser ? { id: currentUser.id, role: currentUser.role } : null, business.user_id ?? null)

    // Projekt användaren är med i
    let projectQuery = supabase
      .from('project')
      .select('project_id, project_number, name, description, job_type, status, start_date, end_date, completed_at, current_workflow_stage_id, customer_id, quote_id')
      .eq('business_id', businessId)
      .in('status', ['planning', 'active', 'in_progress', 'paused'])
      .order('start_date', { ascending: true, nullsFirst: false })
      .limit(60)
    if (scope.mode === 'own') {
      const memberIds = new Set<string>(scope.leadProjectIds)
      if (scope.memberId) {
        const { data: asg } = await supabase.from('project_assignment').select('project_id').eq('business_id', businessId).eq('business_user_id', scope.memberId)
        for (const a of asg || []) memberIds.add(a.project_id as string)
      }
      if (memberIds.size === 0) return NextResponse.json({ tasks: [], tasks_total: 0, tips: [] })
      projectQuery = projectQuery.in('project_id', Array.from(memberIds))
    }
    const { data: projects, error: projErr } = await projectQuery
    if (projErr) {
      console.error('[tips/home] project:', projErr.message)
      return NextResponse.json({ error: 'Kunde inte läsa projekten' }, { status: 500 })
    }
    const projectList = (projects || []) as ProjectLite[]
    const projectMeta = new Map(projectList.map(p => [p.project_id, p]))

    // Tips
    const { inputs, bookingToday } = await loadTipInputs(supabase, businessId, projectList, todayIso)
    const meta = new Map(projectList.map(p => [p.project_id, { name: p.name, project_number: p.project_number, bookingToday: bookingToday.get(p.project_id) ?? null }]))
    const tips: HomeTip[] = suggestHomeTips(inputs, meta)

    // Dina uppgifter i dag
    let taskQuery = supabase
      .from('task')
      .select('id, title, due_date, project_id, assigned_to, created_by, visibility')
      .eq('business_id', businessId)
      .neq('status', 'done')
      .lte('due_date', todayIso)
      .order('due_date', { ascending: true })
      .limit(100)
    const orFilter = taskListOrFilter(scope)
    if (orFilter) taskQuery = taskQuery.or(orFilter)
    const { data: taskRows, error: taskErr } = await taskQuery
    if (taskErr) console.error('[tips/home] task:', taskErr.message)
    const visibleTasks = ((taskRows || []) as Array<{ id: string; title: string; due_date: string | null; project_id: string | null; assigned_to: string | null; created_by: string | null; visibility: string | null }>)
      .filter(t => canSeeTask(t, scope))
    // Projektnamn/nummer även för uppgifter i projekt utanför listan ovan
    const missing = Array.from(new Set(visibleTasks.map(t => t.project_id).filter((x): x is string => !!x && !projectMeta.has(x))))
    if (missing.length) {
      const { data: extra } = await supabase.from('project').select('project_id, project_number, name').eq('business_id', businessId).in('project_id', missing)
      for (const p of extra || []) projectMeta.set(p.project_id as string, { project_id: p.project_id as string, project_number: (p.project_number as string | null) ?? null, name: p.name as string } as ProjectLite)
    }
    const tasks: HomeTaskDto[] = visibleTasks.slice(0, MAX_TASKS).map(t => ({
      id: t.id,
      title: t.title,
      due_date: t.due_date,
      overdue: Boolean(t.due_date && t.due_date.slice(0, 10) < todayIso),
      project_id: t.project_id,
      project_number: t.project_id ? projectMeta.get(t.project_id)?.project_number ?? null : null,
      project_name: t.project_id ? projectMeta.get(t.project_id)?.name ?? null : null,
    }))

    return NextResponse.json({ tasks, tasks_total: visibleTasks.length, tips, scope: scope.mode })
  } catch (error) {
    console.error('[tips/home] oväntat fel:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}
