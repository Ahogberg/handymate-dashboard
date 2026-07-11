# Lessons Learned

## business_config.business_id är TEXT, inte UUID
- **Fel 1:** `REFERENCES business_config(id)` → kolumnen heter `business_id`
- **Fel 2:** `business_id UUID REFERENCES business_config(business_id)` → typerna matchar inte (uuid vs text)
- **Rätt:** `business_id TEXT REFERENCES business_config(business_id)`
- **Regel:** business_config har `business_id TEXT` som PK — kontrollera alltid kolumnnamn OCH datatyp innan du skriver REFERENCES/FK

## business_config har INTE en `name`-kolumn
- **Fel:** `SELECT business_id, name, logo_url FROM business_config` → `42703: column "name" does not exist`
- **Rätt:** `business_name`, `display_name`, eller `contact_name` (tre olika kolumner för tre syften)
- **Regel:** Innan jag skriver SQL/query mot en tabell jag inte verifierat → grep efter faktiska kolumnnamn i `from('table').select(...)`-anrop eller i `sql/`-migrations. Aldrig anta att standard-kolumner som `name` finns.

## `(obj as any).field`-cast döljer null-bugs när typen saknar fältet
- **Symtom:** Bee Service-logo visades som "B"-initial trots uppladdad logo i DB. Samma kod-mönster på 14 fält i `liveTemplateData` i [app/dashboard/quotes/new/page.tsx](../app/dashboard/quotes/new/page.tsx) — alla `(business as any).logo_url`, `(business as any).address` etc returnerade `undefined`.
- **Root cause:** `useBusiness()` från [lib/BusinessContext.tsx](../lib/BusinessContext.tsx) returnerar en **minimal `Business`-typ med 7 fält** (business_id, business_name, contact_name, contact_email, subscription_plan, onboarding_step, onboarding_completed_at). `as any`-casten gjorde TypeScript blint för att fältet inte fanns på objektet — alla extra access blev `undefined` → fallback till `null` → "B"-fallback i ModernCanvas.
- **Regel:** När jag ser `(x as any).y` i en data-builder → kontrollera om `x` faktiskt har `y` (kolla typen). `as any` är red flag för dolda undefined-bugs. Hellre: hämta riktig data från DB i en separat fetch och typa objektet, istället för att lita på att context-objektet "borde" ha fältet.
- **Generell:** Context-objekt (useBusiness, useUser, etc) har ofta minimal type. Anta inte att DB-rad = context-objekt. Två olika världar.

