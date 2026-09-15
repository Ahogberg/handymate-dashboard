# Externa parter för att sjösätta Handymates bokföring

> Ägare: Christoffer. Skriven 2026-09-14 av Claude som en pedagogisk sammanfattning av vad
> `FINANCIAL_KERNEL_ARCHITECTURE.md` §38, `FINANCIAL_KERNEL_DEVELOPMENT_ORCHESTRATION.md` (Sprint −1)
> och `OPEN_SOURCE_ACCOUNTING_LANDSCAPE.md` kräver av omvärlden. Tekniken är byggd i paket C0–C6
> (se `FINANCIAL_KERNEL_PACKAGE_LOG.md`); det här dokumentet handlar om det som inte går att koda.

## Varför det här dokumentet finns

Vår egen bokföring är till största delen kod, och den koden växer i takt med paketen. Men fem saker
kan ingen av oss bygga: en människa med rätt behörighet, kunder som vågar vara först, en myndighets
partneravtal, bankens data och ett betalavtal. Alla fem har ledtid, tre av dem räknas i månader,
och ingen av dem blir kortare av att vi väntar. Därför bör de sättas igång nu, även om själva
lanseringen ligger efter att produkten hittat sin marknad (PMF-grinden i orkestreringsdokumentet §2).

Ordningen nedan är ledtidsordning: det som tar längst tid står först.

## Snabböversikt

| # | Part | Vad den ger oss | Blockerar | Ledtid | Starta |
|---|---|---|---|---|---|
| 1 | Auktoriserad redovisningskonsult | Facit och ansvar för konteringsregler, moms, avrundning | R0, C1b, C9, C13 | Månader (rekrytera + lära in) | Nu |
| 2 | Pilotbolag (3–5 st) | Riktiga siffror, SIE4-fil, bankfil, tillstånd att köra parallellt | C4b, C6 S1, R0, C11 | Veckor till månader | Nu |
| 3 | Skatteverket, partner-API | Momsdeklaration 1.0; senare INK2 och skattekonto | C13, D3 | Månader (ansökan + certifikat) | Nu, efter beslut D3 |
| 4 | Bankdata | Kontoutdrag i camt.053/054 för avstämning | C11 | Veckor (fil) eller månader (avtal) | Efter pilotval |
| 5 | Betalleverantör | Kortbetalning, Swish, utbetalningar | C7, C9 | Månader; beror helt på D1 | Efter beslut D1 |

Tre beslut hos oss själva styr när parterna kan kontaktas: **D1** (vem är handlare i Handymate Pay),
**D3** (producerar vi momsdeklarationen eller skickar vi in den) och **D4** (vilket räkenskapsår
piloterna byter över). De står i arkitekturen §38 och är fortfarande öppna.

## 1. En auktoriserad redovisningskonsult

**Vad det är.** En person med rätt att svara för att våra konteringsregler är korrekta enligt
bokföringslagen och BFN:s regelverk. Inte en revisor (det är en annan roll, senare) och inte "någon
som kan bokföring", utan en namngiven person som skriver under på reglerna.

**Varför vi inte kan hoppa över det.** Orkestreringsdokumentet är tydligt: en konteringsregel som
skrivs utan granskare är inte "klar i väntan på granskning", den är ovaliderad. Skuggläget (C6)
jämför våra siffror med Fortnox, men bara på fakturanivå. Fortnox-kopplingen har inte scopet
`bookkeeping`, ett medvetet val som sparar kunderna licenspengar, så verifikationsnivån syns aldrig
i skuggan. De två svåraste svenska fallen, omvänd byggmoms och kontantmetoden, kan därför bara
bevisas av en människa.

**Vad personen gör hos oss.**
- Bekräftar avrundningskontot. Arkitekturen föreslår 3740, men det är ett förslag tills konsulten
  säger ja (paket C1b).
- Granskar SE-konteringsreglerna innan de kodas (paket C9) och momsprimitiverna (C13).
- Driver R0: tar en handfull pilotbolags löpande bokföring för hand under en period, så att vi får
  ett facit för exakt de fall skuggan inte täcker.

