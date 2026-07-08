# Offert-mejl + kund-PDF — spec & plan

_Datum: 2026-07-08 · Grund: audit (agent a475c37). Autonomt mandat från Andreas
(bygg + deploya utan godkännande-stopp). Ingen ny databaskolumn → ingen migrationsrisk._

## Problem (verifierade)
1. **Dubbla, olika mejl.** En offert-sändning (`POST /api/quotes/send`) avfyrar BÅDE
   den rika `generateEmailHTML` (Email B, hårdkodad #0d9488, visar skaparen) OCH
   portal-notisen `sendPortalNotification('quote_sent')` (Email A, minimal, accent_color,
   visar EJ skaparen). Kunden får två mejl. `quote_sent`-notisen anropas ENBART här
   (send/route.ts:620-629) → säkert att ta bort.
2. **Ingen riktig PDF.** `/api/quotes/pdf` returnerar alltid `text/html`. Varje
   "Ladda ner PDF" (dashboard blob-download, portal "Läs offerten", public-sidan) ger
   HTML, aldrig en fil. jsPDF finns men bara för fakturor (`lib/pdf-generator.ts`
   `generateInvoicePDF`, `app/api/invoices/pdf/route.ts:79-135` returnerar riktig PDF).
3. **Legacy-vy.** `app/quote/[token]` redirectar till portalen när portal_token finns →
   portalen är den levande kundvyn. Båda mejlen länkar dit.

## Design (låst)
- **EN offert-mejl:** behåll den rika Email B (`generateEmailHTML`), ta bort portal-
  notisen för quote_sent. Gör Email B **on-brand** (accent_color i st f hårdkodad färg)
  och lägg en direkt **"Ladda ner offert (PDF)"**-länk i mejlet.
- **Riktig PDF:** ny `generateQuotePDF` (jsPDF, modell: generateInvoicePDF) +
  `?format=pdf`-gren i `app/api/quotes/pdf/route.ts` → `application/pdf` + attachment.
  Identitet via `fetchQuoteCreator` (samma som kunddokumentet). Respekterar
  visningsnivå? Nej — PDF:en är kundens fullständiga nedladdningsbara kopia (alla rader);
  visningsfiltret gäller on-screen/HTML-dokumentet, PDF:en är arkivkopian. accent_color.
- **Wire alla nedladdnings-ytor** till `?format=pdf`: portalens signeringsmodal (ny
  "Ladda ner PDF"-knapp), public-sidans befintliga länkar, dashboardens blob-download.
  Rena mall-FÖRHANDSVISNINGar (settings/quote-style, template-picker) förblir HTML.

## Bygge — branch feat/offert-mejl-pdf från main

### Commit 1 — PDF-GENERERING
- `lib/pdf-generator.ts`: ny `generateQuotePDF(quote, business): Buffer` (jsPDF + autoTable,
  spegla generateInvoicePDF-strukturen). Innehåll: företagsheader (business_name, orgnr,
  adress, logga om möjligt), avsändare/kontakt = SKAPAREN (name/phone/email) med fallback,
  kund (namn/adress/personnr), offertnummer + datum + giltig-till, "Vår referens"
  (reference_person), item-tabell (beskrivning/antal/enhet/à-pris/summa — respektera att
  rader kan vara heading/text/subtotal/discount/option; rendera meningsfullt), subtotal,
  moms, total, ROT/RUT-avdrag + "att betala", ev. villkorstexter (introduction/conclusion/
  not_included/payment_terms). accent_color för rubrikfärg. Svensk formatering (formatSEK
  finns redan i filen — återanvänd).
- `app/api/quotes/pdf/route.ts`: lägg `const format = searchParams.get('format')` och en
  `if (format === 'pdf')`-gren i BÅDA relevanta ingångar (GET `?token=` för public/portal,
  GET `?id=`/POST för dashboard). Grenen: hämta quote + business_config (som redan görs) +
  `fetchQuoteCreator(supabase, quote.created_by)` → `generateQuotePDF(...)` → returnera
  `application/pdf` + `Content-Disposition: attachment; filename="Offert-{number}.pdf"`.
  Default (ingen format) → oförändrad HTML-väg.
- Verifiering: tsc + build; manuell smoke via en liten nod-check som anropar
  generateQuotePDF med en fixtur och verifierar Buffer-längd > 0 + %PDF-header.

### Commit 2 — WIRE NEDLADDNING
- `app/portal/[token]/components/PortalQuoteSigningModal.tsx`: behåll "Läs offerten"
  (HTML-vy i flik) OCH lägg en tydlig **"Ladda ner PDF"**-knapp →
  `/api/quotes/pdf?token={sign_token}&format=pdf` (download-attribut / target). Svensk,
  teal, mobilanpassad.
- `app/quote/[token]/page.tsx`: de två "Ladda ner PDF"-länkarna (:627, :1199) får
  `&format=pdf` + download-attribut så de faktiskt sparar filen.
- `app/dashboard/quotes/[id]/page.tsx`: blob-downloaden (:117-144) → POSTa/GETa med
  `format=pdf` så filen blir en riktig PDF (den tvingar redan `.pdf`-namn).
- `components/quotes/QuoteHeader.tsx:188` om det är en "ladda ner"-avsikt → format=pdf;
  om det är "förhandsgranska mall" → lämna HTML (bedöm i koden).

### Commit 3 — MEJL: en, on-brand, med PDF-länk
- `app/api/quotes/send/route.ts`: TA BORT portal-notis-blocket för quote_sent (:620-629)
  → kunden får bara Email B. (Behåll fireEvent/triggerEventCommunication — de är
  automation-pipeline, inte hårdkodad dubblett.)
- `generateEmailHTML`: byt hårdkodad `#0d9488` (:170 header) mot
  `business.accent_color || '#0F766E'` (hämta accent_color i bizConfig-selecten :390 om
  det saknas). Lägg en "Ladda ner offert (PDF)"-länk/knapp i mejlet →
  `{APP_URL}/api/quotes/pdf?token={signToken}&format=pdf` (signToken finns :403-410).
  Skaparen visas redan (identitets-fixen).

## Verifiering per commit
tsc 0 · next build rent (bara pre-existing fortnox-sync) · enhetstester gröna ·
PDF-smoke (%PDF-header + storlek). Efter allt: granskning (spec + kvalitet), sen merge
till main (autonomt mandat) + deploy.

## Slutverifiering
- En offert-sändning → kunden får EXAKT ETT mejl, on-brand (företagets accent_color),
  visar skaparen, med en fungerande "Ladda ner offert (PDF)".
- Kund kan ladda ner en riktig `.pdf` från: mejlet, portalens signeringsmodal, public-sidan.
- Dashboardens "Ladda ner PDF" ger en riktig PDF (inte HTML med .pdf-ändelse).
- Befintliga offerter oförändrade (created_by null → ägare-fallback i PDF + mejl).

## Avgränsning
Rör inte: execution-chain/approvals, sign-POST-omräkning, produktbank/identitet-koden
(redan merged), invoice-PDF-vägen. Mall-förhandsvisningar (settings) förblir HTML.
Ingen ny databaskolumn.
