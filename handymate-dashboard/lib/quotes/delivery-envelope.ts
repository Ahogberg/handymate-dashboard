import { buildSmsSuffix } from '@/lib/sms-reply-number'
import { halsning } from '@/lib/customers/namn'
import { brandingFromConfig, type Branding } from '@/lib/branding/get-branding'
import { buildQuoteEmailHtml } from './quote-email'

export interface QuoteRecipients {
  method: 'email' | 'sms' | 'both'
  emailTo: string[]
  bcc: string[]
  smsTo: string | null
}
/** Validate EVERY selected channel before creating links or sending the first
 * message. In particular `both` must not quietly degrade to SMS-only.
 */
export function quoteRecipients(customer: { email?: unknown; phone_number?: unknown }, method: unknown, extraEmails: unknown = [], bccEmails: unknown = []): QuoteRecipients {
  if (typeof method !== 'string' || !['email', 'sms', 'both'].includes(method)) throw new Error('Välj e-post, SMS eller båda kanalerna.')
  const emails = (value: unknown): string[] => {
    if (!Array.isArray(value) || value.length > 50) throw new Error('Mottagarna måste vara en lista med högst 50 adresser.')
    return value.map(v => {
      if (typeof v !== 'string' || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v.trim()) || /[\r\n]/.test(v)) throw new Error('En e-postadress är ogiltig.')
      return v.trim()
    })
  }
  const extras = emails(extraEmails ?? []), bcc = emails(bccEmails ?? [])
  const emailTo = method === 'sms' ? [] : emails([customer.email])
  if (method === 'sms' && (extras.length || bcc.length)) throw new Error('E-postmottagare kan inte anges för ett rent SMS-utskick.')
  emailTo.push(...extras)
  const all = [...emailTo, ...bcc].map(v => v.toLowerCase())
  if (new Set(all).size !== all.length) throw new Error('Samma adress förekommer flera gånger bland mottagare eller BCC.')
  let smsTo: string | null = null
  if (method !== 'email') {
    if (typeof customer.phone_number !== 'string' || !/^\+?[0-9 ()-]{7,20}$/.test(customer.phone_number) || customer.phone_number.replace(/\D/g, '').length < 7) throw new Error('Kunden saknar ett giltigt telefonnummer för SMS.')
    smsTo = customer.phone_number
  }
  return { method: method as QuoteRecipients['method'], emailTo, bcc, smsTo }
}

export function validateQuoteDeliveryData(quote: any, business: any) {
  const isAmount = (value: unknown) => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value))
  const total = Number(quote.total)
  if (!isAmount(quote.total) || total < 0) throw new Error('Offerten saknar ett giltigt totalbelopp.')
  const customerPays = quote.rot_rut_type ? Number(quote.customer_pays) : total
  if ((quote.rot_rut_type && !isAmount(quote.customer_pays)) || customerPays < 0 || customerPays > total) throw new Error('Offertens kundbelopp efter avdrag är ogiltigt.')
  if (quote.valid_until && !Number.isFinite(new Date(quote.valid_until).getTime())) throw new Error('Offertens giltighetsdatum är ogiltigt.')
  if (typeof business.business_name !== 'string' || !business.business_name.trim() || /[\r\n<>]/.test(business.business_name)) throw new Error('Företagets avsändarnamn är ogiltigt.')
  if (business.contact_email && (typeof business.contact_email !== 'string' || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(business.contact_email))) throw new Error('Företagets svarsadress är ogiltig.')
  return { total, customerPays }
}

/** Reusable in preparation and delivery. Links must already have been prepared
 * by the caller; this function creates no database row or network effect.
 */
export function buildQuoteDeliveryEnvelope(input: {
  quote: any; business: any; recipients: QuoteRecipients; portalUrl: string;
  pdfUrl: string; trackingPixelUrl?: string;
  creator?: { name?: string | null; phone?: string | null; email?: string | null } | null
}) {
  const { quote, business, recipients, portalUrl, creator } = input
  const { total, customerPays } = validateQuoteDeliveryData(quote, business)
  const currency = (amount: number) => new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(amount)
  const rot = quote.rot_rut_type ? ` (efter ${String(quote.rot_rut_type).toUpperCase()}: ${currency(customerPays)} kr)` : ''
  const base = brandingFromConfig(business)
  const branding: Branding = { ...base, contactName: creator?.name || base.contactName,
    contactPhone: (creator?.phone ?? base.contactPhone) || undefined,
    contactEmail: (creator?.email ?? base.contactEmail) || undefined }
  const sms = recipients.smsTo ? { to: recipients.smsTo, text: `${halsning(quote.customer.name)}

Här kommer din offert från ${business.business_name}:

Totalt: ${currency(total)} kr${rot}
${quote.valid_until ? `Giltig till: ${new Date(quote.valid_until).toLocaleDateString('sv-SE')}\n` : ''}
Öppna din kundportal:
${portalUrl}

Frågor? Ring ${business.phone_number}
${buildSmsSuffix(business.business_name, business.assigned_phone_number)}` } : null
  const email = recipients.emailTo.length ? {
    to: recipients.emailTo, bcc: recipients.bcc,
    subject: `Offert från ${business.business_name} — ${quote.title || 'Offert'}`,
    html: buildQuoteEmailHtml({ branding, customerName: quote.customer?.name, quoteNumber: quote.quote_number,
      title: quote.title, description: quote.description, total, customerPays: quote.customer_pays,
      rotRutType: quote.rot_rut_type, validUntil: quote.valid_until, signUrl: portalUrl,
      pdfUrl: input.pdfUrl, contactName: creator?.name, trackingPixelUrl: input.trackingPixelUrl }),
    fromName: business.business_name, replyTo: business.contact_email || undefined,
  } : null
  return { sms, email, total, customerPays }
}

export function quoteSendReceipt(smsSent: boolean, emailSent: boolean, recipients: QuoteRecipients, errors: string[], deliveryUnknown = false) {
  const missing = (recipients.smsTo && !smsSent) || (recipients.emailTo.length > 0 && !emailSent)
  const any = smsSent || emailSent
  return {
    state: !any ? deliveryUnknown ? 'unknown' as const : 'failed' as const : missing || errors.length ? 'partial' as const : 'sent' as const,
    text: `${smsSent ? 'SMS accepterat av sändtjänsten. ' : ''}${emailSent ? 'E-post accepterad av sändtjänsten. ' : ''}${errors.join(' ') || (missing ? 'En vald kanal saknar bekräftat utskick.' : any ? 'Detta bekräftar inte att mottagaren har läst offerten.' : 'Inget utskick kunde bekräftas.')}`.trim(),
  }
}
