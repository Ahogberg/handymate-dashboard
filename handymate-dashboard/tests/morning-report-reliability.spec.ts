import { test, expect } from '@playwright/test'
import { c5Modules } from './helpers/c5-module'
import { classifyAgentFailure, isMorningReportRule, morningDriftLine } from '../lib/automation/morning-report'
const seed = { is_system:true,trigger_type:'cron',action_type:'run_agent',action_config:{instruction:'Generera morgonrapport med dagens bokningar, utestående offerter, försenade fakturor och insikter.'} }
test('recognizes the seeded rule by contract, not a mutable name; historical credit error has a class',()=>{
 expect(isMorningReportRule({...seed})).toBe(true)
 expect(isMorningReportRule({...seed,is_system:false})).toBe(false)
 expect(isMorningReportRule({...seed,action_config:{instruction:'Send offers'}})).toBe(false)
 expect(classifyAgentFailure('400 Your credit balance is too low to access the Anthropic API')).toBe('kredit')
 expect(classifyAgentFailure('queue failed')).toBe('ko');expect(classifyAgentFailure('unknown')).toBe('okant')
})
function setup(opts:{generationError?:boolean;push?:any;report?:any;attempt?:number;claimed?:boolean}={}) {
 const pushes:any[]=[],finishes:any[]=[],generations:any[]=[]
 const run={business_id:'a',day:'2026-09-15',rule_id:'r',attempt_token:'token',attempts:opts.attempt||1,notice_push_accepted:false,report:opts.report||null}
 const db:any={rpc:async(name:string,args:any)=>{if(name==='claim_morning_report')return {data:opts.claimed===false?[]:[run],error:null};finishes.push(args);return {data:true,error:null}},from(table:string){const q:any={select(){return q},eq(){return q},single:async()=>({data:{user_id:'owner-a'},error:null})};return q}}
 const load=c5Modules({'@/lib/notifications/tyst-tid':{arTystTid:()=>false},'@/lib/matte/morning-brief':{generateMorningBrief:async(b:string,o:any)=>{generations.push({b,o});if(opts.generationError)throw Error('underlag unavailable');return {date:run.day,agents:[],greeting:'God morgon'}}},'@/lib/notifications/push-internal':{sendInternalPush:async(p:any)=>{pushes.push(p);return opts.push||{delivered:true,sent:1}}}})
 return {db,pushes,finishes,generations,run:()=>load('lib/automation/morning-report.ts').runMorningReport(db,'a','r')}
}
test('success requires persisted strict report AND provider acceptance; owner-targeted push has no money',async()=>{
 const s=setup();const r=await s.run();expect(r.success).toBe(true)
 expect(s.generations).toEqual([{b:'a',o:{strict:true}}]);expect(s.pushes[0]).toMatchObject({business_id:'a',target_user_id:'owner-a'})
 expect(s.finishes[0]).toMatchObject({p_outcome:'delivered',p_failure_class:null,p_token:'token'})
})
test('generation failure persists class and delay notice even if no push recipient exists',async()=>{
 const s=setup({generationError:true,push:{delivered:false,sent:0,reason:'no_recipients'}});const r=await s.run()
 expect(r.error).toContain('[underlag]');expect(s.pushes).toHaveLength(1)
 expect(s.finishes[0]).toMatchObject({p_outcome:'failed',p_failure_class:'underlag',p_notice_push_accepted:false,p_report:null})
 expect(s.finishes[0].p_notice).toContain('tio minuter')
})
test('retry reuses a prepared report; unknown push outcome must never automatically send again',async()=>{
 const s=setup({report:{date:'2026-09-15'},attempt:2,push:{delivered:false,sent:0,reason:'network'}})
 const r=await s.run();expect(r.success).toBe(false);expect(s.generations).toHaveLength(0);expect(s.pushes).toHaveLength(1)
 expect(s.finishes[0]).toMatchObject({p_outcome:'unknown',p_failure_class:'leverans'})
 const duplicate=setup({claimed:false});expect((await duplicate.run()).data.skipped).toBe(true);expect(duplicate.pushes).toHaveLength(0)
})
test('second failed attempt never promises another retry; drift counts businesses and actual classes',async()=>{
 const s=setup({generationError:true,attempt:2});await s.run();expect(s.finishes[0].p_notice).not.toContain('tio minuter')
 const d=morningDriftLine([{business_id:'a',status:'retry',failure_class:'kredit'},{business_id:'a',status:'exhausted',failure_class:'kredit'},{business_id:'b',status:'delivered'},{business_id:'c',status:'unknown',failure_class:'ko'}])
 expect(d.count).toBe(2);expect(d.total).toBe(3);expect(d.line).toContain('kredit 1');expect(d.line).toContain('ko 1')
})
test('channel status API rejects another role before privileged readers; no-store for owner',async()=>{
 let role='employee',reads=0
 const load=c5Modules({'@/lib/auth':{getAuthenticatedBusiness:async()=>({business_id:'a'})},'@/lib/permissions':{getCurrentUser:async(_r:any,b:string)=>{expect(b).toBe('a');return {role,user_id:'owner-a'}}},'@/lib/supabase':{getServerSupabase:()=>{reads++;return {}}},'@/lib/channels/preflight':{channelPreflightEnabled:()=>true,preflightChannel:async(_s:any,b:string,c:string,o:any)=>{expect(b).toBe('a');expect(o.targetUserId).toBe('owner-a');return {channel:c,ok:true}}},'@/lib/automation/morning-report':{morningReliabilityEnabled:()=>false}})
 const route=load('app/api/dashboard/channels/route.ts');expect((await route.GET({})).status).toBe(403);expect(reads).toBe(0)
 role='owner';const r=await route.GET({});expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store')
})
test('orchestrator idempotency is tenant-scoped and an unfinished historical run is not success',async()=>{
 const filters:any[]=[],existing={run_id:'old',status:'failed'}
 const db={from:()=>{const q:any={select(){return q},eq(k:string,v:string){filters.push([k,v]);return q},single:async()=>({data:existing})};return q}}
 const load=c5Modules({'@/lib/supabase':{getServerSupabase:()=>db},'@/lib/costs/meter':{},'@/lib/agents/shared/cost-guard':{},'./agents/shared':{},'./agents/lead-agent':{},'./agents/ekonomi-agent':{},'./agents/strategi-agent':{}})
 const r=await load('lib/agent/orchestrator.ts').orchestrate({businessId:'a',triggerType:'automation_rule',triggerData:{},ruleName:'Morgonrapport',idempotencyKey:'same-name-and-day'})
 expect(r.success).toBe(false);expect(r.error).toContain('not repeated');expect(filters).toContainEqual(['business_id','a'])
 existing.status='completed';expect((await load('lib/agent/orchestrator.ts').orchestrate({businessId:'a',triggerType:'automation_rule',triggerData:{},ruleName:'Morgonrapport',idempotencyKey:'same-name-and-day'})).success).toBe(true)
})
