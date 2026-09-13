# Capability Reality Audit — förifylld matris (skiva 0)

**Datum:** 2026-09-10 kväll · **Kod granskad mot:** origin/main `64484e11` (nya moduler) + lokalt arbetsträd `2141c2b9` (djupsökning; ligger 376 commits efter, avvikelser markerade ⚠︎) · **Runtime:** prod-databasen samma kväll · **Ifylld av:** Fable, som startpunkt för Codex. Allt som är osäkert står som `?`. Verifiera mot runtime innan status ändras.

## Läs detta först

- **Ingen förmåga har sett en riktig kund.** 29 företag i databasen, 0 betalande riktiga. Allt nedan är byggt och delvis bevisat mot test- och demodata.

- **Godkännandespåret är den enda förmågan som förtjänar SCALE.** 477 kort, 109 utförda, autentiserad E2E, per-typ-grindar på origin/main. Allt annat står på det.

- **Tre förmågor är döda i praktiken trots färdig kod:** Next Best Action (0 prioriteringsregler → aldrig producerat), Company Goals (0 omsättningsmål), Lär Handymate-regler (0 regler). Alla tre är ACTIVATE, inte BUILD.

- **Invoice Readiness finns redan** (`lib/projects/fakturaberedskap.ts` + `components/projects/RedoAttFakturera.tsx`). Roadmapens "noll rader kod" var fel. Skiva 9 är EXPOSE, inte BUILD.

- **Två parallella motorer att avgöra:** agentstack `lib/agent/` (singular, gammal) vs `lib/agents/` (plural, kanonisk); ROT via egen XML vs Fortnox `taxreductions`.

- **Tysta fel:** 53 på sju dagar, veckorapporten 0 lyckade av 4. "Firman är under kontroll" får inte visas ovanpå det.

## Statusfördelning

| Status | Antal | Förmågor |
|---|---|---|
| SCALE | 1 | Approval rail |
| EXPOSE | 4 | Quote Follow-up, Invoice readiness, Home/Mission Control, Adoption |
| ACTIVATE | 6 | NBA, Company Goals, Business rules, Quote intelligence, Playbook, Operating Experiments, Missions |
| PROVE | 10 | Company Scan, Value receipts, Customer memory, Meeting, Voice, ÄTA, Promises, Margin, Invoice/reminders, Fortnox, ROT/RUT, Partner |
| CONNECT | 2 | Work Report (Matte-läget), Mobile push |
| BUILD | 0 | — |

## Matrisen

Kolumner: **Kod** (kanonisk fil) · **Trigger** · **Riktig data** (kräver + prod-läge) · **Agerar / godk.** · **Kvitto** · **Webb** · **Mobil** · **Bevis** · **LLM** · **Status** · **Nästa**.

### 1. Company Scan (genomgång + hemtur)

- **Kod:** `app/api/onboarding/company-scan/route.ts`, `lib/onboarding/company-scan-rows.ts`, `components/tour/CompanyScan.tsx`, `HemTur.tsx`, `app/onboarding/components/StepGenomgang.tsx`. Ingen dubblett.

- **Trigger:** klient på dashboard-hem (`JarvisHome.tsx` ~1615) och i onboardingsteg 5. Ingen cron.

- **Riktig data:** läser `invoice`, `customer`, `project`, `quotes`, `pending_approvals`. Tomt konto → 0 rader (rader med n=0 döljs). Prod: fungerar på demo/test.

- **Agerar / godk.:** nej, ren läsning.

- **Kvitto:** **inget.** Skannen lämnar ingen rad.

- **Webb:** ja (hem + onboarding). **Mobil:** nej (`/api/mobile/home` läser den inte).

- **Bevis:** 5 facit-specar, ingen inloggad E2E.

- **LLM:** ingen (deterministisk `computeInstantValue`).

- **Status:** PROVE. **Nästa:** kall testperson; besluta om skannen ska lämna kvitto ("Handymate såg X den 12/9") så att Home kan referera den.

### 2. Value Receipts / Värdeliggaren

- **Kod:** `lib/value/ledger.ts`, `vardekvitto.ts`, `recovered-revenue.ts`, `agarrapport.ts`, `lib/approvals/value-receipt.ts` (`RECEIPT_APPROVAL_TYPES`, 6 typer). Två medvetet olika härledningar (kohort vs händelsemånad), dokumenterat.

- **Trigger:** on-demand GET från `/dashboard/pengar` och JarvisHome; kvitto byggs klientsidan direkt efter godkännande.

- **Riktig data:** `pending_approvals`, `invoice`, `project_change`. Prod: 109 godkända kort, 12 fakturor, 9 ÄTA (test).

- **Agerar / godk.:** nej.

- **Kvitto:** **ingen durabel tabell**, allt räknas om per anrop ("REN OMBERÄKNING — inget lagras"). Durabelt underlag = `pending_approvals.payload.execution_result` + `automation_activity`.

- **Webb:** `/dashboard/pengar` (LedgerHero/Flode/Rader/Historik), `/dashboard/monthly-review`, JarvisHome-toast. **Mobil:** nej.

- **Bevis:** 6 facit + inloggad E2E (golden-path träffar `/api/value/*`).

- **LLM:** ingen.

