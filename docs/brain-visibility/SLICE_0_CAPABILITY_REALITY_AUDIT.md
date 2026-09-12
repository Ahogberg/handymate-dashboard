# SLICE 0 — Capability Reality Audit

**Program:** Brain Visibility Weekend 11–13 september 2026 · **Utförd:** 2026-09-10 · **Av:** Fable (Claude) · **Kod:** origin/main `64484e11` (lokal katalog synkad samma kväll) · **Runtime:** prod-databasen 2026-09-10 kväll · **Detaljunderlag per förmåga:** [CAPABILITY_MATRIX_PREFILL.md](./CAPABILITY_MATRIX_PREFILL.md)

Denna fil är skiva 0-leveransen enligt ../roadmap/BRAIN_VISIBILITY_WEEKEND.md §7 och §10. Kopiera §1 in i dokumentets §7.1 och §8 in i §27.

---

## 1. Auditmatrisen (§7.1)

Legend: ✅ finns/ja · ⚠️ delvis · ❌ nej/saknas · `n` = prod-antal 2026-09-10 · facit = källskannande test, E2E = inloggad browser/route-körning

| Capability | Code | Trigger | Real data | Can act | Approval/autonomy | Receipt/audit | Web | Mobile | Live/E2E proof | Cost | Status | Next action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Company Scan | ✅ `company-scan-rows.ts` | klient (hem, onboarding) | läser invoice/customer/project/quotes; tomt konto → 0 rader | ❌ läs | – | ❌ inget kvitto | ✅ hem + onb. | ❌ | facit ×5 | 0 | **PROVE** | kall testperson; besluta om kvitto |
| Value Receipts | ✅ `lib/value/*` | on-demand | 109 utförda kort, 12 fakturor (test) | ❌ | – | ⚠️ omräknas per anrop, ingen tabell | ✅ /pengar, hem | ❌ | E2E (golden-path) | 0 | **PROVE** | visa nära kontext (skiva 6); persistens = beslut |
| Next Best Action | ✅ `lib/jarvis/next-best-action*` | cron 07:00 | grind: ≥2 kand. + ≥1 priority_rule → **0 regler, 0 rader någonsin** | rankar bara | – | ✅ `next_best_action` | ✅ GorDettaForst | ✅ mobile-home | facit ×3 | Sonnet/dag/företag (körs aldrig) | **ACTIVATE** | seed standardprinciper i genomgången |
| Company Goals | ✅ kolumner på business_config | ägaren i settings/onb. | **1 marginalmål, 0 omsättningsmål** av 29 | guardian-kort | INFORMATIONAL | kortet | ✅ monthly-review, projekt | ✅ profitability/mobile | E2E (margin-guardian) | 0 | **ACTIVATE** | obligatoriskt/förifyllt mål i genomgången |
| Customer Memory | ✅ `lib/customer-facts/*` | gmail-poll */15, voice/analyze, cron 07:20 | 6 fakta, 4 godkända (prov) | via kort | `customer_fact` | ✅ rad + decision_record | ✅ kundsida | ❌ | E2E (golden-path) | Haiku/mejl | **PROVE** | ett riktigt samtal genom kedjan |
| Business Rules / Prefs / Agent memory | ✅ 3 mekanismer | ägaren; efter agentkörning | **0 business_rule, 0 priority_rule**, 37 agent_memories | input | `agent_memory_confirmation` | ✅ 3 tabeller | ✅ settings | ❌ | facit ×5 | Haiku/agentkörning | **ACTIVATE** (regler) / PROVE (minne) | regelfråga i genomgång eller första Matte-samtal |
| Quote Intelligence | ⚠️ 3 överlappande motorer | offertsida GET, cron 05:00, tool | kräver 3+ avslutade jobb/kategori → `insufficient` överallt; 7 rader pricing_intelligence | `price_adjustment`-kort | ja | execution_result, cost_event | ✅ offert, builder | ❌ | facit ×10 | Sonnet + Haiku | **ACTIVATE** | efter lansering: en yta "så sattes priset" |
| Quote Follow-up | ✅ cron-rutt + `followup-round.ts` | cron 08:00, first-action, thresholds | 42 offerter, 11 uppföljda, 2070 loggar | SMS under autonomitak / `send_sms`-kort | ja, per runda bunden till kort (7f367da5) | ✅ v3_automation_logs + follow_up_count + kort | ⚠️ approvals; offertsidan säger bara "Skickad" | ✅ kort | facit ×7, ingen E2E | 0 i cron | **EXPOSE** | **skiva 2:** läsmodell på offertsidan |
| Meeting Intelligence | ✅ `lib/meetings/*` | worker */5, reminders */5 | 1 möte, 1 segment | kort ×4 typer | ja | meeting_job/segment, call_recording, cost_event | ✅ inkorg, recordings | ⚠️ samma yta | facit ×5 | Whisper + Claude | **PROVE** | riktigt möte, två telefoner |
| Work Report (fältrapport + Matte dagsavslut) | ✅ två saker | UI + token; DayClose → /api/day-close | **0 field_reports** | signering; time_entry/project_log via bekräftelsekort | egna kort, ej pending_approvals | field_reports; deterministiska id | ✅ projekt, jobbpass, portal | ✅ signeringssida | facit ×4 | Sonnet (Matte) | **PROVE** | riktigt dagsavslut från telefon; = Field Command-substrat |
| Voice / Matte field input | ✅ `voice/analyze` (1107 r), `lib/transcription/*` | 46elks-webhooks, UI, Jobbkompisen | 6 inspelningar, 1 transkript; **46elks 8 kr** | kort ×4 | ja | call_recording, kort, cost_event | ✅ calls, recordings, inkorg, kund | ✅ Jobbkompisen | facit ×10 + 46 unit (transkription) | Whisper + Claude | **PROVE (blockerad)** | fyll 46elks, telefonprov |
| ÄTA detection | ✅ `lib/ata/suggest-ata-draft.ts` | analyze, tool, Matte, manuell | 9 project_change (manuella), **0 `create_ata_draft`-kort någonsin** | kort, max 1/samtal | ja, risk low | project_change, artifacts, PDF | ✅ projekt | ✅ portal-beslut | facit ×6 | Claude ×2 | **PROVE** | samtal med extra scope; Change Order Radar = detta + jämförelse |
| Customer promises | ✅ i `customer_fact` (v147) + deadline-sweep | cron 07:20, analyze, gmail | **0 öppna löften** (kräver extrakt + godkännande) | nudge-kort, aldrig "brutet" auto | Matte | customer_fact + kort | ✅ kundsida, projekt | ✅ kort | unit ×5 | Haiku (extrakt) | **PROVE** | Promise Engine = EXPOSE + löften ur SMS/röst |
| Project intelligence | ✅ `project-ai-engine` + playbook + drift + mission | 4 crons + events | project_ai_log **770** (lever), lesson 3, mission 0, drift-kort 4 | kort ×3 typer | ja | project_ai_log, execution_outcome | ✅ projekt, approvals, MissionPanel | ✅ kort + räknare | E2E `flywheel`, `mission-proof` (service-role) | extraction-modell (mönster) | motor **PROVE**, playbook+mission **ACTIVATE** | skiva 3 = EXPOSE av loggen på projektsidan |
| Profitability / Margin | ✅ `margin-guardian.ts`; ⚠️ gammal `calculateProfitability` lever | cron 06:00 + realtid | **0 profitability_warning-kort**; 1264 cost_event/30 d | INFORMATIONAL-kort; bränsletak blockerar | Karin | kort, cost_event | ✅ projekt, Fuel* | ✅ profitability/mobile | E2E (margin-guardian) | 0 | **PROVE** | ta bort gamla vägen (liten CONNECT) |
| Invoice / accounting (inkl. **fakturaberedskap**) | ✅ `auto-invoice-on-complete`, `send-invoice`, `fakturaberedskap.ts`, `RedoAttFakturera.tsx` | projektavslut, 4 crons | 12 fakturor, **0 påminnelser skickade** | skapar/skickar, overdue, avgift/ränta | `invoice_reminder`-kort; mandat | invoice_reminders, customer_activity, manifest | ✅ invoices, projekt; ⚠️ beredskap ej på hem | ⚠️ kortfeed | facit ×15 + golden-path | 0 | **PROVE** (kedja) / **EXPOSE** (beredskap) | "X kr väntar på fakturering" på hem = summa av beredskap |
| Fortnox | ✅ `lib/fortnox*`; 4 ingångar mot samma kärna | cron */2h; Fortnox-först vid utskick | **0 kopplade**, 19 api_log | externa skrivningar, **ej spåret** | – | fortnox_api_log, automation_activity, invoice-kolumner | ✅ integrations, invoices | ❌ | facit ×15, **0 live** | 0 | **PROVE (blockerad)** | Andreas kopplar riktigt konto i helgen; en faktura genom |
| ROT/RUT | ⚠️ **två vägar** (egen XML vs Fortnox taxreductions) | UI only | **0 rot_payment_request** | skriver request + status; `hasPermission` | ej spåret | rot_payment_request, automation_activity | ✅ rot-payment, offert/faktura-sektioner | ❌ | facit ×9, 0 live | 0 | **PROVE + arkitekturbeslut** | Astra: en väg |
| Missions / agent work | ✅ `lib/agents/*` (kanonisk), `lib/mission/*`; `lib/agent/*` 13/17 levande | 6 crons; mission ingen cron | agent_runs 1362 (282/30 d), **mission 0** | via `agent-gating.ts` | ja | agent_runs, automation_activity | ✅ JarvisHome | ✅ räknare | facit ×20, mission-proof | **hög**; Matte-chat utanför taket | agenter **PROVE**, missions **ACTIVATE** | Matte-chat under taket; radera 4 filer utan anropare |
| Approval rail | ✅ `lib/approvals/*`, `[id]/route.ts` >3000 r, per-typ-grindar | alla producenter; användaren | **477 kort, 26 väntande, 109 utförda**, 30+ typer | ja | ja; självgodkännande nekas; fyra-ögon | execution_result klassad | ✅ approvals, hem, RailCard | ✅ 3 kort + push | E2E (golden-path, permission-check) | 0 | **SCALE** | inget bygge; skiva 5 = visa `_decision` som redan finns |
| Operating Experiments | ✅ `lib/experiment/*` | inline + maintenance 03:00 | **0 rader** (kräver avslutade projekt) | kort ×2 | owner_admin | tabellrad | ✅ /experiments | ❌ | facit + experiment-proof | 0 | **ACTIVATE** (sovande by design) | rör inte |
| Partner / referral | ✅ `lib/partners/*` | Stripe-webhook, portal; ingen cron | 2 partners, 0 ledger | direkt, **ej spåret** | admin + token | ledger, payout_batch, events | ✅ /partners | ❌ | facit ×15 | 0 | **PROVE** | utanför programmet |
| **Home / Mission Control** | ✅ JarvisHome 1980 r, 18 datakällor; räkningarna finns (MatteHero:123, TeamActivityStrip:66) | klient | allt ovan | – | – | – | ✅; ⚠️ gamla Idag-vyn parallell på /oversikt | ✅ /api/mobile/home | facit ×6 | 0 | **EXPOSE** | **skiva 1:** läsmodell, ingen ny struktur; hanterat ≠ failed |
| **Adoption / "hanterat"** | ✅ `lib/admin/adoption.ts` (8 ytor), activation-metrics, weekly-value | admin; cron | veckorapport **0/4 lyckade**; 53 tysta fel/7 d | – | – | automation_activity | ⚠️ bara admin | ❌ | facit | 0 | **EXPOSE** | laga veckorapport + tysta fel FÖRST |
| **Mobilappen** | separat repo `handymate-mobile`; backend `/api/mobile/home`, push | – | 1 push_token, 0 web-push, **VAPID saknas** | – | – | push-journal | – | ⚠️ | facit (push ×5) | 0 | **CONNECT** | VAPID i Vercel; bygg + installera |

