# Daniel — Säljare

Verklig, distinkt pipeline — MEN en synlig UI-yta som bär hans namn är
faktiskt inte hans (se "Kända luckor").

## Käll-kod

- `lib/agents/daniel/observation-prompt.ts` — huvudpipelinen.
- `lib/agents/daniel/unopened-quotes.ts` — egen deterministisk regel
  (öppnade-men-inte-svarat-offerter).
- `app/api/cron/agent-observations/daniel` (schema i `vercel.json`).
- Jämför: `lib/ai-quote-generator.ts` + `app/dashboard/quotes/new/
  components/DanielsBedomning.tsx` — INTE Daniels egen kod, se nedan.

## Jobbspec

**Källa**: offert-acceptansgrad per kundtyp, öppna-men-obesvarade offerter,
leadkällor, priselasticitet, ÄTA-överdrag per jobbtyp (`quotes`, `deal`/
`leads`).

**Triggas**: dagligt cron (`agent-observations/daniel`).

**Filtrerar/analyserar**: egen aggregering, åtta namngivna hypoteser i
systemprompten. `unopened-quotes.ts` har en egen, enkel regel: status
`sent`, `view_count=0`, 5–14 dagar sedan skickad → skicka en påminnelse-SMS
via en egen mall (`buildUnopenedNudgeMessage`).

**Output**: `pending_approvals`-kort via delad `saveAndPush`.

**Kräver godkännande**: ja, samma mönster som Karin/Lars/Hanna.

**Mått som räknas**: inget dedikerat mått hittades utöver
`agent_runs`-telemetri.

**Skriver tillbaka till minnet**: delade `agent_memories` (se matte.md).

## Kända luckor — läs innan ni beskriver Daniel i marknadsföring

**"Daniels bedömning" i offertbyggaren är INTE Daniels observationspipeline.**
Den panelen (`DanielsBedomning.tsx`, visar resonemang/regler/lärdomar/
kundfakta under en AI-genererad offert) matas direkt av
`generateQuoteFromInput` i `lib/ai-quote-generator.ts` — den delade
offertgenerator-motorns eget `reasoning`-fält i JSON-svaret, visad med
Daniels avatar som en UI-konvention ("Kvittoprincipen"). Den har ingen
koppling till `lib/agents/daniel/observation-prompt.ts`.

Praktiskt: om ni nu skriver marknadsföring om "Daniel förklarar sina
antaganden i varje offert" är det tekniskt sant i UI:t men bygger på en
ANNAN motor än den som genererar hans nattliga säljinsikter. Bra att veta
om ni nånsin ska separera eller vidareutveckla det ena utan att av misstag
tro ni ändrar det andra.
