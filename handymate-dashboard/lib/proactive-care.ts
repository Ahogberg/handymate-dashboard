/**
 * Proactive Customer Care Engine
 *
 * Reaches out to past customers based on job type lifecycle.
 * Each job type has a natural "time to next contact" cycle.
 *
 * VP3 (gap 3, tasks/vilande-pengar-masterplan.md): väckt från död. Modulen
 * frågade `projects`/`customers` (tabellerna heter `project`/`customer`,
 * PK `project_id`/`customer_id`) och hade dessutom en customer-embed som
 * PostgREST avvisar (FK saknas i prod — samma PGRST200-prejudikat som
 * lib/project-stages/automation-engine.ts). Varje körning har alltså
 * felat tyst sedan modulen skrevs. Nu: rätt tabellnamn, separat batch-
 * hämtning av kunder, fel LARMAR via logAutomationActivity (driftlarm-
 * cronen sveper automation_activity status='failed'), VP1:s frekvenstak
 * före kortskapande, och månader räknas via tyst-kund-primitiven.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getServerSupabase } from '@/lib/supabase'
import { canContactCustomer } from '@/lib/outbound/frequency-guard'
import { logAutomationActivity } from '@/lib/automations'
import { monthsSinceLastJob } from '@/lib/customers/quiet-customer'
import { extractFirstName, halsning } from '@/lib/customers/namn'
import { meterDirectLlmCall } from '@/lib/agents/shared/cost-guard'
import { llmCostUsd } from '@/lib/costs/meter'

const PROACTIVE_CARE_MODEL = 'claude-haiku-4-5-20251001'

// Job type → months until proactive contact
const JOB_LIFECYCLE: Record<string, {
  months: number
  reason: string
  suggestedService: string
}> = {
  // Badrum
  'badrum': { months: 24, reason: 'Fogarna kan behöva kontroll efter 2 år', suggestedService: 'Fog- och tätskiktskontroll' },
  'badrumrenovering': { months: 24, reason: 'Fogarna kan behöva kontroll efter 2 år', suggestedService: 'Fog- och tätskiktskontroll' },

  // El
  'elinstallation': { months: 36, reason: 'Elbesiktning rekommenderas vart 3:e år', suggestedService: 'Elbesiktning' },
  'elcentral': { months: 36, reason: 'Elcentralen bör kontrolleras regelbundet', suggestedService: 'Elbesiktning' },
  'laddbox': { months: 12, reason: 'Årlig service rekommenderas', suggestedService: 'Laddbox-service' },

  // VVS
  'vvs': { months: 18, reason: 'VVS-system bör kontrolleras regelbundet', suggestedService: 'VVS-kontroll' },
  'varmvattenberedare': { months: 12, reason: 'Årlig service förlänger livslängden', suggestedService: 'Varmvattenberedare-service' },
  'golvvarme': { months: 24, reason: 'Golvvärme bör kontrolleras vartannat år', suggestedService: 'Golvvärme-kontroll' },
  'värmepump': { months: 12, reason: 'Årlig service krävs för garanti', suggestedService: 'Värmepump-service' },

  // Bygg
  'tak': { months: 36, reason: 'Taket bör inspekteras vart 3:e år', suggestedService: 'Takinspektion' },
  'fasad': { months: 60, reason: 'Fasaden kan behöva underhåll efter 5 år', suggestedService: 'Fasadkontroll' },
  'altan': { months: 24, reason: 'Altanen kan behöva oljning/behandling', suggestedService: 'Altan-underhåll' },
  'malning': { months: 36, reason: 'Ommålning brukar behövas efter 3-5 år', suggestedService: 'Ommålning' },

  // Generellt
  'renovering': { months: 36, reason: 'Dags att följa upp renoveringen', suggestedService: 'Uppföljning' },
  'default': { months: 18, reason: 'Vi vill säkerställa att allt fortfarande fungerar bra', suggestedService: 'Uppföljning och kontroll' },
}

/**
 * Match a project name/description to a job lifecycle key.
 * Returns the best matching key, or 'default' if no match.
 */
