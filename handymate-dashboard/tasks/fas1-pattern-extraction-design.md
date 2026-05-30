# Fas 1 — Pattern-extraction v0 (Designdokument)

Per [roadmap-learning-ai.md](./roadmap-learning-ai.md) Fas 1. Designdokument inför bygge. **Ingen kod, ingen migration.** Beslut här styr implementation.

## Sammanfattning + rekommendation

**Bygg infrastruktur nu, beräkna mönster senare.** Bees data är 3 dagar gammal i live-läge. Pattern-extraction utan 4-6 veckors data är meningslös — vi har inte tillräcklig sample-size för någon av de föreslagna mönstren.

**Rekommendation:** Splitta Fas 1 i två sub-faser.

| Sub-fas | Innehåll | Tid | När |
|---|---|---|---|
| **Fas 1a** | Datamodell + helpers + sample-thresholds + första mönster (approve-rate) | 5-7 dagar | Nu — bygger samtidigt som Bee genererar mer data |
| **Fas 1b** | Resterande mönster aktiveras när sample-size-tröskeln nås per pattern | Trigg när data räcker | 4-8 veckor efter pilot-start |

Approve-rate fungerar omedelbart eftersom rate-limiten startade igår och approval-flödet ackumulerar data från dag 1. Resterande mönster väntar på naturlig datatillväxt.

---

## DEL 1 — Data-inventering

### A. Volym per tabell (Andreas-siffror + verifiering)

Andreas bekräftat för biz_21wswuhrbhy: **3 users, 33 deals, 54 customers, 24 projects, 5 time_entries, aktiv senast 3 dagar sedan.**

Verifiera resten via följande SQL i Supabase:

```sql
SELECT 'quotes' AS tbl, COUNT(*) FROM quotes WHERE business_id = 'biz_21wswuhrbhy'
UNION ALL SELECT 'quote_items', COUNT(*) FROM quote_items WHERE business_id = 'biz_21wswuhrbhy'
UNION ALL SELECT 'invoices', COUNT(*) FROM invoice WHERE business_id = 'biz_21wswuhrbhy'
UNION ALL SELECT 'project_change', COUNT(*) FROM project_change WHERE business_id = 'biz_21wswuhrbhy'
UNION ALL SELECT 'sms_log_inbound', COUNT(*) FROM sms_log WHERE business_id = 'biz_21wswuhrbhy' AND direction = 'inbound'
UNION ALL SELECT 'sms_log_outbound', COUNT(*) FROM sms_log WHERE business_id = 'biz_21wswuhrbhy' AND direction = 'outbound'
UNION ALL SELECT 'pending_approvals_total', COUNT(*) FROM pending_approvals WHERE business_id = 'biz_21wswuhrbhy'
UNION ALL SELECT 'pending_approvals_resolved', COUNT(*) FROM pending_approvals WHERE business_id = 'biz_21wswuhrbhy' AND status IN ('approved', 'rejected')
UNION ALL SELECT 'agent_runs_30d', COUNT(*) FROM agent_runs WHERE business_id = 'biz_21wswuhrbhy' AND created_at >= NOW() - INTERVAL '30 days'
UNION ALL SELECT 'v3_automation_logs_30d', COUNT(*) FROM v3_automation_logs WHERE business_id = 'biz_21wswuhrbhy' AND created_at >= NOW() - INTERVAL '30 days';
```

**Förväntan baserat på pilot-status:**

| Tabell | Förväntad volym | Källa till förväntan |
|---|---|---|
| quotes | Låg (5-15) | Bee tar leads via Webolia + telefon, inte primärt offert-flöde |
| quote_items | ~3-5 per quote om strukturerade | Många hantverkare har fri-text-offerter |
| invoice | Låg (5-20) | Nytt konto, fakturor börjar komma |
| project_change (ÄTA) | Mycket låg (0-5) | Kräver pågående projekt, ÄTA är ovanligt i tidigt skede |
| sms_log inbound | 0 senaste 7d (verifierat — Lisa skippade) | Inga kunder svarat på SMS än |
| sms_log outbound | Låg | Manuella SMS från Bee |
| pending_approvals resolved | 0-3 | Approval-flöde startar imorgon 06:00 UTC |
| agent_runs 30d | 1-3 | Bara dagens manuella test + en Daniel-körning |
| v3_automation_logs | Okänt | Beror på rule-konfiguration |

