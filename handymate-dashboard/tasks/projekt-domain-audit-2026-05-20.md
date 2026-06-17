# Projekt-domän-audit — Handymate

**Datum:** 2026-05-20
**Syfte:** Faktainsamling inför konsolidering av projekt-flödet. Ingen kod, bara nulägesbild.
**Metod:** Två parallella Explore-agenter mot SQL-migrationer (`sql/v*.sql`), type-definitioner (`lib/types/`), och API-routes som hanterar konverteringar och stage-advance.

---

## 1. Tabell-relations-karta

```
                  ┌─────────────┐
                  │   leads     │
                  └──────┬──────┘
                         │  (ingen FK)        ◀── BRYTPUNKT 1
                         ▼
┌──────────┐    ┌─────────────┐    ┌──────────────┐
│ customer │◀───│    deal     │───▶│    quote     │
└──────────┘    │             │    │              │
                │ stage_id ───┼───▶│ pipeline_st. │
                │ quote_id    │    │              │
                │ order_id    │    │ deal_id ─────┼─── BIDIREKTIONELL
                └──────┬──────┘    │ quote_items  │     ✅ OK
                       │           └──────┬───────┘
                       │                  │
                       ▼                  ▼
                 ┌─────────────────────────────┐
                 │         project             │
                 │  deal_id  (v17_deal_flow)   │
                 │  quote_id (projects.sql)    │
                 │  current_workflow_stage_id ─┼─▶ project_workflow_stages
                 │  workflow_stage_history     │     (8 system-stages,
                 │     (JSONB array, ej tabell)│      hardcoded ps-01…ps-08)
                 └─────────┬───────────────────┘
                           │
        ┌──────────────────┼──────────────────────┐
        ▼                  ▼                      ▼
   ┌─────────┐      ┌────────────┐        ┌─────────────────┐
   │ booking │      │ time_entry │        │ project_change  │
   │(=sched_ │      │ project_id │        │ (ÄTA)           │
   │ entry)  │      │ booking_id │        │ project_id      │
   └─────────┘      └──────┬─────┘        └─────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   invoice    │
                    │              │
                    │ quote_id     │ ✅ OK
                    │ NO project_id│ ◀── BRYTPUNKT 2
                    │ items: JSONB │     (ingen normaliserad
                    └──────────────┘      invoice_items-tabell)
```

### Nyckel-FK per tabell

| Tabell | PK | FK ut | Saknas / nullable |
|---|---|---|---|
| `leads` | `lead_id` | `customer_id` (efter konvertering) | — |
| `deal` | `id` | `business_id`, `customer_id`, `quote_id`, `order_id`, `invoice_id`, `stage_id` | **saknar `lead_id`** |
| `quote` | `quote_id` | `business_id`, `customer_id`, `deal_id` | — |
| `quote_items` | `id` | `quote_id` CASCADE, `business_id` | — |
| `project` | `project_id` | `business_id`, `customer_id`, `quote_id`, `deal_id`, `current_workflow_stage_id` | — |
| `invoice` | `invoice_id` | `business_id`, `customer_id`, `quote_id`, `credit_for_invoice_id` | **saknar `project_id`** |
| `time_entry` | `time_entry_id` | `business_id`, `project_id`, `milestone_id`, `booking_id`, `customer_id`, `invoice_id` | `booking_id` pekar på `schedule_entry` men ingen explicit FK-deklaration |
| `schedule_entry` (= booking) | `id` | `business_id`, `business_user_id`, `project_id`, `created_by` | — |
| `project_change` | `change_id` | `business_id`, `project_id` | — |
| `project_workflow_stages` | `id` (text, t.ex. `ps-01`) | `business_id` (NULL för system-stages) | — |
| `project_stage_automations` | `id` | `stage_id`, `business_id` | — |
| `deal_flow` | `id` | `business_id`, `deal_id` | — |
| `deal_flow_log` | `id` | `business_id`, `deal_id` | — |

---

## 2. ID-kedjan: lead → deal → offert → projekt → faktura

