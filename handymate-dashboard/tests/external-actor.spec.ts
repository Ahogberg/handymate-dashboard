/**
 * Facit för Etapp S — Lisa Voice steg 1b: external_customer-
 * behörighetsfiltrering (C:\Users\Gaming\.claude\plans\
 * jaunty-pondering-hummingbird.md, Etapp S; tasks/lisa-voice-plan.md,
 * korrigering 1).
 *
 * Två ANTAGNA hårda regler från extern granskning (Codex S-skärpning 1+2):
 *
 *  1. external_customer = OIDENTIFIERAD extern part. Ett telefonnummer
 *     kopplat till ett företag bevisar inte vem som ringer. Före ett
 *     verifieringskoncept (V2) får vitlistan ENBART identitetsneutrala
 *     verktyg (öppettider/allmän info-klass) — INGET kundpost-scopat.
 *     Hellre tom lista än generös.
 *  2. Dubbelgrind som chattens agent-gränser (se agent-tool-boundaries.spec.ts,
 *     P0.2): filtrering sker BÅDE innan modellen ser verktygslistan
 *     (filterTools) OCH omedelbart före exekvering (executeTool-vakten).
 *
 * Fail-closed per konstruktion: varje verktygsnamn i tool-definitions.ts
 * MÅSTE vara uttryckligen klassat nedan (antingen EXTERNAL_SAFE_TOOLS i
 * lib/agent/external-actor.ts, eller EXTERNAL_DENIED_TOOLS här i facit-
 * filen). Ett nytt/omdöpt verktyg som inte klassats gör att
 * täckningstestet FALLERAR RÖTT tills en människa klassat det explicit.
 *
 * Körs: npx playwright test tests/external-actor.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { toolDefinitions } from '../app/api/agent/trigger/tool-definitions'
import { executeTool } from '../app/api/agent/trigger/tool-router'
import { filterTools } from '../lib/agent/agents/shared'
import {
  EXTERNAL_SAFE_TOOLS,
  EXTERNAL_TOOL_DENIED_MESSAGE,
  isToolAllowedForActor,
} from '../lib/agent/external-actor'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

/**
 * Uttömmande "erkänd nekad"-lista — EN rad per verktyg i tool-definitions.ts,
 * med kort motivering. Håll i synk manuellt: täckningstestet nedan slår larm
 * om listan (tillsammans med EXTERNAL_SAFE_TOOLS) inte täcker exakt den
 * riktiga verktygslistan — varken för lite eller för mycket.
 */
const EXTERNAL_DENIED_TOOLS: Record<string, string> = {
  get_customer: 'kundpost-scopat',
  search_customers: 'kundpost-scopat (sök i hela kundregistret)',
  create_customer: 'skrivande, kundpost',
  update_customer: 'skrivande, kundpost',
  create_quote: 'skrivande, ekonomi',
  create_ata_draft: 'skrivande, kopplat till kundens projekt',
  get_quotes: 'kundpost-scopat, ekonomi',
  create_invoice: 'skrivande, ekonomi (faktura)',
  check_calendar: 'berikar bokningar med kundnamn (tool-router.ts checkCalendar) — kundpost-scopat',
  create_booking: 'skrivande, bokning',
  update_project: 'skrivande, projekt',
  log_time: 'skrivande, tidrapport',
  get_person_schedule: 'internt schema/beläggning för teamet, inte avsett för extern part',
  send_sms: 'skrivande, extern kommunikation',
  send_email: 'skrivande, extern kommunikation',
  read_customer_emails: 'kundpost-scopat, läser e-posthistorik',
  qualify_lead: 'skrivande, leaddata',
  update_lead_status: 'skrivande, leaddata',
  get_lead: 'kundpost-scopat (lead)',
  search_leads: 'kundpost-scopat (sök i leads)',
  get_daily_stats: 'internt affärsnyckeltal (intäkter m.m.)',
  create_approval_request: 'skrivande, kan trigga direktutförda low/medium-åtgärder',
  check_pending_approvals: 'internt godkännandeflöde',
  get_project_profitability: 'internt ekonomiskt underlag (marginal)',
  simulate_business_scenario: 'internt ekonomiskt underlag/scenario',
  get_communication_trail: 'kundpost-scopat, hela kommunikationsloggen',
  update_business_preference: 'skrivande, intern konfiguration',
  get_automation_settings: 'internt policyunderlag (godkännandekrav, minsta jobbvärde) — inte en ren öppettider-läsning',
  log_automation_action: 'skrivande, intern logg',
  check_fortnox_status: 'internt integrationsstatus',
  trigger_fortnox_sync: 'skrivande, ekonomi-synk',
  get_pricing_suggestion: 'internt prissättningsunderlag',
  get_efterkalkyl_insight: 'internt ekonomiskt underlag',
  get_project_outcome: 'kundpost/projekt-scopat ekonomiskt utfall',
  run_customer_base_sweep: 'skrivande (skapar godkännandekort över hela kundbasen)',
  book_site_visit: 'skrivande, bokning',
  get_projects_overview: 'internt översiktsverktyg (flaggor för hantverkaren)',
  get_stale_quotes: 'kundpost/ekonomi-scopat (offertbelopp per kund)',
  get_invoiceable_work: 'internt ekonomiskt underlag',
  get_customer_commitments: 'kundpost-scopat (löften till specifika kunder)',
  get_project_commercial_readiness: 'internt faktureringsunderlag',
  propose_mission_plan: 'internt, Matte-scopat uppdragsverktyg',
  confirm_mission: 'skrivande, internt uppdragsverktyg',
  send_agent_message: 'internt team-till-team-verktyg',
  get_agent_messages: 'internt team-till-team-verktyg',
  // Klassade 2026-08-25 (launch desk-etappen, commit 7cecac62 införde
  // verktygen utan att uppdatera detta facit — testet blev rött EXAKT som
  // dess eget filhuvud lovar vid oklassade tillägg; runtime var aldrig
  // öppet, EXTERNAL_SAFE_TOOLS är fortsatt tom/fail-closed):
  get_account_billing_status: 'internt abonnemangs-/faktureringsunderlag för ägaren — aldrig en extern part',
  escalate_to_handymate_team: 'skrivande (skapar support_ticket + triggar internt SMS-larm till teamets nummer) — en oidentifierad extern part kunde annars spamma driftlarmet',
  // Klassade 2026-08-30 (Matte Mobile Voice V1, branch
  // claude/lisa-prata-matte-integration-ao7nv3 införde verktygen utan att
  // uppdatera detta facit — samma mönster som 2026-08-25 ovan):
  log_material: 'skrivande, materialrad på ett projekt — samma kategori som log_time',
  add_work_note: 'skrivande, arbetsanteckning på ett projekt — samma kategori som log_time',
}

