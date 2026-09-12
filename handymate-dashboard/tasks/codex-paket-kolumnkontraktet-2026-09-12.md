# Codex-paket: kolumnkontraktet får databasen som facit

**Status:** revision 2 (2026-09-12, efter Codex läsgranskning). Klar att
delas ut. Avgränsat, mekaniskt, inga designbeslut kvar att ta.

**Revision 2 i korthet.** Codex fem fynd var alla riktiga och verifierade mot
koden. AK3 låste inte databastäckningen (bara facit-täckningen), del D kunde
inte se Fortnox-fallet eftersom parsern släpper `ALTER TABLE` för tabeller
utan `CREATE TABLE`, läsvägen var underspecificerad, invarianten "snapshoten
vinner alltid" motsades av `PRODUKTIONSVERIFIERADE_KOLUMNER`, och ägarlistan
saknade en fil del D kräver. Två av fynden krävde ett beslut och inte bara
skärpt text: läsvägen är nu byggd (`sql/v234_schema_columns_snapshot.sql`,
applicerad) och regeln för historiska SQL-definitioner är fastslagen (§2 del
C). Siffrorna är också rättade: 255 tabeller, inte 267 — skillnaden var vyer.
**Ägare:** Codex (implementation). Claude granskar diffen.
**Rör INTE:** produktionsbeteende. Inga rutter, ingen UI, inga migrationer
utöver de som uttryckligen begärs i AK7.

---

## 1. Varför paketet finns

Tre fynd den 12 september 2026, alla samma felklass: **koden skriver eller
läser en kolumn som inte finns, `supabase-js` kastar aldrig, och felet lever
i månader.**

| # | Var | Vad | Hur länge |
|---|---|---|---|
| v229 | `reset_demo_tenant` (PL/pgSQL) | `UPDATE business_config SET fortnox_token_expires_at = NULL` — kolumnen finns inte | Demoåterställningen hade **aldrig** fungerat; fyra auditrader, alla `delete_transaction_failed` |
| v233 | `lib/seed-defaults.ts` + `app/api/checklists/templates/route.ts` | `INSERT INTO checklist_template (category, is_default)` — inga av kolumnerna finns | Noll företagsegna checklistmallar på **samtliga** konton sedan februari |
| — | `app/api/cron/missed-revenue/route.ts` | `select('id')` på `project_change` (nyckeln heter `change_id`) | Intäktssvepet skapade aldrig ett kort; hittades 2026-08-07 |

Det tredje fyndet är anledningen till att `tests/column-contract.spec.ts`
byggdes. **Den vakten finns alltså redan, ligger i kontraktsgrinden, och
släppte ändå igenom v233.** Det är det som gör paketet värt att göra nu.

### Varför den befintliga vakten missade v233 (läs detta först)

`buildColumnFacit()` i `tests/column-contract.spec.ts` bygger sitt facit ur
`sql/`: `CREATE TABLE` + `ALTER TABLE ... ADD COLUMN`. Sedan **skriver den
över** facit för de tabeller som finns i
`tests/fixtures/production-schema-columns.json`.

`sql/rot_rut_documents.sql:102` deklarerar:

```sql
CREATE TABLE IF NOT EXISTS checklist_template (
  id TEXT PRIMARY KEY, business_id TEXT, name TEXT NOT NULL,
  category TEXT, items JSONB NOT NULL DEFAULT '[]',
  is_default BOOLEAN DEFAULT false, branch TEXT, created_at TIMESTAMPTZ
);
```

Men produktionstabellen skapades **för hand** i Supabase-dashboarden (de fyra
systemmallarna är daterade 2026-02-10) med en annan form:
`description`, `branch`, `is_system` — ingen `category`, ingen `is_default`.
`CREATE TABLE IF NOT EXISTS` blev en tyst no-op mot en tabell som redan fanns.

Facit sa alltså att kolumnerna finns. Koden skrev dem. Provet blev grönt.
Databasen svarade `42703` vid varje anrop, i månader.

