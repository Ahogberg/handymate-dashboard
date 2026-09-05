import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import ts from 'typescript'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../tailwind.config'
test.use({ storageState:{cookies:[],origins:[]}, ...(process.env.HANDYMATE_CHROMIUM_PATH ? {launchOptions:{executablePath:process.env.HANDYMATE_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}} : {}) })
function bundle(entry: string) {
  const modules: Record<string,{code:string;deps:Record<string,string>}>={}
  function add(file:string) {
    file=path.normalize(file)
    if(modules[file]) return file
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React,esModuleInterop:true,removeComments:true}}).outputText
    const deps:Record<string,string>={};modules[file]={code,deps}
    for(const match of Array.from(code.matchAll(/require\(["']([^"']+)["']\)/g))) {
      const name=match[1];if(['react','lucide-react','next/link'].includes(name)){deps[name]=name;continue}
      const base=name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name)
      const resolved=[base,base+'.ts',base+'.tsx'].find(f=>fs.existsSync(f)&&fs.statSync(f).isFile())
      if(!resolved) throw new Error(`Unexpected dependency: ${name}`)
      deps[name]=add(resolved)
    }
    return file
  }
  return {entry:add(entry),modules}
}
async function mount(page:Page,kind:'recovery'|'experience'|'send'){
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',r=>r.request().url()==='http://quote.test/'?r.fulfill({contentType:'text/html',body:'<html lang="sv"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'}):r.abort())
 await page.goto('http://quote.test/')
 const css=await postcss([tailwind({...config,content:['app/dashboard/quotes/_shared/*.tsx','app/dashboard/quotes/[[]id[]]/components/QuoteSendModal.tsx']})]).process('@tailwind base;@tailwind components;@tailwind utilities;',{from:undefined});await page.addStyleTag({content:css.css})
 for(const f of ['react/umd/react.production.min.js','react-dom/umd/react-dom.production.min.js'])await page.addScriptTag({content:fs.readFileSync('node_modules/'+f,'utf8')})
 const files=kind==='recovery'?['app/dashboard/quotes/_shared/useQuoteRecovery.ts']:kind==='send'?['app/dashboard/quotes/[id]/components/QuoteSendModal.tsx']:['app/dashboard/quotes/_shared/QuoteBuilderHeader.tsx','app/dashboard/quotes/_shared/QuoteBuilderBottomBar.tsx','app/dashboard/quotes/_shared/QuotePriceMemory.tsx']
 const bundles=files.map(f=>bundle(f));const modules=Object.assign({},...bundles.map(b=>b.modules))
 const host=kind==='recovery'?`
 function Host(){const [v,setV]=React.useState({text:'',items:[{linked_product_id:'article',component_snapshot:{hours:2}}],reservations:[{id:'r'}]});const r=useQuoteRecovery({userId:'user',businessId:'business',scope:'new',enabled:true,value:v,hasContent:!!v.text,onRestore:setV});window.readValue=()=>v;return React.createElement('main',null,React.createElement('input',{value:v.text,'aria-label':'Arbete',onChange:e=>setV({...v,text:e.target.value})}),r.pending&&React.createElement('button',{onClick:r.restore},'Återställ'),React.createElement('button',{onClick:r.clear},'Servern bekräftar sparat'),React.createElement('p',{role:'status'},r.status))}
 `:kind==='send'?`
 function Host(){return React.createElement(QuoteSendModal,{show:true,quote:{quote_id:'q',title:'Badrumsrenovering',quote_number:'1042',total:12500,customer:{name:'Anna Andersson',email:'anna@example.test'},description:'Montering',quote_items:[]},business:{business_name:'Testbolag'},sending:false,sendMethod:'email',setSendMethod:()=>{},extraEmails:'',setExtraEmails:()=>{},bccEmails:'',setBccEmails:()=>{},quoteIntelligence:null,quoteIntelligenceLoading:false,setQuoteIntelligence:()=>{},onClose:()=>{},onSend:()=>{window.sent=true},preview:React.createElement('div',{style:{height:900,padding:24}},'Kundens dokument från samma visningskomponent')})}
 `:`
 function Host(){const [notice,setNotice]=React.useState('');const [items,setItems]=React.useState([{id:'row',item_type:'item',description:'Montering av duschvägg',quantity:1,unit:'st',unit_price:3200,total:3200,ai_price_missing:true,linked_product_id:'p',component_snapshot:{hours:2}}]);window.readItems=()=>items;const sums={inkluderat:{text:'3 rader',attention:'1 rad utan pris'},exkluderat:{text:'Ifyllt',attention:null},reservationer:{text:'2 förbehåll',attention:'1 föreslaget förbehåll'},prisbild:{text:'12 500 kr',attention:null}};const actions={saving:false,canSend:true,onSendQuote:()=>{window.review=true;setNotice('I offertskaparen öppnas nu den sparade offerten för dokument- och mottagargranskning. Den här skissen skickar ingenting.')},onSaveDraft:()=>{},onSaveTemplate:()=>{},hasItems:true};return React.createElement('main',{className:'mx-auto max-w-5xl bg-slate-50 p-4 pb-40'},React.createElement(QuoteBuilderHeader,{...actions,title:'Badrum hos Andersson',completenessSummaries:sums,onSelectSection:s=>{window.selected=s;setNotice('I offertskaparen flyttas du till '+s+' i dokumentet.')}}),notice&&React.createElement('p',{role:'status',className:'mb-3 rounded-xl bg-teal-50 p-3 text-sm text-teal-900'},notice),React.createElement('div',{className:'mb-4 rounded-xl border bg-white p-6'},React.createElement('p',{className:'text-xs text-teal-700'},'SKISS · EXEMPELOFFERT'),React.createElement('h2',{className:'my-4 text-2xl font-semibold'},'Badrumsrenovering'),React.createElement('p',null,'Anna Andersson · Storgatan 12'),React.createElement('p',{className:'mt-6 border-t py-4'},'Montering av duschvägg — 3 200 kr'),React.createElement('p',{className:'border-t py-4'},'Förbehåll: underlaget kontrolleras före start')),React.createElement(QuotePriceMemory,{items,onChange:setItems}),React.createElement(QuoteBuilderBottomBar,{...actions,summaries:sums,hasQuoteContent:true,onSelect:s=>{window.selected=s;setNotice('I offertskaparen flyttas du till '+s+' i dokumentet.')}}))}
 `
 await page.addScriptTag({content:`const modules=${JSON.stringify(modules)};const cache={react:{exports:React},'next/link':{exports:{__esModule:true,default:p=>React.createElement('a',p)}},'lucide-react':{exports:new Proxy({},{get:(_,key)=>key==='__esModule'?true:()=>React.createElement('span',{'aria-hidden':true})})}};function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;new Function('require','module','exports',modules[id].code)(n=>load(modules[id].deps[n]),m,m.exports);return m.exports};${files.map(f=>`Object.assign(window,load(${JSON.stringify(f)}));`).join('')}${host}const root=ReactDOM.createRoot(document.getElementById('root'));window.remount=()=>{root.render(null);setTimeout(()=>root.render(React.createElement(Host)),0)};root.render(React.createElement(Host));`})
 return errors
}
for(const width of [375,1280])test(`real quote controls and explicit price scope at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});const errors=await mount(page,'experience')
 if(width>=1024){await expect(page.getByText('Nästa sak att kontrollera')).toBeVisible();await page.getByRole('button',{name:'Kontrollera inkluderat →'}).click()}else{await page.getByRole('button',{name:/Inkluderat/}).click()}
 expect(await page.evaluate(()=>(window as any).selected)).toBe('inkluderat')
 await page.getByText('Priser för nästa jobb',{exact:false}).click()
 const checkbox=page.getByRole('checkbox');await expect(checkbox).not.toBeChecked();await checkbox.check()
 expect((await page.evaluate(()=>(window as any).readItems()))[0]).toMatchObject({save_to_products:true,linked_product_id:'p',component_snapshot:{hours:2},unit_price:3200})
 await page.getByRole('button',{name:'Granska och skicka',exact:true}).click();expect(await page.evaluate(()=>(window as any).review)).toBe(true)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.screenshot({path:`test-results/quote-experience-${width}.png`,fullPage:true});if(width===1280 && process.env.EXPORT_QUOTE_SKETCH){fs.writeFileSync('docs/design/quote-experience/review.html',await page.evaluate(()=>{const copy=document.documentElement.cloneNode(true) as HTMLElement;const scripts=Array.from(copy.querySelectorAll('script'));scripts.forEach(script=>script.remove());scripts.forEach(script=>copy.querySelector('body')!.appendChild(script));return '<!DOCTYPE html>'+copy.outerHTML}))}expect(errors).toEqual([])
})
test('tab copy restores original data and clears only on acknowledged save',async({page})=>{
 const errors=await mount(page,'recovery');await page.getByLabel('Arbete').fill('Montering hos Andersson')
 await expect(page.getByRole('status')).toContainText('Återställningskopia')
 await page.evaluate(()=>(window as any).remount());await page.getByRole('button',{name:'Återställ',exact:true}).click()
 await expect(page.getByLabel('Arbete')).toHaveValue('Montering hos Andersson')
 expect(await page.evaluate(()=>(window as any).readValue())).toMatchObject({items:[{linked_product_id:'article',component_snapshot:{hours:2}}],reservations:[{id:'r'}]})
 await page.getByRole('button',{name:'Servern bekräftar sparat'}).click();expect(await page.evaluate(()=>sessionStorage.length)).toBe(0)
 await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));expect(await page.evaluate(()=>sessionStorage.length)).toBe(0);expect(errors).toEqual([])
})
test('send review can show the customer document without sending',async({page})=>{
 const errors=await mount(page,'send');await page.getByRole('button',{name:'Visa kundens offert'}).click()
 await expect(page.getByText('Kundens dokument från samma visningskomponent')).toBeVisible()
 expect(await page.evaluate(()=>(window as any).sent)).toBeUndefined();expect(errors).toEqual([])
})
test('storage quota failure is visible rather than claiming a copy exists',async({page})=>{
 await mount(page,'recovery')
 await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('quota')}})
 await page.getByLabel('Arbete').fill('Arbete som måste sparas')
 await expect(page.getByRole('status')).toContainText('kunde inte sparas')
})
for(const [selected,failed,unconfirmed] of [[false,false,false],[true,false,false],[true,true,false],[false,false,true]])test(`actual save hook with selected=${selected}, register failure=${failed}, missing acknowledgement=${unconfirmed}`,async({page})=>{
 await mount(page,'recovery')
 const requests:{url:string;method:string;body:any}[]=[]
 await page.route('**/api/**',route=>{requests.push({url:route.request().url(),method:route.request().method(),body:route.request().postDataJSON()});return route.fulfill({status:failed && route.request().url().endsWith('/api/products')?503:200,json:unconfirmed?{}:{quote:{quote_id:'saved'}}})})
 const code=ts.transpileModule(fs.readFileSync('app/dashboard/quotes/_shared/useQuoteBuilderSave.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
 await page.addScriptTag({content:`const m={exports:{}};new Function('require','module','exports',${JSON.stringify(code)})(n=>n==='react'?React:{buildQuotePayload:c=>({items:c.items})},m,m.exports);function SaveHost(){const [items,setItems]=React.useState([{id:'r',item_type:'item',description:'Montering',quantity:1,unit_price:100,ai_price_missing:true,save_to_products:${selected},linked_product_id:'p'}]);const h=m.exports.useQuoteBuilderSave({mode:'create',items,setItems,products:[],setLocalPrice:()=>{},setSendConfirmPending:()=>{},toast:{warning:message=>{window.warning=message},error:()=>{window.saveError=true},success:()=>{}},router:{push:()=>{window.navigated=true}},getContext:()=>({paymentPlan:[],description:'Montering'}),onSaved:()=>{window.acknowledged=true}});return React.createElement('button',{onClick:()=>h.save(false)},'Spara testofferten')};const el=document.createElement('div');document.body.appendChild(el);ReactDOM.createRoot(el).render(React.createElement(SaveHost));`})
 await page.getByRole('button',{name:'Spara testofferten'}).click()
 if(unconfirmed){await expect.poll(()=>page.evaluate(()=>(window as any).saveError)).toBe(true);expect(await page.evaluate(()=>(window as any).acknowledged)).toBeUndefined()}else{await expect.poll(()=>page.evaluate(()=>(window as any).acknowledged)).toBe(true)}
 expect(requests.filter(r=>r.url.endsWith('/api/products'))).toHaveLength(selected?1:0)
 expect(requests.find(r=>r.url.endsWith('/api/quotes'))?.method).toBe('POST')
 if(selected)expect(requests[0]).toMatchObject({method:'PUT',body:{id:'p',sales_price:100}})
 if(failed)expect(await page.evaluate(()=>(window as any).warning)).toContain('kunde inte sparas i artikelregistret')
})