test.describe('Etapp S — fail-closed klassificeringsfacit', () => {
  test('varje verktyg i tool-definitions.ts är uttryckligen klassat (safe XOR denied)', () => {
    const realNames: string[] = toolDefinitions.map(t => t.name)
    const safeNames = Array.from(EXTERNAL_SAFE_TOOLS)
    const deniedNames = Object.keys(EXTERNAL_DENIED_TOOLS)

    // Ingen dubbelklassificering.
    const overlap = safeNames.filter(n => deniedNames.includes(n))
    expect(overlap, 'verktyg klassat som BÅDE safe och denied').toEqual([])

    // Inga okända namn i klassificeringslistorna (döda/omdöpta verktyg).
    const unknownSafe = safeNames.filter(n => !realNames.includes(n))
    expect(unknownSafe, 'EXTERNAL_SAFE_TOOLS innehåller verktyg som inte finns i tool-definitions.ts').toEqual([])
    const unknownDenied = deniedNames.filter(n => !realNames.includes(n))
    expect(unknownDenied, 'EXTERNAL_DENIED_TOOLS innehåller verktyg som inte finns i tool-definitions.ts').toEqual([])

    // Varje riktigt verktyg måste finnas i EN av de två listorna.
    const unclassified = realNames.filter(n => !safeNames.includes(n) && !deniedNames.includes(n))
    expect(unclassified, 'oklassade verktyg — klassa dem explicit i EXTERNAL_SAFE_TOOLS eller EXTERNAL_DENIED_TOOLS innan detta får bli grönt').toEqual([])
  })

  test('vitlistan innehåller inga send-/create-/update-/delete-/ekonomi-mönster', () => {
    const banned = /^(send_|create_|update_|delete_)|invoice|payment/i
    const offenders = Array.from(EXTERNAL_SAFE_TOOLS).filter(n => banned.test(n))
    expect(offenders, 'skrivande/ekonomiska verktyg får aldrig vitlistas för en oidentifierad extern part').toEqual([])
  })

  test('vitlistan är i dagsläget tom (V1-gräns, dokumenterad i filhuvudet)', () => {
    // Inget verktyg i den nuvarande listan klarade granskningen (se
    // lib/agent/external-actor.ts filhuvud för fullständig motivering).
    // Det här testet fastnar avsiktligt om någon lägger till ett verktyg i
    // EXTERNAL_SAFE_TOOLS utan att samtidigt uppdatera den här kommentaren
    // och plan-dokumentationen — en påminnelse, inte en teknisk spärr.
    expect(EXTERNAL_SAFE_TOOLS.size).toBe(0)
  })
})

