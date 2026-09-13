const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
let authenticated = true, role = 'owner', actorBusiness = 'firm-a', failWrite = false, writes = []
let fixture = {}, reads = []
const db = { from(table) {
  const filters = []
  const chain = new Proxy({}, { get(_, key) {
    if (key === 'then') return resolve => {
      reads.push({ table, filters })
      assert(filters.some(([key, args]) => key === 'eq' && args[0] === 'business_id' && args[1] === 'firm-a'))
      const r = fixture[table] || { data: [], error: null, count: 0 }
      return Promise.resolve(structuredClone(r)).then(resolve)
    }
    return (...args) => { filters.push([key, args]); return chain }
  } })
  return chain
} }
const cache = {}
class AuthError extends Error { constructor(message, status) { super(message); this.status = status } }
function load(file) {
  file = path.resolve(file); if (cache[file]) return cache[file]
  const mod = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Date, console, Buffer, require(name) {
    if (name === 'next/server') return { NextResponse: Response }
    if (name === '@/lib/supabase') return { getServerSupabase: () => db }
    if (name === '@/lib/auth') return { getAuthenticatedBusiness: async () => authenticated ? { business_id: 'firm-a' } : null }
    if (name === '@/lib/permissions') return { AuthError, getCurrentUser: async () => ({ role, business_id: actorBusiness }), isOwnerOrAdmin: u => ['owner','admin'].includes(u.role) }
    if (name === '@/lib/business-preferences') return { setBusinessPreference: async (...args) => { if (failWrite) return false; writes.push(args); const prefs = fixture.business_preferences.data; const old = prefs.find(p => p.key === args[1]); if (old) old.value = args[2]; else prefs.push({ key: args[1], value: args[2] }); return true } }
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts')
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.ts'))
    return require(name)
  } })
  cache[file] = mod.exports; return mod.exports
}
const core = load('lib/onboarding/planning-start.ts')
const reader = load('lib/onboarding/planning-start-data.ts')
const route = load('app/api/onboarding/planning-start/route.ts')
const reset = () => { writes = []; reads = []; authenticated = true; role = 'owner'; actorBusiness = 'firm-a'; failWrite = false;
 fixture = { business_users: { data: [{ id: 'owner' }], count: 1 }, business_preferences: { data: [] }, booking: { data: [], count: 0 }, schedule_entry: { data: [], count: 0 } } }
const read = async () => (await route.GET({})).json()
const post = body => route.POST({ json: async () => body })
;(async () => {
  assert.equal(core.nextPlanningWeek(new Date('2026-09-13T21:00:00Z')).weekStart, '2026-09-14')
  assert.equal(core.nextPlanningWeek(new Date('2026-09-13T22:30:00Z')).weekStart, '2026-09-21')
  assert.equal(core.nextPlanningWeek(new Date('2026-10-25T01:30:00Z')).weekStart, '2026-10-26')
  assert.equal(core.readStartReceipt('{'), null)
  reset(); let view = await read(); assert.equal(view.teamConfirmed, false); assert.equal(view.calendarStarted, false)
  assert.equal((await post({ action: 'calendar', revision: view.revision, weekStart: view.weekStart })).status, 409)
  assert.equal((await post({ action: 'solo', revision: view.revision, businessId: 'firm-b' })).status, 200)
  assert.equal(writes[0][0], 'firm-a'); view = await read(); assert.equal(view.teamConfirmed, true)
  assert.equal(view.calendarStarted, false) // a team, an empty calendar or one job is not complete
  assert.equal((await post({ action: 'calendar', revision: view.revision, weekStart: '2000-01-03' })).status, 409)
  const body = { action: 'calendar', revision: view.revision, weekStart: view.weekStart }
  assert.equal((await post(body)).status, 200); assert.equal((await post(body)).status, 200)
  assert.equal((await read()).calendarStarted, true); assert.equal(fixture.business_preferences.data.length, 2)
  fixture.business_users = { data: [{ id: 'owner' }, { id: 'invited' }], count: 2 }
  view = await read(); assert.equal(view.teamConfirmed, false); assert.equal(view.calendarStarted, false)
  assert.equal((await post({ action: 'solo', revision: view.revision })).status, 409)
  assert.equal((await post({ action: 'team', revision: view.revision })).status, 200)
  assert.equal((await read()).teamConfirmed, true) // no accepted_at requirement
  view = await read(); fixture.booking = { data: [{ booking_id: 'b', assigned_user_id: null, scheduled_start: view.weekStart, scheduled_end: null, status: 'confirmed' }], count: 1 }
  assert.equal((await post({ action: 'calendar', revision: view.revision, weekStart: view.weekStart })).status, 409)
  view = await read(); assert.equal(view.unresolvedCount, 1)
  assert.equal((await post({ action: 'calendar', revision: view.revision, weekStart: view.weekStart })).status, 409)
  for (const table of ['business_users','business_preferences','booking','schedule_entry']) {
    reset(); fixture[table].error = { message: 'read failure' }; assert.equal((await route.GET({})).status, 500); assert.equal(writes.length, 0)
  }
  reset(); fixture.booking.count = 1001; assert.equal((await route.GET({})).status, 500)
  reset(); view = await read(); failWrite = true; assert.equal((await post({ action: 'solo', revision: view.revision })).status, 500); assert.equal((await read()).teamConfirmed, false)
  for (const badRole of ['employee','project_manager']) { reset(); role = badRole; assert.equal((await route.GET({})).status, 403); assert.equal((await post({})).status, 403); assert.equal(reads.length, 0) }
  reset(); actorBusiness = 'firm-b'; assert.equal((await route.GET({})).status, 403)
  reset(); authenticated = false; assert.equal((await route.GET({})).status, 401); assert.equal((await post({})).status, 401)
  reset(); assert.equal((await post({ action: 'oops' })).status, 400)
  console.log('PASS planning start: actual reader/routes, tenant and role guards, unknown and truncated data, pending invitations, explicit empty week, calendar prerequisites, stale revisions, retries, failed saves, Stockholm week/DST.')
})().catch(e => { console.error(e); process.exitCode = 1 })
