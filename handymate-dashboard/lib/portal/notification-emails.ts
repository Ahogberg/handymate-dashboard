/**
 * Portal notifications — automatiska mail till kunden vid viktiga events.
 *
 * Mallen matchar Modern offert: hantverkarens logo + accent_color prominent,
 * "Powered by Handymate" subtle i footern.
 *
 * Anti-spam: samma event till samma kund inom 1h hoppas över.
 *
 * Loggas i portal_notification_log för dedup + framtida open/click-tracking.
 */

import { getServerSupabase } from '@/lib/supabase'

export type PortalNotificationEvent =
  | 'new_message'
  | 'quote_sent'
  | 'invoice_sent'
  | 'invoice_paid'
  | 'invoice_overdue'
  | 'project_update'
  | 'photos_added'
  | 'review_request'

interface PortalNotificationOptions {
  /** Extra context per event (t.ex. message preview, invoice belopp, stage-namn). */
  context?: Record<string, any>
  /** Kringgå 1h-dedup. Använd bara för manuella tester. */
  skipDedup?: boolean
}

interface PortalNotificationResult {
  success: boolean
  skipped?: 'dedup' | 'no_email' | 'no_portal' | 'no_resend_key' | 'disabled'
  emailId?: string
  error?: string
}

const RESEND_API_KEY = process.env.RESEND_API_KEY
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
const RESEND_DOMAIN = process.env.RESEND_DOMAIN || 'handymate.se'

const ONE_HOUR_MS = 60 * 60 * 1000

/**
 * Default-text per event. Subject + heading + body används av mall-byggaren.
 * Body får innehålla {customerName} och {context.*} placeholders.
 */
const EVENT_COPY: Record<PortalNotificationEvent, {
  subject: (ctx: Record<string, any>, business: string) => string
  heading: string
  body: (ctx: Record<string, any>) => string
  /** Statisk knapptext, eller funktion när CTA beror på context. */
  cta: string | ((ctx: Record<string, any>) => string)
  emoji: string
}> = {
  new_message: {
    subject: (_ctx, biz) => `Nytt meddelande från ${biz}`,
    heading: 'Du har ett nytt meddelande',
    body: (ctx) => ctx.preview
      ? `Du har fått ett nytt meddelande i din kundportal:<br/><br/><em style="color:#475569;">"${escapeHtml(String(ctx.preview).slice(0, 200))}"</em>`
      : 'Du har fått ett nytt meddelande i din kundportal.',
    cta: 'Öppna meddelandet',
    emoji: '💬',
  },
  quote_sent: {
    subject: (_ctx, biz) => `Ny offert från ${biz}`,
    heading: 'Du har fått en offert',
    body: (ctx) => ctx.title
      ? `En ny offert <strong>${escapeHtml(String(ctx.title))}</strong> har lagts i din kundportal — granska och godkänn när du vill.`
      : 'En ny offert har lagts i din kundportal — granska och godkänn när du vill.',
    cta: 'Granska offert',
    emoji: '📄',
  },
  invoice_sent: {
    subject: (_ctx, biz) => `Ny faktura från ${biz}`,
    heading: 'Du har fått en faktura',
    body: (ctx) => {
      const amount = ctx.amount ? ` på <strong>${formatKr(ctx.amount)}</strong>` : ''
      const due = ctx.due_date ? ` med förfallodatum <strong>${formatDate(ctx.due_date)}</strong>` : ''
      return `En ny faktura${amount}${due} ligger i din portal.`
    },
    cta: 'Visa faktura',
    emoji: '🧾',
  },
  invoice_paid: {
    subject: (_ctx, _biz) => 'Tack för din betalning',
    heading: 'Tack för din betalning!',
    body: (ctx) => {
      const amount = ctx.amount ? ` av <strong>${formatKr(ctx.amount)}</strong>` : ''
      return `Tack för din betalning${amount}. Vi uppskattar verkligen ditt förtroende och hoppas du är nöjd med jobbet.`
    },
    // Auto-detect: om review_request redan skickats — visa portal-CTA istället
    // för att undvika att be om recension två gånger.
    cta: (ctx) => ctx.review_already_sent ? 'Se i din portal' : 'Lämna en recension',
    emoji: '🙏',
  },
  invoice_overdue: {
    subject: (_ctx, _biz) => `Vänlig påminnelse — fakturan har förfallit`,
    heading: 'Påminnelse om obetald faktura',
    body: (ctx) => {
      const amount = ctx.amount ? ` på <strong>${formatKr(ctx.amount)}</strong>` : ''
      return `Vi vill bara påminna om att fakturan${amount} har passerat förfallodatum. Hör gärna av dig om något är oklart.`
    },
    cta: 'Visa faktura',
    emoji: '⏰',
  },
  project_update: {
    subject: (ctx, biz) => ctx.stage_name
      ? `Uppdatering: ${ctx.stage_name} — ${biz}`
      : `Projektuppdatering från ${biz}`,
    heading: 'Ditt projekt har uppdaterats',
    body: (ctx) => {
      const stage = ctx.stage_name ? ` är nu i fasen <strong>${escapeHtml(String(ctx.stage_name))}</strong>` : ' har en ny uppdatering'
      const proj = ctx.project_name ? `<strong>${escapeHtml(String(ctx.project_name))}</strong>` : 'Ditt projekt'
      return `${proj}${stage}. Följ utvecklingen direkt i portalen.`
    },
    cta: 'Följ projektet',
    emoji: '🔨',
  },
  photos_added: {
    subject: (_ctx, biz) => `Nya bilder från ${biz}`,
    heading: 'Det finns nya bilder att titta på',
    body: (ctx) => {
      const count = Number(ctx.count || 0)
      if (count > 1) return `${count} nya bilder från arbetet har lagts upp i din portal.`
      if (count === 1) return `En ny bild från arbetet har lagts upp i din portal.`
      return 'Nya bilder från arbetet har lagts upp i din portal.'
    },
    cta: 'Visa bilder',
    emoji: '📸',
  },
  review_request: {
    subject: (_ctx, biz) => `Hur var samarbetet med ${biz}?`,
    heading: 'Vi skulle uppskatta din feedback',
    body: (ctx) => {
      const proj = ctx.project_name ? ` med <strong>${escapeHtml(String(ctx.project_name))}</strong>` : ''
      return `Tack för förtroendet${proj}! Det skulle betyda mycket om du tog några sekunder att lämna en recension. Det hjälper oss växa och nå fler kunder som dig.`
    },
    cta: 'Lämna recension',
    emoji: '⭐',
  },
}

