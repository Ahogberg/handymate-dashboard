import {test,expect} from '@playwright/test'
import fs from 'fs'
import ts from 'typescript'
import {NextRequest,NextResponse} from 'next/server'
import * as mapper from '../lib/invoices/quote-to-invoice-items'
import * as lifecycle from '../lib/ata/lifecycle'
import * as rot from '../lib/rot-rut'

function compile(file:string,deps:Record<string,unknown>){
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText
 const m={exports:{} as any};new Function('require','module','exports',js)((n:string)=>{if(!(n in deps))throw Error('Unstubbed '+n);return deps[n]},m,m.exports);return m.exports
}
function harness(){
 const tables:Record<string,any[]>={
  project:[{project_id:'p',business_id:'b',customer_id:'c',quote_id:'q',name:'Garage',status:'completed'}],
  quotes:[{quote_id:'q',business_id:'b',items:[],total:99999,customer_pays:1250,vat_rate:25,rot_rut_type:null}],
  quote_items:[
   {id:'base',description:'Grundarbete',quantity:1,unit_price:1000,item_type:'item',total:1000,linked_product_id:'product',article_number:'A1',labor_amount:0},
   {id:'selected',description:'Valt tillval',quantity:1,unit_price:200,item_type:'option',option_selected:true,total:200},
   {id:'declined',description:'Bortvalt tillval',quantity:1,unit_price:9000,item_type:'option',option_selected:false,total:9000},
   {id:'discount',description:'Avtalad rabatt',quantity:1,unit_price:100,item_type:'discount',total:-100},
   {id:'subtotal',description:'Delsumma',quantity:0,unit_price:0,item_type:'subtotal',total:1100},
  ].map(r=>({...r,quote_id:'q',business_id:'b'})),
  project_change:[{change_id:'a',business_id:'b',project_id:'p',ata_number:1,description:'Godkänt uttag',change_type:'addition',status:'signed',total:300,items:[{description:'Uttag',quantity:1,unit_price:300}]},{change_id:'pending',business_id:'b',project_id:'p',status:'draft',total:9000,items:[]}],
  invoice:[],customer:[{customer_id:'c',business_id:'b',name:'Demokund'}],business_config:[{business_id:'b',business_name:'Demo',org_number:'TEST',bankgiro:'TEST',next_invoice_number:1}],
 }
 const state={failTable:'',created:[] as any[],marks:[] as any[]}
 const db:any={from(table:string){let fields='*',one=false;const filters:((r:any)=>boolean)[]=[];const q:any={select:(s:string)=>{fields=s;return q},eq:(k:string,v:any)=>{filters.push(r=>r[k]===v);return q},in:(k:string,v:any[])=>{filters.push(r=>v.includes(r[k]));return q},limit:()=>q,order:()=>q,or:()=>q,single:()=>{one=true;return q},maybeSingle:()=>{one=true;return q},then:(ok:any,bad:any)=>Promise.resolve().then(()=>{
 if(state.failTable===table)return {data:null,error:{code:'TEST',message:'Simulerat läsfel'}}
 const rows=(tables[table]||[]).filter(r=>filters.every(f=>f(r))).map(r=>fields==='*'?{...r}:Object.fromEntries(fields.split(',').map(k=>[k.trim(),r[k.trim()]])))
 return {data:one?(rows[0]||null):rows,error:null}
 }).then(ok,bad)};return q}}
 const deps:any={'@/lib/invoices/payment-plan/service':{paymentPlanEnabled:()=>false},'@/lib/observability/driftlarm':{rapporteraTystFel:async()=>{}},'next/server':{NextResponse},'@/lib/auth':{getAuthenticatedBusiness:async()=>({business_id:'b'})},'@/lib/permissions':{getCurrentUser:async()=>({}),hasPermission:()=>true},'@/lib/supabase':{getServerSupabase:()=>db},'@/lib/invoices/quote-to-invoice-items':mapper,'@/lib/ata/lifecycle':lifecycle,'@/lib/rot-rut':rot,'@/lib/rot-rut-limits':{calculateCappedDeduction:async()=>({deduction:0})},'@/lib/invoices/create-invoice':{createInvoice:async(_:any,input:any)=>{state.created.push(input);tables.invoice.push({invoice_id:'i',invoice_number:'TEST',business_id:input.businessId,project_id:input.projectId});return {invoice:{invoice_id:'i',invoice_number:'TEST'}}}},'@/lib/invoices/mark-sources':{markInvoiceSources:async(_:any,input:any)=>{state.marks.push(input);return {ok:true}}}}
 const preview=compile('app/api/projects/[id]/invoice-preview/route.ts',deps)
 const final=compile('app/api/projects/[id]/create-final-invoice/route.ts',deps)
 const hourly=compile('app/api/invoices/from-project/route.ts',deps)
 const budget=compile('lib/quotes/get-quote-budget-derivation.ts',deps)
 const draft=compile('lib/invoices/project-invoice-draft.ts',deps)
 return {tables,state,budget:()=>budget.getQuoteBudgetDerivation(db,'q','b'),hourlyGet:()=>hourly.GET(new NextRequest('https://test/from-project?project_id=p')),hourlyPost:(customer='c')=>hourly.POST(new NextRequest('https://test/from-project',{method:'POST',body:JSON.stringify({project_id:'p',customer_id:customer,items:[{description:'Tid',quantity:1,unit_price:100,total:100}]})})),preview:()=>preview.GET(new NextRequest('https://test/preview'),{params:{id:'p'}}),final:()=>final.POST(new NextRequest('https://test/final',{method:'POST'}),{params:{id:'p'}}),draft:()=>draft.byggProjektFakturaUnderlag(db,'b','p')}
}
test('accepted options and discount survive project preview → final invoice, with only approved ATA',async()=>{
 const h=harness();expect((await h.budget()).budget_amount).toBe(1100);const preview=await (await h.preview()).json();expect(preview.quoteTotal).toBe(1100);expect(preview.totalExclVat).toBe(1400)
 expect((await h.final()).status).toBe(200);const invoice=h.state.created[0]
 expect(invoice.subtotal).toBe(1400);expect(invoice.total).toBe(1750);expect(invoice.customerPays).toBe(1750)
 expect(invoice.items.find((r:any)=>r.description==='Valt tillval')?.item_type).toBe('item')
 expect(invoice.items.some((r:any)=>r.description==='Bortvalt tillval')).toBe(false)
 expect(invoice.items.find((r:any)=>r.description==='Grundarbete')).toMatchObject({linked_product_id:'product',article_number:'A1',labor_amount:0})
 expect(h.state.marks[0].changeIds).toEqual(['a'])
})
test('automatic project draft recalculates customer pays after adding ATA',async()=>{
 const h=harness(),result=await h.draft();expect(result.ok).toBe(true);expect(result.subtotal).toBe(1400);expect(result.customerPays).toBe(1750)
})
for(const table of ['invoice','quotes','quote_items','project_change'])test(`automatic draft refuses incomplete data when ${table} read fails`,async()=>{
 const h=harness();h.state.failTable=table;h.tables.quotes[0].items=[{description:'Old mirror',quantity:1,unit_price:50}]
 expect((await h.draft()).ok).toBe(false)
})
test('legacy options use the same mapper as canonical quote_items',async()=>{
 const h=harness();h.tables.quotes[0].items=h.tables.quote_items;h.tables.quote_items=[]
 expect((await (await h.preview()).json()).quoteTotal).toBe(1100)
 expect((await h.final()).status).toBe(200);expect(h.state.created[0].subtotal).toBe(1400)
})
test('an explicitly empty billable selection never falls back to the old quote total',async()=>{
 const h=harness();h.tables.quote_items=h.tables.quote_items.filter(r=>r.id==='declined');h.tables.project_change=[]
 expect((await (await h.preview()).json()).quoteTotal).toBe(0)
 expect((await h.final()).status).toBe(400)
})
test('zero quantity and zero canonical price stay zero in the shared mapper',()=>{
 expect(mapper.mapQuoteItemsToInvoiceItems([{quantity:0,unit_price:100},{quantity:1,unit_price:0,price:999}]).map(r=>r.total)).toEqual([0,0])
})