### B. Tidsspann och fördelning

```sql
SELECT
  MIN(created_at) AS äldsta,
  MAX(created_at) AS senaste,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS sista_7d,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS sista_30d
FROM deal WHERE business_id = 'biz_21wswuhrbhy';
```

(Upprepa för customer, project, invoice, quote.)

**Data-validitetsgräns** — när blev datan pålitlig?

| Etapp | Datum | Effekt på pattern-extraktion |
|---|---|---|
| Etapp 1 (invoice.project_id) | 2026-05-20 | Pre-2026-05-20: invoice→project är NULL, marginal-analys är meningslös för historiska |
| compute-economics-helper | 2026-05-21 | Pre-2026-05-21: marginal-data är snapshot-baserad och opålitlig |
| Steg 2 is_active-filter | 2026-05-23 | Pre-2026-05-23: test-konton kan ha bidragit till "Bee-data" om de delade någon tabell |
| Tråd 1 typed actions | 2026-05-28 | Pre-2026-05-28: alla approvals är `agent_observation` (generic) — inga typed `send_sms`-rader |

**Implikation:** Pattern-extraktion bör default-filtrera på `created_at >= '2026-05-21'` (compute-economics-cutoff) för ekonomi-mönster. Approve/reject-mönster bör filtrera på `created_at >= '2026-05-28'` (typed-actions-cutoff).

### C. Datakvalitet — kritisk för epistemic hygien

Verifiera via SQL:

```sql
-- Hur många deals har lead_id satt? (Vi vet leads-tabellen var tom)
SELECT COUNT(*) FILTER (WHERE lead_id IS NOT NULL) AS med_lead,
       COUNT(*) FILTER (WHERE lead_id IS NULL) AS utan_lead
FROM deal WHERE business_id = 'biz_21wswuhrbhy';

-- Hur många invoices har project_id efter Etapp 1?
SELECT COUNT(*) FILTER (WHERE project_id IS NOT NULL) AS med_project,
       COUNT(*) FILTER (WHERE project_id IS NULL) AS utan_project
FROM invoice WHERE business_id = 'biz_21wswuhrbhy';

-- Hur många projekt har realistisk budget?
SELECT COUNT(*) FILTER (WHERE budget_amount > 0) AS med_budget,
       COUNT(*) FILTER (WHERE budget_amount IS NULL OR budget_amount = 0) AS utan_budget
FROM project WHERE business_id = 'biz_21wswuhrbhy';

-- Strukturerade quotes
SELECT q.quote_id,
       COUNT(qi.id) AS antal_items
FROM quotes q LEFT JOIN quote_items qi ON qi.quote_id = q.quote_id
WHERE q.business_id = 'biz_21wswuhrbhy'
GROUP BY q.quote_id;

-- Time entries med project_id + hourly_rate
SELECT COUNT(*) FILTER (WHERE project_id IS NOT NULL) AS med_project,
       COUNT(*) FILTER (WHERE hourly_rate > 0) AS med_rate
FROM time_entry WHERE business_id = 'biz_21wswuhrbhy';

-- Resolved approvals (approve-rate-data)
SELECT status, COUNT(*) FROM pending_approvals
WHERE business_id = 'biz_21wswuhrbhy'
GROUP BY status;
```

**Förväntade kvalitetsproblem:**

| Problem | Sannolikhet | Konsekvens för Fas 1 |
|---|---|---|
| Deals utan lead_id (leads-tabell var tom) | Hög | "Lead-livscykel"-mönster fungerar inte — börja med deal-livscykel |
| Invoices utan project_id (pre-Etapp 1) | Medel | Filtrera på post-backfill för marginal-mönster |
| Time entries med 0 hourly_rate eller saknad project_id | Hög (5 entries är extremt lite) | Marginal-analys per projekt-typ är inte robust nog |
| Quotes utan strukturerade items | Hög | Kan inte analysera prissättning per item-typ |
| Pending approvals med status='pending' (ej resolved) | Hög | Approve-rate fungerar bara på resolved subset |

