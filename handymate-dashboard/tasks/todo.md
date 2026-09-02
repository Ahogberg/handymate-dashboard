# Nattpass 9: Första 10 kunderna — räddningskön + lanseringsbevis (Claude + Sonnet-agent 2026-09-02)

Program: docs/launch/FORSTA_10_KUNDER_BEVIS_OCH_RADDNING.md (Codex förslag,
Claudes justering: två bevisnivåer, P1 = kunden når inte första värdet,
inga manuella DB-fixar, frysdatum). Plan: tasks/plan-raddningsko.md.

- [x] sql/v203 (KÖRD som v202 + verifierad; omdöpt, nummerkollision): raddningsarende (unik öppen rad per
      företag+signal), lanseringsbevis (Grind B-stationer som rader)
- [x] lib/raddning/signaler.ts: nio rena bedömare med trösklar
- [x] /api/cron/raddningsko 05:25 UTC (cron-hemlighet eller admin): urval
      pilot/klar/ny ≤ 30 d, aldrig demo/test; svep per signal (fail-soft);
      upsert öppna, stänger försvunna (resolved_by system), rör aldrig
      manuell_fix_kravdes; digest-mejl bara när något är öppet
- [x] Admin: flik "Räddning" (/admin?tab=rescue): Tar det / Löst / Avfärda,
      bokför manuell fix, sektion Lanseringsbevis med formulär
- [x] /api/admin/launch-readiness: manual_proofs läses ur lanseringsbevis
      (pass ur riktig rad, annars manual som förut)
- [x] Facit tests/raddningsko.spec.ts i kontraktsgrinden; cron-auth 44/43;
      tsc 0, 397 kontrakt gröna, build ren
- Kända val: Fortnox-synkfel utan tidsstämpel (proxy: registrerat fel);
  företag som åldrats ut ur 30-dagarsfönstret rörs inte av cronen
- Byggagenten fastnade ~2 h i utforskning innan den skrev; nudge via
  meddelande löste det. Lärdom: sätt "börja skriva efter N minuter" i
  agentprompten

---
# Bygglistan 1–2: Referral-stämpeln + självgående onboarding (2026-09-02)

Plan: `C:\Users\Gaming\.claude\plans\cozy-crafting-reef.md` (godkänd 2026-09-02).
Beslut från Andreas: belöning = en månad gratis (Stripe-kundsaldo); stämpeln på alla kundvända dokument.

## Etapp A — "Skickat via Handymate" (worktree `.worktrees/attribution`, branch `feature/attribution-stamp`)

- [x] A1 `lib/branding/attribution.ts` — helper + rena tester (a4a072c3)
- [x] A5 `sql/v202_attribution_link_enabled.sql` + toggle i Inställningar (1f4e4ddb) — omdöpt från v200 (Codex tog v200/v201), KÖRD+verifierad via MCP 2026-09-02
- [x] A3 `app/via/[code]/page.tsx` — publik landningssida + `landing_events`-logg (33cacbf4)
- [x] A2a e-postvägar: quotes/send, send-invoice, invoice-reminder-send, portal notification-emails, orders/send (cbe8eba6)
- [x] A2b PDF: quote-/invoice-templates (4), pdf-generator (2), ata/pdf, job-report (cbe8eba6)
- [x] A2c publika sidor: PortalHandymateAttribution (+monteringar), quote/[token], jobbpass, lead-portal, rekommendera, widget (d1646ab4)
- [x] A4 belöningen: `grantReferralMonthCredit` (Stripe-kredit), död kod bort, SMS/sidtext (54d55bcf)
- [x] A6 facit — delat på fyra specar (`facit-attribution-{email,pdf,pages}`, `attribution-helper`, `via-landing`, `referral-reward`) i stället för en; parity-tester gröna
- [x] Verifiering 2026-09-02: tsc 0 fel, 242/242 playwright gröna (listan + partner-*, parity, onboarding-*, permission-contract, activation-metrics, facit-outbound-truth); npm run build — se granskning
- [x] Oberoende granskning av hela diffen (subagent) + åtgärder (95c6fd63) — 250/250 gröna, build exit 0 efteråt

## Etapp B — självgående onboarding (worktree `.worktrees/onboarding-hardening`)

- [ ] B1 `lib/admin/adoption.ts` + pilots-route + admin-vy + `tests/adoption.spec.ts`
- [ ] B2 betalgrind allowlist, `paid` från GET, verify-route + polling, PUT-tak `<= 8`, döda routes bort, tester
- [ ] B3 `email_inbound_route` auto-provision vid finalize + 46elks-retry-cron
- [ ] B4 livscykelmail dag 2/14 (generaliserad dag-7-cron)
- [ ] B5 Genomgången för ny firma utan import
- [ ] B6 `tests/e2e-onboarding-fresh.spec.ts`
- [ ] Verifiering: tsc, next build, playwright-listan, MCP-SELECT för berörda konton

# Parkerat (Andreas 2026-09-02): minnesförstärkning 3 + 4, om några dagar
- 3: citat ur källan som krav för varje agent_memories-rad (samma regel som
  customer_fact); det som inte kan citeras sparas inte.
- 4: kortens utfall tillbaka i minnesvikten — minne som ledde till godkänt
  kort vinner, till avvisat tappar (access_count + execution_result finns).
- Skäl att vänta: 4 kräver riktiga kortutfall (piloten + Bee Service),
  3 ändrar skrivvägen men datamängden är 29 rader. Bäst efter en vecka
  med genomgången före betalningen och pass 1–3 i drift.

# Nattpass 8: kundminnet, pass 3 — ett läs-API + relevanssökning (Claude + Sonnet-agent 2026-09-02)

- [x] sql/v201_agent_memories_fts.sql (KÖRD + verifierad): content_tsv
      (svensk ordbok) + GIN på agent_memories
- [x] lib/agents/memory.ts: byggMinnesfraga (ord ≥ 4, max 12, OR),
      relevansfråga via textSearch(websearch, swedish) slås ihop före
      viktighetsrankningen (dedupe på id, TOP_N+3); buildMemoryPrompt
      "Relevant för det här:" / "Om kunden:" / "Om företaget:"
