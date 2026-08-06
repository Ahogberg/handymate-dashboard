/**
 * Modern-mallens dokument-CSS — EN delad källa (ETAPP 2a, offert-masterplan.md).
 *
 * Används av BÅDE:
 * - lib/quote-templates/render-react.tsx (renderModernHtml → statisk HTML för
 *   PDF/"Visa offert"/kundvyn), inbäddad i <style> i dokumentskalet.
 * - components/quotes/document/QuoteDocument.tsx i edit-läge (den redigerbara
 *   live-canvasen i offert-byggaren), inbäddad via en <style>-tagg i samma
 *   React-träd (samma mönster som ModernCanvas.tsx hade tidigare).
 *
 * Scopead under `.quote-document` så reglerna aldrig läcker ut i resten av
 * appen (kritiskt i edit-läge där dokumentet renderas inuti en vanlig sida —
 * `* { margin: 0; padding: 0 }` oscopead skulle vara katastrofalt där).
 *
 * Accentfärgen sätts via CSS custom properties (--qd-accent/-50/-100) som
 * QuoteDocument sätter inline från business.accentColor (mixWithWhite-mönstret
 * som fanns i både modern.ts och ModernCanvas.tsx). Övriga tokens (ink/muted/
 * border/row-alt) är ännu hårdkodade — Premium/Friendlys egna paletter är
 * UTANFÖR denna etapp (bara Modern implementeras fullt i E2a).
 *
 * Innehåller ÄVEN edit-lägets interaktiva tillägg (row-hover, radera-knapp,
 * "Lägg till rad") — ofarliga i statisk rendering eftersom static-läget
 * aldrig renderar de elementen som bär klasserna.
 */
