// Tool router for Next.js runtime
// Executes tools against Supabase using the server-side client

import { SupabaseClient } from '@supabase/supabase-js'
import { getCalendarEvents, createGoogleEvent } from '@/lib/google-calendar'
import { getCustomerEmails, sendGmailEmail } from '@/lib/gmail'
import { getNextCustomerNumber, getNextProjectNumber, getNextCaseNumber } from '@/lib/numbering'
import { getStageBySlug } from '@/lib/pipeline'
import { createLeadAndDeal } from '@/lib/leads/golden-path'
import { sanitizeSenderId } from '@/lib/sms/sender-id'
import { shouldQueueForApproval } from '@/lib/autonomy/agent-gating'
import {
  buildHandoffBriefing,
  handoffIdempotencyKey,
  validateNextStep,
  type AgentResult,
  type HandoffChain,
  type OrchestrationIntent,
  type PlanRefusal,
} from '@/lib/agent/orchestration'
import type { AgentId } from '@/lib/agent/capabilities'
import { createQuote as createCanonicalQuote } from '@/lib/quotes/create-quote'
import { classify } from '@/lib/approvals/action-contract'
import { OPEN_QUOTE_STATUSES } from '@/lib/quotes/statuses'
import { sweepMissedRevenue } from '@/lib/value/missed-revenue'
import { arTestId, arTestNamn } from '@/lib/testdata'
import { rotRutDeductionInclVat } from '@/lib/rot-rut'
import { calculateCappedDeduction } from '@/lib/rot-rut-limits'
import { resolveTimeEntryAttribution } from '@/lib/time-entries/resolve-attribution'
import { suggestQuoteDraftForLead } from '@/lib/quotes/suggest-quote-draft'
import { suggestAtaDraft } from '@/lib/ata/suggest-ata-draft'
import { fetchPersonDays } from '@/lib/schedule/person-day'
import { computePersonWeekUtilization } from '@/lib/schedule/utilization'
import { svDateStr, svDateStrPlusDays } from '@/lib/dates'
import { mondayOfWeek } from '@/lib/capacity/week-capacity'
import { computeFreeCapacity } from '@/lib/capacity/free-capacity'
import { loadOpportunityPortfolioForBusiness } from '@/lib/mission/opportunity-portfolio'
import { validateMissionPlan, type MissionPlanInput } from '@/lib/mission/plan-validation'
import type { MissionPlanPresentation } from '@/lib/mission/mission-presentation'
import { buildMissionSummaryText, buildMissionHeadline } from '@/lib/mission/mission-summary'
import { resolveGoalType } from '@/lib/mission/goal-type'
import { isToolAllowedForActor, EXTERNAL_TOOL_DENIED_MESSAGE, type ActorType } from '@/lib/agent/external-actor'
import { internalPushHeaders } from '@/lib/notifications/push-internal'

interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

interface GoogleConnection {
  access_token: string
  refresh_token: string
  token_expires_at: string | null
  calendar_id: string
  account_email: string
  gmail_scope_granted: boolean
  gmail_send_scope_granted: boolean
  gmail_sync_enabled: boolean
  sync_enabled: boolean
}

interface ToolContext {
  businessName: string
  contactEmail: string
  googleConnection: GoogleConnection | null
  agentId?: string
  /**
   * Orkestreringskedjan när körningen SJÄLV är en överlämning. Odefinierad för
   * en förstakörning. Bär vilka specialister som redan varit inne, så att
   * loopskyddet kan säga nej till A→B→A, och ursprungsärendet ordagrant.
   */
  handoffChain?: HandoffChain
  /**
   * TD-52: vem/vad initierade den här agent-körningen. 'user' = en
   * levande människa just nu (dashboard/mobil-chatt, eller ett svar i en
   * pågående kundkontakt — telefon/SMS/e-post in). 'system' = agenten
   * agerar autonomt (cron, schemalagd automation, agent-till-agent-
   * delegering). Styr om send_sms/send_email skickar direkt eller köas
   * som pending_approvals — se shouldQueueForApproval.
   */
  triggerSource: 'user' | 'system'
  /**
   * Etapp D-härdning (tasks/jaunty-pondering-hummingbird.md): den inloggade
   * business_users.id när anropet kommer från en levande dashboard-/mobil-
   * chatt (matte/chat/route.ts). Odefinierad/null i alla andra vägar
   * (autonoma subagenter, cron, agent-handoff) — confirm_mission skriver då
   * created_by: null precis som förut.
   */
  businessUserId?: string | null
  /**
   * Etapp S (tasks/lisa-voice-plan.md, korrigering 1 — Lisa Voice steg 1b):
   * se samma fält på lib/agent/agents/shared.ts ToolContext för den
   * fullständiga förklaringen. Odefinierad = intern aktör = dagens
   * beteende, oförändrat. 'external_customer' = oidentifierad extern part
   * — kontrolleras av vakten längst upp i executeTool() nedan.
   */
  actorType?: ActorType
  /**
   * Support-agenten (escalate_to_handymate_team, se docs/superpowers/specs/
   * 2026-08-21-handymate-support-agent-design.md): den agent_threads.id som
   * konversationen tillhör, satt av app/api/matte/chat/route.ts efter att
   * tråden skapats/hämtats. support_ticket.thread_id är NOT NULL — utan
   * detta fältet kan verktyget inte koppla ärendet till konversationen.
   * Odefinierad i alla andra vägar (orchestrator.ts/cron sätter aldrig
   * detta — de har ingen levande chattråd).
   */
  threadId?: string | null
}

function generateId(prefix: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = prefix + '_'
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  supabase: SupabaseClient,
  businessId: string,
  context: ToolContext
): Promise<ToolResult> {
  // ═══ ETAPP S — DUBBELGRINDENS ANDRA HALVA (Lisa Voice steg 1b) ═══
  // filterTools() i lib/agent/agents/shared.ts hindrar redan modellen från
  // att SE ett icke-vitlistat verktyg när aktören är en oidentifierad
  // extern part — men listan till modellen är UX, inte gränsen (samma
  // disciplin som isToolAllowedForAgent i app/api/matte/chat/route.ts,
  // P0.2). Den riktiga gränsen sitter här, FÖRE switchen: ett hallucinerat
  // eller injicerat verktygsnamn förbi filtreringen exekverar aldrig sitt
  // case. Neutral text — avslöjar aldrig vilka verktyg som finns.
  if (!isToolAllowedForActor(name, context.actorType)) {
    return { success: false, error: EXTERNAL_TOOL_DENIED_MESSAGE }
  }
  try {
    switch (name) {
      case 'get_customer':
        return await getCustomer(supabase, businessId, input)
      case 'search_customers':
        return await searchCustomers(supabase, businessId, input)
      case 'create_customer':
        return await createCustomer(supabase, businessId, input)
      case 'update_customer':
        return await updateCustomer(supabase, businessId, input)
      case 'create_quote':
        return await createQuote(supabase, businessId, input)
      case 'get_quotes':
        return await getQuotes(supabase, businessId, input)
      case 'create_invoice':
        return await createInvoice(supabase, businessId, input)
      case 'create_ata_draft':
        return await createAtaDraftTool(supabase, businessId, input)
      case 'check_calendar':
        return await checkCalendar(supabase, businessId, input, context)
      case 'create_booking':
        return await createBooking(supabase, businessId, input, context)
      case 'update_project':
        return await updateProject(supabase, businessId, input)
      case 'log_time':
        return await logTime(supabase, businessId, input)
      case 'get_person_schedule':
        return await getPersonSchedule(supabase, businessId, input)
      case 'send_sms':
        return await sendSms(supabase, businessId, input, context)
      case 'send_email':
        return await sendEmail(supabase, businessId, input, context)
      case 'read_customer_emails':
        return await readCustomerEmails(input, context)
      case 'qualify_lead':
        return await qualifyLead(supabase, businessId, input)
      case 'update_lead_status':
        return await updateLeadStatus(supabase, businessId, input)
      case 'get_lead':
        return await getLeadTool(supabase, businessId, input)
      case 'search_leads':
        return await searchLeads(supabase, businessId, input)
      case 'get_daily_stats':
        return await getDailyStats(supabase, businessId, input)
      case 'create_approval_request':
        return await createApprovalRequest(supabase, businessId, input)
      case 'get_account_billing_status': {
        const { data, error } = await supabase
          .from('business_config')
          .select('subscription_plan, subscription_status, trial_ends_at')
          .eq('business_id', businessId)
          .single()
        if (error || !data) {
          return { success: false, error: 'Kunde inte läsa kontostatus' }
        }
        return {
          success: true,
          data: {
            plan: data.subscription_plan,
            status: data.subscription_status,
            trial_ends_at: data.trial_ends_at,
          },
        }
      }
      case 'escalate_to_handymate_team': {
        const { category, summary } = input
        if (!category || !summary) {
          return { success: false, error: 'category och summary krävs' }
        }
        const threadId = context.threadId
        if (!threadId) {
          return { success: false, error: 'Ingen aktiv konversationstråd att koppla ärendet till' }
        }

        // Modellretry/dubbelklick får inte skapa flera öppna kö-rader för
        // samma ärende. Ett tidigare LÖST ärende hindrar däremot inte en ny
        // eskalering i samma tråd.
        const { data: existingTicket, error: existingTicketError } = await supabase
          .from('support_ticket')
          .select('id')
          .eq('business_id', businessId)
          .eq('thread_id', threadId)
          .eq('category', String(category))
          .in('status', ['escalated', 'in_progress'])
          .order('escalated_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (existingTicketError) {
          console.error('[escalate_to_handymate_team] dedupe lookup error:', existingTicketError)
          return { success: false, error: 'Kunde inte kontrollera befintligt supportärende' }
        }
        if (existingTicket) {
          return {
            success: true,
            data: {
              ticket_id: existingTicket.id,
              deduplicated: true,
              message: 'Du har redan ett öppet ärende i supportkön. Handymates team återkommer till dig här i chatten.',
            },
          }
        }

        const ticketId = generateId('stkt')
        const { error } = await supabase.from('support_ticket').insert({
          id: ticketId,
          business_id: businessId,
          thread_id: threadId,
          category: String(category),
          summary: String(summary),
          status: 'escalated',
        })
        if (error) {
          console.error('[escalate_to_handymate_team] insert error:', error)
          return { success: false, error: 'Kunde inte skapa supportärendet' }
        }

        const {
          notifyHandymateSupportTeam,
          supportEscalationCustomerMessage,
        } = await import('@/lib/notifications/handymate-team-alert')
        const alertDelivery = await notifyHandymateSupportTeam({
          businessName: context.businessName || 'Okänt företag',
          category: String(category),
          ticketId,
          summary: String(summary),
        })

        return {
          success: true,
          data: {
            ticket_id: ticketId,
            deduplicated: false,
            alert_delivered: alertDelivery.delivered,
            message: supportEscalationCustomerMessage(alertDelivery),
          },
        }
      }
      case 'check_pending_approvals':
        return await checkPendingApprovals(supabase, businessId)
      case 'get_project_profitability': {
        try {
          // Migrerad (2026-08-12) från legacy lib/profitability.ts till den
          // kanoniska ekonomimotorn — samma migrering som mobile-routen och
          // Margin Guardian. Returnerar hela ProjectEconomics-objektet så
          // agenten kan resonera ärligt kring marginal.arbetskostnad_konfigurerad
          // i stället för en förenklad legacy-shape.
          const { computeProjectEconomics } = await import('@/lib/projects/compute-economics')
          const economics = await computeProjectEconomics(supabase, String(input.project_id), businessId)
          return { success: true, data: economics }
        } catch (err: any) {
          return { success: false, error: err.message }
        }
      }
      case 'simulate_business_scenario': {
        const { runBusinessScenario } = await import('@/lib/business-twin/run-scenario')
        const scenario = await runBusinessScenario(supabase, businessId, input as any)
        return { success: true, data: scenario }
      }
      case 'get_communication_trail': {
        // Läsande — hela underlaget lever i lib/compliance, verktyget gör
        // bara ett kompakt urklipp (prompter tål inte 500 fulla kroppar).
        const { getCommunicationTrail, normalizeTrailRange } = await import('@/lib/compliance/communication-trail')
        const { fromIso, toIso } = normalizeTrailRange(
          typeof input.from_date === 'string' ? input.from_date : undefined,
          typeof input.to_date === 'string' ? input.to_date : undefined,
        )
        const trail = await getCommunicationTrail(supabase, businessId, String(input.customer_id || ''), { fromIso, toIso })
        if (!trail) return { success: false, error: 'Kunden hittades inte i det här företaget' }
        const max = Math.max(1, Math.min(100, Number(input.max_entries) || 30))
        const compact = trail.entries.slice(-max).map(e => ({
          channel: e.channel,
          direction: e.direction,
          timestamp: e.timestamp,
          title: e.title,
          body: e.body ? (e.body.length > 200 ? `${e.body.slice(0, 200)}…` : e.body) : null,
        }))
        return {
          success: true,
          data: {
            customer_name: trail.customer.name,
            total_entries: trail.entries.length,
            shown_entries: compact.length,
            entries: compact,
            sources_with_errors: trail.sources_with_errors,
            truncated_sources: trail.truncated_sources,
            note: 'Urklipp: kroppar avkortade till 200 tecken och bara de senaste posterna visas. Den fullständiga exporten laddas ner från kundkortet ("Ladda ner kommunikationsunderlag").',
          },
        }
      }
      case 'update_business_preference':
        return await updateBusinessPreference(supabase, businessId, input)
      case 'get_automation_settings':
        return await getAutomationSettings(supabase, businessId)
      case 'log_automation_action':
        return await logAutomationAction(supabase, businessId, input)
      case 'check_fortnox_status':
        return await checkFortnoxStatusTool(businessId)
      case 'trigger_fortnox_sync':
        return await triggerFortnoxSyncTool(businessId, input)
      case 'get_pricing_suggestion':
        return await getPricingSuggestionTool(businessId, input)
      case 'send_agent_message':
        return await sendAgentMessageTool(supabase, businessId, context, input)
      case 'get_agent_messages':
        return await getAgentMessagesTool(supabase, businessId, context)
      case 'get_efterkalkyl_insight':
        return await getEfterkalkylInsightTool(supabase, businessId, input)
      case 'get_project_outcome':
        return await getProjectOutcomeTool(supabase, businessId, input)
      case 'run_customer_base_sweep':
        return await runCustomerBaseSweepTool(supabase, businessId, context)
      case 'book_site_visit':
        return await bookSiteVisitTool(supabase, businessId, input, context)
      case 'get_projects_overview':
        return await getProjectsOverview(supabase, businessId, input)
      case 'get_stale_quotes':
        return await getStaleQuotes(supabase, businessId, input)
      case 'get_invoiceable_work':
        return await getInvoiceableWork(supabase, businessId)
      case 'get_customer_commitments':
        return await getCustomerCommitments(supabase, businessId)
      // Etapp O (Evidence-to-Payment readiness) — Matte-scopat, se tool-definitions.ts.
      case 'get_project_commercial_readiness':
        return await getProjectCommercialReadinessTool(supabase, businessId, input)
      // Goal-to-Plan V1 (Etapp B) — Matte-scopat, se tool-definitions.ts.
      case 'propose_mission_plan':
        return await proposeMissionPlanTool(supabase, businessId, input)
      case 'confirm_mission':
        return await confirmMissionTool(supabase, businessId, input, context)
      default:
        return { success: false, error: `Okänt verktyg: ${name}` }
    }
  } catch (err: any) {
    return { success: false, error: `Tool error (${name}): ${err.message}` }
  }
}

// ═══ TENANTVAKTEN (Codex audit P0.1, 2026-08-08) ═══
//
// Routern kör med service_role — RLS gäller inte här. Flera mutations-
// verktyg skrev params.customer_id rakt in i insert:en utan att verifiera
// att kunden hör till företaget. Ett främmande id (hallucinerat av
// modellen, eller injicerat via en konversation) skapade då en offert,
// faktura eller bokning som pekar in i EN ANNAN TENANTS kunddata — exakt
// den klass v96 stängde för läsningar, fast för skrivningar.
//
// Regeln: varje mutationsverktyg som tar ett customer_id validerar det
// mot business_id FÖRE första skrivningen. Saknat/främmande id → tydligt
// fel, noll mutation. Kan kontrollen inte göras (DB-fel) nekas anropet —
// fail-closed, samma princip som handoff-räknaren.
async function assertCustomerInBusiness(
  supabase: SupabaseClient,
  businessId: string,
  customerId: unknown,
): Promise<string | null> {
  if (typeof customerId !== 'string' || customerId.length === 0) {
    return 'customer_id saknas eller är ogiltigt'
  }
  const { data, error } = await supabase
    .from('customer')
    .select('customer_id')
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
    .maybeSingle()
  if (error) return `Kunde inte verifiera kunden: ${error.message}`
  if (!data) return 'Kunden finns inte i det här företaget'
  return null
}

