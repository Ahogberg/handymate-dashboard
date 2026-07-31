# Prompt till Claude Design — omtag av projektdetaljvyn

_Kopiera allt nedanför linjen och ge till Claude Design tillsammans med
skärmdumpar av dagens vy (öppna ett projekt under Jobb → Projekt i appen —
ta gärna skärmdumpar av alla flikar/sektioner, både desktop och mobil)._

---

Du ska göra ett design-omtag av **projektdetaljvyn** i Handymate — sidan en
hantverkare öppnar för ett enskilt projekt ("Badrumsrenovering Svensson").
Detta är den sista vyn i appen som är kvar i vårt gamla designspråk, och
den är samtidigt en av de mest innehållstäta.

## Kontext: vad Handymate är

Handymate är ett AI-team för svenska hantverkare. Användaren är en
hantverkare som oftast står på ett bygge med telefonen i handen — smutsiga
handskar, starkt solljus, ont om tid. Designspråket i resten av appen:

- **Ljust tema. Teal (#0F766E, "primary") som primärfärg.** Aldrig mörkt
  tema, aldrig lila/fuchsia, aldrig den gamla himmelsblå accenten.
- Vita kort med tunn grå border (`#E2E8F0`), `rounded-xl`, mjuka skuggor
  endast vid hover/fokus.
- **Mobilen är förstahandsformatet** — desktop är sekundärt.
- All text på svenska, inga tekniska termer ("agent run", "payload" osv.
  förbjudna). Knappar säger exakt vad som händer ("Skicka faktura", inte
  "OK").
- Referensytor i samma app som redan är i rätt språk: Idag-vyn
  (godkännande-kön), onboardingen, hjälpcentret, kundportalen.

## Vad vyn innehåller i dag (behåll ALL funktionalitet)

Projektdetaljen samlar allt om ett pågående jobb:
- Projektstatus/faser (planering → pågående → klart) med automationer
  kopplade till fasbyten
- Ekonomi: offererat belopp, nedlagd tid, materialkostnader, prognos
- Tidrapportering och bemanning (vilka som jobbar i projektet)
- Dokument, foton och formulär kopplade till projektet
- ÄTA-hantering (ändrings- och tilläggsarbeten)
- Aktivitetslogg (vad har hänt, vem gjorde vad)
- Koppling till offert (ursprunget) och fakturor (utfallet)
- Diverse modaler: skapa faktura, ladda upp, redigera, checklistor

## Problemen med dagens design (därför omtaget)

1. **Gammal färgvärld:** genuina himmelsblå knappar och accenter
   (`sky-600`-blått) som inte finns någon annanstans i appen längre.
   All annan drift är redan städad — den här vyn är den enda kvar.
2. **Strukturell spretighet:** vyn har vuxit i etapper (~5 800 rader kod)
   och hierarkin är otydlig — primära åtgärder, sekundära åtgärder och
   information ser likadana ut. Det är svårt att på 3 sekunder svara på
   "hur går det här projektet och vad behöver jag göra härnäst?"
3. **Mobilupplevelsen är eftermonterad** snarare än designad: breda
   sektioner, små tryckytor, mycket scrollande för att nå det viktiga.

## Designuppgiften

1. **Informationshierarki först:** designa vyn kring hantverkarens två
   frågor — "hur ligger projektet till?" (status, ekonomi-hälsa, nästa
   fas) överst, "vad behöver jag göra?" (väntande åtgärder, ofakturerat,
   saknade tidrapporter) direkt därefter. Detaljsektioner (dokument,
   logg, bemanning) får ligga bakom flikar eller expanderbara sektioner.
2. **En primär åtgärd per läge:** vyn ska alltid visa EN tydlig teal
   huvudknapp för det mest sannolika nästa steget (t.ex. "Skapa faktura"
   när projektet är klart och ofakturerat). Övriga åtgärder sekundära.
3. **Mobil först:** designa 390 px-bredden först, desktop som utökning.
   Tryckytor minst 44 px. Det viktigaste utan scroll.
4. **Ekonomin visuell:** offererat vs nedlagt vs fakturerat förtjänar en
   enkel visuell representation (staplar/progress), inte bara siffror.
   Siffror med tusentalsavgränsning ("10 000 kr", aldrig "10000").
5. **Teal-språket rakt igenom:** primärknappar teal, statusfärger
   semantiska (grönt = klart/positivt, amber = väntar, rött = kräver
   åtgärd), aldrig lila/blå accenter.

## Får INTE ändras

- Funktionalitet: allt som går att göra i dag ska gå att göra i den nya
  designen (lista ovan).
- Godkännande-mönstret: åtgärder som skickar något till kund går alltid
  via förslag → godkänn, aldrig direktutskick. Visa det mönstret, göm
  det inte.
- Terminologin: "Projekt", "ÄTA", "Tidrapport", "Faktura" — etablerade
  ord i appen, hitta inte på nya.
- Persona-färgerna om AI-medarbetarna syns i vyn (Lisa = blå, Hanna =
  lila osv. — de är avsiktliga undantag från teal-regeln).

## Leverans

Ge oss vyn sektion för sektion (mobil + desktop per sektion) med:
- Layoutskisser/mockups för huvudvyn och de viktigaste tillstånden
  (pågående projekt, klart-men-ofakturerat, nystartat tomt projekt)
- Exakt copy på svenska för rubriker, knappar och tomma lägen
- Anteckningar om vilka befintliga komponenter från Idag-vyn/kundkortet
  som återanvänds (kort, badges, knappar) så koden kan dela komponenter

Ställ frågor om något i innehållslistan är oklart INNAN du designar —
vyn är för viktig för gissningar.
