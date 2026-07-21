# Motor 1: Lärande prissättning — spec (godkänd av Andreas 2026-07-22)

## Tes
Easofts efterkalkyl är en rapport. Vår agerar: varje stängt projekt fryser
utfall-vs-offert automatiskt, och nästa offert blir bättre av det. Datamoat
som växer per jobb — börjar samla från kund 0.

## Verifierad grund (se utforskningsrapport i git-historiken)
- `lib/projects/compute-economics.ts` = kanonisk realtidsekonomi (tid ur
  time_entry i MINUTER, material ur project_material + supplier_invoices,
  ÄTA ur project_change, ärlighetsflagga arbetskostnad_konfigurerad).
- `lib/quotes/get-quote-budget-derivation.ts` = kanonisk offererad
  tid/material-split (quote_items → JSONB-fallback → total).
- Stängningskrokar: `app/api/projects/route.ts` PUT (~rad 524, efter
  4-eyes-gate!) och `app/api/booking/complete-job/route.ts` (~rad 116) —
  båda kallar redan autoInvoiceOnComplete.
- `pricing_intelligence.avg_margin` är hårdkodad null (pricing-engine.ts:261)
  — luckan Motor 1 fyller.
- Grupperingsnyckel: `project.job_type` (v49, backfillad), sekundärt
  `quotes.template_id` via project.quote_id.
- Insikts-UI-mönster: QuoteNewPriceWarningsBanner (amber banner i quotes/new).
- INGEN frusen efterkalkyl-tabell finns — den är kärnartefakten.

## Steg 1 — Frys utfallet vid stängning
1. **Migration `sql/v73_efterkalkyl.sql`** (Andreas kör manuellt):
   tabell `project_outcome`:
   - id TEXT PK, business_id TEXT NOT NULL, project_id TEXT NOT NULL UNIQUE,
     quote_id TEXT NULL, job_type TEXT NULL, template_id TEXT NULL,
   - offererat: quoted_amount, quoted_hours, quoted_labor_kr, quoted_material_kr,
   - utfall: actual_hours, actual_labor_kr, actual_material_purchase_kr,
     actual_material_billable_kr, ata_signed_kr, invoiced_kr, margin_kr,
     margin_pct, labor_cost_configured BOOLEAN,
   - diffar: hours_diff_pct, amount_diff_pct (NULL när jämförelse saknas),
   - closed_at TIMESTAMPTZ, created_at DEFAULT now().
   Index på (business_id, job_type).
2. **`lib/efterkalkyl/freeze-outcome.ts`**: `freezeProjectOutcome(supabase,
   businessId, projectId)` — hämtar projekt; kör computeProjectEconomics;
   om quote_id: getQuoteBudgetDerivation + quotes.template_id/job_type;
   beräknar diffar (hours_diff_pct = (actual−quoted)/quoted, bara när
   quoted_hours > 0; motsvarande för belopp); UPSERT på project_id
   (idempotent — omstängning skriver om). HELA fail-safe: kastar aldrig,
   loggar fel; om project_outcome-tabellen saknas (migration ej körd) →
   tyst skip med console.error en gång.
3. **Krokar:** anropa freezeProjectOutcome i BÅDA stängningsvägarna direkt
   efter autoInvoiceOnComplete-anropet (efter att status verkligen satts —
   respektera 4-eyes-gaten: körs bara när status faktiskt blev completed).
4. **Lazy backfill:** i insikts-API:t (steg 2) — om completed-projekt med
   quote_id saknar outcome-rad, frys dem on-demand (max ~20 per anrop).
   Ingen separat cron/backfill-knapp behövs.
5. **Projekt-UI:** "Efterkalkyl"-sektion i ProjectEconomicsCard när projektet
   är completed och outcome finns: offererat vs utfall (timmar + kr),
   diff-procent färgkodad (grön ≤0, amber ≤15 %, röd >15 %), ärlig
   tomtext när quote saknas ("Ingen offert kopplad — ingen jämförelse").
   Om arbetskostnad ej konfigurerad: visa timmar-jämförelsen men inte
   marginalen (samma ärlighetsprincip som befintliga korten).

## Steg 2 — Insikten i offertflödet
1. **API `app/api/quotes/efterkalkyl-insikt/route.ts`** (GET, auth via
   getAuthenticatedBusiness): params job_type och/eller template_id.
   Läser project_outcome för businessen (efter lazy backfill, punkt 1.4):
   filtrera på nyckeln, kräv ≥3 utfall med hours_diff_pct ej null.
   Svar: { count, avg_hours_diff_pct, avg_amount_diff_pct, avg_margin_pct,
   sample_job_types }. Under tröskeln: { count, insufficient: true }.
2. **Banner i quotes/new** (mönster: QuoteNewPriceWarningsBanner, ny
   komponent QuoteNewEfterkalkylBanner): hämtas när mall väljs
   (template_id) eller när deal-prefill gav job_type. Visas ENDAST vid
   count ≥3 OCH |avg_hours_diff_pct| ≥ 10 %. Text (Matte-avatar):
   "Dina senaste {count} liknande jobb drog i snitt {X} % över offererad
   tid. Överväg att lägga till marginal i tidsraderna." (eller "under" →
   positiv variant "…gick {X} % snabbare än offererat — du kan ha utrymme
   att pressa priset"). Diskret, avfärdbar per offert (state, ej DB).
3. **pricing_intelligence.avg_margin**: i pricing-engine:s nattliga loop,
   fyll från project_outcome-snittet per job_type när data finns (den
   hårdkodade null:en ersätts). Liten diff, stör inget befintligt.

## Avgränsningar v1
- INGA automatiska prisändringar i mallar/prislista (framtida approval-kort).
- Ingen Lars-observation ännu (bannern är kärnvärdet; observation = v1.1).
- Befintliga price-analysis/pricing-engine rörs minimalt (bara avg_margin).

## Verifiering
- tsc (memory-kommandot) 0 fel + ren build (fortnox-sync-artefakten ignoreras).
- Facit-tester (rena funktioner, mönster tests/kapacitet.spec.ts):
  diff-beräkningen (noll-offert → null, over/under, avrundning) +
  insikts-tröskeln (2 utfall → insufficient, 3 → aktiv).
- Manuellt efter v73: stäng testprojekt → outcome-rad skapas → syns i
  projektets Efterkalkyl-sektion → skapa offert med samma mall/jobbtyp →
  bannern visas (efter 3 stängda).