**Fördelning:** SCALE 1 · EXPOSE 4 · ACTIVATE 6 · PROVE 11 · CONNECT 1 · **BUILD 0**.

---

## 2. Kanoniska primitiver (återanvänd dessa, bygg inte nya)

| Behov | Kanonisk väg |
|---|---|
| Beslut / "Behöver dig" | `pending_approvals` + `lib/approvals/routing.ts` + `action-contract.ts`; utförande `app/api/approvals/[id]/route.ts` |
| Kvitto på utförd handling | `pending_approvals.payload.execution_result` (klassad av `execution-outcome.ts`) + `automation_activity` |
| Värde i kronor | `lib/value/ledger.ts` (fyra steg: identifierat → godkänt → utfört → betalt) + `value-receipt.ts` |
| Vad agenterna gjorde i natt | `agent_runs` + `automation_activity` + `lib/jarvis/dygnsdigest.ts` |
| Offertens bevakning | `lib/quotes/followup-round.ts` (deterministiskt approval-id per runda) + `v3_automation_logs` + `quotes.follow_up_count/last_follow_up_at` |
| Projektets administrativa läge | `project_ai_log` + `lib/projects/fakturaberedskap.ts` + `commercial-readiness.ts` |
| Kundens minne och löften | `customer_fact` (fact_type, promise_status, due_at, superseded_by) |
| Samtal/möte → handling | `app/api/voice/analyze/route.ts` (enda analysvägen) via `lib/transcription/transcribe.ts` |
| Tid/anteckning från text | Matte dagsavslut: `lib/matte/work-report.ts` + verktygen `log_time`/`add_work_note` med bekräftelsekort |
| Automationsregler | `lib/automation-engine.ts` (28 importörer) + `v3_automation_*` |
| Kostnad | `cost_event` via `recordCost`; tak i `lib/agents/shared/cost-guard.ts` + `lib/costs/fuel.ts` |
| Mobil hemskärm | `/api/mobile/home` + `lib/approvals/mobile-home.ts` (delar primitiver med NBA) |

