# Granskningspaket ROT/RUT — 2026-09-02

## Vem frågar och varför

Handymate är en programvara för svenska hantverksfirmor (el, VVS, bygg, snickeri,
måleri, tak, mark, ventilation, totalentreprenad, allround). Vi bygger listor över
vilka jobbtyper som ger rotavdrag, rutavdrag eller skattereduktion för grön teknik,
så att en agent i appen kan föreslå rätt avdrag åt hantverkaren och kunden — och
undvika att föreslå ett avdrag kunden inte har rätt till.

Underlaget är sammanställt av en researchagent ur Skatteverkets egna sidor och ett
antal riktiga firmors tjänstelistor (10 branschfiler, 159 jobbtyper). **Ingenting
härifrån är publicerat till kunder än.** Innan något godkänns vill vi ha ett
mänskligt facit på de rader där vår tolkning av Skatteverkets text inte är
ordagrann, eller där vi inte hittat något besked alls.

## Vad vi ber om

159 jobbtyper är granskade av oss själva mot källorna, inklusive en mekanisk
kontroll av citaten (se `MEKANISK_KONTROLL_2026-09-02.md`, som flyttade 4 rader
hit efter en första genomgång). **86 av dem (64 med ordagrant ROT/RUT/grön
teknik-stöd + 18 med ordagrant Nej-stöd + 4 som är rent företag-till-företag och
därför inte berör privatpersoners avdrag) behöver ingen fråga** — se bilagan
sist i dokumentet. Kvar står **73 rader där vår tolkning antingen bygger på en
rimlig men inte ordagrann läsning av Skatteverkets text ("ROT\*"), eller där vi
inte hittat något besked alls ("?")**. Vi har slagit ihop rader som ställer
exakt samma sakfråga i flera branscher till en gemensam fråga, med resultatet
**44 frågor** nedan.

Varje fråga är skriven för att kunna besvaras utan att läsa våra interna
branschfiler — den innehåller vad vi tror, varför, och exakt vad vi är osäkra på.
Kryssa i svaret direkt i dokumentet (digitalt eller utskrivet).

## Hur svaren används

Svaren skrivs in i motsvarande branschfil (`docs/bransch/<fil>.md`) av Andreas
eller en assistent, och filens status ändras först då från "OGRANSKAD" till
"GRANSKAD". **Inget i branschfilerna används för att föreslå avdrag åt en riktig
kund innan den radens status har ett svar här.** Om ni (Skatteverket eller
konsulten) hellre skickar ett skriftligt PM eller hänvisar till en sida i
Skatteverkets rättsliga vägledning i stället för att kryssa i rutorna, fungerar
det precis lika bra — vi för in svaret manuellt.

## Läsanvisning

- **Del A** — 11 frågor som är exakt samma sakfråga i två eller fler branscher.
  Varje fråga listar alla rader (bransch + radnummer + jobbtyp) den avgör.
- **Del B** — 33 frågor som bara gäller en bransch, grupperade per bransch i
  samma ordning som branschfilerna (El, VVS, Bygg, Snickeri, Måleri, Tak, Mark,
  Ventilation, Totalentreprenad, Allround).
- **Bilaga 1** — de 86 rader vi INTE frågar om, med källa, som referens.
- **Bilaga 2** — rader utan tillräcklig grund för en fråga (se slutsats).

---

# Del A — Frågor som gäller flera branscher (11 st)

### F1 · El + VVS + Ventilation · Service, jour och felsökning — ger utryckningen ROT?

Vår bedömning: Reparationen ger ROT. Själva kontrollen/utryckningen/felsökningen
gör det inte.

Grund: Skatteverket (citerat i vvs.md, VVS-avsnittet, gäller alla bostadstyper):
*"servicearbeten, kontroll och översyn"* ger **inte** rotavdrag. Samtidigt ger
uttrycklig reparation ROT, t.ex. *"installera och reparera värmepannor,
värmepumpar och solvärmesystem"* (SKV, citerat i vvs.md/ventilation.md) och
Skatteverkets el-avsnitt om att *"enbart felsöka"* inte ger ROT (el.md, redan
avgjort — ingen fråga om den raden).

Osäkerheten: Ingen av branschfilerna har hittat en Skatteverket-formulering om
**hur ett och samma besök** — där hantverkaren både kontrollerar/felsöker OCH
reparerar — ska hanteras. Får hela fakturan ROT om en reparation ingick, eller
måste kontroll-/utryckningsdelen alltid särredovisas utan ROT även då?

Avgör rader: El #15 Elservice/jour, El #26 Service och underhåll av
elanläggning, VVS #20 VVS-service/reparation (småjobb), VVS #21 VVS-jour/akut
vattenläcka, Ventilation #13 Felsökning av värmepump (utan reparation).

Svar: ☐ Hela fakturan ROT om en reparation ingick ☐ Kontroll-/utryckningsdelen
måste alltid särredovisas utan ROT ☐ Annat: ____________

---

### F2 · Bygg + Snickeri + Totalentreprenad + Mark · 75-procentsregeln för tillbyggnad — vilka byggnadstyper omfattas?

Vår bedömning: ROT ges för tillbyggnad av bostadshus, förråd, garage, carport
eller gäststuga OM minst 75 % av en sida sitter ihop med befintlig yttervägg —
annars räknas det som en ny, fristående byggnad utan ROT.

Grund: Skatteverket, citerat likalydande i snickeri.md: *"någon av
tillbyggnadens sidor sitter ihop med den befintliga byggnadens yttervägg till
minst 75 procent"*. Samma regel återges i bygg.md, mark.md och
totalentreprenad.md med hänvisning till samma Skatteverkets ROT-sida.

Osäkerheten: De enskilda branschfilerna har applicerat regeln på flera
näraliggande situationer (uterum/inglasning, garage/carport separat byggt,
grävningen/sprängningen inför bygget, samt om regeln gäller lika för villa som
för den ägarlägenhets-formulering Skatteverket använder om altangrävning) utan
att hitta ett eget ordagrant Skatteverket-citat för just den situationen.

Avgör rader: Bygg #11 Garage-/carportbyggnad, Bygg #12 Uterum/inglasad veranda,
Snickeri #4 Altan och trädäck, Snickeri #13 Uterum/inglasning av altan,
Totalentreprenad #4 Tillbyggnad, Mark #4 Sprängning/bergspräckning vid
tillbyggnad (gäller regeln bara vid tillbyggnad, eller också vid nybyggd
fristående altan?), Mark #15 Altanbygge (mark-/grävdel) för villa (Skatteverket
namnger regeln uttryckligen bara för ägarlägenhet — gäller den även för småhus?).

Svar: ☐ Ja, 75-procentsregeln gäller alla dessa situationer ☐ Nej, se
kommentar per rad: ____________ ☐ Vet ej, kräver egen utredning per situation

---

### F3 · Måleri + Ventilation · Boendeformsskillnad vi redan citerat — stämmer vår tolkning?

Vår bedömning: Fasadmålning och fönstermålning (utsida) ger ROT i småhus men
inte för en BRF-medlem (bara insidan gör det i bostadsrätt). Kanalrensning/
rengöring av ventilation ger ROT i småhus men inte i bostadsrätt.

