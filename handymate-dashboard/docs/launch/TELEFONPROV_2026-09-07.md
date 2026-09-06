# Telefonprov i produktion — 7 september 2026

Det som inte går att prova headless: inloggade flöden på en riktig telefon.
Allt nedan ligger på main sedan i natt. Skriv utfall direkt i den här filen
(Grönt / Rött + vad du såg) så tar Claude eller Codex fynden i tur och ordning.

Konto: TEST Codex – onboarding El (plus-adressen handymate-test), comp-status.
Använd aldrig Bee Service eller Nordström El för prov som skapar data.

## 0. Förberedelser (5 min)
- [ ] Fyll på 46elks-saldot. Utan det går varken nummerköp eller Lisa-provet.
- [ ] Installera PWA:n på telefonen (Dela → Lägg till på hemskärmen på iPhone).
      Godkänn push när appen frågar. Förväntat: en rad i push_subscriptions
      (Claude kontrollerar).

## 1. Lisa fångar ett samtal (kräver saldo + PWA)
- [ ] Ring testkontots nummer från en annan telefon, låt det gå obesvarat.
- [ ] Förväntat inom en minut: push "Lisa fångade ett samtal från 070-…"
      om svar-SMS:et gick ut, annars "Missat samtal från 070-…". Efter 21:00
      hålls pushen till morgonsammanfattningen 07:10.
- [ ] Svara på SMS:et från den andra telefonen. Förväntat: ett kort i
      Godkännanden.

## 2. Ny onboarding på telefon (nytt konto: plus-adressen handymate-test2)
- [ ] Registrera via riktig signup. Säg till Claude när kontot finns så sätts
      comp-status, annars stannar du i betalsteget.
- [ ] Telefonsteget: nummer tilldelas (saldo krävs). Om köpet misslyckas ska
      texten säga att inget nummer tilldelats — aldrig "reserverat" (F15).
- [ ] Rundturen: alla fem tipskort inom skärmen, toasten skymmer inte knappen.
- [ ] Efter avslut: företagsskanningen i smal vy. Rader med Importerat /
      Möjlighet / Uppskattat, slutkort, knappen leder vidare. "Ge mig några
      sekunder", inte 40.
- [ ] Första uppdraget: "Använd för min första offert" → offertskaparen.
      "+ Skapa ny kund" finns i kundvalet, namn och telefon krävs (F16).

## 3. Offert → kund på telefon
- [ ] Skapa offert med en arbetsrad. Summeringen visar Arbete med belopp,
      inte 0 kr. Belopp med öre skrivs "1 062,50 kr", hela kronor utan decimaler.
- [ ] Skicka via e-post. Öppna kundlänken på telefonen: rätt rader, signera.
- [ ] Tillbaka i appen: status Accepterad, knappen heter "Skapa projekt";
      efter projektet finns heter den "Öppna projekt".

## 4. Projekt på telefon
- [ ] Tid & team → Lägg till tid 1 h. Förväntat: timmen syns direkt utan
      omladdning, till 850 kr/tim (F17/F18).
- [ ] Översikt: knapparna Fakturera och Förbered faktura öppnar fakturaunderlaget,
      inte Mattes röstpanel. Matte-bubblan ligger inte över knapparna (F19).
- [ ] Ny ÄTA med intern anteckning → Skicka → "Kopiera signeringslänken".
      Förväntat: kvitto "Länk kopierad. ÄTA:n är markerad som skickad", ÄTA:n
      syns i kundportalen, kund-PDF:en visar INTE den interna anteckningen
      (F10, F22). Kontrollera att urklippet innehåller rätt länk.
- [ ] Fliken Uppgifter visar uppgifter, inte planering (F06).
- [ ] Dagsavslut via Jobbkompisen: säg "en halvtimme, fakturerbart" →
      bekräftelsekort → sparat. I byggdagboken märks raden "Rapport".

## 5. Faktura på telefon
- [ ] Fler åtgärder → Förhandsgranska faktura. Knappen heter "Skapa faktura
      till …" och förklarar att den skapas som utkast (F23). Öre visas med
      två decimaler (F24).
- [ ] Skapa fakturan. Gå tillbaka till förhandsgranskningen: den visar
      "Fakturan finns redan: FV-…" med Öppna, inte nästa nummer.
- [ ] Projektöversikten: Fakturerat visar 0 tills fakturan är skickad (F25).
      Framdriftskortet räknar grundoffert + signerad ÄTA (F26).
- [ ] Fakturautkastet: ingen dröjsmålsränta, förfallodatum exakt 30 dagar (F11, F21).
- [ ] Skicka INTE fakturan om kunden är en riktig adress.

## 6. Schema och attest
- [ ] Ny schemapost 08–09 på en söndag. Förväntat: 08–09 i veckovyn, på rätt dag (F08, F09).
- [ ] Attest: veckonumret stämmer med veckovyn (F04).

## 7. Inställningar
- [ ] Underentreprenörer syns inte i menyn. Prislista och hemsidewidget
      syns inte i inställningarna (F03).
- [ ] Kundkontakt → Telefonassistentens röst öppnar hälsningsfras och röst (F07).

## Utfall
(skriv här)
