---
name: ui-bevis
description: Rendera ändrad UI i mobilbredd, titta på bilden och skicka den till Andreas innan du kallar ändringen klar. Använd vid varje ändring i .tsx som syns för en användare — ny knapp, ändrad text, nytt tillstånd, ny sida, ändrad layout — och när någon frågar "hur ser det ut".
---

# Källskanning bevisar att koden finns, inte att den syns

En spec som letar efter `'Fyll på från jobbtyp'` i källan är grön även om
remsan renderas utanför skärmen, staplas på varandra i 375 px, eller aldrig
monteras för att en grind ovanför den är fel. Vi har skeppat UI verifierad så,
och låtit Andreas hitta felen på sin telefon efter deploy.

Det behövs ingen ny infrastruktur: **den finns redan**, sjutton
`tests/*.ui.spec.ts` renderar riktiga komponenter i riktig Chromium på
375 px och 1280 px, utan inloggning, med riktig Tailwind-CSS och riktig
Postgres bakom.

## Arbetsgång

1. **Hitta ytan.** Finns en `tests/helpers/*-preview.ts` för komponenten
   (relief, job-standard, first-value, followup, planning-start …) är jobbet
   gjort — kör den specen. Annars: lägg till ditt läge i närmaste helper, som
   kompilerar den *riktiga* komponenten och dess beroenden.

2. **Kör med rätt browser.** Specarna läser inte samma variabel: åtta
   använder `HANDYMATE_CHROMIUM_PATH`, två `PLAYWRIGHT_EXECUTABLE_PATH`, sju
   varken den ena eller andra (och faller tillbaka på den pinnade, som ibland
   saknas i `/opt/pw-browsers`). Sätt därför **båda** — det fungerar oavsett
   vilken specen läser:
   ```bash
   CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
   HANDYMATE_CHROMIUM_PATH=$CHROME PLAYWRIGHT_EXECUTABLE_PATH=$CHROME \
     npx playwright test tests/job-standards.ui.spec.ts --no-deps --project=chromium --reporter=line
   ```
   Saknas den pinnade `chromium_headless_shell-<version>` går det också att
   symlänka den till `chromium-1194` (se `tasks/lessons.md`, 2026-09-07).

3. **Titta på bilden.** Läs PNG-filen med Read-verktyget. Det här är hela
   poängen — inte att specen är grön, utan att du *har sett* ytan. Kontrollera:
   texten du skrev står där, den är läsbar i 375 px, inget staplas eller
   klipps, träffytor ser tryckbara ut, ingen platshållare eller engelsk
   sträng läckte in.

4. **Skicka den till Andreas** med SendUserFile. Han granskar på telefon; en
   bild sparar en deploy-cykel.

5. **Behåll bredd-provet i specen.** 16 av 17 `.ui.spec.ts` kör
   `expect(document.documentElement.scrollWidth <= innerWidth)` — horisontell
   scroll i 375 px är ett fel, inte en smaksak. Lägger du till en ny yta ska
   den ha provet.

## Regler

- **PNG:er committas aldrig.** `test-results/` är gitignorerad. Beviset hör i
  chatten och i commitmeddelandet ("renderad i 375 px, remsan syns under
  rubriken"), inte i git-historiken.
- **Skärminspelning finns inte här.** Molnsessionen har ingen skärm. Bilder
  och `scrollWidth`-provet är vad som går; påstå inte mer.
- **En bild är inget korrekthetsbevis.** Den visar att ytan syns. Logiken
  bevisas fortfarande av facit med mutationstest (se `facit`).
- **Varje ui-spec sparar en bild.** Alla sjutton gör det sedan 2026-09-17
  (onboardingturen var den sista). Letar du efter anropet: det heter inte
  alltid `page.screenshot` — specar med två flikar använder
  `second.screenshot`. Grep på `.screenshot(`.
- **Ändrar du en `.ui.spec.ts`-yta måste specen köras om** — den är också
  grinden som fångar att din nya rendering inte kraschar (`pageerror` samlas
  och ska vara tom).

## Ytor som redan har en preview-helper

`relief-preview` (Din dag, avlastning) · `job-standard-preview` (jobbtyper,
standardrader, återanvänd offert) · `first-value-preview` ·
`first-value-production-preview` · `followup-preview` ·
`planning-start-preview`. Övriga ytor kräver ett nytt läge i en av dem.
