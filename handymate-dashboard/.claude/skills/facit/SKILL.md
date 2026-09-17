---
name: facit
description: Mutationstesta varje nytt eller ändrat test innan det räknas som facit. Använd när du skriver, ändrar eller granskar en spec, ett contract-test eller en källskanning, när någon säger "testerna är gröna", "facit", "spärrhake" eller "acceptanskriterier", och innan du påstår att en ändring är bevisad.
---

# Ett facit som inte kan falla är inget facit

Gröna tester är ett påstående, inte ett bevis. Ett test bevisar något först när
du har sett det **falla** på en realistisk mutation av koden det vaktar.

Den här regeln finns för att vi gång på gång skrivit tester som mätte sig
själva: en källskanning som letade efter ett funktionsnamn som stod kvar i
importen, en spec som mätte sin egen jest-mock, ett behörighetsprov som
kontrollerade att en grind fanns men inte vad som kom ut förbi den.

## Arbetsgång

1. **Skriv facitet.** Ett påstående per test, med en kommentar som säger vad
   som går sönder i verkligheten om det faller.
2. **Kör det.** Grönt betyder ingenting ännu.
3. **Mutera koden, inte testet.** Gör den ändring en framtida utvecklare
   rimligen gör: tar bort ett anrop, byter `403` mot `200`, låter en
   reservväg gälla överallt, glömmer en rad i en villkorad gren.
4. **Kör igen och se det falla.** Faller det inte är facitet tandlöst —
   skärp påståendet och gör om, skriv inte om mutationen.
5. **Återställ koden exakt** och kör en sista gång för att bekräfta grönt.

Skriv i commitmeddelandet vilka mutationer som testades och att alla fångades.

## Realistiska mutationer

Använd de här, inte syntaxfel eller `return null` överallt:

| Mönster | Mutation |
|---|---|
| Grind i en rutt | ta bort grinden; behåll grinden men svara 200 |
| Källskanning på ett namn | ta bort **anropet**, behåll importen |
| Villkorad rendering | gör villkoret konstant `true` respektive `false` |
| Reservväg / fallback | låt den gälla även i det läge den inte är till för |
| Delad hjälpfunktion | ändra bara EN av anroparna |
| Idempotens | kör operationen två gånger |
| Flagga eller standardvärde | ta bort defaulten i schemat |
| Ordning (grind före arbete) | flytta grinden efter skrivningen |

## Så gör du det utan att tappa koden

```bash
F='app/api/nagot/route.ts'; cp "$F" /tmp/mut.bak
run(){ npx playwright test tests/min.spec.ts --no-deps --project=chromium 2>&1 | grep -E "^  [0-9]+ (passed|failed)"; }
run                                    # baseline
python3 - <<'PY'                       # mutera (python, inte sed — citattecken)
import io; p='app/api/nagot/route.ts'; s=io.open(p,encoding='utf-8').read()
a='if (!hasAccess(user)) return NextResponse.json({ error: "Nej" }, { status: 403 })'
assert a in s, 'mutationen träffade inget — facitet vaktar inte det du tror'
io.open(p,'w',encoding='utf-8').write(s.replace(a,'',1))
PY
run; cp /tmp/mut.bak "$F"; run          # ska falla, sedan grönt igen
```

Backup-filnamn måste vara unika per fil — `basename` kolliderar när två
`page.tsx` muteras i samma svep, och då skriver du över en fil med en annan.

## Fallgropar vi gått i

- **Mutationen träffade inget.** `assert a in s` i python-patchen, alltid.
  En mutation som inte applicerades ger ett falskt "facitet höll".
- **Kommentaren bär strängen testet letar efter.** En källskanning som söker
  `'Använd en mall'` faller inte när knappen tas bort om din egen kommentar
  citerar texten. Skanna `utanKommentarer(källa)`.
- **Testet mäter sin egen mock.** Mutera modulen testet mockar: passerar det
  ändå mäter du mocken. Använd `jest.requireActual` / kompilera den riktiga
  modulen.
- **Ett CRLF-träd.** Källskanningar måste normalisera radslut.

## Kontraktsgrinden

Ny spec läggs till i **både** `package.json` (`test:contracts`) och
`.github/workflows/contracts.yml`, i samma ordning — `tests/feature-test-parity.spec.ts`
faller annars. Listan slutar alltid med
` && node --test tests/customer-preparation/contract.test.mjs`.

Före push: `npx tsc --noEmit`, `npm run test:contracts`, `npx next build`, och
`git status --short` — en `??`-rad under `app/` eller `lib/` som koden importerar
är en trasig push oavsett hur grönt det är lokalt.