// ── CRM ─────────────────────────────────────────────────

async function getCustomer(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('customer')
    .select('customer_id, name, phone_number, email, address_line, customer_rating, created_at')
    .eq('business_id', businessId)
    .eq('customer_id', params.customer_id)
    .single()

  if (error) return { success: false, error: `Kunden hittades inte: ${error.message}` }

  const { data: bookings } = await supabase
    .from('booking')
    .select('booking_id, scheduled_start, scheduled_end, status, notes')
    .eq('customer_id', params.customer_id as string)
    .eq('business_id', businessId)
    .order('scheduled_start', { ascending: false })
    .limit(5)

  // Customer Memory V2 (2026-08-16): Matte-chattens dashboard-läge läste
  // aldrig customer_fact trots att offertgeneratorn och SMS/mejl-
  // automationen redan gjorde det via lib/matte/resolver.ts — en fråga om
  // "vad vet vi om den här kunden?" i chatten kunde alltså inte besvaras ur
  // sparade fakta. Fail-safe: ett fel här ska aldrig fälla hela verktyget.
  let confirmedFacts: Array<{ fact_type: string; content: string }> = []
  try {
    const { data: facts } = await supabase
      .from('customer_fact')
      .select('fact_type, content')
      .eq('business_id', businessId)
      .eq('customer_id', params.customer_id as string)
      .is('superseded_by', null)
      .order('created_at', { ascending: false })
      .limit(10)
    confirmedFacts = facts || []
  } catch {
    confirmedFacts = []
  }

  return { success: true, data: { ...data, recent_bookings: bookings || [], confirmed_facts: confirmedFacts } }
}

async function searchCustomers(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const query = (params.query as string).trim()
  if (query.length < 2) return { success: false, error: 'Söktermen måste vara minst 2 tecken' }

  const { data, error } = await supabase
    .from('customer')
    .select('customer_id, name, phone_number, email, address_line')
    .eq('business_id', businessId)
    .or(`name.ilike.%${query}%,phone_number.ilike.%${query}%,email.ilike.%${query}%`)
    .limit((params.limit as number) || 10)

  if (error) return { success: false, error: error.message }
  return { success: true, data: { count: data.length, customers: data } }
}

async function createCustomer(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const { data: existing } = await supabase
    .from('customer')
    .select('customer_id, name')
    .eq('business_id', businessId)
    .eq('phone_number', params.phone_number as string)
    .single()

  if (existing) {
    return { success: false, error: `Kund med detta nummer finns redan: ${existing.name} (${existing.customer_id})` }
  }

  const customerId = generateId('cust')
  const customerNumber = await getNextCustomerNumber(supabase, businessId)
  const { error } = await supabase.from('customer').insert({
    customer_id: customerId,
    business_id: businessId,
    name: params.name,
    phone_number: params.phone_number,
    email: params.email || null,
    address_line: params.address_line || null,
    customer_number: customerNumber,
    created_at: new Date().toISOString(),
  })

  if (error) return { success: false, error: error.message }

  // Fortnox-kundnummer vid SKAPANDET (2026-08-26) — se
  // lib/fortnox/sync.ts syncNewCustomerToFortnox. Non-blocking.
  try {
    const { syncNewCustomerToFortnox } = await import('@/lib/fortnox/sync')
    await syncNewCustomerToFortnox(supabase, businessId, customerId)
  } catch { /* non-blocking */ }

  return { success: true, data: { customer_id: customerId, customer_number: customerNumber, message: `Kund "${params.name}" skapad (${customerNumber})` } }
}

async function updateCustomer(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const { customer_id, ...updates } = params
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) { if (v !== undefined) clean[k] = v }

  if (Object.keys(clean).length === 0) return { success: false, error: 'Inga fält att uppdatera' }

  const { data, error } = await supabase
    .from('customer').update(clean)
    .eq('business_id', businessId).eq('customer_id', customer_id)
    .select().single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: { message: `Kund uppdaterad`, customer: data } }
}

// ── Operations ──────────────────────────────────────────

async function createQuote(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  // Tenantvakten FÖRE första skrivningen — se assertCustomerInBusiness.
  const tenantFel = await assertCustomerInBusiness(supabase, businessId, params.customer_id)
  if (tenantFel) return { success: false, error: tenantFel }

  const items = (params.items as any[]).map(i => ({ ...i, total: i.quantity * i.unit_price }))
  const laborTotal = items.filter(i => i.type === 'labor').reduce((s, i) => s + i.total, 0)
  const materialTotal = items.filter(i => i.type === 'material').reduce((s, i) => s + i.total, 0)
  const subtotal = laborTotal + materialTotal

  // Fetch VAT rate from business_config (default 25%)
  const { data: bizVat } = await supabase
    .from('business_config').select('default_vat_rate, pricing_settings')
    .eq('business_id', businessId).single()
  const vatRate = bizVat?.default_vat_rate ?? bizVat?.pricing_settings?.vat_rate ?? 25
  const vatAmount = Math.round(subtotal * (vatRate / 100))
  const total = subtotal + vatAmount

  // Årstakskontroll (VÅG 1b, value-chain-plan.md) — samma mönster som
  // app/api/invoices/from-quote (calculateCappedDeduction), som INTE bara
  // beräknar det råa avdraget utan även begränsar mot kundens redan
  // utnyttjade ROT/RUT-utrymme i år. Utan detta kunde agenten skapa
  // offerter med avdrag som Skatteverket nekar. customer_id är required i
  // create_quote-schemat så det finns alltid data för kontrollen.
  let rotRutDeduction = 0
  let rotRutCapped = false
  let rotRutWarning: string | undefined
  if ((params.rot_rut_type === 'rot' || params.rot_rut_type === 'rut') && params.customer_id) {
    const capped = await calculateCappedDeduction(
      params.customer_id as string,
      businessId,
      params.rot_rut_type as 'rot' | 'rut',
      laborTotal,
      { vatRate }
    )
    rotRutDeduction = capped.deduction
    rotRutCapped = capped.capped
    rotRutWarning = capped.warning
  }

  const validUntil = new Date()
  validUntil.setDate(validUntil.getDate() + ((params.valid_days as number) || 30))

  const rotRutType = (params.rot_rut_type as string) ?? null

  // Kanoniska byggaren (lib/quotes/create-quote.ts). Agentens offerter fick
  // tidigare varken quote_number eller sign_token — smart-communication satte
  // då quote_link: undefined och SMS:et till kunden gick ut UTAN länk.
  const skapad = await createCanonicalQuote(supabase, businessId, {
    customerId: params.customer_id as string,
    title: String(params.title),
    description: (params.description as string) ?? null,
    vatRate,
    rotRutType,
    rotRutDeduction,
    validDays: (params.valid_days as number) || 30,
    source: 'agent',
    items: items.map(i => {
      const isLabor = i.type === 'labor'
      return {
        // create_quote-schemat (tool-definitions.ts) definierar radfältet som
        // "name", inte "description" — name är primärt, description
        // accepteras också ifall agenten (mot schema) skickar det.
        description: i.name ?? i.description ?? '',
        quantity: i.quantity ?? 0,
        unit: i.unit ?? 'st',
        unit_price: i.unit_price ?? 0,
        is_rot_eligible: isLabor && rotRutType === 'rot',
        is_rut_eligible: isLabor && rotRutType === 'rut',
        rot_rut_type: isLabor && (rotRutType === 'rot' || rotRutType === 'rut') ? rotRutType : null,
      }
    }),
    // items-JSONB:n är bara en spegling (quote_items är sanningen), men
    // speglingen behålls tills läsarna av den är migrerade.
    extra: { items, labor_total: laborTotal, material_total: materialTotal, vat_amount: vatAmount },
  })

  if (!skapad.success) return { success: false, error: skapad.error }

  return { success: true, data: {
    quote_id: skapad.quoteId, quote_number: skapad.quoteNumber,
    message: `Offert ${skapad.quoteNumber} "${params.title}" skapad`,
    summary: {
      labor_total: laborTotal, material_total: materialTotal,
      subtotal_ex_vat: subtotal, vat_rate: vatRate, vat_amount: vatAmount, total_incl_vat: total,
      rot_rut_deduction: rotRutDeduction, customer_pays: total - rotRutDeduction,
      ...(rotRutCapped ? { rot_rut_capped: true, rot_rut_warning: rotRutWarning } : {}),
    }
  }}
}

async function getQuotes(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  let q = supabase.from('quotes')
    .select('quote_id, customer_id, title, status, total, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit((params.limit as number) || 20)

  if (params.customer_id) q = q.eq('customer_id', params.customer_id as string)
  if (params.status) q = q.eq('status', params.status as string)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }
  return { success: true, data: { count: data.length, quotes: data } }
}

async function createInvoice(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  // Tenantvakten FÖRE första skrivningen — se assertCustomerInBusiness.
  const tenantFel = await assertCustomerInBusiness(supabase, businessId, params.customer_id)
  if (tenantFel) return { success: false, error: tenantFel }

  let items: any[] = []
  let rotRutType = params.rot_rut_type as string | null

  if (params.quote_id) {
    const { data: quote } = await supabase.from('quotes')
      .select('items, rot_rut_type')
      .eq('business_id', businessId).eq('quote_id', params.quote_id).single()
    if (!quote) return { success: false, error: 'Offerten hittades inte' }
    items = typeof quote.items === 'string' ? JSON.parse(quote.items) : quote.items
    rotRutType = rotRutType || quote.rot_rut_type
  } else if (params.items) {
    items = (params.items as any[]).map(i => ({ ...i, total: i.quantity * i.unit_price }))
  } else {
    return { success: false, error: 'Ange quote_id eller items' }
  }

  const subtotal = items.reduce((s: number, i: any) => s + (i.total || i.quantity * i.unit_price), 0)

  // Fetch VAT rate + fakturanummer-config från business_config
  const { data: bizVat } = await supabase
    .from('business_config').select('default_vat_rate, pricing_settings, invoice_prefix, next_invoice_number')
    .eq('business_id', businessId).single()
  const vatRate = bizVat?.default_vat_rate ?? bizVat?.pricing_settings?.vat_rate ?? 25
  const vatAmount = Math.round(subtotal * (vatRate / 100))
  const total = subtotal + vatAmount

  const laborTotal = items.filter((i: any) => i.type === 'labor').reduce((s: number, i: any) => s + (i.total || 0), 0)

  // Årstakskontroll (VÅG 1b) — samma mönster som createQuote ovan och
  // app/api/invoices/from-quote: räkna om avdraget mot kundens redan
  // utnyttjade ROT/RUT-utrymme i år, oavsett om raderna kommer från en
  // offert (quote_id) eller skickas direkt (items) — precis som
  // from-quote INTE kopierar quotens rot_rut_deduction rakt av (kunden kan
  // ha använt mer av sitt utrymme sedan offerten skapades).
  let rotRutDeduction = 0
  let rotRutCapped = false
  let rotRutWarning: string | undefined
  if ((rotRutType === 'rot' || rotRutType === 'rut') && params.customer_id) {
    const capped = await calculateCappedDeduction(
      params.customer_id as string,
      businessId,
      rotRutType as 'rot' | 'rut',
      laborTotal,
      { vatRate }
    )
    rotRutDeduction = capped.deduction
    rotRutCapped = capped.capped
    rotRutWarning = capped.warning
  }

  // Fakturanummer: samma räknare som huvudvägen (invoices/from-quote) —
  // prefix + next_invoice_number — så agentens fakturor inte krockar med dem.
  const prefix = bizVat?.invoice_prefix ?? 'FV'
  const nextNum = bizVat?.next_invoice_number ?? 1
  const year = new Date().getFullYear()
  const invoiceNumber = `${prefix}-${year}-${String(nextNum).padStart(3, '0')}`

  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + ((params.due_days as number) || 30))

  const invoiceId = generateId('inv')
  const { error } = await supabase.from('invoice').insert({
    invoice_id: invoiceId, business_id: businessId, customer_id: params.customer_id,
    quote_id: params.quote_id || null, invoice_number: invoiceNumber, status: 'draft',
    items, subtotal, vat_rate: vatRate, vat_amount: vatAmount, total,
    rot_rut_type: rotRutType, rot_rut_deduction: rotRutDeduction, customer_pays: total - rotRutDeduction,
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: dueDate.toISOString().split('T')[0],
    created_at: new Date().toISOString(),
  })

  if (error) return { success: false, error: error.message }

  // Öka räknaren så nästa faktura får ett nytt nummer (paritet med from-quote).
  const { error: counterError } = await supabase
    .from('business_config')
    .update({ next_invoice_number: nextNum + 1 })
    .eq('business_id', businessId)
  if (counterError) console.error('[createInvoice] next_invoice_number increment failed:', counterError.message)

  return { success: true, data: {
    invoice_id: invoiceId, invoice_number: invoiceNumber, message: `Faktura ${invoiceNumber} skapad`,
    total, customer_pays: total - rotRutDeduction,
    ...(rotRutCapped ? { rot_rut_capped: true, rot_rut_warning: rotRutWarning } : {}),
  } }
}

async function checkCalendar(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  // 1. Query Handymate bookings
  const { data: bookings, error } = await supabase.from('booking')
    .select('booking_id, customer_id, scheduled_start, scheduled_end, status, notes, google_event_id')
    .eq('business_id', businessId)
    .gte('scheduled_start', `${params.from_date}T00:00:00`)
    .lte('scheduled_start', `${params.to_date}T23:59:59`)
    .neq('status', 'cancelled')
    .order('scheduled_start', { ascending: true })

  if (error) return { success: false, error: error.message }

  // 2. Enrich with customer names
  const customerIds = Array.from(new Set((bookings || []).map((b: any) => b.customer_id)))
  let customerMap: Record<string, string> = {}
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('customer').select('customer_id, name').in('customer_id', customerIds)
    customerMap = Object.fromEntries(
      (customers || []).map((c: any) => [c.customer_id, c.name])
    )
  }

  const enrichedBookings = (bookings || []).map((b: any) => ({
    ...b,
    customer_name: customerMap[b.customer_id] || 'Okänd',
    source: 'handymate',
  }))

  // 3. Fetch Google Calendar events if connected
  let googleEvents: Array<{
    id: string; summary: string; description: string | null
    start: string; end: string; allDay: boolean; source: string
  }> = []

  if (context.googleConnection?.sync_enabled) {
    try {
      const fromDate = new Date(`${params.from_date}T00:00:00`)
      const toDate = new Date(`${params.to_date}T23:59:59`)
      const gEvents = await getCalendarEvents(
        context.googleConnection.access_token,
        context.googleConnection.calendar_id || 'primary',
        fromDate, toDate
      )

      // Deduplicate: exclude Google events already linked to a booking
      const syncedIds = new Set(
        (bookings || []).filter((b: any) => b.google_event_id).map((b: any) => b.google_event_id)
      )

      googleEvents = gEvents
        .filter(e => !syncedIds.has(e.id))
        .map(e => ({
          id: e.id,
          summary: e.summary,
          description: e.description,
          start: e.start.toISOString(),
          end: e.end.toISOString(),
          allDay: e.allDay,
          source: 'google_calendar',
        }))
    } catch (err: any) {
      console.error('[checkCalendar] Google Calendar error:', err.message)
    }
  }

  return {
    success: true,
    data: {
      period: `${params.from_date} – ${params.to_date}`,
      booking_count: enrichedBookings.length,
      google_event_count: googleEvents.length,
      bookings: enrichedBookings,
      google_events: googleEvents,
      google_calendar_connected: !!context.googleConnection?.sync_enabled,
    },
  }
}

// ── Schema (R5, tasks/resurs-masterplan.md) ──────────────────────
// get_person_schedule läser SAMMA sammanslagningskälla som resurstavlan
// (lib/schedule/person-day.ts fetchPersonDays + lib/schedule/utilization.ts
// computePersonWeekUtilization) — ingen ny logik här, bara I/O-inramning +
// namnmatchning för agentens fritext-input.

/** Max antal dagar per förfrågan — skydd mot orimligt stora payloads. */
const MAX_PERSON_SCHEDULE_RANGE_DAYS = 62
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

interface PersonScheduleMember {
  id: string
  name: string
}

type PersonScheduleResolution =
  | { mode: 'all' }
  | { mode: 'single'; member: PersonScheduleMember }
  | { mode: 'ambiguous'; alternatives: string[] }
  | { mode: 'none' }

