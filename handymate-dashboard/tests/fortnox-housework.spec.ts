/**
 * Enhetstest — lib/fortnox/housework.ts (ren mappning ROT/RUT → Fortnox).
 *   npx playwright test tests/fortnox-housework.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import {
  buildTaxReductionPayload,
  fortnoxHouseWorkType,
  fortnoxTaxReductionType,
  houseWorkRowFields,
  isHouseWorkRow,
} from '../lib/fortnox/housework'
import { ALL_CATEGORIES as SKV_CATEGORIES } from '../lib/skv/categories'

test.describe('fortnoxHouseWorkType', () => {
  test('VARJE Skatteverkskategori har en Fortnox-typ — ingen kategori kan tappa husarbetet', () => {
    for (const c of SKV_CATEGORIES) {
      expect(fortnoxHouseWorkType(c.code), `${c.code} saknar HouseWorkType`).toBeTruthy()
    }
  })
  test('okänd/tom kategori → null (aldrig en gissad typ)', () => {
    expect(fortnoxHouseWorkType(null)).toBeNull()
    expect(fortnoxHouseWorkType('Påhittat')).toBeNull()
  })
  test('ROT-typerna är Fortnox egna namn', () => {
    expect(fortnoxHouseWorkType('El')).toBe('ELECTRICITY')
    expect(fortnoxHouseWorkType('Vvs')).toBe('HVAC')
    expect(fortnoxHouseWorkType('Stadning')).toBe('CLEANING')
  })
})

test.describe('fortnoxTaxReductionType', () => {
  test('rot/ROT → ROT, rut → RUT, annat → null', () => {
    expect(fortnoxTaxReductionType('rot')).toBe('ROT')
    expect(fortnoxTaxReductionType('ROT')).toBe('ROT')
    expect(fortnoxTaxReductionType('rut')).toBe('RUT')
    expect(fortnoxTaxReductionType(null)).toBeNull()
    expect(fortnoxTaxReductionType('green')).toBeNull()
  })
})

test.describe('radfälten', () => {
  test('flaggan på raden vinner; äldre rader faller tillbaka på type=labor', () => {
    expect(isHouseWorkRow({ is_rot_eligible: true }, 'rot')).toBe(true)
    expect(isHouseWorkRow({ is_rot_eligible: false, type: 'labor' }, 'rot')).toBe(false)
    expect(isHouseWorkRow({ type: 'labor' }, 'rot')).toBe(true)
    expect(isHouseWorkRow({ type: 'material' }, 'rut')).toBe(false)
  })
  test('HouseWorkType sätts på ALLA rader, timmar bara på arbetsrader med timenhet', () => {
    const work = houseWorkRowFields({ is_rot_eligible: true, unit: 'tim', quantity: 12.4 }, 'rot', 'ELECTRICITY')
    expect(work).toEqual({ HouseWork: true, HouseWorkType: 'ELECTRICITY', HouseWorkHoursToReport: 12 })
    const material = houseWorkRowFields({ is_rot_eligible: false, unit: 'st', quantity: 3 }, 'rot', 'ELECTRICITY')
    expect(material).toEqual({ HouseWork: false, HouseWorkType: 'ELECTRICITY' })
    const fixed = houseWorkRowFields({ is_rot_eligible: true, unit: 'st', quantity: 1 }, 'rot', 'ELECTRICITY')
    expect(fixed.HouseWorkHoursToReport).toBeUndefined()
  })
})

test.describe('buildTaxReductionPayload', () => {
  test('småhus: fastighetsbeteckning, personnummer utan skiljetecken, heltal kr', () => {
    const p = buildTaxReductionPayload({ documentNumber: '1043', askedAmountKr: 2999.6, customerName: 'Anna', personalNumber: '19850615-1235', propertyDesignation: 'Gården 1:23' })
    expect(p).toEqual({ ReferenceDocumentType: 'INVOICE', ReferenceNumber: '1043', AskedAmount: 3000, CustomerName: 'Anna', SocialSecurityNumber: '198506151235', PropertyDesignation: 'Gården 1:23' })
  })
  test('bostadsrätt: BRF-orgnr + lägenhetsnummer, ingen fastighetsbeteckning', () => {
    const p = buildTaxReductionPayload({ documentNumber: '1043', askedAmountKr: 3000, customerName: null, personalNumber: '198506151235', propertyDesignation: 'ska ignoreras', brfOrgNumber: '769612-3456', apartmentNumber: '1201' })
    expect(p.ResidenceAssociationOrganisationNumber).toBe('7696123456')
    expect(p.ApartmentNumber).toBe('1201')
    expect(p.PropertyDesignation).toBeUndefined()
  })
})
