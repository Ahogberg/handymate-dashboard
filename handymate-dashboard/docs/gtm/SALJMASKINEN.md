# Säljmaskinen — från noll till 15–17 årskunder

> Det här dokumentet är **exekveringslagret**: vem gör vad, vilken vecka, med
> vilka ord. Kanalvalen, den externa researchen och de juridiska räckena
> ligger i [outreach-spelbok.md](outreach-spelbok.md) — de upprepas inte här.
>
> Målnivån är **15–17 betalande årskunder**. Varför just år, och varför det
> talet, står under "Nivån" nedan.

---

## Nivån

Firman kostar **5 995 kr/mån** löpande eller **59 950 kr/år** (betala 10, få 12).

Sälj år. Inte för att det är mer pengar — utan för att det är **pengar som
finns**. Tio månadskunder är 60 000 kr/mån som kan halveras nästa månad. Tio
årskunder är 599 500 kr på kontot, redan.

Rabatten kostar 12 000 kr per kund. Det är priset för att flytta ett helt års
churnrisk från oss till kunden, och det är billigt.

**Månadsbetalning är inte förbjudet — det är bara aldrig det vi föreslår
först.** Erbjud det när kunden ber om det, inte innan.

---

## Tratten baklänges

Det här är den viktigaste tabellen i dokumentet, och den är **tom med flit**.

Vi har noll historiska siffror: `landing_leads` är tom, inga kunder har köpt,
ingen vet vår stängningsgrad. Varje konverteringstal jag skulle skriva in här
vore en gissning, och en gissning i den här tabellen ger en falsk plan som
känns trygg ända tills den spricker i vecka sex.

Fyll den efter **två veckors riktig säljverksamhet**, med riktiga tal:

| Steg | Antal | Andel vidare | Källa |
|---|---|---|---|
| Kontaktade firmor | | | `gtm_activity` |
| Svar (positivt eller negativt) | | | `gtm_activity` |
| Bokade genomgångar | | | Kalender |
| Genomförda genomgångar | | | Kalender |
| **Signerade årskunder** | | | `business_config`, `subscription_status` |

När den är ifylld räknar man baklänges: 16 kunder ÷ stängningsgrad =
genomgångar som krävs, ÷ bokningsgrad = svar som krävs, ÷ svarsfrekvens =
kontakter per vecka. Det talet — **kontakter per vecka** — är det enda
Christoffer behöver hålla i huvudet.

Tills tabellen är ifylld: **arbeta på aktivitet, inte på utfall.** Ett bestämt
antal riktiga samtal per vecka, oavsett hur många som säger ja. Det är den
enda inputen vi kontrollerar.

---

## Veckomaskinen

Rollerna måste vara skarpa, annars gör båda allt och ingen gör något klart.

**Christoffer äger allt fram till signatur.** Prospektering, kontakt, samtal,
avslut.
**Andreas äger allt efter.** Onboarding, första 14 dagarna, produkt.

Den enda överlämningen är signaturen. Christoffer onboardar inte, Andreas
prospekterar inte.

### Christoffers vecka

| Dag | Vad |
|---|---|
| Måndag | Fyll listan. 20 nya firmor in i `gtm_account` med namn, bransch, telefon, källa. Ingen research utöver det — djupet kommer i samtalet. |
| Tis–tors | Ringa. Det är hela dagen. Boka genomgångar, inte sälj i första samtalet. |
| Fredag fm | Genomgångarna. Samlade på ett halvdagsblock, inte utspridda. |
| Fredag em | Fyll i veckans tal (se "Ett tal per fredag"). Rensa döda rader. |

**Varje kontakt får en rad i `gtm_account`, samma dag.** Ligger pipen i ett
huvud eller en telefon kan ingen se om veckan gav något förrän det är för
sent. Det finns redan `gtm_account`, `gtm_activity` och `gtm_suppression` —
använd dem, inte ett kalkylblad.

### Andreas vecka

Bygg. Plus onboarding av de kunder som signerats — men aldrig fler än taket
nedan.

---

## Ingången: branschgenomgången

Den starkaste öppningen vi har, och ingen konkurrent har den.

Vi har gått igenom **159 jobbtyper i tio hantverksbranscher** mot Skatteverkets
egna regler. 84 rader är källbelagda ordagrant, resten är utskickade på
faktagranskning. Det ligger i `docs/bransch/`.

Det är inte en pitch. Det är en present, och den är sann:

> "Hej, Christoffer på Handymate. Vi har gått igenom vilka jobb i din bransch
> som faktiskt ger ROT — mot Skatteverkets egna formuleringar, inte vad folk
> tror. Det blev en lista på [N] jobbtyper för [bransch]. Vill du ha den?"