/**
 * Namnmatchning för get_person_schedule — samma "aldrig gissa"-princip som
 * pickUnambiguousAssignee/pickUnambiguousBookingAssignee (lib/egenkontroll/
 * suggest-time-entry.ts): en entydig träff är ett faktum och används direkt,
 * en tvetydig träff listas som alternativ istället för att gissas, ingen
 * träff är ingen träff — aldrig en tyst första-bästa-match.
 */
function resolvePersonScheduleQuery(
  query: string,
  members: PersonScheduleMember[],
): PersonScheduleResolution {
  const q = query.trim().toLowerCase()
  if (!q || q === 'alla' || q === 'alla medlemmar' || q === 'alla teammedlemmar' || q === 'hela teamet') {
    return { mode: 'all' }
  }

  const exact = members.filter((m) => m.name.trim().toLowerCase() === q)
  if (exact.length === 1) return { mode: 'single', member: exact[0] }

  const partial = members.filter((m) => m.name.toLowerCase().includes(q))
  if (partial.length === 1) return { mode: 'single', member: partial[0] }
  if (partial.length > 1) return { mode: 'ambiguous', alternatives: partial.map((m) => m.name) }

  return { mode: 'none' }
}

/** Alla YYYY-MM-DD-datum i intervallet [from, to], inklusive. Ankrar på
 * UTC-middag samma "säkra ankare"-mönster som resten av schema-modulen. */
function datesInRange(from: string, to: string): string[] {
  const dates: string[] = []
  let cursor = from
  let guard = 0
  while (cursor <= to && guard <= MAX_PERSON_SCHEDULE_RANGE_DAYS + 1) {
    dates.push(cursor)
    cursor = svDateStrPlusDays(1, new Date(`${cursor}T12:00:00Z`))
    guard++
  }
  return dates
}

async function getPersonSchedule(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const { data: membersData, error: membersError } = await supabase
    .from('business_users')
    .select('id, name')
    .eq('business_id', businessId)
    .eq('is_active', true)

  if (membersError) return { success: false, error: membersError.message }

  const activeMembers: PersonScheduleMember[] = (membersData || []).map((m: any) => ({
    id: m.id,
    name: m.name || 'Namnlös',
  }))
  if (activeMembers.length === 0) {
    return { success: false, error: 'Inga aktiva teammedlemmar hittades.' }
  }

  const personQuery = typeof params.person === 'string' && params.person.trim() ? params.person : 'alla'
  const resolution = resolvePersonScheduleQuery(personQuery, activeMembers)

  if (resolution.mode === 'none') {
    return { success: false, error: `Ingen aktiv teammedlem matchar "${personQuery}".` }
  }
  if (resolution.mode === 'ambiguous') {
    return {
      success: true,
      data: {
        ambiguous: true,
        query: personQuery,
        alternatives: resolution.alternatives,
        message: `Flera teammedlemmar matchar "${personQuery}": ${resolution.alternatives.join(', ')}. Fråga hantverkaren vilken person som avses innan du fortsätter.`,
      },
    }
  }
  const targetMembers = resolution.mode === 'all' ? activeMembers : [resolution.member]

  // ── Datumintervall — default innevarande vecka (mån–sön) ────────────
  const rawFrom = typeof params.from_date === 'string' && DATE_RE.test(params.from_date) ? params.from_date : null
  const rawTo = typeof params.to_date === 'string' && DATE_RE.test(params.to_date) ? params.to_date : null
  const from = rawFrom || mondayOfWeek(svDateStr())
  const to = rawTo || svDateStrPlusDays(6, new Date(`${from}T12:00:00Z`))

  if (to < from) {
    return { success: false, error: `to_date (${to}) kan inte vara före from_date (${from}).` }
  }
  const spanDays = Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000) + 1
  if (spanDays > MAX_PERSON_SCHEDULE_RANGE_DAYS) {
    return { success: false, error: `Datumintervallet är för stort (${spanDays} dagar, max ${MAX_PERSON_SCHEDULE_RANGE_DAYS}).` }
  }

  const allDates = datesInRange(from, to)
  const memberIds = targetMembers.map((m) => m.id)
  const personDays = await fetchPersonDays(supabase, businessId, memberIds, from, to)

  // Fas 1 (kapacitets-primitiven) — ledig/bokningsbar kapacitet ur SAMMA
  // personDays som redan hämtats ovan, ingen extra DB-runda.
  const freeCapacity = computeFreeCapacity(personDays, memberIds, { from, to })

  const people = targetMembers.map((m) => {
    const util = computePersonWeekUtilization(personDays, m.id, allDates)
    const personFree = freeCapacity.people.find((p) => p.businessUserId === m.id)
    const days = allDates.map((date) => {
      const day = personDays.find((pd) => pd.businessUserId === m.id && pd.date === date)
      const freeDay = personFree?.days.find((d) => d.date === date)
      return {
        date,
        is_absent: day?.isAbsent ?? false,
        free_hours: freeDay?.freeHours ?? 0,
        bookable_hours: freeDay?.bookableHours ?? 0,
        shifts: (day?.shifts || []).map((s) => ({
          source: s.source,
          type: s.type,
          title: s.title,
          start: s.start,
          end: s.end,
          all_day: s.allDay,
          conflict: s.conflict,
        })),
      }
    })
    return {
      business_user_id: m.id,
      name: m.name,
      utilization_pct: Math.round(util.utilizationPct),
      total_hours: util.totalHours,
      total_bookable_hours: personFree?.totalBookableHours ?? 0,
      days,
    }
  })

  return {
    success: true,
    data: { query: personQuery, range: { from, to }, people },
  }
}

async function createBooking(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  // Tenantvakten FÖRE insert:en — se assertCustomerInBusiness. Gäller även
  // book_site_visit, som kör hit igenom.
  const tenantFel = await assertCustomerInBusiness(supabase, businessId, params.customer_id)
  if (tenantFel) return { success: false, error: tenantFel }

  const bookingId = generateId('book')
  const { error } = await supabase.from('booking').insert({
    booking_id: bookingId, business_id: businessId, customer_id: params.customer_id,
    scheduled_start: params.scheduled_start,
    scheduled_end: params.scheduled_end, status: 'pending',
    notes: [params.service_type, params.notes].filter(Boolean).join(' — ') || null,
    created_at: new Date().toISOString(),
  })

  if (error) return { success: false, error: error.message }

  // Sync to Google Calendar if connected
  let googleEventId: string | null = null
  if (context.googleConnection?.sync_enabled) {
    try {
      const { data: customer } = await supabase
        .from('customer').select('name, address_line, phone_number')
        .eq('customer_id', params.customer_id as string).single()

      const customerName = customer?.name || 'Kund'
      const summary = `${params.service_type} – ${customerName}`
      const description = [
        `Bokning: ${bookingId}`,
        `Kund: ${customerName}`,
        customer?.phone_number ? `Tel: ${customer.phone_number}` : '',
        customer?.address_line ? `Adress: ${customer.address_line}` : '',
        `Tjänst: ${params.service_type}`,
        params.notes ? `Anteckningar: ${params.notes}` : '',
      ].filter(Boolean).join('\n')

      googleEventId = await createGoogleEvent(
        context.googleConnection.access_token,
        context.googleConnection.calendar_id || 'primary',
        {
          summary,
          description,
          start: new Date(params.scheduled_start as string),
          end: new Date(params.scheduled_end as string),
        }
      )

      if (googleEventId) {
        const { error: syncUpdateError } = await supabase.from('booking').update({
          google_event_id: googleEventId,
          synced_to_google_at: new Date().toISOString(),
        }).eq('booking_id', bookingId)
        if (syncUpdateError) {
          // Google-eventet skapades men vi kunde inte spara kopplingen. Bokningen
          // finns kvar (icke-blockerande), men påstå inte att synken lyckades.
          console.error('[createBooking] google_event_id update failed:', syncUpdateError.message)
          googleEventId = null
        }
      }
    } catch (err: any) {
      console.error('[createBooking] Google Calendar sync error:', err.message)
    }
  }

  // Smart dispatch — föreslå tekniker (non-blocking). Mirrorar POST
  // /api/bookings (app/api/bookings/route.ts) rakt av, så telefon-/
  // Matte-skapade bokningar också får ett dispatch-förslag — innan denna
  // ändring fick de aldrig ett.
  try {
    const { suggestDispatch } = await import('@/lib/dispatch')
    let dispatchCustomerName: string | null = null
    if (params.customer_id) {
      const { data: cust } = await supabase
        .from('customer')
        .select('name')
        .eq('customer_id', params.customer_id as string)
        .maybeSingle()
      dispatchCustomerName = cust?.name || null
    }
    await suggestDispatch({
      businessId,
      jobTitle: (params.service_type as string) || (params.notes as string) || 'Bokning',
      jobAddress: (params.address as string) || null,
      scheduledStart: params.scheduled_start as string,
      scheduledEnd: (params.scheduled_end as string) || null,
      jobType: (params.service_type as string) || '',
      contextType: 'booking',
      contextId: bookingId,
      customerName: dispatchCustomerName,
    })
  } catch (dispatchErr: any) {
    console.error('[createBooking] Dispatch suggestion error (non-blocking):', dispatchErr.message)
  }

  return { success: true, data: {
    booking_id: bookingId,
    message: `Bokning skapad: ${params.service_type}`,
    google_synced: !!googleEventId,
    google_event_id: googleEventId,
  }}
}

/**
 * Platsbesök — bygger start/slut från datum+tid+längd och slår upp kund via
 * namn om customer_id saknas. Återanvänder createBooking() rakt av (samma
 * bokningsinsert + ev. Google-synk som create_booking-verktyget) — INGEN
 * dubblettlogik. SÄKERHETSKRAV: skickar aldrig SMS/e-post själv. Om kunden
 * ska meddelas gör Matte ett separat send_sms-anrop, som gatas av
 * external-confirm-räcket precis som vanligt.
 */
async function bookSiteVisitTool(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const date = params.date ? String(params.date) : ''
  const time = params.time ? String(params.time) : ''
  if (!date || !time) {
    return { success: false, error: 'date (YYYY-MM-DD) och time (HH:MM) krävs.' }
  }

  let customerId = params.customer_id ? String(params.customer_id) : null
  if (!customerId && params.customer_name) {
    const searchResult = await searchCustomers(supabase, businessId, {
      query: String(params.customer_name),
      limit: 5,
    })
    const customers = ((searchResult.data as any)?.customers || []) as Array<{ customer_id: string; name: string }>
    if (!searchResult.success || customers.length === 0) {
      return { success: false, error: `Hittade ingen kund som matchar "${params.customer_name}".` }
    }
    if (customers.length > 1) {
      return {
        success: false,
        error: `Flera kunder matchar "${params.customer_name}" — ange customer_id: ${customers
          .map((c) => `${c.name} (${c.customer_id})`)
          .join(', ')}`,
      }
    }
    customerId = customers[0].customer_id
  }
  if (!customerId) {
    return { success: false, error: 'customer_id eller customer_name krävs.' }
  }

  const start = new Date(`${date}T${time}:00`)
  if (isNaN(start.getTime())) {
    return { success: false, error: 'Ogiltigt datum eller tid.' }
  }
  const durationMinutes = Number(params.duration_minutes) > 0 ? Number(params.duration_minutes) : 60
  const end = new Date(start.getTime() + durationMinutes * 60000)

  return await createBooking(
    supabase,
    businessId,
    {
      customer_id: customerId,
      service_type: 'Platsbesök',
      scheduled_start: start.toISOString(),
      scheduled_end: end.toISOString(),
      notes: params.notes ? String(params.notes) : null,
    },
    context
  )
}

async function updateProject(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const updates: Record<string, unknown> = {}
  if (params.status) updates.status = params.status
  if (params.notes) updates.notes = params.notes

  const { data, error } = await supabase.from('booking')
    .update(updates).eq('business_id', businessId).eq('booking_id', params.booking_id)
    .select().single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: { message: 'Bokning uppdaterad', booking: data } }
}

async function logTime(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  // Tenantvakten FÖRE insert:en — se assertCustomerInBusiness.
  const tenantFel = await assertCustomerInBusiness(supabase, businessId, params.customer_id)
  if (tenantFel) return { success: false, error: tenantFel }

  const [sH, sM] = (params.start_time as string).split(':').map(Number)
  const [eH, eM] = (params.end_time as string).split(':').map(Number)
  const duration = (eH * 60 + eM) - (sH * 60 + sM)
  if (duration <= 0) return { success: false, error: 'Sluttid måste vara efter starttid' }

  const { data: config } = await supabase.from('business_config')
    .select('pricing_settings').eq('business_id', businessId).single()
  const rate = config?.pricing_settings?.hourly_rate || 695

  // Etapp 1 Tier B (multi-employee-parity-plan.md): logTime() har ingen
  // inloggad-användare-identitet i sitt anrop (telefon-/Matte-triggat).
  // Fallback-kedja: bokningens assigned_user_id (Etapp 5) → sole-firma-
  // fallback → null. Se lib/time-entries/resolve-attribution.ts.
  let bookingAssignedUserId: string | null = null
  if (params.booking_id) {
    const { data: booking, error: bookingErr } = await supabase
      .from('booking')
      .select('assigned_user_id')
      .eq('business_id', businessId)
      .eq('booking_id', params.booking_id)
      .maybeSingle()
    // Tenantvakten även för bokningen: utan den skrevs ett främmande
    // booking_id in i tidraden, bara utan attribution.
    if (bookingErr) return { success: false, error: `Kunde inte verifiera bokningen: ${bookingErr.message}` }
    if (!booking) return { success: false, error: 'Bokningen finns inte i det här företaget' }
    bookingAssignedUserId = booking.assigned_user_id ?? null
  }

  let activeBusinessUserIds: string[] = []
  if (!bookingAssignedUserId) {
    const { data: activeBusinessUsers } = await supabase
      .from('business_users')
      .select('id')
      .eq('business_id', businessId)
      .eq('is_active', true)
    activeBusinessUserIds = (activeBusinessUsers || []).map((u) => u.id)
  }

  const businessUserId = resolveTimeEntryAttribution(bookingAssignedUserId, activeBusinessUserIds)

  const entryId = generateId('time')
  const { error } = await supabase.from('time_entry').insert({
    time_entry_id: entryId, business_id: businessId,
    business_user_id: businessUserId,
    booking_id: params.booking_id || null, customer_id: params.customer_id,
    work_date: params.work_date, start_time: params.start_time, end_time: params.end_time,
    duration_minutes: duration, description: params.description || null,
    hourly_rate: rate, is_billable: params.is_billable !== false,
    created_at: new Date().toISOString(),
  })

  if (error) return { success: false, error: error.message }
  return { success: true, data: { time_entry_id: entryId, duration_minutes: duration, message: `${(duration/60).toFixed(1)} timmar loggade` } }
}

/**
 * Våg 2b (tasks/value-chain-plan.md) — ÄTA-kedjan. Skapar ETT förslagskort
 * i godkännandekön (approval_type 'create_ata_draft') — aldrig en ÄTA
 * direkt. Dedup + insert delas med lib/matte/action-executor.ts via
 * lib/ata/suggest-ata-draft.ts (samma mönster som create_quote_draft,
 * etapp 2a). Denna funktion äger bara det tool-specifika I/O:t: verifiera
 * att projektet finns för företaget och slå upp dess customer_id (så
 * exekverarens ai-generate-anrop kan använda kundens prislista).
 */
async function createAtaDraftTool(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const projectId = params.project_id ? String(params.project_id) : ''
  const description = params.description ? String(params.description).trim() : ''
  if (!projectId || !description) {
    return { success: false, error: 'project_id och description krävs.' }
  }

  const { data: project, error: projectErr } = await supabase
    .from('project')
    .select('project_id, name, customer_id')
    .eq('business_id', businessId)
    .eq('project_id', projectId)
    .maybeSingle()

  if (projectErr) return { success: false, error: `Kunde inte slå upp projektet: ${projectErr.message}` }
  if (!project) return { success: false, error: `Hittade inget projekt med id "${projectId}".` }

  const amountEstimate = typeof params.amount_estimate === 'number'
    ? params.amount_estimate
    : (params.amount_estimate ? Number(params.amount_estimate) : undefined)

  const result = await suggestAtaDraft(supabase, {
    businessId,
    projectId,
    description,
    amountEstimate: Number.isFinite(amountEstimate) ? amountEstimate : undefined,
    customerContext: params.customer_context ? String(params.customer_context) : undefined,
    customerId: project.customer_id || undefined,
    routedAgent: 'daniel',
  })

  if (result.created) {
    return {
      success: true,
      data: {
        message: `ÄTA-förslag skapat för projektet "${project.name || projectId}". Hantverkaren granskar och skapar/skickar den riktiga ÄTA:n i kön.`,
        approval_id: result.approvalId,
      },
    }
  }

  if (result.reason === 'duplicate') {
    return {
      success: true,
      data: { message: `Projektet har redan ett väntande ÄTA-förslag i kön — skapade inget nytt (dedup).`, skipped: true },
    }
  }

  return { success: false, error: `Kunde inte skapa ÄTA-förslaget (${result.reason || 'okänt fel'}).` }
}

