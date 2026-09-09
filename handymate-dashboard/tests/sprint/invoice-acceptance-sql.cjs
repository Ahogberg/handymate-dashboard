const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),assert=require('node:assert/strict')
let db;const cases=[];const test=(name,fn)=>cases.push([name,fn]);
const row={invoice_id:'i1',business_id:'b',customer_id:'c',project_id:'p',invoice_number:'1',total:125,status:'draft'}
async function create(r=row,key='request',intent={total:125},times=['t'],materials=['m'],changes=['a']) {
 return (await db.query('SELECT to_jsonb(public.create_invoice_with_sources($1,$2,$3,$4,$5,$6)) r',[JSON.stringify(r),key,JSON.stringify(intent),times,materials,changes])).rows[0].r
}
async function reset(){await db.exec("TRUNCATE invoice,time_entry,project_material,project_change,quotes CASCADE;INSERT INTO time_entry VALUES('t','b','p','c',false,null);INSERT INTO project_material VALUES('m','b','p',false,null);INSERT INTO project_change VALUES('a','b','p','approved',null,null);")}
test('invoice and all three source types commit once; same request returns original invoice',async()=>{
 const a=await create();const b=await create({...row,invoice_id:'i2',invoice_number:'2'});assert.equal(a.invoice_id,b.invoice_id)
 for(const table of ['time_entry','project_material','project_change'])assert.equal((await db.query(`SELECT invoice_id FROM ${table}`)).rows[0].invoice_id,'i1')
 assert.equal((await db.query('SELECT count(*)::int n FROM invoice')).rows[0].n,1)
})
test('overlapping source set rolls back invoice and earlier source writes',async()=>{
 await db.exec("UPDATE project_change SET invoice_id='old' WHERE change_id='a'")
 await assert.rejects(()=>create(),/invoice_source_conflict/)
 assert.equal((await db.query('SELECT count(*)::int n FROM invoice')).rows[0].n,0)
 assert.equal((await db.query('SELECT invoice_id FROM time_entry')).rows[0].invoice_id,null)
 assert.equal((await db.query('SELECT invoice_id FROM project_material')).rows[0].invoice_id,null)
})
test('changed request cannot silently reuse old invoice',async()=>{await create();await assert.rejects(()=>create(row,'request',{total:999}),/invoice_request_changed/)})
test('another key cannot invoice already owned sources',async()=>{await create();await assert.rejects(()=>create({...row,invoice_id:'i2'},'other'),/invoice_source_conflict/);assert.equal((await db.query('SELECT count(*)::int n FROM invoice')).rows[0].n,1)})
test('foreign customer and foreign project rejected',async()=>{await assert.rejects(()=>create({...row,customer_id:'foreign'}),/invoice_project_mismatch/);await assert.rejects(()=>create({...row,project_id:'foreign'}),/invoice_project_mismatch/)})
test('same business but other project source rejected',async()=>{await db.exec("UPDATE time_entry SET project_id='p2' WHERE time_entry_id='t'");await assert.rejects(()=>create(),/invoice_source_conflict/)})
test('manual invoiced flag and invalid ATA status cannot be stolen',async()=>{
 await db.exec("UPDATE time_entry SET invoiced=true");await assert.rejects(()=>create(),/invoice_source_conflict/)
 await db.exec("UPDATE time_entry SET invoiced=false;UPDATE project_change SET status='draft'");await assert.rejects(()=>create(),/invoice_source_conflict/)
})
test('duplicate or missing source IDs rejected',async()=>{await assert.rejects(()=>create(row,'request',{},['t','t']),/invoice_sources_invalid/);await assert.rejects(()=>create(row,'request',{},['missing']),/invoice_source_conflict/)})
async function accept(){await db.exec("INSERT INTO quotes VALUES('q','b','sent');UPDATE quotes SET status='accepted' WHERE quote_id='q'")}
async function claim(step){return (await db.query('SELECT claim_quote_acceptance_step($1,$2,$3) token',['b','q',step])).rows[0].token}
async function finish(step,token,state){return db.query('SELECT finish_quote_acceptance_step($1,$2,$3,$4,$5,$6)',['b','q',step,token,state,null])}
test('acceptance journal is atomic with customer decision',async()=>{await accept();const r=(await db.query('SELECT * FROM quote_acceptance_completion')).rows[0];assert.equal(r.project_state,'pending');assert.equal(r.email_state,'pending')})
test('repeated acceptance creates one journal without resetting steps',async()=>{await accept();const t=await claim('project');await finish('project',t,'done');await db.exec("UPDATE quotes SET status='accepted'");assert.equal(await claim('project'),null);assert.equal((await db.query('SELECT count(*)::int n FROM quote_acceptance_completion')).rows[0].n,1)})
test('only one claimant; stale worker cannot overwrite a later internal claim',async()=>{await accept();const t=await claim('project');assert.equal(await claim('project'),null);await db.exec("UPDATE quote_acceptance_completion SET project_claimed_at=now()-interval '6 minutes'");const newer=await claim('project');assert.notEqual(t,newer);await assert.rejects(()=>finish('project',t,'done'),/acceptance_stale_claim/);await finish('project',newer,'done')})
test('email claim never expires into a duplicate send',async()=>{await accept();const t=await claim('email');await db.exec("UPDATE quote_acceptance_completion SET email_claimed_at=now()-interval '1 year'");assert.equal(await claim('email'),null);await finish('email',t,'uncertain');assert.equal(await claim('email'),null)})
test('failed internal step can resume independently of confirmed email',async()=>{await accept();await finish('email',await claim('email'),'done');await finish('project',await claim('project'),'failed');assert(await claim('project'));assert.equal(await claim('email'),null)})
test('unaccepted/foreign quote cannot be claimed',async()=>{await accept();await assert.rejects(()=>db.query("SELECT claim_quote_acceptance_step('other','q','email')"),/quote_not_accepted/)})
test('public roles cannot call privileged mutations or read journal',async()=>{
 for(const role of ['anon','authenticated']){await db.exec(`SET ROLE ${role}`);try{await assert.rejects(()=>create(),/permission denied/);await assert.rejects(()=>db.query('SELECT * FROM quote_acceptance_completion'),/permission denied/);await assert.rejects(()=>claim('email'),/permission denied/)}finally{await db.exec('RESET ROLE')}}
})
;(async()=>{
 db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE TABLE business_config(business_id text primary key);INSERT INTO business_config VALUES('b'),('other');
 CREATE TABLE customer(customer_id text primary key,business_id text);INSERT INTO customer VALUES('c','b'),('foreign','other');
 CREATE TABLE project(project_id text primary key,business_id text,customer_id text);INSERT INTO project VALUES('p','b','c'),('p2','b','c');
 CREATE TABLE invoice(invoice_id text primary key,business_id text,customer_id text,project_id text,invoice_number text,total numeric,status text);
 CREATE TABLE time_entry(time_entry_id text primary key,business_id text,project_id text,customer_id text,invoiced boolean,invoice_id text);
 CREATE TABLE project_material(material_id text primary key,business_id text,project_id text,invoiced boolean,invoice_id text);
 CREATE TABLE project_change(change_id text primary key,business_id text,project_id text,status text,invoice_id text,invoiced_at timestamptz);
 CREATE TABLE quotes(quote_id text primary key,business_id text,status text);
 GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;`)
 await db.exec(fs.readFileSync('sql/v2_invoice_source_commit.sql','utf8'))
 await db.exec(fs.readFileSync('sql/v2_quote_acceptance_completion.sql','utf8'))
 for(const [name,fn] of cases){await reset();await fn();console.log('PASS',name)}
 console.log(`PASS ${cases.length} invoice/acceptance SQL contracts (isolated PGlite)`);await db.close()
})().catch(e=>{console.error(e);process.exitCode=1})
