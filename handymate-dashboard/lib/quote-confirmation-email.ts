import { getServerSupabase } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { loadBranding, type Branding } from '@/lib/branding/get-branding'
import { escapeHtml } from '@/lib/document-html'
import {
  emailLayout, emailHeading, statusBand, summaryCard, steps, infoBlock, detailRows, actionBlock, linkBlock, signature, formatKr,
} from '@/lib/email-templates'

/**
 * Skicka bekräftelsemail efter att offert signerats.
 * Inkluderar ROT-uppgifter om offerten har ROT-avdrag.
 *
 * Varumärkeslagret 2026-09-07: renderas genom emailLayout() med företagets
 * logotyp/accent/stämpel (tidigare hårdkodad teal utan stämpel).
 */
export async function sendQuoteSignedConfirmation(
  businessId: string,
  quoteId: string
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
  const supabase = getServerSupabase()

  // Check if feature is enabled
  const { data: settings } = await supabase
    .from('v3_automation_settings')
    .select('quote_signed_email_enabled')
    .eq('business_id', businessId)
    .single()

  if (settings && settings.quote_signed_email_enabled === false) {
    return { success: true, skipped: true } // No customer delivery occurred
  }

  // Fetch quote with customer + business
  const { data: quote } = await supabase
    .from('quotes')
    .select(`
      quote_id, quote_number, title, total, status,
      rot_work_cost, rot_deduction, rot_customer_pays,
      personnummer, fastighetsbeteckning,
      customer_id
    `)
    .eq('quote_id', quoteId)
    .eq('business_id', businessId)
    .single()

  if (!quote) return { success: false, error: 'Quote not found' }

  // Fetch customer
  const { data: customer } = await supabase
    .from('customer')
    .select('name, email, address_line, phone_number, personal_number, property_designation, portal_token, portal_enabled')
    .eq('customer_id', quote.customer_id)
    .eq('business_id', businessId)
    .single()

  if (!customer?.email) {
    return { success: false, error: 'Customer has no email' }
  }

  // Varumärke + stämpel (kastar aldrig; neutralt fallback vid fel).
  const branding = await loadBranding(supabase, businessId)

  const hasRot = !!(quote.rot_work_cost && quote.rot_work_cost > 0)
  const quoteNumber = quote.quote_number || quote.quote_id.slice(0, 8)
  const customerName = customer.name || 'Kund'
  const firstName = customerName.split(' ')[0]
  const personnummer = quote.personnummer || customer.personal_number || ''
  const fastighet = quote.fastighetsbeteckning || customer.property_designation || ''

  const rotSaknas = hasRot && (!personnummer || !fastighet)
  const subject = rotSaknas
    ? `Offerten är godkänd — vi behöver dina ROT-uppgifter`
    : `Offerten är godkänd — tack ${firstName}!`

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  const portalUrl = customer.portal_token && customer.portal_enabled
    ? `${appUrl}/portal/${customer.portal_token}`
    : ''

  const html = buildConfirmationHtml({
    branding,
    firstName,
    quoteNumber,
    quoteTitle: quote.title || '',
    total: Number(quote.total) || 0,
    rotDeduction: Number(quote.rot_deduction) || 0,
    customerPays: Number(quote.rot_customer_pays) || 0,
    hasRot,
    personnummer,
    fastighet,
    portalUrl,
  })

  const result = await sendEmail({
    businessId,
    customerId: quote.customer_id,
    to: customer.email,
    subject,
    html,
    fromName: branding.businessName,
    replyTo: branding.contactEmail,
  })

  // Log
  try {
    // Hitta ev. kopplat projekt (skapas vid quote_accepted) så Flödet-vyn
    // kan visa den här loggen på rätt projekt-rad istället för bara på kunden.
    let projectId: string | null = null
    try {
      const { data: project } = await supabase
        .from('project')
        .select('project_id')
        .eq('quote_id', quote.quote_id || '')
        .maybeSingle()
      projectId = project?.project_id || null
    } catch { /* non-blocking */ }

    // Sanering 2026-08-05: inserten hade kolumner som inte finns
    // (action_taken/customer_id/success) och saknade NOT NULL-fälten
    // action_type/status → den har failat på varje offertsignering.
    const { error: logErr } = await supabase.from('v3_automation_logs').insert({
      business_id: businessId,
      rule_name: 'quote_signed_confirmation',
      trigger_type: 'event',
      action_type: 'send_email',
      status: result.success ? 'success' : 'failed',
      error_message: result.error || null,
      context: {
        project_id: projectId,
        customer_id: quote.customer_id,
        quote_id: quote.quote_id,
        action_taken: `Bekräftelsemail skickat till ${customer.email}`,
      },
    })
    if (logErr) console.warn('[quote-confirmation-email] v3-logg insert misslyckades:', logErr.message)
  } catch { /* non-blocking */ }

  return result
}

