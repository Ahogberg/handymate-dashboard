/**
 * Facit för den förtjänta betalfrågan (2026-09-02).
 *
 * "Aktivera senare"-knappen (gå vidare utan kort) togs BORT samma natt:
 * Andreas vill uttryckligen inte ha en gratis prova-på-period som lockar
 * folk som signar upp och avbryter direkt. Kortet krävs i steg 4 som förut.
 * Det som är kvar är det som gör betalfrågan förtjänt och synlig:
 *
 * Låser:
 *  - Step5Activate har INGEN väg förbi Stripe utanför demoläget
 *  - första värdekvittot härleds bara ur verifierade kort
 *    (RECEIPT_APPROVAL_TYPES + execution_result.outcome = success)
 *  - /api/billing exponerar first_receipt och räknar 'trial' som provperiod
 *  - bannern läser rätt svarsform, ser 'trial', och ställer betalfrågan på
 *    första kvittot
 *  - morgonbrief + nästa-bästa-handling kör för provperiodskonton med klar
 *    onboarding (annars kan kvittot aldrig uppstå)
 *
 * Körs: npx playwright test tests/aktivera-senare.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { harledForstaKvitto } from '../lib/billing/forsta-kvitto'
import { harAktivtTeam } from '../lib/billing/aktiva-konton'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

test('Step5Activate: ingen väg förbi betalningen utanför demoläget', () => {
  const src = read('app/onboarding/components/Step5Activate.tsx')
  expect(src).not.toContain('onDefer')
  expect(src).not.toContain('Aktivera senare')
  expect(src).toContain("fetch('/api/billing/onboarding-checkout'")
  expect(read('app/onboarding/page.tsx')).not.toContain('deferActivation')
})

test.describe('första värdekvittot', () => {
  test('bara verifierade kort ger kvitto; första i ordningen vinner', () => {
    const rows = [
      // fel utfall
      { approval_type: 'invoice_reminder', resolved_at: '2026-09-01T10:00:00Z', payload: { amount_kr: 5000, invoice_id: 'inv1', execution_result: { action: 'invoice_reminder', outcome: 'failed', sent: false, executed: false } } },
      // rätt typ men saknar bevis (amount)
      { approval_type: 'fakturera_projekt', resolved_at: '2026-09-01T11:00:00Z', payload: { execution_result: { action: 'fakturera_projekt', outcome: 'success', invoice_id: 'inv2' } } },
      // verifierat
      { approval_type: 'invoice_reminder', resolved_at: '2026-09-01T12:00:00Z', payload: { amount_kr: 5000, invoice_id: 'inv3', execution_result: { action: 'invoice_reminder', outcome: 'success', sent: true, executed: true } } },
      { approval_type: 'send_sms', resolved_at: '2026-09-01T13:00:00Z', payload: { customer_name: 'Anna', execution_result: { action: 'send_sms', outcome: 'success', sms_sent: true, sms_id: 's1' } } },
    ]
    const k = harledForstaKvitto(rows)!
    expect(k.at).toBe('2026-09-01T12:00:00Z')
    expect(k.text).toContain('Påminnelsen skickad')
    expect(k.link).toBe('/dashboard/invoices/inv3')
    expect(harledForstaKvitto(rows.slice(0, 2))).toBeNull()
    expect(harledForstaKvitto([])).toBeNull()
  })

  test('/api/billing: first_receipt bara utan Stripe-prenumeration; trial räknas som provperiod', () => {
    const src = read('app/api/billing/route.ts')
    expect(src).toContain("const iProvperiod = billingData?.subscription_status === 'trialing' || billingData?.subscription_status === 'trial'")
    expect(src).toContain('billingData?.stripe_subscription_id ? null : await hamtaForstaKvitto(supabase, businessId)')
    expect(src).toContain('first_receipt: firstReceipt,')
    const lib = read('lib/billing/forsta-kvitto.ts')
    expect(lib).toContain(".eq('status', 'approved')")
    expect(lib).toContain('.in(\'approval_type\', [...RECEIPT_APPROVAL_TYPES])')
  })

  test('bannern läser rätt svarsform, ser trial och ställer betalfrågan på första kvittot', () => {
    const src = read('components/BillingStatusBanner.tsx')
    expect(src).toContain('data.subscription?.status')
    expect(src).toContain('data.trial?.ends_at')
    expect(src).toContain('data.first_receipt')
    expect(src).not.toContain('data.subscription_status ||')
    expect(src).toContain("const iProvperiod = sub === 'trial' || sub === 'trialing'")
    expect(src).toContain('if (!status.stripe_subscription_id && status.first_receipt) {')
    expect(src).toContain('Teamet har levererat sitt första resultat')
    // utgången provperiod vinner över kvittobannern
    expect(src.indexOf('if (daysLeft <= 0) {')).toBeLessThan(src.indexOf('status.first_receipt) {'))
  })
})

test.describe('teamet jobbar under provperioden', () => {
  test('harAktivtTeam: active/comp alltid; trial bara med klar onboarding och giltig provperiod', () => {
    const now = Date.parse('2026-09-02T08:00:00Z')
    const bas = { business_id: 'b', subscription_status: 'trial', trial_ends_at: '2026-09-10T00:00:00Z', onboarding_completed_at: '2026-09-01T00:00:00Z' }
    expect(harAktivtTeam(bas, now)).toBe(true)
    expect(harAktivtTeam({ ...bas, onboarding_completed_at: null }, now)).toBe(false)
    expect(harAktivtTeam({ ...bas, trial_ends_at: '2026-09-01T00:00:00Z' }, now)).toBe(false)
    expect(harAktivtTeam({ ...bas, trial_ends_at: null }, now)).toBe(false)
    expect(harAktivtTeam({ ...bas, subscription_status: 'trialing' }, now)).toBe(true)
    expect(harAktivtTeam({ ...bas, subscription_status: 'active', trial_ends_at: null, onboarding_completed_at: null }, now)).toBe(true)
    expect(harAktivtTeam({ ...bas, subscription_status: 'comp' }, now)).toBe(true)
    for (const s of ['past_due', 'cancelled', 'inactive', '', null]) expect(harAktivtTeam({ ...bas, subscription_status: s }, now)).toBe(false)
  })

  test('morgonbrief och nästa-bästa-handling går via helpern, inte hårt på active', () => {
    for (const f of ['app/api/cron/morning-brief/route.ts', 'app/api/cron/next-best-action/route.ts']) {
      const src = read(f)
      expect(src).toContain('hamtaKontonMedAktivtTeam(supabase)')
      expect(src).not.toContain(".eq('subscription_status', 'active')")
    }
  })
})