Grund: Skatteverket, citerat i maleri.md: *"måla fasader"* ger ROT för **småhus**;
för **bostadsrätt** ger utvändig målning (fasad, balkong, altan, takterrass)
**inte** ROT, bara *"insidan av ytterdörrar och fönster"*. Skatteverket, citerat
i ventilation.md: *"installera och rengöra avlopp, ventilation och imkanaler"*
(småhus) ger ROT, men i bostadsrätt är *"rengöra ventilation och imkanaler ...
för att städa efter utfört rotarbete"* uttryckligen **inte** godkänt.

Osäkerheten: Citaten är ordagranna för båda sidor, men filerna har ändå märkt
raderna "ROT\*" eftersom det är just skillnaden mellan boendeformer som ska visas
korrekt i appens gränssnitt (fel boendetyp inställd = fel avdrag). Vi vill ha en
enkel bekräftelse på att vår läsning av citaten är rätt innan vi bygger
UI-logiken på den.

Avgör rader: Måleri #4 Fasadmålning, Måleri #6 Fönstermålning, Ventilation #3
Kanalrensning/rengöring av ventilationskanaler.

Svar: ☐ Ja, tolkningen stämmer ☐ Nej: ____________

---

### F4 · El + VVS · Installation/inkoppling av vitvaror (diskmaskin, tvättmaskin, spishäll)

Vår bedömning: Osäkert — Skatteverket ger ROT för *"installera vitvaror i
samband med omfattande byggarbete eller renovering"*, men reparation av
vitvaror ger uttryckligen inte ROT. En fristående inkoppling utan renovering
runtomkring är oklar.

Grund: Skatteverket, citerat i vvs.md: *"installera vitvaror i samband med
omfattande byggarbete"* (ROT) vs. *"reparation av tvättmaskiner, torktumlare,
diskmaskiner"* (ger INTE ROT). Elsäkerhetsverkets B-auktorisation omfattar
*"fast anslutning av apparater"* (citerat i el.md) utan att det säger något om
ROT.

Osäkerheten: Ingen av filerna har hittat ett Skatteverket-citat om en **fristående**
inkoppling av en ny diskmaskin/tvättmaskin/spishäll som INTE sker som del av en
större renovering — är det ROT (installation) eller inte (för litet för att
räknas som "omfattande byggarbete")?

Avgör rader: VVS #7 Installation av diskmaskin, VVS #8 Installation av
tvättmaskin, El #16 Inkoppling av spishäll/vitvaror.

Svar: ☐ Ja, ROT oavsett om det sker fristående ☐ Nej, kräver samtidig
renovering ☐ Annat: ____________

---

### F5 · VVS · Avloppsrensning och högtrycksspolning — samma sak som "rengöra avlopp"?

Vår bedömning: ROT i småhus, inte i bostadsrätt.

Grund: Skatteverket, citerat i vvs.md (småhus): *"installera och rengöra
avlopp"* ger ROT. Skatteverket, citerat i vvs.md (bostadsrätt): *"Avloppsrensning"*
ger uttryckligen **INTE** ROT.

Osäkerheten: Är "stopp i avlopp / avloppsrensning" och "högtrycksspolning /
stamspolning" (som säljs av VVS-firmorna) samma aktivitet som Skatteverkets
"rengöra avlopp" (småhus) — eller en annan aktivitet som det uttryckliga
bostadsrätts-nejet för "avloppsrensning" också träffar i småhus? Filen noterar
själv att *"slamsugning/septiktankstömning ger aldrig ROT"* — var går gränsen
mellan rensning och slamsugning?

Avgör rader: VVS #5 Stopp i avlopp/avloppsrensning, VVS #6
Högtrycksspolning/stamspolning.

Svar: ☐ Samma sak, ROT i småhus ☐ Nej, avloppsrensning ger aldrig ROT (samma
regel som bostadsrätt) ☐ Beror på metod: ____________

---

### F6 · VVS + Mark · Relining och rörinspektion av avloppsrör

Vår bedömning: Oklart. Skatteverket nämner varken relining eller rörinspektion
ordagrant i det underlag vi hämtat.

Grund: Skatteverket, citerat i vvs.md: *"Filmning av avloppsrör"* ger
uttryckligen **INTE** ROT (det är alltså avgjort för ren filmning/inspektion
utan åtgärd). Stambyte/byte av avloppsrör ger inte ROT i bostadsrätt, men är
inte utrett för småhus. Relining är en teknik för att laga rör inifrån utan att
gräva/byta rör.

Osäkerheten: Räknas relining som "reparera avloppsrör" (ROT, i så fall i
småhus) eller som en ny teknik Skatteverket inte tagit ställning till? Och hur
förhåller sig rörinspektion **i marken** (mark.md) till samma filmnings-nej som
gäller inomhus (vvs.md) — är det samma regel oavsett var röret ligger?

Avgör rader: VVS #19 Relining, Mark #12 Rörinspektion, relining, byte av
avloppsrör/stammar (mark-/schaktdelen).

Svar: ☐ Relining = reparation, ROT i småhus ☐ Relining/rörinspektion ger
aldrig ROT (samma som filmning) ☐ Vet ej: ____________

---

### F7 · Snickeri + Allround · Var går gränsen fast/inbyggt vs. löst för mindre inredning?

Vår bedömning: Skräddarsydda möbler och en enstaka vägghylla eller tavla hamnar
i en gråzon mellan "platsbyggda fasta möbler" (ROT) och "möbler och lösöre"
(RUT).

Grund: Skatteverket, citerat i snickeri.md: *"montera platsbyggda fasta möbler,
exempelvis garderober och bokhyllor"* ger ROT; *"montera fristående möbler"*
ger uttryckligen **INTE** ROT. Skatteverket, citerat i allround.md: *"förflytta,
montera och demontera möbler och lösöre"* ger RUT — men gäller bara
**fristående** möbler.

Osäkerheten: Skräddarsydda men inte nödvändigtvis fastskruvade möbler
(bänkar, bord, sängar) — räknas de som "platsbyggda" om de är måttbeställda men
går att flytta? En enstaka hylla eller tavla på vägg nämns inte alls i något
citat vi hittat — är den RUT (lösöre-montering), ROT (om den räknas som fast
inredning) eller varken/eller?

Avgör rader: Snickeri #3 Skräddarsydda möbler/finsnickeri, Allround #6
Montering av hylla på vägg, Allround #7 Tavelupphängning.

Svar: ☐ Skräddarsytt = alltid platsbyggt/ROT om det inte enkelt kan flyttas ☐
Hylla/tavla = alltid RUT (lösöre-montering) ☐ Annat, se kommentar: ____________

---

### F8 · Bygg + Snickeri · Nybyggnad vs. reparation av trappa

Vår bedömning: Reparation av en befintlig, ihopbyggd trappa ger ROT. Nybyggnad
av en trappa är inte lika tydligt uttalad.

Grund: Skatteverket, citerat i snickeri.md och bygg.md, ordagrant för
reparation: *"reparera och underhålla entrétrappor, balkonger och altaner samt
tillhörande räcken, förutsatt att de är ihopbyggda med huset"*.

Osäkerheten: Ingen av filerna hittade ett lika tydligt citat om att **bygga en
ny** trappa (t.ex. en helt ny entrétrappa till en tillbyggnad) ger ROT — bara
att reparera en befintlig gör det uttryckligen.

Avgör rader: Bygg #10 Entrétrappor (reparation/nybyggnad), Snickeri #6 Trappa
(reparation av entré-/innertrappa).