/**
 * Skicka en notifikation till kundens portal.
 *
 * @returns success: true om mailet skickades ELLER skippades avsiktligt
 *          (saknad email/portal är inte ett fel — bara ingen kanal).
 */
export async function sendPortalNotification(
  businessId: string,
  customerId: string,
  event: PortalNotificationEvent,
  options: PortalNotificationOptions = {}
): Promise<PortalNotificationResult> {
  if (!RESEND_API_KEY) {
    return { success: false, skipped: 'no_resend_key', error: 'RESEND_API_KEY saknas' }
  }

  const supabase = getServerSupabase()
  const context = options.context || {}

  // Anti-spam: kolla om vi skickat samma event till samma kund < 1h sedan
  if (!options.skipDedup) {
    const cutoff = new Date(Date.now() - ONE_HOUR_MS).toISOString()
    const { data: recent } = await supabase
      .from('portal_notification_log')
      .select('id')
      .eq('customer_id', customerId)
      .eq('event', event)
      .gte('sent_at', cutoff)
      .limit(1)

    if (recent && recent.length > 0) {
      return { success: true, skipped: 'dedup' }
    }
  }

  // Hämta kund (email + portal_token)
  const { data: customer } = await supabase
    .from('customer')
    .select('customer_id, name, email, portal_token, portal_enabled')
    .eq('customer_id', customerId)
    .eq('business_id', businessId)
    .maybeSingle()

  if (!customer || !customer.email) {
    return { success: true, skipped: 'no_email' }
  }

  if (!customer.portal_token || customer.portal_enabled === false) {
    return { success: true, skipped: 'no_portal' }
  }

  // Hämta business (logo + accent_color + namn)
  const { data: business } = await supabase
    .from('business_config')
    .select('business_name, contact_name, contact_email, logo_url, accent_color')
    .eq('business_id', businessId)
    .maybeSingle()

  if (!business) {
    return { success: false, error: 'Business config hittades inte' }
  }

  const businessName = business.business_name || 'Hantverkaren'
  const accentColor = isValidHex(business.accent_color) ? business.accent_color : '#0F766E'
  const portalUrl = `${APP_URL}/portal/${customer.portal_token}`

  // Auto-detect: vid invoice_paid, slå upp om en review_request-notis redan
  // skickats till samma kund — då anpassas CTA från "Lämna en recension" till
  // "Se i din portal" så vi inte ber om recension två gånger.
  if (event === 'invoice_paid' && context.review_already_sent === undefined) {
    try {
      const { data: priorReview } = await supabase
        .from('portal_notification_log')
        .select('id')
        .eq('customer_id', customerId)
        .eq('event', 'review_request')
        .limit(1)
      context.review_already_sent = !!(priorReview && priorReview.length > 0)
    } catch { /* non-blocking — defaultar till false */ }
  }

  const copy = EVENT_COPY[event]
  const subject = copy.subject(context, businessName)
  const ctaText = typeof copy.cta === 'function' ? copy.cta(context) : copy.cta
  const html = buildEmailHtml({
    accentColor,
    businessName,
    logoUrl: business.logo_url || null,
    customerName: customer.name || 'Kund',
    heading: copy.heading,
    bodyHtml: copy.body(context),
    emoji: copy.emoji,
    cta: ctaText,
    portalUrl: portalUrl + eventToPortalAnchor(event, context),
  })

  // Skicka via Resend
  let emailId: string | undefined
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${businessName} <portal@${RESEND_DOMAIN}>`,
        to: [customer.email],
        subject,
        html,
        reply_to: business.contact_email || undefined,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Resend: ${errorText}` }
    }

    const data = await response.json().catch(() => ({}))
    emailId = data?.id
  } catch (err: any) {
    return { success: false, error: err.message }
  }

  // Logga
  try {
    await supabase.from('portal_notification_log').insert({
      business_id: businessId,
      customer_id: customerId,
      event,
      email_id: emailId || null,
    })
  } catch { /* non-blocking */ }

  return { success: true, emailId }
}