## 3. Döda och sovande kodvägar

**Radera (0 anropare, verifierat):** `lib/agent/orchestrator.ts`, `lib/agent/agents/ekonomi-agent.ts`, `lead-agent.ts`, `strategi-agent.ts`.

**Avvecklad men levande (CONNECT-städning):** `calculateProfitability` i `lib/profitability.ts:64` mot stale `actual_*`-kolumner; `lib/autopilot/quote-nudge.ts` (avrådd i kommentar, dedupas bort av cronen); gamla Idag-vyn `/dashboard/oversikt` (`IdagCore.tsx`, 892 r) parallellt med JarvisHome.

**Sovande (ACTIVATE, inte kod):** NBA (0 prioriteringsregler), Company Goals (0 omsättningsmål), Lär Handymate (0 regler), Playbook (3 lessons), Missions (0), Operating Experiments (0), Quote Intelligence (datagrind).

**Två beslut, inte kod:** ROT via egen XML **eller** Fortnox taxreductions. `tryAutoApprove` saknar dagens grindar men saknar runtime-anropare på aktuell main; statistikytorna lever. Se Codex-verifieringen nedan.

## 4. Runtime-triggers (46 crons, `vercel.json`)

05:00 agent-context · 05:05 patterns, credit-watch · 05:10/06:10 push-morgon · 05:15 driftlarm · tis 05:20 playbook-pattern · tor 05:25 playbook-kickoff · 05:30 morning-brief · 06:00 evaluate-thresholds, Karin · sön/ons 06:05 Daniel · 06:10 Lars · sön/ons 06:15 Hanna · 06:20 service-bookings · 06:25 karin-deadlines · 06:35 cert-expiry · 06:40 missed-revenue · 06:50 expectation-drift · mån 06:00 project-health · sön 06:00 generate-insights · 07:00 check-overdue, next-best-action, Lisa · mån 07:00 seasonality, kapacitet · 1:a 07:00 monthly-review · 07:05 tidrapport-forslag · 07:20 promise-deadlines · 07:45 onboarding-followup · 08:00 quote-follow-up · 08:30 hanna-outbound · 08:40 avtal-forslag · 08:50 hemsida-forslag · 09:00 nurture, review-requests · 10:00 send-reminders · 16:00 communication-check · 03:00 maintenance · */6h sync-calendars · */2h fortnox-sync · */15 send-campaigns, gmail-poll, gmail-lead-import · */5 meeting-reminders, meeting-worker.