---

## DEL 2 — Mönster-identifiering

### Konkret lista — 8 mönster

| # | Mönster | Datakälla | Min sample för uttalande | Värde för Christoffer | Bee idag (~3 dagar live)? |
|---|---|---|---|---|---|
| 1 | **Approve-rate per agent** | `pending_approvals` resolved | N≥10 per agent | "Du godkänner 87% av Karins förslag, 34% av Daniels — Karin är värdefullare" | ❌ Nej (cron startar imorgon) men ackumuleras snabbt |
| 2 | **Deal-livscykel (kontaktad → vunnen)** | `deal.stage_history` eller `created_at + won_at` | N≥20 vunna deals | "Era deals stänger på 23 dagar i snitt" | ⚠ Behöver verifiera hur många vunna |
| 3 | **Marginal-distribution per projekt-typ** | `project + compute-economics` | N≥10 projekt med kostnad_sannolikt_komplett=true | "Villor tjänar 24% marginal, BRF 12%" | ❌ Bara 5 time_entries → arbetskostnad opålitlig |
| 4 | **SMS-svarstid per kund** | `sms_log inbound vs outbound` | N≥10 SMS-konversationer | "Kunder svarar typiskt inom 3h, BRF inom 18h" | ❌ 0 inbound senaste 7d |
| 5 | **Kund-återköpsfrekvens** | `customer + multiple deals` | 6+ månaders data | "32% av era kunder återkommer inom 12 mån" | ❌ För kort historik |
| 6 | **Säsongsvariation deal-skapande** | `deal.created_at` | 12+ månaders data | "Mars är er högsäsong, december lågsäsong" | ❌ För kort historik |
| 7 | **ÄTA-frekvens per projekt** | `project_change` | N≥10 projekt med eller utan ÄTA | "60% av era badrumsprojekt får ÄTAs" | ⚠ Beror på project_change-volym (verifiera) |
| 8 | **Förfallna fakturor mönster** | `invoice.due_date + paid_at` | N≥5 förfallna | "Privatkunder betalar 3 dagar sent i snitt, BRF 18 dagar" | ⚠ Beror på invoice-volym |

### Prio-ordning för Bee specifikt

**Tier A — bygg först (data tillgänglig eller ackumuleras snabbt):**

1. **Approve-rate per agent** — ackumuleras från och med imorgon. Mest värdefull för Lars/Hanna/Christoffer att veta vilka agenter som ger värde. Triggar auto-throttling (TD-83) när vi är där.

2. **ÄTA-frekvens per projekt** — om Bee har 5+ project_change-rader räcker det för första uttalande. Värde: prognos vid offerterande.

**Tier B — vänta 4-6 veckor (data tillkommer naturligt):**

3. **Deal-livscykel** — kräver vunna deals. Bee har 33 deals men hur många är ÖVER hela livscykeln (lead/contacted → vunnen)? Verifiera med SQL.

4. **Förfallna fakturor mönster** — kräver invoices med paid_at. Ackumuleras när Bee fakturerar mer.

**Tier C — vänta minst 8 veckor:**

5. **Marginal-distribution per projekt-typ** — kräver completed projekt med kostnad_sannolikt_komplett=true. Bara 5 time_entries idag.

6. **SMS-svarstid per kund** — kräver inbound SMS. 0 senaste 7d.

**Tier D — vänta 6+ månader:**

7. **Kund-återköpsfrekvens**
8. **Säsongsvariation**

### Föreslag: Bygg Tier A nu, lägg infrastruktur för Tier B-D som auto-aktiveras när sample-size-tröskel nås.

---

## DEL 3 — Datamodell-design

### A. Lagring — föreslagen tabell

