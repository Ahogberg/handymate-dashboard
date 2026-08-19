# Leverantörsfakturor — Fortnox-synk + projekt-/UE-koppling

## Bakgrund

Andreas: "ett ordentligt omtag gällande leverantörsfakturor för att säkerställa
att den modulen är tillräckligt välfungerande för att hantera vår synk med
Fortnox... på ett smidigt sätt koppla dem till specifika projekt" samt
underleverantörer, med sikte på att Karin/Lars på sikt ska kunna föreslå
kopplingen automatiskt.

Kartläggning 2026-08-19 visade att detta inte var en enda lucka utan en
fragmenterad landskap: tre parallella, delvis okopplade ställen att
registrera en projektkostnad utanför arbetstid (`supplier_invoices`,
`project_material`, `project_cost`), en död tabell (`subcontractor_assignment`
— rätt fält, noll kod läser/skriver den), och en Fortnox-integration som
aldrig rört leverantörsfaktura-resursen. Ett redan uppmätt problem:
`lib/efterkalkyl/freeze-outcome.ts` har en aktiv spärr
(`material_source_overlap_free`) som blockerar ekonomisk inlärning när
`supplier_invoices` och `project_material` båda har rader på samma projekt,
eftersom de kan registrera samma inköp två gånger. Redan dokumenterat som
TD-79/TD-80 i `tasks/tech-debt.md`, tidigare parkerat i väntan på "3+
pilotkunder som frågar" — lyfts nu direkt.

## Beslut (Andreas, 2026-08-19)

1. **Länka `supplier_invoices` och `project_material`, konsolidera inte.**
   De är genuint olika saker (TD-79:s egen slutsats): fakturanivå/
   bokföring respektive produktnivå/kundfakturering. De länkas så samma
   inköp aldrig räknas två gånger, i stället för att slås ihop till en
   tabell. `project_cost` är en tredje, separat kostnadsväg för
   handskrivna engångsposter — den länkas INTE till något, se "Uttryckligen
   orört" nedan.
2. **En gemensam leverantörskoppling**, inte två separata begrepp.
   `supplier_invoices` kan peka på en registrerad underentreprenör
   (`subcontractor`-tabellen) ELLER stå kvar som fritext för
   materialinköp (Bauhaus, Beijer — inget register finns eller byggs för
   dem i denna omgång).
3. **Fortnox-synken är pull-only.** Fortnox förblir bokföringens källa för
   leverantörsfakturor (e-faktura/skanning sker där) — Handymate hämtar och
   kopplar, skickar aldrig leverantörsfakturor till Fortnox.
4. **V1-matchningen är manuell.** Importerade fakturor hamnar i en kö;
   ägaren väljer projekt + leverantör via dropdown. Kön byggs så att en
   framtida agent-föreslagen matchning (Karin/Lars) kan förifylla SAMMA
   dropdown senare, utan omskrivning av ytan.

## Arkitektur — tre lager, byggs i denna ordning

### Lager 1: Länkningen (datamodell, inga nya sidor)

**`project_material.supplier_invoice_id`** — ny nullable kolumn, FK →
`supplier_invoices(id)` ON DELETE SET NULL (TD-79:s egen skiss). När satt:
den materialradens inköpskostnad är täckt av den länkade fakturan.

**Ny dubbelräkningsregel** i `lib/projects/compute-economics.ts` (och där
`lib/efterkalkyl/freeze-outcome.ts` läser samma underlag): en
`supplier_invoices`-rad räknas i projektets materialkostnad **antingen**
via sina länkade `project_material`-rader (om minst en `project_material`-
rad pekar på den) **eller** som en fristående kostnad (om ingen gör det) —
aldrig båda. `material_source_overlap_free`-flaggan i
`freeze-outcome.ts` uppdateras: den blockerar fortsatt när en OLÄNKAD
`project_material`-rad samexisterar med en OLÄNKAD `supplier_invoices`-rad
på samma projekt (kvarstående verklig dubbelräkningsrisk), men släpper
igenom när raderna är länkade (risken är då bevisat undanröjd, inte bara
gissad bort).

**`supplier_invoices.subcontractor_id`** — ny nullable kolumn, FK →
`subcontractor(id)` ON DELETE SET NULL. Satt → `supplier_name` speglar
`subcontractor.name` för visning men FK:n är sanningen. Null → `supplier_name`
förblir fritext (materialinköp).

