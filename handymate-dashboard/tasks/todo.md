# Etapp Å — Owner Absence V1 ("Matte håller ställningarna")

Frånvarofönster: normala händelser samlas, en sluten lista deterministiska
eskaleringsklasser pushar igenom, ingen ny behörighet någonsin, deterministisk
återkomstrapport (ingen LLM avgör vad som är akut).

## Migration
- [x] sql/v153_owner_absence.sql — `automation_settings.owner_absence JSONB`
      (samma precedent som auto_approve_config). {from,to,set_by,set_at}.

## Lib (facit först)
- [x] lib/absence/absence-window.ts — isAbsenceActive (ren), read/write helpers
- [x] lib/absence/escalation.ts — classifyAbsenceEvent, sluten AbsenceEvent-union,
      uttömmande switch + never-check
- [x] lib/absence/franvarorapport.ts — byggFranvarorapport, återanvänder
      byggDygnsdigest (generaliserad med `from`) + classifyAbsenceEvent
- [x] lib/jarvis/dygnsdigest.ts — lägg till valfritt `from`-fält (bakåtkompatibelt)

## Push-strypunkt
- [x] lib/notifications/approval-push.ts — absence-gate i sendApprovalPush
      (enda chokepoint), risk_level tillagt i ApprovalLike
- [x] app/api/cron/driftlarm/route.ts — per-business ägar-push för
      payment_failed/automation_activity-failed under aktiv frånvaro

## Cap-avslag-loggning
- [x] app/api/cron/send-reminders/route.ts + quote-follow-up/route.ts —
      tagga payload.cap_exceeded på redan skapat godkännandekort

## API
- [x] app/api/absence/route.ts — GET/POST/DELETE, owner-admin
- [x] app/api/absence/report/route.ts — GET, owner-admin
- [x] tests/permission-contract.spec.ts — registrera båda rutterna

## UI
- [x] components/jarvis/home/MatteHero.tsx — absenceBand-slot (uppdragBand-mönstret)
- [x] components/jarvis/home/AbsenceBand.tsx — snabbknapp, statusrad, avfärdbar
      återkomstrapport (localStorage-dismiss, mandagsmote-mönstret)
- [x] components/jarvis/JarvisHome.tsx — montera AbsenceBand

## Verifiering
- [x] Riktade tester (rött→grönt)
- [x] npx tsc --noEmit
- [x] npx next build
- [x] git status, commit specifika filer, ingen push

---

# Etapp Ä — Jobbpass V1 (Closeout-to-Lifetime)

Digitalt jobbpass som Lars föreslår vid projektavslut: accepterad omfattning,
godkända ÄTA, utfört arbete (signerad fältrapport), UTVALDA foton (ägaren
väljer), egenkontroll, fakturareferens, standardgaranti, valfri
service-samtycke. Inget nytt utskick — bara data + en publik länk.

## Migration
- [x] sql/v154_jobbpass.sql — ny tabell `jobbpass` (id jp_-prefix, business_id,
      project_id UNIQUE, selected_photo_ids JSONB, service_consent boolean,
      status draft/published, token, published_at). RLS: service_role only
      (samma mönster som v148). EJ körd — Andreas kör manuellt.

## Lib (facit först — rött innan bygge)
- [x] lib/jobbpass/jobbpass.ts
      - JOBBPASS_ALLOWED_FIELDS (exporterad allowlist-konstant)
      - deriveJobbpassView() — REN funktion, bygger kundvyn genom EXPLICIT
        fältplock (aldrig spread av råa DB-rader) → strukturellt omöjligt
        att läcka ett fält som inte står i allowlisten
      - loadJobbpassSourceData() — I/O, smala .select()-listor, fail-soft
      - loadSelectedJobbpassPhotos() — .in('id', selectedIds) — bara valda
      - getOrCreateDraftJobbpass / setJobbpassSelection / publishJobbpass /
        getPublishedJobbpassByToken / getJobbpassServiceConsent (I/O)
      - Kommentarer beskriver förbjudna fält i PROSA, aldrig kolumnnamnen
        ordagrant (självreferens-fällan mot källskanningsfacit)
- [x] tests/jobbpass.spec.ts — facit (a)-(f) + källskanning + fake-supabase
      derivationstest för foturvalet (52 tester, gröna)

## Closeout-hook
- [x] lib/projects/complete-project.ts — nytt effect-steg 'jobbpass_proposal'
      i runCompletionEffects (samma dedupe/idempotens-idiom som
      scheduled_review_request/project_debrief), tillagt i completion_batch
      .in()-listan, CloseoutEffectName + userWarningForEffect uppdaterade

## Ägar-ytan
- [x] app/api/projects/[id]/jobbpass/route.ts — GET (kandidatfoton signerade
      + nuvarande urval) / PATCH (foturval + samtycke), owner-admin
- [x] app/api/projects/[id]/jobbpass/publish/route.ts — POST publicera
      (genererar token), owner-admin
- [x] app/dashboard/projects/[id]/jobbpass/page.tsx — fotoval, förhandsgranskning,
      samtyckesbock, publicera-knapp, kopiera länk

