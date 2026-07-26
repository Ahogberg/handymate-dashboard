---
typ: agent-artikel
målsökord: obetalda fakturor hantverkare, fakturapåminnelse automatiskt, ROT-avdrag räkna ut
status: UTKAST — ej godkänd
---

# Karin — den som ser till att pengarna kommer in

## Problemet

Jobbet är gjort. Fakturan är skickad. Sedan händer ingenting.

Att jaga betalning är den del av hantverksföretagandet som ingen gillar. Det
känns påstridigt, det tar tid, och det är lätt att skjuta upp — särskilt med en
kund man vill ha tillbaka. Resultatet är pengar som ligger ute i månader.

## Vad Karin gör

Karin är teamets ekonom. Hon håller ordning på det som ska in:

- **Bevakar förfallodatum** och förbereder en vänlig påminnelse när en faktura
  passerat sitt datum — formulerad så att du kan skicka den utan att skämmas.
- **Räknar ROT-avdraget** rätt: på arbetskostnaden, inte på materialet, och med
  årets tak i åtanke så beloppet blir korrekt redan i offerten.
- **Håller koll på vad som är betalt och inte**, så du ser läget utan att öppna
  bokföringen.

Påminnelsen skickas inte automatiskt bakom din rygg. Den läggs som ett förslag
du godkänner — eller ändrar först, om du vet något om kunden som systemet inte
vet.

## Varför ROT-delen är svårare än den ser ut

ROT-avdrag räknas på arbetskostnaden. Det låter enkelt tills en offert
innehåller både arbete och material i samma rad, kunden har använt en del av
sitt årliga tak hos någon annan, och beloppet ska stämma både i offerten och på
fakturan.

Det är precis den sortens detalj där ett internationellt system översatt till
svenska går sönder — och den sortens detalj som gör att en kund ringer och
undrar varför siffran inte stämmer.

## Varför det spelar roll

En faktura som ligger obetald i 60 dagar är inte bara en likviditetsfråga. Det
är också en relation som blir obekväm. Att påminnelsen går ut i tid, vänligt
formulerad, är bättre för både kassan och kundrelationen än att du tar det när
irritationen hunnit byggas upp.

---

## Källkontroll

| Påstående | Stöd | Bedömning |
|---|---|---|
| Bevakar förfallodatum, förbereder påminnelse | Karin påminnelser **LIVE** (`check-overdue`, `send-reminders`) | OK i nutid |
| Påminnelsen godkänns/ändras av dig | Godkännandekö **LIVE** | OK |
| ROT räknas på arbetskostnad med årstak | "ROT-beräkning med årstak" i tillåten palett | OK |
| Ser vad som är betalt/obetalt | Faktura-status + veckovärde i palett | OK |
| Resonemang om ROT-komplexitet | Allmänt sakresonemang om svenska regler, inget produktlöfte | OK |

**Medvetet utelämnat:** ROT-fil till Skatteverket (**BYGGT**, aldrig skarpt
inlämnad — får inte nämnas), Fortnox-synk (licens-blockerat), automatisk
betalningsavstämning, "Swish/betala i appen" (Stripe obevisad), alla siffror på
hur mycket snabbare kunder får betalt.

**⚠ FLAGGA TILL ANDREAS:** "60 dagar" i sista stycket är ett allmänt exempel på
sen betalning, inte en siffra ur vår data. Bedöm om du vill ha den kvar.
