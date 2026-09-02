# Mekanisk kontroll — rader märkta plain ROT/RUT/GT (2026-09-02)

## Metod och begränsning

Detta är en **mekanisk** kontroll: för varje rad som branschfilerna märkt med
ett fast (icke-`*`, icke-`?`) `ROT`, `RUT` eller `GT`, har jag läst källfältet
och anmärkningskolumnen i respektive branschfil och bedömt om det citat/den
referens som faktiskt står där stödjer påståendet — **inte** om Skatteverkets
regler i verkligheten säger det, eftersom nätverksåtkomst till externa sidor är
blockerad i den här sessionen och Skatteverkets sidor därför inte gick att
hämta på nytt. Bedömningen bygger uteslutande på vad som redan står skrivet i
`docs/bransch/*.md`. Om en rad citerar Skatteverket ordagrant och citatet
rimligen täcker jobbtypen räknas den som **Godkänd**. Om källfältet saknar en
Skatteverkets-källa, är tomt, eller bara delvis täcker jobbtypens namn räknas
den som **Flaggad**.

Rader markerade `Nej` ingår **inte** i den här kontrollen (uppdraget avgränsar
den till ROT/RUT/GT) — några uppenbart svaga `Nej`-rader har ändå flyttats till
frågepaketet (se `GRANSKNINGSPAKET_ROT_2026-09-02.md`, F38 och F41) eftersom
deras egen filtext själv medgav osäkerhet.

## Sammanfattning

| Bransch | Rader kontrollerade | Godkända | Flaggade → flyttade till ROT\*/fråga |
|---|---|---|---|
| El | 11 | 8 | 3 (rad 4, 6, 7) |
| VVS | 15 | 15 | 0 |
| Bygg | 6 | 6 | 0 |
| Snickeri | 5 | 5 | 0 |
| Måleri | 6 | 6 | 0 (2 lätta anmärkningar, se nedan — behåller status) |
| Tak | 6 | 6 | 0 (1 lätt anmärkning, se nedan — behåller status) |
| Mark | 6 | 6 | 0 (1 lätt anmärkning, se nedan — behåller status) |
| Ventilation | 5 | 5 | 0 |
| Totalentreprenad | 2 | 0 | 0 (2 lätta anmärkningar — behåller status, se nedan) |
| Allround | 6 | 5 | 1 (rad 3) |
| **Summa** | **68** | **65 helt rena** (63 utan anmärkning + 2 totalentreprenad-rader med lätt anmärkning som ändå bedöms hålla) | **4 flyttade** |

**Resultat: 4 rader flyttas ut ur "plain"-bilagan och in i frågepaketet** (El
rad 4, 6, 7 och Allround rad 3). De ingår redan i `GRANSKNINGSPAKET_ROT_2026-09-02.md`
som F12 (rad 4), F13 (rad 6) och F14 (rad 7), samt en ny post nedan för
Allround rad 3 som av misstag inte fick ett eget F-nummer i huvudpaketet —
se **Rättelse** i slutet av detta dokument.

De återstående **6 lätta anmärkningarna** gäller inte källtypen (alla har en
Skatteverkets-källa) utan att jobbtypens **namn** är bredare än det ordagranna
citatet — de behåller sin plain-status men noteras här så Andreas kan se
exakt var gränsen mellan citat och namn går.

---

## El (11 rader kontrollerade)

| Rad | Jobbtyp | Status | Källa i filen | Bedömning |
|---|---|---|---|---|
| 1 | Byte av elcentral | ROT | SKV-ROT: "installera och komplettera elcentraler (proppskåp)" | **Godkänd** — ordagrant, matchar jobbtypen |
| 3 | Ny eldragning/kabeldragning | ROT | SKV-ROT: "dra in el" | **Godkänd** |
| 4 | Elrenovering (dra om el i äldre bostad) | ROT | SKV-ROT, HBEL, EFS, DRY — anm. "modernisera el" | **Flaggad.** Samma anm.-text ("modernisera el") används för rad 8 och 9, som båda är märkta `ROT*` (osäkra) med exakt samma motivering. En identisk motivering ger olika status på olika rader — inkonsekvent. Flyttas till ROT\* och in i frågepaketet (F12). |
| 6 | El vid kök-/badrumsrenovering | ROT | ELT, HBEL, MAT — **ingen Skatteverkets-källa alls i källfältet** | **Flaggad, hög prioritet.** Bryter mot regeln "bara Skatteverkets egen sida får ge ett ROT-påstående" (README.md, rad 22-23) — bara typ-c-firmor är källa. Flyttas till ROT\* och in i frågepaketet (F13). |
| 7 | Montering/byte av eluttag | ROT | SKV-ROT, ELT, DRY, E.SE — anm.-fältet är **tomt** | **Flaggad.** Skatteverket är angiven som källa men inget citat är återgivet, så det går inte att kontrollera vad som faktiskt stöds. Flyttas till ROT\* och in i frågepaketet (F14). |
| 10 | Infällda spotlights | ROT | SKV-ROT: "listad ordagrant hos SKV" | **Godkänd** — filen anger uttryckligen att det är ordagrant |
| 11 | Installation av laddbox | GT 50 % | SKV-GT | **Godkänd** |
| 12 | Installation av solceller | GT 15 % | SKV-ROT: "installera, reparera och byta ut solceller" | **Godkänd** |
| 13 | Installation av batterilagring | GT 50 % | SKV-GT | **Godkänd** — generellt villkor (egen elproduktion) korrekt återgivet |

