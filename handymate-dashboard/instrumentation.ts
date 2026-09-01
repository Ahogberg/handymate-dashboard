// Next.js instrumentation-hook (kräver experimental.instrumentationHook i
// next.config.js på Next 14). Laddar rätt Sentry-init per runtime.
// Utan DSN är initieringen en no-op — se sentry.*.config.ts.
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Fångar fel i server components/route handlers som Next själv rapporterar
// (aktivt från Next 15; ofarligt på 14 där hooken inte anropas).
export const onRequestError = Sentry.captureRequestError
