import crypto from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkFuelGate } from '@/lib/costs/fuel'
import { meterDirectLlmCall } from '@/lib/agents/shared/cost-guard'
import { llmCostUsd } from '@/lib/costs/meter'
import { BUCKET } from './server'
import { isTemplate, TEMPLATES, imageExtension } from './contract'
import { PREPARATION_REVIEW_PROMPT, parsePreparationReview, type SavedPreparationReview } from './review-contract'

export class ReviewError extends Error { constructor(public status: number, message: string) { super(message) } }
export async function loadReviewSource(db: SupabaseClient, businessId: string, id: string, skipProject = false) {
  const {data:row,error} = await db.from('customer_preparation').select('*').eq('business_id',businessId).eq('id',id).maybeSingle()
  if(error) throw new ReviewError(503,'Kundunderlaget kunde inte läsas.')
  if(!row || !['submitted','reviewed'].includes(row.status)) throw new ReviewError(409,'Ett inskickat och aktivt kundunderlag krävs.')
  if(!Object.prototype.hasOwnProperty.call(row,'lars_review')) throw new ReviewError(503,'Lars kundunderlagskontroll är inte aktiverad ännu.')
  const template=row.template
  if(!isTemplate(template)) throw new ReviewError(409,'Underlaget har en okänd frågemall.')
  const project = row.project_id && !skipProject ? await verifyPreparationProject(db,businessId,row.customer_id,row.project_id) : null
  const sources: Record<string,string> = {context:row.context}
  for(const q of TEMPLATES[template].questions) sources[q.id] = `${q.label}\n${row.answers?.[q.id] || 'Inget svar'}`
  if(project) sources.project = `${project.name}\n${project.description || 'Projektbeskrivning saknas'}\nStatus: ${project.status}`
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify([row.submitted_at,sources,row.images,row.project_id])).digest('hex')
  return {row,project,sources,fingerprint}
}
export async function verifyPreparationProject(db: SupabaseClient,businessId:string,customerId:string,projectId:string) {
  const {data,error} = await db.from('project').select('project_id,customer_id,name,description,status')
    .eq('business_id',businessId).eq('customer_id',customerId).eq('project_id',projectId).maybeSingle()
  if(error) throw new ReviewError(503,'Projektkopplingen kunde inte kontrolleras.')
  if(!data) throw new ReviewError(403,'Projektet tillhör inte den här kunden och företaget.')
  return data
}

export async function runPreparationReview(db: SupabaseClient,businessId:string,id:string): Promise<SavedPreparationReview> {
  const source = await loadReviewSource(db,businessId,id)
  if(source.row.lars_review?.fingerprint === source.fingerprint) return source.row.lars_review
  const fuel = await checkFuelGate(db,businessId)
  if(!fuel.allowed) throw new ReviewError(402,'Bränslet är slut eller kunde inte verifieras.')
  if(!process.env.ANTHROPIC_API_KEY) throw new ReviewError(503,'Lars kunde inte starta granskningen. Försök senare.')
  const runId = crypto.randomUUID()
  const {data:claim,error:claimError} = await db.from('customer_preparation')
    .update({review_run_id:runId,review_started_at:new Date().toISOString()})
    .eq('business_id',businessId).eq('id',id).in('status',['submitted','reviewed'])
    .or(`review_run_id.is.null,review_started_at.lt.${new Date(Date.now()-180000).toISOString()}`)
    .select('id').maybeSingle()
  if(claimError) throw new ReviewError(503,'Granskningen kunde inte startas.')
  if(!claim) throw new ReviewError(409,'Lars kontrollerar redan underlaget. Läs in igen om en stund.')
  try {
    const content: Anthropic.Messages.MessageParam['content'] = []
    const allowed = Object.keys(source.sources)
    const paths: string[] = Array.isArray(source.row.images) ? source.row.images : []
    if(paths.length>3) throw new ReviewError(409,'Underlagets bilder behöver kontrolleras.')
    let size=0
    for(const [index,path] of Array.from(paths.entries())) {
      if(typeof path!=='string' || !path.startsWith(`${businessId}/${id}/`) || path.includes('..')) throw new ReviewError(409,'En bild kunde inte kopplas till underlaget.')
      const {data,error} = await db.storage.from(BUCKET).download(path)
      if(error || !data) throw new ReviewError(503,'Alla bilder kunde inte läsas. Ingen fullständig granskning har sparats.')
      size+=data.size
      if(size>3*1024*1024) throw new ReviewError(409,'Bilderna är för stora för granskning.')
      const bytes = new Uint8Array(await data.arrayBuffer())
      const mime = path.endsWith('.png')?'image/png':path.endsWith('.webp')?'image/webp':'image/jpeg'
      if(!imageExtension(bytes,mime)) throw new ReviewError(409,'En bild kunde inte kontrolleras.')
      const key=`image${index+1}`;allowed.push(key)
      content.push({type:'text',text:`Källa: ${key}`},{type:'image',source:{type:'base64',media_type:mime,data:Buffer.from(bytes).toString('base64')}})
    }
    content.push({type:'text',text:JSON.stringify({sources:source.sources,available_sources:allowed})})
    const model='claude-sonnet-4-6'
    const response = await new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY,timeout:45000,maxRetries:0}).messages.create({model,max_tokens:3500,system:PREPARATION_REVIEW_PROMPT,messages:[{role:'user',content}]})
    await meterDirectLlmCall({supabase:db,businessId,usage:response.usage,costUsd:llmCostUsd(response.usage,model),refType:'preparation_review',refId:runId})
    const result = parsePreparationReview(response.content.filter(b=>b.type==='text').map(b=>(b as Anthropic.TextBlock).text).join(''),allowed)
    const current = await loadReviewSource(db,businessId,id)
    if(current.fingerprint!==source.fingerprint) throw new ReviewError(409,'Underlaget eller projektet ändrades. Starta en ny kontroll.')
    const review: SavedPreparationReview = {version:1,fingerprint:source.fingerprint,project_id:source.row.project_id,created_at:new Date().toISOString(),model,image_count:paths.length,result}
    const {data:saved,error} = await db.from('customer_preparation').update({lars_review:review,review_run_id:null,review_started_at:null,status:'submitted',reviewed_at:null})
      .eq('business_id',businessId).eq('id',id).eq('review_run_id',runId).in('status',['submitted','reviewed']).select('id').maybeSingle()
    if(error || !saved) throw new ReviewError(409,'Kontrollen kunde inte sparas eftersom underlaget ändrats. Läs in igen.')
    return review
  } finally {
    await db.from('customer_preparation').update({review_run_id:null,review_started_at:null}).eq('business_id',businessId).eq('id',id).eq('review_run_id',runId)
  }
}
