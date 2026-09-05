// Run with Node 24: node --test tests/customer-preparation/*.test.mjs
// Execute actual TS modules/routes, substituting only external dependencies.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import * as contract from '../../lib/customer-preparation/contract.ts'
import { readPreparationForm } from '../../lib/customer-preparation/body.ts'
function moduleAt(path, deps) {
  const code = stripTypeScriptTypes(readFileSync(new URL('../../' + path, import.meta.url), 'utf8'))
    .replace(/^import .* from ['"].*['"]\s*$/gm, '')
    .replace(/\bexport /g, '')
  return new Function(...Object.keys(deps), code + '\nreturn { GET: typeof GET === "undefined" ? null : GET, POST: typeof POST === "undefined" ? null : POST, PATCH: typeof PATCH === "undefined" ? null : PATCH, preparationOwner: typeof preparationOwner === "undefined" ? null : preparationOwner };')(...Object.values(deps))
}
const NextResponse = { json: (body, init) => Response.json(body, init) }
const answers = { location: 'Garage', route: 'Okänt', wishes: '' }
const initial = () => ({ id: 'req1', business_id: 'bizA', customer_id: 'custA', template: 'charging', context: 'Garage', due_date: null, status: 'open', expires_at: '2099-01-01', images: [] })
function harness({ row = initial(), owner = { business_id: 'bizA' }, fail = false } = {}) {
  const uploaded = [], removed = [], filters = []
  let inserts = 0
  const db = { storage: { from() { return {
    async upload(path) { uploaded.push(path); return { error: null } },
    async remove(paths) { removed.push(...paths); return { error: null } },
    async createSignedUrls(paths) { return { data: paths.map(path => ({ signedUrl: 'https://example.test/' + path })) } },
  } } }, from(table) {
    let patch, insert, qs = [], single = false
    const query = {
      select() { return query }, order() { return query }, limit() { return query },
      eq(k,v) { qs.push(['eq', k,v]); filters.push([table,k,v]); return query },
      gt(k,v) { qs.push(['gt',k,v]); return query },
      in(k,v) { qs.push(['in',k,v]); return query },
      update(value) { patch = value; return query },
      insert(value) { insert = value; return query },
      maybeSingle() { single = true; return query }, single() { single = true; return query },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if (fail) return { data: null, error: new Error('DB secret') }
        const matches = row && qs.every(([op,k,v]) => op === 'eq' ? row[k] === v : op === 'gt' ? row[k] > v : v.includes(row[k]))
        if (table === 'customer') return { data: matches ? { customer_id: row.customer_id } : null, error: null }
        if (insert) { inserts++; return { data: { id: 'new', token: 'secret' }, error: null } }
        if (!matches) return { data: single ? null : [], error: null }
        if (patch) Object.assign(row, patch)
        return { data: single ? { ...row } : [{ ...row }], error: null }
      }).then(resolve,reject) },
    }; return query
  } }
  const deps = { NextResponse, getServerSupabase: () => db, preparationOwner: async () => owner,
    findPublicPreparation: async () => row, checkPublicRateLimitDb: async () => ({ allowed: true }), BUCKET: 'customer-preparation',
    readPreparationForm, ...contract }
  return { row, uploaded, removed, filters, get inserts() { return inserts },
    public: moduleAt('app/api/preparation/[token]/route.ts', deps),
    owner: moduleAt('app/api/customer-preparation/route.ts', deps) }
}
function submit(value = answers, files = []) {
  const form = new FormData(); form.set('answers', JSON.stringify(value))
  for (const file of files) form.append('images', file)
  return new Request('https://example.test', { method: 'POST', body: form })
}
const params = { params: { token: 'token' } }
const json = body => new Request('https://example.test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
test('required/unknown/oversized/non-string answers rejected, unknown is valid explicit answer', () => {
  assert.deepEqual(contract.validateAnswers('charging', answers), answers)
  for (const value of [null, [], { ...answers, location: '' }, { ...answers, hidden: 'x' }, { ...answers, route: 42 }, { ...answers, route: 'x'.repeat(1501) }]) assert.throws(() => contract.validateAnswers('charging', value))
  assert.equal(contract.isTemplate('__proto__'), false)
  assert.equal(contract.isExpired('invalid'), true)
})
test('image file signature must match allowed MIME', () => {
  assert.equal(contract.imageExtension(new Uint8Array([255,216,255]), 'image/jpeg'), 'jpg')
  assert.equal(contract.imageExtension(new TextEncoder().encode('<svg/>'), 'image/jpeg'), null)
  assert.equal(contract.imageExtension(new Uint8Array([255,216,255]), 'image/svg+xml'), null)
})
test('unauthenticated owner cannot read, create or update', async () => {
  const h = harness({ owner: null })
  for (const action of ['GET','POST','PATCH']) assert.equal((await h.owner[action](json({}))).status, 403)
  assert.equal(h.filters.length, 0)
})
test('owner helper rejects employees, inactive lookup and impersonation', async () => {
  for (const [business, user, allowed] of [[{business_id:'A'}, {role:'owner'}, true], [{business_id:'A'}, {role:'employee'}, false], [{business_id:'A'}, null, false], [{business_id:'A',_impersonation:{}}, {role:'owner'}, false]]) {
    const server = moduleAt('lib/customer-preparation/server.ts', { getAuthenticatedBusiness: async () => business, getCurrentUser: async (_r,id) => { assert.equal(id, 'A'); return user }, getServerSupabase: () => ({}) })
    assert.equal(Boolean(await server.preparationOwner(json({}))), allowed)
  }
})
test('cross-business customer cannot be used when creating', async () => {
  const h = harness({ row: { ...initial(), business_id: 'bizB' } })
  assert.equal((await h.owner.POST(json({ customer_id:'custA', template:'charging',context:'Garage' }))).status,404)
  assert.equal(h.inserts,0)
})
test('invalid due dates rejected', async () => {
  const h=harness()
  assert.equal((await h.owner.POST(json({customer_id:'custA',template:'charging',context:'Garage',due_date:'2026-02-31'}))).status,400)
})
test('customer GET exposes only questions context and status, never owner data', async () => {
  const h=harness(); const r=await h.public.GET(null,params); const data=await r.json()
  assert.equal(r.headers.get('cache-control'),'private, no-store')
  assert.deepEqual(Object.keys(data).sort(),['context','due_date','status','template'])
})
test('expired/cancelled links reject both read and write', async () => {
  for (const row of [{...initial(),status:'cancelled'},{...initial(),expires_at:'2000-01-01'},null]) {
    const h=harness({row}); assert.equal((await h.public.GET(null,params)).status,404); assert.equal((await h.public.POST(submit(),params)).status,404)
  }
})
test('successful submission stores answers before success; subsequent submission cannot overwrite', async () => {
  const h=harness(); assert.equal((await h.public.POST(submit(),params)).status,200)
  assert.equal(h.row.status,'submitted'); assert.deepEqual(h.row.answers,answers)
  assert.equal((await h.public.POST(submit({...answers,location:'Other'}),params)).status,409)
  assert.equal(h.row.answers.location,'Garage')
})
test('concurrent submissions: exactly one accepted', async () => {
  const h=harness(); const results=await Promise.all([h.public.POST(submit(),params),h.public.POST(submit(),params)])
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409])
})
test('wrong MIME and too many files fail before uploading', async () => {
  for (const files of [[new File(['<svg/>'],'photo.jpg',{type:'image/jpeg'})], Array.from({length:4},()=>new File(['a'],'a.jpg',{type:'image/jpeg'}))]) {
    const h=harness(); assert.equal((await h.public.POST(submit(answers,files),params)).status,400); assert.equal(h.uploaded.length,0)
  }
})
test('oversized chunked body rejected without trusting Content-Length', async () => {
  const request = new Request('https://example.test',{method:'POST',body:new ReadableStream({start(controller){controller.enqueue(new Uint8Array(4*1024*1024));controller.close()}}),duplex:'half'})
  await assert.rejects(readPreparationForm(request),/för stora/)
})
test('write failure never returns success', async () => {
  const h=harness({fail:true}); const res=await h.public.POST(submit(),params)
  assert.equal(res.status,503); assert.equal(h.row.status,'open'); assert.equal((await res.json()).success,undefined)
})
test('review only accepted after customer submits and within owner business', async () => {
  const h=harness(); assert.equal((await h.owner.PATCH(json({id:'req1',status:'reviewed'}))).status,409)
  h.row.status='submitted'; assert.equal((await h.owner.PATCH(json({id:'req1',status:'reviewed'}))).status,200)
  assert.equal(h.row.status,'reviewed')
  h.row.business_id='bizB'; assert.equal((await h.owner.PATCH(json({id:'req1',status:'cancelled'}))).status,409)
})

