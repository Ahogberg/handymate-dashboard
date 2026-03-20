import { getServerSupabase } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'

/**
 * Skicka bekräftelsemail efter att offert signerats.
 * Inkluderar ROT-uppgifter om offerten har ROT-avdrag.
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
    .select('name, email, address_line, phone_number, personal_number, property_designation')
    .eq('customer_id', quote.customer_id)
    .single()

  if (!customer?.email) {
    return { success: false, error: 'Customer has no email' }
  }

  // Fetch business
  const { data: business } = await supabase
    .from('business_config')
    .select('business_name, contact_name, contact_email')
    .eq('business_id', businessId)
    .single()

  if (!business) return { success: false, error: 'Business not found' }

  const hasRot = !!(quote.rot_work_cost && quote.rot_work_cost > 0)
  const quoteNumber = quote.quote_number || quote.quote_id.slice(0, 8)
  const customerName = customer.name || 'Kund'
  const firstName = customerName.split(' ')[0]
  const personnummer = quote.personnummer || customer.personal_number || ''
  const fastighet = quote.fastighetsbeteckning || customer.property_designation || ''

  const subject = hasRot
    ? `Tack för att du godkände offerten — vänligen granska dina uppgifter`
    : `Tack för att du godkände offerten`

  const html = buildConfirmationHtml({
    firstName,
    customerName,
    customerAddress: customer.address_line || '',
    quoteNumber,
    businessName: business.business_name || '',
    contactName: business.contact_name || '',
    hasRot,
    personnummer,
    fastighet,
  })

  const result = await sendEmail({
    to: customer.email,
    subject,
    html,
    fromName: business.business_name || 'Handymate',
    replyTo: business.contact_email || undefined,
  })

  // Log
  try {
    await supabase.from('v3_automation_logs').insert({
      business_id: businessId,
      rule_name: 'quote_signed_confirmation',
      trigger_type: 'event',
      action_taken: `Bekräftelsemail skickat till ${customer.email}`,
      customer_id: quote.customer_id,
      success: result.success,
      error_message: result.error || null,
    })
  } catch { /* non-blocking */ }

  return result
}

function buildConfirmationHtml(opts: {
  firstName: string
  customerName: string
  customerAddress: string
  quoteNumber: string
  businessName: string
  contactName: string
  hasRot: boolean
  personnummer: string
  fastighet: string
}): string {
  const rotSection = opts.hasRot ? `
    <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <p style="margin: 0 0 8px; font-weight: 600; color: #166534;">🏠 ROT-uppgifter</p>
      <p style="margin: 4px 0; color: #374151;">Fastighetsbeteckning/lägenhetsnummer: <strong>${opts.fastighet || 'Saknas — vänligen meddela oss'}</strong></p>
      <p style="margin: 4px 0; color: #374151;">Personnummer: <strong>${opts.personnummer ? opts.personnummer.slice(0, 6) + '-XXXX' : 'Saknas — behövs för ROT-ansökan'}</strong></p>
    </div>
  ` : ''

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1F2937;">
  <div style="background: #0F766E; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 20px;">${opts.businessName}</h1>
  </div>

  <div style="background: white; padding: 24px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 12px 12px;">
    <h2 style="color: #111827; font-size: 18px; margin: 0 0 16px;">
      Tack ${opts.firstName}!
    </h2>

    <p style="color: #374151; line-height: 1.6;">
      Tack för att du godkände offert <strong>${opts.quoteNumber}</strong>.
      ${opts.hasRot ? 'För att vi ska kunna ansöka om ditt ROT-avdrag behöver vi verifiera följande uppgifter.' : ''}
    </p>

    <div style="background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <p style="margin: 0 0 8px; font-weight: 600; color: #111827;">📋 Fakturauppgifter</p>
      <p style="margin: 4px 0; color: #374151;">Namn: <strong>${opts.customerName}</strong></p>
      <p style="margin: 4px 0; color: #374151;">Adress: <strong>${opts.customerAddress || 'Ej angiven'}</strong></p>
    </div>

    ${rotSection}

    <p style="color: #374151; line-height: 1.6;">
      Stämmer uppgifterna? Svara på detta mail om något behöver korrigeras.
    </p>

    <p style="color: #374151; line-height: 1.6;">
      Vi hör av oss inom kort för att boka in arbetets start.
    </p>

    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />

    <p style="color: #6B7280; font-size: 14px; margin: 0;">
      Med vänliga hälsningar,<br/>
      <strong>${opts.contactName}</strong><br/>
      ${opts.businessName}
    </p>
  </div>
</body>
</html>`
}
