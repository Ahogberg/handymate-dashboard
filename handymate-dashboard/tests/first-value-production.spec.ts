import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { createHash } from 'crypto'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'
import * as sample from '../lib/onboarding/work-sample'
import * as visits from '../lib/quotes/visit-rule'
import { quoteFollowupStep } from '../lib/quotes/followup-cadence'
import * as handoff from '../lib/quotes/handoff'
import * as followupRound from '../lib/quotes/followup-round'

const prepared = { version: 1, source: 'Byt sex innerdörrar.', title: 'Byte av dörrar', description: 'Montering och bortforsling.', createdAt: '2026-09-08T10:00:00Z', items: [{ description: 'Montera dörrar', quantity: 6, unit: 'st', type: 'labor' }] }
const rule: visits.VisitRule = { version: 1, kind: 'planned_visits', visits: 2, jobType: 'dorrar' }
const input: handoff.HandoffInput = { quote: { status: 'sent', sent_at: '2026-09-01T10:00:00Z', valid_until: '2026-10-01', follow_up_count: 0 },
  paused: false, teamActive: true, hasPhone: true, hasEmail: true, rules: [], logs: [], pendingId: null, intervalDays: 5, today: '2026-09-08', now: Date.parse('2026-09-08T10:00:00Z') }
const followRule: handoff.HandoffRule = { id: 'r', name: 'Uppföljning', trigger_config: { field: 'days_since_sent', value: 5 }, action_type: 'send_sms', last_run_at: '2026-09-07T10:00:00Z', last_run_status: 'success' }

test('arbetsprovet tar bara med omfattning; pris, avdrag och främmande länkar faller bort', () => {
  const safe = sample.readWorkSample({ ...prepared, customerId: 'foreign', total: 8000, items: [{ ...prepared.items[0], unitPrice: 900, linked_product_id: 'foreign' }] })!
  expect(safe).toEqual(prepared)
  expect(sample.workSampleDraft(safe)).toMatchObject({ suggestedDeductionType: 'none', items: [{ quantity: 6, unitPrice: 0, confidence: 0 }] })
  expect(sample.readWorkSample({ ...prepared, items: [{ ...prepared.items[0], quantity: -1 }] })).toBeNull()
  expect(sample.readWorkSample({ ...prepared, items: [null] })).toBeNull()
  expect(sample.readWorkSample({ ...prepared, createdAt: 'invalid' })).toBeNull()
})
test('besöksregel bevarar villkor och uppdaterar sin egen rad utan dubletter', () => {
  const before = 'Arbete 10 timmar.\nPris enligt överenskommelse.\nPlanerade besök: 9.\nKunden står för dörrar.'
  const after = visits.applyVisitRule(before, 2)
  expect(after).toContain('Arbete 10 timmar.\nPris enligt överenskommelse.')
  expect(after).toContain('Kunden står för dörrar.')
  expect(after.match(/Planerade besök:/g)).toHaveLength(1)
  expect(visits.applyVisitRule(after, 2)).toBe(after)
  for (const bad of [0, -1, 1.5, 21, Infinity]) expect(visits.readVisitRule({ ...rule, visits: bad })).toBeNull()
})
test('samma klocka styr SMS, mejl och slut på omgångar', () => {
  const sent = input.quote.sent_at!
  expect(quoteFollowupStep(sent, 0, 5, Date.parse(sent) + 5 * 86400000 - 1)?.due).toBe(false)
  expect(quoteFollowupStep(sent, 0, 5, Date.parse(sent) + 5 * 86400000)).toMatchObject({ due: true, channel: 'sms' })
  expect(quoteFollowupStep(sent, 1, 5)?.channel).toBe('email')
  expect(quoteFollowupStep(sent, 2, 5)?.channel).toBe('sms')
  expect(quoteFollowupStep(sent, 3, 5)).toBeNull()
  expect(quoteFollowupStep('invalid', 0, 5)).toBeNull()
  expect(quoteFollowupStep(sent, 0, 1e100)).toBeNull()
})
for (const [label, change, state] of [
  ['pausat', { paused: true }, 'paused'], ['inaktivt', { teamActive: false }, 'paused'],
  ['saknar SMS-kontakt', { hasPhone: false }, 'attention'], ['saknar giltighet', { quote: { ...input.quote, valid_until: null } }, 'attention'],
  ['utkast', { quote: { ...input.quote, status: 'draft' } }, 'draft'], ['accepterat', { quote: { ...input.quote, status: 'accepted' } }, 'closed'],
  ['avböjt', { quote: { ...input.quote, status: 'declined' } }, 'closed'], ['utgånget', { quote: { ...input.quote, valid_until: '2026-08-01' } }, 'closed'],
  ['väntande beslut', { pendingId: 'approval' }, 'decision'], ['ofullständig historik', { historyIncomplete: true }, 'attention'],
] as const) test(`överlämningen lovar rätt sak: ${label}`, () => {
  expect(handoff.deriveQuoteHandoff({ ...input, ...change }).state).toBe(state)
})
test('regelns körning för annan offert räknas aldrig som bevis och alla tidigare utfall förbrukar regeln', () => {
  expect(handoff.deriveQuoteHandoff({ ...input, rules: [followRule] })).toMatchObject({ state: 'configured', eligibleAt: '2026-09-06T10:00:00.000Z' })
  expect(handoff.deriveQuoteHandoff({ ...input, rules: [followRule] }).lastRunAt).toBeUndefined()
  for (const status of ['success', 'pending_approval', 'skipped', 'failed']) expect(handoff.deriveQuoteHandoff({ ...input, rules: [followRule], logs: [{ rule_id: 'r', status, created_at: '2026-09-07' }] }).state).toBe('attention')
  expect(handoff.deriveQuoteHandoff({ ...input, rules: [{ ...followRule, action_type: 'notify_owner' }] }).state).toBe('attention')
})

