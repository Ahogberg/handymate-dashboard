import { getServerSupabase } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { loadBranding, type Branding } from '@/lib/branding/get-branding'
import { escapeHtml } from '@/lib/document-html'
import {
  emailLayout, emailHeading, emailParagraph, infoBlock, detailRows, actionBlock, signature,
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
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServerSupabase()

  // Check if feature is enabled
  const { data: settings } = await supabase
    .from('v3_automation_settings')
    .select('quote_signed_email_enabled')
    .eq('business_id', businessId)
    .single()

  if (settings && settings.quote_signed_email_enabled === false) {
    return { success: true } // Disabled, skip silently
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
    .single()

  if (!quote) return { success: false, error: 'Quote not found' }

  // Fetch customer
  const { data: customer } = await supabase
    .from('customer')
    .select('name, email, address_line, phone_number, personal_number, property_designation, portal_token, portal_enabled')
    .eq('customer_id', quote.customer_id)
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

  const subject = hasRot
    ? `Tack för att du godkände offerten — vänligen granska dina uppgifter`
    : `Tack för att du godkände offerten`

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  const portalUrl = customer.portal_token && customer.portal_enabled
    ? `${appUrl}/portal/${customer.portal_token}`
    : ''

  const html = buildConfirmationHtml({
    branding,
    firstName,
    customerName,
    customerAddress: customer.address_line || '',
    quoteNumber,
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

function buildConfirmationHtml(opts: {
  branding: Branding
  firstName: string
  customerName: string
  customerAddress: string
  quoteNumber: string
  hasRot: boolean
  personnummer: string
  fastighet: string
  portalUrl: string
}): string {
  const b = opts.branding

  // ROT-uppgifterna: personnumret maskeras — mailet ska bekräfta att vi HAR
  // uppgiften, inte transportera den.
  const rotSection = opts.hasRot
    ? infoBlock(
        'ROT-uppgifter',
        detailRows([
          { label: 'Fastighetsbeteckning/lägenhetsnummer', value: escapeHtml(opts.fastighet) || 'Saknas — vänligen meddela oss' },
          { label: 'Personnummer', value: opts.personnummer ? escapeHtml(opts.personnummer.slice(0, 6)) + '-XXXX' : 'Saknas — behövs för ROT-ansökan' },
        ]) + `<p style="margin:8px 0 0;font-size:13px;color:#64748b;">Avdraget är preliminärt — Skatteverket fastställer det slutgiltiga beloppet.</p>`,
        'success',
      )
    : ''

  const content = `
    ${emailHeading(
      `Tack ${escapeHtml(opts.firstName)}!`,
      `Tack för att du godkände offert <strong>${escapeHtml(opts.quoteNumber)}</strong>.${opts.hasRot ? ' För att vi ska kunna ansöka om ditt ROT-avdrag behöver vi verifiera följande uppgifter.' : ''}`,
    )}
    ${infoBlock('Fakturauppgifter', detailRows([
      { label: 'Namn', value: escapeHtml(opts.customerName) },
      { label: 'Adress', value: escapeHtml(opts.customerAddress) || 'Ej angiven' },
    ]))}
    ${rotSection}
    ${emailParagraph('Stämmer uppgifterna? Svara på detta mail om något behöver korrigeras.')}
    ${emailParagraph('Vi hör av oss inom kort för att boka in arbetets start.')}
    ${opts.portalUrl
      ? `${actionBlock({ text: 'Gå till din kundportal', url: opts.portalUrl }, b.accentColor)}
         ${emailParagraph('Här kan du följa ditt projekt, se fakturor och skicka meddelanden.', { muted: true })}`
      : ''}
    ${signature(escapeHtml(b.businessName), b.contactName ? escapeHtml(b.contactName) : undefined)}
  `
  return emailLayout(b, content)
}
