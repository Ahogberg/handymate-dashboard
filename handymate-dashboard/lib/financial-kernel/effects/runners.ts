import { getServerSupabase } from '@/lib/supabase'
import { sendLegacyPaymentPortal, runPostPaymentAutomations, preparePaymentCustomerMessages, type PaymentEffect } from '@/lib/invoices/apply-payment'
import { sendPaymentThanks, scheduleReviewRequest } from '@/lib/invoices/payment-thanks'
import { money, toLegacyNumber } from '../money'
import type { EffectClaim } from '../commands/service'

/** Context comes from the original command, never from the request sweeping it. */
export async function runPaymentEffect(businessId:string, invoiceId:string, claim:EffectClaim):Promise<PaymentEffect> {
  const sb=getServerSupabase()
  const {data:invoice,error}=await sb.from('invoice').select('*, customer:customer_id(customer_id,name,phone_number,email)')
    .eq('business_id',businessId).eq('invoice_id',invoiceId).single()
  if(error || !invoice) throw new Error(error?.message || 'Faktura hittades inte')
  const {source,approvalFollowUps:reviewed,paidAmountMinor}=claim.context
  const amount=toLegacyNumber(money(BigInt(paidAmountMinor),'SEK'))
  if(claim.effect==='invoice_paid_thanks') return sendPaymentThanks(sb,businessId,invoice,invoiceId)
  if(claim.effect==='review_request_schedule') return scheduleReviewRequest(sb,businessId,invoice,invoiceId)
  if(reviewed && (claim.effect==='portal_message' || claim.effect==='review_request')) {
    const effects=await preparePaymentCustomerMessages(sb,businessId,reviewed.approvalId,invoice,amount,claim.effect)
    return effects.find(e=>e.effect===claim.effect) || {effect:claim.effect,status:'skipped'}
  }
  if(claim.effect==='portal_message') {
    if(!invoice.customer_id) return {effect:claim.effect,status:'skipped',message:'Kund saknas'}
    return sendLegacyPaymentPortal(businessId,invoice.customer_id,amount,invoice.invoice_number || invoice.fortnox_invoice_number || invoiceId)
  }
  const effects=await runPostPaymentAutomations(invoiceId,businessId,invoice.customer_id,{
    only:[claim.effect],triggeredBy:source==='fortnox'||source==='bridge'?'system':'user',reason:source==='fortnox'?'Faktura betald (Fortnox-synk)':'Betal-markering',
    logPrefix:`[apply-payment/${source}]`,updateWorkflows:reviewed?.updateWorkflows!==false,
    runCustomerCommunication:!reviewed,runAutomationRules:reviewed?.runAutomationRules!==false,requireExplicitApproval:!!reviewed,
  })
  return effects.find(e=>e.effect===claim.effect) || {effect:claim.effect,status:'skipped'}
}
