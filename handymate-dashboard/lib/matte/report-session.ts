import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BusinessUser } from '@/lib/permissions'
import { loadWorkReportContext, workReportSummary, WorkReportError, type WorkReportAction, type WorkReportContext } from './work-report'
import { pendingWorkReport } from './work-report-confirmation'
export const reportContinuityEnabled = () => process.env.WORK_REPORT_CONTINUITY_ENABLED === 'true'
export const REPORT_SESSION_FIELDS = 'id,project_id,work_date,thread_id,parts,completed,receipts,state,claimed_at,last_error,created_at,expires_at'
export function reportSessionView(row:any) {
 return {id:row.id,date:row.work_date,projectId:row.project_id,createdAt:row.created_at,state:row.state,
  busy:!!row.claimed_at&&Date.parse(row.claimed_at)>Date.now()-120000,uncertain:!!row.claimed_at||row.last_error,
  expired:Date.parse(row.expires_at)<=Date.now(),completed:row.completed,
  parts:row.parts.map((p:any,i:number)=>({tool:p.toolName,summary:p.summary,saved:i<row.completed})),receipts:row.receipts}
}
export async function createReportSession(db:SupabaseClient,businessId:string,ctx:WorkReportContext,threadId:string|null,actions:WorkReportAction[]) {
 const id=crypto.randomUUID()
 const parts=actions.map(action=>({...action,summary:workReportSummary(action,ctx)}))
 const {error}=await db.from('work_report_session').insert({id,business_id:businessId,business_user_id:ctx.userId,project_id:ctx.projectId,work_date:ctx.date,thread_id:threadId,parts})
 if(error)throw new WorkReportError(503,error.code==='23505'?'Du har redan en öppen rapport för jobbet och datumet. Återuppta eller avstå från den innan du börjar en ny.':'Rapportens delar kunde inte sparas för återupptagning. Inget förslag har utförts.')
 return pendingWorkReport(actions[0],ctx,businessId,threadId,actions.slice(1),id,true)
}
export async function loadReportSession(db:SupabaseClient,businessId:string,user:BusinessUser|null,id:unknown) {
 if(!user?.is_active||user.business_id!==businessId||!user.user_id)throw new WorkReportError(403,'Din användare kunde inte verifieras.')
 if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(id))throw new WorkReportError(400,'Välj en sparad rapport.')
 const {data,error}=await db.from('work_report_session').select(REPORT_SESSION_FIELDS).eq('business_id',businessId).eq('business_user_id',user.id).eq('id',id).maybeSingle()
 if(error)throw new WorkReportError(503,'Rapporten kunde inte läsas.')
 if(!data)throw new WorkReportError(404,'Rapporten hittades inte för din användare.')
 const ctx=await loadWorkReportContext(db,businessId,user,data.project_id,data.work_date)
 return {row:data,ctx}
}
export async function resumeReportSession(db:SupabaseClient,businessId:string,user:BusinessUser|null,id:unknown) {
 const {row,ctx}=await loadReportSession(db,businessId,user,id)
 const view=reportSessionView(row)
 if(row.state!=='open'||view.expired||view.busy)return {report:view,pending_confirmation:null}
 // Reissue a short-lived signature for the exact next stored part, never re-run AI.
 // Validation of a new write is deferred to the shared router so an already-saved
 // action can be read back even if a timer was subsequently started.
 const current=row.parts[row.completed]
 if(!current)throw new WorkReportError(409,'Rapportens nästa del kunde inte kontrolleras.')
 return {report:view,thread_id:row.thread_id,pending_confirmation:pendingWorkReport(current,ctx,businessId,row.thread_id,row.parts.slice(row.completed+1),row.id,true)}
}
export async function listReportSessions(db:SupabaseClient,businessId:string,user:BusinessUser|null,projectId:unknown,date:unknown) {
 if(!user?.is_active||!user.user_id||user.business_id!==businessId)throw new WorkReportError(403,'Din användare kunde inte verifieras.')
 const ctx=await loadWorkReportContext(db,businessId,user,projectId,date)
 const {data,error}=await db.from('work_report_session').select(REPORT_SESSION_FIELDS).eq('business_id',businessId).eq('business_user_id',ctx.userId).eq('project_id',ctx.projectId).eq('work_date',ctx.date).order('created_at',{ascending:false}).limit(11)
 if(error||!Array.isArray(data))throw new WorkReportError(503,'De sparade rapporterna kunde inte läsas.')
 return {reports:data.slice(0,10).map(reportSessionView),hasMore:data.length>10}
}
export async function discardReportSession(db:SupabaseClient,businessId:string,user:BusinessUser|null,id:unknown) {
 const {row}=await loadReportSession(db,businessId,user,id)
 const result=await db.rpc('discard_work_report',{p_business:businessId,p_user:user!.id,p_id:row.id})
 if(result.error)throw new WorkReportError(409,'En sparning kan pågå. Läs rapporten igen och kontrollera utfallet innan du avstår.')
 return {report:reportSessionView(result.data)}
}
