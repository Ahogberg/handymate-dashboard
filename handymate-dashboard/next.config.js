const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Chromium-PDF (app/api/quotes/pdf): puppeteer-core + @sparticuz/chromium
    // måste lämnas utanför webpack-bundlingen — binär-uppackningen och
    // dynamiska require:s går sönder om de bundlas.
    serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium', 'pdfjs-dist', '@napi-rs/canvas'],
    outputFileTracingIncludes: {
      '/api/approvals/*/document': ['./node_modules/pdfjs-dist/legacy/build/*', './node_modules/pdfjs-dist/standard_fonts/*', './node_modules/pdfjs-dist/wasm/*', './node_modules/@napi-rs/canvas*/**/*'],
    },
    // Krävs på Next 14 för att instrumentation.ts (Sentry server/edge-init)
    // ska köras. Utan DSN är initieringen en no-op.
    instrumentationHook: true,
  },
}

// Sentry (2026-09-01): felspårning på server + klient. Bygget är oförändrat
// utan SENTRY_AUTH_TOKEN — källkartor laddas bara upp när token finns, och
// ingen körtidsrapportering sker utan DSN (se sentry.*.config.ts).
module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  telemetry: false,
  disableLogger: true,
  widenClientFileUpload: false,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
})
