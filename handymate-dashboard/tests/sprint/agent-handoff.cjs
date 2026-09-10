const assert = require('node:assert/strict')

async function verify(trigger) {
  const originalFetch = global.fetch
  const cases = [
    ['paused', { skipped: 'agents_globally_paused' }, false],
    ['fuel exhausted', { skipped: 'fuel_exhausted' }, false],
    ['fuel unavailable', { skipped: 'fuel_unavailable' }, false],
    ['cost cap', { skipped: 'daily_cost_cap' }, false],
    ['paused flag', { run_id: 'r', agent_paused: true }, false],
    ['fuel flag', { run_id: 'r', fuel_stopped: true }, false],
    ['failed duplicate', { run_id: 'r', duplicate: true, status: 'failed' }, false],
    ['running duplicate', { run_id: 'r', duplicate: true, status: 'running' }, false],
    ['unknown duplicate', { run_id: 'r', duplicate: true }, false],
    ['completed duplicate', { run_id: 'r', duplicate: true, status: 'completed' }, true],
    ['fresh run', { run_id: 'r', steps: 2, tool_calls: 1 }, true],
    ['explicit failure', { run_id: 'r', success: false }, false],
    ['error payload', { run_id: 'r', error: 'storage unavailable' }, false],
    ['empty response', {}, false],
    ['null response', null, false],
    ['array response', [], false],
    ['text response', 'OK', false],
    ['blank run', { run_id: ' ' }, false],
    ['claimed success while skipped', { success: true, run_id: 'r', skipped: 'paused' }, false],
  ]
  try {
    for (const [label, payload, expected] of cases) {
      let requests = 0
      global.fetch = async (_url, options) => {
        requests++
        const body = JSON.parse(options.body)
        assert.equal(body.business_id, 'synthetic-business')
        assert.equal(body.idempotency_key, 'same-event')
        return Response.json(payload)
      }
      const result = await trigger('synthetic-business', 'cron', { cron_type: 'quote_followup' }, 'same-event')
      assert.equal(result.success, expected, label)
      assert.equal(requests, 1, 'helper must not automatically retry uncertain work')
      if (!expected) assert(result.error, label + ' retains a reason')
      if (payload?.skipped) assert.equal(result.skipped, payload.skipped)
      console.log('PASS agent handoff:', label)
    }
    global.fetch = async () => Response.json({ success: true, run_id: 'r' }, { status: 503 })
    assert.equal((await trigger('synthetic-business', 'cron')).success, false)
    global.fetch = async () => { throw Error('response lost after execution') }
    assert.equal((await trigger('synthetic-business', 'cron')).success, false)
    global.fetch = async () => new Response('<html>gateway error</html>')
    assert.equal((await trigger('synthetic-business', 'cron')).success, false)
    console.log(`PASS ${cases.length + 3} actual agent-trigger response contracts; HTTP isolated, no agent/provider calls`)
  } finally { global.fetch = originalFetch }
}
module.exports = verify
if (require.main === module) {
  const ts = require('typescript'), fs = require('node:fs')
  const code = ts.transpileModule(fs.readFileSync('lib/agent-trigger.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const mod = { exports: {} }
  new Function('module', 'exports', code)(mod, mod.exports)
  verify(mod.exports.triggerAgentInternal).catch(error => { console.error(error); process.exitCode = 1 })
}
