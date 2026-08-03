# Plan: Storfirman-paritet — alla funktioner ska fungera lika bra för många anställda som för en

_2026-08-02, Andreas-direktiv efter Etapp 2 (tidrapport-förslag): "det är
kritiskt att vi säkerställer att alla våra funktioner ... fungerar exakt
lika bra för stora företag med många anställda som för en enskild firma."
Full kodrevision (Explore-agent) + teknisk plan (Plan-agent) 2026-08-02,
allt verifierat mot faktisk kod._

## ✅ STATUS 2026-08-03: Etapp 0,1,2,3a,3b,4,5,6,7 BYGGDA + migrationer körda i prod

Kört igenom hela planen autonomt samma dag (Andreas: "Kör igenom alltihop
autonomt och rapportera sedan till mig"). Commits: d97b95a8 (0+1A+2),
d68eb536 (3a), 1e79b2cf (7+3b), bd03f59e (4), 01add9a0 (5), c493a10d
(1B+6). Endast Etapp 8 kvarstår, medvetet — se dess avsnitt längre ner.

**Manuella SQL-steg — KLARA 2026-08-03:**
1. ✅ `sql/v76_time_checkins_business_user_fk.sql` — körd (13 checkins,
   12 matchade, 1 legacy-testdata utan match, som väntat).
2. ✅ `sql/v77_pending_approvals_routing.sql` — körd, verifierad. Live
   pg_policies-kollen (steg 1) visade att prod ALDRIG hade regressionen
   git-historiken antydde (v4:s fem policies var redan korrekt scopade) —
   migrationen omskriven till en konsolidering (5→2 policies: SELECT +
   UPDATE, INTE FOR ALL — ingen ny INSERT/DELETE-yta för klienten) snarare
   än en akut fix. Backfill-koll (steg 1b) hittade 6 ägare utan
   business_users-rad — 4 testkonton + 2 döda/orörda konton (Andreas eget
   testkonto "Elexperten", samt Christoffers FÖRSTA (övergivna) Bee
   Service-konto — det AKTIVA Bee-kontot har redan en korrekt
   business_users-rad, opåverkat). Slutverifiering: exakt tre policies,
   ingen med qual='true'. **Storfirman-paritetsplanen är nu fullt live,
   inte bara mergad.**

**Fynd under bygget (utöver ursprunglig scope, fixade i samma svep):**
- **RLS-regression:** `sql/v15_autopilot.sql` hade av misstag DROP:at
  v4:s RLS-fix och återöppnat `pending_approvals` till `USING(true)` —
  v77 stänger detta på nytt, historiken dokumenterad i migrationsfilen.
- **push/subscribe-buggen:** stämplade ALLTID en prenumeration med
  ÄGARENS auth-uuid oavsett vem som faktiskt subscribade — hade gjort
  Etapp 4:s riktade push till en no-op för alla utom ägaren. Fixad.
- **Bokningsformuläret postar till `/api/actions`, inte `/api/bookings`**
  som planen antog — båda vägarna uppdaterade i Etapp 5.
- **Manuellt skapade bokningar fick aldrig ett dispatch-förslag** —
  planens antagande att bara telefon/Matte-vägen saknade det stämde inte;
  ingen väg hade det. Fixat i båda.
- **Cross-tenant-hål:** `update_booking`/`delete_booking` i `/api/actions`
  filtrerade bara på `booking_id`, aldrig `business_id`. Fixat i samma
  körning som Etapp 5.

## Rotorsak

`getAuthenticatedBusiness()` (lib/auth.ts:117-146) identifierar ALDRIG
vilken anställd som är inloggad — för både ägare och anställd returneras
samma `business_config`-rad med ÄGARENS auth-uuid som `business.user_id`.
Ingen väg genom kön/godkännande-flödet vet vem som faktiskt agerar. Det är
denna lucka — inte enstaka glömda kolumner — som gör att `pending_approvals`
är helt orouterad idag och att flera andra domäner har samma symptom.

`getCurrentUser()` (lib/permissions.ts:124) finns redan och LÖSER detta —
den är bara inte anropad på de flesta ställen som behöver den.

## Två redan-live buggar (inte bara framtida begränsningar)

1. **Projektläckage (säkerhet):** `GET /api/projects`
   (app/api/projects/route.ts:31-49) — `select('*').eq('business_id', ...)`
   utan filter på `project_assignment`/`can_see_all_projects`/
   `can_see_financials`. Returnerar ALLA projekt inkl. budget/ekonomi till
   varje inloggad anställd. Skyddet finns bara klient-sidan
   (app/dashboard/projects/page.tsx:281-288) — trivialt kringgått med ett
   rått API-anrop.
2. **Löneexport (dataintegritet):** `time_entry.business_user_id` läses av
   app/api/time-reports/payroll-export/route.ts:67,69,93 men sätts av
   INGET av de 4 insert-ställena (tool-router.ts logTime, checkin/approve,
   voice/execute, approvals-caset). Tyst fel/tom löneexport per anställd
   för varje flermansfirma redan idag.

## Referensmönster som redan är rätt byggt

`deal.assigned_to` (sql/pipeline.sql:29-30) — lagras som `business_users.id`,
filterbart (`GET /api/pipeline?assigned_to=`), redigerbart
(NewDealModal.tsx:299, teamMembers-prop), använt i kanban-filtrering
(app/dashboard/pipeline/page.tsx). Det här är målbilden för hur
"person-ägande" ska se ut överallt annars.

`project_assignment`-join (app/api/projects/[id]/team/route.ts:35-42) —
återanvänd exakt detta mönster överallt en projekt-teamkoppling behövs.

---

## Etapp 0 — Identitets-plumbing (grund för 3a, 3b, 6, 7)

**Problem:** Ingen route i godkännande-flödet vet vilken anställd som agerar.

- `app/api/approvals/[id]/route.ts` POST-handlern: lägg till
  `getCurrentUser(request)`, 401 om null. Använd `currentUser.id` (inte
  `business.business_id`) för `resolved_by` (rad ~63 lagrar idag ett
  business_id, inte en aktör).
- `app/api/checkin/approve/route.ts`: anropar redan `getCurrentUser` —
  återanvänd `currentUser.id` för `approved_by` (rad ~91 lagrar idag
  `business.contact_name`, en sträng, inte ett id).
- `app/api/voice/execute/route.ts`: saknar helt `getCurrentUser` idag —
  lägg till.

**Storlek:** liten, 2-3 filer, ingen migration.

## Etapp 1 — time_entry.business_user_id sätts vid alla insert-ställen (KRITISK)

**Tier A (skeppas nu, identitet redan tillgänglig på dessa ställen):**
- `app/api/checkin/approve/route.ts:53-58,111-124` — koden joinar redan
  `business_users` via `checkin.user_id` för `hourly_rate`; utöka samma
  select med `id`, sätt `business_user_id` på time_entry-inserten (rad ~111).
- `app/api/approvals/[id]/route.ts` `time_attestation`-caset (rad
  ~745-772) — payload har redan `plTime.user_id` (auth-uuid); samma
  business_users-lookup, sätt på inserten (rad ~761).
- `app/api/voice/execute/route.ts` (rad ~44) — efter Etapp 0:
  `business_user_id: currentUser.id` direkt, ingen join behövs.

**Migration (buntas in här):** `sql/v76_time_checkins_business_user_fk.sql`
— ny nullbar `time_checkins.business_user_id TEXT REFERENCES
business_users(id)`, backfylld via `business_users.user_id =
time_checkins.user_id`, index. Löser TD-1 (tasks/tech-debt.md:38) och tar
bort den ad-hoc-joinen som annars görs på två ställen ovan.

**Tier B (senare, väntar på Etapp 5):** `tool-router.ts` `logTime()`
(rad ~630-654) har ingen anställd-identitet alls i sitt anrop (telefon/
Matte-triggat). Sätt `business_user_id: null` explicit (aldrig sämre än
idag, korrekt utesluter dessa rader ur "säkert attribuerad" löneexport)
tills Etapp 5 ger `booking.assigned_user_id` att falla tillbaka på.

**Storlek:** Tier A liten, 3 filer + 1 migration.

## Etapp 2 — GET /api/projects filtreras korrekt (KRITISK, säkerhet)

- `app/api/projects/route.ts` GET (rad 11-49): lägg till
  `getCurrentUser(request)`. Om `!hasPermission(currentUser,
  'see_all_projects')`: hämta projekt-id:n via `project_assignment`
  filtrerat på `currentUser.id` (samma join-form som team/route.ts:35-42),
  sedan `.in('project_id', ids)` på huvudqueryn.
- Samma route: strippa budgetfält (`budget_amount`, `budget_hours`,
  `actual_amount`) när `!hasPermission(currentUser, 'see_financials')`.
- `app/dashboard/projects/page.tsx:281-288` — klientfiltret blir
  redundant men ofarligt; kan lämnas eller tas bort.

**Storlek:** liten, 1 fil (+ ev. en rad i page.tsx). Ingen migration.
**Skeppas oberoende — högst allvar/insats-kvot i hela planen.**

---

## 🚧 Byggordning

**Körning 1 (nu):** Etapp 2 + Etapp 0 + Etapp 1 Tier A tillsammans — tre
kontenta, i praktiken oberoende delar som stänger båda de redan-live
buggarna på en gång.

**Framtida körningar, i denna ordning:** 3a → 7 → 3b → 4 → 5 → (1 Tier B
+ 6) → 8. Detaljerad spec för varje skrivs in nedan när den körningen
faktiskt påbörjas (undviker att specen blir inaktuell om koden ändras
under tiden).

## Etapp 3a — Kö-routing infrastruktur (KRITISK, strukturell) — ✅ BYGGT (d68eb536)

**Schema** (`sql/v77_pending_approvals_routing.sql`, Andreas kör manuellt):
- `ALTER TABLE pending_approvals ADD COLUMN routing_role TEXT DEFAULT 'any'`
  — `'any' | 'owner_admin' | 'can_approve_time' | 'can_create_invoices' |
  'can_see_financials' | 'project_team' | 'assignee'`.
- `ALTER TABLE pending_approvals ADD COLUMN routed_business_user_id TEXT
  REFERENCES business_users(id) ON DELETE SET NULL`.
- Index: `(business_id, routing_role) WHERE status = 'pending'`.
- Default `'any'` → noll beteendeförändring vid deploy.
- **RLS-policyn skärps**: idag `USING (true)` — inte ens business-scopad i
  databasen. Ny policy: `business_id` måste matcha en `business_users`-rad
  för `auth.uid()`. RLS är den grova bakstoppen (stänger "inte ens
  business-scopad"); per-typ routing-logik ligger i appkod, inte i policyn
  — fragilt/svårtestat annars. OBS: `approvals/page.tsx`,
  `IdagCore.tsx`, `ProjectApprovalsBlock.tsx` frågar Supabase DIREKT från
  klienten (anon key) — detta är deras ENDA access control idag. Server-
  routes (service-role key) påverkas inte av RLS-ändringen.

**Kod:**
- Ny fil `lib/approvals/routing.ts` — ren funktion
  `getRoutingBucket(approvalType): RoutingRole` (uppslagstabell, se 3b).
  `canActOnApproval(supabase, currentUser, approval)` — tunn I/O-wrapper
  runt den (behöver DB för `project_team`-bucketen).
- `app/api/approvals/[id]/route.ts` POST: efter Etapp 0, innan
  `executeApprovalPayload` — anropa `canActOnApproval`, 403 om false.
  Detta är fixen för den bekräftade luckan: execute-endpointen kollar
  IDAG ingen identitet/behörighet alls utöver business_id.
- `four_eyes_quote`: lägg till självgodkännande-spärr — avvisa om
  `currentUser.id === payload.requested_by_user_id` även för ägare/admin.
  Kräver `requested_by_user_id` i payload (app/api/quotes/send/route.ts:341
  lagrar idag bara ett visningsnamn).
- `app/api/approvals/route.ts` GET (redan existerande, oanvänd av de tre
  dashboard-ytorna) — lägg till samma routing-filter. Migrera
  `approvals/page.tsx`, `IdagCore.tsx`, `ProjectApprovalsBlock.tsx` till
  att hämta via denna route istället för direkt Supabase-query (behåll
  Realtime-subscriptionen som "något ändrades, hämta om"-trigger).

**Storlek:** medel — 1 migration, 1 ny lib-fil, 2 route-filer, 3
klientkomponenters fetch-path.

## Etapp 3b — Per-typ routing-utrullning — ✅ BYGGT (1e79b2cf)

Konkret tabell för `getRoutingBucket()`:

| routing_role | approval_type |
|---|---|
| `owner_admin` | four_eyes_quote, four_eyes_project_close, autonomy_offer, publish_microsite, seasonal_campaign, dispatch_suggestion, automation (okänd rule_action_type) |
| `can_see_financials` | price_adjustment, profitability_warning |
| `can_create_invoices` | send_invoice, review_auto_invoice, confirm_payment, invoice_reminder, create_invoice_from_report |
| `can_approve_time` | time_attestation, tidrapport_forslag |
| `project_team` | egenkontroll_foto, egenkontroll_avvikelse, checklist_forslag, job_report |
| `any` (oförändrat) | resten (quote_nudge, send_sms, create_booking, etc.) |

En enradsändring per skapande-ställe (~10 st), var för sig lågrisk
eftersom default är `'any'`. Ingen ny `approval_type` skapas — routing är
ett ortogonalt fält, TYPE_CONFIG-konventionen (3 filer) gäller inte här.

## Etapp 4 — Push-notiser per mottagare — ✅ BYGGT (bd03f59e)

`push_subscriptions.user_id` finns redan och sätts korrekt vid
subscribe-tillfället (app/api/push/subscribe/route.ts:34). `POST
/api/push/send` (rad 36-39) och `sendApprovalPush` (lib/notifications/
approval-push.ts:167-189) filtrerar bara på business_id idag — blastar
till alla. Lägg till valfri `target_user_id`, härledd via
`routed_business_user_id → business_users.user_id` (ALDRIG via
`getAuthenticatedBusiness().user_id`, som alltid är ägaren). Beror på
Etapp 3.

## Etapp 5 — Bokningstilldelning (UI + API) — ✅ BYGGT (01add9a0)

`booking.assigned_user_id` (sql/v17_dispatch.sql:10-11) finns men skrivs
ENDAST av dispatch-godkännande-flödet — ingen UI för manuell tilldelning
existerar alls. `lib/dispatch.ts:119-125`s krockkontroll blir därför
nära no-op. Lägg till: valfritt `assigned_user_id` i POST/PUT
`/api/bookings`, ny `<select>` i bokningsformuläret (samma
teamMembers-datakälla som NewDealModal.tsx), samt `suggestDispatch()`-
anrop i `tool-router.ts createBooking()` (saknas helt idag — telefon-/
Matte-skapade bokningar får aldrig ett dispatch-förslag).

## Etapp 6 — Fakturarader ärver business_user_id — ✅ BYGGT (c493a10d)

app/api/invoices/from-time-entries/route.ts:38-55 tappar
`time_entry.business_user_id` när fakturarader byggs. Beror HELT på
Etapp 1 — ingen mening att bygga innan källdatan faktiskt finns.

## Etapp 7 — Checklista completed_by från session, inte klient-body — ✅ BYGGT (1e79b2cf)

app/api/projects/[id]/checklists/[checklistId]/route.ts:45 litar idag på
klient-skickad `body.completed_by` — spoofbar. Byt till
`currentUser.name`/`.id` från `getCurrentUser(request)`. Litet, oberoende,
kan skeppas när som helst.

## Etapp 8 — Kapacitet per person + Matte-identitet — FRAMTIDA EGEN PLAN

Medvetet dokumenterad v1-begränsning (lib/capacity/week-capacity.ts
säger själv "medvetet FÖRENKLAD för 1-5-mannalag"), inte en tyst bugg.
Matte (app/api/matte/chat/route.ts) har ingen anställd-identitet i sin
chattsession alls — `userName` är bara en klient-skickad hälsningsetikett.
Båda kräver Etapp 5 (riktig per-person-data) och, för Matte, en bredare
titt på hur anställda autentiserar mot chattytan. Startas inte förrän
Etapp 5 är klar — egen plan då.

---

## Stående regler (samma som easoft-gap-plan.md)

- En byggagent åt gången; Andreas speccar/granskar/committar via Claude,
  läser hela diffen, kör tsc + relevanta tester innan commit.
- SQL-migrationer som `.sql`-fil i `sql/`, körs ALDRIG programmatiskt.
- Schema verifieras mot faktisk databas/kod före varje ny query.
- Tidrapport/löne-typer: godkännande ALLTID, aldrig förtjänad autonomi.
- Ingen ny `approval_type` läggs till av denna plan — routing är ett
  ortogonalt fält på befintliga typer.

## DoD per etapp

- tsc + build rena
- Facit-tester på ren logik (routing-tabell, permission-filtrering)
- Etapp 2: manuell verifiering att en begränsad `business_user` faktiskt
  får en begränsad lista från API:t (inte bara UI:t)
- Etapp 3a: RLS-ändringen verifierad direkt i Supabase SQL Editor med
  olika auth-kontext innan appkoden som förlitar sig på den committas
- Etapp 1: stickprov i Supabase att nya time_entry-rader faktiskt får
  business_user_id ifyllt efter deploy
- capability-inventory.md uppdateras per stängd etapp
