# Granskning av Codex analys + nästa steg

## Context

Codex svarade på "vad har vi missat?" med tre luckor (På jobbet, sanna agentstatusar, Nästa jobb) och en efter-lansering-lista. Jag har kontrollerat varje påstående mot koden med tre utforskningar. Slutsatsen: analysen är riktig i riktning, fel i ett par detaljer, och den underskattar hur mycket som redan finns men är okopplat. Lansering 14 sept. Rekommenderat nästa steg är ett enda pass före lansering, sedan en ordning efter.

## Verdikt per punkt

**1. "På jobbet" — 70 % finns, kedjan saknas.**
- Röstvägen finns hela vägen till agenten: `components/Jobbkompisen.tsx` → `/api/matte/transcribe` → `/api/matte/chat`, och `lib/matte/page-context.ts` ger chatten `projectId` från URL:en.
- Ett rapportläge finns redan, testat och **oåtkomligt**: `lib/matte/work-report.ts` låser turen till Lars och verktygen `log_time` + `add_work_note`. Ingen `.tsx` skickar `workReport: true`.
- Verktygen `log_material`, `create_ata_draft`, `create_quote_draft` finns i `app/api/agent/trigger/tool-router.ts` men släpps inte in i rapportläget.
- Codex "en enda bekräftelse" är **aktivt bortvalt** i `lib/matte/work-report-confirmation.ts` (kastar om `remaining.length > 1`: ett kort per åtgärd). Det är ett medvetet ärlighetsval, inte en lucka. Rätt form är ett samlat kort som listar alla delar men fortfarande kräver ett uttryckligt godkännande.
- Klassificeraren som delar ett yttrande i flera händelser finns i `app/api/voice/analyze/route.ts` med allowlist `lib/voice/analysis-scope.ts` (`quote | follow_up | callback | reminder | reschedule | customer_fact | ata`) — men saknar `time`, `material`, `future_job` och kräver `recording_id` från samtal.
- **Känd bugg som Codex missade:** godkänt `create_ata_draft`/`create_quote_draft` postar till `/api/quotes/ai-generate` som bara returnerar ett objekt. Ingen rad i `project_change`, inget utkast sparas. Dokumenterat i filhuvudet på `lib/ata/suggest-ata-draft.ts`. Ett kort kunden godkänner och som inte gör något är värre än inget kort.
- Mobilyta saknas: `app/dashboard/projects/[id]/page.tsx` är 6 190 rader, 17 flikar. `app/api/mobile/home/route.ts` har noll UI-konsumenter. Repot `Ahogberg/handymate-mobile` finns (senast pushat 2 sept) men är inte inkopplat här.

**2. Sanna agentstatusar — Codex har rätt, på fel ställe.**
- Idag/hem (`lib/jarvis/bevakning.ts:132-145`) ÄR grindad för Lisa: utan `assigned_phone_number` visas "Telefonen är inte kopplad ännu". Bästa förebilden i huset.
- Men agentremsan på Översikt (`app/api/dashboard/team-activity/route.ts:107`) skickar `'Vakar över telefonen — kopplar samtal, tar meddelanden och SMS:ar vid missat'` **helt ogrindat** som idle-gren. Samma för Daniel rad 132: `'Bevakar offert-pipeline — följer upp automatiskt'` utan att läsa `automation_settings.sms_auto_enabled`/`sms_quote_followup` (den grinden bor i `app/api/cron/quote-follow-up/route.ts:100-119` och läses av ingen UI-text).
- `bevakning.ts:119` säger "föreslår påminnelse på dag N" där N är en cadence (`v3_automation_settings.quote_followup_days`), aldrig en på/av-flagga.
- Kill-switchen `business_config.agents_globally_paused` respekteras av ≥10 croner och läses av **noll** `.tsx`. Pausade agenter visas som gröna "Standby".
- Veckosammanfattning hårdkodas `true` (`route.ts:286`) men cronen `generate-insights` filtrerar bort konton utan nummer.
- Ingen gemensam sanningskälla finns. Det närmaste är `lib/onboarding/channel-health.ts` (`not_enabled → enabled_unverified → channel_verified → lead_verified`), läst bara av onboardingytor.
- Telefonverifiering är inte en kolumn: beviset är `business_config.onboarding_data.test_call.called_at` (byggs i `app/api/onboarding/channel-health/route.ts:207`).

