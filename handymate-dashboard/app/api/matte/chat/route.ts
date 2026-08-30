import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { AGENT_CAPABILITIES, type AgentId } from '@/lib/agent/capabilities'
import { OPEN_QUOTE_STATUSES } from '@/lib/quotes/statuses'
import {
  getOrCreateThread,
  executeHandoff,
  buildHandoffAnnouncement,
  touchThread,
  restoreThreadOwner,
  MAX_HANDOFFS_PER_THREAD,
} from '@/lib/agent/handoff'
import {
  saveThreadMessage,
  loadThreadMessages,
  toClaudeMessages,
  summarizeIfNeeded,
  buildUserContentWithImages,
  type ThreadImage,
} from '@/lib/agent/thread-messages'
import { sanitizeSenderId } from '@/lib/sms/sender-id'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { executeTool as executeSharedTool } from '@/app/api/agent/trigger/tool-router'
import { filterTools, fetchBusinessContext, type ToolContext } from '@/lib/agent/agents/shared'
import {
  isConfirmGatedTool,
  signPendingExternalAction,
  verifyPendingExternalAction,
  buildExternalActionSummary,
  confirmLabelForTool,
} from '@/lib/agent/external-confirm'
import { getRelevantMemories, buildMemoryPrompt, extractAndSaveMemory } from '@/lib/agents/memory'
import { getAgentTools } from '@/lib/agents/personalities'
import { meterDirectLlmCall } from '@/lib/agents/shared/cost-guard'
import { llmCostUsd, type TokenUsage } from '@/lib/costs/meter'
import { checkFuelGate } from '@/lib/costs/fuel'
import { byggAskCoverage } from '@/lib/matte/ask-coverage'
import { createQuote } from '@/lib/quotes/create-quote'
import {
  validateNextStep,
  toAgentResult,
  buildHandoffBriefing,
  buildOrchestrationSummary,
  shouldMatteSummarize,
  MAX_SPECIALIST_STEPS,
  type AgentResult,
  type OrchestrationIntent,
  type ToolOutcome,
} from '@/lib/agent/orchestration'
import {
  isBusinessScenarioPresentation,
  type BusinessScenarioPresentation,
} from '@/lib/business-twin/scenario-contract'
import {
  loadOpportunityPortfolioForBusiness,
  TRUTH_CLASSES,
  type OpportunityPortfolio,
  type PortfolioMeasure,
  type TruthClass,
} from '@/lib/mission/opportunity-portfolio'
import {
  isMissionPlanPresentation,
  type MissionPlanPresentation,
} from '@/lib/mission/mission-presentation'
import { buildMissionHeadline } from '@/lib/mission/mission-summary'
import { resolveGoalType } from '@/lib/mission/goal-type'
import { loadCompanyModel, byggCompanyModelPromptBlock, type CompanyModel } from '@/lib/company/company-model'

const MAX_IMAGES_PER_MESSAGE = 4
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB

export const maxDuration = 30

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

/** Klientens sidkontext får aldrig bli fri text i systemprompten. */
function safeContextId(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  return /^[A-Za-z0-9_-]{1,100}$/.test(text) ? text : null
}

interface VerifiedPageContext {
  customerId: string | null
  projectId: string | null
  quoteId: string | null
  invoiceId: string | null
}

/**
 * Serverägd sidkontext (Matte Mobile Voice V1, 2026-08-30). Klientens ID:n
 * var hittills bara regex-sanerade — här verifieras ägarskapet mot tenanten
 * innan de får styra trådval eller nämnas i systemprompten. Ett ID som inte
 * tillhör företaget SLÄPPS (och loggas) i stället för att fela requesten:
 * chatten ska fungera även när klienten skickar skräp. Verktygslagret
 * behåller sina egna business_id-vakter — det här är försvar i djup, inte
 * en ersättning.
 */
async function verifyPageContextOwnership(
  supabase: ReturnType<typeof getServerSupabase>,
  businessId: string,
  ids: VerifiedPageContext
): Promise<VerifiedPageContext> {
  const out: VerifiedPageContext = { customerId: null, projectId: null, quoteId: null, invoiceId: null }
  const kontroller: Array<PromiseLike<void>> = []

  const verifiera = (
    tabell: string,
    idKolumn: string,
    varde: string | null,
    falt: keyof VerifiedPageContext
  ) => {
    if (!varde) return
    kontroller.push(
      supabase
        .from(tabell)
        .select(idKolumn)
        .eq('business_id', businessId)
        .eq(idKolumn, varde)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            // Fail-soft: ett läsfel får inte fälla chatten — men ett
            // overifierat ID går heller aldrig vidare in i prompten.
            console.error(`[matte/chat] sidkontext ${falt} kunde inte verifieras (släpps):`, error.message)
            return
          }
          if (data) out[falt] = varde
          else console.warn(`[matte/chat] sidkontext ${falt}=${varde} tillhör inte företaget — släpps`)
        })
    )
  }

  verifiera('customer', 'customer_id', ids.customerId, 'customerId')
  verifiera('project', 'project_id', ids.projectId, 'projectId')
  verifiera('quotes', 'quote_id', ids.quoteId, 'quoteId')
  verifiera('invoice', 'invoice_id', ids.invoiceId, 'invoiceId')

  await Promise.all(kontroller)
  return out
}

// ────────────────────────────────────────────────────────────────────────────
// Business context — verklig data till system-promptet
// ────────────────────────────────────────────────────────────────────────────

async function getBusinessContext(businessId: string) {
  const supabase = getServerSupabase()
  const today = new Date().toISOString().split('T')[0]
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]

  const [
    openQuotes,
    overdueInvoices,
    activeProjects,
    recentLeads,
    pendingApprovals,
    todayBookings,
    companyModel,
  ] = await Promise.all([
    supabase.from('quotes')
      .select('quote_id, quote_number, total, sent_at')
      .eq('business_id', businessId)
      .in('status', [...OPEN_QUOTE_STATUSES])
      .order('sent_at', { ascending: false })
      .limit(5),
    supabase.from('invoice')
      .select('invoice_id, invoice_number, total, due_date')
      .eq('business_id', businessId)
      .eq('status', 'sent')
      .lt('due_date', today)
      .limit(5),
    supabase.from('project')
      .select('name, status')
      .eq('business_id', businessId)
      .eq('status', 'active')
      .limit(5),
    supabase.from('leads')
      .select('name, phone, job_type, created_at, score')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('pending_approvals')
      .select('approval_type, title, created_at')
      .eq('business_id', businessId)
      .eq('status', 'pending')
      .limit(5),
    supabase.from('booking')
      .select('scheduled_start, notes, status')
      .eq('business_id', businessId)
      .gte('scheduled_start', today)
      .lt('scheduled_start', tomorrow)
      .limit(5),
    // Etapp T — källmärkt "hur jobbar den här firman"-block. Fail-soft:
    // ett laddningsfel får aldrig fälla hela affärskontexten.
    loadCompanyModel(supabase, businessId).catch((err) => {
      console.error('[matte/chat] company model kunde inte laddas (non-blocking):', err)
      return null as CompanyModel | null
    }),
  ])

  return {
    openQuotes: openQuotes.data || [],
    overdueInvoices: overdueInvoices.data || [],
    activeProjects: activeProjects.data || [],
    recentLeads: recentLeads.data || [],
    pendingApprovals: pendingApprovals.data || [],
    todayBookings: todayBookings.data || [],
    companyModel,
  }
}

function fmt(n: number | null | undefined): string {
  return n != null ? n.toLocaleString('sv-SE') : '0'
}

