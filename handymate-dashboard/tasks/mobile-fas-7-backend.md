# Mobile Fas 7 — Verksamhet-tabben: Backend-API

> Referensdokument för mobile-API-klienter. Beskriver backend-stödet för
> Sälj-tratten (deals/leads/quotes) och Projekt-flödet (8-stegs workflow).
> Senast verifierad mot dashboard-kodbasen: 2026-05-08.

Källkod i dashboard-repot: `app/api/...` — paths nedan är relativa till
`handymate-dashboard/handymate-dashboard/`.

---

## 0. TL;DR — Vad som finns

- **Sälj-tratten** är en kanban-vy över `deal`-tabellen, grupperad per `pipeline_stage`. 6 default-stages, custom stages stöds. Alla CRUD- och move-operationer på deals täckta av `app/api/pipeline/*`-routes.
- **Projekt-workflowet** är en linjär 8-stegs process (`ps-01` → `ps-08`) lagrad i `project_workflow_stages` (master-tabell, global). Project-rader pekar på sin nuvarande stage via `current_workflow_stage_id` (TEXT FK). Stage-byte triggar automation (SMS, kund-portal-notiser, schemalagda follow-ups).
- **Permissions:** `/api/pipeline/*` och `/api/projects/*` har **inget** permission-check utöver `getAuthenticatedBusiness` — vilken som helst inloggad användare kan flytta deals och projekt-stages. Tech-debt om detta noterat (TD-X-mobile, kommer i separat ärende).

---

## 1. Sälj-tratten (Pipeline / Deals)

### 1.1 SQL-tabeller

**`pipeline_stage`** — Stages per business (system + custom)
```sql
id           TEXT PRIMARY KEY        -- t.ex. 'stage_abc123'
business_id  TEXT NOT NULL
name         TEXT NOT NULL           -- t.ex. 'Ny förfrågan'
slug         TEXT NOT NULL           -- t.ex. 'new_inquiry' (UNIQUE per business)
color        TEXT NOT NULL           -- hex, default '#6B7280'
sort_order   INTEGER NOT NULL
is_system    BOOLEAN DEFAULT false   -- true = locked (default-stages)
is_won       BOOLEAN DEFAULT false   -- terminal "vunnen"
is_lost      BOOLEAN DEFAULT false   -- terminal "förlorad"
created_at   TIMESTAMPTZ
```

**Default 6 system-stages** (skapas automatiskt vid första access via `ensureDefaultStages`):

| Slug | Namn | sort | Färg |
|---|---|---|---|
| `new_inquiry` | Ny förfrågan | 1 | `#6B7280` |
| `contacted` | Kontaktad | 2 | `#0F766E` |
| `quote_sent` | Offert skickad | 3 | `#0D9488` |
| `quote_accepted` | Offert accepterad | 4 | `#0F766E` |
| `won` | Vunnen | 5 | `#22C55E` (is_won=true) |
| `lost` | Förlorad | 99 | `#EF4444` (is_lost=true) |

Custom stages: businesses kan skapa egna mellan sort_order 5 och 99.

**`deal`** — Pipeline-items
```sql
id                   TEXT PRIMARY KEY
business_id          TEXT NOT NULL
customer_id          TEXT                  -- FK customer (nullable)
quote_id             TEXT                  -- nullable
order_id             TEXT                  -- nullable
invoice_id           TEXT                  -- nullable
title                TEXT NOT NULL
description          TEXT
value                NUMERIC               -- SEK
stage_id             TEXT NOT NULL         -- FK pipeline_stage.id
assigned_to          TEXT                  -- user-namn/id
source               TEXT                  -- 'manual' | 'call' | 'vapi_call' m.fl.
source_call_id       TEXT
priority             TEXT                  -- 'low' | 'medium' | 'high' | 'urgent'
expected_close_date  DATE
closed_at            TIMESTAMPTZ           -- sätts vid won/lost
lost_reason          TEXT
deal_number          INTEGER               -- delad räknare med project
created_at           TIMESTAMPTZ
updated_at           TIMESTAMPTZ
```

