# Enat fakturautskick (kund + Fortnox) — Design

## Bakgrund

Handymate har idag två separata, manuella knappar för en kundfaktura:

1. **"Skicka faktura"** (`app/api/invoices/send/route.ts` → `lib/invoices/send-invoice.ts`)
   — skickar email/SMS till kunden. Rör aldrig Fortnox.
2. **"Skicka via Fortnox"** (`app/api/invoices/[id]/send-via-fortnox/route.ts`)
   — skapar fakturan i Fortnox via `POST /invoices`, sparar
   `fortnox_invoice_number`/`fortnox_document_number`/`fortnox_sync_status`
   på `invoice`-raden, sätter `status='sent'`, och triggar redan idag
   post-send-automationer (pipeline-flytt, projektsteg, smart-
   communication, portal-notifikation).

Två separata knappar skapar en verklig risk: en hantverkare skickar till
kunden men glömmer Fortnox-knappen (bokföringen missar fakturan), eller
tvärtom (kunden får aldrig fakturan trots att den är bokförd).

Diskuterat och verifierat innan design:

- **Kodgranskning** av `send-via-fortnox/route.ts` visar att dagens
  Fortnox-payload INTE innehåller något `EmailInformation`-fält eller
  någon explicit skicka-flagga — `POST /invoices` skapar bara fakturan
  som bokföringspost i Fortnox. Fortnox mejlar alltså inte kunden
  automatiskt av detta anrop.
- **Konkurrensresearch**: Easoft låter Fortnox själv mejla slutkunden
  (Easoft har ingen egen kundvy i det flödet). Bygglet pushar till
  Fortnox och får bara betalningsstatus tillbaka i daglig batch.
  Fortnox API blockerar/varnar vid kolliderande faktura-/OCR-nummer —
  nummerserien måste ägas av EN part (Fortnox).
- **Verklig dubbelfaktureringsrisk**: en människa som senare loggar in
  i Fortnox och manuellt trycker "Skicka" där, ovetandes om att
  Handymate redan levererat fakturan till kunden.

## Beslut

1. **Ordning: Fortnox först, sedan kund.** Skapa fakturan i Fortnox och
   hämta deras officiella `DocumentNumber` innan kunden får något —
   säkrast för nummerkonsistens, matchar Bygglets mönster.
2. **Delfel hanteras idempotent per steg.** Om Fortnox-steget lyckas men
   kundutskicket misslyckas: fakturan hamnar i ett läge "bokförd, ej
   levererad". En omkörning gör ALDRIG om Fortnox-anropet, bara
   kundleveransen.
3. **Tekniskt dubbelskydd byggs i V1.** Fakturan markeras som "sent"
   direkt i Fortnox efter att den skapats, så Fortnox egen "Skicka"-
   funktion i deras gränssnitt visar den som redan skickad. Exakt
   API-anrop verifieras mot Fortnox live-dokumentation under bygget —
   går det inte att verifiera pålitligt, degraderar vi till en tydlig
   varningstext i UI:t istället, flaggat explicit i planen.
4. **Företag utan Fortnox kopplat påverkas inte.** Den enade knappen
   hoppar över Fortnox-steget helt och beter sig identiskt med dagens
   "Skicka faktura" för dem.

## Arkitektur

**Ingen ny route, ingen ny knapp för kunden.** Den befintliga
`/api/invoices/[id]/send`-rutten (samma "Skicka faktura"-knapp som
redan finns i UI:t) utökas att göra Fortnox-steget FÖRST.

**Ny fil: `lib/invoices/sync-to-fortnox.ts`** — Fortnox-skapande-logiken
från `send-via-fortnox/route.ts` (rad ~154-297 i den filen: bygg
`invoicePayload` inkl. ROT/RUT, säkerställ kund i Fortnox, `POST
/invoices`, spara `fortnox_invoice_number`/`fortnox_document_number`/
`fortnox_sync_status`) bryts ut till en delad, anropbar funktion
`syncInvoiceToFortnox(businessId, invoiceId)` som returnerar
`{ success, fortnoxInvoiceNumber?, fortnoxDocumentNumber?, error?,
skipped?: boolean }` (`skipped: true` när Fortnox inte är kopplat —
inte ett fel, bara "inget att göra här").

**Modifierad: `app/api/invoices/[id]/send/route.ts`** — anropar
`syncInvoiceToFortnox()` som steg 1. Om resultatet har `error` (och inte
`skipped`) avbryts hela anropet med 502 innan något kundutskick sker —
ingenting skickas till kund om Fortnox-steget misslyckades på riktigt.
Om `skipped` eller `success`, fortsätt till det befintliga
`sendInvoice()`-anropet (email/SMS), med Fortnox officiella
fakturanummer inskickat om det finns (för att visas på det utskickade
underlaget istället för Handymates interna nummer).

**Modifierad: `app/api/invoices/[id]/send-via-fortnox/route.ts`** —
blir en tunn wrapper som bara anropar `syncInvoiceToFortnox()` och
returnerar dess resultat. Behålls som egen route för det ombyggda
UI-syftet nedan (retroaktiv/manuell resynk), men dubblerar inte längre
logiken.

**Nytt fält på `invoice`**: `delivery_status` (`'pending' | 'delivered'
| 'delivery_failed'`, default `'pending'`) — separat från
`fortnox_sync_status`. Detta är fältet som avgör om en omkörning ska
hoppa Fortnox-steget (redan `fortnox_sync_status='synced'`, som
idempotens-skyddet redan gör idag) och bara göra om kundleveransen.

