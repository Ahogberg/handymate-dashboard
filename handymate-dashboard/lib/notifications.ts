/**
 * Notification system for Handymate.
 * Creates and manages in-app notifications for all key business events.
 */

import { getServerSupabase } from '@/lib/supabase'

export interface CreateNotificationParams {
  businessId: string
  userId?: string
  type: string
  title: string
  message?: string
  icon?: string
  link?: string
  metadata?: Record<string, any>
}

/**
 * Create a notification. Non-blocking — errors are logged but never thrown.
 */
export async function createNotification(params: CreateNotificationParams): Promise<string | null> {
  try {
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('notification')
      .insert({
        business_id: params.businessId,
        user_id: params.userId || null,
        type: params.type,
        title: params.title,
        message: params.message || null,
        icon: params.icon || getIconForType(params.type),
        link: params.link || null,
        metadata: params.metadata || {},
      })
      .select('id')
      .single()

    if (error) {
      console.error('Failed to create notification:', error.message)
      return null
    }
    return data?.id || null
  } catch (err: any) {
    console.error('Notification create error:', err.message)
    return null
  }
}

/**
 * Create multiple notifications at once.
 */
export async function createNotifications(
  notifications: CreateNotificationParams[]
): Promise<void> {
  if (notifications.length === 0) return
  try {
    const supabase = getServerSupabase()
    await supabase.from('notification').insert(
      notifications.map(n => ({
        business_id: n.businessId,
        user_id: n.userId || null,
        type: n.type,
        title: n.title,
        message: n.message || null,
        icon: n.icon || getIconForType(n.type),
        link: n.link || null,
        metadata: n.metadata || {},
      }))
    )
  } catch (err: any) {
    console.error('Batch notification error:', err.message)
  }
}

/**
 * Get default lucide icon name based on notification type.
 */
function getIconForType(type: string): string {
  const iconMap: Record<string, string> = {
    auto_approve: 'zap',
    booking_conflict: 'alert-triangle',
    new_lead: 'user-plus',
    quote_signed: 'check-circle',
    quote_declined: 'x-circle',
    missed_call: 'phone-missed',
    invoice_paid: 'banknote',
    invoice_overdue: 'clock',
    nurture_complete: 'flag',
    nurture_response: 'message-square',
    escalation: 'alert-circle',
    system: 'bell',
  }
  return iconMap[type] || 'bell'
}

// ── Convenience helpers for common events ─────────────────────

export async function notifyAutoApprove(params: {
  businessId: string
  actionType: string
  title: string
  confidence: number
  resultId?: string
}): Promise<void> {
  const linkMap: Record<string, string> = {
    booking: '/dashboard/schedule',
    quote: '/dashboard/quotes',
    sms: '/dashboard/calls',
    create_customer: '/dashboard/customers',
    follow_up: '/dashboard/calls',
    callback: '/dashboard/calls',
    reminder: '/dashboard/calls',
    reschedule: '/dashboard/schedule',
  }

  await createNotification({
    businessId: params.businessId,
    type: 'auto_approve',
    title: `Auto-godkänd: ${params.title}`,
    message: `AI godkände automatiskt (${params.confidence}% konfidens)`,
    link: linkMap[params.actionType] || '/dashboard',
    metadata: { action_type: params.actionType, confidence: params.confidence, result_id: params.resultId },
  })
}

export async function notifyBookingConflict(params: {
  businessId: string
  customerName: string
  requestedDate: string
  requestedTime: string
  conflicts: string[]
}): Promise<void> {
  await createNotification({
    businessId: params.businessId,
    type: 'booking_conflict',
    title: `Bokningskonflikt: ${params.customerName}`,
    message: `Begärd tid ${params.requestedDate} kl ${params.requestedTime} krockar med ${params.conflicts.length} post(er)`,
    link: '/dashboard/schedule',
    metadata: { conflicts: params.conflicts },
  })
}

export async function notifyNewLead(params: {
  businessId: string
  customerName: string
  customerId: string
  source?: string
}): Promise<void> {
  await createNotification({
    businessId: params.businessId,
    type: 'new_lead',
    title: `Ny lead: ${params.customerName}`,
    message: params.source ? `Via ${params.source}` : 'Ny potentiell kund registrerad',
    link: `/dashboard/customers/${params.customerId}`,
    metadata: { customer_id: params.customerId, source: params.source },
  })
}

export async function notifyQuoteSigned(params: {
  businessId: string
  customerName: string
  quoteId: string
  total: number
}): Promise<void> {
  await createNotification({
    businessId: params.businessId,
    type: 'quote_signed',
    title: `Offert accepterad: ${params.customerName}`,
    message: `${params.total.toLocaleString('sv-SE')} kr`,
    link: `/dashboard/quotes/${params.quoteId}`,
    metadata: { quote_id: params.quoteId, total: params.total },
  })
}

export async function notifyMissedCall(params: {
  businessId: string
  phoneNumber: string
  customerName?: string
}): Promise<void> {
  await createNotification({
    businessId: params.businessId,
    type: 'missed_call',
    title: `Missat samtal: ${params.customerName || params.phoneNumber}`,
    message: `Ring tillbaka ${params.phoneNumber}`,
    link: '/dashboard/calls',
    metadata: { phone_number: params.phoneNumber },
  })
}

export async function notifyInvoicePaid(params: {
  businessId: string
  invoiceNumber: string
  customerName: string
  total: number
}): Promise<void> {
  await createNotification({
    businessId: params.businessId,
    type: 'invoice_paid',
    title: `Faktura betald: #${params.invoiceNumber}`,
    message: `${params.customerName} betalade ${params.total.toLocaleString('sv-SE')} kr`,
    link: '/dashboard/invoices',
    metadata: { invoice_number: params.invoiceNumber, total: params.total },
  })
}

export async function notifyInvoiceOverdue(params: {
  businessId: string
  invoiceNumber: string
  customerName: string
  total: number
  daysPastDue: number
}): Promise<void> {
  await createNotification({
    businessId: params.businessId,
    type: 'invoice_overdue',
    title: `Förfallen faktura: #${params.invoiceNumber}`,
    message: `${params.customerName} — ${params.total.toLocaleString('sv-SE')} kr, ${params.daysPastDue} dagar försenad`,
    link: '/dashboard/invoices',
    metadata: { invoice_number: params.invoiceNumber, total: params.total, days_past_due: params.daysPastDue },
  })
}

export async function notifyNurtureComplete(params: {
  businessId: string
  customerName: string
  customerId: string
  sequenceName: string
}): Promise<void> {
  await createNotification({
    businessId: params.businessId,
    type: 'nurture_complete',
    title: `Sekvens slutförd utan svar: ${params.customerName}`,
    message: `"${params.sequenceName}" avslutades utan konvertering. Manuell uppföljning rekommenderas.`,
    link: `/dashboard/customers/${params.customerId}`,
    metadata: { customer_id: params.customerId, sequence_name: params.sequenceName },
  })
}

export async function notifyEscalation(params: {
  businessId: string
  title: string
  message: string
  link?: string
  metadata?: Record<string, any>
}): Promise<void> {
  await createNotification({
    businessId: params.businessId,
    type: 'escalation',
    title: params.title,
    message: params.message,
    link: params.link || '/dashboard/calls',
    metadata: params.metadata || {},
  })
}
