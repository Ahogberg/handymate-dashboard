/** Shared wire contract. No secret, database access or client-supplied preview. */
export interface ApprovalReview {
  title: string
  effect: string
  confirmLabel: string | null
  messages: { channel: 'SMS' | 'E-post'; recipients: string[]; subject?: string; text: string; html?: string }[]
  details?: { label: string; text: string }[]
  attachments?: { label: string; url: string; kind: 'image' | 'document' }[]
  open?: { label: string; path: string }
  choices?: { id: string; label: string; description: string; defaultSelected: boolean; required?: boolean }[]
  blockedReason?: string
}

// Every mutation that does not yet have a complete execution-bound preview
// stays pending. This includes indirect sends (booking/closeout/automation).
// Do not add a permissive fallback for a new approval type.
export const REVIEWABLE_MESSAGE_TYPES = [
  'send_sms', 'quote_nudge', 'send_email', 'send_matte_customer_reply',
  'review_request', 'scheduled_review_request', 'yearly_followup',
  'proactive_care', 'warranty_followup', 'customer_reactivation', 'seasonal_campaign',
] as const

export const INTERNAL_REVIEW: Record<string, { label: string; effect: string; required: string[]; fields: Record<string, string> }> = {
  meeting_followup: { label: 'Skapa uppgiften', effect: 'Skapar en intern uppgift som hela teamet kan se.', required: ['title'], fields: { title: 'Uppgift', description: 'Beskrivning', source_text: 'Ur mötet', due_date: 'Senast', priority: 'Prioritet' } },
  project_log_note: { label: 'Spara i dagboken', effect: 'Sparar samtalssammanfattningen i projektets dagbok.', required: ['project_id', 'recording_id', 'summary'], fields: { project_name: 'Projekt', summary: 'Anteckning', call_date: 'Samtalsdatum' } },
  create_quote_draft: { label: 'Skapa offertutkast', effect: 'AI skapar och sparar ett offertutkast utifrån underlaget. Utkastet behöver granskas separat före utskick.', required: ['description'], fields: { description: 'Underlag', job_description: 'Arbete', customer_reply_pending: 'Kundens önskemål' } },
  create_ata_draft: { label: 'Skapa ÄTA-utkast', effect: 'AI skapar ett ÄTA-utkast för projektet, eller ett offertutkast om projekt saknas. Utkastet behöver granskas separat före utskick.', required: ['description'], fields: { project_name: 'Projekt', description: 'Underlag', source_text: 'Källa' } },
  price_adjustment: { label: 'Ändra timpriset', effect: 'Ersätter prislistans ordinarie timpris med det föreslagna priset.', required: ['price_list_id', 'suggested_rate'], fields: { price_list_name: 'Prislista', current_rate: 'Tidigare timpris', suggested_rate: 'Nytt timpris (kr)' } },
  playbook_pattern_confirmation: { label: 'Spara företagets arbetssätt', effect: 'Sparar mönstret i företagets kunskap. Kan skapa ett separat förslag om att prova arbetssättet.', required: ['pattern_text', 'job_type'], fields: { job_type: 'Jobbtyp', pattern_text: 'Arbetssätt', sample_count: 'Antal underlag' } },
  playbook_kickoff_suggestion: { label: 'Skapa kontrollpunkten', effect: 'Skapar en kontrollpunkt på projektet och kan koppla projektet till ett aktivt försök med arbetssättet.', required: ['project_id', 'pattern_text'], fields: { project_name: 'Projekt', job_type: 'Jobbtyp', pattern_text: 'Kontrollpunkt' } },
}

export function buildApprovalReview(approval: {
  approval_type: string; title?: string; payload?: Record<string, any> | null
}): ApprovalReview {
  const p = approval.payload || {}
  const type = approval.approval_type
  const review: ApprovalReview = {
    title: approval.title || 'Granska förslaget',
    effect: 'Granska underlaget innan du bestämmer vad som ska utföras.',
    confirmLabel: null, messages: [],
  }
  const internal = INTERNAL_REVIEW[type]
  if (internal) {
    review.effect = internal.effect
    review.details = Object.entries(internal.fields).flatMap(([key, label]) =>
      (typeof p[key] === 'string' || typeof p[key] === 'number') ? [{ label, text: String(p[key]) }] : [])
    if (internal.required.some(key => p[key] == null || p[key] === '') ||
        (type === 'price_adjustment' && (typeof p.suggested_rate !== 'number' || p.suggested_rate <= 0 || !p.price_list_name))) {
      review.blockedReason = 'Underlaget är ofullständigt. Öppna ärendet och komplettera före beslut.'
    } else review.confirmLabel = internal.label
    return review
  }
  if (!(REVIEWABLE_MESSAGE_TYPES as readonly string[]).includes(type)) {
    review.blockedReason = 'Det här ärendet saknar en fullständig förhandsvisning av handlingen och dess följder. Det ligger kvar för granskning. Inget har utförts.'
    return review
  }
  let text: unknown, recipients: unknown[] = [], subject: unknown
  if (type === 'seasonal_campaign') {
    text = p.sms_text
    recipients = Array.isArray(p.customers) ? p.customers.map((c: any) => c?.phone_number) : []
  } else if (type === 'send_email') {
    text = p.body; subject = p.subject; recipients = [p.to]
  } else if (['proactive_care', 'warranty_followup', 'customer_reactivation'].includes(type)) {
    text = p.suggested_sms; recipients = [p.customer_phone]
  } else if (type === 'send_matte_customer_reply') {
    text = p.customer_reply_pending || p.message; recipients = [p.entity?.phone]
  } else {
    text = p.message
    recipients = [type === 'send_sms' || type === 'quote_nudge' ? p.to || p.customer_phone : p.to]
  }
  const validAddress = (v: unknown) => typeof v === 'string' &&
    (type === 'send_email' ? /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(v) : /^\+?[\d ()-]{6,25}$/.test(v))
  if (typeof text !== 'string' || !text.trim() || !recipients.length ||
      !recipients.every(validAddress) ||
      new Set(recipients.map(v => String(v).replace(/[ ()-]/g, ''))).size !== recipients.length ||
      (type === 'send_email' && (typeof subject !== 'string' || !subject.trim()))) {
    review.blockedReason = 'Fullständig text eller giltiga, unika mottagare saknas. Rätta underlaget först. Inget har skickats.'
    return review
  }
  review.messages = [{ channel: type === 'send_email' ? 'E-post' : 'SMS', recipients: recipients as string[], text,
    ...(typeof subject === 'string' ? { subject } : {}) }]
  review.effect = type === 'seasonal_campaign'
    ? `Kampanjen köas för utskick via SMS till ${recipients.length} mottagare. Utskicket börjar vid nästa kampanjkörning.`
    : `Meddelandet skickas nu via ${type === 'send_email' ? 'e-post' : 'SMS'}.`
  review.confirmLabel = type === 'seasonal_campaign' ? 'Bekräfta och köa utskicket' : 'Bekräfta och skicka'
  return review
}