```sql
CREATE TABLE business_patterns (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  business_id  TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  pattern_key  TEXT NOT NULL,
  value        JSONB NOT NULL,
  sample_size  INTEGER NOT NULL,
  confidence   TEXT NOT NULL CHECK (confidence IN ('preliminary', 'medium', 'high')),
  -- Andreas-tillägg A (2026-05-30): stale-flag istället för att downgrada
  -- confidence eller dölja raden när current_n understiger min_n för
  -- preliminary. Calculator skriver rad ändå, sätter is_stale=true så
  -- UI/Fas 2 kan visa "lär mig fortfarande" utan att tappa sample-size-
  -- progressionen.
  is_stale     BOOLEAN NOT NULL DEFAULT false,
  data_window_start TIMESTAMPTZ,
  data_window_end   TIMESTAMPTZ,
  metadata     JSONB DEFAULT '{}',
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, pattern_key)
);

CREATE INDEX idx_patterns_business ON business_patterns(business_id);
CREATE INDEX idx_patterns_calculated ON business_patterns(last_calculated_at);
```

**is_stale-semantik:**
- `is_stale=true` → current_n < min_n för preliminary. Raden bevaras (sample-size tickar uppåt) men UI/Fas 2 visar "Bygger fortfarande underlag (X av Y)". Calculator beräknar inte `value`-fältet i detta läge (eller skriver placeholder).
- `is_stale=false` → mönstret har tillräcklig sample för minst preliminary. `value` + `confidence` är tillförlitliga.

### A.1 Per-business sample-threshold override (förbered, bygg ej i Fas 1a)

Andreas-tillägg B (2026-05-30): olika hantverkar-typer har olika datavolym. Takläggare har få stora projekt, städfirma har många små. Default-trösklarna kan vara för konservativa för vissa, för aggressiva för andra.

**Inte byggt i Fas 1a — bara designat.** Logga som TD för aktivering när vi har 3+ pilotkunder med olika profiler:

```sql
-- Framtida: business_patterns_config för per-business override
-- CREATE TABLE business_patterns_config (
--   business_id TEXT NOT NULL,
--   pattern_key TEXT NOT NULL,
--   min_n_preliminary INTEGER,
--   min_n_medium INTEGER,
--   min_n_high INTEGER,
--   UNIQUE (business_id, pattern_key)
-- );
```

Fas 1a-calculators läser bara från globala defaults (TypeScript-konstant). När config-tabellen byggs (post-Fas 1a) kommer calculators fallback-ordningen vara: `config[biz][pattern]` → global default.

**Varför per-mönster-rad (inte all-in-one JSONB på business_config):**

- **Atomic update:** ett mönsters omräkning rör inte andra
- **Sample-size-tröskel-gate per pattern:** approve-rate kan finnas innan marginal-distribution är klar
- **Historik:** lätt att lägga till `business_patterns_history` senare för att se hur mönster förändras
- **Per-pattern policy:** olika cron-frekvens per pattern (approve-rate dagligen, säsongsvariation veckovis)
- **Migration-stabilitet:** lägga till nytt pattern kräver ingen ALTER

### B. Pattern value-struktur

Per pattern har `value` ett pattern-specifikt schema. Definieras via TypeScript-typer i `lib/patterns/types.ts`:

```typescript
type ApproveRatePattern = {
  per_agent: Record<string, {
    approved: number
    rejected: number
    edited: number
    rate: number  // approved / (approved + rejected)
  }>
}

type DealCyclePattern = {
  avg_days: number
  median_days: number
  p25_days: number
  p75_days: number
  by_customer_type: Record<string, { avg_days: number; n: number }>
}

type AtaFrequencyPattern = {
  pct_projects_with_ata: number
  avg_ata_per_project: number
  by_project_type: Record<string, { pct: number; n: number }>
}
```

### C. Uppdateringsfrekvens

**Rekommendation: dagligt cron-pass kl 05:00 UTC** (före agenterna kör 06:00).

```
05:00 UTC: /api/cron/patterns
05:30 UTC: /api/cron/agent-context (befintlig)
06:00 UTC: Karin, Daniel, Lars (befintliga)
07:00 UTC: Lisa
```

