/**
 * Facit: varje token som kostar pengar bokförs på rätt kund, och Bränsle-
 * taket (15 % av planpriset) gäller VARJE AI-yta — inte bara de fjorton
 * som råkade ha en grind 2026-08-26.
 *
 * Andreas 2026-08-27: "väldigt viktigt att säkerställa att alla anrop som
 * kostar tokens faktiskt mäts av för respektive kund."
 *
 * Tekniken är samma spärrhake som tests/cogs-matare.spec.ts använder för
 * SMS: inventera alla externa AI-anrop mekaniskt (source-scan), kräv att
 * varje fil antingen mäter/grindar SJÄLV eller står i en namngiven,
 * motiverad karta. En ny AI-fil utan mätning eller grind fäller testet.
 * Kartorna får inte bli kyrkogårdar: döda poster fäller också.
 *
 *   npx playwright test tests/facit-ai-kostnad-sanning.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')
const finns = (rel: string) => fs.existsSync(path.join(ROOT, rel))

function walk(dir: string, out: string[] = []): string[] {
  let poster: fs.Dirent[]
  try {
    poster = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
  } catch {
    return out
  }
  for (const f of poster) {
    const rel = `${dir}/${f.name}`
    if (f.isDirectory()) {
      if (f.name === 'node_modules' || f.name === '.next') continue
      walk(rel, out)
    } else if (/\.tsx?$/.test(f.name)) {
      out.push(rel)
    }
  }
  return out
}

/** Allt som kostar pengar hos en extern AI-leverantör — oavsett SDK/fetch. */
const EXTERN_AI = [
  'api.anthropic.com/v1/messages',
  'api.openai.com/v1/audio',
  '.messages.create(',
  'messages as any).create(',
]

function externaAiFiler(): string[] {
  return [...walk('lib'), ...walk('app')]
    .filter(rel => {
      const s = kod(rel)
      return EXTERN_AI.some(m => s.includes(m))
    })
    .sort()
}

