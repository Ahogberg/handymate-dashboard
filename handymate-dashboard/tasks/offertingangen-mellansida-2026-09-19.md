# Ingången till ny offert — Andreas vänder på rivningsbeslutet

**2026-09-19, 02:30.** Efter klickprov på previewen:

> "jag tycker att det är ett jättekonstigt sätt in, då borde vi ändra igen om
> jag nu har sagt ja till det i rivningen tidigare."

Beslutet är hans. Den här filen är underlaget så att ändringen görs medvetet
och inte råkar återinföra det vi rev.

## Förslaget

En mellansida vid "ny offert" med **två boxar**:

1. **"Skapa offert genom frågeflöde"** — inuti boxen väljs VILKET frågeflöde
   som ska startas, eller att skapa ett helt nytt. Skräddarsytt av
   hantverkaren själv.
2. **"Skapa ny offert"** — rakt in i offertskaparen. Inuti samma box finns ett
   textfält och en mikrofon för att starta med en AI-prompt.

## Varför det INTE är det vi rev

Mellanskärmen som togs bort 2026-09-17 frågade efter **titel och kund innan
editorn** — uppgifter dokumentet ändå frågar efter. Och "Använd en mall" var
en separat mallista parallellt med jobbtypsremsan. Klagomålet var "fyra
knappar som landar på två ställen".

Förslaget här är av annan art: **två boxar = två genuint olika starter**, och
jobbtypsvalet flyttar IN i frågeflödesboxen i stället för att ligga som en
egen remsa bredvid.

Det tar dessutom bort en dubblering som finns i dag: startskärmen visar
samtidigt jobbtypsremsan, "Bygg utkast" OCH "Bygg själv" — tre saker som
konkurrerar om samma beslut. Det är en trolig förklaring till att ingången
känns konstig.

## Invändningen, och hur den undviks

**Ett extra steg för det vanligaste fallet.** I dag: tryck jobbtyp → frågor.
Med mellansida: mellansida → box → jobbtyp → frågor.

Motmedlet: låt jobbtyperna ligga **synliga direkt i frågeflödesboxen**, inte
bakom ett andra klick. Då är antalet tryck detsamma, men vägvalet är uttalat
i stället för underförstått.

## Vad som måste överleva — båda dyrköpta

1. **Kunden förblir frivillig.** Det var skälet att den gamla mellanskärmen
   dog: hantverkaren står hemma hos någon som ännu inte finns i systemet, och
   ett tvingande kundval före beskrivningen gör att offerten skjuts till
   kvällen och sedan aldrig skrivs.
2. **Fortfarande exakt två vägar ut.** Dina två boxar. Ingen tredje som smyger
   sig in — det var hela poängen med rivningen, och den poängen står kvar även
   när formen ändras.

## Vad som måste ändras, i den här ordningen

Facit och brief LÅSER i dag det motsatta. `tests/design-offertflodet-kontrakt.spec.ts`
kräver "Bygg utkast" + "Bygg själv" på startskärmen och förbjuder en tredje
väg; `design-offertflodet/README.md` säger "Lägg aldrig till en tredje".

De spärrarna finns för att en DESIGNEXPORT inte tyst ska tappa ett krav. När
ÄGAREN ändrar kravet är rätt ordning:

1. **Brief först** — `design-offertflodet/README.md` skrivs om: två boxar,
   vad som måste överleva (kunden frivillig, två vägar, röst redigerbar,
   jobbtyperna synliga utan extra klick).
2. **Facit sedan** — kontraktet flyttas till den nya formen, med kommentaren
   om VARFÖR det ändrades. Aldrig tyst.
3. **Design därefter** — ny beställning till Claude Design. De sex levererade
   ytorna ritade den GAMLA startskärmen och är därmed delvis överspelade.
4. **Kod sist.**

Ändras facit i steg 2 utan att briefen skrivits om i steg 1 har vi bara tagit
bort en spärr, inte fattat ett beslut.

## Öppet, att bestämma innan briefen skrivs

- **"Skapa ett helt nytt frågeflöde" inifrån boxen** — leder det till
  jobbtypsytan (som mätt 2026-09-19 har 49 kontroller och ska göras om), eller
  till något enklare på plats? Hänger ihop med
  `tasks/jobbtypsytan-2026-09-19.md`.
- **AI-prompten i box 2** — är den samma väg som dagens "Bygg utkast"
  (Matte bygger ur beskrivningen), eller en tredje sak? Om det är samma väg
  är det bara en flytt, och då stämmer "två vägar" fortfarande.
