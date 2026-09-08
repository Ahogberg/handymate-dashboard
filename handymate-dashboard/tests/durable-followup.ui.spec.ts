import {test,expect} from '@playwright/test'
import {followupPreview} from './helpers/followup-preview'
import {followupDatabase,seedFollowup,makeDue} from './helpers/followup-database'
test.use({timezoneId:'UTC',storageState:{cookies:[],origins:[]},launchOptions:process.env.HANDYMATE_TEST_CHROMIUM?{executablePath:process.env.HANDYMATE_TEST_CHROMIUM}:undefined})
for(const width of [375,1280])test(`real component and SQL: schedule, close app, prepare, reload, cancel at ${width}px`,async({page})=>{
 const db=await followupDatabase();await seedFollowup(db);const html=await followupPreview();const errors:string[]=[];let fail=false
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',async r=>{
  const url=new URL(r.request().url())
  if(url.pathname==='/')return r.fulfill({contentType:'text/html',body:html})
  if(!url.pathname.endsWith('/followup'))return r.abort()
  if(fail)return r.fulfill({status:503,json:{error:'Tillfälligt läsfel'}})
  try {
   if(r.request().method()==='POST'){
    const b=r.request().postDataJSON();const result=await db.query(`SELECT (schedule_agent_followup('a','owner','q',$1,$2,null)).*`,[b.due_at,b.request_key]);return r.fulfill({json:{item:result.rows[0]}})
   }
   if(r.request().method()==='DELETE'){const result=await db.query(`SELECT (cancel_agent_followup('a','owner',$1)).*`,[url.searchParams.get('id')]);return r.fulfill({json:{item:result.rows[0]}})}
   return r.fulfill({json:{enabled:true,healthy:true,items:(await db.query('SELECT * FROM agent_followup ORDER BY created_at DESC')).rows}})
  }catch(e){return r.fulfill({status:409,json:{error:String(e)}})}
 })
 try{
  await page.setViewportSize({width,height:1000});await page.goto('https://followup.test/')
  const due=new Date(Date.now()+3600000).toISOString().slice(0,16)
  await page.getByLabel('När ska Daniel kontrollera offerten?').fill(due)
  await page.getByRole('button',{name:'Planera förberedelsen'}).click();await expect(page.getByText(/Planerad ·/)).toBeVisible()
  await page.goto('about:blank');await makeDue(db);await db.query('SELECT run_agent_followups()')
  await page.goto('https://followup.test/');await expect(page.getByText(/Behöver din granskning ·/)).toBeVisible()
  expect((await db.query('SELECT * FROM sms_log')).rows).toHaveLength(0)
  await page.reload();await expect(page.getByRole('link',{name:'Öppna beslut och kvittens'})).toBeVisible()
  fail=true;await page.reload();await expect(page.getByRole('alert')).toContainText('kunde inte kontrolleras');await expect(page.getByText(/Planerad ·/)).toHaveCount(0)
  fail=false;await page.getByRole('button',{name:'Kontrollera igen'}).click();await expect(page.getByText(/Behöver din granskning ·/)).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:`test-results/durable-followup-${width}.png`,fullPage:true})
  await page.getByRole('button',{name:'Avbryt uppföljningen'}).click();await expect(page.getByText(/Avbruten ·/)).toBeVisible()
  await page.reload();await expect(page.getByText(/Avbruten ·/)).toBeVisible();expect(errors).toEqual([])
 }finally{await db.close()}
})