- **Status:** PROVE. **Nästa (skiva 6):** presentera nära kontexten (projekt, offert), inte bara på Pengar-sidan. Överväg att persistera kvitton så Home kan visa "hanterat sedan igår" utan omberäkning.

### 3. Next Best Action

- **Kod:** `lib/jarvis/next-best-action.ts`, `-normalize.ts`, `-prompt.ts`, `-goals.ts`; cron `app/api/cron/next-best-action/route.ts`.

- **Trigger:** cron 07:00 dagligen.

- **Riktig data:** hårda grindar: ≥2 kandidater **och** ≥1 `priority_rule` i `business_knowledge`. **Prod: 0 priority_rules, 0 rader i `next_best_action`.** Har aldrig producerat något.

- **Agerar / godk.:** rankar bara kort som redan ligger på spåret.

- **Kvitto:** `next_best_action` (en rad per företag och dag, modell + resonemang).

- **Webb:** `GorDettaForst.tsx`, `MatteHero.tsx`, approvals, Måndagsmötet. **Mobil:** ja (`/api/mobile/home` läser tabellen).

- **Bevis:** 3 facit/unit, ingen E2E.

- **LLM:** Sonnet, 1 anrop/företag/dag, max 1500 tokens, endast när grindarna passeras.

- **Status:** ACTIVATE. **Nästa:** antingen seed:a 3 standardprinciper per bransch vid onboarding, eller sänk grinden till "≥2 kandidater" med default-principer. Utan det är hela "Gör detta först"-ytan tom för varje ny kund.

### 4. Company Goals / Margin Guardian-mål

- **Kod:** kolumner på `business_config` (`revenue_target_annual_sek`, `margin_target_percent`, `margin_target_set_at`); `lib/economy/revenue-pace.ts`, `lib/projects/margin-guardian.ts`; UI `MalBlock.tsx`, `MalNudge.tsx`, settings ~4327.

- **Trigger:** ägaren sätter i Settings/onboarding; konsumeras av lönsamhetsrutter och NBA-cron.

- **Riktig data:** **Prod: 1 marginalmål satt, 0 omsättningsmål** av 29 företag. Onboarding-frågan (byggd 2026-08-15) fylls inte i.

- **Agerar / godk.:** `profitability_warning`-kort via spåret (klass INFORMATIONAL).

- **Kvitto:** kortet självt.

- **Webb:** monthly-review, projekt-sida (`GuardianOrsaker.tsx`), settings. **Mobil:** `profitability/mobile`-rutten.

- **Bevis:** 6 facit + inloggad E2E `e2e-margin-guardian`.

- **LLM:** ingen.

- **Status:** ACTIVATE. **Nästa:** gör målet obligatoriskt eller förifyllt (branschsnitt) i genomgången; annars sover NBA, MalBlock och pace-beräkningen.

### 5. Customer Memory (`customer_fact`)

- **Kod:** `lib/customer-facts/extract-from-text.ts`, `build-card.ts`; utförande `app/api/approvals/[id]/route.ts` ~1447 (supersede-kedja); läsare `lib/context/kundkontext.ts`, `ai-quote-generator.ts`. Konsoliderad, ingen dubblett.

- **Trigger:** cron `gmail-poll` */15, `/api/voice/analyze` (samtal/möte), `promise-deadlines` 07:20.

- **Riktig data:** riktiga mejl/samtal. **Prod: 6 fakta, 7 kort (4 godkända).** Alla från prov.

- **Agerar / godk.:** aldrig direkt, alltid `customer_fact`-kort.

- **Kvitto:** `customer_fact` (source_type/source_id/superseded_by) + `decision_record` med modell.

- **Webb:** kundsida "Det här vet Handymate", `ProjectCustomerFactsCard.tsx`. **Mobil:** nej.

- **Bevis:** 6 facit + inloggad E2E (golden-path godkänner kort, asserterar DB-rad).

- **LLM:** Haiku per kvalificerat mejl (≥80 tecken, bränslegrind).

- **Status:** PROVE. **Nästa:** ett riktigt samtal genom kedjan. Skiva 4 (Customer Brain) är EXPOSE ovanpå detta.

### 6. Business Preferences / Rules / Agent Memory

- **Kod:** tre separata mekanismer: `lib/business-preferences.ts` (kv), `app/api/business-rules/route.ts` (`business_knowledge.business_rule`, konsument: `ai-quote-generator.ts:270`, limit 5), `app/api/priority-rules/route.ts` (konsument: bara NBA), `lib/agents/memory.ts` (v149, confirm/supersede, kort `agent_memory_confirmation`).

- **Trigger:** ägaren skriver i Settings; agentminne extraheras efter varje agentkörning (fire-and-forget).

- **Riktig data:** **Prod: 0 business_rules, 0 priority_rules, 37 agent_memories.**

- **Agerar / godk.:** regler är input. Minne: observation/fact auto, pattern/preference kräver kort (14 d).

- **Kvitto:** `business_knowledge` (soft delete), `business_preferences` (source), `agent_memories`.

- **Webb:** settings ~4411–4770 ("Lär Handymate", prioriteringsprinciper, preferenser). **Mobil:** nej.

- **Bevis:** 5 facit, ingen E2E för regel-UI.

- **LLM:** Haiku per agentkörning för minne.

