# Pass D: NBA får sina principer, kill-switchen täcker allt (2026-09-04)

Bakgrund: docs/audits/AUTOPILOT_REVISION_2026-09-04.md, avsnitt 3 och åtgärd 8.
Litet pass, två oberoende fixar. BÖRJA SKRIVA KOD INOM 10 MINUTER. Ingen
migration. Inga commits.

## Del 1 — NBA hoppar över alla

lib/jarvis/next-best-action.ts rad 128–137: kräver ≥1 rad i
`business_knowledge` med `knowledge_type='priority_rule'`, annars
`skipped_no_principles`. Inget betalande konto har någon. `next_best_action`
har noll rader, någonsin.

Fix: **husregler som standard** när kontot saknar egna.
- Ny fil lib/jarvis/husregler.ts: `export const HUSREGLER: string[]` med tre
  principer på svenska, formulerade som en hantverkare skulle säga dem:
  1. "Pengar som redan är intjänade går före nya affärer — fakturera och
     påminn innan du offererar."
  2. "Det som förfallit går före det som kommer."
  3. "En kund som väntar på svar går före internt arbete."
- I next-best-action.ts: läs kontots principer som nu. Är listan tom ⇒
  använd HUSREGLER i stället (INTE i tillägg) och sätt en flagga
  `principles_source: 'husregler' | 'kontot'` som sparas i
  `next_best_action.principles_applied` (jsonb, finns) så det syns i
  efterhand vilka regler som gällde. Ta INTE bort MIN_PRINCIPLES-kontrollen —
  den ska bara aldrig kunna slå till när husreglerna finns.
- Kolumnerna i business_knowledge är verifierade: id, business_id, agent_id,
  knowledge_type, title, observation, suggestion, confidence, data_basis,
  status, dedup_key, dismissed_at, resolved_at, created_at, job_type.
  Principerna läses ur `observation`. Skriv INGA nya rader — husreglerna är
  konstanter i kod, inte data.

## Del 2 — evaluate-thresholds saknar kill-switchen

app/api/cron/evaluate-thresholds/route.ts rad ~27 väljer alla företag utan
att kontrollera `agents_globally_paused`, och kan via v3-regler skicka SMS/
e-post till kundens kunder (lib/automation-engine.ts:298, 354). Lägg samma
grind som de andra cronarna: läs `agents_globally_paused` i business_config-
selecten och hoppa över pausade konton med en räknare `skipped_paused` i
svaret. Läs t.ex. app/api/cron/karin-deadlines/route.ts rad ~92 för exakt
mönster.

## Facit: tests/autopilot-nba.spec.ts (browserlöst)
- husregler.ts exporterar HUSREGLER med exakt 3 strängar, alla med å/ä/ö
  som riktiga tecken (ingen `å`).
- next-best-action.ts importerar HUSREGLER; `principles_source` skrivs;
  MIN_PRINCIPLES-kontrollen finns kvar.
- evaluate-thresholds: `agents_globally_paused` selectas och filtreras;
  `skipped_paused` finns i svaret.
Lägg facit sist i BÅDE `test:contracts` i package.json och
../.github/workflows/contracts.yml.

## Verifiering
```
npx tsc --noEmit
npx playwright test tests/autopilot-nba.spec.ts $(ls tests | grep -iE "nba|next-best|threshold|cron-auth" | sed 's#^#tests/#' | tr '\n' ' ') --no-deps --project=chromium --reporter=line
npm run test:contracts
npx next build
```
Rapportera ändrade filer, exakta siffror, avvikelser. Inga commits.
