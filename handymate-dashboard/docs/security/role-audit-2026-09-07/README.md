# Rollgränser: lanseringsgranskning 2026-09-07

**Slutsats:** rollavgränsningen kan inte godkännas. Fyra luckor reproduceras i riktiga API-handlers med syntetisk databas och autentiseringskontext. Ingen produktionsdata eller kundkommunikation användes. Detta är granskningsunderlag, ingen säkerhetsfix.

Dashboard-bas: `1858e274cf8e4909724813661cd603d09bd07662`. Mobilens granskade bas: `853f61744e83f2d8006ca2b01e6374aa5164f806` (GitHub-lästa `lib/api.ts` och `lib/user-store.ts`). Senare commits ingår inte automatiskt.

## Befintlig policy

| Område | Ägare | Admin | Projektledare / anställd |
|---|---|---|---|
| Centrala rättigheter | Alla | Alla utom manage_settings | Individuella can_* flaggor |
| Projektlista | Alla firmans | Alla firmans | Tilldelade, om inte see_all_projects |
| Ekonomi | Ja | Ja | see_financials |
| Fakturaskrivning | Ja | Ja | create_invoices |
| Personaladministration | Ja | Ja | manage_users |
| Intern timkostnad | Ja | Ja | Aldrig, även med ekonomibehörighet |
| Attest av dagbok | Ja | Ja | approve_time |

Källor: `lib/permissions.ts`, `lib/CurrentUserContext.tsx`, `app/api/projects/route.ts`, `app/api/team/route.ts`, `app/api/invoices/route.ts`, `lib/diary/permissions.ts`. Detta beskriver befintlig kodpolicy, inte en ny godkänd produktpolicy. Projektledarens företagsroll och `project_assignment.role = lead` är olika saker. Privata uppgifter har särskilda regler även för ägare i `lib/tasks/visibility.ts`.

## Reproducerade fynd

### R1 — Projektdetaljer kringgår tilldelning och lämnar ekonomifält (hög)

`app/api/projects/[id]/route.ts`, GET, kontrollerar företaget men inte projekttilldelning. Anställd och projektledare med alla can_* false och noll tilldelningar får 200. Samma handler returnerar `quote.total = 12000` och `materials[0].total_purchase = 500` från syntetiska poster, trots `prices_redacted: true`. ÄTA och summering strippas, men råa underobjekt gör det inte. Koden returnerar också ofiltrerade time_entries och milstolpar med actual_revenue.

**Acceptans:** kontrollera aktiv medlemsidentitet inom aktuellt företag; neka otilldelat projekt om see_all_projects saknas innan barnfrågor; tillåtet projekt utan see_financials får inga ekonomifält genom project, quote, time_entries, materials, milestones eller summary. Testa även tilldelad PM med ekonomiflagga av/på och ägare/admin. Annat företag ska fortsatt nekas. Använd explicit säker projektion, inte enbart UI-döljning.

### R2 — Projektradering saknar roll-/tilldelningsgräns (hög)

`app/api/projects/route.ts`, DELETE, verifierar företag och att tidrapporter saknas. Ingen medlemsroll eller tilldelning kontrolleras. I provet får både anställd och PM utan rättigheter 200 och åtta simulerade delete-anrop för ett otilldelat projekt. Ägare/admin får samma resultat. Annat företags projekt ger 404 och noll delete-anrop.

**Acceptans:** besluta uttrycklig raderingspolicy; före lansering är owner/admin-only ett konservativt förslag, inte dagens dokumenterade PM-policy. Neka övriga innan första mutation, även när de kan se projektet. Behåll tenant- och tidrapportsskydd. Om PM ska få radera krävs särskilt beslutad rättighet; see_all_projects är inte i sig raderingsrätt. Granska PUT och slutförande separat: dessa kan nå faktureringsflödet.

### R3 — Teamlistan lämnar ut inbjudningstoken (potentiellt kritisk)

`app/api/team/route.ts`, GET, väljer och returnerar invite_token även till anställd och PM utan manage_users. Reproducerat med syntetisk token. `app/api/invite/[token]/accept/route.ts` visar i kod att en giltig, ej accepterad token till en ny e-postadress kan skapa ett konto med valt lösenord och email_confirm=true. Om en sådan inbjudan avser admin kan tokenläckan därför möjliggöra högre behörighet. Inget konto skapades; inga verkliga token eller väntande inbjudningar kontrollerades. Den fulla kontoövertagningskedjan har inte körts.

**Acceptans:** vanliga teamsvar innehåller aldrig invite_token. Eventuell länkhantering ligger bakom uttrycklig serverkontroll för personaladministration och rollhierarki. Testa GET och alla mutationssvar, giltig/utgången/förbrukad token samt mottagare med befintligt konto. Ändra inte själva onboardingprotokollet utan separat granskning.

### R4 — Egen profiländring returnerar dold intern kostnad (hög)

`app/api/team/route.ts`, PATCH, tillåter korrekt egen namnändring men returnerar resultatet från `.select().single()` utan samma kostnadsfiltrering som GET. Syntetisk employee/PM får internal_hourly_cost=350 efter en tillåten namnändring, medan GET korrekt ger null. Detta strider direkt mot filens uttryckliga kostnadspolicy.