test('verkliga regelhämtaren isolerar företag och jobbtyp även när besöksregeln är äldre än fem andra regler', async () => {
  const code = readFileSync('lib/ai-quote-generator.ts', 'utf8')
  const ast = ts.createSourceFile('generator.ts', code, ts.ScriptTarget.Latest, true)
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'fetchBusinessRules')!
  const executable = ts.transpileModule(fn.getText(ast), { compilerOptions:{target:ts.ScriptTarget.ES2020} }).outputText
  const rows = [
    {business_id:'firm-a',job_type:null,observation:'Global policy',knowledge_type:'business_rule',dismissed_at:null,created_at:'2026-09-01'},
    {business_id:'firm-b',job_type:'dorrar',observation:'Annan firmas regel',knowledge_type:'business_rule',dismissed_at:null,created_at:'2026-09-09',data_basis:{...rule,visits:8}},
    {business_id:'firm-a',job_type:'tak',observation:'Takregel',knowledge_type:'business_rule',dismissed_at:null,created_at:'2026-09-09',data_basis:{...rule,jobType:'tak',visits:7}},
    ...Array.from({length:6},(_,i)=>({business_id:'firm-a',job_type:'dorrar',observation:`Ny regel ${i}`,knowledge_type:'business_rule',dismissed_at:null,created_at:'2026-09-08'})),
    {business_id:'firm-a',job_type:'dorrar',observation:'Två besök',knowledge_type:'business_rule',dismissed_at:null,created_at:'2026-08-01',data_basis:rule},
  ]
  const db = { from:()=>{
    let selected:Record<string,any>[]=[...rows]
    const chain:any={select:()=>chain,eq:(k:string,v:unknown)=>{selected=selected.filter(row=>row[k]===v);return chain},is:(k:string,v:unknown)=>{selected=selected.filter(row=>row[k]===v);return chain},contains:(k:string,v:Record<string,unknown>)=>{selected=selected.filter(row=>Object.entries(v).every(([key,value])=>row[k]?.[key]===value));return chain},order:()=>{selected.sort((a,b)=>b.created_at.localeCompare(a.created_at));return chain},limit:(n:number)=>{selected=selected.slice(0,n);return chain},then:(resolve:(r:unknown)=>void)=>resolve({data:selected,error:null})};return chain
  } }
  const fetchRules = new Function('getServerSupabase','readVisitRule','arSchemaSaknas','rapporteraTystFel', executable+'; return fetchBusinessRules;')(()=>db,visits.readVisitRule,()=>false,()=>{})
  const selected=await fetchRules('firm-a','dorrar')
  expect(selected.filter((r:any)=>r.visitRule)).toEqual([{observation:'Två besök',visitRule:rule}])
  expect(selected.some((r:any)=>/Annan firmas|Takregel/.test(r.observation))).toBe(false)
  expect(await fetchRules('firm-a')).toEqual([{observation:'Global policy'}])
})

