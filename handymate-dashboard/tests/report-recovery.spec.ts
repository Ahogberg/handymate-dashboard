import {reportWriters as writers} from './helpers/report-writers'
import {test,expect} from '@playwright/test'
import fs from 'fs'
import ts from 'typescript'
import {reportDatabase,reportClient} from './helpers/report-database'
import {createReportSession,resumeReportSession,discardReportSession,listReportSessions} from '../lib/matte/report-session'
import {confirmWorkReport} from '../lib/matte/work-report-confirmation'
import {verifyPendingExternalAction} from '../lib/agent/external-confirm'
import type {FollowupDatabase} from './helpers/followup-database'
const user:any={id:'u',user_id:'auth-u',business_id:'b',role:'owner',is_active:true,name:'Test'}
const ctx:any={projectId:'p',projectName:'Köket',userId:'u',userName:'Test',date:'2026-09-08',entries:[],activeTimer:false}
let db:FollowupDatabase,client:any,secret:string|undefined
const actions:any=[{toolName:'log_material',toolInput:{project_id:'p',name:'Kabel',quantity:2,unit:'m'}},{toolName:'create_ata_draft',toolInput:{project_id:'p',description:'Extra uttag i köket'}}]
test.beforeEach(async()=>{secret=process.env.CRON_SECRET;process.env.CRON_SECRET='test-only-report-recovery';db=await reportDatabase();client=reportClient(db)})
test.afterEach(async()=>{await db.close();if(secret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=secret})
test('another client resumes the immutable next part with a fresh signature and durable material/ATA receipts',async()=>{
 const first=await createReportSession(client,'b',ctx,null,actions)
 expect(first.report_id).toBeTruthy();expect((await db.query('SELECT * FROM project_material')).rows).toHaveLength(0)
 const saved=await confirmWorkReport(verifyPendingExternalAction(first.token,'b')!,client,'b',user,writers());expect(saved.confirmed,saved.reply).toBe(true)
 const other=reportClient(db);const resumed=await resumeReportSession(other,'b',user,first.report_id)
 expect(resumed.report.completed).toBe(1);expect(resumed.pending_confirmation?.tool_name).toBe('create_ata_draft')
 const second=await confirmWorkReport(verifyPendingExternalAction(resumed.pending_confirmation!.token,'b')!,other,'b',user,writers());expect(second.confirmed,second.reply).toBe(true)
 const list=await listReportSessions(other,'b',user,'p',ctx.date);expect(list.reports[0]).toMatchObject({state:'finished',completed:2})
 expect((await db.query('SELECT * FROM project_material')).rows).toHaveLength(1);expect((await db.query('SELECT * FROM pending_approvals')).rows).toHaveLength(1)
})
test('lost receipt after real material insert retries SAME identity, never a second material row',async()=>{
 const first=await createReportSession(client,'b',ctx,null,actions);client.failNextFinish()
 await expect(confirmWorkReport(verifyPendingExternalAction(first.token,'b')!,client,'b',user,writers())).rejects.toMatchObject({status:503})
 const busy=await resumeReportSession(client,'b',user,first.report_id);expect(busy.report.uncertain).toBe(true);expect(busy.pending_confirmation).toBeNull()
 await db.exec("UPDATE work_report_session SET claimed_at=now()-interval '3 minutes'")
 const retry=await resumeReportSession(reportClient(db),'b',user,first.report_id)
 const done=await confirmWorkReport(verifyPendingExternalAction(retry.pending_confirmation!.token,'b')!,client,'b',user,writers());expect(done.execution_result.status).toBe('already_saved');expect((await db.query('SELECT * FROM project_material')).rows).toHaveLength(1)
})
test('unrelated pending ATA is not a receipt for this report; lost ATA receipt reuses its own ID',async()=>{
 await db.exec(`INSERT INTO pending_approvals(id,business_id,approval_type,status,payload) VALUES('unrelated','b','create_ata_draft','pending','{"project_id":"p"}')`)
 const first=await createReportSession(client,'b',ctx,null,[actions[1]])
 const failed=await confirmWorkReport(verifyPendingExternalAction(first.token,'b')!,client,'b',user,writers());expect(failed.confirmed).toBe(false);expect((await resumeReportSession(client,'b',user,first.report_id)).report.completed).toBe(0)
 await db.exec("UPDATE pending_approvals SET status='rejected'")
 client.failNextFinish();await expect(confirmWorkReport(verifyPendingExternalAction(first.token,'b')!,client,'b',user,writers())).rejects.toMatchObject({status:503});await db.exec("UPDATE work_report_session SET claimed_at=now()-interval '3 minutes'")
 const again=await resumeReportSession(client,'b',user,first.report_id);expect((await confirmWorkReport(verifyPendingExternalAction(again.pending_confirmation!.token,'b')!,client,'b',user,writers())).confirmed).toBe(true)
 expect((await db.query("SELECT * FROM pending_approvals WHERE id LIKE 'report_ata_%'")).rows).toHaveLength(1)
})
test('different member/company and removed assignment cannot read or resume; discard blocks old signed confirmation',async()=>{
 const first=await createReportSession(client,'b',ctx,null,actions)
 await expect(resumeReportSession(client,'b',{...user,id:'other'},first.report_id)).rejects.toMatchObject({status:404})
 await expect(resumeReportSession(client,'other',user,first.report_id)).rejects.toMatchObject({status:403})
 await expect(resumeReportSession(client,'b',{...user,role:'employee'},first.report_id)).rejects.toMatchObject({status:403})
 await discardReportSession(client,'b',user,first.report_id)
 await expect(confirmWorkReport(verifyPendingExternalAction(first.token,'b')!,client,'b',user,writers())).rejects.toMatchObject({status:409})
 expect((await db.query('SELECT * FROM project_material')).rows).toHaveLength(0)
})
test('actual report HTTP route authenticates, scopes recovery to server identity and never writes artifacts on resume',async()=>{
 const old=process.env.WORK_REPORT_CONTINUITY_ENABLED;process.env.WORK_REPORT_CONTINUITY_ENABLED='true'
 try{
  const first=await createReportSession(client,'b',ctx,null,actions)
  const {NextRequest,NextResponse}=require('next/server')
  const service=require('../lib/matte/report-session'),work=require('../lib/matte/work-report')
  const code=ts.transpileModule(fs.readFileSync('app/api/day-close/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const route=(auth:any,actor:any)=>{const m={exports:{} as any};const deps:any={'next/server':{NextRequest,NextResponse},'@/lib/auth':{getAuthenticatedBusiness:async()=>auth},'@/lib/permissions':{getCurrentUser:async()=>actor},'@/lib/supabase':{getServerSupabase:()=>client},'@/lib/matte/report-session':service,'@/lib/matte/work-report':work,'@/lib/relief/day-summary':{},'@/lib/relief/my-day':{}};new Function('require','exports','module',code)((n:string)=>{if(!(n in deps))throw Error(n);return deps[n]},m.exports,m);return m.exports}
  const request=()=>new NextRequest('https://test/api/day-close',{method:'POST',body:JSON.stringify({action:'resume',id:first.report_id,business_id:'other',user_id:'other'})})
  expect((await route(null,null).POST(request())).status).toBe(401)
  expect((await route({business_id:'b'},{...user,id:'other'}).POST(request())).status).toBe(404)
  const valid=await route({business_id:'b'},user).POST(request());expect(valid.status).toBe(200);expect(valid.headers.get('cache-control')).toBe('no-store');expect((await valid.json()).pending_confirmation.report_id).toBe(first.report_id)
  expect((await db.query('SELECT * FROM project_material')).rows).toHaveLength(0)
  process.env.WORK_REPORT_CONTINUITY_ENABLED='false';expect((await route({business_id:'b'},user).POST(request())).status).toBe(503)
 }finally{if(old===undefined)delete process.env.WORK_REPORT_CONTINUITY_ENABLED;else process.env.WORK_REPORT_CONTINUITY_ENABLED=old}
})
test('material stable identity also handles concurrent inserts and keeps different reports separate',async()=>{
 const write=writers(),context={workReport:{...ctx,stableArtifacts:true},confirmationId:'same-confirmation'}
 const results=await Promise.all([write('log_material',actions[0].toolInput,client,'b',context),write('log_material',actions[0].toolInput,client,'b',context)])
 expect(results.every(r=>r.success)).toBe(true);expect((await db.query('SELECT * FROM project_material')).rows).toHaveLength(1)
 expect((await write('log_material',actions[0].toolInput,client,'b',{...context,confirmationId:'different-confirmation'})).success).toBe(true)
 expect((await db.query('SELECT * FROM project_material')).rows).toHaveLength(2)
})
