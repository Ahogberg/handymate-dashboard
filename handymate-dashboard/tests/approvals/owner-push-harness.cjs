const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../..'),cache={}
let tables,expoMode='ok',webMode='ok',calls=[],lostReceipt=false
function load(file){file=path.resolve(file);if(cache[file])return cache[file];const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,Date,console,Response,process:{env:{NEXT_PUBLIC_VAPID_PUBLIC_KEY:'mock-public',VAPID_PRIVATE_KEY:'mock-private'}},fetch:async(url,init)=>{
 assert.equal(url,'https://exp.host/--/api/v2/push/send');const payload=JSON.parse(init.body);assert.equal(payload.length,1);calls.push({channel:'expo',payload});if(expoMode==='network')throw Error('lost');return Response.json({data:[expoMode==='ok'?{status:'ok',id:'ticket-1'}:expoMode==='bad' ? {status:'ok'} : {status:'error'}]})
},require:name=>{
 if(name.startsWith('node:')||name==='crypto')return require(name)
 if(name==='web-push')return {setVapidDetails:()=>{},sendNotification:async(target,text)=>{calls.push({channel:'web',target,text});if(webMode!=='ok')throw Object.assign(Error('failed'),{statusCode:webMode==='rejected'?429:undefined});return {statusCode:201}}}
 if(name.startsWith('@/'))return load(path.join(root,name.slice(2)+'.ts'))
 if(name.startsWith('./'))return load(path.resolve(path.dirname(file),name+'.ts'))
 throw Error('Forbidden dependency '+name)
}});return cache[file]=mod.exports}
const db={from(table){let op='read',values,filters=[],single=false;const chain=new Proxy({}, {get(_,key){
 if(key==='then')return resolve=>{
  const rows=tables[table]||[],match=r=>filters.every(([k,v])=>r[k]===v)
  if(op==='insert'){
   if(rows.some(r=>r.id===values.id))return resolve({data:null,error:{code:'23505'}})
   rows.push(structuredClone(values));tables[table]=rows;return resolve({data:structuredClone(values),error:null})
  }
  const selected=rows.filter(match)
  if(op==='update'){selected.forEach(r=>Object.assign(r,structuredClone(values)));if(lostReceipt&&values.status==='accepted'){lostReceipt=false;return resolve({data:null,error:{message:'lost journal response'}})}}
  return resolve({data:structuredClone(single?selected[0]||null:selected),error:null})
 }
 return(...args)=>{if(key==='eq')filters.push(args);if(['single','maybeSingle'].includes(key))single=true;if(['insert','update'].includes(key)){op=key;values=args[0]}return chain}
}});return chain}}
function reset(){tables={business_users:[{id:'u1',business_id:'b1',user_id:'auth1',role:'owner',is_active:true,name:'Ägaren'}],push_tokens:[{id:'e1',business_id:'b1',user_id:'auth1',token:'ExponentPushToken[test]'}],push_subscriptions:[{id:'w1',business_id:'b1',user_id:'auth1',endpoint:'https://push.test/secret',p256dh:'secret-key',auth:'secret-auth'}],v3_automation_logs:[]};expoMode='ok';webMode='ok';calls=[];lostReceipt=false}
const {prepareOwnerPushReview:prepare,executeOwnerPushReview:execute}=load(path.join(root,'lib/approvals/owner-push-review.ts'))
const payload={rule_action_config:{title:'Hej {{customer_name}}',body:'En intern notis',url:'/dashboard'},customer_name:'Ada'}
;(async()=>{
 reset();const p=await prepare(db,'b1','a1',payload);assert.equal(calls.length,0);assert.equal(tables.v3_automation_logs.length,0);assert.equal(p.review.details[0].text,'Hej Ada');assert(!JSON.stringify(p).includes('secret-key'));assert(!JSON.stringify(p).includes('ExponentPushToken'))
 await assert.rejects(()=>prepare(db,'foreign','a1',payload),/ägare/)
 expoMode='rejected';let result=await execute(db,'b1','a1',p.executionPayload);assert.equal(result.partial,true);assert.equal(calls.length,2);assert.equal(calls.find(c=>c.channel==='expo').payload[0].title,'Hej Ada')
 expoMode='ok';result=await execute(db,'b1','a1',(await prepare(db,'b1','a1',payload)).executionPayload);assert.equal(result.ok,true);assert.equal(calls.filter(c=>c.channel==='web').length,1);assert.equal(calls.filter(c=>c.channel==='expo').length,2)
 await execute(db,'b1','a1',(await prepare(db,'b1','a1',payload)).executionPayload);assert.equal(calls.length,3)
 reset();const unknown=await prepare(db,'b1','a1',payload);expoMode='network';await execute(db,'b1','a1',unknown.executionPayload);result=await execute(db,'b1','a1',(await prepare(db,'b1','a1',payload)).executionPayload);assert.equal(result.partial,true);assert.equal(calls.length,2)
 reset();const lost=await prepare(db,'b1','a1',payload);lostReceipt=true;await execute(db,'b1','a1',lost.executionPayload);assert.equal((await execute(db,'b1','a1',(await prepare(db,'b1','a1',payload)).executionPayload)).ok,true);assert.equal(calls.length,2)
 reset();const revoked=await prepare(db,'b1','a1',payload);tables.business_users[0].role='employee';assert.equal((await execute(db,'b1','a1',revoked.executionPayload)).ok,false);assert.equal(calls.length,0)
 reset();const parallel=await prepare(db,'b1','a1',payload);await Promise.all([execute(db,'b1','a1',parallel.executionPayload),execute(db,'b1','a1',parallel.executionPayload)]);assert.equal(calls.length,2)
 reset();expoMode='bad';const invalid=await prepare(db,'b1','a1',payload);assert.equal((await execute(db,'b1','a1',invalid.executionPayload)).partial,true)
 console.log('PASS real owner-push review, per-device journals and Expo/web adapters: exact text/targets, secret-free evidence, scope, selective retry, uncertain result, lost journal response, revoked owner and concurrent claims. All transports mocked.')
})().catch(e=>{console.error(e);process.exitCode=1})
