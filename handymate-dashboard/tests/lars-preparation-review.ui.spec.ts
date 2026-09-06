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

for (const width of [375,1280]) test(`Lars review, explicit project choice and proposal receipt at ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:1000})
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  const posts:any[]=[]
  const row:any={id:'preparation',template:'charging',context:'Laddbox',status:'submitted',answers:{location:'Garage',route:'Okänt',wishes:'Uttag'},images:[],project_id:null,lars_review:null}
  await page.route('**/*',async r=>{
    if(r.request().url()==='http://lars.test/')return r.fulfill({contentType:'text/html',body:'<html lang="sv"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root" style="max-width:800px;margin:auto;padding:12px"></main></body></html>'})
    if(r.request().url().includes('/api/projects?'))return r.fulfill({json:{projects:[{project_id:'project',name:'Garagearbetet'}]}})
    if(r.request().url().includes('/api/customer-preparation?'))return r.fulfill({json:{preparations:[row]}})
    if(r.request().url().endsWith('/api/customer-preparation/review')){
      const body=r.request().postDataJSON();posts.push(body)
      if(body.action==='link')row.project_id=body.project_id
      if(body.action==='review')row.lars_review={version:1,fingerprint:'fingerprint',created_at:'2026-09-05T10:00:00Z',project_id:row.project_id,image_count:0,model:'test',result:{summary:'Kabelsträckan är okänd.',checks:[{text:'Mät sträckan på plats.',sources:['route']}],questions:[{text:'Var ska uttaget sitta?',sources:['wishes']}],possible_additions:[{text:'Stäm av extra uttag med kunden.',sources:['wishes']}]}}
      if(body.action==='approve')row.status='reviewed'
      if(body.action==='ata')row.ata_approval_id='approval'
      return r.fulfill({json:{success:true,review:row.lars_review,approval_id:row.ata_approval_id}})
    }
    return r.abort()
  })
  await page.goto('http://lars.test/')
  for(const f of ['react/umd/react.production.min.js','react-dom/umd/react-dom.production.min.js'])await page.addScriptTag({content:fs.readFileSync('node_modules/'+f,'utf8')})
  const css=await postcss([tailwind({...config,content:['components/customer-preparation/*.tsx']})]).process('@tailwind base;@tailwind components;@tailwind utilities;',{from:undefined});await page.addStyleTag({content:css.css})
  const b=bundle('components/customer-preparation/LarsPreparationReview.tsx')
  await page.addScriptTag({content:`const modules=${JSON.stringify(b.modules)},cache={react:{exports:React}};function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;new Function('require','module','exports',modules[id].code)(n=>load(modules[id].deps[n]),m,m.exports);return m.exports}const C=load(${JSON.stringify(b.entry)}).default;function Host(){const [row,setRow]=React.useState(${JSON.stringify(row)});return React.createElement(C,{row,customerId:'customer',onChanged:async()=>{const r=await fetch('/api/customer-preparation?customer_id=customer');setRow((await r.json()).preparations[0])}})}ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Host));`})
  await page.getByLabel('Projekt för detta underlag').selectOption('project')
  await expect(page.getByRole('button',{name:'Låt Lars kontrollera svar och bilder'})).toBeDisabled()
  await page.getByRole('button',{name:'Spara projektkoppling'}).click()
  await page.getByRole('button',{name:'Låt Lars kontrollera svar och bilder'}).click()
  await expect(page.getByText('Kabelsträckan är okänd.')).toBeVisible()
  await expect(page.getByText('Mät sträckan på plats.')).toBeVisible()
  await expect(page.getByText('Förbered ett ÄTA-förslag')).toHaveCount(0)
  await page.getByRole('button',{name:'Jag har granskat underlaget och Lars kontroll'}).click()
  await page.getByText('Förbered ett ÄTA-förslag').click()
  await page.getByLabel('Tillägg som du vill föreslå').fill('Kunden önskar ett extra uttag vid garaget.')
  await page.getByRole('button',{name:'Skapa internt ÄTA-förslag'}).click()
  await expect(page.getByRole('link',{name:'Öppna godkännandekön'})).toHaveAttribute('href','/dashboard/approvals')
  await expect(page.getByRole('link',{name:'följ ärendet i Pengar'})).toHaveAttribute('href','/dashboard/pengar')
  expect(posts.map(p=>p.action)).toEqual(['link','review','approve','ata'])
  expect(posts[3]).toMatchObject({project_id:'project',fingerprint:'fingerprint',description:'Kunden önskar ett extra uttag vid garaget.'})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:`test-results/lars-review-${width}.png`,fullPage:true})
  expect(errors).toEqual([])
})
