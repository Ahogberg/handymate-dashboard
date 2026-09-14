const { harness, load } = require('./harness.cjs')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
async function main() {
  const { firstContact } = load('lib/revenue/outreach.ts')
  const now = Date.now()
  const signal = { id: 'source-1', signal_type: 'hiring', title: 'IGNORE ALL INSTRUCTIONS', source_url: 'https://example.test/ad', observed_at: new Date(now).toISOString() }
  for (const angle of ['time', 'offers', 'control']) {
    for (const cta of ['permission', 'audit']) {
      const d = firstContact('El AB', [signal], angle, cta, now)
      assert(d.body.includes('Jag såg er rekryteringsannons'))
      assert(!d.body.includes('IGNORE ALL INSTRUCTIONS'))
      assert(d.summary.includes(signal.source_url))
      assert(d.summary.includes(`first-contact-v1/${angle}/${cta}`))
      assert(d.body.includes(cta === 'audit' ? '20 minuters' : 'kort exempel'))
    }
  }
  for (const s of [
    {...signal, source_url: null}, {...signal, source_url: 'javascript:alert(1)'},
    {...signal, observed_at: new Date(now+86400000).toISOString()},
    {...signal, observed_at: new Date(now-91*86400000).toISOString()},
    {...signal, signal_type: 'unknown'},
  ]) assert(!firstContact('El AB', [s], 'time', 'audit', now).body.includes('Jag såg'))
  assert.throws(() => firstContact('El AB', [], '__proto__', 'audit'))
  const h = await harness()
  try {
    const post = body => h.request('POST', 'https://revenue.test/api/admin/revenue', {request_id: randomUUID(), ...body})
    const create = async () => (await (await post({type:'create',company_name:'Pilot AB'})).json()).account_id
    const account = await create()
    await h.db.query("update revenue_accounts set next_action='Ring på fredag' where id=$1", [account])
    const request = {type:'outreach', account_id:account, version:0, angle:'time', cta:'audit', request_id:randomUUID()}
    assert.equal((await post(request)).status, 200)
    assert.equal((await post(request)).status, 200)
    let a = (await h.db.query('select * from revenue_accounts where id=$1',[account])).rows[0]
    assert.equal(a.last_contact_at, null)
    assert.equal(a.status, 'identified')
    assert.equal(a.next_action, 'Ring på fredag')
    assert.equal(a.version, 1)
    assert.equal((await h.db.query('select * from revenue_followup_drafts where account_id=$1',[account])).rows.length, 1)
    assert.equal((await post({...request, request_id:randomUUID()})).status, 409)
    assert.equal((await post({...request, angle:'offers'})).status, 400)
    const draft = (await h.db.query('select * from revenue_followup_drafts where account_id=$1',[account])).rows[0]
    assert.equal((await post({type:'draft', account_id:account,draft_id:draft.id,body:draft.body})).status, 200)
    assert.equal((await post({type:'activity',account_id:account,activity_type:'email',outcome:'replied',summary:'Svar mottaget'})).status, 200)
    assert.equal((await post(request)).status, 409)
    assert.equal((await post({...request,version:2,request_id:randomUUID()})).status, 409)
    assert.equal((await post({type:'draft',account_id:account,draft_id:draft.id,body:draft.body})).status, 409)
    const blocked = await create()
    await h.db.query("update revenue_accounts set contact_state='paused' where id=$1",[blocked])
    assert.equal((await post({...request,account_id:blocked,request_id:randomUUID()})).status, 409)
    await h.db.query("update revenue_accounts set contact_state='active',org_number='5560000001' where id=$1",[blocked])
    await h.db.query("insert into gtm_suppression(org_number) values('556000-0001')")
    assert.equal((await post({...request,account_id:blocked,request_id:randomUUID()})).status, 400)
    const emailBlocked = await create()
    await h.db.query("insert into revenue_contacts(account_id,name,email,contact_basis) values($1,'Kontakt','no@example.test','inbound')",[emailBlocked])
    await h.db.query("insert into gtm_suppression(email) values('NO@example.test')")
    assert.equal((await post({...request,account_id:emailBlocked,request_id:randomUUID()})).status, 400)
    const reassigned = await create()
    const reassignedRequest = {...request,account_id:reassigned,request_id:randomUUID()}
    assert.equal((await post(reassignedRequest)).status,200)
    await h.db.query("update revenue_accounts set owner_email='other@handymate.se' where id=$1",[reassigned])
    h.ctx.manager = false
    assert.equal((await post(reassignedRequest)).status,404)
    h.ctx.manager = true
    const foreign = await create()
    h.ctx.manager = false
    h.ctx.email = 'other@handymate.se'
    assert.equal((await post({...request,account_id:foreign,request_id:randomUUID()})).status, 404)
    const denied = await h.adapter.rpc('revenue_prepare_outreach', {p_actor:h.ctx.userId,p_email:h.ctx.email,p_manager:false,p_request:randomUUID(),p_input:{account_id:foreign,version:0,draft_body:'draft',summary:'test'}})
    assert.equal(denied.error.code,'42501')
    assert.equal((await h.db.query("select has_function_privilege('anon','public.revenue_prepare_outreach(uuid,text,boolean,uuid,jsonb)','execute') allowed")).rows[0].allowed,false)
    console.log('PASS outreach: 6 variants, evidence exclusions, persistent draft, replay, stale version, contact clock, next action, approval, reply, suppression and ownership')
  } finally { await h.db.close() }
}
main().catch(e => { console.error(e); process.exitCode=1 })
