const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict')
let fail = '', sends = 0, uploads = 0, successLogs = 0
const db = {
  from(table) {
    let write = false; const filters = []
    const chain = {
      select() { return chain }, eq(k,v) { filters.push([k,v]); return chain }, single() { return chain },
      insert() { write = true; return chain },
      then(resolve) {
        if (['project','customer'].includes(table)) assert(filters.some(([k,v]) => k === 'business_id' && v === 'b'))
        if (table === 'v3_automation_logs') successLogs++
        resolve({ data: table === 'project' ? (fail === 'project' ? null : {project_id:'p',customer_id:'c'}) : table === 'customer' ? {customer_id:'c',email:fail === 'recipient' ? 'changed@example.test' : 'test@example.test'} : null,
          error: write && fail === table ? {message:'write failed'} : null })
      },
    }; return chain
  },
  storage: {from() {return {upload:async()=>{uploads++;return {error:fail === 'upload' ? {message:'upload failed'} : null}}}}},
}
class Pdf { internal={pageSize:{getWidth:()=>210}}; setFileId(){}; setCreationDate(){}; setFontSize(){}; setTextColor(){}; setFont(){}; text(){}; splitTextToSize(s){return [s]}; output(){return new ArrayBuffer(8)} }
const mod={exports:{}}
const code=ts.transpileModule(fs.readFileSync('lib/job-report.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
vm.runInNewContext(code,{module:mod,exports:mod.exports,Buffer,console,require(name){
  if(name==='node:crypto')return require(name)
  if(name==='@/lib/supabase')return {getServerSupabase:()=>db}
  if(name==='@/lib/branding/attribution')return {loadAttribution:async()=>({}),buildAttribution:()=>({}),stampAttributionOnPdf:()=>{}}
  if(name==='@/lib/branding/pdf')return {loadPdfBranding:async()=>({accent:[0,0,0]}),drawBrandHeader:()=>20,drawBrandFooter:()=>{},PDF_TEXT_MUTED:[0,0,0],PDF_TEXT_PRIMARY:[0,0,0]}
  if(name==='jspdf')return {default:Pdf}
  if(name==='jspdf-autotable')return {}
  if(name==='@/lib/storage-signing')return {signStorageUrl:async()=>fail==='sign'?null:'https://example.test/report'}
  if(name==='@/lib/email')return {sendEmail:async()=>{sends++;if(fail==='throw')throw Error('uncertain');return {success:fail!=='mail',error:fail==='mail'?'rejected':undefined}}}
  if(name==='@/lib/branding/get-branding')return {loadBranding:async()=>({})}
  if(name==='@/lib/email-templates')return {emailLayout:()=>'',emailHeading:()=>'',emailParagraph:()=>'',actionBlock:()=>'',signature:()=>''}
  if(name==='@/lib/document-html')return {escapeHtml:s=>s}
  throw Error(`Unexpected import ${name}`)
}})
const data={projectId:'p',customerName:'Test',customerEmail:'test@example.test',projectName:'P',completedAt:'2026-09-08',workPerformed:['Done'],materials:[],businessName:'B',contactName:'C'}
;(async()=>{
 for(const failure of ['project','recipient','upload','generated_document','sign','mail','throw','v3_automation_logs','']){
   fail=failure;sends=uploads=successLogs=0
   const result=await mod.exports.approveJobReport('b','p',data)
   assert.equal(result.success,!failure,failure)
   if(['project','recipient'].includes(failure)){assert.equal(uploads,0);assert.equal(sends,0)}
   if(['upload','generated_document','sign'].includes(failure))assert.equal(sends,0)
   if(['mail','throw'].includes(failure)){assert.equal(result.email_sent,false);assert.equal(result.partial,true);assert.equal(successLogs,0)}
   if(failure==='v3_automation_logs'){assert.equal(result.email_sent,true);assert.equal(result.partial,true);assert.equal(sends,1)}
   if(!failure){assert.equal(result.email_sent,true);assert.equal(sends,1)}
 }
 console.log('PASS job report: tenant and recipient checks, upload/document/sign failures, rejected/uncertain email, sent with failed history, accepted send. Providers and PDF renderer mocked.')
})().catch(e=>{console.error(e);process.exitCode=1})
