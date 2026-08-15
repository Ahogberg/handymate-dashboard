import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { getNextProjectNumber, bumpCounter } from '@/lib/numbering'
import { getQuoteBudgetDerivation } from '@/lib/quotes/get-quote-budget-derivation'
import { suggestChecklistForProject } from '@/lib/egenkontroll/suggest-checklist'
import { verifyOwnership } from '@/lib/auth/verify-ownership'
import { checkFourEyesGate } from '@/lib/projects/four-eyes-gate'
import { deriveProjectLifecycle } from '@/lib/projects/derive-lifecycle'

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
        .select('project_id, duration_minutes, hourly_rate, is_billable, invoiced')
        .in('project_id', projectIds)

      timeData = data || []
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
    const nowMs = Date.now()

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

      // is_late: projektets deadline har passerat och status är inte slutfört.
      // project_workflow_stages har inget per-stage due_date; project.end_date
      // är den auktoritativa deadlinen. Cancelled och completed räknas inte.
      const isLate =
        !!project.end_date &&
        new Date(project.end_date).getTime() < nowMs &&
        project.status !== 'completed' &&
        project.status !== 'cancelled'

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
      console.error('Project insert error:', insertError)
      return NextResponse.json({ error: insertError.message || 'Kunde inte skapa projekt' }, { status: 500 })
    }

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

    return NextResponse.json({ project })

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
    const { data: foregaende } = await supabase
      .from('project')
      .select('status, completed_at')
      .eq('project_id', project_id)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (!foregaende) {
      return NextResponse.json({ error: 'Projektet hittades inte' }, { status: 404 })
    }
    const varRedanKlart = foregaende.status === 'completed'
    const blirKlart = body.status === 'completed' && !varRedanKlart
    const aterOppnas = varRedanKlart && (body.status === 'active' || body.status === 'planning')

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }

    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.project_type !== undefined) updates.project_type = body.project_type
    if (body.status !== undefined) {
      // KÄLLGRANSKAT FYND (Golden Path Fas 2, 2026-08-13): updates.status
      // sattes ALDRIG här — blocket nedan skrev bara sidofält (completed_at
      // m.fl.) baserat på body.status, men aldrig själva statuskolumnen.
      // En riktig stängning (PUT {status:'completed'}) körde HELA kedjan
      // (fyra-ögon, stage->ps-05, autoInvoiceOnComplete, freezeProjectOutcome,
      // skapaDebriefKort) men project.status blev tyst kvar på sitt gamla
      // värde — samma gäller planning/active/paused/cancelled.
      updates.status = body.status

      // ═══ FOUR-EYES-GRINDEN — DATABASENS VÄRDE, ALDRIG KLIENTENS ═══
      // (Projektauditen P1-5, lagad 2026-08-09.)
      //
      // Grinden löd `body.budget_amount || 0` och kontrollen kördes bara när
      // det var falsy. Ett anrop med `{status:'completed', budget_amount: 1}`
      // hoppade alltså över HELA kontrollen — klienten kunde stänga vilket
      // projekt som helst förbi fyra ögon genom att skicka en krona.
      // En policygrind som frågar den grindade parten om värdet är ingen grind.
      if (body.status === 'completed') {
        // Grinden prövas bara på övergången — ett redan stängt projekt som
        // PUT:as igen ska inte generera nya godkännandekort.
        if (blirKlart) {
          // Delade grinden (lib/projects/four-eyes-gate.ts) — samma lås som
          // mobilens complete-job. Beslutet fattas på databasens värde.
          const grind = await checkFourEyesGate(supabase, business.business_id, project_id)
          if (grind.reason === 'verification_failed') {
            // Fail-closed (2026-08-15): kunde inte verifiera grinden — stäng inte tyst.
            return NextResponse.json({
              error: 'Kunde inte verifiera godkännandereglerna för stängning just nu. Försök igen om en liten stund.',
            }, { status: 503 })
          }
          if (grind.gated) {
            return NextResponse.json({
              requires_approval: true,
              approval_id: grind.approvalId,
              message: `Projektstängning kräver admin-godkännande (${(grind.budgetAmount || 0).toLocaleString('sv-SE')} kr)`,
            })
          }
          updates.completed_at = new Date().toISOString()
        }
        // Upprepad stängning: behåll ursprungligt completed_at — datumet
        // projektet faktiskt stängdes, inte senaste klicket.
      }
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

    const { data: project, error } = await supabase
      .from('project')
      .update(updates)
      .eq('project_id', project_id)
      .eq('business_id', business.business_id)
      .select('*')
      .single()

    if (error) throw error

    // Project workflow stage: 'Jobb påbörjat' när status blir 'active'
    if (body.status === 'active' && project) {
      try {
        const { advanceProjectStage, SYSTEM_STAGES } = await import('@/lib/project-stages/automation-engine')
        await advanceProjectStage(project.project_id, SYSTEM_STAGES.JOB_STARTED, business.business_id)
      } catch (err) {
        console.error('[projects] advanceProjectStage failed:', err)
      }
    }

    // Project workflow stage: 'Slutbesiktning' när status blir 'completed'.
    // Bara på ÖVERGÅNGEN (P2-4) — steget är idempotent, men vakten här gör
    // avsikten läsbar och håller mönstret enhetligt med blocket nedan.
    if (blirKlart && project) {
      try {
        const { advanceProjectStage, SYSTEM_STAGES } = await import('@/lib/project-stages/automation-engine')
        await advanceProjectStage(project.project_id, SYSTEM_STAGES.FINAL_INSPECTION, business.business_id)
      } catch (err) {
        console.error('[projects] advanceProjectStage failed:', err)
      }
    }

    // Fire job_completed event → triggar review request + nurture.
    // ═══ BARA PÅ ÖVERGÅNGEN inte-klart → klart (P2-4) ═══
    // Villkoret var body.status === 'completed': varje upprepad PUT eldade
    // om hela kedjan — recensionsbegäran, nurture och Lars-triggern gick ut
    // en gång per klick på ett redan stängt projekt.
    if (blirKlart && project) {
      // "En händelse → hela företaget" (Business Twin-backlog #2, 2026-08-13):
      // den här övergången skapar flera FRISTÅENDE godkännandekort (faktura,
      // debrief, recensionsförfrågan) som idag visas som obesvikta,
      // orelaterade kort. Ett delat batch-id stämplas in på var och en
      // (sista steget i blocket, se längre ner) så ytan kan gruppera dem
      // under en gemensam rubrik — INTE bunta ihop dem till ett enda
      // "godkänn allt"-klick (fakturan är en pengarörelse och förtjänar sitt
      // eget medvetna klick, samma resonemang som fyra-ögon-grinden).
      const completionBatchId = crypto.randomUUID()
      try {
        const { fireEvent } = await import('@/lib/automation-engine')
        await fireEvent(supabase, 'job_completed', business.business_id, {
          project_id: project.project_id,
          customer_id: project.customer_id,
          project_name: project.name,
        })
      } catch { /* non-blocking */ }

      // Auto-faktura vid projektavslut
      try {
        const { autoInvoiceOnComplete } = await import('@/lib/projects/auto-invoice-on-complete')
        await autoInvoiceOnComplete(business.business_id, project.project_id)
      } catch (invoiceErr) {
        console.error('Auto-invoice on complete error (non-blocking):', invoiceErr)
      }

      // Motor 1: frys utfall-vs-offert (efterkalkyl). Fail-safe — kastar
      // aldrig, får inte fälla projektstängningen. Körs bara här eftersom
      // vi passerat 4-eyes-gaten ovan och status faktiskt blev 'completed'.
      let outcomeForTrigger: {
        job_type: string | null
        hours_diff_pct: number | null
        amount_diff_pct: number | null
        margin_pct: number | null
      } | null = null
      try {
        const { freezeProjectOutcome } = await import('@/lib/efterkalkyl/freeze-outcome')
        await freezeProjectOutcome(supabase, business.business_id, project.project_id)

        const { getProjectOutcome } = await import('@/lib/efterkalkyl/get-project-outcome')
        const outcome = await getProjectOutcome(supabase, business.business_id, project.project_id)
        outcomeForTrigger = {
          job_type: outcome.job_type,
          hours_diff_pct: outcome.hours_diff_pct,
          amount_diff_pct: outcome.amount_diff_pct,
          margin_pct: outcome.margin_pct,
        }
      } catch (outcomeErr) {
        console.error('[projects] freezeProjectOutcome error (non-blocking):', outcomeErr)
      }

      // Project Debrief Capture (2026-08-12): 2-3 frivilliga frågor ur
      // deltat ovan. Fail-safe, får aldrig fälla projektstängningen — se
      // lib/debrief/create-debrief-card.ts för dedupe/detaljer.
      try {
        const { skapaDebriefKort } = await import('@/lib/debrief/create-debrief-card')
        await skapaDebriefKort(supabase, business.business_id, {
          project_id: project.project_id,
          project_name: project.name,
          quote_id: project.quote_id ?? null,
          job_type: outcomeForTrigger?.job_type ?? null,
          hours_diff_pct: outcomeForTrigger?.hours_diff_pct ?? null,
          amount_diff_pct: outcomeForTrigger?.amount_diff_pct ?? null,
          margin_pct: outcomeForTrigger?.margin_pct ?? null,
        })
      } catch (debriefErr) {
        console.error('[projects] skapaDebriefKort error (non-blocking):', debriefErr)
      }

      // Våg 2d (tasks/value-chain-plan.md) — väck Lars (job_completed-
      // trigger, matchAgentByPrefix routar 'job_*' till honom). Fire-and-
      // forget, fail-safe, får aldrig fälla projektstängningen.
      try {
        const { triggerAgentFireAndForget, makeIdempotencyKey } = await import('@/lib/agent-trigger')
        triggerAgentFireAndForget(
          business.business_id,
          'job_completed',
          {
            project_id: project.project_id,
            job_type: outcomeForTrigger?.job_type ?? null,
            hours_diff_pct: outcomeForTrigger?.hours_diff_pct ?? null,
            amount_diff_pct: outcomeForTrigger?.amount_diff_pct ?? null,
            margin_pct: outcomeForTrigger?.margin_pct ?? null,
            instruction: `Projektet (project_id: ${project.project_id}) avslutades just. Bedöm om det gick enligt plan utifrån avvikelsen i tid/belopp mot offert och föreslå åtgärd om något sticker ut — annars räcker en kort notering. Använd get_project_outcome om du behöver fler detaljer.`,
          },
          makeIdempotencyKey('job_completed', business.business_id, project.project_id)
        )
      } catch (triggerErr) {
        console.error('[projects] job_completed agent trigger failed (non-blocking):', triggerErr)
      }

      // Schemalägg Google-recension 24h efter projektslut.
      //
      // Buggfix 2026-08-10: payloaden byggdes tidigare UTAN `to`/`message`
      // — exekveringscaset (app/api/approvals/[id]/route.ts, case
      // 'scheduled_review_request') läser just de fälten, så godkännandet
      // failade tyst med "payload saknar to eller message" så fort
      // hantverkaren klickade Godkänn. Kanonisk form nu, samma som cronens
      // (app/api/cron/review-requests/route.ts).
      try {
        const { data: customer } = await supabase
          .from('customer')
          .select('name, phone_number, review_request_sent_at')
          .eq('customer_id', project.customer_id)
          .single()

        const { data: config } = await supabase
          .from('business_config')
          .select('business_name, google_review_url')
          .eq('business_id', business.business_id)
          .single()

        // 180-dagarsspärr (review_request_sent_at) — samma spärr som cronen
        // respekterar. Utan den kan denna projekt-avslutade väg och cronen
        // be samma kund om recension två gånger.
        const reviewSentAt = customer?.review_request_sent_at as string | null | undefined
        const askedRecently = !!reviewSentAt
          && new Date(reviewSentAt) > new Date(Date.now() - 180 * 24 * 3600000)

        if (customer?.phone_number && config?.google_review_url && !askedRecently) {
          const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h from now
          const { buildReviewRequestMessage } = await import('@/lib/notifications/review-request-message')
          const message = buildReviewRequestMessage({
            customerName: customer.name,
            projectName: project.name,
            businessName: config.business_name,
            reviewUrl: config.google_review_url,
          })
          // KÄLLGRANSKAT FYND (2026-08-13): `type` är INTE en kolumn på
          // pending_approvals (bara approval_type finns) — PostgREST
          // avvisade hela inserten, tyst uppsvald av catch-blocket nedan.
          // scheduled_review_request-kortet har alltså aldrig skapats i
          // produktion, för någon business, sedan featuren byggdes (0 rader
          // någonsin, verifierat via MCP innan denna fix).
          await supabase.from('pending_approvals').insert({
            business_id: business.business_id,
            approval_type: 'scheduled_review_request',
            title: `Recensionsförfrågan — ${customer.name}`,
            description: `Skicka Google-recensionsförfrågan till ${customer.name} för projekt "${project.name}"`,
            risk_level: 'low',
            status: 'pending',
            expires_at: scheduledAt.toISOString(),
            payload: {
              customer_id: project.customer_id,
              customer_name: customer.name,
              customer_phone: customer.phone_number,
              project_id: project.project_id,
              project_name: project.name,
              business_name: config.business_name,
              google_review_url: config.google_review_url,
              to: customer.phone_number,
              message,
              agent_id: 'hanna',
            },
          })
        }
      } catch (reviewErr) {
        console.error('Review request scheduling error (non-blocking):', reviewErr)
      }

      // Flytta deal till "Slutfört" i pipeline
      try {
        const { data: linkedDeal } = await supabase
          .from('deal')
          .select('id')
          .eq('business_id', business.business_id)
          .or(`quote_id.eq.${project.quote_id},lead_id.eq.${project.lead_id}`)
          .maybeSingle()

        if (linkedDeal) {
          const { moveDeal } = await import('@/lib/pipeline')
          await moveDeal({
            dealId: linkedDeal.id,
            businessId: business.business_id,
            // V80: Ingen 'invoiced'-stage finns längre ('quote_accepted' är
            // borttaget, sql/v80_merge_accepted_into_won.sql) — flytta direkt
            // till 'won'. Riktningsskyddet i moveDeal hindrar att en redan
            // vunnen deal dras tillbaka. Betalstatus är fakturamodulens ansvar,
            // inte pipeline-stegets.
            toStageSlug: 'won',
            triggeredBy: 'system',
            aiReason: 'Projekt markerat som slutfört',
          })
        }
      } catch { /* non-blocking */ }

      // Stämpla completion_batch_id på de kort just DENNA stängning skapade
      // — sista steget, efter att alla ovanstående haft sin chans att skapa
      // sina kort. Icke-blockerande: en misslyckad stämpling ska aldrig
      // fälla stängningen, den gör bara ytan omedvetet om grupperingen.
      try {
        const { data: batchRows } = await supabase
          .from('pending_approvals')
          .select('id, payload')
          .eq('business_id', business.business_id)
          .eq('status', 'pending')
          .in('approval_type', ['review_auto_invoice', 'project_debrief', 'scheduled_review_request'])
        for (const row of batchRows || []) {
          if ((row as any).payload?.project_id === project.project_id) {
            await supabase
              .from('pending_approvals')
              .update({ payload: { ...(row as any).payload, completion_batch_id: completionBatchId } })
              .eq('id', (row as any).id)
          }
        }
      } catch (batchErr) {
        console.error('[projects] completion_batch_id-stämpling misslyckades (icke-blockerande):', batchErr)
      }
    }

    return NextResponse.json({ project })

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