// ── Communications ──────────────────────────────────────

/**
 * TD-52: köa ett agent-initierat send_sms/send_email som en pending_approval
 * istället för att skicka direkt. Används när triggerSource === 'system' och
 * ingen förtjänad autonomi täcker åtgärden (se shouldQueueForApproval).
 * Payloaden speglar exakt det som executeApprovalPayload (app/api/approvals/
 * [id]/route.ts) läser för approval_type 'send_sms'/'send_email' — annars
 * exekveras kortet inte korrekt vid godkännande.
 */
async function queueAgentSendForApproval(
  supabase: SupabaseClient,
  businessId: string,
  approvalType: 'send_sms' | 'send_email',
  title: string,
  payload: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const id = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  const { error } = await supabase.from('pending_approvals').insert({
    id,
    business_id: businessId,
    approval_type: approvalType,
    title,
    description: (payload.message as string | undefined) || (payload.body as string | undefined) || null,
    payload: { ...payload, routed_agent: context.agentId || 'matte' },
    status: 'pending',
    risk_level: 'high',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  })

  if (error) {
    return { success: false, error: `Kunde inte köa för godkännande: ${error.message}` }
  }

  // Push-notis till hantverkaren (fire-and-forget, samma mönster som
  // createApprovalRequest högrisk-gren nedan).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  fetch(`${appUrl}/api/push/send`, {
    method: 'POST',
    headers: internalPushHeaders(),
    body: JSON.stringify({
      business_id: businessId,
      title: 'Nytt att godkänna',
      body: title,
      url: '/dashboard/approvals',
    }),
  }).catch((err) => console.error('[queueAgentSendForApproval] push failed (non-blocking):', err))

  return {
    success: true,
    data: {
      queued_for_approval: true,
      approval_id: id,
      message: 'Utkastet är lagt i godkännande-kön — hantverkaren måste godkänna innan det skickas.',
    },
  }
}

