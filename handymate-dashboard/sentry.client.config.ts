// Sentry — klientsidan (webbläsaren, PWA:n). Laddas av withSentryConfig i
// next.config.js. PÅ endast när NEXT_PUBLIC_SENTRY_DSN är satt.
//
// Bygget varnar "recommended renaming to instrumentation-client.ts" — den
// filkonventionen finns först i Next 15.3; på Next 14.1 är den här filen
// rätt väg. Byt namn vid Next-uppgraderingen, inte före.
//
// Ingen session replay (kunddata på skärmen), ingen default-PII, låg
// trace-sampling — det här är felspårning, inte produktanalys.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: 0.05,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  sendDefaultPii: false,
})
