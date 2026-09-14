import { test, expect } from '@playwright/test'
import { NextRequest } from 'next/server'
import { c5Modules } from './helpers/c5-module'
import { readFileSync } from 'fs'
function harness(admin = true, failure = '') {
  const calls: { name: string; args: any }[] = []
  const auth = { getUser: async () => ({ data: { user: { id: 'verified-admin', app_metadata: { is_superadmin: admin } } }, error: null }) }
  const load = c5Modules({
    '@/lib/supabase': { getServerSupabase: () => ({ auth }) }, 'next/headers': { cookies: () => ({}) },
    '@supabase/auth-helpers-nextjs': { createRouteHandlerClient: () => ({ auth }) }, './admin-email': { isAdminEmail: () => false },
    '@/lib/financial-kernel/kernel-db': { kernelDb: () => ({ rpc: async (name: string, args: any) => {
      calls.push({ name, args }); return { error: failure ? { message: failure } : null, data: name === 'financial_kernel_phase' ? 'S1' : name === 'list_shadow_divergences' ? [] : { phase: 'S1', unsupported_levels: [2, 3, 4] } }
    } }) },
    '@/lib/financial-kernel/shadow/run': { runShadowForBusiness: async (business: string, options: any) => { calls.push({ name: 'run', args: { business, ...options } }); return { phase: 'S1', status: 'completed' } } },
  })
  return { calls, route: (part: string) => load(`app/api/admin/financial-kernel/${part}/route.ts`) }
}
const post = (body: unknown) => new NextRequest('https://test/admin', { method: 'POST', body: JSON.stringify(body) })
test('all four endpoints verify superadmin before data or comparisons', async () => {
  const h = harness(false)
  expect((await h.route('shadow').GET(new NextRequest('https://test/?business=a'))).status).toBe(403)
  for (const part of ['phase', 'shadow/run', 'shadow/[id]/resolve']) expect((await h.route(part).POST(post({ business: 'a' }), { params: { id: 'd' } })).status).toBe(403)
  expect(h.calls).toEqual([])
})
test('phase rejects S2 and short reasons and uses verified actor', async () => {
  const h = harness(), route = h.route('phase')
  for (const body of [{ phase: 'S2', reason: 'pilot' }, { phase: 'S1', reason: ' x ' }, { phase: 'S1' }, { phase: null, reason: 'pilot' }]) expect((await route.POST(post({ business: 'a', ...body }))).status).toBe(400)
  expect(h.calls).toEqual([])
  expect((await route.POST(post({ business: 'a', phase: 'S1', reason: ' Pilot approved ', actor: 'spoof' }))).status).toBe(200)
  expect(h.calls[0]).toEqual({ name: 'set_financial_kernel_phase', args: { p_business_id: 'a', p_phase: 'S1', p_reason: 'Pilot approved', p_actor: 'verified-admin' } })
})
test('resolution validates reason/type and scopes provenance to verified actor', async () => {
  const h = harness(), route = h.route('shadow/[id]/resolve'), context = { params: { id: 'divergence' } }
  for (const body of [{ type: 'fixed', reason: '  ' }, { type: 'fixed', reason: 'ab' }, { type: 'superseded_by_match', reason: 'manual' }]) expect((await route.POST(post({ business: 'b', ...body }), context)).status).toBe(400)
  expect(h.calls).toEqual([])
  const response = await route.POST(post({ business: 'b', type: 'fixed', reason: 'Checked source', actor: 'spoof', fix_reference: 'PR 1', root_cause_code: 'test' }), context)
  expect(response.status).toBe(200); expect((await response.json()).phase).toBe('S1')
  expect(h.calls[0].args).toEqual({ p_business_id: 'b', p_divergence_id: 'divergence', p_resolution_type: 'fixed', p_reason: 'Checked source', p_actor: 'verified-admin', p_fix_reference: 'PR 1', p_root_cause_code: 'test' })
})
test('status returns phase and unsupported levels and scopes both reads', async () => {
  const h = harness(), response = await h.route('shadow').GET(new NextRequest('https://test/?business=a'))
  expect(response.status).toBe(200); expect((await response.json()).status).toEqual({ phase: 'S1', unsupported_levels: [2, 3, 4] })
  expect(h.calls.map(c => c.args.p_business_id)).toEqual(['a', 'a'])
  expect((await h.route('shadow').GET(new NextRequest('https://test/'))).status).toBe(400)
})
test('manual run uses shared runner with finite budget', async () => {
  const h = harness(), before = Date.now()
  expect((await h.route('shadow/run').POST(post({ business: 'a', trigger: 'cron' }))).status).toBe(200)
  expect(h.calls[0].args).toMatchObject({ business: 'a', trigger: 'manual' })
  expect(h.calls[0].args.deadline).toBeGreaterThanOrEqual(before + 240_000)
  expect(h.calls[0].args.deadline).toBeLessThanOrEqual(Date.now() + 240_000)
})
for (const [failure, status] of [['financial_kernel_phase_reserved', 400], ['business_not_found', 404], ['financial_shadow_divergence_not_open', 409], ['financial_shadow_run_already_running', 409]] as const) test(`RPC ${failure} maps to ${status}`, async () => {
  const h = harness(true, failure)
  expect((await h.route('phase').POST(post({ business: 'a', phase: 'S1', reason: 'pilot' }))).status).toBe(status)
})
test('admin view carries phase and unsupported scope without readiness percentages', () => {
  const source = readFileSync('app/admin/components/FinancialKernelShadowSection.tsx', 'utf8')
  expect(source).toContain('Fas:'); expect(source).toContain('Ej stödd nivå 2–4'); expect(source).toContain('Bekräftad'); expect(source).toContain("'Ny'")
  expect(source).not.toMatch(/percentage|readiness|procent|%/i)
})

test('RPC-shaped divergence renders invoice and both evidence values; phase receipt retains owed obligations', async () => {
  const ts = require('typescript') as typeof import('typescript')
  const React = require('react') as typeof import('react')
  const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server')
  const source = readFileSync('app/admin/components/FinancialKernelShadowSection.tsx', 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const module = { exports: {} as Record<string, any> }
  new Function('require', 'module', 'exports', js)(require, module, module.exports)
  const row = { id: 'd', invoice_id: 'invoice-42', kind: 'ROUNDING_DIVERGENCE', severity: 'low', confirmed_at: null,
    expected: [{ total_minor: '12345' }], actual: [{ total_minor: '12344' }] }
  const html = renderToStaticMarkup(React.createElement(module.exports.DivergenceEvidence, { row }))
  expect(html).toContain('invoice-42'); expect(html).toContain('12345'); expect(html).toContain('12344')
  expect(html).toContain('Förväntat värde'); expect(html).toContain('Observerat värde')
  expect(module.exports.phaseReceipt(7)).toContain('7 redan utlovade utskick återstår')
  expect(module.exports.phaseReceipt(0)).toContain('0 redan utlovade utskick återstår')
})
