/**
 * Email templates for automated communication.
 * All templates are responsive HTML with business branding.
 * Swedish language.
 */

interface BusinessBranding {
  businessName: string
  accentColor?: string
  logoUrl?: string
  contactEmail?: string
  contactPhone?: string
  orgNumber?: string
}

// ── Base Layout ────────────────────────────────────────────────

function emailLayout(branding: BusinessBranding, content: string, footerExtra?: string): string {
  const accent = branding.accentColor || '#0891b2'

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${branding.businessName}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding:24px 32px;background:${accent};">
              ${branding.logoUrl
                ? `<img src="${branding.logoUrl}" alt="${branding.businessName}" style="max-height:40px;display:block;" />`
                : `<h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${branding.businessName}</h1>`
              }
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
              ${footerExtra || ''}
              <p style="margin:8px 0 0;font-size:12px;color:#94a3b8;">
                ${branding.businessName}
                ${branding.orgNumber ? ` | Org.nr: ${branding.orgNumber}` : ''}
                ${branding.contactPhone ? ` | Tel: ${branding.contactPhone}` : ''}
              </p>
              <p style="margin:4px 0 0;font-size:11px;color:#cbd5e1;">
                Skickat via Handymate
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function ctaButton(text: string, url: string, color?: string): string {
  const bg = color || '#0891b2'
  return `<a href="${url}" style="display:inline-block;padding:12px 28px;background:${bg};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">${text}</a>`
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
  const subject = `Offert: ${params.projectTitle}`
  const html = emailLayout(params.branding, `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">Hej ${params.customerName}!</h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
      Vi har tagit fram en offert för <strong>${params.projectTitle}</strong>.
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
      ${ctaButton('Visa offert', params.viewUrl)}
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
  const subject = `Påminnelse: Offert för ${params.projectTitle}`
  const html = emailLayout(params.branding, `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">Hej ${params.customerName}!</h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
      Vi skickade en offert för <strong>${params.projectTitle}</strong> för ${params.daysSinceSent} dagar sedan.
      Har du hunnit titta på den? Tveka inte att höra av dig om du har frågor.
    </p>
    <p style="margin:0 0 24px;">
      ${ctaButton('Visa offert', params.viewUrl)}
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
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">Hej ${params.customerName}!</h2>
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
  dueDate: string
  viewUrl?: string
}): { subject: string; html: string } {
  const subject = `Faktura #${params.invoiceNumber} från ${params.branding.businessName}`
  const html = emailLayout(params.branding, `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">Hej ${params.customerName}!</h2>
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
    ${params.viewUrl ? `<p style="margin:0 0 24px;">${ctaButton('Visa faktura', params.viewUrl)}</p>` : ''}
    <p style="margin:0;color:#94a3b8;font-size:13px;">
      Betalningsvillkor: 30 dagar netto. Kontakta oss vid frågor.
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
  const html = emailLayout(params.branding, `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">Tack ${params.customerName}!</h2>
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
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">Hej ${params.customerName}!</h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
      Det var ett tag sedan vi hördes!
      ${params.lastJobDescription ? ` Förra gången hjälpte vi dig med ${params.lastJobDescription}.` : ''}
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
      ${ctaButton(params.ctaText, params.ctaUrl)}
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
