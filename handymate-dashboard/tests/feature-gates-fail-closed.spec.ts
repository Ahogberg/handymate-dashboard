/**
 * L1 (2026-08-18) — hasFeature() var fail-open på okänd nyckel: en
 * felstavad eller bortglömd FEATURE_GATES-post gav ALLA planer åtkomst
 * i stället för ingen. checkFeatureAccess() (lib/auth.ts) och
 * useBusinessPlan().hasFeature() ärver samma beteende, så bucklan hade
 * öppnat en betalfunktion tyst för starter-kunder.
 *
 * Facit: okänd nyckel = false, för varje plan. Alla verkliga gate-nycklar
 * som faktiskt anropas i kodbasen (grep-verifierad, se lib/feature-gates.ts
 * FEATURE_GATES) ska fortsätta fungera precis som förut.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/feature-gates-fail-closed.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { hasFeature, FEATURE_GATES, type PlanType } from '../lib/feature-gates'

const PLANS: PlanType[] = ['starter', 'professional', 'business']

test.describe('hasFeature — fail-closed på okänd nyckel', () => {
  for (const plan of PLANS) {
    test(`okänd nyckel nekas för ${plan}`, () => {
      expect(hasFeature(plan, 'den_har_finns_inte')).toBe(false)
    })
  }

  test('tom sträng nekas', () => {
    expect(hasFeature('starter', '')).toBe(false)
  })
})

test.describe('hasFeature — kända nycklar oförändrat beteende', () => {
  test('en ALLA PLANER-nyckel är tillåten för starter', () => {
    expect(hasFeature('starter', 'quotes')).toBe(true)
  })

  test('en PROFESSIONAL+BUSINESS-nyckel nekas för starter', () => {
    expect(hasFeature('starter', 'fortnox_integration')).toBe(false)
  })

  test('en PROFESSIONAL+BUSINESS-nyckel tillåts för professional', () => {
    expect(hasFeature('professional', 'fortnox_integration')).toBe(true)
  })

  test('en BUSINESS ONLY-nyckel nekas för professional', () => {
    expect(hasFeature('professional', 'custom_ai_voice')).toBe(false)
  })
})

/**
 * Facit-listan över callsites (grep 2026-08-18): hasFeature()/checkFeatureAccess()
 * anropas med dessa nycklar i kodbasen. Testet nedan låser att alla faktiskt
 * finns i FEATURE_GATES — annars skulle fail-closed-fixet tyst stänga av en
 * levande yta.
 *
 *   components/Sidebar.tsx           → lead_intelligence
 *   lib/autopilot/trigger.ts         → deal_autopilot
 *   app/dashboard/website/page.tsx   → storefront_basic
 *   app/dashboard/marketing/leads/page.tsx → leads_outbound
 *   app/dashboard/settings/website-widget/page.tsx → website_widget
 *   app/dashboard/settings/quote-templates/page.tsx → quote_templates
 *   app/api/widget/config/route.ts   → website_widget
 *   app/api/widget/analytics/route.ts → website_widget
 *   app/api/warranties/route.ts      → warranty_tracking
 *   app/api/automations/route.ts     → nurture_sequences
 *   app/api/analytics/win-loss/route.ts → lead_intelligence
 *   app/api/analytics/speed-to-lead/route.ts → lead_intelligence
 *   app/api/analytics/insights/route.ts → lead_intelligence
 *   app/api/subcontractors/route.ts  → subcontractors
 *   app/api/inventory/transaction/route.ts → inventory
 *   app/api/inventory/route.ts       → inventory
 *   app/api/nurture/route.ts         → nurture_sequences
 *   app/api/lead-sources/route.ts    → lead_generation
 */
const CALLSITE_KEYS = [
  'lead_intelligence',
  'deal_autopilot',
  'storefront_basic',
  'leads_outbound',
  'website_widget',
  'quote_templates',
  'warranty_tracking',
  'nurture_sequences',
  'subcontractors',
  'inventory',
  'lead_generation',
]

test.describe('facit — alla kända callsite-nycklar finns i FEATURE_GATES', () => {
  for (const key of CALLSITE_KEYS) {
    test(`${key} finns`, () => {
      expect(FEATURE_GATES[key], `Nyckeln "${key}" saknas i FEATURE_GATES — fail-closed skulle stänga av en levande yta`).toBeDefined()
    })
  }
})