function buildContextSection(ctx: Awaited<ReturnType<typeof getBusinessContext>>): string {
  const lines: string[] = []
  lines.push(`AKTUELL AFFÄRSSTATUS (${new Date().toLocaleDateString('sv-SE')}):`)
  lines.push(`- Öppna offerter: ${ctx.openQuotes.length} st`)
  lines.push(`- Förfallna fakturor: ${ctx.overdueInvoices.length} st`)
  lines.push(`- Aktiva projekt: ${ctx.activeProjects.length} st`)
  lines.push(`- Nya leads (senaste): ${ctx.recentLeads.length} st`)
  lines.push(`- Väntande godkännanden: ${ctx.pendingApprovals.length} st`)
  lines.push(`- Dagens bokningar: ${ctx.todayBookings.length} st`)

  if (ctx.overdueInvoices.length > 0) {
    lines.push('')
    lines.push('FÖRFALLNA FAKTUROR:')
    for (const i of ctx.overdueInvoices) {
      lines.push(`- ${i.invoice_number || '—'} (id: ${i.invoice_id}): ${fmt(i.total)} kr (förföll ${i.due_date || '—'})`)
    }
  }

  if (ctx.openQuotes.length > 0) {
    lines.push('')
    lines.push('ÖPPNA OFFERTER:')
    for (const q of ctx.openQuotes) {
      const sentDate = q.sent_at ? new Date(q.sent_at).toLocaleDateString('sv-SE') : '—'
      lines.push(`- ${q.quote_number || '—'} (id: ${q.quote_id}): ${fmt(q.total)} kr (skickad ${sentDate})`)
    }
  }

  if (ctx.pendingApprovals.length > 0) {
    lines.push('')
    lines.push('VÄNTAR PÅ DIG:')
    for (const a of ctx.pendingApprovals) {
      lines.push(`- ${a.title} (${a.approval_type})`)
    }
  }

  if (ctx.todayBookings.length > 0) {
    lines.push('')
    lines.push('DAGENS BOKNINGAR:')
    for (const b of ctx.todayBookings) {
      const time = new Date(b.scheduled_start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
      lines.push(`- ${time}: ${b.notes || 'Bokning'}`)
    }
  }

  if (ctx.recentLeads.length > 0) {
    lines.push('')
    lines.push('SENASTE LEADS:')
    for (const l of ctx.recentLeads) {
      const score = l.score != null ? ` (score ${l.score})` : ''
      lines.push(`- ${l.name || 'Okänd'}: ${l.job_type || '—'}${score}`)
    }
  }

  if (ctx.activeProjects.length > 0) {
    lines.push('')
    lines.push('AKTIVA PROJEKT:')
    for (const p of ctx.activeProjects) {
      lines.push(`- ${p.name}`)
    }
  }

  if (ctx.companyModel) {
    lines.push('')
    lines.push(byggCompanyModelPromptBlock(ctx.companyModel))
  }

  return lines.join('\n')
}

// ────────────────────────────────────────────────────────────────────────────
// Möjlighetsportfölj — Goal-to-Plan V1 (Etapp B,
// tasks/jaunty-pondering-hummingbird.md). Kontextblocket som gör
// propose_mission_plan/confirm_mission möjliga: modellen får ALDRIG hitta på
// item_id eller belopp — bara peka ordagrant på det som står här, servern
// kopierar resten (lib/mission/plan-validation.ts).
// ────────────────────────────────────────────────────────────────────────────

const TRUTH_CLASS_LABELS: Record<TruthClass, string> = {
  indrivningsbart: 'indrivningsbart',
  faktureringsklart: 'faktureringsklart',
  pipeline: 'pipeline (ALDRIG säkrade pengar)',
  ateraktivering: 'ateraktivering (ANTAL kunder, aldrig kr)',
  marginalskydd: 'marginalskydd',
}

function formatPortfolioMeasure(m: PortfolioMeasure): string {
  return m.kind === 'kr' ? `${m.amountKr.toLocaleString('sv-SE')} kr` : `${m.count} st`
}

/** Gaten: bara injicera kontextblocket när det finns något att peka på. */
function portfolioHasItems(portfolio: OpportunityPortfolio): boolean {
  return TRUTH_CLASSES.some(cls => portfolio.by_class[cls].length > 0)
}

function buildPortfolioContextSection(portfolio: OpportunityPortfolio): string {
  const lines: string[] = []
  lines.push('[MÖJLIGHETSPORTFÖLJ — underlag för uppdrag. Referera ENDAST dessa item_id:n i propose_mission_plan/confirm_mission. Belopp är serverns — hitta aldrig på egna.]')
  // Etapp F (kapacitetsmål) — en rad, källskannad av tests/mission-tools.spec.ts.
  lines.push('[Kapacitetsmål: om hantverkaren vill fylla NÄSTA veckas luckor (tunn vecka), föreslå en plan med goal_type "capacity" och goal_hours (INTE goal_kr) i propose_mission_plan/confirm_mission — kräver konfigurerad kapacitet (Inställningar); saknas den, säg det ärligt i stället för att gissa ett tal.]')
  // Etapp I (kontaktmål) — en rad, källskannad av tests/mission-tools.spec.ts.
  lines.push('[Kontaktmål: om hantverkaren vill nå ett antal kunder (t.ex. en tyst kundgrupp) före en deadline, föreslå en plan med goal_type "contact" och goal_count (INTE goal_kr/goal_hours) i propose_mission_plan/confirm_mission — segmentet (vilka kunder) bestäms av valda plansteg ur portföljen, både SMS och mejl räknas som kontakt.]')
  for (const cls of TRUTH_CLASSES) {
    const items = portfolio.by_class[cls]
    if (items.length === 0) continue
    const rader = items.map(it => `${it.id} '${it.title}' ${formatPortfolioMeasure(it.measure)}`).join(' | ')
    lines.push(`${TRUTH_CLASS_LABELS[cls]}: ${rader}`)
  }
  if (portfolio.degraded_sources.length > 0) {
    lines.push(`[Källor som inte kunde läsas: ${portfolio.degraded_sources.join(', ')}]`)
  }
  return lines.join('\n')
}

function buildActiveMissionContextSection(mission: {
  id: string
  goal_kr: number | null
  deadline: string
  goal_type?: string | null
  goal_hours?: number | null
  goal_count?: number | null
}): string {
  const deadline = String(mission.deadline).slice(0, 10)
  const goalType = resolveGoalType(mission.goal_type)
  const headline = buildMissionHeadline(
    Number(mission.goal_kr) || 0,
    deadline,
    goalType === 'capacity'
      ? { goalType, goalHours: mission.goal_hours ?? undefined }
      : goalType === 'contact'
        ? { goalType, goalCount: mission.goal_count ?? undefined }
        : undefined,
  )
  return `[AKTIVT UPPDRAG: ${headline}, deadline ${deadline}, mission_id ${mission.id}. Nya åtgärdskort för uppdraget ska bära payload.mission_id och payload.truth_class. Bara ETT uppdrag kan vara aktivt åt gången — föreslå aldrig ett nytt förrän det här är avslutat.]`
}

// ────────────────────────────────────────────────────────────────────────────
// Tool definitions — Tier 1 + send_invoice_reminder
// ────────────────────────────────────────────────────────────────────────────

// Kurerad delmängd av de DELADE verktygen (agent/trigger/tool-definitions) —
// samma ENDA auditerade implementation som den autonoma agenten kör, så de kan
// aldrig driva isär. Uteslutna: rent autonoma (trigger_fortnox_sync,
// log/get_automation_*), trasiga update_business_preference, och agent-messaging
// (chatten använder handoff_to_agent istället).
const CURATED_TOOL_NAMES = [
  'get_customer', 'search_customers', 'create_customer', 'update_customer',
  'create_quote', 'get_quotes', 'create_invoice',
  'check_calendar', 'create_booking', 'update_project', 'log_time',
  'send_sms', 'send_email', 'read_customer_emails',
  'qualify_lead', 'update_lead_status', 'get_lead', 'search_leads',
  'get_daily_stats', 'create_approval_request', 'check_pending_approvals',
  'get_project_profitability', 'get_pricing_suggestion', 'check_fortnox_status',
  'simulate_business_scenario',
  // Compliance-underlaget V1 — läsande "vad sades när?"-logg per kund.
  'get_communication_trail',
  'get_efterkalkyl_insight', 'run_customer_base_sweep', 'book_site_visit',
  // R5 (tasks/resurs-masterplan.md) — persondagen/beläggning per person.
  'get_person_schedule',
  // Command Center — read-only översiktsverktyg (Matte).
  'get_projects_overview', 'get_stale_quotes', 'get_invoiceable_work', 'get_customer_commitments',
  // Etapp O — Evidence-to-Payment readiness (Matte-scopat, se personalities.ts:
  // ingen specialist listar verktyget i sin allowedTools-array).
  'get_project_commercial_readiness',
  // Goal-to-Plan V1 (Etapp B) — Matte-scopat (se isToolAllowedForAgent/
  // getAgentTools nedan; ingen specialist listar dem i personalities.ts).
  'propose_mission_plan', 'confirm_mission',
  // Support-agenten (2026-08-21) — se lib/agent/capabilities.ts 'support'.
  'get_account_billing_status', 'escalate_to_handymate_team',
]

// ═══ PER-AGENT ALLOWLIST (Codex audit P0.2, 2026-08-08) ═══
//
// Trigger-routen har alltid upprätthållit agenternas verktygsgränser
// (lib/agents/personalities.ts). Chatten gav ALLA agenter samma lista —
// specialistens namn påverkade prompten men inte vad den faktiskt kunde
// köra. En handoff till Lisa kunde alltså skapa fakturor.
//
// Gränsen sitter nu på två ställen: listan som ges till modellen filtreras
// per agent, OCH varje exekvering verifieras igen — en hallucinerad
// tool_use förbi listan nekas server-side. Prompten är aldrig gränsen.

/** Rena koordinationsverktyg — inget skrivrisk, alla agenter får dem. */
const UNIVERSAL_COORDINATION_TOOLS = new Set([
  'navigate',
  'handoff_to_agent',
])

/**
 * Godkännandeköns verktyg — alla agenter FÖRUTOM support, vars hela design
 * bygger på att ALDRIG skriva till pending_approvals (den kön är
 * hantverkarens egen, se app/dashboard/approvals/page.tsx). Utan detta
 * undantag skulle support få tillgång till create_approval_request/
 * check_pending_approvals via den här koordinationsvägen trots att
 * personalities.ts medvetet utelämnar dem ur support.allowedTools.
 */
const APPROVAL_COORDINATION_TOOLS = new Set([
  'create_approval_request',
  'check_pending_approvals',
])

function isToolAllowedForAgent(agent: AgentId, toolName: string): boolean {
  if (UNIVERSAL_COORDINATION_TOOLS.has(toolName)) return true
  if (APPROVAL_COORDINATION_TOOLS.has(toolName) && agent !== 'support') return true
  const allowed = getAgentTools(agent)
  if (allowed === 'all') return true
  return allowed.includes(toolName)
}

function toolsForAgent(agent: AgentId): any[] {
  return TOOLS.filter(t => isToolAllowedForAgent(agent, t.name))
}

const TOOLS: any[] = [
  ...filterTools(CURATED_TOOL_NAMES),
  {
    name: 'navigate',
    description: 'Navigerar användaren till en specifik sida. Använd när hantverkaren vill öppna en sida eller när det är naturligt efter en action.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'URL-path t.ex. /dashboard/quotes, /dashboard/invoices, /dashboard/customers' },
        reason: { type: 'string', description: 'Kort förklaring varför vi navigerar dit' },
      },
      required: ['path'],
    },
  },
  {
    name: 'handoff_to_agent',
    description: 'Lämna över konversationen till en annan agent när frågan ligger utanför ditt expertområde. Den nya agenten svarar i samma response — användaren ser hela kedjan. Använd ENDAST när en specialist är klart bättre lämpad. Avbryt allt annat när du gör handoff.',
    input_schema: {
      type: 'object',
      properties: {
        target_agent: {
          type: 'string',
          description: 'Vilken agent som ska ta över: matte | lars | karin | daniel | hanna | lisa | support',
          enum: ['matte', 'lars', 'karin', 'daniel', 'hanna', 'lisa', 'support'],
        },
        reason: {
          type: 'string',
          description: 'Kort förklaring varför du lämnar över (t.ex. "pris-detaljer ligger i Karins område")',
        },
        context_for_next_agent: {
          type: 'string',
          description: 'Sammanfattning av vad som diskuterats hittills så nästa agent kan svara direkt utan att fråga om.',
        },
      },
      required: ['target_agent', 'reason', 'context_for_next_agent'],
    },
  },
]

