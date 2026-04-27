import type { InvoiceTemplateData, InvoiceTemplateRenderFn } from './types'
import { escapeHtml, formatCurrency } from '@/lib/document-html'

/**
 * Friendly faktura — varm, cards + badges, DM Sans.
 * Matchar lib/quote-templates/friendly.ts. Faktura-tillägg: stora "att betala"-
 * refs-strip överst (OCR/Bankgiro/Belopp), late-card med dagar-räknare, badges
 * inkluderar "Dröjsmålsränta tillkommer" om försenad.
 */
export const renderFriendly: InvoiceTemplateRenderFn = (data: InvoiceTemplateData): string => {
  const accent = data.business.accentColor
  const accentDark = darken(accent, 0.20)
  const accent50 = mixWithWhite(accent, 0.94)
  const accent100 = mixWithWhite(accent, 0.85)
  const isOverdue = data.invoice.status === 'overdue'
  const isPaid = data.invoice.status === 'paid'

  const itemsHtml = data.invoice.items.map((item, i) => `
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
  if (data.invoice.rotDeduction) badges.push('<span class="badge rot"><span class="dot"></span>ROT-avdrag tillämpat</span>')
  if (data.invoice.rutDeduction) badges.push('<span class="badge rot"><span class="dot"></span>RUT-avdrag tillämpat</span>')
  badges.push('<span class="badge moms"><span class="dot"></span>Moms 25% ingår</span>')
  if (isOverdue) badges.push('<span class="badge late"><span class="dot"></span>Dröjsmålsränta tillkommer</span>')
  if (isPaid) badges.push('<span class="badge rot"><span class="dot"></span>Betald</span>')

  const rotRow = data.invoice.rotDeduction
    ? `<div class="total-row rot"><span class="lbl">ROT-avdrag (30% av arbete)</span><span class="val">−${formatCurrency(data.invoice.rotDeduction)}</span></div>`
    : ''
  const rutRow = data.invoice.rutDeduction
    ? `<div class="total-row rot"><span class="lbl">RUT-avdrag (50% av arbete)</span><span class="val">−${formatCurrency(data.invoice.rutDeduction)}</span></div>`
    : ''
  const lateRow = data.invoice.lateInterest
    ? `<div class="total-row late"><span class="lbl">Dröjsmålsränta (${data.invoice.lateInterestRate}% från förfallodatum)</span><span class="val">+ ${formatCurrency(data.invoice.lateInterest)}</span></div>`
    : ''
  const reminderRow = data.invoice.reminderFee
    ? `<div class="total-row late"><span class="lbl">Påminnelseavgift</span><span class="val">+ ${formatCurrency(data.invoice.reminderFee)}</span></div>`
    : ''

  const statusPill = (() => {
    if (isPaid) return `<span class="status-pill paid"><span class="dot"></span>Betald</span>`
    if (isOverdue) return `<span class="status-pill"><span class="dot"></span>Försenad</span>`
    return ''
  })()

  const ocrFmt = formatOcr(data.invoice.ocrNumber)

  const lateNotice = isOverdue
    ? `
    <section class="late-card">
      <div class="icon">!</div>
      <div class="body-text">
        <div class="title">Fakturan är försenad — vänligen betala omgående</div>
        <div class="text">Förfallodatum passerades ${escapeHtml(data.invoice.dueDate)}. Dröjsmålsränta ${data.invoice.lateInterestRate}% tillkommer per dag. Påminnelseavgift 60 kr utgår vid utebliven betalning.</div>
      </div>
      <div class="days">${data.invoice.daysOverdue}<small>dagar sen</small></div>
    </section>`
    : ''

  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Faktura ${escapeHtml(data.invoice.number)} · ${escapeHtml(data.business.name)}</title>
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
  --danger: #DC2626;
  --danger-bg: #FEE2E2;
  --danger-50: #FEF2F2;
  --ink: #0F172A;
  --muted: #64748B;
  --paper: #FFFFFF;
  --bg: #F1F5F9;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'DM Sans', system-ui, sans-serif; background: #E5E7EB; color: var(--ink); -webkit-font-smoothing: antialiased; line-height: 1.55; padding: 32px 16px; }
.page { width: 210mm; min-height: 297mm; margin: 0 auto; background: var(--bg); box-shadow: 0 16px 40px rgba(15,23,42,0.10); display: flex; flex-direction: column; padding: 14mm; gap: 12px; }
.header { background: linear-gradient(135deg, var(--teal) 0%, var(--teal-dark) 100%); border-radius: 16px; padding: 22px 26px; color: #fff; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 8px 24px rgba(15,118,110,0.18); position: relative; overflow: hidden; }
.header::after { content: ''; position: absolute; top: -40px; right: -40px; width: 180px; height: 180px; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,0.12), transparent 70%); }
.brand { display: flex; align-items: center; gap: 14px; position: relative; }
.brand-mark { width: 52px; height: 52px; border-radius: 14px; background: rgba(255,255,255,0.18); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 24px; color: #fff; overflow: hidden; }
.brand-mark img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
.brand-name { font-weight: 700; font-size: 20px; letter-spacing: -0.01em; }
.brand-sub { font-size: 12px; color: rgba(255,255,255,0.75); margin-top: 2px; }
.doc-meta { text-align: right; position: relative; }
.doc-label-row { display: flex; align-items: center; gap: 10px; justify-content: flex-end; }
.doc-label { font-size: 11px; color: rgba(255,255,255,0.7); font-weight: 500; }
.status-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; background: rgba(254,226,226,0.95); color: #991B1B; }
.status-pill .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--danger); }
.status-pill.paid { background: rgba(220,252,231,0.95); color: #166534; }
.status-pill.paid .dot { background: var(--green); }
.doc-number { font-weight: 800; font-size: 26px; letter-spacing: -0.02em; margin-top: 4px; }
.doc-dates { font-size: 12px; color: rgba(255,255,255,0.85); margin-top: 6px; line-height: 1.7; }
.doc-dates .due-overdue { color: #FECACA; font-weight: 600; }
.card { background: var(--paper); border-radius: 14px; padding: 18px 22px; box-shadow: 0 2px 6px rgba(15,23,42,0.04), 0 0 0 1px rgba(15,23,42,0.04); }
.card-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: var(--teal); margin-bottom: 10px; }
.parties { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.party-name { font-weight: 700; font-size: 16px; color: var(--ink); }
.party-line { font-size: 13px; color: var(--ink); margin-top: 2px; }
.party-meta { font-size: 12px; color: var(--muted); margin-top: 4px; line-height: 1.6; }
.refs-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.ref-card { padding: 14px 18px; }
.ref-card .l { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); }
.ref-card .v { font-weight: 800; font-size: 17px; color: var(--ink); margin-top: 4px; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
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
.badge.late { background: var(--danger-bg); color: #991B1B; }
.badge.late .dot { background: var(--danger); }
.late-card { background: linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%); border: 1px solid #FECACA; border-radius: 14px; padding: 16px 20px; display: grid; grid-template-columns: 44px 1fr auto; gap: 14px; align-items: center; }
.late-card .icon { width: 44px; height: 44px; border-radius: 12px; background: var(--danger); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 22px; }
.late-card .body-text .title { font-weight: 700; font-size: 14px; color: #991B1B; }
.late-card .body-text .text { font-size: 12px; color: #7F1D1D; line-height: 1.5; margin-top: 2px; }
.late-card .days { font-weight: 800; font-size: 28px; color: var(--danger); line-height: 1; letter-spacing: -0.02em; text-align: right; }
.late-card .days small { display: block; font-size: 10px; font-weight: 600; color: #991B1B; margin-top: 4px; letter-spacing: 0.05em; }
.items-section .card-title { margin-bottom: 14px; }
.items-grid { display: flex; flex-direction: column; gap: 8px; }
.item-card { display: grid; grid-template-columns: 36px 1fr auto; gap: 14px; align-items: flex-start; padding: 12px 16px; background: var(--bg); border-radius: 12px; border: 1px solid rgba(15,23,42,0.04); }
.item-num { width: 30px; height: 30px; border-radius: 50%; background: var(--teal-100); color: var(--teal-dark); font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.item-body .name { font-weight: 600; color: var(--ink); font-size: 14px; }
.item-body .desc { color: var(--muted); font-size: 12px; line-height: 1.5; margin-top: 2px; }
.item-body .qty { color: var(--muted); font-size: 11px; margin-top: 4px; font-weight: 500; }
.item-amt { text-align: right; font-weight: 700; color: var(--ink); font-size: 14px; font-variant-numeric: tabular-nums; white-space: nowrap; align-self: center; }
.totals-card { padding: 20px 24px; }
.totals-rows { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.total-row { display: flex; justify-content: space-between; font-size: 13px; }
.total-row .lbl { color: var(--muted); }
.total-row .val { font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; white-space: nowrap; }
.total-row.rot { background: var(--green-bg); padding: 10px 12px; border-radius: 8px; margin: 4px 0 0; }
.total-row.rot .lbl { color: #166534; font-weight: 600; }
.total-row.rot .val { color: #166534; }
.total-row.late { background: var(--danger-bg); padding: 10px 12px; border-radius: 8px; margin: 4px 0 0; }
.total-row.late .lbl { color: #991B1B; font-weight: 600; }
.total-row.late .val { color: #991B1B; }
.grand-card { background: linear-gradient(135deg, var(--teal) 0%, var(--teal-dark) 100%); border-radius: 12px; padding: 18px 24px; color: #fff; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 6px 20px rgba(15,118,110,0.18); }
.grand-card .lbl { font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.8); text-transform: uppercase; letter-spacing: 0.12em; }
.grand-card .val { font-weight: 800; font-size: 32px; letter-spacing: -0.02em; white-space: nowrap; }
.pay-row { display: grid; grid-template-columns: 1.2fr 1.2fr 1fr; gap: 10px; }
.pay-card { display: flex; align-items: center; gap: 14px; padding: 14px 18px; }
.pay-icon { width: 44px; height: 44px; border-radius: 12px; background: var(--teal-100); color: var(--teal); display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; }
.pay-card .l { font-size: 11px; color: var(--muted); font-weight: 500; }
.pay-card .v { font-weight: 700; color: var(--ink); font-size: 15px; }
.swish-card { padding: 12px; display: flex; align-items: center; gap: 12px; }
.swish-card img { width: 64px; height: 64px; border: 1px solid var(--teal-100); border-radius: 8px; padding: 4px; background: #fff; }
.footer-card { padding: 14px 22px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.footer-card .l { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); margin-bottom: 2px; }
.footer-card .v { color: var(--ink); font-weight: 600; font-size: 12px; }
.terms { font-size: 11px; color: var(--muted); padding: 0 8px; line-height: 1.6; }
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
      <div class="doc-label-row">
        <span class="doc-label">${data.invoice.isCreditNote ? 'Kreditfaktura' : 'Faktura'}</span>
        ${statusPill}
      </div>
      <div class="doc-number">${escapeHtml(data.invoice.number)}</div>
      <div class="doc-dates">
        Fakturadatum ${escapeHtml(data.invoice.invoiceDate)}<br/>
        ${isPaid && data.invoice.paidDate
          ? `Betald ${escapeHtml(data.invoice.paidDate)}`
          : isOverdue
            ? `<span class="due-overdue">Förfallodatum ${escapeHtml(data.invoice.dueDate)} · ${data.invoice.daysOverdue} dagar försenad</span>`
            : `Förfallodatum ${escapeHtml(data.invoice.dueDate)}`}
      </div>
    </div>
  </header>

  <section class="refs-row">
    <div class="card ref-card">
      <div class="l">OCR-nummer</div>
      <div class="v">${escapeHtml(ocrFmt)}</div>
    </div>
    <div class="card ref-card">
      <div class="l">${data.business.bankgiro ? 'Bankgiro' : data.business.plusgiro ? 'Plusgiro' : 'Förfaller'}</div>
      <div class="v">${escapeHtml(data.business.bankgiro || data.business.plusgiro || data.invoice.dueDate)}</div>
    </div>
    <div class="card ref-card">
      <div class="l">Att betala</div>
      <div class="v">${formatCurrency(data.invoice.amountToPay)}</div>
    </div>
  </section>

  ${lateNotice}

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
    <div class="quote-title">${escapeHtml(data.invoice.title)}</div>
    ${data.invoice.description ? `<p class="quote-sub">${escapeHtml(data.invoice.description)}</p>` : ''}
    <div class="badges">${badges.join('')}</div>
  </section>

  <section class="card items-section">
    <div class="card-title">${data.invoice.isCreditNote ? 'Vad krediteras' : 'Vad som utförts'}</div>
    <div class="items-grid">${itemsHtml}</div>
  </section>

  <section class="card totals-card">
    <div class="card-title">Summering</div>
    <div class="totals-rows">
      <div class="total-row"><span class="lbl">Summa exkl. moms</span><span class="val">${formatCurrency(data.invoice.subtotalExVat)}</span></div>
      <div class="total-row"><span class="lbl">Moms ${data.invoice.vatRate}%</span><span class="val">${formatCurrency(data.invoice.vatAmount)}</span></div>
      <div class="total-row"><span class="lbl">Summa inkl. moms</span><span class="val">${formatCurrency(data.invoice.totalIncVat)}</span></div>
      ${rotRow}
      ${rutRow}
      ${lateRow}
      ${reminderRow}
    </div>
    <div class="grand-card">
      <div>
        <div class="lbl">Att betala</div>
        ${(data.invoice.rotDeduction || data.invoice.rutDeduction || data.invoice.lateInterest) ? `<div style="font-size: 11px; opacity: 0.75; margin-top: 4px;">${data.invoice.lateInterest ? 'Inkl. dröjsmålsränta' : 'Efter avdrag'}</div>` : ''}
      </div>
      <div class="val">${formatCurrency(data.invoice.amountToPay)}</div>
    </div>
  </section>

  ${!isPaid ? `
  <section class="pay-row">
    ${data.business.bankgiro ? `<div class="card pay-card"><div class="pay-icon">BG</div><div><div class="l">Bankgiro · ${escapeHtml(data.invoice.paymentTerms)}</div><div class="v">${escapeHtml(data.business.bankgiro)}</div></div></div>` : ''}
    <div class="card pay-card"><div class="pay-icon" style="background:#FEF3C7; color:var(--amber);">#</div><div><div class="l">OCR-referens</div><div class="v">${escapeHtml(ocrFmt)}</div></div></div>
    ${data.business.swish && data.swishQrDataUrl
      ? `<div class="card swish-card"><img src="${data.swishQrDataUrl}" alt="Swish QR" /><div><div class="l">Swish · skanna</div><div class="v">${escapeHtml(data.business.swish)}</div></div></div>`
      : data.business.swish
        ? `<div class="card pay-card"><div class="pay-icon" style="background:#EE3A88;color:#fff;">S</div><div><div class="l">Swish</div><div class="v">${escapeHtml(data.business.swish)}</div></div></div>`
        : ''}
  </section>` : ''}

  <p class="terms">
    Betalningsvillkor ${escapeHtml(data.invoice.paymentTerms)}. Vid försenad betalning tillkommer dröjsmålsränta enligt räntelagen samt påminnelseavgift om 60 kr. ${data.invoice.rotDeduction ? 'ROT-avdraget förutsätter Skatteverkets godkännande; vid avslag faktureras mellanskillnaden separat. ' : ''}Reklamation ska ske inom 10 dagar från fakturadatum.${data.invoice.conclusionText ? '<br/><br/>' + escapeHtml(data.invoice.conclusionText) : ''}
  </p>

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

function formatOcr(ocr: string): string {
  const digits = (ocr || '').replace(/\D/g, '')
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim() || ocr
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