## Flöde (i `send/route.ts`)

1. Är Fortnox kopplat för företaget? Nej → hoppa till steg 4.
2. Är `invoice.fortnox_sync_status === 'synced'`? Ja → hoppa till steg 4
   (redan bokfört, ingen ny Fortnox-post). Nej → fortsätt.
3. `syncInvoiceToFortnox()`. Fel → sätt `delivery_status='delivery_failed'`
   inte satt (fakturan aldrig levererad än), returnera 502 med tydligt
   felmeddelande. INGET kundutskick sker.
4. `sendInvoice()` (email/SMS), med `fortnox_invoice_number` om
   tillgängligt.
5. Lyckas steg 4 → `delivery_status='delivered'`.
   Misslyckas steg 4 → `delivery_status='delivery_failed'`. Fakturan
   VAR bokförd (om Fortnox var inblandat) men aldrig levererad — UI:t
   visar detta tydligt och låter hantverkaren trycka skicka igen, vilket
   återstartar flödet från steg 2 (som då hoppar Fortnox-steget eftersom
   det redan är `synced`).

## Fortnox-dubbelskydd

Efter lyckad `POST /invoices` i `syncInvoiceToFortnox()`, gör ett andra
Fortnox-anrop som markerar fakturan som skickad i deras system (exakt
endpoint/fältnamn — t.ex. en `PUT /invoices/{DocumentNumber}` med ett
sent-relaterat fält, eller en dedikerad Fortnox-åtgärd för detta —
verifieras mot `developer.fortnox.se`/`api.fortnox.se/apidocs` under
implementationen). Detta anrops resultat påverkar INTE
`fortnox_sync_status` (fakturan är redan korrekt bokförd oavsett) — ett
misslyckande här loggas men blockerar inte flödet, eftersom
huvudsyftet (korrekt bokföring) redan är uppnått.

Om verifieringen under bygget visar att Fortnox API:et inte stödjer
detta på ett sätt som går att lita på, byts detta steg mot: en synlig
textrad i fakturavyn ("Denna faktura är redan skickad till kunden via
Handymate — skicka inte om från Fortnox") och en logg-notering i
planen om varför det tekniska skyddet uteblev.

## UI-ändringar

**Fakturasidan** (`app/dashboard/invoices/[id]/page.tsx`): den
befintliga "Skicka via Fortnox"-knappen byter etikett till "Synka om
till Fortnox" och flyttas till en sekundär position (t.ex. under en
"Mer"-meny eller i en teknisk detaljsektion) — den är kvar för
retroaktiv synk av fakturor skickade innan denna funktion fanns, eller
manuell felsökning, men är inte längre den primära vägen. Huvudknappen
"Skicka faktura" gör nu båda stegen.

Ny visuell status vid `delivery_status='delivery_failed'`: en tydlig
banner på fakturan — "Bokförd i Fortnox (faktura {nummer}), men kunde
inte levereras till kunden. Försök skicka igen." — med samma
skicka-knapp.

## Testning

- Facit på `syncInvoiceToFortnox()` som ren, mockbar funktion:
  Fortnox ej kopplat → `skipped: true`; redan `synced` → idempotent
  return utan nytt API-anrop (befintligt skydd, flyttat oförändrat);
  Fortnox-fel → `error` satt, ingen partial-uppdatering av
  `delivery_status`.
- Facit på `send/route.ts`: Fortnox-fel blockerar kundutskick helt
  (mockat `sendInvoice` aldrig anropad); Fortnox `skipped` (ej kopplat)
  går rakt igenom till kundutskick identiskt med dagens beteende;
  Fortnox-lyckat + kundutskick-fel → `delivery_status='delivery_failed'`,
  omkörning hoppar Fortnox-steget (mockat `syncInvoiceToFortnox` anropas
  inte igen när `fortnox_sync_status` redan är `synced`).
- Regressionstest: befintliga fakturafacit (om sådana finns för
  send/route.ts) ska förbli gröna — särskilt för företag utan Fortnox
  kopplat, exakt samma utfall som innan denna ändring.
- Manuellt/dokumenterat: verifiera det faktiska Fortnox-dubbelskyddet
  (steg "Fortnox-dubbelskydd" ovan) mot en riktig Fortnox-sandbox eller
  live-dokumentation innan det litas på i produktion.

## Edge-fall

- Faktura med `rot_rut_type` satt: ROT/RUT-payloaden till Fortnox
  (redan byggd i dagens kod) förblir oförändrad — bara var i flödet
  anropet sker flyttas.
- Fakturan saknar rader (`items` tomt): samma valideringsfel som idag,
  sker innan något Fortnox- eller kundutskicks-anrop görs.
- Fakturan redan `paid`/`cancelled`: samma tidiga avvisning som redan
  finns i `send-via-fortnox/route.ts`, flyttas in i den delade
  funktionen.
- Parallella tryck på "Skicka" (dubbelklick): samma in-flight-skydd som
  redan finns (`fortnox_sync_status='pending'` + 5-minuters timeout)
  återanvänds oförändrat.

## Utanför scope

- Ändringar i hur ROT/RUT-avdrag beräknas eller skickas till Fortnox.
- Betalningsåterrapportering (redan hanterad separat av cronet).
- Att ta bort den gamla "Skicka via Fortnox"-routen helt — den lever
  kvar som manuellt återsynk-verktyg.
- UI för att visa fakturan i två olika nummerformat samtidigt — kunden
  ser alltid Fortnox officiella nummer när Fortnox är inblandat, annars
  Handymates eget.
