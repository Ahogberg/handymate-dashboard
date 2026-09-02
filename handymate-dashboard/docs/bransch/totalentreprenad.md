# Bransch: Totalentreprenad (general_contractor) — källbelagda jobbtyper

**Status: OGRANSKAD — väntar på Andreas fackgranskning.**
Inget i den här filen seedas till konton förrän statusen är ändrad till GRANSKAD.

Syfte: samma övning som `el.md`, men för ett specialfall. Regeln från Andreas:
*"i verkligheten relevant, inte vad du som AI fantiserar ihop"* — varje rad har
därför minst en namngiven källa, och rader med bara en källa är markerade.

## Varför det här är ett specialfall, inte ett hantverk

Totalentreprenad är inte ett yrke som El eller Måleri — det är en **entreprenadform**:
en juridisk roll (regleras av standardavtalet ABT 06) där firman tar helhets-
ansvar för både projektering och utförande, och ofta samordnar underentreprenörer
inom El, VVS, Snickeri, Måleri osv. Det finns redan en separat bransch `construction`
("Bygg") i `lib/branch/index.ts` för byggfirmor som själva utför byggarbete.
`general_contractor` ("Totalentreprenad") är alltså specifikt rollen/avtalsformen,
inte ett eget hantverk med egna verktyg. Se avsnittet **"Ska den här branschen ha
en egen jobbtypslista?"** nedan för slutsatsen.

## Källor

Hierarki: (a) branschorganisation/juridik → (b) Skatteverkets ROT → (c) riktiga
firmors tjänstelistor.