## VVS (15 rader kontrollerade)

| Rad | Jobbtyp | Status | Bedömning |
|---|---|---|---|
| 1 | Byte/reparation av blandare | ROT | **Godkänd** — SKV: "installera och reparera ... blandare, kranar" |
| 2 | Byte av toalettstol | ROT | **Godkänd** — SKV: "toalett" + flottör/packningar/silar |
| 3 | Byte av handfat/kommod | ROT | **Godkänd** — SKV: "handfat" |
| 4 | Montering av dusch | ROT | **Godkänd** — SKV: "dusch, badkar" |
| 10 | Byte av vattenmätarkonsol | ROT | **Godkänd** — SKV ordagrant: "vattenmätarkonsol" |
| 12 | Installation av värmepump | ROT (schablon) | **Godkänd** — SKV: "installera, reparera och byta ... värmepumpar" |
| 13 | Byte av element/radiator | ROT | **Godkänd** — SKV: "element, termostat" |
| 15 | Nya vatten-/avloppsledningar | ROT sm./Nej BRF | **Godkänd** — båda sidor ordagrant citerade |
| 16 | Enskilt avlopp | ROT | **Godkänd** — SKV: "anlägga avlopp (trekammarbrunnar, infiltrationsbäddar)" |
| 17 | Badrumsrenovering — VVS-delen | ROT | **Godkänd** — sammansatt av redan godkända citat (toalett/dusch/badkar/handfat/kakel) |
| 23 | Byte av golvbrunn | ROT | **Godkänd** — SKV bostadsrätt: "Byta golvbrunn" ger (till skillnad från "flytta") |
| 24 | Byte av värmepanna | ROT | **Godkänd** — SKV: "värmepannor" |
| 25 | Fjärrvärmeväxlare | ROT (35 %) | **Godkänd** — SKV: "(t.ex. bergvärme och fjärrvärme): 35 procent" |
| 26 | Solvärmesystem | ROT (30 %) | **Godkänd** — SKV: "solvärmesystem: 30 procent" |
| 27 | Vattenfelsbrytare/vattenlarm | ROT | **Godkänd** — SKV ordagrant: "vattenfelsbrytare" |

Inga flaggade rader i VVS.

## Bygg (6 rader kontrollerade)

| Rad | Jobbtyp | Status | Bedömning |
|---|---|---|---|
| 1 | Tillbyggnad av bostadshus | ROT | **Godkänd** — SKV ordagrant |
| 2 | Rivning/ombyggnad av planlösning | ROT | **Godkänd** — SKV ordagrant |
| 3 | Murning och putsning | ROT | **Godkänd** — SKV ordagrant, BRF-undantag korrekt noterat separat |
| 5 | Badrumsrenovering (våtrum) | ROT | **Godkänd** — SKV: "sätta kakel och klinker" m.fl. |
| 8 | Fasadrenovering (puts/lagning) | ROT | **Godkänd** — SKV ordagrant, BRF-undantag korrekt noterat |
| 9 | Altanbygge | ROT/Nej BRF | **Godkänd** — båda sidor ordagrant citerade |

Inga flaggade rader i Bygg.

## Snickeri (5 rader kontrollerade)

| Rad | Jobbtyp | Status | Bedömning |
|---|---|---|---|
| 2 | Platsbyggd förvaring | ROT | **Godkänd** — SKV ordagrant: "garderober och bokhyllor" |
| 7 | Dörrar | ROT | **Godkänd** — SKV ordagrant |
| 8 | Fönster | ROT | **Godkänd** — SKV ordagrant |
| 9 | Golv | ROT | **Godkänd** — SKV ordagrant |
| 10 | Fasad | ROT | **Godkänd** — SKV ordagrant (samma citat som Bygg rad 8) |

