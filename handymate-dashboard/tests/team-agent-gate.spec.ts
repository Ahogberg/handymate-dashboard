/**
 * L1 (2026-08-18) — TEAM_AGENTS_ALLOWED måste upprätthållas server-side i
 * app/api/agent/trigger/route.ts, inte bara i UI:t
 * (app/dashboard/agent/page.tsx:~1161 grindar bara vilken avatar en kund kan
 * klicka på). isAgentAllowed() är den enda platsen beslutet fattas — låst
 * här så att UI-grinden och API-grinden aldrig kan glida isär.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/team-agent-gate.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { isAgentAllowed, TEAM_AGENTS_ALLOWED, type PlanType } from '../lib/feature-gates'

test.describe('isAgentAllowed — Bas (starter) får bara Matte', () => {
  test('matte är tillåten', () => {
    expect(isAgentAllowed('starter', 'matte')).toBe(true)
  })

  for (const specialist of ['karin', 'hanna', 'daniel', 'lars', 'lisa']) {
    test(`${specialist} nekas`, () => {
      expect(isAgentAllowed('starter', specialist)).toBe(false)
    })
  }
})

test.describe('isAgentAllowed — Firman (professional) och Storfirman (business) får hela teamet', () => {
  for (const plan of ['professional', 'business'] as PlanType[]) {
    for (const agent of TEAM_AGENTS_ALLOWED.business) {
      test(`${plan}: ${agent} tillåten`, () => {
        expect(isAgentAllowed(plan, agent)).toBe(true)
      })
    }
  }
})

test.describe('isAgentAllowed — okänd plan/agent (fail-closed)', () => {
  test('okänd agent-id nekas för alla planer', () => {
    expect(isAgentAllowed('business', 'påhittad_agent')).toBe(false)
  })

  test('saknad plan (typad genväg runt fallback) nekas — matchar route.ts default till starter', () => {
    // app/api/agent/trigger/route.ts faller till 'starter' när guardConfig
    // saknar subscription_plan — samma konservativa fallback testas här.
    const fallbackPlan: PlanType = 'starter'
    expect(isAgentAllowed(fallbackPlan, 'karin')).toBe(false)
  })
})
