/**
 * Kundmailens masterlayout + byggblock — Claude Designs "Kundmail"
 * (docs/design/briefs/01-kundmailen.md), intagen 2026-09-07.
 *
 * Varumärkeslagret: ALLA kundvända mail (offert, signeringsbekräftelse,
 * faktura, påminnelse, slutrapport, portalnotiser, automationsmail, nurture)
 * renderas genom emailLayout() nedan med ett Branding-objekt från
 * lib/branding/get-branding.ts. Ingen mailväg bygger sitt eget <html>-skal.
 *
 * Designens regler, som blocken nedan bär:
 *  - Vitt kort på ljusgrå duk, 4 px accentlist överst, vitt sidhuvud med
 *    logotyp/firmanamn till vänster och dokumentreferens till höger.
 *  - Accentfärgen används på exakt tre ställen: listen, primärknappen och
 *    textlänken. Allt annat är neutralt — det är så en okänd accent aldrig
 *    kan förstöra läsbarheten.
 *  - ROT/RUT är alltid preliminärt (grön pill + "Skatteverket fastställer").
 *  - font-family upprepas på varje td (Outlook tappar arvet), varje cell
 *    sätter egen bakgrund + färg (mörkt läge i mailklienter).
 *  - Stämpeln (attribution) kommer ENBART från
 *    lib/branding/attribution.ts — aldrig som klartext här.
 */

import { extractFirstName, halsning } from '@/lib/customers/namn'
import { buildAttribution, attributionEmailHtml, type Attribution } from '@/lib/branding/attribution'
import { DEFAULT_ACCENT_COLOR, normalizeAccentColor } from '@/lib/branding/get-branding'

export interface BusinessBranding {
  businessName: string
  accentColor?: string
  logoUrl?: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  orgNumber?: string
  swishNumber?: string
  bankgiro?: string
  /**
   * Handymate-stämpeln i foten (lib/branding/attribution.ts). Utelämnad
   * → texten utan länk. Anropare med business_id laddar via loadBranding/
   * loadAttribution så ordet Handymate länkar till företagets rekommendationssida.
   */
  attribution?: Attribution
}

// ── Palett (designens neutraler — delas av alla block) ─────────

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const HEAD = '#0f172a'   // rubriker, belopp, starka värden
const INK = '#1e293b'
const SLATE = '#334155'  // lead, sekundärknapp
const BODY = '#475569'
const MUTED = '#64748b'
const FAINT = '#94a3b8'
const LINE = '#e2e8f0'
const PANEL = '#f8fafc'
const CANVAS = '#eef2f6'
const GREEN = '#15803d'
const GREEN_BG = '#f0fdf4'
const GREEN_LINE = '#bbf7d0'

/** Text → HTML-säker (för fält som interpoleras i layouten/blocken). */
export function escapeEmailText(text: string | null | undefined): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
const esc = escapeEmailText

/** Ett innehållsblock — egen tabell med padding så mailklienter håller avstånden. */
export function emailSection(inner: string, padding = '24px 24px 0'): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:${padding};font-family:${FONT};">${inner}</td></tr></table>`
}
const section = emailSection

/** Liten versal etikett ("DU BETALAR", "VAD HÄNDER NU"). */
function eyebrow(text: string): string {
  return `<div style="font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:${MUTED};">${text}</div>`
}

// ── Masterlayout ───────────────────────────────────────────────

export type EmailLayoutOptions = {
  /** Högerställd referens i sidhuvudet: "Offert OF-2026-0142", "Faktura F-1023". */
  meta?: string
  /** Portalnotisens lätta variant: mindre sidhuvud, enradig sidfot. */
  compact?: boolean
  /** HTML ovanför sidfotens företagsrad (t.ex. avregistreringslänk). */
  footerExtra?: string
  /** Dold förhandsvisningstext i inkorgen. */
  preheader?: string
}

/**
 * Accentlist + vitt sidhuvud (logotyp/firmanamn + referens) + innehåll +
 * sidfot med företagets uppgifter och stämpeln. Alla mail till kund går
 * härigenom. Tredje argumentet får vara en sträng (footerExtra) för äldre
 * anropare.
 */
