// Actual transport adapter; token lookup, API logging and HTTP are isolated.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
let token=null,mode='ok',requests=[]
const mod={exports:{}}
const source=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../lib/fortnox.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
vm.runInNewContext(source+'\nrefreshTokenIfNeeded = async () => __token();',{module:mod,exports:mod.exports,process:{env:{}},console,Date,Buffer,Response,__token:()=>token,
 require:name=>{if(name==='@supabase/supabase-js')return {createClient:()=>{throw Error('Unexpected DB')}};if(name==='@/lib/fortnox/api-log')return {logFortnoxApi:async()=>{}};throw Error('Forbidden dependency '+name)},
 fetch:async(url,options)=>{requests.push({url,method:options.method});if(mode==='network')throw Error('response lost');if(mode==='bad')return Response.json({ErrorInformation:{message:'Invalid request'}},{status:400});if(mode==='server')return Response.json({ErrorInformation:{message:'Server failure'}},{status:500});return Response.json({Project:{ProjectNumber:'1042'}})}
})
const run=()=>mod.exports.fortnoxRequest('b1','POST','/projects',{Project:{ProjectNumber:'1042'}})
;(async()=>{
 await assert.rejects(run,e=>e instanceof mod.exports.FortnoxRequestNotSentError);assert.equal(requests.length,0)
 token='synthetic-test-token'
 for(const failure of ['network','bad','server']){mode=failure;await assert.rejects(run,e=>!(e instanceof mod.exports.FortnoxRequestNotSentError))}
 assert.equal(requests.length,3);mode='ok';assert.equal((await run()).Project.ProjectNumber,'1042');assert.equal(requests.length,4)
 console.log('PASS actual Fortnox transport: absent token proves no resource request; network errors and HTTP 400/500 never acquire the safe-not-sent classification.')
})().catch(e=>{console.error(e);process.exitCode=1})
