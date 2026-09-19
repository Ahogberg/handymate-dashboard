const { load } = require('./integrity-loader.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const deep = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b)
const { selectedIntakeChannels, toggleIntakeChannel, allSelectedIntakeVerified } = load('lib/onboarding/customer-intake.ts')
test('legacy primary survives; explicit empty selection does not restore it', () => {
  deep(selectedIntakeChannels({primaryLeadChannel:'email'}), ['email'])
  deep(selectedIntakeChannels({primaryLeadChannel:'email',customerIntakeChannels:[]}), [])
})
test('selection is sanitized and duplicated channels count only once', () => {
  deep(selectedIntakeChannels({customerIntakeChannels:['email','email','invalid']}), ['email'])
})
test('adding a second path retains primary; removing primary chooses remaining path', () => {
  const two = toggleIntakeChannel({primaryLeadChannel:'email'}, 'phone')
  assert.equal(two.primaryLeadChannel, 'email')
  deep(toggleIntakeChannel(two, 'email'), {customerIntakeChannels:['phone'], primaryLeadChannel:'phone'})
})
test('one verified channel cannot complete multiple selected paths', () => {
  const evidence = [{channel:'email',state:'lead_verified'}, {channel:'phone',state:'enabled_unverified'}]
  assert.equal(allSelectedIntakeVerified(['email','phone'], evidence), false)
  assert.equal(allSelectedIntakeVerified(['email'], evidence), true)
  assert.equal(allSelectedIntakeVerified([], evidence), false)
  assert.equal(allSelectedIntakeVerified(['sms'], evidence), false)
  assert.equal(allSelectedIntakeVerified(['website'], [{channel:'web',state:'lead_verified'}]), true)
})
