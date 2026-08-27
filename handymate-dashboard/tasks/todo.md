# Projektöversikten: datum, dynamiska steg, status + nästa att-göra i listan (2026-08-26, PLAN — väntar på avstämning)

Andreas ask: projektlistan ska redovisa start/slut tydligt; stegen MÅSTE flytta dynamiskt
på riktiga events/automationer; projektets status + nästa "att göra" (Lars m.m.) ska synas
direkt i listan. Kartlagt av tre utforskare + live-DB (34 projekt i prod: 29 saknar steg helt).

## P0 — buggfixar som inte kan vänta (görs direkt, ren korrekthet)
- [x] `project.address` finns inte → alla tre automatiska skapare (quote/lead/booking) skrev
      `address:` → 42703 → skapandet avvisades tyst. Förklarar REALITY-WEEK #2. Lead→projekt och
      bokning→projekt har ALDRIG fungerat i prod. + `customer.address` (död) i booking-vägen.
      Facit: tests/facit-project-create-no-phantom-columns.spec.ts
- [x] `advanceProjectStageForward` returnerar `{moved:true}` vid no-op → nu `{moved:false, skipped:true, reason}`,
      2 anropare uppdaterade (ce44690f)
- [x] `onQuoteAccepted` delegerar till `createProjectFromQuote` (en skapare; sendSms:false bevarar
      dagens beteende; start_date=idag vid signering borttaget) (ce44690f)
      → BESLUT FÖR ANDREAS: ska "Ny deal vunnen"-SMS till ägaren + portal-SMS till kunden (steg 7–8 i
      create-from-quote, aldrig live hittills) slås på vid signering? Idag: nej.

## Del A — Datum i listan (ingen migration: start_date/end_date/completed_at finns redan) — KLAR
- [x] `GET /api/projects`: `actual_start` (min(time_entry.work_date, passerad bekräftad/genomförd
      booking.scheduled_start)) + `dates` via lib/projects/derive-dates.ts på varje rad; `is_late`
      = samma härledning; listan skickar `include=workflow`
- [x] Rad-UI: datumraden med ton (sen/klart/kommande); milstolpe märkt som milstolpe
- [x] maybe-create-from-booking → start_date = bokningens dag; onQuoteAccepted gissar inte längre
      start_date=idag. (Offert→projekt får start via Del B: första bokningen sätter start_date om null)
- [x] Detaljsidan: start/slut redigerbara inline i TwinStrip via befintlig PUT
- [x] tests/project-derive-dates.spec.ts (12) + tests/facit-project-list-dates.spec.ts

## Del B — Stegen flyttar på riktiga events (en brygga, forward-only, idempotent) — KLAR
- [x] `lib/project-stages/event-bridge.ts` `bumpProjectStage` (projectId → invoice/quote → booking →
      kund vid exakt ett aktivt projekt; forward-only; kastar aldrig; läser resultatet)
- [x] ps-01 bara vid signering: lead-/bokningsfödda startar på NULL ("Inget steg ännu");
      quote_signed för befintligt projekt → ps-01
- [x] ps-02: bokningsrutten i realtid + cron-svep (skyddsnät för de andra nio bokningsvägarna);
      sätter start_date om saknas
- [x] ps-03: tidrapport i realtid via onTimeLogged (+ check-in + cron)
- [x] ps-04: varje milstolpe + signerad ÄTA. (progress ≥ 50 utan milstolpar: EJ byggt — bedömt som
      gissning, inte händelse)
- [x] ps-05: färdig egenkontroll + signerad fältrapport + completeProject
- [x] ps-06/07 genom bryggan; ps-07 först när ALLA fakturor är isCustomerSettled.
      (invoice.project_id i ALLA fakturaskapare: EJ svept — auto-invoice/quote-vägen sätter det redan;
      ad hoc-fakturor utan projekt får inget steg, ärligt)
- [x] Manuell bakåtflytt kräver `allow_backwards`, sker tyst (409 + requires_confirmation annars)
- [x] En stegtabell: lib/project-stages/stages.ts (motor + UI)
- [x] Facit: tests/facit-project-stage-producers.spec.ts; utfallsfangst ompekat

## Del C — Status + nästa att-göra i listan (en beräkning, två ytor) — KLAR
- [x] `lib/projects/derive-todo.ts`: deriveTodoMode (lyft ur detaljsidan), pickTopCard (risk → äldst),
      deriveProjectTodo (kort vinner), TODO_PRIMARY_LABEL + getStageBucket flyttade hit
- [x] `GET /api/projects`: EN pending_approvals-query; per rad `stage` + `next_todo` + `dates` + `actual_start`
- [x] Rad-UI: stegchip + "Nästa: … — Lars (+N till)"; sortering needsAction → försenad → väntande kort
- [x] Detaljsidan använder deriveTodoMode — inline-kopian borttagen
- [x] tests/project-derive-todo.spec.ts (14) + tests/facit-project-list-next-todo.spec.ts

## Verifiering
- [x] tsc (exkl. Codex WIP i CustomerTimeline) → riktade (324 gröna) — per del
- [x] full svit lokalt 5421/5421; CI-grind grön på Del C-koden (run 32990227485, 7be335c4).
      `next build` lokalt EJ körd — Codex WIP i CustomerTimeline.tsx är tsc-röd i arbetsträdet; Vercel
      bygger committad kod (list-API:t live-verifierat i prod → deployen är grön)