**Slutsatsen, och paketets hela premiss: repots deklarerade schema är inte
facit. Databasen är facit.** Snapshoten täcker i dag **6 av 267** tabeller
(`business_config`, `pipeline_automation`, `project_document`,
`call_recording`, `ai_suggestion`, `project`). `checklist_template` var inte
en av dem, så den felaktiga sql-filen vann.

Mekanismen för att låta databasen vinna finns redan — den behöver bara
täcka allt, och den behöver kunna hållas färsk.

---

## 2. Vad som ska göras

### Del A — snapshoten täcker allt koden rör

Vidga `tests/fixtures/production-schema-columns.json` från 6 tabeller till
**varje tabell som `app/` eller `lib/` läser eller skriver**. Produktionen har
**255 tabeller och 3 701 kolumner** i `public` (räknat 2026-09-12 med
funktionen i del B; `information_schema.columns` ger 267/3 886 eftersom den
räknar med vyer, som inte hör i ett tabellfacit). Täck minst de tabeller
vakten faktiskt möter — helst alla 255.

Filformatet är oförändrat:

```json
{ "verified_at": "2026-09-12", "source": "…", "tables": { "tabell": ["kol", …] } }
```

Snapshoten är redan auktoritativ i koden (`facit.set(...)` skriver över
sql-facit per tabell) — den delen ska inte byggas om.

### Del B — ett skript som genererar snapshoten

**Läsvägen är beslutad och redan byggd.** `sql/v234_schema_columns_snapshot.sql`
är applicerad i produktion och verifierad: funktionen
`public.schema_columns_snapshot()` returnerar

```json
{ "generated_at": "…Z", "table_count": 255, "column_count": 3701, "tables": { … } }
```

Den läser `pg_catalog` direkt och tar **bara riktiga tabeller** — `relkind`
`r` och `p`, alltså inga vyer, materialiserade vyer eller främmande tabeller.
Systemkolumner och droppade attribut utesluts. `STABLE`,
`SECURITY INVOKER`, ingen skrivning; `EXECUTE` är återkallad från `PUBLIC`,
`anon` och `authenticated` och given bara till `service_role`.

Det var ett medvetet val att inte använda PostgREST:s OpenAPI-schema, som
dagens 6-tabellsfil anger som källa: det omfattar även **vyer**, beror på
nyckelns rättigheter och kan vara inaktuellt genom PostgREST:s schemacache.
Ett facit som tyst kan vara ofullständigt är precis den felklass vakten finns
för. `information_schema` går inte att läsa direkt över PostgREST.

`scripts/schema-snapshot.mjs`:

- anropar `POST /rest/v1/rpc/schema_columns_snapshot` med service-role-nyckeln;
- kräver `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` och
  **avbryter med exit ≠ 0 och ett tydligt fel** om de saknas eller svaret
  inte går att tolka;
- **vägrar skriva ett magrare facit över ett fetare.** Före skrivning:
  `table_count` och `column_count` ur svaret ska båda vara ≥ 95 % av vad den
  befintliga filen innehåller, annars avbryts körningen med ett fel som
  namnger båda talen. Ett svar som tappat halva schemat på grund av
  rättigheter eller en avbruten begäran får aldrig bli det nya facit;
- skriver bara `tests/fixtures/production-schema-columns.json`, gör inga
  DDL-anrop och rör ingen radata.

Nycklarna finns inte i utvecklingsmiljön där paketet skrevs. Skriptet körs av
Andreas lokalt eller av ett CI-jobb med hemlighet — det ska stå i filhuvudet.

### Del C — SQL-funktionernas kroppar omfattas

Vakten läser i dag bara TypeScript i `app/` och `lib/`. v229 låg i en
PL/pgSQL-funktion och var därför osynlig för den.

Utöka skanningen till `sql/`-filernas funktionskroppar:

- `INSERT INTO <tabell> (<kolumnlista>)`
- `UPDATE <tabell> SET <kolumn> = …` (även flera kolumner per sats)
- jämför mot samma facit som TypeScript-referenserna.

`SELECT`-satser i SQL får lämnas utanför i detta paket (alias, CTE:er och
joins gör dem dyrare att tolka än de är värda här) — men det ska stå i
filhuvudet att de medvetet inte omfattas, så nästa läsare inte tror det.

**Bara den AKTUELLA definitionen av varje funktion räknas.** `sql/` är en
append-only migrationslogg: `sql/v155_demo_reset_v2.sql:293` och
`sql/v158_demo_reset_v3.sql:263` innehåller båda den felaktiga
`fortnox_token_expires_at = NULL`-satsen, men bara v158 motsvarar den
deployade funktionen. Att rapportera v155 vore att rapportera historia som
en bugg, och en vakt som gör det slutar man läsa.

Två tabellmängder ska dessutom hoppas över i SQL-skanningen:
`pg_catalog`-tabeller (`sql/v234_schema_columns_snapshot.sql` läser `pg_class`
och `pg_attribute` — de är inte applikationstabeller) och tabeller i andra
scheman än `public`.

Regeln, som ska stå i koden: för varje `CREATE OR REPLACE FUNCTION <namn>`
är det **filen med högst `vNNN`-prefix** som definierar funktionen som
räknas; äldre definitioner av samma funktionsnamn hoppas över. Filer utan
`vNNN`-prefix (`sql/fortnox_integration.sql`, `sql/agent_tables.sql` och
liknande) betraktas som aktuella, eftersom de inte är versionerade steg i
loggen. Provet ska skriva ut hur många definitioner som hoppades över som
historiska, så regeln går att granska i stället för att bara tros på.

### Del D — avvikelse mellan sql/ och databasen rapporteras

När snapshoten och `sql/` beskriver samma tabell olika är **någon av dem
fel**, och i dag försvinner det i tysthet.

**Jämför INTE bara facit före och efter snapshotöverskrivningen.** Det
fångar inte legacy-tabellerna, och det är just dem det gäller:
`buildColumnFacit()` hoppar över varje `ALTER TABLE` vars tabell saknar
`CREATE TABLE` i `sql/` (`tests/column-contract.spec.ts:105`,
`if (!facit.has(tabell)) continue`). `business_config` har ingen
`CREATE TABLE` i repot, så dess ALTER-deklarerade kolumner kommer aldrig in
i facit — och Fortnox-lögnen nedan hade förblivit osynlig.

Del D behöver därför en **egen** insamling av sql-deklarerade kolumner, som
tar med `ALTER TABLE ... ADD COLUMN` även för tabeller utan `CREATE TABLE`,
och jämför den mot snapshoten. Den insamlingen får inte ändra vakten eget
facit — den finns bara för den här jämförelsen.

Lägg ett prov som listar tabeller där sql-deklarationerna har kolumner som
snapshoten inte har. Varje sådan tabell ska antingen rättas i `sql/` eller stå i en
storlekslåst, kommenterad lista med skäl.

Två kända fall, båda `IF NOT EXISTS`-satser som tyst aldrig tog:

1. `sql/rot_rut_documents.sql:102` — `CREATE TABLE IF NOT EXISTS
   checklist_template` beskriver en tabell som inte existerar i den formen.
2. `sql/fortnox_integration.sql:9` — `ALTER TABLE business_config ADD COLUMN
   IF NOT EXISTS fortnox_token_expires_at`. Kolumnen finns **inte** på
   `business_config` i produktion; den bor på
   `business_integration_credentials`. Det är den här raden som fick v229 att
   skrivas, och den ligger kvar och ljuger för nästa läsare.

**Rätta båda filerna** — det är tydligare än ett undantag. Notera att fall 2
inte träffar TypeScript i dag: `business_config` ligger redan i snapshoten,
och den enda kod som skriver fältet gör det mot rätt tabell
(`app/api/admin/demo-fortnox-sim/route.ts:368`). Det är alltså sql-filen, inte
koden, som är fel.