async function sendSms(
  supabase: SupabaseClient, businessId: string,
  params: Record<string, unknown>, context: ToolContext
): Promise<ToolResult> {
  const to = params.to as string
  const message = params.message as string

  if (!to.startsWith('+')) return { success: false, error: 'Telefonnumret måste börja med +46' }
  if (message.length > 1600) return { success: false, error: `Meddelandet är ${message.length} tecken (max 1600)` }

  // TD-52 godkännande-gate: system-triggade sends (cron/automation/agent-
  // handoff) måste godkännas om inte förtjänad autonomi täcker dem. Det
  // generiska send_sms-verktyget saknar en v3-regel att signaturmatcha mot
  // (deriveAutonomyKey kräver trigger_type/action_type/trigger_config från
  // en regel) — det finns alltså ingen härledbar autonomi-nyckel för ett
  // friformat LLM-tool-anrop, så autonomyGranted är alltid false här.
  // (De ställen där förtjänad autonomi FAKTISKT bypassar godkännande —
  // v3-regelmotorn och fakturapåminnelse-cronen — gör det redan uppströms,
  // innan detta tool-anrop ens sker.)
  if (shouldQueueForApproval(context.triggerSource, false)) {
    return await queueAgentSendForApproval(
      supabase, businessId, 'send_sms',
      `SMS till ${to}`,
      { to, message },
      context
    )
  }

  // Night block: queue SMS for 08:00 next morning (skip if DISABLE_SMS_NIGHT_BLOCK is set)
  const now = new Date()
  const swedenHour = parseInt(
    new Intl.DateTimeFormat('sv-SE', { hour: 'numeric', hour12: false, timeZone: 'Europe/Stockholm' }).format(now)
  )
  if ((swedenHour >= 21 || swedenHour < 8) && !process.env.DISABLE_SMS_NIGHT_BLOCK) {
    // Calculate next 08:00 Stockholm time
    const stockholm = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now) // "YYYY-MM-DD"
    const [y, m, d] = stockholm.split('-').map(Number)
    // If before 08:00 → today at 08:00, otherwise → tomorrow at 08:00
    const sendDate = swedenHour < 8 ? new Date(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T08:00:00+01:00`)
      : new Date(`${y}-${String(m).padStart(2,'0')}-${String(d + 1).padStart(2,'0')}T08:00:00+01:00`)
    const sendAfter = sendDate.toISOString()

    const queueId = 'smq_' + Math.random().toString(36).substring(2, 14)
    const senderName = sanitizeSenderId(context.businessName)
    const { error: queueError } = await supabase.from('sms_queue').insert({
      queue_id: queueId, business_id: businessId,
      phone_to: to, sender_name: senderName, message,
      send_after: sendAfter, status: 'queued', created_at: now.toISOString(),
    })
    if (queueError) return { success: false, error: `Kunde inte köa SMS: ${queueError.message}` }

    console.log(`[SMS Queued] Nattspärr kl ${swedenHour}:xx → köat till ${sendAfter} → ${to}`)
    return { success: true, data: { queued: true, queue_id: queueId, send_after: sendAfter, message: `SMS köat — skickas ${swedenHour < 8 ? 'idag' : 'imorgon'} kl 08:00` } }
  }

  // ═══ GENOM STRYPUNKTEN (etapp 0 batch 2, 2026-08-08) ═══
  //
  // Agentens send_sms är den väg där opt-out betyder allra mest: här skriver
  // en modell meddelandet och skickar det utan att någon människa läser det
  // först. Nattspärren ovan (sms_queue) ligger kvar oförändrad — den gatar
  // NÄR, strypunkten gatar OM och TILL VEM.
  //
  // sms_log skrivs numera av helpern, med delantal och kostnad. Den lokala
  // insert:en var en av fyra kopior av samma logg.
  const senderName = sanitizeSenderId(context.businessName)
  const { sendSmsViaElks } = await import('@/lib/sms-send')
  const smsResult = await sendSmsViaElks({
    supabase,
    businessId,
    businessName: context.businessName,
    to,
    message,
    customerId: (params.customer_id as string) || null,
    messageType: 'agent_sms',
    recipient: 'customer',
    purpose: 'conversational',
  })

  if (!smsResult.success) {
    return { success: false, error: `SMS kunde inte skickas: ${smsResult.error || 'okänt fel'}` }
  }
  const result = { id: smsResult.elksId }

  // sms_conversation-speglingen sker numera i sendSmsViaElks självt
  // (kontextrevisionen 2026-08-16) — den lokala kopian här togs bort för
  // att inte dubbelskriva samma rad.

  return { success: true, data: { message: `SMS skickat till ${to}`, sms_id: result.id } }
}

async function sendEmail(
  supabase: SupabaseClient, businessId: string,
  params: Record<string, unknown>, context: ToolContext
): Promise<ToolResult> {
  // TD-52 godkännande-gate — samma resonemang som sendSms ovan.
  if (shouldQueueForApproval(context.triggerSource, false)) {
    return await queueAgentSendForApproval(
      supabase, businessId, 'send_email',
      `E-post: ${params.subject}`,
      { to: params.to, subject: params.subject, body: params.body },
      context
    )
  }

  // Prefer Gmail API if connected with send scope
  if (context.googleConnection?.gmail_send_scope_granted && context.googleConnection?.gmail_sync_enabled) {
    try {
      const result = await sendGmailEmail(
        context.googleConnection.access_token,
        { to: params.to as string, subject: params.subject as string, body: params.body as string }
      )
      // Kontextrevisionen 2026-08-16: utgående e-post sparades aldrig — nu
      // loggas varje skickat mejl till email_conversations (best-effort).
      const { logOutboundEmail } = await import('@/lib/comm/log-outbound-email')
      await logOutboundEmail(supabase, {
        businessId,
        toEmail: params.to as string,
        subject: params.subject as string,
        body: params.body as string,
        gmailMessageId: result.messageId,
        gmailThreadId: result.threadId,
        customerId: (params.customer_id as string) || null,
        sentVia: 'gmail',
      })
      return { success: true, data: {
        message: `E-post skickad via Gmail till ${params.to}`,
        message_id: result.messageId, thread_id: result.threadId, sent_via: 'gmail',
      }}
    } catch (err: any) {
      console.error('[sendEmail] Gmail send failed, falling back to Resend:', err.message)
    }
  }

  // Fallback: Resend API
  const resendKey = process.env.RESEND_API_KEY!
  const from = context.contactEmail
    ? `${context.businessName} <${context.contactEmail}>`
    : `${context.businessName} <noreply@handymate.se>`

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from, to: params.to, subject: params.subject, text: params.body,
    }),
  })

  const result = await response.json()
  if (!response.ok) return { success: false, error: `E-postfel: ${result.message}` }

  // Kontextrevisionen 2026-08-16: samma loggning på Resend-vägen.
  const { logOutboundEmail } = await import('@/lib/comm/log-outbound-email')
  await logOutboundEmail(supabase, {
    businessId,
    toEmail: params.to as string,
    subject: params.subject as string,
    body: params.body as string,
    customerId: (params.customer_id as string) || null,
    sentVia: 'resend',
  })

  return { success: true, data: { message: `E-post skickad till ${params.to}`, email_id: result.id, sent_via: 'resend' } }
}

// ── Gmail ────────────────────────────────────────────────

async function readCustomerEmails(
  params: Record<string, unknown>, context: ToolContext
): Promise<ToolResult> {
  if (!context.googleConnection?.gmail_scope_granted || !context.googleConnection?.gmail_sync_enabled) {
    return { success: false, error: 'Gmail är inte anslutet eller aktiverat' }
  }

  const customerEmail = params.customer_email as string
  if (!customerEmail || !customerEmail.includes('@')) {
    return { success: false, error: 'Ogiltig e-postadress' }
  }

  try {
    const threads = await getCustomerEmails(
      context.googleConnection.access_token,
      customerEmail,
      (params.max_results as number) || 10
    )

    return { success: true, data: {
      customer_email: customerEmail,
      thread_count: threads.length,
      threads: threads.map(t => ({
        threadId: t.threadId, subject: t.subject, snippet: t.snippet,
        from: t.from, date: t.date, messageCount: t.messageCount, isUnread: t.isUnread,
      })),
    }}
  } catch (err: any) {
    return { success: false, error: `Gmail-fel: ${err.message}` }
  }
}

// ── Pipeline ─────────────────────────────────────────────

async function qualifyLead(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const conversationId = params.conversation_id as string

  // Fetch conversation or call recording
  const { data: conversation } = await supabase
    .from('conversations')
    .select('*')
    .eq('business_id', businessId)
    .eq('conversation_id', conversationId)
    .single()

  let transcript = conversation?.content || ''
  let phone = (params.phone as string) || conversation?.phone_number || ''
  let contactName = (params.name as string) || ''
  let source = (params.source as string) || 'manual'

  if (!transcript) {
    const { data: recording } = await supabase
      .from('call_recording')
      .select('*')
      .eq('business_id', businessId)
      .eq('recording_id', conversationId)
      .single()
    if (recording) {
      transcript = recording.transcript || recording.transcript_summary || ''
      phone = phone || recording.phone_number || ''
      source = 'vapi_call'
    }
  }

  if (!transcript) return { success: false, error: 'Ingen transkription hittades' }

  // Fetch scoring rules
  const { data: rules } = await supabase
    .from('lead_scoring_rules')
    .select('*')
    .eq('business_id', businessId)
    .eq('enabled', true)

  const { data: existingLead } = await supabase
    .from('leads')
    .select('lead_id, score, customer_id, name, source')
    .eq('business_id', businessId)
    .eq('conversation_id', conversationId)
    .single()

  // Score the lead
  const lowerTranscript = transcript.toLowerCase()
  const scoreReasons: Array<{ rule: string; points: number; matched: boolean }> = []
  let score = 0

  for (const rule of (rules || []) as any[]) {
    const condition = rule.condition?.type || ''
    let matched = false
    switch (condition) {
      case 'answered_call': matched = transcript.length > 50; break
      case 'specific_job': matched = /installera|reparera|byta|montera|fixa|laga|bygga|renovera|måla/i.test(lowerTranscript); break
      case 'urgency_mentioned': matched = /akut|bråttom|snabbt|omedelbart|idag|imorgon|snarast|läcker|kortslut/i.test(lowerTranscript); break
      case 'in_service_area': matched = /adress|gata|väg|området/i.test(lowerTranscript); break
      case 'returning_customer':
        if (phone) {
          const { data: cust } = await supabase.from('customer').select('customer_id').eq('business_id', businessId).eq('phone_number', phone).single()
          matched = !!cust
        }
        break
      case 'budget_mentioned': matched = /budget|pris|kosta|kronor|kr|tusen/i.test(lowerTranscript); break
      case 'unclear_request': matched = transcript.length < 30 && !/installera|reparera|byta|fixa/i.test(lowerTranscript); break
    }
    scoreReasons.push({ rule: rule.rule_name, points: rule.points, matched })
    if (matched) score += rule.points
  }

  score = Math.max(0, Math.min(100, score))

  let urgency: string = 'medium'
  if (/nödfall|akut omedelbart|kortslut|brand/i.test(lowerTranscript)) urgency = 'emergency'
  else if (/akut|bråttom|idag|snarast/i.test(lowerTranscript)) urgency = 'high'
  else if (/ingen brådska|när som helst/i.test(lowerTranscript)) urgency = 'low'

  let jobType = 'Okänt'
  const jobPatterns: Array<[RegExp, string]> = [
    [/elinstallation|elarbete|elsäkerhet|jordfelsbrytare/i, 'Elinstallation'],
    [/rör|vatten|avlopp|läck|kran|vvs/i, 'VVS/Rörarbete'],
    [/snickeri|bygga|renovera|kök|badrum/i, 'Renovering'],
    [/målning|måla|tapetser/i, 'Målning'],
    [/lås|inbrott|säkerhet/i, 'Låssmed'],
    [/städ|flytt|rengör/i, 'Städning'],
    [/värme|kyla|ventilation|värmepump/i, 'VVS/Värme'],
  ]
  for (const [pattern, type] of jobPatterns) {
    if (pattern.test(lowerTranscript)) { jobType = type; break }
  }

  let estimatedValue: number | null = null
  const priceMatch = lowerTranscript.match(/(\d+)\s*(tusen|tkr|000\s*kr)/i)
  if (priceMatch) estimatedValue = parseInt(priceMatch[1]) * 1000

  const now = new Date().toISOString()

  if (existingLead) {
    const { error: updateError } = await supabase.from('leads').update({
      score, score_reasons: scoreReasons.filter(r => r.matched),
      urgency, job_type: jobType, estimated_value: estimatedValue, updated_at: now,
    }).eq('lead_id', existingLead.lead_id)
    if (updateError) return { success: false, error: `Kunde inte uppdatera lead: ${updateError.message}` }

    const { error: activityError } = await supabase.from('lead_activities').insert({
      activity_id: generateId('la'), lead_id: existingLead.lead_id, business_id: businessId,
      activity_type: 'score_updated', description: `Score uppdaterad: ${score}, urgency ${urgency}`,
      created_at: now,
    })
    if (activityError) console.error('[qualifyLead] lead_activities insert (score_updated) failed:', activityError.message)

    // Våg 2a (value-chain-plan.md): score kan knuffa en redan
    // 'qualified'-lead över tröskeln — fire-and-forget, blockerar aldrig
    // agentsvaret. Gaten (statuskoll + score-tröskel) körs inuti.
    suggestQuoteDraftForLead(businessId, existingLead.lead_id).catch(err =>
      console.error('[qualifyLead] suggestQuoteDraftForLead error (non-blocking):', err))

    // A5 (lead-intake-granskningen 2026-08-10): denna gren opererar på en
    // REDAN existerande lead (samma conversation_id sågs tidigare) och satte
    // bara om score/urgency — aldrig en deal. Om leaden av någon anledning
    // saknar deal (t.ex. skapad innan denna fix, eller ett tidigare
    // golden-path-försök som fick dealError) kompletterar vi HÄR — men
    // ENDAST om ingen deal finns, och utan SMS/event (det är ingen ny lead,
    // bara en tyst självläkning). Skriver inte om lead.status, till skillnad
    // från activatePendingLead — den funktionen tvingar status→'new', vilket
    // vore fel för en lead som redan hunnit längre i pipelinen.
    const { data: existingDeal } = await supabase
      .from('deal')
      .select('id')
      .eq('business_id', businessId)
      .eq('lead_id', existingLead.lead_id)
      .limit(1)
      .maybeSingle()

    if (!existingDeal) {
      try {
        const stage = await getStageBySlug(businessId, 'new_inquiry')
        if (stage) {
          const dealNumber = await getNextCaseNumber(supabase, businessId)
          const { error: dealBackfillError } = await supabase.from('deal').insert({
            business_id: businessId,
            title: jobType !== 'Okänt' ? jobType : `Förfrågan från ${existingLead.name || contactName || phone || 'kund'}`,
            customer_id: existingLead.customer_id ?? null,
            lead_id: existingLead.lead_id,
            stage_id: stage.id,
            source: existingLead.source || source,
            deal_number: dealNumber,
            priority: 'medium',
          })
          if (dealBackfillError) console.error('[qualifyLead] deal-komplettering misslyckades:', dealBackfillError.message)
        } else {
          console.warn(`[qualifyLead] pipeline_stage "new_inquiry" saknas — deal ej kompletterad (business ${businessId})`)
        }
      } catch (err) {
        console.error('[qualifyLead] deal-komplettering fel (non-blocking):', err)
      }
    }

    return { success: true, data: { lead_id: existingLead.lead_id, action: 'updated', score, urgency, job_type: jobType, estimated_value: estimatedValue } }
  }

  // A5 (lead-intake-granskningen 2026-08-10): denna gren SKAPAR leads
  // bespoke — och är den PRIMÄRA vägen in för telefon/SMS-agenten (se
  // system-prompt.ts: "Kvalificera ALLTID inkommande kontakt som lead med
  // qualify_lead" körs FÖRE kundsökning). Den gamla inserten skapade varken
  // kund eller deal, så agent-kvalificerade leads nådde aldrig pipelinen —
  // exakt granskningsfyndet. Konvergerar nu till golden path-helpern
  // (samma väg som röstwebhooken app/api/voice/incoming/route.ts redan
  // använder) för kund-dedup, deal i new_inquiry-steget och ägar-SMS.
  // Kvalificeringsfälten (score, urgency, job_type, ...) känner golden path
  // inte till — sätts i en uppföljande UPDATE. fireEvent('lead_created')
  // nedan behålls oförändrat: nurture-välkomstflödet (lib/seed-defaults.ts)
  // lyssnar EXKLUSIVT på det eventet, golden path fyr bara 'lead_received'.
  const { data: biz } = await supabase
    .from('business_config')
    .select('phone_number')
    .eq('business_id', businessId)
    .single()

  const gp = await createLeadAndDeal(
    {
      businessId,
      businessPhoneNumber: biz?.phone_number ?? null,
      name: contactName || phone || 'Okänd kontakt',
      phone,
      email: null,
      message: transcript || null,
      source,
    },
    supabase
  )
  const leadId = gp.leadId

  const { error: qualifyFieldsError } = await supabase.from('leads').update({
    score, score_reasons: scoreReasons.filter(r => r.matched),
    estimated_value: estimatedValue, job_type: jobType, urgency,
    conversation_id: conversationId, updated_at: now,
  }).eq('lead_id', leadId)
  if (qualifyFieldsError) console.error('[qualifyLead] kvalificeringsfält-update misslyckades:', qualifyFieldsError.message)

  const { data: leadRow } = await supabase.from('leads').select('lead_number').eq('lead_id', leadId).single()
  const leadNumber = leadRow?.lead_number

  const { error: createdActivityError } = await supabase.from('lead_activities').insert({
    activity_id: generateId('la'), lead_id: leadId, business_id: businessId,
    activity_type: 'created', description: `Ny lead: ${contactName || phone || 'Okänd'} (${leadNumber}), score ${score}`,
    created_at: now,
  })
  if (createdActivityError) console.error('[qualifyLead] lead_activities insert (created) failed:', createdActivityError.message)

  // V3 Automation Engine: fire lead_created event
  try {
    const { fireEvent } = await import('@/lib/automation-engine')
    await fireEvent(supabase, 'lead_created', businessId, {
      lead_id: leadId, customer_name: contactName, phone, job_type: jobType,
      urgency, estimated_value: estimatedValue, source,
    })
  } catch (err: any) {
    // Icke-blockerande — leaden är redan skapad, bara automations-eventet misslyckades.
    console.error('[qualifyLead] fireEvent lead_created failed (non-blocking):', businessId, leadId, err?.message || err)
  }

  return { success: true, data: { lead_id: leadId, lead_number: leadNumber, action: 'created', score, urgency, job_type: jobType, estimated_value: estimatedValue, message: `Lead skapad ${leadNumber} (score ${score})` } }
}

async function updateLeadStatus(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  // Tenantvakten — leaden är business-scopad i where-satsen, men customer_id
  // är ett fritt fält som skulle knyta leaden till en annan tenants kund.
  if (params.customer_id) {
    const tenantFel = await assertCustomerInBusiness(supabase, businessId, params.customer_id)
    if (tenantFel) return { success: false, error: tenantFel }
  }

  const updates: Record<string, unknown> = { status: params.status, updated_at: new Date().toISOString() }
  if (params.lost_reason) updates.lost_reason = params.lost_reason
  if (params.notes) updates.notes = params.notes
  if (params.customer_id) updates.customer_id = params.customer_id
  if (params.status === 'won') updates.converted_at = new Date().toISOString()

  const { data, error } = await supabase.from('leads').update(updates)
    .eq('lead_id', params.lead_id).eq('business_id', businessId).select().single()

  if (error) return { success: false, error: error.message }

  const { error: statusActivityError } = await supabase.from('lead_activities').insert({
    activity_id: generateId('la'), lead_id: params.lead_id as string, business_id: businessId,
    activity_type: 'status_changed', description: `Status → ${params.status}`,
    created_at: new Date().toISOString(),
  })
  if (statusActivityError) console.error('[updateLeadStatus] lead_activities insert failed:', statusActivityError.message)

  // Våg 2a (value-chain-plan.md): detta är det FAKTISKA stället en lead
  // blir 'qualified' via agentvägen (qualifyLead sätter bara score, aldrig
  // status — se lib/quotes/suggest-quote-draft.ts filhuvud). Fire-and-
  // forget, blockerar aldrig agentsvaret. Gaten körs inuti.
  if (params.status === 'qualified') {
    suggestQuoteDraftForLead(businessId, params.lead_id as string).catch(err =>
      console.error('[updateLeadStatus] suggestQuoteDraftForLead error (non-blocking):', err))
  }

  return { success: true, data: { message: `Lead status → ${params.status}`, lead: data } }
}

async function getLeadTool(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const { data: lead, error } = await supabase.from('leads').select('*')
    .eq('lead_id', params.lead_id).eq('business_id', businessId).single()

  if (error) return { success: false, error: `Lead hittades inte: ${error.message}` }

  const { data: activities } = await supabase.from('lead_activities').select('*')
    .eq('lead_id', params.lead_id as string).order('created_at', { ascending: false }).limit(20)

  let customer = null
  if (lead.customer_id) {
    const { data: cust } = await supabase.from('customer').select('customer_id, name, phone_number, email')
      .eq('customer_id', lead.customer_id).single()
    customer = cust
  }

  return { success: true, data: { ...lead, activities: activities || [], customer } }
}

async function searchLeads(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  let q = supabase.from('leads')
    .select('lead_id, name, phone, status, score, urgency, job_type, estimated_value, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit((params.limit as number) || 20)

  if (params.status) q = q.eq('status', params.status as string)
  if (params.urgency) q = q.eq('urgency', params.urgency as string)
  if (params.min_score !== undefined) q = q.gte('score', params.min_score as number)
  if (params.max_score !== undefined) q = q.lte('score', params.max_score as number)
  if (params.job_type) q = q.ilike('job_type', `%${params.job_type}%`)
  if (params.from_date) q = q.gte('created_at', `${params.from_date}T00:00:00`)
  if (params.to_date) q = q.lte('created_at', `${params.to_date}T23:59:59`)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }
  return { success: true, data: { count: data.length, leads: data } }
}

// ── Stats ─────────────────────────────────────────────────

async function getDailyStats(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const date = (params.date as string) || new Date().toISOString().split('T')[0]
  const dayStart = `${date}T00:00:00`
  const dayEnd = `${date}T23:59:59`

  // Previous day for comparison
  const prevDate = new Date(date)
  prevDate.setDate(prevDate.getDate() - 1)
  const prevDateStr = prevDate.toISOString().split('T')[0]

  const [
    callsToday, smsInToday, smsOutToday,
    newCustomers, leadsToday, quotesToday,
    invoicesMonth, bookingsToday, timeEntriesToday,
    agentRuns, pendingQueue
  ] = await Promise.all([
    // Calls today
    supabase.from('call_recording').select('recording_id', { count: 'exact', head: true })
      .eq('business_id', businessId).gte('created_at', dayStart).lte('created_at', dayEnd),
    // Inbound SMS today
    supabase.from('sms_conversation').select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('role', 'user').gte('created_at', dayStart).lte('created_at', dayEnd),
    // Outbound SMS today
    supabase.from('sms_log').select('sms_id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('direction', 'outbound').gte('created_at', dayStart).lte('created_at', dayEnd),
    // New customers today
    supabase.from('customer').select('customer_id', { count: 'exact', head: true })
      .eq('business_id', businessId).gte('created_at', dayStart).lte('created_at', dayEnd),
    // Leads today (with details)
    supabase.from('leads').select('lead_id, status, urgency, score, job_type')
      .eq('business_id', businessId).gte('created_at', dayStart).lte('created_at', dayEnd),
    // Quotes today
    supabase.from('quotes').select('quote_id, status, subtotal, total')
      .eq('business_id', businessId).gte('created_at', dayStart).lte('created_at', dayEnd),
    // Invoices this month (for revenue)
    supabase.from('invoice').select('invoice_id, status, subtotal, total')
      .eq('business_id', businessId).gte('invoice_date', date.substring(0, 7) + '-01'),
    // Bookings scheduled for today
    supabase.from('booking').select('booking_id, status, scheduled_start, notes')
      .eq('business_id', businessId).gte('scheduled_start', dayStart).lte('scheduled_start', dayEnd),
    // Time entries today
    supabase.from('time_entry').select('duration_minutes, is_billable, hourly_rate')
      .eq('business_id', businessId).eq('work_date', date),
    // Agent runs today
    supabase.from('agent_runs').select('run_id, trigger_type, status', { count: 'exact', head: true })
      .eq('business_id', businessId).gte('created_at', dayStart).lte('created_at', dayEnd),
    // Queued SMS pending
    supabase.from('sms_queue').select('queue_id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('status', 'queued'),
  ])

  const leads = leadsToday.data || []
  const quotes = quotesToday.data || []
  const invoices = invoicesMonth.data || []
  const bookings = bookingsToday.data || []
  const timeEntries = timeEntriesToday.data || []

  const totalHours = timeEntries.reduce((s: number, e: any) => s + (e.duration_minutes || 0), 0) / 60
  const billableHours = timeEntries.filter((e: any) => e.is_billable).reduce((s: number, e: any) => s + (e.duration_minutes || 0), 0) / 60
  const paidInvoices = invoices.filter((i: any) => i.status === 'paid')
  const monthlyRevenue = paidInvoices.reduce((s: number, i: any) => s + (i.total || 0), 0)
  const monthlyRevenueExVat = paidInvoices.reduce((s: number, i: any) => s + (i.subtotal || Math.round((i.total || 0) / 1.25)), 0)
  const pendingInvoices = invoices.filter((i: any) => i.status === 'sent' || i.status === 'overdue')
  const quotesTotal = quotes.reduce((s: number, q: any) => s + (q.total || 0), 0)
  const quotesTotalExVat = quotes.reduce((s: number, q: any) => s + (q.subtotal || Math.round((q.total || 0) / 1.25)), 0)

  return {
    success: true,
    data: {
      date,
      communication: {
        calls: callsToday.count || 0,
        sms_inbound: smsInToday.count || 0,
        sms_outbound: smsOutToday.count || 0,
        sms_queued: pendingQueue.count || 0,
      },
      customers: {
        new_today: newCustomers.count || 0,
      },
      leads: {
        new_today: leads.length,
        by_urgency: {
          emergency: leads.filter((l: any) => l.urgency === 'emergency').length,
          high: leads.filter((l: any) => l.urgency === 'high').length,
          medium: leads.filter((l: any) => l.urgency === 'medium').length,
          low: leads.filter((l: any) => l.urgency === 'low').length,
        },
        avg_score: leads.length > 0 ? Math.round(leads.reduce((s: number, l: any) => s + (l.score || 0), 0) / leads.length) : 0,
      },
      quotes: {
        created_today: quotes.length,
        total_value_incl_vat: quotesTotal,
        total_value_ex_vat: quotesTotalExVat,
      },
      bookings: {
        scheduled_today: bookings.length,
        by_status: {
          pending: bookings.filter((b: any) => b.status === 'pending').length,
          confirmed: bookings.filter((b: any) => b.status === 'confirmed').length,
          completed: bookings.filter((b: any) => b.status === 'completed').length,
        },
      },
      time_tracking: {
        total_hours: +totalHours.toFixed(1),
        billable_hours: +billableHours.toFixed(1),
      },
      revenue: {
        monthly_paid_incl_vat: monthlyRevenue,
        monthly_paid_ex_vat: monthlyRevenueExVat,
        pending_invoices: pendingInvoices.length,
        pending_amount_incl_vat: pendingInvoices.reduce((s: number, i: any) => s + (i.total || 0), 0),
      },
      agent: {
        runs_today: agentRuns.count || 0,
      },
    },
  }
}

// ── Approval Flow ────────────────────────────────────────────

async function createApprovalRequest(
  supabase: SupabaseClient,
  businessId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const { approval_type, title, description, payload } = params

  if (!approval_type || !title || !payload) {
    return { success: false, error: 'approval_type, title och payload krävs' }
  }

  /**
   * ═══ FÄLLA 1: okänd typ avvisas VID SKAPANDET (etapp 2c) ═══
   *
   * Verktygsbeskrivningen dokumenterade 'other', som saknas i ACTION_CONTRACT.
   * Ett sådant kort gick inte att godkänna — bara avvisa. Ett kort som inte
   * kan godkännas ska aldrig skapas; modellen får ett begripligt fel och kan
   * välja rätt typ i stället.
   */
  const typ = String(approval_type)
  if (!classify(typ)) {
    return {
      success: false,
      error:
        `Okänd approval_type "${typ}" — kortet skulle inte gå att godkänna. ` +
        `Välj en typ som faktiskt finns, t.ex. send_sms, send_quote, send_invoice, create_booking.`,
    }
  }

  /**
   * ═══ FÄLLA 2: fail-closed när handlern saknas ═══
   *
   * risk_level low/medium auto-exekverar via executeApprovalPayloadInternal,
   * som bara kan fyra typer och tidigare tyst returnerade skipped:'no handler'
   * för resten — kortet markerades auto_approved medan ingenting hänt.
   * En låg risk utan handler är nu i praktiken hög: kortet blir pending och
   * en människa utför det. Aldrig "godkänt" utan utförande.
   */
  const begartRisk = (params.risk_level as string) || 'high'
  const harHandler = INTERNAL_EXEC_TYPES.has(typ)
  const risk_level = (begartRisk === 'low' || begartRisk === 'medium') && !harHandler ? 'high' : begartRisk

  const id = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

  // ── LOW risk: execute immediately, no notification, audit trail only ──
  if (risk_level === 'low') {
    const execResult = await executeApprovalPayloadInternal(appUrl, businessId, {
      approval_type: approval_type as string,
      payload: payload as Record<string, unknown>,
    })

    // Om själva åtgärden misslyckades ska vi INTE påstå att den utfördes.
    const execOk = execResult.error === undefined && execResult.ok !== false

    const { error: auditError } = await supabase.from('pending_approvals').insert({
      id,
      business_id: businessId,
      approval_type,
      title,
      description: description || null,
      payload,
      status: 'auto_approved',
      risk_level: 'low',
      resolved_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    if (auditError) console.error('[createApprovalRequest] pending_approvals audit insert (low) failed:', auditError.message)

    if (!execOk) {
      return {
        success: false,
        error: `Åtgärden "${title}" kunde inte utföras.`,
        data: { approval_id: id, execution: execResult },
      }
    }

    return {
      success: true,
      data: {
        message: `Åtgärd utförd direkt: "${title}".`,
        approval_id: id,
        execution: execResult,
        audit_logged: !auditError,
      },
    }
  }

  // ── MEDIUM risk: execute immediately + log to dashboard ──
  if (risk_level === 'medium') {
    const execResult = await executeApprovalPayloadInternal(appUrl, businessId, {
      approval_type: approval_type as string,
      payload: payload as Record<string, unknown>,
    })

    const execOk = execResult.error === undefined && execResult.ok !== false

    const { error: auditError } = await supabase.from('pending_approvals').insert({
      id,
      business_id: businessId,
      approval_type,
      title,
      description: description || null,
      payload,
      status: 'auto_approved',
      risk_level: 'medium',
      resolved_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    if (auditError) console.error('[createApprovalRequest] pending_approvals audit insert (medium) failed:', auditError.message)

    if (!execOk) {
      return {
        success: false,
        error: `Åtgärden "${title}" kunde inte utföras.`,
        data: { approval_id: id, execution: execResult },
      }
    }

    return {
      success: true,
      data: {
        message: `Åtgärd utförd automatiskt och loggad: "${title}".`,
        approval_id: id,
        execution: execResult,
        audit_logged: !auditError,
      },
    }
  }

  // ── HIGH risk (default): create pending, send push, await human ──
  const { error } = await supabase
    .from('pending_approvals')
    .insert({
      id,
      business_id: businessId,
      approval_type,
      title,
      description: description || null,
      payload,
      status: 'pending',
      risk_level: 'high',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })

  if (error) return { success: false, error: error.message }

  // Send push notification (fire-and-forget)
  fetch(`${appUrl}/api/push/send`, {
    method: 'POST',
    headers: internalPushHeaders(),
    body: JSON.stringify({
      business_id: businessId,
      title: 'Nytt att godkänna',
      body: title,
      url: '/dashboard/approvals',
    }),
  })

  return {
    success: true,
    data: {
      message: `Godkännandebegäran skapad: "${title}". Hantverkaren måste godkänna i dashboard.`,
      approval_id: id,
    },
  }
}

/**
 * Execute an approval payload inline (used for low/medium risk auto-approvals).
 * Mirrors the switch in app/api/approvals/[id]/route.ts.
 */
/**
 * Typerna executeApprovalPayloadInternal faktiskt kan utföra. Härledd ur
 * switchens cases; facit håller dem i synk. Allt utanför mängden är
 * fail-closed vid low/medium — kortet blir pending i stället för att
 * markeras utfört utan utförande.
 */
// Etapp 0 (2026-08-27, OUTBOUND_COMMUNICATION_INVENTORY 8.1/8.2): send_sms
// gick mot den sessions-grindade /api/sms/send (401) och send_quote/
// send_invoice mot rutter som INTE FINNS (/api/quotes/{id}/send, /api/
// invoices/{id}/send) — varje low/medium-autogodkännande av dem "utfördes"
// utan att något skickades. Nu: SMS genom strypunkten, faktura genom
// sändkärnan, och send_quote är BORTTAGEN ur mängden (ingen sändkärna
// utan session finns) → kortet blir pending, aldrig falskt utfört.
const INTERNAL_EXEC_TYPES = new Set(['send_sms', 'send_invoice', 'create_booking'])

async function executeApprovalPayloadInternal(
  appUrl: string,
  businessId: string,
  approval: { approval_type: string; payload: Record<string, unknown> }
): Promise<Record<string, unknown>> {
  const { approval_type, payload } = approval
  try {
    switch (approval_type) {
      case 'send_sms': {
        if (!payload.to || !payload.message) return { action: 'send_sms', ok: false, error: 'payload saknar to eller message' }
        const { getServerSupabase } = await import('@/lib/supabase')
        const { sendSmsViaElks } = await import('@/lib/sms-send')
        const r = await sendSmsViaElks({
          supabase: getServerSupabase(),
          businessId,
          to: String(payload.to),
          message: String(payload.message),
          customerId: (payload.customer_id as string) || null,
          messageType: 'agent_sms',
          recipient: 'customer',
          purpose: 'conversational',
        })
        return { action: 'send_sms', ok: r.success, error: r.success ? undefined : r.error }
      }
      case 'send_invoice': {
        if (!payload.invoice_id) return { action: 'send_invoice', skipped: 'no invoice_id' }
        const { getServerSupabase } = await import('@/lib/supabase')
        const { sendInvoice } = await import('@/lib/invoices/send-invoice')
        const r = await sendInvoice(getServerSupabase(), {
          businessId,
          invoiceId: String(payload.invoice_id),
          sendEmail: payload.send_email !== false,
          sendSms: payload.send_sms !== false,
          source: 'automation',
        })
        const delivered = r.found && !!(r.email || r.sms || r.einvoice)
        return { action: 'send_invoice', ok: delivered, error: delivered ? undefined : (r.errors.join('; ') || 'ingen leverans') }
      }
      case 'create_booking': {
        const res = await fetch(`${appUrl}/api/bookings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, business_id: businessId }),
        })
        return { action: 'create_booking', ok: res.ok }
      }
      default:
        return { action: approval_type, skipped: 'no handler', payload }
    }
  } catch (err: any) {
    return { action: approval_type, error: err.message }
  }
}

