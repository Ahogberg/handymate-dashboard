# Hanna — Marknadschef

Verklig, distinkt pipeline. Den mest relevanta för growth-repo-diskussionen
eftersom hon redan är produktens egna "marketing engineer"-embryo.

## Käll-kod

- `lib/agents/hanna/observation-prompt.ts` — huvudpipelinen, 180-dagars
  aggregering.
- `lib/agents/hanna/avtal-forslag.ts` — dagligt cron, AI-matchade
  serviceavtalserbjudanden.
- `lib/agents/hanna/capacity-fill.ts` — SMS-utskick vid "tunn vecka".
- `lib/agents/hanna/kundbas-svep.ts` — manuell svepning, återanvänder
  avtal-förslags-maskineriet medvetet (dokumenterat som avsiktlig
  återanvändning, inte dubbelarbete).
- `lib/agents/hanna-outbound.ts` — reaktivering, grindad på bekräftat
  `last_job_date`.
- `app/api/cron/agent-observations/hanna` (schema i `vercel.json`).

## Jobbspec

**Källa**: reaktiveringskandidater rankade efter kundvärde (LTV), säsongs-
trender i leads, recensionsförfrågnings-täckning, andel återkommande kunder
— 180-dagarsfönster.

**Triggas**: dagligt cron (observation) + eget cron för avtalsförslag +
manuellt svep (kundbas-svep, hantverkaren initierar).

**Filtrerar/analyserar**: fyra namngivna hypoteser, egen tröskelkonstant
(`HANNA_REACTIVATION_QUIET_DAYS`). `hanna-outbound.ts` kräver ett verkligt
`last_job_date` innan en kund räknas som reaktiverbar — gissar inte.

**Output**: `pending_approvals`-kort (reaktiveringsförslag, avtalserbjudanden,
kapacitetsfyllnads-SMS) via delad `saveAndPush`.

**Kräver godkännande**: ja, samma mönster som övriga tre.

**Mått som räknas**: inget dedikerat mått hittades utöver
`agent_runs`-telemetri.

**Skriver tillbaka till minnet**: delade `agent_memories` (se matte.md).

## Koppling till growth-repo-idén

Hanna är redan konceptuellt närmast podd-avsnittets "marketing engineer" —
hon har kundsignal (LTV, säsong, recensioner), en observationscykel, och
outbound-mekanik. Det som saknas för att bli en riktig growth-repo-agent
är EXAKT det README:t pekar på: en levande "vad marknaden säger"-fil hon
läser FRÅN (Lisas samtal, `customer_fact`, reservationsmönster) för att
skärpa VAD hon föreslår, inte bara NÄR. I dag är hennes hypoteser
hårdkodade i prompten — en riktig growth-repo-koppling skulle låta dem
uppdateras av färsk kundsignal i stället.
