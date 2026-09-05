import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import ts from 'typescript'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../tailwind.config'
test.use({storageState:{cookies:[],origins:[]},...(process.env.HANDYMATE_CHROMIUM_PATH?{launchOptions:{executablePath:process.env.HANDYMATE_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}}:{})})
const a={net:40000,vat:10000,labor:20000,deduction:6000}
const snapshot={amounts:{net:100000,vat:25000,labor:50000,deduction:15000},taxType:'rot',stages:[{label:'Start',percent:40,due:'Vid start',amounts:a},{label:'Klart',percent:60,due:'Efter slutbesiktning',amounts:{net:60000,vat:15000,labor:30000,deduction:9000}}]}
async function mount(page:Page,active=false,draft=false) {
 const calls:any[]=[]
 let activated=active
 await page.route('**/*',route=>route.request().url()==='http://plan.test/'?route.fulfill({contentType:'text/html',body:'<html lang="sv"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div></html>'}):route.abort())
 await page.route('**/api/projects/p/payment-plan',route=>{
   const request=route.request()
   if(request.method()==='POST'){
    const body=request.postDataJSON();calls.push(body)
    if(body.action==='activate'){activated=true;return route.fulfill({json:{plan:{snapshot}}})}
    return route.fulfill({json:{invoice:{invoice_id:'new'}}})
   }
   return route.fulfill({json:activated?{plan:{snapshot},billed:draft?a:{net:0,vat:0},remaining:snapshot.amounts,entries:draft?[{step:0,kind:'partial',invoice_id:'i',amounts:a,invoice:{invoice_number:'101',status:'draft'}}]:[]}:{preview:snapshot}})
 })
 await page.goto('http://plan.test/')
 await page.addScriptTag({path:'node_modules/react/umd/react.development.js'})
 await page.addScriptTag({path:'node_modules/react-dom/umd/react-dom.development.js'})
 const entry='app/dashboard/projects/[id]/payment-plan/page.tsx'
 const css=await postcss([tailwind({...config,content:[entry]})]).process('@tailwind base;@tailwind utilities;',{from:undefined})
 await page.addStyleTag({content:css.css})
 const code=ts.transpileModule(fs.readFileSync(entry,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText
 await page.addScriptTag({content:`const router={push:p=>window.destination=p};const deps={'react':React,'next/link':{__esModule:true,default:p=>React.createElement('a',p)},'next/navigation':{useParams:()=>({id:'p'}),useRouter:()=>router}};const m={exports:{}};new Function('require','module','exports',${JSON.stringify(code)})(n=>deps[n],m,m.exports);ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(m.exports.default));`})
 return calls
}
test('mobil: aktivera och skapa rätt steg utan klientstyrt belopp',async({page})=>{
 await page.setViewportSize({width:390,height:844})
 const calls=await mount(page)
 await expect(page.getByRole('button',{name:'Skapa delfakturautkast'})).toBeDisabled()
 await page.getByRole('button',{name:'Aktivera betalplan'}).click()
 await page.getByRole('button',{name:'Skapa delfakturautkast'}).click()
 expect(calls).toEqual([{action:'activate'},{action:'invoice',step:0}])
 await expect.poll(()=>page.evaluate(()=>(window as any).destination)).toBe('/dashboard/invoices/new')
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
test('väntande utkast öppnas och spärrar nästa faktura',async({page})=>{
 await mount(page,true,true)
 await expect(page.getByRole('link',{name:'Öppna 101'})).toHaveAttribute('href','/dashboard/invoices/i')
 await expect(page.getByRole('button',{name:'Skapa slutfakturautkast'})).toBeDisabled()
 await expect(page.getByText('Öppna och skicka det väntande utkastet innan du går vidare.')).toBeVisible()
})