- **Status:** ACTIVATE (regler), PROVE (agentminne). **Nästa:** "Lär Handymate" har konsument (offertgeneratorn) men ingen har skrivit en regel. Lägg en regel-fråga i genomgången eller i första Matte-samtalet.

### 7. Quote Intelligence

- **Kod:** tre överlappande motorer utan gemensam yta: `lib/daniel-intelligence.ts` (efterkalkyl/reality check), `lib/agent/pricing-engine.ts` (nattlig `pricing_intelligence`, Haiku), `lib/agent/price-analysis.ts` (timavvikelse → `price_adjustment`-kort). Plus `ai-quote-generator.ts` (Sonnet), prisslinga `/api/pricing/resolve`, artikelbibliotek.

- **Trigger:** `/api/quotes/intelligence` GET från offertsidan; `agent-context`-cron 05:00; agent-tool `get_pricing_suggestion`.

- **Riktig data:** kräver 3+ avslutade jobb per kategori. **Prod: 7 rader pricing_intelligence, 3 project_lesson.** Reality check svarar `insufficient` på alla konton.

- **Agerar / godk.:** `price_adjustment`-kort; utkast via `create_quote_draft`.

- **Kvitto:** `execution_result`, `cost_event`.

- **Webb:** offertsida, QuoteBuilder (MarginCard, CompletenessStrip), settings/products. **Mobil:** nej.

- **Bevis:** 10 facit; E2E bara golden-path + filming.

- **LLM:** Sonnet (generering, bild), Haiku (klassificering).

- **Status:** ACTIVATE (datagrind) + konsolideringsrisk. **Nästa:** inte helgen. Efter lansering: en yta "Så satte Handymate priset" ovanpå de tre.

### 8. Quote Follow-up ⭐ skiva 2

- **Kod:** `app/api/cron/quote-follow-up/route.ts` (kanonisk), `lib/agents/daniel/quote-follow-up-card.ts`, `unopened-quotes.ts`. ⚠︎ På origin/main: `lib/quotes/followup-round.ts` + `lib/approvals/prepare-review.ts` (Codex 7f367da5: varje runda bunden till godkännande + kvitto). Avrådd parallell: `lib/autopilot/quote-nudge.ts`.

- **Trigger:** cron 08:00; onboardingens `first-action` (dag-0-kort); `evaluate-thresholds` 06:00 för V3-regler.

- **Riktig data:** skickade offerter äldre än `quote_followup_days` (5). **Prod: 42 offerter, 11 uppföljda, 2070 rader v3_automation_logs.** Fungerar på testdata.

- **Agerar / godk.:** SMS direkt under earned-autonomy-tak, annars `send_sms`-kort. Stopp: `OPEN_QUOTE_STATUSES` (accepted/declined plockas aldrig), 3 rundor, 168 h konfliktfönster.

- **Kvitto:** `v3_automation_logs` (runda, kanal, status), `quotes.follow_up_count/last_follow_up_at`, `execution_result`.

- **Webb:** approvals, `QuoteStatusTimeline` på offertsidan, automations. **Mobil:** kort via `/api/mobile/home`.

- **Bevis:** 7 facit; ingen inloggad E2E för rundan.

- **LLM:** indirekt (agentkörningen komponerar texten). Cronen själv LLM-fri.

- **Status:** **EXPOSE.** Motor, stoppvillkor och kvitto finns. Offertsidan säger "Skickad", inte "Daniel bevakar, nästa uppföljning fredag, väntar på kund". **Nästa:** läsmodell på offertsidan: runda, nästa datum, väntar-på, regelförklaring. Ingen ny skrivväg. Billigaste vinsten i hela kön.

### 9. Meeting Intelligence

- **Kod:** `lib/meetings/process-job.ts`, `assemble-transcript.ts`, `split-transcript.ts`; API `voice/meeting/{start,segment,complete,abandon}`; UI `components/moten/Motesassistenten.tsx`. V1 raderad. ⚠︎ origin/main: transkribering går via `lib/transcription/transcribe.ts` + hallucinationsvakt `guard.ts` (v210).

- **Trigger:** cron `meeting-worker` */5, `meeting-reminders` */5; analys → `/api/voice/analyze`.

- **Riktig data:** riktig inspelning. **Prod: 1 meeting_job, 1 segment.**

- **Agerar / godk.:** kort `create_ata_draft`, `create_quote_draft`, `meeting_followup`, `customer_fact`. Aldrig direkt till kund.

- **Kvitto:** `meeting_job.status/error`, `meeting_segment.transcript/retry_count`, `call_recording`, `cost_event`.

- **Webb:** inkorg (flik möte), recordings, approvals. **Mobil:** samma yta i mobilshell, förmötespush.

- **Bevis:** 5 facit, ingen E2E.

- **LLM:** Whisper per segment + Claude i analyze.

- **Status:** PROVE. **Nästa:** ett riktigt 20-minutersmöte med två telefoner.

### 10. Work Report / arbetsrapport

- **Kod:** två saker med samma namn. (a) Fältrapport: `app/api/field-reports/*`, `lib/job-report.ts`, `lib/jobbpass/`. (b) Matte-rapportläge: `lib/matte/work-report.ts`, `work-report-confirmation.ts`, grind i `matte/chat/route.ts` ~622. ⚠︎ origin/main: Codex "persist report plans, recover all four reviewed steps" (e8e04e7d), "mobile report drafts" (7ebe91b0) — **ej granskat, verifiera.**

