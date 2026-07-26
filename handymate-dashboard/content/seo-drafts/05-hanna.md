---
typ: agent-artikel
målsökord: få fler jobb hantverkare, gamla kunder tillbaka, tunn vecka hantverksföretag
status: UTKAST — ej godkänd
---

# Hanna — den som väcker kunderna du redan har

## Problemet

En etablerad hantverksfirma har hundratals kunder i registret. Folk som varit
nöjda, betalat, och som gärna skulle anlita dig igen.

De flesta av dem hör aldrig av dig igen.

Inte av illvilja — utan för att marknadsföring mot gamla kunder kräver att någon
sätter sig, går igenom listan och skriver. Och den någon har fullt upp med att
utföra jobb.

Samtidigt gapar kalendern om tre veckor.

## Vad Hanna gör

Hanna är teamets marknadsförare, och hennes revir är kundbasen du redan byggt:

- **Hittar kunder som inte hört av sig på länge** och föreslår att höra av sig —
  med ett utkast till meddelande, inte bara en påminnelse om att du borde.
- **Reagerar på tunna veckor.** När kalendern ser gles ut kan hon föreslå att
  erbjuda tider till tidigare kunder, i stället för att veckan bara passerar.
- **Ber om omdömen** efter avslutade jobb, så att nöjda kunder faktiskt syns för
  nästa person som söker.

Ingenting går ut utan att du sagt ja. Hannas förslag hamnar i kön som allt
annat — och just för utskick till kundregistret är den spärren viktig. Du känner
dina kunder; det gör inte ett system.

## Varför befintliga kunder är den billigaste marknadsföringen

Att skaffa en ny kund kostar tid, annonspengar eller båda. Att påminna en gammal
kund kostar ett meddelande.

Ändå är det nästan alltid nya kunder man jagar — för de gamla känns "färdiga".
Det är de sällan. Ett badrum blir ett kök. Ett tak behöver ses över. En kund som
var nöjd 2023 har fortfarande ett hus.

Det är den arbetsuppgiften Hanna finns för: att någon faktiskt går igenom
listan, regelbundet, utan att det kostar dig en kväll.

---

## Källkontroll

| Påstående | Stöd | Bedömning |
|---|---|---|
| Hittar vilande kunder, föreslår kontakt | Hanna reaktivering **BYGGT** (gatad), `hanna-outbound` | OK — "föreslår", gatningen uttalad |
| Reagerar på tunna veckor | Kapacitetsfyllnad (tunn vecka → kö-kort, aldrig autonomt) | OK — beskrivet som förslag |
| Ber om omdömen efter jobb | Recensionsförfrågningar **BYGGT/LIVE** (`review-requests`) | OK |
| Inget skickas utan godkännande | Gatad reaktivering + godkännandekö **LIVE** | OK — och viktigaste meningen i texten |
| Resonemang om befintliga vs nya kunder | Allmänt marknadsföringsresonemang, inget produktlöfte | OK |

**⚠ STATUS-FLAGGA:** reaktivering är **BYGGT** (gatad), inte LIVE. Texten
innehåller därför noll siffror om svarsfrekvens, återköp eller intäkt — allt
sådant väntar på case-studyn. Serviceavtals-delen (Motor 2) är medvetet INTE
nämnd här: den är deployad men helt oanvänd, och en artikel är permanent.

**Medvetet utelämnat:** "Väck kundbasen"-svepet (nybyggt, oanvänt), konkreta
konverteringssiffror (t.ex. räkneexemplet i pitchen — det är muntligt
demo-material, inte permanent text), SMS-kampanjer/utskicksvolymer.
