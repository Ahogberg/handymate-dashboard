const fs=require('node:fs'),assert=require('node:assert/strict')
const page=fs.readFileSync('app/onboarding/page.tsx','utf8')
const start=page.indexOf('const next = useCallback(')+'const next = useCallback('.length
const end=page.indexOf(', [step, data, saveProgress])',start)
assert(start>25&&end>start)
const source='module.exports = '+page.slice(start,end)
let code
try { const ts=require('typescript'); code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText }
catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;code=require('node:module').stripTypeScriptTypes(source)}
function fixture(step,save){
 const state={step,error:'',writes:0,busy:false,lock:{current:false}}
 const env={step,TOTAL_STEPS:9,data:{businessId:'biz',specialties:['service'],standardHourlyRate:950,lisaNumber:'+4681234567'},jobStepLock:state.lock,
  setSavingJobs:v=>state.busy=v,setJobSaveError:v=>state.error=v,setStep:v=>state.step=v,
  normalizeStandardHourlyRate:v=>v,buildWorkingHours:()=>({}),sanitizeForSave:v=>v,
  saveProgress:async(...args)=>{state.writes++;assert.equal(args[3],true);await save(...args)},
 }
 const mod={exports:{}};new Function('module',...Object.keys(env),code)(mod,...Object.values(env));return {state,next:mod.exports}
}
;(async()=>{
 let count=0
 for(const step of [1,2,3,4,5,6,7]){
  let reject=true
  const h=fixture(step,async()=>{if(reject)throw Error('save failed')})
  await h.next();assert.equal(h.state.step,step);assert.equal(h.state.error,'save failed');assert.equal(h.state.busy,false)
  reject=false;await h.next();assert.equal(h.state.step,step+1);assert.equal(h.state.error,'');count++
 }
 let release;const pending=new Promise(r=>release=r)
 const h=fixture(4,()=>pending);const first=h.next();await h.next();assert.equal(h.state.writes,1);assert.equal(h.state.step,4)
 release();await first;assert.equal(h.state.step,5);count++
 assert(page.includes("if (res.status !== 401) throw new Error('Saved onboarding unavailable')"))
 assert(page.includes('if (loadError) return'));assert(page.includes('fieldset disabled={savingJobs}'))
 console.log(`PASS ${count} actual onboarding transition/retry contracts; storage isolated`)
})().catch(e=>{console.error(e);process.exitCode=1})
