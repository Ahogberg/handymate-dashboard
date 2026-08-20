# Matchningsförslag för leverantörsfakturor — Design

## Bakgrund

Etapp 3 av leverantörsfaktura-omtaget (pushad 2026-08-19,
`docs/superpowers/specs/2026-08-19-leverantorsfakturor-design.md`) byggde
en helt manuell matchningskö på Karins sida: fakturor utan projekt listas,
ägaren väljer projekt och leverantör/UE själv i två dropdowns. Ingen
gissning, inget förslag.

Andreas vill nu bygga nästa steg: en deterministisk förslagsmotor som
förifyller kö-radens dropdowns baserat på leverantörens egen historik —
utan att gå via en LLM-agent och utan att någonsin tyst auto-koppla. Detta
var explicit utanför scope i Etapp 3:s spec ("agent auto-matching") men
den ursprungliga specen positionerade medvetet matchningskön på Karins
sida just för att ett framtida förslag ska kunna slås in i samma UI utan
att flytta den.

## Princip

Samma "hellre missa än gissa"-linje som resten av huset (Kvittoprincipen,
Bolagskalenderns förslag, Matte som vägrar hitta på plansteg): motorn
visar ett förslag bara när mönstret är otvetydigt. Tystnad är alltid ett
giltigt utfall. Ägaren klickar fortfarande Koppla själv — inget skrivs
förrän det klicket sker.

## Signal-scope (V1)

Bara leverantörsnamn-historik. Belopp och tidsnärhet är medvetet uteslutna
— de kräver kalibrerade trösklar/vikter som inte går att sätta rimligt
utan verklig matchningsdata, och kön är en dag gammal. Kan läggas till som
egna, separat testbara signaler senare om leverantörsnamn-historiken visar
sig otillräcklig i praktiken.

## Regel

För en kö-rad med `supplier_name = X`:

1. Hämta affärens redan matchade fakturor (`project_id IS NOT NULL`) med
   samma `supplier_name`.
2. Gruppera dem per `project_id`. Om **exakt ett** projekt har **2 eller
   fler** träffar, OCH inget annat projekt bland samma leverantörs matchade
   fakturor också har 2 eller fler träffar → föreslå det projektet.
   Annars: inget projektförslag.
3. Gör samma gruppering och samma regel oberoende för `subcontractor_id`
   (bland matchade fakturor som har ett `subcontractor_id` satt) → föreslå
   UE. Annars: inget UE-förslag.
4. Projekt- och UE-förslaget är helt oberoende av varandra — en rad kan få
   bara det ena, båda, eller inget.

Tröskeln på 2 skyddar mot att en engångshändelse (leverantören levererade
råkvist till ett projekt en gång) tolkas som ett mönster. Tvetydighets-
kontrollen (flera projekt med 2+ träffar vardera) skyddar mot leverantörer
som är spridda över många projekt (Bauhaus, Beijer) — där finns ingen
tillförlitlig "vanligaste projekt"-signal, och ett gissat förslag där är
sämre än inget.

En kö-rad räknas aldrig mot sig själv — den är per definition okopplad
(`project_id IS NULL`), alltså redan utanför den matchade mängden som
steg 1 hämtar. Inget särskilt undantag behövs för det.

## Arkitektur

**Ny fil: `lib/karin/supplier-invoice-match.ts`**

Ren, deterministisk funktion utan DB-anrop — samma idiom som
`lib/fortnox/map-supplier-invoice.ts`:

```typescript
interface MatchedInvoice {
  supplier_name: string
  project_id: string | null
  subcontractor_id: string | null
}

interface MatchSuggestion {
  project_id: string | null
  project_match_count: number
  subcontractor_id: string | null
  subcontractor_match_count: number
}

function suggestMatch(supplierName: string, matchedInvoices: MatchedInvoice[]): MatchSuggestion
```

Funktionen filtrerar `matchedInvoices` till samma `supplier_name`, kör
grupperingsregeln ovan oberoende för `project_id` och `subcontractor_id`,
och returnerar `null` för de fält där ingen otvetydig kandidat finns.

**Modifierad: `app/api/karin/supplier-invoices/route.ts` (GET)**

