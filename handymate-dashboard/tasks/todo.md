# ETAPP 6c — Fakturaskaparen canvas-first

Verifierat mot kod 2026-08-04 (efter 6a 76e298e9 + 6b 1f6c2a87). Baseline-tester
gröna (74/74) innan start.

## Fynd under kartläggning (styr scope)
- `+ Lägg till rad` i QuoteDocument.tsx är gated `!isInvoice` — fakturan kan
  aldrig lägga till rader i canvas idag. Måste tas bort.
- QuoteDocumentRow.tsx är REDAN docType-agnostisk (ingen isInvoice-gren) —
  radredigering (namn/antal/enhet/á-pris/ROT-badge/heading/text/subtotal/
  discount) fungerar redan för invoice mode='edit'. Bara QuoteDocument.tsx
  (header: due date, referenser) behöver utökas.
- "Vår referens" renderas INTE i motorn idag trots att gamla premium.ts
  gjorde det (parity-testet missar det pga en fras-sammanslagningslucka i
  testmetodiken — verifierat, inte en bugg i testet jag behöver fixa).
  "Er referens"/kundens referens likaså saknas. Lägg till i parties-sektionen.
- `invoice.payment_terms_text` LÄSES i data-builder.ts men KOLUMNEN FINNS
  INTE i `invoice`-tabellen (bara på `quotes`, sql/quote_overhaul.sql) — grep
  bekräftar. Bygg INGEN UI för betalvillkor-text (skulle brytas vid save).
  Textblock-panelen = bara introduction_text + conclusion_text (bekräftat
  existerande kolumner, redan i POST/PUT).
- Ingen `template_style`-kolumn finns för invoice (bara business-default via
  quote_template_style). Lägger till egen kolumn (v82) + trådar igenom
  create-invoice/POST/PUT/build-invoice-pdf/pdf-route så Stil-valet faktiskt
  persisteras (annars är stilväljaren meningslös — matchar offertens mönster).
- RowEditSheet tar QuoteItem (kategori/grön teknik-fält som inte finns på
  faktura) — bygger tunn InvoiceRowEditSheet istället för att återanvända.
- QuoteStylePicker hårdkodar "Offertstil" + länk till /api/quotes/pdf +
  kind="quote" i MiniDoc-anropet. MiniDoc stödjer redan kind='invoice'
  (DualThumbnail bevisar det) — generaliserar QuoteStylePicker med kind-prop.

## Plan — KLART 2026-08-04
1. [x] Motor: types.ts — onDueDateChange/onOurReferenceChange/onYourReferenceChange
2. [x] Motor: lib/invoice-templates/types.ts — dueDateISO? på InvoiceTemplateInvoice
3. [x] Motor: QuoteDocument.tsx — editable due date, Vår/Er referens, ta bort
   isInvoice-gate på "+ Lägg till rad"
4. [x] QuoteStylePicker.tsx — kind-prop (quote/invoice) + invoiceId-länk
5. [x] sql/v82_invoice_template_style.sql + create-invoice.ts + POST/PUT +
   build-invoice-pdf.ts + pdf/route.ts (style-precedence)
6. [x] app/dashboard/invoices/_shared/useInvoiceItems.ts
7. [x] app/dashboard/invoices/_shared/InvoiceRowEditSheet.tsx
8. [x] app/dashboard/invoices/_shared/InvoiceRotMomsSection.tsx
9. [x] app/dashboard/invoices/_shared/InvoiceTextsSection.tsx
10. [x] app/dashboard/invoices/_shared/InvoiceEditor.tsx (huvudkomponenten)
11. [x] app/dashboard/invoices/new/page.tsx — tunn wrapper
12. [x] app/dashboard/invoices/[id]/edit/page.tsx — tunn wrapper + autosave
13. [x] tsc rent + next build grön + facit-sviterna (74/74) — INGEN commit
   (per uppdrag), Andreas kör sql/v82 manuellt.

## Review — avvikelser/kända begränsningar
- Live-canvasen visar ALDRIG Swish-QR (kräver server-anrop) — bara statisk
  PDF/kundvy gör det. Samma begränsning offerten aldrig hade eftersom
  offerten aldrig visade QR i canvasen heller (ny feature i 6a/6b för
  fakturan specifikt).
- Premium/Friendly-förhandsgranskning i 'new'-läget (ingen sparad faktura
  ännu) visar en platshållare istället för en riktig iframe — "befintlig
  invoice-HTML-väg" (spec-ordval) är en GET mot en sparad DB-rad, det finns
  inget drafts-endpoint att POSTa oscarad state mot (till skillnad från
  offertens /api/quotes/preview-html). Att bygga ett sådant är utanför
  denna etapps scope — dokumenterat, inte tyst byggt runt.
- Betalvillkor-text (payment_terms_text) är INTE en Textblock-editerbar
  fält — kolumnen finns inte i invoice-tabellen (grep-verifierad mot
  sql/), bara på quotes. Att bygga UI för den hade brutit save.
- ROT/RUT-badgens klick i canvas är EN global av/på-cykel (mirrorar
  LineItemEditor-checkboxen), INTE offertens fria rot/rut/grön-cykel —
  fakturan har ett enda globalt rot_rut_type, ingen grön teknik-koncept.
