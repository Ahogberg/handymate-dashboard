import { test, expect } from '@playwright/test'
import { deriveMissionHandover } from '../lib/mission/handover'
import { readReliefDraft, reliefPrompt } from '../lib/relief/intake'
import { loadDaySummary } from '../lib/relief/day-summary'
import { readReportConfirmation } from '../lib/matte/day-close-client'
import { pendingWorkReport, confirmWorkReport } from '../lib/matte/work-report-confirmation'
import { verifyPendingExternalAction } from '../lib/agent/external-confirm'
import { loadWorkReportContext } from '../lib/matte/work-report'
import { getMissionProgressWithDecisions } from '../lib/mission/mission-progress'
import fs from 'fs'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'

const user: any = { id:'u', user_id:'auth-u', business_id:'b', name:'Test', role:'employee', is_active:true, can_see_all_projects:false }
const mission: any = { id:'m', business_id:'b', status:'active', deadline:'2026-09-09', created_at:'2026-09-08T08:00:00Z', goal_kr:1000, plan_snapshot:{steps:[{item_id:'one',title:'Följ upp offerten',agent_key:'daniel'}]} }
const NOW = new Date('2026-09-08T12:00:00Z')
function database(overrides: Record<string, any[]> = {}, failure = '') {
  const tables: Record<string, any[]> = { project:[{business_id:'b',project_id:'p',name:'Köket'}], project_assignment:[{id:'pa',business_id:'b',project_id:'p',business_user_id:'u'}], time_entry:[],time_checkins:[],project_log:[],pending_approvals:[], ...overrides }
  const reads: string[] = []
  const db: any = {from(table: string) {
    reads.push(table)
    const filters: Array<(r: any)=>boolean> = []; let limit = Infinity, single = false, selection = '*'
    const q: any = {
      select(s: string) {selection=s;return q}, eq(k:string,v:any) {filters.push(r=>r[k]===v);return q}, is(k:string,v:any){filters.push(r=>(r[k]??null)===v);return q}, not(k:string,op:string,v:any){filters.push(r=>r[k]!=null);return q},
      order(){return q}, limit(n:number){limit=n;return q}, maybeSingle(){single=true;return q}, contains(k:string,v:any){filters.push(r=>Object.entries(v).every(([f,x])=>r[k]?.[f]===x));return q},
      then(resolve:any,reject:any) {return Promise.resolve().then(()=>{
        if(table===failure) return {data:null,error:{message:'read failed'}}
        let rows=(tables[table]||[]).filter(r=>filters.every(f=>f(r))).slice(0,limit)
        if(selection!=='*') rows=rows.map(r=>Object.fromEntries(selection.split(',').map(k=>[k,r[k]])))
        return {data:single?rows[0]||null:rows,error:null}
      }).then(resolve,reject)}
    }; return q
  }}
  return {db,tables,reads}
}