**3. "Nästa jobb" — den enda genuint saknade primitiven.**
- Koden skiljer ÄTA vs ny offert (`lib/matte/action-executor.ts:32`, `getAtaDraftGateReason`) men bara i SMS/mail-vägen.
- Ingen intent, inget approval_type, inget `create_deal`-verktyg för "framtida jobb hos samma kund". `project.deal_id` går bara deal → projekt. Allt framtida hanteras via tystnad över tid (Hanna, proactive-care), aldrig via det kunden sa idag.
- Billigt att bygga: `lib/leads/golden-path.ts` (`createLeadAndDeal`) är redan strypunkten.

**4. Portal som återköpsmotor — närmare än Codex tror.**
- Installationsregistret är fullt byggt (`lib/installation/installation.ts`, `sql/v174`) och redan synligt för kunden i portalen med "Nästa service omkring …" — ren text, ingen knapp.
- Kundens "jag behöver hjälp igen" = `app/api/portal/[token]/messages` → tråd + kort. Aldrig lead/deal. Noll anrop till Golden Path under `app/api/portal/`.
- `installation.service_interval_months` driver ingenting; Lars bokar bara från `agreement.next_visit_at`.
- Kortaste vägen: en route `POST /api/portal/[token]/forfragan` som slår upp kunden via `getCustomerFromPortalToken` + `installation_id`-kolumn på lead/deal. Dagar, inte veckor.

**5. Veckoplanering — primitiverna är ovanligt bra, men två datafaktorer finns inte alls.** Persondag, beläggning, lediga timmar, `DispatchReasoning` är rena och testade. Restid/plats och projektdeadline finns ingenstans i planeringsstacken. Rätt att lägga sist.

## Där jag avviker från Codex

1. Före lansering ska **två** saker göras, inte en: sann agentstatus (Codex punkt) och ÄTA/offert-persisteringshålet (Codex missade). Det senare är en bugg i en befintlig, synlig funktion.
2. "En bekräftelse" ska inte ersätta ett-kort-per-åtgärd med tyst skrivning. Samlat kort, ett godkännande, alla delar synliga.
3. Portal-förfrågan är billigare än "På jobbet V1" och bör gå före mobilytan, eftersom den ger Golden Path-leads med kontext utan ny UI-yta.
4. "På jobbet V1" ska inte börja med en ny mobil projektyta. Börja med att exponera det rapportläge som redan finns via Jobbkompisen i projektkontext, och vidga verktygslistan. Ytan kommer sen, och beslutet PWA vs `handymate-mobile` måste tas först.

## Rekommenderat nästa steg (före lansering): Sann agentstatus

Ett pass, Sonnet-agent, ~1 dag. Modellerat exakt på `lib/onboarding/channel-health.ts`.

**Ny modul `lib/agents/agent-tillstand.ts`** (ren, ingen DB):
- `type AgentTillstand = 'behover_aktiveras' | 'bevakar' | 'arbetar' | 'behover_dig' | 'klart' | 'pausad'`
- `harledAgentTillstand(indata): Record<AgentId, { tillstand, rad: string }>` med indata:
  - `agents_globally_paused` → alla `pausad`
  - Lisa: `assigned_phone_number` + `onboarding_data.test_call.called_at` (verifierad) → annars `behover_aktiveras` med texten "Lisa är redo. Verifiera telefonen så kan hon börja fånga missade samtal."
  - Daniel: `automation_settings.sms_auto_enabled && sms_quote_followup` + nummer → annars `behover_aktiveras`; "föreslår påminnelse dag N" bara när flaggan är på
  - Karin: fakturadata finns (samma signal som `lib/onboarding/kom-igang-tasks.ts:109`)
  - Lars: `sms_day_before_reminder` styr "påminner kunden dagen innan"
  - Hanna: kundsegment finns + `sms_auto_enabled`
  - `behover_dig` = väntande kort per agent; `arbetar` = händelser senaste 24 h; `klart` = bevisrader
