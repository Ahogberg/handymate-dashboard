# Första riktiga jobbet — integrationskontroll 2026-09-06

## Omfattning och kodläge

Andreas uppdrag: följ första jobbet och rätta verifierade glapp. Vidareutveckling av Lars och nya vägledningsytor ingår inte.

- Main vid starten: `f9d4d8b0038d47cc1b1a4cbb829edf3b4d59721d`.
- PR #11: `0b5c9daecc2fd7747549bf6a08bdca0bc9ca0755`, ännu omergad. Innehåller kundunderlag/Lars och tidigare fakturarättningar.
- PR #13: `c7c336618424d07b746d83e8c8d958eafdf7b61f`, ännu omergad.
- PR #14: `5a01bfc07838844e9558a4daba21bce78d0a6606`, ännu omergad. Den här rättningen bygger på den grenen och ändrar inte #14 under granskningen.
- PR #12:s betalplansfunktion är separat och räknas inte som lanserad eller verifierad här.

**Det finns ännu ingen gemensam driftverifierad version av hela resan.** #14 innehåller inte #11. Grön CI för vardera gren bevisar inte att den sammanslagna, driftsatta kundresan fungerar.

## Nytt reproducerat fel och rättning

Manuell accept (`POST /api/quotes/accept`) läste offertstatus men skrev därefter utan statusvillkor. Två anrop som båda läst `sent` returnerade båda 200 och kunde köra efterarbetet två gånger. Det första beteendeprovet reproducerade `[200, 200]` före rättningen.

Nu kräver UPDATE samma företag, offert och status som lästes. Bara anropet som får tillbaka en uppdaterad rad kör marginalögonblicksbild, kommunikation, notiser, projekt och automation. Ett konkurrerande anrop får 409 och uppmaning att läsa in igen. En gammal flik kan inte skriva över en offert som hunnit bli declined, expired eller signed.

Ett senare återförsök av redan accepted/signed ger 200 + `deduplicated: true` utan att starta efterarbetet igen. Detta kvitterar **acceptstatusen**, inte leverans av meddelanden eller lyckat projektskapande. Återhämtning av avbrutet efterarbete är fortfarande ett separat problem; ändringen skapar ingen transaktionell outbox.

Läsfel ger 503, saknad offert 404. Kunduppslaget avgränsas också till företaget. Den gamla kompatibilitetsvägen för saknade accepted_at/accepted_manually behåller samma statusvillkor och används bara för relevanta kolumnfel.

Inga nya databaskolumner eller migrationer. Kundens publika signerings-RPC och fakturavägarna ändras inte.

## Resans övergångar och bevisnivå

| Övergång | Vad som har granskats/provats | Begränsning |
|---|---|---|
| Onboarding → jobbtyp → artiklar | #14:s kontrakt för verkliga jobbtyper, standardmängder och artikeldata återkörda | Ingen ny registrering mot Supabase |
| Standard → första offert → återöppning | Befintligt first-quote-reality-harness: produktpriser, reservationssnapshot, kund/deal/jobbtyp och sparad offert | Kontrollerad transport; inte riktig AI |
| Kundunderlag → offert | #11:s server- och överlämningsunderlag läst; grenen och dess v213/driftkrav identifierade | Inte installerat i #14; ingen ny live-verifiering av bilder eller AI |
| Manuell accept → efterarbete | Nya riktiga route-anrop med isolerad PostgreSQL; samtidig accept, återförsök, statusändring, fel och behörighet | Externa effekter är testdubblar, inte skickade meddelanden |
| Publik signering → projekt | Kodgranskning av sign_quote_with_options, finalize-accepted och projektets unika offertkoppling | Ingen kundsignatur eller verklig projekt-RPC utförd |
| Projektbudget → ÄTA → preview → slutfaktura | 57 återkörda prov i separat testkopia med exakt #11-version av sex faktura-/budgetfiler och project-invoice-journey.spec.ts | Avgränsad kompatibilitetskontroll, inte full merge eller driftprov |
| Faktura → leverans/betalning | Befintliga kärn-/leveranskontrakt; känd delbetalningsbegränsning kontrollerad i koden | Ingen Fortnox-, bank-, mejl- eller SMS-transaktion |

De 57 proven täcker valda/bortvalda tillval, rabatt, godkänd ÄTA, gamla JSONB-rader, produkt-ID, arbetsandel noll, läsfel, befintlig slutfaktura och projektidempotens. De återanvänder befintliga prov och ska inte beskrivas som 57 nya tester. Fakturaproven kördes med simulerad PostgREST-databas och fångat createInvoice, enligt deras befintliga harness.

## Nya prov

`tests/first-job-acceptance.spec.ts`: 11 beteendeprov. Kör den faktiska route-filen, SQL via befintlig PGlite-adapter och en minimal projektion av offerttabellen. Kommunikation och externa efterföljande system ersätts av explicita testdubblar. Provet intygar SQL-villkor och route-beteende, inte produktionsschema, RLS, verkliga utskick eller slutlig projektskapning.

