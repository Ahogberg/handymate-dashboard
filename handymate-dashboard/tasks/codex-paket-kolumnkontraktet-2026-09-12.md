# Codex-paket: kolumnkontraktet får databasen som facit

**Status:** klar att delas ut. Avgränsat, mekaniskt, inga designbeslut.
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
**varje tabell som `app/` eller `lib/` läser eller skriver**. Produktionen
har 267 tabeller och 3 886 kolumner i `public` (räknat 2026-09-12); täck
minst de tabeller vakten faktiskt möter, och gärna alla.

Filformatet är oförändrat:

```json
{ "verified_at": "2026-09-12", "source": "…", "tables": { "tabell": ["kol", …] } }
```

Snapshoten är redan auktoritativ i koden (`facit.set(...)` skriver över
sql-facit per tabell) — den delen ska inte byggas om.

### Del B — ett skript som genererar snapshoten

`scripts/schema-snapshot.mjs`:

- läser hela `public`-schemat read-only (PostgREST:s OpenAPI-schema, samma
  källa som dagens fil anger, eller `information_schema.columns`);
- skriver `tests/fixtures/production-schema-columns.json` sorterat och
  deterministiskt (samma indata → identisk fil, annars blir varje körning
  en diff);
- kräver `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` ur miljön
  och **avbryter med ett tydligt fel** om de saknas;
- skriver aldrig något annat än snapshotfilen, och gör inga DDL-anrop.

Nycklarna finns inte i den här utvecklingsmiljön. Skriptet körs av Andreas
lokalt, eller av ett CI-jobb med hemlighet. Det ska stå i filhuvudet.

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

### Del D — avvikelse mellan sql/ och databasen rapporteras

När snapshoten och `sql/` beskriver samma tabell olika är **någon av dem
fel**, och i dag försvinner det i tysthet.

Lägg ett prov som listar tabeller där sql-facit har kolumner som snapshoten
inte har. Varje sådan tabell ska antingen rättas i `sql/` eller stå i en
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
sql/rot_rut_documents.sql                           (rättas, del D)
package.json + ../.github/workflows/contracts.yml   (bara om ny spec-fil läggs till)
```

Inga andra filer. Dyker en riktig kolumnavvikelse upp i produktionskod är
den ett **fynd som rapporteras**, inte en fix i det här paketet — se §5.

---

## 4. Invarianter

1. Vakten körs **utan databasåtkomst**. CI har inga nycklar; facit är den
   incheckade snapshoten.
2. Där snapshoten har tabellen vinner snapshoten över `sql/`. Alltid.
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

**AK3 — täckningen är mätbar och låst.** Provet skriver ut hur många
tabellreferenser som verifierades och hur många som hoppades över för att
tabellen saknas i facit. Antalet överhoppade är **storlekslåst** med ett
daterat tak, precis som `tests/facit-route-auth-inventory.spec.ts` gör med
sitt tak. En ny överhoppad tabell ska alltså fälla provet.

**AK4 — snapshoten är deterministisk.** Kör skriptet två gånger mot samma
databas: identisk fil, ingen diff. Nycklar och kolumnlistor sorterade.

**AK5 — skriptet vägrar tyst misslyckande.** Utan nycklar: tydligt fel och
exit ≠ 0. Skriptet får aldrig skriva en tom eller halv snapshot över en
fullständig — det vore precis det tysta facit-tappet som orsakade v233.

**AK6 — avvikelselistan är tom eller motiverad.** Del D:s prov är grönt
antingen för att `sql/` är rättad eller för att avvikelsen står med skäl i
en storlekslåst lista. `checklist_template` ska vara **rättad**, inte
undantagen.

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