## Publik portalvy
- [x] app/api/jobbpass/public/[token]/route.ts — GET, publik, 404 om ej published
- [x] app/jobbpass/[token]/page.tsx — svensk, ljus/teal, mobiloptimerad

## Approvals-UI
- [x] app/dashboard/approvals/page.tsx — TYPE_CONFIG-post + särskild gren för

---

# Etapp L1 — Paketeringens sanningsbuggar (2026-08-18)

Bugfixar/konsolidering under launch freeze, inga nya funktioner, inga nya
priser/copy-beslut. 10 verifierade fynd, alla åtgärdade.

- [x] app/dashboard/settings/billing/page.tsx — läste billing.plan.status/
      trialEndsAt/currentPeriodEnd som aldrig fanns i /api/billing-svaret
      (plan/subscription/trial). BillingData-interfacet skrivet om mot
      faktiskt API-svar; lokal PLANS-priskonstant ersatt med
      getPlanPrice/getPlanLabel.
- [x] app/dashboard/settings/page.tsx:~4347 — `currentPlan === 'Professional'`
      matchade aldrig lowercase-DB-värdet → visade alltid 2 495 kr. Bytt till
      useBusinessPlan().plan + getPlanPrice/getPlanLabel. (Sido-notering: den
      lokala SMSUsageWidget-komponenten i samma fil, rad ~241/243, har samma
      casing-bugg mot egna hårdkodade SMS-siffror som redan avviker från
      SMS_QUOTAS — INTE fixad, utanför de 10 fynden, flaggad separat.)
- [x] components/UpgradeModal.tsx + app/dashboard/agent/page.tsx:~1457 —
      hårdkodat "Professional — 5 995 kr/mån" ersatt med
      getPlanLabel('professional')/getPlanPrice('professional').
- [x] app/dashboard/marketing/leads/page.tsx — villkorlig return före
      useEffect (Rules of Hooks-brott) flyttad till efter alla hooks,
      tillsammans med addon-gaten.
- [x] lib/feature-gates.ts hasFeature() — fail-closed på okänd nyckel
      (var fail-open). Alla callsites grep-verifierade mot FEATURE_GATES,
      se tests/feature-gates-fail-closed.spec.ts för facit-listan.
- [x] app/api/agent/trigger/route.ts — TEAM_AGENTS_ALLOWED upprätthålls nu
      server-side (isAgentAllowed) för externt (cookie-)autentiserade anrop.
      internalSecret-anrop (webhooks/crons/agent_handoff) undantagna
      medvetet — Lisa svarar på inkommande samtal/SMS på alla planer.
- [x] app/onboarding/components/StepPayment.tsx — död komponent (ingen
      importerar den, verifierat), raderad.
- [x] lib/feature-gates.ts — gate-tabellens team_members/users-limit (var
      3/25/∞) alignad till USER_LIMITS (3/5/∞), kommentar om att USER_LIMITS
      är kanonisk.
- [x] app/api/team/invite/route.ts:~54 — defaultplan vid saknad DB-rad
      ändrad 'professional' → 'starter', konsekvent med lib/auth.ts,
      lib/get-plan.ts, lib/useBusinessPlan.ts.
- [x] Prishårdkodningar konsoliderade till getPlanPrice:
      app/onboarding/components/Step5Activate.tsx (Firman/Storfirman-kort),
      app/api/admin/metrics/route.ts (PLAN_PRICES-fallback).

Verifiering: nya tester tests/feature-gates-fail-closed.spec.ts +
tests/team-agent-gate.spec.ts (grönt, 108/108 tillsammans med befintliga
td52-gating/agent-team-spec), `npx tsc --noEmit` 0 fel, `npx next build` 0.

      'jobbpass_proposal' (länk till ägar-ytan i st f rakt godkänn, samma
      mönster som project_debrief), "Hoppa över" avvisar

## Hanna-kopplingen
- [x] getJobbpassServiceConsent(projectId) — läsfunktion, dokumenterad var den
      SKA läsas (befintlig recensions-/rekommendationsflöde), inte kopplad
      till någon cron nu

## Behörighetskontrakt
- [x] tests/permission-contract.spec.ts — registrerade
      projects/[id]/jobbpass + projects/[id]/jobbpass/publish (owner-admin)

## Verifiering
- [x] npx playwright test tests/jobbpass.spec.ts --no-deps (rött → grönt, 52 st)
- [x] npx playwright test tests/permission-contract.spec.ts --no-deps (26 st)
- [x] npx playwright test tests/canonical-project-completion.spec.ts
      tests/project-closeout-copilot.spec.ts --no-deps (26 st, oberörda)
- [x] npx tsc --noEmit (0 fel)
- [x] npx next build (ren build)
- [x] git status + ett commit med specifika filer, ingen push

---

# OperatingExperiment Etapp 2 — förslag/beslutslager (2026-08-19)

Bygger på Etapp 1 (e2644c1e): sql/v157 (EJ körd), lib/experiment/types.ts,
lib/experiment/measure.ts (läs-only). Etapp 2 = förslag → bekräftelse →
inskrivning → redovisning → ägarbeslut. INGEN LLM. Allt fail-soft mot
saknad v157 (42P01).