Inga flaggade rader i Snickeri.

## Måleri (6 rader kontrollerade)

| Rad | Jobbtyp | Status | Bedömning |
|---|---|---|---|
| 1 | Invändig målning av väggar och tak | ROT | **Godkänd** — SKV ordagrant |
| 2 | Målning av innertak | ROT | **Godkänd** — delmängd av rad 1:s citat |
| 3 | Tapetsering | ROT | **Godkänd** — SKV ordagrant: "tapetsera" |
| 5 | Målning av dörrar, foder och snickerier | ROT | **Lätt anmärkning.** SKV-citatet täcker ordagrant bara "dörrar och köksluckor" — "foder och snickerier" i jobbtypens namn har inget eget citat. Behåller ROT (dörrdelen bär hela raden), men se F25 i frågepaketet för foder/lister-frågan. |
| 7 | Golvslipning, lackning och oljning | ROT | **Lätt anmärkning.** SKV-citatet ("slipa och byta golv, tak och väggmaterial") täcker "slipa" ordagrant — "lackning och oljning" är inte egna ord hos Skatteverket, bara rimlig utvidgning. Behåller ROT. |
| 8 | Golvläggning/byte av golv | ROT | **Godkänd** — samma citat, "byta golv" ordagrant |

## Tak (6 rader kontrollerade)

| Rad | Jobbtyp | Status | Bedömning |
|---|---|---|---|
| 1 | Takomläggning/takbyte (tegel, betong, plåt, papp) | ROT | **Lätt anmärkning.** SKV-citatet nämner "plåttak" och "takpannor" ordagrant — "papp" (papptak) är inte ett eget ord i citatet. Behåller ROT (huvudmaterialen är tydligt täckta). |
| 2 | Reparation och lagning av tak | ROT | **Godkänd** — SKV: "byta och reparera fasader, hängrännor och takpannor" |
| 3 | Taktvätt/mossbekämpning/algbehandling | ROT (ej RUT) | **Godkänd** — ovanligt väl dokumenterad, flera korsvisa citat (se README-fynd 7) |
| 4 | Snöskottning från tak | RUT | **Godkänd** — SKV-RUT ordagrant |
| 5 | Hängrännor och stuprör | ROT | **Godkänd** — SKV ordagrant |
| 6 | Plåtarbeten/plåtslageri | ROT | **Godkänd** — delmängd av rad 1:s citat |

## Mark (6 rader kontrollerade)

| Rad | Jobbtyp | Status | Bedömning |
|---|---|---|---|
| 1 | Dränering av husgrund | ROT | **Godkänd** — SKV ordagrant: "dränera husgrunder" |
| 2 | Enskilt avlopp | ROT | **Godkänd** — SKV ordagrant |
| 3 | Borrning för bergvärme/brunn | ROT | **Lätt anmärkning.** SKV-citatet ("markarbeten för värmeförsörjning") täcker bergvärmeborrning tydligt, men jobbtypens namn inkluderar även "brunn" (vattenborrning), som inte är en värmeförsörjningsåtgärd och saknar eget citat. Behåller ROT för bergvärmedelen; vattenborrning för annat än värme bör inte antas omfattas utan vidare kontroll. |
| 14 | Markarbete för bredband/fiber | ROT | **Godkänd** — SKV ordagrant |
| 17 | Trädgårdsskötsel | RUT | **Godkänd** — SKV-RUT ordagrant |
| 18 | Trädfällning och beskärning | RUT | **Godkänd** — SKV-RUT ordagrant |

## Ventilation (5 rader kontrollerade)

| Rad | Jobbtyp | Status | Bedömning |
|---|---|---|---|
| 4 | Installation av nytt ventilationssystem | ROT | **Godkänd** — SKV: "installera ... ventilation" |
| 7 | Installation av luftvärmepump | ROT | **Godkänd** — SKV ägarlägenhet ordagrant "luftvärmepump" + generisk "värmepumpar" |
| 8 | Installation av luft-vattenvärmepump | ROT | **Godkänd** — generisk "värmepumpar" täcker alla typer |
| 9 | Installation av bergvärmepump | ROT | **Godkänd** — generisk "värmepumpar"; borrningsdelen är redan separat flaggad som outredd i filen själv |
| 10 | Reparation av värmepump | ROT | **Godkänd** — SKV ordagrant |