async function checkPendingApprovals(
  supabase: SupabaseClient,
  businessId: string
): Promise<ToolResult> {
  // Try pending_approvals first, fall back to pending_actions if table not cached
  let data: any[] | null = null
  let error: any = null

  const res1 = await supabase
    .from('pending_approvals')
    .select('id, approval_type, title, description, created_at, expires_at')
    .eq('business_id', businessId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(10)

  data = res1.data
  error = res1.error

  // Fallback: if table not found in schema cache, return empty gracefully
  if (error && error.message?.includes('schema cache')) {
    console.warn('[checkPendingApprovals] Table not in schema cache — returning empty. Run NOTIFY pgrst, \'reload schema\' in Supabase SQL Editor.')
    return {
      success: true,
      data: {
        pending_count: 0,
        approvals: [],
        note: 'Tabellen behöver laddas om i databasen. Kontakta support om detta fortsätter.',
      },
    }
  }

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: {
      pending_count: data?.length || 0,
      approvals: data || [],
    },
  }
}

// ── Business Preferences ─────────────────────────────────────

async function updateBusinessPreference(
  supabase: SupabaseClient,
  businessId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const { key, value } = params
  if (!key || !value) {
    return { success: false, error: 'key och value krävs' }
  }

  const { error } = await supabase
    .from('business_preferences')
    .upsert(
      {
        business_id: businessId,
        key: String(key),
        value: String(value),
        source: 'agent',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'business_id,key' }
    )

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: { message: `Preferens sparad: ${key} = ${value}` },
  }
}

// ── V3 Automation Engine ────────────────────────────────

async function getAutomationSettings(
  supabase: SupabaseClient, businessId: string
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('v3_automation_settings')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle()

  if (error) return { success: false, error: error.message }

  if (!data) {
    return {
      success: true,
      data: {
        message: 'Standardinställningar (inga anpassade inställningar sparade)',
        work_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
        work_start: '07:00',
        work_end: '17:00',
        night_mode_enabled: true,
        min_job_value_sek: 0,
        require_approval_send_quote: true,
        require_approval_send_invoice: true,
        require_approval_send_sms: false,
        require_approval_create_booking: false,
        lead_response_target_minutes: 30,
        quote_followup_days: 5,
        invoice_reminder_days: 7,
      },
    }
  }

  return { success: true, data }
}

async function logAutomationAction(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const { rule_name, action_type, status, details } = params

  if (!rule_name || !action_type || !status) {
    return { success: false, error: 'rule_name, action_type och status krävs' }
  }

  const { error } = await supabase.from('v3_automation_logs').insert({
    business_id: businessId,
    rule_id: null,
    rule_name: String(rule_name),
    trigger_type: 'manual',
    action_type: String(action_type),
    status: String(status),
    context: { details: details || null, source: 'agent' },
    result: {},
  })

  if (error) return { success: false, error: error.message }

  return { success: true, data: { message: `Åtgärd loggad: ${rule_name} (${status})` } }
}

// ── V7 Fortnox Tools ────────────────────────────────────

async function checkFortnoxStatusTool(businessId: string): Promise<ToolResult> {
  try {
    const { getFortnoxStatus } = await import('@/lib/fortnox')
    const status = await getFortnoxStatus(businessId)

    if (!status.connected) {
      return {
        success: true,
        data: {
          connected: false,
          message: 'Fortnox är inte anslutet. Hantverkaren kan koppla Fortnox under Inställningar.',
        },
      }
    }

    return {
      success: true,
      data: {
        connected: true,
        company_name: status.companyName,
        connected_at: status.connectedAt,
        sync_stats: status.syncStats,
      },
    }
  } catch (err: any) {
    return { success: false, error: `Fortnox-status misslyckades: ${err.message}` }
  }
}

async function triggerFortnoxSyncTool(
  businessId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const entityType = params.entity_type as string
  const entityId = params.entity_id as string

  if (!entityType || !entityId) {
    return { success: false, error: 'entity_type och entity_id krävs' }
  }

  try {
    const { syncCustomerWithTracking, syncInvoiceWithTracking, syncQuoteWithTracking } =
      await import('@/lib/fortnox/sync')

    let result: { success: boolean; skipped?: boolean; fortnoxId?: string; error?: string }

    switch (entityType) {
      case 'customer':
        result = await syncCustomerWithTracking(businessId, entityId)
        break
      case 'invoice':
        result = await syncInvoiceWithTracking(businessId, entityId)
        break
      case 'quote':
        result = await syncQuoteWithTracking(businessId, entityId)
        break
      default:
        return { success: false, error: `Okänd entity_type: ${entityType}` }
    }

    if (result.skipped) {
      return {
        success: true,
        data: {
          skipped: true,
          message: 'Fortnox är inte anslutet — synk hoppades över.',
        },
      }
    }

    if (!result.success) {
      return { success: false, error: result.error || 'Synk misslyckades' }
    }

    return {
      success: true,
      data: {
        entity_type: entityType,
        entity_id: entityId,
        fortnox_id: result.fortnoxId,
        message: `${entityType} synkad till Fortnox (${result.fortnoxId})`,
      },
    }
  } catch (err: any) {
    return { success: false, error: `Fortnox-synk misslyckades: ${err.message}` }
  }
}

async function getPricingSuggestionTool(
  businessId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const jobType = params.job_type as string
  const details = params.details as string | undefined

  if (!jobType) {
    return { success: false, error: 'job_type krävs' }
  }

  try {
    const { getPricingSuggestion } = await import('@/lib/agent/pricing-engine')
    const result = await getPricingSuggestion(businessId, jobType, details)

    if (result.found && result.suggestion) {
      return {
        success: true,
        data: {
          job_type: jobType,
          ...result.suggestion,
          message: `Prisförslag för "${jobType}": ${result.suggestion.recommended_price_range.min}–${result.suggestion.recommended_price_range.max} kr. ${result.suggestion.advice}`,
        },
      }
    }

    return {
      success: true,
      data: {
        found: false,
        job_type: jobType,
        similar_types: result.similar_types,
        message: result.similar_types?.length
          ? `Ingen exakt match för "${jobType}". Liknande jobbtyper: ${result.similar_types.join(', ')}`
          : `Ingen prisdata finns för "${jobType}" ännu.`,
      },
    }
  } catch (err: any) {
    return { success: false, error: `Prisförslag misslyckades: ${err.message}` }
  }
}

// ── V73 T1 Motor 1: Efterkalkyl-insikt (ren läsning) ──

/**
 * Wrapper runt lib/efterkalkyl/get-insight.ts — EXAKT samma lazy-backfill +
 * aggregering som app/api/quotes/efterkalkyl-insikt/route.ts (som Matte inte
 * kan anropa direkt eftersom den kräver session-cookies). Ingen dubblettlogik.
 */
async function getEfterkalkylInsightTool(
  supabase: SupabaseClient,
  businessId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const jobType = params.job_type ? String(params.job_type) : null
  const templateId = params.template_id ? String(params.template_id) : null
  if (!jobType && !templateId) {
    return { success: false, error: 'Ange job_type och/eller template_id.' }
  }

  try {
    const { getEfterkalkylInsight } = await import('@/lib/efterkalkyl/get-insight')
    const insight = await getEfterkalkylInsight(supabase, businessId, { jobType, templateId })
    return { success: true, data: insight }
  } catch (err: any) {
    return { success: false, error: `Efterkalkyl-insikt misslyckades: ${err.message}` }
  }
}

// ── Våg 2d (tasks/value-chain-plan.md): Enskild-projekt-efterkalkyl (job_completed-triggern) ──

/**
 * Wrapper runt lib/efterkalkyl/get-project-outcome.ts — enskild-projekt-
 * läsning (till skillnad från getEfterkalkylInsight ovan som aggregerar
 * över flera projekt av samma jobbtyp/mall). Fail-safe: getProjectOutcome
 * kastar aldrig, degraderar till found:false vid fel.
 */
async function getProjectOutcomeTool(
  supabase: SupabaseClient,
  businessId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const projectId = params.project_id ? String(params.project_id) : ''
  if (!projectId) {
    return { success: false, error: 'project_id krävs.' }
  }

  try {
    const { getProjectOutcome } = await import('@/lib/efterkalkyl/get-project-outcome')
    const outcome = await getProjectOutcome(supabase, businessId, projectId)
    return { success: true, data: outcome }
  } catch (err: any) {
    return { success: false, error: `Kunde inte hämta projektutfall: ${err.message}` }
  }
}

// ── V2.5 Motor 2: Kundbassvep (kö-populering, inga direkta utskick) ──

/**
 * Wrapper runt lib/agents/hanna/kundbas-svep.ts — samma svepfunktion och
 * cost-guard-mönster som app/api/agreements/sweep/route.ts ("Väck
 * kundbasen"-knappen). Skapar bara pending_approvals-kort, skickar aldrig
 * något direkt. Ingen dubblettlogik.
 */
async function runCustomerBaseSweepTool(
  supabase: SupabaseClient,
  businessId: string,
  context: ToolContext
): Promise<ToolResult> {
  try {
    const { checkCostGuards, logAgentRun } = await import('@/lib/agents/shared/cost-guard')
    const { runKundbasSweepForBusiness, summarizeSweepResult } = await import('@/lib/agents/hanna/kundbas-svep')

    const { data: bizGuards } = await supabase
      .from('business_config')
      .select('business_id, agents_globally_paused, agent_cost_cap_usd_daily, business_name')
      .eq('business_id', businessId)
      .maybeSingle()

    if (bizGuards) {
      const skip = await checkCostGuards(supabase, bizGuards, 'kundbas-svep')
      if (skip) {
        const message =
          skip.skipped === 'agents_globally_paused'
            ? 'AI-agenterna är pausade för det här kontot just nu — kontakta support om det är oväntat.'
            : 'Dagens AI-budget är redan förbrukad — försök igen imorgon.'
        return { success: true, data: { created: 0, skipped: skip.skipped, message } }
      }
    }

    const result = await runKundbasSweepForBusiness(
      supabase,
      businessId,
      bizGuards?.business_name || context.businessName || null
    )

    if (result.cost_usd > 0) {
      await logAgentRun(supabase, businessId, 'kundbas-svep', {
        debug: { usage: result.usage, estimated_cost_usd: result.cost_usd },
      })
    }

    const message =
      result.created > 0
        ? `La ${result.created} avtalsförslag i godkännande-kön.`
        : summarizeSweepResult(result)

    return { success: true, data: { created: result.created, candidates_total: result.candidates_total, message } }
  } catch (err: any) {
    return { success: false, error: `Kundbassvepet misslyckades: ${err.message}` }
  }
}

// ── Command Center overview tools (read-only) ──────────

/** Default-tröskel för "gammal offert" — samma som pengar-på-bordet-sidan. */
const STALE_QUOTE_DEFAULT_DAYS = 5

/**
 * "Vilka projekt behöver mig?" — projektlista berikad med flaggor ur
 * BEFINTLIGA kö-källor (pending_approvals). Alla tre typer bär
 * payload.project_id (profitability_warning: lib/profitability.ts,
 * create_ata_draft: lib/ata/suggest-ata-draft.ts, four_eyes_project_close:
 * lib/projects/four-eyes-gate.ts) — en enda bred läsning räcker, ingen
 * per-projekt-query. Räknar medvetet INTE om projektekonomi (computeProjectEconomics)
 * per projekt — för dyrt i chatt-latens.
 */
