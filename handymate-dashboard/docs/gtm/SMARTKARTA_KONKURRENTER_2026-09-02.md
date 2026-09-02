# Smärtkarta: vad hantverkare klagar på i konkurrerande affärssystem

Datum: 2026-09-02. Underlag för positionering och jämförelsesidor. Research, inte beslutad copy.

Status: läsning av publika, aggregerade källor (Trustpilot, App Store/Google Play, forum, jämförelsesajter). Inga inloggade konton, inga demos, inga individer identifierade. Detta ersätter inte `COMPETITOR_RESEARCH_2026-08-31.md`, som är funktionsfokuserad — det här dokumentet är klagomålsfokuserat.

---

## 1. Metod och källor

**Viktig teknisk begränsning i denna körning:** verktyget för att hämta enskilda webbsidor (WebFetch) blockerades av nätverkets utgående proxy för samtliga testade domäner, inklusive `trustpilot.com`, `se.trustpilot.com`, `apps.apple.com`, `play.google.com`, `byggahus.se`, `capterra.com`, `g2.com` och till och med `example.com`/`wikipedia.org` som kontrollprov. Det gick alltså inte att öppna en enskild recensionssida och läsa den rad för rad i den här sessionen.

Istället är underlaget byggt på **sökmotorsammanfattningar** (WebSearch) av dessa sidors innehåll — sökverktyget kunde se och sammanfatta sidornas text även när direkthämtning var blockerad. Det betyder:

- Citat nedan är korta fraser som sökmotorns sammanfattning återgav som citat från respektive sida. De är **inte** verifierade tecken-för-tecken mot originalets HTML, men är hämtade från namngiven sida, inte uppdiktade.
- Exakta datum och stjärnbetyg för enskilda recensioner gick sällan att fastställa (sidan visar det, men sammanfattningen anger det inte alltid). Där datum/betyg saknas står det **"datum ej verifierat i denna körning"**.
- Ingen recensent, inget användarnamn, ingen ort eller kontaktuppgift har samlats in eller återges.
- ~20 sökningar gjordes (redovisas per konkurrent nedan). 8 direkthämtningsförsök gjordes och blockerades samtliga (loggat ovan) — de räknas inte som lästa källor.

| Konkurrent | Källor sökta | Vad som gick att läsa | Vad som INTE gick att nå |
|---|---|---|---|
| Bygglet | Trustpilot (se.trustpilot.com/review/www.bygglet.com), Reco.se, App Store, Google Play, Flashback-tråd, businesswith.se | Sammanfattning av ~5 Trustpilot-omdömen, ett Flashback-inlägg, allmänna App Store-kommentarer | Fullständig recensionslista, exakta datum/betyg |
| Easoft | Trustmary (easoft.se-widget), Trustindex, egen webbplats | Genomgående positiva kundcitat (leverantörskurerad kanal) | Oberoende Trustpilot-sida hittades inte alls — finns sannolikt inte |
| Fortnox | Trustpilot (se.trustpilot.com/review/www.fortnox.se), Reco.se, Google Play | Sammanfattning av återkommande support- och prisklagomål över flera sidor (100+ sidor recensioner totalt på Trustpilot) | Enskilda recensioners exakta datum/betyg |
| Visma eEkonomi / Spcs | Trustpilot (se.trustpilot.com/review/vismaspcs.se), Spiris community-forum, jämförelsesajter | Detaljerade klagomål om uppsägning, pris, support, buggar | Enskilda recensioners exakta datum |
| Hantverksdata (Entré) | Affärssystemguiden, Capterra, Exsitec | Ingen recension alls hittad — sidan efterlyser själv "bli först att recensera" | **Underlag saknas helt** för publika, aggregerade omdömen |
| Bokio | Trustpilot (se.trustpilot.com/review/bokio.se, betyg 2.4/5 på 811 recensioner enligt sammanfattning) | Återkommande teman om support, uppsägning, pris, dataåtkomst | Enskilda recensioners exakta datum |
| Blikk | Trustpilot, Capterra, businesswith.se, blikk.se | Nästan uteslutande positiva/marknadsföringssidor och ett fåtal driftsättningskommentarer | Ingen oberoende negativ recensionsvolym hittades — **underlag tunt** |
| "Ordning & Reda"-kategorin | Sökningar på produktnamnet | Inget fristående affärssystem vid det namnet hittades för hantverkarbranschen (träffar gäller städfirmor eller organisationsböcker) | **Behandlas som tvärgående tema** (bristande ekonomisk ordning), inte som enskild konkurrent — se avsnitt 3 |
| Jobber (internationell referens) | Capterra, G2, Trustpilot, GetApp (sammanfattningar) | Tydliga teman om support och pris vid tillväxt | Enskilda recensioners datum |
| ServiceTitan (internationell referens) | Trustpilot, Capterra, PissedConsumer (sammanfattningar) | Tydliga teman om bindningstid, uppsägningsavgifter, onboarding | Enskilda recensioners datum |

