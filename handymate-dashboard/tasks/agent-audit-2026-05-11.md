# Agent + Automatiserings-audit — 2026-05-11

**Författare:** Claude (Opus 4.7)
**Beställare:** Andreas
**Syfte:** Faktabaserad inventering av agenter, cron-jobb och automatiseringar inför brainstorm om var agentlogik ska gå härnäst.
**Strategisk position:** Christoffer (pilot-hantverkare) ska uppleva "AI gör jobbet, jag fokuserar på hantverket". Vision: UI nästan överflödigt om 6-12 månader.

> **Konvention:** Rader markerade `FAKTA` har bekräftats i kod, SQL eller config-fil. Rader markerade `TOLKNING` är min slutsats baserad på det observerade. Andreas: titta extra på TOLKNING-raderna — där kan jag ha fel.

---

## Del 1 — Agent-inventering

`FAKTA` Alla sex agenterna är definierade i [lib/agents/team.ts](handymate-dashboard/lib/agents/team.ts) som en `TEAM`-konstant (id, namn, roll, avatar). Personligheter och system-prompts ligger i [lib/agents/personalities.ts](handymate-dashboard/lib/agents/personalities.ts). Tool-registret och routern ligger i [app/api/agent/trigger/tool-definitions.ts](handymate-dashboard/app/api/agent/trigger/tool-definitions.ts) och [lib/tool-router.ts](handymate-dashboard/lib/tool-router.ts).

Trigger-routen är [app/api/agent/trigger/route.ts](handymate-dashboard/app/api/agent/trigger/route.ts). Modell-routing (verifierat rad ~29):
- **Live customer interactions** (`phone_call`, `incoming_sms`) → Claude Sonnet 4.6
- **Background** (cron, manual, imports) → Claude Haiku 4.5

Alla körningar loggas i `agent_runs`-tabellen ([sql/agent_tables.sql](handymate-dashboard/sql/agent_tables.sql)) med `run_id, business_id, agent_id, trigger_type, steps JSONB, tool_calls, final_response, tokens_used, status`.

### Per-agent-tabell

| Agent | Roll | Status | Specifika triggers | UI-synlig |
|---|---|---|---|---|
| **Matte** | Chefsassistent (orkestrator) | AKTIV i prod | `manual` (dashboard), `morning_report`, delegerar via `[DELEGATED:agent_id]`-markör | Dashboard, agent-chat, morning brief |
| **Karin** | Ekonom | AKTIV i prod | `invoice_overdue`, `payment_received`, `invoice_created` | Approvals-flödet |
| **Daniel** | Säljare | AKTIV i prod | `lead_created`, `quote_sent`, `quote_opened`, `quote_expired` | Approvals-flödet |
| **Lars** | Projektledare | AKTIV i prod | `booking_created`, `job_completed`, `work_order_created` | Approvals-flödet |
| **Hanna** | Marknadschef | AKTIV i prod | `customer_inactive`, `job_completed`, `leads_batch_ready` | Approvals-flödet |
| **Lisa** | Kundservice & Telefonist | `training: true` i kod | `incoming_call`, `incoming_sms`, `customer_complaint`, `booking_request` | Approvals-flödet (med träning-badge) |

`FAKTA` **Lisa har `training: true` i `lib/agents/team.ts:25`** — verifierat i koden. Hon är markerad som under upplärning, vilket TOLKNING betyder att hennes output förmodligen behöver mer manuell granskning än övriga.

`TOLKNING` Alla "specifika triggers" ovan baseras på vad Explore-agenten rapporterade från system-prompt och tool-routing. Jag har inte själv läst varje agents fulla prompt-fil. Andreas: dubbelkolla om någon trigger är fel.

### Tool-inventering (29 verktyg totalt)

`FAKTA` från [app/api/agent/trigger/tool-definitions.ts](handymate-dashboard/app/api/agent/trigger/tool-definitions.ts):

**CRM (4):** `get_customer`, `search_customers`, `create_customer`, `update_customer`

**Operationer (7):** `create_quote`, `get_quotes`, `create_invoice`, `check_calendar` (Google sync), `create_booking` (auto-Google sync), `update_project`, `log_time`

**Kommunikation (3):** `send_sms` (46elks, respekterar nattspärr), `send_email` (Gmail eller Resend), `read_customer_emails`

**Pipeline (4):** `qualify_lead`, `update_lead_status`, `get_lead`, `search_leads`

**Stats + approvals (3):** `get_daily_stats`, `create_approval_request`, `check_pending_approvals`

**BI (7):** `get_project_profitability`, `update_business_preference`, `get_automation_settings`, `log_automation_action`, `check_fortnox_status`, `trigger_fortnox_sync`, `get_pricing_suggestion`

**Inter-agent (2):** `send_agent_message`, `get_agent_messages`

`TOLKNING` Det här tool-registret är imponerande bredd, men jag har INTE verifierat att varje verktyg fungerar end-to-end mot prod-data. Speciellt `read_customer_emails` kräver Gmail-koppling per kund — okänt hur ofta det faktiskt körs i pilot.

### UI-synlighet

