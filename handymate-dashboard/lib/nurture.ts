/**
 * Nurture sequence engine.
 * Manages automated multi-step follow-up sequences (SMS + email).
 * Sequences are triggered by events and run on a per-customer basis.
 */

import { getServerSupabase } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────

export interface NurtureStep {
  delay_days: number
  channel: 'sms' | 'email'
  template: string
  subject?: string
}

export interface NurtureSequence {
  id: string
  business_id: string
  name: string
  trigger_type: string
  is_active: boolean
  steps: NurtureStep[]
  cancel_on?: string[]
  created_at: string
  updated_at: string
}

export interface NurtureEnrollment {
  id: string
  business_id: string
  sequence_id: string
  customer_id: string
  deal_id: string | null
  current_step: number
  status: 'active' | 'completed' | 'cancelled'
  enrolled_at: string
  next_action_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
}

// ── Default Sequences ──────────────────────────────────────────

export const DEFAULT_SEQUENCES: Omit<NurtureSequence, 'id' | 'business_id' | 'created_at' | 'updated_at'>[] = [
  {
    name: 'Offertuppföljning',
    trigger_type: 'quote_sent',
    is_active: true,
    cancel_on: ['quote_accepted', 'quote_declined'],
    steps: [
      {
        delay_days: 3,
        channel: 'sms',
        template: 'Hej {customer_name}! Har du hunnit titta på offerten för {project_title}? Hör gärna av dig om du har frågor. //{business_name}',
      },
      {
        delay_days: 7,
        channel: 'email',
        subject: 'Påminnelse: Offert för {project_title}',
        template: 'Hej {customer_name},\n\nVi skickade en offert för {project_title} för en vecka sedan. Vi vill bara försäkra oss om att du fått den och om du har några frågor.\n\nTveka inte att höra av dig – vi hjälper gärna till!\n\nMed vänlig hälsning,\n{business_name}',
      },
      {
        delay_days: 14,
        channel: 'sms',
        template: 'Hej {customer_name}, sista påminnelsen om offerten för {project_title}. Offerten är giltig till {valid_until}. Hör av dig om du vill gå vidare! //{business_name}',
      },
    ],
  },
  {
    name: 'Ny lead – välkomstflöde',
    trigger_type: 'lead_created',
    is_active: true,
    cancel_on: ['quote_created', 'booking_created'],
    steps: [
      {
        delay_days: 0,
        channel: 'sms',
        template: 'Tack för att du kontaktade {business_name}! Vi återkommer inom kort med mer info. Ha en bra dag!',
      },
      {
        delay_days: 3,
        channel: 'email',
        subject: 'Välkommen till {business_name}',
        template: 'Hej {customer_name},\n\nTack för ditt intresse! Vi erbjuder professionella tjänster inom {services}.\n\nVi kontaktar dig snart för att diskutera ditt projekt. Tveka inte att svara på detta mail om du har frågor redan nu.\n\nMed vänlig hälsning,\n{business_name}',
      },
      {
        delay_days: 7,
        channel: 'sms',
        template: 'Hej {customer_name}! Ville bara kolla om du fortfarande behöver hjälp. Ring eller svara så berättar vi mer. //{business_name}',
      },
    ],
  },
  {
    name: 'Efter slutfört jobb',
    trigger_type: 'job_completed',
    is_active: true,
    cancel_on: ['review_received'],
    steps: [
      {
        delay_days: 1,
        channel: 'sms',
        template: 'Tack {customer_name} för förtroendet! Vi hoppas du är nöjd med arbetet. Hör av dig om det är något mer vi kan hjälpa till med. //{business_name}',
      },
      {
        delay_days: 5,
        channel: 'email',
        subject: 'Hur gick det? Vi vill gärna höra från dig',
        template: 'Hej {customer_name},\n\nVi hoppas att allt blev bra! En kort recension hjälper oss och andra kunder otroligt mycket.\n\nDet tar bara en minut – tack på förhand!\n\nMed vänlig hälsning,\n{business_name}',
      },
      {
        delay_days: 14,
        channel: 'sms',
        template: 'Hej {customer_name}! Behöver du hjälp med något mer? Vi finns här. Ring eller skicka ett meddelande! //{business_name}',
      },
    ],
  },
  {
    name: 'Fakturapåminnelse',
    trigger_type: 'invoice_overdue',
    is_active: true,
    cancel_on: ['invoice_paid'],
    steps: [
      {
        delay_days: 1,
        channel: 'sms',
        template: 'Hej {customer_name}! Faktura #{invoice_number} på {invoice_amount} kr förföll {due_date}. Vänligen betala snarast. Kontakta oss vid frågor. //{business_name}',
      },
      {
        delay_days: 7,
        channel: 'email',
        subject: 'Påminnelse: Faktura #{invoice_number}',
        template: 'Hej {customer_name},\n\nVi vill påminna om att faktura #{invoice_number} på {invoice_amount} kr förföll den {due_date}.\n\nOm du redan har betalat, bortse från detta meddelande.\n\nVänligen kontakta oss om du har frågor om fakturan.\n\nMed vänlig hälsning,\n{business_name}',
      },
      {
        delay_days: 14,
        channel: 'sms',
        template: 'Viktig påminnelse: Faktura #{invoice_number} ({invoice_amount} kr) är fortfarande obetald. Vänligen betala omgående eller kontakta oss. //{business_name}',
      },
    ],
  },
]

