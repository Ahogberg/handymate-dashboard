# Branschpaket — källbelagda jobbtyper per bransch

Underlag för steg 2 i branschförståelse-programmet (se `tasks/todo.md` och
minnet `branschforstaelse`). **Alla filer är OGRANSKADE** tills Andreas gått
igenom dem — inget härifrån seedas till kundkonton innan dess.

## Regeln

Andreas 2026-09-02: *"i verkligheten relevant, inte vad du som AI fantiserar ihop"*.
Varje jobbtyp har minst en namngiven källa vars sida faktiskt hämtats. Inga rader
utan belägg. Ett välgrundat "den här branschen ska inte ha en egen lista" är ett
bättre svar än en påhittad lista.

**Källhierarki:** (a) myndighet/branschorganisation → (b) Skatteverket ROT/RUT/grön
teknik → (c) 5–7 riktiga firmors tjänstesidor + fastprismarknader/efterfrågesidor
→ (d) fackgranskning (Andreas/Christoffer, ej gjord).

**Tröskel:** ≥3 källor → startpaket · 2 källor → valbart tillägg · 1 källa → utelämnad.

**ROT-kolumn:** `ROT` = Skatteverket säger det ordagrant · `RUT` = RUT i stället ·
`ROT*` = följer av SKV:s formulering men står inte ordagrant, granska · `Nej` = SKV
säger uttryckligen nej · `?` = inte utrett. **Bara Skatteverkets egen sida får ge
ett ROT-påstående** — firmors påståenden om ROT räknas inte som belägg.

## Filer

| Fil | Bransch (`branch`) | Status |
|---|---|---|
| [el.md](el.md) | electrician | Utkast — 11 källor, 18 startpaket + 9 tillägg + 4 ute |
| [vvs.md](vvs.md) | plumber | Utkast — 16 källor, 22 + 8 + 9 |
| [maleri.md](maleri.md) | painter | Utkast — 11 källor, 10 + 5 + 2 |
| [snickeri.md](snickeri.md) | carpenter | Utkast — 9 källor, 10 + 3 + 4 |
| [bygg.md](bygg.md) | construction | Utkast — 13 källor, 11 + 3 + 6. OBS: Boverket-fakta är WebSearch-citat, inte hämtad sida (JS-renderad) |
| [tak.md](tak.md) | roofing | Utkast — 12 källor, 9 + 2 + 5 |
| [mark.md](mark.md) | groundworks | Utkast — 15 källor, 13 + 5 + 5. Agentens bedömning: **behåll branschen** (SKV har ett eget markavsnitt med 7 ja och 5 nej) |
| [ventilation.md](ventilation.md) | hvac | Utkast — 13 källor, 11 + 3 + 11. Agentens bedömning: **underlaget räcker för att exponera i onboardingen** |
| [totalentreprenad.md](totalentreprenad.md) | general_contractor | Utkast — 9 källor, 5 + 1 + 6. Agentens svar: **egen liten lista** (entreprenörsspecifik), hantverket via `secondary_branches` |
| [allround.md](allround.md) | other | Utkast — 8 källor, 5 + 6 + 5. Agentens svar: **kort egen lista** av namngivna småjobb, resten är timdebiterad fixartjänst |

Utanför scope tills någon efterfrågar dem: golv, trädgård, låssmed, städ, flytt
(de har biblioteksinnehåll men går inte att välja i onboardingen).

## Tvärgående fynd (uppdateras när filerna landar)

### 1. ROT beror på BOSTADSTYPEN, inte bara på arbetet
Samma arbete ger ROT i småhus men inte i bostadsrätt. Exempel ur källorna:
- **Måleri:** utvändigt (fasad, balkong, altan, utsidan av fönster/ytterdörr) ger
  ROT i småhus men **inte** för en BRF-medlem — bara invändigt.
- **VVS:** stambyte, flytta/byta avloppsrör, flytta golvbrunn och avloppsrensning
  ger ROT i småhus men **inte** i bostadsrätt.
- **El:** proppskåp och spotlights ger ROT i båda, men "dra el i trädgården" i ingen.

**Konsekvens för produkten:** vi har `invoice.rot_property_type` men den används
i dag *bara* för att avgöra vilka fält Skatteverkets XML kräver (BRF-org.nr +
lägenhetsnummer), se `lib/skv/validate-rot-request.ts:180-184`. Ingenstans avgör
den *om arbetet alls är ROT-berättigat*. En BRF-kund med fasadmålning eller
stambyte markerat som ROT är ett skattefel vi inte fångar i dag. Kandidat för
steg 3 (branschpaketen bär ROT-regeln per jobbtyp × bostadstyp).

### 2. "Service" och "felsökning" ger inte ROT — men firmorna säljer dem
Skatteverket: *"servicearbeten, kontroll och översyn"* och *"enbart felsöka"* ger
inte ROT. Ändå är VVS-service, elservice och felsökning bland de vanligaste
tjänsterna på firmornas egna sidor. Reparationen som följer ger ROT — själva
felsökningen gör det inte. Agenten som föreslår ROT på ett servicejobb får firman
att göra fel mot Skatteverket.

### 3. Grön teknik är snävare än man tror
Bara solceller (15 %), batterilagring (50 %) och laddningspunkt (50 %) är grön
teknik. **Värmepump och solvärme är ROT med schablon**, inte grön teknik:
luftvärmepump 30 %, vätska-vatten/bergvärme och fjärrvärme 35 %, solvärme 30 % av
totalkostnaden räknas som arbete — och schablonen får inte användas i bostadsrätt.
Reparation av laddbox eller batterilager ger varken ROT eller grön teknik.

