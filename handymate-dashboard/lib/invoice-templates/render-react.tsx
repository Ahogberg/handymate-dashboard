/** @jsxImportSource react */
// ETAPP 6a (offert-masterplan.md, faktura-sprinten): speglar
// lib/quote-templates/render-react.tsx rakt av — SAMMA react-dom/server.browser-
// workaround (HOTFIX 2026-08-04, se tasks/lessons.md "tsc räcker inte som
// deploy-gate"): Next 14 förbjuder modulnivå-import av 'react-dom/server' i
// app-routern (webpack-fel, syns bara i `next build` — inte tsc).
// @ts-ignore -- react-dom/server.browser saknar typdeklarationer
import { renderToStaticMarkup as renderToStaticMarkupUntyped } from 'react-dom/server.browser'
import type { ReactElement } from 'react'

const renderToStaticMarkup = renderToStaticMarkupUntyped as unknown as (element: ReactElement) => string
import QuoteDocument from '@/components/quotes/document/QuoteDocument'
import { escapeHtml } from '@/lib/document-html'
import type { InvoiceTemplateData } from './types'

/**
 * ETAPP 6a: lib/invoice-templates/modern.ts (mallsträngen) pensioneras —
 * denna funktion renderar SAMMA React-komponent (QuoteDocument, i
 * docType='invoice'-läge) som offertens renderModernHtml, via
 * renderToStaticMarkup. Dokumentets CSS (MODERN_DOCUMENT_CSS, delad med
 * offerten) kommer inbäddad i markupen — skalet nedan lägger bara till det
 * som är unikt för en fristående HTML-sida (doctype/head/fonts, bakgrund,
 * print-bar, @media print), identiskt med offertens skal.
 *
 * Körs i Node-runtime (route-hanterarna som anropar detta har redan
 * `export const runtime = 'nodejs'` — Chromium-PDF-vägen kräver det ändå).
 */
export function renderModernInvoiceHtml(data: InvoiceTemplateData): string {
  const accent = data.business.accentColor
  const bodyHtml = renderToStaticMarkup(<QuoteDocument mode="static" data={{ ...data, docType: 'invoice' }} />)

  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${data.invoice.isCreditNote ? 'Kreditfaktura' : 'Faktura'} ${escapeHtml(data.invoice.number)} · ${escapeHtml(data.business.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'DM Sans', system-ui, sans-serif; background: #E5E7EB; color: #0F172A; -webkit-font-smoothing: antialiased; line-height: 1.5; padding: 32px 16px; }
.print-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid #E2E8F0; padding: 12px 24px; display: flex; align-items: center; justify-content: center; gap: 12px; z-index: 100; }
.print-btn { background: ${accent}; color: #fff; border: none; padding: 10px 24px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; }
.print-btn.secondary { background: #f3f4f6; color: #374151; }
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
