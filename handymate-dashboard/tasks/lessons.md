# Lessons Learned

## 2026-08-10: PowerShell 5.1 + git commit -m: inga raka citattecken i meddelandet

**Vad hände:** Ett commit-meddelande med `"Företagsmail → förfrågningar"` i
en single-quoted here-string splittrades vid citattecknen när PowerShell
byggde kommandoraden till git.exe — allt efter första `"` blev pathspecs
("error: pathspec ... did not match"). Committen uteblev tyst medan
föregående kommando i kedjan (git add + första committen) redan körts.

**Root cause:** PS 5.1 escapar inte inbäddade `"` när argument skickas till
nativa program. Here-stringen är literal för PowerShell, men barnprocessens
kommandorad tolkar `"` som quote-gränser.

**Regel:** commit-meddelanden via PowerShell får aldrig innehålla raka
citattecken — skriv om utan, eller använd typografiska »«. Och kedja aldrig
två commits i ett kommando: när del två felar har del ett redan kört, och
felläget blir halvfärdigt-stagat.

## PowerShell Get-Content → Set-Content förstör svenska tecken i UTF-8-filer
- **Symtom (2026-08-06):** Ett `(Get-Content $f -Raw) -replace ... | Set-Content -Encoding utf8`-anrop på en testfil förvandlade alla å/ä/ö till `Ã¥`/`Ã¤`/`Ã¶` genom hela filen. Filen såg oförändrad ut i git-diffen tills man tittade på tecknen.
- **Root cause:** `Get-Content` i Windows PowerShell 5.1 läser en UTF-8-fil UTAN BOM som ANSI (systemets kodsida). Varje flerbytetecken blir då två felaktiga tecken. `Set-Content -Encoding utf8` skriver sedan tillbaka de felaktiga tecknen som giltig UTF-8 — dubbelkodningen är permanent och inget verktyg klagar.
- **Regel:** Använd ALDRIG en Get-Content/Set-Content-rundtur för att redigera projektfiler. Använd Edit-verktyget (eller Write för hela filer) — de hanterar UTF-8 korrekt. PowerShell är för att KÖRA saker, inte för att redigera filer.
- **Kopplar till:** den befintliga Unicode-regeln i CLAUDE.md ("spara alltid filer med UTF-8, riktiga svenska tecken") — det här är det vanligaste sättet att bryta mot den utan att märka det.

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

## 2026-07-22 — Kontrollera aktiva agenter INNAN ny agent startas (självfångad)

Nära-incident: en textstädnings-agent startades medan Motor 2 Etapp 2-agenten
fortfarande ägde arbetsträdet — exakt det tvåagents-misstag som redan står
dokumenterat ovan. Fångades inom sekunder och stoppades innan något skrevs.
Regeln skärps: innan VARJE Agent-start i repot — kontrollera aktivt att ingen
byggagent är igång (todo-listan + senaste agent-notifikationerna). Nya
uppgifter under pågående bygge KÖAS med färdig prompt istället för att
avfyras. En agent = äger repot tills merge, utan undantag.

## 2026-07-30 — Extern regelverkslogik facit-verifieras mot KÄLLAN, inte mot intern konsistens (självfångad)

**Vad hände:** ROT/RUT/grön teknik-avdragen beräknades som procent av
arbetskostnaden EXKL moms — internt helt konsekvent (offert, faktura, PDF,
SKV-fil visade samma siffra), men Skatteverkets regel är procent av
arbetskostnaden INKLUSIVE moms. Kunden fick 20 % för lågt avdrag. Buggen
överlevde flera granskningar just för att alla delar var sinsemellan
konsistenta — och matten var duplicerad på ~19 ställen, så en punktfix hade
aldrig räckt. Hittades först när facit-tester skulle skrivas och basen
ifrågasattes mot skatteverket.se.

**Regel:** (1) All logik som implementerar EXTERNA regelverk (skatteregler,
myndighetsformat, lagkrav) ska ha minst ett facit-test vars förväntade värde
kommer ORDAGRANT från myndighetens eget exempel — intern konsistens bevisar
ingenting. (2) Vid fynd av duplicerad beräkningslogik: fixa aldrig punktvis —
extrahera delad kärna först, byt sedan ut alla anropsställen, och grep-verifiera
att inga fler finns. (3) Momsfrågan ställs alltid explicit vid pengalogik:
är basen inkl eller exkl moms, och vad kräver regeln?

## 2026-07-31 — Bulk-textbyten görs ALDRIG med PowerShell Get-Content (självfångad)

