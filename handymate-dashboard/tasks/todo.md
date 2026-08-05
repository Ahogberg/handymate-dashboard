# VP2 — Attributionsryggraden (ärliga kronor) — KLAR 2026-08-05

_Plan 2026-08-05. Underlag: kartläggning med fil:rad i sessionen.
Nyckelfynd: v3_automation_logs.approval_id FINNS (sql/v3_automation_logs.sql:18),
sms_log har oanvända trigger_type/trigger_id → INGEN ny migration behövs.
quote-follow-ups v3-insert saknar trigger_type (NOT NULL) → har tyst failat._

## Del 1 — approval_id nedströms (gap 1)

- [ ] `app/api/approvals/[id]/route.ts`: bredda `executeApprovalPayload`-typen
      med `id: string`; skicka `approvalId` genom `sendSms()`-closuren (rad 545)
- [ ] `lib/sms-send.ts`: ny optional `approvalId` i `SendSmsArgs` →
      skrivs som `trigger_type: 'approval'` + `trigger_id` i sms_log-inserten
      (kolumnerna finns sedan sql/sms_tables.sql, oanvända)
- [ ] v3-inserterna i approvals-routen (proactive_care rad 1017,
      warranty_followup rad 1058): sätt `approval_id`

## Del 2 — recovered_revenue-kärnan (gap 2)

- [ ] Ny `lib/value/recovered-revenue.ts` — samma delning som frequency-guard:
      rena funktioner (testbara, tar nowMs) + separat I/O-funktion
- [ ] Fönster: offert accepterad ≤14 dgr / faktura betald ≤14 dgr /
      bokning skapad ≤7 dgr efter kortets resolved_at
- [ ] Regler (ärlighetslagen):
      - En händelse attribueras till MAX ett kort — senaste kortet vinner
      - Faktura med quote_id vars offert redan attribuerats → SKIPPAS
        (samma pengar räknas aldrig två gånger)
      - Bokning = verifierad händelse men amount_kr 0 (inget verifierat
        kronvärde finns — aldrig schablon i Återvunnet-siffran)
      - Endast outbound-korttyper attribuerar (RECOVERY_APPROVAL_TYPES)
      - Kort: status approved/auto_approved, tidsstämpel resolved_at
        (fallback created_at), kund via payload.customer_id
- [ ] Facit-tester `tests/recovered-revenue.spec.ts` (Playwright --no-deps,
      mönster från frequency-guard.spec.ts): fönstergränser exakt,
      senaste-kortet-vinner, dubbelattribution förbjuden, faktura/offert-
      dedupe, bokning 0 kr, korttypsfilter

## Del 3 — Mätfelen i quote-follow-up (gap 4)

- [ ] Huvudloopen rad 241: `.eq('status','sent')` → `.in('status',['sent','opened'])`
- [ ] v3-loggen (rad 314) + follow_up_count (rad 308): flyttas till EFTER
      agent-triggern, status efter faktiskt utfall, `trigger_type: 'cron'` läggs
      till (NOT NULL — inserten har tyst failat utan den)
- [ ] Förfallo-nudgen loggar utfall till v3_automation_logs efter sändning
- [ ] Bifynd (samma felmönster): `app/api/cron/review-requests/route.ts:319`
      skriver `metadata:` (kolumn finns ej — ska vara `context:`) och saknar
      trigger_type → rättas

## Del 4 — weekly-value konvergerar (gap 2 forts)

- [ ] `lib/weekly-value.ts`: confirmed_kr-motorn (rad 106–167, utan
      tidsfönster + utan dubbelspärr) byts mot recovered-revenue-kärnan
      med 7-dagarsfönster; interfacet `WeeklyValue` oförändrat
- [ ] Schablondelarna (captured/tid) orörda men TYDLIGT separerade i
      UI-copy (`components/dashboard/WeeklyValueDigest.tsx`):
      confirmed = "verifierat", övrigt = "uppskattning"

## Verifiering

- [ ] `npx tsc --noEmit` — 0 fel
- [ ] `npx next build` — grön
- [ ] `npx playwright test tests/recovered-revenue.spec.ts --no-deps` — grönt
- [ ] Befintliga facit-tester (frequency-guard, kapacitet-fyllnad,
      serviceavtal) fortsatt gröna
- [ ] Commit + push (auto-deploy)

## Review (2026-08-05)

Alla fyra delar byggda och verifierade (tsc 0 fel, next build exit 0,
238/238 facit-tester gröna varav 38 nya för attributionskärnan).

- Del 1: approval_id flödar nu kort→sms_log (som trigger_type='approval' +
  trigger_id — befintliga oanvända kolumner, ingen migration) och kort→
  v3_automation_logs (proactive_care-caset; kolumnen fanns redan).
  warranty_followup loggar till gamla automation_logs (saknar approval_id-
  kolumn) men dess SMS bär referensen via sms_log — kedjan finns.
- Del 2: lib/value/recovered-revenue.ts — rena funktioner + fail-soft I/O.
  Bokningar attribueras som händelser med 0 kr (inget verifierat kronvärde).
  Faktura vars offert redan räknats skippas. Direktreferens (quote_id)
  slår kundmatch; inom samma bevisnivå vinner senast godkända kortet.
- Del 3: quote-follow-up loggar nu EFTER agent-köningen med ärlig status
  och trigger_type (NOT NULL — gamla inserten har tyst failat hela tiden);
  follow_up_count stegas bara vid lyckad köning; huvudloopen tar med
  'opened'; förfallo-nudgen loggar utfall. Bifynd fixat: review-requests
  skrev metadata: (kolumn finns ej) utan trigger_type — även den tyst-failad.
- Del 4: weekly-value.ts confirmed_kr går via kärnan (7-dagarsfönster,
  dubbelspärr). Interface oförändrat — route/komponent orörda sånär som på
  nivå 1-etiketten ("verifierat · ... efter teamets utskick").

Noterat till VP3/VP4: gamla confirmed-motorn räknade accepterade offerter
utan tidsfönster — siffran kan alltså SJUNKA för befintliga konton. Det är
avsikten (ärlighetslagen). SavedScoreboards krono-TODO löses i VP4 med
samma kärna.