## Lib
- [x] lib/experiment/types.ts — + EXPERIMENT_DEFAULT_MEASURES (sena_andringar,
      extra_timmar, marginal)
- [x] lib/experiment/propose.ts — proposeExperiment(), dedupe (livstid,
      pending_approvals + operating_experiment, per source_pattern_id),
      opts.allowDuplicate för continue_testing-grenen
- [x] lib/experiment/enroll.ts — maybeEnrollProject(), tids-/kapacitetscheck,
      aldrig blockerande
- [x] lib/experiment/report.ts — buildReadoutBody/buildReadoutCardCopy (rena),
      sweepExperimentReadouts (I/O, concluded+frozen_summary EN gång)

## Approvals-flödet
- [x] app/api/approvals/[id]/route.ts
      - GET (hämta ett kort, business-scoped) — decision-sidan behöver den
      - case 'playbook_pattern_confirmation' — fire-and-forget proposeExperiment
        efter lyckad business_knowledge-insert
      - case 'playbook_kickoff_suggestion' — fire-and-forget maybeEnrollProject
        efter lyckad checklist-insert
      - case 'operating_experiment_proposal' — godkänn: INSERT operating_experiment
        (status active). Avvisa: ingen skrivning. Fail-soft 42P01.
      - case 'operating_experiment_readout' — decision via edited_payload.decision
        (continue_testing|made_standard), reject-side-effect (rejected)
- [x] lib/approvals/action-contract.ts — båda nya typer EXECUTABLE_ACTION
- [x] lib/approvals/routing.ts — båda owner_admin

## UI
- [x] app/dashboard/approvals/page.tsx — TYPE_CONFIG + särskild gren för
      'operating_experiment_readout' (Link till beslutssida, husets
      target_route-idiom som jobbpass_proposal — INGA nya fetch(`/api/approvals)-anrop)
- [x] app/dashboard/experiments/[approvalId]/page.tsx — beslutssidan, tre knappar

## Cron
- [x] app/api/cron/maintenance/route.ts — steg 5, sweepExperimentReadouts per
      företag (rider på befintlig daglig cron, ingen ny vercel.json-rad)

## Facit
- [x] tests/operating-experiment.spec.ts — utökad (Etapp 2-delarna)
- [x] tests/e2e-golden-path/experiment-proof.spec.ts — eget playwright-projekt,
      SKIP ärligt om v157 saknas
- [x] playwright.config.ts — --project=experiment-proof

## Verifiering
- [x] Riktade playwright-körningar (rött→grönt)
- [x] npx tsc --noEmit (0 fel)
- [x] npx next build > buildlog.txt 2>&1 (0)
- [x] git status, ETT commit specifika filer, ingen push
# Launch hardening — Codex lane (2026-08-22)

Avgränsning: Claudes externa, DB-verifierade lanseringschecklista är ensam
kanonisk. Denna arbetslista omfattar bara kod, facit och tekniska bevis och
skapar ingen konkurrerande launch-checklista eller roadmap.

- [x] Supporteskalering rapporterar sanningen om ticket respektive internt larm
- [x] Google-recensionslänk villkoras inte av positiv nöjdhet (ingen review gating)
- [x] Browserlösa facit täcker larmfel, dedupe/ägarskap och nöjdhetsflödet
- [x] Kritiska publika/tokenbaserade rutter får ett smalt regressionsfacit
- [x] Tvåtenant-harneset valideras lokalt och körs om disponibla env/testkonton finns
- [x] `npx tsc --noEmit`, riktade tester och `npx next build` är gröna

## Review

- Supportticketen och 46elks-larmet är nu två separata sanningar. Saknad
  konfiguration, noll mottagare och transportfel ger explicit icke-levererat
  utfall; kundtexten påstår aldrig att teamet notifierats då.
- Modellretry/dubbelklick återanvänder öppet supportärende inom samma tenant,
  tråd och kategori. Ett löst ärende blockerar inte en senare eskalering.
- Nöjdhet lagras internt, medan Google-länken är neutral för båda svaren.
- Publik offert/ÄTA/portal har smal regressionsvakt för dynamiska svar,
  allowlistade DTO:er, tenant-/kundbindning, dedupe och generiska serverfel.
- CI-kontraktslistan + nya launchfacit: 108/108 gröna. Supportsviten: 37/37.
  Det publika/tokenbaserade urvalet: 91/91. `npx tsc --noEmit`: 0 fel.
  `npx next build`: exit 0.
- Full standardsvit startades men innehåller skarpa anrop mot app.handymate.se;
  i den nätverksbegränsade miljön stoppades den vid 907/5166 med EACCES-fel,
  alltså inte ett produktfacit för denna diff.
- Tvåtenant-harneset och dess säkerhetsspärr är validerade (4/4). Den riktiga
  DB-körningen avbröt fail-closed före anslutning eftersom `.env.integration`
  och två disponibla testkonton saknas. Ingen databas berördes.

Resultaten rapporteras till Claude för den kanoniska lanseringsartefakten;
denna sektion är endast utvecklingsbokföring.

---
