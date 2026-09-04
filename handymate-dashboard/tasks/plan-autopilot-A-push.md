# Pass A: push når fram (2026-09-04)

Bakgrund: docs/audits/AUTOPILOT_REVISION_2026-09-04.md, avsnitt "1. Ingen får
veta". 0 prenumerationer, 0 skickade pushar, någonsin. Tre buggar på rad plus
att de flesta cronar aldrig pushar. Det här passet lagar alla fyra.

Repo: handymate-dashboard/. Svensk UI, riktiga å/ä/ö. BÖRJA SKRIVA KOD INOM
10 MINUTER. Ingen migration. Inga commits.

## Del 1 — components/PWAInstallBanner.tsx

Läs filen (den är kort). Tre fel att laga:

**a. Kvittot sätts utan att svaret läses** (rad ~80–87):
```ts
await fetch('/api/push/subscribe', {...})   // svaret ignoreras
setPushGranted(true)
localStorage.setItem(PUSH_SUBSCRIBED_KEY, '1')  // körs även vid 500
```
Läs `res.ok`. Sätt flaggan och `setPushGranted` BARA vid ok. Vid fel:
`console.warn` och lämna flaggan orörd så nästa besök försöker igen.

**b. Låsta piloter frigörs.** Byt `PUSH_SUBSCRIBED_KEY` från
`'handymate_push_subscribed'` till `'handymate_push_subscribed_v2'`. Alla som
låstes före v198 (tabellen fanns inte, 500 varje gång, flaggan sattes ändå)
får då en ny chans automatiskt. Skriv en kommentar som förklarar varför v2.

**c. Bara installerade PWA:er tillfrågas** (rad ~51):
`if (!isStandalone || !PUBLIC_VAPID_KEY) return`. Ändra till: fråga i
standalone ELLER när plattformen inte är iOS. iOS kräver installation
(CLAUDE.md), övriga klarar push i flik. Detektera iOS med
`/iPad|iPhone|iPod/.test(navigator.userAgent)` — behåll iOS-instruktionen
exakt som den är.

## Del 2 — "Aktivera notiser" i inställningar

app/dashboard/settings/page.tsx. Lägg ett kort "Notiser" med:
- status läst från `navigator.permissions`/`Notification.permission` +
  `reg.pushManager.getSubscription()`: "På", "Av", "Blockerad i webbläsaren"
- knapp "Aktivera notiser" som anropar samma prenumerationslogik som
  bannern. Bryt ut logiken till `lib/push/prenumerera-klient.ts` (klientsäker,
  'use client'-fri modul med en exporterad `prenumereraPaPush()`), så bannern
  och inställningssidan kör EXAKT samma kod.
- på iOS utan standalone: visa iOS-instruktionen i stället för knappen.
- en "Skicka testnotis"-knapp som POSTar till den befintliga
  /api/push/test-approval. Kunden ska kunna se att det fungerar.

## Del 3 — lib/approvals/skapa-kort.ts

Det finns 73 ställen som gör `.from('pending_approvals').insert(...)`. De ska
INTE alla skrivas om nu. Bygg en gemensam skapare och koppla in den där det
gör skillnad (Del 4).

```ts
export interface NyttKort { business_id, approval_type, title, description?, payload?, risk_level?, expires_at?, agent_run_id?, routed_agent?, ... }
export async function skapaKort(supabase, kort: NyttKort, opts?: { push?: boolean }): Promise<{ id: string } | null>
```
- insert i `pending_approvals`, `.select('id').single()`
- om `opts.push !== false`: anropa `sendApprovalPush` (lib/notifications/
  approval-push.ts, rad 288) med det skapade kortet. Den hanterar redan tyst
  tid (hallPush) och dedupe.
- fail-soft: pushfel loggas, kortet är ändå skapat. Insertfel returnerar
  null + console.warn — kasta aldrig.
- Läs approval-push.ts först: `sendApprovalPush(approval: ApprovalLike)` —
  matcha ApprovalLike exakt.

## Del 4 — koppla in där kunden faktiskt agerar

Dessa skapar kort kunden godkänner men pushar aldrig (Explore-kartan):
1. app/api/cron/karin-deadlines/route.ts (4 insert-ställen)
2. app/api/cron/missed-revenue/route.ts (4 — `missad_intakt`, `fakturera_projekt`)
3. lib/egenkontroll/suggest-time-entry.ts (3 — `tidrapport_forslag`)

Byt varje `.from('pending_approvals').insert({...})` mot `skapaKort(supabase,
{...})`. Behåll exakt samma fält. Rör inte logiken runt omkring.

## Facit: tests/autopilot-push.spec.ts (browserlöst)
- PWAInstallBanner: `PUSH_SUBSCRIBED_KEY` innehåller `_v2`; `setItem(PUSH_SUBSCRIBED_KEY`
  förekommer INTE före `res.ok`/`.ok` i subscribeToPush (indexOf); iOS-
  detektion finns; `!isStandalone` är inte längre ett ensamt returvillkor.
- lib/push/prenumerera-klient.ts exporterar `prenumereraPaPush`; både bannern
  och settings importerar den (ingen dubblerad pushManager.subscribe).
- settings innehåller "Aktivera notiser" och "Skicka testnotis".
- skapa-kort.ts: importerar `sendApprovalPush`; inserten kommer FÖRE pushen;
  `catch` runt pushen returnerar kortet ändå.
- De tre filerna i Del 4 innehåller `skapaKort(` och INTE längre
  `.from('pending_approvals').insert(`.
Lägg facit sist i BÅDE `test:contracts` i package.json och
../.github/workflows/contracts.yml. Uppdatera facit-route-auth-inventory om
den fäller (ingen ny rutt planeras — bör inte behövas).

## Verifiering
```
npx tsc --noEmit
npx playwright test tests/autopilot-push.spec.ts $(ls tests | grep -iE "push|approval|karin|tidrapport|missed" | sed 's#^#tests/#' | tr '\n' ' ') --no-deps --project=chromium --reporter=line
npm run test:contracts
npx next build
```
Rött som var rött före: rapportera, tvinga inte grönt. Rapportera ändrade
filer, exakta siffror, avvikelser.