**`pipeline_activity`** — Audit-log för alla deal-rörelser (user, AI, system)
```sql
id              TEXT PRIMARY KEY
business_id     TEXT
deal_id         TEXT NOT NULL                -- FK deal, ON DELETE CASCADE
activity_type   TEXT                          -- 'stage_changed' | 'deal_created' | 'undo'
description     TEXT
from_stage_id   TEXT                          -- FK pipeline_stage
to_stage_id     TEXT                          -- FK pipeline_stage
triggered_by    TEXT                          -- 'user' | 'ai' | 'system'
ai_confidence   NUMERIC                       -- 0–100
ai_reason       TEXT
source_call_id  TEXT
undone_at       TIMESTAMPTZ
undone_by       TEXT
created_at      TIMESTAMPTZ
```

**`deal_note`** — Fritextanteckningar på deals (separat CRUD).

**`pipeline_automation`** — Per-business AI-inställningar (auto-move, AI-confidence-thresholds).

**`leads`** — *Separat* lead-system med eget stage-fält `pipeline_stage_key` (TEXT, ej FK). Inte samma som `deal`. Mobil-Fas 7 bör fokusera på deal-pipelinen; leads kan ignoreras initialt om scope kräver det.

### 1.2 Routes — `app/api/pipeline/*`

> Auth: `getAuthenticatedBusiness(request)` på alla. **Inget** permission-check på roll/`hasPermission`.

| Method | Path | Beskrivning |
|---|---|---|
| GET | `/api/pipeline` | **Primär kanban-fetch.** Returnerar `{ stages, deals: { [stageId]: Deal[] }, stats }`. Berikar deals med customer-data och senaste lead-kategori. Query-params: `search`, `assigned_to`, `priority` |
| GET | `/api/pipeline/deals` | Lista alla deals + linkade projekt + spent-belopp + AI-automation. Query: `stageId`, `customerId` |
| POST | `/api/pipeline/deals` | Skapa ny deal. Body: `{ title, customerId?, value?, stageSlug?, description?, priority?, job_type?, source?, assigned_to? }` — default `stageSlug='new_inquiry'` |
| GET | `/api/pipeline/deals/[id]` | Hämta enskild deal med customer + project |
| PATCH | `/api/pipeline/deals/[id]` | Uppdatera deal-fält (ej stage — använd `move`-route). Tillåtna: `title`, `description`, `value`, `priority`, `assigned_to`, `customer_id`, `quote_id`, `invoice_id`, `expected_close_date`, `lost_reason` |
| DELETE | `/api/pipeline/deals/[id]` | Ta bort deal (cascadar `pipeline_activity`) |
| POST | `/api/pipeline/deals/[id]/move` | **Drag-drop endpoint.** Body: `{ toStageSlug: string, lost_reason?: string }`. 400 om `toStageSlug='lost'` utan `lost_reason`. Triggar automation non-blocking |
| GET | `/api/pipeline/deals/[id]/activity` | Activity-log för en deal |
| GET | `/api/pipeline/stages` | Alla stages (sorted by sort_order). Anropar `ensureDefaultStages` |
| POST | `/api/pipeline/stages` | Skapa custom stage. Body: `{ name, color?, sort_order? }` |
| PUT | `/api/pipeline/stages` | Reorder eller edit. Bulk `{ stages: [...] }` eller single `{ id, name?, color? }`. System-stages (won/lost): bara color editable |
| DELETE | `/api/pipeline/stages?id={id}&moveTo={fallbackId}` | Ta bort stage. Flyttar deals till fallback. Won/lost ej raderbara |
| GET | `/api/pipeline/activity` | Alla deal-activities. Query: `triggered_by`, `limit` (default 20) |
| GET | `/api/pipeline/stats` | Pipeline-stats (byStage, totals) |
| GET | `/api/pipeline/settings` | `pipeline_automation`-inställningar |
| PATCH | `/api/pipeline/settings` | Uppdatera automation-settings |
| GET/POST/PUT/DELETE | `/api/pipeline/notes` | Deal-notes CRUD. Query/body innehåller `dealId` eller `noteId` |

