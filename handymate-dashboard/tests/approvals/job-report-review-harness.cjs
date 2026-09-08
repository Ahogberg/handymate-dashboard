const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path'),assert=require('node:assert/strict')
let foreign=false, changed=false, writes=0, downloads=0, photoBytes
const payload={projectId:'p',customerName:'Old',customerEmail:'test@example.test',projectName:'Old',completedAt:'2026-09-08',workPerformed:['Badrummet har renoverats enligt arbetsbeskrivningen.'],materials:[{name:'Blandare',quantity:1,unit:'st'}],photos:[],deviations:['Extra tätning utfördes vid golvbrunnen.'],diaryHours:18,warrantyWorkYears:2,warrantyMaterialYears:5}
const db={from(table){const filters=[];const c={select(){return c},eq(k,v){filters.push([k,v]);return c},single(){return c},insert(){writes++;throw Error('Preview wrote')},update(){writes++;throw Error('Preview wrote')},then(resolve){assert(filters.some(([k,v])=>k==='business_id'&&v==='b'));resolve({data:foreign?null:table==='project'?{project_id:'p',customer_id:'c',name:changed?'Ändrat projekt':'Badrum Solvägen 12'}:table==='customer'?{customer_id:'c',name:'Test Kund',email:'test@example.test',address_line:'Solvägen 12'}:{business_name:'Test Bygg AB',contact_name:'Anna Test',org_number:'000000-0000',accent_color:'#0F766E'},error:null})}};return c},storage:{from(){return {download:async(p)=>{downloads++;assert.equal(p,'b/photo.png');return {data:new Blob([photoBytes],{type:'image/png'}),error:null}}}}}}
const cache={}
function load(file){if(cache[file])return cache[file].exports;const mod={exports:{}};cache[file]=mod
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText
 vm.runInNewContext(code,{module:mod,exports:mod.exports,Buffer,console,URL,Date,process:{env:{}},fetch:()=>{throw Error('Network forbidden')},require(name){
   if(name==='@/lib/supabase')return {getServerSupabase:()=>db}
   if(name.startsWith('@/'))return load(path.resolve(name.replace('@/','')+'.ts'))
   if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'))
   return require(name)
 }});return mod.exports}
;(async()=>{
 const {prepareJobReport}=load(path.resolve('lib/approvals/job-report-review.ts'))
 let a=await prepareJobReport(db,'b','a',payload),b=await prepareJobReport(db,'b','a',payload)
 assert(a.document.pdf.equals(b.document.pdf),'PDF bytes must be deterministic');assert.equal(a.document.version,b.document.version);assert.equal(writes,0)
 assert(a.review.messages[0].html===a.document.email.html);assert.equal(a.review.messages[0].recipients[0],a.document.email.to);assert(a.review.attachments[0].url.endsWith(a.document.version));assert(a.document.pdf.length>1000)
 fs.writeFileSync('/tmp/job-report-preview.pdf',a.document.pdf)
 changed=true;b=await prepareJobReport(db,'b','a',payload);assert.notEqual(a.document.version,b.document.version);changed=false
 foreign=true;await assert.rejects(()=>prepareJobReport(db,'b','a',payload));foreign=false
 await assert.rejects(()=>prepareJobReport(db,'b','a',{...payload,customerEmail:'wrong@example.test'}))
 await assert.rejects(()=>prepareJobReport(db,'b','a',{...payload,materials:[{name:'Invalid',quantity:-1,unit:'st'}]}))
 await assert.rejects(()=>prepareJobReport(db,'b','a',{...payload,photos:[{url:'https://attacker.example/image'}]}));assert.equal(downloads,0)
 await assert.rejects(()=>prepareJobReport(db,'b','a',{...payload,photos:[{url:'other-business/photo.png'}]}));assert.equal(downloads,0)
 const canvas=require('@napi-rs/canvas').createCanvas(480,240),ctx=canvas.getContext('2d');ctx.fillStyle='#0F766E';ctx.fillRect(0,0,480,240);ctx.fillStyle='white';ctx.font='24px sans-serif';ctx.fillText('Syntetiskt bildprov',80,120);photoBytes=canvas.toBuffer('image/png')
 const withPhoto=await prepareJobReport(db,'b','a',{...payload,photos:[{url:'b/photo.png',caption:'Syntetisk dokumentation, inga kundbilder'}]});assert.equal(downloads,1);assert.notEqual(withPhoto.document.version,a.document.version);fs.writeFileSync('/tmp/job-report-photo.pdf',withPhoto.document.pdf)
 const long=await prepareJobReport(db,'b','a',{...payload,workPerformed:['Testat arbete. '.repeat(1200)]});fs.writeFileSync('/tmp/job-report-long.pdf',long.document.pdf)
 console.log('PASS job report read-only preparation: actual PDF renderer, deterministic bytes/version, exact mail, changed project, foreign tenant, recipient mismatch, invalid material, external/foreign photo denied. Sample /tmp/job-report-preview.pdf')
})().catch(e=>{console.error(e);process.exitCode=1})