- [x] lib/context/kundkontext.ts: hamtaKundkontext = Företagsmodellen +
      kundfakta + senaste samtal/SMS/mejl/portal + minnen i ETT block
      "## Vad Handymate vet" med källspår; tak 2 500 tecken (hela sektioner,
      aldrig mitt i mening); tomt ⇒ ''. Alla frågor scopade på business_id
- [x] Inkopplat (ersatt, inte ovanpå): Matte-chatten (verifierat kund-id,
      fråga = senaste meddelandet), agent-triggern, röstanalysen (efter
      branschblocket), get_customer-verktyget (fält kontext)
- [x] Facit tests/kundminne-pass3.spec.ts (40) i kontraktsgrinden;
      tsc 0, 343 kontrakt gröna, build ren
- Känt: getRelevantMemories använder getServerSupabase internt (före
  passet) — kontextens minnesdel hoppar tyst utan env; annars normalt

---

# Nattpass 7: kundminnet, pass 2 (Claude + Sonnet-agent 2026-09-02)

- [x] Gap 6: agent_memories.customer_id (sql/v200, KÖRD + verifierad).
      extractAndSaveMemory/getRelevantMemories tar customerId; utan kund
      läses bara företagsnivå (customer_id null), med kund läses båda och
      kundens egna rankas först (+0.2 boost). Dedupe jämför aldrig mot
      annan kunds minne. Fail-soft vid saknad kolumn. Anropare: agent-
      triggern (trigger_data.customer_id) och Matte-chatten (verifierat
      sidkontext-id). Claude la till safeMemoryCustomerId (bara säkra
      tecken i .or-filtret)
- [x] Gap 7: Hanna läser customer_fact före kundvårdskortet: fakta på
      kortet (payload.kundfakta + "Att tänka på"), spärr vid "inte sms"/
      "ej sms"/"ring" (factBlocked). SMS-texten oförändrad
- [x] Facit tests/kundminne-pass2.spec.ts i kontraktsgrinden; tsc 0,
      302 kontrakt gröna, build ren

---

# Nattpass 6: kundminnet över kanaler, pass 1 (Claude + Sonnet-agent 2026-09-02)

Revision: docs/audits/KUNDMINNE_REVISION_2026-09-02.md. Plan:
tasks/plan-kundminne-pass1.md. Byggt av Sonnet, granskat + verifierat här.

- [x] Gap 1: SMS-historik per kund (phoneCandidates + .in) i tidslinje + trail
- [x] Gap 2: Mattes resolver matchar kund via findCustomerByPhone (normaliserat)
- [x] Gap 3: resolvern läser 5 senaste sammanfattade samtal (channel 'call')
- [x] Gap 4: ägare/teammedlem som SMS:ar det tilldelade numret körs aldrig
      som kund (lib/matte/owner-sender.ts isTeamPhone, fail-closed = kund)
- [x] Gap 5: kundens egna ord från lead-formulär i tidslinjen + trailen ('form')
- [x] Gap 8: customer_fact i compliance-trailen ('note')
- [x] Gap 9: död röstparser app/api/voice/process borttagen
- [x] Facit tests/kundminne-kanaler.spec.ts i kontraktsgrinden; tsc 0,
      274 kontrakt gröna, build ren
- Pass 2 (ej byggt, väntar på beslut): gap 6 agentminne per kund (ny kolumn),
  gap 7 Daniel/Hanna läser kundfakta när de skriver
- Pre-existing rött, orört: tests/lisa-launch-proof.spec.ts (2 tester,
  voice/incoming lead/deal-koppling + product-language-copy) — röda även
  före passet, ligger i nattsviten

---
# Branschförståelse steg 1 — "laga ledningen" (Claude 2026-09-02)

Andreas: "Kör steg 1 direkt." Pushad 496f20a3, auto-deployad. Inga migrationer.

- [x] lib/branch: 15 bransch-ID:n + svensk etikett/yrke/företagsord + alias-
      tabell (svenska namn, snickeri, vvs, hantverkare, prefix "Måleri AB");
      resolveBusinessBranch (branch först, industry bara reserv), describeBranches
- [x] lib/branch/trade-context: specialties[] + företagets jobbtyper → block
      "## Bransch och inriktning" i agent-triggern, Matte-chatten, röstanalysen
- [x] 12 AI-/prompt-ytor rewirade från `industry` ('hantverkare' på ALLA konton)
      till `branch`; ingen gissar 'Bygg'/'hantverkare' längre (facit hittade
      tre till i första körningen: approve-actions, e2e-deal-flow, kampanj-SMS)
- [x] Biblioteken normaliserar via aliastabellen: produktbank, kunskap,
      offertmallar, säsongsteman (plumber→vvs, "Måleri AB" är inte el),
      SKV-kategori (mark→MarkDraneringarbete, allround gissas ALDRIG som Bygg)
- [x] Facit tests/branschledningen.spec.ts; tsc 0, 306 gröna i regressionen

## Kvar i programmet (omordnat av Andreas 2026-09-02 — INTE påbörjat)
- Princip: en bransch exponeras i onboardingen FÖRST när den har källbelagt
  startpaket + branschprompt. Ordningen är därför jobbtyper → paket → exponering.
- [ ] Steg 4 (sist): exponera de branscher som fått paket (snickare/golv/hvac/
      trädgård/låssmed/städ/flytt) i onboardingen, eller ta bort ur biblioteken;
      mark/totalentreprenad saknar innehåll
- [ ] Steg 3: branschpaket (Codex Branschbevis V1-form) + branschspecifika
      systemprompter
- [ ] Steg 2 (PÅGÅR): startpaket per bransch med VERKLIGA, källbelagda jobbtyper.
      Andreas 2026-09-02: gör ALLA branscher FÖRST, granska sedan samlat — då
      kan jobbtyper tas bort och ROT/RUT fastställas i ett svep, konsekvent
      över branscher (samma jobbtyp återkommer i flera).
      docs/bransch/: el.md KLAR (11 källor, 18 startpaket + 9 tillägg + 4 ute).
      Sonnet-agenter kör vvs, bygg, snickeri, maleri, tak, mark, ventilation,
      totalentreprenad, allround på samma mall. ALLA märkta OGRANSKAD tills
      Andreas sagt sitt. Golv/trädgård/låssmed/städ/flytt: utanför scope.
      Mall per fil: källhierarki myndighet → Skatteverket ROT/RUT → 5–7 riktiga
      firmor; ≥3 källor = startpaket, 2 = tillägg, 1 = ute; ROT-kolumn
      ROT/RUT/ROT*/Nej/? där bara SKV:s egen sida får ge ett ROT-påstående.