async function getProjectsOverview(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const status = typeof params.status === 'string' ? params.status : 'active'
  if (!['active', 'completed', 'all'].includes(status)) {
    return { success: false, error: `Ogiltig status "${status}" — använd active, completed eller all.` }
  }
  const limit = Math.min(Number(params.limit) > 0 ? Number(params.limit) : 20, 50)

  let q = supabase
    .from('project')
    .select('project_id, name, status, budget_amount, budget_hours, customer_id, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (status !== 'all') q = q.eq('status', status)

  const { data: projects, error } = await q
  if (error) return { success: false, error: error.message }
  const rows = projects || []

  const customerIds = Array.from(new Set(rows.map((p: any) => p.customer_id).filter(Boolean))) as string[]
  let customerMap: Record<string, string> = {}
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('customer').select('customer_id, name').in('customer_id', customerIds)
    customerMap = Object.fromEntries((customers || []).map((c: any) => [c.customer_id, c.name]))
  }

  const projectIds = new Set(rows.map((p: any) => p.project_id))
  const guardianFlagged = new Set<string>()
  const ataFlagged = new Set<string>()
  const fourEyesFlagged = new Set<string>()

  if (projectIds.size > 0) {
    const { data: approvals, error: apprError } = await supabase
      .from('pending_approvals')
      .select('approval_type, payload')
      .eq('business_id', businessId)
      .eq('status', 'pending')
      .in('approval_type', ['profitability_warning', 'create_ata_draft', 'four_eyes_project_close'])
    if (apprError) return { success: false, error: apprError.message }

    for (const a of approvals || []) {
      const pid = (a.payload as Record<string, unknown> | null)?.project_id
      if (typeof pid !== 'string' || !projectIds.has(pid)) continue
      if (a.approval_type === 'profitability_warning') guardianFlagged.add(pid)
      else if (a.approval_type === 'create_ata_draft') ataFlagged.add(pid)
      else if (a.approval_type === 'four_eyes_project_close') fourEyesFlagged.add(pid)
    }
  }

  const enriched = rows.map((p: any) => ({
    project_id: p.project_id,
    name: p.name,
    status: p.status,
    budget_amount: p.budget_amount,
    budget_hours: p.budget_hours,
    customer_id: p.customer_id,
    customer_name: p.customer_id ? (customerMap[p.customer_id] || 'Okänd') : null,
    har_oppet_guardian_kort: guardianFlagged.has(p.project_id),
    har_obesvarat_ata_forslag: ataFlagged.has(p.project_id),
    har_oppet_fyra_ogon_kort: fourEyesFlagged.has(p.project_id),
  }))

  return {
    success: true,
    data: {
      status_filter: status,
      count: enriched.length,
      projects: enriched,
      counts: {
        har_oppet_guardian_kort: enriched.filter((p: any) => p.har_oppet_guardian_kort).length,
        har_obesvarat_ata_forslag: enriched.filter((p: any) => p.har_obesvarat_ata_forslag).length,
        har_oppet_fyra_ogon_kort: enriched.filter((p: any) => p.har_oppet_fyra_ogon_kort).length,
      },
    },
  }
}

/**
 * "Offerterna som börjar bli gamla" — samma OPEN_QUOTE_STATUSES + sent_at-
 * tröskel som pengar-på-bordet-sidan (app/api/dashboard/pengar/route.ts).
 */
async function getStaleQuotes(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const days = Number(params.days) > 0 ? Number(params.days) : STALE_QUOTE_DEFAULT_DAYS
  const limit = Math.min(Number(params.limit) > 0 ? Number(params.limit) : 20, 50)
  const staleGrans = new Date(Date.now() - days * 86_400_000).toISOString()

  const { data, error } = await supabase
    .from('quotes')
    .select('quote_id, title, customer_id, total, sent_at')
    .eq('business_id', businessId)
    .in('status', [...OPEN_QUOTE_STATUSES])
    .lt('sent_at', staleGrans)
    .order('sent_at', { ascending: true })
    .limit(limit)
  if (error) return { success: false, error: error.message }
  const rows = (data || []).filter((q: any) => !arTestNamn(q.title))

  const customerIds = Array.from(new Set(rows.map((q: any) => q.customer_id).filter(Boolean))) as string[]
  let customerMap: Record<string, string> = {}
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('customer').select('customer_id, name').in('customer_id', customerIds)
    customerMap = Object.fromEntries((customers || []).map((c: any) => [c.customer_id, c.name]))
  }

  const now = Date.now()
  const enriched = rows.map((q: any) => ({
    quote_id: q.quote_id,
    title: q.title,
    customer_id: q.customer_id,
    customer_name: q.customer_id ? (customerMap[q.customer_id] || 'Okänd') : null,
    total: q.total,
    sent_at: q.sent_at,
    dagar_sedan_skickad: q.sent_at ? Math.floor((now - Date.parse(q.sent_at)) / 86_400_000) : null,
  }))

  return { success: true, data: { threshold_days: days, count: enriched.length, quotes: enriched } }
}

/**
 * "Vilka jobb kan faktureras?" — samma tre regler och samma tomma dedupe som
 * pengar-på-bordet-sidan kör (app/api/dashboard/pengar/route.ts): svaret ska
 * visa ALLT på bordet, inte bara det som ännu inte blivit ett kort.
 * sweepMissedRevenue är en ren funktion (lib/value/missed-revenue.ts) —
 * ingen egen affärslogik här, bara I/O + testdatafilter.
 */
async function getInvoiceableWork(
  supabase: SupabaseClient, businessId: string
): Promise<ToolResult> {
  const now = new Date()
  const [atasRes, matsRes, projRes, invRes] = await Promise.all([
    supabase.from('project_change')
      .select('id:change_id, project_id, change_type, description, amount, signed_at, invoice_id, invoiced_at')
      .eq('business_id', businessId)
      .not('signed_at', 'is', null)
      .is('invoiced_at', null),
    supabase.from('project_material')
      .select('id:material_id, project_id, total_sell, invoiced, invoice_id')
      .eq('business_id', businessId)
      .eq('invoiced', false),
    supabase.from('project')
      .select('project_id, name, project_type, status, completed_at')
      .eq('business_id', businessId)
      .eq('status', 'completed'),
    supabase.from('invoice')
      .select('project_id')
      .eq('business_id', businessId)
      .not('project_id', 'is', null),
  ])

  for (const [namn, res] of Object.entries({ atas: atasRes, material: matsRes, projekt: projRes, fakturor: invRes })) {
    if (res.error) return { success: false, error: `Kunde inte läsa ${namn}: ${res.error.message}` }
  }

  const riktigaProjekt = (projRes.data ?? []).filter(
    (p: any) => !arTestId(p.project_id) && !arTestNamn(p.name),
  )

  const findings = sweepMissedRevenue({
    atas: (atasRes.data ?? []) as any,
    materials: (matsRes.data ?? []) as any,
    projects: riktigaProjekt as any,
    invoices: (invRes.data ?? []) as any,
    // Tom dedupe med flit — se filhuvudskommentaren.
    alreadyReported: new Set(),
    now,
  })

  return {
    success: true,
    data: {
      count: findings.length,
      findings: findings.map(f => ({
        typ: f.kind,
        project_id: f.projectId,
        project_name: f.projectName,
        belopp_kr: f.amountKr,
        konfidens: f.confidence,
        rekommenderad_atgard: f.action,
        underlag: f.evidence,
      })),
    },
  }
}

/**
 * "Vad har vi lovat kunder?" — godkända customer_fact-rader (fact_type
 * 'commitment', superseded_by IS NULL). Läsvägen är fail-safe: v122 kan
 * ännu inte vara körd i alla miljöer (se sql/v122_customer_fact.sql), och
 * en saknad tabell ska ge tom lista, inte ett trasigt agentsvar.
 */
async function getCustomerCommitments(
  supabase: SupabaseClient, businessId: string
): Promise<ToolResult> {
  // Promise-to-Proof (Etapp N, 2026-08-17): select('*') i stället för en
  // explicit kolumnlista — due_at/promise_status (sql/v147_promise_dates.sql)
  // kan saknas i en omigrerad miljö, och en explicit '...,due_at,promise_status'
  // hade 42703:at HELA frågan (ingen löften-lista alls) tills v147 körs.
  // select('*') kan aldrig misslyckas på en saknad kolumn — de nya fälten
  // läses defensivt ur raden nedan (r.due_at ?? null) i stället.
  const { data, error } = await supabase
    .from('customer_fact')
    .select('*')
    .eq('business_id', businessId)
    .eq('fact_type', 'commitment')
    .is('superseded_by', null)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    if (error.message?.includes('schema cache') || error.message?.includes('does not exist')) {
      return { success: true, data: { count: 0, commitments: [], note: 'Kundfakta är inte konfigurerat ännu.' } }
    }
    return { success: false, error: error.message }
  }
  const rows = data || []

  const customerIds = Array.from(new Set(rows.map((r: any) => r.customer_id).filter(Boolean))) as string[]
  let customerMap: Record<string, string> = {}
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('customer').select('customer_id, name').in('customer_id', customerIds)
    customerMap = Object.fromEntries((customers || []).map((c: any) => [c.customer_id, c.name]))
  }

  return {
    success: true,
    data: {
      count: rows.length,
      commitments: rows.map((r: any) => ({
        customer_id: r.customer_id,
        customer_namn: customerMap[r.customer_id] || 'Okänd',
        content: r.content,
        evidence_quote: r.evidence_quote,
        created_at: r.created_at,
        // v147 (kan saknas i en omigrerad miljö — select('*') ovan gör att
        // frågan aldrig 42703:ar på dem, defensiv läsning här räcker).
        due_at: r.due_at ?? null,
        promise_status: r.promise_status ?? null,
      })),
    },
  }
}

// ── Etapp O — ProjectCommercialReadiness V1 (Evidence-to-Payment) ────────
//
// Read-only verdikt: är projektets underlag komplett nog för fakturering?
// loadProjectCommercialReadiness gör bara select-anrop och degraderar varje
// källfel till 'ej_bedombar' internt — men vi omsluter ändå med try/catch
// här, samma fail-soft-disciplin som övriga Command Center-verktyg i den
// här filen (chatten får ett begripligt fel, aldrig en krasch).
async function getProjectCommercialReadinessTool(
  supabase: SupabaseClient, businessId: string, params: Record<string, unknown>
): Promise<ToolResult> {
  const projectId = params.project_id ? String(params.project_id) : ''
  if (!projectId) {
    return { success: false, error: 'project_id krävs.' }
  }

  try {
    const { loadProjectCommercialReadiness, byggReadinessSummering } = await import(
      '@/lib/projects/commercial-readiness'
    )
    const readiness = await loadProjectCommercialReadiness(supabase, businessId, projectId)
    if (!readiness) {
      return { success: false, error: 'Projektet hittades inte.' }
    }
    return {
      success: true,
      data: {
        ...readiness,
        summary: byggReadinessSummering(readiness),
      },
    }
  } catch (err: any) {
    return { success: false, error: `Kunde inte kontrollera faktureringsberedskapen: ${err.message}` }
  }
}

// ── Goal-to-Plan V1 (Etapp B, tasks/jaunty-pondering-hummingbird.md) ──────

/**
 * Tolkar de rå tool-input-fälten till MissionPlanInput. Defensiv typning —
 * en modell som skickar fel typ (t.ex. sträng där tal förväntas) ska ge ett
 * begripligt valideringsfel via validateMissionPlan, aldrig en krasch här.
 */
function parseMissionPlanInput(params: Record<string, unknown>): MissionPlanInput {
  const rawSteps = Array.isArray(params.steps) ? params.steps : []
  return {
    // Etapp F/I: 'money'/'capacity'/'contact' skickas rakt igenom oparsat om
    // det avviker — validateMissionPlan() defaultar (via resolveGoalType)
    // allt annat till 'money', så vi behöver ingen egen defaultering här.
    goal_type: params.goal_type === 'capacity' || params.goal_type === 'money' || params.goal_type === 'contact'
      ? params.goal_type
      : undefined,
    goal_kr: typeof params.goal_kr === 'number' ? params.goal_kr : Number(params.goal_kr),
    goal_hours: typeof params.goal_hours === 'number' ? params.goal_hours : Number(params.goal_hours),
    goal_count: typeof params.goal_count === 'number' ? params.goal_count : Number(params.goal_count),
    deadline: typeof params.deadline === 'string' ? params.deadline : '',
    steps: rawSteps.map((raw) => {
      const step = (raw ?? {}) as Record<string, unknown>
      return {
        item_id: typeof step.item_id === 'string' ? step.item_id : '',
        motivation: typeof step.motivation === 'string' ? step.motivation : '',
      }
    }),
  }
}

/**
 * propose_mission_plan — visar ett OBEKRÄFTAT plankort i chatten, sparar
 * ingenting. LLM:en pekar bara på item_id:n ur den möjlighetsportfölj som
 * redan injicerats i systempromptet (app/api/matte/chat/route.ts); portföljen
 * läses om här (billiga, indexerade frågor — se
 * lib/mission/opportunity-portfolio.ts) så avvisningar alltid bedöms mot
 * färsk data, och validateMissionPlan KOPIERAR varje stegs mått ur
 * portföljens item — ett belopp modellen hittar på ignoreras helt.
 */
async function proposeMissionPlanTool(
  supabase: SupabaseClient,
  businessId: string,
  params: Record<string, unknown>,
): Promise<ToolResult> {
  const plan = parseMissionPlanInput(params)
  const portfolio = await loadOpportunityPortfolioForBusiness(supabase, businessId)
  const result = validateMissionPlan(plan, portfolio, new Date())
  if (!result.ok) {
    // Detail är redan svensk och skriven för att modellen ska kunna
    // korrigera sig (t.ex. "okänt item_id" → försök igen med rätt id).
    return { success: false, error: result.detail }
  }

  // Etapp F/I: pengar, timmar och antal blandas ALDRIG i en siffra —
  // presentationen bär bara DET ena målfältet, de andra sätts uttryckligen
  // till null.
  const goalType = resolveGoalType(plan.goal_type)
  const presentation: MissionPlanPresentation = {
    kind: 'mission_plan',
    version: 1,
    state: 'proposal',
    mission_id: null,
    goal_type: goalType,
    goal_kr: goalType === 'money' ? plan.goal_kr! : null,
    goal_hours: goalType === 'capacity' ? plan.goal_hours! : null,
    goal_count: goalType === 'contact' ? plan.goal_count! : null,
    deadline: plan.deadline,
    headline: buildMissionHeadline(
      plan.goal_kr ?? 0,
      plan.deadline,
      goalType === 'capacity'
        ? { goalType, goalHours: plan.goal_hours }
        : goalType === 'contact'
          ? { goalType, goalCount: plan.goal_count }
          : undefined,
    ),
    steps: result.steps,
    degraded_sources: portfolio.degraded_sources,
  }

  return {
    success: true,
    data: {
      presentation,
      summary: buildMissionSummaryText(presentation),
    },
  }
}

/** Agentens visningsnamn — samma karta som sendAgentMessageTool använder,
    duplicerad hellre än att bryta ut en delad export för fyra rader. */
const MISSION_AGENT_DISPLAY_NAMES: Record<string, string> = {
  matte: 'Matte', karin: 'Karin', hanna: 'Hanna', daniel: 'Daniel', lars: 'Lars', lisa: 'Lisa',
}

/**
 * confirm_mission — skapar den RIKTIGA mission-raden när hantverkaren
 * bekräftat ett tidigare propose_mission_plan-förslag.
 *
 * ═══ ÄRLIGHETSGRINDEN: OMVALIDERAS ALLTID MOT EN FÄRSK PORTFÖLJ ═══
 *
 * Ett förslag kan ha visats minuter — eller en hel chattsession — tidigare:
 * fakturor kan ha betalats, offerter kan ha gått ut. Det tidigare presenterade
 * plankortet litar vi ALDRIG på; portföljen räknas om och planen omvalideras
 * precis som i propose_mission_plan innan något skrivs till databasen. Det
 * dödar inaktuella belopp.
 */
