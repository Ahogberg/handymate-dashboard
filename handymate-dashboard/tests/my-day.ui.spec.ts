import {test,expect} from '@playwright/test'
import {reliefPreview} from './helpers/relief-preview'
import {svDateStr} from '../lib/dates'
test.use({storageState:{cookies:[],origins:[]},launchOptions:{executablePath:process.env.HANDYMATE_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}})
for(const width of [375,1280])test(`real day card: reload, unknown source, date change and report handoff at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:950})
 const html=await reliefPreview('day'),errors:string[]=[],methods:string[]=[]
 let mode='ready',minutes=90
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html})
  methods.push(req.method())
  if(url.pathname==='/api/day-close'){
   const date=url.searchParams.get('date')!
   if(url.searchParams.get('view')!=='day')return route.fulfill({json:{summary:{projectId:'p',date,ownMinutes:minutes,ownEntryCount:1,ownNotes:[],scope:'Din sparade tid',activeTimer:false}}})
   if(mode==='offline')return route.fulfill({status:503,json:{error:'Offline'}})
   return route.fulfill({json:{overview:{date,checkedAt:new Date().toISOString(),work:mode==='partial'?{state:'unavailable',message:'Dagens sparade arbete kunde inte läsas fullständigt.'}:{state:'ready',value:{minutes:date===svDateStr()?minutes:30,entries:1,notes:2,projects:[{id:'p',name:'Köket hos Anders och ett långt projektnamn för mobilbredd',minutes:date===svDateStr()?minutes:30,entries:1,notes:2}]}},timer:{state:'ready',value:true},decisions:{state:'ready',value:2},followups:{state:'ready',value:{healthy:false,items:[{id:'f',quoteId:'q',state:'prepared',dueAt:'2026-09-09T09:00:00Z',reason:'review_required'}]}}}}})
  }
  return route.abort()
 })
 await page.goto('https://myday.test/')
 await expect(page.getByText('1,5 timmar rapporterade')).toBeVisible()
 await expect(page.getByRole('link',{name:'2 beslut väntar på granskning'})).toHaveAttribute('href','/dashboard/approvals')
 await expect(page.getByText('Teamets senaste körning kan inte bekräftas.',{exact:false})).toBeVisible()
 await expect(page.getByRole('link',{name:'Öppna offertens nästa steg'})).toHaveAttribute('href','/dashboard/quotes/q')
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.screenshot({path:`test-results/my-day-${width}.png`,fullPage:true})
 minutes=120;await page.reload();await expect(page.getByText('2 timmar rapporterade')).toBeVisible()
 mode='partial';await page.getByRole('button',{name:'Läs in igen'}).click();await expect(page.getByRole('alert').filter({hasText:'Dagens sparade arbete'})).toBeVisible();await expect(page.getByText('2 timmar rapporterade')).toHaveCount(0);await expect(page.getByRole('link',{name:'2 beslut väntar på granskning'})).toBeVisible()
 mode='offline';await page.getByRole('button',{name:'Läs in igen'}).click();await expect(page.getByRole('alert').filter({hasText:'Din dag kunde inte kontrolleras'})).toBeVisible();await expect(page.getByRole('link',{name:'2 beslut väntar på granskning'})).toHaveCount(0)
 mode='ready';await page.getByRole('button',{name:'Läs in igen'}).click();await expect(page.getByText('2 timmar rapporterade')).toBeVisible()
 await page.getByLabel('Visa rapportering för').fill('2026-01-02');await expect(page.getByText('0,5 timmar rapporterade')).toBeVisible();await expect(page.getByRole('button',{name:'Komplettera dagens rapport'})).toHaveCount(0);await expect(page.getByText('Aktuellt läge, oavsett valt rapportdatum.')).toBeVisible()
 await page.getByLabel('Visa rapportering för').fill(svDateStr());await page.getByRole('button',{name:'Komplettera dagens rapport'}).click();await expect(page.getByRole('button',{name:'Tillbaka och läs sparat arbete'})).toBeVisible();await page.getByRole('button',{name:'Tillbaka och läs sparat arbete'}).click();await expect(page.getByText('2 timmar rapporterade')).toBeVisible()
 expect(methods.every(m=>m==='GET')).toBe(true);expect(errors).toEqual([])
})
test('actual avlastning page opens the day anchor after authenticated content mounts',async({page})=>{
 const html=await reliefPreview('day-page');const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 await page.setViewportSize({width:375,height:700})
 await page.route('**/*',route=>{
  const url=new URL(route.request().url())
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html})
  if(url.pathname==='/api/day-close')return route.fulfill({json:{overview:{date:url.searchParams.get('date'),checkedAt:new Date().toISOString(),work:{state:'ready',value:{minutes:0,entries:0,notes:0,projects:[]}},timer:{state:'ready',value:false},decisions:null,followups:null}}})
  return route.abort()
 })
 await page.goto('https://myday.test/#min-dag')
 await expect(page.getByRole('heading',{name:'Din dag',exact:true})).toBeInViewport()
 await expect(page.getByRole('textbox',{name:'Ditt underlag',exact:true})).toHaveCount(1)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 expect(errors).toEqual([])
})