**Uttryckligen orört:** `project_cost` (fortsätter fungera för handskrivna
engångsposter, blir inte det rekommenderade flödet framåt men bryts inte),
`subcontractor_assignment` (annat begrepp — bokning/avtal mot en UE, inte
en faktura från en UE; rör den inte, det är en separat framtida funktion).

### Lager 2: Fortnox-synk (pull-only, speglar kundfaktura-mönstret)

Referensmönstret som ska speglas, inte återuppfinnas:
`lib/fortnox.ts` (`fetchFortnoxInvoicePages`, `fortnoxRequest`,
`refreshTokenIfNeeded`), `lib/fortnox/map-invoice.ts` (ren mappningsfunktion,
dedupnyckel på Fortnox dokumentnummer), `app/api/integrations/fortnox/
import/invoices/route.ts` (dedup-set mot befintliga
`fortnox_document_number`, per-rad felisolering i `errors[]`, aggregatlogg
via `logFortnoxOperation`).

**Nya delar:**
- `getFortnoxSupplierInvoices()` i `lib/fortnox.ts` mot Fortnox
  `SupplierInvoice`-resursen (`GET /3/supplierinvoices`), paginerad som
  `fetchFortnoxInvoicePages`.
- **Scope-gap (viktigt fynd):** dagens OAuth-scope
  (`invoice customer companyinformation`, se `app/api/integrations/
  fortnox/connect/route.ts`) saknar rättighet för `SupplierInvoice`-
  resursen. Redan anslutna konton måste **återansluta** Fortnox för att
  bevilja det utökade scopet — import-rutten ska känna igen ett
  scope-relaterat 403 från Fortnox specifikt och svara med en tydlig
  svensk text ("Återanslut Fortnox för att hämta leverantörsfakturor"),
  inte ett generiskt fel.
- `lib/fortnox/map-supplier-invoice.ts` — ren, testbar
  `mapFortnoxSupplierInvoice(fi, today)`, samma form som `map-invoice.ts`:
  dedupnyckel på Fortnox dokumentnummer, härledd status (betald/obetald/
  förfallen) ur `Balance`/`DueDate`.
- Nya kolumner på `supplier_invoices`: `fortnox_supplier_invoice_number`
  (dedupnyckel), `fortnox_supplier_number` (Fortnox egen leverantörsreferens
  — separat från vår `subcontractor_id`, håller framtida ommatchning
  stabil), `fortnox_synced_at`.
- Ny rutt `app/api/integrations/fortnox/import/supplier-invoices/route.ts`
  — samma form som `import/invoices`: dedup-set, hämta+mappa+infoga,
  `{imported, skipped, total, errors}`. Alla nya rader börjar med
  `project_id = NULL` och `subcontractor_id = NULL` — Lager 3:s jobb.
- **UI:** fogas in som ett tredje steg i den befintliga "Hämta
  historik"-knappen (`app/dashboard/settings/integrations/page.tsx`,
  `handleFortnoxImportHistory`: kund → kundfaktura → leverantörsfaktura)
  — ingen ny knapp.
- **Cron:** `app/api/cron/fortnox-sync/route.ts`s betalstatus-loop utökas
  att även friska upp leverantörsfakturornas betald/obetald-status, samma
  per-business-felisolering som redan finns.
- Manuell registrering (dagens "Leverantörer"-flik, `SupplierInvoiceModal`)
  rörs inte funktionellt — fortsätter skapa rader, nu bara med
  `fortnox_supplier_invoice_number = NULL` (lokalt skapad, aldrig synkad).

### Lager 3: Matchningskön (Karins sida)

Ny yta på Karins sida (`app/dashboard/karin/page.tsx`) — inte
projektsidan, eftersom importerade fakturor saknar projekt vid ankomst.
Placeringen är medveten: när agent-föreslagen matchning byggs senare blir
det Karin som föreslår kopplingen på exakt samma yta, samma
kort-till-godkännande-mönster som resten av huset (mission-förslag,
jobbpass-förslag, experiment-förslag) — ingen omflyttning av UI:t krävs då.