- [x] Live-probe prod (demo-ägaren): tillfälligt projekt → list-API ger `dates` ("20 aug – 24 aug ·
      försenad 2 dagar"), `stage` (inget steg — ärligt), `next_todo` (Lars checklistekort) → raderat
- [x] Golden Path 16/16 grönt mot prod (inkl. Station 7 "Projektsteget flyttar sig självt", Station 11)
- [ ] Live: skapa bokning för kund utan offert → projekt föds (första gången någonsin) + ps-02 —
      kräver en riktig bokning på ett riktigt konto; Bee Service är kandidaten (Andreas)
- [ ] Polish (ej blockerande): "Nästa"-etiketten visar kortets fulla titel (kan bli en lång fråga);
      överväg `typeLabel: titel` eller trunkering på ordgräns

## Del D — Statusbandet (Claude Design-handoffen, Andreas "kör på" 2026-08-26) — KLAR (69a7ee93)
- [x] components/projects/ProjectStatusBand.tsx: 3-stegs stepper + "Visa alla 8 steg" (stegmodalen),
      ekonomistaplar + prognos (Planering: bara offererat), Redo att fakturera som KLARSPRÅK
      ("Ja — X kr ofakturerat" / "Nej — värsta blockeraren") i stället för procenten, marginal per
      5-statskontraktet
- [x] Sidhuvud: livscykelchip (sex lägen), datumraden (ProjectDatesInline, redigerbar), primärknapp
      = deriveTodoMode (fyra lägen), Fler åtgärder; Att göra döljer sin egen primärknapp
- [x] Översikt: Att göra + Framdrift vänster, Personal-chips + Projektinfo + Att tänka på höger,
      snabbåtgärder; TwinStrip/ProjectStatusCard/RedoAttFakturera/EkonomiPulsCard borta från Översikt
- [x] Fakturorna hämtas vid sidladdning (livscykelchipen sann från start)
- [ ] Skärmdump mot prod efter deploy (scratchpad/screenshot-project.mjs) → till Andreas

## Del E — förbättringsytor 2 + 5 (Andreas "kör på" 2026-08-26) — KLAR
- [x] Fortnox ROT/RUT i Fortnox form: lib/fortnox/housework.ts (kategori → HouseWorkType, radfält,
      /taxreductions-payload), det påhittade TaxReduction-objektet borta, 'submitted' bara vid lyckad
      begäran (ROT + RUT), driftlarm vid saknad kategori/personnummer. FLAGGAT Pass 3/I2: fältnamnen.
- [x] Sidebar-badge på Leverantörsfakturor = okopplade rader (Karins kö), 30s-puls
- [ ] Kvar från listan: "Koppla faktura till projekt"-knapp (6), "Nästa"-etikett (7), agentattribuering
      i en fil (8), facit som låser fasmodellerna mot varandra (9)

## Del F — leverantörsfakturor ↔ projekt från Fortnox (Andreas "Ja kör" 2026-08-26)
- [x] Steg 1: detaljhämtning per ny faktura (Project/CostCenter/referenser/rader) + VAT
- [x] Steg 2: deterministisk matchning fortnox_project → row_project → reference → Karins kö;
      svep i cronen för redan importerade okopplade rader. sql/v171 skriven.
- [x] v171 körd via MCP 2026-08-26 (Andreas "Kör"), facit-SELECT: 6 kolumner → pushad
- [x] Steg 3 (Andreas "Kör steg 3"): märkning (projektnummer) i materialbeställningens ämne+infobox
      (via offerten) och i arbetsorderns SMS; projektet skapas i Fortnox projektregister vid
      födseln (syncNewProjectToFortnox på fyra skapandevägar + batchSync 'project' i cronen);
      kundfakturan bokförs med Project; matchningen använder exakt Fortnox-nummer först. sql/v172.
- [x] v172 körd via MCP 2026-08-27 (Andreas "Kör!"), facit-SELECT: 3 kolumner + index → pushad
- [ ] Radvis allokering inom samma faktura (fortnox_rows finns nu) — bara om ett riktigt fall dyker upp
- FLAGGAT Pass 3/I2: fältnamnen på SupplierInvoice-detaljen; om Fortnox fyller YourReference vid tolkning

## Del G — Utgående kommunikation, Etapp 0 (OUTBOUND_COMMUNICATION_INVENTORY, Andreas "kör allihop" 2026-08-27)
- [x] 8.1: tio sessionslösa serveranrop till /api/sms/send → sendSmsViaElks, resultatet läses
- [x] 8.2: V3 send_email via lib/email; tool-routerns 404-rutter borta (faktura via sändkärnan,
      send_quote fail-closed)
- [x] 8.4: /api/push/send kräver x-cron-secret eller ägande session; 21 anropare via
      internalPushHeaders(); notify_owner läser delivered
- [x] 8.5/8.6: Smart Communications dubblerande SMS efter offert/faktura borttagna
- [x] tests/facit-outbound-truth.spec.ts (allowlist + push-signatur + inga 404-rutter)
- [ ] Etapp 1–4 (eventregister, konsolidering av tre uppföljningsmotorer, e-poststrypunkt, hubben) —
      efter lansering

## Öppet för Andreas
- ps-08 Recension mottagen har ingen automatisk källa (ingen Google-webhook) — förblir manuell.
- Handoffens "Framdrift"-kort och "Personal"-chips är byggda; ProjectInfoCard (beskrivning/offert)
  finns kvar bara under Ekonomi & offert — säg till om beskrivningen ska synas på Översikt.

---

# Read-only inventering av alla utskick (2026-08-26)

## Plan

- [x] Avgränsa samtliga verkliga SMS-, e-post-, push- och interna notifieringsvägar
- [x] Spåra varje utskick till trigger, mottagare, textkälla, transport, loggning och nuvarande kontroll
- [x] Klassificera kundresa, interna händelser, obligatoriska systemmeddelanden, dubletter och döda mallar
- [x] Dokumentera ett kanoniskt eventregister och rekommenderad migreringsordning för Kommunikationshubben
- [x] Kvalitetssäkra rapportens filreferenser och kontrollera att ingen produktionskod eller SQL ändrats

## Review

- Leverans: `docs/audits/OUTBOUND_COMMUNICATION_INVENTORY.md`.
- Rapporten kartlägger kund-, ägar-, team-, system- och tredjepartsutskick med trigger, kanal,
  mottagare, budskap, textkälla, kontroll och verklig status.
- Bekräftade huvudfynd: auth-trasiga server-SMS, saknad V3-emailroute, trasig Smart
  Communication-email, parallella offert/faktura-/reminder-/reviewmotorer, frikopplad
  email_template-yta och pushroute utan intern authgräns.
- Verifiering: samtliga 67 relativa fillänkar i rapporten finns. Endast rapporten och denna
  uppgiftslogg berördes av inventeringen; ingen produktionskod, SQL eller migration ändrades.

---

# Fortnox: kundsynk vid skapande, leverantörsfakturor i cronen, delbetalning/ROT (2026-08-26, pågår)

Godkänd plan: `~/.claude/plans/ja-d-beh-ver-vi-sorted-avalanche.md`. Andreas-beslut: allt före
1 sep trots freeze; explicit status `customer_paid`; kundsynk direkt på alla fem vägar.

## Migrationer (skrivs nu, körs bara efter "kör", migration FÖRE deploy)
- [x] sql/v169_customer_fortnox_sync_error.sql — fantomkolumnen som gav dubblettkunder i Fortnox
- [x] sql/v170_invoice_customer_paid.sql — ny status + paid_amount/settled_at/cancelled_at + 'credited' i CHECK
- [x] Båda körda via MCP 2026-08-26 (Andreas: "Kör du även de nya SQL 169 och 170") + facit-SELECT verifierad: CHECK innehåller customer_paid+credited, 4 kolumner finns, settled_at-backfill 2 rader / 0 saknade, index finns

## Del 1 — kundsynk vid skapande (commit ae0b7d32)
- [x] P0: `syncCustomerToFortnox` returnerar aldrig success när numret inte persisterats; läser .error; scopar på business_id; rapporteraTystFel
- [x] `syncNewCustomerToFortnox` (kortslut på fortnox_connected → syncCustomerWithTracking → tyst-fel-rapport)
- [x] Fem anropsplatser: actions/create_customer, customers POST, tool-router createCustomer, golden-path lead→kund, approve-actions createCustomer
- [x] `batchSync` ordnar på created_at + läser .error; 2h-cronen sveper kunder per företag
- [x] Serverimporterna (import/bulk) anropar batchSync efter loopen
- [x] `sync/customers`-rutten går genom syncCustomerWithTracking (Type/OrgNr/GLN följer med)
- [x] tests/facit-customer-fortnox-create.spec.ts grönt; facit-fortnox-einvoice orört grönt

## Del 2 — leverantörsfakturor i cronen (commit 6921bfea)
- [x] lib/fortnox/import-supplier-invoices.ts (ruttens rad 42–128 flyttade oförändrade, needs_reconnect vid 403)
- [x] Rutten tunn (auth + isFortnoxConnected + Återanslut-mappning kvar)
- [x] Cronen: import FÖRE betalstatus, needs_reconnect separat + dygnsdedupad tyst-fel-rapport
- [x] facit-fortnox-supplier-invoice-import ompekad; nytt cron-facit

## Del 3 — customer_paid
- [x] Rena helpers + tester: status.ts, customer-share.ts, payment-decision.ts, fortnox/classify-payment.ts; typer (paid_via ersätter payment_method)
- [x] apply-payment-kärnan (transition, paid_amount/paid_via/settled_at, bort med registerFortnoxPayment, exporterad runPostPaymentAutomations + handleProjectEvent)
- [x] sync-payments via klassificeraren, alla UPDATE läser error, en runPostPaymentAutomations
- [x] Rutter: status PATCH via kärnan (Golden Path tack-SMS kvar), mark-paid-text, confirm_payment paidVia, claim-paid/reminder-spärr, portal-API-filter
- [x] ROT-grind: validate-rot-request, eligible/generate `.in('status',[paid,customer_paid])`, skv_requested, import-decision
- [x] Konsumenter via isCustomerSettled + minimal UI (badge/timeline/modal)
- [x] Facit + utökade skv-rot-rut/invoice-derive-status; alla listade "måste förbli gröna" gröna

## Verifiering
- [x] tsc 0 fel
- [x] riktade specar gröna; full svit 5322 gröna (2 facit medvetet ompekade: invoices-page-design filter, stegkedjan sync-payments); next build exit 0
- [ ] v169 + v170 körda efter "kör" → push → CI-grind grön → Vercel-deploy
- [x] docs/REALITY-WEEK.md avvikelser #23–26; tasks/lessons.md om fantomkolumn-klassen (cbcfb372)

---

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
- Tvåtenant-harneset och dess säkerhetsspärr är validerade. Skarpkörningen
  2026-08-22 mot två autentiserade konton i olika disponibla företag gav
  51/51 gröna API/RLS-kontroller: egenläsning fungerar; främmande SELECT,
  INSERT, UPDATE och DELETE nekas för samtliga sex tabeller; credentials är
  helt oläsbar. Två direkt-SQL-katalogkontroller hoppades ärligt över utan
  delat databaslösenord och verifierades separat av databasägaren: funktionen
  är SECURITY DEFINER och grants stämmer. Read-only cleanup-stickprov gav
  noll kvarvarande `rls_it_*`-rader i alla fem fixturetabeller.

Resultaten rapporteras till Claude för den kanoniska lanseringsartefakten;
denna sektion är endast utvecklingsbokföring.

---

# Kreativt slutgenomsvep — gemensam avsändare (2026-08-26)

- [x] Ta bort dekorativa etiketter i övre högra hörnet från samtliga bildkällor
- [x] Ta bort sidfotens vänstertexter och centrera `handymate.se`
- [x] Förstora och standardisera H-logotypen till vänster
- [x] Anpassa artikelomslag och social launch-kit till samma kontrakt
- [x] Rendera om hela biblioteket och båda kontaktarken
- [x] Facit- och visuellt granska desktop-, 4:5- och 9:16-original

## Review

- Båda renderkällorna använder nu en ren topp med en optiskt beskuren och
  större H-symbol till vänster; ingen kampanjetikett renderas i övre höger.
- Sidfoten innehåller endast `handymate.se`, centrerad oberoende av format.
- 52 biblioteksoriginal, sju artikelomslag och åtta social-launch-original är
  omrenderade. Det samlade slutarkivet innehåller även den nya logotypmastern
  och social-launch-kitet under en egen mapp.
- Layoutfacit: 21/21 Playwright-tester gröna. Fullstorlekskontroll utförd på
  agentkort, mörk 4:5-bild, artikelomslag och socialt original.
- Projektkontroll: `npx tsc --noEmit` och `npx next build` gröna. Builden
  behåller projektets befintliga varningar om dynamiska serverrutter.

---

# Verksamhetsöversikt — direkt stegbyte och projekt-header (2026-08-26)

- [x] Utöka den delade åttastegsstripen med hoverkort, mini-ikoner och tydliga
  interaktions-/laddningstillstånd
- [x] Koppla verksamhetsöversikten till befintlig tenant-säkrad stage-route
  med lokal bekräftelse, felåterställning och omedelbar UI-uppdatering
- [x] Ta bort radens generella utfällning och göra `Öppna projekt` till en
  större, separat primär handling
- [x] Montera den delade åttastegsöversikten som kompakt header på projektsidan
  utan att duplicera ekonomi- eller statuskortets ansvar
- [x] Lägg browserlösa kontraktstester för direktbytet, hoverkontraktet och
  projekt-headerns återanvändning
- [x] Verifiera riktade tester, `npx tsc --noEmit`, `npx next build` och diff

## Review

- Verksamhetsöversikten byter nu projektsteg via den befintliga
  `/api/projects/[id]/advance-stage`-rutten. Klicket öppnar en liten lokal
  bekräftelserad eftersom stage-motorn kan starta automationer; ingen generell
  dropdown eller projektutfällning används.
- Lyckat byte uppdaterar både deal-kopplade projekt och orphan-projekt i
  parent-state direkt. Fel lämnar föregående steg orört och visas på kortet.
- Den delade stripen visar åtta Lucide-ikoner, hover/fokus-kort, laddning och
  en namngiven header-variant. Projektsidan återanvänder exakt samma komponent.
- `Öppna projekt` är nu en separat teal primärknapp och är enda vägen från
  projektkortet till projektsidan; stegklick navigerar aldrig.
- Verifiering: 16/16 riktade stage-/UX-facit gröna, `npx tsc --noEmit` rent,
  `npx next build` exit 0. Builden visar endast projektets befintliga
  statiska auth-/saknad lokal Supabase-env-varningar.
- Shared-worktree-notering: Claudes Fortnox-commit `2896a6dc` inkluderade de
  spårade UI-filerna medan verifieringen pågick. Inget har återställts eller
  force-flyttats; det nya facittestet ligger separat i arbetskatalogen.

---

# GTM-strategi + Operating Plan för Christoffer (2026-08-23)

- [x] Stäm av juliplanerna mot dagens produkt-, pris- och lanseringsläge
- [x] Uppdatera strategisk position, ICP, erbjudande och kanalordning
- [x] Ersätt kalla mass-SMS som standard med peer selling och juridiskt grindad prospektering
- [x] Skriv en konkret sexveckorsplan med roller, kvoter, demo och uppföljning
- [x] Lås dokumenthierarkin så den tekniska lanseringschecklistan inte dubbleras
- [x] Korsgranska dokumenten och verifiera interna hänvisningar

## Review

- Båda julidokumenten är ersatta med ett dagens-läge-kontrakt: strategin
  håller position, ICP, erbjudande och kanalordning; Operating Plan håller
  Christoffers sexveckorsutförande, demo, uppföljning och mätetavla.
- Kalla mass-SMS till okända är borttaget som standardkanal. Manuell riktad
  kontakt ligger bakom separat relevans-, laggrunds- och kanalbedömning.
- Dokumenthierarkin hänvisar till den externa tekniska lanseringschecklistan
  utan att duplicera den.
- Firman och Storfirman, månads- och årsvis, verifierades skrivskyddat mot den
  körande databasens `billing_plan`; samtliga fyra Stripe-priser är satta.

---

# Nedladdningsbart innehållsbibliotek V1 (2026-08-23)

- [x] Förankra publik namnhierarki: digitalt team, Matte som chefsagent och Uppdrag som en produktberättelse
- [x] Skapa kampanjfamiljen “Hälsa på ditt team” med riktiga agentprofiler
- [x] Skapa kampanjfamiljen “2006 → 2026” utan obelagda konkurrentpåståenden
- [x] Skapa kampanjfamiljen “Så arbetar teamet åt dig” med konkreta automationskedjor
- [x] Skapa fristående inlägg, Reel-omslag, captions, alt-texter och publiceringsguide
- [x] Rendera, visuellt granska, testa och paketera allt som en nedladdningsbar ZIP

## Review

- 29 publiceringsklara bilder: tre karuseller, fyra fristående inlägg och tre
  vertikala Reel/Story-omslag. Därtill fem kontaktark och sex lokala
  agentporträtt.
- Budskapsguide och kampanjcopy låser “det digitala teamet”, Matte som
  chefsagent och Uppdrag som en av flera produktberättelser.
- Visuell QA genomförd mot alla kontaktark samt fullstora agent-, framtids-,
  automations- och reaktiveringsbilder.
- Nedladdningspaket: `public/marketing/handymate-content-library-v1.zip`.
- `tests/content-library-v1.spec.ts`: 12/12 gröna över desktop + mobil.
  `npx tsc --noEmit`: 0 fel. `npx next build`: exit 0.

---

# Förlanseringshype + samlad publiceringskalender (2026-08-23)

- [x] Sätt en trestegsdramaturgi: utmana → avslöja → bevisa
- [x] Skapa tio separata förlanseringsassets för T–21 till T0
- [x] Skriv P1–P10 med CTA och gemensam alt-text
- [x] Mappa varje publiceringsdag till kanal, format, exakt fil och copy
- [x] Lås karusellordning och markera kontaktark som ej publicerbara
- [x] Uppdatera ZIP-paket, renderare och regressionsfacit

## Review

- Arbetsdatum för lansering är 2026-09-14; kalendern är relativ och kan flyttas
  utan att dramaturgin ändras.
- Tio nya bilder tillkom: sju 4:5-teasers/reveals och tre 9:16-bilder för
  T–3, T–1 och T0. Biblioteket innehåller nu 39 publiceringsklara PNG-filer.
- Kalendern täcker 24 augusti–9 oktober med exakt filordning, kanal, format,
  copy-ID, CTA och efterlanseringssekvens.
- Visuell QA genomförd mot förlanseringens kontaktark och fullstora nyckelbilder.
- `tests/content-library-v1.spec.ts`: 14/14 gröna över desktop + mobil.
  `npx tsc --noEmit`: 0 fel. `npx next build`: exit 0.

---

# Video Production Pack + Seedance 2.5 (2026-08-23)

- [x] Verifiera Seedance 2.5 mot ByteDances officiella källor
- [x] Definiera hybridgränsen mellan verklig film, verklig UI och AI-B-roll
- [x] Skapa fem videokoncept med manus, storyboard och shot list
- [x] Skapa produktionsklara Seedance-prompter och kvalitetsgrind
- [x] Lägg videorna i publiceringskalendern och nedladdningspaketet
- [x] Kör dokumentfacit, tsc och produktionsbygge

## Review

- Seedance 2.5 verifierades mot ByteDances officiella lansering och modellsida:
  30 sekunder per generering, förlängning och multimodala referenser; officiell
  API-åtkomst beskrevs som kommande via BytePlus ModelArk.
- Fem filmer är produktionssatta: grundarmanifest, 45-sekunders produktbevis,
  team-reveal, 2006→2026 och en verklig automationskedja.
- Hybridgränsen är explicit: Andreas och produkt-UI är verkliga; Seedance äger
  B-roll, miljöer, kontrollerad porträttrörelse och konceptövergångar.
- Sex färdiga Seedance-prompter, referenspaket och kvalitetsgrind ingår i ZIP.
- `tests/content-library-v1.spec.ts`: 18/18 gröna över desktop + mobil.
  `npx tsc --noEmit`: 0 fel. `npx next build`: exit 0.

---

# Profilbildspaket (2026-08-23)

- [x] Skapa primär mörk teal profilbild med optiskt centrerad H-symbol
- [x] Skapa ljus, inverterad teal och transparent 1080×1080-master
- [x] Skapa intern safe-area-guide för rund och kvadratisk beskärning
- [x] Dokumentera kanalval och vad som aldrig ska publiceras
- [x] Uppdatera ZIP, facit och produktionsverifiering

## Review

- Fem 1080×1080-original levereras: primär mörk teal, ljus, inverterad,
  transparent master och en intern safe-area-guide.
- Den transparenta mastern är verifierad som riktig RGBA-PNG; den primära
  mörka varianten är rekommenderad profilbild i sociala kanaler.
- Innehållsbiblioteket omfattar nu 52 publiceringsklara bilder och nio
  kontaktark. Safe-area-guiden är uttryckligen märkt som intern.
- `tests/content-library-v1.spec.ts`: 20/20 gröna över desktop + mobil.
  `npx tsc --noEmit`: 0 fel. `npx next build`: exit 0.

---

# LinkedIn-banner (2026-08-23)

- [x] Verifiera aktuell företagssidesstorlek mot LinkedIns officiella hjälp
- [x] Skapa ett tidlöst, on-brand omslag i central säker zon
- [x] Rendera, visuellt granska och lägga i nedladdningspaketet
- [x] Kör facit, tsc och produktionsbygge

## Review

- LinkedIns aktuella rekommendation verifierades mot officiell hjälp:
  4200×700 px, PNG/JPEG och högst 3 MB.
- Slutfilen är 4200×700, 2,29 MB och visuellt granskad i originalformat.
  Huvudbudskapet ligger centralt; dekorativa ytterelement tål beskärning.
- Renderaren isolerar nu varje original före export och skriver PNG-filer via
  buffert med retry, så ultrabreda format inte kan påverka övriga kampanjer.
- `tests/content-library-v1.spec.ts`: 22/22 gröna över desktop + mobil.
  `npx tsc --noEmit`: 0 fel. `npx next build`: exit 0.

---

# LinkedIn-artikelserie (2026-08-23)

- [x] Förankra format och newsletter-upplägg i LinkedIns aktuella riktlinjer
- [x] Skriva sju kompletta artiklar ur Handymates verifierade produktberättelse
- [x] Förankra reaktiveringsartikeln i svensk lag och IMY:s vägledning
- [x] Skapa sju egna 1920×1080-omslag och inlinebildplan
- [x] Visuellt granska samtliga omslag och uppdatera nedladdningspaketet
- [x] Kör artikel-, bild-, typ- och produktionsfacit

## Review

- Sju artiklar om 707–909 ord levereras i serien `Framtidens
  hantverksföretag`, färdiga för publicering från Andreas profil.
- Serien går varje torsdag 27 augusti–8 oktober och är införd i den auktoritativa
  publiceringskalendern utan att skapa dubbla företagsinlägg samma dag.
- Sju sammanhållna 1920×1080-omslag och exakta inlinebildplaceringar ingår.
  Kontaktark och tre typografiskt svåraste original granskades visuellt.
- Reaktiveringsartikeln håller GDPR:s laggrund separat från
  marknadsföringslagens kanalregler och länkar Riksdagen, IMY och
  Konsumentverket. Texten ger inte juridiska garantier.
- `tests/content-library-v1.spec.ts`: 26/26 gröna över desktop + mobil.
  `npx tsc --noEmit`: 0 fel. `npx next build`: exit 0.

---

# Social Launch Kit — kampanj 01 (2026-08-23)

- [x] Förankra tonalitet, färg och budskap i Handymates designsystem
- [x] Skapa 30-dagars contentplan och kanalprinciper
- [x] Skapa kampanjmanus: LinkedIn-karusell, Instagram och Reel
- [x] Generera ImageGen-bakgrunder utan produktpåståenden eller fejkad UI
- [x] Rendera publiceringsklara assets med riktig logotyp och exakt svensk text
- [x] Visuell QA, filinventering och leveransnotering

## Review

- Två dokumentära, nordiska ImageGen-källbilder skapades utan text, UI,
  logotyper, belopp eller testimonial-påståenden.
- Åtta finalassets renderades deterministiskt: sex LinkedIn-slides,
  Instagram 4:5 och Reel 9:16. Riktig Handymate-logotyp samt lokala
  Space Grotesk/DM Sans används.
- Kampanjmanus, captions, alt-texter, Reel-storyboard, 30-dagarsplan och
  återanvändbara bildprompts ligger i `docs/marketing/social-launch-kit/`.
- Visuell QA genomförd mot kontaktark och tre fullstora nyckelassets.
- `tests/social-launch-kit.spec.ts`: 5/5 gröna. `npx tsc --noEmit`: 0 fel.

---

# Handymate Launch Desk V1 (2026-08-24)

- [x] Lås service-role-only datakontrakt för prospekt, kontaktutfall och spärrar
- [x] Bygg rena domänregler för juridisk kanalgrind, fit-poäng och daglig prioritering
- [x] Bygg superadmin-API för import, sökning, uppdatering, aktivitetslogg och spärr
- [x] Bygg klickstyrd AI-brief som bara får använda källmärkta prospektfakta
- [x] Bygg mobilvänlig intern arbetsyta under `/admin/launch`
- [x] Lägg till CSV-mall/import och länk från befintlig adminpanel
- [x] Facit-testa auth, ingen autosändning, källkrav, spärr och mättratt
- [x] Kör riktade tester, `npx tsc --noEmit` och `npx next build`

## Scopegränser

- Launch Desk är Handymates interna säljstöd, aldrig kundernas `leads_outbound`.
- V1 skickar inga SMS, mejl, brev eller LinkedIn-meddelanden. En människa
  verkställer alltid kontakten utanför ytan och loggar utfallet.
- AI får formulera brief och utkast från sparade fakta, men får inte göra
  research, lägga till osourcade fakta eller välja bort spärrar.
- Kalla SMS ingår inte. Oklassad bolagsform får bara manuell telefonbedömning
  eller ingen kontakt; systemet gissar aldrig kanalbehörighet.

## Review

- Ny superadminyta under `/admin/launch`: källkontrollerad CSV-import,
  deterministisk fit, daglig prioritering, kontaktkomplettering, klickstyrd
  AI-brief, manuell utfallslogg, nästa steg och permanent spärr.
- `gtm_account`, `gtm_activity` och `gtm_suppression` är service-role-only.
  Kontaktutfall + pipeline-status och spärr + auditnotering sker atomiskt via
  två snäva RPC:er. Migrationen ligger i `sql/v166_launch_desk.sql` och ska
  köras manuellt före användning.
- Kall kontakt till enskild/okänd/oklassad bolagsform är stängd i både kod
  och RPC. SMS finns inte som kanal. Launch Desk importerar eller skriver
  aldrig i kundernas `leads`/`leads_outbound`.
- Varje rad bär ändamål, rättslig grund, källa, kontrolldatum och ett
  granskningsdatum efter 180 dagar. AI-snapshoten utesluter e-post och telefon,
  och varje e-postutkast får en obligatorisk stoppformulering.
- `tests/launch-desk.spec.ts` + kolumn-, schema- och permissionsfacit:
  128/128 gröna över desktop och mobil. `npx tsc --noEmit`: 0 fel.
  `npx next build`: exit 0 (befintliga miljö-/dynamic-route-varningar kvar).

---

# Lanseringspaket — kommersiell sanning och produktbevis (2026-08-26)

## 1. Bränsle som verkligt tak

- [x] Kartlägg alla kostnadsbärande strypunkter och definiera ett fail-closed entitlement-kontrakt
- [x] Bygg valbara, namngivna påfyllningsnivåer från en kanonisk serverkonfiguration
- [x] Stoppa ny kostnadsbärande agentverkställighet vid tomt Bränsle utan att stoppa läsning, användarens manuella arbete eller redan pågående externa leveranser
- [x] Visa exakt vad som pausas, vad som fortsätter och hur en påfyllning återstartar teamet
- [ ] Facit-testa nollgräns, påfyllning, samtidighet, ägargrind, Stripe-webhook och fail-closed mätfel — allt utom atomisk samtidighetsreservation är täckt; V1 stoppar nästa nya kostnad men två exakt samtidiga anrop kan fortfarande passera samma sista saldoavläsning

## 2. En enda prissanning

- [x] Konsolidera planvolymer, användargränser, månads-/årspris och garantitext till kanoniska källor
- [x] Synka onboarding, billing, publik copy i detta repo och marknadsdokumentation
- [x] Bestäm och implementera grundarkundsgarantin konsekvent
- [x] Förklara årsbetalning, uppsägning och Bränsle utan intern kredit-/COGS-vokabulär

## 3. Lisa — skarpbevis

- [x] Definiera exakt marknadsförd kedja och skilj bevisade delsteg från framtida röstagentfunktion
- [x] Bygg/utöka ett säkert käll- och kontraktsbevis för inkommande/missat samtal → kund/lead/deal → SMS/dialog → synligt facit
- [ ] Kör hela kedjan inklusive bokning mot disponibel test-/demomiljö — blockerat av tomt 46elks-saldo och avsaknad av tilldelat telefonnummer på testföretagen
- [x] Justera copy så ingen yta påstår att Lisa redan är en fri talande röstagent

## 4. Namn och resultatlandningssidor

- [x] Standardisera Matte som "chefsagent" i kundvänd copy; behåll Uppdrag som funktionsnamn
- [x] Skapa tre publika resultatberättelser: hitta pengar, skydda marginal, ta bort administration
- [x] Återanvänd verkliga produktkedjor, godkännanden och verifierade utfall; inga fejkade kundcase
- [x] Lägg till browserlösa copy-/route-facit

## 5. Oklippt produktdemo

- [x] Synka demo-manus mot sexstegsstoryn och nuvarande pris-/produktlöften
- [x] Skapa en reproducerbar inspelningskörning med demoreset, exakta klick och fallback
- [x] Verifiera de nya publika landningarna visuellt i riktig webbläsare på desktop och mobil
- [ ] Spela in den oklippta produktfilmen — körplanen är klar men den anslutna webbläsarytan saknar videoexport och produktionsdemon kräver en godkänd inloggning

## Slutverifiering

- [x] Riktade facit gröna
- [x] `npx tsc --noEmit` rent
- [x] `npx next build` grönt
- [x] Visuell mobil/desktop-QA på de publika ytorna
- [x] Review-sektion med exakta kvarvarande externa blockerare

## Review

- Bränsle är nu en serverauktoritativ stoppgrind före Matte, agenttrigger,
  central SMS-sändning och de direkta AI-/röstvägarna. Påfyllning erbjuds som
  tre namngivna, planrelativa nivåer; klienten kan inte bestämma beloppet och
  Stripe-retry kan inte fylla på två gånger för samma checkout-session.
- Planpris, årspris, användare, SMS, samtal och garanti läses från samma
  kommersiella fakta i onboarding och billing. Ett äldre `null`-fel i
  obegränsade användar-/samtalsnivåer upptäcktes och rättades samtidigt.
- Matte heter publikt Chefsagent och funktionen Uppdrag. `Mission Control`
  förblir ett internt arkitekturnamn. Tre riktiga resultatlandningar finns i
  applikationen och sitemapen och har granskats i desktop- och mobilbredd.
- Lisas kodkedja har ett separat lanseringsfacit och ett skarpt
  sjustegsprotokoll. Det externa facitet är INTE grönt än: 46elks har tomt
  saldo och testföretagen saknar tilldelade nummer. Ingen kundcopy lovar därför
  en komplett talande röstagent.
- Den oklippta sexstegsdemon har ett synkat manus och en exakt
  inspelningskörning. En MP4 skapades inte eftersom webbläsarverktyget saknar
  videoexport; inspelningen är ett mänskligt capture-steg efter inloggning och
  demoreset.
- Kvarvarande Bränslebegränsning: stoppet är praktiskt fail-closed före varje
  nytt kostnadsanrop, men är inte en atomisk reservationsmotor. Två anrop som
  startar i exakt samma ögonblick kan läsa samma sista saldo. En strikt
  öresgräns under samtidighet kräver ett separat reservations-/avräkningssteg.
- Slutfacit: 102/102 riktade tester gröna, `npx tsc --noEmit` 0 fel och
  `npx next build` exit 0. Fullsviten startades men de sessionsberoende testerna
  anropar `app.handymate.se`; nätverksgrinden gav `EACCES`, inte produktfel, och
  körningen avbröts vid 1 100/5 246.

---

# Kundtidslinje per projekt (2026-08-26)

## Plan

- [x] Kartlägg vilka tidslinjehändelser som har en bevisbar projektkoppling
- [x] Lägg ett gemensamt, tenant-säkert projektkontextlager på tidslinjesvaret
- [x] Bygg en mobilvänlig projektgrupperad vy med kanalöversikt och kronologiskt alternativ
- [x] Låt osäkra kundövergripande kontakter ligga i en tydlig restgrupp — gissa aldrig projekt
- [x] Lägg browserlösa facit för resolver, tenantfilter, grupperings-UX och direktlänkar
- [x] Kör riktade tester, `npx tsc --noEmit` och `npx next build`

## Review

- Kundtidslinjen startar nu projektgrupperad men kan växlas tillbaka till en
  enda kronologisk lista. Varje projektgrupp visar sina bevisade kanaler,
  händelseantal och en direktlänk till projektet.
- Projektkopplingen är fail-closed och accepterar bara direkt `project_id`
  eller tenant-/kundfiltrerade kedjor via bokning, faktura, ärende, offert
  eller lead. Fritext och "kundens enda projekt" används aldrig som gissning.
- Utgående SMS läses nu ur revisionskällan `sms_log`, så säkra relationer för
  offert-, faktura-, boknings- och projektstegs-SMS kan följa med. Den enklare
  speglingen i `sms_conversation` dedupliceras mekaniskt.
- 53/53 riktade kommunikations-/resolverfacit gröna, `npx tsc --noEmit` rent
  och `npx next build` exit 0. Kolumnvakten hade ett samtidigt, orelaterat
  rött fynd i `lib/project-ai-engine.ts` (`project_milestone.id`); inga nya
  fel pekade på kundtidslinjens frågor.

---

# Tilldela projekt från vunnen-affären (2026-08-26)

## Plan

- [x] Återanvänd affärens befintliga ansvarige och projektets `project_assignment`
- [x] Lägg ett frivilligt, mobilvänligt personval i Grattis-modalen
- [x] Validera behörighet, aktiv användare och tenant före projektskapandet
- [x] Skapa tilldelningen server-side och visa ett ärligt delresultat om just tilldelningen misslyckas
- [x] Lägg browserlösa facit och kör tester, `tsc` och build

## Review

- Grattis-modalen har nu ett frivilligt personval som förväljer affärens aktiva ansvarige när det finns en sådan.
- Samma projektskapandeanrop skapar en riktig `project_assignment`; behörighet, aktiv användare och tenant valideras före första projektskrivningen.
- Deduplicerings- och retry-vägarna återanvänder samma idempotenta tilldelning, och ett tilldelningsfel visas som ett ärligt delresultat utan falskt lyckandebesked.
- Verifierat: 43/43 riktade browserlösa facit gröna, `npx tsc --noEmit` rent och `npx next build` exit 0.

---

---

## Plan: AI-kostnad — varje token mäts per kund, Bränsletaket (15 %) gäller överallt (2026-08-27)

Andreas: "väldigt viktigt att säkerställa att alla anrop som kostar tokens faktiskt mäts av för respektive kund" + taket = 15 % av planpriset (finns redan som Bränsle, `FUEL_PLAN_BUDGET_ORE`).

Källgranskning 2026-08-27 (47 externa AI-anropsplatser i lib/ + app/):
- Omätta: `lib/agent/orchestrator.ts` (V3 run_agent: flat-taxa 0.000009/token, bara agent_runs — aldrig cost_event/Bränsle), `lib/pipeline-ai.ts` (Haiku via voice/analyze), `lib/ai.ts` (död kod).
- Ogrindade (kostar tokens utan Bränslekoll): ai-copilot, onboarding-chat/scrape, generate-insights-cron, agent-context-cron (context/preferences/pricing/proactive-care), communication/evaluate, gmail-lead-import + email/inbound, leads/outbound + neighbours, monthly-review, meeting-worker (Whisper), playbook-pattern, storefront/generate, quotes/ai-generate, Matte intent-agent (SMS + Gmail), customer-facts, quote-nudge, autopilot-SMS, seasonality, orchestrator.
- Inkonsekvens: `checkFuelGate` ger `fuel_unavailable` för planen `enterprise` (1 konto i prod) medan `fuelBudgetOreForPlan` dokumenterat faller till Storfirman-nivån → det kontot har SMS + agenter avstängda i tysthet.

Princip: **Bränsle slut/oläsbart ⇒ samma väg som saknad API-nyckel** (fail-closed, deterministisk fallback, aldrig krasch).

- [x] `lib/costs/fuel.ts`: `fuelAllows(supabase, businessId, site)` en-radare; enterprise-konsekvens; ny bucket `pipeline_call_analysis`
- [x] Mätning: orchestrator (riktig usage×modell via `meterDirectLlmCall`, flat-taxan bort), pipeline-ai, ta bort `lib/ai.ts`
- [x] Grindar i libs (fallback-vägen): intent-agent, customer-facts, quote-nudge, autopilot generate-sms, seasonality, neighbour/letter, monthly-review, detect-pattern, context-engine ×2, pricing-engine, proactive-care, process-job (släpper claim), orchestrator (`checkCostGuards`), next-best-action-prompt (användes via relativ import — inte död)
- [x] Grindar i rutter (402 + `code`): ai-copilot, onboarding ×2 (bara med session), communication/evaluate, leads/outbound, leads/neighbours, monthly-review POST, storefront/generate, quotes/ai-generate; crons: generate-insights, gmail-lead-import (meddelanden lämnas olästa), email/inbound (arkiveras, ingen lead)
- [x] "Ingen kund ⇒ ingen LLM": generate-letter/neighbour/autopilot-SMS kör malltext utan business_id; `isLikelyLead`/`parseLeadFromEmail` kräver mätkontext
- [x] Facit `tests/facit-ai-kostnad-sanning.spec.ts` (16 tester): varje extern AI-fil mäts (själv eller av namngiven anropare) och grindas (själv eller i namngiven entrypoint); explicit, motiverad undantagslista (launch-desk = intern COGS); orchestrator utan flat-taxa; taket = 15 % av planpriset ±1 kr
- [x] tsc rent, riktade specar (99), full svit 5499/5499; REALITY-WEEK #29–30; lessons

Medvetet utanför: `app/api/admin/support-tickets/[id]/reply` (Handymate-adminens eget supportsvar bokförs i dag på kundens business — vår kostnad, borde bokföras internt; ingen grind, avsiktligt). `isLikelyLead` anropar modellen även för förhandsgodkända avsändare ("Always return YES") — en deterministisk kortslutning skulle spara tokens; inte ändrad nu (beteende, inte sanning).

### Påfyllning av Bränsle — fasta kronor (2026-08-27, Andreas-beslut)
- [x] Nivåer 100/250/500 kr, samma för alla planer (`FUEL_TOPUP_TIERS`), självkostnad utan påslag (internt beslut, skrivs inte ut i kundytan)
- [x] "Vad räcker det till" som bunt ur prislistan (`topupExamples`: 100 kr ≈ 90 SMS och 50 AI-svar), nedåt till tiotal — styckpris går inte att räkna baklänges
- [x] "I din takt: ≈ N dagar till" ur kontots egen dygnsförbrukning (`avgDailyOre` → `topupDaysAtPace`)
- [x] Kortet: "Priser exklusive moms"; facit låser att kortet aldrig visar styckpris/självkostnad/påslag
- [ ] Stripe automatic tax: INTE påslaget — Stripe Tax är inte aktiverat på kontot (webhook-kommentaren "Idag kör Stripe utan automatic_tax"); aktivering i Stripe-dashboarden är ett Andreas-steg, sedan `automatic_tax: { enabled: true }` i fuel-topup + övriga checkouts

---

## Onboarding & första dagarna — Codex-analysen granskad, plan godkänd (2026-08-27)

Lanseringen flyttad minst en vecka (Andreas 2026-08-27). Plan: `.claude/plans/ja-d-beh-ver-vi-sorted-avalanche.md`.
Verifierat: 8 steg (inte 10), Company Scan + Hemtur körs på /dashboard efter finalize, dag 0 finns noll riktiga kort.

### Lager 1 — sanning/korrekthet/hygien
- [x] A0 grind-buggen `onboarding_step >= 7` → `>= 8` (REALITY-WEEK #31) + facit
- [x] A2 LiveTouren: "5 aktiva" → `{teamRow.length} på plats`, "5 aktiva"-statruta → `TEAM.length` "i ditt team", "Komplettera setup 2/5 klart / 40 %" → mock av Kom igång-railen utan tal + facit
- [x] A1 MalNudge ut ur "Det här behöver dig idag" → månadsrapporten före MalBlock + facit omskrivet
- [x] A4 hygien: CLAUDE.md onboarding-sektion, GYLLENE-VAGEN 8 steg, OnboardingHeader default 6, döda Step1BusinessAccount/Step3Phone/StepProgress borta + facit
- [x] A3 värdekvitto på hemkön (`buildValueReceipt` i `JarvisHome.executeSend`, röd flash vid misslyckat utförande)

### Lager 2 — första besöket slutar med en verklig handling
- [x] Steg 1: `lib/onboarding/first-action.ts` (ren picker + copy) + `tests/first-action.spec.ts` (22)
- [x] Steg 2: `lib/invoice-reminder-card.ts` ur send-reminders (verbatim, cronen 583→289 rader, alla pinnade strängar kvar) + `lib/agents/daniel/quote-follow-up-card.ts` + `buildOpenedQuoteFollowUpMessage`
- [x] Steg 3: POST `/api/onboarding/first-action` + rutt-facit
- [x] Steg 6 + A3: `value-receipt.ts` send_sms + hemkön
- [x] Steg 4–5: CompanyScan-CTA ("Börja med X →" / "Visa mig runt först" / "Lägg till din första kund"), JarvisHome (omhämtning, expandera, scroll+ring, Hemtur väntar på första beslutet), facits, Golden Path-overlay
- [x] Steg 8: Daniel-dedup i quote-follow-up (168 h, alla statusar, `filterOutConflicting`)
- [ ] Full svit, CI, Golden Path 16/16, manuell genomgång, skärmdump till Andreas

### Lager 3 (efter lansering): B9 dag-7-mail → B8 aktiveringsmått → B6 first_focus → B7 adaptiv Kom igång → B10 ekonomifrågor ut ur steg 2
