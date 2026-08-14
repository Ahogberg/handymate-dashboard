# Business Twin — idébacklog

> **Filen återskapades 2026-08-14.** Den refererades från tre ställen i
> repot (`docs/council/ACTIVE_ROADMAP.md`, `components/value/MalBlock.tsx`,
> `sql/v128_revenue_target.sql`) men hade aldrig committats —
> `git log --all` gav noll träffar för sökvägen. Det här är återskapandet,
> avstämt mot de tre referenserna och mot faktisk kod, inte en gissning av
> vad originalet innehöll.

Det här är idébackloggen för Business Twin-visionen: **Sense → Understand
→ Predict → Prioritize → Act → Verify → Learn → Prove Value.** Varje idé
här får byggas **först** när den har en namngiven riktig konsument — samma
"vänta på andra konsument"-princip som `ACTIVE_ROADMAP.md` Operating
Principles §5 ("Andra konsumenten före generalisering"). En idé i den här
filen är ett kandidatläge, inte en beställning.

Numreringen fortsätter från `ACTIVE_ROADMAP.md`s BUSINESS_TWIN #1–#8
(Next Best Action, One Decision, Owner-by-Exception, Business Simulation,
AI Leadership Meeting, Autonomous Recovery, Firm-specific Operating
Model/Playbook, Owner Absence Mode) och #9 (Business State/Project
Reality) — alla katalogiserade där. Den här filen listar #9 (statusen
uppdaterad efter bygget 2026-08-14) och #11–#17.

---

## #9 Business State / Project Reality

**Status: V1 BYGGD OCH IHOPKOPPLAD 2026-08-14** (ej ännu skarpt browser-
verifierad — se `tasks/todo.md`, en fristående auth-rig-lucka blockerar
inloggad Playwright-körning mot prod just nu).

V1 = `lib/projects/project-reality.ts` (`deriveProjectReality`): ren
komposition av redan kanoniska härledningar — `computeProjectEconomics`
(`lib/projects/compute-economics.ts`) och `deriveProjectLifecycle`
(`lib/projects/derive-lifecycle.ts`). Inga nya beräkningar, inget nytt
lagrat. `ProjectReality`-typen har medvetet BARA fält med en kanonisk
källa; `plannedProgress`, `forecast`, costCompleteness-prognos och
`unresolvedPromises` saknar källa idag och står uttryckligen utanför
typen tills en finns.

Konsumenten är Cross-Agent Case, helt ihopkopplad: `lib/jarvis/project-case.ts`
(`hittaProjektCase`) grupperar godkännanden till ett case när **minst två
distinkta** signaltyper (`profitability_warning`, `create_ata_draft`,
`missad_intakt`, `fakturera_projekt`) pekar på samma `project_id` →
`app/api/project-cases/route.ts` komponerar reality per case → `ProjektCaseKort.tsx`
renderas i `JarvisHome` ovanför kön (samma zon som Next Best Action-hero'n).
Inga egna godkänn-knappar på kortet — varje signal behåller sitt eget
kort och sin egen knapp i kön nedanför, samma fyra-ögon-regel som
`completion_batch_id` redan bevisat. Facit: `tests/project-case.spec.ts`,
`tests/project-reality.spec.ts` (26 gröna).

---

## #11 Company Goals → beslut

**Status: DATA FINNS, KONSUMENT SAKNAS.**

`business_config.margin_target_percent` (OBS: DEFAULT 50 — en orörd
default får ALDRIG behandlas som ägarens uttalade mål; kräver en
satt-flagga/timestamp innan agent-logik får läsa den) +
`revenue_target_annual_sek` (nytt, v128, nullable — ett osatt mål visar
ingen rad, aldrig "0 kr"). Nästa steg: Guardian-orsaksrad + NBA-
promptinput läser målen NÄR satt-flaggan finns.

---

## #12 Lär Handymate

**Status: SKEPPAD** (v129, `business_rule`-typen med Daniels offertmotor
som konsument; `priority_rule`-typen med Next Best Action som konsument,
v131–v132).

---

## #13 Cross-Agent Case-utvidgning

**Status: IDÉ.** V1 (#9) täcker de fyra `payload.project_id`-bärande
"går snett"-typerna. Utvidgning kräver indirekt uppslag: `invoice_
reminder` (via `invoice.project_id`, nullable efter v52-backfill),
`quote_nudge` (via projektets omvända offert-koppling), `dispatch_
suggestion` (booking/work_order — inte projektbunden alls).

---

## #14 Coordinated proposals ("one event → coordinated proposal")

**Status: IDÉ, PRINCIPSPÄRRAD tills vidare.** Prejudikat finns
(`completion_batch_id`: gemensam rubrik, varje åtgärd behåller sin egen
knapp — aldrig bundlat "godkänn allt", fyra-ögon-regeln gäller per
åtgärd). Utvidgning till exempelvis ÄTA-godkänd → paketförslag ska ärva
exakt den regeln, inte uppfinna en ny.

---

## #15 Policy-typer (scoped, inte promptblob)

**Status: IDÉ.** Mönstret från #12: varje ny `knowledge_type`
(commercial/scheduling/customer/priority policy) kräver en namngiven
konsument INNAN typen införs — aldrig en generell regelbank utan mottagare.

---

## #16 Playbook-motorn (lesson-mönster → föreslagen regel)

**Status: DATA-SPÄRRAD.** `project_lesson` hade 0 rader vid research
2026-08-13; "≥3 liknande lärdomar → föreslå regel" kan inte trigga på tom
data. Vänta tills debrief-flödet (skeppat 2026-08-13) genererat verklig
volym.

---

## #17 Company Reality (deriveCompanyReality)

**Status: IDÉ, VÄNTAR PÅ #9-BEVIS.** Summering uppåt (projekt → hela
företaget) byggs först när Project Reality bevisat sitt värde hos
riktiga användare — inte i förväg för en tänkt andra konsument.

---

## Källor/relaterat

- `docs/council/ACTIVE_ROADMAP.md` — auktoritativ roadmap; Operating
  Principles §5 ("Andra konsumenten före generalisering") och
  BUSINESS_TWIN-tabellen i "Läge 2026-08-13"-sektionen (#1–#9).
- `docs/design/SYNLIG-INTELLIGENS.md` — Kvittoprincipen; samma disciplin
  om att beräknad intelligens måste nå skärmen för att räknas som byggd.
- `lib/projects/project-reality.ts`, `lib/jarvis/project-case.ts`,
  `app/api/project-cases/route.ts`, `components/jarvis/ProjektCaseKort.tsx`
  — #9:s faktiska kod, byggd och verifierad 2026-08-14.
- `components/value/MalBlock.tsx`, `sql/v128_revenue_target.sql` — #11:s
  faktiska kod.