- **Trigger:** UI (projekt, jobbpass), publik signering via token. Matte-läget: **inkopplat** via `components/day-close/DayClose.tsx:35` (`workReport: true`) → `app/api/day-close/route.ts`; sessionsläge i `lib/matte/report-session.ts` (verifierat mot origin/main 64484e11).

- **Riktig data:** **Prod: 0 field_reports.**

- **Agerar / godk.:** signering skriver status + SMS + push. Matte-läget skriver `time_entry`/`project_log` via `log_time`/`add_work_note` med egna bekräftelsekort (inte `pending_approvals`).

- **Kvitto:** `field_reports`-raden; deterministiska id `time_report_${confirmationId}` som idempotenskvitto.

- **Webb:** projektsida, jobbpass, portal. **Mobil:** publik signeringssida, jobbpass-token.

- **Bevis:** 4 facit, ingen E2E.

- **LLM:** Sonnet i Matte-läget, två verktyg.

- **Status:** PROVE (båda). Dagsavslutet är Field Command-substratet: text in → tid/anteckning ut med bekräftelsekort. **Nästa:** ett riktigt dagsavslut från en telefon; skiva 8 utökar detta, bygger inte nytt.

### 11. Voice / Matte-röstläge / samtalsefterarbete

- **Kod:** `app/api/voice/analyze/route.ts` (1107 r, kanonisk), `lib/voice/{call-processing,call-outcome,find-customer-by-phone,resolve-call-project}.ts`, `voice/{incoming,recording,outbound,...}`, `matte/transcribe`, `lib/context/kundkontext.ts`. ⚠︎ origin/main: `lib/transcription/` (delad kedja, vokabulärprompt, datumankare, bench).

- **Trigger:** 46elks-webhooks, fire-and-forget analyze, UI-knapp "Ring via Handymate", Jobbkompisen röstknapp.

- **Riktig data:** **Prod: 6 inspelningar, 5 inkommande, 1 med transkript. 46elks-saldo 8 kr.**

- **Agerar / godk.:** kort (`create_ata_draft`, `create_quote_draft`, `meeting_followup`, `customer_fact`), pipeline-uppdatering. Aldrig utskick direkt.

- **Kvitto:** `call_recording` (transkript, analys, `call_processing`-checkpoint), kort med `_decision`, `cost_event`.

- **Webb:** calls, recordings, inkorg, kundsida (kontext/trail). **Mobil:** Jobbkompisen (mobil-först), kort via mobile-home.

- **Bevis:** 10 facit, ingen E2E. Transkriptionskedjan: 46 unit-tester.

- **LLM:** Whisper + Claude (chunkad för 90 min).

- **Status:** PROVE, **blockerad av 46elks-kredit.** **Nästa:** fyll saldot, kör telefonprovet, fyll i utfallet.

### 12. ÄTA-detektion

- **Kod:** `lib/ata/suggest-ata-draft.ts` (`shouldSuggestAtaDraft`, `harPendingAtaForProjekt`), `lib/ata/{create-ata,lifecycle,pdf,strip-prices}.ts`, detektion i analyze ~873–921; API `ata/*`, `ata/sign/[token]`.

- **Trigger:** analyze (samtal+möte), agent-tool `create_ata_draft`, Matte action-executor, manuell `ChangeModal`.

- **Riktig data:** kräver entydigt projekt (`resolveCallProject`), annars degraderas till `meeting_followup`. **Prod: 9 project_change (manuella), 0 `create_ata_draft`-kort någonsin.**

- **Agerar / godk.:** kort, risk low; max ett per samtal; aldrig om projektet redan har väntande.

- **Kvitto:** `project_change` (sign_token, statusmatris), `execution_result.artifacts`, `project_document` (PDF), räknas i Värdeliggaren.

- **Webb:** projektsida (AtaCard, ChangeModal, SendAtaDialog), approvals. **Mobil:** kundens portal `PortalAtaDecision`, kort.

- **Bevis:** 6 facit (inkl. pris-paritet i tre read-endpoints), ingen E2E.

- **LLM:** Claude i analyze + Sonnet vid godkännande (radbygge).

- **Status:** PROVE. **Nästa:** ett samtal där kunden ber om något utanför offerten. Change Order Radar (skiva 9) = detta + jämförelse mot accepterad offert.

### 13. Kundlöften

- **Kod:** ingen egen tabell, lever i `customer_fact` (`fact_type=commitment`, `promise_status`, `due_at`, v147). `lib/promises/deadline-sweep.ts`, cron `promise-deadlines`. `lib/karin/obligations.ts` är myndighetsdeadlines, inte kundlöften.

- **Trigger:** cron 07:20; extraktion via analyze/gmail; agent-tool `get_customer_commitments`.

- **Riktig data:** två steg: extraherat **och** godkänt. **Prod: 0 öppna löften.**

- **Agerar / godk.:** bara nudge-kort (Matte). Sätter aldrig "brutet" automatiskt (låst av test).

- **Kvitto:** `customer_fact`-raden + kort.

