import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import ts from 'typescript'

/** Full onboarding frame and real components; no authenticated network calls. */
function tourHTML() {
  const sources: Record<string,string> = {}, styles:string[] = []
  function collect(file:string) {
    const id='@/'+file.replace(/\.tsx?$/,'')
    if(sources[id])return
    const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText
    sources[id]=code
    for(const [,dep] of Array.from(code.matchAll(/require\("([^"]+)"\)/g))) {
      if(['react','lucide-react'].includes(dep))continue
      const root=dep.startsWith('@/')?dep.slice(2):path.posix.normalize(path.posix.join(path.posix.dirname(file),dep))
      if(root.endsWith('.css')){styles.push(readFileSync(root,'utf8'));continue}
      const target=[root+'.ts',root+'.tsx'].find(existsSync)
      if(!target)throw Error('Missing '+dep)
      collect(target)
    }
  }
  collect('app/onboarding/components/Step6LiveTour.tsx')
  const boot=`const sources=${JSON.stringify(sources)},cache={react:React,'lucide-react':LucideReact};function load(id){if(id.endsWith('.css'))return {};if(cache[id])return cache[id];const exports={};cache[id]=exports;new Function('require','exports',sources[id])(name=>{if(name.startsWith('.')){const p=id.split('/');p.pop();for(const s of name.split('/')){if(s==='..')p.pop();else if(s!=='.')p.push(s);}name=p.join('/');}return load(name);},exports);return exports;}
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(load('@/app/onboarding/components/Step6LiveTour').default,{data:{businessId:'demo',companyName:'Exempelfirman',contactName:'Alex'},onFinish:()=>{},onFirstQuote:()=>{}}));`
  const safe=(s:string)=>s.replace(/<\/script/gi,'<\\/script')
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}${readFileSync('app/onboarding/onboarding.css','utf8')}${styles.join('\n')}</style></head><body><div class="ob-page"><div class="ob-stage"><div id="root" class="ob-card-wrap"></div></div></div><script>${safe(readFileSync('node_modules/react/umd/react.production.min.js','utf8'))}</script><script>${safe(readFileSync('node_modules/react-dom/umd/react-dom.production.min.js','utf8'))}</script><script>window.react=React;</script><script>${safe(readFileSync('node_modules/lucide-react/dist/umd/lucide-react.min.js','utf8'))}</script><script>${safe(boot)}</script></body></html>`
}

test.use({storageState:{cookies:[],origins:[]},...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{launchOptions:{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']}}:{})})
for(const width of [375,1280])test(`alla fem tipskort inom viewport och toast fri från knappen ${width}px`,async({page})=>{
  const height=width===375?812:900,errors:string[]=[]
  await page.setViewportSize({width,height})
  const html=tourHTML()
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*',route=>{
    if(route.request().url()==='http://tour.test/')return route.fulfill({contentType:'text/html',body:html})
    if(route.request().url().includes('/api/onboarding/instant-value'))return route.fulfill({contentType:'application/json',body:'{}'})
    return route.abort()
  })
  await page.clock.install({time:new Date('2026-09-06T00:00:00Z')})
  await page.clock.pauseAt(new Date('2026-09-06T00:00:01Z'))
  await page.goto('http://tour.test/')
  await page.getByRole('button',{name:'Visa mig runt först'}).click()
  const toast=page.getByText('Lisa är på linjen. Karin har koll. Du är live.',{exact:true})
  await expect(toast).toBeVisible()
  await expect(page.getByRole('button',{name:'Hoppa till start →'})).toHaveCount(0)
  const toastBox=await toast.boundingBox()
  expect(toastBox!.x).toBeGreaterThanOrEqual(0);expect(toastBox!.x+toastBox!.width).toBeLessThanOrEqual(width)
  await page.clock.runFor(3000)
  await expect(toast).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Hoppa till start →'})).toBeVisible()
  for(let index=1;index<=5;index++){
    if(width===375)await page.evaluate(()=>window.scrollTo(0,300))
    const card=page.getByText(`${index} av 5`,{exact:true}).locator('../..')
    await expect(card).toBeVisible()
    const box=await card.boundingBox()
    expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.y+box!.height).toBeLessThanOrEqual(height)
    await page.getByRole('button',{name:index===5?'Klart':'Nästa',exact:true}).click()
    await page.clock.runFor(400)
  }
  await expect(page.getByRole('heading',{name:'Vad ska vi ta tag i först?'})).toBeVisible()
  expect(errors).toEqual([])
})
