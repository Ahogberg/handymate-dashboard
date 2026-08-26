/**
 * Årsavtal — permanent årsplan (Andreas-beslut 2026-08-19, exakt paketering):
 * "betala för 10 månader, få 12" (2 månader på köpet).
 *   Firman (professional):  59 950 kr/år
 *   Storfirman (business): 119 950 kr/år
 *   starter/Bas: inget årspris (säljs inte publikt).
 *
 * getPlanYearlyPrice (lib/feature-gates.ts) är den kanoniska källan — ingen
 * yta får hårdkoda 59950/119950/4996 själv. Checkout-rutterna (onboarding-
 * checkout + checkout) måste fail-closed:a på interval='yearly' utan en
 * aktiverad årsrad (stripe_price_id NULL tills Andreas klistrat in det från
 * Stripe Dashboard) — aldrig tyst fallback till fel pris.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/yearly-plan.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  getPlanPrice,
  getPlanYearlyPrice,
  YEARLY_MONTHS_FREE,
  SMS_QUOTAS,
  type PlanType,
} from '../lib/feature-gates'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('getPlanYearlyPrice — beloppen', () => {
  test('professional (Firman) = 59 950 kr/år', () => {
    expect(getPlanYearlyPrice('professional')).toBe(59950)
  })

  test('business (Storfirman) = 119 950 kr/år', () => {
    expect(getPlanYearlyPrice('business')).toBe(119950)
  })

  test('starter (Bas) har inget årspris — säljs inte publikt', () => {
    expect(getPlanYearlyPrice('starter')).toBeNull()
  })

  test('okänd plan faller ALDRIG till ett pris (fail-closed)', () => {
    expect(getPlanYearlyPrice('påhittad' as PlanType)).toBeNull()
  })

  test('YEARLY_MONTHS_FREE = 2 ("betala för 10, få 12")', () => {
    expect(YEARLY_MONTHS_FREE).toBe(2)
  })

  test('årspriset är exakt 10x månadspriset (betala-för-10-månader-modellen)', () => {
    expect(getPlanYearlyPrice('professional')).toBe(getPlanPrice('professional') * 10)
    expect(getPlanYearlyPrice('business')).toBe(getPlanPrice('business') * 10)
  })
})

test.describe('checkout-rutterna — interval-whitelist och fail-closed', () => {
  const routes = [
    'app/api/billing/onboarding-checkout/route.ts',
    'app/api/billing/checkout/route.ts',
  ]

  for (const routePath of routes) {
    test.describe(routePath, () => {
      test('interval whitelistas — allt utom monthly/yearly är 400', () => {
        const s = read(routePath)
        expect(s).toContain("ALLOWED_INTERVALS = ['monthly', 'yearly']")
        expect(s).toContain('ALLOWED_INTERVALS.includes(interval)')
        expect(s).toContain('Ogiltigt faktureringsintervall')
      })

      test('default är monthly när interval saknas — befintligt flöde oförändrat', () => {
        const s = read(routePath)
        expect(s).toContain("rawInterval ?? 'monthly'")
      })

      test('yearly slår upp en egen prisrad (planId_yearly), inte samma rad som monthly', () => {
        const s = read(routePath)
        expect(s).toContain("`${planId}_yearly`")
      })

      test('yearly utan aktiverat stripe_price_id ger 400 med svensk text — ingen tyst fallback', () => {
        const s = read(routePath)
        expect(s).toContain('Årsbetalning är inte aktiverad ännu — välj månadsvis.')
        // Grinden sitter i EN gemensam if (!plan.stripe_price_id)-gren för
        // båda intervallen — inte en tyst fallback till planId (monthly).
        const grindIdx = s.indexOf('if (!plan.stripe_price_id)')
        const yearlyMsgIdx = s.indexOf('Årsbetalning är inte aktiverad ännu')
        expect(grindIdx).toBeGreaterThan(-1)
        expect(yearlyMsgIdx).toBeGreaterThan(grindIdx)
      })

      test('metadata.plan_id till Stripe/webhooken förblir ALLTID basplanen, aldrig årsradens plan_id', () => {
        const s = read(routePath)
        // plan_id: planId (variabeln från requestet) måste förekomma i
        // metadata — INTE plan.plan_id (den uppslagna, ev. yearly-suffixade
        // raden). subscription_plan läses som PlanType på 40+ ställen i
        // kodbasen; en yearly-suffixad plan_id där hade fail-closed nollat
        // feature-gates/SMS-kvoter/agentgrindar för varje årskund.
        expect(s).toContain('plan_id: planId')
        expect(s).not.toContain('plan_id: plan.plan_id')
      })

      test('billing_interval loggas i metadata för spårbarhet', () => {
        const s = read(routePath)
        expect(s).toContain('billing_interval: interval')
      })
    })
  }
})

test.describe('Step5Activate — köpflödet i onboarding', () => {
  const FILE = 'app/onboarding/components/Step5Activate.tsx'

  test('importerar getPlanCommercialFacts/YEARLY_MONTHS_FREE — alla plansiffror kommer från samma källa', () => {
    const s = read(FILE)
    expect(s).toContain('getPlanCommercialFacts')
    expect(s).toContain('YEARLY_MONTHS_FREE')
  })

  test('inga hårdkodade årsprisbelopp i komponenten (måste beräknas ur feature-gates)', () => {
    const s = read(FILE)
    for (const literal of ['59950', '59 950', '119950', '119 950', '4996', '4 996']) {
      expect(s, `hittade hårdkodat "${literal}" — ska beräknas ur getPlanYearlyPrice/getPlanPrice`).not.toContain(literal)
    }
  })

  test('Månadsvis/Årsvis-toggle finns, default monthly', () => {
    const s = read(FILE)
    expect(s).toContain('Månadsvis')
    expect(s).toContain('Årsvis')
    expect(s).toContain("useState<'monthly' | 'yearly'>('monthly')")
  })

  test('badge "2 månader på köpet" på toggeln', () => {
    const s = read(FILE)
    expect(s).toContain('månader på köpet')
  })

  test('garantiraden kompletteras med "Gäller även årsavtal." när Årsvis är valt', () => {
    const s = read(FILE)
    expect(s).toContain("billingInterval === 'yearly'")
    expect(s).toContain('Gäller även årsavtal.')
    expect(s).toContain('STANDARD_GUARANTEE_DAYS')
    expect(s).toContain('FOUNDERS_GUARANTEE_DAYS')
    expect(s).toContain('{guaranteeDays} dagars resultatgaranti')
    expect(s).toContain('pengarna tillbaka')
  })

  test('interval skickas med till checkouten', () => {
    const s = read(FILE)
    expect(s).toContain('interval: billingInterval')
  })
})

test.describe('Billing-sidan (Inställningar) — årsalternativ vid plan-byte', () => {
  const FILE = 'app/dashboard/settings/billing/page.tsx'

  test('importerar getPlanCommercialFacts/YEARLY_MONTHS_FREE — alla plansiffror kommer från samma källa', () => {
    const s = read(FILE)
    expect(s).toContain('getPlanCommercialFacts')
    expect(s).toContain('YEARLY_MONTHS_FREE')
  })

  test('inga hårdkodade årsprisbelopp i komponenten', () => {
    const s = read(FILE)
    for (const literal of ['59950', '59 950', '119950', '119 950', '4996', '4 996']) {
      expect(s, `hittade hårdkodat "${literal}" — ska beräknas ur getPlanYearlyPrice/getPlanPrice`).not.toContain(literal)
    }
  })

  test('Månadsvis/Årsvis-toggle finns vid plan-bytet', () => {
    const s = read(FILE)
    expect(s).toContain('Månadsvis')
    expect(s).toContain('Årsvis')
  })

  test('garantitexten nämns explicit när Årsvis visas', () => {
    const s = read(FILE)
    expect(s).toContain('STANDARD_GUARANTEE_DAYS')
    expect(s).toContain('FOUNDERS_GUARANTEE_DAYS')
    expect(s).toContain('{guaranteeDays} dagars pengarna-tillbaka-garanti')
    expect(s).toContain('Gäller även årsavtal.')
  })

  test('interval skickas med till checkouten vid plan-byte', () => {
    const s = read(FILE)
    expect(s).toContain('interval: billingInterval')
  })
})

test.describe('SMS-kvoter är orörda av årsavtalsbygget', () => {
  test('SMS_QUOTAS är per månad och identiska med innan — faktureringsintervall påverkar dem inte', () => {
    expect(SMS_QUOTAS.starter).toEqual({ monthlyQuota: 50, extraCostSek: 0.89, hardCap: 200 })
    expect(SMS_QUOTAS.professional).toEqual({ monthlyQuota: 300, extraCostSek: 0.79, hardCap: 1000 })
    expect(SMS_QUOTAS.business).toEqual({ monthlyQuota: 1000, extraCostSek: 0.69, hardCap: 5000 })
  })
})
