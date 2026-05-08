# Booking-typ-differentiering — Design-doc

> **Status:** Design-fas. Inga kodändringar gjorda.
> **Validering:** Modellen är diskuterad och godkänd av Andreas + Christoffer (pilot). Inte gissning.
> **Mockups:** [handoff/booking-types/](../handoff/booking-types/) — fem skärmar (3 mobile + 2 desktop)
> **Datum:** 2026-05-08

## 0. TL;DR

Booking-tabellen ska differentiera mellan **projekt-bokningar** (kopplade till ett pågående project, har stage-progress + dag-räkning + sista-dagen-morfning) och **lösa pass** (offertbesök, service, felanmälan — fristående, snabb-stäng).

För att rendera mockuparna behöver vi:
1. **Ny kolumn `booking.project_id`** med FK till `project(project_id)`
2. **Ingen ny kolumn för "dag X av Y"** — det härleds dynamiskt från booking-sekvens per project (Variant B)
3. **"Sista dagen"-detection härledd** från booking-sekvens (sista i ordning = sista dagen). Optional `is_final_day`-override för manuell flagga om Christoffer vill det
4. **Två nya API-fält** på GET /api/bookings: `project` (joinad row) och `project_day` (objekt med `current` + `total`)

Inga av Christoffer's nuvarande pilot-data behöver migreras destruktivt — `project_id` är nullable, gamla bookings förblir "lösa pass".

---

## 1. Audit-resultat (2026-05-08)

### 1.1 `case_record`-tabellen

**Fynd:** Existerar inte i versionsspårade `sql/`-filer. Används bara på ETT ställe i kodbasen ([app/api/actions/route.ts](../app/api/actions/route.ts)) — sannolikt agent-tool som hanterar en separat "case"-konvention från ett tidigt API-experiment.

**Slutsats:** **Inte relevant** för denna design. Booking har redan `customer_id`-koppling direkt, project har `customer_id` direkt. Vi går **inte** via case_record.

### 1.2 Booking-tabellen — current state

**Schema-fil:** Ingen `CREATE TABLE booking` finns i `sql/`-mappen. Tabellen lever bara i prod-DB. ALTER-uppgraderingar i versionsspårade filer:

| Fil | Tillägg |
|---|---|
| [sql/v17_dispatch.sql](../sql/v17_dispatch.sql) | dispatched-fält |
| [sql/v37_booking_google_event_id.sql](../sql/v37_booking_google_event_id.sql) | `google_event_id`, `google_calendar_id` |
| [sql/v38_calendar_realtime.sql](../sql/v38_calendar_realtime.sql) | `synced_from_google_at` |
| [sql/agent_google_integration.sql](../sql/agent_google_integration.sql) | `synced_to_google_at` |
| [sql/v50_booking_on_my_way.sql](../sql/v50_booking_on_my_way.sql) | `on_my_way_at` |

**Kända kolumner (från koden):** `booking_id`, `business_id`, `customer_id`, `scheduled_start`, `scheduled_end`, `notes`, `job_status`, `completed_at`, `customer_rating`, `rating_feedback`, `follow_up_sent`, plus alla ALTER-tillägg.

**`booking.project_id` finns INTE.** Verifierat: inga grep-träffar i `sql/`-mappen. Det är denna design-doc:s största schema-förslag.

> **Tech-debt insight:** Detta är ännu ett exempel på TD-12-mönstret — booking-tabellens grundschema är inte versionsspårat i kodbasen. När Supabase-schemat lever delvis utanför git är drift mellan miljöer ofrånkomligt. Bör adresseras i samma sweep som typed-sync.

### 1.3 Booking ↔ project-länken idag

**Existerar inte.** [app/api/bookings/route.ts](../app/api/bookings/route.ts) GET-handler läser bara `booking` + joinar `customer` via separat fetch. Inget project. Frontend kan inte visa "vilken bokning hör till vilket projekt".

Den enda indirekta länken är via gemensam `customer_id` — du kan se alla bookings för en kund OCH alla projekt för samma kund, men inte att de hör ihop.

### 1.4 Project — finns "antal arbetsdagar"?

**Nej.** Project-tabellen har `start_date`, `end_date`, `budget_hours`, `progress_percent`, `current_workflow_stage_id`, men **ingen kolumn för "expected_days"**. Inga grep-träffar för `expected_days`, `estimated_days`, `total_days`, `days_planned`.

Det betyder mockup-värdet "dag 4/12" måste antingen:
- Härledas dynamiskt (Variant B nedan), eller
- Kräva ny kolumn (Variant A)

