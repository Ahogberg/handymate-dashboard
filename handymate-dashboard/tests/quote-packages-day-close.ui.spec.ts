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
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText
    const deps:Record<string,string>={};modules[file]={code,deps}
    for(const match of Array.from(code.matchAll(/require\(["']([^"']+)["']\)/g))) {
      const name=match[1];if(name==='react'){deps[name]='react';continue}
      const base=name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name)
      const resolved=[base,base+'.ts',base+'.tsx'].find(f=>fs.existsSync(f)&&fs.statSync(f).isFile())
      if(!resolved) throw new Error(`Unexpected dependency: ${name}`)
      deps[name]=add(resolved)
    }
    return file
  }
  return {entry:add(entry),modules}
}
async function mount(page:Page, kind:'packages'|'report') {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  const calls:any[]=[]
  let confirmationAttempts=0
  await page.route('**/*',async route=>{
    const req=route.request()
    if(req.url()==='http://wave2.test/') return route.fulfill({contentType:'text/html',body:'<html lang="sv"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root" style="max-width:1000px;margin:20px auto;padding:12px"></main></body></html>'})
    if(req.url().endsWith('/api/matte/transcribe')) return route.fulfill({json:{text:'Tre timmar montering idag.'}})
    if(req.url().endsWith('/api/matte/chat')) {
      const body=req.postDataJSON();calls.push(body)
      const proposal=(tool:string,token:string,date:string)=>({tool_name:tool,token,args:{project_id:'p',work_date:date,log_date:date},summary:tool==='log_time'?'Registrera 180 minuter':'Intern arbetsanteckning: montering klar',confirm_label:tool==='log_time'?'Lägg till tiden':'Spara anteckningen'})
      if(!body.confirm) return route.fulfill({json:{reply:'Kontrollera tiden först.',pending_confirmation:proposal('log_time','time',body.context.workDate)}})
      confirmationAttempts++
      if(confirmationAttempts===1) return route.fulfill({status:503,json:{error:'Tillfälligt fel'}})
      if(body.confirm.token==='time') return route.fulfill({json:{confirmed:true,execution_result:{tool:'log_time',status:'already_saved'},reply:'Tiden sparad. Nästa del väntar.',pending_confirmation:proposal('add_work_note','note',calls[0].context.workDate)}})
      return route.fulfill({json:{confirmed:true,execution_result:{tool:'add_work_note',status:'saved'},reply:'Arbetsanteckningen sparad.',pending_confirmation:null}})
    }
    return route.abort()
  })
  await page.goto('http://wave2.test/')
  const css=await postcss([tailwind({...config,content:['components/day-close/*.tsx','components/quotes/QuotePackageComparison.tsx']})]).process('@tailwind base;@tailwind components;@tailwind utilities;',{from:undefined})
  await page.addStyleTag({content:css.css})
  for(const file of ['react/umd/react.development.js','react-dom/umd/react-dom.development.js']) await page.addScriptTag({content:fs.readFileSync('node_modules/'+file,'utf8')})
  const b=bundle(kind==='packages'?'components/quotes/QuotePackageComparison.tsx':'components/day-close/DayClose.tsx')
  await page.addScriptTag({content:`
    const bundle=${JSON.stringify(b)}; const cache={react:{exports:React}};
    function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;new Function('require','module','exports',bundle.modules[id].code)(n=>load(bundle.modules[id].deps[n]),m,m.exports);return m.exports}
    const Component=load(bundle.entry).default;
    function Host(){const [items,setItems]=React.useState([{id:'base',item_type:'item',description:'Montering',quantity:1,unit:'st',unit_price:1000,total:1000,cost_price:500,sort_order:0,is_rot_eligible:false,is_rut_eligible:false},{id:'extra',item_type:'option',description:'Extra uttag',quantity:1,unit:'st',unit_price:500,total:500,cost_price:200,sort_order:1,is_rot_eligible:false,is_rut_eligible:false,option_selected:false}]);window.readItems=()=>items;return React.createElement(Component,${kind==='packages'?' {items,discountPercent:10,vatRate:25,onApply:setItems}':' {projectId:"p",projectName:"Storgatan 12"}'});}
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Host));
  `})
  return {calls,errors}
}
for(const width of [375,1280]) test(`package choice applies canonical option flags at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});const h=await mount(page,'packages')
  await page.getByRole('button',{name:/Jämför offertpaket/}).click()
  await page.getByLabel('Extra uttag').check()
  await page.getByRole('button',{name:'Använd rekommenderat'}).click()
  expect((await page.evaluate(()=>(window as any).readItems()))[1]).toMatchObject({option_selected:true,option_default:true,unit_price:500})
  await expect(page.getByRole('status')).toContainText('utkastet')
  expect(h.calls).toEqual([])
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:`test-results/wave2-packages-${width}.png`,fullPage:true})
  expect(h.errors).toEqual([])
})
test('dictation fills editable text without submitting a report',async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>{(window as any).micStopped=true}}]})}})
    class Recorder {
      static isTypeSupported(){return true}
      state='inactive';mimeType='audio/webm';ondataavailable:any;onstop:any
      start(){this.state='recording'}
      stop(){this.state='inactive';this.ondataavailable({data:new Blob(['test audio'])});this.onstop()}
    }
    ;(window as any).MediaRecorder=Recorder
  })
  const h=await mount(page,'report')
  await page.getByRole('button',{name:/Avsluta arbetsdagen/}).click()
  await page.getByRole('button',{name:'Diktera (högst en minut)'}).click()
  await expect(page.getByRole('button',{name:'Ta fram förslag'})).toBeDisabled()
  await page.getByRole('button',{name:'Stoppa diktering'}).click()
  await expect(page.getByLabel('Vad vill du registrera?')).toHaveValue('Tre timmar montering idag.')
  expect(h.calls).toEqual([])
  expect(await page.evaluate(()=>(window as any).micStopped)).toBe(true)
  await page.getByLabel('Vad vill du registrera?').fill('Två timmar montering idag.')
  await page.getByRole('button',{name:'Ta fram förslag'}).click()
  await expect(page.getByRole('button',{name:'Lägg till tiden'})).toBeVisible()
  expect(h.calls).toHaveLength(1)
  expect(h.errors).toEqual([])
})
for(const width of [375,1280]) test(`day close: failure retry keeps same token and preserves earlier receipts at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});const h=await mount(page,'report')
  await page.getByRole('button',{name:/Avsluta arbetsdagen/}).click()
  await page.getByLabel('Vad vill du registrera?').fill('Registrera tre timmar på mig och spara en anteckning: montering klar.')
  await page.getByRole('button',{name:'Ta fram förslag'}).click()
  await expect(page.getByRole('button',{name:'Lägg till tiden'})).toBeVisible()
  expect(h.calls[0]).toMatchObject({context:{projectId:'p',workReport:true},require_confirm_external:true})
  await page.getByRole('button',{name:'Lägg till tiden'}).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('heading',{name:'Sparat i den här rapporten'})).toHaveCount(0)
  await page.getByRole('button',{name:'Lägg till tiden'}).click()
  await expect(page.getByText('Tid — redan sparat, ingen dubblett')).toBeVisible()
  await expect(page.getByRole('button',{name:'Spara anteckningen'})).toBeVisible()
  expect(h.calls[1].confirm.token).toBe(h.calls[2].confirm.token)
  await page.getByRole('button',{name:'Spara anteckningen'}).click()
  await expect(page.getByText('Arbetsanteckning — sparat',{exact:true})).toBeVisible()
  expect(h.calls).toHaveLength(4)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:`test-results/wave2-report-${width}.png`,fullPage:true})
  expect(h.errors).toEqual([])
})
test('discarding proposals starts the next request without old instructions',async({page})=>{
  const h=await mount(page,'report')
  await page.getByRole('button',{name:/Avsluta arbetsdagen/}).click()
  await page.getByLabel('Vad vill du registrera?').fill('Registrera tre timmar.')
  await page.getByRole('button',{name:'Ta fram förslag'}).click()
  await page.getByRole('button',{name:'Avstå från återstående delar'}).click()
  await page.getByLabel('Vad vill du registrera?').fill('Registrera två timmar.')
  await page.getByRole('button',{name:'Ta fram förslag'}).click()
  await expect(page.getByRole('button',{name:'Lägg till tiden'})).toBeVisible()
  expect(h.calls[1].messages).toEqual([{role:'user',content:'Registrera två timmar.'}])
  expect(h.calls[1].context.threadId).toBeNull()
  expect(h.errors).toEqual([])
})
