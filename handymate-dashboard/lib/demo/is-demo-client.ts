/**
 * lib/demo/is-demo-client.ts (D3, 2026-08-18)
 *
 * Klient-sidans "är det här demokontot?"-kontroll. Ren jämförelse mot
 * NEXT_PUBLIC_DEMO_BUSINESS_ID — INGEN säkerhetsgrind i sig, den avgör bara
 * vilken UI-gren som ritas (riktig Stripe-knapp vs. simulerad, riktig
 * telefonnummer-reservation vs. redan-klart-läge, etc). De faktiska
 * skrivningarna skyddas alltid server-side av samma DEMO_BUSINESS_ID +
 * owner/admin-mönster som app/api/admin/demo-reset/route.ts — se
 * app/api/admin/demo-onboarding-replay och demo-fortnox-sim, som upprepar
 * den grinden oavsett vad klienten skickar.
 *
 * Samma tanke som lib/demo/presenter.ts:canRenderDemoPresenter, men utan
 * owner/admin-kravet: presentatörsbaren kräver det för att inte visa
 * demoverktyg för vem som helst inloggad på demokontot, men ett
 * onboarding-steg som bara väljer vilken knapp som ritas ut behöver det
 * inte — grinden ligger redan i API-rutten den anropar.
 */
export function isDemoBusinessId(businessId: string | null | undefined): boolean {
  const demoBusinessId = process.env.NEXT_PUBLIC_DEMO_BUSINESS_ID
  return Boolean(demoBusinessId && businessId === demoBusinessId)
}
