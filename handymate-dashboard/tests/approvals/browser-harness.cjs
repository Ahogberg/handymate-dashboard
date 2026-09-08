const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict')
const {chromium}=require('playwright')
;(async()=>{
 const runtime=(await import('@sparticuz/chromium')).default
 const browser=await chromium.launch({executablePath:await runtime.executablePath(),args:runtime.args,headless:true})
 try {
  const page=await browser.newPage();let posts=[],attachmentStatus=200,mass=false
  const review={title:'Granska kampanjen',effect:'Köar utskicket',confirmLabel:'Bekräfta och köa',messages:[{channel:'SMS',recipients:['+46701234567'],text:'Hela kampanjtexten '.repeat(100)}]}
  await page.route('**/*',async route=>{
   const url=route.request().url()
   if(url.endsWith('/api/document'))return route.fulfill({status:attachmentStatus,contentType:'text/html',body:'<h1>Hela dokumentet</h1><p>Arbete: 1500 kr</p>'})
   if(url.endsWith('/api/approvals/a')){const body=route.request().postDataJSON();posts.push(body);if(mass&&body.action==='approve'&&body.confirm_recipients!==2)return route.fulfill({status:428,json:{requires_confirmation:true,recipient_count:2,message:'Hela kampanjtexten',recipients_preview:['Kund A','Kund B'],confirm_field:'confirm_recipients'}});return route.fulfill({status:body.action==='preview'?428:200,json:body.action==='preview'?{review,review_token:'test-proof'}:{receipt:{state:'queued',text:'Köat'}}})}
   if(url==='https://approval.test/')return route.fulfill({contentType:'text/html',body:'<button id="start">Start</button>'})
   throw Error(`Unexpected network request: ${url}`)
  })
  await page.goto('https://approval.test/')
  const code=ts.transpileModule(fs.readFileSync('lib/approvals/review-client.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const massClient=ts.transpileModule(fs.readFileSync('lib/approvals/klient-bekraftelse.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  await page.addScriptTag({content:`window.massClient=(()=>{const exports={};${massClient};return exports})();window.require=name=>{if(name==='./klient-bekraftelse')return window.massClient;throw Error('Unexpected module '+name)}`})
  await page.addScriptTag({content:`window.exports={};${code};window.reviewApi=exports`})
  await page.evaluate(()=>{window.result=null;window.reviewApi.reviewedApprovalFetch('/api/approvals/a',{method:'POST',body:JSON.stringify({action:'approve'})}).then(r=>window.result=r.status)})
  await page.getByRole('dialog').waitFor();assert.equal(posts.length,1)
  assert.equal(await page.getByText(review.messages[0].text,{exact:true}).count(),1)
  await page.getByRole('button',{name:'Tillbaka',exact:true}).click();assert.equal(await page.evaluate(()=>window.result),499);assert.equal(posts.length,1)
  await page.evaluate(()=>{window.reviewApi.reviewedApprovalFetch('/api/approvals/a',{method:'POST',body:JSON.stringify({action:'approve'})}).then(r=>window.result=r.status)})
  await page.getByRole('button',{name:'Bekräfta och köa',exact:true}).click();await page.waitForFunction(()=>window.result===200)
  assert.equal(posts.length,3);assert.equal(posts[2].review_token,'test-proof')
  mass=true;posts=[]
  await page.evaluate(()=>{window.result=null;window.reviewApi.reviewedApprovalFetch('/api/approvals/a',{method:'POST',body:JSON.stringify({action:'approve'})}).then(r=>window.result=r.status)})
  page.once('dialog',async dialog=>{assert.ok(dialog.message().includes('2 kunder'));await dialog.accept()})
  await page.getByRole('button',{name:'Bekräfta och köa',exact:true}).click();await page.waitForFunction(()=>window.result===200)
  assert.equal(posts.length,3);assert.equal(posts[1].review_token,'test-proof');assert.equal(posts[2].review_token,'test-proof');assert.equal(posts[2].confirm_recipients,2)
  mass=false
  await page.evaluate(r=>{window.result=null;window.reviewApi.showApprovalReview({...r,choices:[{id:'identity',label:'Verifierat projekt',description:'Kontrollera identiteten',defaultSelected:false,required:true}]}).then(r=>window.result=r)},review)
  assert.equal(await page.getByRole('button',{name:'Bekräfta och köa'}).isDisabled(),true)
  await page.getByRole('checkbox',{name:'Verifierat projekt'}).check();assert.equal(await page.getByRole('button',{name:'Bekräfta och köa'}).isEnabled(),true)
  await page.getByRole('checkbox',{name:'Verifierat projekt'}).uncheck();assert.equal(await page.getByRole('button',{name:'Bekräfta och köa'}).isDisabled(),true)
  await page.getByRole('checkbox',{name:'Verifierat projekt'}).check();await page.getByRole('button',{name:'Bekräfta och köa'}).click()
  assert.equal((await page.evaluate(()=>window.result)).actionOverrides.identity,'approved')
  const documentReview={...review,attachments:[{label:'Dokument',url:'/api/document',kind:'document'}]}
  await page.evaluate(r=>{window.result=null;window.reviewApi.showApprovalReview(r).then(r=>window.result=r)},documentReview)
  const check=page.getByRole('checkbox');await check.waitFor();await page.waitForFunction(()=>!document.querySelector('input[type=checkbox]').disabled)
  assert.equal(await page.getByRole('button',{name:'Bekräfta och köa'}).isDisabled(),true)
  await page.frameLocator('iframe').getByText('Arbete: 1500 kr').waitFor()
  await check.check();assert.equal(await page.getByRole('button',{name:'Bekräfta och köa'}).isEnabled(),true)
  await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>window.result),{confirmed:false})
  attachmentStatus=403
  await page.evaluate(r=>{window.reviewApi.showApprovalReview(r)},documentReview)
  await page.getByText('Underlaget kunde inte laddas. Beslutet kan inte bekräftas.').waitFor()
  assert.equal(await page.getByRole('button',{name:'Bekräfta och köa'}).isDisabled(),true)
  await page.keyboard.press('Escape')
  await page.evaluate(r=>{window.reviewApi.showApprovalReview({...r,messages:[{channel:'E-post',recipients:['test@example.test'],text:'Fallback',html:'<h1>Synlig mejltext</h1><script>parent.unwantedSend=true</script>'}]})},review)
  await page.frameLocator('iframe').getByText('Synlig mejltext').waitFor();assert.equal(await page.evaluate(()=>window.unwantedSend),undefined)
  await page.keyboard.press('Escape')
  const choiceReview={...review,choices:[
   {id:'invoice',label:'Skapa fakturautkast',description:'Skapar utkast.',defaultSelected:true},
   {id:'review',label:'Förbered kunduppföljning',description:'Skapar separat förslag.',defaultSelected:true},
  ]}
  await page.evaluate(r=>{window.result=null;window.reviewApi.reviewedApprovalFetch('/api/approvals/a',{method:'POST',body:JSON.stringify({action:'approve'})}).then(r=>window.result=r.status);window.nextReview=r},choiceReview)
  await page.getByRole('dialog').waitFor()
  // Route-mocken lämnar standard-reviewn, så prova det signerade valbeslutet
  // direkt i samma verkliga dialog och kontrollera dess exakta wire-format.
  await page.keyboard.press('Escape')
  await page.evaluate(r=>{window.choiceResult=null;window.reviewApi.showApprovalReview(r).then(x=>window.choiceResult=x)},choiceReview)
  await page.getByRole('checkbox',{name:'Förbered kunduppföljning'}).uncheck()
  await page.getByRole('button',{name:'Bekräfta och köa',exact:true}).click()
  assert.deepEqual(await page.evaluate(()=>window.choiceResult),{confirmed:true,actionOverrides:{invoice:'approved',review:'rejected'}})
  console.log('PASS actual Chromium: full text, preview-only first click, cancel, explicit proof submission, rendered document, required review checkbox, forbidden document disables confirmation, sandboxed email HTML, and explicit signed sub-action choices.')
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
