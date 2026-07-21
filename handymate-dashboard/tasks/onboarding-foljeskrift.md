# Onboarding-följeskrift — "Första veckan med ditt team"

_Utkast 2026-07-21. INTE ett dokument som skickas — det är ORDEN som fördelas
över fyra touchpoints i produkten, tajmade till när värdet uppstår. Granskas av
Andreas + Christoffer (tonen är det känsliga). Byggs efter godkänd text; all
infra finns redan (WelcomeModal, bevisband, Resend, push/46elks).
Ton: "team, inte verktyg" — inifrån nu, till någon som redan sagt ja.
Strikt mot "får inte sägas"-listan: Lisa PRATAR inte (fångar samtal + SMS);
Fortnox kräver kundens egen licens; inga overifierade löften._

---

## Touchpoint 1 — Dag 0, första inloggningen
_(In-app, uppdaterar WelcomeModal. Visas en gång. Kort — hantverkaren vill in.)_

**Rubrik:** Välkommen — ditt team är på plats.

**Text:**
Du har precis anställt sex medhjälpare. De börjar med att lära känna ditt
företag de närmaste dagarna — dina kunder, dina priser, ditt sätt.

Sen börjar de jobba. Lisa fångar samtalen du missar. Karin håller koll på
fakturorna. Daniel följer upp offerterna. Och du?

**Du är chefen.** Ingenting går ut utan ditt OK. Allt de föreslår hamnar i din
kö — godkänn med ett tryck, eller låt bli. Ju mer de bevisar sig, desto mer
kan du lämna över, i din takt.

**Knapp:** Visa mig kön → _(leder till Idag-vyn)_

**Not:** håll den under 60 ord synligt. Ingen video, ingen guidad tur som
tvingar klick — hantverkaren scrollar bort det. En rad, en knapp.

---

## Touchpoint 2 — Dag 1–7, varje morgon
_(In-app bevisband i Idag-vyn — finns redan. Bygger vanan att öppna appen.
Första dagarna innan teamet hunnit göra mycket: sätt rätt förväntan istället
för att visa en tom yta.)_

**Dag 1–2 (teamet lär sig, lite hänt än):**
"Ditt team lär känna företaget. Om ett par dagar börjar du se dem jobba här."

**Från dag 3 (riktiga siffror, befintlig logik):**
"Sedan igår kväll tog teamet [N] samtal, skickade [N] påminnelser och
förberedde [N] offerter — [N] saker väntar på ditt OK."

**Not:** detta ÄR redan byggt (ProofBand i IdagCore). Enda tillägget:
dag-1–2-varianten för ett splitternytt konto, så ytan aldrig känns död.
Återanvänd cold-start-mönstret (visa förväntan, aldrig en tom "0").

---

## Touchpoint 3 — Vid första riktiga händelsen
_(SMS + push till mobilen. DET HÄR är ögonblicket det klickar — teamet gjorde
något verkligt. Trigga på första meningsfulla åtgärden. Max 160 tecken.)_

**Hero-fallet — första fångade missade samtalet:**
> Handymate: Lisa fångade precis ett samtal du missade från [Kund] och
> skickade ett svar-SMS. Ligger i appen — kolla när du kan. 💪

**Variant — första offert-uppföljningen:**
> Handymate: Daniel följde just upp offerten till [Kund] åt dig. Godkänn eller
> ändra i appen.

**Variant — första fakturapåminnelsen redo:**
> Handymate: Karin har en påminnelse redo till [Kund] om en förfallen faktura.
> Ett tryck i appen så går den.

**Not:** ETT sådant SMS, bara det första — inte varje gång (det blir spam,
och kön finns för resten). Efter det bär appen + push. Trigga på whichever
händelse som inträffar först. Ärlig ton: "fångade/följde upp", aldrig
"pratade med kunden".

---

## Touchpoint 4 — Dag 7, ett (1) mail
_(Resend-mall + cron. Det ENDA mailet. Innehåller BEVIS, inte instruktioner —
veckovärdes-siffran ur data de redan har.)_

**Ämne:** Din första vecka med Handymate

**Text:**
Hej [Förnamn],

En vecka sedan du fick ditt team. Här är vad de gjorde åt dig:

- **[X] kundsamtal** fångade som annars kunde gått förlorade
- **[Y] timmar** administration du slapp
- **[Z] kr** i offerter ute som teamet följt upp

Det här är din vecka — inte en demo. Och teamet lär sig hela tiden: ju fler
gånger du godkänner samma sorts ärende, desto närmare kommer de att kunna sköta
det själva när du är redo att lita på dem med det.

[Knapp: Se hela veckan →]

Har du frågor? Svara på det här mailet — Andreas eller Christoffer läser.

**Not:** siffrorna kommer ur veckovärdes-vyn (finns). Om en siffra är noll:
utelämna raden, aldrig "0 kr" (samma anti-brus-regel som dashboarden). Ett
tomt-vecka-fall (kunden knappt använt): mjuk variant — "Teamet är på plats och
redo — säg till om du vill att vi hjälper dig igång", aldrig en tom skrytlista.

---

## Sammanfattning av vad som byggs (efter godkänd text)
1. **WelcomeModal-copy** — uppdatera texten (finns, ~1 rad kod).
2. **Bevisband dag-1–2-variant** — cold-start-copy för nytt konto (litet).
3. **Första-händelse-SMS** — en trigger + "har detta konto fått sitt
   välkomst-SMS?"-flagga (så det bara skickas en gång). ~½ dag.
4. **Dag-7-mail** — Resend-mall + cron som läser veckovärdet, med noll-
   hantering + tomt-vecka-variant. ~½ dag.
Allt återanvänder befintlig infra. Ingen migration (flaggan kan ligga i
business_preferences).
