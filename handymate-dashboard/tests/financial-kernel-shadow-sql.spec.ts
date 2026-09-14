import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { receivablesDatabase, seedInvoice, domain } from './helpers/financial-receivables-database'
let f: Awaited<ReturnType<typeof receivablesDatabase>>
const phase=(p:string|null='S1',b='a',actor:string|null='admin',reason:string|null='Pilot checked')=>domain<any>(f.db,'set_financial_kernel_phase',[b,p,actor,reason])
const open=()=>domain<any>(f.db,'open_shadow_run',['a','manual',1])
const diff=[{kind:'ROUNDING_DIVERGENCE',severity:'low',expected:'100',actual:'101'}]
const compare=(run:string,result='divergent',differences:any=diff,invoice='i',snapshot:string|null=null)=>domain<any>(f.db,'record_shadow_comparison',['a',run,1,'invoice',invoice,snapshot,result,{},differences])
const close=(id:string)=>domain(f.db,'close_shadow_run',['a',id,'completed',{}])
async function rejects(fn:()=>Promise<unknown>,message?:RegExp){await f.db.exec('SAVEPOINT expected_error');try {await expect(fn()).rejects.toThrow(message)}finally{await f.db.exec('ROLLBACK TO SAVEPOINT expected_error')}}
test.beforeAll(async()=>{f=await receivablesDatabase();await f.db.exec('ALTER TABLE invoice ADD COLUMN sent_at timestamptz, ADD COLUMN fortnox_document_number text; SET ROLE deployer');await f.db.exec(readFileSync('sql/v242_financial_kernel_shadow.sql','utf8'));await f.db.exec('RESET ROLE')})
test.afterAll(async()=>{await f?.db.close()})
test.beforeEach(async()=>{await f.db.exec('BEGIN');await seedInvoice(f.db,'i')})
test.afterEach(async()=>{await f.db.exec('ROLLBACK; RESET ROLE')})
test('phase validates inputs, appends ordered history even within one transaction, never changes a second tenant',async()=>{
 expect(await domain(f.db,'financial_kernel_phase',['a'])).toBe('off')
 for(const p of ['S2',null,'bad'])await rejects(()=>phase(p))
 for(const actor of ['',null,'  '])await rejects(()=>phase('S1','a',actor))
 for(const reason of ['',null,'ab','   '])await rejects(()=>phase('S1','a','admin',reason))
 expect(await phase()).toMatchObject({phase:'S1',changed:true});expect(await phase()).toMatchObject({changed:false})
 expect(await phase('off')).toMatchObject({phase:'off',changed:true})
 expect(await domain(f.db,'financial_kernel_phase',['a'])).toBe('off')
 expect(await domain(f.db,'financial_kernel_phase',['b'])).toBe('off')
 expect((await f.db.query('SELECT * FROM financial_kernel_rollout')).rows).toHaveLength(2)
})
test('service_role cannot bypass audited phase or directly mutate shadow tables',async()=>{
 await phase()
 for(const table of ['financial_kernel_rollout','financial_shadow_snapshots','financial_shadow_runs','financial_shadow_comparisons','financial_shadow_divergences','financial_shadow_resolutions']){
  const r=(await f.db.query<any>(`SELECT has_table_privilege('service_role',$1,'INSERT,UPDATE,DELETE,TRUNCATE') allowed`,[table])).rows[0];expect(r.allowed,table).toBe(false)
 }
 await f.db.exec('RESET ROLE');await rejects(()=>f.db.exec("INSERT INTO business_config(business_id,financial_kernel_enabled) VALUES('raw',true)"),/phase/)
 await rejects(()=>f.db.exec("UPDATE business_config SET financial_kernel_enabled=false WHERE business_id='a'"),/phase/)
})
test('same-run and same-day repeats do not confirm; two consecutive daily observations confirm once',async()=>{
 await phase();let r=await open();let a=await compare(r.run_id);expect(a.divergences[0]).toMatchObject({seen_count:1,confirmed:false,report:false})
 await close(r.run_id);r=await open();a=await compare(r.run_id);expect(a.divergences[0]).toMatchObject({seen_count:1,confirmed:false})
 await close(r.run_id)
 await f.db.exec("RESET ROLE; UPDATE financial_shadow_divergences SET last_seen_at=now()-interval '1 day'; SET LOCAL ROLE service_role")
 r=await open();a=await compare(r.run_id);expect(a.divergences[0]).toMatchObject({seen_count:2,confirmed:true,report:true})
 expect(await domain(f.db,'mark_shadow_divergences_reported',['a',[a.divergences[0].id]])).toBe(1)
 await close(r.run_id);r=await open();a=await compare(r.run_id);expect(a.divergences[0].report).toBe(false)
})
test('match resolves with comparison provenance and manual resolution requires evidence',async()=>{
 await phase();let r=await open();const a=await compare(r.run_id);await close(r.run_id);r=await open()
 for(const typ of [null,'superseded_by_match','bad'])await rejects(()=>domain(f.db,'resolve_shadow_divergence',['a',a.divergences[0].id,typ,'Checked','admin',null,null]))
 await rejects(()=>domain(f.db,'resolve_shadow_divergence',['a',a.divergences[0].id,'fixed','xx','admin',null,null]))
 const match=await compare(r.run_id,'match',[]);expect(match.closed).toBe(1)
 const res=(await f.db.query<any>('SELECT * FROM financial_shadow_resolutions')).rows[0];expect(res).toMatchObject({resolution_type:'superseded_by_match',fix_reference:match.comparison_id})
 await rejects(()=>domain(f.db,'resolve_shadow_divergence',['a',a.divergences[0].id,'accepted','Checked','admin',null,null]),/not_open/)
})
test('run lifecycle, missing reference and all unsupported levels have explicit evidence',async()=>{
 await rejects(open,/phase_off/);await phase();const r=await open()
 await rejects(open,/already_running/)
 await rejects(()=>compare(r.run_id,'divergent',[]),/differences_required/)
 const a=await compare(r.run_id,'reference_missing',[]);expect(a.divergences).toHaveLength(1);expect(a.divergences[0]).toMatchObject({kind:'REFERENCE_DATA_UNAVAILABLE',severity:'medium'})
 for(const [level,type] of [[2,'ledger'],[3,'aggregate'],[4,'report']]) expect(await domain(f.db,'record_shadow_comparison',['a',r.run_id,level,type,null,null,'unsupported',{reason:'bookkeeping scope not granted'},[]])).toMatchObject({divergences:[]})
 await close(r.run_id);await rejects(()=>close(r.run_id),/not_running/);await rejects(()=>compare(r.run_id),/not_running/)
})
test('RLS, immutability, pinned service-only RPCs and cross-tenant snapshot identity',async()=>{
 await phase();const snap=await domain<string>(f.db,'record_shadow_snapshot',['a','fortnox','invoice','1','i','ok',{Total:1},null]);const r=await open()
 await rejects(()=>domain(f.db,'record_shadow_snapshot',['a','fortnox','invoice','1','i','ok',null,null]))
 await rejects(()=>domain(f.db,'record_shadow_snapshot',['b','fortnox','invoice','1','i','ok',{Total:1},null]))
 await compare(r.run_id,'match',[], 'i',snap)
 await f.db.exec('RESET ROLE')
 for(const table of ['financial_kernel_rollout','financial_shadow_snapshots','financial_shadow_comparisons'])await rejects(()=>f.db.exec(`UPDATE ${table} SET id=id`),/immutable/)
 await f.db.exec("SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true)")
 expect((await f.db.query('SELECT * FROM financial_kernel_rollout')).rows).toHaveLength(1)
 await rejects(()=>phase('off'))
 await rejects(()=>f.db.exec("INSERT INTO financial_shadow_runs (business_id,phase,trigger_type,comparison_version) VALUES('a','S1','manual',1)"))
})
test('retries and multiple dimensions of one kind do not inflate sightings; gaps restart confirmation',async()=>{
 await phase();let r=await open();const first=await compare(r.run_id,'divergent',[...diff,...diff]);expect(first.divergences).toHaveLength(1)
 expect(await compare(r.run_id,'divergent',[...diff,...diff])).toMatchObject({replayed:true,divergences:[]})
 await rejects(()=>compare(r.run_id,'match',[]),/conflict/)
 await close(r.run_id);await f.db.exec("RESET ROLE;UPDATE financial_shadow_divergences SET last_seen_at=clock_timestamp()-interval '3 days';SET LOCAL ROLE service_role")
 r=await open();expect((await compare(r.run_id)).divergences[0]).toMatchObject({seen_count:1,confirmed:false})
})
test('bounded candidate selection includes missing references, exact amounts and tenant isolation',async()=>{
 await phase();await f.db.exec("RESET ROLE;UPDATE invoice SET sent_at=clock_timestamp(),paid_amount=90071992547409.93 WHERE invoice_id='i';SET LOCAL ROLE service_role")
 const rows=(await f.db.query<any>("SELECT * FROM list_shadow_candidates('a',500)")).rows
 expect(rows).toHaveLength(1);expect(rows[0].handymate).toMatchObject({invoice_id:'i',paid_amount:'90071992547409.93',projection:null,fortnox_document_number:null})
 expect((await f.db.query("SELECT * FROM list_shadow_candidates('b',200)")).rows).toEqual([])
 const r=await open();await compare(r.run_id,'reference_missing',[])
 await seedInvoice(f.db,'second');await f.db.exec("RESET ROLE;UPDATE invoice SET sent_at=clock_timestamp() WHERE invoice_id='second';SET LOCAL ROLE service_role")
 const ordered=(await f.db.query<any>("SELECT * FROM list_shadow_candidates('a',1)")).rows;expect(ordered[0].invoice_id).toBe('second')
})
test('all twelve RPCs pin search_path and deny client execution, while six tables enforce member reads',async()=>{
 const names=['financial_kernel_phase','set_financial_kernel_phase','list_financial_kernel_work','open_shadow_run','close_shadow_run','record_shadow_snapshot','record_shadow_comparison','mark_shadow_divergences_reported','resolve_shadow_divergence','list_shadow_divergences','financial_shadow_status','list_shadow_candidates']
 const rows=(await f.db.query<any>(`SELECT proname,prosecdef,proconfig,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') member,has_function_privilege('service_role',oid,'EXECUTE') service FROM pg_proc WHERE proname=ANY($1)`,[names])).rows
 expect(rows).toHaveLength(12);for(const row of rows){expect(row).toMatchObject({prosecdef:true,anon:false,member:false,service:true});expect(row.proconfig.join()).toMatch(/search_path=public,\s*pg_temp/)}
 const tables=(await f.db.query<any>("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ('financial_kernel_rollout','financial_shadow_snapshots','financial_shadow_runs','financial_shadow_comparisons','financial_shadow_divergences','financial_shadow_resolutions')")).rows
 expect(tables).toHaveLength(6);for(const row of tables)expect(row).toMatchObject({relrowsecurity:true,relforcerowsecurity:false})
})
