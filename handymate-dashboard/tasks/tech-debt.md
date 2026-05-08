# Tech Debt — Handymate

Logg över kända optimeringar och skalproblem som inte är akuta men ska adresseras.

---

## 2026-05-07 — Prompt caching på agent-routen

**Plats:** `app/api/agent/trigger/route.ts`

**Problem:** Varje agent-run laddar full system prompt + business config + memories + agent messages. Vid `MAX_STEPS = 10` skickas hela contexten 10 gånger per run utan caching → linjär kostnad i steg.

**Optimering:** Anthropic prompt caching på system-prompt-blocket. Cache-reads kostar ~10% av cache-writes och TTL är 5 min — perfekt för en agent-loop som körs i ~30 sek totalt.

**Hur:** Lägg `cache_control: { type: 'ephemeral' }` på det stora, statiska blocket av systempromten (business config + tool definitions). Sonnet 4.6 + Haiku 4.5 stöder båda prompt caching.

**Förväntad besparing:** 50–80% input-tokens på multi-step runs.

---

## 2026-05-07 — communication_check fan-out per entitet

**Plats:** `app/api/cron/communication-check/route.ts`

**Problem (verifierat 5/5 16:00 UTC):** Cronen kör `0 16 * * *` daily men loopar internt och fan-outar 16+ agent-runs på 4 minuter — en run per entitet (kund/lead/conversation). Brände 3.97M tokens på Sonnet 4.6 vid bara ~16 entiteter.

**Skalrisk:** Med 100 kunder blir det 100+ runs/dag från ENBART denna cron. Med flera fan-out-crons (`nurture`, `quote-follow-up`, `gmail-lead-import`) multipliceras kostnaden snabbt.

**Audit-frågor när någon rör koden:**
1. Är varje per-entitet-run faktiskt nödvändig, eller kan flera entiteter batch:as i en run?
2. Kan koden filtrera bort entiteter som inte behöver action innan agenten anropas (deterministisk pre-check)?
3. Stora delar av prompten är identiska över entiteter (system prompt, business config) — passa på att aktivera prompt caching samtidigt som batch-logiken införs.

**Mitigering tills vidare (2026-05-07):** Cron-runs använder nu Haiku 4.5 (router i `/api/agent/trigger`), inte Sonnet 4.6 — ~10x billigare per run. Men fan-out-mönstret består.

---

## TD-1 (2026-05-07) — `time_checkins.user_id` borde FK till `business_users.id`

**Plats:** `sql/v17_checkin.sql`, `app/api/checkin/*`, `app/api/time-checkins/route.ts`

**Idag:** Kolumnen är `TEXT` och lagrar auth-UUID:n (`auth.users.id`). Det är inkonsistent med övriga relationsmodeller i appen där `business_users.id` är den stabila per-anställd-identifieraren och auth-UUID:n är ett implementationsdetalj som kan saknas (anställda utan inloggning, framtida SSO m.m.).

**Konsekvens:** Endpoints behöver oversätta auth-UUID ↔ `business_users.id` ad hoc. /api/team/me returnerar `id` (= business_users.id) men /api/time-checkins-param måste vara auth-UUID — friktion för mobilklienten och risk för bugg när någon förväxlar dem.

**Migration:**
1. Lägg till ny kolumn `business_user_id UUID REFERENCES business_users(id)`
2. Backfill: `UPDATE time_checkins t SET business_user_id = bu.id FROM business_users bu WHERE bu.user_id::text = t.user_id`
3. Pre-flight: verifiera 0 rader där `business_user_id IS NULL` efter backfill
4. Uppdatera endpoints (`/api/checkin`, `/api/checkin/checkout`, `/api/checkin/approve`, `/api/time-checkins`) att skriva/läsa via nya kolumnen
5. Markera `user_id` som deprecated, kör i parallell ett tag
6. Drop `user_id` när alla endpoints + mobile + dashboard är migrerade

**Risk:** Auth-UUID → business_users.id-mappingen måste vara komplett innan drop. Anställda som checkat in via legacy-flow utan business_users-rad blir orphans. Säkerhetstest: `SELECT COUNT(*) FROM time_checkins WHERE user_id NOT IN (SELECT user_id::text FROM business_users)` — måste vara 0 innan migration tas vidare.

---

## TD-2 (2026-05-07) — `time_checkins.project_id` borde FK till `project.project_id`