| Övergång | Status | FK-kolumn | Kommentar |
|---|---|---|---|
| **lead → deal** | ❌ BRUTEN | — | Ingen `deal.lead_id`. Leads konverteras till customer (`leads.customer_id`), men deal har bara `customer_id`. Lead-spår förloras. |
| **deal → quote** | ✅ OK | `deal.quote_id` + `quote.deal_id` | Bidirektionell. `v38_quote_deal_link.sql` la till `quote.deal_id`. |
| **deal → project** | ✅ OK | `project.deal_id` | `v17_deal_flow.sql`. POST `/api/projects` med `from_deal_id` hämtar dealen och kopierar data. |
| **quote → project** | ✅ OK | `project.quote_id` | POST `/api/projects` med `from_quote_id`. Budget och milestones härleds från quote (se sektion 3). |
| **project → invoice** | ❌ BRUTEN | — | `invoice` saknar `project_id`-kolumn. Fakturan vet INTE vilket projekt den tillhör. |
| **quote → invoice** | ✅ OK | `invoice.quote_id` | `/api/invoices/from-quote` mappar `quote.items` (JSONB) → `invoice.items` (JSONB). |

### Brytpunkt 1: lead → deal

- **Konsekvens:** Omöjligt att fråga "vilka deals kom från lead X" utan att gå via customer (osäker mapping om kunden har flera leads/deals).
- **Trail-loss:** Lead-attribution (källa: Bytbil, Hemnet, manuell) försvinner när dealen skapas.

### Brytpunkt 2: project → invoice

- **Konsekvens:** Omöjligt att direkt fråga "alla fakturor för projekt X". Faktura kopplas tillbaka indirekt via `time_entry.project_id` (om tidsraderna är fakturerade) eller via `quote.quote_id → invoice.quote_id` (om fakturan skapades från offert).
- **Workaround i kod:** `/api/invoices/from-project?project_id=xxx` aggregerar `time_entry` + `project_material` per projekt och skapar invoice — men `project_id` sparas INTE på den skapade fakturan.
- **Riskscenarier:**
  - Delfaktura + slutfaktura + ÄTA-faktura för samma projekt → tre fakturor som inte kan grupperas i SQL.
  - Karin/Lars marginal-analys per projekt blir omöjlig att joina utan att gå genom flera tabeller.

---

## 3. Offert → projekt-konvertering

**Källa:** `app/api/projects/route.ts` rad 236-398 (`from_quote_id`-blocket).

### Vad följer med

| Data | Behandling |
|---|---|
| `quote.quote_id` | ✅ Sparas som `project.quote_id` |
| `quote.customer_id` | ✅ Ärvs |
| `quote.items` (labor-rader) | ⚠️ Aggregeras till `project.budget_hours` + delvis till milestones |
| `quote.items` (totalsumma) | ⚠️ Aggregeras till `project.budget_amount` |
| `quote.items` (individuella rader) | ❌ Kopieras EJ till projektet som rader |
| `quote_items` (normaliserad tabell) | ❌ Läses inte alls i konverteringen |

### Hur det fungerar

- Rad 277-279: labor-timmar summeras från `quote.items.filter(i => i.type === 'labor')`.
- Rad 281-284: total kopieras till `budget_amount`, hours till `budget_hours`.
- Rad 375-398: om `create_milestones !== false`, skapas en `project_milestone` per labor-item (titel + budget). Material-rader skapas INGA milestones för.
- Quote-raderna stannar kvar i sin egen tabell — projektet refererar bara till `quote_id`.

### Vad som tappas

- **Material-rader från offerten finns inte på projektet alls.** När hantverkaren ska göra inköp finns ingen referens till "offerten lovade dessa varor" — `project_material` är en separat list som fylls manuellt.
- **Detaljerad radnivå.** Projektets budget är en aggregerad siffra (`budget_amount`). När fakturering sker via tidregistrering + material vet ingen längre "var det här jobbet vi lovade i offerten?".
- **Standard-textblock** (`introduction_text`, `not_included`, `ata_terms`) följer inte med — kunden kan inte se "vad lovades" på projektsidan.

### Dubbel-lagring (latent bugg)

`quote.items` (JSONB legacy) och `quote_items` (normaliserad tabell) finns BÅDA. Migration `quote_overhaul.sql` rad 115-158 kopierar JSONB → tabell endast om tabellen är tom. Olika API-routes läser från olika ställen:

- `/api/invoices/from-quote` rad 38: läser `quote.items` (JSONB).
- Quote-edit-UI: läser `quote_items` (tabell).

Divergens-risk vid uppdateringar. Loggat tidigare som tech-debt.

---

## 4. Budget-modellen

### Vad finns på `project`

| Kolumn | Typ | Källa | Tar emot |
|---|---|---|---|
| `budget_hours` | NUMERIC | quote-konvertering (labor-rader) | **INTÄKTS-relaterad** — uppskattning av timmar i offerten |
| `budget_amount` | NUMERIC | quote-konvertering (totalsumma) | **INTÄKTS-relaterad** — vad offerten lovar i kr |
| `progress_percent` | INTEGER | manuell input | — |
| `actual_hours` | (inte kolumn) | beräknas on-the-fly i `/api/projects` | aggregerad från `time_entry.duration_minutes` |
| `actual_amount` | (inte kolumn) | beräknas on-the-fly | `time_entry.hourly_rate × hours` |
| `uninvoiced_hours` | (inte kolumn) | beräknas on-the-fly | `time_entry` där `invoiced = false` |
| `actual_labor_cost` | NUMERIC (kolumn finns) | **oklart hur den fylls** | förväntas summa kostnader för arbete |
| `actual_material_cost` | NUMERIC (kolumn finns) | **oklart hur den fylls** | förväntas summa material-kostnader |
| `profitability_status` | TEXT (kolumn finns) | **oklart hur den fylls** | förväntas "healthy" / "at_risk" / "loss" |

### Begränsningar

**`budget_amount` kan ta emot INTÄKTER (offertsumma), men det finns ingen separat `actual_revenue`-kolumn.** Faktisk intäkt = summan av alla fakturor som är `status='paid'` för projektet — men eftersom `invoice.project_id` saknas kan man inte SQL-joina dem direkt.

**`actual_labor_cost` och `actual_material_cost` existerar som kolumner men det är oklart vem som uppdaterar dem.** Lars och Karin förlitar sig på dessa för marginal-analys (`margin% = (budget_amount − (actual_labor_cost + actual_material_cost)) / budget_amount`), men det finns inget tydligt sync-jobb från `time_entry` eller leverantörs-faktura-tabellen som uppdaterar dem.

**Det som saknas för full intäkt-vs-kostnad-vs-marginal-vy:**

1. `invoice.project_id` → så att fakturasumma per projekt kan summeras direkt.
2. Sync-mekanism: `time_entry` → `project.actual_labor_cost` (cron eller trigger).
3. Sync-mekanism: leverantörsfaktura/material-inköp → `project.actual_material_cost`.
4. Separat `actual_revenue` (fakturerat) och `paid_revenue` (betalt) för att hantera långa betalningstider.
5. ÄTA-summor: `project_change` har egna `amount` och `hours`. Dessa läggs INTE automatiskt till `project.budget_amount` när signerade — total-vyn i frontend räknar ihop dem on-the-fly. Risk för fel om någon glömmer.

---

## 5. Stage → handling

### De 8 system-stages (hardcoded i `v39_project_stages.sql`)

| Pos | ID | Namn |
|---|---|---|
| 1 | `ps-01` | Kontrakt signerat |
| 2 | `ps-02` | Startmöte bokat |
| 3 | `ps-03` | Jobb påbörjat |
| 4 | `ps-04` | Delmål uppnått |
| 5 | `ps-05` | Slutbesiktning |
| 6 | `ps-06` | Faktura skickad |
| 7 | `ps-07` | Faktura betald |
| 8 | `ps-08` | Recension mottagen |

### Vad triggas vid stage-advance

**Källa:** `lib/project-stages/automation-engine.ts` rad 37-180.

- `advanceProjectStage()` uppdaterar `project.current_workflow_stage_id` + `workflow_stage_entered_at` + appendar till `workflow_stage_history` (JSONB).
- `logProjectStageEvent()` skriver en rad i `v3_automation_logs` med `agent_id: 'lars'` och `trigger_type: 'project_stage_change'`.
- `triggerStageAutomations()` kör per-stage-automationer från `project_stage_automations`-tabellen om de finns, annars fallback till `runDefaultAutomations()`.

### Default-automations per stage

