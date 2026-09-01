// Sentry — Node-runtime (API-rutter, crons, server components). Laddas av
// instrumentation.ts. PÅ endast när SENTRY_DSN (eller NEXT_PUBLIC_SENTRY_DSN)
// är satt.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: 0.05,
  sendDefaultPii: false,
})
