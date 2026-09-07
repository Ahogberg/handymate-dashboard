import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import ts from 'typescript'
import { hamtaKomIgangSignals } from '../lib/onboarding/kom-igang-signals'
import { deriveKomIgangTasks } from '../lib/onboarding/kom-igang-tasks'

// Ingen databas eller mejlleverantör kontaktas. Kör de riktiga HTML-byggarna.
function emailBuilders() {
  const transpile = (path: string) => ts.transpileModule(readFileSync(path, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
  const exports: any = {}
  new Function('require','exports','process',transpile('app/api/cron/onboarding-followup/route.ts') + '\nexports.day2=buildDay2EmailHtml;exports.day7=buildDay7EmailHtml;')( (id: string) => {
    if (id === '@/lib/value/time-estimate-copy') { const e = {}; new Function('exports',transpile('lib/value/time-estimate-copy.ts'))(e); return e }
    return {}
  }, exports, {env:{NEXT_PUBLIC_APP_URL:'https://example.test'}})
  return exports
}
for (const day of ['day2','day7']) test(`${day}: tidsvärdet märks uppskattat och länkas till Översikts förklaring`, () => {
  const value = {calls_captured:0,time_hours:1.5,confirmed_kr:0}
  const html = emailBuilders()[day]('Andreas',value,day==='day2'?[]:null)
  expect(html).toMatch(/uppskattningsvis\s+(?:<b>)?1,5 timmar/i)
  expect(html).toContain('https://example.test/dashboard/oversikt#tidsuppskattning')
  expect(html).not.toMatch(/timmar<\/b>\s+administration du slapp/)
  const zero = emailBuilders()[day]('Andreas',{...value,time_hours:0},day==='day2'?[]:null)
  expect(zero).not.toContain('0 timmar')
})

/** Minimal relationell fixture: varje fråga måste begränsas till rätt firma.
 * Ger riktiga filterresultat för lead/deal-bevis, inte ett grönt standardsvar. */
function database(failTable?: string, verified = false) {
  const calls: Array<{table:string;filters:Array<[string,unknown]>}> = []
  const records: Record<string, any[]> = {
    business_config:[{business_id:'a',onboarding_data:{firstFocus:'fler_jobb'},widget_enabled:true},{business_id:'b',onboarding_data:{firstFocus:'mindre_admin'}}],
    leads:[{business_id:verified?'a':'b',lead_id:'lead-a',source:'website_form'}],
    deal:[{business_id:'a',id:'deal-a',lead_id:'lead-a',source:'website_form',created_at:'2026-09-07T00:00:00Z'}],
  }
  const db: any = {from:(table:string)=>{
    const call = {table,filters:[] as Array<[string,unknown]>};calls.push(call)
    let rows = [...(records[table]||[])], single=false
    const q: any = {
      select:()=>q,eq:(key:string,value:unknown)=>{call.filters.push([key,value]);rows=rows.filter(r=>r[key]===value);return q},
      neq:(key:string,value:unknown)=>{rows=rows.filter(r=>r[key]!==value);return q},
      not:(key:string,_op:string,value:unknown)=>{rows=rows.filter(r=>r[key]!=value);return q},
      in:(key:string,values:unknown[])=>{rows=rows.filter(r=>values.includes(r[key]));return q},
      order:()=>q,limit:(n:number)=>{rows=rows.slice(0,n);return q},maybeSingle:()=>{single=true;return q},
      then:(resolve:(v:unknown)=>void)=>resolve({data:single?(rows[0]??null):rows,count:rows.length,error:failTable===table?{message:'unreadable'}:null}),
    };return q
  }}
  return {db,calls}
}

for (const verified of [false,true]) test(`delat startunderlag ger samma prioritet och rätt kundinflödesbevis: ${verified}`, async () => {
  const a=database(undefined,verified),b=database(undefined,verified)
  const dashboard=deriveKomIgangTasks(await hamtaKomIgangSignals(a.db,'a')).filter(t=>!t.klar)
  const email=deriveKomIgangTasks(await hamtaKomIgangSignals(b.db,'a')).filter(t=>!t.klar)
  expect(email).toEqual(dashboard)
  expect(dashboard[0].key).toBe(verified?'matte_mission':'kundinflode')
  const signals=await hamtaKomIgangSignals(a.db,'a')
  expect(signals.kundinflode?.any_lead_verified).toBe(verified)
  for(const call of [...a.calls,...b.calls]) expect(call.filters,call.table).toContainEqual(['business_id','a'])
})

for(const table of ['email_inbound_route','leads','business_config']) test(`okänt underlag ger ingen gissad prioritering vid ${table}-fel`, async()=>{
  await expect(hamtaKomIgangSignals(database(table).db,'a')).rejects.toThrow()
})
