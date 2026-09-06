# Liveprov inför lansering — 6 september 2026

Genomförd bred skrivbordsgenomgång med avgränsade liveflöden. Produkten är inte godkänd för lansering genom detta protokoll: nio reproducerade fynd och återstående driftgrindar finns nedan. Alla knappar, roller och miljöer är inte uttömmande provade.

## Miljö och metod

- Integration PR #16, verifierad head `421f9728587a7c186ff806cdd7d8f2e400216edd`.
- Innehåller #11, #13, #14, #15 och main med ROT-rättningarna. #12 ingår inte.
- Inloggad ägare i Nordström El AB, användarens eget testkonto. Bee Service har inte ändrats.
- Riktiga UI-anrop till AI och databas. Inga mockade svar i liveproven. Preview är inte bevis för isolerad databas.
- Testposter är märkta TEST Codex. Inga nya fakturor, betalningar, Fortnox-exporter, prenumerationsändringar eller produktionsmergar i denna genomgång.
- Sidor lästa efter laddning; en öppnad sida räknas inte som ett verifierat fullständigt flöde.

## Reproducerade fynd

| ID | Prioritet | Observation och reproduktion | Avgränsning |
|---|---|---|---|
| F01 | Hög | Godkänn föreslagen Elsäkerhetskontroll på P-1015. Resultat: `Godkänt — men utförandet misslyckades: null value in column "order_id" of relation "project_checklist" violates not-null constraint`. Ingen checklista i projektets dokumentation. | Godkännandekön visar ärligt ej utförd. Kräver rättning och omprov, inte bara omklassning som godkänd. |
| F02 | Hög | Skapa ny kundlänk med Förberedelser inför jobbstart, besvara tre frågor, Lämna underlag. Första försöket och ett senare återprov stoppas med `Vänta en stund innan du försöker igen.` Personalvyn står kvar på Väntar på svar. | Kundunderlag → Lars-granskning kan inte godkännas. `checkPublicRateLimitDb` nekar även vid RPC-fel/ogiltigt svar; UI bevisar inte att kvoten faktiskt är slut. Kontrollera serverloggar och `rate_limit_check` utan att kringgå skyddet. |
| F03 | Medel | Klicka Underentreprenörer eller återöppna samma sida som ägare. Återförs till dashboarden utan förklaring. Samma utfall för synliga länkar till Hemsida-widget och Grossistprislista i inställningarna. | `lib/launch-visibility.ts` döljer avsiktligt dessa sidor via middleware, men menyerna exponerar länkarna. Rätta synligheten, inte åtkomstskyddet. |
| F04 | Medel | Registrera 15 minuter 2026-09-06. Veckovyn visar V36, Att attestera visar Vecka 37 för samma post. | `app/api/time-reports/approve/route.ts` använder annan veckoberäkning än veckovyn/ISO-vecka. Själva datumet och tidsmängden är kvar. |
| F05 | Medel | Egen artikel, enhet st, 100 % arbete, inga ROT/RUT-flaggor. Tre standardrader ger offert #2026007: arbete 1 700 + övrigt 750 = 2 450 exkl. moms. Offertskaparens och detaljens summering visar Arbete 0, Material 2 450. | Samma tidigare rapporterade summeringsfel reproduceras utan AI, direkt från artikelupplägget. Sparade priser och antal är korrekta. |
| F06 | Medel | Projektets flik Uppgifter visar Bokningar, Schemalagt team, Delmoment och Arbetsorder — samma innehåll som Planering. Den skapade uppgiften finns däremot på projektöversikten och globala uppgiftsvyn. | Uppgiften går att skapa och slutföra; särskilda fliken leder fel. |
| F07 | Medel | Inställningar → Så ska teamet jobba → Så ska Handymate arbeta, beskrivet som Hur mycket teamet gör på egen hand, visar AI-röst, hälsningsfras och telefonassistent. | Etikett och destinationsinnehåll stämmer inte. Hjälpcentret beskriver samtidigt att ingen robot pratar med kunden. |
| F08 | Hög | Resursplanering → Ny post → Andreas, P-1015, 2026-09-06, behåll formulärets 08:00–09:00, typ Internt, spara. Projektet visar 10:00–11:00. Återöppna samma post från månadsvyn: även redigeringsformuläret visar 10:00–11:00. | Klockslaget förändras över sparning/återläsning. Klienten skickar datumtid utan offset i `app/dashboard/schedule/page.tsx`. Exakt DB-/serverkonvertering inte verifierad med loggar. Spara inte på nytt som workaround: kan flytta tiden igen. |
| F09 | Hög | Samma söndagspost saknas i veckovyn 31 aug–6 sep även efter omladdning, med Andreas markerad. Byt till september månad: posten finns på 6 september. Projektets planeringsflik visar den också. | Klienten skickar slutdatum `yyyy-MM-dd`; `app/api/schedule/route.ts` filtrerar `start_datetime <= endDate`, vilket exkluderar tider efter midnatt på sista dagen. Rätta intervallgränsen och lås både dag/vecka/månad samt tidszoner med facit. |