---

## 2. Schema-design

### 2.1 Migration: `booking.project_id`

```sql
-- v51_booking_project_link.sql

ALTER TABLE booking
  ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES project(project_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_booking_project
  ON booking(business_id, project_id)
  WHERE project_id IS NOT NULL;

COMMENT ON COLUMN booking.project_id IS
  'Länk till project om bokningen tillhör ett pågående projekt. NULL = lös bokning (offertbesök, service, felanmälan).';
```

**Notera:** FK declared så Supabase nested select fungerar i framtida frontend-queries (motsats till TD-7-pattern på time_entry). `ON DELETE SET NULL` behåller booking om projekt raderas — gör inte projekt-radering destruktiv för historiska bookings.

### 2.2 Optional: `booking.is_final_day` (avvakta tills pilot säger)

```sql
-- INTE i v51 — vänta på Christoffer-feedback om han vill kunna manuellt
-- markera en booking som "sista dagen" av projektet.
ALTER TABLE booking
  ADD COLUMN IF NOT EXISTS is_final_day BOOLEAN DEFAULT false;
```

Skäl att vänta: Variant B (härledd) räcker för 90% av fallen. Manuell override är bara nödvändig om hantverkaren *vet* att en specifik dag är slutbesiktning trots att andra bookings ligger senare i sekvensen (sällsynt).

---

## 3. "Dag X av Y" — datamodell

### Variant A — Manuellt fält `project.expected_days: int`

**För:** Förutsägbart värde. "Dag 4 av 12" stämmer även om hantverkaren bokar om dagar mitt i projektet. Y är låst vid project-skapande.

**Mot:** Kräver manuellt input vid project-skapande. Lätt att glömma. Vad händer om verkligheten avviker från plan (jobbet drog ut till 14 dagar)?

### Variant B — Dynamiskt från booking-sekvens (rekommenderas)

**Beräkning:**
```ts
// För en given booking tillhörande ett project:
const bookings = await supabase
  .from('booking')
  .select('booking_id, scheduled_start')
  .eq('project_id', booking.project_id)
  .eq('business_id', business_id)
  .order('scheduled_start', { ascending: true })

const total = bookings.length
const current = bookings.findIndex(b => b.booking_id === booking.booking_id) + 1
// → { current: 4, total: 12 }
```

**För:** Inget manuellt input. Y följer hantverkarens faktiska schema. Enkelt att implementera (en query per project per render).

**Mot:** Y är dynamiskt — om ny booking läggs till, ändras alla `current/total` för andra bookings. Kan kännas inkonsekvent ("igår var det dag 4/12, idag är det dag 4/13").

### Rekommendation: Variant B med möjligheten att senare addera A

**Skäl:**
1. Variant B kräver ingen manuell input — minskar friktion
2. Mockuparna är skapade utan att Christoffer angett "dag 12" — de visar dynamiskt värde
3. Om pilot säger "Y borde vara stabil": addera Variant A som override (project.expected_days, fallback till `bookings.length`)

**Implementation:**
```ts
function computeDayProgress(bookingId: string, projectBookings: Booking[]): { current: number; total: number } {
  const sorted = [...projectBookings].sort((a, b) =>
    new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()
  )
  const idx = sorted.findIndex(b => b.booking_id === bookingId)
  return {
    current: idx === -1 ? 0 : idx + 1,
    total: sorted.length,
  }
}
```

Det är 6 LOC i en helper. Kallas i GET /api/bookings när responsen byggs.

---

## 4. "Sista dagen"-detection

### Alternativ 1 — `current_day === total_days`

**Faller naturligt ut ur Variant B.** Sista bokningen i sorterad sekvens har `current === total`. Inget extra fält behövs.

### Alternativ 2 — Sista bokningen i sekvens (per project)

Identiskt med #1 vid Variant B-beräkning. Implementation:
```ts
const isFinalDay = computeDayProgress(...).current === computeDayProgress(...).total
```

### Alternativ 3 — Manuell flagga `booking.is_final_day`

För edge cases där hantverkaren vet att DAGEN är sista även om fler bookings ligger senare (t.ex. "slutbesiktning på onsdag, men buffer-bokning på fredag finns ifall").

### Rekommendation: Härledd från sekvens (Alt 1+2), `is_final_day`-override som tech-debt

**Skäl:**
- Härledd version täcker 90% av fallen utan manuellt input
- Lägga till boolean-flagga är 5-min jobb om pilot säger de vill ha det
- Lägga till nu utan validerat behov är overengineering

