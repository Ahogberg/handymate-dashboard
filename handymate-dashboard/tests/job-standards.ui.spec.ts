import { mkdirSync, copyFileSync } from 'fs'
import { test, expect } from '@playwright/test'
import { jobStandardPreview } from './helpers/job-standard-preview'
import { standardDatabase } from './helpers/job-standard-db'
import { ensureOnboardingJobTypes } from '../lib/job-types'
import { writeJobStandard } from '../lib/quotes/job-standard-server'
import { loadQuoteSetup } from '../lib/quotes/job-type-setup-server'

test.use({ storageState:{cookies:[],origins:[]}, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { launchOptions: { executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH, args:['--no-sandbox','--disable-dev-shm-usage'] } } : {}) })
for (const width of [375,1280]) test(`jobbval till standardrader och återanvändning ${width}px`, async ({ page }) => {
  test.setTimeout(90000)
  const f = await standardDatabase()
  try {
    await f.pg.exec(`INSERT INTO products(id,business_id,name,unit,sales_price) VALUES ('work','a','Arbetstid','tim',950),('trip','a','Framkörning','st',495)`)
    const html = await jobStandardPreview(), errors:string[] = [], mutations:any[] = []
    let specialties:string[] = [], saves=0
    page.on('pageerror', error => {errors.push(error.message);console.error('UI runtime:',error.message)})
    await page.setViewportSize({width,height:width<768?812:900})
    await page.route('**/*',async route => {
      const request=route.request(), url=new URL(request.url()), body=request.postDataJSON()
      const reply=(data:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)})
      try {
        if(request.resourceType()==='image') return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="56" height="56" rx="28" fill="#ccfbf1"/><text x="18" y="36" fill="#0f766e" font-size="24">M</text></svg>'})
        if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html})
        if(request.method()!=='GET')mutations.push({path:url.pathname,...body})
        if(url.pathname==='/api/onboarding'){if(++saves===1)return reply({error:'Kunde inte spara jobbvalen. Försök igen.'},503);specialties=body.config.specialties;await ensureOnboardingJobTypes(f.db,'a',specialties);return reply({success:true})}
        if(url.pathname==='/api/reservations')return reply({reservations:[]})
        if(url.pathname==='/api/job-types/quote-setup') {
          if(request.method()==='GET')return reply({...await loadQuoteSetup(f.db,'a'),canManage:true})
          if(body.operation==='syncOnboarding')return reply({jobTypes:await ensureOnboardingJobTypes(f.db,'a',specialties)})
          return reply({template:await writeJobStandard(f.db,'a',body)})
        }
        if(url.pathname==='/api/products'&&request.method()==='POST') {
          const result = await f.pg.query('INSERT INTO products(id,business_id,name,unit,sales_price) VALUES($1,$2,$3,$4,$5) RETURNING *',['custom','a',body.name,body.unit,body.sales_price])
          return reply({product:result.rows[0],created:true})
        }
        if(url.pathname==='/api/products'&&request.method()==='PUT') {
          await f.pg.query('UPDATE products SET sales_price=$1 WHERE id=$2 AND business_id=$3',[body.sales_price,body.id,'a']);return reply({success:true})
        }
        // Unrelated categories/avatar requests do not leave this test environment.
        if(url.pathname.includes('product-categories'))return reply({categories:[]})
        return route.abort()
      } catch(error:any){return reply({error:error.message},error.status||503)}
    })
    await page.goto('http://job-standard.test/')
    await expect(page.getByText('Vilka jobb gör ni oftast?')).toBeVisible()
    await page.getByRole('button',{name:/^Laddbox/}).click()
    await page.getByRole('button',{name:/^Elcentral och elsäkerhet/}).click()
    await page.getByRole('button',{name:/^Service och felsökning/}).click()
    await page.getByRole('textbox',{name:'Egen jobbtyp'}).fill('Service på landet')
    await page.getByRole('button',{name:'Lägg till',exact:true}).click()
    await expect(page.getByRole('button',{name:'Service på landet',exact:true})).toBeVisible()
    await page.getByRole('button',{name:'Fortsätt',exact:true}).click()
    await expect(page.getByRole('alert')).toContainText('Kunde inte spara jobbvalen')
    await expect(page.getByRole('button',{name:'Service på landet',exact:true})).toBeVisible()
    await page.getByRole('button',{name:'Fortsätt',exact:true}).click()
    await page.getByRole('button',{name:'Förbered standardrader för Laddbox',exact:true}).click()
    await page.getByRole('combobox',{name:'Artikel till standardrader'}).selectOption('work')
    await page.getByRole('textbox',{name:'Standardmängd för ny rad',exact:true}).fill('3')
    await page.getByRole('button',{name:'Lägg till rad',exact:true}).click()
    await expect(page.getByRole('textbox',{name:'Standardmängd för Arbetstid',exact:true})).toHaveValue('3')
    await page.getByRole('combobox',{name:'Artikel till standardrader'}).selectOption('trip')
    await page.getByRole('button',{name:'Lägg till rad',exact:true}).click()
    const preview=page.getByRole('region',{name:'Så här börjar nästa offert för Laddbox'})
    await expect(preview).toContainText('950 kr/tim')
    await expect(preview).toContainText('495 kr/st')
    await page.getByRole('textbox',{name:'Standardmängd för Arbetstid',exact:true}).fill('4')
    await page.getByRole('button',{name:'Spara mängd',exact:true}).first().click()
    await expect(preview).toContainText('4 tim')
    await page.getByRole('button',{name:'Ändra pris för Arbetstid',exact:true}).click()
    await page.getByRole('spinbutton',{name:'Pris för Arbetstid',exact:true}).fill('975.50')
    await page.getByRole('spinbutton',{name:'Pris för Arbetstid',exact:true}).press('Enter')
    await expect(preview).toContainText('975,5 kr/tim')
    await page.getByRole('button',{name:'+ Skapa egen artikel',exact:true}).click()
    await page.getByPlaceholder('T.ex. Fasadmålning').fill('Egen kontroll och dokumentation')
    await page.getByPlaceholder('Inget pris satt').fill('350')
    await page.getByRole('button',{name:'Lägg till',exact:true}).click()
    await expect(page.getByRole('combobox',{name:'Artikel till standardrader'})).toHaveValue('custom')
    await page.getByRole('button',{name:'Lägg till rad',exact:true}).click()
    await expect(preview).toContainText('350 kr/st')
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await page.screenshot({path:`test-results/job-standards-${width}.png`,fullPage:true})
    if(process.env.EXPORT_JOB_STANDARD_REVIEW==='1'){mkdirSync('docs/design/job-standards',{recursive:true});copyFileSync(`test-results/job-standards-${width}.png`,`docs/design/job-standards/standardrader-${width}.png`)}
    await page.getByRole('button',{name:'Återanvänd offert',exact:true}).click()
    await page.getByText('Spara standardrader för jobbtypen',{exact:true}).click()
    await expect(page.getByRole('checkbox').last()).toBeDisabled()
    await page.getByRole('checkbox').first().check()
    await page.getByRole('button',{name:'Spara 1 valda rader som standard'}).click()
    await expect(page.getByRole('status')).toContainText('Standardraderna är sparade')
    const setup=await loadQuoteSetup(f.db,'a')
    expect(setup.templates[0].items).toMatchObject([{linkedProductId:'work',quantity:4}])
    expect(errors).toEqual([])
    expect(mutations.some(m=>m.operation==='replace')).toBe(true)
  } finally {await f.close()}
})
