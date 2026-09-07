// Verifiering EFTER rättning av R1–R4 (Claude 2026-09-07). Samma syntetiska
// DB/auth som reproduce.cjs (Codex), men assertions för det rättade beteendet.
// Exit 0 = luckorna är stängda i handlers; inte ett integrations- eller prodprov.
// Kör från app-roten: node docs/security/role-audit-2026-09-07/verify-fix.cjs
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
global.fetch = () => { throw new Error('Network forbidden'); };
let actor, rows, mutations, impersonation=null;
const blocked = new Proxy({}, { get: (_, key) => () => { throw new Error(`Unexpected dependency: ${String(key)}`); } });
function database() { return {from(table) {
  let filters=[], one=false, operation='read', update={};
  const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},order(){return q},limit(){return q},single(){one=true;return q},maybeSingle(){one=true;return q},delete(){operation='delete';return q},update(v){operation='update';update=v;return q},then(resolve,reject){
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
    if(name==='@/lib/auth') return {getAuthenticatedBusiness:async()=>({business_id:'firm-a',_impersonation:impersonation})};
    if(name==='@/lib/supabase') return {getServerSupabase:database};
    if(name==='@/lib/permissions') return {...permissions,getCurrentUser:async()=>actor};
    if(name==='@/lib/ata/strip-prices') return load('lib/ata/strip-prices.ts');
    if(name==='@/lib/ata/lifecycle') return load('lib/ata/lifecycle.ts');
    if(name==='@/lib/team/member-projection') return load('lib/team/member-projection.ts');
    if(name==='@/lib/projects/ekonomiprojektion') return load('lib/projects/ekonomiprojektion.ts');
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
 for(const role of ['employee','project_manager']) {
  reset(role);
  let res=await detail.GET(request,{params:{id:'p'}});
  assert.equal(res.status,404,'R1: otilldelat projekt ska vara 404 för '+role);
  results.push({case:'unassigned-project-detail',role,status:res.status});
  // tilldelad men utan ekonomi
  reset(role); rows.project_assignment.push({business_id:'firm-a',project_id:'p',business_user_id:'staff'});
  res=await detail.GET(request,{params:{id:'p'}}); let body=await res.json();
  assert.equal(res.status,200);
  assert.equal(body.prices_redacted,true);
  assert.equal(body.quote.total,undefined,'R1: quote.total ska vara borta');
  assert.equal(body.materials[0].total_purchase,undefined,'R1: material.total_purchase ska vara borta');
  assert.equal(body.project.budget_amount,undefined,'R1: project.budget_amount ska vara borta');
  assert.equal(body.quote.quote_id,'q');
  results.push({case:'assigned-project-detail-no-financials',role,status:res.status,quoteTotal:body.quote.total,materialCost:body.materials[0].total_purchase});
  // tilldelad PM med ekonomiflagga
  reset(role); actor.can_see_financials=true; rows.project_assignment.push({business_id:'firm-a',project_id:'p',business_user_id:'staff'});
  res=await detail.GET(request,{params:{id:'p'}}); body=await res.json();
  assert.equal(res.status,200); assert.equal(body.quote.total,12000); assert.notEqual(body.prices_redacted,true);
  results.push({case:'assigned-project-detail-with-financials',role,quoteTotal:body.quote.total});
  reset(role);res=await projects.DELETE(request);assert.equal(res.status,403,'R2');assert.equal(mutations.length,0,'R2: ingen radering');
  results.push({case:'unassigned-project-delete',role,status:res.status,simulatedDeleteIntents:mutations.length});
  reset(role);res=await team.GET(request);body=await res.json();
  assert.equal(body.members[0].internal_hourly_cost,null);assert.equal(body.members[0].invite_token,null,'R3');assert.equal(body.members[0].invite_pending,true);
  results.push({case:'team-list',role,internalCost:body.members[0].internal_hourly_cost,inviteToken:body.members[0].invite_token,invitePending:body.members[0].invite_pending});
  res=await team.PATCH({...request,json:async()=>({id:'staff',name:'Synthetic name'})});const updated=await res.json();assert.equal(res.status,200);assert.equal(updated.member.internal_hourly_cost,null,'R4');assert.equal(updated.member.invite_token,null);
  results.push({case:'self-profile-update-response',role,status:res.status,internalCost:updated.member.internal_hourly_cost});
 }
 // Saknad medlemsidentitet: nekas utan serververifierat impersoneringsbevis.
 reset('employee'); actor=null; impersonation=null;
 { let res=await detail.GET(request,{params:{id:'p'}}); assert.equal(res.status,404,'null-medlem utan impersonering → 404');
   res=await projects.DELETE(request); assert.equal(res.status,403,'null-medlem → ingen radering'); assert.equal(mutations.length,0);
   results.push({case:'no-member-no-impersonation',detail:404,delete:403,simulatedDeleteIntents:0}); }
 // Serververifierad impersonering: läsa ja (utan ekonomi), radera nej (läs-only).
 reset('employee'); actor=null; impersonation={admin_user_id:'sa',admin_email:'sa@handymate.se'};
 { let res=await detail.GET(request,{params:{id:'p'}}); let body=await res.json(); assert.equal(res.status,200,'impersonering får läsa');
   res=await projects.DELETE(request); assert.equal(res.status,403,'impersonering är läs-only'); assert.equal(mutations.length,0);
   results.push({case:'verified-impersonation',detail:200,pricesRedacted:body.prices_redacted===true,delete:403,simulatedDeleteIntents:0}); }
 impersonation=null;
 for(const role of ['admin','owner']) {
  reset(role); let res=await detail.GET(request,{params:{id:'p'}}); let body=await res.json();
  assert.equal(res.status,200); assert.equal(body.quote.total,12000);
  reset(role); res=await projects.DELETE(request); assert.equal(res.status,200); assert.equal(mutations.length,8);
  reset(role); res=await team.GET(request); body=await res.json(); assert.equal(body.members[0].invite_token,'SYNTHETIC-PENDING-TOKEN'); assert.equal(body.members[0].internal_hourly_cost,350);
  results.push({case:'owner-admin-unchanged',role,detail:200,delete:200,tokenVisible:true});
 }
 for(const role of ['employee','project_manager']) {
  reset(role,'firm-b');let res=await detail.GET(request,{params:{id:'p'}});assert.equal(res.status,404);
  res=await projects.DELETE(request);assert.equal(res.status,403,'rollgrinden ligger före tenantuppslaget');assert.equal(mutations.length,0);
  results.push({case:'other-company-blocked',role,detail:404,delete:403,simulatedDeleteIntents:0});
 }
 console.log(JSON.stringify({meaning:'Efter rättning: R1–R4 stängda i handlers med syntetisk DB/auth.',results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
