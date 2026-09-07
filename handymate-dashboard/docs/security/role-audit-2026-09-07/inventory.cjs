// Discovery inventory only: direct helper names do NOT prove authorization.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'../../..');const records=[];
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isDirectory())walk(p);else if(item.name==='route.ts'){
 const source=ts.createSourceFile(p,fs.readFileSync(p,'utf8'),ts.ScriptTarget.Latest,true);
 for(const node of source.statements){if(!node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))continue;
 const names=ts.isFunctionDeclaration(node)?[node.name?.text]:ts.isVariableStatement(node)?node.declarationList.declarations.map(d=>d.name.getText(source)):[];
 for(const method of names.filter(n=>/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(n))){const calls=new Set();function visit(n){if(ts.isCallExpression(n))calls.add(ts.isPropertyAccessExpression(n.expression)?n.expression.name.text:n.expression.getText(source));ts.forEachChild(n,visit)}visit(node);
 records.push({file:path.relative(root,p),method,directGuardCandidates:[...calls].filter(n=>/permission|currentuser|authenticated|ownership|canact|assignment|visibility|authorize/i.test(n)).join(';')});}
 }
}}}
walk(path.join(root,'app/api'));records.sort((a,b)=>a.file.localeCompare(b.file)||a.method.localeCompare(b.method));
const csv=['file,method,direct_guard_candidates',...records.map(r=>Object.values(r).map(v=>'"'+v.replaceAll('"','""')+'"').join(','))].join('\n')+'\n';
fs.writeFileSync(path.join(__dirname,'api-inventory.csv'),csv);console.log(JSON.stringify({routeFiles:new Set(records.map(r=>r.file)).size,exportedMethods:records.length,limitation:'Static discovery only. Aliased re-exports and delegated authorization require manual review.'}));
