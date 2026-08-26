/**
 * Enhetstest — deriveProjectTodo / deriveTodoMode / pickTopCard
 * (lib/projects/derive-todo.ts). Rena funktioner.
 *   npx playwright test tests/project-derive-todo.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import { deriveProjectTodo, deriveTodoMode, getStageBucket, pickTopCard, TODO_PRIMARY_LABEL } from '../lib/projects/derive-todo'

const BASE = { stageId: 'ps-03', isOverBudget: false, canSeeFinancials: true, hasUninvoicedWork: false, noWorkYet: false }

test.describe('getStageBucket', () => {
  test('null/okänt → planering; ps-01–02 planering; ps-03–04 pågående; ps-05+ klart', () => {
    expect(getStageBucket(null)).toBe('planering')
    expect(getStageBucket('custom-x')).toBe('planering')
    expect(getStageBucket('ps-02')).toBe('planering')
    expect(getStageBucket('ps-03')).toBe('pagaende')
    expect(getStageBucket('ps-04')).toBe('pagaende')
    expect(getStageBucket('ps-05')).toBe('klart')
    expect(getStageBucket('ps-08')).toBe('klart')
  })
})

test.describe('deriveTodoMode — samma regler som detaljsidan hade inline', () => {
  test('över budget vinner allt', () => {
    expect(deriveTodoMode({ ...BASE, isOverBudget: true, stageId: 'ps-06' })).toBe('over_budget')
  })
  test('klart + ofakturerat arbete + får se ekonomi → klart_ofakturerat', () => {
    expect(deriveTodoMode({ ...BASE, stageId: 'ps-05', hasUninvoicedWork: true })).toBe('klart_ofakturerat')
  })
  test('klart + ofakturerat men UTAN ekonomibehörighet → pågående (inte ett påstående om pengar)', () => {
    expect(deriveTodoMode({ ...BASE, stageId: 'ps-05', hasUninvoicedWork: true, canSeeFinancials: false })).toBe('pagaende')
  })
  test('planering utan arbete → nystartat; planering med arbete → pågående', () => {
    expect(deriveTodoMode({ ...BASE, stageId: null, noWorkYet: true })).toBe('nystartat')
    expect(deriveTodoMode({ ...BASE, stageId: 'ps-01', noWorkYet: false })).toBe('pagaende')
  })
})

test.describe('pickTopCard — högst risk, sedan äldst', () => {
  test('high slår medium slår low oavsett ålder', () => {
    const top = pickTopCard([
      { id: 'a', approval_type: 'x', risk_level: 'low', created_at: '2026-08-01' },
      { id: 'b', approval_type: 'x', risk_level: 'high', created_at: '2026-08-20' },
      { id: 'c', approval_type: 'x', risk_level: 'medium', created_at: '2026-08-02' },
    ])
    expect(top?.id).toBe('b')
  })
  test('samma risk → äldst först', () => {
    const top = pickTopCard([
      { id: 'a', approval_type: 'x', risk_level: 'low', created_at: '2026-08-10' },
      { id: 'b', approval_type: 'x', risk_level: 'low', created_at: '2026-08-02' },
    ])
    expect(top?.id).toBe('b')
  })
  test('tom lista → null', () => {
    expect(pickTopCard([])).toBeNull()
  })
})

test.describe('deriveProjectTodo — kortet vinner över den härledda åtgärden', () => {
  test('utan kort: härledd primäråtgärd, agent null, pending_count 0', () => {
    const t = deriveProjectTodo({ ...BASE })
    expect(t.source).toBe('derived')
    expect(t.label).toBe(TODO_PRIMARY_LABEL.pagaende)
    expect(t.agent).toBeNull()
    expect(t.pending_count).toBe(0)
  })

  test('med kort: kortets titel, agent via payload.routed_agent, pending_count = antal', () => {
    const t = deriveProjectTodo({
      ...BASE,
      pending: [
        { id: 'k1', approval_type: 'create_ata_draft', risk_level: 'medium', created_at: '2026-08-20', title: 'Skapa ÄTA-utkast: extra el', payload: { project_id: 'p1', routed_agent: 'lars' } },
        { id: 'k2', approval_type: 'send_sms', risk_level: 'low', created_at: '2026-08-21', title: 'SMS till kund', payload: { project_id: 'p1' } },
      ],
    })
    expect(t.source).toBe('card')
    expect(t.label).toBe('Skapa ÄTA-utkast: extra el')
    expect(t.agent).toBe('lars')
    expect(t.approval_id).toBe('k1')
    expect(t.pending_count).toBe(2)
  })

  test('kort utan titel → typetiketten', () => {
    const t = deriveProjectTodo({ ...BASE, pending: [{ id: 'k', approval_type: 'create_ata_draft', title: null, payload: {} }] })
    expect(t.label).toBe('ÄTA-förslag')
  })

  test('mode härleds oavsett kort (detaljsidan behöver den)', () => {
    const t = deriveProjectTodo({ ...BASE, isOverBudget: true, pending: [{ id: 'k', approval_type: 'send_sms' }] })
    expect(t.mode).toBe('over_budget')
    expect(t.source).toBe('card')
  })
})