Allmän regel som följts: när underlaget var för tunt för att ranka fem klagomål med substans står det uttryckligen **"underlag saknas"** eller **"underlag tunt"** i stället för att fylla på med gissningar.

---

## 2. Per konkurrent: de vanligaste klagomålen

### Bygglet

1. **Prismodell för fler användare upplevs oskälig.** Ett omdöme avrådde uttryckligen från Bygglet för kontor med mer än en person på grund av hur extra kontorsanvändare prissätts.
   > "avråder... för kontor med fler än en person" — Trustpilot, datum ej verifierat i denna körning
2. **Begränsningar upptäcks först efter köp.** Ett omdöme uppgav att systemet inte hanterar vanliga filformat (Word/Excel) och att detta framkom efter avtal tecknats och betalning gjorts.
   > systemet "kan inte hantera vanliga filer som Word och Excel" — Trustpilot, datum ej verifierat
3. **Kan inte markera mindre jobb som klara.** Nämns som en brist för mindre serviceuppdrag som utförs samma dag som de skapas.
   > "kan fortfarande inte markera uppgifter som klara" — App Store-sammanfattning, datum ej verifierat
4. **Önskemål om att kopiera föregående dags uppgifter** i tidrapporteringen, för jobb med återkommande samma arbete.
   > önskan om att "kopiera föregående dags uppgifter" — App Store, datum ej verifierat
5. **Adminvyn upplevdes svår i en tidigare version**, enligt ett omdöme som beskrev att Bygglet åtgärdade det efter feedback (positivt utfall, men bekräftar att problemet fanns).

Kanal/period: Trustpilot (`se.trustpilot.com/review/www.bygglet.com`) och App Store, sammanfattat 2026-09-02, exakta recensionsdatum ej tillgängliga i denna körning.

### Easoft

**Underlag saknas** för en klagomålsranking. De källor som gick att hitta (Trustmary-widget på easoft.se, Trustindex) är leverantörskurerade kanaler med genomgående positiva citat om användarvänlighet och support — ingen oberoende Trustpilot- eller Capterra-sida med negativa omdömen hittades i sökningen. Det betyder inte att Easoft saknar missnöjda kunder, bara att inget publikt aggregerat negativt material gick att belägga här.

### Fortnox (app/fakturering)

1. **Supporten är svår att nå.** Återkommande tema: långa väntetider, hänvisning till standardsvar, sällan personlig kontakt.
   > "extremt otillräcklig support", "mycket svårt att få svar på frågor och ännu svårare att nå en person" — Trustpilot, datum ej verifierat
   > "tar evigheter innan någon svarar i telefonsupporten" — Trustpilot, datum ej verifierat
2. **AI-chattbot upplevs ersätta mänsklig hjälp.**
   > Fortnox "tror man kan komma undan med nästan 100% AI-bot" — Trustpilot, datum ej verifierat
3. **Enkla funktioner kräver extra betalmoduler.** Flera omdömen nämner att man upptäcker avgiftsbelagda tillägg för sådant man förväntade sig ingå.
4. **Begränsade supportöppettider.**
   > "kundsupport med korta öppettider, aldrig öppet tidiga morgnar, kvällar eller annars" — Trustpilot, datum ej verifierat
