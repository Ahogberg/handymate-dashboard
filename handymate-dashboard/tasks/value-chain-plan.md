# Plan: Stäng värdekedjorna — "motorerna finns, triggern saknas"

_2026-08-03, Andreas-beslut efter tre parallella kodrevisioner
(agentverktygs-gap, värdekedje-döda-ändar, kundlivscykelns manuella steg)
inför lansering. Konvergent fynd: motorerna, kön och godkännandemekaniken
finns — men triggrarna saknas. Systemet väntar på att någon säger åt det
när. Beslut: Våg 1+2 byggs nu, Våg 3 väntar på pilotsignal (samma
gate-princip som easoft-gap-plan.md)._

## Fyra korrekthetsbuggar hittade under revisionen

1. **learning_events skrivs nästan aldrig** — `lib/agent/learning-engine.ts`
   skriver `reference_id: params.id` (TEXT, `appr_...`) mot en UUID-kolumn
   (`sql/v5_learning_events.sql:19`) → tyst insert-fel → hela
   lärande-kedjan (→ ai_learned_preferences → systemprompt) är i praktiken
   frånkopplad.
2. **auto-approve-confidence för hög (SÄKERHET)** —
   `lib/auto-approve-learning.ts:138-152` selectar en `context`-kolumn som
   inte finns → `edited_count` alltid 0 → redigerade förslag räknas som
   rena godkännanden → förtjänad autonomi eskalerar snabbare än designat.
3. **Agentskapade offertrader tomma i PDF** — tool-router createQuote
   mappar `i.description` men schemat definierar `name`.
4. **Agentvägen kollar aldrig ROT-taket** — alla fem manuella fakturavägar
   anropar `lib/rot-rut-limits.ts`, agentens createQuote/createInvoice
   aldrig → kan lova kunden avdrag som spränger 50 000-taket.

## VÅG 1 — Korrekthetsbuggar + verktygsallokering — EJ PÅBÖRJAD

**1a. learning_events lagad:** migration
`sql/v78_learning_events_reference_text.sql` (ALTER `reference_id` → TEXT;
Andreas kör manuellt; verifiera först mot faktiskt prod-schema — lärdomen
2026-08-01/08-03: kolumntyper kan ha glidit). Fixa
`lib/auto-approve-learning.ts` att läsa faktiska kolumner och räkna
`edited_count` korrekt. Facit-tester på edited-count-beräkningen.
Stickprov i Supabase efter deploy att events landar.

**1b. Agent-offertbuggar:** `i.name`-mappningen + ROT-takkontroll i
tool-router createQuote/createInvoice (samma mönster som
`app/api/invoices/from-quote`). Facit-test på takkontrollen.

**1c. Verktygsallokering** (`lib/agents/personalities.ts:66-160`):
Daniel += get_pricing_suggestion, get_efterkalkyl_insight ·
Karin += check_fortnox_status, trigger_fortnox_sync ·
Lars += get_project_profitability, get_efterkalkyl_insight ·
Hanna += run_customer_base_sweep · Lisa += book_site_visit.
Ren konfiguration — verktygen är redan byggda och routade.

**1d. Hannas kapacitetsfyllnad rankar på LTV:**
`lib/agents/hanna/capacity-fill.ts:157` — byt sorteringsnyckel från
`days_since_last_job` till LTV-viktad (kolumnen hämtas redan på rad 352).

## VÅG 2 — Trigger-inkopplingar av redan byggda motorer

**2a. Auto-offertutkast från kvalificerad lead — EJ PÅBÖRJAD (STÖRSTA HÅLET)**
Motorn: `lib/ai-quote-generator.ts` (produktbank v67 + mallar + historik) —
enda anroparen idag är UI-knappen. Bygg: lead kvalificeras över tröskel →
utkast genereras → `create_quote_draft`-kort (exekveraren finns redan
orphan i approvals/[id]/route.ts) med rader + konfidens. Persona: Daniel.
Bakgrunds-klassning (cost-guardrails). Dedup: inget utkast om leaden redan
har offert. ÅTERANVÄND ai-quote-generator — bygg INTE via döda
`lib/e2e-deal-flow.ts` (11-stegsmotor utan anropare; referens, städas ev.
senare). Demo-verifiering: seedad lead på demokontot → kort med
produktbanksrader.

