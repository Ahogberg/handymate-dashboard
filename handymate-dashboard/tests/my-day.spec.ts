import { test, expect } from '@playwright/test'
import { loadMyDay } from '../lib/relief/my-day'
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import ts from 'typescript'

const employee: any = { id:'u',user_id:'auth',business_id:'b',role:'employee',is_active:true,can_see_all_projects:false }
const owner = {...employee,role:'owner'}
const date='2026-09-08'
function database(overrides:Record<string,any[]>={},failure='') {
 const reads:string[]=[]
 const tables:Record<string,any[]>={project:[{project_id:'p',business_id:'b',name:'Köket'},{project_id:'secret',business_id:'b',name:'Hemligt'},{project_id:'foreign',business_id:'other',name:'Annat företag'}],project_assignment:[{business_id:'b',business_user_id:'u',project_id:'p'}],time_entry:[{business_id:'b',business_user_id:'u',project_id:'p',duration_minutes:90,work_date:date}],project_log:[{business_id:'b',business_user_id:'u',order_id:'p',date}],time_checkins:[],pending_approvals:[{business_id:'b',status:'pending',id:'a'}],agent_followup:[],agent_followup_runner:[{singleton:true,enabled:true,last_tick_at:new Date().toISOString()}],...overrides}
 const db:any={from(table:string){reads.push(table);const filters:Array<(r:any)=>boolean>=[];let limit=Infinity,single=false,fields='',count=false
 const q:any={select(f:string,o?:any){fields=f;count=!!o?.count;return q},eq(k:string,v:any){filters.push(r=>r[k]===v);return q},in(k:string,v:any[]){filters.push(r=>v.includes(r[k]));return q},is(k:string,v:any){filters.push(r=>(r[k]??null)===v);return q},not(k:string,_op:string,_v:any){filters.push(r=>r[k]!=null);return q},limit(n:number){limit=n;return q},order(){return q},single(){single=true;return q},then(resolve:any,reject:any){return Promise.resolve().then(()=>{
 if(table===failure)return {data:null,error:{message:'offline'},count:null}
 const filtered=tables[table].filter(r=>filters.every(f=>f(r)));const data=filtered.slice(0,limit).map(r=>Object.fromEntries(fields.split(',').map(f=>[f,r[f]])))
 return {data:single?data[0]:data,error:null,count:count?filtered.length:null}
 }).then(resolve,reject)}};return q}}
 return {db,reads,tables}
}
test('own dated work only; assignment and tenant filters prevent names and financial leakage',async()=>{
 const h=database();h.tables.time_entry.push(...[{business_id:'b',business_user_id:'other',project_id:'p',duration_minutes:500,work_date:date},{business_id:'b',business_user_id:'u',project_id:'secret',duration_minutes:600,work_date:date},{business_id:'other',business_user_id:'u',project_id:'foreign',duration_minutes:700,work_date:date},{business_id:'b',business_user_id:'u',project_id:'p',duration_minutes:800,work_date:'2026-09-07'}])
 const r=await loadMyDay(h.db,'b',employee,date)
 expect(r.work).toMatchObject({state:'ready',value:{minutes:90,entries:1,notes:1,projects:[{id:'p',name:'Köket'}]}})
 expect(r.decisions).toBeNull();expect(r.followups).toBeNull();expect(h.reads).not.toContain('pending_approvals');expect(h.reads).not.toContain('agent_followup')
 expect(JSON.stringify(r)).not.toMatch(/Hemligt|Annat företag|hourly/)
})
test('owner sees own work across jobs but not colleague time; exact pending count is company scoped',async()=>{
 const h=database();h.tables.time_entry.push({business_id:'b',business_user_id:'u',project_id:'secret',duration_minutes:30,work_date:date});h.tables.pending_approvals.push({business_id:'other',status:'pending'},{business_id:'b',status:'approved'})
 expect(await loadMyDay(h.db,'b',owner,date)).toMatchObject({work:{state:'ready',value:{minutes:120}},decisions:{state:'ready',value:1}})
})
for(const patch of [{is_active:false},{business_id:'other'},{user_id:null}])test(`invalid identity rejects before reads ${JSON.stringify(patch)}`,async()=>{const h=database();await expect(loadMyDay(h.db,'b',{...employee,...patch},date)).rejects.toMatchObject({status:403});expect(h.reads).toHaveLength(0)})
test('invalid date rejected before reads',async()=>{const h=database();await expect(loadMyDay(h.db,'b',employee,'2026-02-30')).rejects.toMatchObject({status:400});expect(h.reads).toHaveLength(0)})
for(const source of ['project_assignment','project','time_entry','project_log'])test(`incomplete ${source} is unknown work, never zero`,async()=>{const h=database({},source);const r=await loadMyDay(h.db,'b',employee,date);expect(r.work.state).toBe('unavailable');expect(JSON.stringify(r.work)).not.toContain('minutes')})
test('failed decisions do not erase verified work',async()=>{const r=await loadMyDay(database({},'pending_approvals').db,'b',owner,date);expect(r.decisions?.state).toBe('unavailable');expect(r.work.state).toBe('ready')})
test('active timer is current even for historical date, never added to saved hours',async()=>{const h=database();h.tables.time_entry.push({business_id:'b',business_user_id:'u',project_id:'p',duration_minutes:40,work_date:date,check_in_time:'2026-09-08T10:00:00Z',check_out_time:null});const r=await loadMyDay(h.db,'b',employee,date);expect(r.timer).toEqual({state:'ready',value:true});expect(r.work).toMatchObject({value:{minutes:90,entries:1}});expect((await loadMyDay(h.db,'b',employee,'2026-09-07')).timer).toEqual({state:'ready',value:true})})
for(const duration_minutes of [null,-1,NaN])test(`unknown or invalid duration ${duration_minutes} isn't a zero-hour fact`,async()=>{const h=database();h.tables.time_entry[0].duration_minutes=duration_minutes;expect((await loadMyDay(h.db,'b',employee,date)).work.state).toBe('unavailable')})
test('overflow is unavailable instead of a truncated total',async()=>{const h=database();h.tables.time_entry=Array.from({length:501},()=>h.tables.time_entry[0]);expect((await loadMyDay(h.db,'b',employee,date)).work.state).toBe('unavailable')})
test('disabled followups never read the undeployed tables; enabled reads are tenant scoped and stale heartbeat remains explicit',async()=>{
 const before=process.env.DURABLE_QUOTE_FOLLOWUP_ENABLED
 try{process.env.DURABLE_QUOTE_FOLLOWUP_ENABLED='false';const h=database();expect((await loadMyDay(h.db,'b',owner,date)).followups).toBeNull();expect(h.reads).not.toContain('agent_followup')
 process.env.DURABLE_QUOTE_FOLLOWUP_ENABLED='true';h.tables.agent_followup=[{business_id:'b',id:'f',quote_id:'q',state:'scheduled',due_at:'2026-09-09T10:00:00Z'},{business_id:'other',id:'secret',state:'scheduled',due_at:'2026-09-09T10:00:00Z'}];h.tables.agent_followup_runner[0].last_tick_at='2020-01-01';const r=await loadMyDay(h.db,'b',owner,date);expect(r.followups).toMatchObject({state:'ready',value:{healthy:false,items:[{id:'f'}]}});expect(JSON.stringify(r)).not.toContain('secret');expect((await loadMyDay(database({},'agent_followup').db,'b',owner,date)).followups?.state).toBe('unavailable')
 }finally{if(before===undefined)delete process.env.DURABLE_QUOTE_FOLLOWUP_ENABLED;else process.env.DURABLE_QUOTE_FOLLOWUP_ENABLED=before}
})
test('actual HTTP route denies unauthenticated access and uses server identity, date, no-store',async()=>{
 const code=ts.transpileModule(fs.readFileSync('app/api/day-close/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
 const make=(business:any,user:any)=>{const m={exports:{} as any};new Function('require','exports','module',code)((name:string)=>{if(name==='next/server')return {NextRequest,NextResponse};if(name==='@/lib/auth')return {getAuthenticatedBusiness:async()=>business};if(name==='@/lib/permissions')return {getCurrentUser:async()=>user};if(name==='@/lib/supabase')return {getServerSupabase:()=>database().db};if(name==='@/lib/relief/my-day')return {loadMyDay};if(name==='@/lib/relief/day-summary')return {loadDaySummary:()=>{throw Error('wrong branch')}};if(name==='@/lib/matte/work-report')return require('../lib/matte/work-report');throw Error(name)},m.exports,m);return m.exports}
 const request=new NextRequest(`https://test/api/day-close?view=day&date=${date}&business_id=other&user_id=other`)
 expect((await make(null,null).GET(request)).status).toBe(401)
 expect((await make({business_id:'b'},null).GET(request)).status).toBe(403)
 const r=await make({business_id:'b'},employee).GET(request);expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');expect((await r.json()).overview.work).toMatchObject({value:{minutes:90}})
})
