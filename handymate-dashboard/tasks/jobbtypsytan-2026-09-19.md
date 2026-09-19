# Jobbtypsytan är för rörig — mätt, inte tyckt

**2026-09-19, 02:15.** Andreas efter klickprov på previewen:

> "HELVETE vad rörigt och krångligt det ser ut, fattar knappt själv hur jag
> ska göra och då är Handymate mitt system."

Det är det hårdaste omdöme en yta kan få: den som byggt produkten hittar inte
i den. Här är mätningen som gör reaktionen till ett faktum.

## Mätt

Ytan där en hantverkare ställer in EN jobbtyp är sex komponenter:

| Fil | Rader | Interaktiva kontroller |
|---|---|---|
| `app/dashboard/settings/job-types/page.tsx` | 298 | 10 |
| `components/onboarding/JobTypeQuoteSetup.tsx` | 244 | 13 |
| `components/onboarding/JobTypeQuestionsEditor.tsx` | 263 | 14 |
| `components/onboarding/JobStandardRowsEditor.tsx` | 116 | 10 |
| `components/products/QuickPriceInput.tsx` | 100 | 2 |
| `components/onboarding/JobTypeQuotePreview.tsx` | 62 | 0 |
| **Totalt** | **1 083** | **49** |

**Jämförelsen som gör siffran allvarlig:** den gamla offertskaparen som
pilotkunden Christoffer gav upp inför — *"för mycket, rörigt, man får inte med
allt — blir galen"* — mätte **~33** kontroller på en tom offert. Vi rev den
ytan i september och byggde en med tre.

Jobbtypsytan har **49**. Den är alltså värre än det vi redan bedömt som
ohållbart, och den har aldrig gått igenom samma rivning.

## Varför den blev så

Frågorna binder till **rader i upplägget**, inte till artiklar. En rad finns
bara inuti ett upplägg. För att skriva en fråga måste hantverkaren därför
först ha ett upplägg, veta vilka rader det har, och peka ut rätt rad bland
dem. Hela kedjan jobbtyp → upplägg → rader → fråga måste vara synlig
samtidigt, och det är den som kostar 49 kontroller.

## Andreas förslag, och varför det är rätt

> "måste det väl vara enklast att man kan skapa frågor som är knutna till
> artikel också, utöver de kriterier som finns"

**Det stämmer, och det löser roten.** En artikel finns oberoende av upplägg.
En fråga som lyder *"Hur många kvadratmeter klinker?" → sätter mängden på
artikeln Klinker* går att skriva utan att någonsin öppna ett upplägg, och den
överlever att upplägget görs om.

Vad som finns i dag (PR 91):

- `number` / `yesno` → binder till **rader** (`targets`)
- `choice` → varje alternativ kan bära en **artikel** (`productId`) och lägger
  in den som en rad

Så artikelbindningen finns redan — men bara för valfrågor, och bara för att
LÄGGA IN en artikel. Mängdfrågan mot en artikel saknas.

**Det enda skälet radbindningen finns** är fallet där samma artikel
förekommer TVÅ gånger med olika betydelse: golv och vägg, båda i m², båda
"Klinker". Det var precis den buggen vi rev enhetsmatchningen för — golvytan
hamnade på båda.

**Slutsatsen är alltså inte "byt rader mot artiklar" utan:** författa mot
artiklar som förval, och fråga om raden ENBART när artikeln förekommer mer än
en gång i upplägget. Då försvinner nästan hela kedjan ur ytan, och
tvetydigheten hanteras där den faktiskt uppstår.

## Vad som INTE är beställt

Claude Designs sex levererade ytor täcker **startskärmen** och
**frågeflödet** — de två som stod i `design-offertflodet/README.md`.
Jobbtypsytan stod aldrig i briefen. Därför är den orörd, och därför ser den ut
som den gör. Den behöver en egen beställning.

## Nästa steg

1. Ny brief till Claude Design för jobbtypsytan, med samma kontraktsform som
   `design-offertflodet/README.md` — vad som måste överleva en export.
2. Innan designen: bestäm datamodellen. Artikelbunden mängdfråga med
   radfrågan som undantag, enligt ovan.
3. Först därefter rita.

Att rita om en yta vars datamodell fortfarande tvingar fram kedjan
jobbtyp → upplägg → rad ger en vackrare 49-kontrollersyta, inte en enklare.
