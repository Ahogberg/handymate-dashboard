import type { QuoteTemplateData, TemplateRenderFn } from './types'
import { escapeHtml, formatCurrency } from '@/lib/document-html'

/**
 * Friendly — varm, cards + badges, DM Sans. Respekterar accent_color.
 */
export const renderFriendly: TemplateRenderFn = (data: QuoteTemplateData): string => {
  const accent = data.business.accentColor
  const accentDark = darken(accent, 0.20)
  const accent50 = mixWithWhite(accent, 0.94)
  const accent100 = mixWithWhite(accent, 0.85)

  const itemsHtml = data.quote.items.map((item, i) => `
    <div class="item-card">
      <div class="item-num">${i + 1}</div>
      <div class="item-body">
        <div class="name">${escapeHtml(item.name)}</div>
        ${item.description ? `<div class="desc">${escapeHtml(item.description)}</div>` : ''}
        <div class="qty">${formatNumber(item.quantity)} ${escapeHtml(item.unit)} á ${formatCurrency(item.unitPrice)}</div>
      </div>
      <div class="item-amt">${formatCurrency(item.total)}</div>
    </div>
  `).join('')

  const customerLines = [
    [data.customer.address, data.customer.postalCode, data.customer.city].filter(Boolean).join(', '),
  ].filter(Boolean)

  const businessAddressLine = data.business.address || ''

  const badges: string[] = []
  if (data.quote.rotDeduction) badges.push('<span class="badge rot"><span class="dot"></span>ROT-avdrag tillämpas</span>')
  if (data.quote.rutDeduction) badges.push('<span class="badge rot"><span class="dot"></span>RUT-avdrag tillämpas</span>')
  badges.push('<span class="badge moms"><span class="dot"></span>Moms 25% ingår</span>')
  if (data.quote.warrantyText) badges.push('<span class="badge warranty"><span class="dot"></span>Garanti ingår</span>')

  const rotRow = data.quote.rotDeduction
    ? `<div class="total-row rot"><span class="lbl">ROT-avdrag (30% av arbetskostnaden)</span><span class="val">−${formatCurrency(data.quote.rotDeduction)}</span></div>`
    : ''
  const rutRow = data.quote.rutDeduction
    ? `<div class="total-row rot"><span class="lbl">RUT-avdrag (50% av arbetskostnaden)</span><span class="val">−${formatCurrency(data.quote.rutDeduction)}</span></div>`
    : ''

  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offert ${escapeHtml(data.quote.number)} · ${escapeHtml(data.business.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root {
  --teal: ${accent};
  --teal-dark: ${accentDark};
  --teal-50: ${accent50};
  --teal-100: ${accent100};
  --green: #16A34A;
  --green-bg: #DCFCE7;
  --blue: #2563EB;
  --blue-bg: #DBEAFE;
  --amber-bg: #FEF3C7;
  --amber: #B45309;
  --ink: #0F172A;
  --muted: #64748B;
  --paper: #FFFFFF;
  --bg: #F1F5F9;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'DM Sans', system-ui, sans-serif; background: #E5E7EB; color: var(--ink); -webkit-font-smoothing: antialiased; line-height: 1.55; padding: 32px 16px; }
.page { width: 210mm; min-height: 297mm; margin: 0 auto; background: var(--bg); box-shadow: 0 16px 40px rgba(15,23,42,0.10); display: flex; flex-direction: column; padding: 14mm; gap: 14px; }
.header { background: linear-gradient(135deg, var(--teal) 0%, var(--teal-dark) 100%); border-radius: 16px; padding: 24px 26px; color: #fff; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 8px 24px rgba(15,118,110,0.18); position: relative; overflow: hidden; }
.header::after { content: ''; position: absolute; top: -40px; right: -40px; width: 180px; height: 180px; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,0.12), transparent 70%); }
.brand { display: flex; align-items: center; gap: 14px; position: relative; }
.brand-mark { width: 52px; height: 52px; border-radius: 14px; background: rgba(255,255,255,0.18); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 24px; color: #fff; overflow: hidden; }
.brand-mark img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
.brand-name { font-weight: 700; font-size: 20px; letter-spacing: -0.01em; }
.brand-sub { font-size: 12px; color: rgba(255,255,255,0.75); margin-top: 2px; }
.doc-meta { text-align: right; position: relative; }
.doc-label { font-size: 11px; color: rgba(255,255,255,0.7); font-weight: 500; }
.doc-number { font-weight: 800; font-size: 26px; letter-spacing: -0.02em; margin-top: 2px; }
.doc-dates { font-size: 12px; color: rgba(255,255,255,0.85); margin-top: 8px; line-height: 1.7; }
.card { background: var(--paper); border-radius: 14px; padding: 20px 22px; box-shadow: 0 2px 6px rgba(15,23,42,0.04), 0 0 0 1px rgba(15,23,42,0.04); }
.card-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: var(--teal); margin-bottom: 10px; }
.parties { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.party-name { font-weight: 700; font-size: 16px; color: var(--ink); }
.party-line { font-size: 13px; color: var(--ink); margin-top: 2px; }
.party-meta { font-size: 12px; color: var(--muted); margin-top: 4px; line-height: 1.6; }
.job .quote-title { font-weight: 700; font-size: 22px; color: var(--ink); letter-spacing: -0.01em; margin-bottom: 4px; }
.job .quote-sub { color: var(--muted); font-size: 13px; }
.badges { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; font-size: 11px; font-weight: 600; }
.badge .dot { width: 6px; height: 6px; border-radius: 50%; }
.badge.rot { background: var(--green-bg); color: #166534; }
.badge.rot .dot { background: var(--green); }
.badge.moms { background: var(--blue-bg); color: #1E40AF; }
.badge.moms .dot { background: var(--blue); }
.badge.warranty { background: var(--amber-bg); color: var(--amber); }
.badge.warranty .dot { background: var(--amber); }
.items-grid { display: flex; flex-direction: column; gap: 10px; }
.item-card { display: grid; grid-template-columns: 36px 1fr auto; gap: 14px; align-items: flex-start; padding: 14px 16px; background: var(--bg); border-radius: 12px; border: 1px solid rgba(15,23,42,0.04); }
.item-num { width: 30px; height: 30px; border-radius: 50%; background: var(--teal-100); color: var(--teal-dark); font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.item-body .name { font-weight: 600; color: var(--ink); font-size: 14px; }
.item-body .desc { color: var(--muted); font-size: 12px; line-height: 1.5; margin-top: 2px; }
.item-body .qty { color: var(--muted); font-size: 11px; margin-top: 4px; font-weight: 500; }
.item-amt { text-align: right; font-weight: 700; color: var(--ink); font-size: 14px; font-variant-numeric: tabular-nums; white-space: nowrap; align-self: center; }
.totals-card { padding: 22px 24px; }
.totals-rows { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.total-row { display: flex; justify-content: space-between; font-size: 13px; }
.total-row .lbl { color: var(--muted); }
.total-row .val { font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
.total-row.rot { background: var(--green-bg); padding: 10px 12px; border-radius: 8px; margin: 6px 0; }
.total-row.rot .lbl { color: #166534; font-weight: 600; }
.total-row.rot .val { color: #166534; }
.grand-card { background: linear-gradient(135deg, var(--teal) 0%, var(--teal-dark) 100%); border-radius: 12px; padding: 20px 24px; color: #fff; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 6px 20px rgba(15,118,110,0.18); }
.grand-card .lbl { font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.8); text-transform: uppercase; letter-spacing: 0.12em; }
.grand-card .val { font-weight: 800; font-size: 34px; letter-spacing: -0.02em; }
.pay-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.pay-card { display: flex; align-items: center; gap: 14px; padding: 16px 18px; }
.pay-icon { width: 44px; height: 44px; border-radius: 12px; background: var(--teal-100); color: var(--teal); display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; }
.pay-card .l { font-size: 11px; color: var(--muted); font-weight: 500; }
.pay-card .v { font-weight: 700; color: var(--ink); font-size: 15px; }
.footer-card { padding: 14px 22px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.footer-card .l { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); margin-bottom: 2px; }
.footer-card .v { color: var(--ink); font-weight: 600; font-size: 12px; }
.terms { font-size: 11px; color: var(--muted); padding: 0 8px; line-height: 1.7; }
.print-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid var(--bg); padding: 12px 24px; display: flex; align-items: center; justify-content: center; gap: 12px; z-index: 100; }
.print-btn { background: var(--teal); color: #fff; border: none; padding: 10px 24px; border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; }
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
        ${data.business.tagline ? `<div class="brand-sub">${escapeHtml(data.business.tagline)}</div>` : ''}
      </div>
    </div>
    <div class="doc-meta">
      <div class="doc-label">Offert</div>
      <div class="doc-number">${escapeHtml(data.quote.number)}</div>
      <div class="doc-dates">Utfärdad ${escapeHtml(data.quote.issuedDate)}<br/>Giltig till ${escapeHtml(data.quote.validUntilDate)}</div>
    </div>
  </header>

  <section class="card">
    <div class="parties">
      <div>
        <div class="card-title">Från</div>
        <div class="party-name">${escapeHtml(data.business.name)}</div>
        ${businessAddressLine ? `<div class="party-line">${escapeHtml(businessAddressLine)}</div>` : ''}
        <div class="party-meta">${[data.business.contactName, data.business.phone].filter(Boolean).map(escapeHtml).join(' · ')}${data.business.email ? `<br/>${escapeHtml(data.business.email)}` : ''}</div>
      </div>
      <div>
        <div class="card-title">Till</div>
        <div class="party-name">${escapeHtml(data.customer.name)}</div>
        ${customerLines.map(l => `<div class="party-line">${escapeHtml(l!)}</div>`).join('')}
        <div class="party-meta">${[data.customer.phone, data.customer.email].filter(Boolean).map(escapeHtml).join(' · ')}</div>
      </div>
    </div>
  </section>

  <section class="card job">
    <div class="card-title">Det här gäller</div>
    <div class="quote-title">${escapeHtml(data.quote.title)}</div>
    ${data.quote.description ? `<p class="quote-sub">${escapeHtml(data.quote.description)}</p>` : data.quote.introductionText ? `<p class="quote-sub">${escapeHtml(data.quote.introductionText)}</p>` : ''}
    <div class="badges">${badges.join('')}</div>
  </section>

  <section class="card items-section">
    <div class="card-title">Vad som ingår</div>
    <div class="items-grid">${itemsHtml}</div>
  </section>

  <section class="card totals-card">
    <div class="card-title">Summering</div>
    <div class="totals-rows">
      <div class="total-row"><span class="lbl">Summa exkl. moms</span><span class="val">${formatCurrency(data.quote.subtotalExVat)}</span></div>
      <div class="total-row"><span class="lbl">Moms 25%</span><span class="val">${formatCurrency(data.quote.vatAmount)}</span></div>
      <div class="total-row"><span class="lbl">Summa inkl. moms</span><span class="val">${formatCurrency(data.quote.totalIncVat)}</span></div>
      ${rotRow}
      ${rutRow}
    </div>
    <div class="grand-card">
      <div>
        <div class="lbl">Att betala</div>
        ${data.quote.rotDeduction || data.quote.rutDeduction ? `<div style="font-size: 11px; opacity: 0.75; margin-top: 4px;">Efter avdrag</div>` : ''}
      </div>
      <div class="val">${formatCurrency(data.quote.amountToPay)}</div>
    </div>
  </section>

  <section class="pay-row">
    ${data.business.swish ? `<div class="card pay-card"><div class="pay-icon">S</div><div><div class="l">Swish företag</div><div class="v">${escapeHtml(data.business.swish)}</div></div></div>` : ''}
    ${data.business.bankgiro ? `<div class="card pay-card"><div class="pay-icon">BG</div><div><div class="l">Bankgiro · ${escapeHtml(data.quote.paymentTerms)}</div><div class="v">${escapeHtml(data.business.bankgiro)}</div></div></div>` : ''}
  </section>

  <p class="terms">Offerten gäller till ${escapeHtml(data.quote.validUntilDate)}. ${data.quote.rotDeduction ? 'ROT-avdrag förutsätter att kund äger fastigheten och har utrymme i avdrag. ' : ''}Eventuellt tilläggsarbete debiteras enligt löpande räkning.${data.quote.warrantyText ? ' Garanti: ' + escapeHtml(data.quote.warrantyText) + '.' : ''}${data.quote.notIncluded ? ' Ej inkluderat: ' + escapeHtml(data.quote.notIncluded) + '.' : ''}</p>

  <section class="card footer-card">
    ${data.business.orgNumber ? `<div><div class="l">Org.nr</div><div class="v">${escapeHtml(data.business.orgNumber)}</div></div>` : ''}
    ${data.business.bankgiro ? `<div><div class="l">Bankgiro</div><div class="v">${escapeHtml(data.business.bankgiro)}</div></div>` : ''}
    <div><div class="l">F-skatt</div><div class="v">${data.business.fSkatt ? 'Innehas' : '—'}</div></div>
    ${data.business.momsRegnr ? `<div><div class="l">Moms</div><div class="v">${escapeHtml(data.business.momsRegnr)}</div></div>` : ''}
  </section>
</div>
</body>
</html>`
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toLocaleString('sv-SE', { maximumFractionDigits: 2 })
}

function mixWithWhite(hex: string, whitePct: number): string {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i)
  if (!m) return hex
  const r = parseInt(m[1].substring(0, 2), 16)
  const g = parseInt(m[1].substring(2, 4), 16)
  const b = parseInt(m[1].substring(4, 6), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * whitePct)
  return `#${mix(r).toString(16).padStart(2, '0')}${mix(g).toString(16).padStart(2, '0')}${mix(b).toString(16).padStart(2, '0')}`
}

function darken(hex: string, amount: number): string {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i)
  if (!m) return hex
  const r = parseInt(m[1].substring(0, 2), 16)
  const g = parseInt(m[1].substring(2, 4), 16)
  const b = parseInt(m[1].substring(4, 6), 16)
  const dark = (c: number) => Math.round(c * (1 - amount))
  return `#${dark(r).toString(16).padStart(2, '0')}${dark(g).toString(16).padStart(2, '0')}${dark(b).toString(16).padStart(2, '0')}`
}