export function emailLayout(branding: BusinessBranding, content: string, options?: string | EmailLayoutOptions): string {
  const opts: EmailLayoutOptions = typeof options === 'string' ? { footerExtra: options } : (options ?? {})
  const accent = normalizeAccentColor(branding.accentColor)
  const compact = Boolean(opts.compact)
  const name = esc(branding.businessName || 'Handymate')
  const phone = esc(branding.contactPhone)
  const email = esc(branding.contactEmail)
  const logo = branding.logoUrl && /^https?:\/\//i.test(branding.logoUrl) ? esc(branding.logoUrl) : ''

  const brandCell = logo
    ? `<img src="${logo}" alt="${name}" style="display:block;max-height:${compact ? 32 : 40}px;width:auto;border:0;">`
    : `<div style="font-size:${compact ? 16 : 18}px;font-weight:700;color:${HEAD};letter-spacing:-.01em;">${name}</div>`
  const metaCell = !compact && opts.meta
    ? `<td style="vertical-align:middle;text-align:right;font-size:13px;color:${MUTED};white-space:nowrap;font-family:${FONT};">${esc(opts.meta)}</td>`
    : ''
  const header = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:middle;font-family:${FONT};">${brandCell}</td>${metaCell}</tr></table>`

  const stamp = attributionEmailHtml(branding.attribution ?? buildAttribution(null))
  let footer: string
  if (compact) {
    footer = `<td style="padding:14px 24px;background:${PANEL};border-top:1px solid ${LINE};text-align:center;font-size:12px;line-height:1.6;color:${MUTED};font-family:${FONT};">
              ${opts.footerExtra || ''}
              <strong style="color:${SLATE};">${name}</strong>${phone ? ` · ${phone}` : ''}
              ${stamp}
            </td>`
  } else {
    const rad1 = [`<strong style="color:${SLATE};">${name}</strong>`, branding.orgNumber ? `Org.nr ${esc(branding.orgNumber)}` : ''].filter(Boolean).join(' · ')
    const rad2 = [email, phone].filter(Boolean).join(' · ')
    const rad3 = [
      branding.swishNumber ? `Swish ${esc(branding.swishNumber)}` : '',
      branding.bankgiro ? `Bankgiro ${esc(branding.bankgiro)}` : '',
    ].filter(Boolean).join(' · ')
    footer = `<td style="padding:22px 24px;background:${PANEL};border-top:1px solid ${LINE};text-align:center;font-size:12px;line-height:1.6;color:${MUTED};font-family:${FONT};">
              ${opts.footerExtra || ''}
              ${[rad1, rad2, rad3].filter(Boolean).join('<br>')}
              ${stamp}
            </td>`
  }

  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${CANVAS};">${esc(opts.preheader)}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${name}</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS};-webkit-text-size-adjust:100%;font-family:${FONT};">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;border-collapse:separate;overflow:hidden;">
          <tr><td style="height:4px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:${compact ? '18px 24px' : '20px 24px'};border-bottom:1px solid ${LINE};background:#ffffff;">${header}</td></tr>
          <tr><td style="padding:0 0 28px;background:#ffffff;color:${INK};font-family:${FONT};">
            ${content}
          </td></tr>
          <tr>${footer}</tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ── Byggblock: text ────────────────────────────────────────────

/** Titel (22/700) + lead (16) — mailets första block efter sidhuvud/band. */
export function emailHeading(title: string, intro?: string): string {
  return section(
    `<div style="font-size:22px;line-height:1.25;font-weight:700;letter-spacing:-.01em;color:${HEAD};">${title}</div>` +
    (intro ? `<p style="margin:10px 0 0;font-size:16px;line-height:1.5;color:${SLATE};">${intro}</p>` : ''),
    '28px 24px 0',
  )
}

/** Brödtextstycke (15/1.55). muted → 13 px grå bisats. */
export function emailParagraph(html: string, options?: { muted?: boolean }): string {
  return options?.muted
    ? section(`<p style="margin:0;font-size:13px;line-height:1.55;color:${MUTED};">${html}</p>`, '12px 24px 0')
    : section(`<p style="margin:0;font-size:15px;line-height:1.55;color:${BODY};">${html}</p>`, '12px 24px 0')
}

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'strong' | 'danger'

const BAND: Record<StatusTone, { bg: string; fg: string }> = {
  success: { bg: GREEN_BG, fg: GREEN },
  neutral: { bg: '#f1f5f9', fg: SLATE },
  info: { bg: '#f1f5f9', fg: SLATE },
  warning: { bg: '#fffbeb', fg: '#92400e' },
  strong: { bg: SLATE, fg: '#ffffff' },
  danger: { bg: '#fef2f2', fg: '#991b1b' },
}

/** Statusband direkt under sidhuvudet ("Offerten är godkänd", "Påminnelse 2 · förfallen …"). */
export function statusBand(text: string, tone: StatusTone = 'neutral'): string {
  const t = BAND[tone]
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:10px 24px;background:${t.bg};color:${t.fg};font-size:13px;font-weight:600;border-bottom:1px solid ${LINE};font-family:${FONT};">${esc(text)}</td></tr></table>`
}

// ── Byggblock: belopp ──────────────────────────────────────────

/** Grön pill "PRELIMINÄRT ROT −18 000 KR" — samma på offert, faktura och kvitto. */
function rotPill(type: string, deduction: number): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid ${GREEN_LINE};background:${GREEN_BG};font-size:11px;font-weight:600;color:${GREEN};letter-spacing:.04em;text-transform:uppercase;vertical-align:middle;">Preliminärt ${esc(type.toUpperCase())} −${formatKr(deduction)}</span>`
}

