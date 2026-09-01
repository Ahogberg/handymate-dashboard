# Tvåkontosbevis — onboarding till skickad första offert

Datum: 2026-09-01
Syfte: bevisa nuvarande klassiska onboarding och Setup Studio V1.5 mot två
separata, tomma testföretag utan att blanda data eller dölja fel.

## Vad som bevisas

Samma resa körs två gånger:

- **A · klassisk:** nuvarande produktionsguide.
- **B · Setup Studio:** det flaggade samtalsskalet.

Båda ska bära samma data hela vägen:

företag → prismodell → jobbtyp → 3–5 prissatta artiklar → offertupplägg →
första uppdrag → riktig offert → spara → återöppna → förhandsgranska →
kontrollerat testutskick.

Beviset är inte en tävling där Studio måste vinna. Det ska visa om Studio
förbättrar begriplighet utan att ändra sanningen eller skapa fler fel.

## Säkerhetsgränser

- Endast de två uttryckligt avsedda testföretagen används.
- Inga lösenord, API-nycklar eller testmottagare committas.
- Pre-/postflight-scriptet är read-only och innehåller inga mutationer.
- Stripe-steget klickas bara i en miljö där testbetalning eller uttryckligt
  godkänd testprenumeration är möjlig. Ingen riktig debitering görs som del
  av ett automatiskt test.
- Offerten skickas bara till Andreas kontrollerade testadress/testnummer.
- Inga riktiga kunder, Fortnox-konton eller externa mottagare används.

## 0. Förbered miljöerna

Setup Studio kräver en Preview-build med:

```text
NEXT_PUBLIC_SETUP_STUDIO_ENABLED=true
```

Kör båda resorna i samma Preview-build. Konto A öppnas med `?classic=1` och
konto B med `?studio=1`. Då jämförs presentationen medan kod, backend och
deploy är identiska.

Ha följande endast i den lokala shell-sessionen:

```powershell
$env:PROOF_CLASSIC_BUSINESS_ID='<testföretag A>'
$env:PROOF_STUDIO_BUSINESS_ID='<testföretag B>'
$env:PROOF_CLASSIC_EMAIL='<testkonto A>'
$env:PROOF_STUDIO_EMAIL='<testkonto B>'
$env:PROOF_ACCOUNT_PASSWORD='<gemensamt testlösenord>'
```

`PROOF_*_EMAIL` och lösenordet används manuellt i webbläsaren; det read-only
scriptet läser bara business-id:n.

## 1. Maskinell preflight

```powershell
npm run proof:onboarding:two-account -- --phase=pre
```

PASS kräver för båda företagen:

- owner/admin-medlem finns;
- onboarding är inte klar;
- noll produkter, jobbtyper, mallar, kunder, affärer och offerter.

Vid FAIL: fortsätt inte. Byt testkonto eller förstå avvikelsen först; rensa
aldrig ett konto på chans.

## 2. Kör konto A — klassisk guide

Öppna Preview-URL:en med `/onboarding?classic=1` och logga in som konto A.

Stationer:

1. Bekräfta att klassiska guiden visas och Studio-skalet saknas.
2. Fyll i realistiska testuppgifter; ladda om mitt i ett steg och kontrollera
   att resume inte tappar sparade svar.
3. Välj prismodell. Sätt ett uttryckligt standardpris men behandla det som
   fallback, inte som universell sanning.
4. Välj telefonväg utan att ringa eller provisionera skarpt nummer.
5. Passera betalsteget endast via godkänd Stripe-test-/testkontoväg.
6. Hoppa över import eller importera endast kontrollerad testdata.
7. Skapa 1–3 vanliga jobbtyper.
8. Prissätt minst 3–5 nyckelartiklar för den valda jobbtypen.
9. Koppla minst ett offertupplägg och kontrollera förhandsvisningen.
10. Välj **Första offert** som första uppdrag.
11. Kontrollera att den riktiga offertbyggaren öppnas med jobbtyp, kopplade
    artiklar, verkliga priser och reservationer.
12. Spara, ladda om, återöppna och förhandsgranska.
13. Skicka till kontrollerad testmottagare. Bekräfta att `sent/sent_at` sätts
    först efter den riktiga sändvägen.

Spara per station: PASS/FAIL, skärmbredd, ungefärlig tid, friktion och exakt
feltext. Bedöm inte bara om knappen gick att klicka — kontrollera resultatet.

## 3. Kör konto B — Setup Studio

Öppna samma Preview med `/onboarding?studio=1` och logga in som konto B.
Kör exakt samma 13 stationer och samma testdataformat.

Extra Studio-stationer:

- Mattes meddelande ändras korrekt per steg.
- Inställningskvittot visar bara verkligt angivna uppgifter.
- Mobilvyn saknar överlapp och horisontell scroll.
- `Byt till klassisk guide` fungerar direkt utan tappad formstate.
- En omladdning efter bytet respekterar sessionsvalet.
- Inga andra API-anrop eller dataskillnader uppstår jämfört med konto A.

## 4. Maskinell postflight

När båda resorna är färdiga:

```powershell
npm run proof:onboarding:two-account -- --phase=post
```

PASS kräver per företag:

- onboarding klar;
- minst tre produkter och tre verkligt prissatta produkter;
- minst en aktiv jobbtyp;
- minst ett offertupplägg kopplat till jobbtypen;
- minst en offert;
- minst en offert med status `sent` efter kontrollerat utskick.

## 5. Bedömning och releasebeslut

Klassificera fynd:

- **P0:** fel tenant, falsk framgång, fel pris, debitering/utskick utan
  kontroll, permanent dataförlust. Stoppa release.
- **P1:** resan går inte att slutföra eller återuppta. Fixa före aktivering.
- **P2:** begriplighets-/layoutproblem med fungerande fallback. Kan hålla
  Studio-flaggan avstängd utan att blockera lanseringen.
- **P3:** kosmetik eller copy. Backlog.

Setup Studio aktiveras i Production bara om konto B är grönt och inte har
fler blockerande fynd än konto A. Annars lanseras den klassiska V1:an och
Studio fortsätter baka bakom flaggan.
