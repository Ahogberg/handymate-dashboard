# Fynd: human_followup_queue är en tyst läcka — inte död kod

*Utredning 2026-08-10 (uppgift 3 ur tasks/codex-brief-sanering.md, den punkt Codex inte slutförde).*

## Slutsatsen först

När hantverkaren godkänner ett AI-förslag av typen **uppföljning**, **ring upp** eller
**påminnelse** svarar systemet **"Uppföljning schemalagd!"** — men raden landar i
`human_followup_queue`, som **ingen vy visar, ingen cron läser och ingen kod någonsin
hämtar**. Uppföljningen försvinner. Det är precis det scenario briefen kallade
"en tyst läcka (något som skulle hanterats men aldrig blir det)".

## Beviskedjan

1. **Förslagen skapas på riktigt.** Samtalsanalysens promptkontrakt klassar förslag som
   `quote|callback|follow_up|reminder|reschedule` (låst i tests/samtalsvagen.spec.ts:323).
2. **Godkännandevägarna är levande, båda två.**
   - Manuellt: Inbox → `POST /api/suggestions/approve` (app/dashboard/inbox/page.tsx:287).
     `follow_up`/`callback` → `createFollowUp` → INSERT (app/api/suggestions/approve/route.ts:89–92, 246).
     `reminder` → `createReminder` → samma INSERT (rad 332–338).
   - Automatiskt: `lib/auto-approve.ts:167` → `executeApproveAction` i lib/approve-actions.ts,
     samma tre typer → samma INSERT (lib/approve-actions.ts:20–22, 342, 409). Auto-vägen är
     värst: där har ingen människa ens sett förslaget som "schemalades".
3. **Ingen läser kön.** Enda övriga referensen i hela kodbasen är `mark_resolved`-caset i
   app/api/actions/route.ts:88 — en avbockningsåtgärd som i sin tur **saknar anropare**.
   Grep på `human_followup_queue` ger exakt tre kodträffar: två INSERT, en UPDATE utan caller.
4. **Omfattning i prod är okänd härifrån.** Kör B3 i sql/status_migrationer_2026-08-10.sql
   (`COUNT(*)` + `MAX(created_at)`) för facit på hur många uppföljningar som redan läckt.

## Vägval (beslut för Andreas — inget ändrat i kod)

- **A (rekommenderad):** låt `createFollowUp` skapa poster i det befintliga tasksystemet
  (lib/task-presets.ts har redan kategorierna) eller i bevakningen/Idag-vyn — där hantverkaren
  faktiskt tittar. Därefter kan tabellen tömmas/droppas och `MANUAL_TABLES`-posten strykas.
- **B:** bygg en läsare för kön (vy + påminnelse). Mer bygge för samma värde som A.
- **C:** om B3 visar noll rader i prod och typerna i praktiken aldrig godkänns — behandla som
  död vikt: ta bort `createFollowUp`-vägarna och låt `follow_up`/`callback`/`reminder` få ett
  ärligt "stöds inte ännu"-svar i stället för ett falskt "schemalagd!".

Oavsett val: svarstexten "Uppföljning schemalagd!" får inte ljuga under tiden.

## Status för resten av Codex-briefen (facit 2026-08-10)

| # | Uppgift | Status |
|---|---------|--------|
| 1 | MorningBriefWidget + EarnedAutonomyPanel | **Halvklar.** MorningBrief borttagen (033d188b, e8cf40d3). EarnedAutonomyPanel är numera **monterad** i app/dashboard/agent/page.tsx:39,1250 — briefens premiss stämmer inte längre; ingen åtgärd. |
| 2 | case_record | **Klar** (36c86e6a). Kan droppas i DB — manuellt beslut; radestimat finns i statusskriptet. |
| 3 | human_followup_queue | **Denna rapport.** Bugg, inte död kod. |
| 4 | /api/dashboard/today | **Klar** — rutten borttagen. |
| 5 | Två cron-rutter | **Klar** (81a16ab7) — dagliga maintenance-rutten täckte redan expiry + telefonsynk; de fristående kunde aldrig köras. |
| 6 | Fortnox-rutträden | **KLAR 2026-08-10** (okommittad, se review i tasks/todo.md). Ett träd: /api/integrations/fortnox/*. Två buggar hittade på vägen: nya disconnect saknade manage_settings-grinden (portad + låst i permission-kontraktet) och sync-payments hade markerat makulerade Fortnox-fakturor som betalda (Cancelled prövas nu först). Verifierat: tsc, build, 4337 gröna tester. |
| 7 | Facit för otestade rena funktioner | **Delvis** (04ed2efc, 0d746915). Öppen. |