**Loggas som öppen produktfråga** (ny TD-post) tills Christoffer testar i fält och säger om han saknar manuell flagga.

---

## 5. Mockup-data-mapping

Genomgång av varje fält som visas i mockuparna och varifrån det ska komma.

### 5.1 Hem · Idag (mobile, skärm 1)

| UI-fält | Backend-källa |
|---|---|
| Hälsning ("Hej Magnus") | `business_users.name` (currentUser från `/api/team/me`) |
| Datum ("Måndag 27 april") | Client-side från idag |
| KPI: "5 jobb idag" | `bookings.filter(scheduled_start = today).length` |
| KPI: "7,5h planerat" | `bookings.filter(today).reduce(sum, scheduled_end - scheduled_start)` |
| KPI: "2 projekt" | `unique(bookings.filter(today).project_id).length` (eller `where project_id != null`) |
| Sektion "Projekt idag · 2" | `bookings.filter(today AND project_id != null).length` |
| Projekt-kort: tid + duration | `booking.scheduled_start` / `scheduled_end` |
| Projekt-kort: kund + adress | `booking.customer.name` + `booking.customer.address_line` |
| **Projekt-tag: "Bromma-tak · dag 4/12"** | `booking.project.name` + `computeDayProgress()` (Variant B) |
| **Stage-progress 8 segment** | `booking.project.current_workflow_stage_id` → matcha mot 8 system-stages, color från `project_workflow_stages.color` |
| Task-rad ("Underlagspapp sektor norr") | Detta är en TODO/uppgift för dagen — finns inte än, ny tabell `booking_task`? Eller använda `booking.notes` som fritextstring? **Öppen fråga** |
| Sektion "Lösa pass · 3" | `bookings.filter(today AND project_id IS NULL).length` |
| Lösa pass-kort: kategori-pill ("Offertbesök", "Service", "Felanmälan") | `booking.kind` eller `booking.category`? Finns det fält idag? **Öppen fråga** — kanske från `booking.notes`-parsing eller ny kolumn |

### 5.2 Jobbdetalj · projekt-bokning (mobile, skärm 2)

| UI-fält | Backend-källa |
|---|---|
| Banner-namn ("Bromma-tak") | `booking.project.name` |
| Banner-pill ("Dag 4 av 12") | `computeDayProgress(booking)` |
| Banner-stage ("Stage: Pågående") | `booking.project.current_stage.name` |
| Stage-bar 8 segment | `booking.project.current_workflow_stage_id` (samma som Hem) |
| "Öppna projekt" → | Nav till `/dashboard/projects/<project_id>` (mobile-routes ny) |
| Tid-block "08:00 – 11:00 · 3h" | `booking.scheduled_start` / `scheduled_end` |
| Kund + adress | `booking.customer.name` + `address_line` |
| **"Idag"-task-lista (Underlagspapp...)** | `booking_task` ELLER strukturerad notes ELLER ad-hoc i `booking.notes`? **Öppen fråga** |
| **"Imorgon (dag 5)"-preview** | Nästa booking i sekvens: `bookings.filter(project_id=X AND scheduled_start > booking.end).order(start).first()` plus dess tasks |
| Senaste från Anna | `customer.notes` eller customer-aktivitet? Eller booking-specifik kommentar från kund? **Öppen fråga** — kanske `customer_activity` med typ='customer_message' |
| CTA "Avsluta dagen · Dag 4 → 5" | Knapp som POSTar `/api/booking/complete-job` (existerar) + flytta vidare till nästa booking-detalj |

### 5.3 Jobbdetalj · sista dagen (mobile, skärm 3)

| UI-fält | Backend-källa |
|---|---|
| Sista-dagen-flagga ("SISTA DAGEN") | `computeDayProgress(booking).current === total` |
| Banner-färg morfar till mörkgrön gradient | Frontend rendrar baserat på final-flag (CSS) |
| Banner-pill "Dag 12 av 12" | Samma `computeDayProgress` |
| Stage-bar — alla done utom sista som "current" | Frontend logic: om final-day, anta att sista stage är current |
| Faktura-preview ("152 400 kr inkl moms · ROT 35 600 kr") | Beräkna från `project.budget_amount` + ROT-logik. Befintlig `auto-invoice-on-complete` har redan denna beräkning |
| CTA "Slutför projektet & fakturera" | POST som triggar BÅDE complete-booking OCH `autoInvoiceOnComplete(project)` + `fireEvent('job_completed')` (TD-13 mappar dessa). **Saknas idag på booking-sidan** |

### 5.4 Schema · v.18 (desktop, skärm 4)

