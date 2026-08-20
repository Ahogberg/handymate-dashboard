import { test, expect } from '@playwright/test'
import { suggestMatch, type MatchedInvoice } from '../lib/karin/supplier-invoice-match'

test.describe('suggestMatch', () => {
  test('tom historik → inget förslag', () => {
    const result = suggestMatch('Bauhaus AB', [])
    expect(result.project_id).toBeNull()
    expect(result.subcontractor_id).toBeNull()
  })

  test('en tidigare koppling (under tröskeln) → inget förslag', () => {
    const history: MatchedInvoice[] = [
      { supplier_name: 'Bauhaus AB', project_id: 'proj_1', subcontractor_id: null },
    ]
    const result = suggestMatch('Bauhaus AB', history)
    expect(result.project_id).toBeNull()
  })

  test('exakt två tidigare kopplingar mot samma projekt → förslag med count 2', () => {
    const history: MatchedInvoice[] = [
      { supplier_name: 'Bauhaus AB', project_id: 'proj_1', subcontractor_id: null },
      { supplier_name: 'Bauhaus AB', project_id: 'proj_1', subcontractor_id: null },
    ]
    const result = suggestMatch('Bauhaus AB', history)
    expect(result.project_id).toBe('proj_1')
    expect(result.project_match_count).toBe(2)
  })

  test('tre kopplingar mot samma projekt → förslag med count 3', () => {
    const history: MatchedInvoice[] = [
      { supplier_name: 'Bauhaus AB', project_id: 'proj_1', subcontractor_id: null },
      { supplier_name: 'Bauhaus AB', project_id: 'proj_1', subcontractor_id: null },
      { supplier_name: 'Bauhaus AB', project_id: 'proj_1', subcontractor_id: null },
    ]
    const result = suggestMatch('Bauhaus AB', history)
    expect(result.project_match_count).toBe(3)
  })

  test('två projekt med 2+ träffar vardera → tvetydigt, inget förslag', () => {
    const history: MatchedInvoice[] = [
      { supplier_name: 'Beijer Bygg', project_id: 'proj_1', subcontractor_id: null },
      { supplier_name: 'Beijer Bygg', project_id: 'proj_1', subcontractor_id: null },
      { supplier_name: 'Beijer Bygg', project_id: 'proj_2', subcontractor_id: null },
      { supplier_name: 'Beijer Bygg', project_id: 'proj_2', subcontractor_id: null },
    ]
    const result = suggestMatch('Beijer Bygg', history)
    expect(result.project_id).toBeNull()
  })

  test('ett projekt med 2+ och ett annat med bara 1 → inte tvetydigt, föreslår det starka', () => {
    const history: MatchedInvoice[] = [
      { supplier_name: 'Snickeri AB', project_id: 'proj_1', subcontractor_id: null },
      { supplier_name: 'Snickeri AB', project_id: 'proj_1', subcontractor_id: null },
      { supplier_name: 'Snickeri AB', project_id: 'proj_2', subcontractor_id: null },
    ]
    const result = suggestMatch('Snickeri AB', history)
    expect(result.project_id).toBe('proj_1')
  })

  test('projekt och UE beräknas oberoende av varandra', () => {
    const history: MatchedInvoice[] = [
      { supplier_name: 'Elfirman', project_id: 'proj_1', subcontractor_id: 'sub_1' },
      { supplier_name: 'Elfirman', project_id: 'proj_1', subcontractor_id: null },
    ]
    const result = suggestMatch('Elfirman', history)
    expect(result.project_id).toBe('proj_1')
    expect(result.project_match_count).toBe(2)
    expect(result.subcontractor_id).toBeNull()
    expect(result.subcontractor_match_count).toBe(0)
  })

  test('andra leverantörers historik påverkar inte förslaget', () => {
    const history: MatchedInvoice[] = [
      { supplier_name: 'Bauhaus AB', project_id: 'proj_1', subcontractor_id: null },
      { supplier_name: 'Bauhaus AB', project_id: 'proj_1', subcontractor_id: null },
      { supplier_name: 'Beijer Bygg', project_id: 'proj_9', subcontractor_id: null },
      { supplier_name: 'Beijer Bygg', project_id: 'proj_9', subcontractor_id: null },
    ]
    const result = suggestMatch('Bauhaus AB', history)
    expect(result.project_id).toBe('proj_1')
  })
})