## Body-ID-fält måste verifieras mot business_id före INSERT/UPDATE
- **Mönster:** En authenticated route som accepterar `body.customer_id`, `body.project_id`, `body.deal_id`, `body.template_id`, `body.lead_id` etc — och sedan `.insert()` eller `.update()` med dem som koppling — utan att verifiera att ID:t tillhör authenticated business = **cross-business-läckage**. Användare A kan länka sin task/dokument/faktura till Användare B's projekt genom att skicka B's project_id i body.
- **Konsekvens:** Inte bara dataläckage (B's projekt-namn kan ev. visas i A's UI), utan datakorruption (A's data dyker upp på B's projekt-vy om B har "visa alla tasks för projekt"-funktion).
- **Helper:** `verifyOwnership` i [lib/auth/verify-ownership.ts](../lib/auth/verify-ownership.ts) — använd FÖRE varje insert/update där body innehåller fk-id. Hellre 1-2 falska positiva än missade hål.
- **Audit-historik:** Tidigare TD-71/TD-77 hittade 4-5 läckor var där "samma fix borde appliceras på fler ställen". Pilot-audit 2026-05-20 hittade 6 nya. Mönstret återupprepar sig — använd helpern på ALLA nya routes som tar fk-id i body.
- **`.eq('business_id', X).update()` skyddar bara ENTITY-raden** (kan inte uppdatera B's task), men **NYA kopplingar** (sätta A:s task.project_id = B:s project_id) blockas inte av WHERE-filter — UPDATE bara skriver de nya värdena. Måste verifieras separat.
- **Public/token-routes är undantag** — de har egen access-model (sign_token, portal_token) och behöver inte denna check.

## Externa write-API:er kräver explicit sync-status för idempotent retry
- **Symptom:** Fortnox-sync failade tyst, men status='sent' sattes ändå. Användaren tryckte "skicka igen" → dubblett-faktura i Fortnox-bokföring.
- **Anti-pattern:** Sätt local entity-status (`sent`, `done`, etc) FÖRE bekräftat svar från extern service. Skapar dissociering mellan local truth och remote truth.
- **Rätt mönster:** Egen `<service>_sync_status` enum-kolumn med fyra states:
  - `NULL` → ej försökt, retry tillåts
  - `'pending'` → in-flight, blocka retry under timeout (5 min)
  - `'synced'` → bekräftat klart, blocka retry helt (idempotent — returnera befintlig data)
  - `'failed'` → tillåt retry, behåll local status så användaren ser tydligt att action behövs
- **Pre-flight check:** Innan extern POST, läs sync_status. Om `synced` → returnera idempotent-response. Om `pending` < timeout → 409. Om `pending` >= timeout → tillåt (antag in-flight-dödad).
- **Idempotens på extern sida:** Sätt `ExternalReference1: <local_id>` på extern payload (om service stödjer det) → möjliggör framtida GET-lookup för in-flight-recovery.
- **Post-flight automationer (pipeline-flytt, project-stage, notiser) ska BARA triggas vid sync_status='synced'** — annars triggar de på fakturor som inte nådde Fortnox alls.
- **Referens:** [app/api/invoices/[id]/send-via-fortnox/route.ts](../app/api/invoices/%5Bid%5D/send-via-fortnox/route.ts) + [sql/v58_invoice_fortnox_sync_status.sql](../sql/v58_invoice_fortnox_sync_status.sql). Pilot-fix-plan Steg 4, audit 1 B3.

## SQL-kolumner i prod-DB matchar INTE alltid SQL-filerna i `sql/`
- **Symptom (2026-05-30):** Skrev `SELECT bc.billing_plan FROM business_config` → `42703: column "billing_plan" does not exist`. Kolumnen finns i `sql/billing.sql` + `sql/inbox_and_fixes.sql` med `ADD COLUMN IF NOT EXISTS`, men kördes aldrig i prod. Senare migration `sql/v14_consolidate_plans.sql` flyttade till `subscription_plan` som primär källa.
- **Tidigare lessons-rad** ("grep efter faktiska kolumnnamn i `from('table').select(...)`-anrop") är inte tillräcklig — grep mot kod kan visa kolumner som *används* i kod men inte *finns* i prod-DB.
- **Skärpt regel:** För kolumn-existens i prod, kolla **v_*-migrationer i kronologisk ordning** för senaste konsolidering. `IF NOT EXISTS`-pattern garanterar inte att migrationen kördes — bara att den inte failade om den kördes.
- **Säkrast vid osäkerhet:** Be Andreas köra `SELECT column_name FROM information_schema.columns WHERE table_name='X'` innan jag baserar query på antagandet.
- **Generell:** Lessons-raden om kolumn-verifiering ska gälla även när jag SER kolumnen i SQL-filer — `ADD COLUMN IF NOT EXISTS` är inte bevis för att den finns i prod.

## Stripe `subscription_status` är INTE alltid sann mot Stripe-verkligheten
- **Symptom (2026-05-30):** Drog felaktig slutsats att Christoffer "betalar för dött konto" baserat på `subscription_status='active'` på inaktiv business. Verkligheten: Bee har co-founder-gratis-access, ingen Stripe-debitering sker — `subscription_status`-fältet driftade isär från Stripe utan ekonomisk konsekvens.
- **Regel:** Status-fält som *speglar* externt system (Stripe, Fortnox, etc) är inte authoritative — de är cache. Anta inte att de stämmer med externt system utan att verifiera.
- **Innan ekonomisk slutsats:** Fråga om "pengar faktiskt rör sig" är en business-fråga, inte en DB-fråga. Stripe dashboard är sanning, DB är spegel.
- **Generell:** När jag drar slutsatser om kundpåverkan (pengar, faktura, refund) — verifiera grundantaganden (är detta riktig betalande kund? co-founder-comp? trial?) **innan** jag flaggar akut. Andreas's affärsmodell är inte alltid synlig i koden.
- **Loggat som separat TD:** [td-stripe-sync-verification.md](td-stripe-sync-verification.md) — verifiera webhook-sync innan första betalande kund onboardas.

## PostgREST-embeds (`rel:fk_col(...)`) felar TYST när FK saknas — hela queryn dör
- **Symptom (2026-07-09):** Inga projektflyttar fungerade någonsin — manuella stage-klick OCH alla automatiska (bokning, milstolpe, recension, Fortnox-betalning, deal-vunnen). `advanceProjectStage` hämtade projektet med `select('*, customer:customer_id(*)')`, men `project` saknar FK till `customer` i prod → PostgREST avvisar HELA queryn (PGRST200) → `data=null` → koden tolkade det som "project not found" och returnerade tyst → rutten svarade ändå success. 32/33 projekt hade `current_workflow_stage_id=NULL`.
- **Regel:** En embeddad join är ett FK-beroende — den KRÄVER att FK-constrainten finns i prod-schemat, inte bara att kolumnen finns. Nya embeds mot `project`/`deal` (TEXT-id-tabeller utan FK:er) är förbjudna — hämta relaterad data separat (etablerat mönster: pipeline-routens "no FK on deal table").
- **Diagnos-mönster:** "X händer aldrig men inga fel syns" + kod som destrukturerar `{ data }` utan `error` → proba exakta queryn mot prod-REST: `curl '<url>/rest/v1/<table>?select=*,rel:fk(*)&limit=1'`. PGRST200 = saknad FK.
- **Skärpning av tysta-fel-regeln:** `const { data } = await supabase...` utan error-läsning gäller SELECT också — inte bara insert/update. En felande SELECT ser identisk ut med "rad saknas".
- **Ärlighets-regel för rutter:** En route får ALDRIG svara success baserat på att en void-funktion "inte kastade" — funktioner som kan misslyckas ska returnera resultat (`{ moved: boolean, error? }`) som rutten kontrollerar.

## UI-text: interna komponentnamn läcker till användaren (2026-07-11)

**Vad hände:** CashRadar-kortets cold-start visade "Pengar in-radarn bygger din
normal" i prod — internt komponent-/konceptspråk ("radarn", "normal") rakt mot
hantverkaren. Andreas fångade det vid genomgång av prod-dashboarden.

**Regel:** UI-text beskriver vad användaren FÅR, aldrig vad systemet HETER
internt. Feature-/komponentnamn (radarn, digest, agent run) och modellbegrepp
(normal, streak, pipeline-stage) stannar i koden. Dessutom: empty-states för
nya konton ska vara osynliga eller ge handling — ett "kommer snart"-löfteskort
är brus som bygger på-hög-känslan. Granska cold-start/empty-copy som egen punkt
i varje UI-svep.