Läget senaste 7 dagar: `kort_utgangna` 10/10 ok · `agent_observation` 2 ok · `veckorapport` **0/4** · `tyst_fel` **53**.

## 5. Saknade kopplingar (CONNECT)

1. **Tysta fel och veckorapport** — Home får inte säga "hanterat" när `automation_activity.status = failed`.

2. **VAPID-nycklar** saknas i Vercel → 0 push-prenumerationer, mobilens kort når ingen.

3. **Matte-chatten utanför kostnadstaket** (`app/api/matte/chat/route.ts`).

4. **Schemadrift** `customer_document.document_id` (42703) fäller 6 rutter.

5. **Fakturaberedskap** finns på projektsidan men läses inte av Home eller Pengar.

## 6. Osynlig intelligens (EXPOSE-kandidater, rangordnade efter hävstång)

1. **Offertens bevakning** — motor, rundor, stoppvillkor och kvitto finns; offertsidan visar "Skickad". **(skiva 2)**

2. **"N saker behöver dig, resten hanterat"** — räkningen finns i MatteHero; saknar Väntar på / Arbetar med / Pengar som härledda states. **(skiva 1)**

3. **Fakturaberedskap summerad** — "X kr utfört arbete väntar på fakturering" är en summa av en befintlig funktion. **(skiva 9 → kan tas i skiva 1)**

