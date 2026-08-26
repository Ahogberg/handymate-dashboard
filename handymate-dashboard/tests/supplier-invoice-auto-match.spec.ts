/**
 * Enhetstest — matchSupplierInvoiceToProject (lib/fortnox/match-supplier-invoice.ts).
 *   npx playwright test tests/supplier-invoice-auto-match.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import { extractReferenceProjectNumbers, matchSupplierInvoiceToProject, projectDigits } from '../lib/fortnox/match-supplier-invoice'

const PROJECTS = [
  { project_id: 'proj_a', project_number: 'P-1042' },
  { project_id: 'proj_b', project_number: 'P-1043' },
  { project_id: 'proj_c', project_number: null },
]

test.describe('projectDigits / extractReferenceProjectNumbers', () => {
  test('siffrorna ur alla former; kräver minst tre siffror', () => {
    expect(projectDigits('P-1042')).toBe('1042')
    expect(projectDigits('1042')).toBe('1042')
    expect(projectDigits(' P 1042 ')).toBe('1042')
    expect(projectDigits('P-1')).toBeNull()
    expect(projectDigits(null)).toBeNull()
  })
  test('littrat i löptext', () => {
    expect(extractReferenceProjectNumbers('Märkning: P-1042, beställt av Emil')).toEqual(['1042'])
    expect(extractReferenceProjectNumbers('P1042 och P 1043')).toEqual(['1042', '1043'])
    expect(extractReferenceProjectNumbers('Tel 070-1042 (ingen P)')).toEqual([])
  })
})

test.describe('matchSupplierInvoiceToProject — ordning och säkerhet', () => {
  test('1. konterad på projekt i Fortnox → fortnox_project', () => {
    const m = matchSupplierInvoiceToProject({ Project: '1042' }, PROJECTS)
    expect(m?.project_id).toBe('proj_a')
    expect(m?.source).toBe('fortnox_project')
  })

  test('2. alla rader på samma projekt → row_project', () => {
    const m = matchSupplierInvoiceToProject({ SupplierInvoiceRows: [{ Project: '1043' }, { Project: '1043' }] }, PROJECTS)
    expect(m?.project_id).toBe('proj_b')
    expect(m?.source).toBe('row_project')
  })

  test('2. blandade rader = delad faktura → ingen automatisk koppling, även med märkning', () => {
    const m = matchSupplierInvoiceToProject({ YourReference: 'P-1042', SupplierInvoiceRows: [{ Project: '1042' }, { Project: '1043' }] }, PROJECTS)
    expect(m).toBeNull()
  })

  test('3. märkning i Er referens → reference', () => {
    const m = matchSupplierInvoiceToProject({ YourReference: 'Ref P-1042 / Emil' }, PROJECTS)
    expect(m?.project_id).toBe('proj_a')
    expect(m?.source).toBe('reference')
    expect(m?.evidence).toContain('P-1042')
  })

  test('3. två olika projekt i referensen → ingen koppling (osäkert = inget)', () => {
    expect(matchSupplierInvoiceToProject({ Comments: 'P-1042 och P-1043' }, PROJECTS)).toBeNull()
  })

  test('okänt projektnummer → null; ingen data → null', () => {
    expect(matchSupplierInvoiceToProject({ Project: '9999' }, PROJECTS)).toBeNull()
    expect(matchSupplierInvoiceToProject({}, PROJECTS)).toBeNull()
  })

  test('exakt Fortnox-projektnummer (v172) vinner över sifferjämförelsen', () => {
    const withFortnox = [
      { project_id: 'proj_a', project_number: 'P-1042', fortnox_project_number: '77' },
      { project_id: 'proj_b', project_number: 'P-1043', fortnox_project_number: '1042' },
    ]
    // "1042" i Fortnox ÄR proj_b:s Fortnox-nummer — även om siffrorna råkar
    // vara proj_a:s projektnummer.
    expect(matchSupplierInvoiceToProject({ Project: '1042' }, withFortnox)?.project_id).toBe('proj_b')
    expect(matchSupplierInvoiceToProject({ Project: '77' }, withFortnox)?.project_id).toBe('proj_a')
  })

  test('dubbla projekt med samma nummer → aldrig en gissning', () => {
    const dup = [...PROJECTS, { project_id: 'proj_dup', project_number: 'P-1042' }]
    expect(matchSupplierInvoiceToProject({ Project: '1042' }, dup)).toBeNull()
  })
})