### 1.3 Sample payload — `GET /api/pipeline`

```json
{
  "stages": [
    {
      "id": "stage_abc123",
      "name": "Ny förfrågan",
      "slug": "new_inquiry",
      "color": "#6B7280",
      "sort_order": 1,
      "is_system": true,
      "is_won": false,
      "is_lost": false
    }
  ],
  "deals": {
    "stage_abc123": [
      {
        "id": "deal_001",
        "title": "Badrumsrenovering",
        "value": 45000,
        "stage_id": "stage_abc123",
        "priority": "high",
        "expected_close_date": "2026-06-28",
        "deal_number": 1003,
        "customer": {
          "customer_id": "cust_456",
          "name": "Anna Andersson",
          "phone_number": "070-1234567",
          "email": "anna@example.se",
          "address_line": "Storgatan 5, 123 45 Stockholm",
          "customer_type": "private",
          "customer_number": "CUST-001"
        },
        "category": "renovation"
      }
    ]
  },
  "stats": {
    "byStage": [
      { "stage": "Ny förfrågan", "slug": "new_inquiry", "color": "#6B7280", "count": 12, "value": 540000 }
    ],
    "totalDeals": 22,
    "totalValue": 1050000,
    "wonValue": 500000,
    "lostCount": 2,
    "newLeadsToday": 3,
    "needsFollowUp": 4
  }
}
```

### 1.4 "Deals i tratten" (active deals)

`stats.totalDeals` exkluderar **inte** automatiskt won/lost — räknar alla deals i alla stages. Vill mobilen ha "aktiva deals i tratten" är det:
```
stages.filter(s => !s.is_won && !s.is_lost).flatMap(s => deals[s.id]).length
```
Eller server-side: `GET /api/pipeline/deals?stageId=<not-won-not-lost>` (men ingen sådan filter finns inbyggd — måste göras client-side).

### 1.5 Stage-konfiguration

- Hardcoded `DEFAULT_STAGES`-array i [lib/pipeline.ts](handymate-dashboard/lib/pipeline.ts) — 6 system-stages
- Per-business custom stages i `pipeline_stage` (is_system=false)
- `ensureDefaultStages(businessId)` skapar default-set vid första access om inga finns
- Migration-detection: om gamla 8-stage-setup finns och deals existerar, behålls de gamla

---

## 2. Projekt-workflowet (8-stegs)

### 2.1 SQL — `project_workflow_stages`

**Schema-fil:** [sql/v39_project_stages.sql](handymate-dashboard/sql/v39_project_stages.sql)

