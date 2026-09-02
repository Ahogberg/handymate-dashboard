# Actionplan: Räddningskön + lanseringsbevis (2026-09-02, Andreas: "kör enligt din rekommendation")

Program: docs/launch/FORSTA_10_KUNDER_BEVIS_OCH_RADDNING.md (läs §3 och §5).
Migration sql/v202_raddningsko_och_lanseringsbevis.sql är REDAN KÖRD i
Supabase av Claude. Koden ska ändå vara fail-soft vid saknad tabell
(arSchemaSaknas från lib/observability/driftlarm) — då loggas en varning
och körningen svarar { skipped: 'schema' }.

Repo: handymate-dashboard/. Svenska kommentarer och UI, riktiga å/ä/ö,
teal #0F766E. Rutfiler exporterar bara handlers + dynamic. Läs varje fil
innan du ändrar. Modell för cron-idiomet: app/api/cron/driftlarm/route.ts
(GET+POST, verifyCronSecret, force-dynamic, try/catch per svep →
brokenSweeps, DEMO_BUSINESS_ID exkluderad, digest via sendEmail).

## Del 1 — lib/raddning/signaler.ts (rena funktioner, testbara utan DB)
Typer: `Signal` (de tio värdena i CHECK-listan), `Severity`,
`RaddningsFynd = { business_id, signal, severity, summary, evidence }`.
Rena bedömare, en per signal, som tar redan hämtade rader + `now` och
returnerar RaddningsFynd | null:
- `bedomOnboarding(row, funnel, now)`: onboarding_completed_at null, konto
  äldre än 24 h, senaste stämpel i _funnel (readFunnel från
  lib/onboarding/funnel.ts) eller created_at äldre än 24 h ⇒ medel,
  äldre än 72 h ⇒ hog. summary: "Fastnade på steg N (etikett) för X h sedan".
- `bedomKanal(halsa, klarSedanH)`: klar > 48 h och ingen kanal i
  channel_verified/lead_verified (deriveChannelHealth i
  lib/onboarding/channel-health.ts — läs dess input och återskapa
  frågorna server-side per företag; kopiera INTE logiken, anropa den) ⇒ hog.
- `bedomAktivering(metrics, klarSedanH)`: klar > 72 h och
  firstApprovalH === null (computeActivation, lib/admin/activation-metrics.ts) ⇒ medel.
- `bedomOffert(antalSkickade, klarSedanH)`: klar > 7 d och 0 ⇒ medel.
- `bedomUppdrag(antalMission, klarSedanH)`: klar > 3 d och 0 ⇒ lag.
- `bedomIntegration({ fortnoxConnected, tokenExpiresAt, synkfel25h })`:
  connected och (token utgången eller synkfel > 0) ⇒ hog.
- `bedomHandlingar(antalFailed25h)`: > 0 ⇒ medel, ≥ 3 ⇒ hog.
- `bedomKort(rader, now)`: pending äldre än 5 d, eller pending äldre än
  48 h med expires_at inom 24 h ⇒ lag/medel (medel om ≥ 3 kort).
- `bedomFalskFramgang(rader)`: status approved, approval_type i
  RECEIPT_APPROVAL_TYPES (lib/approvals/value-receipt.ts),
  payload.execution_result.outcome === 'success' och
  extractExecutionArtifacts (lib/approvals/execution-outcome.ts) tomt ⇒ hog,
  evidence = kort-id:n (max 5).
Alla summaries på svenska, korta, med talen.

## Del 2 — app/api/cron/raddningsko/route.ts
- Auth: verifyCronSecret ELLER isAdmin (som credit-watch) så Andreas kan
  köra den manuellt från admin.
- Urval: business_config där (is_pilot = true ELLER onboarding_completed_at
  ≥ now − 30 d ELLER created_at ≥ now − 30 d), inte DEMO_BUSINESS_ID, inte
  testnamn (arTestNamn / samma regex som lib/onboarding/funnel.ts:210).
- Per företag: hämta det varje bedömare behöver (en try/catch per svep,
  brokenSweeps som driftlarm), kör bedömarna, samla fynd.
- Skriv till raddningsarende: för varje fynd upsert på (business_id,
  signal) där status i (oppet, pagaende): finns ⇒ update last_seen_at,
  severity, summary, evidence; annars insert. Signaler som INTE hittades
  i dag men har öppna rader ⇒ status 'last', resolved_by 'system',
  atgard 'Signalen försvann', resolved_at now. manuell_fix_kravdes rörs
  aldrig av cronen.
