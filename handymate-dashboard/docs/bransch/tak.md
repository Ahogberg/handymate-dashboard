# Bransch: Tak (roofing) — källbelagda jobbtyper

**Status: OGRANSKAD — väntar på Andreas fackgranskning.**
Inget i den här filen seedas till konton förrän statusen är ändrad till GRANSKAD.

Syfte: startpaketet med jobbtyper som ett nytt takföretag får vid onboarding, plus
de branschfakta systemprompten för Tak ska bära (steg 3). Regeln från Andreas:
*"i verkligheten relevant, inte vad du som AI fantiserar ihop"* — varje rad har
därför minst en namngiven källa, och rader med bara en källa är markerade.

**Särskild varning i den här filen:** Tak är den bransch där ROT/RUT-gränsen är
som rörigast. Se avsnittet "ROT/RUT-gränsen för tak" nedan — taktvätt och
snöskottning ligger nära varandra i säsong men får **olika** skattereduktion
enligt Skatteverkets egen ordalydelse.

## Källor

Hierarki: (a) myndighet/branschorganisation → (b) Skatteverkets ROT/RUT →
(c) riktiga firmors tjänstelistor/marknadsplatser → (d) fackgranskning (Andreas/Christoffer).

| Kod | Källa | Typ |
|---|---|---|
| AV | [Arbetsmiljöverket — Arbete med fallrisk](https://www.av.se/produktion-industri-och-logistik/bygg/arbetsmiljorisker-vid-byggnads--och-anlaggningsarbete/arbete-med-fallrisk/) | a |
| BOV | [Boverket — Ändra fasad eller tak](https://www.boverket.se/sv/byggande/bygglov-rivningslov-marklov-och-anmalan/vad-far-jag-bygga-utan-bygglov/andra-fasad-eller-tak/) | a |
| PVF | [Plåt & Ventföretagen — Trygg Plåt-auktorisation](https://www.pvforetagen.se/branschfakta/branschfakta-plat/tryggplat/) | a |
| SKV-ROT | [Skatteverket — Ger arbetet rätt till rotavdrag? (företag)](https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut/gerarbetetratttillrotavdrag.4.5c1163881590be297b5173bf.html) | b |
| SKV-RUT | [Skatteverket — Ger arbetet rätt till rutavdrag? (företag)](https://www.skatteverket.se/foretag/skatterochavdrag/rotochrut/gerarbetetratttillrutavdrag.4.2ef18e6a125660db8b080001531.html) | b |
| NT | [Nytt Tak i Sthlm AB](https://www.nytttakisthlm.se/tjanster/) | c |
| DB | [DB Tak & Entreprenad](https://dbtak.se/start-2/) | c |
| ALX | [Alimax Bygg & Tak AB](https://alimaxbygg.se/) | c |
| ÄT | [Älvsjö Tak AB](https://www.alvsjotak.se/) | c |
| STL | [Stockholm Takläggare](https://www.xn--stockholmtaklggare-xtb.se/) | c |
| TL1 | [Taklabbet — takrengöring och mossbekämpning](https://www.taklab1.se/takrengoring-och-mossbekampning) | c (taktvätt-specialist) |
| OFF | [Offerta.se — Takläggning & Plåtslagare](https://offerta.se/bygg-och-renovering/taklaggning/) | c (efterfrågesida) |

Firmorna är hämtade som exempel på hur riktiga tak-/plåtfirmor i Stockholmsområdet
själva beskriver sitt utbud; Offerta visar vad *kunder* efterfrågar. Taklabbet är
medvetet valt som specialistfirma inom taktvätt/mossbekämpning eftersom den frågan
är särskilt viktig att få rätt.

**Teknisk anmärkning om BOV:** boverket.se renderar sidinnehållet med JavaScript,
och WebFetch fick trots upprepade försök bara ut navigationsmenyn, aldrig
brödtexten. Formuleringen under Boverket-raden nedan är hämtad via en sökmotorträff
som citerar boverket.se ordagrant (samma mening återfinns hos flera kommuners
bygglovssidor som hänvisar till Boverket). **Bör verifieras manuellt mot den
levande sidan innan den låses som fakta.**

## Föreslaget startpaket (≥3 källor)

ROT-kolumnen: **ROT** = Skatteverket listar arbetet uttryckligen; **RUT** = Skatteverket
listar arbetet uttryckligen som rutarbete; **ROT*** = följer av Skatteverkets
formulering men listas inte ordagrant för just denna variant — granska;
**Nej** = Skatteverket säger uttryckligen nej; **?** = inte utrett.

| # | Jobbtyp (förslag på namn) | Källor | ROT/RUT | Anm. |
|---|---|---|---|---|
| 1 | Takomläggning / takbyte (tegel, betong, plåt, papp) | SKV-ROT, NT, DB, ALX, ÄT, STL | ROT | SKV: "reparera, rengöra eller byta ut plåttak" + "byta ... takpannor" |
| 2 | Reparation och lagning av tak | SKV-ROT, NT, DB, ALX, ÄT, STL | ROT | SKV: "byta och reparera fasader, hängrännor och takpannor" |
| 3 | Taktvätt / mossbekämpning / algbehandling | SKV-ROT, SKV-RUT, ÄT, STL, TL1, ALX, OFF | **ROT (ej RUT)** | Se ROT/RUT-avsnittet nedan — Skatteverket utesluter uttryckligen takrengöring från RUT |
| 4 | Snöskottning från tak | SKV-RUT, DB, ÄT | **RUT** | SKV ordagrant: "Rutavdrag ges för att skotta snö på uppfarter, hus- och garagetak samt gårdsplaner" + "ta bort istappar" |
| 5 | Hängrännor och stuprör (byte, reparation, rensning) | SKV-ROT, NT, ALX, STL | ROT | SKV: "byta ut plåttak, hängrännor och stuprör" |
| 6 | Plåtarbeten / plåtslageri (bandtäckning, nock, plåtdetaljer) | SKV-ROT, NT, DB, ÄT, STL | ROT | del av samma SKV-formulering som rad 1 |
| 7 | Takmålning (yttertak/plåttak) | DB, ÄT, STL | **?** | **VARNING:** SKV:s "måla golv, tak, väggar, fönster" under "Målning och tapetsering" står ihop med golv/väggar — det är sannolikt **innertak**, inte yttertak. Ingen SKV-formulering hittad som uttryckligen gäller målning av yttertak/plåttak — granska innan ROT sätts |
| 8 | Takbesiktning | NT, ALX, ÄT | ? | jämför El-branschens "enbart felsöka" som inte gav ROT — samma logik kan gälla besiktning av tak, inte utrett |
| 9 | Installation av taksäkerhet (snörasskydd, glidskydd, takstege) | ALX, STL, DB, ÄT | ? | inte funnet i SKV:s lista över tak/plåt-arbeten — granska |

## Valbara tillägg (2 källor — med i biblioteket, inte i startpaketet)

| # | Jobbtyp | Källor | ROT/RUT | Anm. |
|---|---|---|---|---|
| 10 | Takfönster (installation/byte) | NT, ALX | ROT* | SKV nämner generellt "reparera eller byta ut fönster" (Glas och plåt), men "takfönster" specifikt är inte ordagrant funnet |
| 11 | Bandtäckning (fogfritt plåttak) | DB, ALX | ROT* | teknisk variant av "byta ut plåttak" (rad 1/6), inte egen SKV-rad |

## En källa — INTE med förrän någon bekräftar

| Jobbtyp | Källa | Varför tveksam |
|---|---|---|
| Nybyggnation/tillbyggnad av tak (takkupa) | ALX | SKV säger uttryckligen nej till "bygga ett helt nytt hus"; regler för tillbyggnad/takkupa på befintligt hus är en annan fråga och inte utredd — bara en firma nämner det som egen tjänst |
| Skorstensbeslag / plåtarbete vid anslutning mot skorsten | NT | kan vara en underrad till "Plåtarbeten" (rad 6) snarare än egen jobbtyp — en firma |
| Takisolering | ALX | kan höra hemma i en isolerings-/byggbransch snarare än Tak — en firma |
| Reparation av underlagstak/underlagspapp | NT | kan vara en underrad till "Reparation och lagning av tak" (rad 2) — en firma |
| Vindskivor | STL | nischdetalj, en firma |

## ROT/RUT-gränsen för tak (utrett mot Skatteverket — SÄRSKILT VIKTIGT)

Detta är den mest förvirrande gränsen i hela ROT/RUT-systemet eftersom taktvätt
och snöskottning från tak säljs av samma firmor, ofta i samma säsong, men faller
på olika sidor av gränsen:

- **Snöskottning av tak = RUT.** SKV-RUT, avsnitt "Skotta snö": *"Rutavdrag ges
  för att skotta snö på uppfarter, hus- och garagetak samt gårdsplaner"* samt
  *"ta bort istappar"*. Också RUT: snöröjning/sandning/saltning av trottoar om
  kommunen ålagt fastighetsägaren skötseln.
- **Taktvätt/rengöring av tak = ROT, inte RUT.** SKV-RUT, avsnitt "Trädgårdsarbete
  – underhålla, klippa och gräva": *"rensa ogräs och bekämpa mossa. Att rengöra
  tak och hängrännor ger däremot rätt [till] rotavdrag."* — Skatteverket skriver
  alltså uttryckligen ut att takrengöring **inte** är rutarbete, trots att det
  ligger i samma avsnitt som mossbekämpning i gräsmatta (som *är* RUT). Detta
  bekräftas från ROT-hållet: SKV-ROT, avsnitt "Rengöring" (Småhus): *"rengöra
  altandäck, fasader, tak, takpannor, hängrännor och solceller"* = ROT.
  Mossbekämpning/algbehandling på taket är alltså samma jobbtyp som taktvätt
  och följer ROT, inte gräsmatte-RUT-regeln.
- **Sammanfattning:** en firma som säljer "vinterpaket tak" (skotta snö +
  tvätta i samband med det) utför tekniskt sett en RUT-tjänst och en ROT-tjänst
  i samma jobb — de ska särredovisas i offert/faktura enligt Skatteverkets
  regler, inte slås ihop till en rad.

## Branschfakta för systemprompten (steg 3 — inte byggt)

Detta är sådant agenten ska *veta*, hämtat ur (a)- och (b)-källorna, inte ur firmorna:

- **Taksäkerhet/fallskydd (AV):** kollektivt fallskydd (räcken, ställning byggd
  som fallskydd) ska användas i första hand. Personligt fallskydd (sele + lina
  med falldämpare) används bara "om gemensamma fallskyddsanordningar inte är
  möjliga" eller på tak "där det inte är rimligt att sätta upp gemensamma
  fallskyddsanordningar" — och aldrig som ensamarbete. Kraven (inkl. skriftlig
  arbetsplan) gäller vid "arbete med risk för att falla 2 meter eller mer".
  Sanktionsavgift kan tas ut om arbete sker "utan fallskydd, eller med felaktigt
  fallskydd, där fallhöjden är 2 meter eller mer". Stege ska undvikas som
  arbetsplats för takarbete — tillåts bara för "kortvariga, enstaka arbeten"
  där bättre alternativ saknas.
- **Bygglov/anmälan vid takbyte (BOV, se teknisk anmärkning ovan om källan):**
  för en- och tvåbostadshus, komplementbyggnader och komplementbostadshus krävs
  varken bygglov eller anmälan för att byta kulör eller material på fasad
  eller tak. Ändringen måste ändå göras varsamt och anpassas till omgivningen,
  och får inte innebära en betydande olägenhet för grannar. Andra ändringar som
  påverkar byggnadens karaktärsdrag kan ändå kräva bygglov, liksom vissa fall
  inom detaljplan eller inom områden med försvarsintresse (då kan kommunen
  utöka bygglovsplikten till att gälla just kulör/material på tak).
- **ROT/RUT-gränsen för tak (SKV):** se eget avsnitt ovan — taktvätt/mossbekämpning
  är ROT, snöskottning från tak är RUT, de ska inte blandas ihop på samma
  fakturarad.
- **Tak i bostadsrätt/gemensamma ytor (SKV):** takarbete i en bostadsrätt ger
  **inte** rätt till rotavdrag eftersom tak räknas som gemensam egendom (samma
  princip för trapphus och fasad). I ägarlägenhet ger rengöring av tak,
  takpannor och hängrännor heller inget avdrag, till skillnad från
  altandäcksrengöring som är godkänt där.
- **Trygg Plåt (PVF):** branschens egen auktorisation för plåt-/takentreprenörer,
  utvecklad av Plåt & Ventföretagen och genomförd av certifieringsorganet
  INCERT. Sidan specificerar inte i klartext vilka enskilda tjänster (taktäckning,
  skorstensbeslag etc.) som ingår i kravbilden — bara att den handlar om
  policy/rutiner, kvalitet/miljö/arbetsmiljö, projektstyrning, AB 04/ABT 06 och AMA.

## Vad som ännu INTE är gjort

- Fackgranskning av namnen (är "Takomläggning" respektive "Takbyte" samma sak för
  en takläggare, eller två olika jobbtyper med olika omfattning?).
- ROT-status på raderna märkta `?` och `ROT*` — särskilt takmålning (rad 7) där
  SKV-formuleringen om "måla tak" med stor sannolikhet avser innertak, inte
  yttertak, och därför INTE ska tolkas som stöd för ROT på extern takmålning
  utan vidare verifiering.
- Boverket-raden (BOV) är hämtad via sökmotorträff, inte en lyckad direkt
  WebFetch (sidan är JS-renderad) — bör läsas om manuellt på boverket.se innan
  den låses som fakta i en systemprompt.
- Plåt & Ventföretagens egen tjänste-/yrkesindelning gav ingen konkret lista
  över jobbtyper (startsidan och Trygg Plåt-sidan är riktade mot arbetsgivare/
  utbildning, inte en kundvänd tjänstelista) — Sveriges Takentreprenörer (TIB)
  undersöktes också men gav samma resultat, ingen konkret tjänstelista i det
  hämtade innehållet.
- Ingen kod, ingen seed. Se `tasks/todo.md` → Branschförståelse.
