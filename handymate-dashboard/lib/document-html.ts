/**
 * Delad CSS och hjälpfunktioner för HTML-dokumentgenerering
 * (Offert, Faktura, Tidrapport)
 *
 * Designspråk: rent, vitt, minimalistiskt med subtil teal-accent.
 * Se referensfiler: handymate-offert.html, handymate-faktura.html, handymate-tidrapport.html
 */

// ── Design tokens ──────────────────────────────────────────────
export const ACCENT = '#0F766E'
export const SEPARATOR = '#F1F5F9'
export const BORDER = '#E2E8F0'
export const LABEL_COLOR = '#CBD5E1'
export const TEXT_PRIMARY = '#1E293B'
export const TEXT_SECONDARY = '#94A3B8'
export const TEXT_MUTED = '#64748B'

// ── Hjälpfunktioner ────────────────────────────────────────────

export function escapeHtml(text: string | null | undefined): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '0 kr'
  return new Intl.NumberFormat('sv-SE', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + ' kr'
}

const SV_MONTHS = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
]

const SV_MONTHS_SHORT = [
  'jan', 'feb', 'mar', 'apr', 'maj', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
]

const SV_WEEKDAYS_SHORT = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör']

/** "13 mars 2026" */
export function formatDateLong(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getDate()} ${SV_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** "Mån 9 mar" */
export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr)
  const weekday = SV_WEEKDAYS_SHORT[d.getDay()]
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${d.getDate()} ${SV_MONTHS_SHORT[d.getMonth()]}`
}

// ── Gemensam bas-CSS ───────────────────────────────────────────

export function getDocumentCSS(): string {
  return `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif; background: #F8FAFC; padding: 40px 20px; color: ${TEXT_PRIMARY}; }
  .page { background: #ffffff; border: 0.5px solid ${BORDER}; border-radius: 12px; padding: 52px 56px; max-width: 740px; margin: 0 auto; font-size: 13px; line-height: 1.6; }

  /* Header */
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 44px; }
  .company-name { font-size: 18px; font-weight: 500; color: ${TEXT_PRIMARY}; }
  .company-org { font-size: 11px; color: ${TEXT_SECONDARY}; margin-top: 2px; }
  .company-sub { font-size: 12px; color: ${TEXT_SECONDARY}; margin-top: 4px; line-height: 1.7; }
  .doc-type { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: ${ACCENT}; font-weight: 500; text-align: right; }
  .doc-number { font-size: 22px; font-weight: 500; color: ${TEXT_PRIMARY}; text-align: right; margin-top: 3px; }

  /* Teal line */
  .teal-line { height: 1px; background: ${ACCENT}; opacity: 0.25; margin-bottom: 36px; }

  /* Meta row */
  .meta-row { display: grid; gap: 28px; margin-bottom: 40px; }
  .meta-row-3 { grid-template-columns: 1fr 1fr 1fr; }
  .meta-row-2 { grid-template-columns: 1fr 1fr; }
  .meta-block .label { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: ${LABEL_COLOR}; margin-bottom: 5px; }
  .meta-block .value { font-size: 13px; color: ${TEXT_PRIMARY}; line-height: 1.7; }
  .meta-block .value.highlight { color: ${ACCENT}; font-weight: 500; }

  /* Section title */
  .section-title { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: ${LABEL_COLOR}; margin-bottom: 14px; }

  /* Items table */
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
  table.items th { text-align: left; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: ${LABEL_COLOR}; padding: 0 0 12px; font-weight: 400; border-bottom: 0.5px solid ${BORDER}; }
  table.items th.r { text-align: right; }
  table.items td { padding: 12px 0; border-bottom: 0.5px solid ${SEPARATOR}; vertical-align: top; }
  table.items td.r { text-align: right; color: ${TEXT_SECONDARY}; }
  table.items td.amt { text-align: right; color: ${TEXT_PRIMARY}; }
  table.items tr:last-child td { border-bottom: none; }
  .item-name { font-weight: 500; font-size: 13px; color: ${TEXT_PRIMARY}; }
  .item-desc { font-size: 12px; color: ${TEXT_SECONDARY}; margin-top: 2px; }

  /* Heading / text / subtotal / discount rows */
  table.items .heading-row td { font-weight: 500; font-size: 13px; color: ${TEXT_PRIMARY}; padding: 16px 0 8px; border-bottom: 0.5px solid ${BORDER}; }
  table.items .text-row td { font-size: 12px; color: ${TEXT_SECONDARY}; font-style: italic; padding: 8px 0; }
  table.items .subtotal-row td { font-weight: 500; border-top: 0.5px solid ${BORDER}; padding-top: 10px; }
  table.items .discount-row td { color: ${ACCENT}; }

  /* ROT/RUT badges */
  .rot-badge { display: inline-block; font-size: 9px; font-weight: 500; color: ${ACCENT}; background: #CCFBF1; padding: 1px 5px; border-radius: 3px; margin-left: 4px; }
  .rut-badge { display: inline-block; font-size: 9px; font-weight: 500; color: #1d4ed8; background: #dbeafe; padding: 1px 5px; border-radius: 3px; margin-left: 4px; }

  /* Totals */
  .totals { display: flex; justify-content: flex-end; margin-bottom: 36px; }
  .totals-block { width: 230px; }
  .t-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; color: ${TEXT_MUTED}; }
  .t-row.rot { color: ${ACCENT}; }
  .t-row.final { border-top: 0.5px solid ${BORDER}; margin-top: 8px; padding-top: 14px; font-size: 15px; font-weight: 500; color: ${TEXT_PRIMARY}; }

  /* Sign box (offert) */
  .sign-box { border: 0.5px solid ${BORDER}; border-radius: 8px; padding: 18px 22px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 36px; }
  .sign-label { font-size: 12px; color: ${TEXT_SECONDARY}; }
  .sign-link { font-size: 12px; color: ${ACCENT}; margin-top: 3px; }
  .sign-badge { font-size: 11px; background: #CCFBF1; color: ${ACCENT}; padding: 4px 12px; border-radius: 20px; }
  .sign-badge.signed { background: #D1FAE5; color: #047857; }

  /* Swish row (faktura) */
  .swish-row { display: flex; align-items: center; gap: 20px; padding: 20px 24px; background: #F8FAFC; border-radius: 10px; margin-bottom: 36px; }
  .swish-qr { flex-shrink: 0; width: 56px; height: 56px; background: #ffffff; border: 0.5px solid ${BORDER}; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
  .swish-info .label { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: ${LABEL_COLOR}; margin-bottom: 4px; }
  .swish-info .val { font-size: 14px; color: ${TEXT_PRIMARY}; font-weight: 500; }
  .swish-info .sub { font-size: 12px; color: ${TEXT_SECONDARY}; margin-top: 1px; }
  .swish-amount { margin-left: auto; text-align: right; }
  .swish-amount .big { font-size: 22px; font-weight: 500; color: ${TEXT_PRIMARY}; }
  .swish-amount .due { font-size: 12px; color: ${TEXT_SECONDARY}; margin-top: 2px; }

  /* Person block (tidrapport) */
  .person-block { margin-bottom: 28px; }
  .person-header { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 10px; border-bottom: 0.5px solid ${BORDER}; margin-bottom: 0; }
  .person-name { font-size: 14px; font-weight: 500; color: ${TEXT_PRIMARY}; }
  .person-total { font-size: 13px; color: ${TEXT_MUTED}; }

  table.time { width: 100%; border-collapse: collapse; }
  table.time th { text-align: left; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: ${LABEL_COLOR}; padding: 10px 0 8px; font-weight: 400; border-bottom: 0.5px solid ${SEPARATOR}; }
  table.time th.r { text-align: right; }
  table.time td { padding: 10px 0; border-bottom: 0.5px solid ${SEPARATOR}; font-size: 13px; color: ${TEXT_MUTED}; vertical-align: top; }
  table.time td.date { color: ${TEXT_PRIMARY}; font-weight: 500; white-space: nowrap; }
  table.time td.r { text-align: right; }
  table.time td.ot { text-align: right; color: ${LABEL_COLOR}; }
  table.time tr:last-child td { border-bottom: none; }

  /* Summary row (tidrapport) */
  .summary-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: ${BORDER}; border: 0.5px solid ${BORDER}; border-radius: 10px; overflow: hidden; margin: 32px 0; }
  .summary-cell { background: #F8FAFC; padding: 16px 20px; }
  .summary-cell .label { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: ${LABEL_COLOR}; margin-bottom: 6px; }
  .summary-cell .val { font-size: 20px; font-weight: 500; color: ${TEXT_PRIMARY}; }
  .summary-cell .val.teal { color: ${ACCENT}; }

  /* Footer grid */
  .footer-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 28px; padding-top: 28px; border-top: 0.5px solid ${BORDER}; }
  .footer-block .label { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: ${LABEL_COLOR}; margin-bottom: 6px; }
  .footer-block .val { font-size: 12px; color: ${TEXT_MUTED}; line-height: 1.7; }

  /* Extra content sections (offert) */
  .intro-text, .conclusion-text { margin-bottom: 24px; font-size: 13px; color: ${TEXT_MUTED}; line-height: 1.7; white-space: pre-wrap; }
  .not-included { padding: 16px 20px; border: 0.5px solid ${BORDER}; border-radius: 8px; margin-bottom: 24px; }
  .not-included .ni-title { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: ${LABEL_COLOR}; margin-bottom: 8px; }
  .not-included p { font-size: 12px; color: ${TEXT_MUTED}; white-space: pre-wrap; }
  .ata-terms { padding: 16px 20px; border: 0.5px solid ${BORDER}; border-radius: 8px; margin-bottom: 24px; }
  .ata-terms .ata-title { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: ${LABEL_COLOR}; margin-bottom: 8px; }
  .ata-terms p { font-size: 12px; color: ${TEXT_MUTED}; white-space: pre-wrap; }

  /* Payment plan */
  .payment-plan { margin-bottom: 24px; }
  .payment-plan .pp-title { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: ${LABEL_COLOR}; margin-bottom: 14px; }

  /* References */
  .references { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 28px; margin-bottom: 24px; }
  .ref-item { font-size: 12px; color: ${TEXT_MUTED}; }
  .ref-item strong { color: ${TEXT_PRIMARY}; font-weight: 500; }

  /* Images */
  .images { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
  .images img { width: 100%; height: 150px; object-fit: cover; border-radius: 8px; border: 0.5px solid ${BORDER}; }

  /* Print bar */
  .print-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid ${BORDER}; padding: 12px 24px; display: flex; align-items: center; justify-content: center; gap: 12px; z-index: 100; }
  .print-btn { background: ${ACCENT}; color: #fff; border: none; padding: 10px 24px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; }
  .print-btn:hover { opacity: 0.9; }
  .print-btn.secondary { background: #f3f4f6; color: #374151; }
  .print-btn.secondary:hover { background: ${BORDER}; }

  @media print {
    body { padding: 0; background: #fff; }
    .page { border: none; border-radius: 0; padding: 0; max-width: none; }
    .print-bar { display: none; }
  }
  `
}

// ── Rendering-hjälpare ─────────────────────────────────────────

export function renderDocumentHeader(
  companyName: string,
  contactInfo: string,
  docType: string,
  docNumber: string,
  options?: { logoUrl?: string; orgNumber?: string; fSkatt?: boolean }
): string {
  const logoHtml = options?.logoUrl
    ? `<img src="${escapeHtml(options.logoUrl)}" alt="${escapeHtml(companyName)}" style="max-width:120px;max-height:60px;object-fit:contain;margin-bottom:8px;" onerror="this.style.display='none'" />`
    : ''

  const orgLine = [
    options?.orgNumber ? `Org.nr: ${escapeHtml(options.orgNumber)}` : '',
    options?.fSkatt ? 'Godkänd för F-skatt' : '',
  ].filter(Boolean).join(' · ')

  return `
  <div class="doc-header">
    <div>
      ${logoHtml}
      <div class="company-name">${escapeHtml(companyName)}</div>
      ${orgLine ? `<div class="company-org">${orgLine}</div>` : ''}
      <div class="company-sub">${contactInfo}</div>
    </div>
    <div>
      <div class="doc-type">${escapeHtml(docType)}</div>
      <div class="doc-number">${escapeHtml(docNumber)}</div>
    </div>
  </div>`
}

export function renderTealLine(): string {
  return '<div class="teal-line"></div>'
}

export function renderFooterGrid(
  columns: { label: string; value: string }[],
): string {
  return `
  <div class="footer-grid">
    ${columns.map(c => `
    <div class="footer-block">
      <div class="label">${escapeHtml(c.label)}</div>
      <div class="val">${c.value}</div>
    </div>`).join('')}
  </div>`
}

export function wrapInPage(
  title: string,
  cssExtra: string,
  bodyHtml: string,
): string {
  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
${getDocumentCSS()}
${cssExtra}
</style>
</head>
<body>
<div class="print-bar">
  <button class="print-btn secondary" onclick="window.close()">Stäng</button>
  <button class="print-btn" onclick="window.print()">Skriv ut / Spara som PDF</button>
</div>
<div class="page">
${bodyHtml}
</div>
</body>
</html>`
}

/** Build contact info line: "Namn · Tel\nemail · website" */
export function buildContactLine(
  contactName?: string | null,
  phone?: string | null,
  email?: string | null,
  website?: string | null,
): string {
  const parts: string[] = []
  if (contactName) parts.push(escapeHtml(contactName))
  if (phone) {
    if (parts.length > 0) parts[parts.length - 1] += ` &nbsp;&middot;&nbsp; ${escapeHtml(phone)}`
    else parts.push(escapeHtml(phone))
  }
  const line2: string[] = []
  if (email) line2.push(escapeHtml(email))
  if (website) line2.push(escapeHtml(website))
  if (line2.length > 0) parts.push(line2.join(' &nbsp;&middot;&nbsp; '))
  return parts.join('<br>')
}