**Plats:** `sql/v17_checkin.sql`

**Idag:** Kolumnen är oconstrained `TEXT`. Ingen DB-validering att värdet faktiskt motsvarar ett existerande projekt — orphan-rader uppstår när projekt raderas men incheckningar är kvar. Konsekvens: `/api/time-checkins`-routens projekt-join faller tyst tillbaka på `project_name = null` för dessa rader, vilket ser ut som "ingen projekttagging" i mobilen.

**Migration:**
1. Pre-flight: hitta orphans — `SELECT id, project_id FROM time_checkins WHERE project_id IS NOT NULL AND project_id NOT IN (SELECT project_id FROM project)`
2. Hantera: `UPDATE time_checkins SET project_id = NULL WHERE id IN (...)` för alla orphans
3. Lägg till constraint: `ALTER TABLE time_checkins ADD CONSTRAINT fk_time_checkins_project FOREIGN KEY (project_id) REFERENCES project(project_id) ON DELETE SET NULL`
4. `ON DELETE SET NULL` är medvetet: när ett projekt raderas vill vi behålla incheckningarna (lönebevis) men släppa kopplingen.

**Risk:** Steg 2 är destruktivt — orphans förlorar sin projekttagging. Acceptabelt eftersom projekttaggen redan är värdelös (refererar till raderat projekt) men dokumentera vilka rader som påverkades.

**Bonus efter migration:** Då fungerar Supabase nested select i `/api/time-checkins` (`select('*, project:project_id(name, customer:customer_id(name))')`) — kan ersätta de två extra round-trips i routen idag.

---

**Båda migrationer:** Kör pre-flight checks i staging först. Inte nu — vänta till Verksamhet & Tid är klart och vi har lugn period.

---

## TD-3 (2026-05-07) — Centralisera datum/tid-hantering med tz-medvetenhet

**Plats:** Hela kodbasen — `grep "toISOString().split('T')[0]"` ger **131 träffar i 75 filer** (frontend, API, lib, scripts).

