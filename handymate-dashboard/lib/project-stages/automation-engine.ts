/**
 * Project workflow stage automation engine.
 *
 * Hanterar övergångar mellan projektets stages och triggar automationer
 * (SMS, schemalagda recensionsförfrågningar, uppföljningar). Drivs från
 * pipeline-events (offert accepterad, faktura skickad/betald m.m.).
 */

import { getServerSupabase } from '@/lib/supabase'
import { shouldQueueForApproval } from '@/lib/autonomy/agent-gating'

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

/**
 * Flytta ENDAST framåt (2026-08-10, Jobb igång-producenten).
 *
 * Händelseproducenter (första tidrapporten, bokningsstart passerad) vet att
 * arbetet BÖRJAT — men inte var projektet står. Ett projekt som redan är
 * fakturerat får aldrig backas till "Jobb igång" av en sen tidrapport.
 *
 * Systemstegens id är ordnade (ps-01 … ps-08) så strängjämförelsen räcker.
 * Står projektet på ett EGET (icke-ps-) steg vet vi inte var i flödet det
 * är — då rör vi det inte alls. Hellre ett stillastående steg än ett fel.
 */
export async function advanceProjectStageForward(
  projectId: string,
  stageId: SystemStageId,
  businessId: string,
): Promise<AdvanceStageResult> {
  const supabase = getServerSupabase()
  const { data: p, error } = await supabase
    .from('project')
    .select('current_workflow_stage_id')
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .maybeSingle()
  if (error) return { moved: false, error: error.message }
  if (!p) return { moved: false, error: 'Projektet hittades inte' }

  const current = p.current_workflow_stage_id as string | null
  if (current) {
    if (!/^ps-\d\d$/.test(current)) return { moved: true } // eget steg — rör inte
    if (current >= stageId) return { moved: true }          // redan där eller längre
  }
  return advanceProjectStage(projectId, stageId, businessId)
}

interface StageHistoryEntry {
  stage_id: string
  entered_at: string
  previous_stage_id: string | null
}

/** Resultat av en stage-flytt — låter anropare (t.ex. advance-stage-rutten)
 *  rapportera ärligt i stället för att anta att flytten lyckades. */
export interface AdvanceStageResult {
  moved: boolean
  error?: string
}

/**
 * Flytta ett projekt till en ny stage. Loggar i history, uppdaterar
 * timestamps och triggar automationer.
 *
 * VIKTIGT (bugfix 2026-07-09): tidigare hämtades projektet med den embeddade
 * joinen `customer:customer_id(*)` — men `project` saknar FK till `customer`
 * i prod, så PostgREST avvisade HELA queryn (PGRST200) → `project` blev null
 * → funktionen returnerade tyst "not found" → INGEN projektflytt (manuell
 * eller automatisk) fungerade någonsin, medan rutten ändå svarade success.
 * Nu hämtas kunden separat (samma mönster som pipeline-rutten: "no FK on
 * deal table"), och fel rapporteras ärligt via returvärdet.
 */
