/**
 * Facit: Genomgången före betalningen (2026-09-02,
 * tasks/plan-genomgang-fore-betalning.md).
 *
 * Beslut: betalningen ligger EFTER importen och en genomgång av kundens
 * egen firma, så kunden betalar för något den redan sett i sina egna
 * siffror. INGEN prova-på: ingen dashboard, inga agenter, inga kort före
 * betalningen. Genomgången är räknefrågor (GET /api/onboarding/company-scan),
 * ingen AI.
 *
 * Browserlöst — samma idiom som övriga onboarding-facit: källskanning +
 * rena funktioner, ingen session/DOM krävs.
 *
 *   npx playwright test tests/genomgang-fore-betalning.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { buildScanRows, teamGorNarDuAktiverar, type ScanRow } from '../lib/onboarding/company-scan-rows'
import { FUNNEL_FINAL_STEP, STEG_ETIKETTER } from '../lib/onboarding/funnel'
import type { CompanyScanResult } from '../app/api/onboarding/company-scan/route'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

function tomtResultat(): CompanyScanResult {
  return {
    customerCount: 0,
    openInvoicesCount: 0,
    activeProjectsCount: 0,
    openQuotesCount: 0,
    staleQuotesCount: 0,
    pendingApprovalsCount: 0,
    karinHeadline: null,
  }
}

test.describe('app/onboarding/page.tsx — ny stegordning', () => {
  const src = read('app/onboarding/page.tsx')

  test('TOTAL_STEPS är 9', () => {
    expect(src).toContain('const TOTAL_STEPS = 9')
  })

  test('ordningen: Import(4) < Genomgång(5) < Aktivera(6) < Artikelregister(7) < Rundtur(8)', () => {
    const importIndex = src.indexOf('{step === 4 &&')
    const genomgangIndex = src.indexOf('{step === 5 &&')
    const activateIndex = src.indexOf('{step === 6 &&')
    const productIndex = src.indexOf('{step === 7 &&')
    const liveTourIndex = src.indexOf('step === 8 && !launchRequested && <Step6LiveTour')

    expect(importIndex).toBeGreaterThan(-1)
    expect(genomgangIndex).toBeGreaterThan(importIndex)
    expect(activateIndex).toBeGreaterThan(genomgangIndex)
    expect(productIndex).toBeGreaterThan(activateIndex)
    expect(liveTourIndex).toBeGreaterThan(productIndex)

    expect(src.slice(importIndex, genomgangIndex)).toContain('<StepImportData')
    expect(src.slice(genomgangIndex, activateIndex)).toContain('<StepGenomgang')
    expect(src.slice(activateIndex, productIndex)).toContain('<Step5Activate')
    expect(src.slice(productIndex, liveTourIndex)).toContain('<StepProductRegister')
  })

  test('Stripe-retur: success → uiStep 7 (artikelsteget), cancelled → uiStep 6 (betalsteget)', () => {
    const successIndex = src.indexOf("payment === 'success'")
    const cancelledIndex = src.indexOf("payment === 'cancelled'")
    expect(successIndex).toBeGreaterThan(-1)
    expect(cancelledIndex).toBeGreaterThan(successIndex)

    const successBlock = src.slice(successIndex, cancelledIndex)
    expect(successBlock).toContain('uiStep = 7')
    expect(successBlock).toContain("body: JSON.stringify({ step: 7")

    const cancelledBlock = src.slice(cancelledIndex, cancelledIndex + 200)
    expect(cancelledBlock).toContain('uiStep = 6')
  })

  test('MatteSetupGuide-villkoret täcker steg 1–7 (livetour, steg 8, är obevakat)', () => {
    expect(src.match(/step > 0 && step < 8/g)?.length).toBe(2)
  })

  test('StepGenomgang importeras och monteras exakt en gång', () => {
    expect(src).toContain("import StepGenomgang from './components/StepGenomgang'")
    expect(src.match(/<StepGenomgang\b/g)?.length).toBe(1)
  })

  test('resume: paid härleds server-sidan ur stripe_subscription_id/subscription_status', () => {
    expect(src).toContain("paid: Boolean(d.stripe_subscription_id) || d.subscription_status === 'active'")
  })
})

test.describe('StepGenomgang — räknefrågor, ingen AI, ingen skip', () => {
  const src = read('app/onboarding/components/StepGenomgang.tsx')

  test('anropar GET /api/onboarding/company-scan och bygger raderna med buildScanRows', () => {
    expect(src).toContain("fetch('/api/onboarding/company-scan'")
    expect(src).toContain('buildScanRows(')
    expect(src).toContain("from '@/lib/onboarding/company-scan-rows'")
  })

  test('tom-läget är ärligt — "Inget att gå igenom än", aldrig påhittade rader', () => {
    expect(src).toContain('Inget att gå igenom än')
    expect(src).toContain('Teamet börjar med din första offert så fort du aktiverat.')
  })

  test('ingen skip-länk (onSkip saknas) — "Vidare till aktivering" är enda vägen', () => {
    expect(src).not.toContain('onSkip')
    expect(src).toContain('Vidare till aktivering')
  })

  test('inga databasanrop i klienten — bara den vanliga API-rutten', () => {
    expect(src).not.toMatch(/\.from\('/)
    expect(src).not.toMatch(/anthropic|openai|generateText|messages\.create/i)
  })

  test('laddningen har ett eget säkerhetsnät (max ~5 s) innan tom-läget', () => {
    expect(src).toContain('HANG_TIMEOUT_MS = 5000')
    expect(src).toContain('Matte går igenom firman')
  })
})

test.describe('teamGorNarDuAktiverar — rena meningar, aldrig ett löfte', () => {
  const KANDA_NYCKLAR = ['kunder', 'fakturor', 'projekt', 'offerter', 'karin', 'daniel', 'lars', 'ko']

  test('varje känd nyckel ger en icke-tom mening', () => {
    for (const key of KANDA_NYCKLAR) {
      const row: ScanRow = { key, text: 'x' }
      const mening = teamGorNarDuAktiverar(row)
      expect(mening, `${key} saknar mening`).not.toBeNull()
      expect(mening!.length).toBeGreaterThan(0)
    }
  })

  test('okänd nyckel ger null', () => {
    expect(teamGorNarDuAktiverar({ key: 'pahittad', text: 'x' })).toBeNull()
  })

  test('ingen mening innehåller ett belopp eller ett garantilöfte', () => {
    for (const key of KANDA_NYCKLAR) {
      const mening = teamGorNarDuAktiverar({ key, text: 'x' })!
      // Ordgräns runt "kr" — annars matchar den t.ex. "godKänner" felaktigt.
      expect(mening.toLowerCase()).not.toMatch(/\bkr\b/)
      expect(mening.toLowerCase()).not.toContain('garanti')
    }
  })
})

test.describe('lib/onboarding/company-scan-rows.ts — delad med Company Scan', () => {
  test('buildScanRows är identisk logik (samma bara-sanna-rader-regel)', () => {
    const rader = buildScanRows({
      ...tomtResultat(),
      customerCount: 12,
      openInvoicesCount: 3,
      karinHeadline: { agent: 'Karin', text: 'x', amount_kr: 45000 },
    })
    expect(rader.map(r => r.key)).toEqual(['kunder', 'fakturor', 'karin'])
  })

  test('CompanyScan.tsx re-exporterar buildScanRows härifrån oförändrat', () => {
    const scan = read('components/tour/CompanyScan.tsx')
    expect(scan).toContain("export { buildScanRows } from '@/lib/onboarding/company-scan-rows'")
  })
})

test.describe('Step5Activate — genomgången ovanpå, paid-guard, Stripe orörd', () => {
  const src = read('app/onboarding/components/Step5Activate.tsx')

  test('paid-guard: en useEffect som anropar onNext() när data.paid är sant', () => {
    const effectIndex = src.indexOf('useEffect(() => {\n    if (data.paid) onNext()')
    expect(effectIndex).toBeGreaterThan(-1)
    expect(src).toContain('Betalningen är klar — vi går vidare')
  })

  test('visar genomgångens fynd ovanför resten av innehållet', () => {
    expect(src).toContain('Det här hittade teamet i din firma')
    expect(src).toContain('data.genomgang')
    const genomgangIndex = src.indexOf('Det här hittade teamet i din firma')
    const founderIndex = src.indexOf('data.foundersAvailable && (')
    expect(genomgangIndex).toBeGreaterThan(-1)
    expect(founderIndex).toBeGreaterThan(genomgangIndex)
  })

  test('det riktiga Stripe-checkout-anropet är orört', () => {
    expect(src).toContain('/api/billing/onboarding-checkout')
    expect(src).toContain('getPlanCommercialFacts')
    expect(src).toContain('YEARLY_MONTHS_FREE')
    expect(src).toContain("useState<'monthly' | 'yearly'>('yearly')")
  })
})

test.describe('app/dashboard/layout.tsx — grinden', () => {
  test('bara slutförda konton släpps in — onboarding_step >= 9', () => {
    const src = read('app/dashboard/layout.tsx')
    expect(src).toContain('business.onboarding_step >= 9')
  })
})

test.describe('lib/onboarding/funnel.ts — nya etiketter', () => {
  test('STEG_ETIKETTER[6] är Aktivera (betalning), FUNNEL_FINAL_STEP är 9', () => {
    expect(STEG_ETIKETTER[6]).toBe('Aktivera (betalning)')
    expect(STEG_ETIKETTER[4]).toBe('Importera data')
    expect(STEG_ETIKETTER[5]).toBe('Genomgången')
    expect(FUNNEL_FINAL_STEP).toBe(9)
  })
})

test.describe('CLAUDE.md — dokumentationen följer med', () => {
  test('nämner TOTAL_STEPS = 9', () => {
    const claude = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8').replace(/\r\n/g, '\n')
    expect(claude).toContain('TOTAL_STEPS = 9')
  })
})
