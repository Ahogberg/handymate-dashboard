/**
 * Aktivitetsnivå för partnerportalens kundlista (2026-08-11).
 *
 * Partnern ska se HUR kunden mår utan att se NÅGOT känsligt: nivån härleds
 * ur abonnemangsstatus + onboarding + senaste betalningstidpunkt, och inga
 * belopp eller fakturor lämnar servern. Ren funktion — direkttestbar i
 * tests/partner-activity.spec.ts.
 */

export type ActivityLevel = 'onboardar' | 'aktiv' | 'inaktiv' | 'churnad'

export interface ActivityInput {
  subscriptionStatus: string | null
  onboardingCompletedAt: string | null
  /** ISO-tid för senaste payment_succeeded, null om ingen betalning finns. */
  lastPaymentAt: string | null
  /** Injicerbar klocka för testbarhet. */
  now?: Date
}

/** Dagar utan betalning innan en kund med betalhistorik anses inaktiv.
 *  Månadsabonnemang + lite marginal för fakturadatum som glider. */
export const INAKTIV_EFTER_DAGAR = 40

export function deriveActivityLevel(input: ActivityInput): ActivityLevel {
  const status = (input.subscriptionStatus || '').toLowerCase()

  // Churn slår allt.
  if (status === 'cancelled' || status === 'canceled') return 'churnad'

  // Ingen betalning än, eller onboarding ej klar → kunden är på väg in.
  if (!input.lastPaymentAt || !input.onboardingCompletedAt) return 'onboardar'

  if (status === 'past_due') return 'inaktiv'

  const now = input.now ?? new Date()
  const senast = new Date(input.lastPaymentAt).getTime()
  if (isFinite(senast)) {
    const dagar = (now.getTime() - senast) / (1000 * 60 * 60 * 24)
    if (dagar > INAKTIV_EFTER_DAGAR) return 'inaktiv'
  }

  return 'aktiv'
}

/** Svensk UI-etikett per nivå (portalens badge). */
export const AKTIVITETS_ETIKETT: Record<ActivityLevel, string> = {
  onboardar: 'Onboardar',
  aktiv: 'Aktiv kund',
  inaktiv: 'Inaktiv',
  churnad: 'Avslutad',
}
