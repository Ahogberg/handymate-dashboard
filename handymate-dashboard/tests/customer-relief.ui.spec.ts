import { test, expect, type Page } from '@playwright/test'
import { reliefPreview } from './helpers/relief-preview'
test.use({storageState:{cookies:[],origins:[]},launchOptions:{executablePath:process.env.HANDYMATE_CHROMIUM_PATH || undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}})
async function mount(page:Page,mode:'intake'|'report'|'mission', handler:(path:string,body:any)=>any) {
  const html=await reliefPreview(mode);const errors:string[]=[];const calls:Array<{path:string;body:any}>=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname
    if(path==='/')return route.fulfill({contentType:'text/html',body:html})
    const body=req.method()==='POST'?req.postDataJSON():null;calls.push({path,body})
    const response=handler(path,body)
    if(!response)return route.abort()
    return route.fulfill(response)
  })
  await page.goto('https://relief.test/')
  return {errors,calls}
}
const summary=(minutes=0,date='2026-09-08')=>({projectId:'p',projectName:'Köket',date,checkedAt:'2026-09-08T12:00:00Z',ownMinutes:minutes,ownEntryCount:minutes?1:0,ownNotes:[],activeTimer:false,scope:'Din sparade tid och dina arbetsanteckningar. Andra jobb ingår inte.'})
for(const width of [375,1280]) test(`own source hands off to a separate quote draft without API sends at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:950});const h=await mount(page,'intake',()=>null)
  await page.getByRole('textbox', { name: 'Ditt underlag', exact: true }).fill('Kunden vill byta sex innerdörrar och forsla bort de gamla.')
  await page.getByRole('button',{name:'Fortsätt med mitt offertunderlag'}).click()
  await expect.poll(()=>page.evaluate(()=>(window as any).navigated)).toMatch(/^\/dashboard\/quotes\/new\?relief=/)
  const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem(Array.from({length:sessionStorage.length},(_,i)=>sessionStorage.key(i)!).find(k=>k.includes(':handoff:'))!)!))
  expect(saved).toMatchObject({businessId:'b',userId:'auth-u',intent:'quote',text:'Kunden vill byta sex innerdörrar och forsla bort de gamla.'})
  expect(h.calls).toEqual([])
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:`test-results/relief-intake-${width}.png`,fullPage:true})
  await page.reload();await expect(page.getByRole('textbox', { name: 'Ditt underlag', exact: true })).toHaveValue(saved.text)
  expect(h.errors).toEqual([])
})
test('followup opens an editable question and does not send or promise a scheduled check',async({page})=>{
  const h=await mount(page,'intake',()=>null)
  await page.getByRole('button',{name:'En kund att återkomma till',exact:true}).click()
  await page.getByRole('textbox', { name: 'Ditt underlag', exact: true }).fill('Anders undrar när vi kan komma tillbaka.')
  await page.getByRole('button',{name:'Förbered min fråga till Matte'}).click()
  expect(await page.evaluate(()=>(window as any).prefilled)).toContain('Skicka inget meddelande nu.')
  expect(h.calls).toEqual([]);expect(h.errors).toEqual([])
})
for(const width of [375,1280]) test(`report restores actual saved rows on reload and shows failure as unknown at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});let minutes=90,fail=false
  const h=await mount(page,'report',path=>path==='/api/day-close'?fail?{status:503,json:{error:'offline'}}:{json:{summary:summary(minutes,new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Stockholm'}))}}:null)
  await expect(page.getByText('1,5 timmar',{exact:true})).toBeVisible()
  await page.reload();await expect(page.getByText('1,5 timmar',{exact:true})).toBeVisible()
  fail=true;await page.reload();await expect(page.getByRole('alert')).toContainText('kunde inte kontrolleras')
  await expect(page.getByText('0 timmar',{exact:true})).toHaveCount(0)
  fail=false;minutes=120;await page.getByRole('button',{name:'Kontrollera igen'}).click();await expect(page.getByText('2 timmar',{exact:true})).toBeVisible()
  await page.screenshot({path:`test-results/relief-report-${width}.png`,fullPage:true})
  expect(h.errors).toEqual([])
})
test('report displays all proposed parts; blocked continuation preserves saved receipt without claiming finished',async({page})=>{
  const date=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Stockholm'})
  const proposal={tool_name:'log_time',token:'one',args:{project_id:'p',work_date:date},summary:'En timme montering',confirm_label:'Lägg till tiden',plan:[{tool_name:'log_time',summary:'En timme montering'},{tool_name:'add_work_note',summary:'Intern notering: återbesök behövs'}]}
  const h=await mount(page,'report',(path,body)=>{
    if(path==='/api/day-close')return {json:{summary:summary(60,date)}}
    if(path==='/api/matte/chat')return !body.confirm?{json:{reply:'Granska delarna.',pending_confirmation:proposal}}:{json:{confirmed:true,execution_result:{tool:'log_time',status:'saved'},pending_confirmation:null,report_continuation:{state:'blocked'},reply:'Tiden sparad. Nästa del kunde inte kontrolleras.'}}
  })
  await page.getByLabel('Vad vill du registrera?').fill('En timme montering och en intern notering om återbesök.')
  await page.getByRole('button',{name:'Ta fram förslag'}).click()
  await page.getByText('Rapportens 2 återstående delar — granska hela underlaget').click()
  await expect(page.getByText('Intern notering: återbesök behövs')).toBeVisible()
  await page.getByRole('button',{name:'Lägg till tiden'}).click()
  await expect(page.getByText('Tid — sparat',{exact:true})).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Rapporten är inte färdig')
  await expect(page.getByText('De granskade delarna i den här rapporten är sparade.',{exact:true})).toHaveCount(0)
  expect(h.errors).toEqual([])
})
test('project lookup failure preserves the input and retry opens the real report with it',async({page})=>{
  let fail=true
  const date=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Stockholm'})
  const h=await mount(page,'intake',path=>path==='/api/projects'?fail?{status:503,json:{error:'offline'}}:{json:{projects:[{project_id:'p',name:'Köket'}]}}:path==='/api/day-close'?{json:{summary:summary(0,date)}}:null)
  await page.getByRole('button',{name:'Dagens jobb att rapportera',exact:true}).click()
  await page.getByRole('textbox', { name: 'Ditt underlag', exact: true }).fill('Två timmar montering hos Anders idag.')
  await expect(page.getByRole('alert')).toContainText('Jobben kunde inte läsas')
  fail=false;await page.getByRole('button',{name:'Försök igen'}).click()
  await page.getByLabel('Vilket jobb gäller det?').selectOption('p')
  await page.getByRole('button',{name:'Förbered min rapport'}).click()
  await expect(page.getByLabel('Vad vill du registrera?')).toHaveValue('Två timmar montering hos Anders idag.')
  expect(h.calls.filter(c=>c.body!==null)).toEqual([]);expect(h.errors).toEqual([])
})
test('mission failure is not no-work; retry and account change clear the prior mission',async({page})=>{
  let mode:'error'|'ok'|'denied'='error'
  const h=await mount(page,'mission',path=>path==='/api/mission/active'?mode==='error'?{status:503,json:{error:'offline'}}:mode==='denied'?{status:403,json:{error:'denied'}}:{json:{mission:{id:'m',business_id:'b'},handover:{state:'needs_review',headline:'Teamet har förberett nästa beslut',nextStep:'Granska offerten.',planned:[{id:'one',owner:'Daniel',title:'Offert till Anders'}],pending:1,executed:0,unverified:0,deadline:'2026-09-09',scope:'Tidsramen är inte en bokad avstämning.'}}}:null)
  await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByText('Inget aktivt uppdrag')).toHaveCount(0)
  mode='ok';await page.getByRole('button',{name:'Försök igen'}).click();await expect(page.getByText('Offert till Anders',{exact:false})).toBeVisible()
  mode='denied';await page.evaluate(()=>(window as any).switchActor('other'))
  await expect(page.getByText('Offert till Anders',{exact:false})).toHaveCount(0)
  await expect(page.getByText('Inget aktivt uppdrag')).toBeVisible();expect(h.errors).toEqual([])
})
