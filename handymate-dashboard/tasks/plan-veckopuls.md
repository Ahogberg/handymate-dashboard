# Actionplan: veckopulsen i Launch Desk (2026-09-03, Andreas: "Ja kör!")

Bakgrund: docs/gtm/SALJMASKINEN.md avslutas med "Ett tal per fredag" — fyra
tal som ska läsas av, inte räknas ut i huvudet. Det här passet bygger den
avläsningen som en panel överst i den befintliga Launch Desk
(app/admin/launch/page.tsx). Ingen ny sida, ingen ny tabell, ingen migration.

Repo: handymate-dashboard/. Svensk UI, riktiga å/ä/ö, ljust tema, teal #0F766E.
BÖRJA SKRIVA KOD INOM 10 MINUTER. Inga commits.

## Kolumnerna är VERIFIERADE mot produktionen — hitta inte på fler

Jag har slagit upp allt nedan i information_schema. Använd exakt dessa namn.
Behöver du en kolumn som inte står här: slå upp den, gissa aldrig. (En hel dag
gick åt idag till att laga kod som läste kolumner som inte fanns — PostgREST
underkänner HELA selecten när en kolumn är okänd, så en gissning ger 42703 och
en död vy, inte ett tomt fält.)

- `gtm_activity`: id, account_id, admin_user_id, channel, outcome, notes,
  happened_at, next_action_at, created_at
- `gtm_account`: id, company_name, status, owner_user_id, next_action_at,
  last_contact_at, contact_count, created_at, updated_at (m.fl.)
- `raddningsarende`: id, business_id, signal, severity, status, summary,
  first_seen_at, last_seen_at, owner, atgard, resolved_at, resolved_by
- `business_config`: business_id, business_name, subscription_status,
  subscription_plan, onboarding_completed_at, created_at

Kanoniska värden (lib/launch-desk/types.ts, verifierade):
- `GtmOutcome`: attempted, no_answer, spoke, replied, meeting_booked,
  demo_booked, offer_sent, won, lost, note
- `GtmStatus`: imported, qualified, ready, contacted, replied, meeting_booked,
  demo_booked, offer_sent, won, lost, suppressed
- Betalda prenumerationsstatusar: `PAID_STATES` i lib/onboarding/payment-gate.ts
  = ['active', 'comp']. Importera konstanten, hårdkoda den inte.

## Del 1 — lib/launch-desk/veckopuls.ts

Ren beräkningsmodul + en hämtare. Vecka = måndag 00:00 Europe/Stockholm till
nu. Använd `stockholmMinutesNow`-idiomet från lib/tysta-timmar.ts som förlaga
för tidszonshanteringen — räkna ALDRIG veckostart i UTC, det ger fel svar
varje söndagkväll och varje måndagmorgon.

```ts
export interface Veckopuls {
  veckostart: string              // ISO
  kontakter: number               // gtm_activity, outcome in (attempted,no_answer,spoke)
  genomgangarBokade: number       // gtm_activity, outcome in (meeting_booked,demo_booked)
  erbjudandenSkickade: number     // gtm_activity, outcome = offer_sent
  signeradeVeckan: number         // gtm_activity, outcome = 'won'
  signeradeTotalt: number         // gtm_account, status = 'won'
  betalandeKonton: number         // business_config, subscription_status in PAID_STATES
  aktivaKonton: number            // adoptionsmåttet, se Del 2
  konton60Dagar: number           // betalande OCH onboarding_completed_at <= nu-60d
  raddningskoOppna: number        // raddningsarende, status = 'open' (kolla faktiskt värde först)
}
export async function hamtaVeckopuls(supabase: SupabaseClient, nu?: Date): Promise<Veckopuls>
```

- Fail-soft per fråga: fel på EN källa ger 0 för just det talet och en
  console.warn — aldrig ett kastat fel som fäller hela panelen. Använd
  `arSchemaSaknas`-idiomet där det passar.
- `veckostart` beräknas av en REN, exporterad funktion
  `veckostartStockholm(nu: Date): Date` så facit kan testa den deterministiskt.

