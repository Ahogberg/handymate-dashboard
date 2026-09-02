# Bransch: Snickeri (carpenter) — källbelagda jobbtyper

**Status: OGRANSKAD — väntar på Andreas fackgranskning (2026-09-02).**
Inget i den här filen seedas till konton förrän statusen är ändrad till GRANSKAD.
Tre skarpa konton har redan valt bransch "snickeri" — listan används alltså
mot riktiga kunder redan innan granskningen är klar.

Syfte: startpaketet med jobbtyper som ett nytt snickeriföretag får vid
onboarding, plus de branschfakta systemprompten för Snickeri ska bära
(steg 3). Regeln från Andreas: *"i verkligheten relevant, inte vad du som
AI fantiserar ihop"* — varje rad har därför minst en namngiven källa, och
rader med bara en källa är markerade som inte med.

## Källor

Hierarki: (a) branschorganisation → (b) Skatteverkets ROT → (c) riktiga
firmors tjänstelistor/marknadsplatser → (d) fackgranskning (Andreas/Christoffer).

| Kod | Källa | Typ |
|---|---|---|
| TMF | [Trä- och Möbelföretagen — Vår verksamhet](https://www.tmf.se/om-tmf/om-tmf/var-verksamhet/) | a |
| SKV-ROT | [Skatteverket — Ger arbetet rätt till rotavdrag?](https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut/gerarbetetratttillrotavdrag.4.5c1163881590be297b5173bf.html) | b |
| BTE | [Byggtjänst Entreprenad Stockholm — Snickeri](https://byggtjanstentreprenad.se/tjanster/snickeri) | c |
| JANAX | [Janax Snickeri, Farsta — Inredning](https://www.janaxsnickeri.se/inredning) | c |
| DRY | [Dryft — Snickare Stockholm, fasta priser](https://dryft.se/snickare-stockholm/) | c (fastprismarknad) |
| MJO | [Mjösäter Snickeri AB — Inredningssnickeri Stockholm](https://mjosater-snickeri.se/omrade/inredningssnickeri-stockholm/) | c |
| HMS | [HMS Byggservice — stockholmsnickare.nu](https://www.stockholmsnickare.nu/) | c |
| NARDI | [Nardi Service — Snickare Malmö, trädäck/altan/staket](https://nardiservice.se/snickare-malmo-tradack-altan-staket-nardi-service/) | c |
| HEMFIX | [Hemfixarna — Hjälp av snickare, fast pris med ROT](https://hemfixarna.se/hjalp-av-snickare/) | c (efterfrågesida) |

TMF representerar ca 650 medlemsföretag inom trä- och möbelindustrin, med
egna branschgrupper för bl.a. dörrar/fönster, kök & bad, specialinredning,
trappor och trägolv — det är en industri-/tillverkarorganisation snarare
än en organisation för enmans-/småfirmor, men den bekräftar vilka
produktkategorier som räknas som etablerad snickeribransch. Firmorna
(BTE, JANAX, DRY, MJO, HMS, NARDI) är hämtade som exempel på hur riktiga
svenska snickeri-/byggfirmor själva beskriver sitt utbud; Hemfixarna visar
vad en fastprismarknadsplats säljer som "snickarhjälp". Jag hittade ingen
tydlig, fristående sida hos Byggföretagen om snickarens arbetsuppgifter
(bara lönestatistik under SSYK 711100 "Träarbetare, snickare m.fl.") —
den är därför inte medtagen som källa.

## Föreslaget startpaket (≥3 källor)

ROT-kolumnen: **ROT** = Skatteverket listar arbetet uttryckligen; **ROT*** =
följer av Skatteverkets formulering men med ett villkor som måste uppfyllas
(t.ex. "ihopbyggd med huset", "platsbyggt/fast", "i samband med renovering")
— granska villkoret innan det visas för kund; **Nej** = Skatteverket säger
uttryckligen nej; **?** = inte utrett.

| # | Jobbtyp (förslag på namn) | Källor | ROT | Anm. |
|---|---|---|---|---|
| 1 | Platsbyggt kök / köksrenovering | SKV-ROT, BTE, JANAX, MJO, HMS, DRY | ROT* | SKV: "montera fast köks- och badrumsinredning samt installera vitvaror i samband med omfattande byggarbete eller renovering" — fristående köksmöbler utan renovering ger inte ROT |
| 2 | Platsbyggd förvaring (garderober, bokhyllor, skåp) | SKV-ROT, BTE, JANAX, MJO, HMS, HEMFIX | ROT | SKV: "montera platsbyggda fasta möbler, exempelvis garderober och bokhyllor" |
| 3 | Skräddarsydda möbler / finsnickeri (bänkar, bord, sängar) | SKV-ROT, BTE, JANAX, MJO | ROT* | samma SKV-formulering som rad 2 gäller bara platsbyggt/fast — SKV säger uttryckligen att "montera fristående möbler" INTE ger ROT |
| 4 | Altan och trädäck | SKV-ROT, BTE, HMS, NARDI, DRY | ROT* | SKV: "bygga altan och balkong ... förutsatt att de byggs ihop med huset" — fristående trädäck/pooldäck ger inte ROT (se rad 5-familjen) |
| 5 | Staket, plank och mur | SKV-ROT, HMS, NARDI | **Nej** | SKV säger nej i tre separata skrivningar: "reparera och underhålla pooldäck, staket, murar", "bygga pooldäck, staket och murar", "bygga staket och murar" (gräv-/markarbete) |
| 6 | Trappa (reparation av entré-/innertrappa) | SKV-ROT, BTE, TMF | ROT* | SKV: "reparera och underhålla entrétrappor, balkonger och altaner samt tillhörande räcken, förutsatt att de är ihopbyggda med huset" — nybyggnad av trappa är inte uttryckligen nämnd |
| 7 | Dörrar (byte/reparation, lås och handtag) | SKV-ROT, TMF, DRY, HEMFIX | ROT | SKV: "byta och reparera köksluckor, dörrar, dörrlås, dörrhandtag och fönsterbleck" |
| 8 | Fönster (byte/reparation) | SKV-ROT, TMF, DRY | ROT | SKV: "reparera eller byta ut fönster samt för att montera bullerglas och isolerglas" |
| 9 | Golv (trägolv/parkett — läggning, slipning, byte) | SKV-ROT, TMF, BTE, HMS, DRY, HEMFIX | ROT | SKV: "slipa och byta golv, tak och väggmaterial" |
| 10 | Fasad (klädsel, panel, reparation) | SKV-ROT, BTE, HMS, DRY | ROT | SKV: "byta och reparera fasader, hängrännor och takpannor" och "mura och reparera fasader och entrétrappor" |

## Valbara tillägg (2 källor — med i biblioteket, inte i startpaketet)

| # | Jobbtyp | Källor | ROT | Anm. |
|---|---|---|---|---|
| 11 | Lister, foder och socklar | HEMFIX, DRY | ROT* | HEMFIX: "montering och justering av innerdörrar, lister och foder"; DRY: "byte av socklar" — ingen egen SKV-rad, sannolikt del av dörr-/fönsterbytet i rad 7 |
| 12 | Rivning/byggande av innervägg | DRY, HEMFIX | ROT* | DRY: "rivning av innervägg", "byggande av innerväggar"; HEMFIX: "bygga en enklare väggsektion eller förstärka en befintlig konstruktion" — ingen exakt SKV-formulering för innerväggar specifikt |
| 13 | Uterum / inglasning av altan (tillbyggnad) | SKV-ROT, HMS | ROT* | SKV:s tillbyggnadsregel: ROT ges om "någon av tillbyggnadens sidor sitter ihop med den befintliga byggnadens yttervägg till minst 75 procent" — samma regel gäller carport, förråd, garage och gäststuga (se branschfakta) |

## En källa — INTE med förrän någon bekräftar

| Jobbtyp | Källa | Varför tveksam |
|---|---|---|
| Trädgårdssnickeri (spaljé, pergola, pallkrage, sängavel) | HMS | en firma, och mest DIY-inspirationsartiklar snarare än en tjänst de säljer |
| Möbelmontering (t.ex. IKEA-möbler) | HEMFIX | otydligt om det är en egen jobbtyp eller bara ingår i "förvaringslösningar" (rad 2) |
| Tak — snickeridelen (brädfodring, takfot) | SKV-ROT | Skatteverket nämner tak i golv-/väggcitatet, men ingen av mina snickerifirmor säljer det som egen rad — se överlapp mot Bygg nedan |
| Carport/förråd som egen jobbtyp | SKV-ROT | täcks redan av tillbyggnadsregeln i rad 13 (samma 75 %-villkor); ingen firma i urvalet säljer carport separat |

## Branschfakta för systemprompten (steg 3 — inte byggt)

Detta är sådant agenten ska *veta*, hämtat ur TMF- och Skatteverket-källorna,
inte ur firmorna:

- **TMF:s branschgrupper** (vad som räknas som etablerad snickeribransch):
  dörrar och fönster, kök och bad, specialinredning, trappor, trägolv,
  trähus, möbler, träskivor.
- **ROT ges för:** platsbyggda fasta möbler (garderober, bokhyllor);
  köks-/badrumsinredning i samband med omfattande byggarbete eller
  renovering; altan/balkong om ihopbyggd med huset; dörrar (inkl. lås,
  handtag, köksluckor); fönster (inkl. bullerglas/isolerglas); golv, tak
  och väggmaterial (slipa/byta); fasader, hängrännor, takpannor;
  entrétrappor/balkonger/räcken vid reparation och underhåll; tillbyggnad
  av bostadshus, förråd, garage, carport eller gäststuga OM minst 75 % av
  någon sida sitter ihop med befintlig yttervägg.
- **ROT ges INTE för:** fristående möbler (persienner, lamellgardiner,
  rullgardiner, solskydd räknas hit också); pooldäck, staket och murar —
  varken att bygga, reparera/underhålla eller vid gräv-/markarbete; att
  bygga ett helt nytt hus, en friggebod, ett garage, ett växthus eller en
  liknande **fristående** byggnad; att lägga sten och plattor direkt på
  mark.
- **Gränsen ombyggnad (ROT) vs nybyggnad (ej ROT):** avgörande är om
  konstruktionen sitter ihop med husets befintliga yttervägg till minst
  75 % av någon sida (tillbyggnadsregeln). Är den fristående — även om den
  står tätt intill huset — räknas den som ny byggnad och ger ingen ROT.
- **Bygglov för altan/uterum:** varken TMF eller Skatteverkets ROT-sida
  tar upp bygglovsgränser (det är en Boverket-/kommunfråga, utanför denna
  källhierarki). Inte utrett här — se "Vad som ännu INTE är gjort".

## Överlapp mot Bygg-branschen

Snickeri och Bygg (som får en egen källbelagd fil) delar ett stort
mittfält. Det som i den här filen ändå räknas in i snickarens eget
startpaket är sådant snickerifirmorna själva säljer på sina tjänstesidor:
platsbyggd inredning/förvaring, kök, möbler, altan/trädäck, trappa,
dörrar, fönster, golv och fasad (rad 1–10). Sådant som med säkerhet
kräver eller ofta utförs av ett bredare byggföretag — och som INTE tagits
med som egna rader här trots att flera källor snuddar vid det — är:
tillbyggnader/ombyggnader/nybyggnationer i stort (DRY och HMS nämner
orden men utan konkret jobbtypsbeskrivning), stomresning/bärande väggar
utöver enkel innervägg (rad 12 är medvetet begränsad till "enklare
väggsektion"), takläggning (takpannor nämns hos SKV men ingen snickerifirma
i urvalet säljer det som egen tjänst), och större fasadrenoveringar med
tilläggsisolering (DRY nämner "tilläggsisolering" i ett bygg-sammanhang,
inte specifikt som snickeritjänst). Carport/förråd/uterum (rad 13, tillägg)
ligger i gränslandet — de är juridiskt samma tillbyggnadsregel som en ren
snickeriaffär (altan, rad 4) men säljs ofta av byggfirmor med egen stomme-
och bygglovshantering. Den som skriver Bygg-filen bör alltså inte
duplicera rad 1–10 rakt av, men bör äga tillbyggnad/stomme/tak/
fasadrenovering-i-stort som sina egna, bredare jobbtyper.

## Vad som ännu INTE är gjort

- Fackgranskning av namnen (är "Platsbyggd förvaring" det ord en snickare
  själv använder, eller säger man "garderober och skåp"?).
- ROT-status på raderna märkta `ROT*` — särskilt rad 6 (trappa, nybyggnad
  vs reparation), rad 11 (lister/foder som egen post) och rad 12
  (innerväggar) kräver Skatteverkets fullständiga lista eller Andreas
  bedömning, inte min gissning.
- Bygglovsgränsen för altan/uterum — kräver en Boverket- eller
  kommunkälla, fanns inte i (a)/(b)-hierarkin för den här filen.
- Avstämning mot Bygg-filen när den är skriven, så att samma jobbtyp inte
  hamnar dubbelt i två branschers startpaket.
- Ingen kod, ingen seed. Se `tasks/todo.md` → Branschförståelse.
