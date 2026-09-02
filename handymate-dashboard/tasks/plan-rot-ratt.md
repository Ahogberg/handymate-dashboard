# Actionplan: ROT-rätten som en sanning (2026-09-02, Andreas: "Bygg på!")

Bakgrund: branschgenomgången (docs/bransch/) visade att ROT-rätten beror på
BOENDEFORMEN och på jobbets NATUR, men i koden avgörs den av en boolean per
artikel (`is_rot_eligible`). `rot_property_type` finns bara i SKV-lagret
(lib/skv/validate-rot-request.ts, app/api/rot-payment/*) och används aldrig
för att avgöra rätten. Fasadmålning i bostadsrätt och fasadmålning i småhus
behandlas alltså lika, och service/felsökning kan märkas ROT trots att det
aldrig ger avdrag. Det är ett pengafel åt båda håll och därmed P0.

Granskningspaketet (docs/bransch/granskning/) är ute på faktagranskning.
Det här passet bygger RÄLSEN, inte facit: bara de 86 belagda raderna fylls i,
allt annat är uttryckligen okänt och leder till en fråga, aldrig en gissning.

Repo: handymate-dashboard/. Svenska kommentarer och UI, riktiga å/ä/ö.
BÖRJA SKRIVA KOD INOM 10 MINUTER — läs bara filerna som nämns här.
Ingen migration i detta pass. Inga commits.

## Del 1 — lib/rot/ratt.ts (ren modul, ingen I/O)

Typer:
```
export type Boendeform = 'smahus' | 'bostadsratt' | 'okand'
export type AvdragsTyp = 'rot' | 'rut' | 'gron_teknik' | 'inget'
export type RottBesked =
  | { utfall: 'ja'; typ: AvdragsTyp; grund: string; kalla: string }
  | { utfall: 'nej'; grund: string; kalla: string }
  | { utfall: 'okant'; fraga: string }   // fraga = vad hantverkaren ska tillfrågas
```

- `bedomAvdrag(jobbtypSlug: string, boendeform: Boendeform, nu?: Date): RottBesked`
  Slår upp i tabellen (Del 2). Regler i ordning:
  1. Okänd jobbtyp ⇒ `okant` med frågan "Ger <jobbtyp> rätt till ROT? Vi har
     inget belagt svar."
  2. Rad som kräver boendeform och boendeform är 'okand' ⇒ `okant` med frågan
     "Är bostaden ett småhus eller en bostadsrätt? Avdraget skiljer sig."
  3. Rad som säger nej för denna boendeform ⇒ `nej` med grund + källa.
  4. Annars `ja` med typ, grund och källa.
- `arArbeteUtanAvdrag(jobbtypSlug)`: true för service/kontroll/felsökning-
  raderna (de som aldrig ger ROT) — används för att kunna varna i UI.
- ALDRIG en tyst default. Funktionen returnerar aldrig `nej` för att den
  saknar data; det fallet är `okant`.

## Del 2 — lib/rot/tabell.ts (data, genererad ur granskat underlag)

- `export const ROT_TABELL: RotRad[]` där
  `RotRad = { slug, namn, bransch, smahus: AvdragsTyp | 'okant', bostadsratt: AvdragsTyp | 'okant', grund: string, kalla: string, granskad: boolean }`
- Fyll BARA från de rader i docs/bransch/*.md som är märkta ROT, RUT, GT
  eller Nej UTAN asterisk, och som inte flaggats i
  docs/bransch/granskning/MEKANISK_KONTROLL_2026-09-02.md (El rad 4, 6, 7 och
  Allround rad 3 ska INTE med — de är underkända). `granskad: true` bara för
  dessa. Övriga jobbtyper utelämnas helt ur tabellen, så bedomAvdrag ger
  `okant` för dem. Det är avsiktligt.
- `grund` = kort svensk mening ur radens egen motivering. `kalla` = källkoden
  ur branschfilen (t.ex. 'SKV-ROT') plus URL om filen har den.
- Boendeform: sätt `bostadsratt: 'okant'` för varje rad där branschfilen inte
  uttryckligen säger något om bostadsrätt. Gissa ALDRIG att det är samma som
  småhus. Skriv en kommentar högst upp om att det är den enda hederliga
  utgångspunkten tills granskningen svarat.
- Ett tak: filen ska vara läsbar. Sortera per bransch, en rad per jobbtyp.

## Del 3 — koppla in där avdrag sätts

Rör INTE lib/skv/* eller app/api/rot-payment/* (utbetalningen är ett annat
lager och fungerar).

1. `lib/ai-quote-generator.ts`: när modellen föreslagit rader, kör varje rad
   genom `bedomAvdrag(radensJobbtyp, boendeform)`. Boendeformen tas från
   kundens/projektets kända uppgift om den finns (leta efter var
   rot_property_type eller motsvarande kan läsas; finns den inte i scope ⇒
   'okand'). Sätt `is_rot_eligible` bara vid `utfall === 'ja' && typ === 'rot'`,
   `is_rut_eligible` bara vid `typ === 'rut'`. Vid `okant`: sätt BÅDA till
   false OCH lägg radens fråga i generatorns varningslista (leta efter hur
   den redan returnerar varningar/anteckningar; finns ingen sådan kanal,
   lägg fältet `avdragsfragor: string[]` i returtypen).
2. `lib/quotes/create-quote.ts` (~rad 257) och `app/api/quotes/route.ts`
   (~rad 790): dessa tar emot `is_rot_eligible` från anroparen. Lämna
   beteendet, men lägg en kommentar som pekar på lib/rot/ratt.ts som
   sanningen, så nästa läsare inte tror att booleanen är fri.
3. `lib/quotes/suggest-quote-draft.ts`: samma som 1 om den sätter avdrag.

## Del 4 — synlighet för hantverkaren
- Där offertens rader visas (leta upp komponenten som renderar ROT-toggeln i
  offertbyggaren, app/dashboard/quotes/_shared/QuoteBuilder.tsx eller den
  komponent som äger raden): när `bedomAvdrag` gav `okant`, visa en dämpad
  rad under artikeln med frågan och texten "Vi vet inte — du avgör."
  Hantverkaren kan fortfarande kryssa i ROT själv; vi hindrar ingen, vi
  slutar bara påstå. Ingen ny modal, ingen blockering.
- Om `arArbeteUtanAvdrag` är true och användaren ändå kryssar i ROT: visa
  samma dämpade rad med "Skatteverket: servicearbeten, kontroll och översyn
  ger inte rotavdrag." Fortfarande ingen blockering.

## Facit: tests/rot-ratt.spec.ts (browserlöst)
- bedomAvdrag: känd rad + småhus ⇒ ja med typ och källa; känd rad där
  bostadsratt är 'okant' + boendeform bostadsratt ⇒ okant med fråga;
  boendeform 'okand' på en rad som skiljer ⇒ okant; okänd slug ⇒ okant;
  nej-rad ⇒ nej med grund. ALDRIG `nej` av databrist (loopa hela tabellen och
  verifiera att varje `nej` har en icke-tom grund).
- tabellen: varje rad har grund och kalla icke-tomma; `granskad` är true för
  alla; de fyra underkända raderna (El 4/6/7, Allround 3) finns INTE med
  (sök på deras jobbtypsnamn); antal rader stämmer med antalet obeasteriskade
  rader i branschfilerna minus de fyra (räkna i testet genom att läsa
  docs/bransch/*.md, så facit inte kan glida från källan).
- inkoppling: ai-quote-generator innehåller `bedomAvdrag(`; sätter aldrig
  `is_rot_eligible: true` utan att ha frågat modulen (källskanning: ingen
  `is_rot_eligible: true` i filen utom via bedömningen).
- lib/skv/* orört (källskanning: ingen import av lib/rot i skv-lagret).
Lägg facit-namnet sist i BÅDE `test:contracts` i package.json och listan i
../.github/workflows/contracts.yml.

## Verifiering
```
npx tsc --noEmit
npx playwright test tests/rot-ratt.spec.ts $(ls tests | grep -iE "rot|quote|skv" | sed 's#^#tests/#' | tr '\n' ' ') --no-deps --project=chromium --reporter=line
npm run test:contracts
npx next build
```
Rött som var rött före passet (kontrollera med git stash): rapportera, tvinga
inte grönt. Rapportera ändrade filer, exakta testsiffror, avvikelser, och
särskilt: hur många jobbtyper som hamnade i tabellen och hur många som blir
`okant`.
