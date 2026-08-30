import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import ts from 'typescript'
import { NextRequest } from 'next/server'
import { deriveCallOutcome } from '../lib/voice/call-outcome'

// Execute actual handlers against explicit boundary doubles. No network, no credentials.
function loadRoute(file: string, mocks: Record<string, any>) {
  const code = ts.transpileModule(readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const exports: Record<string, any> = {}
  new Function('require','exports',code)((id: string) => mocks[id] ?? require(id), exports)
  return exports
}
function callsRoute(role: string | null, responses: Record<string, any[]> = {}) {
  const operations: any[] = []
  const db = { from(table: string) {
    const response = responses[table]?.shift() ?? { data: [], error:null }
    const q: any = { then: (resolve: any) => Promise.resolve(response).then(resolve) }
    for (const method of ['select','eq','is','contains','order','limit','maybeSingle','update']) q[method] = (...args: any[]) => { operations.push([table,method,...args]); return q }
    return q
  } }
  const api = loadRoute('app/api/voice/calls/route.ts', {
    '@/lib/auth': { getAuthenticatedBusiness: async () => role ? { business_id:'biz_a' } : null },
    '@/lib/permissions': { getCurrentUser: async () => ({ role }), isOwnerOrAdmin: (u: any) => ['owner','admin'].includes(u.role) },
    '@/lib/supabase': { getServerSupabase: () => db },
    '@/lib/approvals/routing': { canActOnApproval: async () => true },
    '@/lib/voice/call-outcome': { deriveCallOutcome },
  })
  return { api,operations }
}
test('call detail denies anonymous and employee before database access', async () => {
  for (const role of [null,'employee']) {
    const { api,operations } = callsRoute(role)
    expect((await api.GET(new NextRequest('https://test/api/voice/calls?recording_id=r'))).status).toBe(role ? 403 : 401)
    expect(operations).toEqual([])
  }
})
test('detail filters tenant and never returns provider URL, transcript or lock token', async () => {
  const { api,operations } = callsRoute('owner', { call_recording:[{ data:[{ recording_id:'r',source:'phone',recording_url:'secret',transcript:'secret',call_processing:{token:'secret',phase:'complete'} }],error:null }],pending_approvals:[{data:[],error:null}] })
  const response = await api.GET(new NextRequest('https://test/api/voice/calls?recording_id=r'))
  expect(response.status).toBe(200); expect(await response.text()).not.toContain('secret')
  expect(operations).toContainEqual(['call_recording','eq','business_id','biz_a'])
  expect(operations).toContainEqual(['pending_approvals','eq','business_id','biz_a'])
})
test('query failure is visible, not empty success', async () => {
  const { api } = callsRoute('owner',{ call_recording:[{data:null,error:{code:'42703'}}] })
  expect((await api.GET(new NextRequest('https://test/api/voice/calls'))).status).toBe(503)
})
test('project from another customer or tenant cannot be linked', async () => {
  const { api,operations } = callsRoute('owner', { call_recording:[{data:{recording_id:'r',customer_id:'c'},error:null}],project:[{data:null,error:null}] })
  const response = await api.PATCH(new NextRequest('https://test/api/voice/calls',{ method:'PATCH', body:JSON.stringify({recording_id:'r',project_id:'foreign',business_id:'evil'}) }))
  expect(response.status).toBe(404)
  expect(operations).toContainEqual(['project','eq','business_id','biz_a'])
  expect(operations).toContainEqual(['project','eq','customer_id','c'])
  expect(operations.some(x=>x[1]==='update')).toBe(false)
})
test('notice failure forwards without recording; successful playback records', async () => {
  const business = { business_id:'b',personal_phone:'+46701',assigned_phone_number:'+46702',call_recording_enabled:true }
  const db = {from: () => {const q:any={select:()=>q,eq:()=>q,single:async()=>({data:business,error:null})};return q}}
  const api = loadRoute('app/api/voice/consent/route.ts',{
    '@/lib/supabase':{getServerSupabase:()=>db}, '@/lib/elks-signature':{verifyElksSignature:()=>true},
    '@/lib/voice/retention':{recordingNoticeUrl:()=> 'https://test/notice.mp3'},
  })
  for (const result of ['failed','ok']) {
    const response = await api.POST(new NextRequest('https://test/api/voice/consent?step=connect',{method:'POST',body:`to=%2B46702&result=${result}`}))
    const data = await response.json()
    expect(data.connect).toBe('+46701'); expect(!!data.recordcall).toBe(result==='ok')
  }
})

test('transcript edit cannot rewrite expired or already analyzed evidence', async () => {
  const operations: any[] = []
  const q: any = { then: (resolve: any) => Promise.resolve({data:null,error:null}).then(resolve) }
  for (const method of ['update','eq','is','select','maybeSingle']) q[method] = (...args: any[]) => { operations.push([method,...args]); return q }
  const api = loadRoute('app/api/recordings/route.ts', {
    '@/lib/auth': {getAuthenticatedBusiness:async()=>({business_id:'biz_a'})},
    '@/lib/permissions': {getCurrentUser:async()=>({role:'owner'}),isOwnerOrAdmin:()=>true},
    '@/lib/supabase': {getServerSupabase:()=>({from:()=>q})},
  })
  const response = await api.PATCH(new NextRequest('https://test/api/recordings', {method:'PATCH',body:JSON.stringify({recording_id:'r',transcript:'Changed'})}))
  expect(response.status).toBe(409)
  expect(operations).toContainEqual(['eq','business_id','biz_a'])
  expect(operations).toContainEqual(['is','raw_deleted_at',null])
  expect(operations).toContainEqual(['eq','call_processing','{}'])
})

test('legacy delete verifies ownership and preserves phone tombstones', async () => {
  for (const data of [null,{recording_id:'r',source:'phone'}]) {
    let deletion = false
    const q:any = {select:()=>q,eq:()=>q,maybeSingle:async()=>({data,error:null}),delete:()=>{deletion=true;return q}}
    const api = loadRoute('app/api/recordings/route.ts', {
      '@/lib/auth': {getAuthenticatedBusiness:async()=>({business_id:'biz_a'})},
      '@/lib/permissions': {getCurrentUser:async()=>({role:'owner'}),isOwnerOrAdmin:()=>true},
      '@/lib/supabase': {getServerSupabase:()=>({from:()=>q})},
    })
    const response = await api.DELETE(new NextRequest('https://test/api/recordings?recording_id=r',{method:'DELETE'}))
    expect(response.status).toBe(data ? 409 : 404)
    expect(deletion).toBe(false)
  }
})