| UI-fält | Backend-källa |
|---|---|
| Projekt-lanes (Bromma-tak lila, Hagalund-el amber) | Group `bookings.filter(week)` by `project_id`, render varje group som horisontell lane med projektets stage-färg |
| Per-dag bokning i lane | Booking-rad med `scheduled_start` på rätt dag |
| Tom dag = subtil streck | Render gap där projekt har inga bokningar den dagen |
| Lösa pass-grid under | `bookings.filter(week AND project_id IS NULL)` grupperade per dag |
| Idag-highlight | Frontend rendrar baserat på dagens datum |

### 5.5 Projekt-detalj · bokningar (desktop, skärm 5)

| UI-fält | Backend-källa |
|---|---|
| Stats-strip (dag, tid, material, marginal) | `bookings.length`, `time_entry.duration_minutes` sum, `project_material` sum, beräknad marginal |
| 8-stage timeline med datum | `project.workflow_stage_history` (JSONB med entered_at) + `project_workflow_stages` |
| Bokningstabell per vecka | `bookings.filter(project_id=X)` grupperade per vecka |
| "Pågår" pulsar idag | `booking.scheduled_start <= now < booking.scheduled_end` |
| "Klar"/"Pågår"/"Planerad" status | `booking.job_status` (existerar) eller härlett från tid |

---

## 6. Backend-changes per route

### 6.1 GET /api/bookings — utökas

**Idag:** Returnerar `bookings[]` med customer-join.

**Behöver:**
- Joina `project` när `booking.project_id != null` (nested select fungerar nu eftersom FK declared i v51)
- Lägga till `project_day: { current, total }` per row (computed via Variant B)
- Optional `?include=tasks` query-param om vi addera booking_task-tabellen senare

**Sample respons-shape efter ändring:**
```json
{
  "bookings": [
    {
      "booking_id": "bk_001",
      "scheduled_start": "2026-04-27T08:00:00Z",
      "scheduled_end": "2026-04-27T11:00:00Z",
      "customer": { "customer_id": "...", "name": "Anna Lindqvist", "address_line": "..." },
      "project_id": "proj_bromma",
      "project": {
        "project_id": "proj_bromma",
        "name": "Bromma-tak",
        "current_workflow_stage_id": "ps-03",
        "current_stage": { "id": "ps-03", "name": "Pågående", "color": "#7C3AED", "icon": "🔨", "position": 3 }
      },
      "project_day": { "current": 4, "total": 12 },
      "is_final_day": false,
      "job_status": "scheduled",
      "notes": "Underlagspapp sektor norr"
    }
  ]
}
```

**Effekt på N+1:** Bulk-fetch project_id:s en gång (samma pattern som `/api/projects?include=workflow`). Inte per-booking.

### 6.2 Ny endpoint: `POST /api/booking/complete-and-invoice`

För sista-dagen CTA. Atomisk operation:
1. UPDATE booking SET job_status='completed', completed_at=NOW
2. Anropa `autoInvoiceOnComplete(business_id, project_id)` (kräver `lib/bookings/auto-invoice-on-complete.ts` enligt TD-13)
3. `advanceProjectStage(project_id, 'ps-05' eller 'ps-06')` (slutbesiktning eller faktura skickad)
4. `fireEvent('job_completed')` för nurture/review-request
5. Return `{ success, invoice_id, next_stage }`

**Förutsätter TD-13 är fixad.** Kan inte byggas innan auto-invoice-pattern för booking finns.

### 6.3 GET /api/projects/[id] — utökas med booking-historik

För desktop projekt-detalj-vyn (skärm 5). Returnera bookings grupperade per vecka:

```json
{
  "project": {...},
  "stages": [...],
  "bookings_by_week": [
    { "week": "v.17", "bookings": [...] },
    { "week": "v.18", "bookings": [...] }
  ],
  "stats": {
    "days_used": 4,
    "days_planned": 12,
    "hours_logged": 28,
    "hours_budgeted": 96,
    "material_cost": 42800,
    "margin_percent": 38
  }
}
```

Eller separat endpoint `GET /api/projects/[id]/bookings` om vi vill hålla den befintliga lean.

---

## 7. Stegning

### Etapp 1 — Schema + minimal backend (kan göras direkt)

1. **Migration** [sql/v51_booking_project_link.sql](../sql/v51_booking_project_link.sql) — `booking.project_id TEXT REFERENCES project`. **1 commit, 5 LOC.**
2. **Helper** `lib/bookings/day-progress.ts` med `computeDayProgress(bookingId, projectBookings): { current, total }`. **1 commit, ~15 LOC.**
3. **GET /api/bookings utökas** — joina project (nested select fungerar nu med FK), beräkna `project_day` per row. **1 commit, ~30 LOC.**