### 4. Gränsen ombyggnad/nybyggnad är en 75-procentsregel
Tillbyggnad av bostadshus, förråd, garage, carport eller gäststuga ger ROT bara
om **minst 75 % av en sida sitter ihop med befintlig yttervägg** — annars är det
en ny fristående byggnad och ger ingen ROT alls (källa: Skatteverket via
[snickeri.md](snickeri.md)). Samma logik återkommer: altan/balkong ger ROT när
den är ihopbyggd med huset, fristående trädäck och pooldäck ger inte. Och
**platsbyggda fasta möbler** ger ROT medan fristående möbler inte gör det.

Detta är en regel en agent kan tillämpa — men bara om den vet om bygget sitter
ihop med huset. Kandidat för en fråga i offertflödet, inte en gissning.

### 5. Staket, plank och mur ger aldrig ROT
Bekräftat i tre separata skrivningar hos Skatteverket (bygga, reparera/underhålla,
samt gräv- och markarbete för dem). Återkommer i både snickeri och måleri
("måla staket eller murar" ger inte ROT). Vanligt jobb, konsekvent nej.

### 6. Tredje kategorin: arbeten som ger VARKEN ROT eller RUT
Trädgårdsarbete är RUT, inte ROT — men bara *underhållet* (klippa gräs och häckar,
kratta löv, rensa ogräs, röja sly, fälla och beskära träd). **Nyanläggning av tomt**
— plantera, asfaltera, lägga sten eller plattor, anlägga gräsmatta — ger **varken
ROT eller RUT**, oavsett om det säljs som trädgårdsjobb eller ingår i en
markentreprenad (källa: Skatteverket via [mark.md](mark.md)).

Det betyder att en jobbtyp kan hamna i tre lägen, inte två. En agent som bara
frågar "är det ROT?" ställer fel fråga.

### 7. ROT och RUT kan ligga i samma jobb — snöskottning vs taktvätt
Skatteverket, ordagrant (via [tak.md](tak.md)):
- **Snöskottning från tak = RUT.** *"Rutavdrag ges för att skotta snö på uppfarter,
  hus- och garagetak samt gårdsplaner"* samt *"ta bort istappar"*.
- **Taktvätt och mossbekämpning på tak = ROT.** *"rensa ogräs och bekämpa mossa.
  Att rengöra tak och hängrännor ger däremot rätt till rotavdrag."* Bekräftat från
  ROT-hållet: *"rengöra altandäck, fasader, tak, takpannor, hängrännor och solceller"*.

En takfirma som säljer ett "vinterpaket" (skotta snö + tvätta tak) blandar alltså
en RUT-tjänst och en ROT-tjänst i samma jobb. De måste särredovisas på fakturan,
inte slås ihop till en rad. Det är en regel offert- och fakturaagenten kan bära.

### 8. "Möbelmontering" är inte ett entydigt RUT-svar
Skatteverket skiljer **lösa möbler och lösöre (RUT)** från **platsbyggda fasta
möbler, exempelvis garderober och bokhyllor (ROT)**. Samma hantverkare, samma
timme, olika avdrag — det avgörs av om möbeln byggs fast. Återkommer i både
[allround.md](allround.md) och [snickeri.md](snickeri.md).

Samma fil hittade också en fälla: **bortforsling av trädgårdsavfall ger inte RUT**
— bara ihopsamlandet gör det. Flera firmor säljer ändå "bortforsling" rakt av.

## Sammanställning (2026-09-02, alla tio utkast klara)

| Fil | Källor | Rader | ROT | RUT | ROT* | Nej | ? |
|---|---|---|---|---|---|---|---|
| vvs | 16 | 30 | 13 | – | 10 | 1 | 3 |
| el | 11 | 27 | 7 | – | 8 | 3 | 4 |
| mark | 15 | 18 | 4 | 2 | 1 | 6 | 5 |
| maleri | 11 | 15 | 6 | – | – | 2 | 2 |
| bygg | 13 | 14 | 5 | – | 4 | 1 | 1 |
| ventilation | 13 | 14 | 7 | – | 1 | 5 | 1 |
| snickeri | 9 | 13 | 7 | – | 7 | 1 | – |
| tak | 12 | 11 | 4 | – | 2 | – | 2 |
| allround | 8 | 11 | 1 | 5 | – | – | 2 |
| totalentreprenad | 9 | 6 | 2 | – | 2 | 1 | 1 |
| **Summa** | **117** | **159** | **56** | **7** | **35** | **20** | **21** |

Raderna omfattar startpaket + tillägg. **56 rader har ett ROT-svar direkt ur
Skatteverkets egen text**; 35 är `ROT*` (rimligt men inte ordagrant) och 21 är
`?` — tillsammans 56 rader som behöver ett mänskligt ja/nej. De 20 `Nej` är de
mest värdefulla: det är där en agent annars hade föreslagit ett skattefel.

Fyra sidor gick inte att hämta ordagrant och är flaggade i respektive fil i
stället för att presenteras som belagda: Boverket (JS-renderad — bygglov, marklov,
OVK), Naturvårdsverkets certifieringssida, samt enskilda firmor med 403/timeout.

## Öppna beslut för Andreas

1. **Ta bort jobbtyper** — listorna är medvetet breda; vilka ska inte med?
2. **ROT/RUT-raderna märkta `ROT*` och `?`** — de behöver ett ja/nej som bara du
   eller Skatteverkets fullständiga vägledning kan ge.
3. **Startpaketets storlek** — ska ett nytt konto få alla ≥3-källor-rader, eller
   ett mindre default med resten som tillval?
4. **Namnen** — säger en elektriker "elrenovering" eller "omdragning"?
5. **Mark/Totalentreprenad/Allround** — behåll, ärv eller ta bort ur onboardingen.
