# Bransch: Ventilation / HVAC (hvac) — källbelagda jobbtyper

**Status: OGRANSKAD — väntar på Andreas fackgranskning.**
Inget i den här filen seedas till konton förrän statusen är ändrad till GRANSKAD.
Branschen (`hvac`) finns i biblioteken men går idag INTE att välja i onboardingen —
den här filen är underlaget för beslutet om den ska exponeras.

Syfte: startpaketet med jobbtyper som ett nytt ventilations-/värmepumpsföretag får
vid onboarding, plus de branschfakta systemprompten för Ventilation ska bära
(steg 3). Regeln från Andreas: *"i verkligheten relevant, inte vad du som AI
fantiserar ihop"* — varje rad har därför minst en namngiven källa vars sida är
faktiskt hämtad, och rader med bara en källa är markerade och INTE med i förslaget.

## Källor

Hierarki: (a) myndighet/branschorganisation/certifieringsorgan →
(b) Skatteverkets ROT → (c) riktiga firmors tjänstelistor + marknadsplats.

| Kod | Källa | Typ |
|---|---|---|
| SVENT | [Svensk Ventilation — Obligatorisk ventilationskontroll (OVK)](https://www.svenskventilation.se/lagar-regler/obligatorisk-ventilationskontroll-ovk/) | a |
| KIWA | [Kiwa — OVK-behörighet N/K och kontrollintervall](https://www.kiwa.com/se/sv/insikter/kunskapsbank/certifiering/personcertifieringar/ovk/) | a |
| INCERT | [Incert — köldmedier/F-gaser, certifikatkategorier](https://incert.se/teknikomraden/koldmedier/) | a |
| PVF | [Plåt & Ventföretagen — Om oss](https://www.pvforetagen.se/om-oss/om-oss/om-oss/) | a (organisationsfakta, ingen tjänstelista på sidan) |
| SKV-ROT | [Skatteverket — Ger arbetet rätt till rotavdrag? (avsnitt VVS/Rengöring, småhus/bostadsrätt/ägarlägenhet)](https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut/gerarbetetratttillrotavdrag.4.5c1163881590be297b5173bf.html) | b |
| AER | [Aerius Ventilation, Stockholm](https://aerius.se/) | c |
| VFS | [Ventilationsföretag Stockholm — Tjänster](https://www.xn--ventilationsfretagstockholm-1yc.se/tjanster) | c |
| NRK | [NR Klimat AB — Ventilationsservice](https://nrklimat.se/ventilationsservice/) | c |
| VKS | [Ventilation & Kylservice](https://vent-kylservice.se/ventilation/ovk-obligatorisk-ventilationskontroll/) | c |
| AGD | [Agdor AB — värmepumpar](https://agdor.se/) | c |
| ALV | [Alvis Rörakut — Värmepumpar Stockholm](https://www.alvisrorakut.se/varmepumpar-stockholm/) | c |
| SF | [Servicefinder — Ventilation](https://servicefinder.se/hantverkare/ventilation) | c (efterfrågesida/marknadsplats) |

Sju riktiga företag (AER, VFS, NRK, VKS, AGD, ALV) beskriver sitt eget tjänsteutbud;
Servicefinder visar vad *kunder* efterfrågar och lägger offertförfrågningar på.
PVF (Plåt & Ventföretagen, branschorganisationen för plåt/vent, ~1 000 medlemsföretag)
gav bara organisationsfakta vid hämtning — ingen tjänsteindelning likt IN-sidan i
`el.md`. Boverkets egen OVK-sida gick inte att hämta (404/blockerad); intervall och
systemtyper är istället bekräftade via SVENT och KIWA, som båda citerar Boverkets
regler i sin egen text. Naturvårdsverkets sida om privatpersoners skyldighet att
anlita certifierad personal för värmepumpsinstallation gick av samma skäl inte att
hämta — det påståendet är därför INTE med i branschfakta, bara det som gick att
verifiera direkt hos Incert.

## Föreslaget startpaket (≥3 källor)

ROT-kolumnen: **ROT** = Skatteverket listar arbetet uttryckligen; **ROT*** = följer
av Skatteverkets formulering men med ett undantag eller en lucka — se Anm.;
**Nej** = Skatteverket säger uttryckligen nej; **?** = inte utrett; **–** = B2B, ingen ROT.

| # | Jobbtyp (förslag på namn) | Källor | ROT | Anm. |
|---|---|---|---|---|
| 1 | OVK-besiktning | AER, VFS, NRK, VKS, SF | Nej | SKV nämner inte OVK vid namn, men "göra servicearbeten eller kontroll och översyn av maskiner och inventarier" är uttryckligen INTE godkänt i VVS-sektionen för småhus — besiktning/kontroll faller under samma princip som elens "enbart felsökning" |
| 2 | Ventilationsservice / underhåll (filterbyte, kontroll av komponenter, remmar) | AER, VFS, NRK, VKS | Nej | samma SKV-undantag som rad 1: "servicearbeten eller kontroll och översyn" ger inte ROT |
| 3 | Kanalrensning / rengöring av ventilationskanaler och imkanaler | AER, VFS, NRK, VKS, SF | ROT* | SKV småhus: "installera och rengöra avlopp, ventilation och imkanaler samt för att städa efteråt" (VVS) + eget stycke under Rengöring; **bostadsrätt: uttryckligen INTE godkänt** ("rengöra ventilation och imkanaler eller för att städa efter utfört rotarbete") — skiljer sig alltså per boendeform |
| 4 | Installation av nytt ventilationssystem / FTX-aggregat | AER, VFS, NRK, VKS, SKV-ROT | ROT | del av samma SKV-mening som rad 3: "installera ... ventilation" (småhus) |
| 5 | Injustering av ventilationssystem | NRK, VKS, VFS | ? | NRK och VKS nämner ventilations-injustering uttryckligen; VFS:s formulering ("injusterar värme, vatten och kylsystem") är bredare VVS-injustering, inte specifikt ventilationskanaler — inte utrett mot SKV |
| 6 | Ventilationsentreprenad i lokaler/fastigheter (företag, BRF, industri) | VFS, VKS, NRK | – | B2B — VFS: "från villor till industrilokaler"; VKS har egna avsnitt för industri, storkök och kontor |
| 7 | Installation av luftvärmepump (luft-luft) | AGD, ALV, VKS, SKV-ROT | ROT | SKV ägarlägenhet: "installera och reparera en AC eller en luftvärmepump"; SKV småhus/bostadsrätt: generisk "värmepumpar" |
| 8 | Installation av luft-vattenvärmepump | AGD, ALV, VKS, SKV-ROT | ROT | samma SKV-underlag som rad 7, generisk "värmepumpar" |
| 9 | Installation av bergvärmepump | AGD, ALV, SKV-ROT | ROT | samma SKV-underlag; **borrningsdelen specifikt är inte utredd** — kan falla under annan bedömning |
| 10 | Reparation av värmepump | AGD, ALV, SKV-ROT | ROT | SKV: "installera och reparera värmepannor, värmepumpar och solvärmesystem" — men "rotavdrag och skattereduktion för grön teknik kan inte ges för samma arbete" |
| 11 | Service av värmepump (filterrengöring, kontroll av kompressor/pump) | AGD, ALV, VKS | Nej | samma SKV-undantag som rad 1–2: "servicearbeten eller kontroll och översyn" |

## Valbara tillägg (2 källor — med i biblioteket, inte i startpaketet)

| # | Jobbtyp | Källor | ROT | Anm. |
|---|---|---|---|---|
| 12 | Projektering / ritning av ventilationssystem (CAD) | VFS, VKS | Nej | planering/ritning nämns inte som godkänt arbete hos SKV — samma logik som elprojektering i `el.md` |
| 13 | Felsökning av värmepump (utan reparation) | AGD, ALV | Nej | SKV skiljer "installera och reparera" (godkänt) från ren felsökning/kontroll (inte godkänt) — inte utrett specifikt för värmepump men samma princip som ventilation rad 1–2 och elens "enbart felsöka" |
| 14 | Installation/service av AC / komfortkyla | SKV-ROT, VKS | ROT/? | SKV ägarlägenhet: "installera och reparera en AC" är uttryckligen godkänt; för småhus/bostadsrätt är AC/komfortkyla inte namngivet — ?  |

## En källa — INTE med förrän någon bekräftar

| Jobbtyp | Källa | Varför tveksam |
|---|---|---|
| Radonsanering / radonåtgärder | AER | en firma; ligger nära ventilation men är egentligen en egen tjänstekategori |
| Avfuktning (sorptionsavfuktare, vind/krypgrund) | AER | en firma |
| Mekanisk frånluftsinstallation | AER | en firma; kan vara en underrad till rad 4 |
| Isolering av ventilationskanaler | VFS | en firma |
| Spårgasmätning (flödesmätning) | NRK | en firma; nischteknik |
| Provtryckning / täthetsprovning | NRK | en firma |
| Energieffektivisering av ventilationssystem | NRK | en firma; oklart om det är en säljbar jobbtyp eller en del av service |
| Felsökning av ventilationssystem (funktionsfel) | NRK | en firma |
| Serviceavtal för värmepump (fastighetsägare/BRF) | ALV | en firma; kan vara en prismodell snarare än en jobbtyp |
| Storköks- och tvättstugeventilation | VKS | en firma; nisch |
| Industriventilation / processfilter | VKS | en firma; större entreprenad, inte småfirmans vardag |

## Branschfakta för systemprompten (steg 3 — inte byggt)

Detta är sådant agenten ska *veta*, hämtat ur (a)- och (b)-källorna, inte ur firmorna:

- **OVK-intervall (Boverkets regler, återgivna av KIWA):** förskolor, skolor,
  fritidshem och vårdlokaler — vart 3:e år. Flerbostadshus/kontor med FT- eller
  FTX-ventilation — vart 3:e år. Flerbostadshus/kontor med S-, F- eller
  FX-ventilation — bara första besiktningen innan systemet tas i bruk, normalt
  inget krav på återkommande OVK. En- och tvåbostadshus med självdrag eller
  frånluft utan värmeåtervinning — normalt inget krav på återkommande OVK.
- **Ventilationssystemtyper (SVENT):** S = självdrag, F = fläktstyrd frånluft,
  FT = fläktstyrd från- och tilluft, FX = F med värmeåtervinning,
  FTX = FT med värmeåtervinning.
- **OVK-behörighet (KIWA):** *Behörighet N* ("normal") gäller vissa byggnader och
  system — bland annat självdrag, frånluft, frånluft med värmeåtervinning samt
  vissa system i en- och tvåbostadshus. *Behörighet K* ("kvalificerad") gäller
  alla typer av ventilationssystem, bland annat FT- och FTX-ventilation i många
  byggnader. Kontrollen ska utföras av en certifierad sakkunnig funktionskontrollant
  med rätt behörighet för byggnaden och systemet.
- **Köldmediecertifiering (INCERT):** arbete med köldmediebärande utrustning
  (t.ex. split-installation av luft-luft- och luft-vattenvärmepumpar) kräver
  personcertifikat i ett kategorisystem: Kategori I = "ingrepp för alla
  fyllnadsmängder", Kategori II = ingrepp under 3 kg, Kategori III = återvinning
  under 3 kg, Kategori IV = "läckagekontroller utan att göra ingrepp", Kategori V =
  fordonsluftkonditionering. Ett nytt certifikatsystem (A1/A2/B/C/D/E) är på väg
  in, gamla certifikat gäller som senast till 12 mars 2029 (INCERT).
- **ROT ges inte för (SKV):** "servicearbeten eller kontroll och översyn av
  maskiner och inventarier" (småhus, VVS-sektionen) — träffar OVK-besiktning,
  regelbunden service och ren felsökning. I bostadsrätt ger rengöring av
  ventilation/imkanaler INTE ROT (till skillnad från småhus och ägarlägenhet,
  där det uttryckligen gör det).
- **ROT ges för (SKV):** "installera och rengöra avlopp, ventilation och
  imkanaler" (småhus); "installera och reparera värmepannor, värmepumpar och
  solvärmesystem" (småhus) — men rotavdrag och grön teknik-skattereduktion kan
  inte ges för samma arbete; "installera och reparera en AC eller en
  luftvärmepump" (ägarlägenhet, namngivet ordagrant).

## Vad som ännu INTE är gjort

- Fackgranskning av namnen (är "Ventilationsservice" respektive "OVK-besiktning"
  orden en ventilationstekniker själv skulle använda i jobblistan?).
- ROT-status på raderna märkta `?` — särskilt injustering (rad 5) och AC/komfortkyla
  utanför ägarlägenhet (rad 14) — kräver Skatteverkets fullständiga lista eller
  Andreas bedömning, inte min gissning.
- Borrningsdelen av bergvärmeinstallation (rad 9) är inte separat utredd mot ROT.
- Naturvårdsverkets krav på certifierad personal för privatpersoners
  värmepumpsköp gick inte att verifiera (sidan 404:ade vid hämtning) — innan den
  läggs i branschfakta måste den hämtas och citeras på riktigt.
- Boverkets egen OVK-sida gick inte att hämta direkt — intervall/behörighet vilar
  just nu på SVENT och KIWA:s återgivning av reglerna, inte på Boverkets
  originaltext.
- Ingen kod, ingen seed. Beslutet om `hvac` ska gå att välja i onboardingen är
  Andreas att fatta utifrån den här filen.