**2b. ÄTA-kedjan — EJ PÅBÖRJAD (störst pengavärde)**
Allt finns utom kopplingen: exekveraren `create_ata_draft`
(approvals/[id]/route.ts:996), signeringsflödet (ata/sign/[token]),
intent-klassificeringen (`lib/matte/intent-agent.ts:57`). Bygg: nytt
agentverktyg `create_ata_draft` i BÅDA tool-filerna (Daniel + Matte),
wire:a `lib/matte/action-executor.ts`. Trigger: kundkommunikation klassad
som tilläggsbeställning → kort i kön. Facit-test på intent→action-mappningen.

**2c. Karin på förfallen faktura — EJ PÅBÖRJAD**
`app/api/cron/check-overdue/route.ts:51` sätter idag bara status. Lägg
till `triggerAgentInternal('invoice_overdue')` — triggern redan deklarerad
(`personalities.ts:74`), `invoice_*`-prefix routar till Karin.
Reminder-cronen kvar som fallback med dedup mot Karins kort.

**2d. Lars + Hanna på avslutat jobb — EJ PÅBÖRJAD**
`booking/complete-job` + `projects/route.ts` fryser efterkalkylen men
väcker ingen agent. Trigga `job_completed` (finns i bådas triggerlistor,
`personalities.ts:95,138`). Nytt läsverktyg `get_project_outcome`
(specifikt projekt — get_efterkalkyl_insight är bara aggregat). Hanna
återanvänder `lib/agents/hanna/avtal-forslag.ts`-logiken i rätt ögonblick.

**2e. Daniel får push på efterkalkyl — EJ PÅBÖRJAD**
`lib/agents/daniel/observation-prompt.ts` läser aldrig `project_outcome`.
Lägg till outcome-aggregat per jobbtyp (ÅTERANVÄND helpern i
`lib/efterkalkyl/get-insight.ts`) + `ata_frequency` från business_patterns
(idag write-only). Möjliggör "badrummen drar 22 % över — höj tidsraderna"
och "jobbtypen får ÄTA i 60 % av fallen — lägg in buffert".

## VÅG 3 — EFTER PILOTSIGNAL (byggs INTE nu)

- **Byggdagbok-förslag**: auto-utkast från befintlig data (bokningar +
  foton + tid + checklisteavvikelser); kopiera tidrapport_forslag-
  arkitekturen. Idag ett manuellt 10-fältsformulär
  (`app/api/projects/[id]/logs/route.ts:43-80`).
- **Grannskapskampanj-kort vid projektavslut**: `lib/leads/
  neighbour-campaign.ts` finns, triggas idag bara från UI-modal. Enda
  posten som genererar NY intäkt snarare än sparar tid.
- **Materialbeställning lista→order**: Ahlsell-adapter
  (`lib/suppliers/registry.ts`) + `/api/orders` finns; autopilot stannar
  vid textlista. `low_stock_alert` föreslår heller aldrig påfyllnad.
- **Recensionsfångst**: `review_rating`/`review_text` läses på 3 ställen
  (microsajt, generate-content, settings) men skrivs på 0 —
  recensionssektionen är permanent tom. Fånga via portal/SMS-länken innan
  Google-vidarekoppling; kort till ägaren vid ≤3 stjärnor.
- **Egenkontroll-avvikelselogg**: avvikelser slängs idag vid kvittering
  (`approvals/[id]/route.ts` egenkontroll_avvikelse-caset returnerar bara
  acknowledged) trots att syftet är besiktnings-/tvistunderlag.
  `uploaded_by` skickas redan i payloaden och läses aldrig.
- **Portal-meddelanden → agent**: SMS får Matte-behandling, portalen får
  ingenting (`app/api/portal/[token]/messages` sparar bara).
- **Per-person-lönsamhet**: en join bort (time_entry.business_user_id ×
  project_outcome) men KRÄVER medvetet produktbeslut — "Micke är
  långsammare på badrum" är känslig data, ska designas, inte smygas in.

## Stående regler (samma som easoft-gap-plan + storfirman-planen)

- En byggagent åt gången; spec/granskning/commit personligen; tsc + facit-
  tester före varje commit.
- SQL-migrationer som fil i sql/, körs aldrig programmatiskt.
- Schema verifieras mot faktisk kod/DB före varje ny query.
- Nya agentverktyg i BÅDA tool-filerna (definitions + router).
- Inga utskick utan kö. Nya AI-anrop klassas bakgrund (cost-guardrails).
- Ingen förtjänad autonomi på nya approval-typer utan separat beslut.

## DoD per våg

- tsc + full facit-testsvit rena.
- Våg 1: nya facit-tester (edited-count, ROT-tak); Supabase-stickprov att
  learning_events landar.
- Våg 2: facit-tester (utkast-dedup 2a, intent→action 2b); demo-seed 2a.
- capability-inventory.md uppdateras per stängd våg.