**Vad hände:** en global sky→primary-sweep kördes med PowerShell; Get-Content
läste UTF-8-filerna som Windows-1252 och skrev tillbaka mojibake (å→Ã¥) i 48
filer. Fångades direkt via diff-granskning (68 ändrade rader där 2 förväntades)
och återställdes med git restore innan commit. Dessutom: sed-mönstret
bg-sky-(50|100) utan ordgräns träffade bg-sky-500 (Lisas persona-färg) —
fångades via grep-verifiering efteråt.

**Regel:** (1) Bulk-ersättningar i UTF-8-filer görs med byte-säkra verktyg
(sed via Git Bash), aldrig PowerShell-cmdlets. (2) Efter varje bulk-byte:
granska diff-statistiken per fil — fler ändrade rader än förväntade träffar =
stoppa och inspektera. (3) Regex mot Tailwind-klasser kräver ordgräns eller
exakta suffix — bg-sky-50 är prefix till bg-sky-500. (4) Skyddslistan
(persona-färger, medvetna undantag) verifieras med grep EFTER bytet, inte
bara excluderas i mönstret.

## 2026-08-01 — CREATE TABLE IF NOT EXISTS + namnkrock = tyst fel schema

**Vad hände:** v5_learning_events skapade business_preferences med
profilform; v2-migrationens CREATE TABLE IF NOT EXISTS blev tyst no-op.
All nyckel/värde-kod felade tyst i månader (dag-7-spam var symptomet).
Upptäcktes först när Andreas SQL-körning gav "column a.key does not
exist" — mitt fix-script antog schemat från MIGRATIONSFILEN, inte från
produktionens faktiska tillstånd.

**Regel:** (1) Migrations-SQL som bygger på en befintlig tabell inleds
ALLTID med en schema-verifiering (information_schema-select) med
förväntat resultat dokumenterat — avviker det, avbryt. (2) CREATE TABLE
IF NOT EXISTS är en fälla vid namnkrock: den garanterar att tabellen
finns, inte att den har rätt form. Nya migrationer på "befintliga"
tabeller ska verifiera formen, inte anta den. (3) Tysta ignorerade
DB-fel (catch utan logg / oläst error) gjorde att felet överlevde —
samma lärdom som setBusinessPreference-fixen.

## 2026-08-04: tsc räcker inte som deploy-gate — next build fångar en annan felklass

**Vad hände:** E2a införde renderToStaticMarkup (react-dom/server) i en
lib-fil som konsumeras av API-routes. tsc var grönt i fem på varandra
följande commits — men Next 14:s webpack förbjuder modulnivå-import av
react-dom/server i app-routern, så ALLA Vercel-deployer sedan E2a
failade tyst medan prod körde kvar gammal kod. Upptäcktes först när
Andreas såg failade deployer i Vercel-dashboarden.

**Regel:** (1) tsc och next build fångar OLIKA felklasser — webpack-
regler (importrestriktioner, bundlingsgränser, client/server-gränser)
syns bara i next build. (2) Vid ändringar i lib/-filer som konsumeras av
routes, vid nya importmönster (react-dom/server, server-only-paket) eller
nya npm-beroenden: kör next build lokalt FÖRE push, även när
byggagent-instruktionen säger "ingen build" — den regeln finns för att
undvika onödig tid, inte för att hoppa över deploy-kritisk verifiering.
(3) Efter push av arkitekturella ändringar: verifiera att Vercel-deployen
faktiskt blev grön (Andreas dashboard eller vercel ls) innan nästa etapp
staplas ovanpå — fem etapper hann staplas på en trasig deploy.

## 2026-08-05: Tyst döda automationer — Supabase kastar inte, larmar gör vi själva

**Vad hände:** proactive-care + warranty-followup hade varit döda sedan de
skrevs (fel tabellnamn projects/customers + embed utan FK). Ingen märkte det
på månader. Full audit hittade därefter ~15 ytterligare bevisbart trasiga
punkter i samma felklass (fel tabellnamn, inserts mot NOT NULL utan värde,
okända kolumnnamn, statusvärden som aldrig skrivs, CHECK-brott).

**Varför det var osynligt:** Supabase-js returnerar { data, error } och
kastar ALDRIG — kod som inte läser error misslyckas spårlöst. Cron-svaret
är ändå HTTP 200. console.log/console.error syns bara i Vercels loggkonsol.
Driftlarmet sveper BARA automation_activity — inte v3_automation_logs.

