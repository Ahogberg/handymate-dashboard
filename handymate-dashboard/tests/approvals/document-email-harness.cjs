const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
let response,request
const mod={exports:{}}
const code=ts.transpileModule(fs.readFileSync('lib/email.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
vm.runInNewContext(code,{module:mod,exports:mod.exports,console,process:{env:{RESEND_API_KEY:'test-only'}},require:()=>{throw Error('Unexpected downstream action')},fetch:async(_url,init)=>{request=init;if(response instanceof Error)throw response;return response}})
;(async()=>{
 const input={to:'test@example.test',subject:'Reviewed',html:'<p>Reviewed</p>',attachments:[{filename:'jobbrapport.pdf',content:'cGRm'}],idempotencyKey:'reviewed/test'}
 const run=()=>mod.exports.sendEmail(input)
 response=Response.json({id:'m1'});let r=await run();assert.equal(r.deliveryState,'accepted');assert.equal(request.headers['Idempotency-Key'],input.idempotencyKey);assert.deepEqual(JSON.parse(request.body).attachments,input.attachments)
 response=Response.json({error:'bad request'},{status:422});r=await run();assert.equal(r.deliveryState,'rejected')
 response=Response.json({error:'try later'},{status:429});r=await run();assert.equal(r.deliveryState,'rejected')
 response=Response.json({error:'uncertain'},{status:500});r=await run();assert.equal(r.deliveryState,'unknown')
 response=Response.json({});r=await run();assert.equal(r.success,false);assert.equal(r.deliveryState,'unknown')
 response=Error('connection lost');r=await run();assert.equal(r.deliveryState,'unknown')
 console.log('PASS actual email adapter with mocked HTTP: exact attachment and idempotency header, accepted/rejected/rate-limited/unknown/missing-reference/connection-loss outcomes.')
})().catch(e=>{console.error(e);process.exitCode=1})
