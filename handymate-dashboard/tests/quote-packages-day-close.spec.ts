import { test, expect } from '@playwright/test'
import type { QuoteItem } from '../lib/types/quote'
import { applyPackage, comparePackage } from '../lib/quotes/package-comparison'
import { calculateQuoteTotals, recalculateItems } from '../lib/quote-calculations'
import { readReportConfirmation, confirmedReportResult } from '../lib/matte/day-close-client'
const row = (id: string, more: Partial<QuoteItem> = {}): QuoteItem => ({ id, item_type:'item', description:id, quantity:2, unit:'st', unit_price:1000, total:2000, cost_price:500, is_rot_eligible:false, is_rut_eligible:false, sort_order:0, ...more })
const items = [row('base'),row('a',{item_type:'option',option_selected:false}),row('b',{item_type:'option',option_selected:true}),row('hidden',{item_type:'option',is_hidden:true,option_selected:true})]
for (const level of ['base','recommended','extended'] as const) test(`package ${level} uses canonical discount/VAT totals without mutating input`, () => {
  const before=JSON.stringify(items)
  const result=comparePackage(items,level,['a'],10,25)
  const canonical=calculateQuoteTotals(recalculateItems(applyPackage(items,level,['a'])),10,25)
  expect(result.total).toBe(canonical.total)
  expect(result.beforeVat).toBe(canonical.afterDiscount)
  expect(result.contribution).toBe(Math.round(canonical.afterDiscount-result.rows.filter(r=>r.item_type==='item'||r.option_selected).reduce((sum,r)=>sum+r.cost_price!*r.quantity,0)))
  expect(JSON.stringify(items)).toBe(before)
  expect(result.rows.find(r=>r.id==='hidden')?.option_selected).toBe(true)
  for(const r of result.rows.filter(r=>r.item_type==='option'&&!r.is_hidden)) expect(r.option_default).toBe(r.option_selected)
})
test('missing costs never become zero or a partial profit claim',()=>{
  expect(comparePackage([row('x',{cost_price:undefined})],'base',[],0,25).contribution).toBeNull()
  expect(comparePackage([row('x',{cost_price:0})],'base',[],0,25).contribution).toBe(2000)
})
test('unknown option IDs cannot affect regular rows and removed options cannot be resurrected',()=>{
  const result=applyPackage(items,'recommended',['base','removed'])
  expect(result).toHaveLength(items.length)
  expect(result[0]).toEqual(items[0])
  expect(result.find(r=>r.id==='a')?.option_selected).toBe(false)
})
for(const more of [{unit_price:NaN},{quantity:0},{unit_price:-1},{unit_price:0,ai_price_missing:true}]) test(`unpriced/invalid package blocked: ${JSON.stringify(more)}`,()=>expect(comparePackage([row('x',more)],'base',[],0,25).valid).toBe(false))
test('explicit positive price resolves an originally unpriced AI row',()=>expect(comparePackage([row('x',{ai_price_missing:true})],'base',[],0,25).valid).toBe(true))
const pending={token:'signed',tool_name:'log_time',args:{project_id:'p',work_date:'2026-09-05'},summary:'3 timmar',confirm_label:'Lägg till tiden'}
test('only scoped report confirmations are accepted',()=>{
  expect(readReportConfirmation(pending,'p','2026-09-05')).toEqual(pending)
  for(const v of [{...pending,tool_name:'send_sms'},{...pending,args:{...pending.args,project_id:'other'}},{...pending,args:{...pending.args,work_date:'2026-09-04'}},{...pending,token:''}]) expect(()=>readReportConfirmation(v,'p','2026-09-05')).toThrow()
})
test('prose, success without execution receipt and failed actions never mark anything saved',()=>{
  const p=readReportConfirmation(pending,'p','2026-09-05')!
  for(const v of [{reply:'Sparat!'}, {confirmed:true}, {confirmed:false,execution_result:{tool:'log_time',status:'saved'}}, {confirmed:true,execution_result:{tool:'log_material',status:'saved'}}]) expect(confirmedReportResult(v,p)).toBeNull()
  for(const status of ['saved','already_saved']) expect(confirmedReportResult({confirmed:true,execution_result:{tool:'log_time',status}},p)).toBe(status)
})
