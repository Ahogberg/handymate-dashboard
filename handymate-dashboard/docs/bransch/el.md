# Bransch: El (electrician) — källbelagda jobbtyper

**Status: OGRANSKAD — väntar på Andreas fackgranskning (2026-09-02).**
Inget i den här filen seedas till konton förrän statusen är ändrad till GRANSKAD.

Syfte: startpaketet med jobbtyper som ett nytt elföretag får vid onboarding, plus
de branschfakta systemprompten för El ska bära (steg 3). Regeln från Andreas:
*"i verkligheten relevant, inte vad du som AI fantiserar ihop"* — varje rad har
därför minst en namngiven källa, och rader med bara en källa är markerade.

## Källor

Hierarki: (a) myndighet/branschorganisation → (b) Skatteverkets ROT/grön teknik →
(c) riktiga firmors tjänstelistor → (d) fackgranskning (Andreas/Christoffer).

| Kod | Källa | Typ |
|---|---|---|
| ESV | [Elsäkerhetsverket — auktorisationstyper A/AL/B](https://www.elsakerhetsverket.se/yrkespersoner/ansok-om-auktorisation/auktorisationstyper/) | a |
| IN | [Installatörsföretagen — teknikområde El](https://www.in.se/teknikomraden/el/) | a |
| SKV-ROT | [Skatteverket — Ger arbetet rätt till rotavdrag? (avsnitt El)](https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut/gerarbetetratttillrotavdrag.4.5c1163881590be297b5173bf.html) | b |
| SKV-GT | [Skatteverket — Grön teknik](https://www.skatteverket.se/privat/fastigheterochbostad/gronteknik.4.676f4884175c97df4192860.html) | b |
| GUL | [Gullikssons El, Stockholm](https://www.gullikssonsel.se/) | c |
| ELT | [Eltotalen, Stockholm](https://www.eltotalen.se/sida/elinstallationer) | c |
| HBEL | [HB El](https://hbel.se/rotavdrag-elinstallation/) | c |
| MAT | [Elektriker Matfors](https://elektrikermatfors.se/rotavdrag-elektriker/) | c |
| EFS | [Elfirma Stockholm](https://elfirma-stockholm.se/) | c |
| DRY | [Dryft — eltjänster med fast pris](https://dryft.se/elektriker/) | c (fastprismarknad) |
| E.SE | [Elektriker.se — offertkategorier](https://elektriker.se/) | c (efterfrågesida) |

Firmorna är hämtade som exempel på hur små/medelstora elfirmor själva
beskriver sitt utbud; Dryft och Elektriker.se visar vad *kunder* efterfrågar.

## Föreslaget startpaket (≥3 källor)

ROT-kolumnen: **ROT** = Skatteverket listar arbetet uttryckligen; **GT** = grön teknik;
**ROT*** = följer av Skatteverkets formulering men listas inte ordagrant — granska;
**Nej** = Skatteverket säger uttryckligen nej; **?** = inte utrett.

| # | Jobbtyp (förslag på namn) | Källor | ROT/GT | Anm. |
|---|---|---|---|---|
| 1 | Byte av elcentral | SKV-ROT, ELT, HBEL, EFS, DRY, E.SE | ROT | "installera och komplettera elcentraler (proppskåp)" |
| 2 | Installation av jordfelsbrytare | HBEL, EFS, DRY, E.SE | ROT* | del av "komplettera elcentral" |
| 3 | Ny eldragning / kabeldragning | SKV-ROT, ELT, EFS, MAT, E.SE | ROT | "dra in el"; ej i trädgård |
| 4 | Elrenovering (dra om el i äldre bostad) | SKV-ROT, HBEL, EFS, DRY | ROT | "modernisera el" |
| 5 | Byte till jordade uttag | SKV-ROT, HBEL, MAT | ROT | "byta och montera vägguttag" |
| 6 | El vid kök-/badrumsrenovering | ELT, HBEL, MAT | ROT | "i samband med renovering" |
| 7 | Montering/byte av eluttag | SKV-ROT, ELT, DRY, E.SE | ROT | |
| 8 | Byte av strömbrytare och dimmer | ELT, DRY, E.SE | ROT* | "modernisera el" |
| 9 | Installation av belysning | GUL, ELT, EFS, DRY, MAT, E.SE | ROT* | inomhus; se rad 13 för utomhus |
| 10 | Infällda spotlights | SKV-ROT, ELT, DRY | ROT | listad ordagrant hos SKV |
| 11 | Installation av laddbox | SKV-GT, GUL, ELT, HBEL, EFS, DRY, MAT, E.SE | GT 50 % | laddningspunkt + kabel till elcentral ingår; **reparation** av laddbox ger varken ROT eller GT |
| 12 | Installation av solceller | SKV-GT, SKV-ROT, GUL, HBEL, EFS, MAT | GT 15 % | SKV-ROT: "installera, reparera och byta ut solceller" |
| 13 | Installation av batterilagring | SKV-GT, GUL, MAT | GT 50 % | kräver egen produktion (solceller) på fastigheten |
| 14 | Felsökning av elfel | HBEL, EFS, DRY, MAT, E.SE | **Nej** | SKV: "enbart felsöka" ger inte ROT — ROT först när reparation utförs |
| 15 | Elservice / jour | GUL, EFS, DRY | ROT* | ROT på reparationsdelen, inte på utryckningen i sig (granska) |
| 16 | Inkoppling av spishäll / vitvaror | EFS, DRY, MAT | ? | "fast anslutning av apparater" ingår i ESV:s B-auktorisation; ROT-status ej utredd |
| 17 | Smarta hem / hemautomation (KNX, Wiser) | GUL, ELT, HBEL, EFS, DRY | ? | ROT för kabeldragningen sannolik, inte utredd |
| 18 | Elinstallation i lokaler/kontor (företag, BRF) | GUL, ELT, EFS | – | B2B, ingen ROT |

## Valbara tillägg (2 källor — med i biblioteket, inte i startpaketet)

| # | Jobbtyp | Källor | ROT/GT | Anm. |
|---|---|---|---|---|
| 19 | Byte av huvudsäkring / säkringsuppgradering | DRY, (Offerta laddbox-guide) | ROT* | ofta ihop med laddbox |
| 20 | Utomhus-/fasadbelysning | EFS, DRY | ROT*/Nej | på huset: ROT*; **"dra el i trädgården" ger inte ROT** |
| 21 | Byte av termostat (golvvärme) | DRY, E.SE | ? | |
| 22 | Installation av elgolvvärme | EFS, DRY | ROT* | |
| 23 | Värmepump — elinstallation | EFS, MAT | ROT* | ROT för värmepump listas under värme/VVS, inte El — verifiera |
| 24 | Larm och passagesystem | GUL, EFS | **Nej** | SKV: "installera och reparera larm eller övervakningskameror" ger inte ROT |
| 25 | Nätverk, fiber, data/svagström | GUL, HBEL, EFS | ? | |
| 26 | Service och underhåll av elanläggning | GUL, MAT | ROT* | "reparation och underhåll" ger ROT oavsett husets ålder |
| 27 | Laddstolpe / laddstation (BRF, företag) | GUL, EFS | **Nej** (privat) | SKV: fristående laddstolpe ger inte ROT; för BRF/företag är det B2B |

## En källa — INTE med förrän någon bekräftar

| Jobbtyp | Källa | Varför tveksam |
|---|---|---|
| Montering av taklampa | DRY | ESV beskriver det som B-arbete ("uppsättning av armaturer") men bara en firma säljer det som egen jobbtyp — kan vara en underrad till "belysning" |
| IMD / gemensam el (BRF) | GUL | nisch, en firma |
| Överlåtelse-/elbesiktning | EFS | en firma; SKV: energideklaration ger inte ROT |
| Elprojektering / elentreprenad | GUL | större entreprenad, inte småfirmans vardag |

## Branschfakta för systemprompten (steg 3 — inte byggt)

Detta är sådant agenten ska *veta*, hämtat ur (a)- och (b)-källorna, inte ur firmorna:

- **Auktorisation (ESV):** B = begränsad lågspänning i befintliga gruppledningar
  (uttag, brytare, armaturer, fast anslutning av apparater); AL = alla lågspännings-
  arbeten ≤ 1 000 V AC / 1 500 V DC (ny elcentral, ny eldragning, laddbox, solceller);
  A = alla spänningsnivåer. Högre typ omfattar lägre. Företaget, inte den enskilde
  elektrikern, bär auktorisationen i sitt egenkontrollprogram.
- **ROT ges inte för (SKV):** enbart felsökning, larm/kameror, el i trädgården,
  fristående laddstolpe, reparation av laddbox, reparation av batterilager,
  energideklaration. Nybyggt hus (< 5 år) ger inte ROT för ombyggnad, men
  reparation/underhåll ger alltid ROT.
- **Grön teknik (SKV):** laddbox 50 %, batteri 50 %, solceller 15 % — på arbete
  OCH material, max 50 000 kr/person/år, separat från ROT-taket. Batteri kräver
  egen elproduktion på fastigheten.
- **Laddbox:** installationen ska i många fall föranmälas till nätägaren
  (Offerta-guiden; verifiera formuleringen mot nätägarnas regler innan den
  hamnar i en prompt).

## Vad som ännu INTE är gjort

- Fackgranskning av namnen (är "Elrenovering" det ord en elektriker använder?).
- ROT-status på raderna märkta `?` och `ROT*` — kräver Skatteverkets fullständiga
  lista eller Andreas bedömning, inte min gissning.
- Installatörsföretagens egen tjänste-/yrkesindelning (IN-sidan gav bara
  områdesnivå — de har ev. mer bakom inlogg).
- Ingen kod, ingen seed. Se `tasks/todo.md` → Branschförståelse.