# Nattpass 5: genomgången före betalningen (Claude + Sonnet-agent 2026-09-02)

Andreas: "Kör!" — betalningen ligger EFTER importen och en genomgång av
kundens egen firma. Ingen prova-på: ingen dashboard, inga agenter, inga
kort före betalningen. Byggt av en Sonnet-agent efter
tasks/plan-genomgang-fore-betalning.md, granskat och verifierat här.

- [x] Ny stegordning (TOTAL_STEPS = 9): 4 Import → 5 Genomgången (NY,
      StepGenomgang) → 6 Aktivera → 7 Artikelregister → 8 Rundtur
- [x] lib/onboarding/company-scan-rows.ts: buildScanRows utbruten (ren) +
      teamGorNarDuAktiverar (vad teamet gör per rad, aldrig belopp/löften)
- [x] Step5Activate visar fynden överst; paid-guard (server-härlett via
      GET /api/onboarding) så redan betalande aldrig ser betalsteget igen
- [x] Prickar 7, MatteSetupGuide 9 texter, tratt-etiketter 1–9,
      dashboard-grind onboarding_step >= 9 (prod: alla ≥ 8 är klara)
- [x] Facit tests/genomgang-fore-betalning.spec.ts i kontraktsgrinden;
      tsc 0, 256 kontrakt gröna, build ren
- Medveten oskärpa: onboarding_step sparade före 2026-09-02 tolkas i nya
  ordningen (gamla 4 = betalning läses som import)

## Morgonkontroll 2026-09-02 05:40 UTC
- Kreditbevakning: 46elks-saldo 0 kr (varning), Stripe-nyckel i TESTLÄGE,
  Anthropic ok, databas ok
- Nattsviten fyrade inte på schema (02:00 UTC); workflow_dispatch ger 403
  för integrationen — Andreas kör manuellt från Actions
- Sentry Handymate: inga nya ärenden

---

# Nattpass 4: Aktivera senare + fyra ogrindade automationer (Claude 2026-09-02)

Andreas beslut i chatten: "Ta punkt 1 och 5 du så tar vi 3 och 4 imorgon."

## Punkt 1 — betalfrågan förtjänt, men INGEN gratis prova-på
- [x] ~~"Aktivera senare"-knapp förbi Stripe~~ ÅTERTAGEN 03:50: Andreas
      vill uttryckligen inte ha en gratis prova-på-period (lockar folk som
      signar upp och avbryter direkt). Kortet krävs i steg 4 som förut.
      BESLUT 04:05: ingen prova-på-period alls, inte heller med kort.
      Modellen är betala direkt + resultatgaranti. Kvar av passet:
      första kvittot i /api/billing, bannern som nu syns, aktiva-konton
- [x] lib/billing/forsta-kvitto.ts: första verifierade kvittot ur
      pending_approvals (RECEIPT_APPROVAL_TYPES + execution_result.outcome
      = success + buildValueReceipt). GET /api/billing → first_receipt;
      'trial' räknas nu som provperiod (is_trialing/days_left)
- [x] components/BillingStatusBanner.tsx: läste data.subscription_status som
      rutten aldrig returnerat → bannern var osynlig för ALLA. Läser nu
      subscription.status/trial.ends_at/first_receipt. Ny teal-banner
      "Teamet har levererat sitt första resultat: … Aktivera Handymate" när
      kontot saknar Stripe-prenumeration. Utgången provperiod vinner
- [x] lib/billing/aktiva-konton.ts: morgonbrief + nästa-bästa-handling
      filtrerade hårt på subscription_status = 'active' — provperiodskonton
      fick varken brief eller kort och kunde aldrig få ett kvitto. Nu ingår
      trial/trialing med klar onboarding och giltig trial_ends_at
- Kvar oförändrat (beslut): 14 dagars trial_ends_at är fortfarande gränsen
  (lib/auth.ts checkSubscriptionStatus). Betalfrågan ställs vid kvittot,
  senast vid provperiodens slut

## Punkt 5 — Launch Truth Gate punkt 8 (fyra ogrindade mot kund)
- [x] 1. Bokningspåminnelse 24 h: kräver uttryckligt
      automation_settings.sms_day_before_reminder = true (isolerad,
      fail-closed läsning) + ligger nu bakom agents_globally_paused i
      agent-context. Prod: 0 rader i automation_settings, 0 skickade/30 d
- [x] 2+3. Mattes kundsvar SMS/mejl: business_config.matte_customer_reply_enabled
      (sql/v199, KÖRD, default false). Av → svaret blir ett send_sms-kort
      ("Matte vill svara …") som ägaren godkänner. Prod: 0 matte_reply/30 d
- [x] 4. Recensionsförfrågan via tidsutgång i maintenance BORTTAGEN: ett
      obesvarat kort expirerar i steg 1, skickar aldrig. Manuellt
      godkännande kvar. Prod: 0 väntande kort
- [x] Facit: tests/facit-ogrindade-automationer.spec.ts +
      tests/aktivera-senare.spec.ts i kontraktsgrinden
- [x] tests/pricing-truth.spec.ts: Firman users 5 → null (följer Andreas
      2a6eda7 "ta bort Firmans användartak"; var röd på main)

## Sparade beslut (Andreas 2026-09-02: "de två besluten kan vi ju spara ner")
- INGEN prova-på-period, varken gratis eller med kort på fil. Betala
  direkt + resultatgaranti. Skälet: en period där man kan klicka runt och
  avbryta lockar oinvesterade konton. Bygg aldrig en trial-väg utan att
  Andreas sagt det uttryckligen.
- Tyst tid för push är konstant 21:00–07:00 svensk tid. Per-företag/
  per-person-inställning ("stör inte mellan …") byggs när någon ber om det.
- lib/smart-communication.ts isQuietHours räknar på serverns UTC-klocka
  (canSendMessage, kund-SMS via communication-ai). Ska peka på
  lib/tysta-timmar.ts som hub-gate och push gör. Inte rört.

## Imorgon (Andreas + Claude): punkt 3 "Säg det en gång" mobilt och
   punkt 4 veckorapport med värdekvitton — spec först, sedan bygge.

---