Karin/Daniel/Lisa-prompterna kan då läsa färska `business_patterns` när de bygger sina aggregat (Fas 2-arbete — Fas 1 räcker att tabellen finns och uppdateras).

**Kostnad:** ren SQL, inga Claude-anrop. ~5-10 sekunder per business per pattern. Negligibelt.

**Trigger-baserat alternativ avvisat:** dagligt-frekvens räcker. Mönster ändras inte snabbare än så.

---

## DEL 4 — Epistemic hygien-regler

### Sample-size-trösklar per pattern

| Pattern | Min N för 'preliminary' | Min N för 'medium' | Min N för 'high' |
|---|---|---|---|
| approve_rate (per agent) | 5 resolved | 15 resolved | 30 resolved |
| deal_cycle | 10 vunna deals | 25 vunna deals | 50 vunna deals |
| marginal_distribution | 5 projekt komplett | 15 projekt komplett | 30 projekt komplett |
| sms_response_time | 10 konversationer | 25 konversationer | 50 konversationer |
| customer_return_rate | 10 kunder + 3 mån data | 50 + 12 mån | 100 + 12 mån |
| seasonal_variation | 6 mån data | 24 mån data | 36 mån data |
| ata_frequency | 10 projekt | 25 projekt | 50 projekt |
| overdue_invoices | 5 förfallna | 15 förfallna | 30 förfallna |

**Tröskel-justeringar 2026-05-30 (Andreas):**
- `customer_return_rate`: preliminary sänkt från N≥20 + 6 mån → N≥10 + 3 mån. Anledning: 3 månader räcker för att se första återköp på enklare branscher.
- `seasonal_variation`: preliminary sänkt från 12 mån → 6 mån. Anledning: 6 mån fångar en säsongs-shift (sommar vs vinter) även om full cykel ej observerad.

Justeringarna gäller Tier C/D-aktivering — påverkar inte Fas 1a-bygget direkt.

**Under min — pattern beräknas INTE.** Inget rad sparas i `business_patterns` förrän tröskeln nås. UI visar "lär mig fortfarande" istället för fejk-tal.

### Confidence-nivåer + UI-presentation

Inspirerat av MarginalCard:

| Confidence | UI-färg | Text-prefix | Tillåtet uttalande |
|---|---|---|---|
| (under min N) | — | Inte synlig alls eller "Bygger fortfarande underlag" | Ingen siffra |
| `preliminary` | slate-grå | "Preliminär:" | "Era deals stänger preliminärt på ~20 dagar (baserat på 10 vunna)" |
| `medium` | slate-700 | "Tidigt mönster:" | "Era deals stänger på 22 dagar (25 vunna)" |
| `high` | emerald | "Bekräftat:" | "Era deals stänger på 22 dagar med ±3 dagar spridning (50+ vunna)" |

**Aldrig grön förrän förtjänad** — samma princip som MarginalCard. "Lärdomar"-vyn i Fas 2 kommer visa confidence visuellt.

### Data-window-policy

Varje pattern har sin egen data-window:

| Pattern | Window | Anledning |
|---|---|---|
| approve_rate | senaste 30d | Färska beslut är mer representativa än gamla |
| deal_cycle | senaste 90d | Snabbare cykel på senare leads visar trend |
| marginal_distribution | senaste 180d | Stabilare mönster, behöver volym |
| sms_response_time | senaste 30d | Kommunikationsmönster ändras snabbt |
| customer_return_rate | senaste 12 mån | Behöver minst en återköpscykel |
| seasonal_variation | senaste 24 mån | Behöver minst två cykler för att se mönster |
| ata_frequency | senaste 12 mån | Tillräcklig volym, fångar säsongsvariation |
| overdue_invoices | senaste 90d | Färska betalningsmönster |

---

## Fas 1a-status (2026-05-30, uppdaterat efter Dag 5)

