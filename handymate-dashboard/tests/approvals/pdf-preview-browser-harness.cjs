const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict'),{chromium}=require('playwright')
;(async()=>{
 const code=ts.transpileModule(fs.readFileSync('lib/approvals/pdf-preview.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace('export async function','async function')
 const render=new Function(code+';return renderReviewedPdf')()
 const html=await render(fs.readFileSync('/tmp/job-report-preview.pdf'))
 assert(html.includes('data:image/png;base64,'));assert(!html.includes('<script'))
 const runtime=(await import('@sparticuz/chromium')).default
 const browser=await chromium.launch({executablePath:await runtime.executablePath(),args:runtime.args,headless:true})
 try {
   const page=await browser.newPage();let raw=false
   await page.route('**/*',route=>route.fulfill(route.request().url().endsWith('/api/document')
     ?raw?{contentType:'application/pdf',body:fs.readFileSync('/tmp/job-report-preview.pdf')}:{contentType:'text/html',body:html}
     :{contentType:'text/html',body:'<h1>Isolerat dokumentprov</h1>'}))
   await page.goto('https://approval.test/')
   const client=ts.transpileModule(fs.readFileSync('lib/approvals/review-client.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const massClient=ts.transpileModule(fs.readFileSync('lib/approvals/klient-bekraftelse.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  await page.addScriptTag({content:`window.massClient=(()=>{const exports={};${massClient};return exports})();window.require=name=>{if(name==='./klient-bekraftelse')return window.massClient;throw Error('Unexpected module '+name)}`})
   await page.addScriptTag({content:`window.exports={};${client}`})
   const review={title:'Granskad jobbrapport',effect:'Bifogar den granskade PDF-filen',confirmLabel:'Skicka',messages:[],attachments:[{label:'Rapporten',url:'/api/document',kind:'document'}]}
   await page.evaluate(r=>{window.exports.showApprovalReview(r)},review)
   const frame=page.frameLocator('iframe')
   await frame.getByText('Sida 1 av 1',{exact:true}).waitFor()
   await page.waitForFunction(()=>!document.querySelector('input[type=checkbox]').disabled)
   assert(await frame.locator('img').evaluate(i=>i.complete&&i.naturalWidth>500),'Actual PDF page must render')
   assert(await page.getByRole('button',{name:'Skicka',exact:true}).isDisabled())
   await page.getByRole('checkbox').check();assert(await page.getByRole('button',{name:'Skicka',exact:true}).isEnabled())
   await page.screenshot({path:'/tmp/job-report-rendered-browser.png'})
   await page.keyboard.press('Escape');raw=true
   await page.evaluate(r=>{window.exports.showApprovalReview(r)},review)
   await page.getByText('Underlaget kunde inte laddas. Beslutet kan inte bekräftas.').waitFor()
   assert(await page.getByRole('button',{name:'Skicka',exact:true}).isDisabled())
   console.log('PASS actual PDF rasterization in Chromium sandbox: visible page pixels, reviewed checkbox required, raw/unsupported PDF cannot authorize sending.')
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
