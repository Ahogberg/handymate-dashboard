/**
 * Facit för LLM-kostnadstaket (2026-08-14).
 *
 * ═══ DET SOM VAKTAS ═══
 *
 * `resolveCostCapUsd` (lib/agents/shared/cost-guard.ts) avgör hur mycket
 * Handymate får spendera på bakgrunds-LLM-anrop per företag och dygn
 * innan körningarna stängs av för dagen — satt för att skydda 85-90 %
 * bruttomarginal (Andreas-beslut 2026-07-31). Fel här är antingen en
 * marginal som läcker (taket för högt) eller en kund som tystnar en dag
 * i onödan (taket för lågt).
 *
 * Körs utan browser/session:
 *   npx playwright test tests/cost-guard-cap.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { resolveCostCapUsd, PLAN_COST_CAPS_USD } from '../lib/agents/shared/cost-guard'

test.describe('resolveCostCapUsd — prioritet: explicit > plan > default', () => {
  test('ett explicit satt tak vinner alltid, även om det ligger UNDER planens tak', () => {
    const cap = resolveCostCapUsd({ agent_cost_cap_usd_daily: 2, subscription_plan: 'business' })
    expect(cap).toBe(2) // INTE PLAN_COST_CAPS_USD.business (8.0)
  })

  test('ett explicit satt tak vinner även om det ligger ÖVER planens tak', () => {
    const cap = resolveCostCapUsd({ agent_cost_cap_usd_daily: 15, subscription_plan: 'starter' })
    expect(cap).toBe(15)
  })

  test('ett explicit tak på 0 kr STÄNGER AV — != null måste vinna, inte en falsy-koll', () => {
    // Om koden av misstag skrev `if (business.agent_cost_cap_usd_daily)`
    // istället för `!= null` hade 0 tolkats som "inget satt" och fallit
    // igenom till planens tak — precis fällan ai_price_missing/labor_amount
    // redan är kända för i den här kodbasen.
    const cap = resolveCostCapUsd({ agent_cost_cap_usd_daily: 0, subscription_plan: 'business' })
    expect(cap).toBe(0)
  })

  test('utan explicit tak avgör planen — starter/professional/business ger olika tak', () => {
    expect(resolveCostCapUsd({ subscription_plan: 'starter' })).toBe(PLAN_COST_CAPS_USD.starter)
    expect(resolveCostCapUsd({ subscription_plan: 'professional' })).toBe(PLAN_COST_CAPS_USD.professional)
    expect(resolveCostCapUsd({ subscription_plan: 'business' })).toBe(PLAN_COST_CAPS_USD.business)
    expect(PLAN_COST_CAPS_USD.starter).toBeLessThan(PLAN_COST_CAPS_USD.professional)
    expect(PLAN_COST_CAPS_USD.professional).toBeLessThan(PLAN_COST_CAPS_USD.business)
  })

  test('ett okänt/gammalt plan-värde faller tillbaka på default-taket, kraschar inte', () => {
    const cap = resolveCostCapUsd({ subscription_plan: 'ett_plan_som_slutade_saljas_2025' })
    expect(cap).toBe(5.0)
  })

  test('varken explicit tak eller plan satt → default 5 USD/dygn', () => {
    expect(resolveCostCapUsd({})).toBe(5.0)
  })

  test('null-värden behandlas som "inte satt", inte som 0', () => {
    const cap = resolveCostCapUsd({ agent_cost_cap_usd_daily: null, subscription_plan: null })
    expect(cap).toBe(5.0)
  })

  test('ett tak skickat som sträng (formulärdata) tolkas som tal, inte NaN', () => {
    const cap = resolveCostCapUsd({ agent_cost_cap_usd_daily: '3.5' })
    expect(cap).toBe(3.5)
    expect(Number.isNaN(cap)).toBe(false)
  })
})
