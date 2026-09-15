import { money,type Money,type CurrencyCode } from '../money'
import type { KernelDb } from '../events/publish'
import type { FinancialActorType } from '../events/types'

export type Actor={type:FinancialActorType;id?:string}
export type Component='customer'|'tax_authority'
export type AdjustmentReason='credit'|'write_off'|'dunning_fee'|'interest'|'rounding'|'ownership_transfer'|'reclassification'
export interface ReceivableView {
  id:string;invoiceId:string;component:Component;owner:'business'|'factor';origin:'invoice'|'opening_balance'
  amount:Money;adjusted:Money;allocated:Money;outstanding:Money;status:'open'|'settled'|'closed';dueDate?:string;settledAt?:string
}
export function object(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('Expected domain RPC object')
  return value as Record<string,unknown>
}
export function text(value:unknown):string{if(typeof value!=='string')throw new TypeError('Expected string');return value}
export function bool(value:unknown):boolean{if(typeof value!=='boolean')throw new TypeError('Expected boolean');return value}
export function exactMoney(value:unknown,currency:unknown):Money{
  const s=text(value);if(!/^-?\d+$/.test(s))throw new TypeError('Expected lossless minor-unit string')
  return money(BigInt(s),text(currency) as CurrencyCode)
}
export async function domainRpc(db:KernelDb,name:string,args:Record<string,unknown>):Promise<Record<string,unknown>>{
  const {data,error}=await db.rpc(name,args);if(error)throw new Error(error.message);return object(data)
}
export function receivable(value:unknown):ReceivableView{
  const r=object(value)
  if(!['customer','tax_authority'].includes(text(r.component))||!['business','factor'].includes(text(r.owner))||
    !['invoice','opening_balance'].includes(text(r.origin))||!['open','settled','closed'].includes(text(r.status)))throw new TypeError('Invalid receivable state')
  return {id:text(r.id),invoiceId:text(r.invoice_id),component:r.component as Component,owner:r.owner as ReceivableView['owner'],
    origin:r.origin as ReceivableView['origin'],status:r.status as ReceivableView['status'],amount:exactMoney(r.amount_minor,r.currency),
    adjusted:exactMoney(r.adjusted_minor,r.currency),allocated:exactMoney(r.allocated_minor,r.currency),outstanding:exactMoney(r.outstanding_minor,r.currency),
    ...(r.due_date==null?{}:{dueDate:text(r.due_date)}),...(r.settled_at==null?{}:{settledAt:text(r.settled_at)})}
}
export async function issueInvoiceReceivables(db:KernelDb,businessId:string,invoiceId:string,actor:Actor):Promise<{inserted:boolean;receivables:ReceivableView[]}>{
  const r=await domainRpc(db,'issue_invoice_receivables',{p_business_id:businessId,p_invoice_id:invoiceId,p_actor_type:actor.type,p_actor_id:actor.id??null})
  if(!Array.isArray(r.receivables))throw new TypeError('Missing receivables')
  return {inserted:bool(r.inserted),receivables:r.receivables.map(receivable)}
}
export async function adjustReceivable(db:KernelDb,businessId:string,input:{receivableId:string;reason:AdjustmentReason;delta:Money;ownerAfter?:'business'|'factor';source?:{type:string;id:string};idempotencyKey:string;actor:Actor}):Promise<{inserted:boolean;receivableSettled:boolean;component:Component;receivable:ReceivableView}>{
  const r=await domainRpc(db,'adjust_receivable',{p_business_id:businessId,p_receivable_id:input.receivableId,p_reason:input.reason,
    p_delta_minor:input.delta.amountMinor.toString(),p_currency:input.delta.currency,p_owner_after:input.ownerAfter??null,
    p_source_type:input.source?.type??null,p_source_id:input.source?.id??null,p_idempotency_key:input.idempotencyKey,p_actor_type:input.actor.type,p_actor_id:input.actor.id??null})
  const view=receivable(r.receivable)
  return {inserted:bool(r.inserted),receivableSettled:bool(r.receivable_settled),component:view.component,receivable:view}
}