| Dag | Innehåll | Commits | Tester |
|---|---|---|---|
| 0 | SQL-verifiering av Bee:s data | (utfört av Andreas, rapporterat) | — |
| 1 | `sql/v61_business_patterns.sql` + `lib/patterns/types.ts` | `892a4fd9` | — (typer + schema) |
| 2 | `sample-thresholds.ts` + `exclusions.ts` + sanity-tester | `7ad8ad27`, sanity-fix | 42 |
| 3 | `extract-agent-id.ts` (Commit A) + `approve-rate.ts` (Commit B) + `saveAndPush` refactor (Commit C) + `APPROVE_RATE_EXCLUSIONS` (Commit D) | `ed63ddde`, `7434e074`, `f2b7e1cd` | 90 |
| 4 | `run-patterns.ts` + cron-route + test-route | `cd374ebc` | 103 |
| 5 | `vercel.json`-entry (05:05 UTC) + [`lib/patterns/README.md`](../lib/patterns/README.md) + denna statusuppdatering | (pågående commit) | 103 |
| 6 | `deal-cycle` + `ata-frequency` calculators | ⏳ | — |

**Manuell verifiering mot Bee (2026-05-30, Dag 4):**
- ✓ Test-route triggar `runPatternsForBusiness` korrekt
- ✓ business_patterns-rad skapas: `approve_rate`, sample_size=0, confidence=preliminary, is_stale=true, value=`{overall_rate:null,per_agent:{},overall_n:0}`, metadata.excluded_outliers=0
- ✓ Idempotens: andra triggern UPSERT:ar (1 rad, last_calculated_at tickar)
- ✓ Kill-switch: `agents_globally_paused=true` → `result: { skipped: 'agents_globally_paused' }`

**Bee-state efter Dag 4:**
- 2 pending Lars-approvals (agent_observation, status=pending → exkluderas av resolved-filter i DB-wrapper)
- 0 resolved approvals någonsin för Karin/Daniel/Lisa typed actions
- `approve_rate` blir `is_stale=false` när Christoffer börjar approve/reject 5+ typed actions

---

## Bygg-plan: Fas 1a (5-7 dagar)

**Bygg-ordning enligt Andreas (2026-05-30):** approve-rate → deal-cycle → ata-frequency. Calculators byggs ÄVEN om sample-size är för låg — markerar `is_stale=true` istället för att hoppa över. Visuellt mönstret från MarginalCard:s potential-tillstånd: "lär mig fortfarande".

| Dag | Vad | Resultat |
|---|---|---|
| **0** | **SQL-verifiering av Bee:s data (Del 1A-C queries) — Andreas kör, jag analyserar** | **Faktiska siffror in i designet före tabell-bygge** |
| 1 | SQL `v61_business_patterns.sql` (inkl `is_stale BOOLEAN`) + pattern-typer i `lib/patterns/types.ts` | Tabell + types |
| 2 | Helper `lib/patterns/sample-thresholds.ts` med trösklar + confidence-mappning + is_stale-logik | Epistemic-hygien-gate |
| 3 | `lib/patterns/calculators/approve-rate.ts` — första concrete pattern | Approve-rate beräknas |
| 4 | `/api/cron/patterns/route.ts` — itererar businesses, kör calculators, skriver tabellen | Cron-infrastruktur |
| 5 | Cron-entry i `vercel.json` (05:00 UTC dagligen) + manuell test-route `/api/cron/patterns/test` | Hela flödet körbart |
| 6 | `lib/patterns/calculators/deal-cycle.ts` + `ata-frequency.ts` (Tier A komplett) | Tier A färdig |
| 7 | Dokumentation + manuell test mot Bee + commit + push | Klar |

**Dag 0 = STOPP-punkt.** Andreas kör SQL-queries (sektion nedan), rapporterar siffror. Jag uppdaterar designet med faktisk data-tillgänglighet per Tier A-calculator. Sedan kör vi dag 1-7.

**Tier B/C aktiveras automatiskt** när sample-thresholds nås — calculators skrivs nu, gate:as bakom min N. Inget extra bygge när data räcker.

### Estimat per ytterligare calculator

