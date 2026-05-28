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