`FAKTA` Tre platser:
1. **[/dashboard/agent](handymate-dashboard/app/dashboard/agent/page.tsx)** — fullständig agent-dashboard med agent-selector (alla 6), memory-browser, run-history med tool_calls och tokens/cost per körning.
2. **[/dashboard/approvals](handymate-dashboard/app/dashboard/approvals/page.tsx)** — approval-flödet visar vilken agent som initierade varje godkännande (avatar + namn).
3. **Hemskärm** — [components/TeamActivityStrip.tsx](handymate-dashboard/components/TeamActivityStrip.tsx) visar agent-aktivitet, morning-brief från Matte längst upp.

`TOLKNING` Christoffer ser agenterna mest via approvals-kort + morning brief. Han ser INTE direkt vilken agent som triggade en SMS-utgång till hans kund — det loggas men exponeras inte i en "agent timeline"-vy som han kan ögnna.

---

## Del 2 — Cron + Event-triggers-inventering

### Vercel cron (`vercel.json`)

`FAKTA` 17 aktiva cron-routes. Alla kräver `CRON_SECRET` Bearer-token. Inga är pausade.

| Schedule | Route | Vad gör den | Trigger-agent |
|---|---|---|---|
| `0 3 * * *` (03 UTC) | `/api/cron/maintenance` | Expire approvals, sync phone-webhooks | — |
| `0 5 * * *` (05 UTC) | `/api/cron/agent-context` | Genererar agent-kontext + nattlig analys (priser, garanti, partner) | Matte |
| `0 6 * * *` (06 UTC) | `/api/cron/evaluate-thresholds` | Kör threshold + cron-regler för alla businesses | — (routing-lager) |
| `0 7 * * *` (07 UTC) | `/api/cron/check-overdue` | Sätter `invoice.status='overdue'` (ingen SMS) | — |
| `0 8 * * *` (08 UTC) | `/api/cron/quote-follow-up` | Offertuppföljning via AI agent | Daniel |
| `0 9 * * *` (09 UTC) | `/api/cron/nurture` | Processar nurture-steg via AI agent | Hanna |
| `0 10 * * *` (10 UTC) | `/api/cron/send-reminders` | Påminnelsekedja förfallna fakturor (4 nivåer) | Karin |
| `0 16 * * *` (16 UTC) | `/api/cron/communication-check` | Daglig kommunikations-QA via AI agent | Lisa/Matte |
| `*/15 * * * *` | `/api/cron/gmail-poll` | Pollar Gmail (History API) för alla länkade businesses | — |
| `*/15 * * * *` | `/api/cron/send-campaigns` | Skickar schemalagda SMS-kampanjer | Hanna |
| `*/15 * * * *` | `/api/cron/gmail-lead-import` | Importerar leads från Gmail (Haiku + Sonnet parse) | Daniel |
| `0 */2 * * *` | `/api/cron/fortnox-sync` | Pollar Fortnox-betalstatus, triggar automation | Karin |
| `0 */6 * * *` | `/api/cron/sync-calendars` | Synkar Google Calendar för länkade businesses | — |
| `0 6 * * 1` (mån 06 UTC) | `/api/cron/project-health` | Hälsokontroll på alla aktiva projekt | Lars |
| `0 7 * * 1` (mån 07 UTC) | `/api/cron/seasonality` | Säsongs-analys + proaktiv trigger 6v framåt | Hanna |
| `0 6 * * 0` (sön 06 UTC) | `/api/cron/generate-insights` | 3-5 predictive insights/business via Claude | Matte |
| `0 7 1 * *` (1:a 07 UTC) | `/api/cron/monthly-review` | Månadsrapport för föregående månad | Matte |

### Morning-brief flödet

`FAKTA` `/api/cron/morning-brief` kör inte direkt — det proxy:ar till `/api/morning-brief` (POST, samma CRON_SECRET). Det är där Matte faktiskt analyserar och skapar dagens sammanfattning.

### GitHub Actions

`FAKTA` Det finns två workflow-filer i [.github/workflows/](.github/workflows/):

1. **agents.yml** — `PAUSAD 2026-05-06`. Filhuvudet säger:
   > "Dev-agenter pausade 2026-05-06. Reason: kostade Opus 4.7 via Claude Code default, levererade inget värde i pilot-fasen. Återaktivera när agenterna har konkreta use cases och rimliga modeller."

   Endast `workflow_dispatch` (manuell körning från GitHub UI). Schemalagda cron-rader är ut-kommenterade. **Detta är dev-agenter** (qa, fix, research, strategy, cs) som hjälper Andreas + Claude med utvecklingsarbete — inte produktions-agenterna Matte/Karin/etc.

2. **playwright.yml** — pausad tidigare i denna session (commit `b193a7e3`).

`TOLKNING` Den första Explore-agenten i denna audit blandade ihop dessa två agent-system. Det finns alltså inte ETT agent-system utan TVÅ:
- **Produktions-agenterna** (Matte/Karin/Daniel/Lars/Hanna/Lisa) — kör Christoffers verksamhet via Vercel cron + webhook-triggers.
- **Dev-agenterna** (qa/fix/research/strategy/cs) — körde tidigare via GitHub Actions för att hjälpa med utvecklingen. Pausade.

### Webhook-receivers

`FAKTA` verifierat via [Glob app/api/**/webhook*/route.ts]:

| Webhook | Path | Källa | Triggar |
|---|---|---|---|
| Inkommande SMS | `/api/sms/incoming` | 46elks | `triggerAgentFireAndForget` → Lisa |
| Inkommande röst | `/api/voice/incoming` | 46elks | Voice-pipeline (transkribering → analyze → execute) |
| Stripe billing | `/api/billing/webhook` | Stripe | Prenumerations-events (signup, cancel, payment) |
| Partners outbound | `/api/partners/webhook` | Partner-system | Lead-mottagning från partners (Polar/etc.) |

`FAKTA` **Det finns INGEN dedikerad webhook för:**
- Fortnox (sync sker via cron var 2:e timme)
- Vapi (används inte — voice går via 46elks)
- Resend inbound (används inte för inkommande email — Gmail-poll istället)
- Email reply tracking (Gmail History API används, inte webhook)

### Database triggers

`FAKTA` 4 triggers, alla aktiva:

| Trigger | Tabell | Event | Effekt |
|---|---|---|---|
| `trg_set_ata_number` | `project_change` | BEFORE INSERT | Auto-sätter ÄTA-löpnummer per projekt |
| `trg_update_profitability` | `time_entry` | AFTER I/U/D | Räknar om `project.profitability_status` |
| `trg_update_material_cost` | `project_material` | AFTER I/U/D | Räknar om `project.material_cost_sum` |
| `deals_stage_timestamp` | `deal` | BEFORE UPDATE | Sätter `stage_updated_at` när deal-fas ändras |

### V3 Automation Rules (seedade per business)

`FAKTA` från [sql/v3_seed_rules.sql](handymate-dashboard/sql/v3_seed_rules.sql) — 10 systemregler seedas vid business-skapande:

1. **Morgonrapport** — cron mon-fri 07:00 → kör Matte
2. **Ny lead-bekräftelse** — event `lead_created` → auto-SMS
3. **Missat samtal** — event `call_missed` → auto-SMS
4. **Offertuppföljning dag 5** — threshold `quote.days_since_sent >= 5` → auto-SMS
5. **Offertuppföljning dag 10** — threshold `>= 10` → **kräver approval**
6. **Fakturapåminnelse dag 1** — threshold `invoice.days_overdue >= 1` → auto-SMS
7. **Fakturaeskalering dag 7** — threshold `>= 7` → **kräver approval**
8. **Bokningspåminnelse 24h** — threshold `booking.hours_until <= 24` → auto-SMS
9. **Reaktivering 6 mån** — threshold `customer.months_since_last_job >= 6` → **kräver approval (AV som default)**
10. **Inkommande SMS-notis** — event `sms_received` → notifiera ägaren