| Kod | Källa | Typ |
|---|---|---|
| BHR | [Byggherrarna — AB 04 och ABT 06, standardavtal](https://www.byggherre.se/vara-fragor/upphandling-avtal-och-juridik/standardavtal/ab-04-och-abt-06) | a (branschorganisation för byggherrar) |
| VASA | [Vasa Advokatbyrå — Vem är byggherre vid totalentreprenad?](https://www.vasaadvokat.se/vem-ar-byggherre-vid-totalentreprenad/) | a-adjacent (advokatbyrå, juridisk vägledning — inte myndighet) |
| SKV-ROT | [Skatteverket — Ger arbetet rätt till rotavdrag?](https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut/gerarbetetratttillrotavdrag.4.5c1163881590be297b5173bf.html) | b |
| SKV-FTG | [Skatteverket — Så fungerar rotavdraget för företag](https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut/safungerarrotavdraget.4.2ef18e6a125660db8b080002709.html) | b |
| PALMA | [Palma Bygg, Stockholm](https://palmabygg.se/) | c |
| BYGGEST | [Byggest — Totalrenovering](https://www.byggest.se/tjanster/totalrenovering/) | c |
| ENTHUS | [Entreprenadhuset — Totalrenovering Stockholm](https://entreprenadhuset.se/totalrenovering-stockholm/) | c |
| HBL | [H&B Larsson — Totalentreprenad](https://hblarsson.com/totalentreprenad/) | c |
| SODERORT | [Söderort Bygg & Entreprenad (husrenoveringstockholm.se)](https://www.husrenoveringstockholm.se/) | c |

**Bortfall (försökt, gav ingen citerbar text):** Byggföretagens egna sidor
(`byggforetagen.se`, samt underdomänen `entreprenadratt.byggforetagen.se`) och
Boverkets PBL-kunskapsbank (`byggherrens-ansvar`, `kontrollansvariga-och-deras-uppgifter`)
är JS-renderade — WebFetch fick bara navigationsmenyn, ingen artikeltext, trots
flera försök på olika undersidor. De är därför **inte** använda som källor här,
även om de nämns i uppdraget. Byggherrarna (byggherre.se) och Vasa Advokatbyrå
används i stället för branschjuridik-delen.

## Ska den här branschen ha en egen jobbtypslista?

**Slutsats: en liten, entreprenörsspecifik startlista — inte en lista med
hantverksrader.** Motivering, byggd på vad firmorna faktiskt visade:

1. **Firmorna säljer paket, inte hantverk.** Alla fem undersökta totalentreprenad-
   firmor säljer samma sak som en Bygg-/renoveringsfirma skulle sälja
   (badrumsrenovering, köksrenovering, tillbyggnad) — skillnaden är att de säljer
   det **nyckelfärdigt, med en projektledare och samordningsansvar** (HBL:
   *"projektering, arbetsmiljöansvaret, samordningsansvaret samt genomförandet av
   arbetena"*; Entreprenadhuset: *"Du får en egen projektledare som är med dig
   från början"*). Det entreprenörsspecifika är alltså paketeringen och rollen,
   inte hantverksmomenten i sig.
2. **Enskilda hantverksrader dök upp hos bara en firma i taget** — Byggest ensam
   nämnde stambyte, källarvåningsrenovering och smarta hem/automation (den sistnämnda
   redan täckt i `el.md` rad 17). Fönsterbyte och golvläggning nämndes av två firmor
   (Byggest + H&B Larsson) men hör hemma i en framtida Snickeri- respektive
   Golv-branschfil, inte här — annars dubbeldokumenterar vi samma jobbtyp i två filer.
3. **Koden stödjer redan detta.** `lib/branch/index.ts` har `secondary_branches`
   inbyggt (`resolveBusinessBranch`). Rekommendationen är att en totalentreprenör
   väljer `general_contractor` som primär bransch och lägger till El/VVS/Snickeri/
   Måleri/Bygg (`construction`) som sekundära branscher — och att biblioteket då
   slår upp jobbtyper i alla dem. Det är rätt lösning tekniskt sett, inte bara en
   pragmatisk kompromiss.
4. **De rader som ÄR kvar** (totalrenovering, badrumsrenovering/köksrenovering
   nyckelfärdigt, tillbyggnad, projektledning) är äkta — de beskriver vad kunden
   specifikt köper av *totalentreprenören som roll*, inte av en enskild hantverkare.

## Föreslaget startpaket (≥3 källor)

ROT-kolumnen: **ROT** = Skatteverket listar arbetet uttryckligen; **ROT*** = följer
av Skatteverkets formulering men kräver villkor som måste granskas per fall;
**Nej** = Skatteverket säger uttryckligen nej; **?** = inte utrett.

| # | Jobbtyp (förslag på namn) | Källor | ROT/GT | Anm. |
|---|---|---|---|---|
| 1 | Totalrenovering (nyckelfärdig helrenovering av bostad) | PALMA, BYGGEST, ENTHUS, HBL, SODERORT | ROT* | ROT gäller arbetskostnaden, huset måste vara >5 år (SKV-ROT); totalentreprenören ansöker åt kunden och måste redovisa UE:s timmar separat (SKV-FTG) |
| 2 | Badrumsrenovering, nyckelfärdigt | PALMA, BYGGEST, ENTHUS, HBL, SODERORT | ROT | ordinär renovering av befintligt badrum ger ROT enligt SKV-ROT; samma regel oavsett om totalentreprenören eller en enskild VVS-firma utför det |
| 3 | Köksrenovering, nyckelfärdigt | PALMA, BYGGEST, ENTHUS, SODERORT | ROT | "byta och reparera köksluckor" nämns uttryckligen hos SKV-ROT; övriga köksmoment följer allmän ROT-regel för renovering |
| 4 | Tillbyggnad | PALMA ("tillbyggnation"), ENTHUS, HBL | ROT* | SKV-ROT: ROT kräver att minst 75 % av en sida sitter ihop med befintlig yttervägg (eller dörr emellan) OCH att huset är äldre än 5 år — annars räknas det som ny, fristående byggnad utan ROT |
| 5 | Projektledning / byggledning under hela projektet | ENTHUS ("egen projektledare"), HBL ("effektiv projektledning"), SODERORT ("under ledning av erfaren projektledare") | ? | SKV-ROT utesluter uttryckligen att "anlita en arkitekt, kvalitetsansvarig, besiktningsman eller liknande" som fristående köp — oklart om totalentreprenörens egen samordningstid räknas som ROT-arbete när den ingår i en renoveringsfaktura eller inte; granska innan detta hamnar i en prompt som ett ROT-påstående |

## Valbara tillägg (2 källor — med i biblioteket, inte i startpaketet)

| # | Jobbtyp | Källor | ROT/GT | Anm. |
|---|---|---|---|---|
| 6 | Attefallshus / komplementbyggnad | BYGGEST, SODERORT ("Vi bygger färdiga Attefallshus") | **Nej** | SKV-ROT uttryckligen: inget avdrag för "ett helt nytt hus eller en friggebod, ett garage... eller liknande fristående byggnad" — attefallshus är nybyggnation |

## En källa — INTE med förrän någon bekräftar

| Jobbtyp | Källa | Varför tveksam |
|---|---|---|
| Stambyte | BYGGEST | en firma; hör dessutom hemma under VVS-branschen, inte totalentreprenad |
| Källarvåningsrenovering | BYGGEST | en firma; sannolikt en underrad till "Totalrenovering" |
| Smarta hem / hemautomation | BYGGEST | en firma här; redan behandlad i `el.md` rad 17 (ROT-status där: "?") |
| Fönsterbyte | BYGGEST, HBL (2 källor, men flyttad ur listan) | två källor, men det är ett hantverksmoment som hör hemma i en framtida Snickeri-branschfil — att lägga det här riskerar dubblett |
| Golvläggning | BYGGEST, HBL (2 källor, men flyttad ur listan) | samma resonemang — hör hemma i en framtida Golv-branschfil (`flooring`) |
| Nybyggnad av villa ("nyckelfärdiga hus") | HBL | en firma; ROT-status är dock entydig (**Nej** — SKV-ROT: "Det går dock aldrig att få rotavdrag för att bygga en helt ny bostad") så faktat kan ändå användas i branschfakta nedan |

## Branschfakta för systemprompten (steg 3 — inte byggt)

Detta är sådant agenten ska *veta*, hämtat ur (a)- och (b)-källorna:

- **Entreprenadform (BHR):** Vid utförandeentreprenad (AB 04) har *beställaren*
  funktionsansvar och svarar för projektering, medan entreprenören svarar för
  utförande. Vid totalentreprenad (ABT 06) är det tvärtom — *entreprenören* har
  funktionsansvar och svarar i varierande grad för både projektering och
  utförande. Det är denna omkastning av ansvar som gör totalentreprenören till en
  egen roll, inte ett eget hantverk.
- **Byggherrens ansvar kvarstår (VASA):** Även vid totalentreprenad är det
  byggherren (kunden) som formellt är avtalspart mot myndigheter — totalentreprenören
  tar över det praktiska samordningsansvaret ("samordningsansvaret samt
  genomförandet av arbetena") men byggherrerollen försvinner inte juridiskt.
- **ROT och nybyggnation (SKV-ROT):** Ingen ROT för att bygga en helt ny bostad,
  attefallshus eller annan fristående komplementbyggnad. Tillbyggnad kräver att
  minst 75 % av en sida ansluter till befintlig yttervägg (eller en dörr mellan
  byggnaderna) och att huset är äldre än fem år.
- **ROT och underentreprenörer (SKV-FTG):** Totalentreprenören — inte
  underentreprenören — ansöker om utbetalning av ROT åt kunden. Underentreprenörernas
  arbetade timmar måste redovisas separat och tydligt, annars nekas avdraget.
  Fakturan måste skilja arbetskostnad från material- och andra kostnader.
- **ROT-taket:** Du får dra av högst 30 procent av arbetskostnaden (SKV-FTG,
  ordagrant citat).

## Vad som ännu INTE är gjort

- Fackgranskning av namnen och av rad 5 (projektledning) — ROT-statusen där är
  en gissning markerad `?`, inte ett faktapåstående.
- Byggföretagens egna branschsidor kunde inte hämtas (JS-rendering) — om Andreas
  har inloggad åtkomst eller ett PDF-underlag därifrån bör det ersätta
  Byggherrarna/Vasa-källorna för (a)-delen.
- Boverkets sidor om byggherrens ansvar/kontrollansvarig kunde inte hämtas av
  samma skäl — ingen boverket-källa finns i den här filen trots att uppdraget
  bad om det.
- Ingen kod, ingen seed. Detta är enbart en researchfil.
