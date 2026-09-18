# Kundutfall

När **[verklig trigger]** händer ska Handymate **[verkligt utfall]** utan att användaren behöver **[manuellt arbete som tas bort]**.

## Proof contract
**Entry point**
- [ ] Exakt trigger/route/event/provider:

**Förväntade sidoeffekter**
- [ ] DB/state:
- [ ] Extern handling, om relevant:
- [ ] Synlig kvittens/resultat:

**No-go outcomes**
- [ ] Dubbletter/retry får inte skapa dubbel handling
- [ ] Fel tenant/obehörig användare får aldrig påverkas
- [ ] Osäkert providerutfall får inte blind-retryas
- [ ] Övrigt:

## Bevis
**Automatiskt facit**
- [ ] Nya/ändrade tester namngivna
- [ ] Testerna körda och gröna
- [ ] Hela `npm run test:contracts` grön

**Mutation proof**
- [ ] Produktionskoden muterades så utfallet blev fel
- [ ] Rätt test blev rött
- [ ] Mutationen återställdes och testet blev grönt
- Mutation som provades:

**Build**
- [ ] `npx tsc --noEmit`
- [ ] `npx next build`
- [ ] `git status --short` kontrollerad

**Databas, om relevant**
- [ ] `information_schema` läst före schemaantaganden
- [ ] SQL finns i `sql/`
- [ ] Verifierande SELECT körd
- [ ] Rapporterad nolla kontrollerad mot tabellens totala radantal

**UI, om relevant**
- [ ] Renderad och visuellt granskad i 375 px
- [ ] Bild/bevis bifogat eller länkat

**Live proof, om relevant**
- [ ] Verklig provider-/kundresa körd
- [ ] Resultatet observerat i systemets sanningskälla
- [ ] Ej relevant — varför:

## Cross-review
**Byggare:** <!-- Codex / Claude / människa -->
**Oberoende granskare:** <!-- Måste vara annan än byggaren -->

Granskaren ska försöka falsifiera kundutfallet, inte bara läsa diffen.
- [ ] Spec correctness
- [ ] Code correctness
- [ ] Journey correctness
- [ ] Reality proof
- [ ] Regression/side-door check
- [ ] Alla blockerande kommentarer lösta
- [ ] Granskaren har lämnat `QUALITY GATE: PASS` på aktuell head-SHA

## Medvetet lämnat ogjort

## Ship status
- [ ] **OUTCOME PROVEN** — samtliga relevanta grindar ovan är uppfyllda.
- [ ] **INTE SHIP-READY** — beskriv exakt vad som återstår.

> Grön CI ensam betyder aldrig att en extern integration eller kundresa är livebevisad.