| Stage | Default-action |
|---|---|
| `ps-01` CONTRACT_SIGNED | SMS till kund: "mottagit signerad offert" |
| `ps-02` MEETING_BOOKED | — (ingen) |
| `ps-03` JOB_STARTED | SMS: "vi har startat arbetet" |
| `ps-04` MILESTONE_REACHED | — |
| `ps-05` FINAL_INSPECTION | — |
| `ps-06` INVOICE_SENT | — |
| `ps-07` INVOICE_PAID | SMS: "tack för betalning" + schemalägg `review_request` (+3 dagar) |
| `ps-08` REVIEW_RECEIVED | Schemalägg `yearly_followup` (+365 dagar) |

### Implementerade action-typer

- `send_sms` — enda implementerade.
- Kommentar i koden (rad 330): "Fler action_types kan läggas till här (`create_booking`, `send_invoice` etc)" — **saknas alla**.

### Är de 8 faserna meningsfulla eller kosmetiska?

**Delvis meningsfulla:** stages 1, 3, 7, 8 har faktiska automation-actions. Stages 2, 4, 5, 6 är **kosmetiska** — de existerar för visuell tidslinje men gör ingenting när man avancerar till dem.

**Specifikt:** `INVOICE_SENT` (ps-06) är märkligt — det finns ingen `autoCreateInvoice`-action när man avancerar dit. Hantverkaren förväntas själv skapa fakturan, sedan manuellt advance:a. Symmetri-brott: stage 1 skickar SMS automatiskt men stage 6 gör inget.

**Säkerhet (NY 2026-05-20):** Tidigare kördes `executeAutomation()` direkt med `delay_hours=0` utan godkännande → SMS skickades till kund utan 4-eyes. Fix-commit `19ded63a` routar nu ALLA automations genom `pending_approvals`. `executeAutomation` är deprecated.

### Parallella state-machines (latent förvirring)

- `deal.stage_id` (pipeline-stage) — pipeline-vyn.
- `deal_flow.current_step` (TEXT) — E2E-tracking.
- `project.current_workflow_stage_id` (workflow-stage) — projekt-tidslinje.
- `project.status` (planning/active/completed/cancelled) — high-level status.

Fyra parallella tillstånd för en deal som blir projekt. `app/api/projects/route.ts` rad 579-597 försöker synka deal→"invoiced" när project blir completed, men det är non-blocking och kan tyst misslyckas.

---

## 6. Lars-perspektiv: vad han läser och varför marginal-analys är blockerad

**Källa:** `lib/agents/lars/observation-prompt.ts` rad 159 (`buildLarsAggregate`).

### Vad Lars LÄSER (90-dagars-fönster)

| Tabell | Kolumner | Använd till |
|---|---|---|
| `project` | `project_id, name, status, budget_hours, budget_amount, actual_hours, actual_labor_cost, actual_material_cost, profitability_status, completed_at` | Scope-creep, marginal, projekt-storlek |
| `booking` | `booking_id, status, scheduled_start, project_id` | Booking-completion-rate |
| `project_change` | `change_id, status, total, change_type, signed_at, sent_at, declined_at, project_id` | ÄTA-pipeline (sign-rate, pending) |

### Vad Lars INTE läser

- `time_entry` (rader) — bara aggregerad `project.actual_hours` används.
- `supplier_invoice` (leverantörsfakturor) — bara aggregerad `project.actual_material_cost` används.
- `project_material` (inköpta material) — saknas helt.
- `quote_items` (offert-rader) — saknas.
- `invoice` — saknas (Karin läser invoice, Lars gör det inte).

### Varför marginal-analys är "blockerad"

Lars marginal-formel (`(budget_amount − (actual_labor_cost + actual_material_cost)) / budget_amount`) kräver att `actual_labor_cost` och `actual_material_cost` är POPULERADE.

**Men:** dessa kolumner existerar på `project`-tabellen utan att det finns ett tydligt sync-jobb som fyller dem. Förmodade källor:

- `time_entry.duration_minutes × hourly_rate` borde aggregeras till `actual_labor_cost`.
- `supplier_invoice.total_amount` eller `project_material.cost_amount` borde aggregeras till `actual_material_cost`.

Om dessa kolumner är NULL eller stale ser Lars antingen tom data eller fel marginal. Han kan inte själv beräkna marginalen från grundkällorna eftersom han inte läser dem.