**Vad Christoffer gör.** Hittar personen, avtalar omfattning (timbank eller retainer), och skriver in
namnet i paketloggens §1. Den dag namnet står där kan C1b och C9 starta.

**Klart när.** Namnet står i loggen och personen har fått arkitekturens §15 (svenska regler) och
`FINANCIAL_KERNEL_SE_LEDGER_REVIEW.md` att läsa.

## 2. Pilotbolag

**Vad det är.** Tre till fem befintliga kunder som går med på att vara först. Kraven är konkreta:
- Fortnox kopplat i Handymate (skuggjämförelsen läser därifrån).
- Ett stängt räkenskapsår som SIE4-fil från Fortnox. Det är öppningsbalansen vi importerar (C4b).
- Kontoutdrag i fil från banken (se punkt 4).
- Ett skriftligt ja till att deras bokföring körs parallellt i Handymate under en period, och att en
  konsult får titta på den (R0).

**Varför just nu.** Skuggläget är byggt och körs i produktion sedan i kväll, men det jämför
ingenting förrän ett företag är i fas S1. S1 betyder: kärnan skriver, Fortnox är fortfarande
sanningen, och varje natt jämförs fakturor och betalningar exakt, utan tolerans. Två rena veckor i
S1 är villkoret för att definiera S2. Utan pilot står klockan stilla.

**Beslut som styr valet.** D4, räkenskapsårsgränsen. Ett bolag med brutet räkenskapsår eller ett år
som redan är halvvägs kan vara omöjligt som pilot. Beslutet behövs innan vi frågar någon.

**Vad Christoffer gör.** Väljer kandidater, ställer frågan, samlar in SIE4 och bankfil, och namnger
den första piloten med skäl. Flippen till S1 görs i adminytan, aldrig i databasen, och kräver
aktör och skäl.

## 3. Skatteverket: partneråtkomst till API för Momsdeklaration 1.0

**Vad det är.** Skatteverkets partner-API som gick live i november 2025. Ett system kan skapa och
hantera deklarationsunderlaget, skicka in det och läsa tillbaka inlämnade deklarationer och beslut.
Autentisering sker med OAuth2 och certifikat eller e-legitimation. I samma utvecklarportal finns
INK2-hämtning och skattekonto, och ett bolagsinformations-API är på väg.

**Det viktigaste att förstå.** Signeringen som utgör själva inlämningen görs alltid av den
skattskyldige hos Skatteverket. Den kan inte göras via API:t, av någon leverantör. "Handymate
lämnar in momsen" i stark mening finns alltså inte. Valet (D3) står mellan:
- *Bara producera*: vi tar fram rätt siffror och kunden lämnar in själv.
- *Förbereda och skicka, kunden signerar*: vi lägger underlaget hos Skatteverket, kunden trycker på
  knappen. Det är det kunden uppfattar som "Handymate ersatte Fortnox", och ansvaret stannar hos
  kunden av konstruktion.

**Vad Christoffer gör.** Får D3 beslutat, ansöker om partneråtkomst i utvecklarportalen, och
skaffar organisationscertifikatet från en godkänd utfärdare. Att ett litet Odoo-bolag (Vertel) har
integrationen i drift är belägg för att avtalet går att få för en liten leverantör.

**Klart när.** Vi har testmiljöåtkomst och ett certifikat som fungerar. Koden (C13) skrivs mot
testmiljön.

## 4. Bankdata för avstämning

**Vad det är.** Kontoutdrag som maskiner kan läsa, så att kärnan kan matcha inbetalningar mot
fakturor (paket C11). Standarden är ISO 20022, filerna heter camt.053 (dagsutdrag) och camt.054
(avier). Det äldre BgMax-formatet fasas ut, Handelsbanken slutar med det 2026-05-31, så vi bygger
inte för det.

