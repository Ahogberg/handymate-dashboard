import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'
import { queueGroup, recoveryResponseCases, selectQueue } from '../lib/value/revenue-work-queue'
import { recoveryRow } from './revenue-work-queue.fixture'
import type { RevenueRecoveryPhase } from '../lib/value/revenue-recovery-case'

test('queue retains all phases and old payments while home stays at three', () => {
  const phases: RevenueRecoveryPhase[] = ['needs_review','needs_ata_send','awaiting_customer','awaiting_delivery','ready_to_invoice','invoice_draft','awaiting_payment','paid','failed','declined','dismissed','unknown']
  const rows = phases.map(phase => recoveryRow(phase))
  expect(recoveryResponseCases(rows, 'queue', Date.now())).toHaveLength(12)
  expect(recoveryResponseCases(rows, null, Date.now())).toHaveLength(3)
  expect(recoveryResponseCases(rows, 'unexpected', Date.now())).toHaveLength(3)
  expect(queueGroup('unknown')).toBe('control')
  expect(queueGroup('failed')).toBe('control')
  expect(queueGroup('awaiting_payment')).toBe('waiting')
  expect(queueGroup('paid')).toBe('closed')
})
test('invoice work first, oldest within phase, no mutation or amount-based ranking', () => {
  const rows = [recoveryRow('needs_review'), {...recoveryRow('invoice_draft'),created_at:'2026-02-01'}, recoveryRow('ready_to_invoice'), {...recoveryRow('invoice_draft','older'), identified_kr:null}]
  expect(selectQueue(rows,'action').map(row => row.case_id)).toEqual(['ready_to_invoice','older','invoice_draft','needs_review'])
  expect(rows[0].case_id).toBe('needs_review')
})
test('search handles Swedish casing, invoice numbers, absent projects and empty matches', () => {
  expect(selectQueue([recoveryRow('needs_review')],'action',' ÅKERVÄGEN ')).toHaveLength(1)
  expect(selectQueue([recoveryRow('needs_review')],'action','1042')).toHaveLength(1)
  expect(selectQueue([recoveryRow('needs_review')],'waiting','1042')).toHaveLength(0)
  expect(selectQueue([{...recoveryRow('unknown'),project_name:null,invoice_number:null}],'control')).toHaveLength(1)
  expect(selectQueue([recoveryRow('needs_review')],'action','saknas')).toHaveLength(0)
})

function route(authenticated: boolean, owner: boolean, fail = false) {
  let reads = 0
  const code = ts.transpileModule(readFileSync('app/api/revenue-recovery-cases/route.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
  const dependencies: Record<string,unknown> = {
    'next/server': {NextResponse}, '@/lib/auth': {getAuthenticatedBusiness:async()=>authenticated ? {business_id:'tenant-a'} : null},
    '@/lib/permissions': {getCurrentUser:async()=>({role:owner?'owner':'employee'}),isOwnerOrAdmin:()=>owner},
    '@/lib/supabase': {getServerSupabase:()=>({})},
    '@/lib/value/load-revenue-recovery-cases': {loadRevenueRecoveryCases:async(_:unknown,businessId:string)=>{reads++; expect(businessId).toBe('tenant-a'); if(fail) throw new Error('read failed'); return Array.from({length:5},()=>recoveryRow('needs_review'))}},
    '@/lib/value/revenue-work-queue': {recoveryResponseCases},
  }
  const module = {exports:{} as {GET:(req:NextRequest)=>Promise<Response>}}
  new Function('require','module','exports',code)((name:string)=>{if(!(name in dependencies))throw new Error(name);return dependencies[name]},module,module.exports)
  return {get:module.exports.GET,reads:()=>reads}
}
test('real GET handler preserves tenant/role gates and default response',async()=>{
  for(const [authenticated,owner,status] of [[false,false,401],[true,false,403]] as const) {
    const r=route(authenticated,owner); expect((await r.get(new NextRequest('https://test/api/revenue-recovery-cases?view=queue'))).status).toBe(status); expect(r.reads()).toBe(0)
  }
  const r=route(true,true)
  expect((await (await r.get(new NextRequest('https://test/api/revenue-recovery-cases?view=queue'))).json()).cases).toHaveLength(5)
  expect((await (await r.get(new NextRequest('https://test/api/revenue-recovery-cases'))).json()).cases).toHaveLength(3)
})
test('read failure remains a 500 rather than an empty successful queue',async()=>{
  const r=route(true,true,true)
  const response=await r.get(new NextRequest('https://test/api/revenue-recovery-cases?view=queue'))
  expect(response.status).toBe(500)
  expect(await response.json()).not.toHaveProperty('cases')
})
