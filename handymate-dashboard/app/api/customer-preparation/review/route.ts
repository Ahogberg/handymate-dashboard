import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness, checkAiApiRateLimit } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { loadReviewSource, runPreparationReview, verifyPreparationProject, ReviewError } from '@/lib/customer-preparation/review-server'
import { checkFuelGate } from '@/lib/costs/fuel'
import { suggestAtaDraft } from '@/lib/ata/suggest-ata-draft'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if(!business || business._impersonation) return NextResponse.json({error:'Behörighet saknas'},{status:403})
    const user = await getCurrentUser(request,business.business_id)
    if(!user || !['owner','admin'].includes(user.role)) return NextResponse.json({error:'Behörighet saknas'},{status:403})
    const body = await request.json()
    if(typeof body.id!=='string' || !/^[0-9a-f-]{36}$/i.test(body.id) || !['review','link','approve','ata'].includes(body.action)) return NextResponse.json({error:'Ogiltig begäran'},{status:400})
    const db = getServerSupabase(), businessId=business.business_id
    if(body.action==='review') {
      const rate = checkAiApiRateLimit(businessId)
      if(!rate.allowed) return NextResponse.json({error:'Vänta en stund innan nästa kontroll.'},{status:429})
      return NextResponse.json({review:await runPreparationReview(db,businessId,body.id)})
    }
    const {row,project,fingerprint} = await loadReviewSource(db,businessId,body.id,body.action==='link')
    if(body.action==='link') {
      const {data:existing,error:lookupError}=await db.from('pending_approvals').select('id').eq('business_id',businessId).eq('id',`prep_ata_${row.id}`).maybeSingle()
      if(lookupError) throw new ReviewError(503,'Tidigare förslag kunde inte kontrolleras.')
      if(existing) throw new ReviewError(409,'Underlaget har redan använts för ett ÄTA-förslag. Skapa ett nytt underlag för ett annat projekt.')
      if(body.project_id!==null && (typeof body.project_id!=='string' || !body.project_id)) throw new ReviewError(400,'Välj ett projekt eller ingen projektkoppling.')
      if(body.project_id) await verifyPreparationProject(db,businessId,row.customer_id,body.project_id)
      const {data:updated,error} = await db.from('customer_preparation').update({project_id:body.project_id,lars_review:null,review_run_id:null,review_started_at:null,status:'submitted',reviewed_at:null})
        .eq('business_id',businessId).eq('id',row.id).or(`review_run_id.is.null,review_started_at.lt.${new Date(Date.now()-180000).toISOString()}`).in('status',['submitted','reviewed']).select('id').maybeSingle()
      if(error || !updated) throw new ReviewError(409,'Projektkopplingen kunde inte sparas. Läs in igen.')
      return NextResponse.json({success:true})
    }
    if(!row.lars_review || row.lars_review.fingerprint!==fingerprint || body.fingerprint!==fingerprint) throw new ReviewError(409,'Kontrollen är inaktuell. Läs in och låt Lars kontrollera igen.')
    if(body.action==='approve') {
      const {data:updated,error} = await db.from('customer_preparation').update({status:'reviewed',reviewed_at:new Date().toISOString()})
        .eq('business_id',businessId).eq('id',row.id).in('status',['submitted','reviewed']).contains('lars_review',{fingerprint}).select('id').maybeSingle()
      if(error || !updated) throw new ReviewError(409,'Underlaget ändrades. Läs in igen.')
      return NextResponse.json({success:true})
    }
    if(row.status!=='reviewed' || !project || !['active','planning'].includes(project.status)) throw new ReviewError(409,'Granska kontrollen och välj ett pågående eller planerat projekt först.')
    if(typeof body.description!=='string' || body.description.trim().length<10 || body.description.length>4000) throw new ReviewError(400,'Beskriv tillägget med 10–4 000 tecken.')
    const rate=checkAiApiRateLimit(businessId)
    if(!rate.allowed) throw new ReviewError(429,'Vänta en stund innan nästa förslag.')
    const fuel=await checkFuelGate(db,businessId)
    if(!fuel.allowed) throw new ReviewError(402,'Bränslet är slut eller kunde inte verifieras.')
    const actionRun=crypto.randomUUID()
    const {data:claim,error:claimError}=await db.from('customer_preparation').update({review_run_id:actionRun,review_started_at:new Date().toISOString()})
      .eq('business_id',businessId).eq('id',row.id).eq('status','reviewed').or(`review_run_id.is.null,review_started_at.lt.${new Date(Date.now()-180000).toISOString()}`).contains('lars_review',{fingerprint}).select('id').maybeSingle()
    if(claimError || !claim) throw new ReviewError(409,'Underlaget ändrades eller behandlas redan. Läs in igen.')
    try {
    const result=await suggestAtaDraft(db,{businessId,projectId:project.project_id,customerId:row.customer_id,description:body.description.trim(),customerContext:'Underlag granskat av hantverkaren. Avtalsomfattning och pris behöver kontrolleras.',routedAgent:'lars',sourcePreparationId:row.id,beforeInsert:async()=>{
      const current=await loadReviewSource(db,businessId,row.id)
      return current.row.review_run_id===actionRun && current.row.status==='reviewed' && current.fingerprint===fingerprint && ['active','planning'].includes(current.project?.status || '')
    }})
    if(!result.created || !result.approvalId) throw new ReviewError(result.reason==='duplicate'?409:503,result.reason==='duplicate'?'Det finns redan ett väntande ÄTA-förslag för projektet. Kontrollera godkännandekön.':'ÄTA-förslaget kunde inte bekräftas. Försök igen med samma underlag.')
    return NextResponse.json({approval_id:result.approvalId,href:'/dashboard/approvals'})
    } finally {
      await db.from('customer_preparation').update({review_run_id:null,review_started_at:null}).eq('business_id',businessId).eq('id',row.id).eq('review_run_id',actionRun)
    }
  } catch(error) {
    return NextResponse.json({error:error instanceof ReviewError ? error.message : 'Kontrollen kunde inte slutföras. Läs in igen och försök på nytt.'},{status:error instanceof ReviewError?error.status:503})
  }
}