Efter den befintliga hämtningen av okopplade rader (`project_id IS NULL`),
lägg till en andra fråga mot samma tabell för samma `business_id` med
`project_id IS NOT NULL`, välj `supplier_name, project_id, subcontractor_id`.
Kör `suggestMatch()` per okopplad rad. Slå upp projektnamn (`project`-
tabellen) och UE-namn (`subcontractor`-tabellen) för de föreslagna ID:na
som redan finns i träffmängden (max en handfull uppslag, inte en per rad)
och bifoga i svaret:

```typescript
{
  ...existing queue row fields,
  suggested_project_id: string | null,
  suggested_project_name: string | null,
  suggested_project_match_count: number,
  suggested_subcontractor_id: string | null,
  suggested_subcontractor_name: string | null,
  suggested_subcontractor_match_count: number,
}
```

**Modifierad: `app/dashboard/karin/page.tsx` (`LeverantorsfakturaRad`)**

Radens lokala state för valt projekt/UE initieras till
`suggested_project_id`/`suggested_subcontractor_id` (fortfarande vanliga,
redigerbara `<select>`-element — ägaren kan byta innan Koppla). Om något
av fälten har ett förslag, visa en liten rad under dropdownarna:
"Föreslaget — kopplad hit N gånger förut" (N = respektive
`match_count`). Ingen egen bekräfta-knapp för förslaget separat — samma
Koppla-knapp som idag skriver vad som än står i dropdownarna vid
klicktillfället, oavsett om det är förslaget eller ett manuellt val.

## Datakälla och tenant-isolering

Historik-frågan filtreras på samma `business_id` som redan sätts av
`getAuthenticatedBusiness` i rutten — ingen leverantörshistorik läcker
mellan företag. Ingen ny databastabell, inget nytt index (frågan går mot
befintliga `supplier_invoices.business_id`/`project_id`-kolumner som
redan är indexerade sedan tidigare).

## Edge-fall

- Ny leverantör utan historik → `suggestMatch` returnerar `null` för båda
  fälten, dropdownarna startar tomma precis som idag.
- Leverantör med exakt 1 tidigare koppling → inget förslag (under
  tröskeln).
- Leverantör kopplad till två olika projekt 2+ gånger vardera → inget
  projektförslag (tvetydigt), men kan ändå få ett UE-förslag om UE-sidan
  råkar vara otvetydig (fälten är oberoende).
- Leverantör kopplad till ett projekt men aldrig till någon UE → bara
  projektförslag, UE-dropdownen förblir tom.

## Testning

- `tests/facit-supplier-invoice-match.spec.ts`: rena tester på
  `suggestMatch` — under tröskel (0 och 1 träff → inget förslag), exakt
  tröskel (2 träffar → förslag), tvetydighet (två projekt med 2+ vardera
  → inget förslag), projekt och UE oberoende av varandra, tom historik.
- Facit-test på API-rutten: svaret bär de sex nya fälten, historik-frågan
  filtrerar på `project_id IS NOT NULL` och rätt `business_id`.
- Facit-test på UI: dropdownarna initieras med `suggested_*`-värden när de
  finns, motiveringstexten renderas villkorligt, Koppla-anropet skickar
  vad som faktiskt står i dropdownen (inte nödvändigtvis det ursprungliga
  förslaget, om ägaren ändrat det).
- Regression: `tests/facit-karin-supplier-invoice-queue.spec.ts` (Etapp
  3:s befintliga tester) och `tests/permission-contract.spec.ts` ska
  förbli gröna — ingen ändring av rollgrind eller kontraktsyta i denna
  omgång.

## Utanför scope (medvetet, samma linje som Etapp 3)

- Belopp- och tidsnärhet-signaler.
- Riktig agent-/LLM-läsning av projektbeskrivning eller materiallista.
- Tyst auto-koppling utan klick.
- Lärande över flera företag (alltid `business_id`-skopat).
- Ändrad tröskel eller vikter baserat på faktisk träffsäkerhet — inget
  facit finns än för att mäta det; kan bli en egen uppföljning senare när
  kön har körts ett tag.