- **Webb:** kundsida, `ProjectCustomerFactsCard`, approvals. **Mobil:** kort.

- **Bevis:** 5 unit/facit, ingen E2E.

- **LLM:** Haiku i extraktionen.

- **Status:** PROVE. **Nästa:** Promise Engine (våg 4) är EXPOSE ovanpå detta, inte nybygge. Saknas: löften ur SMS och ur Matte-röst.

### 14. Project intelligence (project-ai-engine, playbook, drift, mission)

- **Kod:** `lib/project-ai-engine.ts` (händelsemotor, 631 r), `lib/playbook/{detect-pattern,propose-pattern,kickoff-candidates,propose-kickoff,checkpoint-outcomes}.ts`, `lib/expectation-drift/stale-signals.ts`, `lib/mission/*`. Projektskapande var duplicerat mot `create-from-quote.ts`, nu delegerat och låst av facit. **"Mission Control" finns inte som sida**, det är JarvisHome.

- **Trigger:** crons `project-health` mån 06:00, `playbook-pattern` tis 05:20, `playbook-kickoff` tor 05:25, `expectation-drift` 06:50; event vid accept/tid/milstolpe/betalning.

- **Riktig data:** playbook kräver `project_lesson` (efterkalkyl). **Prod: project_ai_log 770 rader (motorn lever), project_lesson 3, mission 0, drift-kort 4.**

- **Agerar / godk.:** kort `playbook_pattern_confirmation`, `playbook_kickoff_suggestion`, `expectation_drift_signal`; utförande skriver `business_knowledge`/checklista.

- **Kvitto:** `project_ai_log`, `execution_outcome`, `automation_activity`.

- **Webb:** approvals, `ProjectApprovalsBlock`, projektsida, `MissionPanel`, `Uppdragsrad`. **Mobil:** kort + uppdragsräknare i mobile-home.

- **Bevis:** 8 facit + E2E-projekt `flywheel` och `mission-proof` (service-role, ej browser).

- **LLM:** bara mönsterdetektion (extraction-modell). Motorn och drift LLM-fria.

- **Status:** motorn PROVE, playbook + missions ACTIVATE. **Nästa:** inget för helgen. Skiva 3 (Project Brain) = EXPOSE av `project_ai_log` + fakturaberedskap + kort på projektsidan.

### 15. Profitability / Margin

- **Kod:** `lib/projects/margin-guardian.ts` (ren), `lib/profitability.ts` (I/O + kort), `compute-economics.ts`, bränsle `lib/costs/fuel.ts`. **Parallell gammal väg:** `calculateProfitability` (`lib/profitability.ts:64`) mot stale `actual_*`-kolumner, avvecklad i kommentarer men lever.

- **Trigger:** cron `evaluate-thresholds` 06:00; realtid vid tidrapport och materialuttag.

- **Riktig data:** **Prod: 0 `profitability_warning`-kort.** Bränsle: 1264 cost_event på 30 dagar.

- **Agerar / godk.:** kort (INFORMATIONAL, Karin). Bränsletaket blockerar hårt via `checkFuelGate`.

- **Kvitto:** kortet, `cost_event`.

- **Webb:** projektsida (`GuardianOrsaker`), approvals, FuelGauge/FuelBillingCard, `/skydda-marginalen`. **Mobil:** `profitability/mobile`.

- **Bevis:** 8 facit + inloggad E2E `e2e-margin-guardian`.

- **LLM:** ingen.

- **Status:** PROVE. **Nästa:** ta bort `calculateProfitability`-vägen (CONNECT-städning, liten). Money Brain (skiva 9) bygger på detta.

### 16. Invoice / accounting intelligence (inkl. Invoice Readiness)

- **Kod:** `lib/projects/auto-invoice-on-complete.ts`, `lib/invoices/{send-invoice,create-invoice,mark-sources,evidence-manifest,apply-payment}.ts`, **fakturaberedskap: `lib/projects/fakturaberedskap.ts` + `commercial-readiness.ts` + `components/projects/RedoAttFakturera.tsx`**, påminnelser `lib/invoice-reminder-{card,send}.ts`. ⚠︎ origin/main: fakturakälla atomisk (04990160), källval uttryckligt (91af57d8).

- **Trigger:** projektavslut när `auto_invoice_on_complete`; crons `check-overdue` 07:00, `send-reminders` 10:00, `missed-revenue` 06:40, `fortnox-sync` */2h.

- **Riktig data:** **Prod: 12 fakturor (2 betalda, 4 utkast, 6 förfallna), 0 påminnelser skickade, 4 invoice_reminder-kort.**

- **Agerar / godk.:** skapar/skickar faktura, sätter overdue, lägger avgift/ränta (ett muteringsställe). Kort `invoice_reminder`; autonomiväg via mandat.

- **Kvitto:** `invoice_reminders`, `customer_activity`, `automation_activity`, bevismanifest.

- **Webb:** invoices, `InvoiceStatusTimeline`, projektsida (`RedoAttFakturera`, `ProjectStatusBand`), supplier-invoices. **Mobil:** bara kortfeed.

- **Bevis:** 15 facit + golden-path E2E.

- **LLM:** ingen i kedjan.