```sql
CREATE TABLE project_workflow_stages (
  id           TEXT PRIMARY KEY,        -- 'ps-01'..'ps-08' för system, UUID för custom
  business_id  TEXT,                    -- NULL = system stage (global)
  name         TEXT NOT NULL,
  position     INTEGER NOT NULL,        -- 1..8 (eller högre för custom)
  color        TEXT NOT NULL,
  icon         TEXT NOT NULL,           -- emoji
  is_system    BOOLEAN DEFAULT false,
  description  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

**Master-tabell:** Globala 8 system-stages med `business_id = NULL`. Businesses kan addera custom stages med UUID-id och eget `business_id`.

**De 8 default-stagesen:**

| ID | Namn | Position | Icon | Default-automation |
|---|---|---|---|---|
| `ps-01` | Kontrakt signerat | 1 | ✍️ | SMS: "Vi har mottagit er signerade offert..." |
| `ps-02` | Startmöte bokat | 2 | 📅 | (ingen default) |
| `ps-03` | Jobb påbörjat | 3 | 🔨 | SMS: "Vi har nu startat arbetet..." |
| `ps-04` | Delmål uppnått | 4 | ✅ | (ingen default) |
| `ps-05` | Slutbesiktning | 5 | 🔍 | (ingen default) |
| `ps-06` | Faktura skickad | 6 | 📧 | (ingen default) |
| `ps-07` | Faktura betald | 7 | 💰 | SMS + schedule review-request (+3 dagar) |
| `ps-08` | Recension mottagen | 8 | ⭐ | Schedule 1-årsuppföljning |

### 2.2 `project`-tabellen — relevanta kolumner

**Schema-filer:** [sql/projects.sql](handymate-dashboard/sql/projects.sql) (bas) + [sql/v12_pipeline_project.sql](handymate-dashboard/sql/v12_pipeline_project.sql) + [sql/v39_project_stages.sql](handymate-dashboard/sql/v39_project_stages.sql) + [sql/bugfix_ids.sql](handymate-dashboard/sql/bugfix_ids.sql)

```
project_id                  TEXT PRIMARY KEY
business_id                 TEXT NOT NULL
customer_id                 TEXT                 -- FK customer
quote_id                    TEXT
deal_id                     TEXT                 -- FK deal (källa till project)
lead_id                     TEXT
name                        TEXT
description                 TEXT
project_type                TEXT DEFAULT 'hourly'
status                      TEXT DEFAULT 'planning'   -- 'planning'|'active'|'completed'|'cancelled'
budget_hours                NUMERIC
budget_amount               NUMERIC
progress_percent            INTEGER
start_date                  DATE
end_date                    DATE
completed_at                TIMESTAMPTZ
created_at                  TIMESTAMPTZ
updated_at                  TIMESTAMPTZ

-- Workflow-stage (v39):
current_workflow_stage_id   TEXT                 -- FK project_workflow_stages.id
workflow_stage_entered_at   TIMESTAMPTZ
workflow_stage_history      JSONB                -- [{stage_id, entered_at, previous_stage_id}, ...]

project_number              TEXT                 -- 'P-XXXX' (bugfix_ids.sql)
source_lead_data            JSONB                -- preserved lead context (v12)
job_type                    TEXT                 -- v49_project_job_type.sql