**Karin (ekonomi-agent) har det enklare:** hon läser `invoice.total` direkt. För Karin är intäkt = summa av paid invoices. Lars saknar denna direktkanal eftersom invoice → project-kopplingen är bruten (brytpunkt 2).

### Vad Lars konkret behöver

1. **`invoice.project_id`** — så Lars kan summera fakturerat per projekt utan att gå via `quote_id` (som inte täcker delfakturor och ÄTA-fakturor som skapas separat).
2. **Sync-job (cron eller trigger):** `time_entry` → `project.actual_labor_cost` rebuilt regelbundet.
3. **Sync-job:** `supplier_invoice` + `project_material` → `project.actual_material_cost`.
4. **Alternativt:** Lars-aggregation läser `time_entry` och `supplier_invoice` direkt istället för att förlita sig på snapshot-kolumner.

---

## 7. De 17 sidebar-tabsen på projekt-detaljsidan

**Källa:** `app/dashboard/projects/[id]/page.tsx` rad 1660-1688 (`tabGroups`).

### Datakälla per tab

| Grupp | Tab | Datakälla / state | Tabell |
|---|---|---|---|
| ÖVERSIKT | overview | `/api/projects/[id]` | `project` (snapshot) |
| | economy | `/api/projects/[id]/profitability` | aggregat: `project` + `time_entry` + `supplier_invoice` + `project_change` |
| | ai_log | `/api/projects/[id]/ai-log` | `v3_automation_logs` + `business_knowledge` |
| PLANERING | schedule | `/api/bookings` | `schedule_entry` |
| | milestones | state (setProjectMilestones) | `project_milestone` |
| | changes | state (setProjectChanges) | `project_change` |
| | tasks | `/api/tasks?project_id=…` | `task` |
| FÄLT | arbetsorder | state (setWorkOrders) | `work_order` |
| | time | state (setTimeEntries) | `time_entry` |
| | field_reports | `<FieldReportsTab />` | `field_report` |
| | checklists | state (setFormSubmissions) | `form` + `form_submission` |
| | canvas | state (setCanvasLayers) | `canvas_layer` |
| RESURSER | team | `/api/projects/[id]/team` | `project_assignment` |
| | material | state (setProjectPriceList) | `project_price_list` |
| | leverantorer | state (setSupplierInvoices) | `supplier_invoice` |
| DOKUMENTATION | documents | `/api/projects/[id]/documents` | `project_document` |
| | log | `/api/projects/[id]/logs` | `project_log` |

### Egen data vs vy

| Typ | Tabs |
|---|---|
| **Egen tabell** (CRUD) | milestones, changes, tasks, arbetsorder, time, field_reports, checklists, canvas, team, material, leverantorer, documents, log, schedule (egen tabell `schedule_entry`) |
| **Aggregat-vy** | overview (project-snapshot + widgets), economy (joinar 4 tabeller), ai_log (logg + knowledge) |

### Konsoliderings-kandidater när data kopplas

**A. "Tasks" + "Milestones" + "Arbetsorder" — tre namn på samma sak**

- `task` = arbetsuppgift med assignee/due_date/status.
- `project_milestone` = delmoment med budget+progress.
- `work_order` = instruktion till personal med scheduled_date/materials_needed/checklista.

Tre separata tabeller med överlappande syfte. Hantverkaren ser tre tabs där det borde vara en. Konsolideringskrav: en "arbete att utföra"-tabell med flagga för typ (uppgift / delmoment / arbetsorder) eller subtyper.

**B. "Schedule" + "Time" — planerat vs utfört**

- `schedule_entry` (= booking) = planerad tid.
- `time_entry` = loggad tid.

Båda hör till "fält-tidsadministration". Naturlig sammanslagning: en kalendervy med både planerade och utförda pass, där man kan stämpla in/ut direkt på planerade pass.

**C. "Material" + "Leverantörer" — inköpsdelen**

- `project_price_list` = vad hantverkaren PLANERAR att använda (med kalkyl-pris och påslag).
- `supplier_invoice` = vad som FAKTISKT köptes med kvitto.