function route(file: string, extra: Record<string, unknown>) {
  const exports: Record<string, any> = {}
  const modules: Record<string, unknown> = { 'next/server': { NextResponse }, crypto: { createHash },
    '@/lib/quotes/visit-rule': visits, '@/lib/onboarding/work-sample': sample, '@/lib/quotes/handoff': handoff,
    '@/lib/quotes/followup-round': followupRound,
    '@/lib/billing/aktiva-konton': { harAktivtTeam: () => true }, '@/lib/dates': { svDateStr: () => '2026-09-08' }, ...extra }
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('require', 'exports', code)((name: string) => { if (!(name in modules)) throw new Error(`Unexpected dependency ${name}`); return modules[name] }, exports)
  return exports
}
function fixtures(options: { signedIn?: boolean; admin?: boolean; denied?: boolean; fail?: string; noQuote?: boolean; noJob?: boolean } = {}) {
  const calls: Array<{ table: string; filters: Array<[string, unknown]>; write?: unknown }> = []
  let generated = 0
  const db = { from(table: string) {
    let singleton = false
    const call = { table, filters: [] as Array<[string, unknown]>, write: undefined as unknown }; calls.push(call)
    const rows: Record<string, unknown> = { quotes: options.noQuote ? null : { ...input.quote, quote_id: 'q', customer_id: 'c' }, business_config: { business_id: 'firm-a' },
      job_types: options.noJob ? null : { slug: 'dorrar', name: 'Dörrar' }, business_knowledge: { id: 'id', data_basis: rule }, v3_automation_rules: [], pending_approvals: [], v3_automation_logs: [], customer: { phone_number: 'test' }, v3_automation_settings: { quote_followup_days: 5 } }
    const chain: any = { select: () => chain, eq: (key: string, value: unknown) => { call.filters.push([key,value]); return chain },
      is: (key: string, value: unknown) => { call.filters.push([key,value]); return chain }, contains: (key: string,value: unknown) => { call.filters.push([key,value]); return chain },
      order: () => chain, limit: () => chain, maybeSingle: () => { singleton = true; return chain }, single: () => { singleton = true; return chain }, upsert: (value: unknown) => { call.write = value; return chain },
      then: (resolve: (r: unknown) => void) => { const value = rows[table]; return resolve({ data: singleton && Array.isArray(value) ? (value[0] || null) : value, error: options.fail === table ? { message: 'unavailable' } : null }) } }
    return chain
  } }
  const modules = { '@/lib/auth': { getAuthenticatedBusiness: async () => options.signedIn === false ? null : { business_id: 'firm-a' } },
    '@/lib/permissions': { getCurrentUser: async () => ({}), isOwnerOrAdmin: () => options.admin !== false }, '@/lib/supabase': { getServerSupabase: () => db },
    '@/lib/rate-limit-db': { checkPublicRateLimitDb: async () => ({ allowed: !options.denied }) },
    '@/lib/branch': { resolveBusinessBranch: () => 'Snickeri', describeBranches: (v: unknown) => v },
    '@/lib/ai-quote-generator': { generateQuoteFromInput: async () => { generated++; return { jobTitle: prepared.title, jobDescription: prepared.description, items: prepared.items } } } }
  return { calls, modules, generated: () => generated }
}
const request = (path: string, body?: unknown) => new NextRequest(`https://unit.test${path}`, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) })
test('arbetsprov: avslag före AI, inget abonnemang ändras, tillåten begäran returnerar underlag', async () => {
  const old = process.env.ANTHROPIC_API_KEY; process.env.ANTHROPIC_API_KEY = 'unit-fixture'
  try {
    for (const [options, expected] of [[{ signedIn:false },401],[{ admin:false },403],[{ denied:true },429],[{},200]] as const) {
      const f = fixtures(options); const api = route('app/api/onboarding/work-sample/route.ts', f.modules)
      const result = await api.POST(request('/api/onboarding/work-sample', { source: prepared.source }))
      expect(result.status).toBe(expected); expect(f.generated()).toBe(expected === 200 ? 1 : 0); expect(f.calls).toHaveLength(0)
    }
  } finally { if (old === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = old }
})
test('regel: behörighet, aktiv jobbtyp, databasfel och stabil identitet vid retry', async () => {
  for (const [options, expected] of [[{ admin:false },403],[{ noJob:true },400],[{ fail:'job_types' },503],[{ fail:'business_knowledge' },503],[{},200]] as const) {
    const f = fixtures(options); const api = route('app/api/quotes/visit-rule/route.ts', f.modules)
    expect((await api.POST(request('/api/quotes/visit-rule', rule))).status).toBe(expected)
    if (expected !== 403) expect(f.calls[0].filters).toEqual(expect.arrayContaining([['business_id','firm-a'],['slug','dorrar'],['is_active',true]]))
    if (expected === 200) {
      await api.POST(request('/api/quotes/visit-rule', rule))
      const writes = f.calls.filter(c => c.write).map(c => c.write)
      expect(writes[0]).toEqual(writes[1]); expect(writes[0]).toMatchObject({ business_id:'firm-a', job_type:'dorrar', data_basis:rule })
    }
  }
})
test('överlämning: företagsgräns på varje läsning och inget positivt kvitto vid delfel', async () => {
  for (const [options, expected] of [[{ signedIn:false },401],[{ admin:false },403],[{ noQuote:true },404],[{ fail:'v3_automation_logs' },503],[{ fail:'pending_approvals' },503],[{},200]] as const) {
    const f = fixtures(options); const api = route('app/api/quotes/[id]/handoff/route.ts', f.modules)
    const response = await api.GET(request('/api/quotes/q/handoff'), { params:{ id:'q' } })
    expect(response.status).toBe(expected)
    expect(f.calls.every(c => c.filters.some(([key,value]) => key === 'business_id' && value === 'firm-a'))).toBe(true)
    if (expected === 503) expect(await response.json()).not.toHaveProperty('summary')
    expect(f.calls.every(c => c.write === undefined)).toBe(true)
  }
})