-- AI-fält (ai_project_manager.sql):
ai_health_score             INTEGER              -- 0-100
ai_health_summary           TEXT
ai_last_analyzed_at         TIMESTAMPTZ
ai_auto_created             BOOLEAN
```

**Stage-koppling:** TEXT-FK `current_workflow_stage_id` → `project_workflow_stages.id`. Inte denormaliserat (bara id; hämta name/icon via JOIN eller separat fetch).

### 2.3 Routes — projekt + workflow

> Auth: `getAuthenticatedBusiness(request)`. **Inget** permission-check.

| Method | Path | Beskrivning |
|---|---|---|
| GET | `/api/projects` | Lista projekt + customer + actual_hours/uninvoiced_hours + next_deadline. Query: `status`, `customerId`, **`include`** (komma-separerad). Med `?include=workflow` joinas stage-data per projekt — se [§ 2.3.1](#231-includeworkflow--ny-fält-per-projekt) |
| POST | `/api/projects` | Skapa nytt projekt. Body se [§ 2.6](#26-sample-payload) |
| GET | `/api/projects/[id]` | Enskilt projekt |
| PUT | `/api/projects/[id]` | Uppdatera projekt-fält |
| DELETE | `/api/projects/[id]` | Ta bort projekt |
| **GET** | **`/api/projects/[id]/workflow`** | **Stage-info för 8-stegs-vy** — current_stage + alla 8 stages med status (`done`/`current`/`pending`) + completed_at + planned_date + latest_automation. Detta är vad `ProjectStageModal` använder |
| **POST** | **`/api/projects/[id]/advance-stage`** | **Stage-byte.** Body: `{}` (nästa) eller `{ to_stage_id: 'ps-04' }` (hoppa). Triggar automation. Response: `{ success, new_stage }` |
| GET | `/api/projects/[id]/team` | Projekt-team. Har `requirePermission` på vissa actions |
| GET | `/api/projects/[id]/costs` | Kostnader för projektet |
| GET | `/api/projects/[id]/documents` | Projekt-dokument |

### 2.3.1 `?include=workflow` — nya fält per projekt

Tillagd i commit `ce24b1d1` (2026-05-08) för att eliminera N+1-anrop från mobil-listvyn. **Bakåtkompatibel** — utan param är response-shape oförändrad och dashboard-callers (som inte behöver stage-info i listan) påverkas inte.

**Exempel:**
```
GET /api/projects?status=active&include=workflow
```

Routen gör en bulk-fetch mot `project_workflow_stages` (system + business-egna) och berikar varje rad i `projects[]`-arrayen. Mobilen behöver **inte** göra en separat `/api/projects/[id]/workflow`-fetch per rad för att rendera badge/progress.

**Åtta nya fält per projekt** (utöver befintliga `customer`, `actual_hours`, m.fl.):

| Fält | Typ | Beskrivning |
|---|---|---|
| `current_stage_id` | `string \| null` | t.ex. `'ps-03'`. Null om projektet inte har en stage satt än |
| `current_stage_name` | `string \| null` | t.ex. `'Jobb påbörjat'` |
| `current_stage_color` | `string \| null` | hex, t.ex. `'#7C3AED'` |
| `current_stage_icon` | `string \| null` | emoji, t.ex. `'🔨'` |
| `completed_stages` | `string[]` | array av stage-ids med `position < current.position`. Tom array om `current_stage_id` är null |
| `total_stages` | `number` | system-stages + ev. business-custom. Default 8 om inga custom |
| `stage_progress` | `number` | `= completed_stages.length`, alltså 0..total_stages |
| `is_late` | `boolean` | se nedan |

**`is_late`-tolkning:** `project.end_date < now` AND `status NOT IN ('completed', 'cancelled')`. **Inte** per-stage `due_date` eftersom `project_workflow_stages`-tabellen inte har det fältet — `project.end_date` är den auktoritativa deadlinen. Om mobilen vill ha stage-specifika deadlines måste schema utökas (eller `project_milestone.due_date` mappas mot stages, men den heuristiken finns inte idag).

**Sample-payload (utdrag — bara workflow-relevanta fält):**

```json
{
  "projects": [
    {
      "project_id": "proj_d91a4c2e",
      "name": "Badrumsrenovering",
      "status": "active",
      "end_date": "2026-05-15",
      "customer": { "customer_id": "cust_xyz", "name": "Anna Andersson", "phone_number": "+4670...", "email": "anna@..." },
      "actual_hours": 32.5,
      "actual_amount": 4875,
      "uninvoiced_hours": 8.0,
      "next_deadline": "2026-05-12",

      "current_stage_id": "ps-03",
      "current_stage_name": "Jobb påbörjat",
      "current_stage_color": "#7C3AED",
      "current_stage_icon": "🔨",
      "completed_stages": ["ps-01", "ps-02"],
      "total_stages": 8,
      "stage_progress": 2,
      "is_late": false
    }
  ],
  "job_types": [...]
}
```

**När använda `?include=workflow` vs separat `/workflow`-anrop:**

- **List-vy** (Verksamhet-tabben, projekt-list): använd `?include=workflow`. Räcker för badges, progress-bar, "X av 8 steg klar".
- **Detalj-vy** (ProjectStageModal): anropa fortfarande `GET /api/projects/[id]/workflow` — där får du full timeline med per-stage `completed_at`, `planned_date` och `latest_automation`. Det fältet ingår **inte** i `?include=workflow`-svaret eftersom det skulle blåsa upp listan markant.

### 2.4 `GET /api/projects/[id]/workflow` — payload

```json
{
  "project": {
    "id": "proj_d91a4c2e",
    "name": "Badrumsrenovering",
    "customer_name": "Anna Andersson",
    "amount": 45000,
    "start_date": "2026-05-01",
    "end_date": "2026-05-15",
    "category": "hourly"
  },
  "current_stage": {
    "id": "ps-03",
    "name": "Jobb påbörjat",
    "position": 3,
    "color": "#7C3AED",
    "icon": "🔨"
  },
  "stages": [
    {
      "id": "ps-01",
      "name": "Kontrakt signerat",
      "position": 1,
      "color": "#0F766E",
      "icon": "✍️",
      "status": "done",
      "completed_at": "2026-05-01T10:00:00Z",
      "planned_date": null
    },
    {
      "id": "ps-03",
      "name": "Jobb påbörjat",
      "position": 3,
      "color": "#7C3AED",
      "icon": "🔨",
      "status": "current",
      "completed_at": null,
      "planned_date": "2026-05-05"
    }
  ],
  "latest_automation": {
    "agent": "lars",
    "action": "Arbetet har startat på plats",
    "rule_name": "Projekt: Jobb påbörjat",
    "action_type": "advance_stage",
    "created_at": "2026-05-02T14:30:00Z"
  }
}
```

`stages[].status`-värden: `'done'` | `'current'` | `'pending'`. Bekvämt för rendering av timeline.

### 2.5 `POST /api/projects/[id]/advance-stage` — beteende

Body-varianter:
```ts
{}                              // → flytta till nästa stage (current_position + 1)
{ to_stage_id: 'ps-04' }        // → hoppa direkt till specifik stage
```

Sekvens (i [lib/project-stages/automation-engine.ts](handymate-dashboard/lib/project-stages/automation-engine.ts) `advanceProjectStage()`):
1. UPDATE `project.current_workflow_stage_id`, `workflow_stage_entered_at`, appendar till `workflow_stage_history` (JSONB)
2. Logga i `v3_automation_logs` med `trigger_type='project_stage_change'`, `agent_id='lars'`
3. Anropa `triggerStageAutomations()` — kollar custom rules per business, annars default
4. Skicka kund-portal-notiser (utom INVOICE_PAID och REVIEW_RECEIVED)
5. Default-automations per stage (se § 2.1-tabellen)

Response:
```json
{
  "success": true,
  "new_stage": {
    "id": "ps-04",
    "name": "Delmål uppnått",
    "position": 4,
    "color": "#0EA5E9",
    "icon": "✅"
  }
}
```

Mobilen behöver **inte** refetcha projektet efter `advance-stage` — `new_stage` returneras direkt. Men om automation-resultatet ska visas måste `latest_automation` läsas via `GET /api/projects/[id]/workflow`.

`ProjectStageModal` i dashboard refetchar workflow efter advance (ingen optimistisk update). Mobilen kan välja samma strategi eller optimistisk.

### 2.6 Sample payload — POST `/api/projects`

Request:
```json
{
  "name": "Badrumsrenovering",
  "description": "Ny kakel, armatur och ventilation",
  "customer_id": "cust_xyz",
  "project_type": "mixed",
  "status": "planning",
  "budget_hours": 40,
  "budget_amount": 45000,
  "start_date": "2026-05-01",
  "end_date": "2026-05-15",
  "from_quote_id": "quote_abc",
  "from_deal_id": "deal_123"
}
```

Response (`project`-rad):
```json
{
  "project_id": "proj_d91a4c2e",
  "business_id": "biz_abc",
  "customer_id": "cust_xyz",
  "deal_id": "deal_123",
  "name": "Badrumsrenovering",
  "status": "active",
  "budget_amount": 45000,
  "current_workflow_stage_id": "ps-03",
  "workflow_stage_entered_at": "2026-05-02T10:00:00Z",
  "workflow_stage_history": [
    { "stage_id": "ps-01", "entered_at": "2026-05-01T10:00:00Z", "previous_stage_id": null },
    { "stage_id": "ps-02", "entered_at": "2026-05-01T14:00:00Z", "previous_stage_id": "ps-01" },
    { "stage_id": "ps-03", "entered_at": "2026-05-02T10:00:00Z", "previous_stage_id": "ps-02" }
  ],
  "project_number": "P-1247",
  "ai_health_score": 100
}
```

---

## 3. Permissions

### 3.1 Tillgängliga permissions ([lib/permissions.ts](handymate-dashboard/lib/permissions.ts))

```ts
export type Permission =
  | 'see_all_projects'
  | 'see_financials'
  | 'manage_users'
  | 'approve_time'
  | 'create_invoices'
  | 'manage_settings'
