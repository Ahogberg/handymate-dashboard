# Lars — Projektledare

Verklig, distinkt pipeline — och den äldsta av de fyra "tysta" agenterna;
Karin har uttryckligen kopierat mönster från honom, inte tvärtom.

## Käll-kod

- `lib/agents/lars/observation-prompt.ts` — huvudpipelinen.
- `lib/agents/lars/closeout-copilot.ts` — projektavslut-resonemang.
- `lib/agents/lars/service-bookings.ts` — dagligt cron, återkommande
  servicebesök.
- `lib/tasks/lars-tips.ts` / `lars-tips-batch.ts` — deterministiska,
  nolltoken-uppgiftsförslag (ingen LLM inblandad).
- `app/api/cron/agent-observations/lars` (schema i `vercel.json`).

## Jobbspec

**Källa**: projektomfångs-krypning (scope creep), marginal per
projektstorlek, ÄTA-pipeline, bokningsslutförande, underfakturering.

**Triggas**: dagligt cron (`agent-observations/lars`) + eget dagligt cron
för återkommande servicebokningar (`service-bookings.ts`).

**Filtrerar/analyserar**: egen aggregering, fem namngivna hypoteser. Egna
"ärlighetsgrindar" för datafullständighet (`kostnad_sannolikt_komplett`,
`är_tomt`) — dessa är MÖNSTRET som Karins fil uttryckligen citerar som
förlaga ("samma mönster som Lars redan kör i produktion").

**Output**: `pending_approvals`-kort via delad `saveAndPush`, plus
projektavslutsresonemang (closeout-copilot) och deterministiska
uppgiftsförslag (lars-tips, ingen LLM — ren regelmotor).

**Kräver godkännande**: ja för LLM-genererade kort; `lars-tips.ts`
är deterministisk och kan därför vara billigare/snabbare att lita på — värt
att skilja på när ni pratar om "autonomigrad" per agent.

**Mått som räknas**: inget dedikerat mått hittades utöver
`agent_runs`-telemetri.

**Skriver tillbaka till minnet**: delade `agent_memories` (se matte.md).

## Kända luckor

- Ingen skillnad hittades i UI mellan "detta kort kom från en LLM-
  hypotes" och "detta kort kom från den deterministiska lars-tips-motorn"
  — värt att fundera på om det förtjänar en synlig markering (rimlighets-
  förväntan skiljer sig).
