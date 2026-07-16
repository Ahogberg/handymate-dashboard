# Offert-audit 2026-07-06 — fixplan

_Tre audits (new-flöde, edit/tvillingar, sanning/persistens) + inline-tvillingkoll.
Full rapport i sessionstranscript. Persistens FRISK (quote_items auktoritativ,
item_type överlever); ALLA rotfel ligger i render-lagret. Panelerna är tunna
wrappers runt delade renderare → fixar i delade lagret når new+edit+mobil._

## Batch 1 — KRITISKT (kunden ser fel/inget)
- [x] **T1 Render-sanningen:** ✅ KLAR 2026-07-15 (mall-delen fixad tidigare; resten — preview-payloads description:null + ModernCanvas-merge — fixad efter pilotens Bee-feedback: "Offertbeskrivningen som är valfri behöver synas redan i utkastet". Samma commit: logga i offert-PDF:en.) `lib/quote-templates/data-builder.ts:55` filtrerar bort
      heading/text/subtotal/discount → saknas i Slutdesign-preview OCH skarpa
      dokumentet. Fix: `itemType` i `QuoteTemplateItem`, mappa alla typer, rendera i
      modern/premium/friendly. + `white-space: pre-line` på alla textblock (intro/
      beskrivning/villkor/ej-inkluderat) i 3 mallar. + rendera `conclusionText`
      (mappad men aldrig renderad). + intro OCH beskrivning som separata sektioner
      (regression av pilot-fix 2026-05-20). + synlig rabattrad.
- [ ] **T2 Signerings-modalen:** PortalQuoteSigningModal hårdkodar påhittad
      innehållslista + ingen dokumentlänk → kunden signerar bindande osedd offert.
      Fix: länk `/api/quotes/pdf?token={sign_token}` i steg 0 + ta bort listan.
- [ ] **T3 Publika fallback-sidan:** `/api/quotes/public/[token]` läser aldrig
      quote_items → 0 rader. Fix: hämta quote_items + rendera alla radtyper +
      pre-line. + escapa title/description i send-mejlets HTML (injektion).

## Batch 2 — HÖGT (dataintegritet + totals)
- [ ] **T4 Spara-förlusten:** POST/PUT sväljer quote_items-insertfel; PUT raderar
      alla rader FÖRE insert → trasig rad = permanent tömd offert. Fix: faila
      requesten på itemsError; PUT insert-först-eller-verifiera.
- [ ] **T5 Preview-totals + Live:** new/page.tsx:398+449 rå qty×pris-reduce →
      rabatt ÖKAR totalen; ROT-avdrag saknas i preview-payloads ("Att betala" fel).
      Fix: calculateQuoteTotals + rot i payloads (även edit/page.tsx:288). +
      page.tsx:493-filtret (Live tappar icke-item; synka index-mappning :529/:562)
      + ModernCanvas renderar heading + EditableFields whiteSpace pre-line.
- [ ] **T6 from-quote:** total-omräkning korrumperar subtotal (0 kr) + rabatt-tecken.
      Fix: bevara stored total för icke-item-rader.

## Batch 3 — MEDIUM/polish
- [ ] **T7:** data-builder/mallar: ata_terms, reference_person, project_address,
      payment_plan, detail_level/show_unit_prices/show_quantities (skickas, ignoreras).
- [ ] **T8:** Kompakt: footer hårdkodar "30 dagar netto" (ignorera ej
      paymentTermsText); text/subtotal-rader i grupperat läge renderar null.
- [ ] **T9 Städning:** radera döda generateQuoteHTML (pdf/route.ts:212-619);
      pensionera /quote/[token]s egen rad-rendering till förmån för PDF/portal
      (beslut: efter T3 håller vi den minimal-korrekt).

## Förbättringsförslag (presenteras Andreas efter fixarna)
En-sanning-arkitektur (alla ytor ur quote_items via EN builder) · PDF-länk i alla
kundytor · riktig OPTION-radtyp (idag namnkonvention; CHECK-constraint skulle tyst
radera via T4-buggen) · e-sign-juridik (dokument måste visas före signering).
