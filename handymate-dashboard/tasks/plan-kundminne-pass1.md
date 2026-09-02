# Actionplan: kundminnet över kanaler, pass 1 (2026-09-02, Andreas: "Kör!")

Bakgrund: docs/audits/KUNDMINNE_REVISION_2026-09-02.md. Det här passet
stänger gap 1, 2, 3, 4, 5, 8 och 9 — rena matchnings-/läsfixar utan ny
modell, ingen migration, ingen ny AI. Gap 6 och 7 är pass 2 (ej nu).

Repo: handymate-dashboard/ (Next.js 14, Supabase service-role via
getServerSupabase, svensk UI, riktiga å/ä/ö i källkod). Läs varje fil
innan du ändrar den. Ändra bara det som står här.

## Gap 1 — SMS-historik per kund, inte per nummersträng
Filer: app/api/customers/[id]/timeline/route.ts (SMS-sektionen, ~rad
150–156) och lib/compliance/communication-trail.ts (sms_conversation- och
sms_log-blocken, ~rad 219–228 och närliggande).
- Problem: läsarna matchar `.eq('phone_number', customer.phone_number)`
  medan skrivarna alltid skriver E.164. En kund sparad som "070-123 45 67"
  får osynlig SMS-historik.
- Fix: importera `phoneCandidates` från lib/voice/find-customer-by-phone.ts
  (redan exporterad) och byt till `.in('phone_number', phoneCandidates(customer.phone_number))`.
  Om kandidatlistan är tom: hoppa frågan (ingen historik), inte `.in([])`.
- Gäller BÅDA riktningarna där numret jämförs (inkommande/utgående kolumn
  om de skiljer sig — läs koden).

## Gap 2 — Mattes resolver normaliserar numret
Fil: lib/matte/resolver.ts (~rad 69–74).
- Byt den råa `.eq('phone_number', cleanFrom)`-uppslagningen mot
  `findCustomerByPhone(supabase, businessId, cleanFrom)` (lib/voice/
  find-customer-by-phone.ts). Behåll returformen (customer_id, name,
  phone) så resten av resolvern är orörd. Lead-uppslaget (om det finns
  separat) får samma kandidatlogik via `phoneCandidates` + `.in()`.

## Gap 3 — resolvern läser samtal
Fil: lib/matte/resolver.ts.
- Utöka `channel: 'sms' | 'email' | 'portal'` (rad ~38) med `'call'`.
- I `Promise.all` (~rad 139–232) lägg en fråga mot `call_recording`:
  `select('id, transcript_summary, created_at, direction')`
  `.eq('business_id', businessId).eq('customer_id', customerId)`
  `.not('transcript_summary', 'is', null)`
  `.order('created_at', { ascending: false }).limit(5)` — bara när
  customerId finns. Mappa till history-poster med `channel: 'call'`,
  text = transcript_summary, samma form som sms/email-posterna
  (~rad 267–279). Sortera in kronologiskt som övriga.
- Fail-soft: fel på frågan ⇒ tom lista + console.warn, aldrig kasta.
- Kontrollera att intent-agentens promptbygge (lib/matte/intent-agent.ts)
  renderar history generiskt så 'call' visas; om den switchar på kanal,
  lägg etiketten 'Samtal'.

## Gap 4 — ägaren skiljs från kunden på inkommande SMS
Fil: app/api/sms/incoming/route.ts (före `resolveEntity`, efter att
businessen är löst, ~rad 108 och framåt).
- Ny helper i lib/matte/owner-sender.ts:
  `isTeamPhone(supabase, businessId, from): Promise<boolean>` — slår upp
  `business_users` `select('id')` `.eq('business_id', businessId)`
  `.eq('is_active', true)` `.in('phone', phoneCandidates(from))`
  `.limit(1)`; fel eller tom kandidatlista ⇒ false (fail-closed = kund,
  som i dag).
