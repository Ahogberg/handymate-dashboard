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
  testIgnore: [/.*\.integration\.spec\.ts/, /tests[\\/]e2e-golden-path[\\/]/, /tests[\\/]e2e-margin-guardian[\\/]/],
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
    // Auth setup — körs först, sparar session.
    // `storageState: undefined` överskrider INTE toppnivåns default i den
    // här Playwright-versionen (samma fälla som golden-path-setup nedan
    // redan dokumenterar) — på en färsk checkout utan playwright/.auth/
    // user.json ger det ENOENT innan setup:en ens hunnit skapa filen.
    // Ett explicit tomt state är vad som faktiskt ger en blank kontext.
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { storageState: { cookies: [], origins: [] } },
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

    // ── Flywheel-beviset (tests/e2e-golden-path/flywheel.spec.ts) ────────
    // Egen projektgrupp, MEDVETET inte inlagd i golden-path-projektets
    // testMatch: golden-path-permissions beror på det projektet
    // (dependencies: ['golden-path']) — hade flywheel delat testMatch skulle
    // ett flywheel-fel blockera permission-check.spec.ts och ändra det
    // befintliga harnessets semantik. Samma mönster som margin-guardian
    // nedan i stället: egen riktig UI-inloggning i specen, ingen
    // dependency-kedja, explicit tomt storageState (toppnivåns default
    // pekar på Andreas eget konto).
    {
      name: 'flywheel',
      testDir: './tests/e2e-golden-path',
      testMatch: /flywheel\.spec\.ts/,
      testIgnore: [],
      use: { storageState: { cookies: [], origins: [] } },
    },

    // ── Margin Guardian — fristående "fungerar i praktiken"-test ─────────
    // Egen fil/eget projekt (inte en Golden Path-station): en lönsamhets-
    // varning är en villkorad gren, inte del av kundresans huvudspår.
    // Riktig UI-lösenordsinloggning i testet självt (samma mönster som
    // golden-path.spec.ts Station 1) — playwright/.auth/demo-owner.json
    // (golden-path-setup) visade sig INTE bära en giltig session (landar på
    // /login?redirect=... efter magic link, se fynd 2026-08-13), så en
    // riktig inloggning är den bevisat pålitliga vägen.
    {
      name: 'margin-guardian',
      testDir: './tests/e2e-margin-guardian',
      testMatch: /margin-guardian\.spec\.ts/,
      testIgnore: [],
      use: { storageState: { cookies: [], origins: [] } },
    },
  ],
})
