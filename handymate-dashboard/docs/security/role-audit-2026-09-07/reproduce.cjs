// Offline observations, NOT a passing security gate. No real auth, DB or network.
// Run from app root: node docs/security/role-audit-2026-09-07/reproduce.cjs
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
global.fetch = () => { throw new Error('Network forbidden'); };
let actor, rows, mutations;
const blocked = new Proxy({}, { get: (_, key) => () => { throw new Error(`Unexpected dependency: ${String(key)}`); } });
function database() { return {from(table) {
  let filters=[], one=false, operation='read', update={};
  const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},order(){return q},single(){one=true;return q},maybeSingle(){one=true;return q},delete(){operation='delete';return q},update(v){operation='update';update=v;return q},then(resolve,reject){
    const matches=(rows[table]||[]).filter(r=>filters.every(f=>f(r)));
    if(operation!=='read') mutations.push({table,operation});
    const data=matches.map(r=>({...r,...update}));
    return Promise.resolve({data:one?(data[0]||null):data,error:null,count:matches.length}).then(resolve,reject);
  }}; return q;
}}; }
let permissions;
function load(file) {
  const out={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const localRequire=name=>{
    if(name==='next/server') return {NextResponse:{json:(data,options)=>new Response(JSON.stringify(data),options)}};
    if(name==='@/lib/auth') return {getAuthenticatedBusiness:async()=>({business_id:'firm-a'})};
    if(name==='@/lib/supabase') return {getServerSupabase:database};
    if(name==='@/lib/permissions') return {...permissions,getCurrentUser:async()=>actor};
    if(name==='@/lib/ata/strip-prices') return load('lib/ata/strip-prices.ts');
    if(name==='@/lib/ata/lifecycle') return load('lib/ata/lifecycle.ts');
    return blocked;
  };
  new Function('require','module','exports',code)(localRequire,out,out.exports);
  return out.exports;
}
permissions=load('lib/permissions.ts');
const detail=load('app/api/projects/[id]/route.ts'), projects=load('app/api/projects/route.ts'), team=load('app/api/team/route.ts');
function reset(role, business='firm-a') {
 actor={id:'staff',business_id:'firm-a',role,can_see_all_projects:false,can_see_financials:false,can_manage_users:false,can_approve_time:false,can_create_invoices:false};
 rows={project:[{project_id:'p',business_id:business,quote_id:'q',budget:9000}],quotes:[{quote_id:'q',business_id:business,total:12000}],project_assignment:[],time_entry:[],project_material:[{project_id:'p',business_id:business,total_purchase:500,total_sell:800}],business_users:[{...actor,internal_hourly_cost:350,hourly_cost:350,invite_token:'SYNTHETIC-PENDING-TOKEN'}]};mutations=[];
}
const request={nextUrl:new URL('https://offline.invalid/api/projects?projectId=p')};
const results=[];
(async()=>{
 for(const role of ['employee','project_manager','admin','owner']) {
  reset(role);
  let res=await detail.GET(request,{params:{id:'p'}}), body=await res.json();
  assert.equal(res.status,200);assert.equal(body.quote.total,12000);assert.equal(body.materials[0].total_purchase,500);
  results.push({case:'unassigned-project-detail',role,status:res.status,quoteTotal:body.quote.total,materialCost:body.materials[0].total_purchase,pricesRedacted:body.prices_redacted===true});
  reset(role);res=await projects.DELETE(request);assert.equal(res.status,200);assert.equal(mutations.length,8);
  results.push({case:'unassigned-project-delete',role,status:res.status,simulatedDeleteIntents:mutations.length});
 }
 for(const role of ['employee','project_manager']) {
  reset(role,'firm-b');let res=await detail.GET(request,{params:{id:'p'}});assert.equal(res.status,404);
  res=await projects.DELETE(request);assert.equal(res.status,404);assert.equal(mutations.length,0);
  results.push({case:'other-company-blocked',role,status:404,simulatedDeleteIntents:0});
  reset(role);res=await team.GET(request);const body=await res.json();assert.equal(body.members[0].internal_hourly_cost,null);assert.equal(body.members[0].invite_token,'SYNTHETIC-PENDING-TOKEN');
  results.push({case:'team-list',role,internalCost:body.members[0].internal_hourly_cost,inviteTokenExposed:true});
  res=await team.PATCH({...request,json:async()=>({id:'staff',name:'Synthetic name'})});const updated=await res.json();assert.equal(res.status,200);assert.equal(updated.member.internal_hourly_cost,350);
  results.push({case:'self-profile-update-response',role,status:res.status,internalCost:updated.member.internal_hourly_cost});
 }
 console.log(JSON.stringify({meaning:'Reproduced current handler behavior; security gaps remain. Synthetic DB/auth; not integration or production proof.',results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