Svar: ☐ Nybyggnad ger ROT på samma villkor som reparation ☐ Bara reparation
ger ROT, nybyggnad gör det inte ☐ Annat: ____________

---

### F9 · Bygg + Snickeri · Köksrenovering och platsbyggt kök — vad exakt ger ROT?

Vår bedömning: Själva **installationsarbetet** av fast köksinredning ger ROT,
inte köksmaterialet/vitvarorna i sig, och bara i samband med byggarbete/
renovering.

Grund: Skatteverket, citerat i snickeri.md/bygg.md: *"montera fast köks- och
badrumsinredning samt installera vitvaror i samband med omfattande byggarbete
eller renovering"*.

Osäkerheten: Var går gränsen för "omfattande"? En mindre uppdatering (byta
bänkskiva, sätta upp nya skåpluckor utan att röra stommen) — räknas det som
"renovering" i Skatteverkets mening, eller krävs ett större ingrepp för att
hela jobbet ska få kallas "köksrenovering" med ROT?

Avgör rader: Bygg #6 Köksrenovering, Snickeri #1 Platsbyggt kök/köksrenovering.

Svar: ☐ Alla köksjobb med fast inredning räknas, oavsett omfattning ☐ Kräver
ett större samtidigt ingrepp (stomme, el, VVS) ☐ Annat: ____________

---

### F10 · El + Allround · Dold kabeldragning som del av en installation (smarta hem, TV-montering)

Vår bedömning: Oklart om kabeldragningsdelen av jobbet ger ROT även när
huvudsyftet är något annat (t.ex. en TV eller ett styrsystem).

Grund: Skatteverket ger ROT för att *"dra in el"* och *"modernisera el"*
(el.md), utan att nämna dessa specifika jobb.

Osäkerheten: Vid smarta hem-installation (KNX, styrsystem) och vid
väggmontering av en TV där kabeln dras in i väggen — är det bara
kabeldragningsdelen som kan vara ROT (om den räknas som "elinstallation"),
eller ger hela jobbet ROT, eller inget alls eftersom slutprodukten (smart
hem-system, TV-fäste) inte är elinstallation i sig?

Avgör rader: El #17 Smarta hem/hemautomation (KNX, Wiser), Allround #8
TV-montering på vägg.

Svar: ☐ Bara kabeldragningen kan vara ROT, resten inte ☐ Hela jobbet räknas
som ROT om det kräver elbehörighet ☐ Inget av det är ROT ☐ Annat: ____________

---

### F11 · El + Allround · Nätverk, fiber och IT-installation i bostaden

Vår bedömning: Oklart, förmodligen varken ROT eller RUT (rent IT-arbete).

Grund: Inget Skatteverket-citat hittat i något underlag om nätverk, fiber,
routrar eller smarta lås.

Osäkerheten: Ingen av filerna hittade något Skatteverket-besked alls om
IT-/nätverksinstallation i en bostad. Är detta ROT (om det liknar svagströms-
elinstallation), RUT (hushållsnära tjänst) eller inget av delarna?

Avgör rader: El #25 Nätverk, fiber, data/svagström, Allround #11 Teknikhjälp
(installera router/skrivare, smarta lås).

Svar: ☐ ROT ☐ RUT ☐ Varken eller ☐ Vet ej — kräver Skatteverkets fullständiga
lista

---

# Del B — Branschspecifika frågor (33 st)

## El (5 frågor)

### F12 · El · "Modernisera el" — vad täcker den formuleringen exakt?

Vår bedömning: ROT, men den exakta Skatteverkets-formuleringen bakom "modernisera
el" är inte återgiven i sin helhet i vårt underlag — samma vaga hänvisning
används för fyra olika jobbtyper med olika säkerhet.

Grund: el.md skriver "modernisera el" som motivering för flera rader, med
Skatteverket (SKV-ROT) som en av flera källor, men utan att skriva ut den
fullständiga meningen från Skatteverkets sida.

Osäkerheten: Raden "Elrenovering (dra om el i äldre bostad)" är märkt som fast
ROT trots att den bygger på exakt samma vaga "modernisera el"-motivering som tre
andra rader som är märkta ROT\* (osäkra). Vi vet inte om det är en medveten
skillnad eller en inkonsekvens i vår egen klassificering — vi ber om den
faktiska Skatteverkets-meningen bakom "modernisera el" så vi kan reda ut alla
fyra på en gång.

Avgör rader: El #2 Installation av jordfelsbrytare, El #4 Elrenovering (dra om
el i äldre bostad), El #8 Byte av strömbrytare och dimmer, El #9 Installation
av belysning (inomhus).

Svar: ☐ Alla fyra ger ROT ☐ Bara vissa, se kommentar: ____________ ☐ Vet ej

---

### F13 · El · El i samband med kök-/badrumsrenovering — vilken Skatteverkets-text gäller?