```

**Inga `manage_deals` eller `manage_projects`-permissions finns.**

### 3.2 Vad routerna faktiskt kontrollerar

| Endpoint-grupp | Permission-check |
|---|---|
| `/api/pipeline/*` (deals, stages, notes, settings, activity, stats) | **Bara `getAuthenticatedBusiness`** — ingen `hasPermission` |
| `/api/projects/*` (utom `/team`) | **Bara `getAuthenticatedBusiness`** |
| `/api/projects/[id]/team` | Har `hasPermission`-användning på vissa actions |

**Praktisk konsekvens:** Vilken som helst inloggad anställd kan i dagsläget:
- Skapa, redigera, radera deals
- Flytta deals mellan stages
- Skapa, redigera, radera projekt
- Avancera projekt-stages

UI-gating i dashboard kan dölja knappar för anställda, men servern blockerar inget. Samma som TD-4 (saknad permission på `/api/checkin/approve`) — pattern att fixa systematiskt.

### 3.3 Mobilens `permissions`-payload (från `/api/team/me`)

```ts
{
  see_all_projects: boolean,
  see_financials: boolean,
  manage_users: boolean,
  approve_time: boolean,
  create_invoices: boolean,
  manage_settings: boolean
}
```

Mobile-gating för Verksamhet-tabben:
- **Sälj:** ingen specifik permission — visa för alla. Owner/admin kan såklart fortsätta se hela tratten. Om policy-beslut tas att begränsa → använd `see_all_projects` som proxy ("ser du alla projekt får du också se hela säljtratten") tills ny `manage_deals` permission läggs in.
- **Projekt:** `see_all_projects` styr vilka projekt som visas. Owner/admin ser alla; employee utan flaggan ser bara projekt de är assigned till (måste filtreras client-side i dagsläget — inget server-filter på user_id).
- **Stage-actions:** ingen permission krävs för advance/move idag. Mobilen kan visa knapparna för alla, men flagga som tech-debt: "stage-mutationer borde ev. kräva owner/admin-roll".

---

## 4. TypeScript-interfaces för mobilen

```ts
// Pipeline (Sälj)
export interface PipelineStage {
  id: string
  name: string
  slug: string
  color: string
  sort_order: number
  is_system: boolean
  is_won: boolean
  is_lost: boolean
}

export interface DealCustomer {
  customer_id: string
  name: string
  phone_number: string | null
  email: string | null
  address_line: string | null
  customer_type: 'private' | 'company' | null
  customer_number: string | null
}

export interface Deal {
  id: string
  business_id: string
  customer_id: string | null
  quote_id: string | null
  invoice_id: string | null
  title: string
  description: string | null
  value: number | null
  stage_id: string
  assigned_to: string | null
  source: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent' | null
  expected_close_date: string | null
  closed_at: string | null
  lost_reason: string | null
  deal_number: number | null
  created_at: string
  updated_at: string
  customer?: DealCustomer | null
  category?: string | null
}

export interface PipelineStats {
  byStage: { stage: string; slug: string; color: string; count: number; value: number }[]
  totalDeals: number
  totalValue: number
  wonValue: number
  lostCount: number
  newLeadsToday: number
  needsFollowUp: number
}

// Project workflow
export interface WorkflowStage {
  id: string                              // 'ps-01'..'ps-08' eller UUID
  name: string
  position: number
  color: string
  icon: string                            // emoji
  status: 'done' | 'current' | 'pending'
  completed_at: string | null
  planned_date: string | null
}

export interface ProjectWorkflowResponse {
  project: {
    id: string
    name: string
    customer_name: string | null
    amount: number | null
    start_date: string | null
    end_date: string | null
    category: string | null
  }
  current_stage: {
    id: string
    name: string
    position: number
    color: string
    icon: string
  } | null
  stages: WorkflowStage[]
  latest_automation: {
    agent: string
    action: string
    rule_name: string
    action_type: string
    created_at: string
  } | null
}

export interface AdvanceStageResponse {
  success: boolean
  new_stage: {
    id: string
    name: string
    position: number
    color: string
    icon: string
  }
}
```

---

## 5. Caveats och tech-debt

- **Stage-moves är slug-baserade** för deals (`toStageSlug`), men ID-baserade för projekt (`to_stage_id`). Inkonsekvent — håll isär i klienten.
- **Lead-systemet är separat** från deal-pipelinen och har eget stage-fält (`leads.pipeline_stage_key`). Mobil-Fas 7 kan ignorera leads tills explicit scope kräver dem.
- **Inget permission-check** på pipeline/projects-routes — mobilen kan visa knappar för alla, men säkerhets-egenskaper kan inte verifieras med DEV role-toggle (se TD-5). Kräver två separata konton för audit.
- **`GET /api/projects` stage-info:** ~~Mobilen behöver göra en extra fetch~~ — löst i commit `ce24b1d1` via `?include=workflow`-param (se § 2.3.1). Detalj-vyn kan fortfarande använda `/api/projects/[id]/workflow` för full timeline.
- **`pipeline_activity` cascadar vid deal-delete** — borttagna deals förlorar audit-spår. Reversibelt via `undone_at`/`undone_by`-fälten på existerande activities, men inte vid cascade.
- **AI-automation logged via `triggered_by='ai'`** — visa det i UI:n med separat ikon/färg så användare förstår skillnaden mellan egna och AI-flyttar.
- **Custom stages stöds** i deal-pipelinen men **inte** i projekt-workflowet (8-stegs är låst som master-config med `business_id=NULL`).

---

## 6. Källfiler — snabb-referens

**Sälj (deals/pipeline):**
- Schema: [sql/v36_pipeline_visualization.sql](handymate-dashboard/sql/v36_pipeline_visualization.sql), [sql/v37_pipeline_unify.sql](handymate-dashboard/sql/v37_pipeline_unify.sql)
- Lib: [lib/pipeline.ts](handymate-dashboard/lib/pipeline.ts), [lib/pipeline-ai.ts](handymate-dashboard/lib/pipeline-ai.ts), [lib/pipeline/automations.ts](handymate-dashboard/lib/pipeline/automations.ts)
- Routes: [app/api/pipeline/](handymate-dashboard/app/api/pipeline/)
- Dashboard UI: [app/dashboard/pipeline/page.tsx](handymate-dashboard/app/dashboard/pipeline/page.tsx)

**Projekt-workflow:**
- Schema: [sql/v39_project_stages.sql](handymate-dashboard/sql/v39_project_stages.sql), [sql/projects.sql](handymate-dashboard/sql/projects.sql), [sql/v12_pipeline_project.sql](handymate-dashboard/sql/v12_pipeline_project.sql)
- Lib: [lib/project-stages/automation-engine.ts](handymate-dashboard/lib/project-stages/automation-engine.ts), [lib/project-ai-engine.ts](handymate-dashboard/lib/project-ai-engine.ts)
- Routes: [app/api/projects/](handymate-dashboard/app/api/projects/), [app/api/projects/[id]/workflow/route.ts](handymate-dashboard/app/api/projects/[id]/workflow/route.ts), [app/api/projects/[id]/advance-stage/route.ts](handymate-dashboard/app/api/projects/[id]/advance-stage/route.ts)
- Modal: [components/pipeline/unified/ProjectStageModal.tsx](handymate-dashboard/components/pipeline/unified/ProjectStageModal.tsx)

**Permissions:**
- Lib: [lib/permissions.ts](handymate-dashboard/lib/permissions.ts)
- Endpoint: [app/api/team/me/route.ts](handymate-dashboard/app/api/team/me/route.ts)
