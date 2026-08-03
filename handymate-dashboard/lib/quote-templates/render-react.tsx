/** @jsxImportSource react */
import { renderToStaticMarkup } from 'react-dom/server'
import QuoteDocument from '@/components/quotes/document/QuoteDocument'
import { escapeHtml } from '@/lib/document-html'
import type { QuoteTemplateData } from './types'

/**
 * ETAPP 2a (offert-masterplan.md): mallsträngen i modern.ts pensioneras —
 * denna funktion renderar SAMMA React-komponent (QuoteDocument) som
 * live-canvasen använder, via renderToStaticMarkup. Dokumentets CSS
 * (MODERN_DOCUMENT_CSS) kommer med INBÄDDAD i markupen (QuoteDocument
 * renderar sin egen <style>-tagg — giltig HTML även i <body>, samma mönster
 * som ModernCanvas redan använde i webbläsaren) — så den INTE dupliceras
 * här i dokumentskalet. Skalet nedan lägger bara till det som är unikt för
 * en fristående HTML-sida (doctype/head/fonts, bakgrund, print-bar,
 * @media print) — exakt det modern.ts tidigare hade UTANFÖR .page-innehållet.
 *
 * Filändelse .tsx (inte .ts som ursprungligen namngivet i planen): krävs för
 * JSX-literalen nedan — TypeScript tillåter inte JSX-syntax i en .ts-fil
 * oavsett tsconfig. Dokumenterad avvikelse, se rapporten.
 *
 * Körs i Node-runtime (route-hanterarna som anropar detta har redan
 * `export const runtime = 'nodejs'` — Chromium-PDF-vägen kräver det ändå).
 * renderToStaticMarkup är en ren synkron funktion utan webbläsar-API:er,
 * så den fungerar identiskt i en Next.js route-hanterare som i ett vanligt
 * Node-skript (t.ex. paritetstestet).
 */
export function renderModernHtml(data: QuoteTemplateData): string {
  const accent = data.business.accentColor
  const bodyHtml = renderToStaticMarkup(<QuoteDocument mode="static" data={data} />)

  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offert ${escapeHtml(data.quote.number)} · ${escapeHtml(data.business.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'DM Sans', system-ui, sans-serif; background: #E5E7EB; color: #0F172A; -webkit-font-smoothing: antialiased; line-height: 1.5; padding: 32px 16px; }
.print-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid #E2E8F0; padding: 12px 24px; display: flex; align-items: center; justify-content: center; gap: 12px; z-index: 100; }
.print-btn { background: ${accent}; color: #fff; border: none; padding: 10px 24px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; }
.print-btn.secondary { background: #f3f4f6; color: #374151; }
/* ETAPP 1d (offert-masterplan.md): .page äger sin egen dokumentmarginal via
   padding — @page/Chromium-margin ska vara 0 (se app/api/quotes/pdf/route.ts)
   så marginalen aldrig dubbelräknas. Oförändrad logik, flyttad hit från
   modern.ts. */
@media print {
  body { background: #fff; padding: 0; }
  .quote-document .page { box-shadow: none; margin: 0; width: 210mm; min-height: 297mm; }
  .print-bar { display: none; }
  @page { size: A4; margin: 0; }
}
</style>
</head>
<body>
<div class="print-bar">
  <button class="print-btn secondary" onclick="window.close()">Stäng</button>
  <button class="print-btn" onclick="window.print()">Skriv ut / Spara som PDF</button>
</div>
${bodyHtml}
</body>
</html>`
}