export async function advanceProjectStage(
  projectId: string,
  stageId: string,
  businessId: string
): Promise<AdvanceStageResult> {
  const supabase = getServerSupabase()

  // Hämta projekt UTAN embed (FK till customer saknas — se doc-kommentaren).
  const { data: project, error: projectError } = await supabase
    .from('project')
    .select('*')
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .maybeSingle()

  if (projectError) {
    console.error('[project-stages] advanceProjectStage: projekt-query fel:', projectError)
    return { moved: false, error: projectError.message }
  }
  if (!project) {
    console.warn('[project-stages] advanceProjectStage: project not found', { projectId, businessId })
    return { moved: false, error: 'Projektet hittades inte' }
  }

  // Skip om vi redan är på rätt stage (idempotent — räknas som lyckad).
  if (project.current_workflow_stage_id === stageId) return { moved: true }

  // Hämta kunden separat — automationerna (SMS-förslag, approvals) behöver
  // namn/telefon. Saknad kund är OK (projekt utan kundkoppling).
  if (project.customer_id) {
    const { data: customer } = await supabase
      .from('customer')
      .select('*')
      .eq('customer_id', project.customer_id)
      .eq('business_id', businessId)
      .maybeSingle()
    project.customer = customer ?? null
  } else {
    project.customer = null
  }

  // Logga i stage_history
  const history: StageHistoryEntry[] = Array.isArray(project.workflow_stage_history)
    ? project.workflow_stage_history
    : []
  history.push({
    stage_id: stageId,
    entered_at: new Date().toISOString(),
    previous_stage_id: project.current_workflow_stage_id || null,
  })

  // Uppdatera projekt — FELKONTROLLERAT. En tyst misslyckad update här var
  // exakt buggen som lät UI:t visa "Flyttad" medan projektet stod stilla.
  const { error: updateError } = await supabase
    .from('project')
    .update({
      current_workflow_stage_id: stageId,
      workflow_stage_entered_at: new Date().toISOString(),
      workflow_stage_history: history,
    })
    .eq('project_id', projectId)
    .eq('business_id', businessId)

  if (updateError) {
    console.error('[project-stages] advanceProjectStage: update misslyckades:', updateError)
    return { moved: false, error: updateError.message }
  }

  // Trigga automationer
  // Logga stage-övergången med project_id i context — Flödet-vyns AI-strip
  // hittar logs via project.customer_id men korrekt project_id-koppling är
  // viktigt för att rätt aktivitet visas på rätt projekt när en kund har
  // flera projekt.
  await logProjectStageEvent(supabase, businessId, project, stageId)

  await triggerStageAutomations(projectId, stageId, businessId, project)

  // Portal-notifikation: project_update för meningsfulla stage-byten.
  // Skippa för INVOICE_PAID (egen review_request-notif) och REVIEW_RECEIVED
  // (slut på flödet, ingen anledning att maila kunden).
  if (project.customer_id && stageId !== SYSTEM_STAGES.REVIEW_RECEIVED && stageId !== SYSTEM_STAGES.INVOICE_PAID) {
    try {
      const { data: stage } = await supabase
        .from('project_workflow_stages')
        .select('name')
        .eq('id', stageId)
        .maybeSingle()

      const { sendPortalNotification } = await import('@/lib/portal/notification-emails')
      await sendPortalNotification(businessId, project.customer_id, 'project_update', {
        context: {
          project_name: project.name,
          stage_name: stage?.name || stageId,
        },
      })
    } catch (notifErr) {
      console.error('[project-stages] portal notification project_update failed:', notifErr)
    }
  }

  return { moved: true }
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
      // Sanering 2026-08-05: 'completed' → 'success' (kanoniska värdet).
      status: 'success',
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
      // SÄKERHETSFIX 2026-05-20 (T2.7 pilot-audit): tidigare körde
      // delay_hours=0 automation DIREKT via executeAutomation → SMS gick
      // ut till kunder utan användarens godkännande. Andreas-policy:
      // alla agent-actions mot externa parter (SMS/email/faktura) MÅSTE
      // gå genom pending_approvals för Christoffer-godkännande.
      //
      // Nu skapas ALLTID pending_approval, oavsett delay_hours. Schemalagd
      // delay hanteras via approval.expires_at + cron som triggar
      // notifikation närmare deadline.
      await scheduleApproval(businessId, automation, project)
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

  // Hämta business-namn för SMS + recensionslänk (google_review_url/
  // google_place_id) för review_request-caset nedan.
  const { data: config } = await supabase
    .from('business_config')
    .select('business_name, google_review_url, google_place_id')
    .eq('business_id', businessId)
    .single()

  const customerPhone = project.customer?.phone_number || project.customer?.phone
  const companyName = config?.business_name || 'Hantverkaren'
  const projectName = project.name || 'projektet'

  switch (stageId) {
    case SYSTEM_STAGES.CONTRACT_SIGNED:
      // Lars bekräftar mot kund
      if (customerPhone) {
        await sendStageSms({
          businessId,
          to: customerPhone,
          message: `Hej! Vi har mottagit er signerade offert för ${projectName}. Vi återkommer snart med startdatum. // ${companyName}`,
          title: `Lars: SMS — kontrakt signerat (${projectName})`,
          routedAgent: 'lars',
          project,
        })
      }
      break

    case SYSTEM_STAGES.JOB_STARTED:
      if (customerPhone) {
        await sendStageSms({
          businessId,
          to: customerPhone,
          message: `Hej! Vi har nu startat arbetet med ${projectName}. Följ projektets framsteg i din portal. // ${companyName}`,
          title: `Lars: SMS — jobb startat (${projectName})`,
          routedAgent: 'lars',
          project,
        })
      }
      break

    case SYSTEM_STAGES.INVOICE_PAID:
      if (customerPhone) {
        await sendStageSms({
          businessId,
          to: customerPhone,
          message: `Tack för betalningen! Det var ett nöje att jobba med er. // ${companyName}`,
          title: `Karin: SMS — betalning mottagen (${projectName})`,
          routedAgent: 'karin',
          project,
        })
      }
      // Schemalägg recensionsförfrågan +3 dagar.
      //
      // Buggfix 2026-08-10: payloaden byggdes tidigare UTAN `to`/`message` —
      // exekveringscaset (app/api/approvals/[id]/route.ts, case
      // 'review_request') läser just de fälten, så godkännandet failade
      // tyst med "payload saknar to eller message" så fort hantverkaren
      // klickade Godkänn. Kanonisk form nu, samma som cronens
      // (app/api/cron/review-requests/route.ts).
      //
      // 180-dagarsspärr: project.customer hämtades med select('*') i
      // advanceProjectStage ovan, så review_request_sent_at finns redan på
      // objektet utan extra query. Utan spärren kan denna stage-triggade
      // väg och cronen be samma kund om recension två gånger.
      {
        const reviewSentAt = project.customer?.review_request_sent_at as string | null | undefined
        const askedRecently = !!reviewSentAt
          && new Date(reviewSentAt) > new Date(Date.now() - 180 * 24 * 3600000)

        const placeId = (config?.google_place_id || '').trim()
        const reviewUrl = config?.google_review_url
          || (placeId.startsWith('ChIJ')
            ? `https://search.google.com/local/writereview?placeid=${placeId}`
            : null)

        if (customerPhone && reviewUrl && !askedRecently) {
          const { buildReviewRequestMessage } = await import('@/lib/notifications/review-request-message')
          const message = buildReviewRequestMessage({
            customerName: project.customer?.name,
            projectName,
            businessName: companyName,
            reviewUrl,
          })
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
              to: customerPhone,
              message,
              agent_id: 'hanna',
            },
            status: 'pending',
            risk_level: 'low',
            expires_at: new Date(Date.now() + 14 * 24 * 3600000).toISOString(),
          })
        }
      }
      break

    case SYSTEM_STAGES.REVIEW_RECEIVED:
      // Schemalägg 1-årsuppföljning.
      // Buggfix 2026-08-10: samma to/message-saknad som review_request ovan
      // — se kommentaren där för exekveringscaset som kräver dessa fält.
      // Ingen 180-dagarsspärr här — det är en uppföljningsfråga, inte en
      // recensionsförfrågan (review_request_sent_at), och den skjuts redan
      // upp ett helt år.
      if (customerPhone) {
        const { buildYearlyFollowupMessage } = await import('@/lib/notifications/review-request-message')
        const message = buildYearlyFollowupMessage({
          customerName: project.customer?.name,
          projectName,
          businessName: companyName,
        })
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
            to: customerPhone,
            message,
            agent_id: 'hanna',
          },
          status: 'pending',
          risk_level: 'low',
          expires_at: new Date(Date.now() + 400 * 24 * 3600000).toISOString(),
        })
      }
      break

    // De övriga stages (MEETING_BOOKED, MILESTONE_REACHED, FINAL_INSPECTION,
    // INVOICE_SENT) har inga default SMS — bara metadata-uppdatering. Lägg
    // till per-business automationer via Settings → Project stages för
    // anpassad uppföljning.
  }
}

