# Reality Week — protokoll

**Syfte:** Bevisa att produktberättelsen vi säljer faktiskt händer, pålitligt,
innan 1 september. Inte enhetstester — en riktig genomkörning av hela
livscykeln plus felvägarna, med bevis per steg.

**Manus:** docs/GYLLENE-VAGEN.md (station 1–14 + adversarial A1–A15).
Detta dokument är BOKFÖRINGEN — status per punkt, uppdateras löpande under
körningen. Duplicera inte stationsdetaljerna hit; körboken äger dem.

**Arbetsmodell:**
- Andreas utför de mänskliga handlingarna (webb + mobil) och rapporterar i
  chatten vad han gjorde och såg.
- Claude verifierar varje stations "Bevis" direkt mot databasen (läsning),
  bokför här, och vid avvikelse: **STOP-THE-LINE** — rotorsak + fix + push +
  omtest innan nästa punkt.
- Automatiserade rökprov körs FÖRST varje passdag: `POST /api/debug/e2e-quote`,
  `/api/debug/e2e-invoice`, `/api/debug/e2e-lifecycle` (admin-gated i prod).
- 2026-08-13: Pass 1 (station 1-7) körd av Claude via ett riktigt
  webbläsar-harness (`tests/e2e-golden-path/`), inte manuellt av Andreas —
  se stationstabellen nedan för resultat och docs/reality-week/pass1-
  2026-08-13.md för fullständiga UI-/DB-bevis per station.
