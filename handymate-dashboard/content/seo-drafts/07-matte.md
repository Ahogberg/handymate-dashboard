---
typ: agent-artikel
målsökord: AI-assistent hantverkare, chatta med AI företag, slippa administration hantverkare
status: UTKAST — ej godkänd
---

# Matte — chefsassistenten du pratar med

## Problemet

De flesta system kräver att du lär dig dem. Var ligger offerterna? Vilken flik
har kundregistret? Hur lägger man till en rad med rätt momssats?

Det är inte svårt — men det är ännu en sak att hålla i huvudet, och du har redan
ett yrke. Resultatet blir att system används till en bråkdel av vad de kan, och
att administrationen ändå hamnar på kvällen.

## Vad Matte gör

Matte är teamets chefsassistent. I stället för att du ska leta i menyer säger du
vad du vill ha gjort:

- **"Skapa en offert till Anna på badrumsrenovering"**
- **"Vilka fakturor är obetalda?"**
- **"Boka in ett platsbesök hos Svensson på torsdag"**

Matte förbereder det och lägger fram det. Ska något gå ut till en kund — ett
SMS, ett mejl — får du bekräfta först. Interna saker, som att slå upp en kund
eller förbereda ett utkast, gör han direkt.

Han fördelar också arbete till rätt kollega: en fråga om fakturor går till
Karin, en om projekt till Lars. Du behöver inte veta vem som gör vad.

## Varför en chatt och inte fler knappar

Ett vanligt system växer genom att lägga till funktioner, och varje funktion
behöver en plats i menyn. Efter några år har du ett program med femtio vyer där
du använder sex.

Ett team växer på ett annat sätt: du ber om något nytt, och någon fixar det.
Gränssnittet förblir detsamma — en konversation — även när förmågan bakom blir
större.

Det är riktningen vi bygger mot: att du ska kunna be om saker på svenska i
stället för att navigera. Vi är inte hela vägen fram, men det är dit vi siktar.

## Vad Matte inte gör

Han fattar inte affärsbeslut åt dig. Han sätter inte priser du inte godkänt, och
han skickar ingenting till en kund utan att fråga. Han är en duktig assistent —
inte en företagsledare.

---

## Källkontroll

| Påstående | Stöd | Bedömning |
|---|---|---|
| Chatt på webben, text | "Matte-chatt på webben (text)" i tillåten palett | OK i nutid |
| Skapa offert/faktura, slå upp kund, boka via chatt | Matte **BYGGT**, 24+ verktyg via delad tool-router | OK — funktionellt |
| Externa utskick kräver bekräftelse | Säkerhetsräcket (bekräftelsekort för SMS/mejl) mergat 2026-07 | OK — och viktig trovärdighetspunkt |
| Interna saker körs direkt | Samma räcke: internt = ogatad | OK |
| Fördelar till rätt kollega (handoff) | Handoff till specialister, **BYGGT** | OK |
| "riktningen vi bygger mot… inte hela vägen fram" | Medveten framtidsform per Andreas anvisning | OK — ärligt |

**⚠ STATUS-FLAGGA:** Matte är **BYGGT**, och inventeringen noterar att
agent-skapade offerter/fakturor hade tomma rader fram till fixen 2026-07-09
samt att webbchatten "kräver fortsatt smoke-test". Texten innehåller därför
inga påståenden om träffsäkerhet eller hur ofta det fungerar. Exempelmeningarna
("Skapa en offert till Anna…") är formulerade som *vad man kan be om*, inte som
garanterade utfall.

**Medvetet utelämnat:** mobilchatten (EAS-bygget saknas — telefoner kör
majversionen), röstkommandon, "Matte minns ditt företag" (minnet nyss inkopplat,
oanvänt), antal verktyg som marknadsföringssiffra.