Vår bedömning: ROT, men vi saknar en egen Skatteverkets-källa för just denna
rad — den är byggd enbart på tre firmors egna beskrivningar ("i samband med
renovering"), inte på ett Skatteverket-citat.

Grund: Ingen. Källorna för raden är tre elfirmor (Eltotalen, HB El, Elektriker
Matfors) — ingen Skatteverkets-sida är angiven för just den här raden, trots
att kolumnen säger "ROT".

Osäkerheten: Enligt vår egen regel ("bara Skatteverkets egen sida får ge ett
ROT-påstående") borde den här raden inte ha fått ett fast ROT-svar. Vi antar
att den följer av samma allmänna renoverings-ROT som kök/badrum i övrigt
(se F9), men vill ha det bekräftat specifikt för elinstallationsdelen.

Avgör rader: El #6 El vid kök-/badrumsrenovering.

Svar: ☐ Ja, ROT (samma regel som köks-/badrumsrenovering i övrigt) ☐ Nej ☐
Vet ej

---

### F14 · El · Montering/byte av eluttag — saknar citat

Vår bedömning: ROT (troligt, del av allmän elinstallation), men vår egen fil
saknar en motivering/citat för just den här raden trots att Skatteverket är
angiven som källa.

Grund: Skatteverkets sida är angiven som källa, men själva citat-fältet i vår
fil är tomt för den här raden.

Osäkerheten: Ren administrativ lucka i vårt underlag, inte en innehållsfråga —
vi vill bara ha bekräftat att "montera/byta eluttag" verkligen omfattas
(rimligen av samma resonemang som elcentral/kabeldragning) innan vi låser den
som fast ROT.

Avgör rader: El #7 Montering/byte av eluttag.

Svar: ☐ Ja, ROT ☐ Nej ☐ Vet ej

---

### F15 · El · Byte av huvudsäkring / säkringsuppgradering

Vår bedömning: ROT\*, ofta i samband med installation av laddbox.

Grund: Ingen Skatteverkets-källa angiven i vår fil för just denna rad — bara en
fastprismarknad (Dryft) och en laddbox-guide.

Osäkerheten: Är huvudsäkringsbyte en egen ROT-grundande elinstallation, eller
bara ROT när det sker som en nödvändig del av något annat ROT- eller grön
teknik-arbete (laddbox)?

Avgör rader: El #19 Byte av huvudsäkring/säkringsuppgradering.

Svar: ☐ ROT alltid ☐ ROT bara ihop med annat arbete ☐ Ingen ROT ☐ Vet ej

---

### F16 · El · Utomhus-/fasadbelysning på huset

Vår bedömning: ROT\* när belysningen sitter på själva huset (fasadbelysning) —
skiljt från "dra el i trädgården" som redan är avgjort som Nej.

Grund: Skatteverket ger ROT för elinstallation i/på bostaden, men vår fil har
inte hittat ett citat som specifikt namnger fasadbelysning.

Osäkerheten: Räknas fast monterad belysning på husets utsida (fasad, vid
entré) som del av husets elinstallation (ROT), eller riskerar den att tolkas
som "utomhusarbete" på samma sätt som trädgårdsbelysning (Nej)?

Avgör rader: El #20 Utomhus-/fasadbelysning (bara fasaddelen — trädgårdsdelen
är redan avgjord Nej och kräver inget svar).

Svar: ☐ ROT när den sitter på huset ☐ Nej, samma regel som trädgård ☐ Vet ej

---

## VVS (6 frågor)

### F17 · VVS · Byte av varmvattenberedare

Vår bedömning: ROT\*, men inte funnet ordagrant i det Skatteverkets-avsnitt vi
hämtat.

Grund: Fem VVS-firmor säljer tjänsten; Skatteverket är inte citerad för just
"varmvattenberedare" i vårt underlag, bara för närliggande delar som element,
termostat och rördragning.

Osäkerheten: Är varmvattenberedare en egen produktkategori Skatteverket inte
nämner alls, eller täcks den av en bredare formulering vi inte hittat i det
avsnitt vi hämtat?

Avgör rader: VVS #9 Byte av varmvattenberedare.

Svar: ☐ ROT ☐ Nej ☐ Vet ej

---

### F18 · VVS · Byte av vattenutkastare/trädgårdskran

Vår bedömning: ROT\*, eftersom Skatteverket nämner "kranar" generellt men vår
fil är osäker på om en kran som sitter på husets utsida men används i
trädgården räknas som "trädgårdsarbete" (Nej, samma regel som "dra el i
trädgården" i el.md) eller som en vanlig kran på huset (ROT).

Grund: Skatteverket, citerat i vvs.md: *"installera och reparera ... blandare,
kranar"* (ROT).

Osäkerheten: Vattenutkastaren sitter fast monterad på husväggen men försörjer
trädgården — vilken sida av gränsen "hus vs. trädgård" hamnar den på?

Avgör rader: VVS #11 Byte av vattenutkastare/trädgårdskran.

Svar: ☐ ROT (räknas som kran på huset) ☐ Nej (räknas som trädgårdsarbete) ☐
Vet ej

---

### F19 · VVS · Vattenburen golvvärme, elgolvvärme och byte av termostat

Vår bedömning: ROT\*/oklart för alla tre — Skatteverket nämner "golvvärme"
inte ordagrant i vårt underlag, bara närliggande begrepp (element, termostat,
värmesystem generellt).

Grund: Skatteverket, citerat i vvs.md: *"element, termostat"* ger ROT. Ingen
specifik "golvvärme"-mening hittad.

Osäkerheten: Räknas installation av (vattenburen eller elektrisk) golvvärme
samt spolning av golvvärmesystem och byte av golvvärmetermostat som samma sak
som "element, termostat" i Skatteverkets text, eller är golvvärme en egen
kategori som inte är utredd?

Avgör rader: VVS #14 Vattenburen golvvärme (installation, spolning), El #22
Installation av elgolvvärme, El #21 Byte av termostat (golvvärme).

Svar: ☐ Ja, samma som "element, termostat" ☐ Nej, egen bedömning krävs ☐ Vet ej

---

### F20 · VVS · Stambyte i småhus

Vår bedömning: ROT\* i småhus (skiljt från bostadsrätt, där det redan är
avgjort Nej).

Grund: Skatteverket, citerat i vvs.md (bostadsrätt): *"Stambyten, flytta/byta
avloppsrör"* ger uttryckligen **INTE** ROT. Ingen motsvarande mening hittad
specifikt för småhus — stambyte i småhus är oftast en BRF-entreprenad även när
det förekommer, vilket gör underlaget tunt.

Osäkerheten: Ger stambyte i ett småhus ROT enligt den allmänna regeln för
"dra in och reparera vatten- och avloppsledningar", eller finns det ett skäl
att stambyte som helhet (även i småhus) hanteras annorlunda?

Avgör rader: VVS #18 Stambyte.

Svar: ☐ ROT i småhus ☐ Nej, samma som bostadsrätt ☐ Vet ej

---

### F21 · VVS · Avfallskvarn

Vår bedömning: Inte utrett.

Grund: Två firmor säljer montering/borttagning av avfallskvarn i diskbänk.
Inget Skatteverket-citat hittat.

Osäkerheten: Är detta jämförbart med vitvaruinstallation (se F4) eller en egen,
outredd kategori?

Avgör rader: VVS #29 Avfallskvarn (montering/borttagning).

Svar: ☐ ROT ☐ Nej ☐ Vet ej

---

### F22 · VVS · VVS-/rörisolering

Vår bedömning: Inte utrett.

Grund: Installatörsföretagen nämner "Teknisk isolering — rörisolering för
energibesparing" som ett teknikområde, utan ROT-koppling. Inget
Skatteverket-citat hittat.

Osäkerheten: Ger isolering av VVS-rör (energibesparingsåtgärd, inte reparation)
ROT?

Avgör rader: VVS #30 VVS-/rörisolering.

Svar: ☐ ROT ☐ Nej ☐ Vet ej

---

## Bygg (2 frågor)

### F23 · Bygg · Betongarbeten/grundarbete

Vår bedömning: Beror på syfte — ROT när det är del av en tillbyggnad/altan,
inte ROT vid fristående grundläggning eller dränering i bostadsrätt.

Grund: Skatteverket, citerat i bygg.md (bostadsrätt): *"dränera husgrunder"*
listas uttryckligen bland det som INTE ger ROT för bostadsrätt (för småhus ger
det ROT, se bilaga). Firman GRB beskriver "gjutning av platta, spricklagning
av grunder och gjutning av trappor" som en tjänst.

Osäkerheten: När en byggfirma säljer "betongarbeten/grundarbete" som en egen,
fristående tjänst (inte uttryckligen kopplad till en tillbyggnad eller altan)
— vilket ROT-läge gäller som utgångspunkt om kunden inte specificerar syftet?

Avgör rader: Bygg #4 Betongarbeten/grundarbete (platta, spricklagning, trappor).

Svar: ☐ ROT som utgångspunkt, kräver undantag ☐ Nej som utgångspunkt, kräver
att kunden anger ett ROT-syfte ☐ Vet ej

---

### F24 · Bygg · Källarrenovering

Vår bedömning: ROT\*, ingen egen Skatteverkets-rad utan följer av allmänna
regler om att slipa/byta golv, tak och väggmaterial.

Grund: Skatteverket, citerat i snickeri.md/bygg.md: *"slipa och byta golv, tak
och väggmaterial"* ger ROT — men ingen specifik mening om "källarrenovering"
som helhet.

Osäkerheten: En källarrenovering kan omfatta fuktisolering, dränering och
annat som enligt andra citat i vårt underlag (t.ex. dränering i bostadsrätt)
INTE ger ROT. Räknas "källarrenovering" som en enhetlig ROT-jobbtyp, eller
måste den delas upp per moment redan i offertflödet?

Avgör rader: Bygg #7 Källarrenovering.

Svar: ☐ En enhetlig ROT-jobbtyp räcker ☐ Måste delas upp per moment ☐ Vet ej

---

## Snickeri (2 frågor)

### F25 · Snickeri · Lister, foder och socklar som egen jobbtyp

Vår bedömning: ROT\*, sannolikt del av dörr-/fönsterbytet (redan fast ROT, se
bilaga) snarare än en egen jobbtyp.

Grund: Skatteverket, citerat i snickeri.md: *"byta och reparera köksluckor,
dörrar, dörrlås, dörrhandtag och fönsterbleck"* — nämner "fönsterbleck" men
inte lister, foder eller socklar specifikt. Måleri.md har samma lucka: raden
"Målning av dörrar, foder och snickerier" har ett Skatteverkets-citat som bara
uttryckligen täcker "dörrar och köksluckor", inte foder/snickerier.

Osäkerheten: Räknas lister, foder och socklar som en del av dörr-/
fönsterarbetet (ROT, som redan är avgjort) eller som en egen linje som inte är
namngiven av Skatteverket?

Avgör rader: Snickeri #11 Lister, foder och socklar. (Se även Måleri #5 nedan
för samma typ av lucka på målningssidan.)

Svar: ☐ Del av dörr-/fönsterarbetet, ROT ☐ Egen bedömning krävs ☐ Vet ej

---

### F26 · Snickeri · Rivning/byggande av innervägg

Vår bedömning: ROT\*, ingen exakt Skatteverkets-formulering hittad specifikt
för innerväggar.

Grund: Skatteverket, citerat i bygg.md: *"riva väggar och bygga om
planlösningen i ett hus"* ger ROT — men den formuleringen gäller "riva väggar"
i largre ombyggnadssammanhang, inte uttryckligen "bygga en enklare
väggsektion" eller "förstärka en befintlig konstruktion" som en snickare kan
sälja fristående.

Osäkerheten: Krävs det att väggarbetet är del av en större ombyggnad
(planlösningsändring) för att få ROT, eller ger en enklare, fristående
innerväggsrivning/byggnation ROT på egen hand?

Avgör rader: Snickeri #12 Rivning/byggande av innervägg.

Svar: ☐ Ja, ROT även fristående ☐ Bara som del av större ombyggnad ☐ Vet ej

---

## Måleri (4 frågor)

### F27 · Måleri · Förarbete inför målning (spackling, fasadtvätt)

Vår bedömning: ROT\*, ingår normalt i målningsuppdraget men inte separat utrett.

Grund: Skatteverkets citat om "måla golv, tak, väggar" och "måla fasader"
(maleri.md) nämner inte förarbete separat.

Osäkerheten: Ger bredspackling/väggspackling inför målning och fasadtvätt/tak-
och fasadtvätt (utan efterföljande målning i samma order) ROT på egen hand,
eller bara när det ingår i samma faktura som själva målningsarbetet?

Avgör rader: Måleri #11 Bredspackling/väggspackling inför målning, Måleri #12
Fasadtvätt/tvätt av tak och fasad.

Svar: ☐ ROT alltid ☐ Bara ihop med målning på samma faktura ☐ Vet ej

---

### F28 · Måleri · Våtrumsmålning

Vår bedömning: ROT\*, följer generella regler för invändig målning men inte
specialutredd av Skatteverket för våtrum, och kräver att företaget är
MVK-auktoriserat för att räknas som godkänd våtrumsmålning.

Grund: Skatteverket, citerat i maleri.md: *"måla golv, tak, väggar, fönster och
element"* (allmän ROT-regel för invändig målning). MVK (Måleribranschens
Våtrumskontroll): kräver MVK-auktoriserat företag och en målare med giltigt
utbildningsbevis.

