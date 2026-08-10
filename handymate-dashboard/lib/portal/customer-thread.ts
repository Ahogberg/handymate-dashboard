import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Kundens samtalstråd i portalen — EN kanal för all kundkommunikation.
 *
 * Bakgrund (kartläggning 2026-08-06): tråden fanns redan (`customer_message`,
 * kundens chatt i portalen) men var ett svart hål. Kundens meddelanden skrevs
 * till tabellen och stannade där: ingen vy i dashboarden, ingen notis, ingen
 * kö. Om en pilotkund skrev något såg hantverkaren det aldrig.
 *
 * Samtidigt landade kundens offertfråga bara som ett godkännande-kort, utan
 * att synas i tråden — så kunden hade ingen historik över vad hen frågat.
 *
 * Den här modulen gör tråden till KÄLLAN och godkännande-kön till
 * ÅTGÄRDSYTAN: varje inkommande meddelande skrivs i tråden OCH skapar ett
 * kort med push. Ett samtal, inte två system.
 *
 * Rena funktioner (kontextprefixet) facit-testas i tests/customer-thread.spec.ts.
 */

export interface QuoteContext {
  quoteNumber?: string | null
  quoteTitle?: string | null
  /** Radens beskrivning när frågan gäller en specifik offertrad. */
  itemDescription?: string | null
}

/**
 * Bygger den mening som visar VAD kunden frågade om, så tråden är begriplig
 * även månader senare. Utan sammanhang blir "vad ingår här?" obegripligt när
 * hantverkaren läser tråden nästa gång.
 */
export function buildQuoteContextPrefix(context: QuoteContext): string {
  const parts: string[] = []
  const label = context.quoteNumber
    ? `offert ${context.quoteNumber}`
    : context.quoteTitle
      ? `offerten "${context.quoteTitle}"`
      : null
  if (label) parts.push(`Om ${label}`)
  if (context.itemDescription) parts.push(`raden "${context.itemDescription}"`)
  return parts.length > 0 ? `${parts.join(', ')}: ` : ''
}

export interface InboundMessageInput {
  businessId: string
  customerId: string
  customerName?: string | null
  customerPhone?: string | null
  /** Kundens egna ord, utan prefix. */
  message: string
  /** Sätts när meddelandet kom via en offert. */
  quote?: (QuoteContext & { quoteId?: string | null; itemId?: string | null }) | null
}

export interface InboundMessageResult {
  threadWritten: boolean
  approvalCreated: boolean
  /** Den skrivna trådraden — portalen visar den direkt utan omhämtning.
      Utan den försvann kundens meddelande ur vyn tills nästa sidladdning
      (POST:en returnerade bara success, klienten appendade undefined). */
  message?: { id: string; direction: string; message: string; read_at: string | null; created_at: string } | null
}

/**
 * Kundens meddelande in: skriv i tråden, skapa kort, notifiera.
 *
 * Trådskrivningen är det viktiga — den får aldrig hoppas över för att
 * kortskapandet failar, och tvärtom. Båda görs därför oberoende och rapporteras
 * separat, så anroparen kan svara ärligt om något gick fel.
 */