// ── Core Functions ─────────────────────────────────────────────

/**
 * Seed default sequences for a business (idempotent).
 */
export async function seedDefaultSequences(businessId: string): Promise<void> {
  const supabase = getServerSupabase()

  const { data: existing } = await supabase
    .from('nurture_sequence')
    .select('trigger_type')
    .eq('business_id', businessId)

  const existingTriggers = new Set((existing || []).map((s: any) => s.trigger_type))

  for (const seq of DEFAULT_SEQUENCES) {
    if (existingTriggers.has(seq.trigger_type)) continue

    await supabase.from('nurture_sequence').insert({
      business_id: businessId,
      name: seq.name,
      trigger_type: seq.trigger_type,
      is_active: seq.is_active,
      steps: seq.steps,
      cancel_on: seq.cancel_on || [],
    })
  }
}

/**
 * Enroll a customer in a nurture sequence.
 * Skips if already enrolled in same sequence with status 'active'.
 */
export async function enrollInSequence(params: {
  businessId: string
  triggerType: string
  customerId: string
  dealId?: string
  variables?: Record<string, string>
}): Promise<{ enrolled: boolean; enrollment_id?: string; reason?: string }> {
  const supabase = getServerSupabase()

  // Find active sequence for this trigger
  const { data: sequence } = await supabase
    .from('nurture_sequence')
    .select('*')
    .eq('business_id', params.businessId)
    .eq('trigger_type', params.triggerType)
    .eq('is_active', true)
    .single()

  if (!sequence) {
    return { enrolled: false, reason: 'no_active_sequence' }
  }

  const steps = (sequence.steps || []) as NurtureStep[]
  if (steps.length === 0) {
    return { enrolled: false, reason: 'no_steps' }
  }

  // Check for existing active enrollment
  const { data: existingEnrollment } = await supabase
    .from('nurture_enrollment')
    .select('id')
    .eq('business_id', params.businessId)
    .eq('sequence_id', sequence.id)
    .eq('customer_id', params.customerId)
    .eq('status', 'active')
    .single()

  if (existingEnrollment) {
    return { enrolled: false, reason: 'already_enrolled' }
  }

  // Calculate next_action_at based on first step delay
  const firstStep = steps[0]
  const nextActionAt = new Date()
  nextActionAt.setDate(nextActionAt.getDate() + firstStep.delay_days)

  const { data: enrollment, error } = await supabase
    .from('nurture_enrollment')
    .insert({
      business_id: params.businessId,
      sequence_id: sequence.id,
      customer_id: params.customerId,
      deal_id: params.dealId || null,
      current_step: 0,
      status: 'active',
      next_action_at: nextActionAt.toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    console.error('Nurture enrollment error:', error)
    return { enrolled: false, reason: error.message }
  }

  return { enrolled: true, enrollment_id: enrollment?.id }
}

/**
 * Cancel all active enrollments for a customer triggered by a specific cancel event.
 * E.g., cancel 'quote_sent' enrollments when quote is accepted.
 */
export async function cancelEnrollmentsForEvent(params: {
  businessId: string
  customerId: string
  cancelEvent: string
}): Promise<number> {
  const supabase = getServerSupabase()

  // Get all active sequences that cancel on this event
  const { data: sequences } = await supabase
    .from('nurture_sequence')
    .select('id, cancel_on')
    .eq('business_id', params.businessId)
    .eq('is_active', true)

  if (!sequences || sequences.length === 0) return 0

  // Filter sequences whose cancel_on array includes this event
  const sequenceIds = sequences
    .filter((seq: any) => {
      const cancelOn = seq.cancel_on
      if (Array.isArray(cancelOn)) return cancelOn.includes(params.cancelEvent)
      return false
    })
    .map((seq: any) => seq.id)

  if (sequenceIds.length === 0) return 0

  const { data: cancelled } = await supabase
    .from('nurture_enrollment')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: params.cancelEvent,
    })
    .eq('business_id', params.businessId)
    .eq('customer_id', params.customerId)
    .eq('status', 'active')
    .in('sequence_id', sequenceIds)
    .select('id')

  return cancelled?.length || 0
}