Osäkerheten: Gäller den vanliga ROT-regeln för invändig målning rakt av på
våtrumsmålning, eller finns det något i Skatteverkets regler som särbehandlar
våtrum (t.ex. på grund av tätskiktskrav)?

Avgör rader: Måleri #9 Våtrumsmålning (badrum).

Svar: ☐ Ja, samma regel som all invändig målning ☐ Nej, våtrum har särregler ☐
Vet ej

---

### F29 · Måleri · Dekorationsmålning (kalkfärg, specialtekniker)

Vår bedömning: ROT\*, troligen del av vanlig invändig/fasad-ROT men inte utrett
som egen kategori av Skatteverket.

Grund: Två firmor säljer dekorationsmålning/kalkfärg som egen tjänst. Inget
separat Skatteverket-citat hittat.

Osäkerheten: Räknas specialtekniker (kalkfärg m.m.) som vanlig målning (ROT,
följer F3:s boendeformsregler) eller riskerar de att klassas som dekoration/
konstnärligt arbete utan ROT?

Avgör rader: Måleri #13 Dekorationsmålning.

Svar: ☐ ROT, samma som vanlig målning ☐ Nej ☐ Vet ej

---

### F30 · Måleri · Plattsättning i badrum som tilläggstjänst

Vår bedömning: Oklart — gränssnitt mot ett annat yrke (kakel/plattsättning),
inte kärnmåleri, men två måleri-/golvfirmor säljer det ändå som tilläggstjänst
till våtrumsrenovering.

Grund: Skatteverket ger ROT för "kakel- och klinkersättningar" i samband med
badrumsrenovering (citerat i vvs.md/bygg.md) — men den frågan gäller specifikt
om ett **måleriföretag** som säljer plattsättning som tilläggstjänst omfattas
av samma regel.

Osäkerheten: Spelar det roll för ROT-rätten vilket slags företag (måleri
kontra VVS/bygg) som utför plattsättningen, eller är det bara arbetsmomentet
som avgör?

Avgör rader: Måleri #15 Plattsättning i badrum (tilläggstjänst).

Svar: ☐ ROT oavsett företagstyp ☐ Kräver rätt yrkesbehörighet (t.ex.
BKR-auktorisation, se bygg.md) ☐ Vet ej

---

## Tak (4 frågor)

### F31 · Tak · Takmålning (yttertak/plåttak) — VIKTIGT, hög risk för felaktigt avdrag

Vår bedömning: Inte utrett — och sannolikt **inte** samma sak som Skatteverkets
målningscitat.

Grund: Skatteverkets mening *"måla golv, tak, väggar, fönster"* (citerat i
maleri.md) står i ett sammanhang tillsammans med golv och väggar under
rubriken "Målning och tapetsering" — vår bedömning i tak.md är att "tak" där
sannolikt avser **innertak**, inte yttertak/plåttak. Ingen Skatteverkets-
formulering hittad som uttryckligen gäller målning av yttertak.

Osäkerheten: Det här är den rad vi är mest oroliga för att en agent skulle
kunna föreslå fel avdrag på, eftersom ordet "tak" i Skatteverkets text kan
misstolkas som att gälla yttertak. Vi vill ha ett tydligt ja eller nej innan
den här raden överhuvudtaget visas för en kund.

Avgör rader: Tak #7 Takmålning (yttertak/plåttak).

Svar: ☐ ROT (samma regel som annan målning) ☐ Nej, "måla tak" avser bara
innertak ☐ Vet ej

---

### F32 · Tak · Takbesiktning

Vår bedömning: Sannolikt Nej, samma princip som redan är avgjord för
"servicearbeten, kontroll och översyn" (se F1) och elens "enbart felsöka".

