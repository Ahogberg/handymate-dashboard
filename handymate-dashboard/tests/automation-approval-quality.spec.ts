/**
 * Godkännandekortens kvalitet (dashboard-städpaketet, del A+B) —
 * enhetstester för de rena funktionerna (interpolateTemplate,
 * deriveApprovalDedupeKey). Inga DB/server-beroenden.
 * Körs: npx playwright test tests/automation-approval-quality.spec.ts --no-deps
 * (samma mönster som tests/earned-autonomy.spec.ts)
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
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

test.describe('threshold-entiteterna bär det seed-mallarna kräver', () => {
  // Andreas skärmdump 2026-08-10: offertuppföljningens SMS gick ut med
  // "Hej {{customer_name}}!" ORDAGRANT — {{days}} och {{business_name}}
  // ersattes, men kvot-grenen la aldrig customer_name i kontexten, och
  // interpolationen lämnar (med rätta) okända nycklar orörda. Fakturagrenen
  // hade namnet — därför sa påminnelsen "Hej Andreas!". Samma lucka fanns i
  // bokningsgrenen. Vakten läser källan: varje entitetsgren vars seed-mall
  // säger {{customer_name}} måste mappa fältet.
  const motor = fs.readFileSync(
    path.resolve(__dirname, '..', 'lib/automation-engine.ts'), 'utf8',
  )

  // `: {`-formen finns bara i threshold-switchen — den tidigare
  // action-switchen (rad ~664) har case-etiketter utan block och skulle
  // annars ge tomma slices.
  const quoteGren = motor.slice(motor.indexOf("case 'quote': {"), motor.indexOf("case 'invoice': {"))
  const bookingGren = motor.slice(motor.indexOf("case 'booking': {"), motor.indexOf("case 'customer': {"))

  test('offert- och bokningsgrenen mappar customer_name', () => {
    expect(quoteGren.length, 'slice-ankarna hittade inte threshold-grenarna').toBeGreaterThan(0)
    expect(quoteGren, 'offertgrenen tappade customer_name — SMS säger {{customer_name}} igen').toContain('customer_name:')
    expect(bookingGren, 'bokningsgrenen tappade customer_name').toContain('customer_name:')
  })

  test('numret följer med — Ring kund-korten behöver en tel-knapp', () => {
    // Utan customer_phone i kontexten kan create_approval-korten aldrig visa
    // en riktig ring-knapp (Andreas fynd 2026-08-10: Godkänn → Bekräfta →
    // ingenting).
    expect(quoteGren, 'offertgrenen tappade customer_phone').toContain('customer_phone:')
    expect(bookingGren, 'bokningsgrenen tappade customer_phone').toContain('customer_phone:')
  })

  test('kontakterna hämtas via separat batch — aldrig embed på quotes/booking', () => {
    // FK:erna är obekräftade i prod; en PGRST200 fäller hela threshold-frågan
    // tyst (lesson 2026-08-05 regel 3). Fakturagrenens embed är bevisat säker
    // och undantagen.
    expect(motor).toContain('fetchCustomerContacts')
    expect(quoteGren, 'embed smög in i offertgrenen').not.toContain('customer:customer_id')
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