---

## 3. Filer paketet äger

```
tests/column-contract.spec.ts                       (utökas)
tests/fixtures/production-schema-columns.json       (vidgas — genereras)
scripts/schema-snapshot.mjs                         (ny)
sql/rot_rut_documents.sql                           (rättas, del D fall 1)
sql/fortnox_integration.sql                         (rättas, del D fall 2)
sql/v234_schema_columns_snapshot.sql                (finns redan — läs, ändra inte)
package.json + ../.github/workflows/contracts.yml   (bara om ny spec-fil läggs till)
```

Två uttryckliga undantag från avgränsningen, båda redovisade i rapporten:

1. **AK7:s kodrättningar.** En kolumnavvikelse där koden bevisligen använder
   ett gammalt namn rättas i den filen, oavsett att den inte står ovan.
2. **Del D:s sql-rättningar**, alltså de två filerna i listan.

Allt annat är ett **fynd som rapporteras**, inte en fix i det här paketet.

---

## 4. Invarianter

1. Vakten körs **utan databasåtkomst**. CI har inga nycklar; facit är den
   incheckade snapshoten.
2. Där snapshoten har tabellen vinner snapshoten över `sql/`. Alltid — och
   det gäller även undantagslistorna. Så är det inte i dag:
   `PRODUKTIONSVERIFIERADE_KOLUMNER` kontrolleras FÖRE `kolumner.has(...)`
   (`tests/column-contract.spec.ts:495-500`) och släpper alltså igenom en
   referens även när snapshoten säger att kolumnen inte finns. Listans fyra
   poster ligger på `project_checklist` och `project_log`, som inte är i
   dagens 6-tabellssnapshot — men när täckningen vidgas blir de en maskering
   av en verklig avvikelse. **Efter vidgningen får listan bara gälla tabeller
   som saknas i snapshoten.** Varje post vars tabell nu finns i snapshoten
   ska verifieras mot den och antingen tas bort (kolumnen finns → posten är
   onödig) eller rapporteras som ett fynd (kolumnen finns inte → frågan är
   trasig).
3. Ingen ny generell undantagsventil. De tre befintliga listorna
   (`KANDA_LUCKOR`, `PRODUKTIONSVERIFIERADE_KOLUMNER`, `LIVE_SCHEMA_GAPS`)
   är storlekslåsta och **ska bara krympa**.
4. Ingen tolerans, inget "om kolumnen är okänd, släpp igenom". En tabell som
   inte går att verifiera hoppas över **uttryckligen och räknat**, aldrig
   tyst.
5. Paketet ändrar inte produktionsbeteende. Enda tillåtna undantaget är
   AK7 nedan.

---

## 5. Acceptanskriterier

Varje punkt ska gå att visa. "Provet är grönt" räcker inte som bevis för ett
prov vars uppgift är att kunna bli rött.

**AK1 — regressionen reproduceras först.** Med en snapshot där
`checklist_template` saknar `category` och `is_default` (alltså den riktiga
produktionsformen) ska vakten **falla** på koden som den såg ut före v233.
Visa det röda utfallet i rapporten, före rättningen.

**AK2 — v229-klassen fångas.** En SQL-funktionskropp som skriver
`UPDATE business_config SET fortnox_token_expires_at = NULL` ska falla mot
facit. Prova med den faktiska satsen ur v158-funktionen, inte en påhittad.

**AK3 — DATABAStäckningen är mätbar och låst, inte facit-täckningen.**
Dagens formulering räckte inte: att räkna referenser som saknas i det
sammanslagna facit missar en tabell som bara finns i `sql/` — då är den
"täckt" utan att någon har frågat databasen, vilket är exakt luckan som gav
v233.

Kravet är därför:

1. Provet mäter, **separat för TypeScript-referenser och SQL-referenser**,
   hur många tabeller som är verifierade mot SNAPSHOTEN och hur många som
   inte är det.
