# Kundens avlastning — sammanhängande förbättringsprogram

Beslut: Andreas 2026-09-08, i denna konversation. Ny plan, inte återfunnen gammal brainstorming.
Repository: Ahogberg/handymate-dashboard. Gren: codex/customer-relief-journey-20260908.
Ingen direkt push till main. Befintligt godkännandearbete i PR26 och mobil PR3 fortsätter separat.

## Mål

Kunden lämnar eget underlag → får ett användbart resultat → vet vem som ansvarar,
vad som behöver granskas och vad som händer härnäst → kan läsa tillbaka utfallet.
Värde mäts i verifierade resultat och färre manuella ingrepp, aldrig påhittad sparad tid.

## Tre delar och full omfattning

1. **Trygg överlämning.** Gemensamt åtagande: scope, ansvarig, gränser, öppna beslut,
   faktiskt utfört och nästa steg. Läsfel får aldrig betyda att inget behöver göras.
   En sparad plan är inte bevis för schemalagd körning, leverans eller bevakning.
2. **Första verkliga avlastningen.** Ta emot kundens egen text/diktering, guida till
   befintlig offert-, rapport- eller Matte-väg utan att underlaget tappas.
   Återanvänd WorkSampleStart och offertbyggaren; ingen parallell AI- eller offertmotor.
3. **Avslutad arbetsdag.** Återläs den egna rapporteringen för valt jobb/datum,
   skilj sparat från förslag och kvarstående frågor. Ingen grön helhetsgaranti
   för hela firman baserat på en enda rapport eller en ofullständig datakälla.

## Återfunnen tidigare leverans

PR #27 (https://github.com/Ahogberg/handymate-dashboard/pull/27) skapades 2026-09-08
15:18 UTC och mergades 15:25 UTC, commit 0a248e1. Den ingår redan i basen för denna gren.
Den innehåller eget arbetsprov, offertöverlämning och synligt lärande genom jobbregler.
Den motsvarar delar av ledtråden om den försvunna brainstormingen, men är inte bevis för
originalchattens fulla innehåll. Detta program kompletterar den leveransen.

## Kartläggningsfynd

- Mission finns med fryst plan och deadline. confirm_mission instruerar modellen
  att kalla specialister men skapar ingen beständig timer för nästa avstämning.
- /api/mission/active och progress-helper kan svara tomt/noll på läsfel.
- Startens WorkSampleStart ger redan offertunderlag från egen text före inställningar.
- DayClose använder signerade, idempotenta bekräftelser men kvittolistan är lokal React-state.
- Projekt- och rollgrindar måste återanvändas; ekonomiskt uppdrag bara ägare/admin.
- Supabase-schema kontrollerat läsande 2026-09-08. Ingen ny tabell behövs för första etappen.

## Etapp 1 — implementerad lokalt, granskningsbar leverans

- [x] Härled uppdragsöverlämning ur fryst plan och faktiska åtgärdskort.
- [x] Bevara skillnaden läsfel / inga uppdrag / väntar på beslut / utfört / okänt utfall.
- [x] Visa samma överlämning på startsida och uppdragspanel; ärligt startkvitto i chatten.
- [x] Gemensam ingång från startsidan för eget underlag med kontoavgränsat textutkast.
- [x] Fortsätt i befintlig offertbyggare, rapport eller Matte utan automatiskt utskick.
- [x] Läs tillbaka egen sparad tid och arbetsanteckningar för projekt/dag med rollgrind.
- [x] Visa kommande delar före rapportbekräftelsen och tydligt rapportavslut/fel.
- [x] Beteendeprov, mobil/desktop UI, TypeScript och produktionsbygge.
- [ ] Push och draft-PR med exakt verifieringsstatus.

## Etapp 2 — beständiga åtaganden genom hela produkten

- Beständig tillståndsmaskin för avstämning med tid/utlösande händelse, ägare,
  version, avbrott, utgång och deduplicering. Bygg ovanpå befintlig uppdragskälla.
- Arbetare som faktiskt kör utan öppen app, upptäcker missade åtaganden och skapar
  granskade nästa handlingar; bekräftad mottagare och befintliga approvals-grindar.
- Börja med en komplett offertuppföljning: svar före avstämning, ändrat underlag,
  avvisat/osäkert utskick, omförsök, avbrott och timeout. Därefter faktura/kundlöften.
- Planens datum får kallas nästa avstämning först när denna kedja finns och är verifierad.
- Historik över överlämning och utfall även när uppdraget avslutas.

## Etapp 3 — mobil, helhetsavslut och uppmätt värde