5. **Appen/webben ibland långsam eller felaktig i mobilvy**, samt tidrapportering (byte mellan dagar i den anställdas app) som kunde vara smidigare.

Kanal/period: Trustpilot (`se.trustpilot.com/review/www.fortnox.se`, ~2 400+ recensioner enligt sidans egen räkning), sammanfattat 2026-09-02.

### Visma eEkonomi / Visma Spcs

1. **Fortsatt fakturering efter uppsägning / svårt att säga upp avtalet.** Det tydligaste och mest upprepade klagomålet.
   > "sa upp sitt Visma eEkonomi innan abonnemanget gick ut och fick ändå 3480 kr i faktura för en period som inte användes" — Trustpilot, datum ej verifierat
   > företaget "nekar att ha tagit emot en uppsägning och tvingar på ett nytt helårsavtal" — Trustpilot, datum ej verifierat
2. **Aggressiva prishöjningar och nya avgifter.** Pris som gått från cirka 2 500 kr/år till nära 10 000 kr, samt ny avgift per inläst faktura/kvitto.
   > avgift på "3,50 kr/st" per inläst faktura/kvitto — jämförelsesammanfattning av Trustpilot, datum ej verifierat
3. **Support svår att nå och upplevs okunnig.**
   > supportpersonalen "måste alltid gå och fråga någon annan", är "trevliga men hopplöst okunniga om sitt egna program" — Trustpilot, datum ej verifierat
4. **Systemet blir långsamt vid längre arbetspass.**
   > efter "max 1,5 timme" måste man öppna nytt fönster och logga in igen — Spiris community-forum, datum ej verifierat
5. **Buggar i bokslutsmodul och inloggning**, inklusive rapporterade driftstopp på flera timmar.

Kanal/period: Trustpilot (`se.trustpilot.com/review/vismaspcs.se`, betyg cirka 1,5–1,7/5 enligt sammanfattning), Spiris community-forum, sammanfattat 2026-09-02.

### Hantverksdata (Entré)

**Underlag saknas helt.** Affärssystemguiden.se har en produktsida för Hantverksdata Entré men noll recensioner (sidan uppmanar användare att "bli först att recensera"). Ingen Capterra-, G2- eller Trustpilot-sida med recensioner hittades. Detta är i sig ett observandum — Entré verkar inte ha samlad publik recensionsvolym att jämföra mot — men det ska **inte** tolkas som att produkten saknar klagomål, bara att de inte är publikt aggregerade och därmed inte citerbara här.

### Bokio

1. **Ingen telefonsupport, bara mejl med flera dagars svarstid.**
   > ville "kontakta Bokio via telefon" för att avsluta kontot men "det gick bara att kommunicera via mejl", vilket "tog flera dagar" att få svar — Trustpilot, datum ej verifierat
2. **Svårt att säga upp abonnemang / oväntade automatiska betalningar.** Återkommande klagomål om betalningsprocess och abonnemangshantering.
3. **Prishöjningar dåligt kommunicerade.**
4. **Nekad tillgång till egen bokföring efter avslutat kontrakt**, enligt vissa omdömen.
5. Enstaka tekniska buggar i löne- och fakturaflöden (t.ex. negativa värden på flera lönerader, borttagen bokföring som fastnade i "Att göra") — dessa är dock dokumenterade i Bokios egen ändringslogg som åtgärdade, snarare än ett aktivt recensionsklagomål.

Kanal/period: Trustpilot (`se.trustpilot.com/review/bokio.se`), betyg 2,4/5 på 811 recensioner enligt sammanfattning, sammanfattat 2026-09-02.

### Blikk

**Underlag tunt.** De flesta träffar var Blikks egna marknadsförings- och prissidor (som själva anger "inga bindningstider" och gratis support) samt en jämförelsesajt (businesswith.se) med genomgående höga betyg. Det enda återkommande, icke-marknadsförda observandumet:

1. **Initial uppsättning kräver relativt mycket arbete** innan systemet blir enkelt att hantera, enligt ett användarcitat.