/**
 * @deprecated 2026-05-20 (T2.7 security audit): executeAutomation kunde
 * tidigare köra send_sms DIREKT utan approval om delay_hours=0. Det
 * bröt principen att alla externa actions ska gå genom pending_approvals.
 * Funktionen behålls för bakåtkompatibilitet men anropas INTE från
 * triggerStageAutomations längre. Borttagen i framtida cleanup-sprint.
 */
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

// Suppress unused-warning eftersom funktionen är @deprecated men behållen.
void executeAutomation

/**
 * TD-52 (Andreas-beslut 2026-07-15): default-automationernas kund-SMS vid
 * stage-övergångar är system-triggade (ingen människa bad om just detta
 * enskilda SMS) — samma princip som resten av filens automationer (se
 * SÄKERHETSFIX 2026-05-20-kommentaren ovan i triggerStageAutomations).
 * Ingen av de tre händelserna (kontrakt signerat/jobb startat/betalning
 * mottagen) mappar mot en förtjänad-autonomi-nyckel (lib/autonomy/
 * earned-autonomy.ts AutonomyKey — bara fakturapåminnelse/boknings-
 * påminnelse/offertuppföljning/recensionsförfrågan finns), så
 * shouldQueueForApproval('system', false) är alltid true idag. Skriven
 * via den delade gate-funktionen (inte hårdkodad `if`) så beslutet är
 * samma testade sanning som agentens send_sms/send_email-tool använder.
 */