export async function receiveCustomerMessage(
  supabase: SupabaseClient,
  input: InboundMessageInput,
): Promise<InboundMessageResult> {
  const result: InboundMessageResult = { threadWritten: false, approvalCreated: false }

  const trimmed = (input.message || '').trim()
  if (!trimmed) return result

  const prefix = input.quote ? buildQuoteContextPrefix(input.quote) : ''
  const threadMessage = `${prefix}${trimmed}`

  const { data: threadRow, error: threadErr } = await supabase
    .from('customer_message')
    .insert({
      business_id: input.businessId,
      customer_id: input.customerId,
      direction: 'inbound',
      message: threadMessage,
    })
    .select('id, direction, message, read_at, created_at')
    .single()
  if (threadErr) {
    console.error('[customer-thread] kunde inte skriva i tråden:', threadErr.message)
  } else {
    result.threadWritten = true
    result.message = threadRow
  }

  const customerName = input.customerName || 'Kunden'
  const isQuoteQuestion = !!input.quote
  const approvalType = isQuoteQuestion ? 'customer_quote_question' : 'customer_message'

  const title = isQuoteQuestion
    ? input.quote?.itemDescription
      ? `${customerName} frågar om "${input.quote.itemDescription}"`
      : `${customerName} har en fråga om offerten`
    : `${customerName} har skrivit till dig`

  const { error: approvalErr } = await supabase.from('pending_approvals').insert({
    id: `appr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    business_id: input.businessId,
    approval_type: approvalType,
    title,
    description: trimmed,
    payload: {
      agent: 'daniel',
      customer_id: input.customerId,
      customer_name: customerName,
      customer_phone: input.customerPhone || null,
      question: trimmed,
      quote_id: input.quote?.quoteId || null,
      quote_number: input.quote?.quoteNumber || null,
      quote_title: input.quote?.quoteTitle || null,
      item_id: input.quote?.itemId || null,
      item_description: input.quote?.itemDescription || null,
      // `message` MÅSTE finnas för att svarsrutan i godkännande-kön ska
      // renderas alls (getMessagePreview letar efter message/sms_text/body).
      // Utan den var hela svarsvägen död kod. Förifylld mall — vi ger en
      // formulering att bygga på, aldrig ett påhittat svar.
      message: buildReplyDraft(customerName),
    },
    status: 'pending',
    risk_level: 'low',
  })

  if (approvalErr) {
    console.error('[customer-thread] kunde inte skapa kort:', approvalErr.message)
  } else {
    result.approvalCreated = true
    try {
      const { sendApprovalPush } = await import('@/lib/notifications/approval-push')
      void sendApprovalPush({
        business_id: input.businessId,
        approval_type: approvalType,
        payload: { customer_name: customerName, question: trimmed },
      })
    } catch { /* non-blocking */ }
  }

  return result
}

/** Förifylld inledning som hantverkaren skriver klart. Aldrig ett helt svar. */
export function buildReplyDraft(customerName: string): string {
  const firstName = String(customerName || '').trim().split(' ')[0] || ''
  return firstName ? `Hej ${firstName}! Tack för din fråga — ` : 'Hej! Tack för din fråga — '
}

export interface OutboundReplyInput {
  businessId: string
  customerId: string
  /** Hantverkarens färdiga svar. */
  message: string
}

/**
 * Hantverkarens svar ut: skriv i tråden. SMS-aviseringen görs av anroparen,
 * som redan äger kvot- och opt-out-kontrollen (approvals sendSms-closure).
 */
export async function sendCustomerReply(
  supabase: SupabaseClient,
  input: OutboundReplyInput,
): Promise<boolean> {
  const trimmed = (input.message || '').trim()
  if (!trimmed) return false

  const { error } = await supabase.from('customer_message').insert({
    business_id: input.businessId,
    customer_id: input.customerId,
    direction: 'outbound',
    message: trimmed,
  })
  if (error) {
    console.error('[customer-thread] kunde inte skriva svaret i tråden:', error.message)
    return false
  }

  // ═══ SVARAT = LÄST (2026-08-10) ═══
  //
  // Portalens "Läst"-kvitto kunde aldrig bli sant: ingenting på
  // hantverkarens sida satte read_at på kundens meddelanden. Det enda
  // otvetydiga läs-ögonblicket är SVARET — den som svarar har läst.
  // Fail-soft: ett misslyckat kvitto får aldrig fälla ett svar som
  // redan skrivits i tråden.
  const { error: kvittoErr } = await supabase
    .from('customer_message')
    .update({ read_at: new Date().toISOString() })
    .eq('business_id', input.businessId)
    .eq('customer_id', input.customerId)
    .eq('direction', 'inbound')
    .is('read_at', null)
  if (kvittoErr) {
    console.error('[customer-thread] läskvittot kunde inte sättas (non-blocking):', kvittoErr.message)
  }

  return true
}

/** Kort SMS som drar kunden tillbaka till portalen där hela samtalet finns. */
export function buildReplyNotificationSms(businessName: string | null | undefined, portalUrl: string): string {
  const name = (businessName || '').trim()
  return name
    ? `Du har fått svar från ${name}. Läs här: ${portalUrl}`
    : `Du har fått svar på din fråga. Läs här: ${portalUrl}`
}
