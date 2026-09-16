const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),esbuild=require('esbuild'),{chromium}=require('playwright'),postcss=require('postcss'),tailwind=require('tailwindcss')
const {load}=require('../sprint/integrity-loader.cjs')
async function main(){
 const mocks={
 'next/navigation':`export const useSearchParams=()=>new URLSearchParams('project=p')`,
 '@/lib/BusinessContext':`const b={business_id:'biz'}; export const useBusiness=()=>b`,
 '@/lib/CurrentUserContext':`const u={id:'a',can_see_all_projects:true}; export const useCurrentUser=()=>({user:u,isOwnerOrAdmin:true})`,
 '@/lib/supabase':`export const supabase={}`,
 '@/lib/schedule/person-day':`export const fetchPersonDays=async()=>[]`,
 '@/components/onboarding/PlanningStart':`export const PlanningStart=()=>null`
 }
 const result=await esbuild.build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Page from './app/dashboard/schedule/page';createRoot(document.getElementById('root')).render(<Page/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'mocks',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:null);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'js'}))}}]})
 const config=load('tailwind.config.ts').default
 const css=(await postcss([tailwind({...config,content:['app/dashboard/schedule/page.tsx','components/schedule/*.tsx']})]).process('@tailwind base;@tailwind components;@tailwind utilities;',{from:undefined})).css
 for(const width of [390,1280]) {
 const browser=await chromium.launch({executablePath:process.env.HANDYMATE_TEST_CHROMIUM || '/tmp/handymate-chromium',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],headless:true})
 try {
 const page=await browser.newPage({viewport:{width,height:900},timezoneId:'Europe/Stockholm'}), errors=[],posts=[]
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});await page.clock.install({time:new Date('2026-09-14T10:00:00Z')})
 const members=[{id:'a',name:'Anna',is_active:true,color:'#0f766e'},{id:'b',name:'Bo',is_active:true,color:'#3b82f6'}]
 await page.route('**/*',async route=>{const u=new URL(route.request().url());let data={}
 if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:`<html><head><style>${css}</style></head><body><div id="root"></div><script>${result.outputFiles[0].text}</script></body></html>`})
 if(u.pathname==='/api/team')data={members}
 if(u.pathname==='/api/schedule/projects')data={projects:[{project_id:'p',name:'Badrum',budget_hours:40,actual_hours:25,remaining_hours:15,planned_hours:24,scheduled_member_ids:['a']}]}
 if(u.pathname==='/api/schedule')data={entries:[{id:'existing',business_user_id:'a',project_id:'p',title:'Badrum',start_datetime:'2026-09-13T22:00:00Z',end_datetime:'2026-09-14T22:00:00Z',all_day:true,status:'scheduled',type:'project',business_user:members[0]}]}
 if(u.pathname==='/api/schedule/batch'){posts.push(route.request().postDataJSON());if(posts.length===1)return route.abort();data={entries:Array.from({length:6},(_,i)=>({id:String(i)}))}}
 return route.fulfill({contentType:'application/json',body:JSON.stringify(data)})})
 await page.goto('https://planning.test/')
 await page.getByRole('button',{name:'Planera personal',exact:true}).click()
 assert.equal(await page.getByLabel('Jobb',{exact:true}).inputValue(),'p')
 await page.getByRole('dialog').getByLabel('Bo',{exact:true}).check()
 await page.getByRole('button',{name:/ons 16\/9/}).click();await page.getByRole('button',{name:/fre 18\/9/}).click()
 await page.getByRole('button',{name:'Heldag',exact:true}).click()
 await page.getByRole('button',{name:'Spara plan',exact:true}).click()
 await page.getByRole('button',{name:'Kontrollera sparningen',exact:true}).waitFor()
 assert.equal(await page.getByLabel('Jobb',{exact:true}).isDisabled(),true)
 await page.getByRole('button',{name:'Avbryt',exact:true}).click()
 await page.getByRole('button',{name:'Kontrollera sparningen',exact:true}).click()
 await page.getByRole('dialog').getByRole('button',{name:'Kontrollera sparningen',exact:true}).click()
 await page.getByRole('dialog').waitFor({state:'hidden'})
 assert.equal(posts.length,2);assert.equal(posts[0].request_id,posts[1].request_id);assert.deepEqual(posts[0].dates,['2026-09-14','2026-09-16','2026-09-18']);assert.deepEqual(posts[0].business_user_ids,['a','b'])
 const grid=page.getByTestId('schedule-time-grid');await grid.evaluate(el=>el.scrollTop=480)
 const row=await page.getByTestId('all-day-row').boundingBox(),bounds=await grid.boundingBox();assert.ok(Math.abs(row.y-bounds.y)<2)
 assert.deepEqual(errors,[])
 await page.screenshot({path:`/tmp/planning-restored-${width}.png`,fullPage:true})
 console.log(`PASS planning UI ${width}px: context, six slots, safe retry, sticky all-day`)
 } finally {await browser.close()}
 }
}
main().catch(e=>{console.error(e);process.exitCode=1})