export const MODERN_DOCUMENT_CSS = `
.quote-document { font-family: 'DM Sans', system-ui, sans-serif; color: #0F172A; line-height: 1.5; }
.quote-document * { margin: 0; padding: 0; box-sizing: border-box; }
.quote-document .page { width: 210mm; min-height: 297mm; padding: 22mm 20mm; margin: 0 auto; background: #fff; box-shadow: 0 16px 40px rgba(15,23,42,0.10); display: flex; flex-direction: column; }
.quote-document .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
.quote-document .brand { display: flex; align-items: center; gap: 12px; }
.quote-document .brand-mark { width: 44px; height: 44px; border-radius: 10px; background: var(--qd-accent); color: #fff; display: flex; align-items: center; justify-content: center; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 22px; overflow: hidden; }
.quote-document .brand-mark img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
.quote-document .brand-name { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 18px; color: #0F172A; letter-spacing: -0.01em; }
.quote-document .brand-meta { color: #64748B; font-size: 11px; margin-top: 2px; }
.quote-document .doc-meta { text-align: right; }
.quote-document .doc-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.16em; color: #64748B; }
.quote-document .doc-number { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 26px; color: #0F172A; letter-spacing: -0.02em; margin-top: 2px; }
.quote-document .doc-ref { font-size: 11px; color: #64748B; margin-top: 4px; font-weight: 500; }
.quote-document .doc-dates { font-size: 12px; color: #64748B; margin-top: 8px; line-height: 1.7; }
.quote-document .doc-dates strong { color: #0F172A; font-weight: 600; }
.quote-document .accent { height: 2px; background: var(--qd-accent); margin: 20px 0 28px; opacity: 0.85; }
.quote-document .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; }
.quote-document .party-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em; color: var(--qd-accent); margin-bottom: 6px; }
.quote-document .party-name { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 15px; color: #0F172A; }
.quote-document .party-line { font-size: 13px; color: #0F172A; margin-top: 2px; }
.quote-document .party-meta { font-size: 12px; color: #64748B; margin-top: 4px; line-height: 1.6; }
.quote-document .quote-title { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 22px; color: #0F172A; letter-spacing: -0.015em; margin-bottom: 4px; }
.quote-document .quote-sub { color: #64748B; font-size: 13px; margin-bottom: 24px; white-space: pre-line; }
.quote-document table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
.quote-document thead { display: table-header-group; }
.quote-document thead th { text-align: left; padding: 10px 12px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #64748B; border-bottom: 1.5px solid #0F172A; }
.quote-document thead th.num { text-align: right; }
.quote-document tbody tr { break-inside: avoid; page-break-inside: avoid; }
.quote-document tbody td { padding: 12px; vertical-align: top; font-size: 13px; }
.quote-document tbody tr:nth-child(even) { background: #F8FAFC; }
.quote-document tbody tr.row-hover:hover { background: rgba(15, 118, 110, 0.05) !important; }
.quote-document .item-name { font-weight: 600; color: #0F172A; }
.quote-document .item-desc { color: #64748B; font-size: 12px; margin-top: 2px; white-space: pre-line; }
.quote-document .item-components { list-style: none; margin: 6px 0 0; padding: 0; }
.quote-document .item-components li { color: #64748B; font-size: 11px; line-height: 1.5; padding-left: 12px; position: relative; }
.quote-document .item-components li::before { content: '–'; position: absolute; left: 0; color: var(--qd-accent); }
.quote-document td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.quote-document tbody tr.row-heading, .quote-document tbody tr.row-text, .quote-document tbody tr.row-subtotal { background: transparent; }
.quote-document tbody tr.row-heading td { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 13px; color: #0F172A; padding: 18px 12px 6px; border-bottom: 1px solid #E2E8F0; }
.quote-document tbody tr.row-text td { color: #64748B; font-size: 12px; white-space: pre-line; }
.quote-document tbody tr.row-subtotal td { font-weight: 600; color: #0F172A; text-align: right; border-top: 1px solid #E2E8F0; }
.quote-document tbody tr.row-discount .item-name, .quote-document tbody tr.row-discount td.num { color: var(--qd-accent); }
.quote-document tbody tr.row-option .opt-box { color: var(--qd-accent); font-size: 15px; line-height: 1; }
.quote-document tbody tr.row-option.unselected .item-name, .quote-document tbody tr.row-option.unselected td.num { color: #64748B; }
.quote-document tbody tr.row-option.unselected .opt-box { color: #64748B; }
.quote-document .opt-badge { display: inline-block; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--qd-accent); background: var(--qd-accent-50); border: 1px solid var(--qd-accent-100); border-radius: 4px; padding: 1px 6px; vertical-align: 1px; }
.quote-document tbody tr.row-option.unselected .opt-badge { color: #64748B; background: transparent; border-color: #E2E8F0; }
.quote-document .options-note { font-size: 11px; color: #64748B; font-style: italic; margin: -14px 0 24px; }
/* Dold rad (v90) — syns BARA i edit-läge (static-läget renderar den inte alls).
   Dämpad med streckad vänsterkant så hantverkaren direkt ser vad kunden
   inte får se, utan att raden försvinner ur hans egen översikt. */
.quote-document tbody tr.row-hidden td { opacity: 0.45; }
.quote-document tbody tr.row-hidden td:first-child { border-left: 2px dashed #94A3B8; }
/* Reservationer (v91) — eget block efter villkorsstycket. Punktlista så varje
   förbehåll går att peka på, i stället för att drunkna i löpande text. */
.quote-document .reservations { margin: 0 0 24px; break-inside: avoid; page-break-inside: avoid; }
.quote-document .reservations-title { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 12px; color: #0F172A; margin: 0 0 6px; }
.quote-document .reservations ul { margin: 0; padding-left: 16px; }
.quote-document .reservations li { font-size: 11px; line-height: 1.65; color: #475569; margin-bottom: 5px; }
.quote-document .reservations li strong { color: #0F172A; font-weight: 600; }
/* Betalplan (etapp A4) — eget block direkt efter summeringen. Håller ihop över
   sidbrytning: en halv betalplan är värre än ingen. */
.quote-document .payment-plan { margin: 0 0 24px; break-inside: avoid; page-break-inside: avoid; }
.quote-document .payment-plan-title { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 12px; color: #0F172A; margin: 0 0 6px; }
.quote-document .payment-plan table { width: 100%; border-collapse: collapse; }
.quote-document .payment-plan td { font-size: 11px; line-height: 1.65; color: #475569; padding: 4px 0; border-bottom: 1px solid #F1F5F9; }
.quote-document .payment-plan tr:last-child td { border-bottom: none; }
.quote-document .payment-plan .pp-label { color: #0F172A; font-weight: 500; }
.quote-document .payment-plan .pp-due { color: #94A3B8; font-weight: 400; }
.quote-document .payment-plan .pp-percent { text-align: right; white-space: nowrap; padding-right: 14px; font-variant-numeric: tabular-nums; }
.quote-document .payment-plan .pp-amount { text-align: right; white-space: nowrap; color: #0F172A; font-weight: 600; font-variant-numeric: tabular-nums; }
/* ══ Sektionsfokus (etapp C3, Snabbofferten) ═══════════════════════════════
   Hantverkaren granskar en sektion i taget. De andra dimmas och slutar ta
   emot tryck, så ett felträff i ett dokument i ~0,4 skala inte kan ändra
   något i en sektion som inte granskas.

   ── ALLT NEDAN ÄR GATAT PÅ .quote-document--interactive ──
   Klassen sätts bara när mode === 'edit' (se QuoteDocument.tsx). Den här
   filen renderar även kundens skarpa PDF via Chromium, och granskningsvyns
   regler har ingenting där att göra. Gaten tillkom 2026-08-06 när Claude
   Designs lyft skulle appliceras — utan den hade en 30px skugga och
   position:relative hamnat på fyra block i kundens dokument.

   MEDVETET INGEN transform här. DocumentScaler CSS-transformerar redan hela
   A4:an, och en andra transform i kedjan gör pointer-koordinater opålitliga
   (samma skäl som dnd-kit väljs bort i QuoteDocumentRow).

   RÄTTELSE om scroll-margin-top (2026-08-06): den kompenserar INTE
   granskningsbaren. Baren är fixed bottom-0, och scroll-margin-top kan per
   definition inte kompensera något som sitter i nederkanten — den justerar
   elementets ÖVERKANT mot scrollportens överkant. Det värdet faktiskt
   kompenserar är den sticky headern (QuoteNewHeader, sticky top-0), och
   bara när SIDAN är det som scrollar. Vid lg scrollar dokumentrutan internt
   (QuotePreviewPanel, overflow-auto + höjdbegränsad) och där täcker ingenting
   överkanten — värdet ska vara litet. Den tidigare kommentaren här påstod fel. */
.quote-document--interactive [data-section] {
  transition: opacity .25s ease;
  scroll-margin-top: 96px;
}
@media (min-width: 1024px) {
  /* Dokumentrutan scrollar internt vid lg — ingen sticky header täcker dess
     överkant, så 96px hade parkerat den fokuserade sektionen i ett dött glapp. */
  .quote-document--interactive [data-section] { scroll-margin-top: 16px; }
}
.quote-document--interactive [data-section][data-dimmed='true'] {
  opacity: var(--qk-dim, .28);
  pointer-events: none;
}

/* ── Lyftet: den fokuserade sektionen ────────────────────────────────────
   "Det här är din yta just nu — resten väntar." En vit halo med hårfin
   teal-ring och mjuk skugga lyfter sektionen ur papperet utan att rama in
   den. Symmetrisk in- och utfasning, så ett sektionsbyte läses som att
   ljuset flyttas, inte som att kort byts.

   VARFÖR box-shadow PÅ ELEMENTET och inte en ::after med z-index:-1:
   en negativt staplad pseudo behöver att föräldern har en egen
   stackningskontext, annars målas den BAKOM .page:s vita bakgrund och blir
   osynlig. Kontexten skulle ha kommit från z-index:1 på den fokuserade
   sektionen — men z-index är inte transitionerbar, så när fokus släpper
   kollapsar kontexten samma frame och halon SLOCKNAR i stället för att tona
   ut. Elementets egen box-shadow målas i dess bakgrundssteg, alltså efter
   .page:s bakgrund, och är fullt transitionerbar åt båda hållen. Ingen
   stackningskontext, ingen position:relative, ingen pseudo på ett <table>.

   Måtten delas med --qd-scale (publicerad av DocumentScaler) så halon har
   samma SKÄRMstorlek oavsett hur hårt A4:an är nedskalad. Utan det blir
   ringen en subpixelhårlinje på telefon. Vid lg är variabeln osatt och
   fallbacken 1 gäller. */
.quote-document--interactive [data-section] {
  box-shadow: 0 0 0 0 rgba(255,255,255,0), 0 0 0 0 rgba(15,118,110,0), 0 0 0 0 rgba(15,118,110,0);
  border-radius: calc(12px / var(--qd-scale, 1));
  transition: opacity .25s ease, box-shadow .25s cubic-bezier(.2,.8,.2,1);
}
.quote-document--interactive[data-focus-section] [data-section]:not([data-dimmed='true']) {
  box-shadow:
    0 0 0 calc(12px / var(--qd-scale, 1)) #fff,
    0 0 0 calc(13px / var(--qd-scale, 1)) var(--qd-accent-100),
    0 calc(10px / var(--qd-scale, 1)) calc(30px / var(--qd-scale, 1)) rgba(15,118,110,.10);
}

/* Tom sektion — reservationslistan kan sakna innehåll, vilket är ett
   normaltillstånd. Utan den här raden fanns inget att lyfta och hela
   dokumentet låg dimmat. Se platshållaren i QuoteDocument.tsx. */
.quote-document--interactive .section-empty {
  font-size: 11px;
  color: #94A3B8;
  font-style: italic;
}

@media (prefers-reduced-motion: reduce) {
  .quote-document--interactive [data-section] { transition: none; }
}

/* ══ Utkastet landar — revealen (etapp C2) ═════════════════════════════════
   "AI:n byggde det här av din beskrivning" — innehållet kommer i läsordning,
   rad för rad, i stället för att bara finnas. Total budget ~1,2 s.

   Gatad på .quick-reveal, en klass som BARA snabboffertens granskningsvy
   sätter (QuotePreviewPanel, opt-in-prop). Medvetet INTE gatad på
   [data-focus-section]: det attributet försvinner vid översikten och skulle
   spela om hela revealen varje gång hantverkaren går tillbaka till en sektion.

   Keyframen saknar 'to' med flit — elementet landar på sitt underliggande
   opacity-värde (1, eller dimningens .28) utan hopp när animationen släpper.

   ENDAST opacity. DocumentScaler äger transform-kedjan, och dess
   ResizeObserver mäter scrollHeight under animationen — animeras height eller
   margin låser den in fel höjd mitt i sekvensen. */
@keyframes qd-reveal { from { opacity: 0 } }
.quick-reveal .quote-document .quote-title { animation: qd-reveal .4s cubic-bezier(.2,.8,.2,1) backwards; }
/* Sektionsattributet bärs sedan 2026-08-06 av wrappern runt titel/beskrivning/
   tabell, inte av tabellen — därav den nedstigande selektorn. Betalplanens
   inre tabell ligger i en egen sektion och träffas inte. */
.quick-reveal .quote-document [data-section='inkluderat'] table tbody tr {
  animation: qd-reveal .35s cubic-bezier(.2,.8,.2,1) backwards;
  animation-delay: calc(120ms + var(--qd-row, 0) * 60ms);
}
.quick-reveal .quote-document [data-section='inkluderat'] table tbody tr:nth-child(2)  { --qd-row: 1; }
.quick-reveal .quote-document [data-section='inkluderat'] table tbody tr:nth-child(3)  { --qd-row: 2; }
.quick-reveal .quote-document [data-section='inkluderat'] table tbody tr:nth-child(4)  { --qd-row: 3; }
.quick-reveal .quote-document [data-section='inkluderat'] table tbody tr:nth-child(5)  { --qd-row: 4; }
.quick-reveal .quote-document [data-section='inkluderat'] table tbody tr:nth-child(6)  { --qd-row: 5; }
.quick-reveal .quote-document [data-section='inkluderat'] table tbody tr:nth-child(7)  { --qd-row: 6; }
.quick-reveal .quote-document [data-section='inkluderat'] table tbody tr:nth-child(8)  { --qd-row: 7; }
.quick-reveal .quote-document [data-section='inkluderat'] table tbody tr:nth-child(9)  { --qd-row: 8; }
.quick-reveal .quote-document [data-section='inkluderat'] table tbody tr:nth-child(10) { --qd-row: 9; }
.quick-reveal .quote-document [data-section='inkluderat'] table tbody tr:nth-child(n+11) { --qd-row: 10; }
.quick-reveal .quote-document .totals-wrap  { animation: qd-reveal .4s cubic-bezier(.2,.8,.2,1) 400ms backwards; }
.quick-reveal .quote-document .terms        { animation: qd-reveal .4s cubic-bezier(.2,.8,.2,1) 520ms backwards; }
.quick-reveal .quote-document .reservations { animation: qd-reveal .4s cubic-bezier(.2,.8,.2,1) 640ms backwards; }
.quick-reveal .quote-document .payment-plan { animation: qd-reveal .4s cubic-bezier(.2,.8,.2,1) 700ms backwards; }
@media (prefers-reduced-motion: reduce) {
  .quick-reveal .quote-document .quote-title,
  .quick-reveal .quote-document [data-section='inkluderat'] table tbody tr,
  .quick-reveal .quote-document .totals-wrap,
  .quick-reveal .quote-document .terms,
  .quick-reveal .quote-document .reservations,
  .quick-reveal .quote-document .payment-plan { animation: none; }
}
.quote-document .hidden-badge { display: inline-block; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; background: #F1F5F9; border: 1px solid #E2E8F0; border-radius: 4px; padding: 1px 6px; vertical-align: 1px; }
.quote-document .rot-badge { display: inline-flex; align-items: center; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--qd-accent); background: var(--qd-accent-50); border: 1px dashed var(--qd-accent-100); border-radius: 4px; padding: 1px 6px; cursor: pointer; line-height: 1.6; }
.quote-document .rot-badge:hover { background: var(--qd-accent-100); }
.quote-document .rot-badge.gron { color: #64748B; background: transparent; border-color: #E2E8F0; }
.quote-document .rot-badge.empty { color: #94A3B8; background: transparent; border-color: #E2E8F0; font-weight: 500; text-transform: none; letter-spacing: normal; }
.quote-document .rot-badge.empty:hover { background: #F8FAFC; color: #64748B; }
.quote-document .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 28px; break-inside: avoid; page-break-inside: avoid; }
.quote-document .totals { width: 50%; min-width: 280px; }
.quote-document .total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; border-bottom: 1px solid #E2E8F0; }
.quote-document .total-row:last-child { border-bottom: none; }
.quote-document .total-row.rot { color: var(--qd-accent); font-weight: 600; }
.quote-document .total-row.discount { color: #B45309; }
.quote-document .total-row.discount .val { color: #B45309; }
.quote-document .total-row.grand { font-family: 'Space Grotesk', sans-serif; font-size: 18px; font-weight: 700; padding: 14px 0 6px; border-top: 1.5px solid #0F172A; border-bottom: none; margin-top: 6px; }
.quote-document .total-row .lbl { color: #64748B; }
.quote-document .total-row.grand .lbl { color: #0F172A; }
.quote-document .total-row .val { font-weight: 600; color: #0F172A; font-variant-numeric: tabular-nums; }
.quote-document .total-row.rot .val { color: var(--qd-accent); }
.quote-document .pay-box { border: 1px solid var(--qd-accent-100); background: var(--qd-accent-50); border-radius: 10px; padding: 16px 18px; display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center; margin-bottom: 28px; break-inside: avoid; page-break-inside: avoid; }
.quote-document .pay-box.single { grid-template-columns: 1fr; }
.quote-document .pay-title { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 14px; color: var(--qd-accent); margin-bottom: 4px; }
.quote-document .pay-text { font-size: 12px; color: #0F172A; line-height: 1.6; }
.quote-document .pay-text strong { font-weight: 600; }
.quote-document .swish-mark { background: #fff; border: 1px solid var(--qd-accent-100); border-radius: 8px; padding: 8px 14px; display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 110px; }
.quote-document .swish-mark .label { font-size: 9px; color: #64748B; text-transform: uppercase; letter-spacing: 0.14em; }
.quote-document .swish-mark .num { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 16px; color: #0F172A; letter-spacing: -0.01em; }
.quote-document .terms { font-size: 11px; color: #64748B; line-height: 1.7; margin-bottom: 28px; white-space: pre-line; }
.quote-document .terms strong { color: #0F172A; font-weight: 600; }
.quote-document .footer { margin-top: auto; padding-top: 18px; border-top: 1px solid #E2E8F0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; font-size: 10px; color: #64748B; }
.quote-document .footer .l { font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: #64748B; margin-bottom: 2px; }
.quote-document .footer .v { color: #0F172A; font-weight: 500; font-size: 11px; }
.quote-document .signature-cta { border: 1px solid var(--qd-accent-100); background: var(--qd-accent-50); border-radius: 10px; padding: 18px 20px; text-align: center; margin-bottom: 24px; break-inside: avoid; page-break-inside: avoid; }
.quote-document .signature-cta.signature-cta--link { display: block; text-decoration: none; cursor: pointer; transition: background-color 120ms ease; }
.quote-document .signature-cta.signature-cta--link:hover { background: var(--qd-accent-100); }
.quote-document .signature-cta .sig-title { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 14px; color: var(--qd-accent); }
.quote-document .signature-cta .sig-sub { font-size: 11px; color: #64748B; margin-top: 4px; }
.quote-document .signature-cta.signed { background: #F0FDF4; border-color: #BBF7D0; }
.quote-document .signature-cta.signed .sig-title { color: #15803D; }
.quote-document .signature-cta.edit-dimmed { opacity: 0.55; }
.quote-document .signature-cta .sig-edit-note { font-size: 10px; color: #94A3B8; font-style: italic; margin-top: 6px; }
.quote-document .add-row-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: rgba(15, 118, 110, 0.08); border: 1px dashed var(--qd-accent); border-radius: 6px; color: var(--qd-accent); font-size: 12px; font-weight: 500; cursor: pointer; margin-bottom: 24px; transition: background 0.15s; }
.quote-document .add-row-btn:hover { background: rgba(15, 118, 110, 0.15); }
.quote-document .row-action { opacity: 0; transition: opacity 0.15s; }
.quote-document tbody tr.row-hover:hover .row-action { opacity: 1; }
.quote-document .row-action button { background: transparent; border: none; cursor: pointer; padding: 2px 4px; color: #94a3b8; font-size: 14px; line-height: 1; }
.quote-document .row-action button:hover { color: #ef4444; }
.quote-document .opt-toggle { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 500; color: var(--qd-accent); cursor: pointer; user-select: none; }
/* ETAPP 3 (offert-masterplan.md): sheetMode — hela raden är tappbar (öppnar
   RowEditSheet). .row-action (Ta bort-×) döljs annars bara vid :hover, som
   ALDRIG triggas på touch — måste vara synlig här så knappen går att träffa. */
.quote-document tbody tr.row-tap { cursor: pointer; }
.quote-document tbody tr.row-tap:active { background: rgba(15, 118, 110, 0.08) !important; }
.quote-document tbody tr.row-tap .row-action { opacity: 1; }
.quote-document tbody tr.row-tap .row-action button { padding: 8px; font-size: 15px; }

/* ETAPP 6a (offert-masterplan.md, faktura-sprinten): fakturaunika tillägg.
   Delar teal/typografitokens med resten av .quote-document ovan — samma
   scope-princip (motorn används nu av BÅDE offert- och fakturaläge). */
.quote-document .item-performed-by { color: #94A3B8; font-size: 10px; margin-top: 2px; }
.quote-document .status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; background: #FEF2F2; color: #DC2626; border: 1px solid #FEE2E2; }
.quote-document .status-badge .dot { width: 6px; height: 6px; border-radius: 50%; background: #DC2626; }
.quote-document .status-badge.paid { background: #F0FDF4; color: #16A34A; border-color: #BBF7D0; }
.quote-document .status-badge.paid .dot { background: #16A34A; }
.quote-document .status-badge.credit { background: var(--qd-accent-50); color: var(--qd-accent); border-color: var(--qd-accent-100); }
.quote-document .status-badge.credit .dot { background: var(--qd-accent); }
.quote-document .doc-dates .due-overdue { color: #DC2626; font-weight: 600; }
.quote-document .refs { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #E2E8F0; border-radius: 8px; margin-bottom: 24px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
.quote-document .refs > div { padding: 10px 14px; }
.quote-document .refs > div + div { border-left: 1px solid #E2E8F0; }
.quote-document .refs .l { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em; color: #64748B; }
.quote-document .refs .v { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 14px; color: #0F172A; margin-top: 2px; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.quote-document .total-row.late { color: #DC2626; font-weight: 600; }
.quote-document .total-row.late .val { color: #DC2626; }
.quote-document .late-notice { background: #FEF2F2; border: 1px solid #FEE2E2; border-radius: 10px; padding: 14px 18px; margin-bottom: 24px; display: flex; gap: 12px; align-items: flex-start; break-inside: avoid; page-break-inside: avoid; }
.quote-document .late-notice .icon { width: 24px; height: 24px; border-radius: 50%; background: #DC2626; color: #fff; display: flex; align-items: center; justify-content: center; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 14px; flex-shrink: 0; }
.quote-document .late-notice .title { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 13px; color: #DC2626; margin-bottom: 2px; }
.quote-document .late-notice .text { font-size: 12px; color: #0F172A; line-height: 1.6; }
.quote-document .paid-banner { background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 10px; padding: 18px; margin-bottom: 24px; text-align: center; break-inside: avoid; page-break-inside: avoid; }
.quote-document .paid-banner .title { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 14px; color: #16A34A; }
.quote-document .paid-banner .sub { font-size: 12px; color: #64748B; margin-top: 4px; }
.quote-document .credit-banner { background: var(--qd-accent-50); border: 1px solid var(--qd-accent-100); border-radius: 10px; padding: 16px 18px; margin-bottom: 24px; break-inside: avoid; page-break-inside: avoid; }
.quote-document .credit-banner .title { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 13px; color: var(--qd-accent); margin-bottom: 2px; }
.quote-document .credit-banner .text { font-size: 12px; color: #0F172A; line-height: 1.6; }
.quote-document .pay-box .swish-mark img { width: 64px; height: 64px; border-radius: 4px; margin-bottom: 4px; }
`