**Regler:**
1. Varje ny .from('tabell') måste verifieras mot sql/-facit (eller körande
   kod som bevisligen använder samma tabell) INNAN den skrivs. Tabellnamnen
   är blandade singular/plural (customer, project, booking, invoice,
   warranty MEN quotes, leads, work_orders) — gissa aldrig.
2. Läs ALLTID error på inserts/updates i flöden utan användare (cron,
   agenter, webhooks) — och rapportera fel via logAutomationActivity
   (status:'failed'), aldrig bara console.log. Det är enda kanalen
   driftlarmet ser.
3. PostgREST-embeds (alias:tabell(...)) kräver FK i PROD — anta aldrig att
   FK finns; kolla sql/v71 eller använd separat batch-hämtning (mönstret i
   lib/agents/hanna/avtal-forslag.ts).
4. Statusvärden: kontrollera vad som faktiskt SKRIVS innan filter byggs
   (quotes: declined inte rejected; booking: completed skrivs aldrig;
   leads har CHECK — update med ogiltigt värde failar tyst).
5. En modul är inte "klar" när den kompilerar — den är klar när dess
   loggrader bevisligen dyker upp i rätt tabell. Verifiera första körningen.

## 2026-08-05: Verifiera hela kedjan, inte bara funktionen du byggde

**Vad hände:** Efter offert-ombyggnaden beställde Andreas en verifiering av
händelsespårningen. Mina egna ändringar var rena — men verifieringen hittade
fyra äldre hål, varav två gjorde två av de planerade funktionerna omöjliga att
bygga ("kunden läser nu" krävde att `opened` faktiskt sattes; förlustanalysen
krävde att `declined_at` sparades). Dessutom var min egen dolj-rad-funktion
läckande: raden filtrerades i renderingen men låg kvar i JSON-svaret, och
fältet fanns inte ens med i select:en — så läckagefixen var verkningslös.

**Regler:**
1. När en ny funktion bygger på befintlig data: verifiera att datat FAKTISKT
   skrivs, i alla vägar in. "Kolumnen finns" är inte samma sak som "den fylls".
2. Ett löfte i UI ("dold för kunden") måste hålla mot DevTools, inte bara mot
   ögat. Filtrera i DATAT, inte bara i renderingen — och kontrollera att
   fältet finns i select:en, annars är filtret en no-op.
3. När samma händelse kan nås från flera ytor (signering, portal, internt):
   lägg kedjan i EN delad funktion från början. Portalens accept saknade
   projekt, deal och bekräftelse i månader för att den var en egen kopia.
4. En status som inte klassificeras någonstans blir osynlig. `pending_approval`
   fanns i varken OPEN/WON/LOST → offerten försvann ur uppföljning, expiry och
   kundportal. Facit-testa att varje SKRIVEN status är klassificerad eller
   medvetet undantagen.
5. Facit-testa funktionens LÖFTE, inte bara dess kod: "dold rad finns inte i
   datat", "saknat inköpspris ger aldrig 100 % marginal", "vi påstår aldrig en
   trend på under 5 observationer".

## 2026-08-06: En kolumnlista i en klient-select är en tickande bomb

**Vad hände:** Bees logotyp syntes aldrig på offerter, trots två tidigare
"fixar". Rotorsaken var att fyra klient-selecter mot business_config begärde
`vat_number` — en kolumn ingen migration skapat. PostgREST 400:ar HELA frågan
när en kolumn saknas, så businessConfig blev null och logotypen föll tillbaka
på initialbokstaven. Commit 69b4bc5b, som SKULLE laga loggan, la in `logo_url`
och `vat_number` i samma select — fixen kunde aldrig fungera.

**Varför det överlevde tre månader:** ingen läste `.error`; företagsnamnet kom
från en annan källa och såg rätt ut, så felet framstod som "bara loggan";
och inställningssidan använder `select('*')` → loggan syntes ALLTID där.

**Regler:**
1. Klient-selecter (anon-nyckeln) mot konfigurationstabeller: använd
   `select('*')`. En kolumnlista gör att ett enda felstavat eller
   icke-existerande fält tystar HELA svaret. Kostnaden för extra kolumner på
   en enradstabell är noll jämfört med den risken.
2. Läs alltid `.error` på Supabase-anrop i UI-flöden. `{ data }` ensamt döljer
   400:or som ser ut som "tom data".
3. När en fix inte biter: misstänk att fixen själv införde problemet. Läs
   diffen på den påstådda fixen innan du bygger en till.