- Native motsvarigheter i handymate-mobile, inbyggd delning/foto, kallstarts-deeplänkar.
- Beständig rapportkedja med alla delkvitton och återstående signerade steg mellan enheter.
- Samlat dagsavslut över tilldelade jobb, öppna beslut, aktiva timers och blockerade åtaganden.
- Push vid verkliga blockerare/utfall med tyst tid, dedupe och mottagarbehörighet.
- Mät första användbara resultat, manuella ingrepp och sena åtaganden. Visa faktiska
  resultat utan att tillskriva all omsättning agenten eller räkna uppskattningar som fakta.
- Riktigt färskt testkonto och iPhone/TestFlight-prov; pilotens förståelse och avlastning.

## Grindar

Inga kundutskick i tester. Ingen produktionsmerge/deployment i denna leverans.
Nya produktvägar får inte runda betalning, bränsle, rollgränser eller granskning.
Ett lokalt prov är inte kund-/iPhone-/produktionsbevis. Ej verifierade delar förblir öppna.

## Leverans och verifiering

Implementationen kompletterar PR #27 med en gemensam ingång på Översikt (`/dashboard/avlastning`),
uppdragsöverlämning och återläsning av rapporterad tid/anteckningar. Offertunderlag får ett unikt,
kontoavgränsat utkast i samma webbläsarflik; ett senare underlag skriver inte över ett tidigare.
Kunduppföljning öppnar en redigerbar fråga i Matte. Rapportering använder befintliga signerade
bekräftelser och visar alla föreslagna delar före första godkännandet.

Verifiering 2026-09-08:
- 189 riktade prov passerar: 168 beteende-/kontraktsprov och 21 webbläsarprov, inklusive mobil 375 px och desktop 1280 px.
- Produktionsbygge (`NEXT_TELEMETRY_DISABLED=1 npm run build`) exit 0. Sentry-/statisk-renderingsvarningar i befintliga vägar förekommer.
- Separat TypeScript-kontroll efter sista putsningen: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --incremental false`, exit 0. Samma heapgräns som repo-CI; första försöket med Nodes standardheap tog slut på minne.
- `git diff --check` passerar.
- Nytt `npm run test:customer-relief` är anslutet till first-value-workflowen. Fjärr-CI har ännu inte körts.
- Läsande Supabase-prov med syntetiska, obefintliga identifierare bekräftar kolumnerna och frågeformen. Inga riktiga kundposter eller skrivningar ingick.
- Äldre browserfixtur rättad: dess diagnostiska JSON-output bröt mobilbredden. `overflow-wrap:anywhere` begränsar testets output; produktens breddkontroll behålls.
- Gamla textfacit uppdaterade till den avsiktliga skillnaden mellan sparad plan och utförd handling.

Begränsningar: ingen verklig kundsession, iPhone/native, AI-generering från start till skickad offert,
eller skarp agentuppföljning är verifierad här. Endast egen tid och arbetsanteckningar återläses;
material, ÄTA och kedjans samtliga delkvitton över enheter återstår. Textutkastet är sessionslagrat,
inte molnsynkat. Etapp 2 och 3 ovan är planerade, inte implementerade.

Historisk notering (ersatt av publiceringsbeslutet nedan): Publicering var blockerad: automatisk godkännandegranskning avvisade push till GitHub eftersom
användarens implementeringsuppdrag inte bedömdes innehålla uttryckligt tillstånd att dela
payloaden till destinationen. Ingen alternativ uppladdning har gjorts. Separat godkännande
behövs för push av denna gren till Ahogberg/handymate-dashboard och skapande av draft-PR.
Ingen merge, deployment, migrering eller kundkontakt har gjorts.


## Fortsättning — Din dag (2026-09-08)

Ovanstående status för publicering är historisk: Andreas godkände därefter publicering,
PR #28 skapades och dess grind blev grön. PR #29 bygger den beständiga offertkedjan
på #28 och har också gröna kontroller. De är ännu inte aktiverade i produktion.

Nästa granskningsbara del är Din dag: egen rapporterad tid och anteckningar över
behöriga jobb, aktuell timer/instämpling, ägarens/admins väntande beslut och
schemalagda offertuppföljningar med faktiskt tillstånd. Befintlig avlastningsingång
och rapportdialog återanvänds; ingen ny huvudnavigation. Läsfel och ofullständiga
resultat visas som okända, aldrig som noll eller ett färdigt dagsavslut.

Detta är en återläsning av befintliga källor. Molnsynkad rapportkedja för material/ÄTA,
nya faktura-/kundlöftesmotorer, native delning/foto och riktiga iPhone-pilotprov återstår.
Se MY_DAY_2026-09-08.md för avgränsning och verifiering.
