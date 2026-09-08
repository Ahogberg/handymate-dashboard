// Run with Node 24: node --test scripts/check-onboarding-service-area.mjs
// Kept outside tests/ so Playwright does not load the node:test suite.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeOnboardingServiceArea } from '../lib/onboarding/service-area.ts'

test('seeded rollprov area remains an empty editable string', () => {
  const area = normalizeOnboardingServiceArea({ type: 'postal_codes', values: [] })
  assert.equal(area.trim(), '')
})

test('legacy area values survive onboarding resume', () => {
  assert.equal(normalizeOnboardingServiceArea({ type: 'postal_codes', values: ['11122', ' 22233 '] }), '11122, 22233')
  assert.equal(normalizeOnboardingServiceArea(['Stockholm', 'Uppsala']), 'Stockholm, Uppsala')
  assert.equal(normalizeOnboardingServiceArea('Stockholm'), 'Stockholm')
  assert.equal(normalizeOnboardingServiceArea(''), '')
})

test('invalid persisted values cannot crash string validation', () => {
  for (const value of [null, undefined, 500, false, {}, { values: false }, { values: [null, {}, 1] }]) {
    assert.equal(normalizeOnboardingServiceArea(value).trim(), '')
  }
})