- Digest: om minst ett öppet ärende ⇒ sendEmail till
  process.env.OPS_ALERT_EMAIL || 'andreas@handymate.se', ämne
  "🛟 Räddningskön: N öppna (M nya)", tabell företag/signal/severity/
  summary, länk till /admin?tab=rescue. Tyst när rent.
- Svar: { success, checked, found, opened, updated, closed, brokenSweeps, mailed }.
- vercel.json: `"25 5 * * *"` (efter driftlarm 05:15).
- tests/cron-auth.spec.ts: räkna upp 43→44 / 42→43 med kommentar.

## Del 3 — admin
- app/api/admin/raddningsko/route.ts (GET, isAdmin, getAdminSupabase):
  öppna + pågående ärenden med business_name (join business_config),
  sorterade severity hog→lag, sedan last_seen_at.
- app/api/admin/raddningsko/[id]/route.ts (POST, isAdmin): body
  { action: 'ta' | 'los' | 'avfarda', atgard?: string, owner?: string }
  → status pagaende/last/avfardat, resolved_at/resolved_by = adminens
  e-post, logAdminAction som support-tickets/[id]/resolve gör.
- app/api/admin/raddningsko/manuell-fix/route.ts (POST, isAdmin): skapar
  ett ärende manuell_fix_kravdes { business_id, summary } — regeln i §2.
- Adminflik 'rescue' ("Räddning") i app/admin/page.tsx bredvid 'support':
  komponent app/admin/components/RaddningskoTab.tsx — lista med
  severity-färg (hog röd, medel amber, lag grå), företag, signal-etikett
  på svenska (karta i lib/raddning/signaler.ts), summary, first/last
  seen, knappar "Tar det", "Löst" (kräver åtgärdstext), "Avfärda"; och en
  liten form "Bokför manuell fix" (företag + vad). Mobilvänlig.
- app/api/admin/pilots: rör inte.

## Del 4 — lanseringsbevis
- lib/launch/readiness.ts: MANUAL_LAUNCH_PROOFS behålls som lista av
  stationer; ny `async function hamtaLanseringsbevis(supabase)` som läser
  lanseringsbevis (revoked_at null) och ger `status: 'pass'` +
  `evidence`/`proven_at`/`proven_by` per station med rad, annars 'manual'.
  Fail-soft: saknad tabell ⇒ alla 'manual' som i dag.
- app/api/admin/launch-readiness/route.ts: manual_proofs kommer från
  hamtaLanseringsbevis. Verdict oförändrat (blocked räknar fortfarande
  bara env/schema).
- app/api/admin/launch-readiness/bevis/route.ts (POST, isAdmin): body
  { station, business_id?, evidence, evidence_url? } → insert med
  proven_by = adminens e-post; DELETE med { id, reason } sätter revoked_at.
  logAdminAction.
- I RaddningskoTab: en sektion "Lanseringsbevis (Grind B)" med de sex
  stationerna, status, och formulär för att bokföra ett bevis.
- tests/launch-readiness.spec.ts: uppdatera det som låser 'manual'-konstanten.

## Facit: tests/raddningsko.spec.ts (browserlöst)
- Varje bedömare: ett fixturfall som ger fynd och ett som ger null;
  tröskelvärdena exakt (24/72 h, 48 h, 72 h, 7 d, 3 d, 5 d, ≥ 3).
- bedomFalskFramgang: success utan artifacts ⇒ hog; med artifacts ⇒ null;
  typ utanför RECEIPT_APPROVAL_TYPES ⇒ null.
- Cron: verifyCronSecret + isAdmin, DEMO exkluderad, upsert-idiomet
  (status in oppet/pagaende), stänger med resolved_by 'system', rör aldrig
  manuell_fix_kravdes, sendEmail bara vid öppna, vercel.json-raden.
- Admin: isAdmin på alla tre rutter, logAdminAction i POST, 'rescue'-flik i
  app/admin/page.tsx, RaddningskoTab innehåller "Tar det"/"Löst"/"Avfärda".
- readiness: hamtaLanseringsbevis fail-soft, launch-readiness använder den.
- sql/v202 finns; schema-audit får båda tabellerna (critical: false).
Lägg facit-namnet sist i BÅDE `test:contracts` i package.json och listan i
../.github/workflows/contracts.yml.

## Verifiering
```
npx tsc --noEmit
npx playwright test tests/raddningsko.spec.ts tests/cron-auth.spec.ts tests/launch-readiness.spec.ts tests/facit-route-auth-inventory.spec.ts tests/facit-ai-kostnad-sanning.spec.ts --no-deps --project=chromium --reporter=line
npm run test:contracts
npx next build
```
Inga commits. Rapportera ändrade filer, exakta testsiffror, avvikelser.
