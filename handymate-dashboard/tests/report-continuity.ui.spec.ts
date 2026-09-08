import {test,expect} from '@playwright/test'
import {reliefPreview} from './helpers/relief-preview'
import {reportDatabase,reportClient} from './helpers/report-database'
import {reportWriters} from './helpers/report-writers'
import {createReportSession,listReportSessions,resumeReportSession,discardReportSession} from '../lib/matte/report-session'
import {confirmWorkReport} from '../lib/matte/work-report-confirmation'
import {verifyPendingExternalAction} from '../lib/agent/external-confirm'
import {svDateStr} from '../lib/dates'
test.use({storageState:{cookies:[],origins:[]},launchOptions:{executablePath:process.env.HANDYMATE_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}})
for(const width of [375,1280])test(`two pages resume actual persisted material/ATA chain after lost response at ${width}px`,async({context,page})=>{
 const old=process.env.CRON_SECRET;process.env.CRON_SECRET='test-only-report-browser'
 const db=await reportDatabase(),client=reportClient(db),errors:string[]=[],day=svDateStr()
 const user:any={id:'u',user_id:'auth-u',business_id:'b',role:'owner',is_active:true}
 const reportCtx:any={projectId:'p',projectName:'Köket',userId:'u',userName:'Test',date:day,entries:[],activeTimer:false}
 try {
 await createReportSession(client,'b',reportCtx,null,[{toolName:'log_material',toolInput:{project_id:'p',name:'Kabel',quantity:2,unit:'m'}},{toolName:'create_ata_draft',toolInput:{project_id:'p',description:'Extra uttag i köket'}}])
 const html=await reliefPreview('report');let lose=true
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html})
  try {
   if(url.pathname==='/api/day-close'&&req.method()==='GET'){
    if(url.searchParams.get('view')==='reports')return route.fulfill({json:{enabled:true,...await listReportSessions(client,'b',user,'p',day)}})
    return route.fulfill({json:{summary:{projectId:'p',date:day,ownMinutes:0,ownEntryCount:0,ownNotes:[],scope:'Egen tid och anteckningar',activeTimer:false}}})
   }
   if(url.pathname==='/api/day-close'){const body=req.postDataJSON();return route.fulfill({json:body.action==='discard'?await discardReportSession(client,'b',user,body.id):await resumeReportSession(client,'b',user,body.id)})}
   if(url.pathname==='/api/matte/chat'){const body=req.postDataJSON();expect(body.confirm?.token).toBeTruthy();const response=await confirmWorkReport(verifyPendingExternalAction(body.confirm.token,'b')!,client,'b',user,reportWriters());if(lose){lose=false;return route.abort()}return route.fulfill({json:response})}
   return route.abort()
  } catch(e:any){return route.fulfill({status:503,json:{error:e.message}})}
 })
 page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:950});await page.goto('https://report.test/')
 await expect(page.getByText('0 av 2 delar bekräftat sparade',{exact:false})).toBeVisible()
 await page.getByRole('button',{name:'Återuppta och granska nästa del'}).click();await page.getByRole('button',{name:'Bokför materialet',exact:true}).click()
 await expect.poll(async()=>(await db.query<any>('SELECT completed FROM work_report_session')).rows[0].completed).toBe(1)
 await page.close()
 const second=await context.newPage();second.on('pageerror',e=>errors.push(e.message));await second.setViewportSize({width,height:950});await second.goto('https://report.test/')
 await expect(second.getByText('1 av 2 delar bekräftat sparade',{exact:false})).toBeVisible();await second.getByRole('button',{name:'Återuppta och granska nästa del'}).click()
 await expect(second.getByRole('button',{name:'Bokför materialet',exact:true})).toHaveCount(0)
 await second.getByRole('button',{name:'Spara förslaget',exact:true}).click();await expect(second.getByText('2 av 2 delar bekräftat sparade',{exact:false})).toBeVisible()
 await second.reload();await expect(second.getByText('2 av 2 delar bekräftat sparade',{exact:false})).toBeVisible()
 expect((await db.query('SELECT * FROM project_material')).rows).toHaveLength(1);expect((await db.query('SELECT * FROM pending_approvals')).rows).toHaveLength(1)
 expect(await second.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([])
 await second.screenshot({path:`test-results/report-continuity-${width}.png`,fullPage:true})
 } finally {await db.close();if(old===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=old}
})
