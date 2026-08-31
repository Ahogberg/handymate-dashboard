# Inför nästa jobb V1 — leverans och bevis

2026-08-31. Godkänt av Andreas. Arbetsanteckning för denna leverans, inte en
ny roadmap eller konkurrerande lanseringschecklista.

## Vad som är byggt

En läsande förberedelse, med Lars som avsändare och befintliga Matte-chatten
som nästa steg. Samma komponent finns i Dagens plan (vid dess tre visade
bokningar), bokningsdetaljen och projektets översikt. Underlaget hämtas först
när användaren öppnar kortet; det skapas inget bakgrundssvep.

`GET /api/job-preparation?booking_id=…` använder just den bokningen.
`?project_id=…` väljer projektets nästa framtida, bekräftade, ej avslutade
bokning. Vid två bokningar med samma starttid krävs ett uttryckligt val från
kalendern/bokningsvyn. Utan kommande bokning visas en förklaring, inte ett
påhittat nästa jobb. Schemahändelser utan en booking-rad ingår inte i V1.

Kortet visar:

- Projekt, kund och bokad tid; ingen matchning på namn eller ”enda projektet”.
- Projektadress ur just projektets accepterade/signerade offert. Kundens
  hem-/fakturaadress används aldrig som gissad arbetsplats. Adressen ska
  fortfarande kontrolleras för det enskilda besöket.
- Synliga offertposter och uttryckligen valda alternativ från vunnen offert.
- ÄTA-poster med faktisk status. Godkänd/fakturerad betyder inte utförd.
- Befintliga checklistor, inklusive redan skapade playbook-kontrollpunkter.
  Uttryckligt `checked=false` visas som ej avbockat; okänd form blir inte klar.
- Projekthandlingar (namn och länk; ingen dokument-/PDF-tolkning).
- Bekräftade installationer på exakt detta projekt och denna kund.
- Registrerad SMS-/e-postaktivitet som bär uttryckligt projekt-ID. Det är
  titel/datum och väg till tidslinjen, inte en sammanfattning av allt sagt.

Varje del har `available`, `missing`, `unavailable` eller `restricted` och
källförklaring under **Visa varför**. Ett läsfel ersätts inte med ”inga poster”.
Högst tolv poster per del; en trettonde rad ger synlig begränsningsmärkning.
Det finns inget procenttal, övergripande ”redo” eller påstående om fullständighet.

Fråga Matte fyller ett **redigerbart utkast**, med projekt-/boknings-ID,
läsdatum och ett begränsat urval av användarens behöriga underlag. Frågan ber
Matte ta hjälp av Lars och kontrollera färska uppgifter. Den skickas inte
automatiskt. Ingen ny chattrutt, specialistmotor eller modellverktyg har byggts.
Detta garanterar inte en viss specialistrespons efter att användaren skickar;
befintlig orkestrering och godkännandemekanik äger det steget.

## Säkerhetsgränser

- Autentiserat företag + aktiv `business_users`-medlem i samma företag.
- Owner/admin eller `see_all_projects`, annars uttrycklig projektilldelning
  i `project_assignment`, före läsning av projektets underlag.
- Alla databasfrågor har `business_id`. Kundskillnad mellan bokning och
  projekt stoppar sammanställningen före kundhistoriken. Projektets kund
  verifieras separat inom företaget.
- Offert-/ÄTA-underlag kräver `see_financials`, även om DTO:n inte väljer
  prisfält. Fritext kan bära ekonomiska uppgifter. Medarbetare utan den
  behörigheten får bara dokumentkategorierna ritning/foto.
- Kundkommunikation kräver owner/admin här. Projektilldelning ensam ger
  inte rätt att få kundens privata korrespondens i en ny sammanställning.
- Inga prisfält, signeringstoken, personnummer, råa fil-URL:er, ljud eller
  transkript i DTO:n. Fritext från behöriga källor kan fortfarande innehålla
  sådant användarna själva skrivit; ingen automatisk PII-redigering utlovas.
- `force-dynamic`, `private, no-store`, avbrutna klienthämtningar och ny
  komponentinstans vid byte av företag/bokning/projekt.
- Inga INSERT/UPDATE/DELETE/RPC, inga utskick, approval-kort eller migrationer.

## Viktiga avgränsningar och upptäckter

1. **En existerande GET är inte nödvändigtvis läsande.** Installationsrutten
   kan skapa materialutkast och morning-brief kan skriva cache. V1 anropar
   inte dessa vägar utan läser befintliga rader direkt.
2. **Bokningsstatus är en riktig enum.** Produktionskatalogen har
   `confirmed/cancelled/completed/no_show` — inte `pending`. Nästa-besök-
   frågan använder `confirmed`, verifierat även genom PostgREST.