// ────────────────────────────────────────────────────────────────────────────
// Tool execution
// ────────────────────────────────────────────────────────────────────────────

function formatPhone(phone: string): string {
  const cleaned = phone.replace(/[\s-]/g, '')
  if (cleaned.startsWith('+')) return cleaned
  if (cleaned.startsWith('0')) return '+46' + cleaned.slice(1)
  return '+46' + cleaned
}

interface ToolResult {
  result: string
  action?: { type: string; target?: string; approval_id?: string }
}

/**
 * @deprecated EJ längre anropad. Verktygsexekveringen går nu genom den delade
 * tool-router:n (executeSharedTool) — denna lokala kopia (med dess gamla
 * send_sms/create_approval/send_invoice_reminder) ersattes i hopslagning Stage 1.
 * Behålls tillfälligt; tas bort i städning (Stage 3).
 */
async function executeTool(
  toolName: string,
  toolInput: Record<string, any>,
  businessId: string,
  userCookie: string | null
): Promise<ToolResult> {
  const supabase = getServerSupabase()

  switch (toolName) {
    case 'send_sms': {
      const { phone, message, customer_name } = toolInput

      // ═══ GENOM STRYPUNKTEN (etapp 0 batch 4, 2026-08-08) ═══
      //
      // Det här är den SISTA vägen ut ur huset, och den ligger redan bakom
      // bekräftelsekortet (require_confirm_external + signerad token) — men
      // det räcket gatar om hantverkaren sett texten, inte om kunden vill ha
      // SMS över huvud taget. Opt-out saknades alltså även här.
      //
      // Den lokala sms_log-insert:en tas bort; helpern skriver den, och
      // skriver även vid misslyckande (den gamla loggade alltid 'sent').
      // formatPhone ersätts av helperns normalizeSwedishPhone.
      const { data: biz } = await supabase
        .from('business_config')
        .select('business_name')
        .eq('business_id', businessId)
        .single()

      const { sendSmsViaElks } = await import('@/lib/sms-send')
      const r = await sendSmsViaElks({
        supabase,
        businessId,
        businessName: biz?.business_name,
        to: String(phone),
        message: String(message),
        messageType: 'matte_chat',
        recipient: 'customer',
        purpose: 'conversational',
      })

      if (!r.success) {
        console.error('[matte/chat] SMS misslyckades:', r.error)
        // Matte får ALDRIG säga "skickat" när inget skickades — samma
        // ärlighetsregel som orkestreringens statusspråk.
        return { result: `SMS-sändning misslyckades: ${r.error || 'okänt fel'}` }
      }

      return { result: `SMS skickat till ${customer_name}.` }
    }

    case 'create_approval': {
      const { type, title, description, payload } = toolInput
      const id = 'appr_' + Math.random().toString(36).substring(2, 14)
      const { error } = await supabase.from('pending_approvals').insert({
        id,
        business_id: businessId,
        approval_type: String(type),
        title: String(title),
        description: description ? String(description) : null,
        payload: payload || {},
        status: 'pending',
        risk_level: 'medium',
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      })

      if (error) {
        console.error('[matte/chat] approval insert error:', error)
        return { result: `Kunde inte skapa godkännandet: ${error.message}` }
      }

      return {
        result: `Godkännande skapat: "${title}". Det väntar på dig under Godkännanden.`,
        action: { type: 'approval_created', approval_id: id },
      }
    }

    case 'send_invoice_reminder': {
      const { invoice_id, invoice_number } = toolInput
      // Forwarda användarens cookie så getAuthenticatedBusiness fungerar
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (userCookie) headers['Cookie'] = userCookie

      const response = await fetch(`${APP_URL}/api/invoices/${invoice_id}/reminder`, {
        method: 'POST',
        headers,
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error('[matte/chat] reminder error:', errText)
        return { result: `Kunde inte skicka påminnelse för ${invoice_number}.` }
      }

      return { result: `Påminnelse skickad för faktura ${invoice_number}.` }
    }

    case 'navigate': {
      const { path, reason } = toolInput
      return {
        result: reason ? String(reason) : `Navigerar till ${path}`,
        action: { type: 'navigate', target: String(path) },
      }
    }

    case 'create_quote_draft': {
      const { customer_id, title } = toolInput
      // Kanoniska byggaren — Mattes utkast fick tidigare varken nummer eller
      // sign_token, så det var osynligt i listor och gick inte att länka.
      const skapad = await createQuote(supabase, businessId, {
        customerId: (customer_id as string) || null,
        title: String(title),
        source: 'matte',
      })

      if (!skapad.success) {
        console.error('[matte/chat] quote draft error:', skapad.error)
        return { result: `Kunde inte skapa offert-utkastet: ${skapad.error}` }
      }

      return {
        result: `Offert-utkast ${skapad.quoteNumber} skapat. Öppnar redigeringsvyn.`,
        action: { type: 'navigate', target: `/dashboard/quotes/${skapad.quoteId}/edit` },
      }
    }

    default:
      return { result: `Okänt verktyg: ${toolName}` }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Anthropic API helpers — raw fetch
// ────────────────────────────────────────────────────────────────────────────

async function callClaude(opts: {
  apiKey: string
  system: any[]
  messages: any[]
  /** Agentens filtrerade verktygslista — prompten är aldrig gränsen. */
  tools?: any[]
}): Promise<any> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: opts.system,
      tools: opts.tools ?? TOOLS,
      messages: opts.messages,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic ${res.status}: ${err}`)
  }
  return res.json()
}

// ────────────────────────────────────────────────────────────────────────────
// Agent system-prompt — byggs per agent baserat på capabilities
// ────────────────────────────────────────────────────────────────────────────

function buildAgentSystemPrompt(
  agent: AgentId,
  userName: string,
  businessName: string,
  hasImages: boolean
): string {
  const cap = AGENT_CAPABILITIES[agent]
  if (!cap) return ''

  const expertise = cap.expertise.map(e => `- ${e}`).join('\n')
  const outOfScope = cap.out_of_scope.map(e => `- ${e}`).join('\n')

  // Bild-instruktioner — bara Daniel får detaljerade riktlinjer (han äger
  // bildanalys för offert-underlag). Andra agenter får en kort note om bilder
  // finns så de inte ignorerar dem.
  let imageBlock = ''
  if (hasImages) {
    if (agent === 'daniel') {
      imageBlock = `

DU SER BILDER I MEDDELANDET — analysera dem för:
- Storlek/yta (om mätbart eller uppskattningsbart)
- Material och kondition
- Synliga problem eller utmaningar
- Vad som behöver göras

När du gör en offert eller uppskattning baserat på bilder — var transparent om vad du ser och vad du gissar. Ange osäkerhet ("ser ut att vara ca 6-8 m²"). Om bilden är för otydlig: be om en kompletterande bild eller mått från hantverkaren.`
    } else {
      imageBlock = `

OBS: Användaren har bifogat bild(er). Du kan se dem men din specialitet är inte bildanalys för offert. Om frågan kräver detaljerad analys av storlek/material/skick — gör handoff till Daniel.`
    }
  }

  return `Du är ${cap.name}, AI-assistent i Handymate-teamet hos ${businessName}. Du pratar med hantverkaren ${userName}. Svara kort och konkret på svenska, max 2-3 meningar per svar.

DITT EXPERTOMRÅDE: ${cap.domain}

VAD DU ÄR EXPERT PÅ:
${expertise}

SKICKA VIDARE TILL ANDRA AGENTER NÄR:
${outOfScope}

VID HANDOFF: Var transparent men kort. Använd handoff_to_agent-verktyget — säg inte "Hej, jag är X" till användaren, det säger nästa agent. Skriv en kort context_for_next_agent så nästa agent kan svara direkt utan att fråga om.

ÄRENDEN SOM RÖR FLERA OMRÅDEN: gör klart DIN del först, lämna sedan över till nästa specialist för deras del. Ärendet får passera högst tre specialister, och du får bara komma in en gång — planera därför din del färdigt innan du lämnar. Matte sammanfattar för hantverkaren till sist, så du behöver inte upprepa vad andra gjort. Påstå ALDRIG att något är gjort som du inte själv utfört med ett verktyg; blev det fel, säg det rakt.

VAD HÄNDER OM: använd simulate_business_scenario för kontrafaktiska frågor om projektmarginal, sena kundbetalningar eller omsättningstakt. Återge verktygets resultat och antaganden; räkna aldrig om eller komplettera siffrorna själv. Ett blockerat scenario är ett ärligt svar — gissa inte saknade värden.

VAD SADES NÄR: använd get_communication_trail vid tvister eller frågor om vad som sagts med en kund — det är den faktiska loggen över SMS, e-post, portal, samtal, platsbesök, webbchatt och offertöppningar. Citera loggen, dikta aldrig. Om sources_with_errors inte är tom: säg att underlaget är ofullständigt. Hänvisa till kundkortets "Ladda ner kommunikationsunderlag" för den fullständiga exporten.

Du har tillgång till verktyg för kunder, offerter (skapa riktiga offerter med ROT/RUT), fakturor, bokningar, kalender, tidrapporter, leads, SMS, e-post och navigering. Använd dem för att faktiskt UTFÖRA det hantverkaren ber om — men bara inom ditt expertområde.${imageBlock}

Var vänlig, professionell och effektiv. Använd du-tilltal.`
}

// ────────────────────────────────────────────────────────────────────────────
// POST handler
// ────────────────────────────────────────────────────────────────────────────

interface AgentTurnResult {
  text: string
  action: any
  /** Satt om Claude använde handoff_to_agent — hanteras i outer loop */
  handoff: { target_agent: string; reason: string; context_for_next_agent: string } | null
  /**
   * Fas 0-säkerhetsräcke: satt om Claude anropade ett verktyg som lämnar
   * huset (send_sms/send_email) medan require_confirm_external=true. Verktyget
   * har INTE exekverats — outer loop stannar och ber om explicit bekräftelse.
   */
  pendingExternal: { toolName: string; toolInput: Record<string, unknown> } | null
  /**
   * Epic 2: vad verktygen FAKTISKT gjorde under turen. Grunden för stegets
   * status — utan den härleds "klart" ur modellens egen text, vilket är
   * precis den part som kan ha fel om saken.
   */
  toolOutcomes: ToolOutcome[]
  /** Strukturerat, läsande scenario ELLER en uppdragsplan (Etapp B) som
      chattytorna kan visa. */
  presentation: BusinessScenarioPresentation | MissionPlanPresentation | null
  /** Ackumulerad usage över ALLA callClaude-anrop i denna tur (initial +
      varje tool-iteration) — grunden för COGS-mätningen (etapp 1, 2026-08-14). */
  usage: TokenUsage
}

/**
 * Kör en Claude-runda för en specifik agent. Inkluderar tool-loop och
 * upptäcker handoff_to_agent-anrop (som signalerar att outer loop ska byta
 * agent). Om handoff används avbryter vi tool-loopen och returnerar handoff:en
 * — vi skickar inget tool_result tillbaka till modellen för det anropet.
 *
 * requireConfirmExternal: om satt gatas send_sms/send_email — anropet
 * exekveras INTE här, utan turen avbryts och pendingExternal returneras (se
 * ovan). Precis som handoff skickar vi inget tool_result för det anropet;
 * turen är slut och väntar på klientens bekräftelse.
 */
async function runAgentTurn(opts: {
  apiKey: string
  agent: AgentId
  systemArray: any[]
  initialMessages: any[]
  businessId: string
  supabase: ReturnType<typeof getServerSupabase>
  toolContext: ToolContext
  requireConfirmExternal: boolean
  /** Ägar-/admin-grinden för Mission Control (Andreas fynd 2026-08-18):
      false ⇒ mission-verktygen tas bort ur listan (modellen ser dem aldrig)
      OCH exekveringen vägrar (djupförsvar nedan). */
  missionToolsAllowed: boolean
}): Promise<AgentTurnResult> {
  const MAX_TOOL_ITERATIONS = 5
  const MISSION_TOOL_NAMES = new Set(['propose_mission_plan', 'confirm_mission'])
  // Agentens allowlist låses för hela turen — byts agenten sker det via en
  // NY runAgentTurn efter handoff, med den nya agentens lista.
  const agentTools = toolsForAgent(opts.agent).filter(
    t => opts.missionToolsAllowed || !MISSION_TOOL_NAMES.has(t.name),
  )
  let response = await callClaude({
    apiKey: opts.apiKey,
    system: opts.systemArray,
    messages: opts.initialMessages,
    tools: agentTools,
  })

  // Ackumulerad usage — se AgentTurnResult.usage för varför.
  const usage: TokenUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  }
  const ackumulera = (u: any) => {
    usage.input_tokens = (usage.input_tokens || 0) + (u?.input_tokens || 0)
    usage.output_tokens = (usage.output_tokens || 0) + (u?.output_tokens || 0)
    usage.cache_creation_input_tokens = (usage.cache_creation_input_tokens || 0) + (u?.cache_creation_input_tokens || 0)
    usage.cache_read_input_tokens = (usage.cache_read_input_tokens || 0) + (u?.cache_read_input_tokens || 0)
  }
  ackumulera(response.usage)

  const toolMessages: any[] = []
  const toolOutcomes: ToolOutcome[] = []
  let presentation: BusinessScenarioPresentation | MissionPlanPresentation | null = null
  let finalAction: any = null
  let iterations = 0

  while (response.stop_reason === 'tool_use' && iterations < MAX_TOOL_ITERATIONS) {
    iterations++
    const toolUseBlocks = (response.content || []).filter((b: any) => b.type === 'tool_use')

    // Hitta handoff-anrop FÖRST — det avbryter allt annat
    const handoffBlock = toolUseBlocks.find((b: any) => b.name === 'handoff_to_agent')
    if (handoffBlock) {
      const text = (response.content || [])
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('\n')
        .trim()
      return {
        text,
        action: finalAction,
        handoff: {
          target_agent: String(handoffBlock.input?.target_agent || ''),
          reason: String(handoffBlock.input?.reason || ''),
          context_for_next_agent: String(handoffBlock.input?.context_for_next_agent || ''),
        },
        pendingExternal: null,
        toolOutcomes,
        presentation,
        usage,
      }
    }

    // Säkerhetsräcke: om require_confirm_external är satt och Claude vill
    // anropa ett verktyg som skickar något UT ur huset (SMS/e-post) — stanna
    // HELA turen här. Inget verktyg i den här batchen exekveras (varken det
    // externa eller ev. interna i samma svar), och inget tool_result skickas
    // tillbaka till modellen. Klienten får en pending_confirmation och måste
    // svara med en explicit bekräftelse innan exakt detta anrop körs.
    if (opts.requireConfirmExternal) {
      const gatedBlock = toolUseBlocks.find((b: any) => isConfirmGatedTool(b.name))
      if (gatedBlock) {
        const text = (response.content || [])
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n')
          .trim()
        return {
          text,
          action: finalAction,
          handoff: null,
          pendingExternal: { toolName: gatedBlock.name, toolInput: gatedBlock.input || {} },
          toolOutcomes,
          presentation,
          usage,
        }
      }
    }

    // navigate är ett rent UI-verktyg (ingen server-effekt). Allt annat går genom
    // den DELADE tool-router:n — samma auditerade implementation som den autonoma
    // agenten, mot supabase/lib direkt (inga interna HTTP-anrop → ingen auth-
    // forward behövs, B2-klassen försvinner).
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block: any) => {
        if (block.name === 'navigate') {
          finalAction = { type: 'navigate', target: block.input?.path || '' }
          return { type: 'tool_result', tool_use_id: block.id, content: `Navigerar till ${block.input?.path || ''}` }
        }
        // Andra halvan av allowlisten: även om modellen hallucinerar ett
        // verktyg utanför sin filtrerade lista nekas exekveringen här.
        // Listan till modellen är UX; det här är gränsen.
        if (!isToolAllowedForAgent(opts.agent, block.name)) {
          console.warn(`[matte/chat] agent ${opts.agent} nekades verktyget ${block.name}`)
          toolOutcomes.push({ tool: block.name, ok: false, error: `${block.name} ligger utanför agentens område` })
          return {
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Fel: ${block.name} ligger utanför ${opts.agent}s område. Lämna över till rätt specialist i stället.`,
          }
        }
        // Mission Control-grindens andra halva (Andreas fynd 2026-08-18):
        // även om ett mission-verktyg hallucineras nekas det här för roller
        // utan ägar-/admin-behörighet — listan till modellen är UX, det här
        // är gränsen (samma tvåhalvsmönster som agent-allowlisten ovan).
        if (!opts.missionToolsAllowed && MISSION_TOOL_NAMES.has(block.name)) {
          toolOutcomes.push({ tool: block.name, ok: false, error: 'mission-verktyg kräver ägare/administratör' })
          return {
            type: 'tool_result',
            tool_use_id: block.id,
            content: 'Endast ägare och administratör kan skapa eller bekräfta uppdrag.',
          }
        }
        const r: any = await executeSharedTool(block.name, block.input || {}, opts.supabase, opts.businessId, opts.toolContext as any)
        if (block.name === 'simulate_business_scenario') {
          const candidate = { kind: 'business_scenario', scenario: r?.data }
          if (isBusinessScenarioPresentation(candidate)) presentation = candidate
        }
        // Goal-to-Plan V1 (Etapp B) — samma mekanism som business_scenario
        // ovan: verktygets data bär en typad presentation som går vidare
        // till thread_message.metadata (se saveThreadMessage-anropen nedan).
        if (block.name === 'propose_mission_plan' || block.name === 'confirm_mission') {
          const candidate = (r?.data as { presentation?: unknown } | undefined)?.presentation
          if (isMissionPlanPresentation(candidate)) presentation = candidate
        }
        // Epic 2: bokför utfallet som routern rapporterade det. Ett verktyg
        // som la något i godkännandekön är INTE verkställt — den skillnaden
        // är hela poängen med statusen längre upp.
        const lyckades = !r?.error && r?.success !== false
        toolOutcomes.push({
          tool: block.name,
          ok: lyckades,
          ...(r?.error ? { error: String(r.error) } : {}),
          ...(lyckades && block.name === 'create_approval_request' ? { awaitingApproval: true } : {}),
        })
        const content = r?.error ? `Fel: ${r.error}` : JSON.stringify(r?.data ?? r)
        return { type: 'tool_result', tool_use_id: block.id, content }
      })
    )

    toolMessages.push(
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults }
    )
    const trimmed = toolMessages.slice(-4)

    response = await callClaude({
      apiKey: opts.apiKey,
      system: opts.systemArray,
      messages: [...opts.initialMessages, ...trimmed],
      tools: agentTools,
    })
    ackumulera(response.usage)
  }

  const finalText = (response.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .trim()

  return { text: finalText, action: finalAction, handoff: null, pendingExternal: null, toolOutcomes, presentation, usage }
}

