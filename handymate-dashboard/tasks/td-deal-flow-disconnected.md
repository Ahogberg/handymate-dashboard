# TD: deal-flow quote_sent-motorn är frånkopplad (2026-06-11)

**Status:** Ej brådskande. Kartläggning + beslut (retire vs rebuild). INGEN kod ändrad.
**Prioritet:** Låg — men *blockerande för den som någonsin "fixar" det naivt* (se Risk).

## Sammanfattning

`lib/e2e-deal-flow.ts` (v17 "E2E Deal Flow Engine") är **supersedd dödkod**. Den var ett tidigt försök att orkestrera hela affärslivscykeln (lead → kvalificerad → offert → signering → projekt → faktura → betalning → recension) med approval-gates vid högrisk-steg. Den ersattes i praktiken av mer granulära, komponerbara system (pipeline-stages + automation-engine + smart-communication + nurture + per-agent-cron) utan att den gamla motorn togs bort.

**Verdict: nästan inget tappas funktionellt** — de levande systemen täcker livscykeln. Det som "tappas" är motorns egen *redundanta* orkestrering, som dessutom skulle **kollidera** med de levande systemen om den slogs på.

## Tre lager av död

1. **Aldrig initierad:** `initDealFlow` anropas bara från `POST /api/deals/[id]/flow {action:'init'}` (manuell/debug). I normal drift skapas aldrig `deal_flow`-rader.
2. **Aldrig avancerad av events:** `advanceDealFlow` anropas från sig själv (rekursion), `onDealEvent`, och den manuella flow-routen. **`onDealEvent` anropas från noll ställen** (grep: bara egen definition + en `ARCHITECTURE.md`-rad som *påstår* "orchestratorn anropar"). Den event-drivna vägen är död.
3. **Approval gör inget:** `executeApprovalPayload` (app/api/approvals/[id]/route.ts) saknar `case 'deal_flow_*'` → att godkänna ett `deal_flow_quote_sent`-kort träffar `default` ("Godkänt utan specifik åtgärd"). Och inget bryggar godkännandet till `advanceDealFlow`.
4. **Ingen UI-konsument:** `getDealFlowStatus` läses bara av GET-routen; ingen komponent visar deal-flow-status (grep matchade bara motorn + dess route).

## Steg-för-steg: vad motorn SKULLE göra vs vad som FAKTISKT kör idag

| Deal-flow-steg | Motorns avsikt (`executeAutoStep`/`SideEffects`) | Levande system som gör det idag |
|---|---|---|
| lead_qualified | föreslå platsbesök om het (`suggestSiteVisit`) | Daniel/Lars-agenter; pipeline-automations |
| quote_generated (auto) | **auto-generera offert** via `ai-quote-generator` | Offert skapas on-demand (manuellt / Matte / `/api/quotes/ai-generate`) — **medvetet INTE auto för varje deal** |
| **quote_sent** (manuell, high) | skapa `deal_flow_quote_sent`-approval (no-op) | `lib/pipeline/automations.ts:26` (`case 'quote_sent'`) + `smart-communication.ts:501` enroll + `nurture.ts:50` + seed-regel `smart_communication.sql:83` + Daniels obeöppnad/stale-trigger |
| quote_signed | `moveDeal → 'won'` + logga | `lib/pipeline` `moveDeal` anropas redan från signerings-flödet (`quotes/public/[token]`) |
| project_created (auto) | `executeProjectCreation` | `createProjectFromQuote` (real väg vid signering) |
| invoice_generated (auto) | `executeInvoiceGeneration` | `lib/projects/auto-invoice-on-complete.ts` (real väg vid projekt-completion) |
| payment_received | nurture-enroll garanti + recension | `lib/nurture` + `review-requests`-cron (real) |
| review_requested (auto) | `executeReviewRequest` | `app/api/cron/review-requests` (real) |

**Slutsats:** varje rad har en levande motsvarighet. Det enda unika motorn skulle tillföra är **auto-generering av offert/projekt/faktura för _varje_ deal** — vilket sannolikt är oönskat (spammigt, fel) och är just därför de levande systemen gör det on-demand/event-gate:at istället.

## Relation till pipeline-automation (ja, stark)

Det "hör ihop med pipeline-automation" stämmer: den levande `lib/pipeline/automations.ts` är den faktiska quote_sent-handlern, och pipeline-stage-systemet (`lib/pipeline.ts`, `lib/pipeline-stages.ts`, `lib/pipeline/stages.ts`) + `moveDeal` är den faktiska deal-progressionen. Deal-flow-motorn är en **parallell, äldre version av samma idé**. De är inte komplementära — de är konkurrerande implementationer av deal-livscykeln.

Relaterad känd skuld: audit-2-B5 ("Quote-lifecycle V3 dead-letter") noterar redan att `quote_sent/opened/signed/accepted` har dual-path-inkonsekvens mellan smart-communication och threshold-cron. Deal-flow-motorn är en **tredje** path för samma events — att reda ut quote-lifecycle bör ta med alla tre.

## ⚠️ Risk — varför detta är "blockerande för naiv fix"

Om någon "lagar" detta genom att bara koppla in `onDealEvent` (t.ex. anropa det från `fireEvent`), kör motorn igång parallellt med de levande systemen och ger **dubbel-exekvering**: dubbel offert-generering, dubbel projekt-skapande, dubbel `moveDeal`, dubbla approvals. Det är samma silent-failure/dubblett-klass som Del 1B-dubbelklick-fixarna adresserar, fast på affärslivscykel-nivå. **Koppla aldrig in `onDealEvent` utan att först riva ut eller reconcilea överlappet.**

## Rekommendation — två alternativ, A föredras

**A. Formellt retire (litet, säkrast).** Ta bort `lib/e2e-deal-flow.ts`, `app/api/deals/[id]/flow/route.ts`, `DEAL_FLOW_STEPS`, och `deal_flow`/`deal_flow_log`-tabellerna (efter att ha bekräftat 0 rader i prod). Uppdatera `ARCHITECTURE.md` som felaktigt påstår att orchestratorn anropar `onDealEvent`. Resultat: mindre yta, ingen risk att någon återupplivar en konkurrerande livscykel-motor.

**B. Rebuild ovanpå automation-engine (stort, bara om "full autopilot"-visionen vill ha den).** Om man vill ha auto-advance av hela deal-livscykeln med approval-gates: bygg det som regler i den *levande* automation-engine/pipeline-stacken, inte som en separat motor. Kräver att man först reconcilear de tre quote-lifecycle-paths (audit-2-B5) till en. Detta är ett eget större projekt och bör inte göras innan Del 2 (execution-chain) är klar.

**Default: A.** Riv dödkoden. Den ger noll värde idag, förvirrar arkitektur-läsningen (ARCHITECTURE.md ljuger om den), och är en fälla för framtida "fixare".

## Verifiering innan retire (Andreas / prod-SQL)

```sql
-- Bekräfta att motorn aldrig använts i prod innan borttagning
SELECT count(*) FROM deal_flow;       -- förväntat: 0 (eller bara test-rader)
SELECT count(*) FROM deal_flow_log;   -- förväntat: 0
SELECT count(*) FROM pending_approvals WHERE approval_type LIKE 'deal_flow_%';  -- förväntat: 0
```
Om alla ~0 → trygg radering (alt A). Om >0 → någon har triggat den manuellt; granska de raderna först.

*Ingen kod ändrad. Beslut (A retire / B rebuild) hos Andreas.*