/**
 * Process a single enrollment step: send SMS or email, advance to next step.
 */
export async function processEnrollmentStep(enrollmentId: string): Promise<{
  success: boolean
  action?: string
  error?: string
}> {
  const supabase = getServerSupabase()

  // Get enrollment with sequence and customer
  const { data: enrollment } = await supabase
    .from('nurture_enrollment')
    .select('*')
    .eq('id', enrollmentId)
    .eq('status', 'active')
    .single()

  if (!enrollment) return { success: false, error: 'enrollment_not_found' }

  const { data: sequence } = await supabase
    .from('nurture_sequence')
    .select('*')
    .eq('id', enrollment.sequence_id)
    .single()

  if (!sequence) return { success: false, error: 'sequence_not_found' }

  const steps = (sequence.steps || []) as NurtureStep[]
  const currentStep = enrollment.current_step || 0

  if (currentStep >= steps.length) {
    // All steps done — escalate if no conversion
    await supabase
      .from('nurture_enrollment')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', enrollmentId)

    // Escalation: create notification + AI suggestion for manual follow-up
    await escalateCompletedSequence({
      businessId: enrollment.business_id,
      customerId: enrollment.customer_id,
      sequenceId: enrollment.sequence_id,
      enrollmentId,
    })

    return { success: true, action: 'completed_and_escalated' }
  }

  const step = steps[currentStep]

  // Get customer info
  const { data: customer } = await supabase
    .from('customer')
    .select('name, phone_number, email, address_line')
    .eq('customer_id', enrollment.customer_id)
    .single()

  if (!customer) return { success: false, error: 'customer_not_found' }

  // Get business info
  const { data: business } = await supabase
    .from('business_config')
    .select('business_name, contact_email, contact_name, phone_number, services_offered, org_number')
    .eq('business_id', enrollment.business_id)
    .single()

  if (!business) return { success: false, error: 'business_not_found' }

  // Build variables for interpolation
  const variables: Record<string, string> = {
    customer_name: customer.name || 'kund',
    business_name: business.business_name || 'Företaget',
    contact_name: business.contact_name || '',
    services: Array.isArray(business.services_offered)
      ? business.services_offered.join(', ')
      : business.services_offered || '',
  }

  // Try to get deal/quote context if available
  if (enrollment.deal_id) {
    const { data: deal } = await supabase
      .from('pipeline_deal')
      .select('title, value')
      .eq('id', enrollment.deal_id)
      .single()

    if (deal) {
      variables.project_title = deal.title || 'Projekt'
      variables.deal_value = deal.value?.toString() || ''
    }
  }

  // Interpolate template
  const message = interpolate(step.template, variables)
  const subject = step.subject ? interpolate(step.subject, variables) : undefined

  // Send via channel
  let sendResult: { success: boolean; error?: string } = { success: false, error: '' }

  if (step.channel === 'sms') {
    sendResult = await sendNurtureSMS({
      to: customer.phone_number,
      message,
      businessId: enrollment.business_id,
      customerId: enrollment.customer_id,
    })
  } else if (step.channel === 'email') {
    sendResult = await sendNurtureEmail({
      to: customer.email,
      subject: subject || `Meddelande från ${business.business_name}`,
      message,
      businessName: business.business_name || 'Handymate',
      contactEmail: business.contact_email,
      orgNumber: business.org_number,
      businessId: enrollment.business_id,
      customerId: enrollment.customer_id,
    })
  }

  if (!sendResult.success) {
    console.error(`Nurture step ${currentStep} failed for ${enrollmentId}:`, sendResult.error)
    // Don't fail the enrollment, just skip this step
  }

  // Advance to next step
  const nextStep = currentStep + 1
  if (nextStep >= steps.length) {
    // Last step done — escalate if no conversion
    await supabase
      .from('nurture_enrollment')
      .update({
        current_step: nextStep,
        status: 'completed',
        completed_at: new Date().toISOString(),
        next_action_at: null,
      })
      .eq('id', enrollmentId)

    // Escalation: notify + create AI suggestion
    await escalateCompletedSequence({
      businessId: enrollment.business_id,
      customerId: enrollment.customer_id,
      sequenceId: enrollment.sequence_id,
      enrollmentId,
    })

    return { success: true, action: `step_${currentStep}_sent_and_escalated` }
  }

  // Calculate next action time
  const nextStepData = steps[nextStep]
  const nextActionAt = new Date()
  nextActionAt.setDate(nextActionAt.getDate() + nextStepData.delay_days)

  await supabase
    .from('nurture_enrollment')
    .update({
      current_step: nextStep,
      next_action_at: nextActionAt.toISOString(),
    })
    .eq('id', enrollmentId)

  return { success: true, action: `step_${currentStep}_sent` }
}