/**
 * Den stora siffran: etikett, belopp (36 px), ev. förfallorad, totalrad med
 * preliminär ROT/RUT-pill och en bisats ("Giltig till 21 september").
 */
export function amountBlock(opts: {
  label: string
  amount: number | string
  /** Totalt inkl. moms — visas när beloppet är efter avdrag. */
  total?: number
  rot?: { type: string; deduction: number } | null
  /** "Förfaller <strong>30 september</strong>" — fakturans rad direkt under beloppet. */
  due?: string
  sub?: string
}): string {
  const amount = typeof opts.amount === 'number' ? formatKr(opts.amount) : opts.amount
  const totalRad = opts.total != null || opts.rot
    ? `<div style="margin-top:8px;font-size:14px;color:${BODY};line-height:1.7;">${opts.total != null ? `Totalt ${formatKr(opts.total)} inkl. moms` : ''}${opts.rot ? ` &nbsp;${rotPill(opts.rot.type, opts.rot.deduction)}` : ''}</div>`
    : ''
  return section(
    eyebrow(opts.label) +
    `<div style="font-size:36px;line-height:1.1;font-weight:700;letter-spacing:-.02em;color:${HEAD};margin-top:6px;">${amount}</div>` +
    (opts.due ? `<div style="margin-top:8px;font-size:15px;color:${INK};">Förfaller <strong>${opts.due}</strong></div>` : '') +
    totalRad +
    (opts.sub ? `<div style="margin-top:6px;font-size:14px;color:${BODY};">${opts.sub}</div>` : ''),
  )
}

/** Äldre signatur — etikett + färdigformaterat belopp + bisats. */
export function amountHero(label: string, value: string, note?: string): string {
  return amountBlock({ label, amount: value, sub: note })
}

export type SummaryRow = {
  label: string
  value: string
  /** Slutraden ("Att betala"/"Du betalar") — 16/700, utan linje. */
  emphasis?: boolean
  /** Avdragsrad — grön, för preliminärt ROT/RUT. */
  deduction?: boolean
  /** Delsummering ("Totalt inkl. moms") — halvfet. */
  total?: boolean
}

/**
 * Summeringstabell (Delsumma / Moms / Totalt / Prel. ROT / Att betala).
 * Raden före slutraden får den tjocka linjen, slutraden ingen.
 */