async function sendStageSms(opts: {
  businessId: string
  to: string
  message: string
  title: string
  routedAgent: 'lars' | 'karin'
  project: any
}) {
  const autonomyGranted = false // ingen allowlistad nyckel för stage-notiser (se kommentar ovan)
  if (shouldQueueForApproval('system', autonomyGranted)) {
    const supabase = getServerSupabase()
    const { error } = await supabase.from('pending_approvals').insert({
      id: 'appr_' + Math.random().toString(36).substring(2, 14),
      business_id: opts.businessId,
      approval_type: 'send_sms',
      title: opts.title,
      description: opts.message,
      payload: {
        to: opts.to,
        message: opts.message,
        customer_id: opts.project.customer_id,
        customer_name: opts.project.customer?.name,
        project_id: opts.project.project_id,
        project_name: opts.project.name,
        // related_id → executor (app/api/approvals/[id]/route.ts, case 'send_sms')
        // läser payload.related_id för sms_log.related_id-spårning.
        related_id: opts.project.project_id,
        routed_agent: opts.routedAgent,
      },
      status: 'pending',
      risk_level: 'low',
      expires_at: new Date(Date.now() + 7 * 24 * 3600000).toISOString(),
    })
    if (error) console.error('[project-stages] sendStageSms: pending_approvals insert failed:', error)
    return
  }
  // Oåtkomlig idag (autonomyGranted är alltid false ovan) — bevarad om en
  // framtida allowlistad nyckel täcker dessa händelser.
  await sendSMS(opts.to, opts.message, opts.businessId)
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

  if (opts.invoiceId) {
    const { data: invoice, error } = await supabase
      .from('invoice')
      .select('project_id')
      .eq('business_id', opts.businessId)
      .eq('invoice_id', opts.invoiceId)
      .maybeSingle()

    if (error) {
      console.error('[project-stages] findProjectForEntity invoice lookup failed:', error)
      return null
    }

    return invoice?.project_id ? { project_id: invoice.project_id } : null
  }

  let query = supabase.from('project').select('project_id').eq('business_id', opts.businessId)
  if (opts.quoteId) query = query.eq('quote_id', opts.quoteId)
  else if (opts.dealId) query = query.eq('deal_id', opts.dealId)
  else return null

  const { data } = await query.maybeSingle()
  return data || null
}