Övriga fyra platser i rankingen kan inte fyllas med trovärdigt underlag — **underlag saknas** för resten av en fempunktslista för Blikk i den här körningen.

### "Ordning & Reda" / generell ekonomistyrning för hantverkare

Ingen fristående produkt med det namnet hittades riktad mot hantverkarbranschen. Sökträffarna gällde en städfirma respektive en organisationsbok, inte ett affärssystem. **Underlag saknas** för en egen konkurrentsektion — temat "bristande ordning och reda i ekonomistyrningen" (kvitton, ÄTA, tidrapporter som inte hänger ihop) behandlas istället som ett tvärgående tema i avsnitt 3, eftersom det är precis det underliggande problemet flera av klagomålen ovan (Visma, Bokio, Fortnox) pekar mot.

### Jobber (internationell referens)

1. **Support svår att nå vid komplexa problem.**
   > "daily calls to customer service for over two hours yielded no response, no escalation options" — sammanfattning av Capterra/G2-recensioner, datum ej verifierat
2. **Pris blir dyrt i takt med att teamet växer.**
3. **Transaktionsavgifter för kortbetalningar adderar upp över tid.**
4. **Vissa funktioner (utgiftsspårning, automatiska uppföljningar) kräver högre prisnivå eller tredjepartsintegration.**

Kanal/period: Capterra, G2 "Pros and Cons", GetApp, sammanfattat 2026-09-02. Endast för mönsterjämförelse, inte svensk marknad.

### ServiceTitan (internationell referens)

1. **Långa bindningsavtal (ofta 3 år) med höga uppsägningsavgifter.**
   > ett exempel: kund på 24-månadersavtal, betalat 4 802,50 dollar, blev offererad en uppsägningsavgift på 67 230 dollar — sammanfattning av recensioner, datum ej verifierat
2. **Lång och komplex onboarding/inlärningskurva.**
3. **Långsam support när problem uppstår.**
4. **Dyra tillägg och oväntade prisförändringar** (250–500 dollar per tekniker/månad enligt sammanställningar).
5. **Överkomplicerat gränssnitt för mindre företag** (under 10 tekniker).

Kanal/period: Trustpilot, Capterra, PissedConsumer, sammanfattat 2026-09-02. Endast för mönsterjämförelse.

---

## 3. Tvärgående teman

| Tema | Frekvens | Förekommer hos | Exakta formuleringar folk använder |
|---|---|---|---|
| Supporten svarar inte / AI-bot istället för människa | **Hög** | Fortnox, Visma, Bokio, Jobber, ServiceTitan | "svarar inte", "kommer aldrig fram", "hänvisas till standardsvar", "hopplöst okunniga", "nästan 100% AI-bot" |
| Fakturering fortsätter efter uppsägning / svårt säga upp | **Hög** | Visma, Bokio; internationellt: bindningsavtal + uppsägningsavgift (ServiceTitan) | "fick ändå faktura", "nekar att ha tagit emot uppsägningen", "tvingar på nytt helårsavtal" |
| Dyrt för småfirma / prishöjningar dåligt kommunicerade | **Hög** | Visma, Bokio, Fortnox (moduler), Jobber (skalning), ServiceTitan | "orimlig prishöjning", "dyrt för en liten firma", "krävde extra betaltjänst" |
| Dolda/extra avgifter för moduler och tilläggstjänster | **Medel–hög** | Fortnox (moduler), Visma (per inläst faktura/kvitto) | "trodde det ingick", "extra modul för det" |
| Systemet/appen blir långsamt eller hänger sig | **Medel** | Visma ("efter 1,5 timme"), Fortnox (webb/mobilvy) | "tuggar", "måste logga in igen", "laddar väldigt långsamt" |
| Tidrapportering krånglig i vardagen | **Medel** | Fortnox (byte mellan dagar), Bygglet (kopiera föregående dag) | "krångligt att byta dag", "vill kopiera igår" |
| ÄTA/tilläggsarbete glöms och faktureras aldrig | **Medel–hög (branschproblem, inte en enskild recension)** | Genomgående känt branschproblem enligt fältappleverantörer (Ätakollen, SmartDok m.fl.) — cirka 30–40 % av tilläggsarbete uppges glömmas utan systemstöd | "glömde fakturera ÄTA", "muntligt avtalat men aldrig dokumenterat" |
| Nekad/svår tillgång till egen data efter uppsägning | **Medel** | Bokio | "vägrade ge tillgång till vår bokföring" |
| Appen klarar inte dåligt mobilnät på bygget | **Låg–medel (mest känt problem, inte i konkurrenternas egna recensioner specifikt)** | Generellt branschproblem, adresseras av nischappar (ByggLog, SmartDok) som konkurrensargument | "fungerar inte utan täckning", "måste ha nät för att spara" |
| Kan inte markera enkla/småjobb som klara i flödet | **Låg** | Bygglet | "kan inte markera som klar" |
| Lång och komplicerad onboarding | **Medel (mest tydligt internationellt)** | ServiceTitan; Blikk nämner "kräver arbete att sätta upp" | "tog lång tid att komma igång", "krävde mycket uppsättning" |

