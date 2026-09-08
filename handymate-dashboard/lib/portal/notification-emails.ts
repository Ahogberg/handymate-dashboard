/**
 * Portal notifications — automatiska mail till kunden vid viktiga events.
 *
 * Renderas genom masterlayouten (lib/email-templates.ts emailLayout) med
 * varumärket ur lib/branding/get-branding.ts: hantverkarens logo + accent
 * prominent, Handymate-stämpeln (lib/branding/attribution.ts) subtle i footern.
 *
 * Anti-spam: samma event till samma kund inom 1h hoppas över.
 *
 * Loggas i portal_notification_log för dedup + framtida open/click-tracking.
 */

import { getServerSupabase } from '@/lib/supabase'
import { loadBranding, type Branding } from '@/lib/branding/get-branding'
import { emailLayout, emailSection, actionBlock } from '@/lib/email-templates'

export type PortalNotificationEvent =
  | 'new_message'
  | 'quote_sent'
  | 'invoice_sent'
  | 'invoice_paid'
  | 'invoice_overdue'
  | 'project_update'
  | 'photos_added'
  | 'review_request'
  /** Fastighetspasset steg 1: ägaren valde att meddela kunden om det publicerade jobbpasset ("Ditt hem"). */
  | 'jobbpass_published'

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
}> = {
  new_message: {
    subject: (_ctx, biz) => `Nytt meddelande från ${biz}`,
    heading: 'Du har ett nytt meddelande',
    body: (ctx) => ctx.preview
      ? `Du har fått ett nytt meddelande i din kundportal:<br/><br/><em style="color:#475569;">"${escapeHtml(String(ctx.preview).slice(0, 200))}"</em>`
      : 'Du har fått ett nytt meddelande i din kundportal.',
    cta: 'Öppna meddelandet',
  },
  quote_sent: {
    subject: (_ctx, biz) => `Ny offert från ${biz}`,
    heading: 'Du har fått en offert',
    body: (ctx) => ctx.title
      ? `En ny offert <strong>${escapeHtml(String(ctx.title))}</strong> har lagts i din kundportal — granska och godkänn när du vill.`
      : 'En ny offert har lagts i din kundportal — granska och godkänn när du vill.',
    cta: 'Granska offert',
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
  },
  invoice_overdue: {
    subject: (_ctx, _biz) => `Vänlig påminnelse — fakturan har förfallit`,
    heading: 'Påminnelse om obetald faktura',
    body: (ctx) => {
      const amount = ctx.amount ? ` på <strong>${formatKr(ctx.amount)}</strong>` : ''
      return `Vi vill bara påminna om att fakturan${amount} har passerat förfallodatum. Hör gärna av dig om något är oklart.`
    },
    cta: 'Visa faktura',
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
  },
  jobbpass_published: {
    subject: (ctx, biz) => ctx.project_name ? `Jobbpasset för ${ctx.project_name} är klart — ${biz}` : `Ditt jobbpass från ${biz}`,
    heading: 'Vad som gjordes hos dig — samlat på ett ställe',
    body: (ctx) => {
      const proj = ctx.project_name ? `<strong>${escapeHtml(String(ctx.project_name))}</strong>` : 'Jobbet'
      return `${proj} är klart. I din kundportal finns nu jobbpasset: vad som ingick, godkända tillägg, egenkontroll och bilder. Spara det — det är din dokumentation över arbetet.`
    },
    cta: 'Öppna jobbpasset',
  },
  review_request: {
    subject: (_ctx, biz) => `Hur var samarbetet med ${biz}?`,
    heading: 'Vi skulle uppskatta din feedback',
    body: (ctx) => {
      const proj = ctx.project_name ? ` med <strong>${escapeHtml(String(ctx.project_name))}</strong>` : ''
      return `Tack för förtroendet${proj}! Det skulle betyda mycket om du tog några sekunder att lämna en recension. Det hjälper oss växa och nå fler kunder som dig.`
    },
    cta: 'Lämna recension',
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

  // Hämta business — bara för att skilja "finns inte" från "finns men tomt".
  const { data: business } = await supabase
    .from('business_config')
    .select('business_id')
    .eq('business_id', businessId)
    .maybeSingle()

  if (!business) {
    return { success: false, error: 'Business config hittades inte' }
  }

  // Varumärkeslagret 2026-09-07: logotyp/accent/kontakt/stämpel ur EN
  // sanning (lib/branding/get-branding.ts) — mailet renderas genom
  // emailLayout() som alla andra kundmail.
  const branding = await loadBranding(supabase, businessId)
  const businessName = branding.businessName
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
    branding,
    customerName: customer.name || 'Kund',
    heading: copy.heading,
    bodyHtml: copy.body(context),
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
        reply_to: branding.contactEmail || undefined,
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
    case 'invoice_overdue': return '?tab=invoices'
    // invoice_paid delade tidigare case med invoice_sent/invoice_overdue,
    // så knappen "Lämna en recension" pekade på fakturafliken istället för
    // recensionsvyn (PortalReviewCTA, redan byggd och redan rutt-bar via
    // ?tab=review) — hittat 2026-08-14. ctx.review_already_sent sätts
    // redan ovan i sendPortalNotification, bara aldrig LÄST här förut.
    case 'invoice_paid': return ctx?.review_already_sent ? '?tab=invoices' : '?tab=review'
    // ?tab=photos fanns inte i portalen — kunden landade på Hem (rättat 2026-08-27).
    case 'photos_added': return '?tab=project'
    case 'jobbpass_published': return ctx?.project_id ? `?tab=jobbpass&project=${ctx.project_id}` : '?tab=project'
    case 'project_update': return '?tab=project'
    case 'review_request': return '?tab=review'
    default: return ''
  }
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
  branding: Branding
  customerName: string
  heading: string
  bodyHtml: string
  cta: string
  portalUrl: string
}

/**
 * Portalnotisen — designens KOMPAKTA variant av masterlayouten
 * (lib/email-templates.ts emailLayout, compact): mindre sidhuvud, rubrik +
 * en rad, en knapp in i portalen, enradig sidfot med stämpel. Notisen ska
 * ta kunden till portalen, inte återge innehållet.
 */
function buildEmailHtml(opts: BuildOpts): string {
  const firstName = (opts.customerName.split(' ')[0] || opts.customerName).trim()
  const b = opts.branding
  const content = `
    ${emailSection(
      `<div style="font-size:18px;line-height:1.3;font-weight:700;color:#0f172a;">${escapeHtml(opts.heading)}</div>` +
      `<p style="margin:8px 0 0;font-size:15px;line-height:1.5;color:#475569;">${firstName ? `Hej ${escapeHtml(firstName)}! ` : ''}${opts.bodyHtml}</p>`,
      '24px 24px 0',
    )}
    ${actionBlock({ text: escapeHtml(opts.cta), url: opts.portalUrl }, b.accentColor, undefined, { small: true })}
  `
  return emailLayout(b, content, { compact: true })
}