## Del 2 — aktiva konton: ÅTERANVÄND, bygg inte nytt

`lib/admin/adoption.ts` har redan den definition huset använder: "aktiv på ≥4
ytor inom 30 dagar", räknad retroaktivt ur befintliga tidsstämplar, med
fönstret startat vid `onboarding_completed_at` (importen i onboardingen ligger
före finalize och får medvetet inte räknas som egen användning).

Använd `hamtaAdoptionHandelser` + `computeAdoption` + `aggregateAdoption`.
**Skriv ingen andra definition av "aktiv".** Två mått som båda heter aktiv och
ger olika svar är värre än inget mått alls.

## Del 3 — kontant inne: bygg INTE, säg varför

Panelen ska visa en rad "Kontant inne" — men den ska INTE visa en siffra.
Anledningen: årsbetalning kontra månad lagras inte på `business_config`
(`subscription_plan` är starter/professional/enterprise, ingen intervall-
kolumn), och beloppen finns bara i `billing_event.data` (jsonb) vars form
ingen kan verifiera eftersom det ännu inte finns en enda riktig betalning.

Visa raden som "Inte kopplad än" med en kort förklaring i UI:t:
"Kopplas när första riktiga betalningen landat och webhookens form är
verifierad." Att visa 0 kr hade sett ut som ett svar. Det är det inte.

## Del 4 — GET /api/admin/launch/veckopuls

- `isAdmin(request)` + `getAdminSupabase()`, samma mönster som de andra
  rutterna under app/api/admin/launch/. Läs en av dem först.
- `export const dynamic = 'force-dynamic'` (GET-rutt som läser auth via helper
  — utan den cachas svaret och serveras till fel användare).
- Returnerar `Veckopuls`.
- Lägg till rutten i `PUBLIC_BY_DESIGN`/inventarielistorna i
  tests/facit-route-auth-inventory.spec.ts om det facit annars fäller.

## Del 5 — panelen i app/admin/launch/page.tsx

Överst, före den befintliga trattvyn. Kompakt, inte en ny dashboard.

Rad 1 — VECKAN (det vi styr):
  Kontakter · Genomgångar bokade · Erbjudanden · Signerade denna vecka
Rad 2 — LÄGET (det vi bygger):
  Signerade totalt · Betalande konton · Aktiva (≥4 ytor/30 d) · Kontant inne
Rad 3 — VARNINGAR:
  Konton äldre än 60 dagar · Öppna räddningsärenden

- Är `kontakter` noll: markera raden dämpat rött med texten "Ingen kontakt
  loggad den här veckan." Det är det enda talet som är helt inom vår kontroll
  och det första som glider.
- Glider `signeradeTotalt` och `betalandeKonton` isär: visa skillnaden som en
  liten notis ("2 markerade som kund men utan betalande konto"). Det är
  informationen, inte ett fel.
- Tomt läge är normalt före lansering — skriv "Inget loggat än", aldrig en
  påhittad nolla som ser ut som ett utfall.

## Facit: tests/veckopuls.spec.ts (browserlöst)
- `veckostartStockholm`: måndag 00:00 svensk tid för ett par kända datum,
  inklusive ett söndagkväll-fall och ett över en sommartidsövergång.
- Källskanning veckopuls.ts: importerar `PAID_STATES` (hårdkodar inte
  ['active','comp']), importerar från lib/admin/adoption (definierar inte
  "aktiv" på egen hand), och innehåller inga andra tabellnamn än de fyra
  ovan.
- Källskanning: rutten har `isAdmin(`, `force-dynamic`.
- Källskanning page.tsx: innehåller "Inte kopplad än" för kontantraden och
  ingen `0 kr`-literal för den.
Lägg facit-namnet sist i BÅDE `test:contracts` i package.json och listan i
../.github/workflows/contracts.yml.

## Verifiering
```
npx tsc --noEmit
npx playwright test tests/veckopuls.spec.ts --no-deps --project=chromium --reporter=line
npm run test:contracts
npx next build
```
Rött som var rött före passet: rapportera, tvinga inte grönt. Rapportera
ändrade filer, exakta testsiffror och allt du avvek från.