- **Status:** PROVE (kedjan), **EXPOSE (fakturaberedskap)**: den finns på projektsidan men inte på Home eller i Pengar. **Nästa:** "326 400 kr utfört arbete väntar" på Home = summera `fakturaberedskap` över projekt. Ingen ny motor.

### 17. Fortnox

- **Kod:** `lib/fortnox.ts` (~1300 r), `lib/fortnox/{sync,sync-payments,map-invoice,match-supplier-invoice,import-supplier-invoices,housework,api-log}.ts`, `lib/invoices/sync-to-fortnox.ts`. **Fyra ingångar** mot samma kärna (`sync/invoice`, `sync/invoices`, `sync-now`, `send-via-fortnox`), konsolidering bevakad av facit. Känt: `DocumentNumber`, inte `InvoiceNumber`.

- **Trigger:** cron */2h; Fortnox-först vid utskick (`send-invoice.ts:132`, fel blockerar leveransen).

- **Riktig data:** **Prod: 0 kopplade företag, 19 api_log-rader.** `housework.ts:22`: taxreduction-vägen "licensblockerad", aldrig observerad skarpt.

- **Agerar / godk.:** externa skrivningar (bokför, taxreductions, e-faktura, betalning). **Går inte via spåret**, direkt effekt vid utskick.

- **Kvitto:** `fortnox_api_log`, `automation_activity`, `invoice.fortnox_sync_status/fortnox_invoice_number`.

- **Webb:** settings/integrations, invoices, supplier-invoices, karin. **Mobil:** nej.

- **Bevis:** 15 facit, **inget live-providertest.**

- **LLM:** ingen.

- **Status:** PROVE, **blockerad av koppling.** **Nästa:** Andreas kopplar riktigt konto i helgen; en faktura genom kedjan; läs `fortnox_api_log`.

### 18. ROT/RUT

- **Kod:** `lib/rot-rut.ts`, `lib/skv/{validate-rot-request,rot-rut-xml,parse-decision-file,categories}.ts`, `lib/fortnox/housework.ts`. **Två parallella vägar till Skatteverket:** egen XML (`/api/rot-payment/generate`) och Fortnox `POST /taxreductions`. Obs: `rot_rut_documents` är en migrationsfil, ingen tabell.

- **Trigger:** enbart UI, ingen cron.

- **Riktig data:** **Prod: 0 rot_payment_request.** Aldrig skarpt inlämnad.

- **Agerar / godk.:** skriver `rot_payment_request`, `invoice.rot_decision_status`; grindas av `hasPermission`, inte spåret.

- **Kvitto:** `rot_payment_request`, `automation_activity` (`fortnox:taxreduction-failed/skipped`).

- **Webb:** invoices/rot-payment, ROT-sektioner i offert/faktura. **Mobil:** nej.

- **Bevis:** 9 facit, inget live.

- **LLM:** ingen.

- **Status:** PROVE + **arkitekturbeslut krävs** (en väg, inte två). **Nästa:** Astra-fråga: egen XML eller Fortnox? Copyn "ROT-underlaget är komplett / personnummer saknas" (§23) finns redan som flaggor i `quote-completeness.ts` och `panel-status.ts`.

### 19. Missions / agentarbete

- **Kod:** `lib/agents/` (kanonisk: registry med 5 runners, team med 7, `shared/{cost-guard,thinking-call,dedup}`), `app/api/agent/trigger/*` (~4000 r), `lib/mission/*` (14 filer), `lib/mandates/*`. `lib/agent/` (singular) är **inte** en död stack: 13 av 17 filer importeras utifrån (capabilities 5, orchestration 4, thread-messages 3, …). Utan anropare: `orchestrator.ts`, `agents/ekonomi-agent.ts`, `agents/lead-agent.ts`, `agents/strategi-agent.ts` — de fyra kan raderas. Matte-chatten är egen LLM-väg och **medvetet okopplad från kostnadstaket.**

- **Trigger:** crons `agent-observations/{karin,daniel,lars,hanna,lisa}` dagligen/2×v, `agent-context` 05:00. Mission har ingen cron (expired sätts vid läsning).

- **Riktig data:** **Prod: agent_runs 1362 (282 senaste 30 d), mission 0, agent_observation-kort 105.** Agenterna kör varje natt mot testkonton.

- **Agerar / godk.:** allt genom `agent-gating.ts` (`shouldQueueForApproval`).

- **Kvitto:** `agent_runs` (usage + estimated_cost), `automation_activity`, `execution_result`.

- **Webb:** JarvisHome (MatteHero, Uppdragsrad, SkottUtanDig, FirmanJustNu), MissionPanel, AgentReadinessCard. **Mobil:** uppdragsräknare i mobile-home.

- **Bevis:** 20+ facit; `mission-proof` E2E (service-role).

- **LLM:** hög, extended thinking per agent per körning; tak + kill-switch i cost-guard.

- **Status:** agenter PROVE, missions ACTIVATE. **Nästa:** koppla Matte-chatten till taket före lansering (kostnadsrisk); radera de fyra filerna utan anropare.

### 20. Approval rail ⭐ grunden

