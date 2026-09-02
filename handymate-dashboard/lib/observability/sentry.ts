/**
 * Sentry-adapter — EN plats att rapportera fel till, fail-safe.
 *
 * Sentry (@sentry/nextjs) initieras i sentry.{client,server,edge}.config.ts
 * och är bara PÅ när en DSN finns (NEXT_PUBLIC_SENTRY_DSN för klienten,
 * SENTRY_DSN eller NEXT_PUBLIC_SENTRY_DSN för servern). Utan DSN är varje
 * anrop här en no-op — koden får aldrig bete sig annorlunda lokalt eller i
 * preview bara för att felspårningen inte är konfigurerad.
 *
 * KONTRAKT: kastar ALDRIG. Rapporteringen anropas nästan alltid från en
 * catch-gren som redan är fail-safe; en trasig rapportör får inte fälla den.
 *
 * Skicka aldrig kunddata som fritext hit: taggar/extra ska vara id:n,
 * kodställen och felmeddelanden — inte namn, telefonnummer eller belopp.
 */

import * as Sentry from '@sentry/nextjs'

export type SentryNiva = 'info' | 'warning' | 'error' | 'fatal'

export interface SentryRapport {
  /** Kort, stabil rubrik — samma text för samma felklass så Sentry grupperar. */
  meddelande: string
  niva?: SentryNiva
  /** Låg kardinalitet: business_id, kodställe, integration. */
  tags?: Record<string, string>
  /** Fri kontext (ingen PII). */
  extra?: Record<string, unknown>
  /** Det kastade felet om ett finns — ger stacktrace i stället för bara text. */
  fel?: unknown
}

/** Sant när en DSN är konfigurerad för den miljö koden kör i. */
export function sentryAktiv(): boolean {
  return Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)
}

export function rapporteraTillSentry(rapport: SentryRapport): void {
  try {
    const level = rapport.niva ?? 'error'
    const context = { level, tags: rapport.tags, extra: rapport.extra }
    if (rapport.fel instanceof Error) {
      Sentry.captureException(rapport.fel, {
        ...context,
        extra: { ...(rapport.extra || {}), meddelande: rapport.meddelande },
      })
      return
    }
    Sentry.captureMessage(rapport.meddelande, context)
  } catch (err) {
    console.error('[sentry] rapporteringen kastade (svalt):', err)
  }
}
