/**
 * Kundmailens masterlayout + mallar. Svenska, responsiv HTML i företagets
 * varumärke.
 *
 * Varumärkeslagret (2026-09-07): ALLA kundvända mail (offert, signerings-
 * bekräftelse, faktura, påminnelse, slutrapport, portalnotiser, automations-
 * mail, nurture) renderas genom emailLayout() nedan med ett Branding-objekt
 * från lib/branding/get-branding.ts. Ingen mailväg bygger längre sitt eget
 * <html>-skal — det är så Claude Designs master ("Kundmailen", docs/design/
 * briefs/01-kundmailen.md) kan bytas in på ett ställe.
 *
 * Byggblocken (summaryTable, statusBand, infoBlock, paymentBlock, ctaButton)
 * är den komponentlista designbriefen ber om — mailen komponerar dem,
 * masterlayouten äger färg och form.
 */

import { extractFirstName, halsning } from '@/lib/customers/namn'
import { buildAttribution, attributionEmailHtml, type Attribution } from '@/lib/branding/attribution'
import { DEFAULT_ACCENT_COLOR, normalizeAccentColor } from '@/lib/branding/get-branding'

export interface BusinessBranding {
  businessName: string
  accentColor?: string
  logoUrl?: string
  contactEmail?: string
  contactPhone?: string
  orgNumber?: string
  /**
   * Handymate-stämpeln i foten (lib/branding/attribution.ts). Utelämnad
   * → texten utan länk. Anropare med business_id laddar via loadBranding/
   * loadAttribution så ordet Handymate länkar till företagets rekommendationssida.
   */
  attribution?: Attribution
}

// ── Palett (neutralerna delas av alla block) ───────────────────

const INK = '#1e293b'
const BODY = '#475569'
const MUTED = '#64748b'
const FAINT = '#94a3b8'
const LINE = '#e2e8f0'
const PANEL = '#f8fafc'

// ── Masterlayout ───────────────────────────────────────────────

/**
 * Sidhuvud (accent, logotyp eller firmanamn) + innehåll + sidfot med
 * företagets uppgifter och stämpeln. Alla mail till kund går härigenom.
 */