2. De tabeller som inte är snapshotverifierade står i en **namngiven**,
   kommenterad lista — inte bara ett antal. Ett antalstak ensamt låter en
   gammal lucka bytas mot en ny utan att provet märker det, och det är
   samma sorts tysta byte som hela paketet finns för att stoppa. Listan
   jämförs med `toEqual` mot den sorterade faktiska mängden, som
   `PRODUKTIONSVERIFIERADE_KOLUMNER` redan gör.
3. Listan får bara krympa. Varje post bär ett skäl, och ett datum om skälet
   är "tabellen är ny och snapshoten är inte regenererad".

En tabell vars kolumner bara är kända ur `sql/` räknas alltså som
**overifierad**, inte som täckt.

**AK4 — snapshoten är deterministisk, definierat.** Två körningar mot samma
databas ska ge en **byte-identisk `tables`-del**. Metadatan
(`verified_at`, `generated_at`, `source`) ändras mellan dagar och räknas
inte in — det är just därför determinismen måste definieras på `tables` och
inte på filen som helhet. Nycklar och kolumnlistor sorterade; `jsonb`
normaliserar redan nyckelordningen i svaret.

Provet för detta läser filen och kontrollerar formen och sorteringen; att de
två körningarna gav samma `tables` redovisas i rapporten av den som har
nycklarna.

**AK5 — skriptet vägrar tyst misslyckande.** Utan nycklar: tydligt fel och
exit ≠ 0. Skriptet får aldrig skriva en tom eller halv snapshot över en
fullständig — det vore precis det tysta facit-tappet som orsakade v233.

**AK6 — avvikelselistan är tom eller motiverad, och del D bevisas på
Fortnox-fallet.** Del D:s prov är grönt antingen för att `sql/` är rättad
eller för att avvikelsen står med skäl i en storlekslåst lista. Båda de
kända fallen ska vara **rättade**, inte undantagna.

Bevis krävs för att del D verkligen ser legacy-fallet: med
`sql/fortnox_integration.sql:9` orörd ska provet rapportera
`business_config.fortnox_token_expires_at` som en sql-deklaration utan
motsvarighet i snapshoten. Visa det röda utfallet före rättningen. Det är
den punkt där en jämförelse byggd på vaktens eget facit hade varit tyst.

**AK7 — de äkta fynden rapporteras, inte lagas i smyg.** Varje ny
kolumnavvikelse som vidgningen avslöjar i produktionskod redovisas i en
lista: fil, rad, tabell, kolumn, och om koden eller databasen är fel.
Uppenbara fall (kolumnen är omdöpt, koden använder det gamla namnet) rättas
i koden och redovisas. Allt annat — särskilt allt som rör fakturor,
betalningar, momssatser eller belopp — **stannar och lämnas till Andreas.**
Lägg ALDRIG till en kolumn i databasen för att tysta vakten.

**AK8 — grinden är i fas.** Läggs en ny spec-fil till måste
`package.json`:s `test:contracts` och `../.github/workflows/contracts.yml`
ha **samma filer i samma ordning**, och `test:contracts` sluta med
` && node --test tests/customer-preparation/contract.test.mjs`.
`tests/feature-test-parity.spec.ts` fäller annars bygget. (Kan hela paketet
ligga i den befintliga `column-contract.spec.ts` behövs ingen ändring där —
det är att föredra.)

**AK9 — hela grinden grön.** `npx tsc --noEmit` rent och
`npm run test:contracts` grönt (1 947 prov i dag, exit 0). Kör med
`HANDYMATE_CHROMIUM_PATH` satt till den lokala Chromium-binären och
`--no-deps --project=chromium`.

---

## 6. Fallgropar i det här repot

- **`tsconfig.json` saknar `downlevelIteration`.** Sprid aldrig
  `matchAll()`, `Map.entries()` eller `Set` — använd
  `while ((m = re.exec(s)) !== null)` eller `Array.from(...)`.
