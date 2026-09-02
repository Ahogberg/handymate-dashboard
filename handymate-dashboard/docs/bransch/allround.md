# Bransch: Allround (other) — källbelagda jobbtyper

**Status: OGRANSKAD — väntar på Andreas fackgranskning.**
Inget i den här filen seedas till konton förrän statusen är ändrad till GRANSKAD.

Syfte: samma övning som `el.md`, men för ett specialfall. Regeln från Andreas:
*"i verkligheten relevant, inte vad du som AI fantiserar ihop"* — varje rad har
därför minst en namngiven källa, och rader med bara en källa är markerade.

## Varför det här är ett specialfall, inte ett hantverk

`other` (etikett "Allround", `lib/branch/index.ts`) är den gamla default-branschen
för alla konton som aldrig valde något annat (`'hantverkare'` = allround-alias på
varenda befintligt konto). Det är en samlingskategori för firmor som gör "lite av
varje" — inte ett hantverk med egna verktyg och egen auktorisation som El eller VVS.
Se avsnittet **"Ska den här branschen ha en egen jobbtypslista?"** för slutsatsen.

## Källor

Hierarki: (a+b) Skatteverkets ROT/RUT → (c) riktiga firmors tjänstelistor och
fastprismarknader.

| Kod | Källa | Typ |
|---|---|---|
| SKV-ROT | [Skatteverket — Ger arbetet rätt till rotavdrag?](https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut/gerarbetetratttillrotavdrag.4.5c1163881590be297b5173bf.html) | a+b |
| SKV-RUT | [Skatteverket — Ger arbetet rätt till rutavdrag?](https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut/gerarbetetratttillrutavdrag.4.2ef18e6a125660db8b080001531.html) | a+b |
| SKV-FTG | [Skatteverket — Så fungerar rotavdraget för företag](https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut/safungerarrotavdraget.4.2ef18e6a125660db8b080002709.html) | a+b |
| BHM | [Bokahandyman.se — Handyman](https://bokahandyman.se/handyman) | c |
| CF | [Clas Fixare](https://www.clasfixare.se/) | c |
| HND | [Händig Stockholm — Hantverkstjänster](https://handigsthlm.se/hantverkstjanster/) | c |
| HFX | [Hemfixarna — Bygg/El/VVS/Allround-Småjobb](https://hemfixarna.se/storre-byggjobb/) | c (marknadsplats/aggregator, egen "Allround/Småjobb"-kategori) |
| DRY | [Dryft — mindre jobb eller småfix](https://dryft.se/) | c (fastprismarknad) |

**Bortfall (försökt, gav ingen citerbar text):** Veteranpoolens fixartjänst-sida
gav HTTP 403 (blockerad). Offerta.se:s "övriga tjänster"-sida innehöll ingen
namngiven kategori för hemfixare/småjobb — bara en fritextruta för sådant som
"inte finns bland kategorierna". Ingen av dem används därför som källa, trots att
uppdraget nämnde båda.

## Ska den här branschen ha en egen jobbtypslista?

**Slutsats: en kort lista med faktiskt namngivna, bokningsbara småjobb — men
INTE ett försök att räkna upp varje tänkbar mikrouppgift, och stora jobb ska
ärvas från andra branscher.** Motivering:

1. **Firmorna själva namnger bara en handfull konkreta tjänster.** Clas Fixare
   och Bokahandyman.se listar specifika, bokningsbara rader (montera hylla,
   montera TV, snöskottning) med fasta priser — det är riktiga jobbtyper, inte
   påhitt. Men "dörrjustering" och "tätningslister", som nämns explicit i
   Skatteverkets ROT-text, såldes av **ingen** av de fem undersökta firmorna som
   en egen namngiven tjänst — de ingår i vad firmorna kallar generiska
   "fixartjänster"/"handyman" och prissätts per timme (Bokahandyman: *"Startpaket
   1 299 kr inkl. moms & RUT = 2 h arbete på plats"*), inte per uppgift. Att
   uppfinna en egen rad för varje SKV-exempel vore precis det påhittande Andreas
   varnade för.
2. **Fastprismarknaden Dryft visar var gränsen faktiskt går.** Dryft delar själva
   upp sitt utbud i "Större renoveringar" (badrum, kök, fasad) och "Mindre jobb
   eller småfix" — och den senare kategorin listas som just El/Rörmokare/
   Plattsättare/Målare/Snickare, inte som egna "allround-tjänster". Även
   fastprismarknaden behandlar alltså "allround" som en ingång till specifika
   hantverk för större jobb, inte som ett eget hantverk.
3. **Konsekvens:** Allround-kontots startpaket bör vara de småjobb som verkligen
   säljs som namngivna rader (möbelmontering, hyllor/gardiner/tavlor, snöskottning,
   trädgårdsklippning, vitvarureparation) — och när en allround-firma tar större
   jobb (badrumsrenovering, elarbete) bör den, precis som `general_contractor`,
   kunna lägga till El/VVS/Snickeri/Bygg som sekundära branscher
   (`secondary_branches` i `lib/branch/index.ts`) i stället för att Allround får
   en egen dubblettlista av samma jobbtyper.

## Föreslaget startpaket (≥3 källor)

ROT/RUT-kolumnen: **ROT** / **RUT** = Skatteverket listar arbetet uttryckligen
under respektive avdrag; **RUT*** = följer av SKV:s formulering men gränsdragningen
kräver granskning; **Nej** = Skatteverket säger uttryckligen nej; **?** = inte utrett.

| # | Jobbtyp (förslag på namn) | Källor | ROT/RUT | Anm. |
|---|---|---|---|---|
| 1 | Möbelmontering (lösa/fristående möbler: säng, soffa, byrå, garderob, skrivbord) | SKV-RUT, BHM, CF, HFX | RUT | SKV-RUT ordagrant: "förflytta, montera och demontera möbler och lösöre" — gäller endast **fristående** möbler, se rad 9 för fasta/inbyggda |
| 2 | Uppsättning av gardiner, gardinstänger och rullgardiner | SKV-RUT, HND, CF | RUT | SKV-RUT ordagrant: "sätta upp och ta ner gardiner samt montera gardinstänger och rullgardiner" |
| 3 | Reparation av vitvaror i bostaden (tvättmaskin, torktumlare, diskmaskin) | SKV-RUT, HFX | RUT | gäller reparation, inte nyinstallation; måste ske "i bostaden eller biutrymmen som tillhör bostaden" (SKV-RUT) |
| 4 | Snöskottning (uppfart, tak, gårdsplan) | SKV-RUT, BHM | RUT | SKV-RUT ordagrant: "skotta snö på uppfarter, hus- och garagetak samt gårdsplaner" |
| 5 | Trädgårdsskötsel (gräsklippning, häck-/buskklippning, ogräsrensning) | SKV-RUT, BHM | RUT | SKV-RUT ordagrant: "klippa gräs, häckar, rosor och buskar" och "rensa ogräs och bekämpa mossa" |

Bara fem rader når startpaketets ≥3-källortröskel — det bekräftar slutsatsen ovan:
allround-firmornas namngivna utbud är smalt, resten är generiska "fixartjänster".

## Valbara tillägg (2 källor — med i biblioteket, inte i startpaketet)

| # | Jobbtyp | Källor | ROT/RUT | Anm. |
|---|---|---|---|---|
| 6 | Montering av hylla på vägg (ej inbyggd) | BHM, CF | RUT* | gråzon: SKV-RUT skiljer på lösa "möbler och lösöre" (RUT) och "platsbyggda fasta möbler, exempelvis garderober och bokhyllor" (ROT, SKV-ROT). En enstaka vägghylla nämns inte uttryckligen av Skatteverket i något av de citat vi fått — granska innan den hamnar i en prompt |
| 7 | Tavelupphängning | CF, HND | RUT* | sannolikt del av SKV-RUT:s möbleringsarbete, men ingen exakt citerad formulering nämner just tavlor |
| 8 | TV-montering på vägg | BHM, CF | ? | oklart om detta räknas som RUT-möblering eller om elinstallationsmoment (kabeldragning) gör att det istället är ROT — inte utrett mot SKV |
| 9 | Montering av köksluckor/fronter (byte, ej nyinstallation) | CF, SKV-ROT | ROT | SKV-ROT ordagrant (småhus): "byta och reparera köksluckor, dörrar, dörrlås, dörrhandtag och fönsterbleck" — **detta är ROT, inte RUT**, trots att det säljs av en "fixarfirma" |
| 10 | Bärhjälp och bortforsling (möbler, avfall, trädgårdsavfall) | BHM, SKV-RUT | Nej* | viktig fälla: SKV-RUT säger uttryckligen att "forsla bort trädgårdsavfall" INTE ger RUT — bara att "samla ihop trädgårdsavfall inför bortforsling" gör det. Bokahandyman säljer ändå "Bortforsling av trädgårdsavfall" som tjänst; det får bara vara RUT-berättigat för själva ihopsamlandet |
| 11 | Teknikhjälp (installera router/skrivare, smarta lås) | CF, HFX | ? | inte adresserat av Skatteverket i något citat vi fått — sannolikt varken ROT eller RUT (rent IT-arbete), men inte verifierat |

## En källa — INTE med förrän någon bekräftar

| Jobbtyp | Källa | Varför tveksam |
|---|---|---|
| Dörrjustering (gångjärn, lås, handtag) | SKV-ROT | Skatteverket nämner det ordagrant ("byta och reparera... dörrlås, dörrhandtag") och det är **ROT**, men ingen av de fem undersökta allround-firmorna säljer det som en egen namngiven tjänst — se resonemanget ovan om varför |
| Tätningslister (fönster/dörr) | SKV-ROT | samma sak: finns i Skatteverkets exempeltext (för bostadsrätt, insida av fönster) men ingen firma säljer det som egen rad |
| Golvläggning | BHM, HND (2 källor, men flyttad ur listan) | hör hemma i en framtida Golv-branschfil (`flooring`), inte allround — samma dubblett-resonemang som i `totalentreprenad.md` |
| Byte av batteri i brandvarnare, uppsättning av brandvarnare | CF | en firma; troligen för litet för en egen jobbtyp |
| Montering av kattnät, studsmatta | CF | en firma; nisch |

## Branschfakta för systemprompten (steg 3 — inte byggt)

Detta är sådant agenten ska *veta*, hämtat ur SKV-källorna:

- **RUT-nivå:** 50 procent av arbetskostnaden ("Det är 50 procent av
  arbetskostnaden som ger rätt till rutavdrag" — SKV-RUT). ROT-nivå: högst 30
  procent av arbetskostnaden (SKV-FTG, ordagrant: "du får dra av högst 30
  procent"). Material, resor, utrustning och administration ger varken ROT
  eller RUT.
- **Kärngränsen ROT/RUT (SKV-ROT + SKV-RUT):** RUT gäller hushållsnära arbete —
  lösa möbler, gardiner, städning, trädgårdsklippning, snöskottning. ROT gäller
  ombyggnad/reparation av själva byggnaden — dörrar, fönster, fast/inbyggd
  inredning, köksluckor. En och samma sysselsättning (t.ex. "montera hylla")
  kan hamna på olika sida beroende på om det är en lös möbel eller något som
  byggs fast — Skatteverket skiljer uttryckligen "möbler och lösöre" (RUT) från
  "platsbyggda fasta möbler" (ROT).
- **Flyttstädning är RUT, grovstäd efter bygge är ROT (SKV-RUT).** Ordagrant:
  reparation/installation av larm, fläktar och ventilationsutrustning räknas
  som ROT, inte RUT — trots att en fixarfirma ofta säljer det i samma andetag
  som möbelmontering.
- **Bortforsling-fällan (SKV-RUT):** att köra bort trädgårdsavfall ger inte RUT;
  bara själva ihopsamlandet gör det. Viktigt att inte överlova RUT på hela
  "bortforsling"-raden i en offert eller i en AI-genererad tjänstebeskrivning.
- **Nybyggnation ger aldrig ROT (SKV-ROT):** gäller lika mycket för en
  allround-firma som bygger ett komplementhus som för en totalentreprenör.

## Vad som ännu INTE är gjort

- Fackgranskning av gråzonsraderna (6–8, 11) — flera är markerade `?` eller
  `RUT*` för att Skatteverkets citerade text inte var entydig; det är en gissning
  markerad som sådan, inte ett faktapåstående.
- Veteranpoolen (403) och Offerta.se (ingen kategori-detalj) kunde inte
  användas som källor trots att uppdraget bad om dem — om Andreas har annan
  åtkomst till dem bör de läggas till och gråzonsraderna räknas om.
- Ingen kod, ingen seed. Detta är enbart en researchfil.
