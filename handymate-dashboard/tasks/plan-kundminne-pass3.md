# Actionplan: kundminnet, pass 3 — ett läs-API och relevanssökning (2026-09-02, Andreas: "Vi kör vidare på de två")

Bakgrund: docs/audits/KUNDMINNE_REVISION_2026-09-02.md, pass 1 (9788dca),
pass 2 (6c8cdb8). Minnet finns i tre lager som inte pratar med varandra
(agent_memories, customer_fact, Företagsmodellen/business_knowledge) och
varje promptbyggare hämtar själv. Detta pass ger EN läsfunktion och
relevans i stället för "topp fem på viktighet".

Migration sql/v201_agent_memories_fts.sql är REDAN KÖRD i Supabase av
Claude (tsvector-kolumn content_tsv + GIN). Koden ska ändå vara fail-soft
(isMissingColumnError ⇒ dagens fråga).

Repo: handymate-dashboard/. Läs varje fil innan du ändrar. Svenska
kommentarer, riktiga å/ä/ö. Inga nya tabeller/kolumner utöver v201.

## Del 1 — relevanssökning i lib/agents/memory.ts
1. Ny ren funktion `byggMinnesfraga(text: string): string | null`:
   plocka ord ≥ 4 tecken (svenska bokstäver tillåtna), unika, max 12,
   strippa tecken utanför [a-zåäöéA-ZÅÄÖÉ0-9], join med ' OR '. Tom ⇒ null.
2. `fetchRelevantMemories(supabase, businessId, agentId, opts)` får
   `opts.query?: string`. Med query: kör en ANDRA fråga (samma filter som
   den befintliga: business, agent-or-matte, superseded_by null,
   confirmed_at not null, kund-filtret från pass 2) med
   `.textSearch('content_tsv', byggMinnesfraga(query), { config: 'swedish', type: 'websearch' })`
   `.limit(10)`. Fail-soft: fel/saknad kolumn ⇒ tom lista + ingen varning
   mer än en gång per process. Slå ihop: relevansträffarna först (i
   returnerad ordning), sedan viktighetsrankningen (befintlig), dedupa på
   id, klipp till RELEVANT_MEMORIES_TOP_N + 3 (så relevans inte tränger
   ut allt företagsminne). Utan query: exakt som i dag.
3. `getRelevantMemories(businessId, agentId, customerId?, query?)` skickar
   vidare. Rader från relevansfrågan markeras `isRelevant: true` i
   RelevantMemoryText så buildMemoryPrompt kan lägga dem under rubriken
   "Relevant för det här:" och övriga under "Om företaget:" / "Om kunden:".
4. Registrera kolumnen i app/api/debug/schema-audit/route.ts
   (`{ table: 'agent_memories', column: 'content_tsv', migration: 'v201_agent_memories_fts', critical: false }`).

## Del 2 — ett läs-API: lib/context/kundkontext.ts (NY)
`hamtaKundkontext(supabase, { businessId, customerId?: string | null, agentId: string, fraga?: string })`
→ `Promise<{ block: string; kallor: Array<{ typ: 'minne' | 'kundfakta' | 'samtal' | 'sms' | 'mejl' | 'portal' | 'foretagsmodell'; id: string | null; tid: string | null }> }>`

Innehåll, i denna ordning, varje del fail-soft (fel ⇒ delen utelämnas,
console.warn en gång):
- **Om företaget:** ur `loadCompanyModel` (lib/company/company-model.ts,
  se hur app/api/matte/chat/route.ts ~rad 52 anropar den): bransch,
  timpris, betalvillkor, marginalmål — bara fält med värde, med källa
  (fältets authority) i parentes. Max 6 rader.
- **Om kunden** (bara med customerId): namn + bekräftade customer_fact
  (`content`, `fact_type`, superseded_by null, max 8, senaste först), och
  senaste 3 samtalen (call_recording.transcript_summary), 3 SMS
  (sms_conversation via phoneCandidates som i pass 1), 3 mejl
  (email_conversations), 3 portalmeddelanden (customer_message) — bara
  kanaler med rader. Varje rad: datum + kanal + text max 160 tecken.
- **Minnen:** `getRelevantMemories(businessId, agentId, customerId, fraga)`
  via buildMemoryPrompt (Del 1).
- Blockets rubrik: "## Vad Handymate vet". Tomt allt ⇒ block = '' (aldrig
  en tom rubrik). Totalt tak ~2 500 tecken; klipp äldsta/lägst rankade.
- Ren hjälpare `formateraKontextrad(...)` så facit kan testa formatet utan DB.

## Del 3 — koppla in läs-API:et (ersätt, inte lägg ovanpå)
- app/api/matte/chat/route.ts (~rad 1276–1284): ersätt
  getRelevantMemories + buildMemoryPrompt med `hamtaKundkontext(...)`,
  `fraga` = användarens senaste meddelande, `customerId` = det verifierade
  sidkontext-id:t. Behåll workReport-undantaget (tom kontext då).
- app/api/agent/trigger/route.ts (~rad 426–439): samma byte, `fraga` =
  trigger_data.text ?? trigger_data.message ?? trigger_data.transcript
  (första sträng som finns), customerId som i pass 2.
- app/api/voice/analyze/route.ts: om analysen känner customer_id, lägg
  `hamtaKundkontext(...).block` i promptens kontext (hitta var
  tradeContext-blocket "## Bransch och inriktning" injiceras och lägg
  direkt efter). Ingen kund ⇒ inget block.
- tool-router get_customer (~rad 474–519): rör inte returformen; lägg till
  `kontext: block` som extra fält så Matte får samma text vid uppslag.
- lib/matte/resolver.ts: rör inte (pass 1 gav den samtal + fakta redan).

## Facit: tests/kundminne-pass3.spec.ts (browserlöst)
- byggMinnesfraga: "Vad kostar en offert på badrum?" ⇒ 'kostar OR offert OR badrum'
  (ord ≥ 4), tom sträng ⇒ null, max 12 ord, specialtecken strippas.
- memory.ts: `.textSearch('content_tsv'`, `config: 'swedish'`, fail-soft
  runt relevansfrågan, dedupe på id, "Relevant för det här:" i buildMemoryPrompt.
- kundkontext.ts: `.from('customer_fact')`, `.from('call_recording')`,
  `phoneCandidates(`, `loadCompanyModel(`, "## Vad Handymate vet",
  tomt ⇒ '' (ren funktion testad med fixtur), tak på längd.
- chat-route, trigger-route: `hamtaKundkontext(` finns och
  `buildMemoryPrompt(` finns INTE längre i de två filerna; chat-routen
  skickar det verifierade customerId. voice/analyze och tool-router
  innehåller `hamtaKundkontext(`.
- sql/v201 finns; schema-audit har content_tsv.
Lägg facit-namnet sist i BÅDE `test:contracts` i package.json och listan i
../.github/workflows/contracts.yml.

## Verifiering (allt grönt innan rapport)
```
npx tsc --noEmit
npx playwright test tests/kundminne-pass3.spec.ts tests/kundminne-pass2.spec.ts tests/kundminne-kanaler.spec.ts tests/agent-memory.spec.ts $(grep -rlE "matte/chat|agent/trigger|voice/analyze|tool-router" tests --include=*.spec.ts | tr '\n' ' ') --no-deps --project=chromium --reporter=line
npm run test:contracts
npx next build
```
Röda tester som är röda även före passet (kontrollera med git stash):
rapportera, tvinga inte gröna. Inga commits. Rapportera ändrade filer,
exakta testsiffror, avvikelser.