Ingen hantverkare tackar nej till det. Och samtalet som följer handlar om
**deras** verklighet, inte om vår produkt — vilket är hela poängen.

Skicka listan oavsett om de vill prata mer. En hantverkare som fått något
gratis av oss svarar när vi hör av oss igen.

**Så många granskade rader finns per bransch idag** — säg aldrig ett högre tal:

| Bransch | Fil | Granskade rader |
|---|---|---|
| VVS | `vvs.md` | 16 |
| El | `el.md` | 11 |
| Mark & anläggning | `mark.md` | 12 |
| Ventilation | `ventilation.md` | 10 |
| Måleri & golv | `maleri.md` | 8 |
| Bygg & renovering | `bygg.md` | 7 |
| Snickeri | `snickeri.md` | 6 |
| Tak & plåt | `tak.md` | 6 |
| Allround | `allround.md` | 5 |
| Totalentreprenad | `totalentreprenad.md` | 3 |
| **Summa** | | **84** |

(El och Allround är nedräknade: fyra rader underkändes i den mekaniska
kontrollen och ligger i frågepaketet i stället — se
`docs/bransch/granskning/MEKANISK_KONTROLL_2026-09-02.md`.)

**Regel:** skicka bara de granskade raderna. En rad märkt `ROT*` eller `?` i
branschfilen får inte skickas till någon utanför huset. Vi bygger förtroende
på att vi vet — det förtroendet dör om en rad visar sig vara en gissning.

---

## Samtalet

Fyra delar, i den här ordningen. Håll det under 25 minuter.

**1. Deras dag (5 min).** Ställ frågorna, lyssna, skriv ner citat.
- Hur många samtal missar du i veckan när du står i arbete?
- När skriver du offerterna — på kvällen?
- Hur många offerter ligger obesvarade just nu?
- Vad händer med en kund som inte hör av sig igen?

Skriv ner **deras siffror**. De är hela avslutet senare.

**2. Vad teamet gör (7 min).** Sex specialister, ordagrant ur produkten:

| | |
|---|---|
| Matte | Koordinerar teamet och pratar med dig |
| Karin | Håller koll på fakturor och betalningar |
| Daniel | Följer upp offerter och leads |
| Lars | Koordinerar projekt och bokningar |
| Hanna | Sköter kampanjer och nya kunder |
| Lisa | **Fångar** samtalen du missar och hanterar kundförfrågningar |

**3. Visa i skarpt konto (10 min).** Inte en demomiljö. Säg det högt: "det
här är ett riktigt konto, inte en filmad demo."

**4. Avslutet (3 min).** Se nedan.

### Vad vi INTE säger

Det här är den dyraste sidan i dokumentet. Ett sålt löfte vi inte håller
kostar kunden i månad två — och då förlorar vi både kassan och möjligheten
att visa upp retention.

| Säg ALDRIG | Säg i stället |
|---|---|
| "Lisa svarar i telefon" / "hon pratar med kunden" / "ringer tillbaka" | "Lisa fångar samtalet du missar och tar emot ärendet" |
| "Systemet sköter kundkontakten åt dig" | "Teamet förbereder, du godkänner. Inget går ut utan att du sagt ja." |
| "Vi skickar uppföljningarna automatiskt" | Utgående automationer är **avstängda som standard**. De slås på av kunden, medvetet. |
| "Vi vet vad som ger ROT för allt" | 84 rader är belagda. För resten säger produkten "vi vet inte — du avgör", och det är ett styrkebesked, inte en svaghet. |
| "Du sparar X timmar i veckan" | Visa deras egna siffror från del 1. Vi lovar aldrig ett resultat i deras affär. |
| "Ingen bindningstid" om årsplanen | Årsplanen ÄR ett år. Månadsplanen är utan bindning. Blanda aldrig ihop dem. |

Om Christoffer är osäker mitt i ett samtal: **säg "det ska jag kolla och
återkomma om"**. Det kostar ingenting. En gissning kostar kunden.

---

## Avslutet

Använd deras egna siffror från del 1, inte våra:

> "Du sa fem missade samtal i veckan. Det är 260 om året. Firman kostar
> 59 950 kr för ett år — betala tio månader, få tolv."

Sedan tyst. Låt dem räkna själva.

**Årsplanen är förslaget.** Månad nämns bara om de frågar.

Vid tveksamhet, i den här ordningen:
1. **Garantin** — pengarna tillbaka. Ingen prova-på-period, men ingen risk.
2. **Halvtid** — "vill du att jag ringer om två veckor när du hunnit tänka?"
   Boka tiden i samtalet, inte "hör av dig".
