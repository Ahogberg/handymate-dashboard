// Real GET handler; synthetic DB/auth. No network or live access proof.
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict'), ts=require('typescript');
const root=path.resolve(__dirname,'..');
let actor, proof, reads, scopes;
global.fetch=()=>{throw Error('Network forbidden')};
const blocked=new Proxy({},{get:(_,k)=>()=>{throw Error(`Unexpected dependency ${String(k)}`)}});
function load(file,imports){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(imports,m,m.exports);return m.exports}
const permissions=load(path.join(root,'lib/permissions.ts'),()=>blocked);
const db={from(table){reads.push(table);const q={select(){return q},eq(){return q},order(){return q},then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject)}};return q}};
const route=load(process.env.BASELINE_ROUTE||path.join(root,'app/api/projects/route.ts'),name=>{
 if(name==='next/server')return {NextResponse:{json:(b,o)=>new Response(JSON.stringify(b),o)}};
 if(name==='@/lib/supabase')return {getServerSupabase:()=>db};
 if(name==='@/lib/auth')return {getAuthenticatedBusiness:async()=>({business_id:'test-a',_impersonation:proof})};
 if(name==='@/lib/permissions')return {...permissions,getCurrentUser:async(req,scope)=>{scopes.push(scope);return actor}};
 return blocked;
});
const request={nextUrl:new URL('https://offline.invalid/api/projects'),headers:new Headers({'hm_impersonate':'test-a','x-is-superadmin':'true'})};
(async()=>{
 let passed=0;
 for(const [name,role,impersonation,status] of [
 ['missing membership, forged request headers',null,null,403],
 ['verified server impersonation',null,{admin_user_id:'verified-admin',admin_email:'test@example.invalid'},200],
 ['owner','owner',null,200],['admin','admin',null,200],
 ['PM without flags','project_manager',null,200],['employee without flags','employee',null,200]]){
 actor=role?{id:'member',business_id:'test-a',role,can_see_all_projects:false,can_see_financials:false}:null;
 proof=impersonation;reads=[];scopes=[];
 const res=await route.GET(request),body=await res.json();
 assert.equal(res.status,status,name);assert.deepEqual(scopes,['test-a'],'tenant-scoped identity');
 if(status===403)assert.deepEqual(reads,[],'no data queries before denial');else assert.deepEqual(body.projects,[]);
 passed++;console.log(`PASS ${name}`);
 }
 actor={id:'member',role:'admin'};proof=null;reads=[];scopes=[];
 assert.equal((await route.GET(request)).status,200);
 actor=null;reads=[];
 assert.equal((await route.GET(request)).status,403);assert.deepEqual(reads,[]);
 passed++;console.log('PASS membership revoked between requests');
 assert.equal(route.dynamic,'force-dynamic');passed++;
 console.log(`${passed} passed; synthetic auth/DB, not live role certification.`);
})().catch(e=>{console.error(e);process.exitCode=1});