export function emailLayout(branding: BusinessBranding, content: string, footerExtra?: string): string {
  const accent = normalizeAccentColor(branding.accentColor)
  const contactLine = [
    branding.orgNumber ? `Org.nr ${branding.orgNumber}` : '',
    branding.contactPhone || '',
    branding.contactEmail || '',
  ].filter(Boolean).join(' · ')

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>${branding.businessName}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding:24px 32px;background:${accent};">
              ${branding.logoUrl
                ? `<img src="${branding.logoUrl}" alt="${branding.businessName}" style="max-height:44px;max-width:220px;display:block;" />`
                : `<h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${branding.businessName}</h1>`
              }
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;color:${INK};">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background:${PANEL};border-top:1px solid ${LINE};">
              ${footerExtra || ''}
              <p style="margin:8px 0 0;font-size:12px;color:${FAINT};line-height:1.6;">
                <strong style="color:${MUTED};">${branding.businessName}</strong>${contactLine ? `<br>${contactLine}` : ''}
              </p>
              ${attributionEmailHtml(branding.attribution ?? buildAttribution(null))}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ── Byggblock ──────────────────────────────────────────────────

/** Primär knapp i accentfärgen (vit text — accenten förutsätts bära vit text). */
export function ctaButton(text: string, url: string, color?: string): string {
  const bg = color ? normalizeAccentColor(color) : DEFAULT_ACCENT_COLOR
  return `<a href="${url}" style="display:inline-block;padding:12px 28px;background:${bg};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">${text}</a>`
}

/** Rubrik + ingress — samma typografi i alla mail. */
export function emailHeading(title: string, intro?: string): string {
  return `
    <h2 style="margin:0 0 8px;color:${INK};font-size:20px;line-height:1.3;">${title}</h2>
    ${intro ? `<p style="margin:0 0 20px;color:${BODY};font-size:15px;line-height:1.6;">${intro}</p>` : ''}`
}

/** Brödtextstycke. */
export function emailParagraph(html: string, options?: { muted?: boolean }): string {
  return options?.muted
    ? `<p style="margin:0 0 16px;color:${FAINT};font-size:13px;line-height:1.6;">${html}</p>`
    : `<p style="margin:0 0 16px;color:${BODY};font-size:15px;line-height:1.6;">${html}</p>`
}

export type SummaryRow = {
  label: string
  value: string
  /** Summeringsraden — fetstil i accentfärg med linje ovanför. */
  emphasis?: boolean
  /** Avdragsrad — grön, för preliminärt ROT/RUT. */
  deduction?: boolean
}

/** Summeringstabell (delsumma, moms, prel. ROT, att betala). */
export function summaryTable(rows: SummaryRow[], accent?: string): string {
  const a = normalizeAccentColor(accent)
  const body = rows.map((r, i) => {
    if (r.emphasis) {
      return `<tr>
          <td style="padding:14px 16px;border-top:2px solid ${a};color:${a};font-size:16px;font-weight:700;">${r.label}</td>
          <td align="right" style="padding:14px 16px;border-top:2px solid ${a};color:${a};font-size:16px;font-weight:700;white-space:nowrap;">${r.value}</td>
        </tr>`
    }
    const color = r.deduction ? '#059669' : BODY
    const border = i === 0 ? '' : `border-top:1px solid ${LINE};`
    return `<tr>
          <td style="padding:10px 16px;${border}color:${color};font-size:14px;">${r.label}</td>
          <td align="right" style="padding:10px 16px;${border}color:${color};font-size:14px;white-space:nowrap;">${r.value}</td>
        </tr>`
  }).join('')
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid ${LINE};border-radius:8px;overflow:hidden;">
        ${body}
      </table>`
}

/** Den stora siffran — "Du betalar" / "Totalt belopp" med etikett och ev. bisats. */
export function amountHero(label: string, value: string, note?: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:${PANEL};border-radius:8px;border:1px solid ${LINE};">
        <tr>
          <td style="padding:16px;">
            <p style="margin:0 0 4px;font-size:13px;color:${MUTED};">${label}</p>
            <p style="margin:0;font-size:26px;font-weight:700;color:${INK};">${value}</p>
            ${note ? `<p style="margin:6px 0 0;font-size:13px;color:${MUTED};">${note}</p>` : ''}
          </td>
        </tr>
      </table>`
}

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const STATUS_TONES: Record<StatusTone, { bg: string; border: string; text: string }> = {
  neutral: { bg: PANEL, border: LINE, text: BODY },
  info: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
  success: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
  warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  danger: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
}

/** Statusband — en rad som sätter tonen (påminnelsenivå, "godkänd", "klar"). */
export function statusBand(text: string, tone: StatusTone = 'neutral'): string {
  const t = STATUS_TONES[tone]
  return `<p style="margin:0 0 20px;padding:10px 14px;background:${t.bg};border:1px solid ${t.border};border-radius:8px;color:${t.text};font-size:14px;font-weight:600;">${text}</p>`
}

/** Infoblock med rubrik + brödtext (ROT-uppgifter, "Vad händer nu", betalningsinfo). */
export function infoBlock(title: string, bodyHtml: string, tone: StatusTone = 'neutral'): string {
  const t = STATUS_TONES[tone]
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:${t.bg};border:1px solid ${t.border};border-radius:8px;">
        <tr>
          <td style="padding:16px;">
            <p style="margin:0 0 6px;font-weight:600;color:${tone === 'neutral' ? INK : t.text};font-size:14px;">${title}</p>
            <div style="margin:0;color:${BODY};font-size:14px;line-height:1.6;">${bodyHtml}</div>
          </td>
        </tr>
      </table>`
}

/** Etikett/värde-rader ("Bankgiro 123-4567", "OCR …") för infoblocken. */
export function detailRows(rows: Array<{ label: string; value: string }>): string {
  return rows
    .filter((r) => r.value)
    .map((r) => `<span style="color:${MUTED};">${r.label}:</span> <strong style="color:${INK};">${r.value}</strong>`)
    .join('<br>')
}

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

/** Betalblock: Swish-knapp + nummer + märkning. Swish-lila är Swishs egen färg, inte accenten. */
export function swishBlock(opts: { swishNumber: string; amount: number; amountLabel: string; message: string }): string {
  const link = swishDeeplink(opts.swishNumber, opts.amount, opts.message)
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#f5f0ff;border:1px solid #e4d8f8;border-radius:8px;">
        <tr>
          <td align="center" style="padding:20px;">
            <p style="margin:0 0 12px;font-size:13px;color:${MUTED};">Betala enkelt med Swish</p>
            <a href="${link}" style="display:inline-block;background:#6A3E9E;color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">Betala ${opts.amountLabel} med Swish</a>
            <p style="margin:12px 0 0;font-size:13px;color:${BODY};">Swish-nummer: <strong>${opts.swishNumber}</strong></p>
            <p style="margin:4px 0 0;font-size:12px;color:${FAINT};">Märk betalningen: <strong>${opts.message}</strong></p>
          </td>
        </tr>
      </table>`
}

/** Preliminärt ROT/RUT — sanningsregeln: Skatteverket fastställer; vi lovar aldrig att avdraget sker av sig självt. */
export function rotRutNotice(type: string, deduction: number): string {
  const t = type.toUpperCase()
  return infoBlock(
    `Preliminärt ${t}-avdrag`,
    `Avdraget på <strong>${formatKr(deduction)}</strong> är preliminärt och gäller under förutsättning att Skatteverket godkänner det. Skatteverket fastställer det slutgiltiga beloppet.`,
    'success',
  )
}

/** Sekundär länk under knappen ("Ladda ner som PDF", rå länk). */
export function secondaryLink(text: string, url: string, accent?: string): string {
  const a = normalizeAccentColor(accent)
  return `<p style="margin:12px 0 0;font-size:13px;"><a href="${url}" style="color:${a};text-decoration:underline;">${text}</a></p>`
}

/** Centrerad knapp + valfri sekundär länk — mailets ena primära handling. */
export function actionBlock(cta: { text: string; url: string }, accent?: string, secondary?: { text: string; url: string }): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
        <tr>
          <td align="center">
            ${ctaButton(cta.text, cta.url, accent)}
            ${secondary ? secondaryLink(secondary.text, secondary.url, accent) : ''}
          </td>
        </tr>
      </table>`
}

/** Signatur längst ner i innehållet ("Med vänliga hälsningar, Erik — Ekström Bygg"). */
export function signature(businessName: string, contactName?: string): string {
  return `<p style="margin:24px 0 0;color:${BODY};font-size:15px;line-height:1.6;">Med vänliga hälsningar,<br><strong>${contactName ? `${contactName} — ` : ''}${businessName}</strong></p>`
}

/** Belopp i svensk form: "84 500 kr". */
export function formatKr(amount: number | null | undefined): string {
  return `${Math.round(Number(amount) || 0).toLocaleString('sv-SE')} kr`
}

/** Datum i svensk form ur ISO/Date; ogiltigt värde returneras som det är. */
export function formatDatum(value: string | Date | null | undefined): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('sv-SE')
}

// ── Templates ──────────────────────────────────────────────────

/**
 * Quote sent - email with link to view/sign quote
 */
export function quoteEmail(params: {
  branding: BusinessBranding
  customerName: string
  projectTitle: string
  totalAmount: string
  viewUrl: string
}): { subject: string; html: string } {
  const subject = `Offert från ${params.branding.businessName}`
  const html = emailLayout(params.branding, `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">${halsning(params.customerName)}</h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
      Vi har tagit fram en offert åt dig.
    </p>
    <table width="100%" style="margin:0 0 24px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 4px;font-size:13px;color:#64748b;">Totalt belopp</p>
          <p style="margin:0;font-size:24px;font-weight:700;color:#1e293b;">${params.totalAmount} kr</p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 24px;">
      ${ctaButton('Visa offert', params.viewUrl, params.branding.accentColor)}
    </p>
    <p style="margin:0;color:#94a3b8;font-size:13px;">
      Du kan granska och signera offerten direkt via länken ovan.
    </p>
  `)
  return { subject, html }
}

/**
 * Quote reminder - follow-up on unanswered quote
 */
export function quoteReminderEmail(params: {
  branding: BusinessBranding
  customerName: string
  projectTitle: string
  daysSinceSent: number
  viewUrl: string
}): { subject: string; html: string } {
  const subject = `Påminnelse: Din offert från ${params.branding.businessName}`
  const html = emailLayout(params.branding, `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">${halsning(params.customerName)}</h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
      Vi skickade en offert till dig för ${params.daysSinceSent} dagar sedan.
      Har du hunnit titta på den? Tveka inte att höra av dig om du har frågor.
    </p>
    <p style="margin:0 0 24px;">
      ${ctaButton('Visa offert', params.viewUrl, params.branding.accentColor)}
    </p>
    <p style="margin:0;color:#94a3b8;font-size:13px;">
      Svara på detta mail om du har frågor eller vill diskutera offerten.
    </p>
  `)
  return { subject, html }
}

/**
 * Booking confirmation
 */
export function bookingConfirmationEmail(params: {
  branding: BusinessBranding
  customerName: string
  date: string
  time: string
  address?: string
  notes?: string
}): { subject: string; html: string } {
  const subject = `Bokningsbekräftelse: ${params.date} kl ${params.time}`
  const html = emailLayout(params.branding, `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">${halsning(params.customerName)}</h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
      Din bokning är bekräftad!
    </p>
    <table width="100%" style="margin:0 0 24px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 8px;font-size:13px;color:#64748b;">Datum & tid</p>
          <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#1e293b;">${params.date} kl ${params.time}</p>
          ${params.address ? `<p style="margin:0 0 4px;font-size:13px;color:#64748b;">Adress</p><p style="margin:0;font-size:14px;color:#1e293b;">${params.address}</p>` : ''}
          ${params.notes ? `<p style="margin:8px 0 0;font-size:13px;color:#64748b;">${params.notes}</p>` : ''}
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#94a3b8;font-size:13px;">
      Behöver du ändra tiden? Svara på detta mail eller ring oss.
    </p>
  `)
  return { subject, html }
}

/**
 * Invoice email
 */
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
  const subject = `Faktura #${params.invoiceNumber} från ${params.branding.businessName}`

  const swishSection = params.swishNumber && params.swishNumber.trim()
    ? swishBlock({
        swishNumber: params.swishNumber.trim(),
        amount: params.totalAmountNum || 0,
        amountLabel: `${params.totalAmount} kr`,
        message: params.invoiceNumber,
      })
    : ''

  const bankgiroLine = params.bankgiro ? `Bankgiro: ${params.bankgiro}. ` : ''

  const html = emailLayout(params.branding, `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">${halsning(params.customerName)}</h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
      Här kommer faktura <strong>#${params.invoiceNumber}</strong>.
    </p>
    <table width="100%" style="margin:0 0 24px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
      <tr>
        <td style="padding:16px;">
          <table width="100%">
            <tr>
              <td>
                <p style="margin:0 0 4px;font-size:13px;color:#64748b;">Belopp</p>
                <p style="margin:0;font-size:24px;font-weight:700;color:#1e293b;">${params.totalAmount} kr</p>
              </td>
              <td align="right">
                <p style="margin:0 0 4px;font-size:13px;color:#64748b;">Förfallodatum</p>
                <p style="margin:0;font-size:16px;font-weight:600;color:#1e293b;">${params.dueDate}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${swishSection}
    ${params.viewUrl ? `<p style="margin:0 0 24px;">${ctaButton('Visa faktura', params.viewUrl, params.branding.accentColor)}</p>` : ''}
    <p style="margin:0;color:#94a3b8;font-size:13px;">
      ${bankgiroLine}Betalningsvillkor: 30 dagar netto. Kontakta oss vid frågor.
    </p>
  `)
  return { subject, html }
}