**Två vägar.**
- *Fil från banken*: pilotens bank exporterar camt-filer. Enklast, räcker för piloterna.
- *Open banking-leverantör*: Tink, Enable Banking eller motsvarande hämtar kontodata löpande. Handymate
  får inte göra det själv utan tillstånd som kontoinformationstjänst (AISP). Leverantören har
  tillståndet, vi köper åtkomsten. Ett avtal, ledtid några veckor till någon månad.

**Behövs inte.** OCR-nummer följer Bankgirots öppna regel och kräver ingen part.

**Vad Christoffer gör.** Ber piloterna om camt-filer nu. Utvärderar en open banking-leverantör när vi
har fler än en handfull kunder på bokföringen.

## 5. Betalleverantör och beslut D1

**Vad det är.** Kortbetalning, Swish och utbetalningar för Handymate Pay (paket C7). Kandidater är
Stripe, Adyen och Swish Handel.

**Varför D1 kommer först.** D1 är frågan om vem som är handlare (merchant of record) när en kund
betalar en hantverkare genom Handymate.
- *Kunden är handlare*: varje hantverkare har sitt eget avtal med leverantören, pengarna går aldrig
  via oss. Då räcker ett standardavtal per kund, plus Swish Handel via kundens egen bank.
- *Handymate är handlare*: vi håller kundernas pengar. Då krävs tillstånd som betalningsinstitut
  eller ett agentavtal under en licensierad part, och det är en helt annan tidsskala och ett annat
  ansvar (återkrav, återbetalningar, moms på vår egen avgift).

D1 avgör också hur vår egen avgift faktureras och momsbehandlas, så den blockerar
konteringsreglerna (C9). Arkitekturen kallar det "en bokföringssemantik i integrationskostym".

**Vad Christoffer gör.** Får D1 beslutat före något leverantörsavtal. Därefter: avtal med
leverantören, och Swish Handel-ansökan per pilot via deras bank.

## Det som inte behöver någon part

- **SIE 4 och SIE 5** är öppna specifikationer från SIE-gruppen. Vi implementerar mot dem;
  certifiering är frivillig. SIE-import och -export ska finnas före första piloten.
- **BAS-kontoplanen** är fri att använda.
- **Bolagsverket** har vi redan produktionsnycklar till (värdefulla datamängder).
- **Fortnox bookkeeping-scope** behövs bara om ett pilotbolag kräver verifikationsnivå i skuggan.
  Det kostar dem licens, så det är ett kundbeslut, inte vårt.

## Senare, inte nu

- **Peppol-accesspunkt** för e-faktura till offentlig sektor, via en operatör som Pagero eller
  InExchange. Behövs först när en kund fakturerar en kommun.
- **Revisor** som kan uttala sig om helheten den dag vi vill säga "Handymate ersätter Fortnox"
  offentligt.
- **Gallring och arkivering**: bokföringslagens sjuårskrav och GDPR-gallring av värdeloggen är
  beslut hos oss, inte hos en part, men de ska vara tagna innan första piloten går live.

## Vad som händer den här veckan

1. Christoffer börjar leta konsult (punkt 1) och pilotkandidater (punkt 2).
2. Andreas och Christoffer tar D1, D3 och D4. De är beslut, inte utredningar.
3. Skatteverket-ansökan skickas när D3 är taget (punkt 3).
4. Bank och betalleverantör väntar på D1 och pilotvalet.

## Ordlista

- **AISP**: kontoinformationstjänst, tillståndet som krävs för att hämta bankdata åt andra.
- **camt.053/054**: ISO 20022-filer för kontoutdrag respektive avier.
- **Merchant of record**: den juridiska handlaren i en betalning, den som håller pengarna och bär
  återkravsrisken.
- **R0**: det manuella spåret där en konsult bokför pilotbolag för hand för att ge facit.
- **S1/S2**: skuggfaser. S1 = Fortnox är sanningen, vi jämför. S2 = Handymate är sanningen, Fortnox
  är referens. S2 definieras efter två rena S1-veckor.
- **SIE4**: filformatet svenska bokföringsprogram använder för att flytta ett räkenskapsår.
