import { getServerSupabase } from '@/lib/supabase'
import { applyInvoicePaymentLegacy, type ApplyPaymentOptions, type ApplyPaymentResult, type PaymentEffect } from '@/lib/invoices/apply-payment'
import { rapporteraTystFel } from '@/lib/observability/driftlarm'
import { kernelDb } from '../kernel-db'
import { fromLegacyNumber, money, toLegacyNumber } from '../money'
import { seRoundingMaxMinor } from '../policies/se-rounding'
import { executePaymentCommand, claimEffectIntents, finishEffectIntent, type PaymentCommandOutcome } from './service'
import { runPaymentEffect } from '../effects/runners'

export function paymentEffectSet(opts:ApplyPaymentOptions):string[] {
  const reviewed=opts.approvalFollowUps
  const effects:string[]=[]
  if(reviewed?.updateWorkflows!==false) effects.push('pipeline','project_check','project_stage')
  if(!reviewed) effects.push('smart_communication')
  if(reviewed?.runAutomationRules!==false) effects.push('payment_received_rules')
  if(!reviewed || reviewed.prepareCustomerMessages) effects.push('portal_message')
  if(reviewed?.prepareCustomerMessages) effects.push('review_request')
  if(opts.source==='status_patch') effects.push('invoice_paid_thanks','review_request_schedule')
  return effects
}
const kr=(minor:string)=>toLegacyNumber(money(BigInt(minor),'SEK'))
export async function applyKernelPayment(opts:ApplyPaymentOptions):Promise<ApplyPaymentResult> {
  const sb=getServerSupabase(), db=kernelDb(), {businessId,invoiceId}=opts
  if(!opts.commandKey) throw new Error('financial_command_key_required')
  const provider=opts.source==='fortnox'?'fortnox':'manual'
  const paidVia=opts.paidVia ?? (opts.source==='fortnox'?'fortnox':opts.source==='customer_confirmed'?'customer_confirmed':'manual')
  let out:PaymentCommandOutcome
  try {
    out=await executePaymentCommand(db,{
    p_business_id:businessId,p_command_key:opts.commandKey,p_invoice_id:invoiceId,p_source:opts.source,p_target:opts.target ?? null,
    p_amount_minor:opts.amount==null?null:fromLegacyNumber(opts.amount,'SEK','HALF_UP').amountMinor.toString(),
    p_settled_at:opts.paidAt ?? null,p_provider:provider,p_method:paidVia,p_evidence:provider,
    p_observation:opts.providerObservation?{...opts.providerObservation,paid_minor:opts.providerObservation.paidMinor}:null,
    p_rounding_max_minor:seRoundingMaxMinor(),p_effects:paymentEffectSet(opts),p_paid_via:paidVia,p_marked_by:opts.markedByUserId ?? null,
    p_actor_type:opts.markedByUserId?'user':'system',p_actor_id:opts.markedByUserId ?? null,
    p_effect_context:{approvalFollowUps:opts.approvalFollowUps ?? null},
  })
  } catch(error) {
    if(!(error instanceof Error) || error.message!=='financial_command_target_not_open') throw error
    // The RPC rolled back: return the current compatibility projection without
    // turning another customer confirmation into a tax-authority payment.
    return currentInvoiceNoop(sb,businessId,invoiceId)
  }
  const {command,projection}=out
  if(command.route==='legacy') {
    if(!command.replayed) return applyInvoicePaymentLegacy(opts)
    // C4b owns crash recovery/cut-over. A replay must never execute legacy twice.
    const current=await currentInvoiceNoop(sb,businessId,invoiceId)
    return {...current,kernel:{commandId:command.command_id,replayed:true,unallocatedMinor:projection.unallocated_minor,
      effectsSuppressed:[],intentsUnknown:projection.intents_unknown}}
  }
  if(command.state==='provider_below_kernel' && !command.replayed) await rapporteraTystFel(sb,businessId,'financial-kernel:provider-below-kernel','Leverantörens betalda belopp är lägre än kerneln',{invoiceId,commandId:command.command_id})
  const claims=await claimEffectIntents(db,businessId,invoiceId)
  for(const id of claims.unknown_ids || []) await rapporteraTystFel(sb,businessId,'financial-kernel:effect-unknown','Utskicksutfallet måste kontrolleras manuellt',{invoiceId,intentId:id})
  const effects:PaymentEffect[]=[]
  for(const intent of claims.claimed) {
    let result:PaymentEffect
    try {result=await runPaymentEffect(businessId,invoiceId,intent)}
    catch(error){result={effect:intent.effect,status:'failed',message:error instanceof Error?error.message:String(error)}}
    // A lost finish response leaves the attempt intact; never turn transport uncertainty into a second send.
    await finishEffectIntent(db,businessId,intent,result.status==='failed'?'failed':result.status==='skipped'?'skipped':'sent',result,result.message)
    effects.push(result)
    if(result.status==='failed' && intent.attempts>=3) await rapporteraTystFel(sb,businessId,'financial-kernel:effect-exhausted',result.message || 'Efterbetalningseffekt misslyckades',{invoiceId,intentId:intent.id})
  }
  for(const effect of command.effects_suppressed || []) effects.push({effect,status:'skipped',message:'Efterbetalningseffekten har redan registrerats för fordran'})
  const reviewed=opts.approvalFollowUps
  if(reviewed) {
    if(!reviewed.updateWorkflows) effects.push({effect:'workflows',status:'skipped',message:'Valdes bort i granskningen'})
    effects.push({effect:'smart_communication',status:'skipped',message:'Direkt kundutskick är avstängt för detta granskade beslut'})
    if(!reviewed.runAutomationRules) effects.push({effect:'payment_received_rules',status:'skipped',message:'Valdes bort i granskningen'})
    if(!reviewed.prepareCustomerMessages) effects.push({effect:'customer_messages',status:'skipped',message:'Valdes bort i granskningen'})
  }
  const settled=command.settled_now || [], tax=projection.receivables.find(r=>r.component==='tax_authority')
  const transition=settled.includes('customer')?(tax && !settled.includes('tax_authority')?'to_customer_paid':'to_paid'):settled.includes('tax_authority')?'settled':'none'
  return {ok:true,already_paid:command.state==='already_paid' || undefined,status:projection.status ?? projection.derived_status ?? undefined,
    transition,paid_at:projection.paid_at ?? undefined,paid_amount:kr(projection.recorded_minor),remaining_rot_kr:tax?kr(tax.outstanding_minor):0,effects,
    kernel:{commandId:command.command_id,paymentId:command.payment_id,replayed:command.replayed,unallocatedMinor:projection.unallocated_minor,
      effectsSuppressed:command.effects_suppressed || [],intentsUnknown:projection.intents_unknown+claims.marked_unknown}}
}

async function currentInvoiceNoop(sb:ReturnType<typeof getServerSupabase>,businessId:string,invoiceId:string):Promise<ApplyPaymentResult> {
  const {data:invoice,error}=await sb.from('invoice').select('status,paid_at,paid_amount')
    .eq('business_id',businessId).eq('invoice_id',invoiceId).single()
  if(error || !invoice) return {ok:false,error:error?.message || 'Faktura hittades inte'}
  return {ok:true,transition:'none',status:invoice.status,already_paid:invoice.status==='paid',
    paid_at:invoice.paid_at ?? undefined,paid_amount:invoice.paid_amount ?? undefined}
}
