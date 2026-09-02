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
import { arOnboardingBetald } from '../lib/onboarding/payment-gate'

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

/**
 * Betalgrinden (Etapp B2, 2026-09-02) — allowlist i stället för svartlista.
 *
 * Kedjan var läckande: register-rutten sätter 'trial', grinden släppte
 * medvetet igenom 'trial', och finalize gick därmed obetalt. Ovanpå det kunde
 * ?payment=success i adressfältet ensamt flytta kunden till steg 7, och PUT
 * /api/onboarding accepterade steg upp till 10 medan dashboard-grinden räknar
 * >= 9 som klar — två vägar runt betalningen.
 */
test.describe('betalgrinden — bara betalt öppnar', () => {
  test('arOnboardingBetald: active och comp öppnar, allt annat stänger', () => {
    for (const status of ['active', 'comp', 'ACTIVE', ' active ']) {
      expect(arOnboardingBetald({ business_id: 'b', subscription_status: status }), status).toBe(true)
    }
    for (const status of ['trial', 'trialing', 'past_due', 'incomplete', 'cancelled', 'paused', '', null, undefined]) {
      expect(arOnboardingBetald({ business_id: 'b', subscription_status: status }), String(status)).toBe(false)
    }
  })

  test('pilot och demokonto är undantagna — men bara de', () => {
    expect(arOnboardingBetald({ business_id: 'b', subscription_status: 'trial', is_pilot: true })).toBe(true)
    expect(arOnboardingBetald({ business_id: 'demo_1', subscription_status: 'trial' }, 'demo_1')).toBe(true)
    expect(arOnboardingBetald({ business_id: 'annat', subscription_status: 'trial' }, 'demo_1')).toBe(false)
    // Ingen DEMO_BUSINESS_ID satt får inte göra alla konton till demokonton
    expect(arOnboardingBetald({ business_id: undefined, subscription_status: 'trial' }, undefined)).toBe(false)
  })

  test('saknad rad är inte betald — fail closed', () => {
    expect(arOnboardingBetald(null)).toBe(false)
    expect(arOnboardingBetald(undefined)).toBe(false)
  })

  test('grinden blockerar också när raden inte går att läsa', () => {
    const src = read('lib/onboarding/payment-gate.ts')
    expect(src).toContain('// Fail closed')
    expect(src).toMatch(/if \(error\) \{[\s\S]*return true/)
    expect(src).not.toContain('BLOCKED_STATES')
  })

  test('PUT /api/onboarding kan inte skriva 9 eller 10 — bara finalize gör det', () => {
    const src = read('app/api/onboarding/route.ts')
    expect(src).toContain('step >= 1 && step <= 8')
    expect(src).toContain('onboarding_step: 10')
  })

  test('GET /api/onboarding härleder paid på servern, med grindens egen regel', () => {
    const src = read('app/api/onboarding/route.ts')
    expect(src).toContain('paid: arOnboardingBetald(data)')
    expect(src).toContain('is_pilot')
  })

  test('?payment=success flyttar ingen framåt utan verifiering mot Stripe', () => {
    const src = read('app/onboarding/page.tsx')
    // Den gamla ovillkorliga hoppen får inte komma tillbaka
    expect(src).not.toMatch(/payment === 'success'\) \{\s*\n\s*uiStep = 7/)
    expect(src).toContain('betald = await verifieraBetalning(sessionId)')
    expect(src).toContain('paid: betald')
    expect(src).toContain("paymentPending: payment === 'success' && !betald")
  })

  test('verify-rutten kräver rätt företag, rätt sessionstyp och betald status', () => {
    const src = read('app/api/billing/onboarding-checkout/verify/route.ts')
    expect(src).toContain('getAuthenticatedBusiness(request)')
    expect(src).toContain("export const dynamic = 'force-dynamic'")
    expect(src).toContain('session.metadata?.business_id !== business.business_id')
    expect(src).toContain("session.metadata?.onboarding !== 'true'")
    expect(src).toContain("session.payment_status !== 'paid' || session.status !== 'complete'")
    // Samma skrivning som webhooken — aldrig en egen kopia
    expect(src).toContain("from '@/lib/billing/write-billing-update'")
  })

  test('success-URL:en bär session_id, annars finns inget att verifiera', () => {
    expect(read('app/api/billing/onboarding-checkout/route.ts')).toContain('session_id={CHECKOUT_SESSION_ID}')
  })

  test('webhooken och verify delar exakt en skrivväg', () => {
    const webhook = read('app/api/billing/webhook/route.ts')
    expect(webhook).toContain("from '@/lib/billing/write-billing-update'")
    expect(webhook).toContain('byggAbonnemangsfalt(stripe, session)')
    // Inga lokala kopior kvar
    expect(webhook).not.toContain('async function writeBillingUpdate(')
    expect(webhook).not.toContain('function toIsoOrNull(')
    expect(webhook).not.toContain('const statusMap:')
  })

  test('de döda trial-rutterna är borta', () => {
    for (const p of ['app/api/billing/confirm/route.ts', 'app/api/billing/setup-intent/route.ts']) {
      expect(fs.existsSync(path.join(ROOT, p)), `${p} ska vara raderad`).toBe(false)
    }
  })

  test('betalsteget visar väntande betalning i stället för att låsa ute', () => {
    const src = read('app/onboarding/components/Step5Activate.tsx')
    expect(src).toContain('data.paymentPending')
    expect(src).toContain('Betalningen registreras')
    expect(src).toContain('Kontrollera igen')
    expect(src).toContain('kontrolleraBetalning')
  })
})