export function summaryTable(rows: SummaryRow[]): string {
  const body = rows.map((r, i) => {
    if (r.emphasis) {
      return `<tr>
          <td style="padding:12px 0 0;font-size:16px;font-weight:700;color:${HEAD};font-family:${FONT};">${r.label}</td>
          <td align="right" style="padding:12px 0 0;font-size:16px;font-weight:700;color:${HEAD};white-space:nowrap;font-family:${FONT};">${r.value}</td>
        </tr>`
    }
    const last = i === rows.length - 1
    const border = last ? '' : rows[i + 1]?.emphasis ? `border-bottom:1.5px solid ${HEAD};` : `border-bottom:1px solid ${LINE};`
    const labelColor = r.deduction ? GREEN : r.total ? HEAD : BODY
    const valueColor = r.deduction ? GREEN : HEAD
    const weight = r.total ? 'font-weight:600;' : ''
    return `<tr>
          <td style="padding:9px 0;${border}${weight}color:${labelColor};font-family:${FONT};">${r.label}</td>
          <td align="right" style="padding:9px 0;${border}${weight}color:${valueColor};white-space:nowrap;font-family:${FONT};">${r.value}</td>
        </tr>`
  }).join('')
  return section(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;font-family:${FONT};">${body}</table>`)
}

/** Kort med rubrik + små summeringsrader (bekräftelsen: "Badrumsrenovering · Offert OF-…"). */
export function summaryCard(opts: { title: string; sub?: string; rows: SummaryRow[] }): string {
  const body = opts.rows.map((r) => {
    if (r.emphasis) {
      return `<tr><td style="padding:8px 0 0;border-top:1px solid ${LINE};font-weight:700;color:${HEAD};font-family:${FONT};">${r.label}</td><td align="right" style="padding:8px 0 0;border-top:1px solid ${LINE};font-weight:700;color:${HEAD};white-space:nowrap;font-family:${FONT};">${r.value}</td></tr>`
    }
    const color = r.deduction ? GREEN : BODY
    return `<tr><td style="padding:5px 0;color:${color};font-family:${FONT};">${r.label}</td><td align="right" style="padding:5px 0;color:${r.deduction ? GREEN : HEAD};white-space:nowrap;font-family:${FONT};">${r.value}</td></tr>`
  }).join('')
  return section(
    `<div style="border:1px solid ${LINE};border-radius:10px;padding:14px 16px;">` +
    `<div style="font-size:15px;font-weight:600;color:${HEAD};">${opts.title}</div>` +
    (opts.sub ? `<div style="margin-top:2px;font-size:13px;color:${MUTED};">${opts.sub}</div>` : '') +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;font-size:14px;font-family:${FONT};">${body}</table>` +
    `</div>`,
  )
}

/** Kvittokort (betald faktura): eyebrow, stort belopp, rader med linjer. */
export function receiptCard(opts: { amount: number; rows: Array<{ label: string; value: string }>; eyebrow?: string }): string {
  const rows = opts.rows.filter((r) => r.value).map((r) =>
    `<tr><td style="padding:6px 0;border-top:1px solid ${LINE};color:${BODY};font-family:${FONT};">${r.label}</td><td align="right" style="padding:6px 0;border-top:1px solid ${LINE};color:${HEAD};white-space:nowrap;font-family:${FONT};">${r.value}</td></tr>`,
  ).join('')
  return section(
    `<div style="border:1px solid ${LINE};border-radius:10px;padding:16px 18px;">` +
    eyebrow(opts.eyebrow ?? 'Belopp') +
    `<div style="font-size:30px;line-height:1.1;font-weight:700;letter-spacing:-.02em;color:${HEAD};margin-top:4px;">${formatKr(opts.amount)}</div>` +
    (rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;font-size:14px;font-family:${FONT};">${rows}</table>` : '') +
    `</div>`,
  )
}

// ── Byggblock: paneler och handlingar ──────────────────────────

/**
 * Infoblock på ljusgrå panel. Kort form: "<strong>Titel.</strong> text".
 * Med cta → den större varianten (rubrikrad, stycke, knapp) — "Vi behöver
 * uppgifter innan fakturan".
 */
export function infoBlock(title: string, bodyHtml: string, opts?: { cta?: { text: string; url: string }; accent?: string }): string {
  if (opts?.cta) {
    return section(
      `<div style="padding:18px 18px 20px;background:${PANEL};border:1px solid ${LINE};border-radius:10px;">` +
      (title ? `<div style="font-size:16px;font-weight:600;color:${HEAD};">${title}</div>` : '') +
      (bodyHtml ? `<p style="margin:6px 0 0;font-size:14px;line-height:1.5;color:${BODY};">${bodyHtml}</p>` : '') +
      `<div style="margin-top:14px;">${ctaButton(opts.cta.text, opts.cta.url, opts.accent)}</div>` +
      `</div>`,
    )
  }
  const lh = bodyHtml.includes('<br') ? '1.7' : '1.5'
  return section(
    `<div style="padding:14px 16px;background:${PANEL};border:1px solid ${LINE};border-radius:10px;font-size:14px;line-height:${lh};color:${BODY};">` +
    (title ? `<strong style="color:${INK};">${title}</strong> ` : '') + bodyHtml +
    `</div>`,
  )
}

/** Etikett/värde-rader ("Bankgiro <b>123-4567</b>") för infoblocken — radbrutna eller på en rad. */
export function detailRows(rows: Array<{ label: string; value: string }>, opts?: { inline?: boolean }): string {
  return rows
    .filter((r) => r.value)
    .map((r) => `${r.label} <strong style="color:${HEAD};">${r.value}</strong>`)
    .join(opts?.inline ? ' · ' : '<br>')
}

/** Primär knapp i accentfärgen (vit text — accenten förutsätts bära vit text). */
export function ctaButton(text: string, url: string, color?: string, opts?: { full?: boolean; small?: boolean }): string {
  const bg = color ? normalizeAccentColor(color) : DEFAULT_ACCENT_COLOR
  const pad = opts?.small ? '13px 24px' : '15px 28px'
  const size = opts?.small ? 15 : 16
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;width:${opts?.full ? '100%' : 'auto'};"><tr><td style="background:${bg};border-radius:10px;text-align:center;"><a href="${url}" style="display:block;padding:${pad};font-size:${size}px;font-weight:600;color:#ffffff;text-decoration:none;font-family:${FONT};">${text}</a></td></tr></table>`
}

/** Sekundär knapp — vit med kant ("Visa i kundportalen" bredvid Swish). */
export function secondaryButton(text: string, url: string, opts?: { full?: boolean }): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;width:${opts?.full ? '100%' : 'auto'};"><tr><td style="background:#ffffff;border:1px solid #cbd5e1;border-radius:10px;text-align:center;"><a href="${url}" style="display:block;padding:14px 24px;font-size:15px;font-weight:600;color:${SLATE};text-decoration:none;font-family:${FONT};">${text}</a></td></tr></table>`
}

/** Textlänk i accentfärgen under knapparna ("Ladda ner fakturan (PDF)"). */
export function secondaryLink(text: string, url: string, accent?: string): string {
  const a = normalizeAccentColor(accent)
  return `<div style="margin-top:14px;font-size:14px;"><a href="${url}" style="color:${a};">${text}</a></div>`
}

/** Textlänken som eget block (när den inte hänger under en knapp). */
export function linkBlock(text: string, url: string, accent?: string): string {
  return section(secondaryLink(text, url, accent).replace('margin-top:14px', 'margin-top:0'), '16px 24px 0')
}

/**
 * Mailets handlingsblock: primärknapp + hjälprad + sekundär handling
 * (textlänk, eller knapp med secondaryAsButton).
 */
export function actionBlock(
  cta: { text: string; url: string },
  accent?: string,
  secondary?: { text: string; url: string },
  opts?: { helper?: string; secondaryAsButton?: boolean; full?: boolean; small?: boolean },
): string {
  return section(
    ctaButton(cta.text, cta.url, accent, { full: opts?.full, small: opts?.small }) +
    (opts?.helper ? `<div style="margin-top:12px;font-size:13px;color:${MUTED};">${opts.helper}</div>` : '') +
    (secondary
      ? opts?.secondaryAsButton
        ? `<div style="margin-top:12px;">${secondaryButton(secondary.text, secondary.url, { full: opts?.full })}</div>`
        : secondaryLink(secondary.text, secondary.url, accent)
      : ''),
  )
}

/** "Vad händer nu" — numrerade steg. */
export function steps(items: Array<{ title?: string; body: string }>, label = 'Vad händer nu'): string {
  const rows = items.map((s, i) =>
    `<tr><td style="width:36px;padding:8px 0;vertical-align:top;font-family:${FONT};"><div style="width:26px;height:26px;border-radius:50%;background:#f1f5f9;color:${SLATE};text-align:center;line-height:26px;font-size:13px;font-weight:600;">${i + 1}</div></td>` +
    `<td style="padding:8px 0;vertical-align:top;font-size:15px;line-height:1.5;color:${BODY};font-family:${FONT};">${s.title ? `<strong style="color:${HEAD};">${s.title}</strong> ` : ''}${s.body}</td></tr>`,
  ).join('')
  return section(
    eyebrow(label) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;font-family:${FONT};">${rows}</table>`,
    '28px 24px 0',
  )
}

/** Datumkort (bokning): månad/dag-bricka + rubrik, tid och adress. */
export function dateCard(opts: { date: string | Date; headline: string; time?: string; address?: string }): string {
  const d = opts.date instanceof Date ? opts.date : new Date(opts.date)
  const ok = !Number.isNaN(d.getTime())
  const month = ok ? d.toLocaleDateString('sv-SE', { month: 'short' }).replace(/\.$/, '') : ''
  const day = ok ? String(d.getDate()) : '–'
  return section(
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="width:62px;vertical-align:top;font-family:${FONT};"><table role="presentation" width="62" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:10px;border-collapse:separate;overflow:hidden;text-align:center;">` +
    `<tr><td style="background:${HEAD};color:#ffffff;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;padding:5px 0;font-family:${FONT};">${month}</td></tr>` +
    `<tr><td style="background:#ffffff;font-size:26px;font-weight:700;color:${HEAD};padding:6px 0 8px;font-family:${FONT};">${day}</td></tr></table></td>` +
    `<td style="padding-left:16px;vertical-align:top;font-family:${FONT};"><div style="font-size:20px;line-height:1.25;font-weight:700;color:${HEAD};">${opts.headline}</div>` +
    (opts.time ? `<div style="margin-top:4px;font-size:16px;color:${INK};">${opts.time}</div>` : '') +
    (opts.address ? `<div style="margin-top:4px;font-size:14px;color:${MUTED};">${opts.address}</div>` : '') +
    `</td></tr></table>`,
  )
}

/** Personrad (vem som kommer): initialer i cirkel + namn + roll. */
export function personRow(opts: { name: string; sub?: string; initials?: string }): string {
  const initials = opts.initials ?? opts.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')
  return section(
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="width:48px;vertical-align:middle;font-family:${FONT};"><div style="width:48px;height:48px;border-radius:50%;background:${LINE};color:${BODY};text-align:center;line-height:48px;font-size:15px;font-weight:600;">${initials}</div></td>` +
    `<td style="padding-left:12px;vertical-align:middle;font-family:${FONT};"><div style="font-size:16px;font-weight:600;color:${HEAD};">${opts.name}</div>` +
    (opts.sub ? `<div style="margin-top:2px;font-size:14px;color:${MUTED};">${opts.sub}</div>` : '') +
    `</td></tr></table>`,
  )
}

/** Signaturblock: hälsningsfras, namn, firma · telefon. */
export function signature(businessName: string, contactName?: string, opts?: { closing?: string; phone?: string }): string {
  const closing = opts?.closing ?? 'Vänliga hälsningar'
  const rad2 = contactName
    ? `<br>${businessName}${opts?.phone ? ` · ${opts.phone}` : ''}`
    : opts?.phone ? `<br>${opts.phone}` : ''
  return section(
    `<div style="font-size:15px;line-height:1.55;color:${BODY};">${closing}<br><strong style="color:${HEAD};">${contactName || businessName}</strong>${rad2}</div>`,
    '28px 24px 0',
  )
}

// ── Byggblock: betalning och ROT ───────────────────────────────

/**
 * Swish-deeplink (öppnar appen i mobilen) — betalning med förifyllt belopp
 * och meddelande. Bara siffror i payee; JSON-formatet är Swishs eget.
 */
export function swishDeeplink(swishNumber: string, amount: number, message: string): string {
  const data = {
    version: 1,
    payee: { value: swishNumber.replace(/\D/g, '') },
    amount: { value: Math.round(amount) },
    message: { value: message },
  }
  return `swish://payment?data=${encodeURIComponent(JSON.stringify(data))}`
}

/**
 * Betalblock: "Betala med Swish" som primärknapp (accent) + hjälprad, sedan
 * bankgiro/OCR/förfallodatum på panel. Utan Swish-nummer blir det bara
 * panelen. inline → bankgiro-raden på en rad (påminnelserna).
 */
export function paymentBlock(opts: {
  swishNumber?: string | null
  amount: number
  message: string
  bankgiro?: string | null
  ocr?: string | null
  due?: string
  accent?: string
  inline?: boolean
}): string {
  const swish = (opts.swishNumber ?? '').trim()
  const knapp = swish
    ? section(
        ctaButton('Betala med Swish', swishDeeplink(swish, opts.amount, opts.message), opts.accent, { full: true }) +
        `<div style="margin-top:12px;font-size:13px;color:${MUTED};">Swish ${esc(swish)} · ange <strong style="color:${SLATE};">${esc(opts.message)}</strong> som meddelande</div>`,
      )
    : ''
  const rader = detailRows([
    { label: 'Bankgiro', value: esc(opts.bankgiro) },
    { label: 'OCR', value: esc(opts.ocr) },
    { label: 'Förfallodatum', value: opts.due ?? '' },
  ], { inline: opts.inline })
  return knapp + (rader ? infoBlock('', rader) : '')
}

/**
 * Preliminärt ROT/RUT — sanningsregeln: Skatteverket fastställer; vi lovar
 * aldrig att avdraget sker av sig självt. extra → t.ex. fakturans "Blir
 * avdraget lägre fakturerar vi skillnaden."
 */
export function rotRutNotice(type: string, deduction: number, extra?: string): string {
  const t = esc(type.toUpperCase())
  return infoBlock(
    `${t}-avdraget på ${formatKr(deduction)} är preliminärt.`,
    `Skatteverket fastställer det slutgiltiga beloppet.${extra ? ` ${extra}` : ''}`,
  )
}

// ── Format ─────────────────────────────────────────────────────

/** Belopp i svensk form: "84 500 kr". */
export function formatKr(amount: number | null | undefined): string {
  return `${Math.round(Number(amount) || 0).toLocaleString('sv-SE')} kr`
}

/** Datum i svensk form (2026-09-30) ur ISO/Date; ogiltigt värde returneras som det är. */
export function formatDatum(value: string | Date | null | undefined): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('sv-SE')
}

/** Datum i löptext: "30 september" (med år när det inte är innevarande). */
export function formatDag(value: string | Date | null | undefined, today: Date = new Date()): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const opts: Intl.DateTimeFormatOptions = d.getFullYear() === today.getFullYear()
    ? { day: 'numeric', month: 'long' }
    : { day: 'numeric', month: 'long', year: 'numeric' }
  return d.toLocaleDateString('sv-SE', opts)
}

