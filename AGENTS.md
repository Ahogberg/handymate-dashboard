# Att bygga i Handymate

Den här filen är arbetsordningen för alla som bygger här — Claude, Codex,
människa. Produktreglerna (databasnamn, svenska i UI, onboardingens steg,
kända fallgropar) står i `handymate-dashboard/CLAUDE.md`. Den här filen säger
i vilken ordning arbetet görs, och vad som räknas som bevisat.

Detaljerna ligger som skills i `handymate-dashboard/.claude/skills/`. Claude
Code laddar dem automatiskt när uppgiften matchar; läs dem som vanliga
markdown-filer om du är en annan agent.

**Obligatorisk quality gate:** alla icke-triviala produktändringar följer
`handymate-dashboard/docs/DEVELOPMENT_QUALITY_GATE.md`. Byggaren får inte vara
enda granskare av sitt eget arbete. Claude och Codex korsgranskar varandra,
och en ändring är inte klar förrän kundutfallet är **OUTCOME PROVEN**.

## Fyra steg

**1. Starta rätt** → `starta-ratt`

Hämta main och läs öppna PR:er innan du rör något. Vi kör två byggare mot
samma main och krockar annars på `package.json`s kontraktslista. Sök om det
du ska bygga redan finns — det har hänt att vi byggt om något som var klart.
Pröva uppdragets premiss mot koden och databasen, och säg högt om den är fel
innan du bygger. Läs vad filen du ersätter faktiskt bar.

**2. Bygg**

Minsta möjliga ändring som löser hela uppgiften. Server äger grindar och
sanning; klienten visar. Ingen ny tabell eller kolumn utan att ha läst
`information_schema` först.

**3. Bevisa** → `facit`, `databasen-ar-facit`, `ui-bevis`

- Varje nytt eller ändrat test **mutationstestas**: mutera koden, se testet
  falla, återställ. Ett test som inte kan falla är inget facit.
- Varje SQL-ändring har en fil i `sql/` och en verifierande SELECT efteråt.
  En nolla kontrolleras mot tabellens totala radantal innan den rapporteras.
- Varje synlig UI-ändring **renderas i 375 px, tittas på, och skickas till
  Andreas**. Källskanning bevisar att koden finns, inte att den syns.

Före push, alltid: `npx tsc --noEmit` · `npm run test:contracts` ·
`npx next build` · `git status --short`.

**4. Skeppa**

Före merge krävs oberoende review enligt quality gaten, med `QUALITY GATE: PASS`
bundet till aktuell head-SHA. En ny commit gör tidigare PASS ogiltigt.

Commitmeddelandet ska säga **varför**, vilket verkligt fel som stängdes,
vilka mutationer som testades, och vad som medvetet lämnades ogjort. Svenska.
Push till main först när kedjan är grön — en otrackad fil som koden importerar
har gjort main röd i timmar.

## Aldrig

- Aldrig gissa ett kolumnnamn som går att slå upp.
- Aldrig rapportera en nolla utan att ha kollat om tabellen någonsin haft
  rader.
- Aldrig kalla en ändring bevisad på ett test du inte sett falla.
- Aldrig påstå att en UI-ändring fungerar utan att ha sett den renderad.
- Aldrig utvidga uppdraget på eget initiativ. Hittar du något annat: säg det.
- Aldrig lämna ett pass utan att skriva ner vad som är verifierat och vad som
  återstår.

## Efter en rättning

Andreas rättar något → mönstret skrivs in i `handymate-dashboard/tasks/lessons.md`
med datum och det konkreta fallet. Återkommer samma sorts fel blir det en
skill i stället, så att nästa pass får regeln automatiskt i stället för att
behöva minnas den.