/**
 * Get all due enrollments (next_action_at <= now) for processing.
 */
export async function getDueEnrollments(limit = 50): Promise<NurtureEnrollment[]> {
  const supabase = getServerSupabase()

  const { data } = await supabase
    .from('nurture_enrollment')
    .select('*')
    .eq('status', 'active')
    .lte('next_action_at', new Date().toISOString())
    .order('next_action_at', { ascending: true })
    .limit(limit)

  return (data || []) as NurtureEnrollment[]
}

/**
 * Get nurture stats for a business (dashboard).
 */
export async function getNurtureStats(businessId: string): Promise<{
  active_enrollments: number
  completed_this_week: number
  cancelled_this_week: number
  sequences: { id: string; name: string; trigger_type: string; is_active: boolean; enrolled_count: number }[]
}> {
  const supabase = getServerSupabase()

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const [
    { count: activeCount },
    { count: completedCount },
    { count: cancelledCount },
    { data: sequences },
  ] = await Promise.all([
    supabase
      .from('nurture_enrollment')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'active'),
    supabase
      .from('nurture_enrollment')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .gte('completed_at', weekAgo.toISOString()),
    supabase
      .from('nurture_enrollment')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'cancelled')
      .gte('cancelled_at', weekAgo.toISOString()),
    supabase
      .from('nurture_sequence')
      .select('id, name, trigger_type, is_active')
      .eq('business_id', businessId),
  ])

  // Get enrolled count per sequence
  const seqList = (sequences || []).map((seq: any) => ({
    ...seq,
    enrolled_count: 0,
  }))

  if (seqList.length > 0) {
    const { data: enrollments } = await supabase
      .from('nurture_enrollment')
      .select('sequence_id')
      .eq('business_id', businessId)
      .eq('status', 'active')

    for (const enrollment of (enrollments || [])) {
      const seq = seqList.find((s: any) => s.id === enrollment.sequence_id)
      if (seq) seq.enrolled_count++
    }
  }

  return {
    active_enrollments: activeCount || 0,
    completed_this_week: completedCount || 0,
    cancelled_this_week: cancelledCount || 0,
    sequences: seqList,
  }
}

