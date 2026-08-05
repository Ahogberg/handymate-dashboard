/**
 * Godkännandekortens kvalitet (dashboard-städpaketet, del A+B) —
 * enhetstester för de rena funktionerna (interpolateTemplate,
 * deriveApprovalDedupeKey). Inga DB/server-beroenden.
 * Körs: npx playwright test tests/automation-approval-quality.spec.ts --no-deps
 * (samma mönster som tests/earned-autonomy.spec.ts)
 */
import { test, expect } from '@playwright/test'
import { interpolateTemplate, deriveApprovalDedupeKey } from '../lib/automation-engine'

test.describe('interpolateTemplate', () => {
  test('ersätter {{key}} med värden som finns i kontext', () => {
    const result = interpolateTemplate(
      'Faktura {{invoice_number}} — obetald 7+ dagar',
      { invoice_number: '1042', entity_id: 'inv_1' }
    )
    expect(result).toBe('Faktura 1042 — obetald 7+ dagar')
  })

  test('ersätter flera olika nycklar i samma text', () => {
    const result = interpolateTemplate(
      'Fakturan till {{customer_name}} har varit obetald i minst 7 dagar.',
      { customer_name: 'Anna Andersson', total: 4200 }
    )
    expect(result).toBe('Fakturan till Anna Andersson har varit obetald i minst 7 dagar.')
  })

  test('lämnar platshållare för saknade nycklar orörda — kraschar inte', () => {
    const result = interpolateTemplate('Faktura {{invoice_number}} — obetald', {})
    expect(result).toBe('Faktura {{invoice_number}} — obetald')
  })

  test('gamla statiska titlar utan platshållare påverkas inte', () => {
    const result = interpolateTemplate(
      'Försenad faktura — åtgärd krävs',
      { invoice_number: '1042', customer_name: 'Anna' }
    )
    expect(result).toBe('Försenad faktura — åtgärd krävs')
  })

  test('ignorerar icke-sträng/nummer-värden i kontext (undviker [object Object])', () => {
    const result = interpolateTemplate('{{customer_name}} — {{payload}}', {
      customer_name: 'Anna',
      payload: { foo: 'bar' },
    })
    expect(result).toBe('Anna — {{payload}}')
  })

  test('ersätter numeriska värden korrekt', () => {
    const result = interpolateTemplate('{{days}} dagar sedan', { days: 7 })
    expect(result).toBe('7 dagar sedan')
  })
})

test.describe('deriveApprovalDedupeKey', () => {
  test('saknas entity_id och id → null (inget kort ska skapas)', () => {
    expect(deriveApprovalDedupeKey({}, {})).toBeNull()
    expect(deriveApprovalDedupeKey({ customer_id: 'cust_1' }, {})).toBeNull()
  })

  test('entity_id i kontext ger nyckel, rule_action_type från kontext vinner', () => {
    const key = deriveApprovalDedupeKey(
      { entity_id: 'inv_1', rule_action_type: 'send_sms' },
      { approval_type: 'automation' }
    )
    expect(key).toEqual({ entityId: 'inv_1', ruleActionType: 'send_sms' })
  })

  test('id som fallback för entity_id (threshold-loopens entityItem.id)', () => {
    const key = deriveApprovalDedupeKey({ id: 'inv_2' }, {})
    expect(key).toEqual({ entityId: 'inv_2', ruleActionType: 'automation' })
  })

  test('saknas rule_action_type → faller tillbaka på config.approval_type', () => {
    const key = deriveApprovalDedupeKey({ entity_id: 'inv_3' }, { approval_type: 'invoice_reminder' })
    expect(key).toEqual({ entityId: 'inv_3', ruleActionType: 'invoice_reminder' })
  })

  test('saknas både rule_action_type och config.approval_type → "automation"', () => {
    const key = deriveApprovalDedupeKey({ entity_id: 'inv_4' }, {})
    expect(key).toEqual({ entityId: 'inv_4', ruleActionType: 'automation' })
  })

  test('entity_id vinner över id om båda finns', () => {
    const key = deriveApprovalDedupeKey({ entity_id: 'inv_5', id: 'ignored' }, {})
    expect(key?.entityId).toBe('inv_5')
  })
})
