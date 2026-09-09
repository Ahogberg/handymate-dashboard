import type { SupabaseClient } from '@supabase/supabase-js'
import { notifyReceivedLead } from './golden-path'

export interface IntakeInput {
  name: string
  phone: string
  email: string | null
  message: string | null
  source_ref: string | null
  lead_source_id: string | null
  category?: string | null
  estimated_value?: number | null
  address_line?: string | null
}
export interface IntakeReceipt {
  id: string
  business_id: string
  input: IntakeInput
  state: 'received' | 'blocked' | 'completed'
  error_code: string | null
  customer_id: string | null
  lead_id: string | null
  deal_id: string | null
  notice_state: 'not_started' | 'attempted' | 'confirmed' | 'uncertain'
}
export class IntakeError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

export function intakeInput(body: unknown, sourceId: string | null): IntakeInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new IntakeError('Förfrågan har ogiltigt format.', 400)
  const b = body as Record<string, unknown>
  const text = (key: string, max: number, required = false): string | null => {
    const value = b[key]
    if (value == null && !required) return null
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new IntakeError(`Kontrollera ${({ name: 'namnet', phone: 'telefonnumret', email: 'e-postadressen', message: 'meddelandet', source_ref: 'källreferensen' } as Record<string, string>)[key]}.`, 400)
    return value.trim() || null
  }
  return { name: text('name', 200, true)!, phone: text('phone', 80, true)!, email: text('email', 320), message: text('message', 10000), source_ref: text('source_ref', 1000), lead_source_id: sourceId }
}

export async function receiveIntake(db: SupabaseClient, businessId: string, sourceScope: string, requestKey: string, input: IntakeInput, rpcName: 'receive_lead_intake' | 'receive_portal_lead_intake' = 'receive_lead_intake'): Promise<IntakeReceipt> {
  if (!/^[A-Za-z0-9._:-]{8,100}$/.test(requestKey)) throw new IntakeError('Förfrågans återförsöksnyckel är ogiltig.', 400)
  const { data, error } = await db.rpc(rpcName, { p_business: businessId, p_scope: sourceScope, p_key: requestKey, p_input: input })
  if (error || !data?.id) {
    if (error?.message?.includes('intake_request_changed')) throw new IntakeError('Samma återförsöksnyckel har använts för en ändrad förfrågan.', 409)
    throw new IntakeError('Förfrågan kunde inte tas emot. Försök igen med samma återförsöksnyckel.', 503)
  }
  return data as IntakeReceipt
}

export async function completeIntake(db: SupabaseClient, businessId: string, receiptId: string): Promise<IntakeReceipt> {
  const { data, error } = await db.rpc('complete_lead_intake', { p_business: businessId, p_id: receiptId })
  if (error || !data?.receipt?.id) {
    if (error?.message?.includes('intake_missing')) throw new IntakeError('Förfrågan kunde inte hittas.', 404)
    // Receive already committed. Never fall back to the legacy insert path.
    throw new IntakeError('Förfrågan är mottagen men resultatet kunde inte kontrolleras. Använd samma återförsöksnyckel.', 503)
  }
  const receipt = data.receipt as IntakeReceipt
  if (receipt.state === 'completed' && receipt.notice_state === 'not_started') {
    // Claim only after data is durable. Never automatically retry an attempted
    // notification: a transport error does not prove the SMS was not sent.
    const { data: business, error: businessError } = await db.from('business_config').select('phone_number').eq('business_id', businessId).maybeSingle()
    if (!businessError && business) {
      const { data: claimed, error: claimError } = await db.from('lead_intake_request')
        .update({ notice_state: 'attempted', updated_at: new Date().toISOString() })
        .eq('id', receipt.id).eq('business_id', businessId).eq('notice_state', 'not_started').select('id').maybeSingle()
      if (!claimError && claimed) {
        let confirmed = false
        receipt.notice_state = 'attempted'
        try {
          try {
            const { syncNewCustomerToFortnox } = await import('@/lib/fortnox/sync')
            await syncNewCustomerToFortnox(db, businessId, receipt.customer_id!)
          } catch { /* customer sync is best-effort, as in the legacy path */ }
          confirmed = await notifyReceivedLead({ businessId, businessPhoneNumber: business.phone_number,
            name: receipt.input.name, phone: receipt.input.phone, email: receipt.input.email, message: receipt.input.message, source: 'website_form' }, receipt.lead_id!, receipt.customer_id!, db)
        } catch { /* retained as uncertain; entity receipt remains true */ }
        const state = confirmed ? 'confirmed' : 'uncertain'
        const { data: saved, error: savedError } = await db.from('lead_intake_request').update({ notice_state: state, updated_at: new Date().toISOString() })
          .eq('id', receipt.id).eq('business_id', businessId).eq('notice_state', 'attempted').select('id').maybeSingle()
        if (!savedError && saved) receipt.notice_state = state
      }
    }
  }
  return receipt
}

export function intakeReply(receipt: IntakeReceipt) {
  const completed = receipt.state === 'completed'
  return {
    success: completed,
    received: true,
    receipt_id: receipt.id,
    state: receipt.state,
    deal_created: completed && !!receipt.deal_id,
    lead_id: completed ? receipt.lead_id : null,
    message: completed ? 'Förfrågan och affären är sparade.'
      : receipt.error_code === 'customer_ambiguous' ? 'Förfrågan är mottagen. Kundkopplingen behöver granskas innan den kan slutföras.'
      : 'Förfrågan är mottagen men behöver slutföras. Försök igen med samma återförsöksnyckel.',
  }
}