3. **Samma kund är inte samma arbetsplats/projekt.** Otaggade meddelanden och
   installationer på andra projekt lämnas utanför, även för samma kund.
4. **Projektflikarna läser query-parametern vid mount.** Käll-länkarna är
   därför vanliga navigerande ankarlänkar, så att `?tab=documents` fungerar
   även när kortet redan visas på samma projektsida. Ingen bred nav-refaktor.
5. **Läsningarna är inte en databassnapshot.** Underlaget dateras, kan ändras
   efter hämtning och måste kontrolleras före handling. Läs in igen finns.
6. **Ingen material-/verktygsberedskap gissas.** En offertrad eller ett
   dokumentnamn säger inte att något är inköpt, packat eller levererat.
7. **Native-mobilappen är inte ändrad.** Responsiv webb är testad. Push,
   nattlig förberedelse, kundutskick och nya agentuppdrag ligger utanför V1.

## Verifiering

### Lokalt

138 riktade tester gröna, varav 60 nya för förberedelsen. Slutbygget efter
käll-länkjusteringen: `next build` exit 0, `/api/job-preparation` dynamisk.
Separat `tsc --noEmit` efter slutbygget: exit 0.
Builden har befintliga metadata-/miljövarningar, bland annat sitemap utan
lokal Supabase-URL; detta är inte ett bevis för produktionskonfigurationen.

```powershell
npx playwright test tests/job-preparation.spec.ts tests/job-preparation.ui.spec.ts tests/column-contract.spec.ts tests/facit-lars-tipsar.spec.ts tests/facit-installation.spec.ts tests/jarvis-hem.spec.ts tests/facit-dagens-plan.spec.ts tests/bookings-page-design.spec.ts --project=chromium --no-deps --workers=2 --reporter=line
npx next build
npx tsc --noEmit
```

De nya testerna kör den verkliga loadern och routen med explicita auth-/DB-
testdubblar: medlemskap, projektåtkomst, tenantfilter, korskoppling, dolda
offertrader, ovalda alternativ, olika tom-/felutfall, avböjd ÄTA, källa utan
projekt-ID, begränsade resultat och spärr mot sidoeffekter.

UI-proven kör den verkliga komponenten och kontextens React-state i en
isolerad webbläsare med samtliga nätanrop avlyssnade. API-svar, Next Link,
avatar och ikoner är testdubblar; inga riktiga kundsessioner används.
375/1280 px: ingen horisontell overflow, källa kan öppnas, fel kan försöka
igen, utkast öppnas utan chatt-POST och gammal data rensas vid kontextbyte.
Skärmbilderna har granskats visuellt. Detta är inte ett skarptest i native.

### Mot körande databas — enbart läsning

```powershell
node scripts/job-preparation-read-probe.cjs
```

**11/11 godkända PostgREST-frågor** mot den konfigurerade databasen.
Scriptets transport tillåter bara GET med ett hårdkodat obefintligt företags-ID;
det kräver noll returnerade rader och skriver inte ut nycklar eller kunddata.
Det verifierar kolumner, enum/filter, JSON-projektfilter och sortering, inte
att en verklig bokning har alla önskade underlag. Katalogen kontrollerades
också via Supabase SQL-läsning; inga migrationer kördes.

### Kvar före skarpt godkännande

- Efter deploy: logga in som ägare och öppna en riktig projektkopplad
  testbokning från Dagens plan, bokning och projektöversikt. Kontrollera
  underlagen mot respektive källvy och att källflikarna faktiskt öppnas.
- Samma bokning som tilldelad medarbetare utan ekonomiåtkomst; kontrollera
  att offert, ÄTA och kommunikation inte returneras i JSON.
- Otilldelad medarbetare samt konto i annat företag ska nekas. Blanda inte
  ihop lokala behörighetstestdubblar med skarp RLS-/sessionsverifiering.
- Skicka frivilligt det redigerade utkastet till Matte och kontrollera
  specialistresponsen. Ingen sådan AI-/exekveringsresa har körts här.

Ingen commit, push eller deploy i detta pass. Andras pågående filer och
det tidigare Nu/import-arbetet har bevarats.

## Filgräns för granskning

Nya: `lib/job-preparation/{types,load}.ts`, `app/api/job-preparation/route.ts`,
`components/projects/JobPreparation.tsx`, `tests/job-preparation*.spec.ts`,
`scripts/job-preparation-read-probe.cjs`, denna rapport.

Montering: `components/jarvis/JarvisHome.tsx`,
`app/dashboard/bookings/[id]/page.tsx`, `app/dashboard/projects/[id]/page.tsx`.
Arbetsstatus: översta avsnittet i `tasks/todo.md`.