test('a saved plan never claims execution, scheduled check or achieved revenue',()=>{
  const view=deriveMissionHandover(mission,[],NOW)
  expect(view).toMatchObject({state:'recorded',pending:0,executed:0,planned:[{owner:'Daniel',title:'Följ upp offerten'}]})
  expect(view.scope).toContain('inte en bokad avstämning')
})
test('pending, successful, unknown and rejected actions remain separate',()=>{
  const view=deriveMissionHandover(mission,[{status:'pending',payload:{}},{status:'approved',payload:{execution_result:{outcome:'success'}}},{status:'approved',payload:{execution_result:{outcome:'partial'}}},{status:'rejected',payload:{}}] as any,NOW)
  expect(view).toMatchObject({state:'needs_attention',pending:1,executed:1,unverified:1})
})
test('Swedish midnight expires the deadline even before the UTC day changes',()=>{
  expect(deriveMissionHandover(mission,[],new Date('2026-09-09T22:01:00Z')).state).toBe('expired')
})
test('read failure cannot become a zero-decision success',async()=>{
  await expect(getMissionProgressWithDecisions(database({},'pending_approvals').db,mission)).rejects.toThrow('kunde inte kontrolleras')
})
test('drafts survive navigation only for their owner, company and valid age',()=>{
  const draft=JSON.stringify({version:1,businessId:'b',userId:'auth-u',intent:'quote',text:'Sex innerdörrar',projectId:'',savedAt:NOW.getTime()})
  expect(readReliefDraft(draft,'b','auth-u',NOW.getTime())?.text).toBe('Sex innerdörrar')
  expect(readReliefDraft(draft,'other','auth-u',NOW.getTime())).toBeNull()
  expect(readReliefDraft(draft,'b','other',NOW.getTime())).toBeNull()
  expect(readReliefDraft(draft,'b','auth-u',NOW.getTime()+8*86400000)).toBeNull()
  expect(readReliefDraft('{broken','b','auth-u')).toBeNull()
  expect(reliefPrompt('Anders bad om besked')).toContain('Skicka inget meddelande nu.')
})
test('day close returns only own dated project data without financial fields',async()=>{
  const h=database({time_entry:[{business_id:'b',project_id:'p',business_user_id:'u',work_date:'2026-09-08',time_entry_id:'t',duration_minutes:90,hourly_rate:900},{business_id:'b',project_id:'p',business_user_id:'other',work_date:'2026-09-08',duration_minutes:300}], project_log:[{id:'mine',business_id:'b',order_id:'p',business_user_id:'u',date:'2026-09-08',work_performed:'Montering'},{id:'other',business_id:'b',order_id:'p',business_user_id:'other',date:'2026-09-08',work_performed:'Hemligt'},{id:'foreign',business_id:'other',order_id:'p',business_user_id:'u',date:'2026-09-08',work_performed:'Annat företag'}]})
  const s=await loadDaySummary(h.db,'b',user,'p','2026-09-08')
  expect(s).toMatchObject({ownMinutes:90,ownEntryCount:1,ownNotes:[{id:'mine',text:'Montering'}],activeTimer:false})
  expect(JSON.stringify(s)).not.toMatch(/hourly_rate|Hemligt|Annat företag/)
})
test('unassigned or inactive users are rejected before reading project contents',async()=>{
  const h=database({project_assignment:[]})
  await expect(loadDaySummary(h.db,'b',user,'p','2026-09-08')).rejects.toMatchObject({status:403})
  expect(h.reads).toEqual(['project_assignment'])
  await expect(loadDaySummary(h.db,'b',{...user,is_active:false},'p','2026-09-08')).rejects.toMatchObject({status:403})
})
test('unknown notes or truncated notes cannot produce a reassuring empty summary',async()=>{
  await expect(loadDaySummary(database({},'project_log').db,'b',user,'p','2026-09-08')).rejects.toMatchObject({status:503})
  const notes=Array.from({length:101},(_,i)=>({id:String(i),business_id:'b',order_id:'p',business_user_id:'u',date:'2026-09-08'}))
  await expect(loadDaySummary(database({project_log:notes}).db,'b',user,'p','2026-09-08')).rejects.toMatchObject({status:503})
})
test('a timer in a different job still prevents a false day-complete impression',async()=>{
  const h=database({time_checkins:[{id:'timer',business_id:'b',business_user_id:'u',checked_out_at:null}]})
  expect((await loadDaySummary(h.db,'b',user,'p','2026-09-08')).activeTimer).toBe(true)
})
test('report exposes the exact remaining summaries and separates blocked continuation from saved action',async()=>{
  const previous=process.env.CRON_SECRET;process.env.CRON_SECRET='relief-test-only'
  try {
    const h=database(),ctx=await loadWorkReportContext(h.db,'b',user,'p','2026-09-08')
    const first:any={toolName:'log_time',toolInput:{project_id:'p',work_date:ctx.date,duration_minutes:60,description:'Montering'}}
    const next:any={toolName:'add_work_note',toolInput:{project_id:'p',log_date:ctx.date,work_performed:'Montering klar'}}
    const prepared=pendingWorkReport(first,ctx,'b',null,[next])
    expect(readReportConfirmation(prepared,'p',ctx.date)?.plan).toHaveLength(2)
    const pending=verifyPendingExternalAction(prepared.token,'b')!
    const done=await confirmWorkReport(pending,h.db,'b',user,async()=>({success:true}))
    expect(done.report_continuation.state).toBe('awaiting_review')
    expect(done.pending_confirmation?.plan).toHaveLength(1)
    pending.workReport!.remaining[0].toolInput.work_performed=''
    const blocked=await confirmWorkReport(pending,h.db,'b',user,async()=>({success:true,data:{duplicate:true}}))
    expect(blocked).toMatchObject({confirmed:true,execution_result:{status:'already_saved'},report_continuation:{state:'blocked'}})
    expect(()=>readReportConfirmation({...prepared,plan:[{tool_name:'send_sms',summary:'unexpected'}]},'p',ctx.date)).toThrow()
  } finally {if(previous===undefined) delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previous}
})
function routeHarness(auth: any, actor: any, db: any) {
  const mod={exports:{} as any}
  const code=ts.transpileModule(fs.readFileSync('app/api/day-close/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const imports: any={'@/lib/matte/report-session':require('../lib/matte/report-session'),'next/server':{NextResponse},'@/lib/auth':{getAuthenticatedBusiness:async()=>auth},'@/lib/permissions':{getCurrentUser:async()=>actor},'@/lib/supabase':{getServerSupabase:()=>db},'@/lib/relief/my-day':{loadMyDay:require('../lib/relief/my-day').loadMyDay},'@/lib/relief/day-summary':{loadDaySummary},'@/lib/matte/work-report':{WorkReportError:require('../lib/matte/work-report').WorkReportError}}
  new Function('require','module','exports',code)((key:string)=>{if(!(key in imports))throw new Error(key);return imports[key]},mod,mod.exports)
  return mod.exports.GET(new NextRequest('https://local.test/api/day-close?projectId=p&date=2026-09-08'))
}
test('actual summary route distinguishes unauthenticated, denied, read failure and valid empty data',async()=>{
  const unauth=await routeHarness(null,null,database().db);expect(unauth.status).toBe(401)
  const denied=await routeHarness({business_id:'b'},null,database().db);expect(denied.status).toBe(403)
  const fail=await routeHarness({business_id:'b'},user,database({},'project_log').db);expect(fail.status).toBe(503)
  const ok=await routeHarness({business_id:'b'},user,database().db);expect(ok.status).toBe(200);expect(ok.headers.get('cache-control')).toBe('no-store');expect((await ok.json()).summary.ownMinutes).toBe(0)
})