- **Kod:** `lib/approvals/{routing,action-contract,execution-outcome,value-receipt,noise-gate,kortkvalitet,mobile-home}.ts`, `app/api/approvals/[id]/route.ts` (>3000 r, en switch per typ), `lib/autonomy/{earned-autonomy,agent-gating}.ts`. ⚠︎ origin/main: per-korttyp-grindar (af9b258b), `prepare-review.ts`. Utanför mappen: `lib/approve-actions.ts`, `auto-approve*.ts`, `automation-engine.ts` — potentiellt parallella beslutsvägar, `?`.

- **Trigger:** alla 46 crons + agent-trigger + Matte producerar; användaren beslutar.

- **Riktig data:** **Prod: 477 kort, 26 väntande, 109 utförda, 30+ typer i bruk.** Toppen: agent_observation 105, automation 87, send_sms 50, dispatch_suggestion 43.

- **Agerar / godk.:** ja, det är spåret. Självgodkännande nekas, fyra-ögon för känsliga typer.

- **Kvitto:** `execution_result` klassad av `execution-outcome.ts`, Värdeliggaren läser det.

- **Webb:** approvals, JarvisHome, GorDettaForst, RailCard. **Mobil:** max 3 kort, push.

- **Bevis:** 15 facit + inloggad E2E (golden-path, permission-check med employee-session).

- **LLM:** ingen i spåret.

- **Status:** **SCALE.** **Nästa:** inget bygge. Skiva 5 (explainability) = visa `_decision`/evidens som redan ligger i payload på kortet.

### 21. Operating Experiments

- **Kod:** `lib/experiment/{types,propose,enroll,measure,report}.ts`, v157. Ingen dubblett.

- **Trigger:** inline vid `playbook_pattern_confirmation`, svep i `maintenance` 03:00.

- **Riktig data:** avslutade projekt. **Prod: 0 rader.**

- **Agerar / godk.:** kort `operating_experiment_proposal/readout` → owner_admin.

- **Kvitto:** tabellraden + readout-kort.

- **Webb:** `/dashboard/experiments/[approvalId]`. **Mobil:** nej.

- **Bevis:** facit + `experiment-proof` (service-role).

- **LLM:** ingen.

- **Status:** ACTIVATE, sovande by design. **Nästa:** rör inte. Vaknar vid ~10 avslutade projekt.

### 22. Partner / referral

- **Kod:** `lib/partners/*` (11 filer), `lib/referral/*`, v117/v189/v190 attributionslås. Ingen dubblett.

- **Trigger:** Stripe-webhook, partnerportal-anrop. **Ingen cron.**

- **Riktig data:** **Prod: 2 partners, 0 ledger-rader.**

- **Agerar / godk.:** direkt via commission-engine, **inte spåret**; utbetalning via admin + approve-token.

- **Kvitto:** `partner_commission_ledger`, `partner_payout_batch.document_snapshot`, `partner_events`.

- **Webb:** `/partners/*`, admin-modal, `/rekommendera`, `/via/[kod]`. **Mobil:** nej.

- **Bevis:** 15 facit + `partner-proof`-config; ingen browser-E2E.

- **LLM:** ingen.

- **Status:** PROVE. Inte Brain Visibility. **Nästa:** utanför programmet.

## Tvärgående ytor

### Home / Mission Control ⭐ skiva 1

- `app/dashboard/page.tsx` (104 r) → `components/jarvis/JarvisHome.tsx` (**1980 r, 18 datakällor**: approvals, NBA, reactivation-signal, mission/suggestions, customer-cases, revenue-recovery-cases, project-closeout-copilot, project-cases, observations, moments, suggestions, automations/activity, team-activity, dashboard/pengar, value/kvitto, ledger, agarrapport).

- **Räkningarna finns redan:** `MatteHero.tsx:123` "Inget behöver dig just nu. Allt är hanterat." / "{N} saker behöver dig i dag. Resten är hanterat." · `TeamActivityStrip.tsx:66` "AI-teamet har hanterat … sedan igår kväll" · `SkottUtanDig` via `lib/jarvis/dygnsdigest.ts`.

- **Parallell yta:** gamla Idag-vyn lever på `/dashboard/oversikt` (`IdagCore.tsx`, 892 r). `/dashboard/hem` = alias.

- **Status:** EXPOSE. **Risk:** fjärde ombyggnaden på två månader. **Nästa:** ingen ny struktur. En läsmodell (`/api/home/brain-state`?) som härleder Hanterat / Arbetar med / Väntar på / Behöver dig / Pengar ur befintliga källor, och som **inte** räknar "hanterat" när `automation_activity` har `failed`. Radera `/dashboard/oversikt` eller döp om den till arkiv.

### Adoption / "hur mycket hanterade Handymate"

- ⚠︎ `lib/admin/adoption.ts` finns **på origin/main** (8 ytor, 30 dagar från `onboarding_completed_at`, tröskel 4), saknas i gamla trädet. `lib/admin/activation-metrics.ts` (tid till första fynd/godkännande/kvitto). Volym: `automation_activity`. Veckorapport: `lib/weekly-value.ts` — **0 lyckade av 4 senaste veckan.**

- **Status:** EXPOSE (måttet finns, visas bara i admin). **Nästa:** laga veckorapporten först; använd adoptionsmåttet som programmets North Star (§21) i stället för att bygga nytt.

### Mobilappen

