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
  FUEL_PLAN_BUDGET_ORE,
  type FuelCostRow,
} from '../lib/costs/fuel'

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
})
