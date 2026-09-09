const {PGlite}=require('@electric-sql/pglite')
const fs=require('node:fs'), assert=require('node:assert/strict'), ts=require('typescript'), vm=require('node:vm')
let db
const input={name:'Testkund',phone:'0701234567',email:'test_kund@example.invalid',message:'Badrum',source_ref:null,lead_source_id:null}
async function receive(key='request-0001',body=input,biz='a'){return (await db.query('select to_jsonb(receive_lead_intake($1,$2,$3,$4::jsonb)) r',[biz,'website',key,JSON.stringify(body)])).rows[0].r}
async function complete(id,biz='a'){return (await db.query('select complete_lead_intake($1,$2) r',[biz,id])).rows[0].r}
async function count(table){return Number((await db.query(`select count(*) n from ${table}`)).rows[0].n)}
async function seed(){await db.exec("TRUNCATE lead_intake_request,leads,deal,customer,pipeline_stage,pipeline_stages,counters,business_config CASCADE;INSERT INTO business_config VALUES('a'),('b');INSERT INTO pipeline_stage VALUES('s','a','new_inquiry');")}
const cases=[];const test=(name,fn)=>cases.push([name,fn])
test('receive commits before processing; replay preserves one receipt and rejects changed input',async()=>{
 const r=await receive(),again=await receive();assert.equal(r.id,again.id);assert.equal(r.state,'received');assert.equal(await count('customer'),0)
 await assert.rejects(()=>receive('request-0001',{...input,message:'Annat jobb'}),/intake_request_changed/)
 assert.equal(await count('lead_intake_request'),1)
})
test('complete writes customer/lead/deal once; lost response and concurrent retries reuse IDs',async()=>{
 const r=await receive();const a=await complete(r.id);const results=await Promise.all([complete(r.id),complete(r.id),complete(r.id)])
 assert.equal(a.receipt.state,'completed');assert.equal(a.fresh,true)
 for(const b of results){assert.equal(b.fresh,false);assert.equal(b.receipt.lead_id,a.receipt.lead_id);assert.equal(b.receipt.deal_id,a.receipt.deal_id)}
 for(const t of ['customer','leads','deal'])assert.equal(await count(t),1)
})
test('failure at final deal insert rolls back customer, lead and counters; receipt survives and retries',async()=>{
 await db.exec("CREATE FUNCTION reject_test_deal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure';END $$;CREATE TRIGGER reject_test_deal BEFORE INSERT ON deal FOR EACH ROW EXECUTE FUNCTION reject_test_deal();")
 const r=await receive();const blocked=await complete(r.id);assert.equal(blocked.receipt.state,'blocked');assert.equal(blocked.receipt.error_code,'storage_error')
 for(const t of ['customer','leads','deal','counters'])assert.equal(await count(t),0)
 assert.equal(await count('lead_intake_request'),1)
 await db.exec('DROP TRIGGER reject_test_deal ON deal;DROP FUNCTION reject_test_deal();')
 const done=await complete(r.id);assert.equal(done.receipt.state,'completed');assert.equal(done.receipt.attempts,2)
})
test('missing pipeline is retained, then recovers after configuration is repaired',async()=>{
 await db.exec('DELETE FROM pipeline_stage');const r=await receive();assert.equal((await complete(r.id)).receipt.error_code,'pipeline_unavailable')
 await db.exec("INSERT INTO pipeline_stage VALUES('s','a','new_inquiry')");assert.equal((await complete(r.id)).receipt.state,'completed')
})
test('ambiguous phone cannot merge customers or lose inquiry; repair allows same receipt',async()=>{
 await db.exec("INSERT INTO customer VALUES('c1','a','Ett','+46701234567',null),('c2','a','Två','0701234567',null)")
 const r=await receive();assert.equal((await complete(r.id)).receipt.error_code,'customer_ambiguous');assert.equal(await count('leads'),0)
 await db.exec("DELETE FROM customer WHERE customer_id='c2'");assert.equal((await complete(r.id)).receipt.customer_id,'c1')
})
test('same key in another business is independent; foreign completion is denied',async()=>{
 const r=await receive(),other=await receive('request-0001',input,'b');assert.notEqual(r.id,other.id)
 await assert.rejects(()=>complete(r.id,'b'),/intake_missing/);assert.equal(await count('customer'),0)
})
test('literal email underscore does not match a different customer',async()=>{
 await db.exec("INSERT INTO customer VALUES('wrong','a','Fel','+4681111111','testXkund@example.invalid')")
 const r=await receive();const done=await complete(r.id);assert.notEqual(done.receipt.customer_id,'wrong');assert.equal(await count('customer'),2)
})
test('normalised phone shares one customer across different request keys',async()=>{
 const a=await receive();await complete(a.id);const b=await receive('request-0002',{...input,phone:'+46 70 123 45 67'});await complete(b.id)
 assert.equal(await count('customer'),1);assert.equal(await count('leads'),2);assert.equal(await count('deal'),2)
})
test('inactive or foreign source cannot be attached to a saved lead',async()=>{
 const source='00000000-0000-0000-0000-000000000001'
 await db.query('INSERT INTO lead_sources VALUES($1,\'b\',true)',[source])
 const r=await receive('request-0001',{...input,lead_source_id:source});assert.equal((await complete(r.id)).receipt.error_code,'source_unavailable');assert.equal(await count('leads'),0)
})
test('phone SQL stays in parity with shared TypeScript normalization',async()=>{
 const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/phone-normalize.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:mod,exports:mod.exports})
 for(const phone of ['', '070-123 45 67','+46 70 1234567','0046701234567','46701234567','08-1234567','+447700900123','123','not a phone']){
  const actual=(await db.query('select lead_intake_phone($1) p',[phone])).rows[0].p
  assert.equal(actual,mod.exports.normalizeSwedishPhone(phone),phone)
 }
})
test('anon and authenticated cannot read receipts or execute intake functions',async()=>{
 for(const role of ['anon','authenticated']){
  await db.exec('SET ROLE '+role)
  try{await assert.rejects(()=>db.query('SELECT * FROM lead_intake_request'),/permission denied/);await assert.rejects(()=>receive(),/permission denied/)}finally{await db.exec('RESET ROLE')}
 }
})
test('portal metadata commits with entities, preserves existing address, and survives retry',async()=>{
 await db.exec("INSERT INTO customer(customer_id,business_id,name,phone_number,address_line) VALUES('existing','a','Test','0701234567','Original address')")
 const body={...input,category:'test-category',estimated_value:0,address_line:'New address'}
 const r=await receive('portal-0001',body);const done=await complete(r.id);await complete(r.id)
 assert.equal(done.receipt.state,'completed')
 const lead=(await db.query('select * from leads')).rows[0];assert.equal(lead.category,'test-category');assert.equal(lead.estimated_value,0)
 assert.equal((await db.query('select address_line from customer')).rows[0].address_line,'Original address')
 assert.equal(await count('deal'),1)
 await assert.rejects(()=>receive('portal-0001',{...body,estimated_value:42}),/intake_request_changed/)
})
test('metadata failure rolls back address and all entities, then recovery uses saved input',async()=>{
 await db.exec("INSERT INTO customer(customer_id,business_id,name,phone_number) VALUES('existing','a','Test','0701234567'); ALTER TABLE leads ADD CONSTRAINT reject_category CHECK(category IS NULL)")
 const r=await receive('portal-0001',{...input,category:'test-category',estimated_value:12000,address_line:'Saved address'})
 assert.equal((await complete(r.id)).receipt.state,'blocked');assert.equal(await count('leads'),0)
 assert.equal((await db.query('select address_line from customer')).rows[0].address_line,null)
 await db.exec('ALTER TABLE leads DROP CONSTRAINT reject_category')
 assert.equal((await complete(r.id)).receipt.state,'completed')
 assert.equal((await db.query('select address_line from customer')).rows[0].address_line,'Saved address')
})
;(async()=>{
 db=new PGlite()
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE TABLE business_config(business_id text primary key);
 CREATE TABLE customer(customer_id text primary key,business_id text,name text,phone_number text,email text);
 CREATE TABLE leads(lead_id text primary key,business_id text,customer_id text references customer(customer_id),name text,phone text,email text,notes text,source text CHECK(source='website_form'),status text,pipeline_stage_key text,score integer,lead_number text,lead_source_id uuid,source_ref text);
 CREATE TABLE pipeline_stage(id text primary key,business_id text,slug text);
 CREATE TABLE pipeline_stages(key text,business_id text,sort_order integer);
 CREATE TABLE lead_sources(id uuid primary key,business_id text,is_active boolean);
 CREATE TABLE deal(id text primary key,business_id text,customer_id text references customer(customer_id),lead_id text references leads(lead_id),title text,stage_id text references pipeline_stage(id),source text,deal_number integer,priority text);
 CREATE TABLE counters(business_id text,kind text,n integer,PRIMARY KEY(business_id,kind));
 CREATE FUNCTION increment_counter(p_business_id text,p_counter_type text) RETURNS integer LANGUAGE sql AS $$ INSERT INTO counters VALUES(p_business_id,p_counter_type,1) ON CONFLICT(business_id,kind) DO UPDATE SET n=counters.n+1 RETURNING n $$;
 GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`)
 await db.exec(fs.readFileSync('sql/v2_durable_lead_intake.sql','utf8'))
 await db.exec('ALTER TABLE customer ADD COLUMN address_line text; ALTER TABLE leads ADD COLUMN category text, ADD COLUMN estimated_value integer; ALTER TABLE lead_sources ADD COLUMN default_category text;')
 await db.exec(fs.readFileSync('sql/v2_portal_durable_intake.sql','utf8'))
 let failed=0
 for(const [name,fn]of cases){await seed();try{await fn();console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e)}}
 await db.close();assert.equal(failed,0);console.log(`PASS ${cases.length} actual SQL intake contracts (isolated PGlite)`)
})().catch(e=>{console.error(e);process.exitCode=1})
