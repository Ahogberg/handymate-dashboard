import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { suggestProjectTasks, type LarsTip, type TipInput } from '@/lib/tasks/lars-tips'

export const dynamic = 'force-dynamic'

/**
 * /api/projects/[id]/tips — "Lars tipsar" (2026-08-28).
 *
 * GET räknar tipsen ur projektets steg och data — deterministiskt, noll
 * tokens, skriver ingenting. POST är hantverkarens handling: 'accept' skapar
 * en riktig uppgift (tilldelad projektledaren om en finns) och minns tipset;
 * 'dismiss' minns bara "inte aktuellt" (sql/v177). Max två tips åt gången
 * (lib/tasks/lars-tips.ts) — godkännandekorten får inte tryckas ner.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = getServerSupabase()
    const businessId = business.business_id
    const projectId = params.id

    const { data: project, error: projErr } = await supabase
      .from('project')
      .select('project_id, name, description, job_type, status, start_date, end_date, completed_at, current_workflow_stage_id, customer_id, quote_id')
      .eq('business_id', businessId)
      .eq('project_id', projectId)
      .maybeSingle()
    if (projErr) return NextResponse.json({ error: 'Kunde inte läsa projektet' }, { status: 500 })
    if (!project) return NextResponse.json({ error: 'Projektet hittades inte' }, { status: 404 })

    const todayIso = new Date().toISOString().slice(0, 10)
    const [bookings, materials, milestones, checklists, lastTime, customer, quote, installations, jobbpass, tasks, dismissals] = await Promise.all([
      supabase.from('booking').select('scheduled_start, status').eq('business_id', businessId).eq('project_id', projectId).limit(200),
      supabase.from('project_material').select('material_id', { count: 'exact', head: true }).eq('business_id', businessId).eq('project_id', projectId),
      supabase.from('project_milestone').select('milestone_id', { count: 'exact', head: true }).eq('project_id', projectId),
      supabase.from('project_checklist').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('project_id', projectId),
      supabase.from('time_entry').select('work_date').eq('business_id', businessId).eq('project_id', projectId).order('work_date', { ascending: false }).limit(1).maybeSingle(),
      project.customer_id
        ? supabase.from('customer').select('property_designation, personal_number').eq('business_id', businessId).eq('customer_id', project.customer_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      project.quote_id
        ? supabase.from('quotes').select('rot_deduction').eq('business_id', businessId).eq('quote_id', project.quote_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.from('installation').select('name').eq('business_id', businessId).eq('project_id', projectId).eq('status', 'confirmed').eq('serial_pending', true),
      supabase.from('jobbpass').select('status').eq('business_id', businessId).eq('project_id', projectId).maybeSingle(),
      supabase.from('task').select('title').eq('business_id', businessId).eq('project_id', projectId).neq('status', 'done').limit(200),
      supabase.from('project_tip_dismissal').select('tip_key').eq('business_id', businessId).eq('project_id', projectId),
    ])
    for (const [namn, r] of [['booking', bookings], ['project_material', materials], ['project_milestone', milestones], ['project_checklist', checklists], ['time_entry', lastTime], ['customer', customer], ['quotes', quote], ['installation', installations], ['jobbpass', jobbpass], ['task', tasks], ['project_tip_dismissal', dismissals]] as const) {
      if ((r as { error?: { message: string } | null }).error) console.error(`[projects/tips] ${namn}:`, (r as { error?: { message: string } | null }).error?.message)
    }

    let jobbpassNotified = false
    if (project.customer_id && jobbpass.data?.status === 'published') {
      const { data: logg } = await supabase
        .from('portal_notification_log')
        .select('id')
        .eq('business_id', businessId)
        .eq('customer_id', project.customer_id)
        .eq('event', 'jobbpass_published')
        .limit(1)
      jobbpassNotified = Boolean(logg && logg.length > 0)
    }

    const bookingRows = (bookings.data || []) as { scheduled_start: string | null; status: string | null }[]
    const liveBookings = bookingRows.filter(b => b.status !== 'cancelled')
    const input: TipInput = {
      todayIso,
      stageId: (project.current_workflow_stage_id as string | null) ?? null,
      status: (project.status as string | null) ?? null,
      startDate: (project.start_date as string | null) ?? null,
      endDate: (project.end_date as string | null) ?? null,
      completedAt: (project.completed_at as string | null) ?? null,
      name: project.name as string,
      description: (project.description as string | null) ?? null,
      jobType: (project.job_type as string | null) ?? null,
      bookingCount: liveBookings.length,
      upcomingBookingCount: liveBookings.filter(b => b.scheduled_start && b.scheduled_start.slice(0, 10) >= todayIso).length,
      materialCount: materials.count ?? 0,
      milestoneCount: milestones.count ?? 0,
      checklistCount: checklists.count ?? 0,
      lastTimeEntryDate: (lastTime.data?.work_date as string | null) ?? null,
      hasRot: Number((quote.data as { rot_deduction?: number | null } | null)?.rot_deduction ?? 0) > 0,
      customerPropertyDesignation: (customer.data as { property_designation?: string | null } | null)?.property_designation ?? null,
      customerPersonalNumber: (customer.data as { personal_number?: string | null } | null)?.personal_number ?? null,
      serialPendingInstallations: ((installations.data || []) as { name: string }[]).map(i => i.name),
      jobbpassStatus: jobbpass.data?.status === 'published' ? 'published' : jobbpass.data ? 'draft' : 'none',
      jobbpassNotified,
      openTaskTitles: ((tasks.data || []) as { title: string }[]).map(t => t.title),
      dismissedKeys: ((dismissals.data || []) as { tip_key: string }[]).map(d => d.tip_key),
    }
    const tips: LarsTip[] = suggestProjectTasks(input)
    return NextResponse.json({ tips })
  } catch (error) {
    console.error('[projects/tips] GET oväntat fel:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = (await request.json().catch(() => ({}))) as { action?: string; key?: string; title?: string; due_date?: string | null }
    if (!body.key || (body.action !== 'accept' && body.action !== 'dismiss')) {
      return NextResponse.json({ error: 'Ogiltig begäran' }, { status: 400 })
    }
    const supabase = getServerSupabase()
    const businessId = business.business_id
    const projectId = params.id
    const currentUser = await getCurrentUser(request).catch(() => null)

    const { data: project } = await supabase
      .from('project')
      .select('project_id')
      .eq('business_id', businessId)
      .eq('project_id', projectId)
      .maybeSingle()
    if (!project) return NextResponse.json({ error: 'Projektet hittades inte' }, { status: 404 })

    let taskId: string | null = null
    if (body.action === 'accept') {
      const title = (body.title || '').trim()
      if (!title) return NextResponse.json({ error: 'Tipset saknar titel' }, { status: 400 })
      // Tilldela projektledaren om en finns — annars ingen ansvarig, ärligt.
      const { data: lead } = await supabase
        .from('project_assignment')
        .select('business_user_id')
        .eq('business_id', businessId)
        .eq('project_id', projectId)
        .eq('role', 'lead')
        .limit(1)
        .maybeSingle()
      const { data: task, error: taskErr } = await supabase
        .from('task')
        .insert({
          business_id: businessId,
          project_id: projectId,
          title,
          description: null,
          status: 'pending',
          priority: 'medium',
          due_date: body.due_date || null,
          assigned_to: lead?.business_user_id ?? null,
          created_by: business.user_id ?? null,
          visibility: 'project',
        })
        .select('id')
        .single()
      if (taskErr) {
        console.error('[projects/tips] task insert:', taskErr.message)
        return NextResponse.json({ error: 'Kunde inte skapa uppgiften' }, { status: 500 })
      }
      taskId = task.id as string
    }

    const { error: dErr } = await supabase
      .from('project_tip_dismissal')
      .upsert({
        business_id: businessId,
        project_id: projectId,
        tip_key: body.key,
        outcome: body.action === 'accept' ? 'accepted' : 'dismissed',
        task_id: taskId,
        decided_by: currentUser?.id ?? null,
        decided_at: new Date().toISOString(),
      }, { onConflict: 'project_id,tip_key' })
    if (dErr) {
      console.error('[projects/tips] dismissal upsert:', dErr.message)
      return NextResponse.json({ error: 'Kunde inte spara beslutet' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, task_id: taskId })
  } catch (error) {
    console.error('[projects/tips] POST oväntat fel:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}