const MATER_SJALV = /meterDirectLlmCall\(|recordCost\(|logAgentRun\(/
const GRINDAR_SJALV = /checkFuelGate\(|fuelAllows\(|checkCostGuards\(/

/**
 * Filer som INTE bokför själva: de returnerar usage/kostnad och en namngiven
 * anropare skriver boken. Varje anropare måste finnas och själv innehålla
 * en mätning.
 */
const MATS_AV_ANROPAREN: Record<string, string[]> = {
  // callAgentWithThinking → observation-prompts → cronen bokför via logAgentRun
  'lib/agents/shared/thinking-call.ts': [
    'app/api/cron/agent-observations/[agent]/route.ts',
    'app/api/cron/agent-observations/test/route.ts',
  ],
  'lib/agents/hanna/avtal-forslag.ts': ['app/api/cron/avtal-forslag/route.ts'],
  // runAgentLoop returnerar usage + modell; orkestratorn bokför per körning
  'lib/agent/agents/shared.ts': ['lib/agent/orchestrator.ts'],
  'lib/egenkontroll/photo-assessment.ts': ['lib/egenkontroll/analyze-and-queue.ts'],
}

/** Externa AI-anrop som per definition inte har någon kund att belasta. */
const INGEN_KUND_ATT_BELASTA: Record<string, string> = {
  'lib/launch-desk/brief.ts':
    'Handymates eget launch desk (adminspärrad) — intern COGS, inget business_id',
}

/**
 * Filer utan egen grind: Bränslet kontrolleras i den namngivna entrypointen
 * FÖRE anropet. Alla entrypoints måste finnas och innehålla en grind.
 *
 * Känt hål som INTE täcks av kartan (medvetet): app/api/admin/support-tickets/
 * [id]/reply/route.ts anropar thread-messages för Handymate-adminens egna
 * supportsvar — det är vår kostnad, inte kundens, och ska inte stoppas av
 * kundens Bränsle.
 */
const GRINDAS_I: Record<string, string[]> = {
  'lib/agent/agents/shared.ts': ['lib/agent/orchestrator.ts'],
  'lib/agents/shared/thinking-call.ts': [
    'app/api/cron/agent-observations/[agent]/route.ts',
    'app/api/cron/agent-observations/test/route.ts',
  ],
  'lib/agents/hanna/avtal-forslag.ts': ['app/api/cron/avtal-forslag/route.ts'],
  'lib/egenkontroll/photo-assessment.ts': ['lib/egenkontroll/analyze-and-queue.ts'],
  'lib/ai-quote-generator.ts': [
    'app/api/quotes/generate/route.ts',
    'app/api/quotes/ai-generate/route.ts',
    'lib/quotes/suggest-quote-draft.ts',
  ],
  'lib/storefront/generate-content.ts': [
    'app/api/storefront/generate/route.ts',
    'app/api/cron/hemsida-forslag/route.ts',
  ],
  'lib/communication-ai.ts': ['app/api/communication/evaluate/route.ts'],
  'lib/gmail-lead-detection.ts': [
    'app/api/cron/gmail-lead-import/route.ts',
    'app/api/email/inbound/route.ts',
  ],
  'lib/agent/thread-messages.ts': ['app/api/matte/chat/route.ts', 'app/api/agent/trigger/route.ts'],
  'lib/agents/memory.ts': ['app/api/agent/trigger/route.ts', 'app/api/matte/chat/route.ts'],
  'lib/pipeline-ai.ts': ['app/api/voice/analyze/route.ts'],
}


test.describe('1. Varje extern AI-fil bokför sin kostnad på en kund', () => {
  test('inventeringen är inte tom — markörerna hittar de kända ytorna', () => {
    const filer = externaAiFiler()
    expect(filer.length).toBeGreaterThan(30)
    expect(filer).toContain('app/api/matte/chat/route.ts')
    expect(filer).toContain('lib/agents/shared/thinking-call.ts')
  })

  test('mäter själv, mäts av namngiven anropare, eller saknar kund — inget fjärde alternativ', () => {
    const omatta: string[] = []
    for (const rel of externaAiFiler()) {
      if (MATER_SJALV.test(kod(rel))) continue
      if (MATS_AV_ANROPAREN[rel]) continue
      if (INGEN_KUND_ATT_BELASTA[rel]) continue
      omatta.push(rel)
    }
    expect(omatta, `externa AI-anrop utan bokföring på kund: ${omatta.join(', ')}`).toEqual([])
  })

  test('varje "mäts av anroparen"-post pekar på filer som finns och faktiskt bokför', () => {
    for (const [fil, anropare] of Object.entries(MATS_AV_ANROPAREN)) {
      expect(finns(fil), `${fil} finns inte längre — ta bort posten`).toBe(true)
      expect(anropare.length).toBeGreaterThan(0)
      for (const a of anropare) {
        expect(finns(a), `${a} (anropare till ${fil}) finns inte`).toBe(true)
        expect(MATER_SJALV.test(kod(a)), `${a} bokför inte kostnaden från ${fil}`).toBe(true)
      }
    }
  })

  test('kartorna är inga kyrkogårdar — varje post är fortfarande en extern AI-fil', () => {
    const faktiska = new Set(externaAiFiler())
    const döda = [
      ...Object.keys(MATS_AV_ANROPAREN),
      ...Object.keys(INGEN_KUND_ATT_BELASTA),
      ...Object.keys(GRINDAS_I),
    ].filter(f => !faktiska.has(f))
    expect(döda, `inte längre externa AI-filer — städa kartorna: ${döda.join(', ')}`).toEqual([])
  })

  test('den döda, omätta lib/ai.ts är borta och inget importerar den', () => {
    expect(finns('lib/ai.ts')).toBe(false)
    const refs = [...walk('lib'), ...walk('app'), ...walk('components')].filter(f => kod(f).includes("from '@/lib/ai'"))
    expect(refs).toEqual([])
  })
})

test.describe('2. Bränsletaket gäller varje AI-yta', () => {
  test('grindar själv, grindas i namngiven entrypoint, eller saknar kund', () => {
    const ogrindade: string[] = []
    for (const rel of externaAiFiler()) {
      if (GRINDAR_SJALV.test(kod(rel))) continue
      if (GRINDAS_I[rel]) continue
      if (INGEN_KUND_ATT_BELASTA[rel]) continue
      ogrindade.push(rel)
    }
    expect(ogrindade, `AI-ytor som kostar tokens utan Bränslekoll: ${ogrindade.join(', ')}`).toEqual([])
  })

  test('varje entrypoint i grindkartan finns och innehåller en grind', () => {
    for (const [fil, entrypoints] of Object.entries(GRINDAS_I)) {
      expect(entrypoints.length, `${fil} saknar entrypoints`).toBeGreaterThan(0)
      for (const e of entrypoints) {
        expect(finns(e), `${e} (entrypoint för ${fil}) finns inte`).toBe(true)
        expect(GRINDAR_SJALV.test(kod(e)), `${e} kontrollerar inte Bränslet före ${fil}`).toBe(true)
      }
    }
  })

  test('grinden följer samma planregel som mätaren — enterprise stoppas inte som "okänd plan"', () => {
    const s = kod('lib/costs/fuel.ts')
    const gate = s.slice(s.indexOf('export async function checkFuelGate'))
    expect(gate).not.toContain('FUEL_PLAN_BUDGET_ORE[config.subscription_plan]')
    expect(gate).toContain("if (error || !config?.subscription_plan)")
    // fuelAllows är en-radaren för libs/crons: samma väg som saknad API-nyckel
    expect(s).toContain('export async function fuelAllows(')
    expect(s).toContain('const fuel = await checkFuelGate(supabase, businessId)\n  if (fuel.allowed) return true')
  })

  test('ingen kund ⇒ ingen LLM: de valfria business_id-ytorna kör malltext utan id', () => {
    expect(kod('lib/leads/generate-letter.ts')).toContain('!business.business_id ||')
    expect(kod('lib/leads/neighbour-campaign.ts')).toContain('apiKey && params.businessId && (await fuelAllows(')
    expect(kod('lib/autopilot/generate-sms.ts')).toContain('apiKey && businessId && (await fuelAllows(')
    // lead-detektionen kan inte längre anropas utan mätkontext
    const g = kod('lib/gmail-lead-detection.ts')
    expect(g).not.toContain('meterCtx?: LeadDetectionMeterCtx')
    expect(g.match(/meterCtx: LeadDetectionMeterCtx/g)?.length).toBe(2)
  })

  test('Whisper-jobb som stoppas av Bränslet släpper sitt claim — markeras aldrig failed', () => {
    const s = kod('lib/meetings/process-job.ts')
    const gate = s.indexOf("fuelAllows(supabase, job.business_id, 'meeting_transcribe')")
    expect(gate).toBeGreaterThan(-1)
    const efter = s.slice(gate, gate + 700)
    expect(efter).toContain("update({ status: 'finalized', claimed_at: null")
    expect(efter).not.toContain("status: 'failed'")
  })

  test('inkommande signaler tappar inget när Bränslet är slut', () => {
    // Gmail-importen hoppar över kontot — mejlen ligger kvar olästa
    const g = kod('app/api/cron/gmail-lead-import/route.ts')
    const gate = g.indexOf("fuelAllows(supabase, businessId, 'gmail_lead_import')")
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(g.indexOf('ensureValidToken('))
    // Inbound-mejl: arkivering (2.9) sker FÖRE stoppet
    const i = kod('app/api/email/inbound/route.ts')
    expect(i.indexOf('email_conversations')).toBeLessThan(i.indexOf("fuelAllows(supabase, businessId, 'email_inbound_lead')"))
    // Matte: stoppet ger en tom beslutsrad — inga åtgärder, inget kundsvar
    const m = kod('lib/matte/intent-agent.ts')
    const stopp = m.slice(m.indexOf("intent: 'fuel_stopped'"), m.indexOf("intent: 'fuel_stopped'") + 300)
    expect(stopp).toContain('actions: []')
    expect(stopp).toContain('customerReply: { send: false')
  })
})

test.describe('3. Orkestratorn (V3 run_agent) mäter riktigt och lyder kostnadsvakten', () => {
  test('flat-taxan är borta — kostnaden är usage × modell', () => {
    const s = kod('lib/agent/orchestrator.ts')
    expect(s).not.toMatch(/0\.000009/)
    expect(s).toContain('llmCostUsd(result.usage, result.model)')
    expect(s).toContain("refType: 'agent_run'")
    expect(s).toContain('checkCostGuards(supabase, guardRow as CostGuardBusiness')
    // Vakten körs före klassificeringen (och därmed före varje modellanrop)
    expect(s.indexOf('checkCostGuards(')).toBeLessThan(s.indexOf('let agentType = classifyEvent('))
  })

  test('runAgentLoop returnerar usage per fält och modellen som körde', () => {
    const s = kod('lib/agent/agents/shared.ts')
    expect(s).toContain('usage.cache_read_input_tokens += response.usage?.cache_read_input_tokens || 0')
    expect(s).toContain('model: config.model,')
  })

  test('pipeline-analysen av samtal bokförs — var omätt fram till 2026-08-27', () => {
    const s = kod('lib/pipeline-ai.ts')
    expect(s).toContain("refType: 'pipeline_call_analysis'")
    expect(s.indexOf('meterDirectLlmCall({')).toBeLessThan(s.indexOf('const jsonMatch = text.match('))
  })
})

test.describe('4. Taket är 15 % av planpriset', () => {
  test('Bränslebudgeten per plan = 15 % av månadspriset (±1 kr)', () => {
    const { FUEL_PLAN_BUDGET_ORE } = require('../lib/costs/fuel')
    const fg = kod('lib/feature-gates.ts')
    const start = fg.indexOf('export const PLAN_PRICES_SEK')
    const block = fg.slice(start, fg.indexOf('}', start))
    for (const plan of ['starter', 'professional', 'business']) {
      const m = block.match(new RegExp(`${plan}:\\s*(\\d+)`))
      expect(m, `pris för ${plan} hittades inte i PLAN_PRICES_SEK`).not.toBeNull()
      const prisKr = Number(m![1])
      const budgetKr = FUEL_PLAN_BUDGET_ORE[plan] / 100
      expect(Math.abs(budgetKr - prisKr * 0.15), `${plan}: ${budgetKr} kr ≠ 15 % av ${prisKr} kr`).toBeLessThanOrEqual(1)
    }
  })
})