---

## 4. Vad Handymate kan lova ärligt — och vad vi inte ska lova

Kontrollerat mot faktisk kod i repot (inte bara planer): `lib/ata/`, `app/api/ata/`, `app/api/voice/analyze`, `app/api/voice/execute`, `lib/approve-actions.ts`, `components/projects/diary/` + `app/api/projects/[id]/logs*`, `app/api/matte/chat`, `lib/agents/lisa/`, Fortnox-integration i över 100 filer, samt ROT-hantering i offert-/fakturamallarna (`lib/quote-templates/`, `lib/invoice-templates/`).

| Tema från smärtkartan | Vad vi FAKTISKT kan lova | Vad vi INTE ska lova |
|---|---|---|
| ÄTA glöms / faktureras aldrig | **ÄTA-utkastet skapas automatiskt ur samtalet** (röstanalys → utkast, `app/api/voice/analyze`, `lib/ata/`) — hantverkaren behöver inte komma ihåg att skriva ner det extra jobbet manuellt efteråt. | Att det aldrig missas något — utkastet måste fortfarande godkännas av hantverkaren; vi kan inte lova 100 % automatisk fångst av allt som sägs muntligt på plats. |
| Supporten svarar inte / AI-bot istället för människa | **Matte-chatten** svarar direkt i appen på vardagsfrågor om jobbet, och **Lisa** sammanställer efterarbete från samtalet automatiskt (`lib/agents/lisa/`) — mindre väntan på att själv leta upp information. | Att vi ersätter mänsklig support helt, eller att svarstiden på riktiga supportärenden är snabbare än konkurrenternas — det är inte mätt eller jämfört. Handymate är ett litet team, inte 24/7 bemannad support. |
| Fakturering fortsätter efter uppsägning / bindningstid | — | Vi har inget verifierat underlag i den här körningen för att påstå att Handymates uppsägning är enklare, kortare eller billigare än Visma/Bokio. **Lova inte detta förrän avtalsvillkoren är kontrollerade och kan styrkas.** |
| Dyrt för småfirma / dolda modulavgifter | — | Vi har inte verifierat egen prissättning mot konkurrenternas i den här researchen. **Lova inte "billigare" eller "inga dolda avgifter" utan att prislistan är faktagranskad separat.** |
| Faktura/offert blir fel (särskilt ROT) | **Offert med ROT-avdrag inbyggt i mallen** (`lib/quote-templates/`, `lib/invoice-templates/`) — avdraget räknas fram i offerten istället för att läggas till manuellt i efterhand. | Att ROT-hanteringen aldrig kan bli fel eller att Skatteverkets regler alltid är automatiskt uppdaterade utan mänsklig koll. |
| Tidrapport krånglig / admin i efterhand | **Byggdagboken** loggar jobbet (med foton, PDF-export) löpande via `components/projects/diary/` och `app/api/projects/[id]/logs`, vilket minskar behovet av att komma ihåg allt i efterhand. | Att detta ersätter fullständig, minutbaserad tidrapportering för lönerapportering — det är inte samma sak, och vi har inte verifierat hur detaljerad tidsloggningen är jämfört med Fortnox Tid. |
| Bokföringen hamnar fel / dubbelarbete mellan system | **Fortnox-synk finns** och är byggd i stor omfattning i koden (100+ filer rör Fortnox-integrationen) — siffror behöver inte matas in två gånger. | Att integrationen täcker 100 % av Fortnox funktionsyta, eller att den fungerar utan någon inställning/kontroll första gången. |
| Godkännande/spårbarhet på vad kunden sagt ja till | **Godkännande-kort** ger ett tydligt, tidsstämplat spår för vad som godkänts (`lib/approve-actions.ts`) — minskar tvister om "vad var det vi kom överens om". | Att detta är juridiskt bindande i alla lägen, eller att det ersätter en signerad ÄTA där kunden kräver det. |
| Appen klarar inte dåligt mobilnät på bygget | — | Vi har inte verifierat offline-läge/lokal synk i koden i den här researchen. **Lova inte "fungerar helt utan täckning" förrän det är kontrollerat.** |
| Nekad tillgång till egen data efter uppsägning | — | Ingen verifierad exportfunktion/policy kontrollerad i denna körning. **Lova inte fri dataexport förrän det är bekräftat.** |