# Nattpass 3: tyst tid för push + två gamla facit (Claude 2026-09-02)

- [x] tests/first-focus + tests/job-type-start: pekade på Step6LiveTour för
      logik som flyttat till FirstAssignmentFinal — gröna igen (d4abcf9)
- [x] lib/tysta-timmar.ts: isWithinQuietHours + stockholmMinutesNow flyttade
      ut ur hub-gate (re-export kvar) så SMS-grind och push delar klocka
- [x] lib/notifications/tyst-tid.ts: 21:00–07:00 svensk tid; hant +
      teamuppdatering hålls, beslut aldrig; morgonsammanfattning (1 rad =
      som den är, flera = "N saker hände medan du var borta" + rubriker),
      gruppering per företag+riktad mottagare, rader >36 h utgår
- [x] lib/notifications/push-held.ts + sql/v197_push_held.sql (KÖRD +
      verifierad: RLS, partiellt unikt index på öppna dedupe-nycklar):
      fail-open — kan raden inte hållas skickas pushen direkt som förut
- [x] sendApprovalPush: hållning efter dedupe, före fetch
- [x] /api/cron/push-morgon (05:10 + 06:10 UTC = 07:10 svensk tid sommar/
      vinter; körningen inom tyst tid hoppar): släpper per mottagare via
      sendInternalPush, stämplar released_at/release_outcome, bokför i
      push_dispatch_log. ?force=1 bara för admin
- [x] sql/v198_push_subscriptions_hardened.sql (KÖRD): push_subscriptions
      fanns aldrig i produktion — v2 kördes aldrig, PWA-push har fallerat
      tyst hela tiden. Samma tabell utan v2:s USING(true)-policy
- [x] tests/push-tyst-tid.spec.ts i kontraktsgrinden; cron-auth 43/42;
      tsc 0; test:contracts 225 gröna

## Att läsa av
- push_held: SELECT release_outcome, count(*) FROM push_held GROUP BY 1
  efter första morgonen. Cron-svaret loggar held/expired/released/groups.
- push_subscriptions: efter nästa PWA-installation ska en rad dyka upp.

## Beslut för Andreas
- Fönstret är konstant (21:00–07:00). Per-företag/per-person-inställning
  ("stör inte mellan …") är nästa steg om någon ber om det.
- lib/smart-communication.ts isQuietHours räknar på serverns UTC-klocka
  (canSendMessage) — SMS-grinden i hub-gate är rätt, men communication-ai
  går via canSendMessage. Inte rört i natt.

---

# ÄTA + byggdagbok-sprinten (Claude 2026-09-02)

Plan: ~/.claude/plans/recursive-painting-possum.md. Beslut: project_log = Byggdagbok,
field_reports = Fältrapport; ÄTA = fällorna + dokumentet (fullt affärssystem = spår framåt);
mobil = dagboksvy + ÄTA-skicka + etiketter; väder = GPS→SMHI i mobilen, manuellt på desktop.
Deploy-ordning: v195 → ÄTA-kod → v196 → dagbokskod → mobil.

## DEL 1 — ÄTA
- [x] A1 En sanning för "avtalad": ATA_AVTALADE_STATUSAR/ATA_FAKTURERBARA_STATUSAR i lifecycle.ts, fyra ekonomisiter
- [x] A2 sql/v195_ata_dokumentet.sql (vat_rate, project_document.change_id, backfill av namnlösa rader)
- [x] A3 lib/ata/{labels,items,totals,send-message,create-ata}.ts
- [x] B API-fällorna: send (canTransitionAta + business_id + ingen JSON-fallback + GET), sign (livscykel), [id] (404/400), changes (skapaAta, svenska), executor name:, portal (items/summor/pdf_url), documents change_id
- [x] C1 lib/ata/pdf.ts + /api/ata/[id]/pdf + /api/ata/sign/[token]/pdf
- [x] C2 Portal: kundetiketter, rader, summor, PDF, foton
- [x] C3 Desktop: SendAtaDialog, synliga åtgärder, Kopiera länk, PDF-knapp, invoice-preview, foton, ChangeModal-fix, "Skapa & skicka", onNewAta, preview.items
- [x] C4 tests/ata-dokumentet.spec.ts + regressionslistan grön
- [x] v195 KÖRD + verifierad 2026-09-02 (3/7 ÄTA:er backfillade; rad.change_id→src.change_id rättad vid körning)