Två parallella material-system utan koppling. Konsolideringskrav: en "material"-tabell med "planerat" → "inköpt" → "använt på projekt" → "fakturerat kund".

**D. "Checklists" + "Field reports" — fältdokumentation**

- `form_submission` = ifylld checklista (med signatur).
- `field_report` = foto-/observationsrapport från fältet.

Två separata system för "hantverkaren dokumenterar pågående arbete". Kan slås ihop till en "fältdagbok" där varje inlägg är antingen en checklista eller en foto-/text-observation.

**E. "Documents" + "Log" + "Byggdagbok"**

- `project_document` = uppladdade filer (foton, ritningar, kontrakt).
- `project_log` = byggdagboksanteckningar (work_performed, materials_used, weather, workers_count).

Båda är dokumentation. Kan vara separata tabs men sannolikt tighter integration: byggdagboks-inlägg kan ha bifogade dokument.

**F. "Economy" är ett aggregat som lider av brytpunkterna**

`economy`-tabben läser från fyra tabeller (project + time_entry + supplier_invoice + project_change) och visar marginal. Eftersom `invoice.project_id` saknas och `actual_*`-kolumnerna inte tydligt synkas, är denna vy bara så bra som datakvaliteten i `project.actual_*`-snapshots. Samma svaghet som Lars marginal-analys.

### Sammanfattning konsolideringspotential

- **17 tabs idag** → realistisk konsolidering: **9–11 tabs** om backend-datamodellen rensas.
- Största vinsten: slå ihop tasks/milestones/arbetsorder + schedule/time + material/leverantorer.
- Kräver datamigreringar och stora UI-omskrivningar — inte UI-polish-arbete.

---

## 8. Sammanfattning: vad som behöver fixas för att kedjan ska hänga ihop

### Brutna FK som bör adresseras

1. **`deal.lead_id`** — så lead-attribution följer med (källa: Bytbil/Hemnet/manuell).
2. **`invoice.project_id`** — så fakturor kan grupperas per projekt; krävs för marginal-analys.
3. **`time_entry.booking_id`** — säkerställ att den faktiskt pekar på `schedule_entry.id` (formell FK).

### Dubbel-lagring att rensa

1. `quote.items` (JSONB) ↔ `quote_items` (tabell) — välj en, migrera resten.
2. `invoice.items` (JSONB only) — normalisera till `invoice_items`-tabell.
3. `project.workflow_stage_history` (JSONB) — överväg `project_stage_history`-tabell för query:bar historik.

### Sync som saknas

1. `time_entry` → `project.actual_labor_cost` (regelbunden aggregation).
2. `supplier_invoice` / `project_material` → `project.actual_material_cost`.
3. ÄTA-`project_change.amount` → påverka `project.budget_amount` när signerad (eller införa separat `revised_budget_amount`).

### Stage-handling-luckor

- `ps-06` INVOICE_SENT, `ps-04` MILESTONE_REACHED, `ps-05` FINAL_INSPECTION saknar default-automations. De är visuella men handlingslösa.
- `ps-06` borde realistiskt trigga `create_invoice` (med approval) — finns inte alls idag.

### Lars-beroenden att fylla

För att marginal-analys ska fungera tillförlitligt behöver minst en av:

- Sync-jobb som håller `project.actual_*` aktuellt, ELLER
- Lars-aggregator läser direkt från `time_entry` och `supplier_invoice` istället för snapshot-kolumner.

Samt en koppling `invoice.project_id` så fakturerings-läget per projekt syns direkt.

---

## Verifierings-källor

- `sql/v*.sql` (~30+ migrationer) — schemat.
- `lib/types/quote.ts`, `lib/types/invoice.ts` — type-snapshots.
- `app/api/projects/route.ts` rad 236-398 — quote→project-konvertering.
- `app/api/invoices/from-project/route.ts` rad 22-233 — project→invoice-flöde.
- `app/api/invoices/from-quote/route.ts` rad 38-54 — quote→invoice-mapping.
- `lib/project-stages/automation-engine.ts` rad 14-345 — stage-system + automations.
- `lib/agents/lars/observation-prompt.ts` rad 159 (`buildLarsAggregate`) — vad Lars läser.
- `app/dashboard/projects/[id]/page.tsx` rad 1660-1688 + 1986+ — 17-tabs-rendering.
