/**
 * Facit för Bränsle-mätaren (2026-08-14) — kundvänd visualisering av
 * AI/API-kostnadsförbrukning, byggd ovanpå COGS-mätaren (cost_event).
 *
 * ═══ VARFÖR ETT EGET FACIT OCH INTE BARA cogs-matare.spec.ts ═══
 *
 * COGS-mätaren skyddar VÅR marginal (adminspärrad). Bränslet är en separat,
 * kundvänd yta byggd på samma källdata men med ett annat syfte — den får
 * ALDRIG läcka COGS-språk ("cogs"/"cost_ore"/"costOre") till kunden, och
 * dess ref_type→bucket-kategorisering måste vara uttömmande (ingen tyst
 * odefinierad hink) på samma sätt som COGS-mätarens "en skrivare per
 * faktum"-princip.
 *
 *   npx playwright test tests/bransle-matare.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  computeFuelLevel,
  bucketForRefType,
  fuelBudgetOreForPlan,
  resolveFuelWindowStart,
  weeksRemainingPhrase,
  FUEL_PLAN_BUDGET_ORE,
  fuelTopupOptionsForPlan,
  resolveFuelTopupOption,
  type FuelCostRow,
} from '../lib/costs/fuel'
import { MEASUREMENT_STARTED_AT } from '../lib/costs/report'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const kod = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')

test.describe('Bränsle — beräkningskärnan (ren funktion, ingen DB)', () => {
  const windowStart = new Date('2026-07-15T00:00:00Z')
  const windowEnd = new Date('2026-08-14T00:00:00Z')

  test('0 kr förbrukat → 100 % kvar, ingen veckoprognos', () => {
    const level = computeFuelLevel({ rows: [], planBudgetOre: 37_400, topupOreInWindow: 0, windowStart, windowEnd })
    expect(level.remainingPercent).toBe(100)
    expect(level.weeksRemaining).toBeNull()
    expect(level.state).toBe('normal')
  })

  test('överförbrukning klampas till 0 % kvar, inte negativt', () => {
    const rows: FuelCostRow[] = [{ resource: 'llm', cost_ore: 50_000, ref_type: 'agent_run', created_at: windowEnd.toISOString() }]
    const level = computeFuelLevel({ rows, planBudgetOre: 37_400, topupOreInWindow: 0, windowStart, windowEnd })
    expect(level.remainingPercent).toBe(0)
    expect(level.usedRatio).toBeGreaterThan(1)
    expect(level.remainingOre).toBe(0)
    expect(level.exhausted).toBe(true)
  })

  test('påfyllningsnivåerna är 25/50/100 % och belopp härleds ur planen', () => {
    expect(fuelTopupOptionsForPlan('professional')).toEqual([
      { id: 'quarter', label: 'Liten påfyllning', percent: 25, amountOre: 22_500 },
      { id: 'half', label: 'Halv tank', percent: 50, amountOre: 45_000 },
      { id: 'full', label: 'Full tank', percent: 100, amountOre: 90_000 },
    ])
    expect(resolveFuelTopupOption('professional', 'eget-belopp')).toBeNull()
    expect(resolveFuelTopupOption('okand-plan', 'full')).toBeNull()
  })

  test('en Stripe-påfyllning i fönstret höjer budgeten, inte bara sänker förbrukningen', () => {
    const rows: FuelCostRow[] = [{ resource: 'sms', cost_ore: 10_000, ref_type: 'sms_log', created_at: windowEnd.toISOString() }]
    const utan = computeFuelLevel({ rows, planBudgetOre: 37_400, topupOreInWindow: 0, windowStart, windowEnd })
    const med = computeFuelLevel({ rows, planBudgetOre: 37_400, topupOreInWindow: 20_000, windowStart, windowEnd })
    expect(med.budgetOre).toBe(utan.budgetOre + 20_000)
    expect(med.remainingPercent).toBeGreaterThan(utan.remainingPercent)
  })

  test('bucket-summan är 100 % av förbrukningen (avrundningsfel undantaget)', () => {
    const rows: FuelCostRow[] = [
      { resource: 'sms', cost_ore: 3_000, ref_type: 'sms_log', created_at: windowEnd.toISOString() },
      { resource: 'llm', cost_ore: 2_000, ref_type: 'quote_ai_generate', created_at: windowEnd.toISOString() },
      { resource: 'llm', cost_ore: 1_000, ref_type: 'agent_context_nightly', created_at: windowEnd.toISOString() },
    ]
    const level = computeFuelLevel({ rows, planBudgetOre: 37_400, topupOreInWindow: 0, windowStart, windowEnd })
    const sum = level.buckets.reduce((s, b) => s + b.percent, 0)
    expect(sum).toBeGreaterThanOrEqual(99)
    expect(sum).toBeLessThanOrEqual(101)
  })

  test('okänd ref_type faller aldrig tyst — hamnar i night_work och loggas', () => {
    const varnat: string[] = []
    const origWarn = console.warn
    console.warn = (msg: string) => varnat.push(msg)
    try {
      expect(bucketForRefType('nagot_helt_nytt')).toBe('night_work')
      expect(bucketForRefType(null)).toBe('night_work')
    } finally {
      console.warn = origWarn
    }
    expect(varnat.some(m => /okänd ref_type/.test(m))).toBe(true)
  })

  test('planbudget matchar tasks/cost-cap-analysis.md §6 exakt', () => {
    expect(FUEL_PLAN_BUDGET_ORE.starter).toBe(37_400)
    expect(FUEL_PLAN_BUDGET_ORE.professional).toBe(90_000)
    expect(FUEL_PLAN_BUDGET_ORE.business).toBe(180_000)
    expect(fuelBudgetOreForPlan('enterprise')).toBe(FUEL_PLAN_BUDGET_ORE.business)
    expect(fuelBudgetOreForPlan(null)).toBe(FUEL_PLAN_BUDGET_ORE.business)
  })

  test('en tydlig topp-dag highlightas, en jämn förbrukning highlightas inte', () => {
    const jamn: FuelCostRow[] = new Array(30).fill(0).map((_, i) => ({
      resource: 'llm', cost_ore: 100, ref_type: 'agent_run',
      created_at: new Date(windowStart.getTime() + i * 86_400_000).toISOString(),
    }))
    const jamnLevel = computeFuelLevel({ rows: jamn, planBudgetOre: 37_400, topupOreInWindow: 0, windowStart, windowEnd })
    expect(jamnLevel.highlightIndex).toBeNull()

    const medTopp = jamn.map((r, i) => (i === 5 ? { ...r, cost_ore: 5_000 } : r))
    const toppLevel = computeFuelLevel({ rows: medTopp, planBudgetOre: 37_400, topupOreInWindow: 0, windowStart, windowEnd })
    expect(toppLevel.highlightIndex).toBe(5)
  })

  // "now" satt långt efter MEASUREMENT_STARTED_AT (2026-08-08) så att
  // golvtestet nedan är det ENDA som avsiktligt triggar golvet — annars
  // döljer golvet vad ankrings-/fallback-logiken faktiskt gör.
  const senareNow = new Date('2026-09-20T12:00:00Z')

  test('fönstret ankras till förnyelsedatumet — Andreas-beslut 2026-08-14', () => {
    const forra = new Date('2026-09-01T00:00:00Z') // < 30 dagar sen, ny period
    expect(resolveFuelWindowStart(senareNow, forra.toISOString()).getTime()).toBe(forra.getTime())
  })

  test('saknad förnyelsedag faller tillbaka till rent glidande 30 dagar', () => {
    const utanFornyelse = resolveFuelWindowStart(senareNow, null)
    expect(utanFornyelse.getTime()).toBe(senareNow.getTime() - 30 * 86_400_000)
  })

  test('en förnyelsedag i framtiden (klockskev/testdata) ignoreras, faller tillbaka', () => {
    const framtid = new Date('2026-10-01T00:00:00Z')
    const fallback = resolveFuelWindowStart(senareNow, framtid.toISOString())
    expect(fallback.getTime()).toBe(senareNow.getTime() - 30 * 86_400_000)
  })

  test('golvet mot MEASUREMENT_STARTED_AT vinner alltid, oavsett anledning', () => {
    const alldelesForGammal = new Date('2026-01-01T00:00:00Z')
    expect(resolveFuelWindowStart(senareNow, alldelesForGammal.toISOString()).toISOString().slice(0, 10))
      .toBe(MEASUREMENT_STARTED_AT)
  })

  test('daysRemaining och weeksRemaining kommer från samma bråktal', () => {
    // 100 000 öre budget, 700 öre/dag förbrukat, 30-dagarsfönster →
    // 300 kr kvar / 700 öre/dag ≈ 42,9 dagar ≈ 6 veckor.
    const rows: FuelCostRow[] = new Array(30).fill(0).map((_, i) => ({
      resource: 'llm', cost_ore: 700, ref_type: 'agent_run',
      created_at: new Date(windowStart.getTime() + i * 86_400_000).toISOString(),
    }))
    const level = computeFuelLevel({ rows, planBudgetOre: 100_000, topupOreInWindow: 0, windowStart, windowEnd })
    expect(level.daysRemaining).not.toBeNull()
    expect(Math.round(level.daysRemaining! / 7)).toBe(level.weeksRemaining)
  })

  test('weeksRemainingPhrase växlar till dagar under en vecka i stället för "0 veckor"', () => {
    expect(weeksRemainingPhrase(0, 4)).toBe('Räcker ungefär 4 dagar till')
    expect(weeksRemainingPhrase(0, 1)).toBe('Räcker ungefär en dag till')
    expect(weeksRemainingPhrase(0, 0)).toBe('Tar snart slut')
    expect(weeksRemainingPhrase(0, null)).toBe('Tar snart slut')
  })

  test('weeksRemainingPhrase säger veckor så fort minst en hel vecka återstår', () => {
    expect(weeksRemainingPhrase(1, 9)).toBe('Räcker ungefär en vecka till')
    expect(weeksRemainingPhrase(4, 30)).toBe('Räcker ungefär 4 veckor till')
  })

  test('state-trösklar: normal >30%, low <=30%, critical <=10%', () => {
    const withUsage = (usedOre: number) =>
      computeFuelLevel({
        rows: [{ resource: 'llm', cost_ore: usedOre, ref_type: 'agent_run', created_at: windowEnd.toISOString() }],
        planBudgetOre: 100_000,
        topupOreInWindow: 0,
        windowStart,
        windowEnd,
      })
    expect(withUsage(50_000).state).toBe('normal') // 50% kvar
    expect(withUsage(75_000).state).toBe('low')     // 25% kvar
    expect(withUsage(95_000).state).toBe('critical') // 5% kvar
  })
})

test.describe('Bränsle läcker aldrig COGS-språk till kunden', () => {
  test('billing-sidan innehåller aldrig cogs/cost_ore/costOre', () => {
    const s = kod('app/dashboard/settings/billing/page.tsx')
    expect(s, 'COGS-läckage i billing/page.tsx').not.toMatch(/cogs|cost_ore|costOre/i)
  })

  test('FuelBillingCard innehåller aldrig cogs/cost_ore/costOre', () => {
    const s = kod('components/fuel/FuelBillingCard.tsx')
    expect(s, 'COGS-läckage i FuelBillingCard.tsx').not.toMatch(/cogs|cost_ore|costOre/i)
  })
})

test.describe('Bränsle — ref_type-kategoriseringen är uttömmande', () => {
  // Samma teknik som cogs-matare.spec.ts använder för LLM-skrivare: gå igenom
  // lib/ och app/, hitta varje refType: '...'-literal, jämför mot fuel.ts:s
  // REF_TYPE_BUCKET (indirekt, via bucketForRefType). Facit: ingen ref_type
  // får falla igenom odokumenterad (loggar en varning) i praktiken.
  function allaRefTypes(): Set<string> {
    const träffar = new Set<string>()
    const gå = (dir: string) => {
      let poster
      try {
        poster = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
      } catch {
        return
      }
      for (const f of poster) {
        const rel = `${dir}/${f.name}`
        if (f.isDirectory()) {
          if (f.name === 'node_modules' || f.name === '.next') continue
          gå(rel)
        } else if (/\.tsx?$/.test(f.name)) {
          const matcher = Array.from(kod(rel).matchAll(/refType:\s*'([a-z_]+)'/g))
          for (const m of matcher) träffar.add(m[1])
        }
      }
    }
    for (const rot of ['lib', 'app']) gå(rot)
    return träffar
  }

  test('varje ref_type i kodbasen har en explicit bucket-mappning', () => {
    const varnat: string[] = []
    const origWarn = console.warn
    console.warn = (msg: string) => {
      if (/okänd ref_type/.test(msg)) varnat.push(msg)
    }
    try {
      for (const refType of Array.from(allaRefTypes())) bucketForRefType(refType)
    } finally {
      console.warn = origWarn
    }
    expect(varnat, `ref_type utan bucket-mappning: ${varnat.join('; ')}`).toEqual([])
  })
})

test.describe('Bränsle-webhooken', () => {
  test('fuel_topup-grenen skriver fuel_ledger och billing_event, tidig retur', () => {
    const s = kod('app/api/billing/webhook/route.ts')
    const grenStart = s.indexOf("session.metadata?.addon === 'fuel_topup'")
    expect(grenStart, 'fuel_topup-grenen saknas').toBeGreaterThan(-1)
    const efterGren = s.slice(grenStart)
    expect(efterGren).toContain("from('fuel_ledger')")
    expect(efterGren).toContain('`fuel_${session.id}`')
    expect(efterGren).toContain('ignoreDuplicates: true')
    expect(efterGren).toContain('if (ledgerError)')
    expect(efterGren).toContain("event_type: 'fuel_topup_completed'")
    // Måste ligga FÖRE prenumerationslogiken (planId/subscription_status) —
    // annars skriver ett fuel-köp av misstag över kundens riktiga plan.
    const planUppdatering = s.indexOf('subscription_plan: planId')
    expect(planUppdatering).toBeGreaterThan(grenStart)
  })

  test('fuel-topup-routen kräver ägare/admin, inte bara inloggning', () => {
    const s = kod('app/api/billing/fuel-topup/route.ts')
    expect(s).toContain('isOwnerOrAdmin(currentUser)')
    expect(s).toContain("mode: 'payment'")
  })

  test('påfyllningsbeloppet härleds server-side från en whitelistad nivå', () => {
    const s = kod('app/api/billing/fuel-topup/route.ts')
    expect(s).toContain('resolveFuelTopupOption')
    expect(s).toContain('body.tier')
    expect(s).not.toContain('body.amountOre')
  })

  test('kundytan erbjuder de tre namngivna nivåerna — inte ett fritt belopp', () => {
    const s = kod('components/fuel/FuelBillingCard.tsx')
    expect(s).toContain('fuelTopupOptionsForPlan')
    expect(s).toContain('option.id')
    expect(s).toContain('option.amountOre')
  })
})

test.describe('Bränslet är ett serverauktoritativt stopp, inte bara en mätare', () => {
  test('agenternas kostnadsvakt stoppar på Bränsle före det interna USD-taket', () => {
    const s = kod('lib/agents/shared/cost-guard.ts')
    const fuel = s.indexOf('checkFuelGate')
    const internal = s.indexOf("from('agent_runs')")
    expect(fuel).toBeGreaterThan(-1)
    expect(internal).toBeGreaterThan(fuel)
    expect(s).toContain("'fuel_exhausted'")
    expect(s).toContain("'fuel_unavailable'")
    expect(s).toContain('skipped: fuel.reason')
  })

  test('Matte kontrollerar Bränslet före modellkallet', () => {
    const s = kod('app/api/matte/chat/route.ts')
    expect(s.indexOf('checkFuelGate')).toBeGreaterThan(-1)
    expect(s.indexOf('callClaude')).toBeGreaterThan(s.indexOf('checkFuelGate'))
  })

  test('den centrala SMS-strypunkten kontrollerar Bränslet före 46elks', () => {
    const s = kod('lib/sms-send.ts')
    expect(s.indexOf('checkFuelGate')).toBeGreaterThan(-1)
    expect(s.indexOf("fetch('https://api.46elks.com/a1/sms'")).toBeGreaterThan(s.indexOf('checkFuelGate'))
  })

  test('kundtrigger och systemtrigger kan inte gå runt Bränslet', () => {
    const s = kod('app/api/agent/trigger/route.ts')
    expect(s).toContain('checkFuelGate')
    expect(s).toContain('checkCostGuards')
    expect(s).toContain('fuel_stopped')
  })

  for (const route of [
    'app/api/campaigns/generate-text/route.ts',
    'app/api/jobbuddy/photo/route.ts',
    'app/api/jobbuddy/voice/route.ts',
    'app/api/quotes/generate/route.ts',
    'app/api/quotes/transcribe-voice/route.ts',
    'app/api/matte/transcribe/route.ts',
    'app/api/voice/process/route.ts',
    'app/api/voice/transcribe/route.ts',
    'app/api/voice/analyze/route.ts',
    'app/api/widget/chat/route.ts',
  ]) {
    test(`${route} kontrollerar Bränslet före ny extern AI-kostnad`, () => {
      const s = kod(route)
      const gate = s.indexOf('const fuel = await checkFuelGate')
      const externalCalls = [
        s.indexOf('anthropic.messages.create'),
        s.indexOf("fetch('https://api.openai.com"),
        s.lastIndexOf('anthropic.messages.create'),
        s.lastIndexOf("fetch('https://api.openai.com"),
      ].filter(index => index > gate)
      expect(gate, `${route} saknar checkFuelGate`).toBeGreaterThan(-1)
      expect(externalCalls.length, `${route} saknar förväntad extern AI-kostnad`).toBeGreaterThan(0)
      expect(Math.min(...externalCalls), `${route} saknar ett externt anrop efter Bränslekontrollen`).toBeGreaterThan(gate)
    })
  }
})
