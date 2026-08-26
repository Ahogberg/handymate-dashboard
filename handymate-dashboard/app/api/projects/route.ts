import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { getNextProjectNumber, bumpCounter } from '@/lib/numbering'
import { getQuoteBudgetDerivation } from '@/lib/quotes/get-quote-budget-derivation'
import { suggestChecklistForProject } from '@/lib/egenkontroll/suggest-checklist'
import { verifyOwnership } from '@/lib/auth/verify-ownership'
import { completeProject, type CompleteProjectResult } from '@/lib/projects/complete-project'
import { deriveProjectLifecycle } from '@/lib/projects/derive-lifecycle'
import { deriveProjectDates } from '@/lib/projects/derive-dates'
import { deriveProjectTodo } from '@/lib/projects/derive-todo'
import { getSystemStage, PROJECT_SYSTEM_STAGES } from '@/lib/project-stages/stages'

// completeProject → autoInvoiceOnComplete kan nu (Etapp Q, TD-86) skicka
// fakturan på riktigt inline (sendInvoice, Chromium-PDF via
// buildInvoicePdfBuffer) när projektet stängs med auto_invoice_on_complete
// påslaget — samma anledning som invoices/send/route.ts behöver 30s.
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * GET - Lista projekt för ett företag
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id
    const status = request.nextUrl.searchParams.get('status')
    const customerId = request.nextUrl.searchParams.get('customerId')

    // Behörighetskoll (Etapp 2, tasks/multi-employee-parity-plan.md): en
    // anställd utan can_see_all_projects ska bara se sina egna tilldelade
    // projekt, och en anställd utan can_see_financials ska inte få budget/
    // ekonomifält i svaret. getCurrentUser() returnerar null dels för
    // superadmin-impersonation, dels om ingen business_users-rad hittas för
    // auth-användaren (ska i praktiken inte hända för ägare — se
    // sql/business_users.sql punkt 4 samt app/api/auth/register/route.ts
    // som båda skapar en owner-rad — men vi failsafe:ar öppet mot null så
    // ägarens vy ALDRIG blir mer begränsad än idag).
    const currentUser = await getCurrentUser(request)
    const canSeeAllProjects = !currentUser || hasPermission(currentUser, 'see_all_projects')
    const canSeeFinancials = !currentUser || hasPermission(currentUser, 'see_financials')

    // include=workflow → joina stage-data per projekt så mobilen slipper N+1
    // mot /api/projects/[id]/workflow. Utan param: bakåtkompatibel respons.
    const includes = (request.nextUrl.searchParams.get('include') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const includeWorkflow = includes.includes('workflow')

    let query = supabase
      .from('project')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      if (status === 'active') {
        query = query.in('status', ['planning', 'active'])
      } else {
        query = query.eq('status', status)
      }
    }

    if (customerId) {
      query = query.eq('customer_id', customerId)
    }

    // Begränsad anställd: filtrera till bara projekt hen är tilldelad via
    // project_assignment (samma join-mönster som app/api/projects/[id]/team/
    // route.ts). Tom lista → tom respons (inte "alla"), matchar principen
    // att en oidentifierad tilldelning inte ska läcka andras projekt.
    if (!canSeeAllProjects && currentUser) {
      const { data: assignments } = await supabase
        .from('project_assignment')
        .select('project_id')
        .eq('business_id', businessId)
        .eq('business_user_id', currentUser.id)

      const assignedProjectIds = Array.from(
        new Set((assignments || []).map((a: any) => a.project_id))
      )

      if (assignedProjectIds.length === 0) {
        return NextResponse.json({ projects: [], job_types: [] })
      }

      query = query.in('project_id', assignedProjectIds)
    }

    const { data: projects, error } = await query

    if (error) throw error

    // Fetch actual hours and amounts for each project
    const projectIds = (projects || []).map((p: any) => p.project_id)

    let timeData: any[] = []
    if (projectIds.length > 0) {
      const { data } = await supabase
        .from('time_entry')
        .select('project_id, duration_minutes, hourly_rate, is_billable, invoiced, work_date')
        .in('project_id', projectIds)

      timeData = data || []
    }

    // Faktisk start (Del A, 2026-08-26): första arbetsdagen = min(första
    // tidrapportens work_date, första bekräftade/genomförda bokningens
    // scheduled_start som redan passerat). Härleds — lagras aldrig.
    const actualStartByProject = new Map<string, string>()
    const bumpStart = (projectId: string, iso: string | null | undefined) => {
      if (!projectId || !iso) return
      const day = iso.slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return
      const prev = actualStartByProject.get(projectId)
      if (!prev || day < prev) actualStartByProject.set(projectId, day)
    }
    for (const t of timeData) bumpStart(t.project_id, t.work_date)
    if (projectIds.length > 0) {
      const { data: bookingData, error: bookingError } = await supabase
        .from('booking')
        .select('project_id, scheduled_start, status')
        .eq('business_id', businessId)
        .in('project_id', projectIds)
        .in('status', ['confirmed', 'completed'])
        .lte('scheduled_start', new Date().toISOString())
      if (bookingError) console.error('[projects] booking-uppslag för faktisk start misslyckades (non-blocking):', bookingError.message)
      for (const b of bookingData || []) bumpStart(b.project_id, b.scheduled_start)
    }

    // Väntande godkännandekort per projekt (Del C, 2026-08-26): EN query för
    // hela företaget, grupperad i JS på payload.project_id (den etablerade
    // konventionen — det finns ingen project_id-kolumn på pending_approvals).
    // Listan visar det översta kortet per rad ("Nästa: … — Lars").
    const pendingByProject = new Map<string, Array<{ id: string; approval_type: string; risk_level: string | null; created_at: string | null; title: string | null; payload: Record<string, unknown> | null }>>()
    if (projectIds.length > 0) {
      const { data: pendingCards, error: pendingError } = await supabase
        .from('pending_approvals')
        .select('id, approval_type, risk_level, created_at, title, payload')
        .eq('business_id', businessId)
        .eq('status', 'pending')
        .not('payload->>project_id', 'is', null)
        .limit(500)
      if (pendingError) console.error('[projects] pending_approvals-uppslag misslyckades (non-blocking):', pendingError.message)
      for (const c of pendingCards || []) {
        const pid = (c.payload as Record<string, unknown> | null)?.project_id
        if (typeof pid !== 'string' || !pid) continue
        const list = pendingByProject.get(pid) || []
        list.push(c as any)
        pendingByProject.set(pid, list)
      }
    }

    // Fakturafakta för den härledda livscykeln (P1-2): en bulk-query,
    // bara status per projekt. Verkligheten, inte progress_percent.
    let invoiceData: any[] = []
    if (projectIds.length > 0) {
      const { data } = await supabase
        .from('invoice')
        .select('project_id, status')
        .eq('business_id', businessId)
        .in('project_id', projectIds)
      invoiceData = data || []
    }

    // Fetch next milestone deadline per project
    let milestoneData: any[] = []
    if (projectIds.length > 0) {
      const { data } = await supabase
        .from('project_milestone')
        .select('project_id, due_date, status')
        .in('project_id', projectIds)
        .neq('status', 'completed')
        .not('due_date', 'is', null)
        .order('due_date', { ascending: true })

      milestoneData = data || []
    }

    // Fetch customer names for projects
    const customerIds = Array.from(new Set((projects || []).map((p: any) => p.customer_id).filter(Boolean)))
    let customerMap: Record<string, { customer_id: string; name: string; phone_number?: string; email?: string }> = {}
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from('customer')
        .select('customer_id, name, phone_number, email')
        .in('customer_id', customerIds)
      for (const c of (customers || [])) {
        customerMap[c.customer_id] = c
      }
    }

    // Hämta jobbtyper för business — används för badge-färg/namn på projekt-
    // listans rader. Frontend joinar lokalt via slug.
    const { data: jobTypesData } = await supabase
      .from('job_types')
      .select('id, name, slug, color, icon')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    // Workflow-stages (system + ev. business-egna). En bulk-fetch som mappas
    // mot varje projekts current_workflow_stage_id nedan. Position används
    // för att räkna completed_stages och stage_progress.
    type WorkflowStage = {
      id: string
      name: string
      position: number
      color: string
      icon: string
    }
    const stagesById = new Map<string, WorkflowStage>()
    let totalStages = 0
    if (includeWorkflow) {
      const { data: stagesRaw } = await supabase
        .from('project_workflow_stages')
        .select('id, name, position, color, icon, business_id')
        .or(`business_id.is.null,business_id.eq.${businessId}`)
        .order('position', { ascending: true })
      for (const s of stagesRaw || []) {
        stagesById.set(s.id, {
          id: s.id,
          name: s.name,
          position: s.position,
          color: s.color,
          icon: s.icon,
        })
      }
      totalStages = stagesById.size
    }

    const enrichedProjects = (projects || []).map((project: any) => {
      const entries = timeData.filter((t: any) => t.project_id === project.project_id)
      const actual_minutes = entries.reduce((sum: number, e: any) => sum + (e.duration_minutes || 0), 0)
      const actual_amount = entries.reduce((sum: number, e: any) => {
        const hours = (e.duration_minutes || 0) / 60
        return sum + (hours * (e.hourly_rate || 0))
      }, 0)
      const uninvoiced_minutes = entries
        .filter((e: any) => !e.invoiced && e.is_billable)
        .reduce((sum: number, e: any) => sum + (e.duration_minutes || 0), 0)

      const nextDeadline = milestoneData.find((m: any) => m.project_id === project.project_id)

      const base = {
        ...project,
        customer: project.customer_id ? customerMap[project.customer_id] || null : null,
        actual_hours: Math.round(actual_minutes / 60 * 100) / 100,
        actual_amount: Math.round(actual_amount),
        uninvoiced_hours: Math.round(uninvoiced_minutes / 60 * 100) / 100,
        next_deadline: nextDeadline?.due_date || null,
        // Driftläget — härlett ur status + fakturafakta (P1-2). Lagras
        // aldrig; det som inte lagras kan inte drifta.
        lifecycle: deriveProjectLifecycle({
          status: project.status,
          completed_at: project.completed_at,
          invoices: invoiceData.filter((i: any) => i.project_id === project.project_id),
        }),
        // Datumraden (Del A): planerat spann, faktisk start, försening — EN
        // härledning som listan och detaljsidan delar.
        actual_start: actualStartByProject.get(project.project_id) || null,
        dates: deriveProjectDates({
          status: project.status,
          start_date: project.start_date,
          end_date: project.end_date,
          completed_at: project.completed_at,
          actual_start: actualStartByProject.get(project.project_id) || null,
        }),
        // Systemsteget (Del C): alltid med, ur den rena stegtabellen —
        // ingen DB-runda, inget include-krav. null = inget steg ännu.
        stage: (() => {
          const s = getSystemStage(project.current_workflow_stage_id)
          return s ? { id: s.id, name: s.name, short: s.short, position: s.position, total: PROJECT_SYSTEM_STAGES.length } : null
        })(),
        // "Nästa att göra" (Del C): samma deriveTodoMode som detaljsidan,
        // plus det översta väntande kortet (högst risk → äldst).
        next_todo: deriveProjectTodo({
          stageId: project.current_workflow_stage_id,
          isOverBudget: canSeeFinancials && (
            (Number(project.budget_amount) > 0 && actual_amount > Number(project.budget_amount))
            || (Number(project.budget_hours) > 0 && actual_minutes / 60 > Number(project.budget_hours))
          ),
          canSeeFinancials,
          hasUninvoicedWork: uninvoiced_minutes > 0,
          noWorkYet: actual_minutes === 0 && actual_amount === 0,
          pending: pendingByProject.get(project.project_id) || [],
        }),
      }

      if (!includeWorkflow) return base

      const currentStage = project.current_workflow_stage_id
        ? stagesById.get(project.current_workflow_stage_id) || null
        : null
      const currentPosition = currentStage?.position ?? 0

      // completed_stages = alla stages med lägre position än current.
      // Tomt om projektet inte har en current_stage satt (då är inget klart).
      const completedStages: string[] = []
      if (currentPosition > 0) {
        for (const s of Array.from(stagesById.values())) {
          if (s.position < currentPosition) completedStages.push(s.id)
        }
      }

      // is_late: samma härledning som datumraden (deriveProjectDates) —
      // project.end_date är den auktoritativa deadlinen; klart/avbrutet
      // räknas aldrig som försenat.
      const isLate = base.dates.is_late

      return {
        ...base,
        current_stage_id: currentStage?.id ?? null,
        current_stage_name: currentStage?.name ?? null,
        current_stage_color: currentStage?.color ?? null,
        current_stage_icon: currentStage?.icon ?? null,
        completed_stages: completedStages,
        total_stages: totalStages,
        stage_progress: completedStages.length,
        is_late: isLate,
      }
    })

    // Strippa budget/ekonomifält för anställda utan can_see_financials
    // (Etapp 2). budget_amount/budget_hours kommer från project-raden
    // (`...project` i base ovan), actual_amount räknas fram från
    // time_entry.hourly_rate — samtliga tre är ekonomikänsliga.
    const responseProjects = canSeeFinancials
      ? enrichedProjects
      : enrichedProjects.map(({ budget_amount, budget_hours, actual_amount, ...rest }: any) => rest)

    return NextResponse.json({
      projects: responseProjects,
      job_types: jobTypesData || [],
    })

  } catch (error: any) {
    console.error('Get projects error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa nytt projekt (manuellt eller från offert)
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const businessId = business.business_id

    const initialAssigneeId = typeof body.assigned_business_user_id === 'string'
      ? body.assigned_business_user_id.trim()
      : ''
    const assigningUser = initialAssigneeId ? await getCurrentUser(request) : null

    if (initialAssigneeId) {
      if (!assigningUser || !hasPermission(assigningUser, 'see_all_projects')) {
        return NextResponse.json({ error: 'Du saknar behörighet att tilldela projekt' }, { status: 403 })
      }

      // Service role kringgår RLS: personen måste verifieras mot samma tenant
      // innan projektet skapas, annars kan request-body peka på ett främmande id.
      const { data: targetAssignee } = await supabase
        .from('business_users')
        .select('id')
        .eq('id', initialAssigneeId)
        .eq('business_id', businessId)
        .eq('is_active', true)
        .maybeSingle()

      if (!targetAssignee) {
        return NextResponse.json({ error: 'Den valda personen är inte aktiv i företaget' }, { status: 400 })
      }
    }

    const assignInitialUser = async (projectId: string) => {
      if (!initialAssigneeId || !assigningUser) return { assignment: null, assignment_error: null }

      const { data: existingAssignment } = await supabase
        .from('project_assignment')
        .select('*')
        .eq('business_id', businessId)
        .eq('project_id', projectId)
        .eq('business_user_id', initialAssigneeId)
        .maybeSingle()

      if (existingAssignment) return { assignment: existingAssignment, assignment_error: null }

      const { data: assignment, error: assignmentError } = await supabase
        .from('project_assignment')
        .insert({
          business_id: businessId,
          project_id: projectId,
          business_user_id: initialAssigneeId,
          role: 'member',
          assigned_by: assigningUser.id,
        })
        .select('*')
        .single()

      if (assignmentError) {
        console.error('[projects POST] initial assignment error:', assignmentError)
        return {
          assignment: null,
          assignment_error: 'Projektet skapades, men personen kunde inte tilldelas',
        }
      }

      return { assignment, assignment_error: null }
    }

    // customer_id kommer direkt från request-body vid manuellt skapande.
    // Service role kringgår RLS, så länken måste verifieras före varje insert.
    const customerOwnership = await verifyOwnership(supabase, businessId, [
      {
        table: 'customer',
        idColumn: 'customer_id',
        idValue: body.customer_id,
        label: 'kund',
      },
    ])
    if (!customerOwnership.ok) {
      return NextResponse.json(
        { error: 'Kunden tillhör inte företaget' },
        { status: 403 },
      )
    }

    let projectData: any = {
      business_id: businessId,
      name: body.name,
      description: body.description || null,
      customer_id: body.customer_id || null,
      project_type: body.project_type || 'hourly',
      status: body.status || 'planning',
      budget_hours: body.budget_hours || null,
      budget_amount: body.budget_amount || null,
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      job_type: body.job_type || null,
    }

    // Spåra ev. deal som projektet kommer från (via offert eller direkt) —
    // används för att projektnumret ska matcha deal-numret.
    let dealNumber: number | null = null
    let dealTitle: string | null = null
    let dealIdForLink: string | null = null

    // Create from quote
    if (body.from_quote_id) {
      // Idempotens (TD-57, tasks/tech-debt.md — verifierat i Bee Service-
      // piloten: dubbel-klick/nätverks-retransmission skapade två projekt av
      // samma offert en sekund isär). Ett projekt per offert — hittas ett
      // befintligt returneras det i stället för att skapa ett nytt.
      const { data: existingProject } = await supabase
        .from('project')
        .select('*')
        .eq('business_id', businessId)
        .eq('quote_id', body.from_quote_id)
        .maybeSingle()
      if (existingProject) {
        const assignmentResult = await assignInitialUser(existingProject.project_id)
        return NextResponse.json({ project: existingProject, deduplicated: true, ...assignmentResult })
      }

      const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .select('*')
        .eq('quote_id', body.from_quote_id)
        .eq('business_id', businessId)
        .single()

      if (quoteError || !quote) {
        return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
      }

      projectData.quote_id = quote.quote_id
      projectData.customer_id = quote.customer_id

      // Hämta dealen som offerten tillhör (via quotes.deal_id) — så projektet
      // ärver samma ärende-nummer och kan falla tillbaka på deal-titeln.
      if (quote.deal_id) {
        const { data: deal } = await supabase
          .from('deal')
          .select('id, deal_number, title, job_type')
          .eq('id', quote.deal_id)
          .eq('business_id', businessId)
          .maybeSingle()
        if (deal) {
          dealNumber = deal.deal_number ?? null
          dealTitle = deal.title ?? null
          dealIdForLink = deal.id
          // Ärva jobbtyp från deal om body inte överrider
          if (!projectData.job_type && deal.job_type) {
            projectData.job_type = deal.job_type
          }
        }
      }

      // Titel-prio: 1) explicit i body, 2) offerttitel, 3) deal-titel, 4) fallback
      projectData.name = projectData.name || quote.title || dealTitle || `Projekt från offert`

      // Budget-härledning via gemensam helper (pilot-blocker fix 2026-05-22):
      // läser quote_items-tabellen primärt + JSONB-fallback. Tidigare läste
      // koden bara quote.items (JSONB) → nya offerter fick budget=null.
      const budgetDerivation = await getQuoteBudgetDerivation(
        supabase,
        body.from_quote_id,
        businessId,
      )

      projectData.budget_hours = projectData.budget_hours || budgetDerivation.budget_hours
      projectData.budget_amount = projectData.budget_amount || budgetDerivation.budget_amount
      projectData.project_type = budgetDerivation.project_type
    }

    // Direktkoppling till deal (om anroparen skickar from_deal_id)
    if (body.from_deal_id && !dealIdForLink) {
      const { data: deal } = await supabase
        .from('deal')
        .select('id, deal_number, title, customer_id, description, value, job_type')
        .eq('id', body.from_deal_id)
        .eq('business_id', businessId)
        .maybeSingle()
      if (deal) {
        dealNumber = deal.deal_number ?? null
        dealTitle = deal.title ?? null
        dealIdForLink = deal.id
        projectData.customer_id = projectData.customer_id || deal.customer_id || null
        projectData.name = projectData.name || deal.title || `Projekt`
        projectData.description = projectData.description || deal.description || null
        projectData.budget_amount = projectData.budget_amount || deal.value || null
        if (!projectData.job_type && deal.job_type) {
          projectData.job_type = deal.job_type
        }
      }
    }

    if (dealIdForLink) {
      projectData.deal_id = dealIdForLink
    }

    if (!projectData.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Tilldela projektnummer. Om projektet kommer från en deal: använd dealens
    // nummer (P-{deal_number}) så att hantverkaren ser samma ärende-id i hela
    // flödet. Annars: dra nästa nummer ur den delade case-räknaren.
    let projectNumber: string | null = null
    try {
      if (dealNumber) {
        projectNumber = `P-${dealNumber}`
        // Synka räknaren — får aldrig ge ut samma nummer igen
        await bumpCounter(supabase, businessId, 'project', dealNumber)
      } else {
        projectNumber = await getNextProjectNumber(supabase, businessId)
      }
      projectData.project_number = projectNumber
    } catch {
      // Kolumnen kanske inte finns — skippa
    }

    let project: any = null
    let insertError: any = null

    // Försök med project_number
    const result1 = await supabase
      .from('project')
      .insert(projectData)
      .select('*')
      .single()

    if (result1.error && projectNumber) {
      // Om felet beror på project_number-kolumnen, försök utan den
      console.warn('Project insert failed with project_number, retrying without:', result1.error.message)
      delete projectData.project_number
      const result2 = await supabase
        .from('project')
        .insert(projectData)
        .select('*')
        .single()
      project = result2.data
      insertError = result2.error
    } else {
      project = result1.data
      insertError = result1.error
    }

    if (insertError) {
      // Äkta samtidighet (två nästan samtidiga requests hann båda förbi
      // dedup-kollen ovan) fångas här av det partiella unika indexet (v136)
      // — 23505 betyder "en annan request vann kapplöpningen", inte ett fel.
      // Returnera vinnaren i stället för ett 500:a på en godartad dubblett.
      if (insertError.code === '23505' && body.from_quote_id) {
        const { data: winner } = await supabase
          .from('project')
          .select('*')
          .eq('business_id', businessId)
          .eq('quote_id', body.from_quote_id)
          .maybeSingle()
        if (winner) {
          const assignmentResult = await assignInitialUser(winner.project_id)
          return NextResponse.json({ project: winner, deduplicated: true, ...assignmentResult })
        }
      }
      console.error('Project insert error:', insertError)
      return NextResponse.json({ error: insertError.message || 'Kunde inte skapa projekt' }, { status: 500 })
    }

    const assignmentResult = await assignInitialUser(project.project_id)

    // Stegkedjan startar vid födseln (auditens P1-1). Kommer projektet ur en
    // offert är avtalet tecknat; skapas det manuellt som aktivt är jobbet
    // igång. Ett manuellt planerings-projekt får däremot INGET steg — det har
    // inget sant att påstå ännu. Idempotent, fire-and-forget.
    const initStage = body.from_quote_id
      ? 'CONTRACT_SIGNED' as const
      : projectData.status === 'active'
        ? 'JOB_STARTED' as const
        : null
    if (initStage && project) {
      import('@/lib/project-stages/automation-engine')
        .then(({ advanceProjectStage, SYSTEM_STAGES }) =>
          advanceProjectStage(project.project_id, SYSTEM_STAGES[initStage], businessId))
        .catch(err => console.error('[projects POST] stage init error (non-blocking):', err))
    }

    // If from quote, create milestones from quote items
    // Pilot-blocker fix 2026-05-22: använder samma budget-derivation-helper
    // som ovan så milestones bygger på quote_items-tabellen, inte tom JSONB.
    if (body.from_quote_id && body.create_milestones !== false) {
      const derivation = await getQuoteBudgetDerivation(
        supabase,
        body.from_quote_id,
        businessId,
      )

      if (derivation.labor_items.length > 1) {
        const milestones = derivation.labor_items.map((item, idx) => ({
          business_id: businessId,
          project_id: project.project_id,
          name: item.description || `Moment ${idx + 1}`,
          budget_hours: item.unit === 'tim' || item.unit === 'h' ? item.quantity : null,
          budget_amount: item.total || null,
          sort_order: idx,
          status: 'pending',
        }))

        await supabase.from('project_milestone').insert(milestones)
      }
    }

    // Egenkontroll-agenten (etapp 1d, tasks/easoft-gap-plan.md). Fire-and-
    // forget — föreslår en branschchecklista i godkännande-kön om
    // projektet saknar checklista sedan tidigare. suggestChecklistForProject
    // är själv fail-safe (kastar aldrig), .catch() är bara ett extra
    // skyddsnät (samma mönster som analyzeProjectPhoto i
    // app/api/projects/[id]/documents/route.ts, etapp 1b).
    suggestChecklistForProject({ businessId, projectId: project.project_id }).catch(err => {
      console.error('[projects] suggestChecklistForProject error (non-blocking):', err)
    })

    return NextResponse.json({ project, ...assignmentResult })

  } catch (error: any) {
    console.error('Create project error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera projekt
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { project_id } = body

    if (!project_id) {
      return NextResponse.json({ error: 'Missing project_id' }, { status: 400 })
    }

    // Föregående tillstånd (P2-4): sidoeffekterna vid stängning ska bara
    // eldas på ÖVERGÅNGEN inte-klart → klart. Upprepad PUT med samma status
    // dubblerade tidigare job_completed-eventet — recensionsbegäran och
    // nurture gick ut en gång per klick.
    const { data: foregaende, error: previousProjectError } = await supabase
      .from('project')
      .select('status, completed_at')
      .eq('project_id', project_id)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (previousProjectError) throw previousProjectError
    if (!foregaende) {
      return NextResponse.json({ error: 'Projektet hittades inte' }, { status: 404 })
    }
    const varRedanKlart = foregaende.status === 'completed'
    const blirKlart = body.status === 'completed' && !varRedanKlart
    const aterOppnas = varRedanKlart && (body.status === 'active' || body.status === 'planning')

    // Stängningen är ett eget serverkommando. Den kör grinden på den
    // befintliga DB-raden och vinner statusövergången atomiskt innan någon
    // sidoeffekt får börja. Övriga PUT-fält hanteras fortfarande nedan.
    let closeoutResult: CompleteProjectResult | null = null
    if (blirKlart) {
      closeoutResult = await completeProject({
        supabase,
        businessId: business.business_id,
        projectId: project_id,
        authorization: { kind: 'direct' },
      })

      if (closeoutResult.requires_approval) {
        return NextResponse.json({
          requires_approval: true,
          approval_id: closeoutResult.approval_id,
          message: 'Projektstängningen väntar på admin-godkännande.',
          closeout: closeoutResult,
        })
      }
      if (!closeoutResult.ok) {
        const status = closeoutResult.error_code === 'verification_failed'
          ? 503
          : closeoutResult.error_code === 'not_found'
            ? 404
            : 500
        return NextResponse.json({
          error: closeoutResult.error || 'Projektstängningen misslyckades',
          closeout: closeoutResult,
        }, { status })
      }
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }

    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.project_type !== undefined) updates.project_type = body.project_type
    if (body.status !== undefined && !blirKlart) {
      // KÄLLGRANSKAT FYND (Golden Path Fas 2, 2026-08-13): updates.status
      // sattes ALDRIG här — blocket nedan skrev bara sidofält (completed_at
      // m.fl.) baserat på body.status, men aldrig själva statuskolumnen.
      // En riktig stängning (PUT {status:'completed'}) körde HELA kedjan
      // (fyra-ögon, stage->ps-05, autoInvoiceOnComplete, freezeProjectOutcome,
      // skapaDebriefKort) men project.status blev tyst kvar på sitt gamla
      // värde — samma gäller planning/active/paused/cancelled.
      updates.status = body.status

      // Upprepad stängning: behåll ursprungligt completed_at — datumet
      // projektet faktiskt stängdes, inte senaste klicket. Den verkliga
      // övergången hanterades av completeProject ovan.
      if (body.status === 'active' || body.status === 'planning') {
        updates.completed_at = null
        if (aterOppnas) {
          // Återöppning rullar INTE tillbaka det stängningen skapade:
          // fakturan, fruset utfall och recensionsbegäran finns kvar. Det är
          // ett medvetet val (auditens P2-4) — men det ska SYNAS, inte ske
          // tyst, så att ett projekt som studsar klart↔aktivt går att utreda.
          console.warn('[projects] projekt återöppnas — faktura/utfall/recension rullas INTE tillbaka:', {
            project_id,
            business_id: business.business_id,
            stangdes: foregaende.completed_at,
          })
        }
      }
    }
    if (body.budget_hours !== undefined) updates.budget_hours = body.budget_hours
    if (body.budget_amount !== undefined) updates.budget_amount = body.budget_amount
    if (body.progress_percent !== undefined) updates.progress_percent = body.progress_percent
    if (body.start_date !== undefined) updates.start_date = body.start_date
    if (body.end_date !== undefined) updates.end_date = body.end_date
    if (body.customer_id !== undefined) updates.customer_id = body.customer_id

    let project: any = closeoutResult?.project ?? null
    const hasNonCloseoutUpdates = Object.keys(updates).length > 1
    if (!blirKlart || hasNonCloseoutUpdates) {
      const { data: updatedProject, error } = await supabase
        .from('project')
        .update(updates)
        .eq('project_id', project_id)
        .eq('business_id', business.business_id)
        .select('*')
        .single()

      if (error) throw error
      project = updatedProject
    }

    // Project workflow stage: 'Jobb påbörjat' när status blir 'active'
    if (body.status === 'active' && project) {
      try {
        const { advanceProjectStage, SYSTEM_STAGES } = await import('@/lib/project-stages/automation-engine')
        await advanceProjectStage(project.project_id, SYSTEM_STAGES.JOB_STARTED, business.business_id)
      } catch (err) {
        console.error('[projects] advanceProjectStage failed:', err)
      }
    }

    return NextResponse.json({ project, closeout: closeoutResult })

  } catch (error: any) {
    console.error('Update project error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort projekt (bara om inga tidrapporter kopplade)
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const projectId = request.nextUrl.searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
    }

    // Parent-first: inget barn får röras förrän projektets tenant är bevisad.
    const { data: ownedProject, error: ownershipError } = await supabase
      .from('project')
      .select('project_id')
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (ownershipError) throw ownershipError
    if (!ownedProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Check for linked time entries
    const { count, error: timeEntryError } = await supabase
      .from('time_entry')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)

    if (timeEntryError) throw timeEntryError

    if (count && count > 0) {
      return NextResponse.json(
        { error: 'Kan inte ta bort projekt med tidrapporter' },
        { status: 400 }
      )
    }

    // Delete all child records first (order matters for FK constraints)
    const { error: documentError } = await supabase
      .from('project_document')
      .delete()
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)
    if (documentError) throw documentError

    const { error: logError } = await supabase
      .from('project_log')
      .delete()
      .eq('order_id', projectId)
      .eq('business_id', business.business_id)
    if (logError) throw logError

    // Produktionen har legacy-kolumnen order_id på project_checklist.
    const { error: checklistError } = await supabase
      .from('project_checklist')
      .delete()
      .eq('order_id', projectId)
      .eq('business_id', business.business_id)
    if (checklistError) throw checklistError

    const { error: assignmentError } = await supabase
      .from('project_assignment')
      .delete()
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)
    if (assignmentError) throw assignmentError

    const { error: materialError } = await supabase
      .from('project_material')
      .delete()
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)
    if (materialError) throw materialError

    const { error: milestoneError } = await supabase
      .from('project_milestone')
      .delete()
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)
    if (milestoneError) throw milestoneError

    const { error: changeError } = await supabase
      .from('project_change')
      .delete()
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)
    if (changeError) throw changeError

    const { error } = await supabase
      .from('project')
      .delete()
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Delete project error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
