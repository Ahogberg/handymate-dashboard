# Pass B: utgångna kort syns, kortdiet (2026-09-04) — KÖRS EFTER PASS A

Bakgrund: docs/audits/AUTOPILOT_REVISION_2026-09-04.md, avsnitt 2 och 4.
Förutsätter att lib/approvals/skapa-kort.ts finns (pass A). BÖRJA SKRIVA KOD
INOM 10 MINUTER. Ingen migration. Inga commits.

## Del 1 — kort som går ut lämnar spår

app/api/cron/maintenance/route.ts steg 1 (rad ~35–46) sätter
`status='expired'` och gör inget mer. Ett kort som ingen såg blir detsamma
som ett kort som aldrig fanns.

Ändra: `.select('id, business_id, approval_type, title')` i stället för bara
id. Gruppera per business_id. För varje konto med ≥1 utgånget kort: skriv EN
rad i `automation_activity` (verifierade kolumner: id:text, business_id,
automation_type, action, description, metadata:jsonb, status, created_at):
- automation_type: 'kort_utgangna'
- action: 'expired'
- description: "3 förslag gick ut utan beslut: Karin – Faktura 1042 förfaller,
  Daniel – Följ upp offert till Ek, …" (max 3 titlar, sedan "och N till")
- metadata: { approval_ids, approval_types }
- status: 'auto'
Läs först hur app/api/automations/activity/route.ts läser tabellen (rad ~20)
så raden faktiskt dyker upp i "Skött utan dig" — matcha de fält den
filtrerar på. Titta på ett befintligt insert-ställe för automation_activity
för id-generering och statusvärden.

## Del 2 — push dagen före utgång

Ny cron app/api/cron/kort-gar-ut/route.ts, `verifyCronSecret`, schema i
vercel.json `0 16 * * *` (Hobby-planen: en gång per dag, validera uttrycket).
Hämtar kort med status pending och `expires_at` inom 24–48 h, grupperar per
konto, skickar EN `sendInternalPush` per konto: "2 förslag går ut i morgon.
Öppna Handymate för att ta ställning." Dedupe via push_dispatch_log-nyckel
`kort_gar_ut:<business_id>:<datum>` — läs hur sendInternalPush/hallPush
dedupar och återanvänd. Lägg rutten i tests/cron-auth.spec.ts-taket (+1,
förklara) och i facit-route-auth-inventory om den fäller.

## Del 3 — kortdiet: fyra typer blir digestrader

Typer med > 90 % utgång i produktionen: `agent_observation` (104/105),
`dispatch_suggestion` (35/36), `monthly_review` (12/12),
`checklist_forslag` (23/25). De kräver inget beslut — de är information — och
när de är kort lär de kunden att kort kan ignoreras.

Reversibelt via en karta, INTE genom att ta bort kod:
- lib/approvals/kortkanal.ts: `export const KORTKANAL: Record<string, 'kort' | 'digest'>`
  med de fyra typerna på 'digest', allt annat implicit 'kort'. Exportera
  `kanalFor(approvalType): 'kort' | 'digest'`.
- I `skapaKort()` (pass A): om `kanalFor(type) === 'digest'` ⇒ skriv INTE ett
  kort; skriv en `automation_activity`-rad (automation_type = approval_type,
  action 'observed', description = title + ev. första meningen ur
  description, status 'auto') och returnera `{ id, kanal: 'digest' }`.
  Pusha inte — digestrader är tysta per definition.
- Koppla in skapaKort på de ställen som skapar de fyra typerna:
  lib/agents/shared/save-and-push.ts (agent_observation, rad ~237),
  app/api/cron/monthly-review/route.ts (monthly_review, rad ~86), och de
  filer som skapar dispatch_suggestion och checklist_forslag (grep
  `approval_type: 'dispatch_suggestion'` / `'checklist_forslag'`). Byt inserten,
  rör inget annat.
- OBS monthly-review skickar också ett SMS (rad ~69) — det ska vara kvar.
  Kortet var dubbelt; SMS:et är rapporten.

## Del 4 — team_intro-korten löses

Nio konton har tre `team_intro`-kort liggande som väntande sedan
onboardingen. Hitta var de skapas (app/api/onboarding/route.ts, grep
team_intro) och var de renderas. Lägg i maintenance steg 1 en regel: kort av
typ team_intro äldre än 7 dagar sätts till status 'approved' (inte expired —
de var aldrig ett förslag att avvisa) med resolved_by 'system'. Ett kort som
aldrig går att stänga lär kunden att kort inte betyder något.

## Facit: tests/autopilot-utgang.spec.ts (browserlöst)
- maintenance: selectar business_id + approval_type + title vid expiry;
  skriver automation_activity med automation_type 'kort_utgangna';
  team_intro-regeln finns och sätter 'approved', inte 'expired'.
- kort-gar-ut: verifyCronSecret, fönster 24–48 h, en push per konto, dedupe-
  nyckel innehåller business_id och datum. vercel.json har rutten med ett
  giltigt Hobby-schema (exakt ett `0 H * * *`-uttryck).
- kortkanal.ts: de fyra typerna är 'digest'; `kanalFor('karin_deadline')`
  är 'kort'; kanalFor är en ren funktion (enhetstest).
- skapa-kort.ts: grenar på kanalFor; digest-grenen skriver automation_activity
  och pushar inte (källskanning: ingen sendApprovalPush i den grenen).
- de fyra skapande filerna använder skapaKort.
Lägg facit sist i BÅDE `test:contracts` och contracts.yml.

## Verifiering
```
npx tsc --noEmit
npx playwright test tests/autopilot-utgang.spec.ts tests/cron-auth.spec.ts $(ls tests | grep -iE "maintenance|approval|observation|monthly|dygns" | sed 's#^#tests/#' | tr '\n' ' ') --no-deps --project=chromium --reporter=line
npm run test:contracts
npx next build
```
Rapportera ändrade filer, exakta siffror, avvikelser. Inga commits.