test.describe('Grind 1 — filterTools (innan modellen ser listan)', () => {
  test('extern aktör får en tom lista även om per-agent-allowlistan tillåter verktygen', () => {
    const agentAllowed = ['get_customer', 'search_customers', 'send_sms', 'create_booking']
    const forExternal = filterTools(agentAllowed, 'external_customer')
    expect(forExternal.map(t => t.name)).toEqual([])
  })

  test('intern aktör (odefinierad actorType) är HELT oförändrad av den nya grinden', () => {
    const agentAllowed = ['get_customer', 'search_customers']
    const withoutActorType = filterTools(agentAllowed)
    const withInternalActorType = filterTools(agentAllowed, 'internal_user')
    expect(withoutActorType.map(t => t.name)).toEqual(['get_customer', 'search_customers'])
    expect(withInternalActorType.map(t => t.name)).toEqual(['get_customer', 'search_customers'])
  })

  test('isToolAllowedForActor: intern/odefinierad aktör nekas aldrig av denna funktion', () => {
    for (const name of toolDefinitions.map(t => t.name)) {
      expect(isToolAllowedForActor(name)).toBe(true)
      expect(isToolAllowedForActor(name, 'internal_user')).toBe(true)
    }
  })

  test('isToolAllowedForActor: extern aktör nekas alla verktyg (tom vitlista i V1)', () => {
    for (const name of toolDefinitions.map(t => t.name)) {
      expect(isToolAllowedForActor(name, 'external_customer')).toBe(false)
    }
  })
})

test.describe('Grind 2 — executeTool-vakten (omedelbart före exekvering)', () => {
  test('vakten sitter FÖRE switchen i källkoden, inte efter', () => {
    const s = read('app/api/agent/trigger/tool-router.ts')
    const fnStart = s.indexOf('export async function executeTool(')
    expect(fnStart, 'hittade inte executeTool — har den bytt namn?').toBeGreaterThan(-1)
    const guardIdx = s.indexOf('isToolAllowedForActor(', fnStart)
    const switchIdx = s.indexOf('switch (name)', fnStart)
    expect(guardIdx, 'ingen isToolAllowedForActor-vakt i executeTool').toBeGreaterThan(-1)
    expect(switchIdx, 'hittade inte switch(name)').toBeGreaterThan(-1)
    expect(guardIdx, 'vakten ligger efter switchen — den skyddar inget').toBeLessThan(switchIdx)
  })

  test('en nekad, oidentifierad extern aktör avvisas med neutral svensk text — utan att nå sitt case', async () => {
    // Tom/söndrig supabase-stub: skulle exekveringen nå sitt case (som
    // anropar supabase.from(...)) hade det kastat en TypeError och fångats
    // av try/catch längre ner — och gett ett ANNAT felmeddelande än vaktens.
    // Att vi får EXAKT vaktens text bevisar att den riktiga koden aldrig nås.
    const brokenSupabase = {} as any
    const externalContext = {
      businessName: 'Test',
      contactEmail: '',
      googleConnection: null,
      triggerSource: 'system' as const,
      actorType: 'external_customer' as const,
    }

    const result = await executeTool('create_invoice', {}, brokenSupabase, 'biz_1', externalContext)

    expect(result.success).toBe(false)
    expect(result.error).toBe(EXTERNAL_TOOL_DENIED_MESSAGE)
  })

  test('en oklassad/påhittad verktygsnamn nekas också för extern aktör (fail-closed, inte bara den kända listan)', async () => {
    const brokenSupabase = {} as any
    const externalContext = {
      businessName: 'Test',
      contactEmail: '',
      googleConnection: null,
      triggerSource: 'system' as const,
      actorType: 'external_customer' as const,
    }

    const result = await executeTool('__hittat_pa_verktyg__', {}, brokenSupabase, 'biz_1', externalContext)

    expect(result.success).toBe(false)
    expect(result.error).toBe(EXTERNAL_TOOL_DENIED_MESSAGE)
  })

  test('intern/odefinierad aktör passerar vakten och når switchen som förut (default-fallet, inte vaktens text)', async () => {
    const brokenSupabase = {} as any
    const internalContext = {
      businessName: 'Test',
      contactEmail: '',
      googleConnection: null,
      triggerSource: 'system' as const,
      // actorType utelämnad — dagens beteende, oförändrat.
    }

    const result = await executeTool('__paverkar_inte_intern__', {}, brokenSupabase, 'biz_1', internalContext)

    // default-grenen i switchen ger "Okänt verktyg: ...", INTE vaktens
    // neutrala text — beviset på att vakten aldrig triggade för intern aktör.
    expect(result.success).toBe(false)
    expect(result.error).toContain('Okänt verktyg')
    expect(result.error).not.toBe(EXTERNAL_TOOL_DENIED_MESSAGE)
  })
})