Samma spec ingår i package.json och CI:s kontraktskommando. Lokalt: **1 163 kontraktstester gröna**, inklusive de 11 nya. **57 befintliga projekt-/fakturaprov gröna** i den separata testkopian. **TypeScript exit 0**. **Produktionsbygge exit 0**. Kodversionen `9d5fa99ab6b079a203f9ec695469a69af86e5136` har grön GitHub CI.

## Återstående driftprov — konkret körordning

Vid starten saknades session och lokala databasuppgifter. Säker browserAuth-inloggning lyckades därefter: app.handymate.se öppnade `/onboarding` för **Bee Service AB**, med äldre jobbtypsval (rubriken ”Hur jobbar du?”, inte #14:s nya vy). Inga företagsuppgifter eller testdata ändrades. Det återstår att bekräfta att detta är det avsedda testkontot och att en sammanslagen granskningsversion används. Inloggningen är verifierad; själva driftresan är inte genomförd.

1. Driftsätt en granskningsversion som innehåller #11, #13, #14 och denna rättning; verifiera den exakta versionen. Bekräfta nödvändiga befintliga migrationer, särskilt v213. Kör inte #12/v214 som en del av detta prov.
2. Logga in på ett avgränsat demokonto. Använd testdata och verifierade testmottagare. Ingen riktig kundkontakt ska skapas av provet.
3. Välj jobbtyp/egen jobbtyp och tre standardartiklar. Lämna och återuppta onboardingen. Skapa en affär med samma jobbtyp.
4. Skapa kundunderlag, lämna svar, granska och använd i offerten. Kontrollera vad AI faktiskt fått och att kund-, jobb- och artikelkopplingar följer med.
5. Spara offert med grundarbete, ett valt och ett bortvalt tillval, rabatt och reservation. Läs om och jämför kunddokumentet. Ändra standarden och bekräfta att den sparade offerten inte ändras.
6. Acceptera en testoffert manuellt; prova ett upprepat anrop. Kontrollera accepterad status, exakt ett projekt och affären vunnen. Testa publik signering på en separat offert och kontrollera kundens val efter omläsning.
7. Registrera tid/material och godkänn ett ÄTA. Jämför projektbudget, fakturaunderlag, preview och sparat fakturautkast. Prova återförsök utan nytt faktura-ID.
8. Kontrollera mobil, omladdning och annan roll. Faktisk leverans och betalningsregistrering provas bara i överenskommen testmiljö/mot testmottagare.

Kända begränsningar från #11 kvarstår: samtidig första fakturaskrivning är inte samordnad mellan alla fakturavägar; manuell delbetalning har begränsad semantik; ROT-årstaket kan skilja mellan preview och slutberäkning. De är inte rättade eller omklassade till gröna i denna leverans.


## Fortsatt inloggat prov — eget testkonto

Andreas förtydligade att den första inloggningen avsåg demokontot. Bee Service AB var det **visade företagsnamnet**, inte bevis för vilket konto han valde. Ny navigering till dashboard gav samma onboardingvy; orsaken är inte fastställd. Inga företagsuppgifter ändrades där.

Andreas godkände sitt eget testkonto. En ny säker inloggning öppnade **Nordström El AB**, med Andreas som synlig användare. Där genomfördes:

- Kundlistan och befintliga acceptanstestkunden öppnades. Ny kund-dialog inspekterades och avbröts utan sparning; telefon är obligatoriskt.
- Ny offert från kundkortet behöll rätt kund.
- Riktig AI-generering kördes för byte av två befintliga jordade vägguttag, med två timmars uppskattat arbete och uttrycklig text ”Ingen ROT eller RUT i detta prov”.
- AI-förslaget gav fyra rader: arbete 1 700, uttag 440, framkörning 450 och småmaterial med saknat pris. Netto 2 590 kr.
- ROT dök ändå upp i förslaget. Efter aktivt val Inget avdrag försvann avdraget, men summary klassade hela 2 590 kr som material (arbete 0). Arbetsraden hade enheten st. Detta är observerade avvikelser, inte rättade i PR #15. Det är ännu inte klarlagt om enheten kommer från AI-svaret eller produktkopplingen. Kodens summering använder avdragsflagga/timenhet för arbetsklassning, vilket förklarar omslaget i visningen.
- Testtiteln återställdes efter AI-genereringen och utkastet sparades som **#2026003**, `quote_pq1nnsv4gqc`. En full omladdning återgav samma kund, fyra rader, nettobelopp och status Utkast.
- Offertens händelselogg visade inget skickat/öppnat/signerat datum. Inga Skicka- eller signeringsåtgärder utfördes. Testutkastet lämnades kvar för granskning.

**Bevisnivå:** riktig inloggning, AI-generering, offertskrivning och omläsning har nu genomförts. Detta gäller den driftsatta versionen på app.handymate.se, inte en verifierad sammanslagning av #11/#13/#14/#15. Kundkortet saknade den nya kundunderlagsytan. Hela accept→projekt→faktura-resan och de nya standardartikelytorna är fortfarande inte driftverifierade.
