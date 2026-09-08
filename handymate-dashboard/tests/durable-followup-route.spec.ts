import {test,expect} from '@playwright/test'
import {NextRequest,NextResponse} from 'next/server'
import ts from 'typescript'
import {readFileSync} from 'fs'
import * as service from '../lib/followup/service'
import {isOwnerOrAdmin} from '../lib/permissions'
function route(auth:any,user:any,db:any){
 const exports:any={};const imports:any={'next/server':{NextRequest,NextResponse},'@/lib/dates':{svDateStr:()=> '2026-09-08'},'@/lib/auth':{getAuthenticatedBusiness:async()=>auth},'@/lib/permissions':{getCurrentUser:async()=>user,isOwnerOrAdmin},'@/lib/supabase':{getServerSupabase:()=>db},'@/lib/followup/service':service}
 new Function('require','exports',ts.transpileModule(readFileSync('app/api/quotes/[id]/followup/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((k:string)=>{if(!(k in imports))throw Error(k);return imports[k]},exports)
 return exports
}
const owner={id:'u',business_id:'a',is_active:true,role:'owner'}
function database(fail=false){
 const calls:any[]=[]
 const db={rpc:async(name:string,args:any)=>{calls.push({name,args});return {data:{id:'f'},error:null}},from:(table:string)=>{
  const filters:any={};const result=()=>({data:fail?null:table==='quotes'?filters.business_id==='a'?{quote_id:'q'}:null:table==='agent_followup_runner'?{enabled:true,last_tick_at:new Date().toISOString()}:filters.id?null:[],error:fail?{message:'offline'}:null})
  const q:any={select:()=>q,eq:(k:string,v:any)=>{filters[k]=v;return q},order:()=>q,limit:()=>q,maybeSingle:async()=>result(),single:async()=>result(),then:(a:any,b:any)=>Promise.resolve(result()).then(a,b)};return q}}
 return {db,calls}
}
test('actual HTTP routes deny absent identity, inactive users, employees and foreign quotes',async()=>{
 const {db,calls}=database();const req=new NextRequest('https://test/api/quotes/q/followup')
 for(const [auth,user,status] of [[null,null,401],[{business_id:'a'},null,403],[{business_id:'a'},{...owner,role:'employee'},403],[{business_id:'a'},{...owner,is_active:false},403],[{business_id:'b'},{...owner,business_id:'b'},404]] as any[]){
  for(const verb of ['GET','POST','DELETE'])expect((await route(auth,user,db)[verb](req,{params:{id:'q'}})).status).toBe(status)
 }
 expect(calls).toEqual([])
})
test('read errors are 503, disabled feature does not query absent tables, live empty response is no-store',async()=>{
 const previous=process.env.DURABLE_QUOTE_FOLLOWUP_ENABLED
 try{
  const req=new NextRequest('https://test/api/quotes/q/followup');process.env.DURABLE_QUOTE_FOLLOWUP_ENABLED='false'
  const disabled=await route({business_id:'a'},owner,database().db).GET(req,{params:{id:'q'}});expect(await disabled.json()).toEqual({enabled:false,items:[]})
  process.env.DURABLE_QUOTE_FOLLOWUP_ENABLED='true'
  const bad=await route({business_id:'a'},owner,database(true).db).GET(req,{params:{id:'q'}});expect(bad.status).toBe(503)
  const ok=await route({business_id:'a'},owner,database().db).GET(req,{params:{id:'q'}});expect(ok.headers.get('cache-control')).toBe('no-store');expect((await ok.json()).healthy).toBe(true)
 }finally{if(previous===undefined)delete process.env.DURABLE_QUOTE_FOLLOWUP_ENABLED;else process.env.DURABLE_QUOTE_FOLLOWUP_ENABLED=previous}
})
test('schedule uses server identity and URL quote, rejects timezone-free inputs, reports persistence failure',async()=>{
 const previous=process.env.DURABLE_QUOTE_FOLLOWUP_ENABLED;process.env.DURABLE_QUOTE_FOLLOWUP_ENABLED='true'
 try{
  const h=database(),r=route({business_id:'a'},owner,h.db)
  const post=(body:any)=>r.POST(new NextRequest('https://test/api/quotes/q/followup',{method:'POST',body:JSON.stringify(body)}),{params:{id:'q'}})
  expect((await post({due_at:'2026-09-09T09:00',request_key:'stable-key'})).status).toBe(409);expect(h.calls).toHaveLength(0)
  expect((await post({business_id:'b',user_id:'other',quote_id:'foreign',due_at:'2026-09-09T09:00:00+02:00',request_key:'stable-key'})).status).toBe(200)
  expect(h.calls[0].args).toMatchObject({p_business:'a',p_user:'u',p_quote:'q'})
  h.db.rpc=async()=>({data:null,error:{message:'runner_unavailable'}} as any)
  expect((await post({due_at:'2026-09-09T09:00:00Z',request_key:'stable-key'})).status).toBe(409)
 }finally{if(previous===undefined)delete process.env.DURABLE_QUOTE_FOLLOWUP_ENABLED;else process.env.DURABLE_QUOTE_FOLLOWUP_ENABLED=previous}
})
