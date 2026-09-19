import { randomUUID } from 'crypto'
import { getServerSupabase } from '@/lib/supabase'
import { processInboundEmail } from '@/lib/gmail/processor'
import { findGmailMessage } from '@/lib/gmail/message-identity'
import { receipt } from '@/lib/onboarding/contact-proof'
import { saveDirectAttachments } from './attachments'
import { page } from './incoming'
import { refresh,ProviderError } from './providers'
import { config,seal,unseal,type MailProvider } from './security'

export async function syncMailbox(businessId:string,provider:MailProvider){
  if(!config(provider).enabled) throw new Error('Mejlleverantören är inte aktiverad.')
  const db=getServerSupabase(),lease=randomUUID(),now=new Date().toISOString()
  const claim=await db.from('mail_connection').update({lease_id:lease,lease_until:new Date(Date.now()+180000).toISOString()}).eq('business_id',businessId).eq('provider',provider).eq('enabled',true).lt('lease_until',now).lte('retry_at',now).select('*').maybeSingle()
  if(claim.error) throw new Error('Mejlkopplingen kunde inte reserveras.')
  if(!claim.data) return {state:'busy_or_paused',stored:0}
  const row=claim.data,ctx=`mail:${businessId}:${provider}:${row.subject}`
  const active=()=>db.from('mail_connection').select('id').eq('id',row.id).eq('business_id',businessId).eq('revision',row.revision).eq('lease_id',lease).eq('enabled',true)
  const update=(v:Record<string,unknown>)=>db.from('mail_connection').update(v).eq('id',row.id).eq('business_id',businessId).eq('revision',row.revision).eq('lease_id',lease).eq('enabled',true).select('id').maybeSingle()
  let stored=0,attachmentWarning=false
  try{
    let tokens=JSON.parse(unseal(row.credentials,ctx))
    if(new Date(tokens.expires_at).getTime()<Date.now()+60000){
      tokens={...tokens,...await refresh(provider,tokens.refresh_token)}
      const x=await update({credentials:seal(JSON.stringify(tokens),ctx),expires_at:tokens.expires_at})
      if(x.error||!x.data) throw new Error('Den förnyade inloggningen kunde inte sparas.')
    }
    const resultPage=await page(provider,tokens.access_token,row.started_at,row.cursor)
    for(const message of resultPage.messages){
      const current=await active().maybeSingle()
      if(current.error||!current.data) throw new Error('Mejlkopplingen ändrades under synken.')
      const result=await processInboundEmail(db,businessId,message,row.account_email,provider)
      if(!result.stored&&result.reason!=='duplicate') throw new Error('Mejlet kunde inte sparas. Läspositionen har inte flyttats.')
      if(result.stored) stored++
      const found=await findGmailMessage(db,businessId,row.account_email,message.messageId,provider)
      if(!found) throw new Error('Mejlets lagringsbevis saknas.')
      const saved=await db.from('email_conversations').select('id,customer_id,lead_id').eq('business_id',businessId).eq('id',found.id).single()
      if(saved.error) throw new Error('Kundkopplingen kunde inte kontrolleras.')
      if(message.hasAttachments){
        const files=await saveDirectAttachments(db,{provider,token:tokens.access_token,businessId,message,customerId:saved.data.customer_id,leadId:saved.data.lead_id})
        attachmentWarning=attachmentWarning||files.skipped>0
      }
      await receipt(db,{businessId,channel:'email',target:row.account_email,text:message.bodyText||message.snippet,sourceId:String(found.id),customerId:saved.data.customer_id,leadId:saved.data.lead_id,connectionId:row.id,connectionRevision:row.revision})
    }
    const warning=attachmentWarning?'Mejlet är synkat. Någon bilaga hoppades över på grund av filtyp, antal eller storlek. Öppna originalmejlet för den.':null
    const x=await update({cursor:resultPage.next,last_sync_at:new Date().toISOString(),last_error:warning,retry_at:new Date(0).toISOString()})
    if(x.error||!x.data) throw new Error('Läspositionen kunde inte sparas.')
    return {state:resultPage.more?'more':'complete',stored,attachmentWarning}
  }catch(e){
    const message=e instanceof Error?e.message:'Synken misslyckades.',delay=e instanceof ProviderError?e.retryAfter:60
    await update({last_error:message,retry_at:new Date(Date.now()+delay*1000).toISOString()})
    throw new Error(message)
  }finally{
    await db.from('mail_connection').update({lease_id:null,lease_until:new Date(0).toISOString()}).eq('id',row.id).eq('business_id',businessId).eq('lease_id',lease)
  }
}