## Verifierade sammanhängande prov

| Flöde | Resultat | Bevis |
|---|---|---|
| AI-offert utan ROT → sändning till kontoinnehavaren → kundsignering → automatiskt projekt | Verifierat i föregående del av samma session | Offert #2026006, P-1015; projektets offertbudget arbete 1 700, övrigt 750, exkl. moms 2 450, avdrag 0. Ingen verifiering av råa DB-flaggor från Codex. |
| Kundanteckning → spara → omladdning | Godkänt | TEST Codex-anteckning kvar i Andreas kundtidslinje. |
| Uppgift → projekt → dashboard → slutför → global uppgiftsvy | Godkänt med F06 | TEST Codex – verifiera kopplad projektuppgift. Efter slutförande visar globala vyn 0 aktiva. |
| Intern tid → veckovy → projekt → ekonomisk kostnad | Godkänt med F04 | 08:00–08:15, 2026-09-06, 0,25 tim, 125 kr intern kostnad, 0 debiterbara timmar. Finns inte som fakturerbar tid i Att fakturera. |
| Dagsavslut med riktig AI → granskning → spara intern anteckning → byggdagbok | Godkänt för anteckningsvägen | Prompt begär endast anteckning, ingen tid/material/ÄTA. Bara anteckningen föreslås, sparningskvitto visas och texten finns i byggdagboken. Tidtagg 0,25 h pekar på tidigare tidrapport samma dag. |
| ÄTA → spara utkast → projektets lista och budget | Godkänt för utkast | ÄTA-1, 500 kr, Utkast; projektets avtalade belopp är fortsatt 2 450 kr. PDF-knappen öppnar PDF-adress; innehållet ännu inte verifierat. |
| Ny jobbtyp → egen artikel → tre standardrader → ny affär → skapa offert → spara | Godkänt med F05 | Jobbtyp TEST Codex – artikelkoppling; artikel TEST-CODEX-0906 850 kr/st och 100 % arbete; offert #2026007 har 2×150, 1×450, 2×850. Kunden och beskrivningen följer affären. |
| Delmoment → projektets fakturaberedskap | Godkänt för skapande | TEST Codex – dokumentationskontroll sparas; statuskortet uppdateras till 1 delmoment kvar. |
| Kampanj → manuellt urval → text → granskning | Godkänt fram till utskick | Noll mottagare spärrar Fortsätt; bara Andreas vald ger en mottagare/ett SMS. Ingen kampanj skickad eller schemalagd. |
| Artikel → kopplat förbehåll → offertförslag → välj → spara → omladdning | Godkänt | TEST Codex – kontroll före utförande kopplat enbart till TEST-CODEX-0906. Rätt artikel anges som utlösare. Texten finns kvar under Reservationer i #2026007 efter ny sidladdning, och visas som förslag i jobbtypsupplägget. |
| Formulärmall → projektformulär → spara kommentar → stäng/öppna | Godkänt för utkast | Enkel egenkontroll, kommentar uttryckligen om test och inget utfört arbete. Utkast med 0/4 obligatoriska fält; kommentaren är kvar vid återöppning. Ingen färdig egenkontroll eller signering påstås. |
| Intern schemapost → projekt och kalender → återöppning | Underkänt | Posten finns i projektet och månadsvyn men försvinner i veckovyn, och tiden har flyttats två timmar. F08/F09. |

## Öppnade ytor, begränsat till läsning/formulär

Huvudmenyer: dashboard, äldre översikt, analys, pengar, månadsrapport, bolagskalender, godkännanden, kunder, pipeline (översikt/kanban/tidslinje), AI-team, inkorg (SMS/samtal/möte/e-post/historik), projekt, offerter, uppgifter, fakturor, leverantörsfakturor, ROT/RUT-lista, dokument (mina/mallar/uppladdade), schema, kalender, tid (vecka/fakturering/attest/löneunderlag), team, kampanjer, hjälp och hänvisningslänk. Underentreprenörer blockeras enligt F03.