test('owner reads only its customer rows and only signs matching private image paths', async () => {
  const h=harness({row:{...initial(),images:['bizB/req1/private.jpg','bizA/req1/photo.jpg']}})
  const request={nextUrl:new URL('https://example.test?customer_id=custA')}
  const result=await (await h.owner.GET(request)).json()
  assert.equal(result.preparations[0].image_urls.length,1)
  assert.ok(result.preparations[0].image_urls[0].endsWith('bizA/req1/photo.jpg'))
  h.row.business_id='bizB'
  assert.deepEqual((await (await h.owner.GET(request)).json()).preparations,[])
})
test('successful photo submission uses server-owned path and retains the file', async () => {
  const h=harness()
  const file=new File([new Uint8Array([255,216,255,1])],'../../evil.jpg',{type:'image/jpeg'})
  assert.equal((await h.public.POST(submit(answers,[file]),params)).status,200)
  assert.match(h.uploaded[0],/^bizA\/req1\/[a-f0-9-]+\.jpg$/)
  assert.deepEqual(h.row.images,h.uploaded)
  assert.equal(h.removed.length,0)
})

test('image cleanup uses only tenant paths and fails loudly on storage failure', async () => {
  const { removePreparationImages } = await import('../../lib/customer-preparation/cleanup.ts')
  let removed=[]
  const db={from(){return {select(){return this},eq(k,v){assert.equal(k,'business_id');assert.equal(v,'bizA');return this},order(){return this},async range(){return {data:[{id:'r',images:['bizA/r/x.jpg']}],error:null}}}},storage:{from(bucket){assert.equal(bucket,'customer-preparation');return {async remove(paths){removed.push(...paths);return {error:null}}}}}}
  await removePreparationImages(db,'bizA');assert.deepEqual(removed,['bizA/r/x.jpg'])
  db.storage.from=()=>({remove:async()=>({error:new Error('storage failed')})})
  await assert.rejects(removePreparationImages(db,'bizA'),/storage failed/)
})