- 2026-08-13 (samma dag, Fas 2): station 8-14 tillagda i SAMMA
  sammanhängande harness-fil/körning. **ALLA 14 STATIONER BEVISLIGEN
  GRÖNA I EN FULLSTÄNDIG, SAMMANHÄNGANDE KÖRNING** (Station 14 nådd och
  grön för första gången). Fem riktiga produktionsbuggar hittades och
  fixades under körningen (se Avvikelseloggen #5-9) — den allvarligaste
  (call_recording/customer.address, #8-9) innebar att HELA röstanalysvägen
  (telefonsamtal OCH mötesinspelningar) aldrig kunnat slutföra en analys i
  produktion, sedan funktionen lanserades — nu bekräftat fixad genom en
  fullt grön körning av just den stationen. Två externa kreditblockeringar
  hittades och löstes under dagen: 46elks-kontots saldo slut (#10,
  sidesteppad genom att växla testets leveransmetod till Email — Resend
  visade sig vara korrekt konfigurerat) och Anthropic-kontots API-kredit
  slut (#11, Andreas fyllde på krediten). Enda kvarstående avvikelse:
  A9:s kända, icke-blockerande API-bevis-harnesskvirk (401 vs 403).
- 2026-08-25 (Pass 2-uppstart, samma dag som feature freeze): körningen
  hade legat still sedan 13 aug — demo-ägarens `.env.test`-lösenord var
  förlegat (kontot återställdes 25 aug, oberoende av denna körning) och
  blockerade Station 1 direkt. Efter återställning (Supabase Admin API,
  Andreas-godkänd) hittades och fixades TRE ytterligare riktiga
  produktionsbuggar under den fortsatta körningen — se Avvikelseloggen
  #12-15. **ALLA 14 STATIONER + A9 (UI- OCH API-BEVIS) BEKRÄFTAT GRÖNA
  IGEN på post-fix-koden**, 19/19 test passed. A9:s 401-vs-403 (#4,
  tidigare avfärdad som en icke-blockerande harnesskvirk) visade sig vid
  närmare granskning vara ett äkta test-validitetshål, inte bara en
  kvirk — se #15.

**Status-koder:** ☐ ej körd · ✅ PASS · 🔴 AVVIKELSE (länka fix-commit) ·
🔧 FIXAD & omtestad · ⏭ hoppad (motivera)

---

## Förberedelser (en gång, innan pass 1)

| # | Åtgärd | Vem | Status |
|---|---|---|---|
| F1 | `sql/demo_seed_internal_cost.sql` körd i SQL Editor | Andreas | ☐ |
| F2 | Inloggad som demo@handymate.se → `/dashboard/demo` → "Återställ demon" | Andreas | ☐ |
| F3 | "Skapa testmöte" på samma sida | Andreas | ☐ |
| F4 | Seed-integritet verifierad (radantal per tabell: kunder, offerter inkl. accepterad m. snapshot, projekt inkl. completed, time_entry, ÄTA, outcome, debrief-kort, lessons, customer_facts) | Claude | ☐ |
| F5 | Rökproven e2e-quote / e2e-invoice / e2e-lifecycle gröna | Båda | ☐ |

## Pass 1 — Gyllene vägen (demokontot)

| Station | Kort | Status | Anteckning |
|---|---|---|---|
| 1 | Konto & inloggning | ✅ | Riktig lösenordsinloggning i /login → GET /api/me bekräftar rätt business_id. Se pass1-2026-08-13.md. |
| 2 | Onboarding (inkl. nya intern timkostnad-fältet) | ✅ | /dashboard laddas utan redirect till /onboarding; onboarding_completed_at satt, ägarrad finns. Se pass1-2026-08-13.md. |
| 3 | Första kunden | ✅ | Kund skapad via riktig UI-modal, verifierad i DB. Se pass1-2026-08-13.md. |
| 4 | Offert skapas & skickas | ✅ | Offert skapad+skickad via riktigt UI-flöde; status=sent, portal_token satt. Se pass1-2026-08-13.md. |
| 5 | Offerten öppnas (tracking på tre ytor) | ✅ | Oinloggad kund-context, status sent→opened, tracking-rader verifierade, idempotensbevis (dubbel öppning) grönt. Se pass1-2026-08-13.md. |
| 6 | Kunden accepterar → projekt + snapshot + deal won | ✅ | Riktig canvas-signatur; quotes.status=accepted, project skapat (ps-01), 2 milestones med rätt belopp. Se pass1-2026-08-13.md. |
| 7 | Projektsteget flyttar sig självt | ✅ | Bokning → ps-02, statusändring → ps-03 verifierat via riktiga UI-knappar. Guardian-kortet SKIPPAT (demokontot saknar intern timkostnad — kör F1 för att täcka den delen). Se pass1-2026-08-13.md. |
| 8 | Fakturan | ✅ | review_auto_invoice-kortet godkänt direkt via API (UI:t döljer det MEDVETET, se Avvikelseloggen A16) → invoice.status=sent, stage=ps-06, customer_activity(invoice_sent). Se pass1-2026-08-13.md. |
| 9 | Betalningen | ✅ | Kundportalens "Jag har betalat" → confirm_payment-kort → ägaren godkänner (samma A16-mönster) → applyInvoicePayment (kanoniska vägen) → invoice.status=paid, stage=ps-07. Se pass1-2026-08-13.md. |
| 10 | Bevisytorna (digest, kön, Pengar just nu, Värdekvittot) | ✅ | 7 API-ytor verifierade (automations/activity, team-activity, approvals, pengar, kvitto, agarrapport, ledger). "Att hämta"-kortet är död kod (se Avvikelseloggen A17) — "Pengar just nu" är dagens motsvarighet. Se pass1-2026-08-13.md. |
| 11 | Projektet stängs → efterkalkyl + debrief-kort | ✅ | "Fler åtgärder" → "Avslutat" → project.status=completed, stage=ps-05, draft-faktura, project_outcome fryst, debriefkort skapat. Se pass1-2026-08-13.md. |
| 12 | Debriefen besvaras → lärdomar | ✅ | "Svara" → 3 frågor ifyllda → Spara → 3 project_lesson-rader (job_type=badrum), kortet → approved. Se pass1-2026-08-13.md. |
| 13 | Mötet som blir minne (kundfakta-kort → kundkort/projektsida) | ✅ | Anthropic-krediten påfylld → full körning grön: demo-seed-meeting → customer_fact-kort godkänt → "Det här vet Handymate"-UI-bevis. Se pass1-2026-08-13.md. |
| 14 | Cirkeln sluts (ny offert visar lärdom + kundfakta; Guardian vaktar) | ✅ | Nådd och grön för FÖRSTA GÅNGEN. Lärdomar synliga för job_type=badrum, ledger-delmängdsgarantin håller (identifierat≥agerat≥fakturerat≥betalt). Se pass1-2026-08-13.md. |

## Pass 2 — Adversarial (A1–A15, förväntad utgång i körboken)

| # | Scenario | Status | Anteckning |
|---|---|---|---|
| A1 | Offert avvisas | ✅ | **Bugg hittad OCH fixad, fullt end-to-end-verifierad 2026-08-25** (Andreas godkände migrationen). Riktig kedja: temporärt aktiverad `four_eyes_enabled` (tröskel 500 kr) → riktig anställd-session (lösenordsinloggning, `create_invoices=true`, roll `employee`) skickar en 1250 kr-offert → `POST /api/quotes/send` svarar nu `200 {requires_approval:true}` (tidigare 500) → `quotes.status` bekräftat `pending_approval` i DB → ägaren avvisar kortet via `POST /api/approvals/[id] {action:'reject'}` → `quotes.status` bekräftat tillbaka till `draft`. Alla testinställningar/rader återställda. Se Avvikelseloggen #16. |
| A2 | Faktura förfaller (påminnelsetrappan) | ✅ (kod + kontraktsnivå) | Fyrnivå-stegen (friendly→firm→formal→final) bekräftad i `app/api/cron/send-reminders/route.ts`. Val/dedup/cap-logiken (`pickOverdueInvoicesToNotifyKarin`) grön via `tests/overdue-trigger-selection.spec.ts` (8/8, körd 2026-08-25). Autonomicap-logiken (`underAutonomyCap` fail-closed) grön via `tests/autonomy-hardening.spec.ts`. INTE körd end-to-end via den riktiga cronen — den sveper ALLA anslutna businesses förfallna fakturor globalt, för stor blast radius (skulle skicka riktiga påminnelser till riktiga kunder på andra konton). |
| A3 | ÄTA avvisas | ☐ | |
| A4 | Godkännande REDIGERAS (payload.edited, streak bryts) | ☐ | |
| A5 | Autonomt utskick failar (2/14d → nyckeln lämnas tillbaka) | ☐ | |
| A6 | Möte med saknat segment ('[— avsnitt saknas —]') | ✅ (kontraktsnivå) | `tests/meeting-v2.spec.ts` — "misslyckat segment → explicit lucka, offset avancerar ändå" grönt, 41/41 hela filen. Samma fil bekräftar även tom/ej-transkriberad-segment-hantering. 2026-08-25. |
| A7 | Dubbel cron-körning (idempotens) | ☐ | |
| A8 | Två användare agerar samtidigt (CAS på kortet) | ✅ | Riktigt repro: två parallella `POST /api/approvals/[id] {action:'reject'}` mot samma kort — exakt en fick 200, den andra 409 "Approval already resolved". CAS-guarden (`.eq('status','pending')`, ren eq, inte or()) håller. 2026-08-25. |
| A3 | ÄTA avvisas | ✅ (kontraktsnivå) | `tests/ata-livscykeln.spec.ts` — matrisens invarianter (fakturerad är ändstation, avvisad räknas aldrig som signerad/fakturerad) grönt 2026-08-25. Kod-/kontraktsbevis, inte en live browser-körning av just detta scenario. |
| A4 | Godkännande REDIGERAS (payload.edited, streak bryts) | ✅ (kontraktsnivå) | `tests/autonomy-hardening.spec.ts` `computeStreakFromRows` — redigering bryter streaken precis som avvisning, grönt 2026-08-25. |
| A5 | Autonomt utskick failar (2/14d → nyckeln lämnas tillbaka) | ✅ (kontraktsnivå) | `tests/autonomy-hardening.spec.ts` `trimRecentFailures`-fönstret grönt 2026-08-25. |
| A7 | Dubbel cron-körning (idempotens) | ✅ (delvis, kontraktsnivå) | `tests/project-quote-idempotency.spec.ts` — offert→projekt-skapande idempotent, 23505-krock returnerar vinnaren i stället för 500, grönt 2026-08-25. Agent-trigger-idempotens (`idempotency_key`) och Guardian-dedup ej separat körda denna omgång. |
| A9 | Anställd utan ekonomibehörighet (403 → ytor göms) | ✅ | **Omvärderad och fixad 2026-08-25** — se Avvikelseloggen #15: 401:an var INTE en harnesskvirk utan ett äkta test-validitetshål (anställd-sessionen var helt oautentiserad; UI-beviset passerade falskt mot inloggningssidan). Efter fix (lösenordsbaserad inloggning i stället för trasig magic link): UI-bevis ✅ OCH API-bevis ✅ — `GET /api/analytics/economics` ger nu korrekt 403 med en genuint autentiserad anställd-session (1 cookie sparad, verifierat). 19/19 test passed. |
| A10 | Fortnox otillgängligt | ✅ | Verifierat mot LIVE produktionsdata (ej mot att köra själva cronen — den skulle synka ALLA riktiga anslutna businesses, för stor blast radius för en verifiering): `business_config.fortnox_connected=false` för demokontot, cronens filter (`app/api/cron/fortnox-sync/route.ts`) är ett enkelt `.eq('fortnox_connected', true)` — demokontot exkluderas per konstruktion, ingen kod-gren kan producera ett fel för ett okopplat konto. 2026-08-25. |
| A11 | Google frånkopplad | ✅ | Riktigt curl-repro mot produktion: kund med email, `calendar_connection`-raden saknas för demokontot (0 rader, bekräftat), `POST /api/quotes/send {method:'email'}` → `emailSent:true, sentVia:"offert@handymate.se"` — Resend-fallbacken, inte Gmail. 2026-08-25. |
| A12 | Kund utan e-post | ✅ (delvis) | Riktigt curl-repro: `method:'email'` mot kund utan email → 400 "Kunden saknar email" (bekräftat). `method:'both'`-degraderingen är kod-verifierad (hoppar tyst över email-blocket, litar på SMS-blocket) men INTE körd till ett lyckat slutresultat — 46elks-kontots saldo är fortfarande tomt (samma öppna, icke-blockerande fynd som Avvikelseloggen #10 från 13 aug), så SMS-sidan av testet gav "Not enough credits" i stället för ett bevisat lyckat SMS-only-skick. 2026-08-25. |
| A13 | Superseded kundfaktum (nytt ersätter, gammalt göms) | ✅ (kontraktsnivå) | `tests/customer-facts.spec.ts` — supersede-filtret (`superseded_by IS NULL`) i både offertgenerering och kundkort, grönt 2026-08-25. |
| A14 | Projekt utan intern timkostnad (ärlig "ej konfigurerad") | ☐ | Golden Path Station 7 hoppade Guardian-kortet av samma skäl (F1 ej körd) — se Förberedelser. |
| A15 | PWA på iOS Safari (install + push) | ☐ | Kräver fysisk iPhone — kan inte automatiseras, Pass 3-territorium. |

## Pass 3 — Integrationerna på riktigt (Andreas riktiga konto)

| # | Test | Status | Anteckning |
|---|---|---|---|
| I1 | Google Calendar: koppla från → appen degraderar ärligt → koppla igen → synk | ☐ | |
| I2 | Fortnox: tokenutgång/otillgänglighet — felvägen svalt inget | ☐ | |
| I3 | PWA på iPhone: installera, push-notis vid high-risk-kort | ☐ | |
| I4 | Google-verifieringen inskickad (Verification Center) | ☐ | |

## Avvikelselogg

| # | Pass/punkt | Beskrivning | Rotorsak | Fix (commit) | Omtestad |
|---|---|---|---|---|---|
| 1 | Pass 1, upptäckt via harnesset | Offert-visningssidan kraschade för VARJE ny offert (React error #31) | `business_config.default_quote_terms` är JSONB DEFAULT `{}`, läst som sträng | be549e44 | ✅ |
| 2 | Pass 1, station 6 | Projektets `current_workflow_stage_id` initierades aldrig efter signering (29/33 projekt i produktion) | `lib/project-ai-engine.ts`'s `onQuoteAccepted` — en duplicerad, separat projekt-skapare som vinner racet mot `createProjectFromQuote` — saknade helt stage-initiering | 7c59b2db | ✅ |
| 3 | Pass 1, station 6 | Milestones/budget skapades aldrig för RPC-signerade offerter | Samma `onQuoteAccepted` läste budget/rader från tom `quote.items` JSONB istället för `quote_items`-tabellen (samma buggklass som fixades på annat håll 2026-05-22, men missad här) | ae400d22 | ✅ |
| 4 | Pass 2, A9 | API-bevis-testet får 401 istället för 403 mot `/api/analytics/economics` | Ej rotorsakad — troligen harness-specifik cookie-timing, ej en produktionsbugg (UI-beviset bekräftar korrekt beteende) | — | 🔴 öppen, ej blockerande |
| 5 | Pass 1, station 11 (Fas 2) | `PUT /api/projects` uppdaterade completed_at/stage/faktura/utfall/debrief korrekt vid EN status-ändring, men `project.status` självt skrevs ALDRIG — gäller alla övergångar (planning/active/paused/completed/cancelled), inte bara stängning | `updates.status = body.status` saknades helt i uppdateringsobjektet | 22391b87 | ✅ |
| 6 | Pass 1, station 8 (Fas 2) | Fakturans status flippade korrekt till `sent`, men `sent_at`/`sent_method` sattes aldrig — InvoiceStatusTimeline visade "Skickad"-steget som "upcoming" trots att fakturan skickats | `POST /api/invoices/send` uppdaterade bara `status`, inte de stödjande fälten | 78242603 | ✅ |
| 7 | Pass 1, station 8 (Fas 2) | `invoice_sent`-aktivitetsraden skapades aldrig efter ett fakturautskick — 100 % av skickade fakturor i produktion saknade loggraden | `customer_activity`-insertet saknade två NOT NULL-fält utan default (`activity_id`, `title`); ingen `.error`-koll fångade felet | 1473b02a | ✅ |
| 8 | Pass 1, station 13 (Fas 2) | `call_recording` hade NOLL rader i hela produktionsdatabasen — varken telefonsamtal eller mötesinspelningar har någonsin kunnat sparas | `recording_id` NOT NULL utan default saknades i alla 4 kända insert-ställen; `from_number`/`to_number` (döda kolumner) blockerade även mötesvägen | 74727173 + sql/v127 (kört) | ✅ (insert-nivå) |
| 9 | Pass 1, station 13 (Fas 2) | `/api/voice/analyze` kunde aldrig läsa en inspelning ens efter fynd #8 — "Recording not found" trots att raden fanns | Embedded PostgREST-query selectade `customer.address`, en kolumn som inte längre finns (uppdelad i address_line/postal_code/city vid en tidigare migration som aldrig synkades hit) | 7c44c02e | ✅ (query-nivå) — stationens EGEN helhetskörning ej omtestad än, se anteckning nedan |
| 10 | Pass 1, station 4 (Fas 2) | `POST /api/quotes/send` svarade 500 ("Kunde inte skicka offerten") när testet skickade via SMS | EJ en kodbugg: 46elks-kontots förbetalda saldo var slut, troligen uttömt av sessionens egna ~50 riktiga SMS idag. Gmail är inte kopplat (ingen calendar_connection-rad) — men Resend (Email) VISADE SIG vara konfigurerat och fungerande. | 15bc877c (testet växlade leveransmetod till Email) | ✅ sidesteppad — 46elks-saldot kvarstår obetalt men blockerar inte längre |
| 11 | Pass 1, station 13 (Fas 2) | `POST /api/admin/demo-seed-meeting` svarade 502 — analysen misslyckades trots att BÅDA de tidigare buggarna (#8, #9) var fixade och bekräftat förbikomna | EJ en kodbugg: produktionens Anthropic-konto svarade "Your credit balance is too low to access the Anthropic API" — kontots köpta API-kredit var slut. | — (Andreas fyllde på krediten hos Anthropic, inte en git-commit) | ✅ löst — full körning bekräftar Station 13 OCH 14 gröna |
| 12 | Pass 2-uppstart, 2026-08-25 | Station 1 gav "Fel e-post eller lösenord" — reproducerat oberoende av Playwright med direkt curl mot `/api/auth` | EJ en kodbugg: `.env.test`s `DEMO_OWNER_PASSWORD` var förlegat (skrivet 14 aug, kontot återställdes senare, oberoende av harnesset) | — (lösenord återställt via Supabase Admin API, Andreas-godkänt, `.env.test` uppdaterad) | ✅ löst — verifierat live mot `/api/auth` före omkörning |
| 13 | Pass 2-uppstart, station 4, 2026-08-25 | `POST /api/quotes` gav 500: `duplicate key value violates unique constraint "quotes_business_year_number_unique"` — permanent, samma kollision på varje försök | `nastaOffertnummer()` (`lib/quotes/create-quote.ts`, DEN kanoniska byggaren för ALLA vägar — UI/agent/chatt/röst) räknade `COUNT(*)+1` i stället för `MAX(nummer)+1`. En raderad offert (E2E-städning, admin-borttagning) gör att count permanent glider isär från högsta faktiskt utfärdade numret — 3-försöks-retryn räknar om exakt samma tal varje gång, ingen retry gör framsteg. Bekräftat i produktionsdata (offerter '#002'/'#003' fanns, count=2 → nästa='#003' → evig krock) och med curl-repro. | `40641434` | ✅ löst — nytt offertskapande verifierat live via curl, sedan Station 4 grönt |
| 14 | Pass 2-uppstart, station 11, 2026-08-25 | Projektstängning skrev `status='completed'` korrekt men `current_workflow_stage_id` flyttade ALDRIG till ps-05 — ingen faktura, inget fruset utfall, inget debriefkort | PostgREST-fynd: `.eq()/.in()` ihop med `.or(...)` på en `update().select().maybeSingle()` får UPDATE:en att matcha och skriva raden korrekt, men representationen kommer tillbaka TOM (`[]`) — anroparen (`transitionProjectToCompleted` i `lib/projects/complete-project.ts`) tolkar det som "ingen rad matchade" och faller igenom till "redan stängd"-grenen. Verifierat direkt mot PostgREST via curl (samma filterform utan `or()` fungerar perfekt). Samma buggklass hittad och fixad i `lib/meetings/process-job.ts`s CAS-claim — där hade den varit ödesdiger: workern hade TYST claimat varje mötesjobb (skrivit `status='processing'`) men trott att den misslyckades, och ALDRIG kört transkriberingen. | `24af4b66` | ✅ löst — verifierat live via curl (`transitioned:true`, alla completion-effekter `succeeded`), sedan Station 11 grönt |
| 15 | Pass 2, A9, 2026-08-25 | `GET /api/analytics/economics` gav 401 i stället för förväntade 403 — tidigare (pass1-2026-08-13.md) avfärdat som en icke-blockerande Playwright-cookie-timing-kvirk | Omvärdering visade att avfärdandet var fel: `demo-employee.setup.ts`s magic-link+`page.goto`+`waitForURL`-mönster sparade en TOM storageState (`{cookies:[],origins:[]}`) — sessionen studsade tyst tillbaka till `/login`, men `waitForURL`:s regex hade redan matchat en transient `/dashboard`-URL. Hela A9-testet körde därför med en helt oautentiserad session: "UI-bevis" (kollar att `Ekonomi & offert` INTE syns) blev ett FALSKT POSITIVT — inloggningssidan saknar också den texten — och 401:an var i själva verket en KORREKT respons på en genuint saknad session, inte en produktionsbugg men inte heller en harmlös kvirk: testet bevisade ingenting om verklig behörighetsenforcering. Riktig produktionsinbjudan använder aldrig magic link, bara lösenord. | `1560d3fe` | ✅ löst — lösenordsbaserad inloggning (samma mönster som riktig produktionsinbjudan), plus en ärlighetsvakt (noll cookies kastar nu fel i stället för att spara tyst). UI-bevis OCH API-bevis båda gröna med en genuint autentiserad session (1 cookie). |
| 16 | Pass 2, A1, 2026-08-25 | Fyra-ögon-grinden för offerter kan ALDRIG lyckas — offerten låses aldrig under granskning | `app/api/quotes/send/route.ts` skriver `status='pending_approval'` när en icke-ägare skickar över tröskeln, men DB-constrainten `quotes_status_check` tillät bara draft/sent/opened/accepted/declined/expired — varje försök kastar 23514, fångas, ärligt 500-svar. Godkännandekortet skapas ändå (separat insert, ingen constraint där) — så användaren ser en godkännande-kö-post för en offert som i praktiken aldrig blev granskningslåst. `tests/quote-lifecycle.spec.ts` bekräftar att `pending_approval` REDAN är appens tänkta kontrakt (klassificerat, med en kommentar om en TIDIGARE liknande pending_approval-incident) — databasen är det som aldrig synkades, inte koden. | `sql/v167_quote_pending_approval_status.sql` (KÖRD, Andreas godkände 2026-08-25) | ✅ löst — migration verifierad med SELECT mot `pg_constraint` direkt efter körning; hela A1-kedjan (skicka→pending_approval→avvisa→draft) sedan bekräftad live med en riktig anställd-session |

---

**Feature freeze: måndag 25 augusti 18:00.** Efter det: endast korrekthet,
tillförlitlighet, UX-blockerare, säkerhet, prestanda, lanserings-GTM.