async function confirmMissionTool(
  supabase: SupabaseClient,
  businessId: string,
  params: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const plan = parseMissionPlanInput(params)
  const portfolio = await loadOpportunityPortfolioForBusiness(supabase, businessId)
  const result = validateMissionPlan(plan, portfolio, new Date())
  if (!result.ok) {
    return { success: false, error: result.detail }
  }

  // ═══ ETAPP D: DEN UTGÅNGNA BLOCKERAREN ═══
  //
  // GET /api/mission/active skriver redan expired lättjefullt vid läsning —
  // men en ägare som aldrig öppnar dashboarden (bara chattar med Matte)
  // fastnar annars bakom en aktiv rad vars deadline redan passerat, för
  // evigt (idx_mission_one_active tillåter bara EN aktiv rad). Samma
  // datumjämförelse-idiom som app/api/mission/active/route.ts: ren
  // datum-bara-jämförelse, ingen cron.
  try {
    const { data: aktivMission, error: aktivError } = await supabase
      .from('mission')
      .select('id, deadline')
      .eq('business_id', businessId)
      .eq('status', 'active')
      .maybeSingle()

    if (aktivError) {
      // 42P01 (tabellen saknas) hanteras redan av INSERT-felhanteringen
      // nedan — fail-soft: gå vidare till försöket i stället för att
      // avbryta kontrollen här.
      if (aktivError.code !== '42P01') {
        console.warn('[confirm_mission] kunde inte kontrollera befintligt aktivt uppdrag (fortsätter till insert):', aktivError.message)
      }
    } else if (aktivMission) {
      const idag = new Date().toISOString().slice(0, 10)
      const deadlineDate = typeof aktivMission.deadline === 'string' ? aktivMission.deadline.slice(0, 10) : ''

      if (deadlineDate !== '' && deadlineDate < idag) {
        const { error: expireError } = await supabase
          .from('mission')
          .update({ status: 'expired', resolved_at: new Date().toISOString() })
          .eq('id', aktivMission.id)
          .eq('business_id', businessId)
          .eq('status', 'active')
        if (expireError) {
          console.warn('[confirm_mission] kunde inte auto-expirera det gamla uppdraget (fortsätter ändå mot insert):', expireError.message)
        }
        // Faller igenom till INSERT nedan — den gamla platsen är fri.
      } else {
        // Deadline idag eller i framtiden — det gamla uppdraget är
        // fortfarande giltigt. Svara direkt utan att ens försöka INSERT:en
        // (sparar constraint-krocken; 23505-fångsten nedan är kvar som
        // backstop om två bekräftelser råkar race:a).
        return {
          success: false,
          error: 'Det finns redan ett aktivt uppdrag. Avsluta det först — säg till mig så avslutar jag det.',
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[confirm_mission] oväntat fel vid kontroll av befintligt uppdrag (fortsätter till insert):', msg)
  }

  const id = generateId('mis')
  const goalType = resolveGoalType(plan.goal_type)

  // Etapp F: INSERT-formen grenar medvetet på goalType i stället för att
  // alltid skicka med goal_type/goal_hours. sql/v145_mission_capacity_goal.sql
  // (kolumnerna) körs manuellt av Andreas och kan alltså saknas i vissa
  // miljöer — pengavägen (den gamla, redan levande vägen) skickar EXAKT
  // samma insert-form som innan Etapp F, så pengauppdrag aldrig regresserar
  // i en omigrerad miljö. Bara kapacitetsvägen bär de nya kolumnerna, och
  // dess egen felgren nedan (42703/schema cache) fångar en omigrerad miljö
  // vänligt.
  const insertPayload: Record<string, unknown> = {
    id,
    business_id: businessId,
    deadline: plan.deadline,
    status: 'active',
    plan_snapshot: { steps: result.steps },
    portfolio_generated_at: portfolio.generated_at,
    // Etapp D-härdning: business_users.id när matte/chat/route.ts trädde
    // igenom den (levande dashboard-/mobil-chatt) — annars NULL, precis som
    // förut (autonoma vägar bär ingen inloggad identitet).
    created_by: context.businessUserId ?? null,
  }
  if (goalType === 'capacity') {
    insertPayload.goal_type = 'capacity'
    insertPayload.goal_hours = plan.goal_hours
    insertPayload.goal_kr = null
  } else if (goalType === 'contact') {
    insertPayload.goal_type = 'contact'
    insertPayload.goal_count = plan.goal_count
    insertPayload.goal_kr = null
  } else {
    insertPayload.goal_kr = plan.goal_kr
    // goal_type/goal_hours/goal_count utelämnas MEDVETET på pengavägen:
    // kolumnerna kan saknas helt pre-v145/pre-v146, och när de väl är körda
    // täcker DEFAULT 'money' exakt samma sak.
  }

  const { error } = await supabase.from('mission').insert(insertPayload)

  if (error) {
    // Max ETT aktivt uppdrag per företag (partiellt unikt index,
    // sql/v144_mission.sql, idx_mission_one_active) — en krock är väntat,
    // inte trasigt: be hantverkaren avsluta det gamla först.
    if (error.code === '23505' || /idx_mission_one_active/.test(error.message || '')) {
      return {
        success: false,
        error: 'Det finns redan ett aktivt uppdrag. Avsluta det först — säg till mig så avslutar jag det.',
      }
    }
    // sql/v144_mission.sql körs manuellt av Andreas — tabellen kan alltså
    // saknas i vissa miljöer tills dess (samma fail-soft-idiom som andra
    // v1xx-migrationer i den här filen).
    if (error.code === '42P01') {
      return {
        success: false,
        error: 'Uppdragsfunktionen är inte påkopplad ännu i den här miljön — be din admin köra den senaste databasmigrationen.',
      }
    }
    // Etapp F/I: kapacitets-/kontaktkolumnerna (sql/v145_mission_capacity_
    // goal.sql, sql/v146_mission_contact_goal.sql) kan saknas i en miljö där
    // migrationen inte körts än — samma fail-soft-idiom som 42P01 ovan, men
    // för enskilda kolumner i stället för hela tabellen (PostgREST svarar
    // 42703/undefined_column eller ett "schema cache"-felmeddelande).
    if ((goalType === 'capacity' || goalType === 'contact') && (error.code === '42703' || /schema cache|does not exist/i.test(error.message || ''))) {
      return {
        success: false,
        error: goalType === 'capacity'
          ? 'Kapacitetsmål är inte påkopplat ännu i den här miljön — be din admin köra den senaste databasmigrationen (v145).'
          : 'Kontaktmål är inte påkopplat ännu i den här miljön — be din admin köra den senaste databasmigrationen (v146).',
      }
    }
    return { success: false, error: error.message }
  }

  const presentation: MissionPlanPresentation = {
    kind: 'mission_plan',
    version: 1,
    state: 'confirmed',
    mission_id: id,
    goal_type: goalType,
    goal_kr: goalType === 'money' ? plan.goal_kr! : null,
    goal_hours: goalType === 'capacity' ? plan.goal_hours! : null,
    goal_count: goalType === 'contact' ? plan.goal_count! : null,
    deadline: plan.deadline,
    headline: buildMissionHeadline(
      plan.goal_kr ?? 0,
      plan.deadline,
      goalType === 'capacity'
        ? { goalType, goalHours: plan.goal_hours }
        : goalType === 'contact'
          ? { goalType, goalCount: plan.goal_count }
          : undefined,
    ),
    steps: result.steps,
    degraded_sources: portfolio.degraded_sources,
  }

  // ═══ ETAPP D: KOORDINERINGSSTARTEN ═══
  //
  // Utan den här texten startade verkställigheten först i Matte's nästa
  // chattur — hantverkaren fick ett "uppdraget är igång" utan att någon
  // specialist faktiskt kallats in. next_instruction adresserar modellen
  // direkt: lämna över planens första steg NU, och stämpla varje åtgärdskort
  // för uppdraget med payload.mission_id + payload.truth_class (annars
  // räknas kortet aldrig in i progressen, se mission-progress.ts
  // approvalClass).
  const forstaStegen = result.steps
    .slice(0, 3)
    .map(s => `${s.title} → ${MISSION_AGENT_DISPLAY_NAMES[s.agent_key] || s.agent_key}`)
    .join('; ')
  const nextInstruction =
    `Uppdraget är bekräftat (mission_id: ${id}). Börja verkställa planen NU, i den här turen: ` +
    `lämna över första steget/stegen till ansvarig specialist — ${forstaStegen}. ` +
    `Varje åtgärdskort du eller en specialist skapar för det här uppdraget MÅSTE bära ` +
    `payload.mission_id: '${id}' och payload.truth_class satt till stegets sanningsklass — ` +
    `annars räknas åtgärden aldrig in i uppdragets progress när hantverkaren tittar på uppdragsraden.`

  return {
    success: true,
    data: {
      mission_id: id,
      presentation,
      next_instruction: nextInstruction,
    },
  }
}

// ── Inter-agent communication tools ──

async function sendAgentMessageTool(
  supabase: SupabaseClient,
  businessId: string,
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const toAgent = input.to_agent as string
  const messageType = input.message_type as string
  const content = input.content as string
  const reason = (input.reason as string) || undefined
  const ctxData = (input.context as Record<string, unknown>) || undefined
  const fromAgent = context.agentId || 'matte'

  if (!toAgent || !content) {
    return { success: false, error: 'Saknar mottagare eller meddelande' }
  }

  const validAgents = ['matte', 'karin', 'hanna', 'daniel', 'lars', 'lisa']
  if (!validAgents.includes(toAgent)) {
    return { success: false, error: `Okänd agent: ${toAgent}. Giltiga: ${validAgents.join(', ')}` }
  }

  const type = messageType || 'request'

  // Bygg strukturerad metadata för handoff — reason + context sparas för UI och mottagarens prompt
  const metadata: Record<string, unknown> = { ...(input.metadata as Record<string, unknown> || {}) }
  if (reason) metadata.reason = reason
  if (ctxData) metadata.context = ctxData

  const { data: inserted, error } = await supabase.from('agent_messages').insert({
    business_id: businessId,
    from_agent: fromAgent,
    to_agent: toAgent,
    message_type: type,
    content,
    metadata,
  }).select('id').single()

  if (error) {
    return { success: false, error: `Kunde inte skicka meddelande: ${error.message}` }
  }

  const agentNames: Record<string, string> = {
    matte: 'Matte', karin: 'Karin', hanna: 'Hanna', daniel: 'Daniel', lars: 'Lars', lisa: 'Lisa',
  }

  if (type !== 'handoff') {
    return {
      success: true,
      data: { message: `Meddelande skickat till ${agentNames[toAgent]}`, to: toAgent, type },
    }
  }

  /**
   * ═══ ÖVERLÄMNINGEN ═══
   *
   * Formen är oförändrad: en nästlad HTTP-POST till samma rutt. Det bevarar
   * fire-and-forget-kontraktet mot voice/transcribe, som inte väntar på svar.
   * Fyra saker inuti är däremot nya.
   *
   * 1. LOOPSKYDDET. validateNextStep frågade förut bara chatten. Här fanns
   *    ingenting: Lisa→Daniel→Lisa var möjligt, och varje varv kostade en hel
   *    modellkörning. Kedjan reser nu med i trigger_data.
   *
   * 2. BRIEFINGEN. Mottagaren fick fritext och, i praktiken, hela trigger_data
   *    som JSON (default-caset i getTriggerInstructions). Nu byggs den i kod:
   *    ursprungsärendet ordagrant plus vad kollegorna faktiskt gjort.
   *
   * 3. TIDSGRÄNSEN. Timeouten var 8 sekunder — kortare än en typisk körning med
   *    verktygssteg. handoff_delivered blev därför systematiskt false för
   *    överlämningar som faktiskt kördes klart, medan modellen ändå fick texten
   *    "tar över nu". Budgeten följer nu routens egen (maxDuration 60) med
   *    marginal, och när vi ändå inte hinner invänta svaret säger vi OKÄNT —
   *    inte "misslyckades". En flagga som ljuger är värre än ingen flagga.
   *
   * 4. RESULTATET. Anroparen fick en boolean. Nu returneras mottagarens
   *    agent_result, så Lisa vet vad Daniel gjorde i stället för att gissa.
   */
  const kedja = context.handoffChain
  const visited = kedja?.visited ?? []
  const steg = validateNextStep({ from: fromAgent as AgentId, target: toAgent, visited })

  if (!steg.ok) {
    return { success: false, error: HANDOFF_AVSLAG[steg.reason](agentNames[toAgent] || toAgent) }
  }

  const intent: OrchestrationIntent = kedja?.intent ?? {
    text: content,
    customerId: (ctxData?.customer_id as string) || null,
    projectId: (ctxData?.project_id as string) || null,
  }
  const originKey = kedja?.originKey || String(inserted?.id || `${businessId}:${fromAgent}`)
  const briefing = buildHandoffBriefing(intent, kedja?.results ?? [], reason || content)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  let levererat: 'levererad' | 'nekad' | 'okand' = 'okand'
  let mottagarensResultat: AgentResult | undefined
  let redanUtford = false

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), HANDOFF_BUDGET_MS)
    const handoffRes = await fetch(`${appUrl}/api/agent/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.CRON_SECRET || '',
      },
      body: JSON.stringify({
        business_id: businessId,
        trigger_type: 'agent_handoff',
        agent_id: steg.target,
        idempotency_key: handoffIdempotencyKey({
          originKey,
          target: steg.target,
          step: visited.length + 1,
        }),
        trigger_data: {
          from_agent: fromAgent,
          handoff_briefing: briefing,
          handoff_message: content,
          handoff_reason: reason || null,
          handoff_context: ctxData || null,
          message_id: inserted?.id,
          handoff_chain: {
            visited: [...visited, fromAgent].filter(a => a !== 'matte'),
            intent,
            originKey,
            results: kedja?.results ?? [],
          },
        },
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))

    if (handoffRes.ok) {
      levererat = 'levererad'
      const svar = await handoffRes.json().catch(() => null)
      mottagarensResultat = svar?.agent_result
      redanUtford = svar?.duplicate === true
    } else {
      levererat = 'nekad'
      console.error('[sendAgentMessage] handoff dispatch svarade', handoffRes.status)
    }
  } catch (err: any) {
    // Timeout eller nätverksfel. Meddelandet ligger kvar i agent_messages och
    // plockas av mottagaren vid nästa körning — men VI vet inte om körningen
    // hann bli klar. Det är precis det ordet vi ska använda.
    console.error('[sendAgentMessage] handoff dispatch okänt utfall:', err?.message || err)
  }

  return {
    success: true,
    data: {
      message: HANDOFF_BESKED[levererat](agentNames[steg.target], redanUtford),
      to: steg.target,
      type,
      auto_triggered: true,
      handoff_status: levererat,
      ...(mottagarensResultat ? { handoff_result: mottagarensResultat } : {}),
    },
  }
}

/**
 * Budgeten för att invänta mottagaren. Routen tillåter 60 s; 45 lämnar
 * anroparen tid att avsluta sin egen körning i stället för att själv dö i
 * väntan. Löper den ut vet vi inte utfallet — vi påstår därför ingenting.
 */
const HANDOFF_BUDGET_MS = 45_000

/** Vad modellen får veta när loopskyddet stoppar bytet. */
const HANDOFF_AVSLAG: Record<PlanRefusal, (namn: string) => string> = {
  invalid_agent: namn => `${namn} finns inte i teamet.`,
  not_allowed: namn => `Du får inte lämna över till ${namn} — ärendet ligger utanför den vägen.`,
  agent_repeat: namn => `${namn} har redan varit inne i det här ärendet. Avsluta i stället för att skicka tillbaka det.`,
  max_steps: () => 'Ärendet har redan passerat tre specialister. Sammanfatta läget för hantverkaren i stället.',
}

/** Beskedet till modellen. Säger aldrig mer än vi vet. */
const HANDOFF_BESKED: Record<'levererad' | 'nekad' | 'okand', (namn: string, redan: boolean) => string> = {
  levererad: (namn, redan) =>
    redan
      ? `${namn} hade redan tagit det här ärendet — ingen dubbelkörning gjordes.`
      : `${namn} har tagit över och kört klart.`,
  nekad: namn => `Meddelandet till ${namn} är sparat, men överlämningen gick inte fram.`,
  okand: namn => `Meddelandet till ${namn} är sparat. ${namn} hann inte svara innan jag släppte — påstå inget om vad som gjorts.`,
}

async function getAgentMessagesTool(
  supabase: SupabaseClient,
  businessId: string,
  context: ToolContext
): Promise<ToolResult> {
  const agentId = context.agentId || 'matte'

  const { data, error } = await supabase
    .from('agent_messages')
    .select('id, from_agent, message_type, content, metadata, created_at')
    .eq('business_id', businessId)
    .eq('to_agent', agentId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    return { success: false, error: `Kunde inte hämta meddelanden: ${error.message}` }
  }

  // Mark as read (non-blockerande — meddelandena är redan hämtade)
  if (data && data.length > 0) {
    const { error: markError } = await supabase
      .from('agent_messages')
      .update({ status: 'read' })
      .in('id', data.map((m: any) => m.id))
    if (markError) console.error('[getAgentMessages] mark-as-read update failed:', markError.message)
  }

  const agentNames: Record<string, string> = {
    matte: 'Matte', karin: 'Karin', hanna: 'Hanna', daniel: 'Daniel', lars: 'Lars', lisa: 'Lisa',
  }

  return {
    success: true,
    data: {
      messages: (data || []).map((m: any) => ({
        from: agentNames[m.from_agent] || m.from_agent,
        type: m.message_type,
        content: m.content,
        reason: m.metadata?.reason || null,
        context: m.metadata?.context || null,
        time: m.created_at,
      })),
      count: data?.length || 0,
    },
  }
}
