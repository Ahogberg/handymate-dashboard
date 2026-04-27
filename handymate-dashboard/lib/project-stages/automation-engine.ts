/**
 * Project workflow stage automation engine.
 *
 * Hanterar övergångar mellan projektets stages och triggar automationer
 * (SMS, schemalagda recensionsförfrågningar, uppföljningar). Drivs från
 * pipeline-events (offert accepterad, faktura skickad/betald m.m.).
 */

import { getServerSupabase } from '@/lib/supabase'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

/** Läsbara id för system-stages — speglar SQL-seed (sql/v39_project_stages.sql) */
export const SYSTEM_STAGES = {
  CONTRACT_SIGNED:   'ps-01',
  MEETING_BOOKED:    'ps-02',
  JOB_STARTED:       'ps-03',
  MILESTONE_REACHED: 'ps-04',
  FINAL_INSPECTION:  'ps-05',
  INVOICE_SENT:      'ps-06',
  INVOICE_PAID:      'ps-07',
  REVIEW_RECEIVED:   'ps-08',
} as const

export type SystemStageId = typeof SYSTEM_STAGES[keyof typeof SYSTEM_STAGES]

interface StageHistoryEntry {
  stage_id: string
  entered_at: string
  previous_stage_id: string | null
}

/**
 * Flytta ett projekt till en ny stage. Loggar i history, uppdaterar
 * timestamps och triggar automationer.
 */
export async function advanceProjectStage(
  projectId: string,
  stageId: string,
  businessId: string
): Promise<void> {
  const supabase = getServerSupabase()

  // Hämta projekt + kund i samma query
  const { data: project } = await supabase
    .from('project')
    .select('*, customer:customer_id(*)')
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .maybeSingle()

  if (!project) {
    console.warn('[project-stages] advanceProjectStage: project not found', { projectId, businessId })
    return
  }

  // Skip om vi redan är på rätt stage
  if (project.current_workflow_stage_id === stageId) return

  // Logga i stage_history
  const history: StageHistoryEntry[] = Array.isArray(project.workflow_stage_history)
    ? project.workflow_stage_history
    : []
  history.push({
    stage_id: stageId,
    entered_at: new Date().toISOString(),
    previous_stage_id: project.current_workflow_stage_id || null,
  })

  // Uppdatera projekt
  await supabase
    .from('project')
    .update({
      current_workflow_stage_id: stageId,
      workflow_stage_entered_at: new Date().toISOString(),
      workflow_stage_history: history,
    })
    .eq('project_id', projectId)
    .eq('business_id', businessId)

  // Trigga automationer
  // Logga stage-övergången med project_id i context — Flödet-vyns AI-strip
  // hittar logs via project.customer_id men korrekt project_id-koppling är
  // viktigt för att rätt aktivitet visas på rätt projekt när en kund har
  // flera projekt.
  await logProjectStageEvent(supabase, businessId, project, stageId)

  await triggerStageAutomations(projectId, stageId, businessId, project)
}

async function logProjectStageEvent(
  supabase: ReturnType<typeof getServerSupabase>,
  businessId: string,
  project: any,
  stageId: string
) {
  try {
    // Hämta läsbart stage-namn för rule_name
    const { data: stage } = await supabase
      .from('project_workflow_stages')
      .select('name')
      .eq('id', stageId)
      .maybeSingle()

    await supabase.from('v3_automation_logs').insert({
      business_id: businessId,
      rule_name: `Projekt: ${stage?.name || stageId}`,
      trigger_type: 'project_stage_change',
      action_type: 'advance_stage',
      status: 'completed',
      agent_id: 'lars', // Projektledaren ansvarar för stage-flödet
      context: {
        project_id: project.project_id,
        customer_id: project.customer_id,
        stage_id: stageId,
        project_name: project.name,
      },
    })
  } catch (err) {
    console.error('[project-stages] log event failed:', err)
  }
}

async function triggerStageAutomations(
  projectId: string,
  stageId: string,
  businessId: string,
  project: any
) {
  const supabase = getServerSupabase()

  // Hämta business-egna automationer för denna stage
  const { data: automations } = await supabase
    .from('project_stage_automations')
    .select('*')
    .eq('stage_id', stageId)
    .eq('business_id', businessId)
    .eq('is_active', true)

  // Om inga business-egna automationer → kör default system-automationer
  if (!automations?.length) {
    await runDefaultAutomations(stageId, project, businessId)
    return
  }

  for (const automation of automations) {
    try {
      if (automation.delay_hours > 0) {
        // Schemalagd action → skapa pending_approval med scheduled-marker i payload
        await scheduleApproval(businessId, automation, project)
      } else {
        // Kör direkt
        await executeAutomation(automation, project, businessId)
      }
    } catch (err) {
      console.error('[project-stages] automation failed:', err)
    }
  }
}

async function scheduleApproval(
  businessId: string,
  automation: any,
  project: any
) {
  const supabase = getServerSupabase()
  const scheduledAt = new Date(Date.now() + (automation.delay_hours || 0) * 3600000).toISOString()
  await supabase.from('pending_approvals').insert({
    id: 'appr_' + Math.random().toString(36).substring(2, 14),
    business_id: businessId,
    approval_type: automation.action_type,
    title: `${automation.agent}: ${automation.action_type} (${project.name || 'projekt'})`,
    description: automation.sms_template || null,
    payload: {
      project_id: project.project_id,
      stage_id: automation.stage_id,
      automation_id: automation.id,
      agent: automation.agent,
      sms_template: automation.sms_template,
      customer_id: project.customer_id,
      customer_phone: project.customer?.phone_number || project.customer?.phone,
      customer_name: project.customer?.name,
      project_name: project.name,
      scheduled_at: scheduledAt,
    },
    status: 'pending',
    risk_level: 'low',
    expires_at: new Date(Date.now() + 7 * 24 * 3600000).toISOString(),
  })
}