// ── Escalation & Pause ────────────────────────────────────────

/**
 * Escalate when a nurture sequence completes without customer conversion.
 * Creates a notification + an AI suggestion for manual follow-up.
 */
async function escalateCompletedSequence(params: {
  businessId: string
  customerId: string
  sequenceId: string
  enrollmentId: string
}): Promise<void> {
  const supabase = getServerSupabase()

  try {
    // Get sequence and customer info
    const [{ data: sequence }, { data: customer }] = await Promise.all([
      supabase.from('nurture_sequence').select('name, trigger_type').eq('id', params.sequenceId).single(),
      supabase.from('customer').select('name, phone_number, email').eq('customer_id', params.customerId).single(),
    ])

    const sequenceName = sequence?.name || 'Okänd sekvens'
    const customerName = customer?.name || 'Okänd kund'

    // Create notification
    try {
      const { notifyNurtureComplete, notifyEscalation } = await import('@/lib/notifications')
      await notifyNurtureComplete({
        businessId: params.businessId,
        customerName,
        customerId: params.customerId,
        sequenceName,
      })
      await notifyEscalation({
        businessId: params.businessId,
        title: `Eskalering: ${customerName} svarade inte`,
        message: `"${sequenceName}" avslutades utan konvertering. Kunden har inte svarat på ${sequence?.trigger_type === 'quote_sent' ? 'offerten' : 'kontaktförsöken'}. Manuell uppföljning krävs.`,
        link: `/dashboard/customers/${params.customerId}`,
        metadata: { customer_id: params.customerId, sequence_id: params.sequenceId, enrollment_id: params.enrollmentId },
      })
    } catch { /* non-blocking */ }

    // Create AI suggestion for follow-up
    await supabase.from('ai_suggestion').insert({
      business_id: params.businessId,
      customer_id: params.customerId,
      suggestion_type: 'follow_up',
      title: `Manuell uppföljning: ${customerName}`,
      description: `Uppföljningssekvensen "${sequenceName}" slutfördes utan att kunden svarade. Ring eller besök kunden för personlig kontakt.`,
      priority: 'high',
      status: 'pending',
      suggested_data: {
        reason: 'nurture_sequence_completed_without_conversion',
        sequence_name: sequenceName,
        sequence_id: params.sequenceId,
        customer_phone: customer?.phone_number,
        customer_email: customer?.email,
      },
      source_text: `Automatisk eskalering från "${sequenceName}"`,
    })
  } catch (err: any) {
    console.error('Escalation error (non-blocking):', err.message)
  }
}

/**
 * Pause an active enrollment when a customer responds mid-sequence.
 * Call this from SMS/email incoming handlers when a response is detected.
 */