När Tier B-data räcker (4-8 veckor):
- Per calculator: ~1 dag (datakälla + SQL-aggregering + tester)
- Sample-thresholds: nås automatiskt

### Beroenden för Fas 1a

- **Inga beroenden på pending arbete.** Kan börjas omedelbart.
- **Bee-data räcker för Tier A** (approve-rate börjar imorgon, ata-frequency om project_change har 10+ rader, deal-cycle om Bee har vunna deals).
- **Inte blockerande för pilot-launch** — bygger parallellt med Bee-användning.

### Vad detta INTE är

- ❌ AI-driven pattern-extraktion (Claude för analys) — vi använder ren SQL för Fas 1
- ❌ Real-time uppdatering — dagligt räcker
- ❌ UI för "Lärdomar"-vy — det är Fas 2-arbete
- ❌ Per-pattern personalisering av agent-prompter — det är Fas 2-arbete

### Vad detta ÄR

- ✅ Infrastruktur för pattern-lagring + uppdatering
- ✅ Sample-thresholds som garanterar epistemic hygien
- ✅ Första 3 mönster (Tier A) som faktiskt går att uttala sig om
- ✅ Auto-aktivering av Tier B-D när data räcker
- ✅ Grund för Fas 2 (personaliserade prompter läser dessa)

---

## Beslutspunkter för Andreas — alla godkända 2026-05-30

1. ✅ **Splitta i 1a + 1b**
2. ✅ **Tier A för start** — bygg-ordning approve-rate → deal-cycle → ata-frequency. Calculators byggs även om data är låg, markerar `is_stale=true`.
3. ✅ **Sample-trösklarna** — två kalibreringar gjorda (customer_return_rate, seasonal_variation). Per-business override blir TD.
4. ✅ **Confidence→UI-färg** matchar MarginalCard
5. ✅ **05:00 UTC daglig cron** — utvärdera kapacitet vid 10+ businesses (TD)

## Dag 0 — SQL-verifiering av Bee:s data

Kör denna SQL i Supabase och klistra in resultatet i chatten. Det styr exakt vilka calculators som börjar med `is_stale=true` vs `is_stale=false` redan vid första körningen.

### Block 1 — volym per relevant tabell

```sql
SELECT 'deal' AS tabell, COUNT(*) FROM deal WHERE business_id = 'biz_21wswuhrbhy'
UNION ALL SELECT 'customer', COUNT(*) FROM customer WHERE business_id = 'biz_21wswuhrbhy'
UNION ALL SELECT 'project', COUNT(*) FROM project WHERE business_id = 'biz_21wswuhrbhy'
UNION ALL SELECT 'invoice', COUNT(*) FROM invoice WHERE business_id = 'biz_21wswuhrbhy'
UNION ALL SELECT 'quotes', COUNT(*) FROM quotes WHERE business_id = 'biz_21wswuhrbhy'
UNION ALL SELECT 'quote_items', COUNT(*) FROM quote_items WHERE business_id = 'biz_21wswuhrbhy'
UNION ALL SELECT 'project_change', COUNT(*) FROM project_change WHERE business_id = 'biz_21wswuhrbhy'
UNION ALL SELECT 'sms_log_inbound', COUNT(*) FROM sms_log WHERE business_id = 'biz_21wswuhrbhy' AND direction = 'inbound'
UNION ALL SELECT 'sms_log_outbound', COUNT(*) FROM sms_log WHERE business_id = 'biz_21wswuhrbhy' AND direction = 'outbound'
UNION ALL SELECT 'time_entry', COUNT(*) FROM time_entry WHERE business_id = 'biz_21wswuhrbhy'
UNION ALL SELECT 'pending_approvals_resolved', COUNT(*) FROM pending_approvals WHERE business_id = 'biz_21wswuhrbhy' AND status IN ('approved', 'rejected')
UNION ALL SELECT 'agent_runs_30d', COUNT(*) FROM agent_runs WHERE business_id = 'biz_21wswuhrbhy' AND created_at >= NOW() - INTERVAL '30 days';
```