async function runDefaultAutomations(
  stageId: string,
  project: any,
  businessId: string
) {
  const supabase = getServerSupabase()

  // Hämta business-namn för SMS
  const { data: config } = await supabase
    .from('business_config')
    .select('business_name')
    .eq('business_id', businessId)
    .single()

  const customerPhone = project.customer?.phone_number || project.customer?.phone
  const companyName = config?.business_name || 'Hantverkaren'
  const projectName = project.name || 'projektet'

  switch (stageId) {
    case SYSTEM_STAGES.CONTRACT_SIGNED:
      // Lars bekräftar mot kund
      if (customerPhone) {
        await sendSMS(
          customerPhone,
          `Hej! Vi har mottagit er signerade offert för ${projectName}. Vi återkommer snart med startdatum. // ${companyName}`,
          businessId
        )
      }
      break

    case SYSTEM_STAGES.JOB_STARTED:
      if (customerPhone) {
        await sendSMS(
          customerPhone,
          `Hej! Vi har nu startat arbetet med ${projectName}. Följ projektets framsteg i din portal. // ${companyName}`,
          businessId
        )
      }
      break

    case SYSTEM_STAGES.INVOICE_PAID:
      if (customerPhone) {
        await sendSMS(
          customerPhone,
          `Tack för betalningen! Det var ett nöje att jobba med er. // ${companyName}`,
          businessId
        )
      }
      // Schemalägg recensionsförfrågan +3 dagar
      await supabase.from('pending_approvals').insert({
        id: 'appr_' + Math.random().toString(36).substring(2, 14),
        business_id: businessId,
        approval_type: 'review_request',
        title: `Recensionsförfrågan — ${projectName}`,
        description: 'Be kunden om recension nu när jobbet är betalt',
        payload: {
          project_id: project.project_id,
          customer_id: project.customer_id,
          customer_phone: customerPhone,
          customer_name: project.customer?.name,
          project_name: projectName,
          scheduled_at: new Date(Date.now() + 3 * 24 * 3600000).toISOString(),
        },
        status: 'pending',
        risk_level: 'low',
        expires_at: new Date(Date.now() + 14 * 24 * 3600000).toISOString(),
      })
      break

    case SYSTEM_STAGES.REVIEW_RECEIVED:
      // Schemalägg 1-årsuppföljning
      await supabase.from('pending_approvals').insert({
        id: 'appr_' + Math.random().toString(36).substring(2, 14),
        business_id: businessId,
        approval_type: 'yearly_followup',
        title: `1-årsuppföljning — ${projectName}`,
        description: 'Hör av dig till kunden ett år efter avslutat jobb',
        payload: {
          project_id: project.project_id,
          customer_id: project.customer_id,
          customer_phone: customerPhone,
          customer_name: project.customer?.name,
          project_name: projectName,
          scheduled_at: new Date(Date.now() + 365 * 24 * 3600000).toISOString(),
        },
        status: 'pending',
        risk_level: 'low',
        expires_at: new Date(Date.now() + 400 * 24 * 3600000).toISOString(),
      })
      break

    // De övriga stages (MEETING_BOOKED, MILESTONE_REACHED, FINAL_INSPECTION,
    // INVOICE_SENT) har inga default SMS — bara metadata-uppdatering. Lägg
    // till per-business automationer via Settings → Project stages för
    // anpassad uppföljning.
  }
}

async function executeAutomation(
  automation: any,
  project: any,
  businessId: string
) {
  const customerPhone = project.customer?.phone_number || project.customer?.phone

  switch (automation.action_type) {
    case 'send_sms':
      if (customerPhone && automation.sms_template) {
        const message = automation.sms_template
          .replace('{kund}', project.customer?.name || 'Kund')
          .replace('{projekt}', project.name || 'projektet')
          .replace('{företag}', project.business_name || '')
        await sendSMS(customerPhone, message, businessId)
      }
      break
    // Fler action_types kan läggas till här (create_booking, send_invoice etc)
  }
}

async function sendSMS(phone: string, message: string, businessId: string) {
  try {
    await fetch(`${APP_URL}/api/sms/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.CRON_SECRET || '',
      },
      body: JSON.stringify({ to: phone, message, business_id: businessId }),
    })
  } catch (err) {
    console.error('[project-stages] sendSMS failed:', err)
  }
}

/**
 * Hjälpfunktion för att hitta projekt kopplat till en faktura/quote/deal.
 * Används av invoice/quote/deal-events för att avgöra vilken stage som ska aktiveras.
 */
export async function findProjectForEntity(opts: {
  businessId: string
  invoiceId?: string
  quoteId?: string
  dealId?: string
}): Promise<{ project_id: string } | null> {
  const supabase = getServerSupabase()
  let query = supabase.from('project').select('project_id').eq('business_id', opts.businessId)
  if (opts.invoiceId) query = query.eq('invoice_id', opts.invoiceId)
  else if (opts.quoteId) query = query.eq('quote_id', opts.quoteId)
  else if (opts.dealId) query = query.eq('deal_id', opts.dealId)
  else return null

  const { data } = await query.maybeSingle()
  return data || null
}
