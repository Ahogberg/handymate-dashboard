# Grundarerbjudandet — herosektion vid lansering

**Status: UTKAST för Andreas granskning (2026-09-12). Publiceras INTE före villkoren i §9.**
Ersätter nedräkningssektionen (`#lanseringHero` i `handymate-landing/index.html`) den dag lanseringen sker.
Bygger vidare på [grundarprogrammet.md](./grundarprogrammet.md) och dess regel: **garantin får aldrig föregå sina bevis.**

---

## 1. Varför den här konstruktionen

Andreas invändning mot 30 dagars pengarna-tillbaka är riktig, och Hormozis skäl är tre: alla har den, så den särskiljer inget; den lockar återbetalningsjägare; och den tar bara bort nedsidan utan att höja den upplevda sannolikheten att produkten faktiskt fungerar — vilket är variabeln som säljer.

Hans alternativ är den **villkorade** garantin. Gör X, och om du ändå inte får Y betalar vi. Den filtrerar fram dem som faktiskt använder produkten, tvingar oss att namnge löftet exakt, och flyttar risken utan att inbjuda till slarv.

Värdeekvationen (drömresultat × upplevd sannolikhet ÷ tid × ansträngning) tillämpad på oss idag:

| Variabel | Vår hävstång just nu |
|---|---|
| Drömresultat | Redan formulerat: missar aldrig ett jobb, offert samma dag, Skatteverket aldrig ditt problem |
| Upplevd sannolikhet | **Svagast.** Noll kundcitat. Måste bäras av garanti, demo och branschdetalj |
| Tidsfördröjning | Igång-garantin: en vecka, annars jobbar vi gratis tills du är det |
| Ansträngning | Vi gör inflyttningen. Med 15 kunder kostar det bara vår tid |

Slutsatsen: **garantera nämnaren, inte täljaren.** Vi kan inte lova affärsutfall vi aldrig observerat en enda gång. Vi kan lova tid, ansträngning och att vi bär risken.

---

## 2. Herotexten

> ### Vi tar risken. Du tar jobben.
>
> Handymate fångar samtalen du missar, skriver offerten samma dag och håller ordning på ROT, ÄTA och fakturor. Du gör hantverket.
>
> Vi lanserar nu och söker **15 grundarkunder**. Ni får priset låst för alltid, vi flyttar in er, och ni betalar bara om ni faktiskt använder det.
>
> **[Ta en av platserna]**  ·  [Se hur det fungerar](/demo)
>
> *Plats 1 av 15 · priset höjs när de är tagna*

Räknaren under knappen ska läsa verkligt antal tagna platser, inte en påhittad siffra. Är den inte kopplad till data: skriv ingen siffra alls.

---

## 3. Garanti 1 — Användningsgarantin

Den här ersätter 30 dagars pengarna-tillbaka. Den riktar sig mot det en hantverkare faktiskt är rädd för: att köpa ännu ett system som ingen i firman öppnar efter tre veckor.

> **Använd det. Annars kostar det inget.**
>
> Använd Handymate på fyra av åtta ytor under dina första 30 dagar. Gör du det och ändå inte tycker att det är värt pengarna, säg till före dag 90 så får du **hela året tillbaka**. Du behåller all data, och vi hjälper dig exportera den.

**Varför den är stark:** villkorad, så den filtrerar. Specifik, så den går att pröva. Och hela året i stället för trettio dagar är det som gör att den märks.

**Varför vi kan administrera den rättvist:** de åtta ytorna och tröskeln fyra är inte påhittade för säljtexten — de är `lib/admin/adoption.ts`, som redan räknar detta per konto med trettio dagars fönster från `onboarding_completed_at`. Kunden ska kunna se sin egen räknare i produkten. **Krav före publicering:** ytan finns i admin men inte för kunden. Antingen exponeras den, eller så får garantin inte hänvisa till ett mått kunden inte kan se.

**Fönstren är avsiktligt olika.** Användningsvillkoret mäts på 30 dagar, beslutet ska fattas före dag 90. Det ger kunden gott om tid och binder vår exponering till ett kvartal i stället för ett rullande år.

---

## 4. Garanti 2 — Igång-garantin

> **Igång inom en vecka, annars jobbar vi gratis tills du är det.**
>
> Vi flyttar in dig: nummer, kunder, prislista, jobbtyper. Är du inte igång på riktigt inom sju dagar från att du sagt ja fortsätter vi utan att fakturera tills du är det.

Detta är ansträngningsvariabeln, den billigaste hävstången vi har vid femton kunder. "Igång på riktigt" måste definieras i villkoren — förslag: numret tar emot samtal, kundregistret är inläst, och första offerten är skickad ur systemet.

---

## 5. Prislåset

> **Ditt pris ändras aldrig.** Så länge du är kvar betalar du grundarpriset — inte nästa års pris, inte priset när vi lagt till fler agenter.

Livstid, inte tre år. Det kostar oss noll idag, och de första femton är värda mer som referenser än som intäkt. Att priset höjs för alla efter dem är dessutom **äkta** knapphet: vi kan inte flytta in hur många som helst manuellt.

---

## 6. Handymate Accounting — så här, inte som "ingår gratis"

