# Bransch: Mark (groundworks) — källbelagda jobbtyper

**Status: OGRANSKAD — väntar på Andreas fackgranskning.**
Inget i den här filen seedas till konton förrän statusen är ändrad till GRANSKAD.

Syfte: startpaketet med jobbtyper som ett nytt markföretag får vid onboarding, plus
de branschfakta systemprompten för Mark ska bära (steg 3). Regeln från Andreas:
*"i verkligheten relevant, inte vad du som AI fantiserar ihop"* — varje rad har
därför minst en namngiven källa vars sida faktiskt hämtats, och rader med bara
en källa är markerade separat.

Bakgrund: Mark är valbar i onboarding men har idag noll innehåll i biblioteken
och noll kunder. Den här filen är underlaget för beslutet att behålla eller
ta bort branschen — se bedömningen i slutet av filen.

## Källor

Hierarki: (a) myndighet/branschorganisation → (b) Skatteverkets ROT/RUT →
(c) riktiga firmors tjänstelistor/marknadsplatser → (d) fackgranskning
(Andreas/Christoffer, inte gjord än).

| Kod | Källa | Typ |
|---|---|---|
| ME | [Maskinentreprenörerna — Det här är ME](https://www.me.se/om-me/det-har-ar-me/) | a |
| KLKA | [Karlskoga kommun — Om marklov, schaktning och fyllning](https://www.karlskoga.se/bygga-bo--miljo/bygga-nytt-andra-eller-riva/bygglovsguide/marklov---schaktning-och-fyllning/om-marklov---schaktning-och-fyllning.html) | a (kommunal tillämpning av PBL) |
| BOV | [Boverket — Marklov inom detaljplan](https://www.boverket.se/sv/PBL-kunskapsbanken/lov--byggande/anmalningsplikt/marklov/) | a (sidan är JS-renderad, gick inte att citera ordagrant — se anm. under KLKA) |
| HAV | [Havs- och vattenmyndigheten — Beslut, vägledning för prövning av små avlopp](https://www.havochvatten.se/avlopp-och-dricksvatten/sma-avloppsanlaggningar/vagledningar-for-provning-och-tillsyn-av-sma-avlopp/vagledning-for-provning-av-sma-avlopp/beslut.html) | a |
| SVV | [Svenskt Vatten — Dagvatten](https://www.svensktvatten.se/vara-sakomraden/klimat-och-hallbarhet/dagvatten/) | a (tunt underlag, ingen ordagrann jobbtypstext hittad — se anm.) |
| SKV-ROT | [Skatteverket — Ger arbetet rätt till rotavdrag? (avsnitt Gräv- och markarbete)](https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut/gerarbetetratttillrotavdrag.4.5c1163881590be297b5173bf.html) | b |
| SKV-RUT | [Skatteverket — Ger arbetet rätt till rutavdrag? (avsnitt Trädgårdsarbete)](https://www.skatteverket.se/privat/fastigheterochbostad/rotochrutarbete/rutarbeten.106.5c1163881590be297b53de7.html) | b |
| NIB | [Niback Entreprenad, Stockholm](https://niback.se/) | c |
| DRST | [Gräv & Dränering Stockholm AB](https://dranering-stockholm.se/) | c |
| PESAB | [PESAB Entreprenad AB, Stockholm](https://www.pesabent.se/) | c |
| TOTALMARK | [Totalmark Entreprenad Stockholm AB](https://www.markarbetenistockholm.nu/) | c |
| SMARK | [Stockholm Markarbete (Södermalm)](https://stockholm-markarbete.se/) | c |
| AVF | [Avloppsfirman](https://avloppsfirma.se/) | c |
| BSS | [Borrspecialisten i Stockholm — privatkunder](https://bssab.com/privatkunder) | c |
| OFF | [Offerta.se — Tomt och markarbeten (kategorisida)](https://offerta.se/tomt-och-markarbeten) | c (marknadsplats, visar efterfrågekategorier) |

Firmorna är sex-och-sju lokala mark-/gräv-/dränerings-/avloppsföretag i
Stockholmsområdet plus en specialiserad borrfirma; Offerta visar vad *kunder*
efterfrågar via sina underkategorier. rbentreprenad.se gav HTTP 403 vid
hämtning och kunde inte användas som källa.

## Föreslaget startpaket (≥3 källor)

ROT-kolumnen: **ROT** = Skatteverket listar arbetet uttryckligen; **ROT*** = ger ROT
bara under ett angivet villkor (se Anm.); **RUT** = Skatteverket räknar det som
rutarbete, inte rotarbete; **Nej** = Skatteverket säger uttryckligen nej;
**?** = inte utrett / beror på sammanhang som inte går att avgöra utan
fackbedömning.

| # | Jobbtyp (förslag på namn) | Källor | ROT/RUT | Anm. |
|---|---|---|---|---|
| 1 | Dränering av husgrund | SKV-ROT, NIB, DRST, TOTALMARK, SMARK | ROT | SKV ordagrant: "dränera husgrunder" |
| 2 | Enskilt avlopp / avloppsanläggning (infiltration, markbädd, minireningsverk, trekammarbrunn) | SKV-ROT, HAV, AVF, DRST, PESAB, SMARK | ROT | SKV: "göra markarbeten för avlopp, till exempel infiltrationsanläggningar eller infiltrationsbäddar" + "...avloppsbrunnar, till exempel trekammarbrunnar"; HAV: tillstånd/anmälan hos kommunen krävs INNAN arbetet påbörjas |
| 3 | Borrning för bergvärme / brunn | SKV-ROT, BSS, OFF, DRST | ROT | SKV: "göra markarbeten för värmeförsörjning"; schablon 35 % av entreprenadpriset för fastprisuppdrag ("Schablonen för arbetskostnad vid borrning är satt till 35 procent") — samma schablon oavsett om det är bergvärme- eller vattenborrning |
| 4 | Sprängning/bergspräckning vid tillbyggnad | SKV-ROT, DRST, SMARK, TOTALMARK | ROT* | SKV: "göra sprängarbete som krävs för att bygga en utbyggnad och återställa mark till ursprungligt skick" — gäller uttryckligen bara i samband med tillbyggnad (inom sex månader), inte fristående sprängning |
| 5 | Schaktarbete / markutjämning (allmänt) | DRST, NIB, TOTALMARK, OFF | ? | ROT beror på syfte — schakt för avlopp/dränering/värmeborrning (rad 1-3) ger ROT, allmän schakt/utjämning är inte utrett separat hos SKV |
| 6 | Poolschakt / grävning för pool | SKV-ROT, NIB, DRST, SMARK, TOTALMARK | Nej | SKV uttryckligen: "gräva för att anlägga en pool" ger inte ROT |
| 7 | Stenläggning / plattsättning (uppfart, gångar, uteplats) | SKV-ROT, NIB, DRST, TOTALMARK, SMARK, OFF | Nej | SKV: "asfaltera, lägga sten eller plattor samt anlägga uppfarter, gräsmattor och trädgårdsgångar" |
| 8 | Asfaltering (uppfart, gårdsplan) | SKV-ROT, TOTALMARK, SMARK, OFF, PESAB | Nej | samma SKV-formulering som rad 7 |
| 9 | Staket och murar (inkl. stödmur) | SKV-ROT, DRST, TOTALMARK, OFF | Nej | SKV ordagrant: "bygga staket och murar" |
| 10 | Trädgårdsanläggning / nyanläggning av tomt | SKV-ROT, SKV-RUT, TOTALMARK, SMARK, NIB, OFF | Nej | ger varken ROT eller RUT — SKV-ROT: "anlägga gräsmattor och trädgårdsgångar"; SKV-RUT: "plantera eller omplantera blommor, växter och träd" och "asfaltera, lägga sten och plattor samt anlägga gräsmattor" ger inte heller rutavdrag |
| 11 | Husgrund / platta på mark (nybygge) | SMARK, DRST, OFF, NIB | ? | SKV nämner grund/platta bara i kombination med sprängarbete vid *tillbyggnad* (rad 4); ROT-status för en helt ny grund vid nybygge är inte utredd — sannolikt Nej eftersom ROT gäller befintlig bostad, men inte verifierat ordagrant |
| 12 | Rörinspektion, relining, byte av avloppsrör/stammar (mark-/schaktdelen) | AVF, DRST, SMARK | ? | gränsland mark/VVS; ROT-status inte utredd separat |
| 13 | Snöröjning och halkbekämpning | NIB, PESAB, SMARK | Nej | löpande fastighetsservice, inte renovering — SKV:s ROT-lista tar inte upp snöröjning alls; flagga för Andreas om detta ens hör hemma i samma jobbtypslista som byggarbete |

## Valbara tillägg (2 källor — med i biblioteket, inte i startpaketet)

| # | Jobbtyp | Källor | ROT/RUT | Anm. |
|---|---|---|---|---|
| 14 | Markarbete för bredband/fiber/elledningar (kanalisation) | SKV-ROT, ME | ROT | SKV: "göra markarbeten för ledningar av elektronisk kommunikation, till exempel bredband och fiber"; ME bekräftar att markentreprenörer "gräver ner bredband" som del av branschens kärnverksamhet, men ingen av de sju granskade firmorna säljer det som egen namngiven tjänst |
| 15 | Altanbygge (mark-/grävdel) | NIB, SMARK | ? | SKV ger uttryckligen ROT för "gräv-, mark- och sprängarbete för att bygga en altan" — men bara i avsnittet om **ägarlägenhet**; oklart om samma formulering gäller villa/småhus, inte verifierat |
| 16 | Specialgrundläggning (pålning, grundförstärkning, vajersågning, jordborrning) | BSS, DRST | ? | nischat, ROT-status inte utredd |
| 17 | Trädgårdsskötsel (gräsklippning, häckklippning, ogräsrensning, röjning) | OFF, SKV-RUT | RUT | SKV: "klippa gräs, häckar, rosor och buskar", "rensa ogräs och bekämpa mossa", "röja sly, vass och tång på tomten" — rutarbete, INTE rotarbete |
| 18 | Trädfällning och beskärning | OFF, SKV-RUT | RUT | SKV: "fälla och beskära träd", "stubbfräsning eller annat arbete för att ta bort stubbar" — rutarbete |

## En källa — INTE med förrän någon bekräftar

| Jobbtyp | Källa | Varför tveksam |
|---|---|---|
| Dagvattensystem (som egen tjänst, utöver avlopp) | DRST | en firma säljer det separat ("Dagvattensystem och infiltration"); kan vara en underrad till "Enskilt avlopp" (rad 2) snarare än egen jobbtyp |
| Fuktisolering / grundisolering av källare | DRST | en firma har exakt den formuleringen; NIB har "fuktskydd" men det är inte samma ord och kan syfta på själva dräneringen |
| Vattenrening, fettavskiljare/oljeavskiljare, LTA, pumpstation | AVF | en firma, nischade VA-tjänster som ligger i kanten av vad en typisk markfirma säljer |
| Lekplatser och allmänningsområden | DRST | en firma, större entreprenad snarare än småfirmans vardagsjobb |
| Rivning av betonggrund | DRST | en firma |

## Branschfakta för systemprompten (steg 3 — inte byggt)

Detta är sådant agenten ska *veta*, hämtat ur (a)- och (b)-källorna, inte ur firmorna:

- **ROT ges för markarbete kopplat till:** dränering av husgrund, avloppsanläggning
  (infiltration, markbädd, ledningar och brunnar), värmeförsörjning/bergvärme- och
  vattenborrning (schablon 35 % av entreprenadpriset vid fastprisuppdrag), samt
  sprängarbete och markåterställning som krävs för en tillbyggnad (inom sex
  månader efter grävningen).
- **ROT ges INTE för (SKV, ordagrant):** "asfaltera, lägga sten eller plattor samt
  anlägga uppfarter, gräsmattor och trädgårdsgångar", "bygga staket och murar",
  "gräva för att anlägga en pool", maskinell utrustning (grävmaskiner,
  borraggregat) och sprängbesiktning.
- **Bostadsrätt:** bara "gräv-, mark- och sprängarbete som krävs för att husgrunden
  ska kunna byggas ut" ger ROT — alla andra markarbeten (ledningar för värme,
  vatten, avlopp, el och elektronisk kommunikation på tomten) ger INTE ROT för
  en BRF-medlem, oavsett vad de ger för ett småhus.
- **Ägarlägenhet:** bara altanbygge (gräv-, mark- och sprängarbete för att bygga
  en altan) ger ROT. Övriga markarbeten ger ingen ROT alls för ägarlägenhet.
- **ROT-gränsen mot trädgård:** trädgårdsarbete faller normalt under **RUT**, inte
  ROT, och bara underhåll ger rutavdrag — klippa gräs/häckar, kratta löv,
  rensa ogräs, röja sly, fälla/beskära träd, kompostera. **Nyanläggning av tomt**
  (plantera/omplantera blommor, växter och träd; asfaltera, lägga sten/plattor
  eller anlägga gräsmattor) ger **varken ROT eller RUT** — det gäller både när
  det görs som fristående trädgårdsjobb och när det ingår i en markentreprenad.
- **Marklov:** enligt kommunal tillämpning av plan- och bygglagen (Karlskoga
  kommuns bygglovsguide) krävs marklov om schaktning eller fyllning ändrar
  markens höjdläge mer än 0,5 meter inom detaljplanerat område. Boverkets egen
  sida om marklov gick inte att hämta ordagrant (JS-renderad), så denna
  formulering bör dubbelkollas mot Boverkets originaltext innan den låses fast.
- **Enskilt avlopp — tillstånd innan start:** Havs- och vattenmyndigheten är
  tydlig med att ett avloppstillstånd "får inte tas i anspråk förrän det har
  vunnit laga kraft" — arbetet får alltså inte påbörjas innan kommunens beslut
  vunnit laga kraft (normalt tre veckor efter att berörda fått ta del av
  beslutet, om ingen överklagar). För anmälningspliktiga (inte
  tillståndspliktiga) anläggningar finns ingen formell skyldighet att invänta
  beslutet, men det rekommenderas i praktiken.
- **SKV:s kategorikod:** enligt Andreas heter Skatteverkets ROT-kategorikod för
  mark "MarkDraneringarbete" — det är en systemuppgift, inte något jag hittat
  ordagrant på en offentlig SKV-sida under den här researchen, så den bör
  verifieras separat innan den används i en prompt som ett källbelagt påstående.

## Vad som ännu INTE är gjort

- Fackgranskning av jobbtypsnamnen (är "Schaktarbete / markutjämning" ett namn
  en markentreprenör själv skulle använda?).
- ROT-status på raderna märkta `?` (husgrund vid nybygge, allmän schakt,
  rörinspektion/relining, altanbygge för villa, specialgrundläggning) — kräver
  Skatteverkets fullständiga lista eller Andreas bedömning, inte min gissning.
- Boverkets marklovssida kunde inte hämtas ordagrant (JS-renderad) — nuvarande
  formulering vilar på en kommuns tillämpning (Karlskoga), inte Boverkets
  originaltext. Bör verifieras.
- Svenskt Vatten gav inget konkret, citerbart underlag om jobbtyper eller
  fastighetsägarens ansvar för dagvatten/dränering — källan är med men är svag.
- Ingen kommunspecifik koll av hur marklov/enskilt avlopp hanteras i praktiken
  (reglerna kan variera mellan kommuner).
- Ingen kod, ingen seed. Se `tasks/todo.md` → Branschförståelse.

## Bedömning: finns det underlag nog att behålla Mark?

Ja — och underlaget är om något **fylligare** än för El. Skatteverkets ROT-sida
har ett eget avsnitt "Gräv- och markarbete" med sju ordagranna positiva punkter
och fem ordagranna negativa punkter, vilket gav en ovanligt skarp ROT-gräns att
bygga jobbtyper kring (särskilt gränsen mot trädgårdsarbete, som annars är den
vanligaste källan till fel ROT-antaganden i branschen). Sju av åtta granskade
markfirmor gick att hämta med tydliga, överlappande tjänstelistor (dränering,
enskilt avlopp, bergvärmeborrning, schakt, stenläggning, asfaltering, murar,
trädgård, pool), vilket gav 13 rader i startpaketet mot El:s 18 — en mindre men
fullt rimlig bransch att seeda, inte en tom kategori. Svagheten ligger i
myndighetssidan om marklov (Boverket gick inte att citera direkt) och i att
flera vardagliga jobbtyper (husgrund vid nybygge, rörinspektion, snöröjning)
saknar en fastställd ROT-status — det är ett granskningsjobb, inte ett tecken
på att branschen saknar verkligt underlag. Rekommendation: behåll Mark, men
lås inte statusen till GRANSKAD förrän Andreas tagit ställning till `?`-raderna
och Boverket-citatet är verifierat mot originalsidan.
