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
.quote-document .rot-badge { display: inline-flex; align-items: center; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--qd-accent); background: var(--qd-accent-50); border: 1px dashed var(--qd-accent-100); border-radius: 4px; padding: 1px 6px; cursor: pointer; line-height: 1.6; }
.quote-document .rot-badge:hover { background: var(--qd-accent-100); }
.quote-document .rot-badge.gron { color: #64748B; background: transparent; border-color: #E2E8F0; }
.quote-document .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 28px; break-inside: avoid; page-break-inside: avoid; }
.quote-document .totals { width: 50%; min-width: 280px; }
.quote-document .total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; border-bottom: 1px solid #E2E8F0; }
.quote-document .total-row:last-child { border-bottom: none; }
.quote-document .total-row.rot { color: var(--qd-accent); font-weight: 600; }
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
`