`TOLKNING` Det här är "deterministisk automation" som körs av threshold-evaluators (cron 06 UTC), inte av AI-agenter direkt. Men 4 av reglerna (#1, 5, 7, 9) involverar agenter eller approvals.

---

## Del 3 — Automatiseringar per hantverkar-fas

För varje fas: vad är manuellt idag, vad är automatiserat, vilken agent (om någon), och min slutsats om luckan.

### Fas 1 — Lead inkommer

- **Källor idag:** (a) Inkommande SMS via 46elks-webhook, (b) Inkommande röstsamtal via 46elks-webhook, (c) Email via Gmail-poll (var 15 min), (d) Partners via webhook.
- **Automatiserat:** `gmail-lead-import`-cron (Haiku + Sonnet parse) auto-skapar `customer` + `lead` + `lead_activity`. SMS in triggar Lisa via `triggerAgentFireAndForget`. Röstsamtal går genom voice-pipeline.
- **Agent:** Lisa (SMS, samtal), Daniel (email-parsade leads).
- **Manuell:** Walk-in/personlig referens — Christoffer skriver in i appen själv.
- `TOLKNING` Detta är en av de mest mogna faserna. Bra coverage.

### Fas 2 — Första kontakt

- **Automatiserat:** V3-regel #2 skickar bekräftelse-SMS inom 5 min vid `lead_created`. Lisa kan svara på inkommande SMS direkt.
- **Manuell:** Personligt svar krävs ofta — Christoffer behöver bedöma om leadet är seriöst.
- **Agent:** Lisa (auto-bekräftelse), Daniel (kvalificering via `qualify_lead`).
- `TOLKNING` Det första svaret är automatiserat men det är fortfarande Christoffer som ringer tillbaka. Voice-callback-automation finns inte.

### Fas 3 — Hembesök/möte

- **Automatiserat:** Booking-skapande via `create_booking`-tool (kräver dock manuell trigger eller agent-handoff). Bokningspåminnelse 24h innan (V3-regel #8). Google Calendar-sync.
- **Manuell:** Schemaläggningen själv — varken Lars eller Lisa initierar ett hembesök autonomt idag.
- **Agent:** Lars (om kund explicit ber om bokning via SMS, vilket Lisa kan delegera).
- `TOLKNING` Stor lucka: ingen agent föreslår proaktivt en hembesökstid baserat på inkommande lead. Det är manuellt.

### Fas 4 — Offert skapas

- **Automatiserat:** `create_quote`-tool finns. Quote-templates + AI-kategorisering finns. Pricing-suggestion via historiska data (`get_pricing_suggestion`).
- **Manuell:** Christoffer öppnar quote-builder i appen och fyller i.
- **Agent:** Ingen agent skapar offerter autonomt idag.
- `TOLKNING` Tools finns men ingen agent triggas på "vi har gjort hembesök, dags att skicka offert". Saknad bro mellan hembesök och offert-utkast.

### Fas 5 — Offert skickas

- **Automatiserat:** Skicka via email (Gmail/Resend) eller SMS-länk till sign-vy. Quote-tracking (öppna events) loggas. `quote_sent`-event triggas.
- **Manuell:** Christoffer klickar "Skicka" själv.
- **Agent:** —
- `TOLKNING` Saknar auto-send efter approval. T.ex. "Daniel har förberett en offert baserat på hembesök — godkänn för att skicka".

### Fas 6 — Offert signerad

- **Automatiserat:** `quote_opened` + `quote_signed` events. Auto-projekt-skapande sker via [sql/v10_auto_invoice_on_complete.sql] (jag har inte verifierat detta exakt — det är en `TOLKNING`).
- **Manuell:** —
- **Agent:** Daniel (insight + handoff till Lars).
- `TOLKNING` Bra coverage. Ofta automatiskt.

### Fas 7 — Projekt skapas

- **Automatiserat:** Trigger när offert signeras. `project_milestone` + initial workflow-stage sätts upp.
- **Manuell:** Christoffer kan justera scope/milestones.
- **Agent:** Lars får `work_order_created`-event.
- `TOLKNING` Detta funkar men det är manuellt att lägga till `project_material` och definiera milstolpar utöver default.

### Fas 8 — Booking schemaläggs

- **Automatiserat:** `create_booking` med Google Calendar-sync. 24h-påminnelse.
- **Manuell:** Tidsval, sekvens av bokningar, on-my-way-meddelanden (även om en `/api/on-my-way`-endpoint finns).
- **Agent:** Lars.
- `TOLKNING` On-my-way-flödet är byggt men jag har inte verifierat att Lars använder det autonomt. Förmodligen tryck-knapp i mobilen.

### Fas 9 — Material beställs/hämtas

- **Automatiserat:** Inget jag kunde verifiera. `project_material`-tabellen finns men ingen agent köper/påminner om material.
- **Manuell:** ALLT.
- **Agent:** —
- `TOLKNING` Detta är en av de största gaps. Supplier-integration (`supplier_connections.sql` + `supplier_invoices.sql` finns i schemat) men ingen agent har tool för att lägga inköpsordrar eller plocka leveranstider.

### Fas 10 — Arbetet utförs

- **Automatiserat:** Time-entry, byggdagbok, ÄTA-skapande, project-stages-tracking.
- **Manuell:** Christoffer dokumenterar.
- **Agent:** —
- `TOLKNING` Detta är hantverket — automation begränsad till logging/dokumentation. OK.

### Fas 11 — Tidrapporter

- **Automatiserat:** `log_time`-tool. Auto-trigger på `trg_update_profitability`. Time-entry-godkännande via approvals.
- **Manuell:** Time-entries fylls i på telefonen.
- **Agent:** —
- `TOLKNING` Voice-to-time-entry skulle vara en spektakulär quick win (se Del 4).

### Fas 12 — ÄTA om uppkommer

- **Automatiserat:** ÄTA-skapande + signing-flöde + auto-pull till slutfaktura (Track C som vi precis byggt!).
- **Manuell:** Identifiera att en ÄTA behövs, skapa via mobile-app.
- **Agent:** —
- `TOLKNING` Stark coverage tack vare senaste Track C-arbetet. Saknar AI-förslag: "Lars upptäckte i tidrapporten att du jobbat 4h extra utöver scope — skapa ÄTA?".

### Fas 13 — Jobbet klart

- **Automatiserat:** `job_completed`-event triggar Hanna (kampanj-trigger?), Lars (project-health). [sql/v10_auto_invoice_on_complete.sql] suggests auto-faktura.
- **Manuell:** Christoffer markerar projektet `completed`.
- **Agent:** Hanna, Lars.
- `TOLKNING` Auto-faktura-flödet existerar men jag har inte verifierat exakt vad det triggar.

### Fas 14 — Faktura skapas

- **Automatiserat:** `create_invoice`-tool. Track C: `/dashboard/projects/[id]/invoice-preview` + auto-pull av ÄTA + create-final-invoice.
- **Manuell:** Trigger "Skicka faktura"-knapp.
- **Agent:** Karin.
- `TOLKNING` Stark coverage från Track C. Saknar: full auto vid `job_completed`-event — idag är det fortfarande Christoffer som trycker.

### Fas 15 — Faktura skickas

- **Automatiserat:** Skicka via email eller SMS-länk. Skicka till Fortnox via `trigger_fortnox_sync`.
- **Manuell:** Christoffer klickar.
- **Agent:** Karin.

### Fas 16 — Betalning kommer in

- **Automatiserat:** `fortnox-sync`-cron var 2:e timme pullar betalstatus. `payment_received`-event triggar Karin.
- **Manuell:** —
- **Agent:** Karin.
- `TOLKNING` Mycket bra. Stort värde — Christoffer slipper själva kassan-kollen.

### Fas 17 — Påminnelser om obetald

- **Automatiserat:** `check-overdue` (07 UTC) markerar förfallna. `send-reminders` (10 UTC) skickar i 4-nivå-eskalering. V3-regler #6 (dag 1 auto) + #7 (dag 7 approval).
- **Manuell:** —
- **Agent:** Karin.
- `TOLKNING` Stark coverage. En av de mest mogna fas.

### Fas 18 — ROT-ansökan

- **Automatiserat:** `rot_rut_documents.sql` schema finns + customer-fält `personal_number` + `property_designation`. ROT/RUT-uträkning sker på invoice-nivå.
- **Manuell:** ROT-ansökan till Skatteverket är troligtvis fortfarande manuell. Inte verifierat att det finns en API-integration.
- **Agent:** —
- `TOLKNING` Stor lucka. Skatteverkets ROT-API är ett känt smärtområde. Antagligen pilot-värdes-driver.

### Fas 19 — Recension begärs

- **Automatiserat:** Nurture-sekvenser? `customer_inactive`-trigger för Hanna.
- **Manuell:** Inte verifierat — sannolikt manuellt eller via nurture-template.
- **Agent:** Hanna.
- `TOLKNING` Förmodligen täckt av nurture-systemet men jag har inte bekräftat exakt regel för "be om recension X dagar efter completion".

### Fas 20 — Efter-jobbet kund-relation

- **Automatiserat:** Reaktivering 6 mån (V3-regel #9, AV som default) + seasonality-cron (mån 07 UTC, 6v-framåt proaktiv).
- **Manuell:** Ge rabatt vid retur, skicka nyhetsbrev.
- **Agent:** Hanna.

---

## Del 4 — 15 förslag på nästa automatiseringar

Sorterade i tre buckets enligt strategisk värdebild + bygg-komplexitet.

### A. Quick wins (< 1 dag att bygga, synligt värde)

#### A1. Auto-skapa ÄTA-utkast när time_entry överskrider scope

- **Trigger:** Time-entry-tot för ett projekt > `quote.estimated_hours * 1.2` (20% buffer).
- **Aktör:** Lars deterministisk → auto-create-approval.
- **Output:** Approval-kort "ÄTA-utkast: Du har jobbat 4h extra på Bromma-projektet. Skicka tilläggsoffert till Andreas? — Föreslagen text: ..."
- **Synlighet:** Notis på hemskärm + approvals-flik.
- **Beroenden:** `quote.estimated_hours`-fält (verifierat finns), threshold-evaluator (finns).
- **Estimat:** 4-6h.
- **Strategiskt:** "Lars hittar pengar du missar" — direkt EBITDA-argument vid sälj.

#### A2. Voice-to-time-entry på mobilen

- **Trigger:** Mikrofon-knapp i mobile time-entry-flödet.
- **Aktör:** Voice-pipeline (transcribe + parse, samma som inkommande samtal).
- **Output:** Färdigtuktad time-entry: "Inspelat: 'Jag jobbade 4 timmar med Andreas badrum, demolerat klinker'" → entry: 4h, project=Andreas badrum, description=demolerat klinker.
- **Synlighet:** Direkt på time-entry-skärmen, alltid synlig.
- **Beroenden:** Whisper-transkribering (finns för voice/incoming).
- **Estimat:** 6-8h.
- **Strategiskt:** En av de tydligaste "AI gör jobbet"-momenten. Christoffer slipper knappa på telefonen i smutsiga handskar.

#### A3. Auto-faktura efter `job_completed` (med approval)

- **Trigger:** Event `job_completed`.
- **Aktör:** Karin.
- **Output:** Approval-kort "Karin har förberett slutfakturan på Andreas badrum (3 ÄTA + offert = 47 500 kr). Granska och skicka."
- **Synlighet:** Approvals-flik + push-notis.
- **Beroenden:** Track C (klart). `create-final-invoice` med `requires_approval: true` istället för auto-skick.
- **Estimat:** 4h.
- **Strategiskt:** "Faktura skapas av sig själv" — pilot-värde direkt mätbart.

#### A4. Auto-recension-begäran 7 dagar efter completion

- **Trigger:** Threshold `project.completed_at + 7 days`.
- **Aktör:** Hanna.
- **Output:** SMS med link till Google Reviews / Trustpilot / hemma-formulär.
- **Synlighet:** Loggas i kund-historik, syns i activity-strip.
- **Beroenden:** Review-länk per business (kan vara fritext-fält i `business_config`).
- **Estimat:** 3h + 1h för business_config-fältet.
- **Strategiskt:** Google-rankning för hantverkare = direkt lead-flow. Mätbar ROI.

#### A5. Push-notis när Matte hittar något i morning brief

- **Trigger:** Morning-brief körs (cron 06 UTC), om något kräver Christoffers uppmärksamhet (osv. 7+ dagar förfallen faktura, lead väntar svar > 24h).
- **Aktör:** Matte deterministisk threshold-koll.
- **Output:** PWA push: "3 saker att kolla i morse — öppna Handymate".
- **Synlighet:** Notis på låsskärm.
- **Beroenden:** PWA push (finns), Matte-analys (finns).
- **Estimat:** 3h.
- **Strategiskt:** Mjuk vana-skapare. Christoffer börjar dagen i appen istället för i kalendern.

### B. Strategiska byggstenar (infrastruktur som möjliggör mer)

#### B1. Voice-callback-agent vid missat samtal

- **Trigger:** `call_missed`-event.
- **Aktör:** Lisa, med tools `check_calendar` + `create_booking`.
- **Output:** Lisa ringer tillbaka automatiskt inom 30 min, frågar vad ärendet gäller, försöker boka hembesök direkt. Transkribering + summary skickas till Christoffer.
- **Synlighet:** Activity-feed visar samtalshistorik + transcript.
- **Beroenden:** Outbound voice via 46elks (förmodligen finns, ej verifierat). Voice-pipeline för struktur-svar (mer komplex än incoming).
- **Estimat:** 3-5 dagar.
- **Strategiskt:** En av de mest spektakulära demo-momenten. "Lisa svarar i telefon" är säljpitch i en mening.

#### B2. Lead → Offert auto-pipeline

- **Trigger:** `lead_qualified`-event (efter `qualify_lead`-tool gett hög score).
- **Aktör:** Daniel, med tools `get_pricing_suggestion` + `create_quote`.
- **Output:** Quote-utkast i `draft`-status, approval-kort "Daniel har förberett ett utkast på offert till Andreas — granska + skicka."
- **Synlighet:** Approval-card + utkast i quote-listan.
- **Beroenden:** Pricing-suggestion baserad på historiska data (finns som tool). Quote-template-system (finns). Lead-to-quote-mappning (saknas).
- **Estimat:** 1-2 veckor.
- **Strategiskt:** Här bryts UI-beroendet. Idag KRÄVS Christoffer att öppna quote-builder. Med detta är hans roll "granska + tryck skicka".

#### B3. Inbound-email-parsing som auto-skapar tasks

- **Trigger:** Gmail-poll hittar email som INTE är lead (kunden frågar om faktura, kunden klagar, leverantör skickar offert).
- **Aktör:** Karin (faktura-frågor), Lisa (klagomål), Daniel (leverantör-offert).
- **Output:** Auto-skapad task med foreslagen åtgärd. "Karin har tolkat email från Andreas: 'Är fakturan korrekt?' — möjliga svar: A) Visa specifikation, B) Erbjud betalplan, C) Be om mer info."
- **Synlighet:** Inbox-vy + approvals.
- **Beroenden:** Gmail-classification (Haiku-prompt). Inbox-UI (finns delvis).
- **Estimat:** 1 vecka.
- **Strategiskt:** Christoffer slipper ÅGE inboxen. Massiv tidsbesparing.

#### B4. Materialbeställning från ÄTA / quote-rader

- **Trigger:** Quote signerad eller ÄTA signerad, items innehåller material-rader.
- **Aktör:** Ny agent eller utökad Lars med `place_supplier_order`-tool.
- **Output:** Inköpsordrar mot supplier_connections, leveranstider returneras, Christoffer ser "Material: 2 dagar för leverans".
- **Synlighet:** Projekt-detail-page får material-status-strip.
- **Beroenden:** `supplier_connections`-schema finns men inga aktiva integrationer. Beachtock/Bauhaus/Byggmax-API:er.
- **Estimat:** 2-3 veckor (per supplier).
- **Strategiskt:** Logistik är handgripligt smärtområde. Värdet är stort men beroendet av extern integration är fördröjande.

#### B5. Voice-chat med agenterna i mobilen

- **Trigger:** Christoffer trycker på mikrofon i agent-chat-modalen.
- **Aktör:** Vilken agent som matchar bäst (orkestreras av Matte).
- **Output:** Talad konversation. "Hej Karin, har Andreas betalat?" → "Ja, betalningen kom in igår 14:23, 12 500 kr."
- **Synlighet:** Direkt i agent-chat.
- **Beroenden:** Whisper STT (finns). TTS (saknas — ElevenLabs eller liknande). Conversation memory (finns delvis via memory-systemet).
- **Estimat:** 1-2 veckor.
- **Strategiskt:** Detta är hands-free i bilen / på bygget. Mer värde än text-chat eftersom Christoffer är upptagen med händerna.

### C. Future state (förutsätter saker som inte finns)

#### C1. Skatteverket ROT-ansökan via API

- **Trigger:** Invoice skickad med ROT-rader + customer.personal_number satt.
- **Aktör:** Karin med ny `submit_rot_application`-tool.
- **Output:** Auto-ansökan, status-tracking, notifiera när godkänd.
- **Beroenden:** Skatteverkets API (kräver F-skatt-registrering + technical integration). Stor compliance-byggsten.
- **Estimat:** 4-6 veckor inkl. compliance.
- **Strategiskt:** Hantverkare som inte kämpar med ROT-ansökan = direkt-värde. Konkurrenter har detta = paritet.

#### C2. Drone-input för hembesök ("filma badrummet, Daniel föreslår offert")

- **Trigger:** Christoffer filmar 60-sek-video på hembesök, laddar upp.
- **Aktör:** Vision-model parsar video, Daniel föreslår offert baserat på storlek + ytor.
- **Output:** Quote-utkast med ROT-rader, åtgärds-rader, material-uppskattning.
- **Beroenden:** Vision-API (Claude 4 har det). Yt-mätning från video (osäker). Schema för rumstyp-→ standard-jobb-mall (finns delvis i `job_templates`).
- **Estimat:** 1-2 månader för v1.
- **Strategiskt:** Demo-magnet. "Du behöver inte skriva — bara filma." Vid lyckade demos blir det säljkrok.

#### C3. Auto-projektledning för komplexa flerstegs-projekt

- **Trigger:** Quote signerad med > 3 milestones.
- **Aktör:** Lars med utökade tools för dependency-tracking, resource-allocation, supplier-koordinering.
- **Output:** Auto-genererat Gantt-schema med kritisk väg, materialleveranser timade.
- **Beroenden:** Materialbeställnings-integration (B4). Mer sofistikerat scheduling-system. Resource-tabell.
- **Estimat:** 3-6 månader.
- **Strategiskt:** Lockar större kunder (BRF, kommersiella) som idag är för komplexa för Handymate.

#### C4. Proactive customer success (Karin/Hanna kombo)

- **Trigger:** Mönsterigenkänning över alla businesses: "din kund-portfölj liknar X andra hantverkare, de fick 20% mer återkommande kunder med Y-beteende".
- **Aktör:** Matte aggregate + agenter på business-nivå.
- **Output:** Strategiska insights i dashboard. "Föreslår 3 saker du borde göra denna månad."
- **Beroenden:** Data-mass över många businesses (inte i pilot-fas än). Mer mogen learning_events-loop.
- **Estimat:** 6-12 månader.
- **Strategiskt:** Plattforms-effekt — fler kunder = smartare insights. Konkurrenten-moat.

#### C5. Inbound webform → fullt automatiserad första-kontakt-bokning

- **Trigger:** Webform på Christoffers hemsida.
- **Aktör:** Lisa.
- **Output:** Direkt-svar: "Tack Andreas, jag kan boka hembesök torsdag 14:00 eller fredag 09:00 — vilket passar?". Auto-bokning + Google Calendar.
- **Beroenden:** Embed-widget på externa hemsidor (finns delvis i `website-widget.sql`). Conversation-state-machine. Calendar-API.
- **Estimat:** 2-3 veckor.
- **Strategiskt:** "Hantverkare som svarar inom 30 sek" — bryter den traditionella "ring nästa vecka"-cykeln. Massiv konverteringsfördel.

---

## Del 5 — Gap-analys + ärlighet

### Vad i systemet är "mockup-state" eller används aldrig?

`FAKTA`:

- **Lisa har `training: true`** i koden — sannolikt mindre aktiv än övriga 5.
- **Dev-agenterna** (agents.yml) är pausade sedan 2026-05-06.
- **GitHub-Actions-pipelinen för dev-agenter** kostade mer än den gav (Andreas reson).

`TOLKNING` baserat på vad jag SETT av automation-volym:

- **Hanna's nurture-system** har cron-routes men jag har inte verifierat att nurture_steps-tabellen är aktivt populerad i pilot.
- **Voice-pipeline** för inkommande samtal — koden finns (`transcribe`, `analyze`, `execute`) men jag har inte verifierat antal samtal/vecka i pilot.
- **Gmail-lead-import** — kräver att pilotkunden kopplar Gmail, vilket är icke-trivialt. Vet inte hur många av piloterna som faktiskt har det aktiverat.
- **Fortnox-sync** — kör var 2:e timme, men förutsätter att piloten har Fortnox kopplat. Pilotvolymen där är låg `TOLKNING`.
- **Partners-webhook** — verifierat finns, men ingen aktiv partner-integration kör volym idag `TOLKNING`.
- **Project-health-cron** (mån 06 UTC) — bra koncept, oklart om Lars rapport används av Christoffer i vardagen.
- **Generate-insights-cron** (sön 06 UTC) — Matte producerar 3-5 insights/business via Claude. Bra koncept men oklart hur dessa exponeras i UI (TeamActivityStrip? Egen flik?).

### Vad krävs för att position "UI är överflödigt" ska bli verklig?

1. **Voice-først UX:** Christoffer måste kunna prata med agenterna utan att öppna en skärm. Idag är agent-interaktion text-baserad via chat-modal. → Beroende: B5 (voice-chat med agenterna) + TTS.

2. **Email-inbox automatiskt hanterad:** Hantverkares hjärt-smärta är email-inboxen. Idag pollar vi Gmail för leads men inte för faktura-frågor, leverantörs-offerter, kund-klagomål. → Beroende: B3.

3. **Materialbeställning utan friktion:** Christoffer ringer fortfarande Bauhaus själv. → Beroende: B4 (supplier-integrationer).

4. **ROT-ansökan automatisk:** Den enskilt mest hatade processen. → Beroende: C1 (Skatteverkets API).

5. **Notifiering-modell mogen:** Today är notiser fattiga ("ny approval"). De behöver vara rika ("Karin föreslår: skicka påminnelse till Andreas — han har 12 500 kr förfallna 8 dagar — godkänn?"). → Beroende: A5 + bättre PWA push-templates.

6. **Approval-flödet måste bli vana:** Approvals visas i `/dashboard/approvals` men hantverkaren behöver troligen en "approve all reasonable" eller "auto-approve under 5000 kr"-funktion. → Beroende: Trust-trösklar per agent + per kategori.

7. **Conversation memory över sessions:** Idag lever conversations i agent-chatten. Men "Karin, kommer du ihåg vad vi pratade om förra veckan?" kräver persistent memory. → Memory-systemet finns men oklart hur djup retrieval-loopen är. Sannolikt brist.

8. **Multi-business-learning:** För "UI är överflödigt" krävs att agenterna lär från ALLA businesses, inte bara Christoffer. Compliance-fråga (GDPR) men strategiskt centralt. → Beroende: C4.

### Min sammanfattande bild

`TOLKNING` — det här är min bedömning, ifrågasätt:

**Det Handymate-systemet HAR är imponerande:** 17 aktiva cron-routes, 6 namngivna agenter med 29 tools, full webhook-pipeline för SMS + samtal + Stripe + partners, end-to-end ÄTA → invoice-flöde (Track C). 4 DB-triggers för auto-derived data. Modell-routing som balanserar kvalitet/kostnad.

**Det som SAKNAS för "UI är överflödigt"-positionen:**

1. **Voice-output** — TTS saknas helt. All agent-kommunikation är text.
2. **Outbound voice** — Lisa kan svara på inkommande samtal men kan inte själv ringa upp.
3. **Email-classification beyond leads** — inkommande email som inte är leads har ingen agent.
4. **Materialbeställning** — schema finns, integrationer saknas helt.
5. **ROT API** — saknas.
6. **Proaktiva nudges** — agenterna reagerar mest på events, inte föreslår proaktivt baserat på trender.
7. **Cross-business-learning** — varje business kör i isolation.
8. **Auto-pipeline från lead till offert till booking** — finns som disparate tools men ingen agent kör hela kedjan autonomt.

**Min rekommendation för 1-3 månader:** Bygg A1, A2, A3, A4, A5 (alla quick wins, alla mätbart värdefulla, alla mindre än 1 vecka var). Då har Christoffer ett system där agenterna börjar producera synligt arbete varje dag, vilket bygger trust för B-bucket.

**För 3-6 månader:** B1 (voice-callback), B2 (lead→offert-pipeline), B3 (email-parsing utöver leads), B5 (voice-chat). Då bryts text-UI-beroendet.

**För 6-12 månader:** C1 (ROT API), C2 (drone-video-input), B4 (supplier-integrationer). Då är positionen "AI gör jobbet" trovärdig för publik launch.

---

## Bilaga: filer + tabeller som refererats

**Agent-kod:**
- [lib/agents/team.ts](handymate-dashboard/lib/agents/team.ts) — TEAM-konstant, 6 agenter
- [lib/agents/personalities.ts](handymate-dashboard/lib/agents/personalities.ts) — system-prompts per agent
- [lib/agents/memory.ts](handymate-dashboard/lib/agents/memory.ts) — memory pipeline
- [app/api/agent/trigger/route.ts](handymate-dashboard/app/api/agent/trigger/route.ts) — trigger-endpoint
- [app/api/agent/trigger/tool-definitions.ts](handymate-dashboard/app/api/agent/trigger/tool-definitions.ts) — 29 tools
- [app/api/agent/trigger/system-prompt.ts](handymate-dashboard/app/api/agent/trigger/system-prompt.ts) — gemensam system-prompt

**Cron-routes:** [app/api/cron/*](handymate-dashboard/app/api/cron) — 17 routes, schema i [vercel.json](handymate-dashboard/vercel.json)

**Workflows:** [.github/workflows/agents.yml](.github/workflows/agents.yml) (PAUSAD), [.github/workflows/playwright.yml](.github/workflows/playwright.yml) (PAUSAD)

**Webhooks:**
- [app/api/sms/incoming/route.ts](handymate-dashboard/app/api/sms/incoming/route.ts)
- [app/api/voice/incoming/route.ts](handymate-dashboard/app/api/voice/incoming/route.ts)
- [app/api/billing/webhook/route.ts](handymate-dashboard/app/api/billing/webhook/route.ts)
- [app/api/partners/webhook/route.ts](handymate-dashboard/app/api/partners/webhook/route.ts)

**SQL:**
- [sql/agent_tables.sql](handymate-dashboard/sql/agent_tables.sql) — agent_runs
- [sql/v2_pending_approvals.sql](handymate-dashboard/sql/v2_pending_approvals.sql) — approvals
- [sql/v3_automation_rules.sql](handymate-dashboard/sql/v3_automation_rules.sql) — automation-regler
- [sql/v3_seed_rules.sql](handymate-dashboard/sql/v3_seed_rules.sql) — 10 system-regler per business
- [sql/v3_automation_logs.sql](handymate-dashboard/sql/v3_automation_logs.sql) — kör-historik
- [sql/v10_ata.sql](handymate-dashboard/sql/v10_ata.sql) — ÄTA + trigger

**UI:**
- [app/dashboard/agent/page.tsx](handymate-dashboard/app/dashboard/agent/page.tsx) — agent-dashboard
- [app/dashboard/approvals/page.tsx](handymate-dashboard/app/dashboard/approvals/page.tsx) — approval-flöde
- [components/TeamActivityStrip.tsx](handymate-dashboard/components/TeamActivityStrip.tsx) — hemskärm-strip