- Central COPY-tabell per agent × tillstånd, svenska, framtidsform för `behover_aktiveras`. Lisa **fångar**, aldrig svarar.

**Koppla in** i `app/api/dashboard/team-activity/route.ts`: utöka befintlig `Promise.all` (rad 224-260) med `automation_settings`-selecten och kolumnerna `agents_globally_paused`, `onboarding_data`. Byt de fem ogrindade idle-grenarna (rad 107, 132, 153, 173, 188) och `byggBevakning`-indatat mot tillståndet. `veckosammanfattning` grindas på `assigned_phone_number`.

**UI**: `components/TeamActivityStrip.tsx:248-253` renderar `behover_aktiveras` (bärnsten, "Behöver aktiveras") och `pausad` (grå) i stället för grön Standby. Statisk copy rättas: `components/jarvis/PengarBand.tsx:28`, `components/jarvis/AttHamtaRailCard.tsx:20`, `components/dashboard/IdagCore.tsx:652`, `components/WelcomeModal.tsx:57` (framtidsform), `lib/agents/team.ts:30,32` greetings.

**Lämnas orörda** (produktbeskrivning, inte kontostatus): `app/dashboard/help/page.tsx`, `Step5Activate`, `StepImportData` ("låser upp"), `company-scan-rows.ts` (framtidsform), `app/slipp-administrationen`.

**Facit** `tests/agent-tillstand.spec.ts`: rena tester per agent × tillstånd; källskanning som förbjuder de fem ogrindade strängarna som idle-grenar; kräver att `globally_paused` läses i rutten; kräver att `TeamActivityStrip` har en icke-grön gren för `behover_aktiveras`. Utöka `tests/bevakning.spec.ts`. Verifiera kolumner mot `information_schema` innan kod (`onboarding_data` är JSONB, `test_call.called_at` en nyckel i den).

## Andra pre-launch-kandidaten: ÄTA/offert-utkast sparas aldrig

Beslutat (Andreas): tas med före lansering, parallellt med statuspasset, egen Sonnet-agent.

Litet, avgränsat: `lib/ata/suggest-ata-draft.ts` + exekveringen i `app/api/approvals/[id]/route.ts` för `create_ata_draft`/`create_quote_draft` ska skriva `project_change` resp. `quotes` (status draft) i stället för att bara returnera objektet. Verifiera kolumnerna i `project_change` och `quotes` mot `information_schema` först. Facit `tests/ata-utkast-sparas.spec.ts`: ett godkänt kort lämnar en rad, aldrig bara ett HTTP-svar.

## Ordning efter lansering

1. **Rapportläget i fält** (På jobbet V1 utan ny yta): `WorkReportTool` += `log_material`, `create_ata_draft`; samlat bekräftelsekort; Jobbkompisen får "Rapportera dagen" när `projectId` finns i kontexten.
2. **Nästa jobb**: `future_job` i `lib/voice/analysis-scope.ts` + intent i `lib/matte/intent-agent.ts` + verktyg `create_deal` via `createLeadAndDeal` (källa `projekt`) + `project_id` på deal.
3. **Portal-förfrågan**: `POST /api/portal/[token]/forfragan` → Golden Path med `installation_id`; knapp under "Min bostad"; cron som sveper `service_interval_months` (Lars).
4. **Mobil projektyta**: beslut PWA vs `handymate-mobile` först.
5. **Planering**: efter riktig kunddata; kräver adress/restid som inte finns.

## Verifiering

- `npx tsc --noEmit`, `npm run test:contracts`, en serial `npx next build`.
- Manuellt på demokontot och på ett tomt testkonto (biz_76z88df2p9n): Översikt-remsan ska visa "Behöver aktiveras" för Lisa och Daniel på tomt konto; pausa agenter via `agents_globally_paused` och se grått.