**Acceptans:** samma säkra svarsprojektion för GET och PATCH; intern/legacy timkostnad aldrig i employee/PM/kalkylator-svar, även med see_financials. Testa ofarlig egen ändring, nekad ändring av annan person och tillåten owner/admin-ändring. Tillåtna profilfält ska fortsatt fungera.

## Verifiering och begränsningar

Kört från app-roten:

- `node docs/security/role-audit-2026-09-07/reproduce.cjs`: 14 registrerade observationer med verkliga handlerfunktioner och verklig central hasPermission/ÄTA-strippning. Se `observations.json`. Assertions bekräftar dagens beteende, inklusive luckorna; exit 0 betyder att reproduktionen lyckades, **inte** att behörigheten är korrekt.
- `node node_modules/@playwright/test/cli.js test tests/permission-contract.spec.ts tests/facit-tenant-sweep.spec.ts --no-deps --project=chromium --workers=2 --reporter=line`: **60 passed**. Detta är befintliga källkodskontrakt, inte DB-/webbläsar-/nativeprov. De passerar samtidigt som luckorna reproduceras.
- `node docs/security/role-audit-2026-09-07/inventory.cjs`: 585 route-filer och 909 exporterade HTTP-metoder inventerade. CSV listar direkta möjliga kontrollanrop för fortsatt granskning. Antal helpernamn är inget säkerhetsbevis; delegerade kontroller och alias måste följas manuellt.

Reproduktionsdatabasen stöder bara de operationer de valda handlerna använder och modellerar ingen RLS. Autentisering och medlemsupplösning är injicerade, inte integrationstestade. Handlernas verkliga `getServerSupabase` använder service-role (`lib/supabase.ts`), så API-kontrollerna måste själva bära rollgränsen. Ingen tsc/lint/build kördes i detta pass eftersom produktkod inte ändrats. Befintliga sviter utanför den identifierade risken upprepades inte.

## Täckningskarta — inte plattformscertifiering

| Yta | Granskat | Återstår |
|---|---|---|
| Projekt | Lista/detail/delete-kod; detail/delete isolerat provade | PUT/slutförande, filer, material, ÄTA, checklistor, varje skrivväg och tilldelad PM |
| Personal | GET/PATCH isolerat provade; invite accept läst | Invite/reactivering, rolldelegering, inaktivering, sessioner och full kontokedja |
| Ekonomi | Invoices explicita läs-/skrivflaggor lästa | Export, PDF, lön, bilagor och alternativa fakturavägar med olika roller |
| Dagbok/tid/uppgifter | Tilldelnings-, ägarskaps- och attesthelpers lästa | Hela rollmatrisen genom API och UI |
| Godkännanden/agenter | Routing läst: okänd typ går till any; vissa saknade project_id tillåts | Följ varje faktisk åtgärd till exekvering; gate-fynd bevisar inte genomförd fakturering |
| Webb | Central rättighetsmodell jämförd | Direkt-URL, dold meny, användarbyte och återkallad rättighet i körande app |
| Mobil | Gemensamma API-vägar + direkt-Supabase-anrop identifierade | Native-prov som employee/PM/admin, rollcache, DB-/storagepolicies |
| Databas | SQL-/snapshotunderlag identifierat | Färsk faktisk RLS, grants, views/RPC och storage samt rollprov i avskild testmiljö |

Mobilens `lib/api.ts` har direkta datavägar för bland annat booking-material, time_entry, quotes, customers, automation_logs och project-files. Backendens rollprov räcker därför inte för mobil. `lib/user-store.ts` kan behålla en tidigare roll med stale=true vid nätfel; rättighetsåterkallelse måste provas på servern och i UI. Ingen verifierad cacheexploit påstås.

Den äldre produktionssnapshoten från 7 augusti visar dåvarande alltför öppna policies, men senare v96-migrationer finns. Snapshoten får **inte** beskrivas som dagens produktionsläge. Aktuellt DB-tillstånd saknas i denna granskning.

## Rekommenderad byggordning

1. Separat liten säkerhets-PR för teamsvarets token-/kostnadsprojektion (R3/R4). Det är tydliga läckor mot befintlig policy och kräver ingen ny produktyta.
2. Projektgränsen (R1/R2): gemensam tenant-scopad medlems-/tilldelningskontroll, konsekvent ekonomiprojektion och uttrycklig raderingspolicy. Fail closed när medlemsupplösning saknas; granska projektlistans nuvarande `!currentUser`-undantag utan att oavsiktligt stänga ute ägare/legitim impersonering.
3. Kontrollerat prov med separata testidentiteter: owner/admin, PM med av/på-flaggor, employee tilldelad/otilldelad och annan firma. Samma gränser genom webb, mobil, direkt API och DB/storage; inga riktiga kunder.
4. Slutför inventeringen av återstående API-/agentvägar innan någon säger att hela plattformen är korrekt avgränsad.

Detta bör prioriteras före kosmetiska kundupplevelseförbättringar. Granskningen introducerar inga produktändringar och är inget godkännande för lansering.