/* ----- Helpers ----- */

function eventToPortalAnchor(event: PortalNotificationEvent, ctx?: Record<string, any>): string {
  switch (event) {
    case 'new_message': return '?tab=messages'
    case 'quote_sent': return '?tab=quotes'
    case 'invoice_sent':
    case 'invoice_paid':
    case 'invoice_overdue': return '?tab=invoices'
    case 'photos_added': return '?tab=photos'
    case 'project_update': return '?tab=project'
    case 'review_request': return '?tab=review'
    default: return ''
  }
}

function isValidHex(c: any): c is string {
  return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatKr(n: number | string): string {
  const num = typeof n === 'number' ? n : Number(n)
  if (!isFinite(num)) return String(n)
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(num) + ' kr'
}

function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString('sv-SE')
  } catch {
    return d
  }
}

interface BuildOpts {
  accentColor: string
  businessName: string
  logoUrl: string | null
  customerName: string
  heading: string
  bodyHtml: string
  emoji: string
  cta: string
  portalUrl: string
}

/**
 * Bygg HTML-mall som matchar Modern offert. Hantverkarens branding
 * (logo + accentfärg) prominent, "Powered by Handymate" subtle.
 */
function buildEmailHtml(opts: BuildOpts): string {
  const firstName = (opts.customerName.split(' ')[0] || opts.customerName).trim()

  const logoBlock = opts.logoUrl
    ? `<img src="${opts.logoUrl}" alt="${escapeHtml(opts.businessName)}" style="max-height: 56px; max-width: 200px; margin-bottom: 12px; display: inline-block;" />`
    : `<div style="font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: 0.5px;">${escapeHtml(opts.businessName)}</div>`

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(opts.heading)}</title>
</head>
<body style="margin: 0; padding: 0; background: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1F2937;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">

    <!-- Brand header -->
    <div style="background: ${opts.accentColor}; padding: 28px 24px; border-radius: 16px 16px 0 0; text-align: center;">
      ${logoBlock}
    </div>

    <!-- Card -->
    <div style="background: #ffffff; padding: 32px 28px; border-radius: 0 0 16px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); border: 1px solid #E5E7EB; border-top: none;">

      <div style="font-size: 32px; line-height: 1; margin-bottom: 8px;">${opts.emoji}</div>

      <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #0F172A; line-height: 1.3;">
        ${escapeHtml(opts.heading)}
      </h1>

      <p style="margin: 0 0 20px; font-size: 14px; color: #64748B;">
        Hej ${escapeHtml(firstName)},
      </p>

      <div style="font-size: 15px; line-height: 1.65; color: #334155; margin: 0 0 28px;">
        ${opts.bodyHtml}
      </div>

      <!-- CTA -->
      <div style="text-align: center; margin: 32px 0 24px;">
        <a href="${opts.portalUrl}" style="display: inline-block; background: ${opts.accentColor}; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 15px; letter-spacing: 0.2px;">
          ${escapeHtml(opts.cta)} →
        </a>
      </div>

      <p style="margin: 24px 0 0; font-size: 13px; color: #94A3B8; text-align: center; line-height: 1.5;">
        Eller kopiera länken: <br/>
        <span style="color: #64748B; word-break: break-all;">${opts.portalUrl}</span>
      </p>

      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 32px 0 20px;" />

      <p style="margin: 0; font-size: 13px; color: #64748B; line-height: 1.5;">
        Med vänliga hälsningar,<br/>
        <strong style="color: #1F2937;">${escapeHtml(opts.businessName)}</strong>
      </p>
    </div>

    <!-- Footer (subtle Handymate) -->
    <div style="text-align: center; padding: 20px 16px 0;">
      <p style="margin: 0; font-size: 11px; color: #94A3B8; letter-spacing: 0.3px;">
        Powered by <a href="https://handymate.se" style="color: #94A3B8; text-decoration: none; font-weight: 500;">Handymate</a>
      </p>
    </div>
  </div>
</body>
</html>`
}