3. **Släpp.** En kund som övertalas är en kund som churnar. Sätt `gtm_account`
   till kall och gå vidare. Det finns fler firmor än vi hinner ringa.

---

## Efter signatur

**Taket: max två nya kunder i onboarding per vecka.** Det känns långsamt.
Det är det som gör att de stannar — och en kund som stannar är värd mer än
tre som signerar och försvinner.

Blir det kö: det är ett bra problem. Boka in dem, hör av dig, låt dem vänta
en vecka. En kund som väntat en vecka på en ordentlig start är gladare än en
som fick en slarvig direkt.

### De första 14 dagarna, per kund

| Dag | Vad | Ägare |
|---|---|---|
| 0 | Onboarding tillsammans, inte "här är inloggningen". Importera deras riktiga kunder och fakturor. | Andreas |
| 1 | Första riktiga offerten skickad ur systemet. Inte en testoffert. | Andreas + kunden |
| 3 | Kort avstämning. Vad har de gjort själva? Vad har de inte rört? | Andreas |
| 7 | Första värdekvittot: vad har faktiskt hänt på kontot? Bara sanna siffror. | Automatiskt |
| 14 | Samtal. "Vad är det bästa hittills, och vad är fortfarande jobbigt?" Skriv ner svaret ordagrant — det är nästa kunds säljargument. | Andreas |

**Räddningskön** (`raddningsarende`) plockar upp konton som tappar fart innan
kunden själv märker det. Titta i den varje måndag. Ett konto i kön är
viktigare än en ny prospekt.

**Lanseringsbeviset** har sex stationer per konto. Ett konto som passerat alla
sex är en kund som faktiskt använder systemet — och det är dem du frågar om
en referens.

---

## Vad "sålt" betyder

Christoffer är medgrundare, inte säljare på provision. Incitamentet är redan
rätt — han äger utfallet, inte transaktionen. Det behövs ingen konstruktion
för att få honom att vilja ha kunder som stannar.

Men **definitionen** är fortfarande värd att skriva ner, för den är lätt att
glida på när det går trögt:

> En kund är såld när hon **fortfarande är kvar och aktiv på dag 60** —
> inte när hon signerat.

Det låter som en formalitet. Det är det inte. Skillnaden avgör vad man gör en
tisdag i november när pipen är tunn: jagar man en signatur till, eller ringer
man kunden från förra månaden som slutat logga in? Med den här definitionen är
svaret alltid det andra, utan att någon behöver ta diskussionen.

Räkna därför alltid två tal bredvid varandra, aldrig bara det första:
**signerade** och **aktiva på dag 60**. Glider de isär vet ni det direkt, och
då är det inte fler samtal som saknas.

## Ett tal per fredag

Inte en dashboard. Fyra rader, i en delad anteckning eller i Launch Desk:

| | Denna vecka | Totalt |
|---|---|---|
| Kontakter | | |
| Genomförda genomgångar | | |
| **Signerade årskunder** | | |
| Kontant inne | | |

Plus två kontrollfrågor:
- Hur många konton har passerat dag 60 och är fortfarande aktiva?
- Ligger något i räddningskön?

Om kontaktsiffran är noll spelar resten ingen roll. Det är den enda raden som
är helt inom vår kontroll, och den är alltid den första som glider.

---

## De fem sätten det går sönder

1. **Pipen ligger i ett huvud.** Ingen ser att veckan var tom förrän det gått
   en månad. → Varje kontakt in i `gtm_account` samma dag.
2. **Christoffer lovar något produkten inte gör.** Kunden churnar i månad två
   och vi förlorar både pengarna och referensen. → "Vad vi INTE säger", läst
   före första samtalet.
3. **För många onboardas samtidigt.** Alla får en halvdan start, ingen blir en
   referens. → Taket på två per vecka, utan undantag.
4. **Månadsbetalning smyger sig in som standard.** Kassan blir hälften så stor
   och churnrisken ligger kvar hos oss. → År är förslaget. Alltid.
5. **Vi säljer på gissningar om ROT.** En hantverkare som får fel besked om
   avdrag berättar det för hela sin bransch. → Bara granskade rader lämnar
   huset.

---

## Innan första samtalet

Tre saker måste vara på plats, annars är allt ovanstående teori:

- [ ] **Stripe i skarpt läge.** Går inte att ta betalt annars.
- [ ] **46elks laddat.** Saldot var 0 kr. Lisa som fångar missade samtal är
      kärnan i produktlöftet — en demo som inte ringer säljer ingenting.
- [ ] **En riktig firma kör skarpt i Handymate.** Din egen, en väns, vilken som
      helst där riktiga fakturor går ut. Utan det säljer vi en hypotes, och
      vi vet inte om produkten håller förrän kunderna redan betalat.
