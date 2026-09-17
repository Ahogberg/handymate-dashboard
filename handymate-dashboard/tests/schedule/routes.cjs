const assert=require('node:assert/strict'),{load}=require('../sprint/integrity-loader.cjs')
const {NextRequest,NextResponse}=require('next/server')
function fixture(options={}) {
 const state={business_users:[{id:'a',name:'Anna',business_id:'biz',is_active:true},{id:'b',name:'Bo',business_id:'biz',is_active:true}],project:[{project_id:'p',name:'Badrum',business_id:'biz',status:'active',budget_hours:40}],project_assignment:[],time_entry:[],schedule_entry:[],booking:[],time_off_request:[],...options.tables}
 const writes=[],pushes=[]
 const db={from(table){let filters=[],range=[0,999999],one=false,insert=null;const q={
 select(){return q},order(){return q},range(a,b){range=[a,b];return q},limit(n){range=[0,n-1];return q},maybeSingle(){one=true;return q},insert(rows){insert=rows;return q},
 then(resolve,reject){return Promise.resolve().then(()=>{
  if(options.fail===table) return {data:null,error:{message:'Unavailable'}}
  if(insert){writes.push(insert);if(options.insertFail)return {data:null,error:{message:'Write failed'}};state[table].push(...insert);return {data:insert,error:null}}
  const rows=state[table].filter(r=>filters.every(f=>f(r))).slice(range[0],range[1]+1);return {data:one?rows[0]||null:rows,error:null}
 }).then(resolve,reject)}
 };for(const [method,compare] of Object.entries({eq:(a,b)=>a===b,neq:(a,b)=>a!==b,in:(a,b)=>b.includes(a),lt:(a,b)=>a<b,gt:(a,b)=>a>b,lte:(a,b)=>a<=b,gte:(a,b)=>a>=b,like:(a,b)=>a.startsWith(b.slice(0,-1))}))q[method]=(key,v)=>{filters.push(r=>compare(r[key],v));return q}
 q.or=()=>q;return q}}
 const mocks={'next/server':{NextResponse},'@/lib/supabase':{getServerSupabase:()=>db},'@/lib/auth':{getAuthenticatedBusiness:async()=>options.noAuth?null:{business_id:'biz'}},'@/lib/permissions':{getCurrentUser:async()=>options.noUser?null:{id:'a'},hasPermission:()=>!options.limited},'@/lib/notifications/schedule-push':{notifyScheduleAssignment:async x=>pushes.push(x)}}
 const batch=load('app/api/schedule/batch/route.ts',mocks),projects=load('app/api/schedule/projects/route.ts',mocks)
 const input={request_id:'test-request-00000001',business_user_ids:['a','b'],dates:['2026-09-14','2026-09-16','2026-09-18'],project_id:'p',title:'Badrum',type:'project',all_day:true}
 return {state,writes,pushes,input,post:(b=input)=>batch.POST(new NextRequest('https://test/api/schedule/batch',{method:'POST',body:JSON.stringify(b)})),get:()=>projects.GET(new NextRequest('https://test/api/schedule/projects'))}
}
let count=0
async function test(name,fn){await fn();count++;console.log('PASS',name)}
;(async()=>{
 await test('six slots in one write, replay without duplicate pushes',async()=>{const f=fixture();assert.equal((await f.post()).status,200);assert.equal(f.writes.length,1);assert.equal(f.writes[0].length,6);assert.equal(f.pushes.length,1);assert.equal((await f.post()).status,200);assert.equal(f.writes.length,1);assert.equal(f.pushes.length,1);assert.equal((await f.post({...f.input,title:'Changed'})).status,409)})
 for(const [name,options,code] of [['unauthenticated',{noAuth:true},401],['no actor',{noUser:true},403],['employee assigning others',{limited:true},403],['foreign member',{tables:{business_users:[]}},404],['foreign project',{tables:{project:[]}},404]]) await test(name,async()=>{const f=fixture(options);assert.equal((await f.post()).status,code);assert.equal(f.writes.length,0)})
 await test('employee cannot use unassigned job',async()=>{const f=fixture({limited:true});assert.equal((await f.post({...f.input,business_user_ids:['a']})).status,404)})
 await test('overlap requires explicit override',async()=>{const f=fixture({tables:{schedule_entry:[{id:'old',business_id:'biz',business_user_id:'b',status:'scheduled',start_datetime:'2026-09-14T08:00:00Z',end_datetime:'2026-09-14T12:00:00Z'}]}});assert.equal((await f.post()).status,409);assert.equal(f.writes.length,0);assert.equal((await f.post({...f.input,allow_conflicts:true})).status,200)})
 for(const table of ['schedule_entry','booking','time_off_request']) await test('failed '+table+' read blocks write',async()=>{const f=fixture({fail:table});assert.equal((await f.post()).status,503);assert.equal(f.writes.length,0)})
 await test('old booking missing end does not block later days',async()=>{const f=fixture({tables:{booking:[{booking_id:'old',assigned_user_id:'b',business_id:'biz',status:'confirmed',scheduled_start:'2026-09-01T08:00:00Z',scheduled_end:null}]}});assert.equal((await f.post()).status,200)})
 await test('approved absence blocks planning',async()=>{const f=fixture({tables:{time_off_request:[{id:'leave',business_id:'biz',business_user_id:'b',status:'approved',start_date:'2026-09-14',end_date:'2026-09-14'}]}});assert.equal((await f.post()).status,409)})
 await test('insert failure never reports success or pushes',async()=>{const f=fixture({insertFail:true});assert.equal((await f.post()).status,503);assert.equal(f.pushes.length,0)})
 await test('budget reported and planned remain distinct',async()=>{const f=fixture({tables:{time_entry:[{id:'t',business_id:'biz',project_id:'p',duration_minutes:1500}]}});await f.post();const p=(await (await f.get()).json()).projects[0];assert.equal(p.actual_hours,25);assert.equal(p.remaining_hours,15);assert.equal(p.planned_hours,48)})
 await test('failed time query is not displayed as zero',async()=>{const f=fixture({fail:'time_entry'});assert.equal((await f.get()).status,503)})
 await test('restricted employee sees no unassigned jobs',async()=>{const f=fixture({limited:true});assert.deepEqual((await (await f.get()).json()).projects,[])})
 const {parsePlanningBatch,planningSlots,plannedTeamHours,entryOnPlanningDate,planningBudget}=load('lib/schedule/planning.ts')
 await test('invalid dates and inverted times rejected',()=>{const f=fixture();assert.throws(()=>parsePlanningBatch({...f.input,dates:['2026-02-30']}));assert.throws(()=>parsePlanningBatch({...f.input,all_day:false,start_time:'16:00',end_time:'08:00'}))})
 await test('DST heldag is eight hours and ends exclusively',()=>{const f=fixture();const s=planningSlots(parsePlanningBatch({...f.input,dates:['2026-03-29'],business_user_ids:['a']}))[0];assert.equal((Date.parse(s.end_datetime)-Date.parse(s.start_datetime))/3600000,23);assert.equal(plannedTeamHours([{...s,id:'s',all_day:true}]),8);assert.equal(entryOnPlanningDate(s,'2026-03-30'),false);assert.equal(planningBudget(null,60).remaining_hours,null)})
 console.log(count+' planning checks passed')
})().catch(e=>{console.error(e);process.exitCode=1})