- **Skanna aldrig källkod med kommentarerna kvar.** Filhuvudena i det här
  repot beskriver ofta just det fel som lagades, med den förbjudna strängen
  i klartext. Ett facit som faller på sin egen prosa vaktar prosa, inte kod.
  `column-contract.spec.ts` har redan ett AST-baserat läge — föredra det.
- **`sql/` är den enda mappen `tests/schema-contract.spec.ts` läser.**
  Migrationer som hamnar i `supabase/migrations/` fäller den grinden.
- **Testbäddsfilerna (`sql/testbed*.sql`) är miniatyrer** och får inte
  krympa facit. Dagens filter på `!f.startsWith('testbed')` ska stå kvar.
- **Snapshoten ska inte innehålla vyer**, bara tabeller — en vy som råkar
  vidga facit gör vakten svagare än den ser ut.

---

## 7. Klart när

1. AK1–AK9 uppfyllda och redovisade, med det röda utfallet i AK1 och AK2
   visat före rättningen.
2. Snapshoten regenererad av någon som har nycklarna, med `verified_at`
   satt till körningens datum.
3. Fyndlistan ur AK7 levererad — även om den är tom.
4. Två commits, inte en: **(a)** vakten, skriptet och snapshoten,
   **(b)** eventuella kodrättningar som fynden motiverar. En granskare ska
   kunna läsa vad vakten gör utan att blanda det med vad den hittade.


---

## 8. Granskningslogg

### Revision 2 — 2026-09-12, efter Codex läsgranskning

Fem fynd, alla riktiga, alla verifierade mot koden innan de togs in:

| # | Fynd | Åtgärd |
|---|---|---|
| P1 | AK3 låste facit-täckningen, inte databastäckningen — en tabell som bara finns i `sql/` kunde passera som "täckt" | AK3 omskriven: snapshotverifiering mätt separat för TS och SQL, och de overifierade tabellerna står i en **namngiven** lista, inte bara ett antal |
| P1 | Del D kunde inte se Fortnox-fallet: parsern släpper `ALTER TABLE` när tabellen saknar `CREATE TABLE` (rad 105), och `business_config` har ingen | Del D får en **egen** insamling av sql-deklarationer som tar med ALTER även utan CREATE, plus ett rött bevis i AK6 |
| P1 | Läsvägen underspecificerad: OpenAPI omfattar vyer, beror på rättigheter, kan vara inaktuell genom schemacachen; `information_schema` går inte att läsa över PostgREST | **Beslutat och byggt:** `sql/v234_schema_columns_snapshot.sql`, applicerad och verifierad. Läser `pg_catalog`, bara `relkind` r/p, service_role-grindad. Skriptet får dessutom ett fullständighetskrav före skrivning |
| P2 | "Snapshoten vinner alltid" motsades av `PRODUKTIONSVERIFIERADE_KOLUMNER`, som kontrolleras före kolumnuppslaget | Invariant 2 skärpt: listan får bara gälla tabeller som SAKNAS i snapshoten; de fyra posterna ska verifieras och tas bort eller rapporteras |
| P2 | Ägarlistan saknade `sql/fortnox_integration.sql` som del D kräver, och sa "Inga andra filer" | Listan rättad; AK7:s kodrättningar och del D:s sql-rättningar står nu som uttryckliga undantag |

Båda förtydligandena är också inne: determinism är definierad på
`tables`-delen och inte på filen (AK4), och SQL-skanningen räknar bara den
aktuella definitionen av varje funktion (§2 del C).

**Siffror som granskningen med rätta inte tog på förtroende.** Nu mätta med
funktionen ur del B: **255 tabeller, 3 701 kolumner** i `public`.
Paketets första revision sa 267 och 3 886 — det talet kom ur
`information_schema.columns`, som räknar med de 12 vyerna. Ett tabellfacit
ska inte innehålla vyer, så 255 är det rätta talet.

AK1, AK2 och AK7 står oförändrade.
