/**
 * Canonical Project Completion V1 (2026-08-15).
 *
 * Produktens tre avslutsdörrar — projekt-API:t, sista mobilbokningen och
 * fyra-ögon-godkännandet — går genom completeProject(). Den primära
 * statusövergången är compare-and-set-skyddad; bara requesten som faktiskt
 * vann inte-klart→klart får starta sidoeffekterna.
 *
 * Sidoeffekterna är medvetet icke-transaktionella (faktura, automationer och
 * agentkörning kan inte rullas tillbaka tillsammans utan en större outbox-
 * arkitektur). Skillnaden mot tidigare är att varje utfall redovisas och att
 * ingen sidoeffekt körs om den primära projektskrivningen misslyckas.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkFourEyesGate } from '@/lib/projects/four-eyes-gate'
import type { ProjectOutcomeRow } from '@/lib/efterkalkyl/freeze-outcome'

export type ProjectCompletionAuthorization =
  | { kind: 'direct' }
  | { kind: 'approved'; approvalId: string }

export type CloseoutEffectName =
  | 'workflow_stage'
  | 'job_completed_event'
  | 'auto_invoice'
  | 'project_outcome'
  | 'business_twin_forecasts'
  | 'project_debrief'
  | 'agent_trigger'
  | 'review_request'
  | 'jobbpass_proposal'
  | 'installation_register'
  | 'deal_stage'
  | 'completion_batch'

export type CloseoutEffectStatus = 'succeeded' | 'failed' | 'skipped' | 'dispatched' | 'attempted'

export interface CloseoutEffectResult {
  effect: CloseoutEffectName
  status: CloseoutEffectStatus
  message?: string
  artifact_id?: string
}

export interface CloseoutInvoice {
  invoice_id: string
  invoice_number?: string
  total?: number
  status?: 'draft' | 'sent'
}

export interface CompletedProjectRow {
  project_id: string
  business_id: string
  customer_id: string | null
  name: string
  quote_id: string | null
  lead_id: string | null
  status: string
  completed_at: string | null
}

export interface CompleteProjectResult {
  ok: boolean
  completed: boolean
  transitioned: boolean
  already_completed: boolean
  requires_approval: boolean
  approval_id?: string | null
  error?: string
  error_code?: 'not_found' | 'verification_failed' | 'transition_failed' | 'invalid_authorization'
  project?: CompletedProjectRow
  invoice_created?: CloseoutInvoice | null
  completion_batch_id?: string
  effects: CloseoutEffectResult[]
  warnings: string[]
}

interface TransitionResult {
  ok: boolean
  transitioned: boolean
  already_completed: boolean
  project?: CompletedProjectRow
  error?: string
  errorCode?: 'not_found' | 'transition_failed'
}

const PROJECT_COLUMNS =
  'project_id, business_id, customer_id, name, quote_id, lead_id, status, completed_at' as const

/**
 * Atomisk statusprimitiv. Debug-harnesset använder denna eftersom det
 * avsiktligt provar en smal datakedja; produktkod ska använda completeProject.
 */
