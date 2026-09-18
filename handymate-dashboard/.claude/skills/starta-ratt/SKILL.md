---
name: starta-ratt
description: Kontrollera parallellt arbete och befintlig verklighet innan du börjar bygga. Använd i början av varje pass som rör kod, när du tar emot ett uppdrag eller en granskning, innan du skriver en ny fil eller funktion, och när en premiss i uppdraget låter som ett faktum ("vi skapar redan X", "funktionen saknas").
---

# Fem minuter före, inte en timme efter

Vi kör två byggare mot samma main: den här sessionen och Codex. Och koden är
större än någons minne av den. Det mesta som gått fel har gått fel i starten,
inte i bygget.

## Innan du skriver en rad

1. **Vad pågår parallellt?**
   ```bash
   git fetch origin main && git log --oneline HEAD..origin/main | head -20
   ```
   Plus öppna PR:er via GitHub-MCP. Rör någon av dem ditt område? Då är
   basmergen först, inte sist — annars löser du en konflikt i en fil du redan
   skrivit om. Det gäller särskilt `package.json`s kontraktslista och
   `.github/workflows/contracts.yml`, där två paket alltid krockar på samma rad.

2. **Finns det redan?** Sök på basnamnet, inte bara importvägen. Vi har byggt
   om saker som fanns: persisteringen av ÄTA-utkast var redan klar, det var
   filhuvudet som fortfarande beskrev hålet. Och vi har "skapat" sidor som
   redan fanns och därmed tappat deras grindar.

3. **Pröva premissen.** "Onboardingen skapar en offertmall per jobbtyp" var
   fel — den skapar jobbtyperna. En premiss som låter som ett faktum kollas
   mot koden och mot databasen, och rättas högt i svaret innan bygget börjar.

4. **Läs kontexten som finns.** `docs/**/*-kontext-*.md` och
   `tasks/todo-*.md` skrevs för att nästa pass inte skulle behöva gissa.
   `tasks/lessons.md` är lång — sök i den, läs den inte.

5. **Ersätter du något? Läs vad det bar.** En serverkomponent kan bära
   `metadata` (noindex, referrer), en grind, `force-dynamic`. Blir den
   klientkod försvinner allt det tyst. Lista vad filen gör innan du skriver om
   den.

## Under passet

- **Aldrig direkt på main utan grön kedja lokalt:** `npx tsc --noEmit`,
  `npm run test:contracts`, `npx next build`, och `git status --short`.
  En otrackad fil som koden importerar gör main röd i timmar.
- **En delad funktion bevisas på varje väg.** Räkna upp anroparna med grep
  och kör tal genom var och en. "Alla vägar" i ett testnamn betyder ingenting
  om specen kör en.
- **Rör inte det uppdraget inte bad om.** Hittar du något annat: säg det,
  bygg det inte.

## Överlämning

Slutar passet med något ofärdigt, eller ska någon annan ta nästa steg: skriv
en kontextfil med **vad som finns (verifierat), vad som inte finns
(verifierat), byggordning och öppna frågor**. Inte en sammanfattning av vad du
gjorde — en startpunkt för nästa.
