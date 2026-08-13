import { defineConfig, devices } from '@playwright/test'

// Ladda .env.test lokalt (i CI sätts env vars direkt)
try { require('dotenv').config({ path: '.env.test' }) } catch { /* dotenv optional */ }

export default defineConfig({
  testDir: './tests',
  // Riktiga DB-integrationstester är destruktiva och körs endast via
  // playwright.integration.config.ts / npm run test:tenant-isolation.
  //
  // tests/e2e-golden-path/** exkluderas HÄR (globalt) medvetet: de tre
  // befintliga projekten nedan (setup/chromium/mobile) har ingen egen
  // testMatch och ärver annars global testDir/testIgnore rakt av — utan
  // undantaget hade de TYST plockat upp golden-path.spec.ts/permission-
  // check.spec.ts också (dubbel-/trippelkörning av RIKTIGA UI-klick+SMS+
  // mejl via chromium+mobile+det nya golden-path-projektet samtidigt, och
  // permission-check.spec.ts hade körts med FEL storageState — ägarens
  // user.json istället för demo-employee.json). De tre nya golden-path-*-
  // projekten längst ner sätter egen testIgnore:[] för att inte ärva
  // undantaget de själva behöver träffa.
  testIgnore: [/.*\.integration\.spec\.ts/, /tests[\\/]e2e-golden-path[\\/]/],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 30_000,

  use: {
    baseURL: process.env.BASE_URL || 'https://app.handymate.se',
    trace: 'on-first-retry',
    storageState: 'playwright/.auth/user.json',
  },

  projects: [
    // Auth setup — körs först, sparar session
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { storageState: undefined },
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 14'] },
      dependencies: ['setup'],
    },

    // ── Golden Path E2E-harness (Fas 1) — helt separat projektgrupp ──────
    // Skild från setup/chromium/mobile ovan (som inte rörs): egna
    // storageState-filer, egen körordning (setup -> golden-path ->
    // permissions, samma dependencies-mönster som setup -> chromium redan
    // använder). testIgnore:[] åsidosätter det globala e2e-golden-path-
    // undantaget ovan — annars hade de här projekten exkluderat sina egna
    // filer.
    {
      name: 'golden-path-setup',
      testDir: './tests/e2e-golden-path/setup',
      testMatch: /.*\.setup\.ts/,
      testIgnore: [],
      // `storageState: undefined` does NOT override the top-level default in
      // this Playwright version — it falls through and tries to read
      // playwright/.auth/user.json, which doesn't exist on a fresh checkout.
      // An explicit empty state (the pattern tests/quote-document-width.spec.ts
      // already uses) is what actually produces a truly blank context.
      use: { storageState: { cookies: [], origins: [] } },
    },
    {
      name: 'golden-path',
      testDir: './tests/e2e-golden-path',
      testMatch: /golden-path\.spec\.ts/,
      testIgnore: [],
      use: { storageState: { cookies: [], origins: [] } },
      dependencies: ['golden-path-setup'],
    },
    {
      name: 'golden-path-permissions',
      testDir: './tests/e2e-golden-path',
      testMatch: /permission-check\.spec\.ts/,
      testIgnore: [],
      use: { storageState: 'playwright/.auth/demo-employee.json' },
      dependencies: ['golden-path'],
    },
  ],
})