Andreas förslag var att årsavtal ger Accounting fritt i tolv månader från lansering. Rätt instinkt, fel konstruktion: vi lovar bort en produkt som inte finns, och en bonus som kommer "någon gång" försämrar erbjudandet eftersom fördröjning ligger i nämnaren.

Två hållbara varianter:

**A. Daterat löfte med namngiven kompensation.** "Lanseras Accounting före den 30 juni 2027 ingår det i tolv månader. Blir det senare får du ytterligare tre månader av plattformen utan kostnad för varje kvartal vi är sena." Kunden vet exakt vad utfallet blir i båda fallen.

**B. Prisgaranti i stället för fri tillgång.** "När Accounting kommer får grundarkunder det till halva listpriset, för alltid." Vi lovar bara något vi kontrollerar fullt ut.

**Rekommendation: B.** Den kan skrivas idag utan att något behöver bli sant först. A kräver att vi har ett datum vi vågar stå för.

---

## 7. Citatrutan

Den tomma citatrutan (borttagen från startsidan 2026-09-12) blir en styrka i det här sammanhanget, inte en lucka:

> **Här ska det stå vad en kund tycker.**
> Vi har inga kundcitat än — vi lanserar nu. Det som står här när det kommer ska gå att belägga, precis som allt annat vi påstår. Under tiden får du garantierna i stället.

Ingen konkurrent gör det, och det säger exakt det en hantverkare undrar: ljuger de för mig?

---

## 8. Pilotkunderna — Hormozi om "gratis test"

Andreas fråga: erbjuda ett par firmor gratis nu för att få ut citat och förhoppningsvis konvertera?

**Hormozis svar är nej till gratis, ja till case-studyn.** Gratis ger noll åtagande, därmed noll användning, därmed inget citat värt att publicera. Vi har redan en databas full av konton som aldrig loggade in. Ett till hjälper inte.

Hans konstruktion i stället — **betala fullt, få tillbaka allt när case-studyn är levererad:**

> **Pilotplats (2–3 stycken).** Du betalar årspriset som alla andra. Har du efter 90 dagar använt Handymate på fyra av åtta ytor och sitter ner en halvtimme med oss och går igenom dina siffror på inspelning, får du **hela året tillbaka**.

Varför det slår gratis:
- **Betalningen skapar åtagandet.** Den som betalat 59 950 kr loggar in. Den som fått det gratis gör det inte.
- **Återbetalningen är villkorad av exakt det vi behöver:** faktisk användning och ett inspelat samtal med siffror.
- **Gör de inget behåller vi pengarna** och har lärt oss något om produkten i stället.
- **Citatet är förtjänat.** Personen har verkligen använt systemet i nittio dagar.

**Transparenskrav:** ett citat från någon som fått året återbetalat måste märkas som det. Skriv "Pilotkund — fick årsavgiften återbetalad mot att dela sina siffror". Det gör citatet mer trovärdigt, inte mindre, och det är samma linje som resten av sajten.

**Ta fler än två.** De flesta case-studies blir oanvändbara: firman byter inriktning, personen är obekväm på inspelning, siffrorna blir röriga. Sikta på fem pilotplatser för att få två riktigt bra.

---

## 9. Exponeringen — bestäm dig innan du publicerar

Firman kostar 59 950 kr/år. Femton grundarkunder på årsavtal med full återbetalning är i värsta fall **omkring 900 000 kr** som aldrig blir intäkt.

Det talet ska inte skrämma bort dig, men det ska vara ett medvetet beslut. Hormozis egen regel gäller: skrämmer garantin dig inte alls är erbjudandet för svagt, skrämmer den dig mycket är produkten inte klar.

Tre saker dämpar utfallet. Användningsvillkoret filtrerar hårt — den som faktiskt kört fyra av åtta ytor i trettio dagar och ändå vill ut är ovanlig. Beslutsfönstret stänger dag 90. Och blir återbetalningarna många är det signalen att inte skala, inte en olycka.

---

## 10. Villkor för publicering

Ingen rad i det här dokumentet går live innan följande är sant. Garantin får inte föregå sina bevis.

1. **Telefonprovet genomfört och utfallet ifyllt.** "Fångar samtalen du missar" kräver att Lisa fångat minst ett riktigt samtal. Just nu: noll.
2. **Driftblockerarna lösta.** 46elks påfyllt, Stripe i skarpt läge, VAPID-nycklarna satta, Google omkopplat.
3. **Fortnox verifierat mot ett riktigt bolag.** "Skatteverket blir aldrig ditt problem" vilar på den kedjan, och noll konton är kopplade.
4. **Adoptionsmåttet synligt för kunden**, annars får garantin inte hänvisa till det.
5. **Platsräknaren kopplad till data**, eller borttagen.
6. **Beslut om exponeringen i §9.**
7. **Juridisk genomläsning av garantitexterna.** De blir avtalsvillkor i samma stund de publiceras.

---

## 11. Att göra i koden när det är beslutat

- Ersätt `<section class="lansering" id="lanseringHero">` i `handymate-landing/index.html` med erbjudandesektionen. CSS-blocket `.lansering*` och skriptet längst ned (raderna märkta "DEN 14 SEPTEMBER") tas bort samtidigt.
- Citatrutans plats i `index.html` har en kommentar som beskriver hur den sätts tillbaka; texten i §7 kan gå in där direkt.
- Garantitexterna speglas i användarvillkoren på `/integritet`, annars gäller de inte.