### Block 2 — Tier A data-skick (approve-rate, deal-cycle, ata-frequency)

```sql
-- approve_rate: hur många approvals per agent + status?
SELECT
  COALESCE(payload->>'agent_id', payload->>'routed_agent') AS agent_id,
  status,
  COUNT(*)
FROM pending_approvals
WHERE business_id = 'biz_21wswuhrbhy'
  AND status IN ('approved', 'rejected', 'edited')
GROUP BY 1, 2
ORDER BY 1, 2;

-- deal_cycle: hur många vunna deals + cykel-tider?
SELECT
  COUNT(*) FILTER (WHERE stage_slug IN ('won', 'vunnen')) AS vunna,
  COUNT(*) FILTER (WHERE stage_slug IN ('lost', 'förlorad')) AS förlorade,
  COUNT(*) AS totala
FROM deal
WHERE business_id = 'biz_21wswuhrbhy';

-- Om vunna >= 10: cykel-statistik
SELECT
  COUNT(*) AS n,
  MIN(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400)::INT AS min_dagar,
  MAX(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400)::INT AS max_dagar,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400)::INT AS avg_dagar
FROM deal
WHERE business_id = 'biz_21wswuhrbhy'
  AND stage_slug IN ('won', 'vunnen');

-- ata_frequency: project_change-fördelning per projekt
SELECT
  COUNT(DISTINCT project_id) AS projekt_med_äta,
  COUNT(*) AS totala_äta_rader,
  (SELECT COUNT(*) FROM project WHERE business_id = 'biz_21wswuhrbhy') AS totala_projekt
FROM project_change
WHERE business_id = 'biz_21wswuhrbhy';
```

### Block 3 — datakvalitet (data-validitetsgränser)

```sql
-- deals: lead_id-täckning
SELECT
  COUNT(*) FILTER (WHERE lead_id IS NOT NULL) AS med_lead,
  COUNT(*) FILTER (WHERE lead_id IS NULL) AS utan_lead,
  COUNT(*) AS totala
FROM deal WHERE business_id = 'biz_21wswuhrbhy';

-- invoices: project_id-täckning (efter Etapp 1-backfill)
SELECT
  COUNT(*) FILTER (WHERE project_id IS NOT NULL) AS med_project,
  COUNT(*) FILTER (WHERE project_id IS NULL) AS utan_project,
  COUNT(*) AS totala
FROM invoice WHERE business_id = 'biz_21wswuhrbhy';

-- projects: budget_amount-täckning
SELECT
  COUNT(*) FILTER (WHERE budget_amount > 0) AS med_budget,
  COUNT(*) FILTER (WHERE budget_amount IS NULL OR budget_amount = 0) AS utan_budget,
  COUNT(*) AS totala
FROM project WHERE business_id = 'biz_21wswuhrbhy';

-- time_entry: project_id + hourly_rate-täckning
SELECT
  COUNT(*) FILTER (WHERE project_id IS NOT NULL) AS med_project,
  COUNT(*) FILTER (WHERE hourly_rate > 0) AS med_rate,
  COUNT(*) AS totala
FROM time_entry WHERE business_id = 'biz_21wswuhrbhy';

-- tidsspann per huvudtabell
SELECT 'deal' AS tabell, MIN(created_at) AS äldsta, MAX(created_at) AS senaste FROM deal WHERE business_id = 'biz_21wswuhrbhy'
UNION ALL SELECT 'invoice', MIN(invoice_date), MAX(invoice_date) FROM invoice WHERE business_id = 'biz_21wswuhrbhy'
UNION ALL SELECT 'project', MIN(created_at), MAX(created_at) FROM project WHERE business_id = 'biz_21wswuhrbhy'
UNION ALL SELECT 'pending_approvals', MIN(created_at), MAX(created_at) FROM pending_approvals WHERE business_id = 'biz_21wswuhrbhy';
```

**Returnera siffrorna här i chatten.** Jag analyserar mot Tier A-trösklarna, uppdaterar dokumentet med faktisk data-tillgänglighet per pattern, sedan kör vi dag 1 (SQL + types).