for(const table of ['time_entry','project_material','business_config'])test(`hourly invoice preview rejects ${table} read failure`,async()=>{
 const h=harness();h.state.failTable=table;expect((await h.hourlyGet()).status).toBe(503)
})
test('hourly invoicing rejects missing/foreign project and mismatched customer before creating invoice',async()=>{
 const h=harness();expect((await h.hourlyPost('other-customer')).status).toBe(403)
 h.tables.project=[];expect((await h.hourlyPost()).status).toBe(404);expect(h.state.created).toHaveLength(0)
})

test('project budget keeps selected labor hours, discounts and excludes declined options in both storage formats',async()=>{
 for(const legacy of [false,true]){
  const h=harness();const rows=[{item_type:'option',option_selected:true,quantity:2,unit:'tim',unit_price:500,total:1000},{item_type:'option',option_selected:false,quantity:9,unit:'tim',unit_price:500,total:4500},{item_type:'discount',quantity:1,total:-100}].map(r=>({...r,business_id:'b',quote_id:'q'}));h.tables.quote_items=legacy?[]:rows;h.tables.quotes[0].items=legacy?rows:[]
  expect(await h.budget()).toMatchObject({budget_hours:2,budget_amount:900})
 }
})

test('final invoice returns existing project invoice before pricing, insert or source marking',async()=>{
 const h=harness();h.tables.invoice=[{invoice_id:'existing',invoice_number:'TEST-1',business_id:'b',project_id:'p'}]
 h.state.failTable='quotes' // The existing receipt must not depend on new source reads.
 const response=await h.final();expect(response.status).toBe(200)
 expect(await response.json()).toEqual({invoice_id:'existing',invoice_number:'TEST-1',deduplicated:true})
 expect(h.state.created).toHaveLength(0);expect(h.state.marks).toHaveLength(0)
})
test('final invoice lookup is scoped by both business and project',async()=>{
 const h=harness();h.tables.invoice=[{invoice_id:'other-business',business_id:'other',project_id:'p'},{invoice_id:'other-project',business_id:'b',project_id:'other'}]
 expect((await h.final()).status).toBe(200);expect(h.state.created).toHaveLength(1)
})
test('final invoice fails closed when existing invoices cannot be read',async()=>{
 const h=harness();h.state.failTable='invoice'
 expect((await h.final()).status).toBe(503);expect(h.state.created).toHaveLength(0);expect(h.state.marks).toHaveLength(0)
})

test('retry after a saved final invoice returns the same receipt without a second invoice',async()=>{
 const h=harness();const first=await (await h.final()).json();const retry=await (await h.final()).json()
 expect(retry).toMatchObject({...first,deduplicated:true});expect(h.state.created).toHaveLength(1);expect(h.state.marks).toHaveLength(1)
})
