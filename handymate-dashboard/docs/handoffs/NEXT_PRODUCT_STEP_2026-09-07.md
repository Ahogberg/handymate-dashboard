# Nästa produktsteg — 7 september 2026

## Slutsats

En beloppsförlust i automatiskt fakturaunderlag är reproducerad och rättad på separat arbetsgren. Nästa produktbygge bör vara **en prioriterad kompletteringsfråga som löser ett konkret faktureringshinder**, ovanpå befintlig intäktskö och beredskapsmodell. Därefter radkopplat leveransbevis. Ingen ny generell agentplattform behövs för dessa två steg.

Detta är kod- och testbevis, inte ett godkänt produktions- eller native-mobilprov. Ingen produktionsdata, kundkommunikation, migration, merge eller manuell driftsättning ingår.

## Verifierat utgångsläge

- Dashboard: bas `ef55130e5169693e21c31954fd548edabb05fdba`. Senaste commit gäller partnerportalen. De fem senast hämtade Actions-körningarna på denna SHA är gröna, inklusive [Kontraktsgrind](https://github.com/Ahogberg/handymate-dashboard/actions/runs/34067256729) och [Första nyttan på mobil och desktop](https://github.com/Ahogberg/handymate-dashboard/actions/runs/34067256698). Detta är inte bevis för native-appen.
- Mobil: senaste hämtade commit `853f61744e83f2d8006ca2b01e6374aa5164f806`, offertutskicket via `/api/quotes/send`. Committexten rapporterar 205 tester och ren tsc; dessa mobiltester har **inte** körts om här. Actions-listan returnerade inga körningar i mobilrepot. Det bevisar inte att andra test-/byggsystem saknas.
- PR #18 och #17 är stängda. Deras beskrivningar redovisar separata CI-, preview- och produktionsgrindar. Befintlig [ÄTA-genomgång](../audit/ata-closeout-2026-09-06.md) skiljer också preview från produktion.
- [Telefonprovlistan](../launch/TELEFONPROV_2026-09-07.md) säger uttryckligen att inloggade flöden på riktig telefon återstår. Därför kallas inte senaste mobilprovet grönt här.
- Relevanta instruktioner: `CLAUDE.md`, `tasks/lessons.md`, `docs/council/ACTIVE_ROADMAP.md`. Äldre innovationsdokument behandlas som bakgrund, inte som inventering av dagens implementation.

## Spårad kedja: dagsrapport → ÄTA → beslut → fakturaunderlag

| Led | Faktisk kod och ansvar |
| --- | --- |
| Mobil rapport och ÄTA | Mobilens `lib/api.ts` har `workReport`-kontext och ÄTA-anrop. `components/CreateAtaSheet.tsx` sparar via `createAta`/`updateAta` och inväntar sparning före signeringsdialogen. |
| Rapportens förslag | `lib/matte/work-report.ts` begränsar till egen tid, anteckning, material och ÄTA-förslag. Pris får inte gissas. `app/api/matte/chat/route.ts` kopplar in detta läge. |
| Bekräftelse | `lib/matte/work-report-confirmation.ts` återkontrollerar användare/projekt och använder en deterministisk bekräftelsenyckel. Varje del kräver eget klick; ett skrivfel får inte utföra senare delar. |
| Riktig ÄTA | `lib/ata/suggest-ata-draft.ts` skapar ett förslagskort. `app/api/approvals/[id]/route.ts`, `create_ata_draft`, skapar vid godkännande en riktig `project_change` via `/api/ata`. Kortgodkännande är inte kundsignering. |
| Skapa / kundbeslut | `lib/ata/create-ata.ts` normaliserar rader och bevarar legacy-belopp. `app/api/ata/[id]/send/route.ts` hanterar överlämning; `app/api/ata/sign/[token]/route.ts` hanterar kundens beslut. `lib/ata/lifecycle.ts` anger fakturerbara statusar `approved` och `signed`. |
| Fakturaunderlag | `lib/invoices/project-invoice-draft.ts` konsumeras av automatfakturan, missad-intäkt-svepet och godkännandet `fakturera_projekt`. Separat manuell slutfakturaväg finns i `app/api/projects/[id]/create-final-invoice/route.ts`. |

Kedjan är källkodsgranskad. Det riktade testpaketet kör delar mot testdubblar; det är inte en enda autentiserad end-to-end-resa mot AI, databasen, SMS och telefon.

## Rättat fynd: tom radlista tappade ÄTA-belopp

**Producent:** `POST /api/projects/[id]/changes` skickar vidare `body.amount` till `skapaAta`. Helpern normaliserar saknade rader till `[]` men sparar beloppet i `total`. Detta är en explicit stödd legacy-form, inte bara ett påhittat testformat. Vanliga AI-genererade ÄTA-rader behöver inte ha denna form.

**Rotorsak:** automatunderlaget testade `ata.items && Array.isArray(ata.items)`. En tom array uppfyller villkoret, men dess loop skapar inga rader. Därmed nås inte den befintliga `ata.total`-fallbacken. Ändringens ID kommer ändå med i `ataChangeIds`, vilket innebär risk för senare fakturamarkering trots att beloppet utelämnats.

**Reproduktion med faktiska funktioner och isolerade databas-/fakturadubblar:** grundunderlag 1 100 kr exklusive moms, godkänd eller signerad ÄTA 300,50 kr med tom radlista.

| Fall | Före rättning | Rätt netto |
| --- | ---: | ---: |
| Tillägg | 1 100,00 kr | 1 400,50 kr |
| Avgående | 1 100,00 kr | 799,50 kr |

**Ändring:** kräv `Array.isArray(ata.items) && ata.items.length > 0` innan radloopen används. Tom lista går då till befintlig beloppsfallback, precis som `null` redan gjorde. Ingen ändrad beloppsregel, statustillåtelse, databasfråga eller kundkommunikation.

**Acceptans täckt av 15 nya prov i befintliga `tests/project-invoice-journey.spec.ts`:**

- `approved`/`signed` × tillägg/avgående × tom lista/`null`: samma netto, brutto och kundbelopp som manuell slutfaktura; förhandsvisningens netto stämmer också.
- Ingen påhittad ROT-flagga på beloppsfallbacken.
- Verkliga rader vinner fortsatt över en föråldrad sparad total.
- `draft`, `pending`, `sent`, `declined`, `rejected`, `invoiced` inkluderas inte.
- Före kodrättningen: **4 röda, 30 gröna**. De fyra röda gäller just tom array, båda fakturerbara statusar och båda tecken.

**Efter rättningen:** 150/150 riktade kontroller gröna: projektfakturakedjan, ÄTA-livscykel/dokument, fakturakällor/underlag, rapportläge och testlisteparitet. `npx tsc --noEmit` och `npm run build` exit 0. Byggloggen innehåller bland annat Sentry-varningar, dynamisk cookie-rendering och `supabaseUrl is required` eftersom produktionskonfiguration inte är satt; ingen varningsfri eller driftverifierad build påstås. Lint försökt men `next lint` öppnar konfigurationsfrågan: ingen genomförd lintkontroll. Ingen bred omsvepning av redan gröna kontrakt gjord.

Miljö: ren checkout, Node 24.19.0. Repo saknar incheckad lockfil; `npm ci` kunde inte användas. `npm install --ignore-scripts --no-package-lock --no-audit --no-fund` lyckades. Paketmanifest och beroendeversioner i repot ändras inte.

**Kvar före leverans:** granska draft-PR och kör valt fall i godkänd testmiljö med verklig databas. Bedöm befintliga fakturor separat om det finns faktiska berörda poster; ingen historisk återställning eller ekonomisk korrigering görs av den här patchen.

## Innovationsunderlag: försprång efter funktionerna

Verifierat 7 september 2026: [Jobber](https://www.getjobber.com/features/ai/) marknadsför redan AI-offerter, automatiska uppföljningar och svar på kundsamtal/text. [Easoft](https://easoft.se/) marknadsför AI-agentplattform och flöde från CRM till ekonomisk uppföljning. [Fieldly](https://en.fieldly.com/solutions/construction-service) beskriver ÄTA, tid/material och digitala arbetsorder. Följaktligen är ”AI + allt i ett” inte en tillräckligt specifik differentiering. Detta är en jämförelse med deras offentliga beskrivningar, inte fullständiga funktionstester; inget påstående görs att de saknar idéerna nedan.

HandyMate har redan intäktsärenden, intäktskö, värdekvitto, målstyrda uppdrag, daterade bekräftade löften, fryst fakturaunderlag, beslutsmetadata och experiment med ägarbeslut. Vi ska inte bygga dem en gång till. Följande är **hypoteser om nästa utbyggnad**, inte påstått levererade funktioner eller bevisat unika fördelar.

### 1. Jobbets beviskedja — varje avtalad rad får ett avslut

**Scenario:** offerten omfattar fem moment. Fyra är dokumenterade, men centralbytet saknar bekräftad egenkontroll. Ett extra uttag finns i dagsrapporten och i en ÄTA. Hantverkaren ser precis vilken avtalad rad som saknar bevis, vilken som är ändrad och vilket underlag som hör till fakturan.

**Finns:** `lib/projects/commercial-readiness.ts` har åtta projektövergripande evidensområden; `lib/invoices/evidence-manifest.ts` fryser underlagsreferenser inför leverans. Den förstnämnda filen beskriver radnivå uttryckligen som V2. Offert- och ÄTA-rader finns redan.

**Ny del / MVP:** manuellt bekräftad länk från en offert-/ÄTA-rad till befintlig rapport, kontroll eller dokumentreferens. Visa tre lägen: styrkt, behöver kontroll, kan inte bedömas. Börja med en jobbtyp och en källklass. Inga nya fotokopior och ingen automatisk fakturaspärr. AI-matchning kan senare föreslå länken men får inte bekräfta leveransen.

**Beroenden:** stabil radidentitet och versionshantering vid ändrad omfattning; företag/projekt måste matcha; läsfel får inte se ut som avsaknad. Återanvänd readiness-reglernas versionsmärkning och fryst manifest.

**Kundvärde / mätning:** mindre letande efter fakturaunderlag och tydligare kundförklaring. Pilotmål, inte prognos: minst 90 % korrekta länkar vid ägargranskning och 25 % kortare median för underlagsgranskning jämfört med mätt baslinje. Antal felaktigt markerade leveranser ska vara noll.

**Möjligt försvarbart försprång:** företagsspecifik historik över vad som avtalades, ändrades, utfördes och fakturerades — länkar som blir bättre genom bekräftelser och är svårare att återskapa än en generisk chattfunktion.

### 2. Frågan som låser upp jobbet — rekommenderat första produktbygge

**Scenario:** på väg från bygget öppnar montören dagsavslutet. I stället för en lång lista frågar Lars: ”Är extrajobbet utfört, eller bara godkänt av kunden?” Ett svar uppdaterar rätt källa efter bekräftelse och visar ett nytt kvitto: vad är sparat, vad återstår och vem behöver agera. Systemet skickar inget till kunden på egen hand.

**Finns:** `lib/value/revenue-work-queue.ts` ger nästa åtgärd per fas; `lib/projects/commercial-readiness.ts` beskriver saknade/motsägande underlag; `lib/customer-preparation/review-contract.ts` har källbundna frågor; rapportläget har bekräftelsemekaniken. Det nya är alltså inte ”AI ställer frågor”.

**Ny del / MVP:** en deterministisk prioriterare som väljer **en besvarbar fråga** utifrån verifierad flaskhals, rätt svarande och nästa konkreta arbetssteg. Börja med ett fall: signerad ÄTA men saknat leveransbesked. Visa ”vet inte” och ”fråga ansvarig”; ett svar får aldrig omtolkas till kundaccept eller automatiskt projektavslut. Separat klick bekräftar den exakta skrivningen via befintlig handler.

**Beroenden:** tydlig källa för leveransbesked; om ingen befintlig säker skrivväg finns måste den specificeras först. Behörighetskontroll, dedupe per källa/version, aktualitetskontroll före sparning, inget återkommande tjat vid ”vet inte”. Ett oläsbart underlag ska ge kontrollbehov, inte en självsäker fråga om att något saknas.

**Kundvärde / mätning:** färre beslut och mindre kontorsarbete för att komma vidare. Pilotmål: median under 30 sekunder från fråga till registrerat svar; minst 60 % av besvarade frågor undanröjer den avsedda flaskhalsen; färre än 10 % bedöms irrelevanta. Mät tid till granskningsklart underlag separat från tid till betald faktura.

**Möjligt försvarbart försprång:** data om vilken fråga, till vilken roll och i vilket arbetsläge som faktiskt hjälper ett jobb vidare. Det är ett användningsförsprång ovanpå de befintliga agentfunktionerna. Börja regelbaserat; lär inte en rankningsmodell innan beteendedata räcker.

### 3. Firmans nästa standard — provad ändring i offertmallen

**Scenario:** efter flera avslutade liknande jobb ser ägaren en återkommande miss i förberedelserna. Daniel föreslår en exakt, versionssatt ändring av jobbtypens offertstandard, exempelvis en obligatorisk uppgift om befintlig installation. Ägaren väljer att prova på några kommande offerter; äldre offerter ändras aldrig.

**Finns:** `lib/debrief`, `lib/playbook` och `lib/experiment/{propose,enroll,measure,report}.ts` har redan en lärloop. `app/api/approvals/[id]/route.ts` har både ”fortsätt testa” och ”gör till standard”. `lib/experiment/types.ts` tillåter idag endast den typade interventionen `kickoff_checkpoint`. Beslutsmetadata finns i `lib/ai/decision-record.ts` men dess input-hash kan inte återskapa originalunderlaget.

**Ny del / MVP:** en ny explicit experimenttyp för en godkänd ändring i offertstandard — med gammal/ny standardversion, tillämpning enbart på utvalda framtida offerter och mätning av vilket ändrat innehåll som faktiskt användes. Starta med en kompletterings-/förberedelsepunkt, inte autonom prissättning. Bygg inte om hela experimentmotorn eller en generell replay-UI.

**Beroenden:** migrations-/kontraktsändring för den nya typen, versionssatt standard och exponeringsspår, rätt att godkänna standarden, aktuella datakvalitetsgrindar. Kontrollera verkligt antal jämförbara, kompletta utfall före aktivering; detta har inte verifierats mot produktion i denna granskning.

**Kundvärde / mätning:** samma misstag behöver inte lösas på nytt vid varje jobb. Mät andel offerter som verkligen använde försöksversionen, extra kompletteringsfrågor, sena ändringar och tid till fakturaunderlag. Pilotmål: 100 % versionsspårbarhet och noll förändringar av gamla offerter. Redovisa små urval som observationer — en förbättrad siffra bevisar inte att standardändringen orsakade förbättringen.

**Möjligt försvarbart försprång:** ägarbekräftad, praktiskt använd kunskap kopplad till versioner och verkliga utfall per jobbtyp. Mer värdefullt än en AI som bara minns tidigare text. Detta kommer efter användnings- och datakvalitetsbevis, inte före.

## Rekommenderad ordning

1. Granska denna avgränsade beloppsfix och verifiera exakt fall i testmiljö. Återanvänd befintlig telefonprovlista för den riktiga mobilkedjan.
2. Bygg koncept 2 i ett enda arbetsläge och mät om frågan faktiskt hjälper kunden vidare.
3. Lägg till koncept 1:s första radkoppling när piloten visat vilket underlag som tar mest tid att samla.
4. Öppna koncept 3 först när jämförbar användnings- och utfallsdata finns. Ingen full autonomi, ny eventplattform eller generell simulator beställs genom detta underlag.

Målet är att HandyMate hjälper användaren få **rätt nästa sak gjord, med begripligt bevis**, inte bara producerar fler förslag.