/**
 * Kör den EXAKTA åtgärden som stod på ett tidigare pending_confirmation-kort,
 * och bara den. Ingen ny Claude-runda — token:en signerades server-side i
 * förra svaret och bär redan verktygsnamn + exakta argument, så klienten kan
 * inte byta ut vad som faktiskt skickas. Går genom samma delade tool-router
 * som resten av Matte, så t.ex. SMS-nattspärren i sendSms gäller precis som
 * vanligt — det här ÄR den enda exekveringen, ingen dubbelgating.
 */
async function handleConfirmedExternalAction(
  request: NextRequest,
  businessId: string,
  token: string
): Promise<NextResponse> {
  const pending = verifyPendingExternalAction(token, businessId)
  if (!pending) {
    return NextResponse.json(
      { error: 'Bekräftelsen har gått ut eller är ogiltig — försök igen från chatten.' },
      { status: 400 }
    )
  }

  const supabase = getServerSupabase()
  const bizCtx = await fetchBusinessContext(supabase, businessId, 'user')
  // Identiteten följer med även i bekräftelsevägen (Matte Mobile Voice V1):
  // ett bekräftat log_time ska attribueras till den som tryckte på knappen,
  // inte tappa användaren för att exekveringen sker i en senare request.
  const currentBusinessUser = await getCurrentUser(request, businessId)
  const toolContext: ToolContext = {
    ...(bizCtx?.toolContext ?? {
      businessName: '',
      contactEmail: '',
      googleConnection: null,
      triggerSource: 'user' as const,
    }),
    businessUserId: currentBusinessUser?.id ?? null,
  }

  const result: any = await executeSharedTool(pending.toolName, pending.toolInput, supabase, businessId, toolContext as any)
  const summary = buildExternalActionSummary(pending.toolName, pending.toolInput)
  const replyText = result?.success
    ? ((result?.data?.message as string | undefined) || `${summary} — klart.`)
    : `Kunde inte utföra åtgärden: ${result?.error || 'okänt fel'}`

  if (pending.threadId) {
    saveThreadMessage({
      threadId: pending.threadId,
      businessId,
      role: 'assistant',
      agent: (pending.agent as AgentId) || 'matte',
      content: replyText,
    }).catch(() => {})
    touchThread(pending.threadId).catch(() => {})
  }

  return NextResponse.json({
    messages: [{ agent: pending.agent, content: replyText }],
    current_agent: pending.agent,
    thread_id: pending.threadId,
    reply: replyText,
    action: null,
    confirmed: true,
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Auth: härled businessId från token (Bearer/cookie) — lita ALDRIG på
    // context.businessId från bodyn (annars korstenant-läcka: vem som helst
    // kunde läsa/agera mot valfritt företag). Mobilen autentiserar med Bearer.
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Bekräftelse-väg (Fas 0-säkerhetsräcke) ───────────────────────────
    // Klienten skickar tillbaka den signerade token:en från ett tidigare
    // pending_confirmation-svar när hantverkaren tryckt [Skicka]. Ingen
    // Claude-inblandning här alls — se handleConfirmedExternalAction.
    if (body?.confirm?.token) {
      return await handleConfirmedExternalAction(request, business.business_id, String(body.confirm.token))
    }

    const { messages, context, images: rawImages, require_confirm_external } = body

    if (!messages || !Array.isArray(messages)) {
      console.error('[matte/chat] 400:', { reason: 'messages krävs', body })
      return NextResponse.json({ error: 'messages krävs' }, { status: 400 })
    }

    // Fas 0-säkerhetsräcke: default FALSE så mobilappen (som anropar den här
    // routen utan parametern) är helt opåverkad. Dashboard-bubblan sätter
    // TRUE. Strikt === true — en trunkig/sanningsvärde-liknande sträng ska
    // INTE räknas som påslaget.
    const requireConfirmExternal = require_confirm_external === true

    const userName = context?.userName || 'hantverkaren'
    const businessName = context?.businessName || 'företaget'
    const businessId = business.business_id
    // Optionella thread-params — bakåtkompat: utan dessa beter sig endpoint
    // som tidigare (Matte tar varje meddelande, ingen thread skapas).
    // Sanerade här; ägarskapsverifieras mot tenanten nedan (efter
    // bränslegrinden) innan de används till trådval eller systemprompt.
    const rawCustomerId: string | null = safeContextId(context?.customerId)
    const rawProjectId: string | null = safeContextId(context?.projectId)
    const explicitThreadId: string | null = context?.threadId || null

    // ── Bilder: normalisera + validera ─────────────────────────────────
    // Klienten kan skicka antingen array av strängar (base64) eller array
    // av objekt { url?, base64?, media_type? }. Vi normaliserar till
    // ThreadImage[]. Cap vid 4 bilder per meddelande, 5 MB var.
    const images: ThreadImage[] = []
    if (Array.isArray(rawImages)) {
      const candidates = rawImages.slice(0, MAX_IMAGES_PER_MESSAGE)
      for (const raw of candidates) {
        if (!raw) continue
        if (typeof raw === 'string') {
          // Räkna ut base64-storlek: bytes ≈ length * 0.75
          if (raw.length * 0.75 > MAX_IMAGE_BYTES) continue
          images.push({ base64: raw, media_type: 'image/jpeg' })
        } else if (typeof raw === 'object') {
          const item: ThreadImage = {
            url: typeof raw.url === 'string' ? raw.url : undefined,
            base64: typeof raw.base64 === 'string' ? raw.base64 : undefined,
            media_type: typeof raw.media_type === 'string' ? raw.media_type : 'image/jpeg',
            size_bytes: typeof raw.size_bytes === 'number' ? raw.size_bytes : undefined,
          }
          // Validera storlek om vi har base64 eller size_bytes
          if (item.base64 && item.base64.length * 0.75 > MAX_IMAGE_BYTES) continue
          if (item.size_bytes && item.size_bytes > MAX_IMAGE_BYTES) continue
          if (!item.url && !item.base64) continue
          images.push(item)
        }
      }
    }
    const hasImages = images.length > 0

    if (!businessId) {
      console.error('[matte/chat] 400:', { reason: 'businessId saknas i context', body })
      return NextResponse.json(
        { error: 'businessId saknas i context — kan inte ladda affärsdata' },
        { status: 400 }
      )
    }

    // Bränsle är ett verkligt periodtak för NYTT AI-arbete. Bekräftelsevägen
    // ovan innehåller ingen ny Claude-runda och går därför vidare till
    // respektive verktygs egen strypunkt (SMS har sin grind i sms-send).
    // Vanlig chatt stoppas däremot här FÖRE trådskapande, kontextladdning och
    // första modellanrop. Ett läsfel failar stängt — inga tokens i blindo.
    const supabase = getServerSupabase()
    const fuel = await checkFuelGate(supabase, businessId)
    if (!fuel.allowed) {
      const reply = fuel.reason === 'fuel_exhausted'
        ? 'Bränslet är slut, så teamet har pausat nytt arbete. En ägare eller administratör kan välja påfyllning under Inställningar → Abonnemang.'
        : 'Jag kunde inte verifiera Bränslenivån just nu, så teamet väntar hellre än att förbruka något i blindo. Försök igen om en stund.'
      return NextResponse.json({
        reply,
        messages: [{ agent: 'matte', content: reply }],
        current_agent: 'matte',
        fuel_stopped: true,
        fuel_reason: fuel.reason,
        fuel_remaining_percent: fuel.level?.remainingPercent,
      })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        reply: 'Hej! Jag är Matte, din AI-assistent. Just nu kan jag inte svara — be din admin kontrollera API-inställningarna.',
      })
    }

    // Serverägd sidkontext: bara ID:n som bevisligen tillhör tenanten går
    // vidare — se verifyPageContextOwnership ovan.
    const sidkontext = await verifyPageContextOwnership(supabase, businessId, {
      customerId: rawCustomerId,
      projectId: rawProjectId,
      quoteId: safeContextId(context?.quoteId),
      invoiceId: safeContextId(context?.invoiceId),
    })
    const customerId = sidkontext.customerId
    const projectId = sidkontext.projectId

    // Verktygskontext för de delade tool-router-verktygen (samma som den
    // autonoma agenten) — ger bl.a. Google-koppling för kalender/bokning.
    // TD-52: detta är en levande dashboard-/mobil-chatt (session-auth ovan
    // via getAuthenticatedBusiness) — triggerSource är alltid 'user'.
    const bizCtx = await fetchBusinessContext(supabase, businessId, 'user')
    // Etapp D-härdning: business_users.id för den inloggade — trådas in i
    // ToolContext så confirm_mission kan skriva ett riktigt created_by i
    // stället för alltid NULL (se lib/agent/agents/shared.ts ToolContext).
    const currentBusinessUser = await getCurrentUser(request, businessId)
    // Mission Control är ägar-/admin-låst (Andreas fynd 2026-08-18): samma
    // grind som mission-rutterna (Etapp D). Utan behörighet: inget
    // portföljblock (det bär fakturabelopp) och inga mission-verktyg —
    // chatten i övrigt orörd. Dubbelgrind: verktygslistan filtreras OCH
    // exekveringen vägrar (djupförsvar, samma filosofi som external-actor).
    const missionBehorig = currentBusinessUser != null && isOwnerOrAdmin(currentBusinessUser)
    const toolContext: ToolContext = {
      ...(bizCtx?.toolContext ?? {
        businessName,
        contactEmail: '',
        googleConnection: null,
        triggerSource: 'user',
      }),
      businessUserId: currentBusinessUser?.id ?? null,
    }

    // ── Thread-state ────────────────────────────────────────────────────
    // EN tråd per konversation — ALLTID, även allmän chatt utan kund/projekt,
    // så historiken persisteras och syns i webbens lista (gemensam historik
    // webb+mobil). explicitThreadId → fortsätt den tråden; annars kund/projekt-
    // tråd; annars en ny allmän tråd (getOrCreateThread skapar ny vid tom kontext).
    let thread: Awaited<ReturnType<typeof getOrCreateThread>> | null = null
    try {
      thread = await getOrCreateThread({ businessId, customerId, projectId, threadId: explicitThreadId })
    } catch (err) {
      console.error('[matte/chat] thread fetch/create failed (non-blocking):', err)
    }
    let currentAgent: AgentId = (thread?.current_agent_id as AgentId) || 'matte'
    // Support-agenten (escalate_to_handymate_team): tråden finns först nu,
    // efter getOrCreateThread ovan — samma ställe som businessUserId sätts
    // hade inte tråden ännu. support_ticket.thread_id är NOT NULL, så
    // verktyget vägrar utan detta om trådskapandet skulle misslyckas.
    toolContext.threadId = thread?.id ?? null

    // ── Auto-routing: bilder + Matte → Daniel ───────────────────────────
    // Om användaren bifogar bild(er) och vi är hos Matte (default agent)
    // hoppar vi direkt till Daniel som äger bildanalys för offert-underlag.
    // Detta hoppar inte över specialist-konversationer — om current redan
    // är t.ex. Lars eller Karin, lämnas det ifred (de kan själva delegera).
    if (thread && hasImages && currentAgent === 'matte') {
      try {
        const auto = await executeHandoff({
          thread,
          fromAgent: 'matte',
          toAgent: 'daniel',
          reason: 'användaren bifogade bild(er) för analys',
          contextSummary: 'Bilder bifogade — Daniel tar över för bildanalys.',
        })
        if (auto.ok) {
          currentAgent = 'daniel'
          thread.current_agent_id = 'daniel'
        }
      } catch (err) {
        console.error('[matte/chat] auto-route to Daniel failed (non-blocking):', err)
      }
    }

    // Hämta verklig affärsdata (non-blocking)
    let contextSection = ''
    try {
      const bizContext = await getBusinessContext(businessId)
      contextSection = buildContextSection(bizContext)
    } catch (err) {
      console.error('[matte/chat] Failed to load business context:', err)
      contextSection = `AKTUELL AFFÄRSSTATUS (${new Date().toLocaleDateString('sv-SE')}): kunde inte laddas just nu.`
    }

    // ── Multi-turn historik ─────────────────────────────────────────────
    // Med thread: ladda persisterade meddelanden från DB (senaste 20) och
    // använd som conversation-historik till Claude. Sammanfatta äldre
    // meddelanden om token-budgeten överskrids.
    // Utan thread: fall tillbaka till payload-historiken (legacy mode).
    // content kan vara string ELLER content-blocks-array (för multimodal).
    type ChatMessage = { role: 'user' | 'assistant'; content: any }
    let initialMessages: ChatMessage[]
    let historySummary: string | null = thread?.context_summary || null

    // Senaste user-meddelandet — det vi ska svara på och spara
    const lastUserMessage = messages
      .slice()
      .reverse()
      .find((m: { role: string; content: string }) => m.role === 'user')
    const newUserText: string = lastUserMessage?.content || ''

    if (thread) {
      const persisted = await loadThreadMessages(thread.id, { limit: 20 })

      // Token-management: om historik är för lång, sammanfatta äldre delar
      if (persisted.length > 0) {
        const { summary, kept } = await summarizeIfNeeded({
          threadId: thread.id,
          businessId,
          rows: persisted,
          apiKey,
        })
        if (summary) historySummary = summary
        initialMessages = toClaudeMessages(kept)
      } else {
        initialMessages = []
      }

      // Lägg till det nya user-meddelandet sist. Med bilder bygger vi
      // ett multimodal content-block (bilder + text). Utan bilder är det
      // bara strängen. Dedup-skydd: om sista raden redan är samma user-
      // text utan bilder, undvik duplicate vid re-submit.
      if (newUserText || hasImages) {
        const lastInitial = initialMessages[initialMessages.length - 1]
        const isDup = !hasImages
          && lastInitial
          && lastInitial.role === 'user'
          && lastInitial.content === newUserText
        if (!isDup) {
          const userContent = hasImages
            ? buildUserContentWithImages(newUserText || '', images)
            : newUserText
          initialMessages = [...initialMessages, { role: 'user', content: userContent }]
        }
      }

      // Spara user-meddelandet i thread_message (non-blocking) — inkl images
      if (newUserText || hasImages) {
        saveThreadMessage({
          threadId: thread.id,
          businessId,
          role: 'user',
          agent: null,
          content: newUserText || '(bild bifogad utan text)',
          images,
        }).catch(() => {})
      }
    } else {
      // Legacy: använd payload-historiken (senaste 10). Utan thread sparas
      // ingenting — bilder skickas direkt till Claude i sista user-msg.
      initialMessages = messages.slice(-10).map((m: { role: string; content: string }) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.content,
      }))
      if (hasImages) {
        // Lägg in bild-blocken på det sista user-meddelandet
        const last = initialMessages[initialMessages.length - 1]
        const baseText = last?.role === 'user' ? last.content : ''
        const userContent = buildUserContentWithImages(typeof baseText === 'string' ? baseText : '', images)
        if (last?.role === 'user') {
          // Ersätt sista
          initialMessages = [
            ...initialMessages.slice(0, -1),
            { role: 'user', content: userContent as any },
          ]
        } else {
          initialMessages.push({ role: 'user', content: userContent as any })
        }
      }
    }

    // ── Orkestreringsloopen ─────────────────────────────────────────────
    // Upp till MAX_SPECIALIST_STEPS specialiststeg per request (se nedan).
    // Trådens dygnstak MAX_HANDOFFS_PER_THREAD ligger kvar som backstop mot
    // spiraler över tid.
    const responseMessages: Array<{
      agent: AgentId
      content: string
      is_handoff_announcement?: boolean
      /** Epic 3: statusen UI:t visar. Sätts bara där orkestreringen härlett en. */
      status?: AgentResult['status']
      presentation?: BusinessScenarioPresentation | MissionPlanPresentation
    }> = []
    let finalAction: any = null
    let outerMessages = initialMessages
    // Ask-täckningsmätningen (Etapp L) — sista strukturerade vyn turen visade,
    // om någon. Bara `kind` sparas nedan i byggAskCoverage, aldrig innehållet.
    let presentationKind: string | null = null

    // ═══ SEKVENTIELL MULTI-AGENT V1 (Epic 2) ═══
    //
    // Förut: exakt EN överlämning per tur, och efter den kom Matte aldrig
    // tillbaka. Storgatan-ärendet ("klara på Storgatan, fyra timmar extra,
    // kunden vill ha fakturan idag") rör tre domäner och gick alltså inte
    // att besvara sant.
    //
    // Nu: upp till tre specialiststeg i följd, ursprungsärendet skickas
    // OFÖRÄNDRAT vidare i varje steg, och varje steg bokförs som ett
    // AgentResult härlett ur verktygens faktiska utfall. Ingen svärm, ingen
    // workflow engine — samma loop, med ett räkneverk och ett minne.
    const intent: OrchestrationIntent = {
      text: newUserText || '',
      customerId: customerId || null,
      projectId: projectId || null,
    }
    const steps: AgentResult[] = []
    const visitedSpecialists: AgentId[] = []
    // Ackumulerad usage över HELA requesten — kan spänna flera specialiststeg
    // (varje steg är en egen runAgentTurn, ibland flera Sonnet-anrop var).
    // Bokförs EN gång per request, oavsett vilken av de två return-vägarna
    // nedan som träffas (COGS-mätaren etapp 1, 2026-08-14 — Matte-chatten var
    // tidigare helt omätt, se tasks/cost-cap-analysis.md §7).
    const requestUsage: TokenUsage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    }
    const bokforMatteUsage = async (refId: string) => {
      const costUsd = llmCostUsd(requestUsage, 'claude-sonnet-4-6')
      // Ask-täckningsmätningen (Etapp L) — mekanisk klassificering av vad
      // som FAKTISKT hände i turen, härledd ur samma `steps`/`visitedSpecialists`
      // orkestreringsloopen redan bokfört. Ingen ny tabell: bara ett fält till
      // vidare i samma meta-blob som redan går till meterDirectLlmCall.
      const coverage = byggAskCoverage({
        steps,
        handoffCount: visitedSpecialists.length,
        presentation: presentationKind ? { kind: presentationKind } : null,
      })
      await meterDirectLlmCall({
        supabase,
        businessId,
        usage: requestUsage,
        costUsd,
        refType: 'matte_chat_turn',
        refId,
        meta: { thread_id: thread?.id || null, specialist_steps: visitedSpecialists, coverage },
      })
    }

    while (true) {
      // Minne: samma funktioner (getRelevantMemories/buildMemoryPrompt) som
      // den autonoma triggern (app/api/agent/trigger/route.ts) använder för
      // att injicera "vad du vet om detta företag" i systempromptet. Hämtas
      // per agent (currentAgent kan bytas via handoff mitt i turen).
      // Fail-safe: fel här får aldrig fälla chatten — degraderar tyst.
      let memorySuffix = ''
      try {
        const memories = await getRelevantMemories(businessId, currentAgent)
        memorySuffix = buildMemoryPrompt(memories)
      } catch (err) {
        console.error('[matte/chat] memory fetch failed (non-blocking):', err)
      }

      // Möjlighetsportfölj + aktivt uppdrag (Goal-to-Plan V1, Etapp B) — bara
      // Matte har propose_mission_plan/confirm_mission, så vi beräknar bara
      // här när hon är aktuell agent. KÄND KOSTNADSPUNKT: portföljen kör
      // flera (billiga, indexerade) frågor per Matte-tur — ingen cache
      // mellan requests i V1, se lib/mission/opportunity-portfolio.ts.
      let missionContextBlock = ''
      if (currentAgent === 'matte' && missionBehorig) {
        try {
          const portfolio = await loadOpportunityPortfolioForBusiness(supabase, businessId)
          // select('*') — INTE en explicit kolumnlista: goal_type/goal_hours
          // (sql/v145_mission_capacity_goal.sql) kan saknas som kolumner i
          // vissa miljöer, och en explicit lista med dem hade gjort HELA
          // frågan fela (42703) där, vilket i sin tur hade dolt ett
          // legitimt aktivt PENGAuppdrag bakom missionErr-fail-softet nedan
          // — en regression för Etapp A/B. '*' returnerar bara de kolumner
          // som faktiskt finns; resolveGoalType() defaultar resten.
          const { data: activeMissionRow, error: missionErr } = await supabase
            .from('mission')
            .select('*')
            .eq('business_id', businessId)
            .eq('status', 'active')
            .maybeSingle()
          // Fail-soft på 42P01 — sql/v144_mission.sql körs manuellt av
          // Andreas och kan alltså saknas i vissa miljöer tills dess.
          if (missionErr && missionErr.code !== '42P01') {
            console.error('[matte/chat] aktivt uppdrag kunde inte läsas (non-blocking):', missionErr.message)
          }
          const mission = missionErr ? null : activeMissionRow
          if (portfolioHasItems(portfolio) || mission) {
            const blocks = [buildPortfolioContextSection(portfolio)]
            if (mission) blocks.push(buildActiveMissionContextSection(mission))
            missionContextBlock = blocks.join('\n\n')
          }
        } catch (err) {
          console.error('[matte/chat] möjlighetsportfölj kunde inte byggas (non-blocking):', err)
        }
      }

      const systemArray: any[] = [
        {
          type: 'text',
          text: buildAgentSystemPrompt(currentAgent, userName, businessName, hasImages),
          cache_control: { type: 'ephemeral' },
        },
        { type: 'text', text: contextSection },
      ]
      // Sidkontexten är referensen bakom ”det här projektet/offerten”. Den
      // bär bara ID:n; alla verktygsuppslag gör fortfarande sin egen
      // business_id-kontroll. Utan blocket hade klienten skickat projectId
      // men modellen aldrig sett det — demo-frågan hade då behövt gissa.
      const pageRefs = [
        projectId ? `project_id: ${projectId}` : null,
        customerId ? `customer_id: ${customerId}` : null,
        sidkontext.quoteId ? `quote_id: ${sidkontext.quoteId}` : null,
        sidkontext.invoiceId ? `invoice_id: ${sidkontext.invoiceId}` : null,
      ].filter(Boolean)
      if (pageRefs.length > 0) {
        systemArray.push({
          type: 'text',
          text: `AKTUELL PRODUKTVY (använd vid ”den här”):\n${pageRefs.join('\n')}\nID:na är serververifierade mot företaget; verktygen behåller ändå sina egna ägarskapskontroller.`,
        })
      }
      // Identiteten är serverns, aldrig modellens: "jag/mig" i samtalet är
      // ALLTID den autentiserade användaren — Matte får inte gissa vem som
      // pratar ur samtalstexten (Matte Mobile Voice V1, 2026-08-30).
      if (currentBusinessUser) {
        systemArray.push({
          type: 'text',
          text: `INLOGGAD ANVÄNDARE: ${currentBusinessUser.name || userName} (business_user_id: ${currentBusinessUser.id}, roll: ${currentBusinessUser.role}). När hantverkaren skriver eller säger "jag", "mig", "min tid" eller "för mig" avses alltid exakt denna användare — aldrig någon annan i teamet.`,
        })
      }
      // Inkludera summary av äldre meddelanden om token-budgeten översteg
      if (historySummary) {
        systemArray.push({
          type: 'text',
          text: `TIDIGARE I KONVERSATIONEN (sammanfattning):\n${historySummary}`,
        })
      }
      if (memorySuffix) {
        systemArray.push({ type: 'text', text: memorySuffix })
      }
      if (missionContextBlock) {
        systemArray.push({ type: 'text', text: missionContextBlock })
      }

      const turn = await runAgentTurn({
        apiKey,
        agent: currentAgent,
        systemArray,
        initialMessages: outerMessages,
        businessId,
        supabase,
        toolContext,
        requireConfirmExternal,
        missionToolsAllowed: missionBehorig,
      })

      requestUsage.input_tokens = (requestUsage.input_tokens || 0) + (turn.usage.input_tokens || 0)
      requestUsage.output_tokens = (requestUsage.output_tokens || 0) + (turn.usage.output_tokens || 0)
      requestUsage.cache_creation_input_tokens =
        (requestUsage.cache_creation_input_tokens || 0) + (turn.usage.cache_creation_input_tokens || 0)
      requestUsage.cache_read_input_tokens =
        (requestUsage.cache_read_input_tokens || 0) + (turn.usage.cache_read_input_tokens || 0)

      if (turn.action && !finalAction) finalAction = turn.action
      // Ask-täckningsmätningen (Etapp L): fånga vilken presentation TURENS
      // visade, om någon — presentation är lokal till runAgentTurn och finns
      // inte kvar i scope efter loopen, så den måste speglas hit precis som
      // finalAction ovan.
      if (turn.presentation && !presentationKind) presentationKind = turn.presentation.kind

      // Säkerhetsräcke: Claude ville skicka något ut ur huset. Persistera ev.
      // text den redan sa (t.ex. "Visst, skickar nu...") och returnera direkt
      // — inget verktyg har körts, inget mer sker förrän klienten bekräftar.
      if (turn.pendingExternal) {
        if ((turn.text || turn.presentation) && thread) {
          saveThreadMessage({
            threadId: thread.id,
            businessId,
            role: 'assistant',
            agent: currentAgent,
            content: turn.text || 'Här är scenariot.',
            ...(turn.presentation ? { metadata: { presentation: turn.presentation } } : {}),
          }).catch(() => {})
        }
        if (thread) touchThread(thread.id).catch(() => {})

        const summary = buildExternalActionSummary(turn.pendingExternal.toolName, turn.pendingExternal.toolInput)
        const token = signPendingExternalAction({
          toolName: turn.pendingExternal.toolName,
          toolInput: turn.pendingExternal.toolInput,
          businessId,
          threadId: thread?.id || null,
          agent: currentAgent,
        })

        await bokforMatteUsage(`matte_${thread?.id || businessId}_${Date.now()}`)

        return NextResponse.json({
          messages: (turn.text || turn.presentation) ? [{ agent: currentAgent, content: turn.text || 'Här är scenariot.', ...(turn.presentation ? { presentation: turn.presentation } : {}) }] : [],
          current_agent: currentAgent,
          thread_id: thread?.id || null,
          reply: turn.text || summary,
          action: null,
          pending_confirmation: {
            tool_name: turn.pendingExternal.toolName,
            args: turn.pendingExternal.toolInput,
            summary,
            // Kortets bekräftelseknapp: "Skicka" för utskick, "Logga" för
            // tid. Klienten faller tillbaka till "Skicka" om fältet saknas.
            confirm_label: confirmLabelForTool(turn.pendingExternal.toolName),
            token,
          },
        })
      }

      // Bokför steget innan vi bestämmer nästa. Statusen härleds ur
      // verktygsutfallen, inte ur texten — modellen får inte betygsätta sig
      // själv (se lib/agent/orchestration.ts).
      steps.push(toAgentResult(currentAgent, turn.text, turn.toolOutcomes))

      const plan = turn.handoff
        ? validateNextStep({ from: currentAgent, target: turn.handoff.target_agent, visited: visitedSpecialists })
        : null

      if (!turn.handoff || !plan?.ok) {
        // Klart: lägg sista textsvaret om det finns
        if (turn.text || turn.presentation) {
          const content = turn.text || 'Här är scenariot.'
          responseMessages.push({ agent: currentAgent, content, ...(turn.presentation ? { presentation: turn.presentation } : {}) })
          // Persistera assistant-svar (non-blocking)
          if (thread) {
            saveThreadMessage({
              threadId: thread.id,
              businessId,
              role: 'assistant',
              agent: currentAgent,
              content,
              ...(turn.presentation ? { metadata: { presentation: turn.presentation } } : {}),
            }).catch(() => {})
          }
        }
        // Nekad plan syns i loggen; användaren möter den genom Mattes
        // sammanfattning, inte genom ett tekniskt felmeddelande.
        if (plan && !plan.ok) {
          console.warn(`[matte/chat] planen nekade ${currentAgent}→${turn.handoff?.target_agent}: ${plan.reason}`)
        }
        break
      }

      // Om vi inte har en tråd än men en handoff begärs, skapa en på
      // (business_id, customer_id) eller fallback (utan customer-koppling).
      if (!thread) {
        try {
          thread = await getOrCreateThread({ businessId, customerId, projectId })
        } catch { /* om vi inte kan skapa, vägra handoff men returnera textsvar */ }
        if (!thread) {
          if (turn.text || turn.presentation) responseMessages.push({ agent: currentAgent, content: turn.text || 'Här är scenariot.', ...(turn.presentation ? { presentation: turn.presentation } : {}) })
          break
        }
      }

      const result = await executeHandoff({
        thread,
        fromAgent: currentAgent,
        toAgent: plan.target,
        reason: turn.handoff.reason,
        contextSummary: turn.handoff.context_for_next_agent,
      })

      if (!result.ok) {
        // Refused (max-loop, not_allowed, etc.) — stanna kvar hos current agent
        if (turn.text || turn.presentation) responseMessages.push({ agent: currentAgent, content: turn.text || 'Här är scenariot.', ...(turn.presentation ? { presentation: turn.presentation } : {}) })
        if (result.refused_reason === 'max_handoffs_reached') {
          responseMessages.push({
            agent: currentAgent,
            content: `(Max antal handoffs i den här tråden nått — frågan stannar hos ${AGENT_CAPABILITIES[currentAgent]?.name || currentAgent}.)`,
          })
        }
        break
      }

      // Lägg announcement från avgående agent
      const announcement = buildHandoffAnnouncement(currentAgent, result.current_agent, turn.handoff.reason)
      // Använd ev. text från avgående agent som prefix om hen sa något, annars bara announcement
      const announcementContent = turn.text ? `${turn.text}\n\n${announcement}` : announcement
      const previousAgent = currentAgent
      responseMessages.push({
        agent: previousAgent,
        content: announcementContent,
        is_handoff_announcement: true,
        ...(turn.presentation ? { presentation: turn.presentation } : {}),
      })
      // Persistera handoff-announcement med flag (skippas i Claude messages-
      // historik nästa gång, men UI kan hämta dem för audit)
      if (thread) {
        saveThreadMessage({
          threadId: thread.id,
          businessId,
          role: 'assistant',
          agent: previousAgent,
          content: announcementContent,
          isHandoffAnnouncement: true,
          metadata: {
            to_agent: result.current_agent,
            reason: turn.handoff.reason,
            ...(turn.presentation ? { presentation: turn.presentation } : {}),
          },
        }).catch(() => {})
      }

      // Byt till ny agent. Briefingen bär ursprungsärendet ORDAGRANT plus vad
      // kollegorna faktiskt gjort — förut fick nästa agent bara avgående
      // agents fria sammanfattning, alltså en tolkning av en tolkning.
      currentAgent = result.current_agent
      if (currentAgent !== 'matte' && !visitedSpecialists.includes(currentAgent)) {
        visitedSpecialists.push(currentAgent)
      }
      outerMessages = [
        ...initialMessages,
        {
          role: 'user',
          content: buildHandoffBriefing(intent, steps, turn.handoff.context_for_next_agent),
        },
      ]
    }

    // ── Matte återtar samtalet ──────────────────────────────────────────
    // Specialisterna äger sitt domänresonemang; Matte äger slutstatusen.
    // Sammanfattningen listar bara det som verktygsutfallen faktiskt visar,
    // så ingen "klart!" kan överleva ett verktyg som felade. En ensam lyckad
    // specialist får behålla ordet — där vore en sammanfattning bara brus.
    const redovisade = steps.filter(s => s.agent !== 'matte' || s.status !== 'completed')
    if (shouldMatteSummarize(redovisade)) {
      const summering = buildOrchestrationSummary(redovisade)
      // Sammanfattningens status är den SÄMSTA bland stegen — ett felat steg
      // får aldrig gömmas bakom ett klart. Samma ordning som i UI-chippet.
      const värst: AgentResult['status'] =
        redovisade.some(s => s.status === 'failed') ? 'failed'
        : redovisade.some(s => s.status === 'partial') ? 'partial'
        : redovisade.some(s => s.status === 'awaiting_approval') ? 'awaiting_approval'
        : 'completed'
      responseMessages.push({ agent: 'matte', content: summering, status: värst })
      if (thread) {
        saveThreadMessage({
          threadId: thread.id,
          businessId,
          role: 'assistant',
          agent: 'matte',
          content: summering,
          metadata: {
            orchestration: {
              steps: redovisade.map(s => ({ agent: s.agent, status: s.status, actions: s.actions })),
            },
          },
        }).catch(() => {})
        if (currentAgent !== 'matte') {
          // Tråden lämnas tillbaka till Matte — inte som en handoff (det är
          // ingen agents beslut och ska inte äta av loopskyddets kvot), utan
          // som ett ägarbyte tillbaka till koordinatorn.
          restoreThreadOwner(thread.id, 'matte').catch(() => {})
        }
      }
      currentAgent = 'matte'
    }

    // Touch-thread så last_message_at uppdateras
    if (thread) {
      touchThread(thread.id).catch(() => {})
    }

    // Bakåtkompat: returnera även `reply` (sista textsvaret) + `action`
    const lastMessage = responseMessages[responseMessages.length - 1]
    const reply = lastMessage?.content || 'Klart!'
    // Strippa eventuell legacy {"action":"navigate"...}-blob
    const actionMatch = reply.match(/\{"action"\s*:\s*"navigate"\s*,\s*"target"\s*:\s*"([^"]+)"\}/)
    if (!finalAction && actionMatch) {
      finalAction = { type: 'navigate', target: actionMatch[1] }
    }
    const cleanReply = reply.replace(/\{"action"\s*:\s*"navigate"[^}]+\}\s*/g, '').trim()

    // Minne: extrahera + spara ev. lärdom från den här konversationsturen
    // (samma pipeline som triggern — se lib/agents/memory.ts). Fire-and-
    // forget precis som i trigger-vägen; blockerar aldrig svaret och
    // extractAndSaveMemory degraderar redan internt tyst vid fel/kort svar.
    extractAndSaveMemory(businessId, currentAgent, cleanReply, 'chat', {
      customerId,
      projectId,
      userMessage: newUserText,
    }, {
      // Källspår (Etapp U, sql/v149_agent_memory_hardening.sql): tråden
      // detta minne extraherades ur, om chatten hade en (kan saknas för
      // en helt ny tråd som inte hann skapas).
      type: 'chat_thread',
      id: thread?.id ?? null,
    }).catch((err) => console.error('[matte/chat] extractAndSaveMemory failed (non-blocking):', err))

    await bokforMatteUsage(`matte_${thread?.id || businessId}_${Date.now()}`)

    return NextResponse.json({
      messages: responseMessages,
      current_agent: currentAgent,
      thread_id: thread?.id || null,
      // Bakåtkompat med befintliga UI-konsumenter:
      reply: cleanReply,
      action: finalAction,
    })
  } catch (error: any) {
    console.error('[matte/chat] Error:', error)
    return NextResponse.json({
      reply: 'Något gick fel — försök igen.',
      messages: [],
    })
  }
}