---

## 5. Tre förslag på jämförelsesidor "Handymate mot X"

### 1. "Handymate mot Fortnox — slipp skriva ner jobbet två gånger"

- **Påstående 1:** ÄTA-utkastet skapas automatiskt ur samtalet med kunden, istället för att skrivas manuellt efter jobbet.
- **Påstående 2:** Byggdagboken loggar jobbet löpande med foton och kan exporteras som PDF.
- **Påstående 3:** Fortnox-synk finns byggd in, så siffrorna hamnar i bokföringen utan dubbel inmatning.
- **Kan INTE beläggas:** att Handymate är billigare totalt sett än Fortnox — ingen prisjämförelse är faktagranskad i denna research.

### 2. "Handymate mot Bygglet — enklare för en- och tvåmansfirman"

- **Påstående 1:** Matte-chatten svarar direkt i appen på frågor om jobbet, utan att behöva leta i menyer.
- **Påstående 2:** Offerten har ROT-avdraget inbyggt i mallen från start.
- **Påstående 3:** Godkännande-kort ger ett tydligt, tidsstämplat spår för vad kunden godkänt — minskar "vad kom vi överens om"-diskussioner.
- **Kan INTE beläggas:** att Handymate har fler nöjda kunder eller högre betyg än Bygglet — ingen oberoende betygsjämförelse finns för Handymate i denna research.

### 3. "Handymate mot Visma eEkonomi — hjälp som förstår hantverkarjobbet, inte bara bokföringen"

- **Påstående 1:** Lisa sammanställer efterarbetet på samtalet automatiskt, så administrationen inte samlas på hög.
- **Påstående 2:** Offert med ROT-avdrag är inbyggt i mallen, inte ett separat steg.
- **Påstående 3:** Fortnox-synk kopplar Handymate till bokföringen istället för att ersätta den — man behöver inte välja bort sitt befintliga bokföringssystem.
- **Kan INTE beläggas:** att Handymate har enklare uppsägning, lägre pris eller snabbare support-svarstider än Visma — inget av detta är mätt eller jämfört i denna research, och ska inte påstås förrän det är det.

---

## Sammanfattning av begränsningar (upprepas medvetet)

- WebFetch var helt blockerat i den här körningen (nätverksproxy) — allt underlag kommer från WebSearch-sammanfattningar av sidinnehåll, inte direktläsning av HTML.
- Inga individer, användarnamn eller kontaktuppgifter har samlats in.
- Hantverksdata Entré, Easoft och Blikk har tunt eller obefintligt publikt klagomålsunderlag — det är i sig ett fynd (de syns mindre i aggregerade recensionskanaler), inte ett bevis på att de saknar problem.
- Alla löften i avsnitt 4–5 är avstämda mot faktisk kod i repot vid tidpunkten för denna research (2026-09-02), inte mot planerade eller påstådda funktioner.