Grund: Skatteverket, citerat i el.md: *"enbart felsöka"* ger inte ROT.
Skatteverket, citerat i vvs.md: *"servicearbeten, kontroll och översyn"* ger
inte ROT. Tak.md har inte hittat en motsvarande mening specifikt om tak.

Osäkerheten: Vi antar att samma princip gäller takbesiktning, men vill ha det
bekräftat eftersom tak-avsnittet hos Skatteverket inte är lika utförligt citerat
i vårt underlag som el- och VVS-avsnitten.

Avgör rader: Tak #8 Takbesiktning.

Svar: ☐ Ja, samma princip — Nej till ROT ☐ Nej, takbesiktning är ett
undantag ☐ Vet ej

---

### F33 · Tak · Installation av taksäkerhet (snörasskydd, glidskydd, takstege)

Vår bedömning: Inte utrett.

Grund: Fyra takfirmor säljer installation av taksäkerhetsutrustning. Inget
Skatteverket-citat hittat i tak.md:s underlag som nämner denna typ av
utrustning.

Osäkerheten: Räknas taksäkerhetsutrustning som del av takarbetet (ROT, som
takomläggning/reparation) eller som en egen kategori (skyddsutrustning) som
Skatteverket inte adresserar?

Avgör rader: Tak #9 Installation av taksäkerhet.

Svar: ☐ ROT (del av takarbetet) ☐ Nej ☐ Vet ej

---

### F34 · Tak · Takfönster och bandtäckning — specifika tekniker

Vår bedömning: ROT\*, tekniska varianter av redan etablerade ROT-kategorier
(fönsterbyte respektive "byta ut plåttak") men inte namngivna ordagrant hos
Skatteverket.

Grund: Skatteverket nämner generellt *"reparera eller byta ut fönster"*
(citerat i snickeri.md) och *"byta ut plåttak"* (citerat i tak.md) utan att
namnge "takfönster" eller "bandtäckning" specifikt.

Osäkerheten: Är takfönster samma kategori som vanliga fönster, och är
bandtäckning (fogfritt plåttak, en läggningsteknik) samma kategori som
"byta ut plåttak" i stort?

Avgör rader: Tak #10 Takfönster (installation/byte), Tak #11 Bandtäckning
(fogfritt plåttak).

Svar: ☐ Ja, båda omfattas av respektive generella kategori ☐ Nej ☐ Vet ej

---

## Mark (4 frågor)

### F35 · Mark · Allmänt schaktarbete/markutjämning

Vår bedömning: Beror på syfte — schakt för avlopp/dränering/värmeborrning ger
ROT (redan avgjort, se bilaga), fristående/allmän schakt är inte utrett.

Grund: Skatteverket ger ROT för markarbete kopplat till specifika syften
(dränering, avlopp, värmeborrning, tillbyggnadssprängning) men har, enligt vårt
underlag, ingen generell mening om schakt/markutjämning utan angivet syfte.

Osäkerheten: När en markfirma säljer "schaktarbete/markutjämning" som en egen
tjänst utan att kunden anger syfte — vilket ROT-läge ska gälla som
utgångspunkt (jämför F23 om betongarbeten)?

Avgör rader: Mark #5 Schaktarbete/markutjämning (allmänt).

Svar: ☐ ROT som utgångspunkt ☐ Nej som utgångspunkt, kräver angivet syfte ☐
Vet ej

---

### F36 · Mark · Husgrund/platta vid nybygge

Vår bedömning: Sannolikt Nej, eftersom ROT gäller en befintlig bostad — men
inte verifierat ordagrant.

Grund: Skatteverket nämner grund/platta bara i kombination med sprängarbete
vid *tillbyggnad* av en befintlig byggnad (citerat i mark.md). Ingen mening
hittad om en helt ny grund vid nybyggnation.