/**
 * Thank you after completed job
 */
export function jobCompletedEmail(params: {
  branding: BusinessBranding
  customerName: string
  reviewUrl?: string
}): { subject: string; html: string } {
  const subject = `Tack för att du valde ${params.branding.businessName}!`
  const tackFirstName = extractFirstName(params.customerName)
  const html = emailLayout(params.branding, `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">${tackFirstName ? `Tack ${tackFirstName}!` : 'Tack!'}</h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
      Vi hoppas att du är nöjd med arbetet. Det betyder mycket för oss att få förtroendet.
    </p>
    ${params.reviewUrl ? `
    <p style="margin:0 0 8px;color:#475569;font-size:15px;line-height:1.6;">
      Om du har en minut över skulle vi uppskatta en recension:
    </p>
    <p style="margin:0 0 24px;">
      ${ctaButton('Lämna recension', params.reviewUrl, '#16a34a')}
    </p>
    ` : ''}
    <p style="margin:0;color:#475569;font-size:15px;line-height:1.6;">
      Behöver du hjälp med något mer? Tveka inte att höra av dig.
    </p>
  `)
  return { subject, html }
}

/**
 * Re-engagement after inactivity
 */
export function reEngagementEmail(params: {
  branding: BusinessBranding
  customerName: string
  lastJobDescription?: string
}): { subject: string; html: string } {
  const subject = `Behöver du hjälp med något mer?`
  const html = emailLayout(params.branding, `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">${halsning(params.customerName)}</h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
      Det var ett tag sedan vi hördes!
      ${params.lastJobDescription ? ` Förra gången hjälpte vi dig.` : ''}
    </p>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
      Har du något nytt projekt på gång? Vi hjälper gärna till igen.
      Ring eller maila oss så tar vi det därifrån.
    </p>
    <p style="margin:0;color:#94a3b8;font-size:13px;">
      ${params.branding.contactPhone ? `Tel: ${params.branding.contactPhone}` : ''}
      ${params.branding.contactEmail ? ` | ${params.branding.contactEmail}` : ''}
    </p>
  `)
  return { subject, html }
}

/**
 * Nurture - generic template with variable interpolation
 */
export function nurtureStepEmail(params: {
  branding: BusinessBranding
  subject: string
  message: string
  ctaText?: string
  ctaUrl?: string
}): { subject: string; html: string } {
  const html = emailLayout(params.branding, `
    <div style="color:#475569;font-size:15px;line-height:1.6;">
      ${params.message.replace(/\n/g, '<br/>')}
    </div>
    ${params.ctaText && params.ctaUrl ? `
    <p style="margin:24px 0 0;">
      ${ctaButton(params.ctaText, params.ctaUrl, params.branding.accentColor)}
    </p>
    ` : ''}
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
