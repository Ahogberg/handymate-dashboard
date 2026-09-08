const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
let mailError=false,failWrite=false,foreign=false,mailCalls=0,smsCalls=0,scopes=[]
const db={from(table){let write=false,filters=[];const chain={select(){return chain},eq(k,v){filters.push([k,v]);return chain},single(){return chain},maybeSingle(){return chain},update(){write=true;return chain},insert(){write=true;return chain},then(resolve){if(table==='invoice')assert(filters.some(([k,v])=>k==='business_id'&&v==='b'));scopes.push(filters);resolve({data:foreign?null:write?[{invoice_id:'i'}]:{invoice_id:'i',status:'sent',customer_id:'c',reminder_count:0},error:write&&failWrite?{message:'write failed'}:null})}};return chain}}
const mod={exports:{}}
const code=ts.transpileModule(fs.readFileSync('lib/invoice-reminder-send.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
vm.runInNewContext(code,{module:mod,exports:mod.exports,console,process:{env:{ELKS_API_USER:'test',RESEND_API_KEY:'test'}},require(name){if(name==='@/lib/branding/attribution')return {loadAttribution:async()=>({}),attributionEmailHtml:()=>''};if(name==='@/lib/sms-send')return {sendSmsViaElks:async()=>{smsCalls++;return {success:true}}};if(name==='resend')return {Resend:class{emails={send:async()=>{mailCalls++;return mailError?{error:{message:'Rejected'},data:null}:{data:{id:'email-test'},error:null}}}}};if(name==='@/lib/branding/get-branding')return {loadBranding:async()=>({})};if(name==='@/lib/email-templates')return {emailLayout:(_b,html)=>html};throw Error(`Unexpected import ${name}`)}})
const input={invoiceId:'i',invoiceNumber:'1',businessId:'b',customerId:'c',businessName:'Test',customerPhone:'+46701234567',customerEmail:'test@example.test',emailToo:true,messages:{sms:'Hej',emailSubject:'Påminnelse',emailBody:'Betala'},level:'first',currentCount:0,nextReminderAt:null,reminderFee:0,interestAmount:0,penaltyInterest:0,daysOverdue:1}
;(async()=>{
 const run=()=>mod.exports.deliverInvoiceReminder(db,input)
 let r=await run();assert(r.smsSent&&r.emailSent);assert.equal(r.errors.length,0)
 mailError=true;r=await run();assert(r.smsSent);assert.equal(r.emailSent,false);assert(r.errors.includes('Rejected'))
 mailError=false;failWrite=true;r=await run();assert(r.smsSent&&r.emailSent);assert(r.errors.length>0)
 failWrite=false;foreign=true;const before=[mailCalls,smsCalls];r=await run();assert(r.skipped);assert.deepEqual([mailCalls,smsCalls],before)
 console.log('PASS reminder integration: accepted/rejected email result, partial writes, tenant verification, zero send on unverifiable invoice; provider calls mocked.')
})().catch(e=>{console.error(e);process.exitCode=1})