- **Ligger inte i detta repo** (`handymate-mobile`, separat). Backend här: `app/api/mobile/home/route.ts` (NBA-kö max 3, badge, nattens automationer, uppdrag), `lib/approvals/mobile-home.ts`, `push-tokens`, `push/send` + `expo-push.ts`. **Prod: 1 push_token, 0 web-push-prenumerationer, VAPID saknas.** EAS/TestFlight-status okänd härifrån.

- **Status:** CONNECT (push) / PROVE (feed). **Nästa:** VAPID i Vercel; skiva 7 kräver att appen faktiskt byggs och installeras på en telefon.

### Kostnad

- 1264 cost_event på 30 dagar, 282 agentkörningar, utan en enda riktig kund. Matte-chatten står utanför taket. Skiva 1 och 2 ska vara LLM-fria läsmodeller (§4.14). NBA är det enda dagliga Sonnet-anropet och det körs aldrig idag.

## Rekommenderad helgkö (kapad)

1. **CONNECT: tysta fel + veckorapport** (Fable, 2 h). Utan detta ljuger Home.

2. **EXPOSE: Quote Brain** (Codex, 4–5 h). Läsmodell på offertsidan ur `followup-round` + `v3_automation_logs`.

3. **EXPOSE: Home-läsmodell** (Fable, 5–6 h). Fem states ur befintliga källor, inga nya tabeller.

4. **EXPOSE: fakturaberedskap på Home + kvitton nära kontext** (Codex, 3–4 h).

5. **ACTIVATE: standardprinciper + mål i genomgången** (1–2 h). Väcker NBA och MalBlock för varje ny kund.

6. **GO-förutsättningar** (Andreas): 46elks, Stripe live, VAPID, Google, schemafix `document_id`, Fortnox-koppling.

7. **Skiva 10** i den grad leverantörerna tillåter.

Flyttas till efter lansering: skiva 3, 4, 5 (finns delvis i payload redan), 7, 8, 9.

## Öppna frågor — besvarade mot origin/main 64484e11 där det gick

- ~~Är `lib/agent/` död?~~ **Nej.** 13/17 filer lever. Radera `orchestrator.ts` + `agents/{ekonomi,lead,strategi}-agent.ts`.

- **ROT: en väg eller två?** Fortfarande två (`/api/rot-payment/generate` → egen XML; `sync-to-fortnox.ts:346` → `POST /taxreductions`). **Astra-beslut krävs.**

- ~~Matte-rapportläget utan anropare?~~ **Inkopplat** via DayClose → `/api/day-close`.

- ~~`approve-actions`/`auto-approve*`/`automation-engine` döda?~~ **Nej.** `automation-engine.ts` har 28 importörer (kanonisk för automationer), `auto-approve.ts` används av `/api/automations`, `auto-approve-learning.ts` av `/api/auto-approve/patterns`. Rättelse efter Codex-kodgranskning: importerna används för statistik. `tryAutoApprove` har ingen runtime-anropare; legacy-exekveraren saknar dagens grindar och får inte återaktiveras. Se verifieringen nedan.

- Ska Company Scan lämna kvitto? **Produktbeslut, öppen.**

- Ska Value Receipts persisteras? **Produktbeslut, öppen.** Kostnad: omberäkning per anrop är gratis i LLM men gör "hanterat sedan igår" beroende av att alla källor svarar.

## Codex-verifiering 2026-09-10

Kodbas: `3ae0029` (main efter uppladdat styrdokument); Claudes historiska audit gäller `64484e11`. Räkningar nedan är läsande SQL mot Handymates prodprojekt, inte provider- eller E2E-bevis.

- Bekräftat: 29 företag; 1 uttryckligt marginalmål; 0 omsättningsmål, prioriteringsregler, business rules, NBA-rader, Fortnox-kopplade företag och ROT-begäranden.
- Bekräftat: 477 approval-rader: 109 `approved`, 26 `pending`, 324 `expired`, 18 `rejected`. **109 godkända är inte 109 utförda handlingar**: runtime `payload.execution_result.outcome` är 37 `success`, 13 `failed`, 22 `skipped`, 37 saknas. Auditens historiska formulering "109 utförda" är därmed fel; sparat success är i sin tur inte automatiskt live-providerbevis.
- Bekräftat senaste sju dagar: 53 `tyst_fel/failed` (43 `telefonnummer_saknas`, 10 `sms:leverantorsfel-saldo`), 4 `veckorapport/failed`, inga lyckade veckorapporter. Dessa auditposter ska inte raderas eller omskrivas till success.
- Bekräftad schemadrift: `customer_document` har `id`, inte `document_id`.
- Rättelse: `tryAutoApprove` har ingen runtime-anropare i TS/TSX. `/api/automations` läser `getAutoApproveStats`; `/api/auto-approve/patterns` läser lärandestatistik. `voice/analyze` har avvecklat legacy-vägen. Legacy-exekveraren respekterar inte dagens routing/mandat och får inte återaktiveras; detta är inte en verifierad aktiv automatisk bypass.
- Inga förmågor uppgraderas. Övriga uppgifter/statusar är Claudes underlag; ingen ny live-, provider- eller mobilverifiering har gjorts. Fördelningarna i ursprungsunderlagen är inte normaliserade: blandade delstatusar ska inte tolkas som en verifierad summering av en primär status per rad.