- I rutten: om `isTeamPhone` ⇒ hoppa HELA kundflödet (ingen resolveEntity,
  ingen runIntentAgent, ingen executeMatteActions, inget kundsvar).
  Logga `console.info('[sms/incoming] avsändaren är en i teamet — kundflödet hoppas')`
  och svara 200 som vanligt. Skriv inte till sms_conversation som kund.
  (Ägarintag via SMS är ett senare steg; nu stängs bara buggen att ägaren
  behandlas som kund.)
- Den befintliga STOPP/START-hanteringen ska fortfarande köras först om
  den ligger före — läs ordningen och lägg ägargrinden direkt efter
  tenant-upplösningen.

## Gap 5 — kundens egna ord från webb/lead syns
Filer: app/api/customers/[id]/timeline/route.ts (lead-sektionen, ~rad 540)
och lib/compliance/communication-trail.ts.
- Timeline: ta med `notes` i lead-selecten och lägg texten (trimmad,
  max 300 tecken) i postens `description` när den finns.
- Trail: ny källa `leads` (samma `collectSource`-idiom som övriga):
  `select('lead_id, notes, source, created_at')` för kunden
  (`customer_id`), bara rader med notes, `channel: 'form'`,
  body = notes. Uppdatera trailens dokumenterade källantal om det står i
  kommentar/typ.

## Gap 8 — kundfakta i compliance-trailen
Fil: lib/compliance/communication-trail.ts.
- Nionde/tionde källa: `customer_fact` `select('id, fact_text, category, created_at')`
  (läs kolumnnamnen i sql/v122_customer_fact.sql först) `.eq('customer_id', …)`
  `.is('superseded_by', null)`, `channel: 'note'`, body = faktatexten.
  Samma ärliga felrapportering som övriga källor.
- Kontrollera att get_communication_trail-verktyget (app/api/agent/trigger/
  tool-router.ts ~rad 339–368) klarar de nya kanalerna utan typfel.

## Gap 9 — död röstparser bort
- Ta bort app/api/voice/process/route.ts (inga anropare — verifiera med
  grep innan). Uppdatera tests/bransle-matare.spec.ts om den listar filen,
  och lägg en rad i docs/audits/ROSTVAGAR_KARTLAGGNING_2026-08-08.md
  ("borttagen 2026-09-02"). Rör inte docs/council/ACTIVE_ROADMAP.md.
- Kör tests/dead-code-paths.spec.ts, tests/facit-route-auth-inventory.spec.ts
  och tests/cron-auth.spec.ts efteråt (rutträkningar/inventarier).

## Facit: tests/kundminne-kanaler.spec.ts (browserlöst, källskanning)
- timeline + trail: SMS-läsning använder `phoneCandidates(` och `.in('phone_number'`,
  ingen `.eq('phone_number', customer` kvar i de två filerna.
- resolver: importerar `findCustomerByPhone`, innehåller `.from('call_recording')`,
  `'call'` i kanal-unionen, `.limit(5)` på samtalsfrågan.
- sms/incoming: importerar `isTeamPhone`, anropar den FÖRE `resolveEntity(`
  (indexOf), och owner-sender.ts använder `phoneCandidates(` +
  `.eq('is_active', true)` + returnerar false vid fel.
- timeline lead-sektionen selectar `notes`; trailen har `channel: 'form'`
  och `channel: 'note'` och `.from('customer_fact')`.
- `fs.existsSync('app/api/voice/process/route.ts')` är false.
Lägg facit-namnet sist i BÅDE `test:contracts` i package.json och listan i
../.github/workflows/contracts.yml.

## Verifiering (allt grönt innan rapport)
```
npx tsc --noEmit
npx playwright test tests/kundminne-kanaler.spec.ts tests/dead-code-paths.spec.ts tests/facit-route-auth-inventory.spec.ts tests/cron-auth.spec.ts tests/bransle-matare.spec.ts --no-deps --project=chromium --reporter=line
npx playwright test $(grep -rlE "resolver|communication-trail|customers/\[id\]/timeline|sms/incoming|owner-sender" tests --include=*.spec.ts | tr '\n' ' ') --no-deps --project=chromium --reporter=line
npm run test:contracts
npx next build
```
Inga commits. Rapportera: ändrade filer, exakta testsiffror, allt du var
osäker på eller avvek från.
