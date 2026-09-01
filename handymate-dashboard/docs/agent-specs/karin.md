# Karin — Ekonom

Verklig, distinkt pipeline — inte en etikett på en delad motor. Tre separata
system under samma namn (se nedan).

## Käll-kod

- `lib/agents/karin/observation-prompt.ts` — huvudpipelinen (nattlig cron).
- `lib/projects/margin-guardian.ts` + `lib/profitability.ts:302` — separat
  tröskelmotor.
- `lib/karin/supplier-invoice-match.ts` — separat deterministisk matchare.
- `app/api/cron/karin-deadlines` + `app/api/cron/agent-observations/karin`
  (schema i `vercel.json`).
- Delat chassi: se README ("Det delade chassit").

## Jobbspec

**Källa**: `invoice`, `customer`, `project`, `quotes` (egna aggregeringar,
inte generiska).

**Triggas**: dagligt cron (`agent-observations/karin`) + separat cron för
förfallodagar (`karin-deadlines`).

**Filtrerar/analyserar**: egen `KarinAggregate` — betalningsmönster per
kundtyp, marginaltrender, kassaflöde, faktiskt förfallna fakturor värda att
agera på. Fem namngivna hypoteser i systemprompten som styr vad hon letar
efter.

**Output**: `pending_approvals`-kort (via delade `saveAndPush`), dedupat
per typ (`karin_overdue_reminder:*`). Marginalvarningar taggas
`agent_id: 'karin'` direkt i `profitability.ts` (fristående från
observationspipelinen). Leverantörsfaktura-matchning är en tredje,
deterministisk källa ("Karins sida").

**Kräver godkännande**: ja — allt landar som kort i "Väntar på dig", ingen
direktexekvering hittad i Karins egna filer.

**Mått som räknas**: inget dedikerat kvalitetsmått hittades utöver den
generella `agent_runs`-telemetrin (se matte.md).

**Skriver tillbaka till minnet**: via det delade `agent_memories`-systemet
(samma mekanism som Matte, se matte.md) — ingen Karin-specifik minnesbutik.

## Kända luckor

- Ingen observation hittades av att marginalvarnings-tröskelmotorn
  (`margin-guardian.ts`) och den nattliga observationspipelinen någonsin
  krockar/dubblerar — de verkar medvetet komplementära (tröskel-baserad vs.
  hypotesdriven), men det är inte uttryckligen dokumenterat i koden.