// ── Färdiga mail (äldre anropare: nurture, auto-generate) ──────

/** Bokningsbekräftelse — datumkortet + ev. vem som kommer. */
export function bookingConfirmationEmail(params: {
  branding: BusinessBranding
  customerName: string
  date: string
  time: string
  address?: string
  notes?: string
  headline?: string
  person?: { name: string; sub?: string }
}): { subject: string; html: string } {
  const subject = `Bokningsbekräftelse: ${params.date} kl ${params.time}`
  const b = params.branding
  const html = emailLayout(b, `
    ${emailHeading(halsning(params.customerName), 'Din bokning är bekräftad. Här är tid och plats.')}
    ${dateCard({ date: params.date, headline: params.headline || 'Vi kommer', time: `kl ${params.time}`, address: params.address })}
    ${params.person ? personRow(params.person) : ''}
    ${params.notes ? infoBlock('', params.notes) : ''}
    ${emailParagraph('Behöver du ändra tiden? Svara på det här mailet eller ring oss.', { muted: true })}
    ${signature(b.businessName, b.contactName, { phone: b.contactPhone })}
  `, { meta: 'Bokning' })
  return { subject, html }
}

/** Fakturamail (auto-generate) — belopp, Swish/bankgiro, portal. */
export function invoiceEmail(params: {
  branding: BusinessBranding
  customerName: string
  invoiceNumber: string
  totalAmount: string
  totalAmountNum?: number
  dueDate: string
  viewUrl?: string
  swishNumber?: string | null
  bankgiro?: string | null
}): { subject: string; html: string } {
  const subject = `Faktura ${params.invoiceNumber} från ${params.branding.businessName}`
  const b = params.branding
  const html = emailLayout(b, `
    ${emailHeading(halsning(params.customerName), `Här kommer fakturan <strong>${params.invoiceNumber}</strong>.`)}
    ${amountBlock({ label: 'Att betala', amount: `${params.totalAmount} kr`, due: formatDag(params.dueDate) })}
    ${paymentBlock({
      // Swish-knappen kräver ett belopp — utan siffra (bara formaterad sträng) hoppas den.
      swishNumber: params.totalAmountNum ? (params.swishNumber ?? b.swishNumber) : null,
      amount: params.totalAmountNum || 0, message: params.invoiceNumber,
      bankgiro: params.bankgiro ?? b.bankgiro, due: formatDag(params.dueDate), accent: b.accentColor,
    })}
    ${params.viewUrl ? section(secondaryButton('Visa i kundportalen', params.viewUrl)) : ''}
    ${signature(b.businessName, b.contactName, { phone: b.contactPhone })}
  `, { meta: `Faktura ${params.invoiceNumber}` })
  return { subject, html }
}