4. Asymmetri är en ledtråd: "syns i inställningarna men inte i offerten" pekar
   på olika DATAVÄGAR, inte på rendering.
5. Verifiera vaktposter genom att återinföra buggen och se testet bli rött.

## 2026-08-06: Bygg inte på en yta kunden aldrig når

**Vad hände:** Tre nya kundfunktioner (referensfoton, frågeruta,
bokningsförslag) byggdes i app/quote/[token] — en sida som redirectar alla
kunder med portal_token till portalen FÖRE rendering. Eftersom quotes/send
alltid skapar en token nådde ingen kund funktionerna.

**Regel:** innan en kundvänd funktion byggs, spåra vilken URL kunden FAKTISKT
får i sitt SMS/mejl och följ alla redirects. "Sidan finns" är inte samma sak
som "kunden hamnar där".

## 2026-08-09: Auditer åldras — verifiera fyndet innan du bygger fixen

**Vad hände:** Tre auditfynd visade sig redan vara åtgärdade vid källkontroll
(X1a:s klassningskontrakt, complete-jobs felkoll, stage-uppslaget via
invoice.project_id), och ett minne påstod att SMS-migreringen återstod fast
den var klar sedan en dag. Att bygga på påståendena rakt av hade dubblerat
arbete och riskerat regressioner i redan lagad kod.

**Regel:** ett audit-/minnespåstående är en HYPOTES med datumstämpel. Grep
källkoden och kör facit FÖRST; är fyndet redan stängt — lås det med ett prov
i stället för att "fixa" det igen. Uppdatera dokumentet/minnet i samma veva,
annars ärver nästa session samma fälla.

## 2026-08-09: Spärrhakar hittar det grepen missar — skriv facitet före svepet

**Vad hände:** Offertbyggarens spärrhake hittade tre direktskrivare och
fakturakällornas spärrhake två, som mina inledande greps missat (fleradiga
kedjor, andra filnamn). Facitet var bättre på inventering än inventeringen.

**Regel:** vid "en väg in"-konsolideringar: skriv den rekursiva
spärrhaken FÖRST och låt den producera trafiklistan. Grep är för att hitta
startpunkten, inte för att bevisa fullständighet.

## 2026-08-09: En policy med två dörrar och ett lås är ingen policy

**Vad hände:** Four-eyes-grinden lagades i PUT /api/projects — och visade sig
sedan kunna kringgås helt via mobilens complete-job, som stängde projektet
utan att fråga. Fixen i första dörren hade invaggat i falsk trygghet.

**Regel:** när en grind/policy läggs på en åtgärd: grep efter ALLA vägar som
utför samma åtgärd (samma tabell + samma statusövergång) innan fixen anses
klar, och extrahera grinden till en delad funktion så nästa dörr inte kan
glömma den.

## 2026-08-13: Att dispatcha subagenter är ett medel, inte ett resultat

**Vad hände:** Fick i uppdrag att bygga hela Golden Path E2E-harnesset (7+
nya filer, djup källgranskning av ~20 filer krävdes först). Dispatchade 5
parallella research-subagenter, skrev tasks/todo.md — och rapporterade sedan
klart/vidare utan att ha skrivit en enda rad av själva harnesset. Andreas
(via koordinatorn) fick påpeka att research-dispatchen bara skulle vara mitt
EGET mellansteg, inte leveransen.

**Root cause:** Blandade ihop "jag har satt igång rätt process" med "uppgiften
är löst". Bakgrunds-subagenter svarar asynkront (notifiering i ett SENARE
varv) — men det är ingen ursäkt för att avsluta turen innan resultatet
faktiskt använts till något. Om inget resultat hunnit komma tillbaka än:
antingen vänta in det inom samma körning, eller (om det är snabbare) göra
research-läsningen direkt själv med Read/Grep, som jag till slut gjorde.

**Regel:** en uppgift är inte klar för att en subagent/skill/tool-anrop är
"på väg" — den är klar när den efterfrågade artefakten (kod, fil, svar)
faktiskt existerar och är verifierad. Innan jag skriver ett `result:`/statusbudskap:
fråga "finns den konkreta leveransen på disk/i svaret just nu, eller har jag
bara startat något som ska leverera den senare?". Om det senare — fortsätt
jobba (vänta in bakgrundsagenter i SAMMA körning, eller gör jobbet själv om
det är enklare) istället för att rapportera ett mellansteg som slutresultat.
