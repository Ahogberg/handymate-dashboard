# Bransch: Bygg (construction) — källbelagda jobbtyper

**Status: OGRANSKAD — väntar på Andreas fackgranskning.**
Inget i den här filen seedas till konton förrän statusen är ändrad till GRANSKAD.

Syfte: startpaketet med jobbtyper som ett nytt byggföretag får vid onboarding, plus
de branschfakta systemprompten för Bygg ska bära (steg 3). Regeln från Andreas:
*"i verkligheten relevant, inte vad du som AI fantiserar ihop"* — varje rad har
därför minst en namngiven källa, och rader med bara en källa är markerade.

**Gränsdragning mot andra branschfiler:** Bygg överlappar med Snickeri, Måleri och
Tak, som får egna filer. Den här filen tar bara med det en byggfirma säljer som
*egen kärntjänst* (renovering, stomme, mur/puts, betong, tillbyggnad, rivning,
våtrum) — se "Vad som ännu INTE är gjort" för exakt vilka rader som hör hemma i
en annan bransch.

## Källor

Hierarki: (a) myndighet/branschorganisation → (b) Skatteverkets ROT → (c) riktiga
firmors tjänstelistor + marknadsplatser → (d) fackgranskning (Andreas/Christoffer).

| Kod | Källa | Typ |
|---|---|---|
| BF | [Byggföretagen — Om oss](https://byggforetagen.se/om-oss/) | a |
| BOV | [Boverket — Kontrollansvariga (PBL kunskapsbanken)](https://www.boverket.se/sv/PBL-kunskapsbanken/lov--byggande/byggprocessen/kontrollansvariga/) | a |
| BOV-TB | [Boverket — Göra en tillbyggnad utan bygglov](https://www.boverket.se/sv/byggande/bygglov-rivningslov-marklov-och-anmalan/vad-far-jag-bygga-utan-bygglov/gora-en-tillbyggnad/) och [Bygglov för tillbyggnad](https://www.boverket.se/sv/PBL-kunskapsbanken/lov--byggande/anmalningsplikt/byggnader/tillbyggnad/) | a |
| BKR | [Byggkeramikrådet — Om BKR](https://www.bkr.se/om-bkr) | a |
| SKV-ROT | [Skatteverket — Ger arbetet rätt till rotavdrag?](https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut/gerarbetetratttillrotavdrag.4.5c1163881590be297b5173bf.html) | b |
| JOH | [Byggfirma Johanneshov — Ombyggnad, renovering](https://byggfirma-johanneshov.se/tjanster/ombyggnad-renovering-johanneshov-globen-enskede-stockholm/) | c |
| SBF | [Byggfirma Stockholm — tjänster](https://stockholm-byggfirma.se/) | c |
| GRB | [Granbackens i Väst Bygg AB, Göteborg — tjänster](https://www.granbackensbygg.se/tjanster/goteborg/) | c |
| UTBY | [Utby Entreprenad AB, Göteborg](https://utbyentreprenad.se/) | c |
| DUF | [DUFAB HUS AB, Malmö — Byggfirma i Malmö](https://dufab.se/byggfirma-i-malmo/) | c |
| AKB | [Aktiv Bygg i Malmö AB — Tillbyggnad Skåne](https://www.aktivbyggmalmo.se/tillbyggnad-skane/) | c |
| DRY | [Dryft — Byggfirma Stockholm, fasta priser](https://dryft.se/byggfirma-stockholm/) | c (fastprismarknad) |
| OFF | [Offerta — Bygg och Renovering, kategorilista](https://www.offerta.se/bygg-och-renovering) | c (efterfrågesida/marknadsplats) |

Firmorna (JOH, SBF, GRB, UTBY, DUF, AKB) är hämtade som exempel på hur riktiga
byggfirmor i tre olika städer (Stockholm, Göteborg, Malmö) själva beskriver sitt
utbud. Dryft och Offerta visar vad *kunder* efterfrågar/söker.

**Viktig reservation om Boverket (BOV, BOV-TB):** Boverkets webbplats renderas med
JavaScript och gick inte att hämta ordagrant med WebFetch — verktyget fick bara
navigeringsmenyn, inte artikeltexten. Boverkets sakuppgifter nedan bygger därför på
sökträffar (WebSearch) som citerar Boverkets sidor, inte på ett direkt, ordagrant
sidcitat. Uppgifterna kommer fortfarande från de namngivna Boverket-URL:erna (inte
uppdiktade), men bör verifieras mot sidan i klartext innan de låses som facit.

## Föreslaget startpaket (≥3 källor)

ROT-kolumnen: **ROT** = Skatteverket listar arbetet uttryckligen; **ROT*** = följer
av Skatteverkets formulering men listas inte ordagrant, eller beror på sammanhang
— granska; **Nej** = Skatteverket säger uttryckligen nej (i den vanliga varianten
av jobbet); **?** = inte utrett.

| # | Jobbtyp (förslag på namn) | Källor | ROT/GT | Anm. |
|---|---|---|---|---|
| 1 | Tillbyggnad av bostadshus | SKV-ROT, JOH, SBF, DUF, AKB, OFF | ROT | SKV ordagrant: "göra tillbyggnad av bostadshus, förråd, garage, carport eller gäststuga" |
| 2 | Rivning och ombyggnad av planlösning (invändigt) | SKV-ROT, DRY, JOH, SBF, OFF | ROT | SKV: "riva väggar och bygga om planlösningen i ett hus samt arbeta med tilläggsisolering" |
| 3 | Murning och putsning (fasad, skorsten, murstock) | SKV-ROT, GRB, UTBY | ROT | SKV (småhus): "mura och reparera skorstenar, murstockar, öppna spisar och kakelugnar" + "mura och reparera fasader och entrétrappor"; **gemensam fasad i BRF ger inte ROT** |
| 4 | Betongarbeten / grundarbete (platta, spricklagning, trappor) | GRB, UTBY, SBF | ROT* | GRB: "gjutning av platta, spricklagning av grunder och gjutning av trappor" — beror på syfte: platta till altan/tillbyggnad ger ROT, fristående grundläggning eller dränering av husgrund i BRF ger det inte (SKV: "dränera husgrunder" listas under vad som INTE ger ROT för bostadsrätt) |
| 5 | Badrumsrenovering (våtrum) | SKV-ROT, JOH, SBF, UTBY, DUF, DRY, OFF | ROT | SKV: "sätta kakel och klinker" + installation av toalett/dusch/badkar/handfat; kräver BKR-auktoriserat företag för tätskiktet (se Branschfakta) |
| 6 | Köksrenovering | SKV-ROT, JOH, SBF, UTBY, DUF, DRY, OFF | ROT* | SKV (bostadsrätt): "montera fast köks- och badrumsinredning samt installera vitvaror i samband med byggarbetet" — installationsarbetet ger ROT, inte materialet/vitvarorna i sig |
| 7 | Källarrenovering | JOH, SBF, DRY | ROT* | ingen egen SKV-rad, följer av "slipa och byta golv, tak och väggmaterial" / ombyggnad av planlösning |
| 8 | Fasadrenovering (puts, lagning — ej målning) | SKV-ROT, JOH, OFF | ROT | SKV (småhus): "byta och reparera fasader, hängrännor och takpannor"; **gemensam fasad i BRF/flerbostadshus ger inte ROT** ("arbeta på gemensamma ytor, till exempel tak, fasader") |
| 9 | Altanbygge (trä eller gjuten platta) | SKV-ROT, JOH, SBF, DRY | ROT/Nej | SKV (småhus): "bygga altan och balkong till exempel i trä eller på gjuten platta"; för bostadsrätt/BRF ger det **inte** ROT om altanen inte är ihopbyggd med bostaden, och gräv-/markarbetet för den ger aldrig ROT i BRF |
| 10 | Entrétrappor (reparation/nybyggnad) | SKV-ROT, GRB, JOH | ROT/ROT* | SKV ordagrant för reparation: "reparera och underhålla entrétrappor, balkonger och altaner samt tillhörande räcken"; nybyggnad av trappa är inte lika tydligt uttalad — granska |
| 11 | Garage-/carportbyggnad | JOH, SBF, OFF | ROT*/Nej | endast ROT om den byggs ihop med bostadshuset som tillbyggnad (SKV: "...garage, carport"); **fristående** garage/carport ger inte ROT (SKV: "bygga...ett garage...eller en liknande fristående byggnad") |

## Valbara tillägg (2 källor — med i biblioteket, inte i startpaketet)

| # | Jobbtyp | Källor | ROT/GT | Anm. |
|---|---|---|---|---|
| 12 | Uterum / inglasad veranda | JOH, OFF | ? | kan vara tillbyggnad (ROT) eller "glasa in altan" (ROT), men inte utrett som egen jobbtyp |
| 13 | Stensättning/plattsättning utomhus (gårdsplan, uppfart, gårdsbjälklag) | SBF, JOH | Nej | SKV, uttryckligen under vad som INTE ger ROT: "lägga sten och plattor direkt på mark" |
| 14 | Projektledning / totalentreprenad | DUF, DRY | – | tjänsten i sig ger ingen ROT, men underliggande arbeten kan göra det |

## En källa — INTE med förrän någon bekräftar

| Jobbtyp | Källa | Varför tveksam |
|---|---|---|
| Attefallshus / komplementbyggnad | SBF | en firma; dessutom fristående ny byggnad = SKV säger uttryckligen **Nej** till ROT |
| Fukt- och mögelskador (åtgärd) | SBF | en firma; kan höra till skadesanering snarare än renovering |
| Radonsanering | OFF | marknadsplatskategori, ingen av de granskade firmorna säljer det som egen tjänst |
| Håltagning | OFF | marknadsplatskategori, egen nischtjänst (ofta underentreprenör) |
| Vindsrenovering (inreda kallvind) | OFF | marknadsplatskategori; kan vara tillbyggnad-liknande, inte utrett |
| Hyresgästanpassning / kontorsanpassning | JOH | en firma; rent B2B-jobb, ingen ROT |

## Branschfakta för systemprompten (steg 3 — inte byggt)

Detta är sådant agenten ska *veta*, hämtat ur (a)- och (b)-källorna, inte ur
firmorna. Se reservationen ovan om att BOV/BOV-TB kommer via sökträffar, inte
ett direkt sidcitat.

- **Byggföretagen (BF):** bransch- och arbetsgivarorganisation för "bygg-,
  anläggnings- och specialföretag", ca 4 000 medlemsföretag, med 20
  branschföreningar för specialföretag samlade i ett gemensamt Branschråd.
  Ingen egen auktorisationsplikt som Elsäkerhetsverkets för elektriker — Bygg
  styrs istället av plan- och bygglagens lov-/anmälningsplikt (se nedan).
- **Bygglov krävs** för bl.a. nybyggnad, tillbyggnad över viss storlek och
  fasadändring (BOV, sammanfattning via sökträff — verifiera ordalydelsen).
- **Anmälan (utan bygglov) krävs** bland annat för attefallstillbyggnad på högst
  15,0 kvm för en- och tvåbostadshus (får inte placeras närmare gränsen än 4,5 m
  utan grannens medgivande, inte vara högre än det befintliga husets nock, och
  den sammanlagda attefallsarean får vara max 30 kvm) — start- och slutbesked
  krävs innan arbetet påbörjas/tas i bruk (BOV-TB, via sökträff). **Ändring av
  en byggnads bärande konstruktion är alltid anmälningspliktig**, oavsett hur
  liten ändringen är (BOV, via sökträff).
- **Kontrollansvarig krävs** i de flesta ärenden som kräver bygglov eller
  anmälan. Kontrollansvarig krävs **inte** vid enklare åtgärder — bl.a. åtgärder
  som varken kräver lov eller anmälan, mindre ändringar av en- eller
  tvåbostadshus, uthus/garage och andra små byggnader, samt byte av
  fasadbeklädnad eller taktäckningsmaterial som avsevärt påverkar byggnadens
  yttre utseende (BOV, via sökträff — verifiera ordalydelsen).
- **BKR-auktorisation (våtrum):** för att tätskiktsarbete i våtrum ska uppfylla
  branschreglerna BBV (Byggkeramikrådets Branschregler för Våtrum) ska arbetet
  utföras av ett BKR-auktoriserat företag. Företaget ska ha plattsättning som
  etablerad och löpande verksamhet och ha egen anställd plattsättare, varav
  minst en ska ha yrkesbevis eller minst tre års heltidserfarenhet av
  plattsättning; plattsättaren ska bära ett giltigt foto-ID utfärdat av BKR.
- **ROT ges inte för (SKV, ordagrant/uttryckligen):** att bygga ett helt nytt
  hus, en friggebod, ett garage, ett växthus eller en liknande fristående
  byggnad; att riva ett hus även om det byggs upp ett nytt på den gamla
  stommen; pooldäck, staket och murar samt att lägga sten och plattor direkt på
  mark; pooler och utomhusbad; för bostadsrätt/ägarlägenhet dessutom gräv-,
  mark- och sprängarbete för altan/balkong, dränering av husgrund, samt att
  färdigställa en nyproducerad lägenhet. **Femårsregeln:** i ett nybyggt småhus
  (yngre än fem år) får arbetet bara syfta till att återställa byggnaden till
  ursprungligt skick, med likvärdigt material — annars ingen ROT.

## Vad som ännu INTE är gjort

- Fackgranskning av namnen (är "Betongarbeten / grundarbete" ett begrepp en
  byggare faktiskt använder, eller bör den delas upp?).
- Direkt, ordagrann verifiering av Boverkets sidor (BOV, BOV-TB) — WebFetch fick
  bara navigeringsmenyn eftersom sidan är JavaScript-renderad; fakta ovan kommer
  via sökträffar som citerar rätt URL, inte ett hämtat sidcitat. Bör läsas om i
  klartext (t.ex. via webbläsare eller Boverkets PDF-vägledningar) innan den
  låses som facit.
- ROT-status på raderna märkta `?`, `ROT*` och de delade `ROT/Nej`-raderna —
  kräver Skatteverkets fullständiga lista eller Andreas bedömning, inte min
  gissning.
- Rader som medvetet är UTESLUTNA här för att de hör hemma i en annan
  branschfil, trots att flera av byggfirmorna (JOH, SBF, DUF m.fl.) säljer dem
  som egna tjänster:
  - **Tak:** takläggning, takrenovering, takmålning (JOH, SBF, OFF) → filen Tak.
  - **Måleri:** fasadmålning, invändig målning, tapetsering (SBF, JOH m.fl.) →
    filen Måleri.
  - **Snickeri:** fönsterbyte, dörrbyte, finsnickeri, möbelmontering (nämns
    under JOH:s snickeriexempel) → filen Snickeri.
  - **VVS:** rörmokeri, stambyte, relining (nämns hos DRY/OFF) → hör inte till
    Bygg alls, ingen egen Bygg-källa styrker det som byggfirmans kärntjänst.
- Ingen kod, ingen seed. Se `tasks/todo.md` → Branschförståelse.
