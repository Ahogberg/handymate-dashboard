# Bransch: Måleri (painter) — källbelagda jobbtyper

**Status: OGRANSKAD — väntar på Andreas fackgranskning (2026-09-02).**
Inget i den här filen seedas till konton förrän statusen är ändrad till GRANSKAD.

Syfte: startpaketet med jobbtyper som ett nytt måleriföretag får vid onboarding, plus
de branschfakta systemprompten för Måleri ska bära (steg 3). Regeln från Andreas:
*"i verkligheten relevant, inte vad du som AI fantiserar ihop"* — varje rad har
därför minst en namngiven källa, och rader med bara en källa är markerade.

## Källor

Hierarki: (a) branschorganisation → (b) Skatteverkets ROT → (c) riktiga firmors
tjänstelistor/marknadsplatser → (d) fackgranskning (Andreas/Christoffer).

| Kod | Källa | Typ |
|---|---|---|
| MF-BRANSCH | [Måleriföretagen — Måleribranschen](https://www.maleriforetagen.se/maleribranschen/) | a |
| MF-VVM | [Måleriföretagen — kursen Behörig Våtrumsmålare](https://www.maleriforetagen.se/kurser/maleritekniska-kurser/behorig-vatrumsmalare/) | a |
| MVK | [MVK — Måleribranschens Våtrumskontroll](https://www.vatrumsmalning.se/) (samarbete Måleriföretagen + Sveff) | a |
| SKV-ROT | [Skatteverket — Ger arbetet rätt till rotavdrag? (avsnitt målning/tapetsering/golv)](https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut/gerarbetetratttillrotavdrag.4.5c1163881590be297b5173bf.html) | b |
| RENO | [Renomåleri & Bygg, Stockholm — Tjänster](https://renomaleribygg.se/tjanster/) | c |
| ENG | [Engeldahls Måleri, Stockholm](https://www.engeldahls.se/maleritjanster-stockholm/) | c |
| OFF-MT | [Offerta — Målning & tapetsering](https://offerta.se/bygg-och-renovering/malning-och-tapeter) | c (marknadsplats) |
| OFF-FAS | [Offerta — Måla fasad & hus](https://offerta.se/bygg-och-renovering/fasadmalare) | c (marknadsplats) |
| DRY | [Dryft — Målare, fast pris](https://dryft.se/malare/) | c (fastprismarknad) |
| SANDA | [Sandå Göteborg — Målare](https://www.sanda.se/kontor/goteborg/malare/) | c (rikstäckande måleriföretag) |
| F21 | [Floor21 AB, Stockholm/Järfälla — golvslipning & måleri](https://floor21.se/) | c |

Firmorna spänner från lokala Stockholms-/Göteborgsfirmor (Renomåleri, Engeldahls,
Floor21) till ett av landets största måleriföretag (Sandå) och två marknadsplatser
(Offerta, Dryft) som visar vad kunder efterfrågar och vad fastprisaktörer paketerar.

## Föreslaget startpaket (≥3 källor)

ROT-kolumnen: **ROT** = Skatteverket listar arbetet uttryckligen (småhus, eller
både småhus+BRF); **ROT\*** = ROT med en dokumenterad skillnad mellan boendeform
eller in-/utvändigt som måste visas i UI:t; **Nej** = Skatteverket säger uttryckligen
nej, eller arbetet är B2B/gemensamt utrymme och gäller därför inte den enskilda
privatpersonens ROT; **?** = inte utrett.

| # | Jobbtyp (förslag på namn) | Källor | ROT/GT | Anm. |
|---|---|---|---|---|
| 1 | Invändig målning av väggar och tak | SKV-ROT, RENO, ENG, OFF-MT, DRY, SANDA, F21 | ROT | SKV: "måla golv, tak, väggar, fönster och element" — gäller både småhus och bostadsrätt |
| 2 | Målning av innertak | SKV-ROT, OFF-MT, SANDA, ENG | ROT | del av "måla golv, tak, väggar" |
| 3 | Tapetsering | SKV-ROT, RENO, ENG, OFF-MT, DRY, SANDA, F21 | ROT | SKV: "tapetsera" — gäller både småhus och bostadsrätt |
| 4 | Fasadmålning (utvändig målning av hus) | SKV-ROT, RENO, ENG, OFF-FAS, DRY, SANDA | ROT\* | SKV: "måla fasader" ger ROT för **småhus**; för **bostadsrätt ger utvändig målning (fasad, balkong, altan, takterrass) INTE ROT** för medlemmen — visa detta tydligt i UI:t |
| 5 | Målning av dörrar, foder och snickerier | SKV-ROT, ENG, SANDA, RENO | ROT | SKV: "måla eller lacka dörrar och köksluckor" — undantag: **inte** om arbetet sker i företagets egna lokaler |
| 6 | Fönstermålning | SKV-ROT, SANDA, DRY, OFF-FAS | ROT\* | Småhus: hela fönstret ("fönster" i godkänd-listan). Bostadsrätt: **bara insidan** ("insidan av ytterdörrar och fönster") — **utsidan av fönster ger inte ROT för BRF-medlem** |
| 7 | Golvslipning, lackning och oljning av trägolv | SKV-ROT, F21, SANDA, RENO | ROT | del av "slipa och byta golv, tak och väggmaterial" |
| 8 | Golvläggning / byte av golv (parkett, laminat, trä) | SKV-ROT, F21, SANDA | ROT | SKV: "...byta golv... material" — nytt golv i befintlig bostad, inte nyproduktion |
| 9 | Våtrumsmålning (badrum) | MVK, RENO, SANDA | ROT\* | kräver att företaget är **MVK-auktoriserat** och målaren har giltigt "körkort" — se branschfakta; ROT-status följer generella regler för invändig målning, inte specialutredd av SKV per våtrum |
| 10 | Målning av trapphus | SANDA, DRY, ENG | Nej | normalt fastighetens/BRF:ens gemensamma yta — upphandlas av föreningen/fastighetsägaren (B2B), ger inte den enskilda medlemmens ROT |

## Valbara tillägg (2 källor — med i biblioteket, inte i startpaketet)

| # | Jobbtyp | Källor | ROT/GT | Anm. |
|---|---|---|---|---|
| 11 | Bredspackling / väggspackling inför målning | ENG, F21 | ROT\* | ingår normalt i målningsuppdraget, inte separat utredd av SKV |
| 12 | Fasadtvätt / tvätt av tak och fasad | OFF-MT, OFF-FAS | ? | förarbete inför fasadmålning ("skrapas, tvättas eller lagas innan målning") — oklart om tvätt utan målning ger ROT |
| 13 | Dekorationsmålning (kalkfärg, specialtekniker) | DRY, SANDA | ROT\* | SANDA kallar det "Dekorationsmålning", DRY nämner kalkfärg och "snobbkant" — troligen del av vanlig invändig/fasad-ROT men inte SKV-utredd som egen kategori |
| 14 | Målning av staket, plank och murar | DRY, SANDA | **Nej** | SKV säger uttryckligen nej för både småhus och bostadsrätt: "måla staket eller murar" |
| 15 | Plattsättning i badrum (tilläggstjänst) | F21, SANDA | ? | gränssnitt mot ett annat yrke (kakel/plattsättning), inte kärnmåleri — två firmor säljer det ändå som tilläggstjänst till våtrumsrenovering |

## En källa — INTE med förrän någon bekräftar

| Jobbtyp | Källa | Varför tveksam |
|---|---|---|
| Entreprenadmålning / måleri i nyproduktion | SANDA | gäller nyproduktion/ombyggnadsentreprenader, inte den vanliga renoveringskunden en liten firma möter |
| Montering av golvlister, socklar och dörrfoder | F21 | en firma; kan vara en underrad till "golvläggning" snarare än egen jobbtyp |

## Branschfakta för systemprompten (steg 3 — inte byggt)

Detta är sådant agenten ska *veta*, hämtat ur (a)- och (b)-källorna, inte ur firmorna:

- **MVK-behörighet (våtrum):** Måleribranschens våtrumskontroll (MVK) är ett
  samarbete mellan Måleriföretagen i Sverige och Sveriges Färg och Lim Företagare
  (Sveff). För att ett måleriföretag ska få utföra godkänd våtrumsmålning ska
  företaget vara **MVK-auktoriserat**, och de målare som utför arbetet ska ha
  genomgått utbildningen "Behörig Våtrumsmålare" med godkänt resultat, dokumenterat
  med ett personligt utbildningsbevis ("körkort") som är giltigt i **10 år** — men
  **bara vid arbete hos ett MVK-auktoriserat företag**. Försäkringsbolag använder
  MVK:s regler vid skadereglering av vatten­skador i målade/tapetserade våtrum.
- **ROT ges inte för (SKV), gäller båda boendeformer:** måla staket eller murar;
  måla eller lacka dörrar och köksluckor **i företagets egna lokaler** (dvs. inte
  i kundens bostad).
- **Skillnaden småhus vs. bostadsrätt (SKV) — viktigast att visa i UI:t:** I ett
  **småhus** ger både invändigt och utvändigt målningsarbete ROT, inklusive
  fasadmålning och fönster (hela fönstret). I en **bostadsrätt** ger **endast
  invändigt** arbete ROT för den enskilda medlemmen — att måla eller olja fasader,
  balkonger, altaner eller takterrasser, eller att måla/olja **utsidan** av fönster
  eller ytterdörrar, ger **inte** ROT för BRF-medlemmen (utvändigt underhåll är
  föreningens ansvar/upphandling, inte medlemmens ROT-grundande arbete).
- **Kvalitetssystem i branschen (Måleriföretagen):** medlemsföretag kan
  ISO-certifiera sig, använda "Referensytesystemet" vid upphandling av
  måleritjänster, och ansluta sig till en "Nöjd-Kund-Garanti" — signaler agenten
  kan känna igen om en kund nämner dem, men inte ROT-grundande i sig.

## Vad som ännu INTE är gjort

- Fackgranskning av namnen (är "Golvläggning / byte av golv" rätt gräns mot
  golvläggarens yrke, eller ska den bort helt från en måleributik?).
- ROT-status på raderna märkta `?` och `ROT*` — särskilt våtrumsmålning och
  bredspackling — kräver Skatteverkets fullständiga lista eller Andreas
  bedömning, inte min gissning.
- Måleriföretagens medlemssidor gav bara branschnivå (kvalitetssystem, kurser);
  ingen tjänste-/prislista bakom inlogg har hämtats.
- Ingen kod, ingen seed. Se `tasks/todo.md` → Branschförståelse.