**Acceptanstest:** Mobile-Code kan kalla `GET /api/bookings?from=...&to=...` och få bookings med project-data + day-progress. Modell B-rendering (Hem · Idag-skärm 1) blir möjlig.

### Etapp 2 — Sista-dagen-detection

4. **Tillägg på GET /api/bookings:** `is_final_day` (booleskt, derivt från `project_day.current === project_day.total`). **1 commit, ~5 LOC.**

**Acceptanstest:** Mobile kan rendera Modell C-morfning (skärm 3) baserat på `is_final_day` flagga.

### Etapp 3 — Complete-and-invoice (efter TD-13)

5. **Bygg `lib/bookings/auto-invoice-on-complete.ts`** (TD-13). Kräver dedupe-logik mot project-baserad auto-invoice. **2-3h jobb.**
6. **Ny endpoint `POST /api/booking/complete-and-invoice`** — atomic complete + invoice + stage-advance. **1 commit, ~50 LOC.**

**Acceptanstest:** Mobile sista-dagen-CTA (skärm 3) kan trycka och få faktura skapad.

### Etapp 4 — Projekt-detalj-vyn (desktop, skärm 5)

7. **GET /api/projects/[id]/bookings** — separat endpoint, returnera bokningar grupperade per vecka för projekt-detail-view. **1 commit, ~40 LOC.**

**Acceptanstest:** Desktop projekt-vy renderar bokningstabell (skärm 5).

### Etapp 5 — Frontend (mobile + desktop)

Inte detaljerad här — mobile-Code och dashboard-Code implementerar UI:n med ovanstående backend som grund. Inga backend-ändringar i denna etapp.

---

## 8. Öppna frågor till Christoffer

1. **Booking-tasks** ("Underlagspapp sektor norr") — fritextfält per booking, eller egen `booking_task`-tabell med checkbox-status? Mockuparna visar ostrukturerade rader, men "Foto till kund — efter avslut" ser ut som checkpoint. Värt 5 min konversation innan vi väljer schema.
2. **Lösa pass-kategorier** ("Offertbesök", "Service", "Felanmälan") — finns på booking-tabellen idag? Om inte: ny kolumn `booking.kind` med enum, eller hämtas från `booking.notes`-prefix?
3. **"Senaste från Anna"-kommentaren** — speglar kund-meddelande (SMS/email)? Eller något hantverkaren noterat? Påverkar var datat lagras (customer_activity vs booking.notes vs annan källa).
4. **Manuell `is_final_day`-flagga** — behövs för edge cases? Eller räcker härledning från booking-sekvens?
5. **Project.expected_days som override** — vill Christoffer kunna säga "detta projekt är planerat 12 dagar" vid skapande, ELLER nöjer han sig med dynamisk räkning från bokningar?

---

## 9. Risker

- **Hård FK i v51 kan brytas mot orphan-data:** om någon booking pekar på ett raderat project. `ON DELETE SET NULL` skyddar mot framtida case men existerande prod-data kan ha trasiga `project_id`-strängar (om någon hardcodat fältet utan FK). Pre-flight: `SELECT * FROM booking WHERE project_id NOT IN (SELECT project_id FROM project)` — borde vara 0 rader om `project_id` aldrig satts tidigare.
- **Variant B day-counting kan kännas inkonsekvent** för Christoffer om han bokar om dagar mitt i projektet ("igår var jag dag 4/12, idag är jag dag 4/13"). Lös senare med override om problemet uppstår.
- **TD-13 (auto-invoice för booking) blockerar Etapp 3.** Bör inte påverka pilot eftersom Christoffer kan starta med Etapp 1+2 och ha sista-dagen-vyn rendera korrekt visuellt — bara CTA:n är inte fullt funktionell. Frontend kan visa knapp som degraderar till "Markera klar" tills auto-invoice är på plats.
- **Booking.notes som task-lista är fragilt** — om vi senare migrerar till strukturerad `booking_task` måste vi också parsa befintlig notes-data och splitta. Bättre att bestämma format upfront i fråga 1 ovan.

---

## 10. Dokument-status

**Inga kodändringar gjorda.** Detta är design-fasen.

**Nästa steg:** Andreas + Christoffer går igenom fråga-listan i § 8. När svar är klara: börja Etapp 1 (3 commits, ~50 LOC totalt).
