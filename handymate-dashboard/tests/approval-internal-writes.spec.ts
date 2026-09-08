import { test, expect } from '@playwright/test'
import { attestApprovalTime, assignApprovalWork } from '../lib/approvals/internal-writes'

function database(failTable?:string, lostTable?:string) {
  const rows:Record<string,any[]>={time_checkins:[{id:'ci',business_id:'b',user_id:'u',status:'pending',checked_in_at:'2026-09-07T10:00:00Z'}],business_users:[{id:'member',business_id:'b',user_id:'u',name:'Anna'}],time_entry:[],booking:[{booking_id:'bk',business_id:'b',assigned_to:null,assigned_user_id:null}]}
  const writes:any[]=[]
  let failure=failTable
  const db={from(table:string){let filters:any[]=[],op='read',values:any,single=false;const chain:any={select(){return chain},eq(k:string,v:any){filters.push([k,v]);return chain},is(k:string,v:any){filters.push([k,v]);return chain},maybeSingle(){single=true;return chain},insert(v:any){op='insert';values=v;return chain},update(v:any){op='update';values=v;return chain},then(resolve:any){const matching=(rows[table]||[]).filter(r=>filters.every(([k,v])=>r[k]===v));if(op!=='read'){writes.push({table,op,filters,values});if(failure===table){failure=undefined;return resolve({data:null,error:{message:'write failed'}})}if(op==='insert')rows[table].push({...values});else matching.forEach(r=>Object.assign(r,values));if(lostTable===table){lostTable=undefined;return resolve({data:null,error:{message:'response lost'}})}}return resolve({data:single?matching[0]||null:matching,error:null})}};return chain}}
  return {db:db as any,rows,writes}
}
const dispatchPlan={type:'booking',id:'bk',memberId:'member',before:{assigned_to:null,assigned_user_id:null},after:{assigned_to:'Anna',assigned_user_id:'member'}}
const p={checkin_id:'ci',user_id:'u',duration_minutes:90}
test('time entry insert failure never marks check-in approved',async()=>{
 const x=database('time_entry');expect((await attestApprovalTime(x.db,'b','actor',p)).ok).toBe(false)
 expect(x.rows.time_checkins[0].status).toBe('pending');expect(x.rows.time_entry).toHaveLength(0)
})
test('retry after attestation failure reuses exactly one time row',async()=>{
 const x=database('time_checkins');expect(await attestApprovalTime(x.db,'b','actor',p)).toMatchObject({partial:true})
 expect(x.rows.time_entry).toHaveLength(1);expect((await attestApprovalTime(x.db,'b','actor',p)).ok).toBe(true)
 expect(x.rows.time_entry).toHaveLength(1);expect(x.rows.time_checkins[0].status).toBe('approved')
 expect(x.writes.filter(w=>w.op==='update').every(w=>w.filters.some(([k,v]:any[])=>k==='business_id'&&v==='b'))).toBe(true)
})
test('invalid date and a changed already registered duration fail before writes',async()=>{
 const x=database();expect((await attestApprovalTime(x.db,'b','actor',{...p,checked_in_at:'2026-02-31'})).ok).toBe(false)
 expect(x.writes).toHaveLength(0)
 await attestApprovalTime(x.db,'b','actor',p)
 const before=x.writes.length;expect((await attestApprovalTime(x.db,'b','actor',{...p,duration_minutes:120})).ok).toBe(false)
 expect(x.writes).toHaveLength(before)
})
test('assignment uses verified name and refuses missing or foreign targets and database errors',async()=>{
 const x=database();const p={context_type:'booking',context_id:'bk',member_id:'member',dispatchPlan,member_name:'Spoofed'}
 expect((await assignApprovalWork(x.db,'b',p)).ok).toBe(true);expect(x.rows.booking[0].assigned_to).toBe('Anna')
 expect((await assignApprovalWork(x.db,'foreign',p)).ok).toBe(false)
 expect((await assignApprovalWork(x.db,'b',{...p,context_id:'missing'})).ok).toBe(false)
 const broken=database('booking');expect((await assignApprovalWork(broken.db,'b',p)).ok).toBe(false)
})

test('lost write responses are reconciled from stored time, check-in and assignment',async()=>{
 for(const table of ['time_entry','time_checkins']){
  const x=database(undefined,table)
  expect((await attestApprovalTime(x.db,'b','actor',p)).ok).toBe(true)
  const timestamp=x.rows.time_checkins[0].approved_at
  const count=x.writes.length
  expect((await attestApprovalTime(x.db,'b','actor',p)).ok).toBe(true)
  expect(x.rows.time_entry).toHaveLength(1)
  expect(x.rows.time_checkins[0].approved_at).toBe(timestamp)
  expect(x.writes).toHaveLength(count)
 }
 const x=database(undefined,'booking')
 expect((await assignApprovalWork(x.db,'b',{context_type:'booking',context_id:'bk',member_id:'member',dispatchPlan})).ok).toBe(true)
})
test('changed date, billing or approval status never passes as a completed time attestation',async()=>{
 for(const change of [{work_date:'2026-09-06'},{is_billable:false},{approval_status:'pending'}]){
  const x=database()
  await attestApprovalTime(x.db,'b','actor',p)
  Object.assign(x.rows.time_entry[0],change)
  const count=x.writes.length
  expect((await attestApprovalTime(x.db,'b','actor',p)).ok).toBe(false)
  expect(x.writes).toHaveLength(count)
 }
})
test('nameless employee is not assigned',async()=>{
 const x=database();x.rows.business_users[0].name=''
 expect((await assignApprovalWork(x.db,'b',{context_type:'booking',context_id:'bk',member_id:'member',dispatchPlan})).ok).toBe(false)
 expect(x.writes).toHaveLength(0)
})

test('dispatch retry does not rewrite success or overwrite newer assignments',async()=>{
 const x=database(),p={context_type:'booking',context_id:'bk',member_id:'member',dispatchPlan}
 expect((await assignApprovalWork(x.db,'b',p)).ok).toBe(true)
 const count=x.writes.length
 expect((await assignApprovalWork(x.db,'b',p)).ok).toBe(true)
 expect(x.writes).toHaveLength(count)
 Object.assign(x.rows.booking[0],{assigned_to:'Other',assigned_user_id:'other'})
 expect((await assignApprovalWork(x.db,'b',p)).ok).toBe(false)
 expect(x.rows.booking[0].assigned_to).toBe('Other')
 expect(x.writes).toHaveLength(count)
 expect((await assignApprovalWork(x.db,'b',{...p,dispatchPlan:null})).ok).toBe(false)
})
