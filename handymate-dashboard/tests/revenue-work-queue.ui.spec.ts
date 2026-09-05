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
import { recoveryRow } from './revenue-work-queue.fixture'
async function mount(page:Page) {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  const calls:string[]=[]
  let status=200
  const rows=[recoveryRow('ready_to_invoice'),recoveryRow('awaiting_payment'),recoveryRow('unknown'),recoveryRow('paid')]
  await page.route('**/*',async route=>{
    const req=route.request()
    if(req.url()==='http://queue.test/') return route.fulfill({contentType:'text/html',body:'<html lang="sv"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root" style="max-width:900px;margin:20px auto;padding:12px"></main></body></html>'})
    if(req.url().includes('/api/revenue-recovery-cases')) {calls.push(req.method());return route.fulfill({status,json:status===200?{cases:rows}:{error:'failed'}})}
    return route.abort()
  })
  await page.goto('http://queue.test/')
  const css=await postcss([tailwind({...config,content:['components/pengar/RevenueWorkQueue.tsx']})]).process('@tailwind base;@tailwind components;@tailwind utilities;',{from:undefined})
  await page.addStyleTag({content:css.css})
  for(const file of ['react/umd/react.development.js','react-dom/umd/react-dom.development.js']) await page.addScriptTag({content:fs.readFileSync('node_modules/'+file,'utf8')})
  const b=bundle('components/pengar/RevenueWorkQueue.tsx')
  await page.addScriptTag({content:`
    const bundle=${JSON.stringify(b)}; const cache={react:{exports:React}};
    function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;new Function('require','module','exports',bundle.modules[id].code)(n=>load(bundle.modules[id].deps[n]),m,m.exports);return m.exports}
    const Component=load(bundle.entry).default;
    const Context=load('lib/BusinessContext.tsx').BusinessContext;
    function Host(){const [tenant,setTenant]=React.useState('a');window.switchTenant=()=>setTenant('b');return React.createElement(Context.Provider,{value:{business_id:tenant}},React.createElement(Component));}
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Host));
  `})
  return {calls,errors,setStatus:(value:number)=>{status=value}}
}
for(const width of [375,1280]) test(`queue filters, sources and next step at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});const h=await mount(page)
  await expect(page.getByRole('heading',{name:'Badrum Åkervägen'})).toBeVisible()
  await expect(page.getByText('Extra uttag i badrummet',{exact:true})).toBeVisible()
  await expect(page.getByRole('link',{name:'Granska fakturaunderlaget →'})).toHaveAttribute('href','/dashboard/projects/project-1/invoice-preview')
  await page.getByText('Visa underlag och belopp',{exact:true}).click()
  await expect(page.getByText('Identifierat underlag',{exact:true})).toBeVisible()
  await expect(page.getByText('Hela fakturans belopp (1042)',{exact:true})).toBeVisible()
  await page.getByLabel('Sök projekt eller fakturanummer').fill('1042')
  await expect(page.getByRole('heading',{name:'Badrum Åkervägen'})).toBeVisible()
  await page.getByRole('button',{name:'Behöver kontrolleras (1)'}).click()
  await expect(page.getByText('Projektkopplingen saknas.',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Avslutade (1)'}).click()
  await expect(page.getByText('Bekräftat betalt',{exact:true})).toBeVisible()
  await expect(page.getByRole('link',{name:'Visa fakturan'})).toHaveAttribute('href','/dashboard/invoices/invoice-1')
  await page.getByLabel('Sök projekt eller fakturanummer').fill('saknas')
  await expect(page.getByText('Inga ärenden matchar det här urvalet.')).toBeVisible()
  await page.getByLabel('Sök projekt eller fakturanummer').fill('')
  await page.getByRole('button',{name:'Din tur (1)'}).click()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:`test-results/revenue-work-queue-${width}.png`,fullPage:true})
  expect(h.calls.every(method=>method==='GET')).toBe(true)
  expect(h.errors).toEqual([])
})
test('refresh error clears old results and retry recovers',async({page})=>{
  const h=await mount(page)
  await expect(page.getByRole('heading',{name:'Badrum Åkervägen'})).toBeVisible()
  h.setStatus(500)
  await page.getByRole('button',{name:'Uppdatera'}).click()
  await expect(page.getByRole('alert')).toContainText('kunde inte läsas')
  await expect(page.getByRole('heading',{name:'Badrum Åkervägen'})).toHaveCount(0)
  await expect(page.getByText('Inga intäktsärenden finns i det lästa underlaget.')).toHaveCount(0)
  h.setStatus(200)
  await page.getByRole('button',{name:'Uppdatera'}).click()
  await expect(page.getByRole('heading',{name:'Badrum Åkervägen'})).toBeVisible()
  expect(h.errors).toEqual([])
})
test('company change clears prior company data when new access is denied',async({page})=>{
  const h=await mount(page)
  await expect(page.getByRole('heading',{name:'Badrum Åkervägen'})).toBeVisible()
  h.setStatus(403)
  await page.evaluate(()=>(window as any).switchTenant())
  await expect(page.getByRole('alert')).toContainText('ägare och administratörer')
  await expect(page.getByRole('heading',{name:'Badrum Åkervägen'})).toHaveCount(0)
  expect(h.errors).toEqual([])
})