## DEL 2 — Byggdagbok
- [x] D1 rot_rut_documents DEL 4 → live-schema; kundtidslinjen; voice/execute; jobbuddy; addWorkNote; project_log_note via helper
- [x] D2 sql/v196_byggdagboken.sql (ata_change_id, attest, locked_at, addendum, project_log_revision + RLS)
- [x] D3 lib/diary/{weather,locking,permissions,write,photos,smhi,time-summary}.ts
- [x] D4 API: GET/POST logs, PATCH/DELETE [logId] med lås 409 + actions, POST/DELETE photos, GET /api/weather
- [x] E1 components/projects/diary/* + montering i page.tsx (LogModal bort)
- [x] E2 PDF: foton, timmar, attest, LÅST, from/to, ensureSpace före ritning
- [x] E3 lib/job-report.ts läser dagboken (log_report_%-vakt)
- [x] E4 tests/byggdagboken.spec.ts + work-report/matte-time-logging uppdaterade + regressionslistan grön
- [x] F display:{type_label,agent,approve_label} i GET /api/approvals + /api/mobile/home
- [x] v196 KÖRD + verifierad 2026-09-02 (5 kolumner, 2 index, project_log_revision + 2 RLS-policyer)

## DEL 3 — Mobil (handymate-mobile, main)
- [x] E1 lib/api: Byggdagbok-block, väder, display, Project.customer_id (90a12f9)
- [x] E2 ÄTA-skicka från projektvyn + beskrivningsvakt (77f8362)
- [x] E3 DiaryList + CreateDiarySheet + projektkort + /projects/[id]/diary + lib/weather + GDPR-text (ee61dae)
- [x] E4 approvals: etiketter från backend, Projekt-filter, död Bokningar bort (c995f2a)
- [x] E5 foton på ÄTA bakom ATA_ATTACHMENTS_ENABLED=true (a53c737)
- [x] tsc + jest gröna (26 suiter / 188 tester), pushat till origin/main 2026-09-02

## Verifiering
- [x] tsc 0, next build ren, playwright-listan i planen grön
- [ ] Skarptest ÄTA + dagbok (plan §Verifiering 4–5); mobil efter EAS-bygge (Andreas)

---

# Nattpass 2: onboardingtratten (Claude 2026-09-02)

Stöd för Andreas onboarding-A/B. Ingen migration — tidsstämplarna bor under
onboarding_data._funnel (servern äger nyckeln).

- [x] lib/onboarding/funnel.ts: markStepReached (första gången vinner),
      markFinalized, readFunnel, stripFunnelFromClientData, sammanstallTratt
      (nådde/bortfall/median per steg, per variant studio/classic, var de
      ofullbordade står, legacy-fallback på onboarding_step, testkonton
      exkluderade men listade)
- [x] PUT /api/onboarding stämplar steg + variant; POST finalize stämplar
      finalized_at best-effort; app/onboarding/page.tsx skickar variant
- [x] GET /api/admin/onboarding-funnel?days=30|90|365 + /admin/onboarding-
      funnel (isAdmin), länk från /admin
- [x] tests/onboarding-funnel.spec.ts i kontraktsgrinden
- [x] tsc 0, 12 onboarding-sviter + facit 176 gröna, test:contracts 209
- [x] Merge av origin/main (partner-självfaktura, samtalsefterarbete,
      v191→v193) utan konflikter; tsc + contracts gröna på merged tree

## Rött på main före passet (inte rört — nattsviten kommer flagga)
- tests/first-focus.spec.ts + tests/job-type-start.spec.ts pekar på
  Step6LiveTour för logik som flyttade till FirstAssignmentFinal i
  8df45b0/0ecda0b (buildFirstMissionPrompt anropas inte längre alls).

## Att läsa av i morgon
- /admin/onboarding-funnel: konton skapade efter deploy får tid per steg;
  äldre konton visas "(utan tid)" på nuvarande steg. Variant blir 'classic'
  tills NEXT_PUBLIC_SETUP_STUDIO_ENABLED sätts.

---

# Nattpass 1: tenant-svep av rutterna utanför standardgrinden (Claude 2026-09-01→02)

Andreas: "kör igenom nummer 1 och sen nummer 2 direkt när det är klart,
pausa inte för accesser". Rapport: docs/audits/TENANT_SWEEP_2026-09-01.md.

- [x] Inventering: 554 rutter, 120 utan getAuthenticatedBusiness, 38 utan
      igenkänd grind granskade rad för rad (tre parallella granskningar)
- [x] KRITISKT: reminders hade hårdkodad reservhemlighet → verifyCronSecret
- [x] HÖGT: google/callback osignerad OAuth-state → HMAC + sessionsmatchning
      (lib/google/oauth-state.ts); karin-deadlines, invoices/auto-generate,
      morning-brief: "Bearer undefined"-mönstret → verifyCronSecret
- [x] Google Calendar-webhooken kräver kanaltoken (lib/google/channel-token.ts)
- [x] quotes/track kräver sign_token; portal messages, quotes/public
      fråga/bokning, lead-portal, public/book, storefront/track,
      partners/register: fail-closed rate limits (checkPublicRateLimitDb)
- [x] ÄTA-signering atomisk, fältrapport-reject engångs, inbjudan utan
      utgång = utgången, Swish-QR validerar, voice/greeting signeras,
      inbound-mejl faller bara tillbaka vid saknat schema, auth/register
      kryptografiskt business_id, portalens customer_message business-filtrerad
- [x] Facit: tests/facit-tenant-sweep.spec.ts + tests/facit-route-auth-
      inventory.spec.ts (PUBLIC_BY_DESIGN är beslutet) — i CI-grinden
- [x] Rött på main före passet: cogs-matare räknade 2 bokforMatteUsage,
      efb8d69 lade till en tredje — facit uppdaterat
- [x] tsc 0, 27 berörda sviter + nya facit 208 gröna, test:contracts grön

## Beslut för Andreas (INTE ändrat)
- public-dto exponerar customer.portal_token i offertsvaret (offert→portal-
  redirect). Scope-eskalering inom samma kund. Gata efter accept?
- admin/partners/[id]/approve är muterande GET (mejllänk).
- Portaltoken utan utgång, återaktiveras vid ny länk.

---

# Lanseringsgrund: CI-grind, driftsynlighet, kortkvalitet (Claude 2026-09-01)

Andreas ask efter genomgången "nästa utvecklingssteg inför lansering":
punkt 3 (korten signal före notiser), 4 (driftsynlighet) och 5 (CI).
Andreas kör själv Grind B + onboarding-A/B parallellt. Branch
claude/next-dev-steps-launch-b4xqwu.

## 5 — CI
- [x] `.github/workflows/contracts.yml`: push/PR-grind = tsc + 12 browserlösa
      sviter, inga hemligheter, inga browsers, < 3 min. Root-filen
      "contracts-workflow-att-lagga-in.yml" flyttad in och borttagen.
- [x] `.github/workflows/playwright.yml` (fulla prod-sviten m. service-role-
      nyckel): NATTLIG 02:00 UTC + workflow_dispatch, inte längre på push/PR.
- [x] Nytt jobb `tenant-isolation` i den nattliga: kör
      `npm run test:tenant-isolation` när TENANT_*-secrets finns, hoppar
      SYNLIGT (::warning::) annars. Secrets att lägga i repot: se filhuvudet.
- [x] `types/react-dom-server-browser.d.ts`: tsc var röd på färsk checkout
      (TS7016 i två offertdokument-facit från 269641f) — ambient modul.
- [x] npm-script `test:contracts` = exakt CI-listan.
- [x] Facit: tests/facit-ci-grind.spec.ts.

## 4 — Driftsynlighet
- [x] Sentry (@sentry/nextjs 10.73): sentry.{client,server,edge}.config.ts,
      instrumentation.ts, withSentryConfig + instrumentationHook i
      next.config.js. PÅ bara med DSN; sendDefaultPii=false; ingen replay.
      Adapter lib/observability/sentry.ts (kastar aldrig) — ErrorBoundary,
      app/global-error.tsx och rapporteraTystFel går via den.
- [x] Kreditbevakning `/api/cron/credit-watch` 05:05 UTC
      (lib/observability/credit-watch.ts): 46elks-saldo (/a1/me, gräns
      CREDIT_WATCH_ELKS_MIN_SEK=300), Anthropic 1-token-probe (kreditstopp =
      error), Stripe /v1/balance (nyckel + livemode), databas. Mejl vid
      warn/error, SMS via HANDYMATE_SUPPORT_ALERT_PHONES vid error.
- [x] `/api/health` visar sparat kreditläge (platform_health_check) — anropar
      ALDRIG leverantörer själv. error → 503, warn → 200 + warnings[].
- [x] Facit: tests/facit-driftsynlighet.spec.ts + tests/credit-watch.spec.ts.

## 3 — Kortkvalitet
- [x] lib/approvals/kortkvalitet.ts (rent): summeraKort + bedomBrusgrind.
      Konstanter: MIN_SAMPLE=5, BRUS_EXPIRED_PCT=80, PAUS_DAGAR=14,
      BRUSGRINDADE_TYPER = dispatch_suggestion, checklist_forslag.
- [x] lib/approvals/noise-gate.ts (fail-open) inkopplad FÖRE insert i
      lib/dispatch.ts och lib/egenkontroll/suggest-checklist.ts. Paus
      bokförs en gång som automation_activity 'kortkvalitet'/skipped.
- [x] Admin: GET /api/admin/kortkvalitet?days=30|90 + /admin/kortkvalitet
      (per typ, per företag+typ, brusgrindens läge). Länk från /admin.
- [x] Push TTL/prioritet/dedupe vid SÄNDNING: lib/notifications/push-policy.ts
      (tre klasser beslut/hant/teamuppdatering), push_dispatch_log
      (fail-open), sendApprovalPush deduplicerar före fetch och bokför efter,
      /api/push/send skickar TTL+urgency (web-push) och ttl+priority (Expo).
- [x] Facit: tests/kortkvalitet.spec.ts + tests/push-policy.spec.ts.

## Migration
- [x] `sql/v191_platform_health_and_push_dispatch.sql` KÖRD via MCP
      2026-09-01 (Andreas "Kör!"), facit-SELECT verifierad: relrowsecurity
      = true på båda, 0 grants till anon/authenticated, dedupe-indexet finns.

## Verifiering
- [x] tsc 0 fel (var 2 fel på färsk checkout före types/-filen)
- [x] test:contracts 158/158; grannsviter push/dispatch/checklist/driftlarm
      102/102; outbound-truth/innehållskontrakt/feature-gates 86/86
- [x] next build exit 0 (689 rutter); Kontraktsgrind grön på branchen (run 33553161185, 2,5 min)
- [ ] Efter deploy: sätt NEXT_PUBLIC_SENTRY_DSN + SENTRY_DSN i Vercel,
      kör v191, trigga /api/cron/credit-watch manuellt (admin-session
      räcker), läs /api/health och /admin/kortkvalitet.

---

# Prisslingan V2 — pass 5: faktura-UI + materialpåslag + städ (Claude 2026-08-31)

Pass 4 + Work Report V1 LIVE (ea5078e9). v183 KÖRD+verifierad.

- [ ] UX4a: InvoiceAddRowCombo (QuoteAddRowCombo-mönstret på delad useProductSearch — flytta hooken till neutral plats) monterad i LineItemEditor; "Sätt pris"-etikett för prislösa; ROT-flagga bara när fakturans globala typ matchar
- [ ] Materialpåslag (beslut 4): projektmaterial-prissättningen använder kundlista → pricing_settings.material_markup_pct → inget påslag + varning; hårdkodade 20 bort ur projects/[id]/materials-routen; onboarding-värdet från steg 3 börjar verka
- [ ] v184_drop_price_list.sql: DROP TABLE price_list CASCADE (0 rader — bevisat) — visa Andreas + "kör" före MCP-körning; + v185 drop supplier_pricelist (0 rader, 0 refs) i samma granskning
- [ ] UX6: sql-vy prisloop_metrics (prissatt-andel per business, andel quote_items 30d med linked_product_id, AI-rader pris 0) + enkel admin-tabell
- [ ] Facit + tsc + sviter + build + REN-worktree-tsc → push → deploy → SLUTRAPPORT för hela Prisslingan V2

---

# Prisslingan V2 — pass 4: agenterna + reservationer serverside (Claude 2026-08-31)

Pass 3 LIVE (aa4e840c). v183 väntar Andreas "kör v183".

- [x] UX3a: lib/products/price-context.ts → Matte-chattens kontext (create_quote hade NOLL priskontext), intent-agenten (regeln rad 87 har äntligen en lista), tool-routerns createQuote namnmatchar → linked_product_id + article_number (rör aldrig modellens pris)
- [x] UX3b: lib/reservations/suggest-for-items.ts → approvals create_quote_draft skickar reservations_snapshot fail-soft (tool-routern: medvetet EJ — createCanonicalQuote saknar fältet, dokumenterat)
- [x] D1: kundlistan är ÖVERLÄGG i buildPriceContext — [P#]-handtagen skrivs ALLTID; facit i ai-quote-product-linking
- [x] D3: GET /api/pricing/resolve (priceListId + priceList, force-dynamic); quotes/new-prefillen bytte två anon-nyckel-queries mot ETT fetch
- [x] UX5: getDefaultReservations string|string[] (union) + seedReservations får productBranches
- [x] Facit (pass 4-describe i prisloop-ux2 + D1-test) — tsc 0, 12 sviter gröna
- [ ] build + REN-worktree-tsc → push → deploy → rapport

---

# Prisslingan V2 — pass 3: dedup + unikt index + upsert (Claude 2026-08-31)

Pass 2 LIVE (4533d1e8). v183 är DESTRUKTIV (DELETE av dubblettrader) —
filen visas för Andreas och körs via MCP först efter hans uttryckliga "kör".

- [x] C1 källfix: namn+enhet-dedup i getDefaultProducts (Lärling fanns i TIO branscher efter långsvansen — analysskript bekräftade 13 tvärs-nycklar + 1 inom-bransch); HM-BYG-018 omdöpt 'Tillbyggnad (stomme och tätt hus)'; C1-facit i product-register.spec
- [x] v183_products_dedup_unique.sql SKRIVEN (dry-run-frågor + verifierings-SELECT inbäddade; prod-läget dokumenterat: 15 grupper/11 businesses, Bee-tien avgörs på äldst) — EJ KÖRD, väntar Andreas granskning + "kör v183"
- [x] C3: POST /api/products upsert (ilike-namn+enhet m. wildcard-escape, hitta+prissätt → updated_price, 23505-nät, kanoniskKategori v88-normalisering, created:true/false i svaret)
- [x] C4: quotes/new auto-create speglar created:false+updated_price via setLocalPrice
- [x] Facit: products-upsert.spec + C1-namndedup — tsc 0, tio riktade sviter gröna
- [ ] build + REN-worktree-tsc → push → deploy → visa v183 för Andreas

---

# Prisslingan V2 — pass 2: kanonisering + beta-av + branscher (Claude 2026-08-31)

Andreas "Kör" efter pass 1-avstämningen. Pass 1 LIVE (f2fa8c9).

- [x] B1: lib/products/price-list-view.ts (getPublicPriceList, sales_price>0) + 6 läsare omkopplade + voice/analyze → products (grossistpriserna borta ur samtalsanalysen)
- [x] B2: död kod bort — sync-price-list, seedPriceList, /api/price-list/seed-from-onboarding (0 anropare), getDefaultPriceList/PriceListEntry/price-list-defaults, approvals legacy-gren, tests/price-list-sync; 4 facit omskrivna till nya kontraktet
- [x] v182_pricing_v2_rls_members.sql KÖRD via MCP + policy-SELECT verifierad (alla 4 bär business_users-UNION)
- [x] UX2a: "Saknar pris (N)"-pill (?filter=saknar-pris) + Prissätt snabbt (delad QuickPriceInput, Enter=spara, raden lämnar filtret)
- [x] UX2b: pricedCount/unpricedCount i oversikt; AgentReadinessCard levande text + filter-länk; checklistan matas med prissatta
- [x] UX2c: StepProductRegister "10 vanliga att prissätta nu"
- [x] UX2d: OB_DOTS/OB_DOT_TOTAL i constants — 7 hårdkodade ställen ersatta, facit uppdaterat
- [x] Nollställning: 147 gissade fastpriser → 0 i 11 branscher (timartiklar kvar för overlay 1f); prispolicyn dokumenterad i filhuvudet
- [x] Branscher: lib/product-defaults-longtail.ts (subagent, 571 prislösa artiklar, 11 branscher, deduction-fördelning granskad — enda RUT-raden i carpenter är korrekt Möbelmontering) + mergad i getDefaultProducts (kärnan först, seed-index bevaras)
- [ ] Facit + REN-worktree-tsc + build + regression (ALDRIG pipat) → push → deploy-verifiering → rapport

---

# Prisslingan V2 — pass 1: pengasanning + offertloopen (Claude 2026-08-31)

Godkänd plan (C:\Users\Gaming\.claude\plans\recursive-painting-possum.md).
Avstämning med Andreas efter pass 1. Inga migrationer i detta pass.

- [x] A1: delad quote→invoice-mappare (lib/invoices/quote-to-invoice-items.ts) + rotRutLaborBasis; from-quote/create-final-invoice/project-invoice-draft/tool-router/invoices-POST byggs om; InvoiceItem får labor_amount + linked_product_id
- [x] A2: ROT-sanning server-side i PUT /api/invoices (calculateCappedDeduction + excludeInvoiceId — som var en DÖD parameter och nu trätts in i usage-frågan)
- [x] A3: buildFortnoxInvoiceRows (VAT-arv, negativ rabatt, subtotal bort, heading/text→textrader, ArticleNumber fasad)
- [x] A4: påminnelsens total (inkl-moms + avgifter, beraknaPaminnelseTotaler) + femte ROT-formeln bort
- [x] A5: prislös tid — bort med ||500/||895, warnings visas i ProjectInvoiceModal + from-time-entries returnerar warnings
- [x] A6 FULL: ROT/RUT-val per ÄTA-rad i ChangeModal + AI-ÄTA-flaggor + create-final-invoice/draft/invoice-preview respekterar (TD-26 stängd)
- [x] 1a: applyProductToItem — radpris överlever prislös artikel
- [x] 1b: priceLabel i tre desktopväljare
- [x] 1c: standardpris-erbjudandet i ItemRow (desktop) + trådning genom QuoteItemsSection till båda sidorna
- [x] 1d: AI-prompten: prissatta + prislösa i separata block, handtag intakta
- [x] 1e: auto-create prissätter bankartikeln i stället för dubblett (PUT-väg + namnmatch-vakt)
- [x] 1f: timpris → seedade arbetsartiklar (applyHourlyRateToDefaults, seedProducts/finalize/seed-products-routen) + materialpåslags-fält i Step3HowYouWork → pricing_settings-merge i PUT /api/onboarding
- [x] 1g: QuoteQuickstartCard i samklang med seeden (450/1200)
- [x] Facit: quote-to-invoice-mapper, fortnox-row-builder, reminder-totals, apply-product-pricing, ai-quote-product-linking-utökning, onboarding-overlay — tsc 0 fel, 63/63 + 19/19 gröna
- [ ] next build + bred riktad regression (ALDRIG pipat) → push → rapport till Andreas (AVSTÄMNING före pass 2)

---

# Rapportera dagens arbete V1 — Codex 2026-08-31

Godkänt: projektbunden röst/text i native-appen, samma Matte/Lars och
befintliga log_time/add_work_note. Ingen migration, fakturering, utskick,
projektavslut eller deploy. Mobilen byggs från GitHub-snapshot 1d078364 i
separat arbetskopia; Claudes lokala mobiländringar lämnas orörda.

- [x] Spåra röst, MatteSheet, projektkontext, bekräftelse och verkliga skrivare.
- [x] Avgränsat rapportläge med serverägd person/projekt/datum, behörighet och timerkontroll.
- [x] Mobil ingång för röst/text, bevarad kontext och tydliga separata bekräftelser/kvitton.
- [x] 174 riktade backendtester och 130 mobiltester; tsc rent i båda; next build exit 0; lokal Android/iOS-export; hash-/schema-/constraintkontroll; 9/9 skrivskyddade PostgREST-prober; granskbar mobilpatch.
- [ ] Efter merge/deploy: fysisk telefon, faktisk medarbetare och tvåtenant-/återförsöksprov enligt docs/handoffs/WORK_REPORT_V1_2026-08-31.md. Ingen EAS-build eller deploy gjord här.

Mobilpatch och gränser: docs/handoffs/WORK_REPORT_MOBILE_V1.patch och
docs/handoffs/WORK_REPORT_V1_2026-08-31.md. Separat fynd: portalens äldre
project_log-läsning använder fel kolumner; rätta först efter beslut om
vilka historiska anteckningar kunden får se. Nya rapportanteckningar har
uttryckligt portalfilter, oberoende av detta gamla frågefel.

---

# Inför nästa jobb V1 — Codex 2026-08-31

Andreas har godkänt bygget. Läsande förberedelse för verifierad bokning och
projekt, Lars som avsändare och befintlig Matte-chatt som nästa steg.
Inga utskick, nya godkännanden, migrationer eller agentmotorer. Native-appen
ändras inte; webbytorna ska fungera på mobil och desktop. Tidigare ändringar
i CSV/import, marknadsföring och dokument bevaras.

- [x] Verifiera körande schema och befintliga behörighets-/källvägar.
- [x] En läsande modell + autentiserad API-rutt; inga sidoeffekter vid GET.
- [x] Förberedelse i dagsplan, bokning och projekt; källor, luckor och fel synliga.
- [x] Fråga Matte via befintlig prompt-ingång, ingen automatisk chattur/åtgärd.
- [x] 138 riktade tester gröna (60 nya), slutbuild exit 0, separat tsc exit 0, 11/11 läsande PostgREST-schema/filter-prober godkända.
- [x] Dokumentera vad som är lokalt testat respektive skarpt verifierat i docs/audits/NEXT_JOB_PREPARATION_V1_2026-08-31.md.

Lokalt färdig, inte committad/pushad/deployad. Kvar efter deploy: inloggat
prov av en verklig testbokning, medarbetar-/tvåtenantprov och frivillig
Matte-tur. Databasproberna läste noll kundrader och är inte det skarpbeviset.

---

# Nu-fördjupning inför lansering — Codex 2026-08-31

Godkänt av Andreas efter konkurrentresearchen. Avgränsat till CSV-importens
sanningskontrakt, kundspråk/operating plan och säkra verifieringar. Ingen ny
lanseringschecklista, ingen Fortnox-/röstombyggnad, inga produktionsskrivningar.

- [x] En serverväg för de två CSV-ytorna; returfel och noll bekräftade skrivningar räknas aldrig som lyckade.
- [x] Båda importytorna visar delvis resultat och misslyckade rader ärligt; gemensam CSV-parser skyddar citerade fält och saknade kolumner.
- [x] Synka produktbudskap och Christoffers första-dagen-/demoupplägg.
- [x] 190 riktade tester gröna (44 nya), slutbygge exit 0, separat tsc exit 0, publikt läsande rökprov 5/5.
- [x] Lokala bevis och kvarvarande skarpa kundresor särredovisade i docs/audits/PRELAUNCH_NOW_2026-08-31.md.

Granskningsstatus: inga commits/push/deploy/migrationer i detta pass. Ingen
aktuell tvåtenant-/telefon-/betalningsresa körd. Fortnox-kärnan och tidigare
marketingändringar orörda. Befintlig extern checklista behåller go/no-go.

---

# Samtalsefterarbete — Codex 2026-08-30

Andreas godkände fortsatt bygge: säker affärsmatchning, återförsök, samlat
samtalsutfall/push och avstängd gallring enligt policyförslaget. Inga skarpa
raderingar eller migrationer körs i detta pass. Claudes mobil-/Mattearbete
och alla befintliga marketingändringar lämnas orörda.

- [x] Ta bort automatisk vunnen/förlorad-matchning på senaste kundaffär.
- [x] Bearbetningslås, sparad analys och atomisk/idempotent kortpublicering.
- [x] Samlad läsmodell, behörig samtalsvy och en diskret push efter sparning.
- [x] Explicit, tenant-verifierad projektkoppling; återanvänd kundtidslinjen.
- [x] Gallringskod + migration v180; avstängd tills policy/leverantör verifierats.
- [x] Felvägstester, kolumnkontrakt, tsc/build och överlämningsprotokoll.

## Granskning

### Etapp A (2026-09-02, oberoende Fable-granskare över origin/main..HEAD)

Inget blockerande. Multi-tenant håller (alla `loadAttribution` på rätt business_id), v202-toleransen verklig (kolumnen bara i helperns primär-select med fallback + settings egna update), inga queries i loopar, `/via` läcker bara det som redan är publikt på storefronten. `referrals`-tabellen är tom i prod → statusändringen `active`→retry påverkar inga legacy-rader.

Åtgärdat (95c6fd63):
- **Dubbelkredit-fönstret**: `rewarded`-uppdateringen saknade felkoll och låg efter SMS:et; Stripes idempotencyKey gäller 24 h. Nu: rewarded direkt efter krediten + felkoll, `metadata.referral_id` på saldotransaktionen + kontroll mot `listBalanceTransactions` före skrivning = permanent idempotens.
- **Osynlig utebliven kredit**: ingen adminyta listar kund-referrals → `rapporteraTystFel` i båda felgrenarna.
- **Toasten ljög före v202**: sa "sparat" när länkvalet inte gick att spara → egen feltoast.
- `/via`: `cache()` runt uppslaget (var två queries/visning), okända koder loggas inte.
- Riktiga enhetstester för `loadAttribution`-fallbacken och `stampAttributionOnPdf` (var bara källskannade).

Medvetet lämnat:
- Dubbel stämpel på `/quote/[token]` (dokumentets fot i iframen + sidans fot) — länken i sandbox-iframen öppnas inuti A4-rutan. Kosmetiskt; åtgärd = `allow-popups` + `target=_blank` i dokumentvarianten. Ta vid Claude Design-passet på offertytan.
- `quotes/send` bygger stämpeln på inloggat konto, inte `quote.business_id` — samma som `business_name`/`logo_url` redan gör i multikonto-fallbacken; befintligt mönster.
- Årskund som referrer får krediten på nästa faktura (kan vara 11 mån bort). Beslut, inte bugg.
- Ingen rate-limit på `/via` (koder = ~9 000 gissningar per prefix; det som läcker är redan publikt).

Kvar för Andreas: skarptest enligt planen (offert → fot → `/via` → `landing_events`; toggeln av → utan länk), Stripe test-mode-prov av krediten.
