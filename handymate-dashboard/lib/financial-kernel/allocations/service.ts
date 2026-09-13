import type { KernelDb } from '../events/publish'
import type { Money } from '../money'
import { domainRpc,text,bool,exactMoney,type Actor,type Component } from '../receivables/service'

export async function recordPaymentSettlement(db:KernelDb,businessId:string,input:{provider:string;providerRef?:string;direction:'inbound'|'outbound';method?:string;amount:Money;fee?:Money;evidence:'provider'|'manual'|'fortnox'|'bank';settledAt:string;correlationId?:string;idempotencyKey:string;actor:Actor}):Promise<{inserted:boolean;paymentId:string;unallocated:Money}>{
  if(input.fee&&input.fee.currency!==input.amount.currency)throw new TypeError('Fee currency mismatch')
  const r=await domainRpc(db,'record_payment_settlement',{p_business_id:businessId,p_provider:input.provider,p_provider_ref:input.providerRef??null,
    p_direction:input.direction,p_method:input.method??null,p_currency:input.amount.currency,p_amount_minor:input.amount.amountMinor.toString(),
    p_fee_minor:input.fee?.amountMinor.toString()??null,p_evidence:input.evidence,p_settled_at:input.settledAt,p_correlation_id:input.correlationId??null,
    p_idempotency_key:input.idempotencyKey,p_actor_type:input.actor.type,p_actor_id:input.actor.id??null})
  return {inserted:bool(r.inserted),paymentId:text(r.payment_id),unallocated:exactMoney(r.unallocated_minor,r.currency)}
}
export async function allocatePayment(db:KernelDb,businessId:string,input:{paymentId:string;receivableId:string;amount:Money;idempotencyKey:string;actor:Actor}):Promise<{inserted:boolean;allocationId:string;receivableSettled:boolean;component:Component;outstanding:Money;paymentUnallocated:Money}>{
  const r=await domainRpc(db,'allocate_payment',{p_business_id:businessId,p_payment_id:input.paymentId,p_receivable_id:input.receivableId,
    p_amount_minor:input.amount.amountMinor.toString(),p_currency:input.amount.currency,p_idempotency_key:input.idempotencyKey,p_actor_type:input.actor.type,p_actor_id:input.actor.id??null})
  if(r.component!=='customer'&&r.component!=='tax_authority')throw new TypeError('Invalid component')
  return {inserted:bool(r.inserted),allocationId:text(r.allocation_id),receivableSettled:bool(r.receivable_settled),component:r.component,
    outstanding:exactMoney(r.outstanding_minor,r.currency),paymentUnallocated:exactMoney(r.payment_unallocated_minor,r.currency)}
}
export async function reversePaymentAllocation(db:KernelDb,businessId:string,input:{allocationId:string;reason:string;actor:Actor}):Promise<{inserted:boolean;receivableReopened:boolean}>{
  const r=await domainRpc(db,'reverse_payment_allocation',{p_business_id:businessId,p_allocation_id:input.allocationId,p_reason:input.reason,p_actor_type:input.actor.type,p_actor_id:input.actor.id??null})
  return {inserted:bool(r.inserted),receivableReopened:bool(r.receivable_reopened)}
}
