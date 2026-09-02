# Actionplan: kundminnet, pass 2 (2026-09-02, Andreas: "Då kör vi pass 2 direkt")

Bakgrund: docs/audits/KUNDMINNE_REVISION_2026-09-02.md gap 6 + 7, och
tasks/plan-kundminne-pass1.md (klart, 9788dca). Migration sql/v200 är
REDAN KÖRD i Supabase av Claude — skriv koden fail-soft ändå (samma
isMissingColumnError-idiom som redan finns i lib/agents/memory.ts).

Repo: handymate-dashboard/. Läs varje fil innan du ändrar. Ändra bara det
som står här. Svenska kommentarer, riktiga å/ä/ö.

## Gap 6 — agentminne per kund (lib/agents/memory.ts + två anropare)

Fakta ur koden: extractAndSaveMemory(businessId, agentId, finalResponse,
triggerType, triggerData, source?) skriver agent_memories (insert ~rad
310 och ~381, båda med business_id). fetchRelevantMemories(supabase,
businessId, agentId, opts) läser (~rad 537) med fallback vid saknad kolumn.
getRelevantMemories(businessId, agentId) (~rad 602) är den anropare
agent-triggern och Matte-chatten använder. Daniels offertgenerator läser
redan customer_fact (lib/ai-quote-generator.ts:219+) — rör inte den.

1. extractAndSaveMemory: nytt valfritt fält i `source`/opts eller en sista
   parameter `customerId?: string | null` (välj det som ger minst
   ändringar i anroparna). Läggs med i BÅDA inserts som `customer_id`
   (null när saknad). Fail-soft: om insert svarar 42703/saknad kolumn
   (isMissingColumnError) ⇒ gör om insert utan customer_id, exakt som i dag.
   Dedupe-jämförelsen (~rad 272) ska när customerId finns jämföra mot
   minnen med samma customer_id ELLER customer_id null (företagsnivå),
   inte mot andra kunders.
2. fetchRelevantMemories + getRelevantMemories: valfri `customerId`.
   Med customerId: hämta företagsnivå (customer_id is null) OCH kundens
   egna (customer_id = id) — använd `.or('customer_id.is.null,customer_id.eq.<id>')`
   ovanpå befintliga filter. Kundens egna rankas först (lägg +0.2 på
   effectiveImportance eller sortera i två grupper — dokumentera valet).
   Utan customerId: bara customer_id is null (företagsnivå) — så en kunds
   minnen aldrig läcker in i ett annat sammanhang. Fail-soft vid saknad
   kolumn: dagens fråga oförändrad.
   OBS: buildMemoryPrompt ska markera kundminnen, t.ex. prefix "Om kunden:".
3. Anropare:
   - app/api/agent/trigger/route.ts (~rad 422 getRelevantMemories, ~rad 656
     extractAndSaveMemory): customerId = trigger_data.customer_id ??
     trigger_data.customerId ?? null (bara om det är en sträng). Ingen
     annan ändring.
   - app/api/matte/chat/route.ts (~rad 1283 och ~1622): customerId = det
     server-verifierade sidkontext-id:t (verifieras redan ~rad 1003–1009;
     hitta variabeln). Aldrig ett ovalidat id från klienten.
4. sql/v200_agent_memories_customer_id.sql finns redan — registrera
   kolumnen i app/api/debug/schema-audit/route.ts
   (`{ table: 'agent_memories', column: 'customer_id', migration: 'v200_agent_memories_customer_id', critical: false }`).

## Gap 7 — Hanna läser kundfakta innan hon föreslår kontakt
Fil: lib/agents/hanna-outbound.ts, funktionen som bygger kundvårdskortet
(proposeCareCard-flödet, ~rad 175–215; läs hela).
1. Efter frekvenstaket: läs `customer_fact` för kunden:
   `select('fact_type, content')` `.eq('business_id', businessId)`
   `.eq('customer_id', customer.customer_id)` `.is('superseded_by', null)`
   `.in('fact_type', ['preference', 'constraint', 'contact'])`
   `.order('created_at', { ascending: false }).limit(5)`. Fail-soft: fel
   eller saknad tabell ⇒ tom lista (arSchemaSaknas från
   lib/observability/driftlarm).
2. Använd dem ÄRLIGT, aldrig i SMS-texten som påhittad kontext:
   - payload.kundfakta = [{ fact_type, content }] så ägaren ser dem på
     kortet innan godkännande.
   - Kortets description får en rad "Att tänka på: <content>" för max två
     fakta (constraint först).
   - Om något faktum av typ 'contact' eller 'constraint' innehåller
     "inte sms", "ej sms", "ring" (case-insensitive) ⇒ skapa INTE
     SMS-kortet; returnera { inserted: false, factBlocked: true } och
     räkna det i svaret som övriga skipped (läs returtypen och lägg fältet).
   SMS-texten i övrigt oförändrad.
3. Uppdatera facit i tests/ som låser hanna-outbound om de räknar
   payload-nycklar (grep "hanna-outbound" i tests/).

## Facit: tests/kundminne-pass2.spec.ts (browserlöst)
- memory.ts: insert innehåller `customer_id`, fallback vid isMissingColumnError
  runt insert, fetch använder `customer_id.is.null` i .or-uttrycket, utan
  customerId filtreras `.is('customer_id', null)`; buildMemoryPrompt märker
  kundminnen.
- rena funktioner: om du bryter ut rangordningen (kund först) — testa den
  med två fixturer.
- trigger-route + chat-route skickar customerId (källskanning), chat-routen
  bara det verifierade id:t (inte `body.customerId` rakt av).
- hanna-outbound: `.from('customer_fact')`, `.is('superseded_by', null)`,
  `kundfakta` i payload, spärren för "inte sms"/"ring".
- sql/v200 finns, schema-audit har posten.
Lägg facit-namnet sist i BÅDE `test:contracts` i package.json och listan i
../.github/workflows/contracts.yml.

## Verifiering (allt grönt innan rapport)
```
npx tsc --noEmit
npx playwright test tests/kundminne-pass2.spec.ts tests/kundminne-kanaler.spec.ts $(grep -rlE "agents/memory|hanna-outbound|agent_memories" tests --include=*.spec.ts | tr '\n' ' ') --no-deps --project=chromium --reporter=line
npm run test:contracts
npx next build
```
Inga commits. Rapportera: ändrade filer, exakta testsiffror, avvikelser.