Osäkerheten: Är vår slutsats ("nybyggnad ger aldrig ROT, alltså inte heller en
ny grund") korrekt, eller finns det ett undantag för grundarbete specifikt?

Avgör rader: Mark #11 Husgrund/platta på mark (nybygge).

Svar: ☐ Nej, aldrig ROT vid nybygge (bekräftar vår slutsats) ☐ Ja, det finns
ett undantag: ____________ ☐ Vet ej

---

### F37 · Mark · Specialgrundläggning (pålning, grundförstärkning, vajersågning, jordborrning)

Vår bedömning: Inte utrett, nischat arbete.

Grund: Två markfirmor säljer specialgrundläggning. Inget Skatteverket-citat
hittat.

Osäkerheten: Räknas det som "markarbete för husgrund" (kan ge ROT om det gäller
en befintlig byggnad, jämför F36) eller som maskinell utrustning/nischteknik
utan ROT?

Avgör rader: Mark #16 Specialgrundläggning.

Svar: ☐ ROT (grundförstärkning av befintlig byggnad) ☐ Nej ☐ Vet ej

---

### F38 · Mark · Snöröjning och halkbekämpning — Nej i mark.md, men RUT i allround.md?

Vår bedömning: Vi tror mark.md:s "Nej" är fel — samma aktivitet är redan
bekräftad RUT i vårt allround-underlag.

Grund: Mark.md märker raden "Nej" med motiveringen att *"SKV:s ROT-lista tar
inte upp snöröjning alls"* — men det är rätt, för att avdraget då hör hemma
under RUT, inte ROT. Skatteverket, citerat i allround.md (RUT-avsnittet):
*"skotta snö på uppfarter, hus- och garagetak samt gårdsplaner"* ger uttryckligen
**RUT**.

Osäkerheten: Vi har alltså redan facit i ett annat underlag (allround.md) —
frågan är bara om ni bekräftar att det är rätt status även när tjänsten säljs
av en markentreprenör, inte bara av en fixarfirma.

Avgör rader: Mark #13 Snöröjning och halkbekämpning.

Svar: ☐ Ja, RUT (bekräftar allround.md:s citat) ☐ Nej, av annat skäl:
____________

---

## Ventilation (3 frågor)

### F39 · Ventilation · Injustering av ventilationssystem

Vår bedömning: Inte utrett mot Skatteverket.

Grund: Två ventilationsfirmor nämner injustering av ventilationskanaler
uttryckligen; en tredje firmas formulering ("injusterar värme, vatten och
kylsystem") är en bredare VVS-injustering, inte specifikt
ventilationskanaler. Inget Skatteverket-citat hittat för injustering
specifikt.

Osäkerheten: Räknas injustering som del av "installera ... ventilation" (ROT,
redan avgjort för själva installationen) eller som en egen "kontroll/
justering"-kategori (jämför F1/F32 om kontroll/service)?

Avgör rader: Ventilation #5 Injustering av ventilationssystem.

Svar: ☐ ROT (del av installation) ☐ Nej (räknas som kontroll/justering) ☐
Vet ej

---

### F40 · Ventilation · Installation/service av AC eller komfortkyla utanför ägarlägenhet

Vår bedömning: Oklart för småhus/bostadsrätt.

Grund: Skatteverket, citerat i ventilation.md, ägarlägenhet: *"installera och
reparera en AC eller en luftvärmepump"* är uttryckligen godkänt. Ingen
motsvarande namngiven mening hittad för småhus eller bostadsrätt.

Osäkerheten: Gäller ägarlägenhetens uttryckliga AC-regel även för småhus och
bostadsrätt, eller är AC/komfortkyla en kategori Skatteverket bara namngivit
för just ägarlägenhet?

Avgör rader: Ventilation #14 Installation/service av AC/komfortkyla.

Svar: ☐ Ja, samma regel gäller alla boendeformer ☐ Nej, bara ägarlägenhet ☐
Vet ej

---

### F41 · Ventilation · Projektering/ritning av ventilationssystem (CAD)

Vår bedömning: Sannolikt Nej (planering/ritning), men vår enda motivering är en
analogi till elprojektering i en annan branschfil — inte ett eget
Skatteverket-citat, och elprojektering i sig är bara en anteckning i en
utesluten rad ("en källa"), inte ett fastställt Skatteverket-besked.

Grund: Ingen. Ventilation.md skriver bara "planering/ritning nämns inte som
godkänt arbete hos SKV — samma logik som elprojektering i el.md" — men den
el-jämförelsen är själv obekräftad.

Osäkerheten: Vi har alltså dragit en slutsats i två steg utan Skatteverkets-
källa i något av stegen. Ger ren projektering/ritning (utan utförande) ROT
eller inte?

Avgör rader: Ventilation #12 Projektering/ritning av ventilationssystem.

Svar: ☐ Nej, ren projektering ger aldrig ROT ☐ Ja, i vissa fall: ____________
☐ Vet ej

---

## Totalentreprenad (2 frågor)

### F42 · Totalentreprenad · Totalrenovering som paraplybegrepp

Vår bedömning: ROT\* på arbetskostnaden, förutsatt att huset är äldre än 5 år
och att underentreprenörernas timmar redovisas separat.

Grund: Skatteverket, citerat i totalentreprenad.md: femårsregeln (arbetet får
bara syfta till att återställa byggnaden om huset är yngre än 5 år) och kravet
att entreprenören redovisar underentreprenörernas arbetade timmar separat
(SKV-FTG).

Osäkerheten: "Totalrenovering" är ett paraplybegrepp som kan omfatta både
ROT-grundande arbeten (kök, badrum, el, VVS) och sådant som aldrig ger ROT
(t.ex. nybyggda fristående delar). Kan hela fakturan för en "nyckelfärdig
totalrenovering" få ROT, eller måste den alltid delas upp per
underliggande arbetsmoment redan i produkten?

Avgör rader: Totalentreprenad #1 Totalrenovering (nyckelfärdig helrenovering).

Svar: ☐ Hela fakturan, om Skatteverkets villkor uppfylls ☐ Måste alltid delas
upp per moment ☐ Vet ej

---

### F43 · Totalentreprenad · Projektledning/byggledning — räknas samordningstiden som ROT?

Vår bedömning: Oklart.

Grund: Skatteverket, citerat i totalentreprenad.md, utesluter uttryckligen att
*"anlita en arkitekt, kvalitetsansvarig, besiktningsman eller liknande"* som
fristående köp ger ROT.

Osäkerheten: Totalentreprenörens egen projektledning/samordningstid (som
säljs som en del av det nyckelfärdiga paketet, inte som ett fristående
konsultuppdrag) — räknas den som del av arbetskostnaden för de underliggande
ROT-grundande momenten, eller faller den under samma undantag som en fristående
besiktningsman?

Avgör rader: Totalentreprenad #5 Projektledning/byggledning under hela
projektet.

Svar: ☐ Räknas in i ROT-arbetskostnaden ☐ Räknas som undantaget konsultarbete,
ingen ROT på den delen ☐ Vet ej

---

## Allround (1 fråga)

### F44 · Allround · Reparation av vitvaror i bostaden — vilket citat styrker RUT?

Vår bedömning: RUT, men det enda citatet vi har i vårt underlag styrker bara
**var** arbetet ska utföras för att ge RUT — inte att reparation av vitvaror i
sig är en RUT-berättigad tjänst.

Grund: Skatteverket, citerat i allround.md: reparation av vitvaror måste ske
*"i bostaden eller biutrymmen som tillhör bostaden"* för att ge RUT — det är
ett platskrav, inte en bekräftelse på att kategorin "reparation av
tvättmaskin/torktumlare/diskmaskin" i sig ger rätt till rutavdrag.

Osäkerheten: Vi har antagit att reparation av vitvaror är en RUT-kategori
eftersom det är en vanlig, verklig tjänst — men vi saknar den ordagranna
meningen som säger just det.

Avgör rader: Allround #3 Reparation av vitvaror i bostaden (tvättmaskin,
torktumlare, diskmaskin).

Svar: ☐ Ja, RUT (ange gärna den ordagranna Skatteverkets-formuleringen) ☐ Nej
☐ Vet ej

---

# Bilaga 1 — Frågor vi INTE ställer (86 rader, referens)

Dessa rader har ordagrant stöd i Skatteverkets egen text (eller är rent
företag-till-företag, alltså inte relevanta för en privatpersons avdrag) och
tas inte upp ovan. Se `MEKANISK_KONTROLL_2026-09-02.md` för granskningen av
hur väl citaten faktiskt stödjer varje ROT/RUT/GT-rad.

## El (12 rader)

| Rad | Jobbtyp | Status | Källa |
|---|---|---|---|
| 1 | Byte av elcentral | ROT | SKV-ROT |
| 3 | Ny eldragning/kabeldragning | ROT | SKV-ROT |
| 5 | Byte till jordade uttag | ROT | SKV-ROT |
| 10 | Infällda spotlights | ROT | SKV-ROT (ordagrant) |
| 11 | Installation av laddbox | GT 50 % | SKV-GT |
| 12 | Installation av solceller | GT 15 % | SKV-GT, SKV-ROT |
| 13 | Installation av batterilagring | GT 50 % | SKV-GT |
| 14 | Felsökning av elfel | Nej | SKV-ROT ("enbart felsöka") |
| 18 | Elinstallation i lokaler/kontor | – (B2B) | ej tillämpligt |
| 23 | Värmepump — elinstallation | ROT (schablon) | SKV-ROT (styrkt via vvs.md rad 12) |
| 24 | Larm och passagesystem | Nej | SKV-ROT |
| 27 | Laddstolpe/laddstation (BRF/företag) | Nej (privat) | SKV-ROT |

## VVS (17 rader)

| Rad | Jobbtyp | Status | Källa |
|---|---|---|---|
| 1 | Byte/reparation av blandare | ROT | SKV-ROT |
| 2 | Byte av toalettstol | ROT | SKV-ROT |
| 3 | Byte av handfat/kommod | ROT | SKV-ROT |
| 4 | Montering av dusch | ROT | SKV-ROT |
| 10 | Byte av vattenmätarkonsol | ROT | SKV-ROT (ordagrant) |
| 12 | Installation av värmepump | ROT (schablon) | SKV-ROT |
| 13 | Byte av element/radiator | ROT | SKV-ROT |
| 15 | Nya vatten-/avloppsledningar | ROT sm./Nej BRF | SKV-ROT |
| 16 | Enskilt avlopp | ROT | SKV-ROT |
| 17 | Badrumsrenovering — VVS-delen | ROT | SKV-ROT |
| 22 | VVS för BRF/företag/nyproduktion | – (B2B) | ej tillämpligt |
| 23 | Byte av golvbrunn | ROT | SKV-ROT |
| 24 | Byte av värmepanna | ROT | SKV-ROT |
| 25 | Fjärrvärmeväxlare | ROT (35 %) | SKV-ROT |
| 26 | Solvärmesystem | ROT (30 %) | SKV-ROT |
| 27 | Vattenfelsbrytare/vattenlarm | ROT | SKV-ROT (ordagrant) |
| 28 | Rörinspektion/avloppsfilmning | Nej | SKV-ROT (ordagrant) |

## Bygg (8 rader)

| Rad | Jobbtyp | Status | Källa |
|---|---|---|---|
| 1 | Tillbyggnad av bostadshus | ROT | SKV-ROT (ordagrant) |
| 2 | Rivning/ombyggnad av planlösning | ROT | SKV-ROT |
| 3 | Murning och putsning | ROT | SKV-ROT |
| 5 | Badrumsrenovering (våtrum) | ROT | SKV-ROT |
| 8 | Fasadrenovering (puts/lagning) | ROT | SKV-ROT |
| 9 | Altanbygge | ROT/Nej BRF | SKV-ROT |
| 13 | Stensättning/plattsättning utomhus | Nej | SKV-ROT (ordagrant) |
| 14 | Projektledning/totalentreprenad | – (B2B/tjänst) | ej tillämpligt |

## Snickeri (6 rader)

| Rad | Jobbtyp | Status | Källa |
|---|---|---|---|
| 2 | Platsbyggd förvaring | ROT | SKV-ROT (ordagrant) |
| 5 | Staket, plank och mur | Nej | SKV-ROT (ordagrant, x3) |
| 7 | Dörrar | ROT | SKV-ROT (ordagrant) |
| 8 | Fönster | ROT | SKV-ROT (ordagrant) |
| 9 | Golv | ROT | SKV-ROT (ordagrant) |
| 10 | Fasad | ROT | SKV-ROT |

## Måleri (8 rader)

| Rad | Jobbtyp | Status | Källa |
|---|---|---|---|
| 1 | Invändig målning av väggar och tak | ROT | SKV-ROT (ordagrant) |
| 2 | Målning av innertak | ROT | SKV-ROT |
| 3 | Tapetsering | ROT | SKV-ROT (ordagrant) |
| 5 | Målning av dörrar, foder och snickerier | ROT | SKV-ROT (dörrar/köksluckor ordagrant — "foder/snickerier" se F25) |
| 7 | Golvslipning, lackning och oljning | ROT | SKV-ROT |
| 8 | Golvläggning/byte av golv | ROT | SKV-ROT |
| 10 | Målning av trapphus | Nej | Härlett från tak.md:s citat om gemensam egendom (trapphus/tak/fasad) |
| 14 | Målning av staket, plank och murar | Nej | SKV-ROT (ordagrant) |

## Tak (6 rader)

| Rad | Jobbtyp | Status | Källa |
|---|---|---|---|
| 1 | Takomläggning/takbyte | ROT | SKV-ROT |
| 2 | Reparation och lagning av tak | ROT | SKV-ROT |
| 3 | Taktvätt/mossbekämpning/algbehandling | ROT (ej RUT) | SKV-ROT + SKV-RUT (ordagrant, se README-fynd 7) |
| 4 | Snöskottning från tak | RUT | SKV-RUT (ordagrant) |
| 5 | Hängrännor och stuprör | ROT | SKV-ROT (ordagrant) |
| 6 | Plåtarbeten/plåtslageri | ROT | SKV-ROT |

## Mark (11 rader)

| Rad | Jobbtyp | Status | Källa |
|---|---|---|---|
| 1 | Dränering av husgrund | ROT | SKV-ROT (ordagrant) |
| 2 | Enskilt avlopp | ROT | SKV-ROT |
| 3 | Borrning för bergvärme/brunn | ROT | SKV-ROT (bergvärmedelen) |
| 6 | Poolschakt/grävning för pool | Nej | SKV-ROT (ordagrant) |
| 7 | Stenläggning/plattsättning | Nej | SKV-ROT (ordagrant) |
| 8 | Asfaltering | Nej | SKV-ROT |
| 9 | Staket och murar | Nej | SKV-ROT (ordagrant) |
| 10 | Trädgårdsanläggning/nyanläggning | Nej (varken ROT/RUT) | SKV-ROT + SKV-RUT |
| 14 | Markarbete för bredband/fiber | ROT | SKV-ROT (ordagrant) |
| 17 | Trädgårdsskötsel | RUT | SKV-RUT (ordagrant) |
| 18 | Trädfällning och beskärning | RUT | SKV-RUT (ordagrant) |

## Ventilation (9 rader)

| Rad | Jobbtyp | Status | Källa |
|---|---|---|---|
| 1 | OVK-besiktning | Nej | SKV-ROT (VVS-sektionen, generellt) |
| 2 | Ventilationsservice/underhåll | Nej | SKV-ROT |
| 4 | Installation av nytt ventilationssystem | ROT | SKV-ROT |
| 6 | Ventilationsentreprenad i lokaler/fastigheter | – (B2B) | ej tillämpligt |
| 7 | Installation av luftvärmepump | ROT | SKV-ROT |
| 8 | Installation av luft-vattenvärmepump | ROT | SKV-ROT |
| 9 | Installation av bergvärmepump | ROT | SKV-ROT |
| 10 | Reparation av värmepump | ROT | SKV-ROT |
| 11 | Service av värmepump | Nej | SKV-ROT |

## Totalentreprenad (3 rader)

| Rad | Jobbtyp | Status | Källa |
|---|---|---|---|
| 2 | Badrumsrenovering, nyckelfärdigt | ROT | SKV-ROT (styrkt via vvs.md rad 17/bygg.md rad 5, se mekanisk kontroll) |
| 3 | Köksrenovering, nyckelfärdigt | ROT | SKV-ROT (köksluckor ordagrant) |
| 6 | Attefallshus/komplementbyggnad | Nej | SKV-ROT (ordagrant) |

## Allround (6 rader)

Rad 3 (Reparation av vitvaror) är flyttad härifrån till frågepaketet (F44)
efter den mekaniska kontrollen — se `MEKANISK_KONTROLL_2026-09-02.md`.

| Rad | Jobbtyp | Status | Källa |
|---|---|---|---|
| 1 | Möbelmontering (fristående) | RUT | SKV-RUT (ordagrant) |
| 2 | Gardiner, gardinstänger, rullgardiner | RUT | SKV-RUT (ordagrant) |
| 4 | Snöskottning | RUT | SKV-RUT (ordagrant) |
| 5 | Trädgårdsskötsel | RUT | SKV-RUT (ordagrant) |
| 9 | Montering av köksluckor/fronter (byte) | ROT | SKV-ROT (ordagrant) |
| 10 | Bärhjälp och bortforsling | Nej* (bara ihopsamlande ger RUT) | SKV-RUT (ordagrant) |

---

# Bilaga 2 — Rader utan formulerbar grund

**Ingen.** Samtliga 73 rader som saknar ordagrant stöd (72 identifierade vid
den första genomgången + 1 tillkommen vid den mekaniska kontrollen, F44) gick
att formulera en självbärande fråga för (se Del A och B). De svagast
underbyggda enskilda raderna (t.ex. F14 tom källhänvisning, F21/F22/F35–F37
helt utan Skatteverkets-källa) är ändå frågebara eftersom jobbtypen är tydligt
definierad även utan ett Skatteverkets-citat att utgå från.