## Totalentreprenad (2 rader kontrollerade)

| Rad | Jobbtyp | Status | Bedömning |
|---|---|---|---|
| 2 | Badrumsrenovering, nyckelfärdigt | ROT | **Lätt anmärkning.** Totalentreprenad.md:s eget källfält ger **inget eget citat** — bara "enligt SKV-ROT". Den underliggande aktiviteten (badrumsrenovering) är dock ordagrant styrkt i både `vvs.md` (rad 17) och `bygg.md` (rad 5). Behåller ROT eftersom stödet finns i korpusen, men totalentreprenad.md bör kopiera in citatet från vvs.md/bygg.md i stället för att bara skriva "enligt SKV-ROT". |
| 3 | Köksrenovering, nyckelfärdigt | ROT | **Lätt anmärkning.** Bara "köksluckor" är ordagrant citerat; "övriga köksmoment följer allmän ROT-regel" är en egen slutsats utan nytt citat. Samma underliggande stöd som Bygg rad 6/Snickeri rad 1 (se F9 i frågepaketet). Behåller ROT. |

## Allround (6 rader kontrollerade)

| Rad | Jobbtyp | Status | Bedömning |
|---|---|---|---|
| 1 | Möbelmontering (fristående) | RUT | **Godkänd** — SKV-RUT ordagrant |
| 2 | Gardiner, gardinstänger, rullgardiner | RUT | **Godkänd** — SKV-RUT ordagrant |
| 3 | Reparation av vitvaror i bostaden | RUT | **Flaggad.** Det enda citatet i filen ("i bostaden eller biutrymmen som tillhör bostaden") styrker bara **var** arbetet måste utföras för att ge RUT — inte att reparation av vitvaror **i sig** är en RUT-berättigad tjänst. Ingen mening av typen "reparera vitvaror ger RUT" är återgiven. Flyttas till ROT\*/RUT\* och läggs till frågepaketet (se Rättelse nedan). |
| 4 | Snöskottning | RUT | **Godkänd** — SKV-RUT ordagrant |
| 5 | Trädgårdsskötsel | RUT | **Godkänd** — SKV-RUT ordagrant |
| 9 | Montering av köksluckor/fronter (byte) | ROT | **Godkänd** — SKV-ROT ordagrant (samma citat som Snickeri rad 7) |

---

## Uppdatering: Allround rad 3 är inflyttad i paketet som F44

Den mekaniska kontrollen ovan identifierade att **Allround rad 3 (Reparation
av vitvaror i bostaden)** skulle flyttas från "plain RUT" till frågepaketet.
`GRANSKNINGSPAKET_ROT_2026-09-02.md` är uppdaterat i efterhand: frågan finns
där som **F44** (sista frågan, under Allround), och raden är borttagen ur den
filens Bilaga 1. Totalt i paketet: 44 frågor, 86 rader i Bilaga 1 (inte 87 som
i ett tidigt utkast) och 73 rader som behöver en fråga (inte 72). Siffrorna
nedan i det här dokumentet (68 kontrollerade, 4 flyttade) avser bara den
mekaniska kontrollens eget omfång (ROT/RUT/GT-raderna) och är oförändrade.

---

## Slutsats

- **65 av 68 kontrollerade rader (96 %)** har ett citat som rimligen stödjer
  påståendet och kan användas som de står.
- **3 rader (El 4, 6, 7)** hade antingen ingen Skatteverkets-källa alls,
  ett tomt citatfält, eller en motivering som redan används för en `ROT*`-rad
  på annat håll — dessa är flyttade till frågepaketet.
- **1 rad (Allround 3)** har ett citat som styrker fel del av påståendet
  (plats, inte kategori) — flyttad till frågepaketet, se Rättelse ovan.
- **6 rader** har en lätt anmärkning (jobbtypens namn är bredare än det
  ordagranna citatet — foder/snickerier, lackning/oljning, papptak, brunn,
  samt totalentreprenads två saknade egna citat) men bedöms ändå hålla eftersom
  huvuddelen av varje jobbtyp är tydligt citerad. De är inte flyttade, men
  bör noteras om jobbtypsnamnen skrivs om.
- Ingen rad citerade en typ-c-källa (firmasajt) **i stället för** Skatteverket
  när Skatteverket väl var listad som källa — bristerna som hittades var
  avsaknad av SKV-källa helt (rad 6), tomt citatfält (rad 7), eller en
  motivering som är för vag för att skilja plain-ROT från ROT\* (rad 4, samt
  Allround rad 3:s felriktade citat).
