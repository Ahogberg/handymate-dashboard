import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { svDateStr } from '@/lib/dates'
import { getServerSupabase } from '@/lib/supabase'
import { FOLLOWUP_FIELDS, followupEnabled, followupError, scheduleFollowup } from '@/lib/followup/service'
export const dynamic='force-dynamic'
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}})
async function access(request:NextRequest,quoteId:string) {
 const business=await getAuthenticatedBusiness(request)
 if(!business)return {error:reply({error:'Logga in.'},401)}
 const user=await getCurrentUser(request,business.business_id)
 if(!user?.is_active || !isOwnerOrAdmin(user))return {error:reply({error:'Endast ägare och administratör.'},403)}
 const db=getServerSupabase()
 const q=await db.from('quotes').select('quote_id,status,sent_at,valid_until').eq('business_id',business.business_id).eq('quote_id',quoteId).maybeSingle()
 if(q.error)return {error:reply({error:'Offerten kunde inte läsas.'},503)}
 if(!q.data)return {error:reply({error:'Offerten hittades inte.'},404)}
 return {db,business,user,quote:q.data}
}
export async function GET(request:NextRequest,{params}:{params:{id:string}}) {
 try {
  const a=await access(request,params.id);if(a.error)return a.error
  if(!followupEnabled())return reply({enabled:false,items:[]})
  const [rows,runner]=await Promise.all([
   a.db!.from('agent_followup').select(FOLLOWUP_FIELDS).eq('business_id',a.business!.business_id).eq('quote_id',params.id).order('created_at',{ascending:false}).limit(20),
   a.db!.from('agent_followup_runner').select('enabled,last_tick_at,last_error').eq('singleton',true).single(),
  ])
  if(rows.error || runner.error || !Array.isArray(rows.data))return reply({error:'Uppföljningen kunde inte kontrolleras.'},503)
  const healthy=runner.data?.enabled===true && Date.parse(runner.data.last_tick_at)>Date.now()-300000
  return reply({enabled:true,healthy,canSchedule:['sent','opened'].includes(a.quote!.status)&&!!a.quote!.sent_at&&(!a.quote!.valid_until||a.quote!.valid_until>=svDateStr()),lastTickAt:runner.data?.last_tick_at,items:rows.data})
 }catch{return reply({error:'Uppföljningen kunde inte kontrolleras.'},503)}
}
export async function POST(request:NextRequest,{params}:{params:{id:string}}) {
 try {
  const a=await access(request,params.id);if(a.error)return a.error
  const body=await request.json()
  const item=await scheduleFollowup(a.db!,a.business!.business_id,a.user!.id,{...body,quote_id:params.id})
  return reply({item})
 }catch(e){return reply({error:followupError(e instanceof Error?e.message:'')},409)}
}
export async function DELETE(request:NextRequest,{params}:{params:{id:string}}) {
 try {
  const a=await access(request,params.id);if(a.error)return a.error
  const id=request.nextUrl.searchParams.get('id')
  if(!id)return reply({error:'Välj uppföljningen som ska avbrytas.'},400)
  const row=await a.db!.from('agent_followup').select('id').eq('business_id',a.business!.business_id).eq('quote_id',params.id).eq('id',id).maybeSingle()
  if(row.error)return reply({error:'Uppföljningen kunde inte läsas.'},503)
  if(!row.data)return reply({error:'Uppföljningen hittades inte.'},404)
  const result=await a.db!.rpc('cancel_agent_followup',{p_business:a.business!.business_id,p_user:a.user!.id,p_id:id})
  if(result.error)throw new Error(result.error.message)
  return reply({item:result.data})
 }catch(e){return reply({error:followupError(e instanceof Error?e.message:'')},409)}
}