Inställningssidor: bolagsprofil, telefon, e-postmallar, dokumentstil, offertmallar, formulärmallar, standardtexter, förbehåll, produkter, mina priser (alias till produkter), jobbtyper, serviceavtalstyper, internkostnader, kunskap, leadkällor, integrationer, fakturering, lösenordsformulär. Dessutom öppnade lokala inställningspaneler för öppettider, samtal, faktura, tid, ekonomi, godkännanden, försäljningsflöde, anslutningsstatus, nuvarande plan och notiser. Inga globala inställningar sparade.

Dessutom lästa: Offertkategorier, Business Twin-data, Automationsbibliotek och resursplaneringens vecko-/månadsvy. Fältrapportens formulär öppnat och avbrutet; det erbjuder Skapa och skicka, inte ett separat utkast i den här vyn. Hemsida-widget och grossistprislista går inte att öppna enligt F03.

Övriga observationer som behöver avgränsas innan de räknas som separata fel: pipeline visar olika antal aktiva i rubrik och säljtratt; äldre kundbokningar ger negativa "dagar sedan" i kampanjurval; inställningsgruppbyte lämnar förra formuläret kvar; anslutningssidor ger motsägande information om inkommande e-post och Google Calendar. Pengar-vyn visar inga förfallna fakturor medan fakturalistan visar två — kontrollera avsedd omfattning.

## Återstående grindar

- Mobil live och ny onboarding är inte verifierade på riktigt konto i denna genomgång. Ny onboarding behöver ett oanvänt konto med verifierbar e-post. Ändra inte befintligt testföretag via databasen för att simulera onboarding.
- Fortnox är inte anslutet. Bokföring, betalning, kredit och integrationernas verkliga leverans är inte provade.
- Push är blockerad av webbläsaren; ingen leverans verifierad.
- Kundunderlag/Lars-vägen blockerad av F02; automatisk egenkontroll blockerad av F01.
- Uppladdning, exportinnehåll, fältrapport, rolltester som anställd och fel vid nätverksavbrott återstår.
- Vercel success på ovanstående head. Samtliga 10 hämtade Actions-körningar på samma head är gröna, fem workflows med två körningar vardera: Kontraktsgrind, Onboardingens tipskort, Första nyttan på mobil och desktop, Jobbtyper och offertstandarder, Sammanhang mellan kundunderlag/offert/dagsavslut. Detta ersätter inte liveprov och är inte ett nytt lokalt testresultat.

## Testdata för omprov

- Offert #2026007: `quote_2jm0fz9lnwf`, Utkast, ej skickad.
- Affär #1016: `221e5461-5f93-493a-ab7f-b911c5727f7d`.
- Projekt P-1015: `proj_1788704644276_0zfdth`.
- ÄTA-1: `901d6757-53f6-42c0-844a-898e2f21d423`, ej skickad.
- Egen artikel: TEST-CODEX-0906; inga befintliga artikelpriser ändrades.
- Förbehåll TEST Codex – kontroll före utförande, endast kopplat till egen testartikel.
- Formulär Enkel egenkontroll på P-1015, utkast med testkommentar och 0/4 obligatoriska fält.
- Resurspost TEST Codex – intern schemakontroll på P-1015, Andreas, 2026-09-06. Inskrivet 08–09, återläst 10–11; lämnad för reproduktion.
- Kundlänkens token och kundens kontaktuppgifter publiceras inte i protokollet.

## Rekommenderad rättningsordning

1. F08/F09 tillsammans: tider ska överleva sparning och synas under hela valt intervall.
2. F02: avgör från serverlogg om RPC saknas/felar eller kvot verkligen är slut. Rätta beroendet och gör om kundens inlämning före Lars-provet.
3. F01: harmonisera checklistans skrivväg med faktisk DB-kontrakt; prova godkännande till synlig checklista utan dubbelskapande vid retry.
4. F05 och F06: gemensam arbetsklassning i summering och korrekt flikkoppling (`GROUP_OF_TAB.tasks` pekar i dag på `planning`).
5. F03 och F07: alla ingångar följer lanseringssynligheten och varje inställningsetikett öppnar avsett innehåll.

Inga av fynden har rättats eller lagts på main i denna audit. Orsak på main kontra integrationsgren är inte klassificerad för samtliga fynd. Genomför omprov på en ny, namngiven previewversion efter rättning och behåll ovanstående testdata tills dess.
