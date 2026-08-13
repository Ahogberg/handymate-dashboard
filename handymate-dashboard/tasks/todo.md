# Golden Path E2E-harness (Fas 1: station 1-7 + behörighet + idempotens)

Källa: plan `jaunty-pondering-hummingbird.md` (godkänd, auktoritativ spec).
Denna todo är en avbockningslista, inte en omplanering.

## Research (gjordes direkt via Read/Grep, inte via async subagenter — se lessons)
- [x] Auth & UI-selektorer (login-sida, /api/me, .env.test, testdata.ts)
- [x] Offertflöde — routes & DB (e2e-lifecycle cleanup, e2e-quote, quotes/public/[token], finalize-accepted)
- [x] Publik offert-UI + kund/offert-skapande-UI (signatur-canvas, kund-formulär, kalender, tidrapport)
- [x] Projektsteg, Guardian, behörigheter (automation-engine, margin-guardian, profitability, Sidebar.tsx, permissions.ts, permission-contract SENSITIVE_ROUTES)
- [x] DB-schema + dokumentation (kolumner för customer/quote/project/etc, REALITY-WEEK.md-format)
- [x] EXTRA (upptäckt under research, inte i planen): verifierade den FAKTISKA UI→route-kopplingen för bokning och tidrapport — se "Judgment calls" i slutrapporten

## Byggfiler
- [x] tests/e2e-golden-path/fixtures/db.ts
- [x] tests/e2e-golden-path/fixtures/report.ts
- [x] tests/e2e-golden-path/setup/demo-owner.setup.ts
- [x] tests/e2e-golden-path/setup/demo-employee.setup.ts
- [x] tests/e2e-golden-path/golden-path.spec.ts (station 1-7)
- [x] tests/e2e-golden-path/permission-check.spec.ts
- [x] tests/e2e-golden-path/scripts/build-golden-path-report.mjs
- [x] playwright.config.ts — 3 nya projekt (golden-path-setup/golden-path/golden-path-permissions) + global testIgnore utökad (ej röra chromium/mobile/setup-blocken själva)
- [x] .env.test — nya env-nycklar tillagda som kommenterade rader (inga hemliga värden)

## Verifiering
- [x] npx tsc --noEmit — noll fel (bekräftat)
- [x] npx next build — ren build, exit code 0 (bekräftat)
- [x] npx playwright test tests/e2e-golden-path --list — 12 tester i 4 filer, samlar utan fel
- [x] Bekräfta att chromium/setup/mobile-projekten INTE längre plockar upp e2e-golden-path-filer (grep-verifierat)
- [x] Bekräfta tests/auth.setup.ts ORÖRD (git diff tomt)
- [x] Bekräfta ingen av de ~183 befintliga spec-filerna rörd (git status tomt för tests/ förutom e2e-golden-path/)

## Städning/säkerhet inkoderat i harnesset (kontrollpunkter)
- [ ] Aldrig cron-endpoint som itererar alla företag
- [ ] Testdata taggad enligt lib/testdata.ts-konvention
- [ ] cleanup() best-effort, barn-före-förälder, körs även vid fel, rapporterar kvarlämnat
- [ ] SMS/mejl går till Andreas egna uppgifter (+46708379552 / andreashogberg93@gmail.com)
- [ ] Test-anställd idempotent, bunden till DEMO_BUSINESS_ID, alla can_*=false

## Review

**Klart 2026-08-12/13.** Alla filer i "Byggfiler" skapade, tsc/build/--list
gröna, chromium/mobile/setup bekräftat oförändrade och isolerade från de nya
filerna. Kvarstår innan skarp körning: Andreas sätter DEMO_OWNER_PASSWORD +
SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY i .env.test. Se chatt-sammanfattningen
för fullständig lista på judgment calls (framför allt: bokning görs via
kundsidans "Boka platsbesök", inte Kalender-sidan — och Guardian-/stage-
beviset i Station 7 anropar den riktiga POST /api/time-entry-routen direkt
eftersom ingen nuvarande UI-yta når den, ett bekräftat produktionsgap).