function matchJobType(projectName: string, projectDescription?: string | null): string {
  const text = `${projectName || ''} ${projectDescription || ''}`.toLowerCase()

  // Normalize Swedish characters for matching
  const normalized = text
    .replace(/ä/g, 'a')
    .replace(/å/g, 'a')
    .replace(/ö/g, 'o')

  // Check each lifecycle key against the text (longest match first for specificity)
  const sortedKeys = Object.keys(JOB_LIFECYCLE)
    .filter(k => k !== 'default')
    .sort((a, b) => b.length - a.length)

  for (const key of sortedKeys) {
    // Also normalize the key for matching
    const normalizedKey = key
      .replace(/ä/g, 'a')
      .replace(/å/g, 'a')
      .replace(/ö/g, 'o')

    if (text.includes(key) || normalized.includes(normalizedKey)) {
      return key
    }
  }

  return 'default'
}

/**
 * Generate a suggested SMS using Claude Haiku.
 * Falls back to a template-based message if API is unavailable.
 */
async function generateProactiveSms(
  params: {
    customerName: string
    businessName: string
    jobType: string
    monthsSince: number
    reason: string
    suggestedService: string
    projectName: string
    projectId: string
  },
  businessId: string,
  supabase: SupabaseClient
): Promise<string> {
  // R1/R2: kundtext får BARA förnamn. project.name (arbetsnamnet) refereras
  // ALDRIG — jobType är en generisk kategori (t.ex. "badrum", "vvs") och är
  // OK, men "reason" bär redan den mänskliga formuleringen så vi behöver
  // inte ens jobType i fallback-mallen.
  const customerFirstName = extractFirstName(params.customerName)
  const fallbackSms = `${halsning(params.customerName)} Det har gått ${params.monthsSince} månader sedan vi var hos dig senast. ${params.reason} — vi erbjuder gärna en kostnadsfri kontroll. /${params.businessName}`

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return fallbackSms
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: PROACTIVE_CARE_MODEL,
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Skriv ett kort, vänligt SMS (max 160 tecken) på svenska från ett hantverksföretag till en befintlig kund.

Kontext:
- Kundens förnamn: ${customerFirstName || '(saknas — skriv "Hej!" utan namn)'}
- Företagsnamn: ${params.businessName}
- Jobbtyp: ${params.jobType}
- Månader sedan jobbet: ${params.monthsSince}
- Anledning till kontakt: ${params.reason}
- Föreslaget erbjudande: ${params.suggestedService}

Tonen ska vara personlig och omtänksam, inte säljig. Avsluta med /${params.businessName}.
Använd kundens förnamn (eller "Hej!" om det saknas). Referera till jobbet generiskt via jobbtypen ovan — nämn ALDRIG interna arbetsnamn eller titlar.
Svara ENBART med SMS-texten, inget annat.`,
        }],
      }),
    })

    if (!response.ok) {
      console.warn('[proactive-care] Haiku API error, using fallback SMS')
      return fallbackSms
    }

    const data = await response.json()

    // COGS-boken — proaktiv kundvård-SMS (Haiku), tidigare helt omätt.
    await meterDirectLlmCall({
      supabase,
      businessId,
      usage: data?.usage,
      costUsd: llmCostUsd(data?.usage, PROACTIVE_CARE_MODEL),
      refType: 'proactive_care_sms',
      refId: params.projectId,
    })

    const content = data?.content?.[0]?.text?.trim()
    return content || fallbackSms
  } catch (err) {
    console.warn('[proactive-care] Failed to generate SMS via Haiku:', err)
    return fallbackSms
  }
}

export async function checkProactiveCare(businessId: string): Promise<{
  success: boolean
  contactsCreated: number
  error?: string
}> {
  const supabase = getServerSupabase()
  let contactsCreated = 0

  try {
    // ═══ AVSTÄNGNINGEN LÄSTES FRÅN EN KOLUMN SOM INTE FINNS (2026-08-07) ═══
    //
    // Koden läste `automation_settings.settings.proactive_care_enabled`.
    // `automation_settings` är en bred, platt tabell (sql/automation_center.sql)
    // — den har varken en JSONB-kolumn `settings` eller något fält för
    // proaktiv omsorg. Frågan gav 42703, `settings` blev null, och uttrycket
    // `undefined !== false` blev true. Avstängningen har alltså aldrig gått
    // att slå av: den såg ut som en spärr och var en konstant.
    //
    // Spärren läses nu från den kill-switch som faktiskt finns och som resten
    // av huset redan respekterar (samma fält som cron/missed-revenue).
    const { data: killSwitch } = await supabase
      .from('business_config')
      .select('agents_globally_paused')
      .eq('business_id', businessId)
      .maybeSingle()

    if (killSwitch?.agents_globally_paused) {
      return { success: true, contactsCreated: 0 }
    }

    // Hämta företagsinfo
    const { data: business } = await supabase
      .from('business_config')
      .select('business_name, contact_name')
      .eq('business_id', businessId)
      .single()

    if (!business) {
      return { success: false, contactsCreated: 0, error: 'Business not found' }
    }

    // Hämta alla avslutade projekt (kunder batch-hämtas separat — ingen
    // embed: project→customer-FK:n saknas i prod, PostgREST ger PGRST200)
    const { data: projects, error: projError } = await supabase
      .from('project')
      .select('project_id, name, description, status, completed_at, customer_id')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .not('completed_at', 'is', null)

    if (projError) {
      // Larma: driftlarm-cronen sveper automation_activity status='failed'.
      // Tidigare returnerades felet tyst och ingen märkte att motorn var död.
      await logAutomationActivity({
        businessId,
        automationType: 'proactive_care',
        action: 'fetch_projects',
        description: `Proaktiv kundvård kunde inte hämta projekt: ${projError.message}`,
        status: 'failed',
      }).catch(() => { /* best-effort */ })
      return { success: false, contactsCreated: 0, error: projError.message }
    }

    if (!projects || projects.length === 0) {
      return { success: true, contactsCreated: 0 }
    }

    // Batch-hämta kunder för projekten
    const customerIds = Array.from(
      new Set(projects.map(p => p.customer_id).filter((id): id is string => !!id))
    )
    const customerMap = new Map<string, { customer_id: string; name: string | null; phone_number: string | null }>()
    if (customerIds.length > 0) {
      const { data: customers, error: custError } = await supabase
        .from('customer')
        .select('customer_id, name, phone_number')
        .eq('business_id', businessId)
        .in('customer_id', customerIds)
      if (custError) {
        await logAutomationActivity({
          businessId,
          automationType: 'proactive_care',
          action: 'fetch_customers',
          description: `Proaktiv kundvård kunde inte hämta kunder: ${custError.message}`,
          status: 'failed',
        }).catch(() => { /* best-effort */ })
        return { success: false, contactsCreated: 0, error: custError.message }
      }
      for (const c of customers || []) customerMap.set(String(c.customer_id), c)
    }

    const now = new Date()

    for (const project of projects) {
      // Max 3 proactive contacts per business per day
      if (contactsCreated >= 3) break

      const customer = project.customer_id ? customerMap.get(String(project.customer_id)) : undefined
      if (!customer?.phone_number) continue
      if (!project.completed_at) continue

      // Determine job type by keyword matching
      const jobType = matchJobType(project.name, project.description)
      const lifecycle = JOB_LIFECYCLE[jobType] || JOB_LIFECYCLE['default']

      // Månader sedan avslut — via tyst-kund-primitiven (30-dagarsmånad,
      // samma beräkning som hanna-outbound; tidigare 30.44 här — förenat i VP3)
      const monthsSince = monthsSinceLastJob(project.completed_at, now.getTime())
      if (monthsSince === null) continue

      // Check if enough months have passed
      if (monthsSince < lifecycle.months) continue

      // Also skip if too far past (more than 6 months over cycle — avoid ancient contacts)
      if (monthsSince > lifecycle.months + 6) continue

      // Dedup (fixad 2026-08-11): kollade tidigare bara de senaste 60 dagarna,
      // men eligibility-fönstret ovan (lifecycle.months till +6 månader) är
      // ~183 dagar brett — ungefär tre gånger så brett som dedup-fönstret.
      // Samma projekt+kund kunde alltså få ett nytt proactive_care-kort (och,
      // om godkänt, ett dubblett-SMS till kunden) ungefär var 60:e dag så
      // länge fönstret var öppet. Samma buggklass som upptäcktes i
      // evaluateThresholds() (lib/automation-engine.ts) samma dag — ett
      // datumavgränsat dedup mot ett villkor som förblir sant länge. Ingen
      // datumgräns alls nu, matchar den redan korrekta systertabellen
      // lib/warranty-followup.ts.
      const { count: existingApprovalCount } = await supabase
        .from('pending_approvals')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('approval_type', 'proactive_care')
        .contains('payload', { project_id: project.project_id, customer_id: customer.customer_id })

      if (existingApprovalCount && existingApprovalCount > 0) continue

      // Also check v3_automation_logs for dedup
      const { data: existingLog } = await supabase
        .from('v3_automation_logs')
        .select('id')
        .eq('business_id', businessId)
        .eq('rule_name', 'proactive_customer_care')
        .contains('context', { project_id: project.project_id })
        .limit(1)

      if (existingLog && existingLog.length > 0) continue

      // VP1:s gemensamma frekvenstak (gap 9) — max ett outbound-kort per
      // kund per fönster, oavsett producent. Ovanpå 60-dagars-deduparna.
      const freq = await canContactCustomer(supabase, businessId, String(customer.customer_id))
      if (!freq.allowed) continue

      // Generate suggested SMS
      const suggestedSms = await generateProactiveSms(
        {
          customerName: customer.name || 'kund',
          businessName: business.business_name || '',
          jobType,
          monthsSince,
          reason: lifecycle.reason,
          suggestedService: lifecycle.suggestedService,
          projectName: project.name || 'jobbet',
          projectId: project.project_id,
        },
        businessId,
        supabase
      )

      // Create pending_approval
      const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

      await supabase.from('pending_approvals').insert({
        id: approvalId,
        business_id: businessId,
        approval_type: 'proactive_care',
        title: `Proaktiv kontakt: ${customer.name} — ${lifecycle.suggestedService}`,
        description: `${lifecycle.reason}. Senaste jobb: ${project.name} (${monthsSince} månader sedan)`,
        payload: {
          // 'agent' (inte 'agent_id') — exekveringen läser pl.agent och
          // VP2-attributionen läser payload.agent; med gamla fältnamnet
          // blev korten agent-lösa i båda. Samma fält som hanna-outbound.
          agent: 'hanna',
          customer_id: customer.customer_id,
          customer_name: customer.name,
          customer_phone: customer.phone_number,
          project_id: project.project_id,
          project_name: project.name,
          months_since: monthsSince,
          job_type: jobType,
          suggested_service: lifecycle.suggestedService,
          suggested_sms: suggestedSms,
        },
        status: 'pending',
        risk_level: 'medium',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })

      // Log to v3_automation_logs
      await supabase.from('v3_automation_logs').insert({
        business_id: businessId,
        agent_id: 'hanna',
        rule_name: 'proactive_customer_care',
        trigger_type: 'cron',
        action_type: 'create_approval',
        status: 'success',
        context: {
          customer_id: customer.customer_id,
          customer_name: customer.name,
          project_id: project.project_id,
          project_name: project.name,
          job_type: jobType,
          months_since: monthsSince,
          suggested_service: lifecycle.suggestedService,
        },
      })

      contactsCreated++
    }

    return { success: true, contactsCreated }
  } catch (err: any) {
    console.error('[proactive-care] Error:', err)
    await logAutomationActivity({
      businessId,
      automationType: 'proactive_care',
      action: 'check_proactive_care',
      description: `Proaktiv kundvård kraschade: ${err?.message || String(err)}`,
      status: 'failed',
    }).catch(() => { /* best-effort */ })
    return { success: false, contactsCreated, error: err.message }
  }
}
