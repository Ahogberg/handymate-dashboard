import type { QuoteTemplateData, TemplateRenderFn } from './types'
import { escapeHtml, formatCurrency } from '@/lib/document-html'

/**
 * Modern — ren teal, Space Grotesk + DM Sans, tidlös och tydlig.
 * Respekterar business.accentColor (default #0F766E).
 */
export const renderModern: TemplateRenderFn = (data: QuoteTemplateData): string => {
  const accent = data.business.accentColor
  const accentLight = mixWithWhite(accent, 0.92)
  const accent100 = mixWithWhite(accent, 0.82)

  const itemsHtml = data.quote.items.map(item => `
    <tr>
      <td>
        <div class="item-name">${escapeHtml(item.name)}</div>
        ${item.description ? `<div class="item-desc">${escapeHtml(item.description)}</div>` : ''}
      </td>
      <td class="num">${formatNumber(item.quantity)} ${escapeHtml(item.unit)}</td>
      <td class="num">${formatCurrency(item.unitPrice)}</td>
      <td class="num">${formatCurrency(item.total)}</td>
    </tr>
  `).join('')

  const rotRow = data.quote.rotDeduction
    ? `<div class="total-row rot"><span class="lbl">ROT-avdrag (30% av arbete)</span><span class="val">−${formatCurrency(data.quote.rotDeduction)}</span></div>`
    : ''
  const rutRow = data.quote.rutDeduction
    ? `<div class="total-row rot"><span class="lbl">RUT-avdrag (50% av arbete)</span><span class="val">−${formatCurrency(data.quote.rutDeduction)}</span></div>`
    : ''

  const introHtml = data.quote.description
    ? `<p class="quote-sub">${escapeHtml(data.quote.description)}</p>`
    : data.quote.introductionText
      ? `<p class="quote-sub">${escapeHtml(data.quote.introductionText)}</p>`
      : ''

  const customerLines = [
    data.customer.address,
    [data.customer.postalCode, data.customer.city].filter(Boolean).join(' '),
  ].filter(Boolean)

  const businessAddressLine = data.business.address || ''
  const swishBox = data.business.swish
    ? `
    <div class="pay-box">
      <div>
        <div class="pay-title">Betalning</div>
        <div class="pay-text">Faktura skickas vid avslut. <strong>${escapeHtml(data.quote.paymentTerms)}.</strong> Vid mindre delbetalningar accepteras Swish till nummer nedan med offertnummer i meddelandet.</div>
      </div>
      <div class="swish-mark">
        <div class="label">Swish</div>
        <div class="num">${escapeHtml(data.business.swish)}</div>
      </div>
    </div>`
    : `
    <div class="pay-box single">
      <div>
        <div class="pay-title">Betalning</div>
        <div class="pay-text">Faktura skickas vid avslut. <strong>${escapeHtml(data.quote.paymentTerms)}.</strong></div>
      </div>
    </div>`

  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offert ${escapeHtml(data.quote.number)} · ${escapeHtml(data.business.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --teal: ${accent};
  --teal-light: ${accent};
  --teal-50: ${accentLight};
  --teal-100: ${accent100};
  --bg: #F8FAFC;
  --ink: #0F172A;
  --muted: #64748B;
  --border: #E2E8F0;
  --row-alt: #F8FAFC;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'DM Sans', system-ui, sans-serif; background: #E5E7EB; color: var(--ink); -webkit-font-smoothing: antialiased; line-height: 1.5; padding: 32px 16px; }
.page { width: 210mm; min-height: 297mm; padding: 22mm 20mm; margin: 0 auto; background: #fff; box-shadow: 0 16px 40px rgba(15,23,42,0.10); display: flex; flex-direction: column; }
.header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
.brand { display: flex; align-items: center; gap: 12px; }
.brand-mark { width: 44px; height: 44px; border-radius: 10px; background: var(--teal); color: #fff; display: flex; align-items: center; justify-content: center; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 22px; overflow: hidden; }
.brand-mark img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
.brand-name { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 18px; color: var(--ink); letter-spacing: -0.01em; }
.brand-meta { color: var(--muted); font-size: 11px; margin-top: 2px; }
.doc-meta { text-align: right; }
.doc-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.16em; color: var(--muted); }
.doc-number { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 26px; color: var(--ink); letter-spacing: -0.02em; margin-top: 2px; }
.doc-ref { font-size: 11px; color: var(--muted); margin-top: 4px; font-weight: 500; }
.doc-dates { font-size: 12px; color: var(--muted); margin-top: 8px; line-height: 1.7; }
.doc-dates strong { color: var(--ink); font-weight: 600; }
.accent { height: 2px; background: var(--teal); margin: 20px 0 28px; opacity: 0.85; }
.parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; }
.party-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em; color: var(--teal); margin-bottom: 6px; }
.party-name { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 15px; color: var(--ink); }
.party-line { font-size: 13px; color: var(--ink); margin-top: 2px; }
.party-meta { font-size: 12px; color: var(--muted); margin-top: 4px; line-height: 1.6; }
.quote-title { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 22px; color: var(--ink); letter-spacing: -0.015em; margin-bottom: 4px; }
.quote-sub { color: var(--muted); font-size: 13px; margin-bottom: 24px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
thead th { text-align: left; padding: 10px 12px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); border-bottom: 1.5px solid var(--ink); }
thead th.num { text-align: right; }
tbody td { padding: 12px; vertical-align: top; font-size: 13px; }
tbody tr:nth-child(even) { background: var(--row-alt); }
.item-name { font-weight: 600; color: var(--ink); }
.item-desc { color: var(--muted); font-size: 12px; margin-top: 2px; }
td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 28px; }
.totals { width: 50%; min-width: 280px; }
.total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; border-bottom: 1px solid var(--border); }
.total-row:last-child { border-bottom: none; }
.total-row.rot { color: var(--teal); font-weight: 600; }
.total-row.grand { font-family: 'Space Grotesk', sans-serif; font-size: 18px; font-weight: 700; padding: 14px 0 6px; border-top: 1.5px solid var(--ink); border-bottom: none; margin-top: 6px; }
.total-row .lbl { color: var(--muted); }
.total-row.grand .lbl { color: var(--ink); }
.total-row .val { font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
.total-row.rot .val { color: var(--teal); }
.pay-box { border: 1px solid var(--teal-100); background: var(--teal-50); border-radius: 10px; padding: 16px 18px; display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center; margin-bottom: 28px; }
.pay-box.single { grid-template-columns: 1fr; }
.pay-title { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 14px; color: var(--teal); margin-bottom: 4px; }
.pay-text { font-size: 12px; color: var(--ink); line-height: 1.6; }
.pay-text strong { font-weight: 600; }
.swish-mark { background: #fff; border: 1px solid var(--teal-100); border-radius: 8px; padding: 8px 14px; display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 110px; }
.swish-mark .label { font-size: 9px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.14em; }
.swish-mark .num { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 16px; color: var(--ink); letter-spacing: -0.01em; }
.terms { font-size: 11px; color: var(--muted); line-height: 1.7; margin-bottom: 28px; }
.terms strong { color: var(--ink); font-weight: 600; }
.footer { margin-top: auto; padding-top: 18px; border-top: 1px solid var(--border); display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; font-size: 10px; color: var(--muted); }
.footer .l { font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); margin-bottom: 2px; }
.footer .v { color: var(--ink); font-weight: 500; font-size: 11px; }
.print-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid var(--border); padding: 12px 24px; display: flex; align-items: center; justify-content: center; gap: 12px; z-index: 100; }
.print-btn { background: var(--teal); color: #fff; border: none; padding: 10px 24px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; }
.print-btn.secondary { background: #f3f4f6; color: #374151; }
@media print {
  body { background: #fff; padding: 0; }
  .page { box-shadow: none; margin: 0; width: 210mm; min-height: 297mm; }
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
<div class="page">
  <header class="header">
    <div class="brand">
      <div class="brand-mark">${data.business.logoUrl
        ? `<img src="${escapeHtml(data.business.logoUrl)}" alt="${escapeHtml(data.business.name)}" onerror="this.parentElement.textContent='${escapeHtml(data.business.name.charAt(0).toUpperCase())}'" />`
        : escapeHtml(data.business.name.charAt(0).toUpperCase())}</div>
      <div>
        <div class="brand-name">${escapeHtml(data.business.name)}</div>
        ${data.business.tagline ? `<div class="brand-meta">${escapeHtml(data.business.tagline)}</div>` : ''}
      </div>
    </div>
    <div class="doc-meta">
      <div class="doc-label">Offert</div>
      <div class="doc-number">${escapeHtml(data.quote.number)}</div>
      ${data.quote.dealNumber ? `<div class="doc-ref">Ärende ${escapeHtml(data.quote.dealNumber)}</div>` : ''}
      <div class="doc-dates">
        <div><strong>Utfärdad:</strong> ${escapeHtml(data.quote.issuedDate)}</div>
        <div><strong>Giltig till:</strong> ${escapeHtml(data.quote.validUntilDate)}</div>
      </div>
    </div>
  </header>

  <div class="accent"></div>

  <section class="parties">
    <div>
      <div class="party-label">Avsändare</div>
      <div class="party-name">${escapeHtml(data.business.name)}</div>
      ${businessAddressLine ? `<div class="party-line">${escapeHtml(businessAddressLine)}</div>` : ''}
      <div class="party-meta">${[data.business.contactName, data.business.phone].filter(Boolean).map(escapeHtml).join(' · ')}${data.business.email ? `<br/>${escapeHtml(data.business.email)}` : ''}</div>
    </div>
    <div>
      <div class="party-label">Mottagare</div>
      <div class="party-name">${escapeHtml(data.customer.name)}</div>
      ${customerLines.map(l => `<div class="party-line">${escapeHtml(l!)}</div>`).join('')}
      <div class="party-meta">${[data.customer.phone, data.customer.email].filter(Boolean).map(escapeHtml).join(' · ')}${data.customer.personnummer ? `<br/>Personnr: ${escapeHtml(data.customer.personnummer)}` : ''}</div>
    </div>
  </section>

  <h1 class="quote-title">${escapeHtml(data.quote.title)}</h1>
  ${introHtml}

  <table>
    <thead>
      <tr>
        <th>Beskrivning</th>
        <th class="num">Antal</th>
        <th class="num">Á-pris</th>
        <th class="num">Summa</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <div class="totals-wrap">
    <div class="totals">
      <div class="total-row"><span class="lbl">Summa exkl. moms</span><span class="val">${formatCurrency(data.quote.subtotalExVat)}</span></div>
      <div class="total-row"><span class="lbl">Moms 25%</span><span class="val">${formatCurrency(data.quote.vatAmount)}</span></div>
      <div class="total-row"><span class="lbl">Summa inkl. moms</span><span class="val">${formatCurrency(data.quote.totalIncVat)}</span></div>
      ${rotRow}
      ${rutRow}
      <div class="total-row grand"><span class="lbl">Att betala</span><span class="val">${formatCurrency(data.quote.amountToPay)}</span></div>
    </div>
  </div>

  ${swishBox}

  <p class="terms">
    <strong>Villkor.</strong> Offerten gäller till ${escapeHtml(data.quote.validUntilDate)}. ${data.quote.rotDeduction ? 'ROT-avdrag förutsätter att kund äger fastigheten och har utrymme i avdrag. ' : ''}Eventuellt tilläggsarbete debiteras enligt löpande räkning. Alla priser är exkl. moms om inte annat anges.${data.quote.notIncluded ? `<br/><br/><strong>Ej inkluderat:</strong> ${escapeHtml(data.quote.notIncluded)}` : ''}${data.quote.warrantyText ? `<br/><br/><strong>Garanti:</strong> ${escapeHtml(data.quote.warrantyText)}` : ''}
  </p>

  <footer class="footer">
    ${data.business.orgNumber ? `<div><div class="l">Org.nr</div><div class="v">${escapeHtml(data.business.orgNumber)}</div></div>` : ''}
    ${data.business.bankgiro ? `<div><div class="l">Bankgiro</div><div class="v">${escapeHtml(data.business.bankgiro)}</div></div>` : ''}
    <div><div class="l">F-skatt</div><div class="v">${data.business.fSkatt ? 'Innehas' : '—'}</div></div>
    ${data.business.momsRegnr ? `<div><div class="l">Moms</div><div class="v">${escapeHtml(data.business.momsRegnr)}</div></div>` : ''}
  </footer>
</div>
</body>
</html>`
}

// ── Helpers ────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toLocaleString('sv-SE', { maximumFractionDigits: 2 })
}

/**
 * Mixar accent-färgen mot vitt med given vit-andel (0..1).
 * Används för att skapa ljusare bakgrundsvarianter (teal-50, teal-100)
 * från valfri accent_color så hela paletten håller ihop.
 */
function mixWithWhite(hex: string, whitePct: number): string {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i)
  if (!m) return hex
  const r = parseInt(m[1].substring(0, 2), 16)
  const g = parseInt(m[1].substring(2, 4), 16)
  const b = parseInt(m[1].substring(4, 6), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * whitePct)
  return `#${mix(r).toString(16).padStart(2, '0')}${mix(g).toString(16).padStart(2, '0')}${mix(b).toString(16).padStart(2, '0')}`
}
