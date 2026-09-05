import {test,expect} from '@playwright/test'
import {recoveryKey,readRecovery} from '../lib/quotes/draft-recovery'
import {readFileSync} from 'fs'
test('recovery is isolated by user, company and quote source',()=>{
  const key=recoveryKey('u','b','deal=1')
  expect(key).not.toBe(recoveryKey('u2','b','deal=1'))
  expect(key).not.toBe(recoveryKey('u','b2','deal=1'))
  expect(key).not.toBe(recoveryKey('u','b','deal=2'))
})
test('copy keeps product snapshots, reservations and payment plan without transformations',()=>{
  const value={items:[{linked_product_id:'p',component_snapshot:{hours:2},save_to_products:false}],context:{reservationsSnapshot:[{id:'r',text:'Underlag kontrolleras'}],paymentPlan:[{percent:50}],personnummer:'test'}}
  expect(readRecovery(JSON.stringify({version:1,savedAt:100,value}),101)?.value).toEqual(value)
  expect(readRecovery(null)).toBeNull()
  expect(()=>readRecovery('broken')).toThrow()
  expect(()=>readRecovery(JSON.stringify({version:2,savedAt:100,value}),101)).toThrow()
  expect(()=>readRecovery(JSON.stringify({version:1,savedAt:100,value}),100+86400001)).toThrow()
})
test('register writes require explicit selection and generated prices are not preselected',()=>{
  const save=readFileSync('app/dashboard/quotes/_shared/useQuoteBuilderSave.ts','utf8')
  expect(save.match(/i.save_to_products === true/g)).toHaveLength(2)
  expect(save).not.toContain('i.save_to_products !== false')
  expect(readFileSync('lib/quotes/generated-to-quote-items.ts','utf8')).toContain('save_to_products: false')
})
