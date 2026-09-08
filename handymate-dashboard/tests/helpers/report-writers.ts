import fs from 'fs'
import ts from 'typescript'
function extract(file:string,names:string[]){const s=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,s,ts.ScriptTarget.Latest,true);return ast.statements.filter(n=>names.includes((n as any).name?.text) || ts.isVariableStatement(n) && n.declarationList.declarations.some(d=>names.includes((d.name as any).text))).map(n=>n.getText(ast)).join('\n')}
export function reportWriters(){
 const material=ts.transpileModule(extract('app/api/agent/trigger/tool-router.ts',['logMaterial','createAtaDraftTool'])+'\nexports.material=logMaterial;exports.ata=createAtaDraftTool',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
 const ata=ts.transpileModule(extract('lib/ata/suggest-ata-draft.ts',['ATA_DRAFT_MIN_DESCRIPTION_LENGTH','getAtaDraftGateReason','AtaDedupLookupError','harPendingAtaForProjekt','suggestAtaDraft']),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
 const a:any={};new Function('exports','byggAtaUtkast',ata)(a,async(_db:any,p:any)=>({title:'ÄTA',description:p.description,payload:{project_id:p.projectId,description:p.description}}))
 const w:any={};new Function('exports','hittaNyligDubblett','suggestAtaDraft',material)(w,async()=>{throw Error('broad duplicate check forbidden for report')},a.suggestAtaDraft)
 return async(name:string,input:any,db:any,business:string,context:any)=> name==='log_material'?w.material(db,business,input,context):w.ata(db,business,input,context)
}