export async function transitionProjectToCompleted(
  supabase: SupabaseClient,
  businessId: string,
  projectId: string,
  completedAt = new Date().toISOString(),
): Promise<TransitionResult> {
  // BUGFIX (2026-08-25, verklig repro mot produktion): `.or('status.neq.
  // completed,status.is.null')` ihop med `.eq()`-filtren gav PostgREST en
  // TOM representation ([]) trots att UPDATE:en faktiskt matchade och
  // skrev raden — verifierat både via curl direkt mot PostgREST och via
  // supabase-js: samma filter men UTAN or() (bara `.neq('status',
  // 'completed')`) returnerar representationen korrekt. Effekten: en
  // RIKTIG stängning (status skrevs till 'completed' i databasen) tolkades
  // av anroparen som "redan stängd" — workflow-stage flyttade aldrig till
  // ps-05, ingen faktura, inget fruset utfall, inget debriefkort. Fixen
  // delar upp i två atomära försök (vanligt fall + null-status-fallet) för
  // att aldrig kombinera or() med eq() på en update-representation — samma
  // CAS-garanti (Postgres rad-lås) per försök, bara olika filterform.
  let transition = await supabase
    .from('project')
    .update({
      status: 'completed',
      completed_at: completedAt,
      updated_at: completedAt,
    })
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .neq('status', 'completed')
    .select(PROJECT_COLUMNS)
    .maybeSingle()

  // Äldre rader utan status (NULL) matchar aldrig `neq.completed` (SQL:s
  // NULL-semantik) — ett separat, likaledes atomärt försök för det fallet.
  if (!transition.error && !transition.data) {
    transition = await supabase
      .from('project')
      .update({
        status: 'completed',
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq('project_id', projectId)
      .eq('business_id', businessId)
      .is('status', null)
      .select(PROJECT_COLUMNS)
      .maybeSingle()
  }

  if (transition.error) {
    return {
      ok: false,
      transitioned: false,
      already_completed: false,
      error: transition.error.message,
      errorCode: 'transition_failed',
    }
  }

  if (transition.data) {
    return {
      ok: true,
      transitioned: true,
      already_completed: false,
      project: transition.data as CompletedProjectRow,
    }
  }

  // Ingen rad uppdaterades: skilj en idempotent replay från fel tenant/
  // borttaget projekt. Även denna läsning är tenantfiltrerad.
  const current = await supabase
    .from('project')
    .select(PROJECT_COLUMNS)
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .maybeSingle()

  if (current.error) {
    return {
      ok: false,
      transitioned: false,
      already_completed: false,
      error: current.error.message,
      errorCode: 'transition_failed',
    }
  }
  if (!current.data) {
    return {
      ok: false,
      transitioned: false,
      already_completed: false,
      error: 'Projektet hittades inte',
      errorCode: 'not_found',
    }
  }
  if (current.data.status !== 'completed') {
    return {
      ok: false,
      transitioned: false,
      already_completed: false,
      error: 'Projektet kunde inte låsas för stängning',
      errorCode: 'transition_failed',
    }
  }

  return {
    ok: true,
    transitioned: false,
    already_completed: true,
    project: current.data as CompletedProjectRow,
  }
}

export async function completeProject(params: {
  supabase: SupabaseClient
  businessId: string
  projectId: string
  authorization: ProjectCompletionAuthorization
}): Promise<CompleteProjectResult> {
  const { supabase, businessId, projectId, authorization } = params

  if (authorization.kind === 'approved' && !authorization.approvalId) {
    return failedResult('Godkännandereferens saknas', 'invalid_authorization')
  }

  // Kortslut idempotenta replays före fyra-ögon-grinden. Annars kan sista
  // mobilbokningen skapa ett nytt godkännandekort för ett projekt som redan
  // stängts genom desktop/godkännandet.
  const existing = await supabase
    .from('project')
    .select(PROJECT_COLUMNS)
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .maybeSingle()
  if (existing.error) {
    return failedResult(existing.error.message, 'transition_failed')
  }
  if (!existing.data) {
    return failedResult('Projektet hittades inte', 'not_found')
  }
  if (existing.data.status === 'completed') {
    return {
      ok: true,
      completed: true,
      transitioned: false,
      already_completed: true,
      requires_approval: false,
      project: existing.data as CompletedProjectRow,
      invoice_created: null,
      effects: [],
      warnings: [],
    }
  }

  // `approved` är en serverintern kapabilitet, inte en frisedel som får
  // avgöras av en godtycklig sträng. Verifiera att referensen är just det
  // godkända fyra-ögon-kortet för samma tenant och projekt innan CAS-write.
  if (authorization.kind === 'approved') {
    const approvedCard = await supabase
      .from('pending_approvals')
      .select('id')
      .eq('id', authorization.approvalId)
      .eq('business_id', businessId)
      .eq('approval_type', 'four_eyes_project_close')
      .eq('status', 'approved')
      .contains('payload', { project_id: projectId })
      .maybeSingle()
    if (approvedCard.error) {
      return failedResult(approvedCard.error.message, 'verification_failed')
    }
    if (!approvedCard.data) {
      return failedResult('Godkännandet matchar inte projektet', 'invalid_authorization')
    }
  }

  // Ett direkt användar-/mobilanrop måste alltid gå genom policygrinden.
  // Godkännandets executor är den uttryckliga utvägen efter att samma grind
  // redan skapat och en behörig användare godkänt kortet.
  if (authorization.kind === 'direct') {
    const gate = await checkFourEyesGate(supabase, businessId, projectId)
    if (gate.reason === 'verification_failed') {
      return failedResult(
        gate.error || 'Kunde inte verifiera godkännandereglerna',
        'verification_failed',
      )
    }
    if (gate.gated) {
      return {
        ok: true,
        completed: false,
        transitioned: false,
        already_completed: false,
        requires_approval: true,
        approval_id: gate.approvalId ?? null,
        effects: [],
        warnings: [],
      }
    }
  }

  const transition = await transitionProjectToCompleted(supabase, businessId, projectId)
  if (transition.error || !transition.ok || !transition.project) {
    return failedResult(
      transition.error || 'Projektstängningen misslyckades',
      transition.errorCode || 'transition_failed',
    )
  }

  // Idempotent replay: datum och sidoeffekter lämnas orörda. Den request som
  // vann compare-and-set-uppdateringen är ensam om att köra kedjan.
  if (transition.already_completed) {
    return {
      ok: true,
      completed: true,
      transitioned: false,
      already_completed: true,
      requires_approval: false,
      project: transition.project,
      invoice_created: null,
      effects: [],
      warnings: [],
    }
  }

  const completionBatchId = crypto.randomUUID()
  const effectResult = await runCompletionEffects({
    supabase,
    businessId,
    project: transition.project,
    completionBatchId,
  })

  return {
    ok: true,
    completed: true,
    transitioned: true,
    already_completed: false,
    requires_approval: false,
    project: transition.project,
    invoice_created: effectResult.invoice,
    completion_batch_id: completionBatchId,
    effects: effectResult.effects,
    warnings: effectResult.effects
      .filter((effect) => effect.status === 'failed')
      .map((effect) => userWarningForEffect(effect.effect)),
  }
}

function failedResult(
  error: string,
  errorCode: NonNullable<CompleteProjectResult['error_code']>,
): CompleteProjectResult {
  return {
    ok: false,
    completed: false,
    transitioned: false,
    already_completed: false,
    requires_approval: false,
    error,
    error_code: errorCode,
    effects: [],
    warnings: [],
  }
}

async function runCompletionEffects(params: {
  supabase: SupabaseClient
  businessId: string
  project: CompletedProjectRow
  completionBatchId: string
}): Promise<{ effects: CloseoutEffectResult[]; invoice: CloseoutInvoice | null }> {
  const { supabase, businessId, project, completionBatchId } = params
  const effects: CloseoutEffectResult[] = []
  let invoice: CloseoutInvoice | null = null

  // 1. Workflow-stage: idempotent helper, men dess returvärde måste läsas.
  try {
    const { advanceProjectStage, SYSTEM_STAGES } = await import(
      '@/lib/project-stages/automation-engine'
    )
    const moved = await advanceProjectStage(
      project.project_id,
      SYSTEM_STAGES.FINAL_INSPECTION,
      businessId,
    )
    effects.push(moved.moved
      ? { effect: 'workflow_stage', status: 'succeeded' }
      : { effect: 'workflow_stage', status: 'failed', message: moved.error || 'Stegflytten misslyckades' })
  } catch (error) {
    effects.push(effectFailure('workflow_stage', error))
  }

  // 2. Befintliga automationer. fireEvent är själv fail-safe och saknar
  // resultatkontrakt, därför säger vi ärligt "attempted" — inte succeeded.
  try {
    const { fireEvent } = await import('@/lib/automation-engine')
    await fireEvent(supabase, 'job_completed', businessId, {
      project_id: project.project_id,
      customer_id: project.customer_id,
      project_name: project.name,
    })
    effects.push({ effect: 'job_completed_event', status: 'attempted' })
  } catch (error) {
    effects.push(effectFailure('job_completed_event', error))
  }

  // 3. Fakturautkast/sändförsök enligt exakt befintlig fakturapolicy.
  try {
    const { autoInvoiceOnComplete } = await import('@/lib/projects/auto-invoice-on-complete')
    const result = await autoInvoiceOnComplete(businessId, project.project_id)
    if (result.success && result.invoice_id) {
      invoice = {
        invoice_id: result.invoice_id,
        invoice_number: result.invoice_number,
        total: result.total,
        status: result.status,
      }
      effects.push({
        effect: 'auto_invoice',
        status: result.error ? 'skipped' : 'succeeded',
        message: result.error,
        artifact_id: result.invoice_id,
      })
    } else if (result.success) {
      effects.push({ effect: 'auto_invoice', status: 'skipped', message: result.error || 'Inget fakturaunderlag' })
    } else {
      effects.push({ effect: 'auto_invoice', status: 'failed', message: result.error || 'Fakturan kunde inte skapas' })
    }
  } catch (error) {
    effects.push(effectFailure('auto_invoice', error))
  }

  // 4. Frys och verifiera efterkalkylen. Använd resultatet från JUST DENNA
  // beräkning: en gammal rad får aldrig maskera att den aktuella frysningen
  // misslyckades.
  let outcome: {
    found: boolean
    job_type: string | null
    hours_diff_pct: number | null
    amount_diff_pct: number | null
    margin_pct: number | null
  } | null = null
  let frozenOutcome: ProjectOutcomeRow | null = null
  try {
    const { freezeProjectOutcome } = await import('@/lib/efterkalkyl/freeze-outcome')
    const frozen = await freezeProjectOutcome(supabase, businessId, project.project_id)
    if (frozen.ok) {
      frozenOutcome = frozen.row
      outcome = {
        found: true,
        job_type: frozen.row.job_type,
        hours_diff_pct: frozen.row.hours_diff_pct,
        amount_diff_pct: frozen.row.amount_diff_pct,
        margin_pct: frozen.row.margin_pct,
      }
      effects.push({ effect: 'project_outcome', status: 'succeeded' })
    } else {
      effects.push({
        effect: 'project_outcome',
        status: 'failed',
        message: `${frozen.code}: ${frozen.message}`,
      })
    }
  } catch (error) {
    effects.push(effectFailure('project_outcome', error))
  }

  // 4b. En bevakad Business Twin-prognos får sitt facit först här: efter
  // samma kvalitetsgrindade outcome som nästa offert får lära av. Missad
  // migration/fel blir en synlig closeout-varning, aldrig ett falskt utfall.
  if (!frozenOutcome) {
    effects.push({
      effect: 'business_twin_forecasts',
      status: 'skipped',
      message: 'Ingen verifierad efterkalkyl att jämföra mot',
    })
  } else {
    try {
      const { verifyProjectMarginForecasts } = await import('@/lib/business-twin/watch-forecast')
      const verified = await verifyProjectMarginForecasts({
        supabase,
        businessId,
        projectId: project.project_id,
        outcome: frozenOutcome,
      })
      if (!verified.ok) {
        effects.push({
          effect: 'business_twin_forecasts',
          status: 'failed',
          message: verified.error || 'Prognoserna kunde inte verifieras',
        })
      } else if (!verified.available) {
        effects.push({
          effect: 'business_twin_forecasts',
          status: 'skipped',
          message: 'Business Twin-bevakning är inte aktiverad',
        })
      } else if (verified.verified + verified.unverifiable === 0) {
        effects.push({
          effect: 'business_twin_forecasts',
          status: 'skipped',
          message: 'Inga bevakade prognoser för projektet',
        })
      } else {
        effects.push({
          effect: 'business_twin_forecasts',
          status: 'succeeded',
          message: `${verified.verified} verifierade · ${verified.unverifiable} utan tillräckligt facit`,
        })
      }
    } catch (error) {
      effects.push(effectFailure('business_twin_forecasts', error))
    }
  }

  // 5. Debriefkortet har livstids-dedupe. Verifiera raden efter anropet så
  // ett internt fail-safe-fel inte felaktigt redovisas som success.
  try {
    const { skapaDebriefKort } = await import('@/lib/debrief/create-debrief-card')
    await skapaDebriefKort(supabase, businessId, {
      project_id: project.project_id,
      project_name: project.name,
      quote_id: project.quote_id,
      job_type: outcome?.job_type ?? null,
      hours_diff_pct: outcome?.hours_diff_pct ?? null,
      amount_diff_pct: outcome?.amount_diff_pct ?? null,
      margin_pct: outcome?.margin_pct ?? null,
    })
    const { data: debriefRows, error: debriefReadError } = await supabase
      .from('pending_approvals')
      .select('id')
      .eq('business_id', businessId)
      .eq('approval_type', 'project_debrief')
      .contains('payload', { project_id: project.project_id })
      .limit(1)
    if (debriefReadError) throw debriefReadError
    effects.push(debriefRows && debriefRows.length > 0
      ? { effect: 'project_debrief', status: 'succeeded', artifact_id: debriefRows[0].id }
      : { effect: 'project_debrief', status: 'failed', message: 'Debriefkortet kunde inte verifieras' })
  } catch (error) {
    effects.push(effectFailure('project_debrief', error))
  }

  // 6. Lars-triggern är avsiktligt fire-and-forget. Den kan bara redovisas
  // som dispatched när den interna hemligheten faktiskt finns.
  try {
    if (!process.env.CRON_SECRET) {
      effects.push({ effect: 'agent_trigger', status: 'failed', message: 'CRON_SECRET saknas' })
    } else {
      const { triggerAgentFireAndForget, makeIdempotencyKey } = await import('@/lib/agent-trigger')
      triggerAgentFireAndForget(
        businessId,
        'job_completed',
        {
          project_id: project.project_id,
          job_type: outcome?.job_type ?? null,
          hours_diff_pct: outcome?.hours_diff_pct ?? null,
          amount_diff_pct: outcome?.amount_diff_pct ?? null,
          margin_pct: outcome?.margin_pct ?? null,
          instruction: `Projektet (project_id: ${project.project_id}) avslutades just. Bedöm om det gick enligt plan utifrån avvikelsen i tid/belopp mot offert och föreslå åtgärd om något sticker ut — annars räcker en kort notering. Använd get_project_outcome om du behöver fler detaljer.`,
        },
        makeIdempotencyKey('job_completed', businessId, project.project_id),
      )
      effects.push({ effect: 'agent_trigger', status: 'dispatched' })
    }
  } catch (error) {
    effects.push(effectFailure('agent_trigger', error))
  }

  // 7. Schemalagd recension. Samma payload och 180-dagarsspärr som förut,
  // nu med felfacit och projekt-dedupe.
  effects.push(await createReviewRequest(supabase, businessId, project))

  // 7b. Jobbpass (Etapp Ä, sql/v154_jobbpass.sql): Lars föreslår ett
  // digitalt jobbpass åt kunden. Skapar bara FÖRSLAGSKORTET + en tom
  // draft-rad att fylla i — inget publiceras här, ägaren väljer foton och
  // publicerar själv i egen yta. Dedupe på samma sätt som recensionskortet.
  effects.push(await proposeJobbpass(supabase, businessId, project))

  // 7c. Installationsregistret (Fastighetspasset steg 2, sql/v174): Lars
  // frågar vad som sitter kvar hos kunden — BARA när projektet har material
  // eller namnet pekar på en produkt (grind 2), efter att projektet redan
  // är klart. Materialrader blir utkast, aldrig bekräftade (grind 1).
  effects.push(await proposeInstallationRegister(supabase, businessId, project))

  // 8. Flytta kopplad deal till vunnen; saknad deal är ett legitimt skip.
  try {
    if (!project.quote_id && !project.lead_id) {
      effects.push({ effect: 'deal_stage', status: 'skipped', message: 'Ingen offert eller lead kopplad' })
    } else {
      let dealQuery = supabase
        .from('deal')
        .select('id')
        .eq('business_id', businessId)
      if (project.quote_id && project.lead_id) {
        dealQuery = dealQuery.or(`quote_id.eq.${project.quote_id},lead_id.eq.${project.lead_id}`)
      } else if (project.quote_id) {
        dealQuery = dealQuery.eq('quote_id', project.quote_id)
      } else {
        dealQuery = dealQuery.eq('lead_id', project.lead_id as string)
      }
      const { data: linkedDeal, error: dealReadError } = await dealQuery.maybeSingle()
      if (dealReadError) throw dealReadError
      if (!linkedDeal) {
        effects.push({ effect: 'deal_stage', status: 'skipped', message: 'Ingen deal kopplad' })
      } else {
        const { moveDeal } = await import('@/lib/pipeline')
        await moveDeal({
          dealId: linkedDeal.id,
          businessId,
          toStageSlug: 'won',
          triggeredBy: 'system',
          aiReason: 'Projekt markerat som slutfört',
        })
        effects.push({ effect: 'deal_stage', status: 'succeeded', artifact_id: linkedDeal.id })
      }
    }
  } catch (error) {
    effects.push(effectFailure('deal_stage', error))
  }

  // 9. Gruppera korten som denna stängning gav upphov till. Varje update är
  // tenantfiltrerad och läses; partial failure syns i resultatet.
  try {
    const { data: batchRows, error: batchReadError } = await supabase
      .from('pending_approvals')
      .select('id, payload')
      .eq('business_id', businessId)
      .eq('status', 'pending')
      .in('approval_type', ['review_auto_invoice', 'project_debrief', 'scheduled_review_request', 'jobbpass_proposal', 'installation_register'])
    if (batchReadError) throw batchReadError

    let stamped = 0
    for (const row of batchRows || []) {
      if ((row as { payload?: { project_id?: string } }).payload?.project_id !== project.project_id) continue
      const { error: stampError } = await supabase
        .from('pending_approvals')
        .update({
          payload: {
            ...((row as { payload?: Record<string, unknown> }).payload || {}),
            completion_batch_id: completionBatchId,
          },
        })
        .eq('id', row.id)
        .eq('business_id', businessId)
      if (stampError) throw stampError
      stamped += 1
    }
    effects.push({
      effect: 'completion_batch',
      status: stamped > 0 ? 'succeeded' : 'skipped',
      message: stamped > 0 ? `${stamped} kort grupperade` : 'Inga kort att gruppera',
    })
  } catch (error) {
    effects.push(effectFailure('completion_batch', error))
  }

  return { effects, invoice }
}

async function createReviewRequest(
  supabase: SupabaseClient,
  businessId: string,
  project: CompletedProjectRow,
): Promise<CloseoutEffectResult> {
  try {
    if (!project.customer_id) {
      return { effect: 'review_request', status: 'skipped', message: 'Ingen kund kopplad' }
    }

    const [customerResult, configResult, existingResult] = await Promise.all([
      supabase
        .from('customer')
        .select('name, phone_number, review_request_sent_at')
        .eq('customer_id', project.customer_id)
        .eq('business_id', businessId)
        .maybeSingle(),
      supabase
        .from('business_config')
        .select('business_name, google_review_url')
        .eq('business_id', businessId)
        .maybeSingle(),
      supabase
        .from('pending_approvals')
        .select('id')
        .eq('business_id', businessId)
        .eq('approval_type', 'scheduled_review_request')
        .contains('payload', { project_id: project.project_id })
        .limit(1),
    ])

    if (customerResult.error) throw customerResult.error
    if (configResult.error) throw configResult.error
    if (existingResult.error) throw existingResult.error
    if (existingResult.data && existingResult.data.length > 0) {
      return {
        effect: 'review_request',
        status: 'skipped',
        message: 'Recensionskort finns redan',
        artifact_id: existingResult.data[0].id,
      }
    }

    const customer = customerResult.data
    const config = configResult.data
    if (!customer?.phone_number || !config?.google_review_url) {
      return { effect: 'review_request', status: 'skipped', message: 'Telefon eller Google-länk saknas' }
    }

    const askedRecently = !!customer.review_request_sent_at
      && new Date(customer.review_request_sent_at) > new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
    if (askedRecently) {
      return { effect: 'review_request', status: 'skipped', message: 'Kunden har tillfrågats senaste 180 dagarna' }
    }

    const { buildReviewRequestMessage } = await import('@/lib/notifications/review-request-message')
    const message = buildReviewRequestMessage({
      customerName: customer.name,
      projectName: project.name,
      businessName: config.business_name,
      reviewUrl: config.google_review_url,
    })
    const { data: inserted, error: insertError } = await supabase
      .from('pending_approvals')
      .insert({
        business_id: businessId,
        approval_type: 'scheduled_review_request',
        title: `Recensionsförfrågan — ${customer.name}`,
        description: `Skicka Google-recensionsförfrågan till ${customer.name} för projekt "${project.name}"`,
        risk_level: 'low',
        status: 'pending',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
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
      .select('id')
      .single()
    if (insertError) throw insertError
    return { effect: 'review_request', status: 'succeeded', artifact_id: inserted.id }
  } catch (error) {
    return effectFailure('review_request', error)
  }
}

/**
 * Jobbpass-förslaget (Etapp Ä). Skapar en TOM draft-rad (getOrCreateDraftJobbpass
 * — idempotent, inga foton/samtycke valda ännu) och ett förslagskort ägaren
 * kan öppna för att välja foton och publicera. Dedupe mot en existerande
 * pending_approval för samma projekt, samma mönster som createReviewRequest.
 */
async function proposeJobbpass(
  supabase: SupabaseClient,
  businessId: string,
  project: CompletedProjectRow,
): Promise<CloseoutEffectResult> {
  try {
    if (!project.customer_id) {
      return { effect: 'jobbpass_proposal', status: 'skipped', message: 'Ingen kund kopplad' }
    }

    const existingResult = await supabase
      .from('pending_approvals')
      .select('id')
      .eq('business_id', businessId)
      .eq('approval_type', 'jobbpass_proposal')
      .contains('payload', { project_id: project.project_id })
      .limit(1)
    if (existingResult.error) throw existingResult.error
    if (existingResult.data && existingResult.data.length > 0) {
      return {
        effect: 'jobbpass_proposal',
        status: 'skipped',
        message: 'Jobbpass redan föreslaget',
        artifact_id: existingResult.data[0].id,
      }
    }

    const { getOrCreateDraftJobbpass } = await import('@/lib/jobbpass/jobbpass')
    const draft = await getOrCreateDraftJobbpass(supabase, businessId, project.project_id)
    if (!draft.ok) {
      return { effect: 'jobbpass_proposal', status: 'failed', message: draft.error }
    }

    const { data: inserted, error: insertError } = await supabase
      .from('pending_approvals')
      .insert({
        business_id: businessId,
        approval_type: 'jobbpass_proposal',
        title: `Jobbpass — ${project.name}`,
        description: `Skapa ett digitalt jobbpass åt kunden för "${project.name}": vad som gjordes, valda foton och egenkontroll.`,
        risk_level: 'low',
        status: 'pending',
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        payload: {
          project_id: project.project_id,
          project_name: project.name,
          customer_id: project.customer_id,
          target_route: `/dashboard/projects/${project.project_id}/jobbpass`,
          agent_id: 'lars',
        },
      })
      .select('id')
      .single()
    if (insertError) throw insertError
    return { effect: 'jobbpass_proposal', status: 'succeeded', artifact_id: inserted.id }
  } catch (error) {
    return effectFailure('jobbpass_proposal', error)
  }
}

/**
 * Installationsregistret (Fastighetspasset steg 2). Skapar materialutkast
 * (idempotent, bara 'draft') och ett granskningskort som routar till
 * /installationer — inget klick i kön bekräftar något. Irrelevanta projekt
 * (inget material, inget produktord i namnet) får inget kort alls.
 */
async function proposeInstallationRegister(
  supabase: SupabaseClient,
  businessId: string,
  project: CompletedProjectRow,
): Promise<CloseoutEffectResult> {
  try {
    if (!project.customer_id) {
      return { effect: 'installation_register', status: 'skipped', message: 'Ingen kund kopplad' }
    }
    const { installationRelevance, ensureMaterialDrafts, loadProjectSite } = await import('@/lib/installation/installation')

    const { count: materialCount, error: countError } = await supabase
      .from('project_material')
      .select('material_id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('project_id', project.project_id)
    if (countError) throw countError

    const ctx = await loadProjectSite(supabase, businessId, project.project_id)
    const relevance = installationRelevance({
      name: project.name,
      description: ctx?.description ?? null,
      materialCount: materialCount ?? 0,
    })
    if (!relevance.relevant) {
      return { effect: 'installation_register', status: 'skipped', message: 'Inget i projektet pekar på en installation' }
    }

    const existingResult = await supabase
      .from('pending_approvals')
      .select('id')
      .eq('business_id', businessId)
      .eq('approval_type', 'installation_register')
      .contains('payload', { project_id: project.project_id })
      .limit(1)
    if (existingResult.error) throw existingResult.error
    if (existingResult.data && existingResult.data.length > 0) {
      return { effect: 'installation_register', status: 'skipped', message: 'Redan föreslaget', artifact_id: existingResult.data[0].id }
    }

    const drafts = await ensureMaterialDrafts(supabase, businessId, project.project_id)
    if (drafts.error) throw new Error(drafts.error)

    const beskrivning = relevance.reason === 'material'
      ? `Projektet har ${drafts.materialCount} materialrad${drafts.materialCount === 1 ? '' : 'er'}. Bekräfta vad som faktiskt sitter kvar hos kunden — tillverkare, modell, serienummer, placering. Saknas serienumret går det att komplettera senare.`
      : `"${project.name}" ser ut att innehålla en installation. Registrera vad som sitter hos kunden så att service och uppföljning får något att utgå från. Inget är obligatoriskt.`

    const { data: inserted, error: insertError } = await supabase
      .from('pending_approvals')
      .insert({
        business_id: businessId,
        approval_type: 'installation_register',
        title: `Vad sitter kvar hos kunden? — ${project.name}`,
        description: beskrivning,
        risk_level: 'low',
        status: 'pending',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        payload: {
          project_id: project.project_id,
          project_name: project.name,
          customer_id: project.customer_id,
          target_route: `/dashboard/projects/${project.project_id}/installationer`,
          agent_id: 'lars',
          relevance_reason: relevance.reason,
          drafts_created: drafts.created,
        },
      })
      .select('id')
      .single()
    if (insertError) throw insertError
    return { effect: 'installation_register', status: 'succeeded', artifact_id: inserted.id }
  } catch (error) {
    return effectFailure('installation_register', error)
  }
}

function effectFailure(effect: CloseoutEffectName, error: unknown): CloseoutEffectResult {
  return {
    effect,
    status: 'failed',
    message: error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String((error as { message?: unknown }).message)
        : String(error),
  }
}

function userWarningForEffect(effect: CloseoutEffectName): string {
  const warnings: Record<CloseoutEffectName, string> = {
    workflow_stage: 'Projektfasen kunde inte flyttas till slutbesiktning.',
    job_completed_event: 'Projektets automatiska uppföljningar kunde inte startas.',
    auto_invoice: 'Fakturaunderlaget kunde inte skapas automatiskt.',
    project_outcome: 'Efterkalkylen kunde inte sparas.',
    business_twin_forecasts: 'Business Twin-prognoserna kunde inte verifieras.',
    project_debrief: 'Lärandefrågorna kunde inte skapas.',
    agent_trigger: 'Lars kunde inte starta sin projektuppföljning.',
    review_request: 'Recensionsförfrågan kunde inte förberedas.',
    jobbpass_proposal: 'Jobbpasset kunde inte föreslås.',
    installation_register: 'Installationsregistret kunde inte föreslås.',
    deal_stage: 'Säljstatusen kunde inte uppdateras.',
    completion_batch: 'Efterarbetets kort kunde inte grupperas.',
  }
  return warnings[effect]
}
