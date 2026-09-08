const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), path = require('node:path'), assert = require('node:assert/strict')
const rows = new Map(); let fail = '', sends = 0, uploads = 0, envelope
let provider = {success:true,deliveryState:'accepted',messageId:'mail-1'}
const db = {
  from(table) {
    assert.equal(table,'generated_document')
    let values, operation='read', filters=[]
    const c={ select(){return c},single(){return c},maybeSingle(){return c},eq(k,v){filters.push([k,v]);return c},
      insert(v){operation='insert';values=v;return c},update(v){operation='update';values=v;return c},
      then(resolve,reject){ try{
        let row
        if(operation==='insert'){
          if(rows.has(values.id))return resolve({data:null,error:{code:'23505'}})
          rows.set(values.id,structuredClone(values));return resolve({data:structuredClone(values),error:null})
        }
        assert(filters.some(([k,v])=>k==='business_id'&&v==='b'))
        row=[...rows.values()].find(r=>filters.every(([k,v])=>k==='variables_data'?JSON.stringify(r[k])===v:r[k]===v))
        if(operation==='read')return resolve({data:row?structuredClone(row):null,error:null})
        if(fail==='claim'&&values.variables_data.delivery.state==='sending')return resolve({data:[],error:null})
        if(fail==='receipt'&&values.variables_data.delivery.state==='accepted')return resolve({data:null,error:{message:'lost write'}})
        if(row)Object.assign(row,structuredClone(values))
        resolve({data:row?[{id:row.id}]:[],error:null})
      }catch(e){reject(e)}}
    }; return c
  },
  storage:{from(bucket){assert.equal(bucket,'customer-documents');return {upload:async(p,bytes)=>{uploads++;assert(p.startsWith('b/reports/'));return {error:fail==='upload'?{message:'fail'}:null}}}}},
}
const cache={}
function load(file){
  if(cache[file])return cache[file].exports
  const mod={exports:{}};cache[file]=mod
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
  vm.runInNewContext(code,{module:mod,exports:mod.exports,Buffer,console,require(name){
    if(name==='@/lib/email')return {sendEmail:async(params)=>{sends++;envelope=params;return provider}}
    if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'))
    if(name==='node:crypto')return require(name)
    throw Error(`Unexpected import ${name}`)
  }})
  return mod.exports
}
const {documentVersion,deliverReviewedDocument}=load(path.resolve('lib/approvals/document-delivery.ts'))
const doc={businessId:'b',approvalId:'a',projectId:'p',customerId:'c',title:'Report',pdf:Buffer.from('reviewed PDF bytes'),email:{to:'test@example.test',subject:'Report',html:'<p>Exact text</p>',fromName:'Company'}}
doc.version=documentVersion(doc.pdf,doc.email)
function reset(){rows.clear();fail='';sends=uploads=0;provider={success:true,deliveryState:'accepted',messageId:'mail-1'}}
const run=()=>deliverReviewedDocument(db,doc)
;(async()=>{
 reset();let r=await run();assert(r.ok&&r.email_sent);assert.equal(sends,1);assert.equal(envelope.attachments[0].content,doc.pdf.toString('base64'));assert.equal(envelope.customerId,undefined)
 r=await run();assert(r.ok&&r.reused);assert.equal(sends,1);assert.equal(uploads,1)
 reset();const both=await Promise.all([run(),run()]);assert.equal(sends,1);assert.equal(both.filter(r=>r.ok).length,1)
 reset();provider={success:false,deliveryState:'rejected',error:'rejected'};r=await run();assert(!r.ok&&r.partial);const key=envelope.idempotencyKey;provider={success:true,deliveryState:'accepted',messageId:'mail-2'};r=await run();assert(r.ok);assert.equal(envelope.idempotencyKey,key);assert.equal(sends,2);assert.equal(rows.size,1)
 reset();provider={success:false,deliveryState:'unknown',error:'timeout'};await run();r=await run();assert(!r.ok);assert.equal(sends,1)
 reset();fail='receipt';r=await run();assert(!r.ok&&r.email_sent&&r.partial);fail='';r=await run();assert(!r.ok);assert.equal(sends,1)
 reset();provider={success:true};r=await run();assert(!r.ok);await run();assert.equal(sends,1)
 reset();r=await deliverReviewedDocument(db,{...doc,pdf:Buffer.from('changed')});assert(!r.ok);assert.equal(sends,0);assert.equal(rows.size,0)
 reset();await run();const changed={...doc,email:{...doc.email,to:'other@example.test'}};changed.version=documentVersion(changed.pdf,changed.email);r=await deliverReviewedDocument(db,changed);assert(!r.ok);assert.equal(sends,1)
 reset();fail='upload';r=await run();assert(!r.ok);assert.equal(sends,0);fail='';r=await run();assert(r.ok);assert.equal(rows.size,1)
 reset();fail='claim';r=await run();assert(!r.ok);assert.equal(uploads,0);assert.equal(sends,0)
 console.log('PASS reviewed document journal: exact bytes/envelope, replay, concurrent claim, definite rejection retry, unknown outcome lock, lost receipt lock, missing provider ID, changed bytes/recipient, upload retry, CAS loser. No external sends.')
})().catch(e=>{console.error(e);process.exitCode=1})