4. **`_decision` och evidens i kortens payload** — explainability finns som data, visas inte. **(skiva 5)**

5. **`project_ai_log` (770 rader)** — projektets administrativa historik finns, syns inte på projektsidan. **(skiva 3)**

6. **Adoptionsmåttet** — bara i admin.

## 7. Obevisad intelligens (PROVE) och dubbleringsrisk

**Obevisat skarpt:** allt som kräver telefon (Lisa, ÄTA ur samtal, möte, kundminne ur samtal), Fortnox, ROT, påminnelser, dagsavslut. Gemensam blockerare: 46elks 8 kr, Stripe testnyckel, 0 Fortnox-kopplade.

**Dubbleringsrisk vid helgens byggen:** (a) Home får inte bli en femte "nästa steg"-lista bredvid GorDettaForst, Uppdragsrad, SkottUtanDig och Idag-vyn — den ska härleda, inte lägga till; (b) Quote Brain får inte skapa en egen uppföljningsmodell bredvid `followup-round.ts`; (c) Value receipts-presentation får inte räkna om värdet med en annan formel än `ledger.ts`.

---

## 8. CURRENT PROGRAM STATE (till §27)

### OVERALL STATUS

SLICE 0 DONE (audit); implementation NOT STARTED.

### CURRENT SLICE

SLICE 1 — Brain Surface / Home (efter CONNECT-punkt 1).

### LAST COMPLETED

