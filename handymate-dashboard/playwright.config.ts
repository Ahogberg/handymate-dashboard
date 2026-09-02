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
  testIgnore: [/.*\.integration\.spec\.ts/, /.*\.partner-proof\.spec\.ts/, /tests[\\/]e2e-golden-path[\\/]/, /tests[\\/]e2e-margin-guardian[\\/]/, /tests[\\/]e2e-launch-promise[\\/]/, /tests[\\/]filming[\\/]/],
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
      // Stationerna är riktiga webbläsarresor mot produktion — inte
      // enhetstester. Globala 30s var redan en nära-miss för Station 13
      // (28s), och när Guardian-grenen i Station 7 aktiverades (F1-seedet
      // kört 2026-08-25) passerade stationen 30s trots att varje enskilt
      // steg lyckades: två extra riktiga POST /api/time-entry + väntan på
      // Guardian-kortet + dedupe-beviset lade ~15s på en station som förut
      // tog 17s. describe.serial gör dessutom varje timeout terminal för
      // hela kedjan. 120s per station med bibehållna KORTA steg-timeouts
      // (10-15s) inuti — det är stegen som ska larma, inte totalsumman.
      timeout: 120_000,
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

    // ── Mission-beviset (tests/e2e-golden-path/mission-proof.spec.ts) ────
    // Egen projektgrupp, samma skäl som flywheel ovan (isolerat, ingen
    // dependencies-kedja mot golden-path/golden-path-permissions). Ingen
    // UI-inloggning i specen (se filhuvudet: hela kedjan går via
    // service-role + direkta funktionsanrop) — explicit tomt storageState
    // ändå, för att aldrig råka ärva toppnivåns default (Andreas eget
    // konto) om ett framtida tillägg skulle behöva en session.
    {
      name: 'mission-proof',
      testDir: './tests/e2e-golden-path',
      testMatch: /mission-proof\.spec\.ts/,
      testIgnore: [],
      use: { storageState: { cookies: [], origins: [] } },
    },

    // ── OperatingExperiment-beviset (tests/e2e-golden-path/experiment-
    // proof.spec.ts) — Etapp 2, 2026-08-19. Egen projektgrupp, samma skäl
    // som mission-proof ovan (isolerat, ingen dependencies-kedja, ingen
    // UI-inloggning — service-role + direkta funktionsanrop). SKIPPAR
    // ärligt (test.skip i Station 0) om sql/v157_operating_experiment.sql
    // inte är körd i miljön, faller aldrig rött på det.
    {
      name: 'experiment-proof',
      testDir: './tests/e2e-golden-path',
      testMatch: /experiment-proof\.spec\.ts/,
      testIgnore: [],
      use: { storageState: { cookies: [], origins: [] } },
    },

    // ── Launch Promise Gauntlet ─────────────────────────────────────────
    // Skarp, städande API-resa mot två uttryckligt disponibla testtenants.
    // Körs aldrig av standardsviten: den skapar kund/deal/projekt/dokument/
    // tid och provar fel tenant innan alla exakta ID:n + storage-paths tas
    // bort i finally. Inga externa utskick eller Fortnox-anrop initieras.
    {
      name: 'launch-promise',
      testDir: './tests/e2e-launch-promise',
      testMatch: /launch-promise\.spec\.ts/,
      testIgnore: [],
      timeout: 120_000,
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

    // ── Inspelningsläge (Video Creative Bible) ───────────────────────────
    // Sätter DEMOKONTOT i exakt det tillstånd en film behöver via
    // produktens egna API:er och spelar in skärmen i 9:16 (1080×1920) —
    // video + stillbild per "beat" till docs/marketing/recordings/. Körs
    // aldrig av standardsviten; vägrar köra mot konton som inte är
    // demo-flaggade i databasen (tests/filming/fixtures/filming.ts).
    // Egen kontext per film (recordVideo) — därför ingen device/video här.
    {
      name: 'filming',
      testDir: './tests/filming',
      testMatch: /f\d\d-.*\.spec\.ts/,
      testIgnore: [],
      timeout: 240_000,
      retries: 0,
      use: { storageState: { cookies: [], origins: [] } },
    },
  ],
})