export async function pauseEnrollmentForResponse(params: {
  businessId: string
  customerId: string
  responseChannel: 'sms' | 'email' | 'call'
  responseText?: string
}): Promise<{ paused: number }> {
  const supabase = getServerSupabase()

  // Find active enrollments for this customer
  const { data: activeEnrollments } = await supabase
    .from('nurture_enrollment')
    .select('id, sequence_id')
    .eq('business_id', params.businessId)
    .eq('customer_id', params.customerId)
    .eq('status', 'active')

  if (!activeEnrollments || activeEnrollments.length === 0) {
    return { paused: 0 }
  }

  // Pause all active enrollments
  const enrollmentIds = activeEnrollments.map((e: any) => e.id)
  await supabase
    .from('nurture_enrollment')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: `customer_responded_via_${params.responseChannel}`,
    })
    .in('id', enrollmentIds)

  // Get customer name for notification
  const { data: customer } = await supabase
    .from('customer')
    .select('name')
    .eq('customer_id', params.customerId)
    .single()

  const customerName = customer?.name || 'Kund'

  // Create notification
  try {
    const { createNotification } = await import('@/lib/notifications')
    await createNotification({
      businessId: params.businessId,
      type: 'nurture_response',
      title: `${customerName} svarade under aktiv sekvens`,
      message: `Uppföljningssekvensen pausades automatiskt. ${params.responseText ? `Svar: "${params.responseText.substring(0, 100)}"` : `Svarade via ${params.responseChannel}`}`,
      link: `/dashboard/customers/${params.customerId}`,
      metadata: {
        customer_id: params.customerId,
        response_channel: params.responseChannel,
        paused_enrollments: enrollmentIds,
      },
    })
  } catch { /* non-blocking */ }

  return { paused: enrollmentIds.length }
}

// ── Internal Helpers ───────────────────────────────────────────

function interpolate(template: string, variables: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '')
  }
  return result
}

async function sendNurtureSMS(params: {
  to: string | null
  message: string
  businessId: string
  customerId: string
}): Promise<{ success: boolean; error?: string }> {
  if (!params.to) return { success: false, error: 'Inget telefonnummer' }

  const ELKS_API_USER = process.env.ELKS_API_USER
  const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD
  if (!ELKS_API_USER || !ELKS_API_PASSWORD) {
    return { success: false, error: '46elks inte konfigurerat' }
  }

  try {
    const response = await fetch('https://api.46elks.com/a1/sms', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        from: 'Handymate',
        to: params.to,
        message: params.message,
      }).toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `SMS failed: ${errorText}` }
    }

    // Log to communication_log
    try {
      const supabase = getServerSupabase()
      await supabase.from('communication_log').insert({
        business_id: params.businessId,
        customer_id: params.customerId,
        channel: 'sms',
        direction: 'outbound',
        subject: 'Nurture SMS',
        message: params.message,
        status: 'sent',
        metadata: { source: 'nurture_sequence' },
      })
    } catch { /* non-blocking */ }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function sendNurtureEmail(params: {
  to: string | null
  subject: string
  message: string
  businessName: string
  contactEmail?: string
  orgNumber?: string
  businessId: string
  customerId: string
}): Promise<{ success: boolean; error?: string }> {
  if (!params.to) return { success: false, error: 'Ingen e-postadress' }

  try {
    const { sendEmail } = await import('@/lib/email')
    const { nurtureStepEmail } = await import('@/lib/email-templates')

    const { html } = nurtureStepEmail({
      branding: {
        businessName: params.businessName,
        contactEmail: params.contactEmail,
        orgNumber: params.orgNumber,
      },
      subject: params.subject,
      message: params.message,
    })

    const result = await sendEmail({
      to: params.to,
      subject: params.subject,
      html,
      fromName: params.businessName,
      replyTo: params.contactEmail,
    })

    if (!result.success) {
      return { success: false, error: result.error }
    }

    // Log to communication_log
    try {
      const { logEmail } = await import('@/lib/email')
      await logEmail({
        businessId: params.businessId,
        customerId: params.customerId,
        to: params.to,
        subject: params.subject,
        channel: 'email',
        status: 'sent',
        messageId: result.messageId,
      })
    } catch { /* non-blocking */ }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
