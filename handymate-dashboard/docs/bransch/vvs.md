# Bransch: VVS (plumber) — källbelagda jobbtyper

**Status: OGRANSKAD — väntar på Andreas fackgranskning (2026-09-02).**
Inget i den här filen seedas till konton förrän statusen är ändrad till GRANSKAD.

Syfte: startpaketet med jobbtyper som ett nytt VVS-företag får vid onboarding, plus
de branschfakta systemprompten för VVS ska bära (steg 3). Regeln från Andreas:
*"i verkligheten relevant, inte vad du som AI fantiserar ihop"* — varje rad har
därför minst en namngiven källa vars sida faktiskt hämtats, och rader med bara en
källa är markerade. Formuleringarna i Anm.-kolumnen är citat från källan, inte mina.

## Källor

Hierarki: (a) myndighet/branschorganisation → (b) Skatteverkets ROT/grön teknik →
(c) riktiga firmors tjänstelistor → (d) fackgranskning (Andreas/Christoffer).

| Kod | Källa | Typ |
|---|---|---|
| SV | [Säker Vatten — startsida, krav för auktorisation, därför auktorisera, branschregler 2026:1](https://www.sakervatten.se/) | a |
| IN | [Installatörsföretagen — teknikområde VS](https://www.in.se/teknikomraden/vs/) | a |
| SKV-ROT | [Skatteverket — Ger arbetet rätt till rotavdrag? (avsnitt VVS, småhus/bostadsrätt/ägarlägenhet + schablon värmepump)](https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut/gerarbetetratttillrotavdrag.4.5c1163881590be297b5173bf.html) | b |
| SKV-GT | [Skatteverket — Grön teknik](https://www.skatteverket.se/privat/fastigheterochbostad/gronteknik.4.676f4884175c97df4192860.html) | b |
| SJO | [Sjöstadens VVS, Stockholm](https://sjöstadensvvs.se/) | c (Säker Vatten-certifierad) |
| SAK | [Säkra Rör & Bygg, Stockholm](https://sakraror.se/vara-tjanster/) | c |
| SVVS | [VVS Stockholm (Järfälla)](https://www.stockholmvvs.com/) | c |
| HIS | [Rörmokare Hisingen, Göteborg](https://rormokare-hisingen.se/) | c (Säker Vatten) |
| VVSG | [VVS Group, Göteborg](https://vvsgroup.se/rormokare-goteborg/) | c (Säker Vatten-certifierad) |
| GBG | [Göteborgs Rörmokare](https://göteborgsrörmokare.se/) | c |
| NOVA | [Nova Rörspecialisten, Malmö](https://novarorspecialisten.se/) | c (auktoriserat VVS-företag) |
| MVVS | [Malmö VVS AB](https://www.mvvs.se/) | c (auktoriserat VVS-företag) |
| DRY | [Dryft — rörmokartjänster med fast pris](https://dryft.se/rormokare/) | c (fastprismarknad) |
| CLAS | [Clas Fixare — rörmokare Stockholm](https://www.clasfixare.se/rormokare/stockholm/) | c (fastprismarknad) |
| OFF | [Offerta — rörmokare & VVS-installatör](https://offerta.se/bygg-och-renovering/rormokare) | c (efterfrågesida) |
| BRA | [BraByggare — offert rörmokare/VVS](https://www.brabyggare.se/info/kategorier-offert-rormokare-vvs/) | c (efterfrågesida) |

Firmorna är åtta små/medelstora VVS-firmor i Stockholm, Göteborg och Malmö,
hämtade som exempel på hur de själva beskriver sitt utbud; Dryft/Clas Fixare visar
vad som säljs till fast pris och Offerta/BraByggare vad *kunder* efterfrågar.
Porthalla VVS (Göteborg) och Rörgruppen Malmö gick inte att hämta (timeout/403)
och är därför inte källor.

## Föreslaget startpaket (≥3 källor)

ROT-kolumnen: **ROT** = Skatteverket listar arbetet uttryckligen; **ROT*** = följer
av Skatteverkets formulering men listas inte ordagrant — granska; **Nej** =
Skatteverket säger uttryckligen nej; **?** = inte utrett. Där småhus och bostadsrätt
skiljer sig står båda.

| # | Jobbtyp (förslag på namn) | Källor | ROT | Anm. |
|---|---|---|---|---|
| 1 | Byte/reparation av blandare (kök, dusch, tvättställ) | SKV-ROT, SAK, SVVS, HIS, VVSG, GBG, DRY, CLAS, OFF, BRA | ROT | SKV: "installera och reparera ... blandare, kranar"; CLAS säljer "Laga läckande blandare" separat |
| 2 | Byte av toalettstol | SKV-ROT, HIS, VVSG, DRY, CLAS, OFF, BRA | ROT | SKV: "toalett"; även "byta flottör, packningar, silar eller andra delar av toaletter" ger ROT |
| 3 | Byte av handfat / kommod | SKV-ROT, SAK, DRY, CLAS | ROT | SKV: "handfat" |
| 4 | Montering av dusch (duschvägg, duschkabin, takdusch) | SKV-ROT, HIS, CLAS | ROT | SKV: "dusch, badkar"; CLAS skiljer "dolda rör" från "utanpåliggande rör" |
| 5 | Stopp i avlopp / avloppsrensning | SAK, SVVS, HIS, VVSG, GBG, CLAS, BRA | ROT* småhus / **Nej** bostadsrätt | SKV småhus: "installera och rengöra avlopp" ger ROT; SKV bostadsrätt: "Avloppsrensning" ger INTE |
| 6 | Högtrycksspolning / stamspolning | SAK, HIS, OFF | ROT* småhus / **Nej** bostadsrätt | som rad 5; **slamsugning/septiktankstömning ger aldrig ROT** (SKV) |
| 7 | Installation av diskmaskin | SVVS, HIS, GBG, DRY, CLAS, BRA | ROT*/**Nej** | SKV: "installera vitvaror i samband med omfattande byggarbete" ger ROT; **"reparation av tvättmaskiner, torktumlare, diskmaskiner" ger INTE**. Fristående inkoppling: granska |
| 8 | Installation av tvättmaskin | HIS, GBG, DRY, CLAS, BRA | ROT*/**Nej** | som rad 7 |
| 9 | Byte av varmvattenberedare | SAK, SVVS, HIS, VVSG, GBG | ROT* | nämns inte ordagrant i hämtat SKV-avsnitt; VVSG listar "Inget varmvatten" som akutjobb |
| 10 | Byte av vattenmätarkonsol | SKV-ROT, SAK, VVSG, MVVS, CLAS | ROT | SKV ordagrant: "vattenmätarkonsol"; IN listar "Vattenmätarskåp" |
| 11 | Byte av vattenutkastare / trädgårdskran | SAK, HIS, DRY, CLAS | ROT* | SKV: "kranar"; sitter på huset — granska mot "trädgård"-undantag |
| 12 | Installation av värmepump (luft/vatten, bergvärme, frånluft) | SKV-ROT, SJO, SAK, SVVS, HIS, GBG, MVVS, DRY, OFF, BRA | ROT (schablon) | SKV: "installera, reparera och byta ... värmepumpar"; schablon 30 % (luftvärmepump) / 35 % (vätska-vatten t.ex. bergvärme); borrning 35 %; **ej grön teknik**. HIS+DRY säljer "Brunnsborrning & bergvärme" |
| 13 | Byte av element / radiator | SKV-ROT, SAK, HIS, MVVS | ROT | SKV: "element, termostat" |
| 14 | Vattenburen golvvärme (installation, spolning) | SVVS, NOVA, MVVS | ROT* | nämns inte ordagrant hos SKV; NOVA säljer "Spolning av golvvärme" separat |
| 15 | Nya vatten-/avloppsledningar (rördragning) | SKV-ROT, HIS, DRY, OFF, BRA | ROT småhus / delvis **Nej** bostadsrätt | SKV småhus: "dra in och reparera el-, vatten- och avloppsledningar"; SKV bostadsrätt: bara "i eller på vägg, inom bostadens gränser", **"dra in ... från början" ger INTE** |
| 16 | Enskilt avlopp (trekammarbrunn, minireningsverk) | SKV-ROT, HIS, VVSG | ROT | SKV: "anlägga avlopp (trekammarbrunnar, infiltrationsbäddar)"; landsbygdsjobb — tillval vid onboarding? |
| 17 | Badrumsrenovering — VVS-delen | SKV-ROT, HIS, NOVA, MVVS, CLAS, OFF, BRA | ROT | SKV: toalett, dusch, badkar, handfat, "kakel- och klinkersättningar"; NOVA erbjuder totalentreprenad |
| 18 | Stambyte | SAK, HIS, NOVA, MVVS, OFF | ROT* småhus / **Nej** bostadsrätt | SKV bostadsrätt: "Stambyten, flytta/byta avloppsrör" ger INTE; oftast BRF-entreprenad |
| 19 | Relining | SVVS, HIS, GBG, OFF, BRA | ? | SKV nämner inte relining; i bostadsrätt är "byta avloppsrör" nej — utred |
| 20 | VVS-service / reparation (småjobb) | SJO, SVVS, VVSG, GBG, NOVA, MVVS | ROT*/**Nej** | reparation ger ROT; **"servicearbeten, kontroll och översyn" ger INTE** (SKV, alla bostadstyper) |
| 21 | VVS-jour / akut vattenläcka | SJO, SVVS, VVSG, GBG, NOVA, OFF | ROT* | ROT på reparationsdelen, inte på utryckningen i sig (granska); GBG: "frysta rör" |
| 22 | VVS för BRF / företag / nyproduktion | SJO, SAK, SVVS, NOVA, MVVS | – | B2B, ingen ROT |

## Valbara tillägg (2 källor — med i biblioteket, inte i startpaketet)

| # | Jobbtyp | Källor | ROT | Anm. |
|---|---|---|---|---|
| 23 | Byte av golvbrunn | SKV-ROT, HIS | ROT | SKV bostadsrätt: "Byta golvbrunn" ger, **"flytta golvbrunn" ger INTE** |
| 24 | Byte av värmepanna | SKV-ROT, NOVA | ROT | SKV: "värmepannor"; "felsöka ... värmepump, värmepanna" ger också ROT |
| 25 | Fjärrvärmeväxlare | SKV-ROT, MVVS | ROT (schablon 35 %) | SKV: "(till exempel bergvärme och fjärrvärme): 35 procent" |
| 26 | Solvärmesystem | SKV-ROT, IN | ROT (schablon 30 %) | SKV: "solvärmesystem: 30 procent"; **inte grön teknik** (SKV-GT listar bara solceller/batteri/laddpunkt) |
| 27 | Vattenfelsbrytare / vattenlarm | SKV-ROT, VVSG | ROT | SKV ordagrant: "vattenfelsbrytare" |
| 28 | Rörinspektion / avloppsfilmning | SAK, VVSG | **Nej** | SKV: "Filmning av avloppsrör" ger INTE |
| 29 | Avfallskvarn (montering/borttagning) | DRY, CLAS | ? | |
| 30 | VVS-/rörisolering | VVSG, IN | ? | IN: "Teknisk isolering — rörisolering för energibesparing" |

## En källa — INTE med förrän någon bekräftar

| Jobbtyp | Källa | Varför tveksam |
|---|---|---|
| Gasinstallation | MVVS | kräver särskild behörighet (MVVS: "gasbehöriga enligt Energigas Sverige"); nisch |
| Rotfräsning / rotskärning i avlopp | SAK | en firma; kan vara underrad till avloppsrensning |
| Ledningssökning | SAK | en firma |
| Punktlagning av avloppsrör | SVVS | en firma; kan vara underrad till rad 15 |
| Råttstopp i avlopp | MVVS | en firma |
| VVS-projektering | VVSG | konsultjobb, inte småfirmans vardag |
| Sprinkler | IN | branschorganisationens teknikområde, ingen firma i urvalet |
| Service och rengöring av värmepump | SVVS | en firma som egen tjänst; SKV: "servicearbeten" ger inte ROT |
| Braskamin | SKV-ROT | ROT ja, men ingen VVS-firma i urvalet säljer det |

## Branschfakta för systemprompten (steg 3 — inte byggt)

Detta är sådant agenten ska *veta*, hämtat ur (a)- och (b)-källorna, inte ur firmorna:

- **Säker Vatten (SV):** branschorganisation som "utvecklar, förvaltar och
  marknadsför branschreglerna, samt kontrollerar och auktoriserar VVS-företag";
  2 234 auktoriserade VVS-företag. Branschreglerna Säker Vatteninstallation (nu
  2026:1) syftar till att minimera "vattenskador, legionellaspridning, brännskador
  och förgiftning" och ställer krav på utförande, produkter och kunskap. Krav för
  auktorisation: följa branschreglerna, giltig försäkring, registrerat hos
  Bolagsverket, F-skatt och moms, och "minst en heltidsanställd montör med
  certifikat eller validering". Bara auktoriserade företag får "utfärda Säker
  Vattens intyg på det utförda arbetet" — "digitalt intyg ska lämnas till
  beställaren inom fyra veckor efter avslutat arbete". Installationer enligt
  branschreglerna "är även försäkringsbara" och auktorisation är "en förutsättning
  i de flesta upphandlingar". (Ingen lagstadgad auktorisation som på el-sidan —
  det är branschens system.)
- **Installatörsföretagen (IN):** "VS står för värme och sanitet" — uppvärmning,
  kyla, ventilation, tappvatten och avlopp. Delområden: installationsteknik VS,
  sprinkler, teknisk isolering, solvärme, legionellaskydd, heta arbeten,
  täthetskontroll, vattenmätarskåp, vattenskador, servisledningar.
- **ROT ges (SKV, småhus):** dra in/reparera vatten- och avloppsledningar; anlägga
  avlopp (trekammarbrunn, infiltration); installera/reparera vattenmätarkonsol,
  vattenfelsbrytare, element, termostat, blandare, kranar, toalett, dusch, badkar,
  handfat, kakel/klinker; byta flottör/packningar/silar; installera och rengöra
  avlopp, ventilation, imkanaler; installera/reparera/byta värmepannor, värmepumpar,
  solvärmesystem; felsöka värmepump/värmepanna.
- **ROT ges INTE (SKV, alla bostadstyper):** "servicearbeten, kontroll och
  översyn"; filmning av avloppsrör; slamsugning och septiktankstömning; reparation
  av tvättmaskiner, torktumlare, diskmaskiner; pooler/bad utomhus;
  energideklarationer och fuktmätningar.
- **ROT ges INTE i bostadsrätt (SKV):** stambyten, flytta/byta avloppsrör, flytta
  golvbrunn; dra in vatten/avlopp "från början"; avloppsrensning; rengöring av
  ventilation/imkanaler; solfångare, solceller, laddningspunkter; värmepump bara
  "inomhus-delen". Ledningar bara "i eller på vägg, inom bostadens gränser".
- **Schablon värmesystem (SKV, småhus):** luftvärmepump (luft-vatten, luft-luft,
  frånluft) 30 % av totalkostnaden räknas som arbete; vätska-vattenvärmepump
  (bergvärme, fjärrvärme) 35 %; borrning 35 %; solvärmesystem 30 %.
  "Schablonberäkning av arbetskostnad kan inte användas vid installation av
  värmesystem i bostadsrätter."
- **Grön teknik (SKV-GT):** omfattar bara solceller 15 %, batterilager 50 %,
  laddningspunkt 50 % (max 50 000 kr/person/år). Värmepump och solvärme nämns
  inte på grön teknik-sidan — de går på ROT. SKV-ROT: "rotavdrag och
  skattereduktion för grön teknik kan inte ges för samma arbete".
- **Nybyggt hus (SKV):** "Om bostaden är yngre än fem år får arbetet endast
  syfta till att återställa byggnaden till det skick den var i från början."

## Vad som ännu INTE är gjort

- Fackgranskning av namnen (säger en rörmokare "byte av blandare" eller
  "blandarbyte"? är "VVS-service" en jobbtyp eller en fakturarad?).
- ROT-status på raderna märkta `?` och `ROT*` — kräver Skatteverkets fullständiga
  lista eller Andreas bedömning, inte min gissning. Särskilt: varmvattenberedare,
  golvvärme, relining, fristående vitvaruinkoppling.
- Säker Vattens branschregler 2026:1 är bara hämtade på webbsidenivå — själva
  regeldokumentet (PDF) med kapitelindelning (tappvatten, våtrum, avlopp,
  rörgenomföringar) är inte läst. Boverket är inte hämtat alls.
- Startpaketet är stort (22 rader). Beslut behövs om vilka som är default för alla
  och vilka som är tillval vid onboarding (t.ex. enskilt avlopp, stambyte, BRF).
- Ingen kod, ingen seed. Se `tasks/todo.md` → Branschförståelse.
