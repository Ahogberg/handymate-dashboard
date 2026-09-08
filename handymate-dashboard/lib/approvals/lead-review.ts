import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalReview } from './review-contract'

const phone = /^\+?[0-9 ()-]{7,20}$/

export async function prepareLeadActivationReview(
  db: SupabaseClient,
  businessId: string,
  payload: Record<string, any>,
  overrides?: Record<string, string>,
): Promise<{ review: ApprovalReview; snapshot: Record<string, unknown>; executionPayload: Record<string, unknown>; executionEvidence: Record<string, unknown> }> {
  if (typeof payload.lead_id !== 'string' || !payload.lead_id) throw new Error('Kundförfrågan saknas i underlaget.')
  const { data: lead, error } = await db.from('leads')
    .select('lead_id, business_id, customer_id, name, phone, email, notes, source, status, updated_at')
    .eq('lead_id', payload.lead_id).eq('business_id', businessId).maybeSingle()
  if (error || !lead) throw new Error('Kundförfrågan kunde inte verifieras i företaget.')
  if (!['pending_review', 'new'].includes(String(lead.status))) throw new Error('Kundförfrågan väntar inte längre på aktivering.')

  let customer: any = null
  if (lead.customer_id) {
    const result = await db.from('customer').select('customer_id, name, phone_number, email')
      .eq('customer_id', lead.customer_id).eq('business_id', businessId).maybeSingle()
    if (result.error || !result.data) throw new Error('Kundförfrågans kund kunde inte verifieras i företaget.')
    customer = result.data
  }
  const { data: existingDeal, error: dealError } = await db.from('deal').select('id, title, stage_id')
    .eq('lead_id', lead.lead_id).eq('business_id', businessId).maybeSingle()
  if (dealError) throw new Error('Kundförfrågans affärskoppling kunde inte verifieras.')
  const { data: config, error: configError } = await db.from('business_config')
    .select('business_name, personal_phone, phone_number').eq('business_id', businessId).maybeSingle()
  if (configError || !config?.business_name) throw new Error('Företagets interna mottagare kunde inte verifieras.')
  const internalPhone = config.personal_phone || config.phone_number || null
  const internalMessage = internalPhone && phone.test(internalPhone)
    ? `🌐 Ny lead!\nNamn: ${lead.name || 'Okänd'}\nTel: ${lead.phone || 'saknas'}${lead.notes ? `\n"${String(lead.notes).slice(0, 80)}"` : ''}\n→ app.handymate.se/dashboard/pipeline`
    : null

  const choices = [
    { id: 'create_deal', label: existingDeal ? 'Behåll befintlig affär' : 'Skapa affär i pipeline', description: existingDeal ? 'Återanvänder den redan kopplade affären; ingen dubblett skapas.' : 'Skapar en affär i företagets första pipeline-steg.', defaultSelected: true },
    { id: 'prepare_internal_sms', label: 'Förbered internt SMS', description: internalMessage ? `Skapar ett separat granskningskort till ${internalPhone}; SMS skickas inte nu.` : 'Ingen verifierad intern SMS-mottagare finns.', defaultSelected: !!internalMessage },
    { id: 'run_automation_rules', label: 'Förbered lead-automationer', description: 'Kör lead_received-regler, men varje faktisk regelhandling blir ett nytt granskningskort.', defaultSelected: true },
  ]
  const selected = Object.fromEntries(choices.map(choice => [choice.id, choice.defaultSelected && overrides?.[choice.id] !== 'rejected']))
  if (!internalMessage) selected.prepare_internal_sms = false
  const executionPayload = { leadId: lead.lead_id, choices: selected, internalPhone, internalMessage }
  const stable = { kind: 'lead_activation', lead, customer, existingDeal, internalPhone, internalMessage }
  const executionEvidence = { ...stable, choices: selected,
    leadEffect: 'Status aktiveras från väntande till ny', dealEffect: selected.create_deal ? (existingDeal ? `Återanvänder affär ${existingDeal.id}` : 'Skapar affär i pipeline') : 'Ingen affär skapas',
    internalSmsEffect: selected.prepare_internal_sms ? 'Separat granskningskort skapas; inget SMS skickas nu' : 'Inget internt SMS förbereds',
    automationEffect: selected.run_automation_rules ? 'Regelhandlingar kräver nya godkännanden' : 'lead_received-regler körs inte',
  }
  return {
    executionPayload, executionEvidence, snapshot: { leadActivation: stable },
    review: {
      title: `Granska kundförfrågan — ${lead.name || 'utan namn'}`,
      effect: 'Aktiverar kundförfrågan och utför endast valda följder. Ingen kund kontaktas och det interna SMS:et skickas inte av detta beslut.',
      confirmLabel: 'Aktivera med valda följder', messages: [], choices,
      details: [
        { label: 'Kund', text: customer?.name || lead.name || 'Namn saknas' },
        { label: 'Telefon', text: lead.phone || customer?.phone_number || 'Saknas' },
        { label: 'E-post', text: lead.email || customer?.email || 'Saknas' },
        { label: 'Källa', text: lead.source || 'Saknas' },
        { label: 'Förfrågan', text: lead.notes || 'Beskrivning saknas' },
        { label: 'Nuvarande status', text: lead.status },
        { label: 'Affär', text: existingDeal ? `${existingDeal.title || existingDeal.id} (befintlig)` : 'Ny affär förbereds om valet är på' },
        { label: 'Internt SMS', text: internalMessage || 'Ingen verifierad mottagare; valet är avstängt' },
        { label: 'Kundutskick', text: 'Inget kundutskick sker av aktiveringen' },
      ],
    },
  }
}