/** Tack efter avslutat jobb + omdömesförfrågan. */
export function jobCompletedEmail(params: {
  branding: BusinessBranding
  customerName: string
  reviewUrl?: string
}): { subject: string; html: string } {
  const subject = `Tack för att du valde ${params.branding.businessName}!`
  const b = params.branding
  const first = extractFirstName(params.customerName)
  const html = emailLayout(b, `
    ${emailHeading(first ? `Tack ${first}!` : 'Tack!', 'Vi hoppas att du är nöjd med arbetet. Det betyder mycket för oss att få förtroendet.')}
    ${params.reviewUrl
      ? `${emailParagraph('Har du en minut? Ett omdöme hjälper fler att hitta oss.')}
         ${actionBlock({ text: 'Lämna ett omdöme', url: params.reviewUrl }, b.accentColor)}`
      : ''}
    ${emailParagraph('Behöver du hjälp med något mer? Hör av dig.')}
    ${signature(b.businessName, b.contactName, { phone: b.contactPhone, closing: 'Tack igen' })}
  `)
  return { subject, html }
}

/** Nurture — fritext med valfri knapp. */
export function nurtureStepEmail(params: {
  branding: BusinessBranding
  subject: string
  message: string
  ctaText?: string
  ctaUrl?: string
}): { subject: string; html: string } {
  const html = emailLayout(params.branding, `
    ${section(`<div style="font-size:15px;line-height:1.55;color:${BODY};">${params.message.replace(/\n/g, '<br>')}</div>`, '28px 24px 0')}
    ${params.ctaText && params.ctaUrl ? actionBlock({ text: params.ctaText, url: params.ctaUrl }, params.branding.accentColor) : ''}
  `)
  return { subject: params.subject, html }
}

/**
 * Helper: Interpolate variables in template strings
 * Replaces {customer_name}, {project_title}, {business_name}, etc.
 */
export function interpolateTemplate(template: string, variables: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '')
  }
  return result
}
