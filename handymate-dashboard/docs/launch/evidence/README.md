# Bevisprotokoll — så körs ett lanseringsprov

Ett protokoll per release, enligt formatet i `../LAUNCH_TEST_SUITE.md` §3.
Filerna heter `<YYYY-MM-DD>-<kort-SHA>.md` och skapas med generatorn, inte för
hand — en release-SHA som inte stämmer gör hela beviset värdelöst.

## 1. Lås SHA:n först

Tre parter pushar till `main` flera gånger om dagen. Ett protokoll som fylls i
under en dag hinner alltså peka på kod som inte längre är den som testades.

```bash
git tag -a release-prov-2026-09-14 -m "Lanseringsprov inför 14 september"
git push origin release-prov-2026-09-14
git checkout release-prov-2026-09-14
```

Alla prov refererar taggen. `main` får fortsätta röra sig — det är hela poängen
med att låsa.

Generatorn varnar högt i protokollfilen om ingen tagg pekar på committen. Den
blockerar inte: en snabb sondering mot `main` är ibland precis vad man vill.

## 2. Skapa protokollet

```bash
npm run evidence:new
npm run evidence:new -- --miljo=preview
```

Stationerna läses ur `LAUNCH_TEST_SUITE.md` (rubrikerna `### N.N`), så ändrar
någon sviten följer protokollet med automatiskt. Två listor som kan glida isär
är en list för mycket.

Generatorn vägrar skriva över en befintlig fil.

## 3. Kör förkravssonden innan första stationen

```
GET /api/admin/launch-preflight     (som admin)
```

Läsande kontroller mot 46elks-saldo, Stripe, Anthropic, Resend-domän,
Google-token, Fortnox-anslutning, databasen och lagringshinkarna. Kostar noll —
inget SMS och inget mejl skickas.

Sonden finns för att `evaluateLaunchEnvironment` (`lib/launch/readiness.ts`)
bara kontrollerar att miljövariabler är **satta**. Mätt 2026-09-03:
`ELKS_API_USER: ✅ Set` samtidigt som 46elks svarade *"Not enough credits"*.
Hela Grind B var blockerad medan env-checken sa grönt.

Klistra in svaret överst i protokollet. Stationer som sonden markerar
`blockerad` påbörjas inte — de bokförs som `BLOCKERAD` med sondens orsak direkt.

**`okand` räknas aldrig som klar.** En kontroll som inte gick att göra är inte
ett godkännande.

## 4. Rollerna

| Roll | Gör | Gör inte |
|---|---|---|
| Fable | Repetitiva browserflöden, skärmbilder, tider | Bokför aldrig sitt eget PASS |
| Codex | Verifierar mot kod, databas, leverantörsloggar; bokför utfall | Kör inte de flöden den bedömer |
| Andreas | Stripe-köp, riktigt samtal, SMS/mejl i handen, mobil push, Fortnox | — |
| Kall testperson | Minst en full onboarding utan hjälp | — |

Den som utför ett prov godkänner det inte själv. Det är samma fyra-ögon-princip
som produkten bygger på, tillämpad på er egen lanseringsprocess.

Den kalla testpersonen är inte utbytbar mot automation: maskinen kan bevisa att
en knapp fungerar, aldrig att produkten är självklar för en hantverkare som ser
den för första gången.

## 5. Bestäm omkörningsregeln i förväg

Varje `FAIL` som rättas ger en ny SHA. Om allt måste köras om vid varje fix blir
slutfasen oändlig. Besluta **innan** provet startar vilka stationer som måste
köras om vid en fix och vilka som får bära över.

## Vad som inte hör hemma här

Ifyllda protokoll är historik och checkas in. Skärmbilder läggs bredvid filen i
en undermapp med samma namn som protokollet. Ingen av dem får innehålla riktiga
kunduppgifter — testkonton och testdata, alltid.