**Problem:** Ad-hoc datum/tid-konvertering är spritt överallt och nästan alltid fel:
- `new Date().toISOString().split('T')[0]` → ger UTC-datumet, inte lokalt. För en användare i Stockholm vid 23:30 lokal tid (= 22:30 UTC) ger det fortfarande rätt dag, men vid 00:30 lokal tid (= 23:30 UTC dagen innan) får man **gårdagens datum** i en ruta som ser ut att visa "idag". Bug-magneter för rapporter, fakturafält och time-entries.
- `new Date()` utan tz-context i serverkod (Vercel kör UTC) ger andra resultat än samma kod på en lokal dev-maskin (CET/CEST).
- Nuvarande [lib/datetime-defaults.ts:8](handymate-dashboard/lib/datetime-defaults.ts#L8) har själv buggen i `todayDateStr()` — det är seed:en för centralisering men implementationen är fel.

**Plan:**
1. **Bygg `lib/datetime.ts`** med uttrycklig tz-parameter (default `'Europe/Stockholm'`, samma konvention som `/api/time-checkins`):
   - `todayInTz(tz?)` → `'YYYY-MM-DD'` i tz
   - `nowInTz(tz?)` → `'HH:MM'` i tz
   - `zonedMidnightToUtc(ymd, tz?)` → `Date` (UTC-instans för 00:00 lokal)
   - `formatDateInTz(date, tz?, options)` → display-format
   - `parseLocalDateTime(ymd, hm, tz?)` → `Date` (UTC från lokal datum+tid)
   - `addDaysInTz(ymd, days, tz?)` → `'YYYY-MM-DD'` (DST-säker)
2. **Ersätt `lib/datetime-defaults.ts`** med re-exports från nya modulen + deprecation-kommentar.
3. **Migrera anrop:** sweep i batches (frontend, API, lib, agent-tools). Varje batch = en commit. Mobile får inget från detta — bara dashboard-koden.
4. **ESLint-regel** med `no-restricted-syntax` (eller custom rule om `no-restricted-syntax` inte räcker):
   ```json
   {
     "no-restricted-syntax": [
       "error",
       {
         "selector": "CallExpression[callee.object.callee.name='Date'][callee.property.name='toISOString']",
         "message": "Använd lib/datetime.ts (todayInTz/formatDateInTz). new Date().toISOString() ger UTC, inte lokal tid."
       },
       {
         "selector": "MemberExpression[object.callee.object.callee.name='Date'][property.name='split']",
         "message": "toISOString().split('T')[0] ger UTC-datumet — använd todayInTz() från lib/datetime.ts."
       }
     ]
   }
   ```
   (Exakta selektorer behöver finslipas — testa mot `new Date().toISOString().split('T')[0]` och `someDate.toISOString().split('T')[0]`.)
5. **Whitelist:** vissa kontexter ska *medvetet* använda UTC — ex. timestamps i API-payloads, database-fält, idempotency-keys. Markera med `// allow-utc-iso` och låt ESLint-regeln respektera kommentaren via `eslint-disable-next-line`.

**Förväntad effekt:** Ny kod kan inte slinka in samma bug. Befintliga 131 träffar fångas i en dedikerad sweep-PR (eller flera) med visuell verifiering per area. Mobilen behöver inte ändras (skickar tz som query-param redan).

**Risk under sweep:** Vissa anrop ÄR korrekt UTC (databas-keys, idempotency, audit-loggar). Manuell granskning av varje träff krävs — automatisk replace skulle bryta de fallen. Plan: börja med frontend (`app/dashboard/**`) där lokal tid nästan alltid är rätt val, sen API-routes där det blandas, sist `lib/` där det ofta är medvetet UTC.

---

## TD-4 (2026-05-07) — `/api/checkin/approve` saknar permission-check

**Plats:** [app/api/checkin/approve/route.ts](handymate-dashboard/app/api/checkin/approve/route.ts)

**Säkerhetsproblem:** Routen kallar bara `getAuthenticatedBusiness` — vilken inloggad anställd som helst kan godkänna eller avvisa kollegors incheckningar. Mobilens Fas 2 har UI-gating som döljer attesterings-knappar för anställda utan rätt, men servern måste auktorisera oberoende — frontend-gating är inte säkerhet.

**Konsekvens:** En "employee" som har `can_approve_time = false` kan ändå skicka en POST direkt mot `/api/checkin/approve` (curl, modifierad mobile-build, browser dev-tools) och godkänna sin egen tid → skapar `time_entry` med `is_billable: true`.

**Fix (minimal patch):** Följ mönstret från [app/api/time-entry/approve/route.ts:18-21](handymate-dashboard/app/api/time-entry/approve/route.ts#L18-L21):

```ts
import { getCurrentUser, hasPermission } from '@/lib/permissions'

export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentUser = await getCurrentUser(request)
  if (!currentUser || !hasPermission(currentUser, 'approve_time')) {
    return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
  }
  // ... resten oförändrat
}
```

**Risk vid fix:** Owners + admins är okej (de får `true` från `hasPermission` automatiskt). Anställda som hittills kunnat anropa routen får 403 — det är POÄNGEN, men dokumentera i changelog så ingen blir förvånad.

**Också relevant:** Samma audit borde göras för andra time-routes som muterar approvals/state (`/api/checkin/checkout` är okej — anställda får checka ut sig själva). En quick grep på `time_checkins.*update` och `pending_approvals.*update` i route-filer skulle hitta luckor systematiskt.

---

## TD-5 (2026-05-07) — DEV role-toggle är inte en riktig multi-user-test

**Plats:** Mobile-app (DEV-läge), berör alla endpoints med per-user-filter eller permission-check.

**Problem:** Role-togglen i mobilens DEV-läge ändrar bara UI-gating (visar/döljer attesterings-knappar, ändrar synliga vyer). Den ändrar **inte** den underliggande `user_id`/`business_users`-raden — alla anrop skickas fortfarande som samma inloggade konto. Det betyder att:
- `getCurrentUser()` returnerar samma person oavsett toggle-läge
- `hasPermission()` på servern bedöms mot den verkliga rollen, inte den togglade
- Per-user-filter (t.ex. `/api/time-checkins?user_id=...`) använder samma auth-UUID

Konsekvens: Toggle-läget ger en *illusion* av employee/admin-separation. Visuell verifiering räcker för att se att UI-gating fungerar, men kan **inte** bekräfta att RLS, permission-checks eller user_id-filter faktiskt blockerar otillåten access.

**Riktig verifiering kräver två separata inloggade konton inom samma business.** Acceptanstest när Christoffer + Mathias testar skarpt:

1. **Christoffer = owner**, Mathias = employee (`can_approve_time = false`, `can_see_all_projects = false`)
2. Båda checkar in på olika projekt samma dag
3. **Förvänta:**
   - Mathias `GET /api/time-checkins` (utan user_id-param) → endast egna checkins
   - Mathias `GET /api/time-checkins?user_id=<christoffer-uuid>` → 403
   - Mathias `POST /api/checkin/approve` (efter TD-4 är fixad) → 403
   - Christoffer `GET /api/time-checkins?user_id=<mathias-uuid>` → Mathias data (har `see_all_projects`)
   - Christoffer `POST /api/checkin/approve` på Mathias incheckning → 200

**Risk om vi skippar:** Permission-buggar fångas inte i DEV-test eftersom samma användare alltid pratar med routen. När anställda kör appen skarpt kan luckor (som TD-4) leda till otillbörlig access. Säkerhets-egenskaper måste verifieras med riktiga konton, inte UI-togglar.

**Tills dess (interim):** När någon ändrar permission-relaterad routekod, kör manuell `curl` med två olika auth-tokens som smoke-test innan deploy. Lägg gärna in en kort runbook i `tasks/` när Christoffer + Mathias-flowet är klart.

---

## TD-6 (2026-05-07) — Justera tid innan godkännande (Fas 4.5)

**Plats:** Mobile-app (Att attestera-vy) + [app/api/checkin/approve/route.ts](handymate-dashboard/app/api/checkin/approve/route.ts).

**Feature:** Admin/owner ska kunna justera duration innan attestering. Tap på ⋯ på en attesteringspost → modal med duration-input (timmar + minuter) → POST `/api/checkin/approve` med `adjusted_minutes`.

**Status:** Backend stödjer redan detta — [app/api/checkin/approve/route.ts:34](handymate-dashboard/app/api/checkin/approve/route.ts#L34) läser `adjusted_minutes` från body och använder det istället för `checkin.duration_minutes` när time_entry skapas. Inga server-ändringar behövs.

**Vad som saknas:** Bara mobile-UI:n — modal med +/- knappar eller fritext-input, validering (positiv int, rimlig övre gräns), bekräftelse-snackbar.

**Workaround tills dess:** Admin avvisar incheckningen → anställd stämplar in/ut igen med korrekt tid. Klumpigt men fungerar.

**Trigger för att bygga:** När pilot-användare (Christoffer/Mathias eller deras kollegor) börjar fråga efter det. Inte spec-driven prio nu.

**Estimat:** 1–2 timmar mobile-only — modal, en POST-call, snackbar-feedback. Testbar via existerande `adjusted_minutes`-stöd på servern.

---

## TD-7 (2026-05-07) — `time_entry`-tabellen har fyra TEXT-kolumner som borde vara FK

**Plats:** [sql/projects.sql:95](handymate-dashboard/sql/projects.sql#L95), [sql/new_tables.sql:13](handymate-dashboard/sql/new_tables.sql#L13), [sql/time_tracking_expansion.sql:30](handymate-dashboard/sql/time_tracking_expansion.sql#L30), [sql/business_users.sql:78](handymate-dashboard/sql/business_users.sql#L78).

**Idag:** Fyra kolumner på `time_entry` är oconstrained `TEXT`:
| Kolumn | Borde referera | Status |
|---|---|---|
| `project_id` | `project(project_id)` | TEXT, ingen FK |
| `customer_id` | `customer(customer_id)` | TEXT, ingen FK |
| `work_type_id` | `work_type(work_type_id)` | TEXT, ingen FK |
| `business_user_id` | `business_users(id)` | TEXT, ingen FK |

**Konsekvens:** Supabase nested select (`select('*, project:project_id(...)')`) faller med `PGRST200` eftersom PostgREST inte kan resolvera relationen. Tre buggar fångades samma dag i `/api/time-entry`-routen — varje patch flyttade en kolumn till två-query-lookup. Att vissa relations *ibland* funkar i frontend (BillableView, POST-routen) beror på opålitlig PostgREST relationship-discovery via namn-konvention och kan brytas vid valfri schema-cache-refresh.

Samma problem som TD-2 men på `time_entry` istället för `time_checkins`.

**Migration (per kolumn — kör i staging först):**
1. Pre-flight: `SELECT id FROM time_entry WHERE <col> IS NOT NULL AND <col> NOT IN (SELECT <pk> FROM <ref-table>)` — orphans?
2. Hantera orphans: `UPDATE time_entry SET <col> = NULL WHERE id IN (...)`
3. `ALTER TABLE time_entry ADD CONSTRAINT fk_time_entry_<col> FOREIGN KEY (<col>) REFERENCES <ref>(<pk>) ON DELETE SET NULL`
4. Verifiera: relations syns i Supabase Studio under Database → time_entry → relationships

**Ordningsförslag:** börja med `project_id` (störst orphan-risk), sen `customer_id`, sen `work_type_id`, sist `business_user_id`. ON DELETE SET NULL för alla utom ev. business_user_id där man kan vilja ha tightare semantics.

**Bonus efter migration:** GET-routen kan rensas — Promise.all-blocket med 4 separata fetches kan ersättas av nested select (`*, project:project_id(...), customer:customer_id(...), work_type:work_type_id(...), business_user:business_user_id(...)`). Mindre kod, en query istället för fem.

**Risk:** Att hitta orphan-rader i prod-data är arbetet — varje konstighet i historiska imports (Fortnox-sync, manuell SQL) kan ha skapat dem. Förvänta att backfilla med NULL där referensen saknas, INTE radera tidsraden (representerar arbetad tid och lön).

---

## TD-8 (2026-05-07) — `/api/checkin/approve` ärver inte `customer_id` från projektet  *[RESOLVED 2026-05-07]*

**Plats:** [app/api/checkin/approve/route.ts:62-75](handymate-dashboard/app/api/checkin/approve/route.ts#L62-L75)

**Idag:** INSERT på time_entry sätter `project_id` men inte `customer_id` → DB-default NULL kickar in. Resultat: time_entry-rader skapade via GPS-attest har ingen kundkoppling, trots att den anställde valt ett projekt som *har* en kund.

**Konsekvens:** Fakturering, kund-rapporter och customer-LTV missar tid som loggats via GPS-flowet. Fas 5-vyn ("Att fakturera") visar `customer = null` på dessa rader. Också rörande för Fortnox-export och rot/rut-flöden som filtrerar per kund.

**Fix (minimal patch):** Resolva customer från project innan INSERT — projektet har redan kunden satt:

```ts
let customerId: string | null = null
if (checkin.project_id) {
  const { data: project } = await supabase
    .from('project')
    .select('customer_id')
    .eq('project_id', checkin.project_id)
    .eq('business_id', business.business_id)
    .maybeSingle()
  customerId = project?.customer_id || null
}

await supabase.from('time_entry').insert({
  ...,
  project_id: checkin.project_id || null,
  customer_id: customerId,
  ...
})
```

**Risk vid fix:** Om `project.customer_id` är NULL (sällan, men hänt — projekt utan kund) blir time_entry också NULL — det är förbättring jämfört med dagens 100% NULL.

**Backfill för existerande rader:**
```sql
UPDATE time_entry te
SET customer_id = p.customer_id
FROM project p
WHERE te.project_id = p.project_id
  AND te.business_id = p.business_id
  AND te.customer_id IS NULL
  AND te.project_id IS NOT NULL
  AND p.customer_id IS NOT NULL;
```

**Inte blockande för Fas 5.3** — kan göras i en separat PR när någon ändå rör `/api/checkin/approve`. Pilotdatat har dessutom få rader som påverkas eftersom de manuella time_entry-flödena redan sätter customer_id korrekt.

**Update 2026-05-07:** Visade sig vara blockerande — Christoffer kunde inte fakturera (4 pilot-rader hade customer_id=NULL). Fixat: customer_id resolvas från project i `/api/checkin/approve` och INSERT sätter fältet. Backfill för befintliga rader + en faktura (FV-2026-001) i [sql/backfill_pilot_te_customer_id.sql](handymate-dashboard/sql/backfill_pilot_te_customer_id.sql).

---

## TD-9 (2026-05-07) — Kund-sidan läser obefintlig `total_amount`-kolumn på invoice → tyst 0 kr

**Plats:** [app/dashboard/customers/[id]/page.tsx](handymate-dashboard/app/dashboard/customers/[id]/page.tsx) — tre callsites.

**Verifierat 2026-05-07:** Backfill-scriptet [sql/backfill_pilot_te_customer_id.sql](handymate-dashboard/sql/backfill_pilot_te_customer_id.sql) kraschade på `SELECT total_amount FROM invoice` i Supabase SQL Editor → kolumnen finns inte på invoice-tabellen. Rätt namn är `total` (samma kolumn används av [lib/smart-communication.ts:134](handymate-dashboard/lib/smart-communication.ts#L134) och [supabase/functions/scheduled-triggers/index.ts:275](handymate-dashboard/supabase/functions/scheduled-triggers/index.ts#L275)).

**Tre rena `total_amount`-buggar** (utan fallback — så de tyst returnerar `null` från Supabase, sedan rendreras som `0`):
- [customers/[id]/page.tsx:283](handymate-dashboard/app/dashboard/customers/[id]/page.tsx#L283) — invoice-list `.select(... total_amount ...)`
- [customers/[id]/page.tsx:932](handymate-dashboard/app/dashboard/customers/[id]/page.tsx#L932) — "betalat totalt"-stat (`.reduce` på `i.total_amount || 0`)
- [customers/[id]/page.tsx:1308](handymate-dashboard/app/dashboard/customers/[id]/page.tsx#L1308) — invoice-list rad-belopp

**Konsekvens:** Christoffer ser sannolikt 0 kr på alla kunders sidor i dashboard idag. UI ser ut att fungera, men siffrorna är fel — tyst dataquality-bugg.

**Större kodbas-osäkerhet:** `grep -rn total_amount app/ lib/ components/` ger **19 filer**. Många av dessa är legitima (quote, supplier_invoice, travel_entry har faktiska `total_amount`-kolumner). Men flera invoice-routes (mark-paid, status, reminder, send) använder defensiv `invoice.total ?? invoice.total_amount`-fallback — författarna har inte varit säkra på rätt namn. Det fungerar (kraschar inte) men avslöjar att osäkerheten är spridd över kodbasen. customers-sidan saknar denna fallback och därför är den enda som tyst returnerar 0.

**Sweep-PR plan:**
1. Byt `total_amount` → `total` på de tre customers-sidan-callsites
2. Granska de övriga ~16 filerna en och en — om de joinar mot invoice, byt också; om de joinar mot quote/supplier_invoice/travel_entry, lämna
3. Bonus: rensa defensiva fallback (`invoice.total ?? invoice.total_amount`) i invoice-routerna när rätt namn är fastställt — färre `as any`-casts, ärligare typer
4. Verifierings-test: spendera 5 min på en kund-sida i pilot-businessen, jämför mot Fortnox-faktura → siffrorna ska matcha
5. `npx tsc --noEmit` + `npx next build` rent

**Estimat:** 30 min för customers-sidan + 1h för audit av övriga filer = ~1.5h totalt.

**Inte akut för pilot** men borde fixas innan Christoffer demonstrerar dashboard för någon — fakturasummor på 0 kr är besvärligt synligt.

---

## TD-10 (2026-05-08) — Avrundningspolicy för stämpla-tid (öppen produktfråga)

**Plats:** [app/api/checkin/checkout/route.ts](handymate-dashboard/app/api/checkin/checkout/route.ts) (där `duration_minutes` beräknas), [time_checkins-tabellen](handymate-dashboard/sql/v17_checkin.sql).

**Idag:** Tid lagras med ren minutprecision från GPS-stämpling — `Math.round((checkedOut - checkedIn) / 60000)` i checkout-routen. Ingen avrundning, ingen lunch-avdrag, inget minimum.

**Verkligheten i hantverksföretag:** Konventionen varierar per företag och kollektivavtal:
- **6-min intervall** — Byggnads kollektivavtal (1/10-timme)
- **15-min** — kontorskonvention, vanlig i Easoft m.fl.
- **Minimum 1h** vid jourutryckning
- **Automatisk lunch-avdrag** vid pass > 5h (vanligt 30-60 min)

Utan policy blir både fakturering och löneunderlag inkonsekvent — och risk att felställa kollektivavtal.

**Frågor till Christoffer när han testar i fält:**
1. Hur rundar Bee Service tid idag? Manuellt eller via system?
2. Vad är önskemål i Handymate? Ingen avrundning, 6-min, 15-min, eller per-business konfigurerbart?
3. Ska minimum-tid per pass finnas (t.ex. < 5 min ignoreras som feltest)?
4. Lunch-avdrag automatiskt vid pass > 5h, eller låt användaren registrera lunch separat?

**Implementation när policy är klar:**

```sql
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS time_rounding_minutes INTEGER DEFAULT 0,    -- 0=ingen, 6, 15, 30, 60
  ADD COLUMN IF NOT EXISTS min_shift_minutes INTEGER DEFAULT 0,        -- ignorera pass < N min
  ADD COLUMN IF NOT EXISTS auto_lunch_deduction_minutes INTEGER DEFAULT 0;  -- 0=av, 30=halvtimme
```

Avrundning sker i `/api/checkin/checkout` på beräknad `duration_minutes`:
- `time_rounding_minutes > 0` → runda upp till närmaste intervall (gynna anställd) eller närmaste (matematiskt) — *ytterligare produktfråga*
- `min_shift_minutes` → om `duration < min`, sätt `status = 'rejected'` med audit-note (inte tyst kasta)
- `auto_lunch_deduction_minutes` → om `duration > 5h`, dra av N min

**Audit-spår:** `checked_in_at` och `checked_out_at` bevaras med exakt timestamp så avrundningen kan revideras eller revideras tillbaka. UI visar avrundat värde + exakt vid hover.

**Estimat:** 2–3h när policy är klar (3 SQL-kolumner + ~30 LOC i route + UI-toggle). Inte blocking för pilot.

**Status:** Väntar på input från Christoffer + ev. en till pilotanvändare för att se variation. Defaulter ska vara säkra för pilot — `0/0/0` (dagens beteende) tills någon explicit konfigurerar.

---

## TD-11 (2026-05-08) — Nya projekt har `current_workflow_stage_id = NULL`

**Plats:** [app/api/projects/route.ts:140-152](handymate-dashboard/app/api/projects/route.ts#L140-L152) (POST-handler).

**Idag:** INSERT på `project` sätter inte `current_workflow_stage_id` → kolumnen blir NULL. PUT-handlern advansar stage vid `status='active'` (→ ps-03 JOB_STARTED) och `status='completed'` (→ ps-05 FINAL_INSPECTION), men ps-01 (Kontrakt) och ps-02 (Startmöte) hoppas över helt.

**Konsekvens:** Mobile Verksamhet → Projekt-vyn visar nya projekt utan stage-badge ("ej startat"). När projektet aktiveras hoppar det rakt till ps-03 utan att passera ps-01/ps-02 → `workflow_stage_history` saknar de två första entries → progress-bar visar `2/8` direkt utan att någonsin visa `1/8`. Inte fel, men ofullständig stage-historik och dålig narrativ för kunden (kontrakt-signering är en *händelse* som verkligen ska markeras).

För `?include=workflow`-stödet (commit `ce24b1d1`):
- `current_stage_id: null`
- `completed_stages: []`
- `stage_progress: 0`
- `total_stages: 8`

UI-konsekvens: ny rad visas som "0/8 steg klar" med tom badge. Funktionellt men inte värdefullt.

**Två lösningsförslag:**

**Variant A — Route-logik (rekommenderas).** Lägg till i POST-handlern efter att projektet skapats:
```ts
// Default till ps-01 (Kontrakt signerat) om inget annat satts
try {
  const { advanceProjectStage, SYSTEM_STAGES } = await import('@/lib/project-stages/automation-engine')
  await advanceProjectStage(project.project_id, SYSTEM_STAGES.CONTRACT_SIGNED, business.business_id)
} catch (err) {
  console.error('[projects] initial stage default failed:', err)
}
```
Plus: triggar default-automationen för ps-01 (SMS "Vi har mottagit er signerade offert..."). **Detta är troligen oönskat för manuella projekt** som skapas innan kontrakt skrivits — då måste projekt skapas med en annan defaul-stage eller flag som suppressar automation-triggers vid initial create.

**Variant B — DB-trigger med `DEFAULT 'ps-01'`.** Sätt `ALTER TABLE project ALTER COLUMN current_workflow_stage_id SET DEFAULT 'ps-01'`. Enkelt, men:
- Triggrar inte automation (default-värden går inte genom `advanceProjectStage`)
- `workflow_stage_history` skulle behöva backfillas separat
- Påverkar inte befintliga rader

**Rekommendation:** Variant A med en `initial_stage_id` body-param (default `'ps-01'`, kan overrides till `null` om kallaren inte vill ha auto-stage). Och en `skip_stage_automation: true`-flag som hoppar över SMS:et vid initial create — annars riskerar mobilen att skapa projekt och spamma kund.

**Backfill för befintliga pilot-projekt:**
```sql
UPDATE project
SET current_workflow_stage_id = 'ps-01',
    workflow_stage_entered_at = COALESCE(workflow_stage_entered_at, created_at),
    workflow_stage_history = COALESCE(workflow_stage_history, '[]'::jsonb) ||
      jsonb_build_object(
        'stage_id', 'ps-01',
        'entered_at', created_at::text,
        'previous_stage_id', null
      )
WHERE business_id = 'biz_al7pjuu5smi'
  AND current_workflow_stage_id IS NULL;
```

**Estimat:** 30 min route-fix + body-params + commit. Backfill-SQL kan köras direkt när det passar pilot.

**Inte blocking** för Fas 7B — `?include=workflow` returnerar idag korrekta defaults för null-stages (`stage_progress: 0`). Men UI:n blir mer talande direkt om alla projekt har en stage.

---

## TD-12 (2026-05-08) — Mobile/dashboard typed-shape-synkronisering

**Plats:** Mobile-repot (typer för Booking, Project, Deal, Customer, Invoice m.fl.) vs dashboard-repot (server-side TypeScript-interfaces + DB-schema).

**Symptom:** Mobile-Code's audit av Hem + Booking-flödet (2026-05-08) hittade en del fält i mobile-typerna som inte motsvarar dashboardens auktoritativa shape. Det är inte en isolerad bug — det är **ett bredare strukturproblem**: de två repona har separata typer som driftar isär över tid utan compile-time-feedback.

**Tre konkreta exempel som dykt upp under denna sprint:**
1. `time_checkins.user_id` — mobile antog `business_users.id`, dashboarden lagrade auth-UUID (TD-1)
2. `invoice.total_amount` (frontend) — kolumnen finns inte, rätt namn är `total` (TD-9)
3. Booking-shape — mobile-Code's audit-rapport hade fält som inte finns på server-sidan

**Konsekvens:** Tyst dataquality-buggar i frontend (UI visar `0`/`null`/`undefined` där siffror skulle vara), 500:or i prod när mobile skickar fält som routen inte kan parsa, och refactor-rädsla när dashboard-utvecklare inte vet vilka fält mobile faktiskt läser.

**Tre lösningsalternativ (rangordnade):**

**A. Supabase CLI type-generation (rekommenderas).** Generera TypeScript-typer direkt från Supabase-schemat:
```bash
npx supabase gen types typescript --project-id <id> > types/database.ts
```
Båda repona kör samma kommando, har samma `database.ts`. Buggar som "kolumnen finns inte" fångas vid build, inte runtime. Kräver att schemat är källan-till-sanning (vilket det redan ÄR — vi rör DB:n manuellt och bara via .sql-filer i dashboard-repot).

**B. Shared types-paket.** Dashboard exporterar en `@handymate/shared-types`-package (npm/pnpm-workspace eller GitHub-package). Mobile importerar. Mer arbete (publish-flow, version-sync) men ger flexibilitet att ha derived types som inte mappar direkt mot DB.

**C. Auto-generered API contract från OpenAPI spec.** Genererar typer ur en OpenAPI-spec som beskriver routerna. Bäst för kontrakt-baserad utveckling men overkill för en startup i denna fas.

**Pragmatisk plan:**
1. **Kör Variant A** först — billigast (5 min `supabase gen types` setup) och fångar 80% av problemen (alla DB-shape-buggar). Båda repona checka in den gemensamma `types/database.ts` (eller hämta den vid build-tid).
2. **Skriv runbook** för hur man uppdaterar typerna efter en migration: kör `supabase gen types`, commita filen i båda repona.
3. **Senare:** överväg shared-types-paket om derived types (t.ex. response-shapes som joinar tabeller) blir många.

**Inte akut för pilot** men varje sprint vi kör utan typed-sync ackumulerar fler subtila buggar som TD-9. Estimat: 1–2h att sätta upp Supabase type-gen + en `update-types`-runbook + commit båda repona med initial generated file.