Skiva 0: matris med 25 rader, statusfördelning SCALE 1 / EXPOSE 4 / ACTIVATE 6 / PROVE 11 / CONNECT 1 / BUILD 0. Lokal katalog synkad till origin/main 64484e11; typkontroll grön (kräver `--max-old-space-size=8192`).

### VERIFIED

Kodinventering mot origin/main; runtime-antal ur prod; cron-lista; anropare för `lib/agent/*`, DayClose → dagsavslut, automation-engine.

### NOT VERIFIED

Mobilappens byggstatus (separat repo); om `auto-approve*` respekterar `routing.ts`-grindarna; om `pdf-preview.ts` (pdfjs-dist) fungerar i prod-build.

### STATUS CHANGES

Alla 25 rader: AUDIT → (se matris). Två rättelser mot förhandsversionen: Work Report CONNECT → PROVE (inkopplat via DayClose); "lib/agent död" → 4 filer döda, resten levande.

### OPEN RISKS

- 53 tysta fel + trasig veckorapport gör varje "hanterat"-påstående osant tills de är lagade.

- Fjärde Home-ombyggnaden på två månader om skiva 1 inte hålls till läsmodell.

- 1264 LLM-kostnadshändelser/30 d utan en riktig kund; Matte-chat utan tak.

- GO-förutsättningarna (46elks, Stripe live, VAPID, Google, schemafix, Fortnox) ligger utanför programmet men blockerar all PROVE.

### NEXT ACTION

1. CONNECT: töm tysta fel, laga veckorapporten (Fable, ~2 h).

2. EXPOSE: Quote Brain-läsmodell på offertsidan ur `followup-round.ts` + `v3_automation_logs` (Codex, ~4–5 h).

3. EXPOSE: Home-läsmodell med fem states ur befintliga källor, `failed` räknas aldrig som hanterat (Fable, ~5–6 h).

4. ACTIVATE: standardprinciper + mål i genomgången (~2 h).

5. Astra-beslut: ROT-väg; `auto-approve*` vs `routing.ts`.

## Codex-verifiering 2026-09-10

Kodbas: `3ae0029` (main efter uppladdat styrdokument); Claudes historiska audit gäller `64484e11`. Räkningar nedan är läsande SQL mot Handymates prodprojekt, inte provider- eller E2E-bevis.

- Bekräftat: 29 företag; 1 uttryckligt marginalmål; 0 omsättningsmål, prioriteringsregler, business rules, NBA-rader, Fortnox-kopplade företag och ROT-begäranden.
- Bekräftat: 477 approval-rader: 109 `approved`, 26 `pending`, 324 `expired`, 18 `rejected`. **109 godkända är inte 109 utförda handlingar**: runtime `payload.execution_result.outcome` är 37 `success`, 13 `failed`, 22 `skipped`, 37 saknas. Auditens historiska formulering "109 utförda" är därmed fel; sparat success är i sin tur inte automatiskt live-providerbevis.
- Bekräftat senaste sju dagar: 53 `tyst_fel/failed` (43 `telefonnummer_saknas`, 10 `sms:leverantorsfel-saldo`), 4 `veckorapport/failed`, inga lyckade veckorapporter. Dessa auditposter ska inte raderas eller omskrivas till success.
- Bekräftad schemadrift: `customer_document` har `id`, inte `document_id`.
- Rättelse: `tryAutoApprove` har ingen runtime-anropare i TS/TSX. `/api/automations` läser `getAutoApproveStats`; `/api/auto-approve/patterns` läser lärandestatistik. `voice/analyze` har avvecklat legacy-vägen. Legacy-exekveraren respekterar inte dagens routing/mandat och får inte återaktiveras; detta är inte en verifierad aktiv automatisk bypass.
- Inga förmågor uppgraderas. Övriga uppgifter/statusar är Claudes underlag; ingen ny live-, provider- eller mobilverifiering har gjorts. Fördelningarna i ursprungsunderlagen är inte normaliserade: blandade delstatusar ska inte tolkas som en verifierad summering av en primär status per rad.