/**
 * Designens "Godkänd"-mail: grönt band, tack-rubrik, summeringskort för
 * offerten, "Vad händer nu" i tre steg. Saknas ROT-uppgifter blir det stora
 * infoblocket med knappen "Lämna ROT-uppgifter" mailets handling — annars
 * en knapp in i portalen.
 */
export function buildConfirmationHtml(opts: {
  branding: Branding
  firstName: string
  quoteNumber: string
  quoteTitle: string
  total: number
  rotDeduction: number
  customerPays: number
  hasRot: boolean
  personnummer: string
  fastighet: string
  portalUrl: string
}): string {
  const b = opts.branding
  const first = escapeHtml(opts.firstName)
  const rotSaknas = opts.hasRot && (!opts.personnummer || !opts.fastighet)

  const summering = summaryCard({
    title: escapeHtml(opts.quoteTitle || 'Offert'),
    sub: `Offert ${escapeHtml(opts.quoteNumber)}`,
    rows: opts.hasRot
      ? [
          { label: 'Totalt inkl. moms', value: formatKr(opts.total) },
          { label: 'Preliminärt ROT-avdrag', value: `−${formatKr(opts.rotDeduction)}`, deduction: true },
          { label: 'Du betalar', value: formatKr(opts.customerPays), emphasis: true },
        ]
      : [{ label: 'Totalt inkl. moms', value: formatKr(opts.total), emphasis: true }],
  })

  const vadHanderNu = steps([
    { title: 'Vi bokar startdatum.', body: 'Du får en bokningsbekräftelse när tiden är satt.' },
    { title: 'Vi gör jobbet.', body: opts.portalUrl ? 'Du följer arbetet och ser foton i kundportalen.' : 'Vi håller dig uppdaterad under tiden.' },
    opts.hasRot
      ? { title: 'Fakturan kommer när arbetet är klart,', body: 'med preliminärt ROT-avdrag. Skatteverket fastställer det slutgiltiga beloppet.' }
      : { title: 'Fakturan kommer när arbetet är klart.', body: '' },
  ])

  // ROT-uppgifterna: personnumret maskeras — mailet ska bekräfta att vi HAR
  // uppgiften, inte transportera den.
  let rotBlock = ''
  let handling = ''
  if (rotSaknas) {
    rotBlock = infoBlock(
      'Vi behöver personnummer och fastighetsbeteckning innan fakturan',
      opts.portalUrl
        ? 'Uppgifterna behövs för att vi ska kunna göra ROT-avdraget på fakturan. Det tar en minut i kundportalen.'
        : 'Uppgifterna behövs för att vi ska kunna göra ROT-avdraget på fakturan. Svara på det här mailet så lägger vi in dem.',
      opts.portalUrl ? { cta: { text: 'Lämna ROT-uppgifter', url: opts.portalUrl }, accent: b.accentColor } : undefined,
    )
    handling = opts.portalUrl ? linkBlock('Visa i kundportalen', opts.portalUrl, b.accentColor) : ''
  } else {
    if (opts.hasRot) {
      rotBlock = infoBlock(
        'ROT-uppgifter vi har.',
        detailRows([
          { label: 'Fastighetsbeteckning', value: escapeHtml(opts.fastighet) },
          { label: 'Personnummer', value: escapeHtml(opts.personnummer.slice(0, 6)) + '-XXXX' },
        ]) + '<br>Stämmer det inte? Svara på det här mailet.',
      )
    }
    handling = opts.portalUrl ? actionBlock({ text: 'Visa i kundportalen', url: opts.portalUrl }, b.accentColor) : ''
  }

  const content = `
    ${statusBand('Offerten är godkänd', 'success')}
    ${emailHeading(
      first ? `Tack ${first}, offerten är godkänd` : 'Tack, offerten är godkänd',
      'Vi har tagit emot ditt godkännande. Här är vad som gäller och vad som händer nu.',
    )}
    ${summering}
    ${vadHanderNu}
    ${rotBlock}
    ${handling}
    ${signature(escapeHtml(b.businessName), b.contactName ? escapeHtml(b.contactName) : undefined, { phone: b.contactPhone ? escapeHtml(b.contactPhone) : undefined })}
  `
  return emailLayout(b, content, { meta: `Offert ${opts.quoteNumber}` })
}