Kön (ny rutt `app/api/karin/supplier-invoices/route.ts`, GET/PATCH):
- GET listar `supplier_invoices` med `project_id IS NULL` för businessen.
- Varje kö-rad visar: fakturadatum, leverantör (Fortnox-namn eller
  UE-träff), belopp, två val: **Projekt** (dropdown, aktiva/nyliga projekt)
  och **Leverantör** (sök i `subcontractor`-registret, eller "annan
  leverantör: fritext" som skriver `supplier_name` direkt).
- PATCH sparar `project_id` + (`subcontractor_id` ELLER uppdaterad
  `supplier_name`) — samma auth-grind som befintlig
  `app/api/supplier-invoices/route.ts` (`see_financials`-behörighet,
  `getAuthenticatedBusiness`).
- Sparad rad försvinner ur kön, syns nu i projektets befintliga
  "Leverantörer"-flik (`app/dashboard/projects/[id]/page.tsx`) precis som
  manuellt registrerade fakturor gör idag.
- Räknare (kö-längd) på Karins nav-post, samma idiom som "unlinked"-
  räknaren kundfaktura-importen redan visar.

## Uttryckligen utanför denna omgång

- Agent-föreslagen matchning (Karin/Lars) — Lager 3:s kö är byggd för att
  ta emot ett förslags-lager senare utan omskrivning, men det lagret
  byggs inte nu.
- Att skicka leverantörsfakturor TILL Fortnox (push).
- Ett riktigt materialleverantörsregister (Bauhaus/Beijer som riktiga
  rader) — fritext består för icke-UE-leverantörer.
- Sammanslagning av de tre kostnadstabellerna till en.
- `subcontractor_assignment` (bokning/avtal-begreppet) — orört, egen
  framtida funktion.

## Testning (tyngdpunkt på pengakorrekthet)

- `mapFortnoxSupplierInvoice` — rena enhetstester (dedupnyckel null →
  skip, betald/obetald/förfallen-härledning), samma idiom som
  `map-invoice.ts`s befintliga tester.
- Import-rutten — dedup-idempotens (andra körningen importerar noll nya),
  per-rad felisolering (en trasig rad stoppar inte batchen), scope-
  felmeddelandet.
- **Dubbelräkningsregeln** i `compute-economics.ts`/`freeze-outcome.ts` —
  egna facit: en länkad `supplier_invoices`-rad räknas EN gång (via
  `project_material`, inte separat), en olänkad räknas som fristående
  kostnad, `material_source_overlap_free` grönar korrekt vid länkning och
  blockerar korrekt vid kvarstående olänkad överlappning. Detta är den
  ekonomiskt känsligaste delen av hela bygget och ska ha starkast
  testtäckning.
- Matchningskön — PATCH skriver rätt FK:er, fritext-vägen, raden lämnar
  kön efter sparning, källskanning att GET aldrig läcker interna
  marginalfält (samma disciplin som övriga kundvända ytor i huset).
- `tests/permission-contract.spec.ts` — registrera de nya rutterna
  (`import/supplier-invoices`, `karin/supplier-invoices`) under rätt
  behörighetsdomän.

## Migrationer

Byggs en per lager, körs av Andreas efter varje etapps oberoende
verifiering (samma disciplin som hela sessionens tidigare arbete).
Nästa lediga migrationsnummer avgörs vid byggtillfället (v160 senast
tagen 2026-08-19 kväll) — hårdkodas inte här eftersom numret rör sig
snabbt i det delade repot.

- Lager 1: `project_material.supplier_invoice_id`,
  `supplier_invoices.subcontractor_id`.
- Lager 2: `supplier_invoices.fortnox_supplier_invoice_number`,
  `fortnox_supplier_number`, `fortnox_synced_at`.
- Lager 3: inga nya kolumner (läser/skriver befintliga fält).

## Öppen implementationsdetalj (löses i planeringsfasen, inte här)

Exakta Fortnox API-fältnamn för `SupplierInvoice`-resursen
(dokumentnummer-fältets exakta namn, hur leverantörens namn hämtas —
sannolikt via ett `SupplierNumber` → `GET /3/suppliers/{number}`-
uppslag, likt hur kundfakturor slår upp `CustomerNumber`) verifieras mot
Fortnox live API-dokumentation vid byggtillfället för Lager 2, inte
gissas här.
