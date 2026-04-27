import type { QuoteTemplateData, TemplateRenderFn } from './types'
import { escapeHtml, formatCurrency } from '@/lib/document-html'

/**
 * Premium — påkostad, dark teal + amber, Syne + DM Sans.
 * Ignorerar accent_color — paletten är låst för att bevara identiteten.
 */
export const renderPremium: TemplateRenderFn = (data: QuoteTemplateData): string => {
  const itemsHtml = data.quote.items.map(item => `
    <div class="item">
      <div>
        <div class="item-name">${escapeHtml(item.name)}</div>
        ${item.description ? `<div class="item-desc">${escapeHtml(item.description)}</div>` : ''}
      </div>
      <div class="num">${formatNumber(item.quantity)} ${escapeHtml(item.unit)}</div>
      <div class="num">${formatCurrency(item.unitPrice)}</div>
      <div class="num">${formatCurrency(item.total)}</div>
    </div>
  `).join('')

  const rotRow = data.quote.rotDeduction
    ? `<div class="total-row rot"><span class="lbl">ROT-avdrag (30% av arbete)</span><span class="val">−${formatCurrency(data.quote.rotDeduction)}</span></div>`
    : ''
  const rutRow = data.quote.rutDeduction
    ? `<div class="total-row rot"><span class="lbl">RUT-avdrag (50% av arbete)</span><span class="val">−${formatCurrency(data.quote.rutDeduction)}</span></div>`
    : ''

  const customerLines = [
    data.customer.address,
    [data.customer.postalCode, data.customer.city].filter(Boolean).join(' '),
  ].filter(Boolean)

  const tagline = data.quote.title || data.business.tagline || ''

  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offert ${escapeHtml(data.quote.number)} · ${escapeHtml(data.business.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --dark: #0F2E2A;
  --dark-2: #143733;
  --amber: #D97706;
  --amber-light: #F59E0B;
  --ink: #0F172A;
  --muted: #6B7280;
  --line: #E5E7EB;
  --paper: #FAFAF7;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'DM Sans', system-ui, sans-serif; background: #D8D8D2; color: var(--ink); -webkit-font-smoothing: antialiased; line-height: 1.5; padding: 32px 16px; }
.page { width: 210mm; min-height: 297mm; margin: 0 auto; background: var(--paper); box-shadow: 0 16px 40px rgba(15,23,42,0.14); display: flex; flex-direction: column; }
.header { background: var(--dark); color: #fff; padding: 28mm 20mm 22mm; position: relative; overflow: hidden; }
.header::before { content: ''; position: absolute; inset: 0; background-image: radial-gradient(circle at 90% 10%, rgba(217,119,6,0.18), transparent 40%), repeating-linear-gradient(45deg, transparent 0 18px, rgba(255,255,255,0.025) 18px 19px); pointer-events: none; }
.header > * { position: relative; }
.header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 36px; }
.brand { display: flex; align-items: center; gap: 14px; }
.brand-mark { width: 48px; height: 48px; border: 1.5px solid rgba(255,255,255,0.4); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-family: 'Syne', sans-serif; font-weight: 800; font-size: 22px; color: #fff; overflow: hidden; }
.brand-mark img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
.brand-name { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 18px; letter-spacing: 0.04em; text-transform: uppercase; }
.brand-sub { font-size: 11px; color: rgba(255,255,255,0.55); margin-top: 2px; letter-spacing: 0.06em; text-transform: uppercase; }
.doc-label { font-size: 10px; font-weight: 600; letter-spacing: 0.24em; color: var(--amber-light); text-transform: uppercase; text-align: right; }
.header-main { display: grid; grid-template-columns: 1.2fr 1fr; gap: 32px; align-items: end; }
.quote-number { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 64px; letter-spacing: -0.03em; line-height: 0.95; color: #fff; }
.quote-number .yr { color: var(--amber-light); }
.header-meta { font-size: 12px; color: rgba(255,255,255,0.7); line-height: 1.9; text-align: right; }
.header-meta strong { color: #fff; font-weight: 600; display: inline-block; min-width: 90px; }
.quote-tagline { font-family: 'Syne', sans-serif; font-weight: 600; font-size: 15px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--amber-light); margin-top: 14px; }
.quote-ref { font-family: 'Syne', sans-serif; font-size: 13px; color: rgba(255,255,255,0.7); margin-top: 8px; letter-spacing: 0.04em; }
.body { padding: 22mm 20mm; flex: 1; display: flex; flex-direction: column; }
.parties { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid var(--line); }
.party-label { font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.24em; text-transform: uppercase; color: var(--amber); margin-bottom: 8px; }
.party-name { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 16px; color: var(--dark); letter-spacing: 0.01em; }
.party-line { font-size: 13px; color: var(--ink); margin-top: 2px; }
.party-meta { font-size: 12px; color: var(--muted); margin-top: 4px; line-height: 1.6; }
.quote-title { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 24px; color: var(--dark); letter-spacing: -0.01em; margin-bottom: 6px; }
.quote-sub { color: var(--muted); font-size: 13px; margin-bottom: 22px; max-width: 540px; }
.items { margin-bottom: 28px; }
.items-head { display: grid; grid-template-columns: 1fr 80px 110px 120px; gap: 16px; padding: 8px 0 12px; border-bottom: 1.5px solid var(--dark); font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.18em; color: var(--dark); }
.items-head .num { text-align: right; }
.item { display: grid; grid-template-columns: 1fr 80px 110px 120px; gap: 16px; padding: 14px 16px; border-bottom: 1px solid var(--line); border-left: 3px solid var(--amber); margin-left: -19px; padding-left: 16px; }
.item:nth-child(odd) { border-left-color: var(--dark); }
.item .num { text-align: right; font-variant-numeric: tabular-nums; align-self: center; white-space: nowrap; }
.item-name { font-weight: 600; color: var(--dark); font-size: 13px; }
.item-desc { color: var(--muted); font-size: 12px; margin-top: 2px; line-height: 1.5; }
.totals-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 24px; margin-bottom: 28px; align-items: stretch; }
.terms-card { border: 1px solid var(--line); padding: 18px; background: #fff; }
.terms-card h3 { font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.18em; color: var(--dark); margin-bottom: 8px; }
.terms-card p { font-size: 11px; color: var(--muted); line-height: 1.7; }
.terms-card p strong { color: var(--ink); }
.terms-card p + p { margin-top: 8px; }
.totals-stack { display: flex; flex-direction: column; }
.total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; }
.total-row .lbl { color: var(--muted); }
.total-row .val { font-weight: 600; color: var(--dark); font-variant-numeric: tabular-nums; }
.total-row.sub { border-bottom: 1px solid var(--line); }
.total-row.rot { color: var(--amber); font-weight: 600; padding: 10px 14px; background: rgba(217,119,6,0.08); border-radius: 2px; margin: 6px 0; }
.total-row.rot .val { color: var(--amber); }
.total-grand { margin-top: 10px; padding: 18px 20px; background: var(--dark); color: #fff; display: flex; justify-content: space-between; align-items: center; }
.total-grand .lbl { font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255,255,255,0.7); }
.total-grand .val { font-family: 'Syne', sans-serif; font-size: 24px; font-weight: 800; letter-spacing: -0.01em; color: #fff; }
.pay-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 24px; }
.pay-card { border: 1px solid var(--line); background: #fff; padding: 14px 16px; }
.pay-card .l { font-family: 'Syne', sans-serif; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2em; color: var(--amber); margin-bottom: 4px; }
.pay-card .v { font-weight: 600; color: var(--dark); font-size: 14px; font-variant-numeric: tabular-nums; }
.pay-card .s { font-size: 11px; color: var(--muted); margin-top: 2px; }
.footer { margin-top: auto; padding: 14px 20mm; background: var(--dark); color: rgba(255,255,255,0.6); display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; font-size: 10px; }
.footer .l { font-size: 9px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--amber-light); margin-bottom: 2px; }
.footer .v { color: #fff; font-size: 11px; font-weight: 500; }
.print-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid var(--line); padding: 12px 24px; display: flex; align-items: center; justify-content: center; gap: 12px; z-index: 100; }
.print-btn { background: var(--dark); color: #fff; border: none; padding: 10px 24px; border-radius: 4px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; }
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
    <div class="header-top">
      <div class="brand">
        <div class="brand-mark">${data.business.logoUrl
          ? `<img src="${escapeHtml(data.business.logoUrl)}" alt="${escapeHtml(data.business.name)}" onerror="this.parentElement.textContent='${escapeHtml(data.business.name.charAt(0).toUpperCase())}'" />`
          : escapeHtml(data.business.name.charAt(0).toUpperCase())}</div>
        <div>
          <div class="brand-name">${escapeHtml(data.business.name)}</div>
          ${data.business.tagline ? `<div class="brand-sub">${escapeHtml(data.business.tagline)}</div>` : ''}
        </div>
      </div>
      <div class="doc-label">Offert · Quotation</div>
    </div>
    <div class="header-main">
      <div>
        <div class="quote-number">${escapeHtml(data.quote.number)}</div>
        ${data.quote.dealNumber ? `<div class="quote-ref">Ärende ${escapeHtml(data.quote.dealNumber)}</div>` : ''}
        ${tagline ? `<div class="quote-tagline">${escapeHtml(tagline)}</div>` : ''}
      </div>
      <div class="header-meta">
        <div><strong>Utfärdad</strong>${escapeHtml(data.quote.issuedDate)}</div>
        <div><strong>Giltig till</strong>${escapeHtml(data.quote.validUntilDate)}</div>
        <div><strong>Beställare</strong>${escapeHtml(data.customer.name)}</div>
      </div>
    </div>
  </header>

  <div class="body">
    <section class="parties">
      <div>
        <div class="party-label">Avsändare</div>
        <div class="party-name">${escapeHtml(data.business.name)}</div>
        ${data.business.address ? `<div class="party-line">${escapeHtml(data.business.address)}</div>` : ''}
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
    ${data.quote.description ? `<p class="quote-sub">${escapeHtml(data.quote.description)}</p>` : data.quote.introductionText ? `<p class="quote-sub">${escapeHtml(data.quote.introductionText)}</p>` : ''}

    <div class="items">
      <div class="items-head">
        <div>Beskrivning</div>
        <div class="num">Antal</div>
        <div class="num">Á-pris</div>
        <div class="num">Summa</div>
      </div>
      ${itemsHtml}
    </div>

    <div class="totals-grid">
      <div class="terms-card">
        <h3>Villkor &amp; garanti</h3>
        <p><strong>Giltighet.</strong> Offerten gäller till ${escapeHtml(data.quote.validUntilDate)}. Tilläggsarbete debiteras enligt löpande räkning efter skriftligt godkännande.</p>
        ${data.quote.warrantyText ? `<p><strong>Garanti.</strong> ${escapeHtml(data.quote.warrantyText)}</p>` : ''}
        ${data.quote.notIncluded ? `<p><strong>Ej inkluderat.</strong> ${escapeHtml(data.quote.notIncluded)}</p>` : ''}
      </div>
      <div class="totals-stack">
        <div class="total-row sub"><span class="lbl">Summa exkl. moms</span><span class="val">${formatCurrency(data.quote.subtotalExVat)}</span></div>
        <div class="total-row sub"><span class="lbl">Moms 25%</span><span class="val">${formatCurrency(data.quote.vatAmount)}</span></div>
        <div class="total-row sub"><span class="lbl">Summa inkl. moms</span><span class="val">${formatCurrency(data.quote.totalIncVat)}</span></div>
        ${rotRow}
        ${rutRow}
        <div class="total-grand"><span class="lbl">Att betala</span><span class="val">${formatCurrency(data.quote.amountToPay)}</span></div>
      </div>
    </div>

    <div class="pay-row">
      ${data.business.bankgiro ? `<div class="pay-card"><div class="l">Bankgiro</div><div class="v">${escapeHtml(data.business.bankgiro)}</div><div class="s">Faktura skickas vid avslut</div></div>` : ''}
      ${data.business.swish ? `<div class="pay-card"><div class="l">Swish företag</div><div class="v">${escapeHtml(data.business.swish)}</div><div class="s">Ange offertnummer i meddelandet</div></div>` : ''}
      <div class="pay-card"><div class="l">Betalningsvillkor</div><div class="v">${escapeHtml(data.quote.paymentTerms)}</div><div class="s">8% dröjsmålsränta från förfallodatum</div></div>
    </div>
  </div>

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

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toLocaleString('sv-SE', { maximumFractionDigits: 2 })
}
