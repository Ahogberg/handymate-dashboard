const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Byggkostnad (2026-09-14): Vercel-fakturan var 99 % byggminuter. CI kör redan
  // `tsc --noEmit` med 6 GB heap (contracts.yml, playwright.yml), så bygget upprepar
  // inte typkontrollen — på 624 rutter + 144 sidor kostade den minuter per bygge.
  // Typfel fångas fortfarande i CI innan merge. Repot har ingen ESLint-konfig, så
  // lint är avstängd i bygget uttryckligen i stället för att Next ska fråga.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
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
