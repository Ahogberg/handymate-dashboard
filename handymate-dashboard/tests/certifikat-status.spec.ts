/**
 * Certifikat-statusklassningen och påminnelseurvalet — facit-tester för de
 * rena funktionerna (tasks/resurs-masterplan.md, R3 punkt 3). Körs:
 *   npx playwright test tests/certifikat-status.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  classifyCertStatus,
  selectCertsNeedingReminder,
  CERT_EXPIRING_SOON_DAYS,
  CERT_REMINDER_WINDOW_DAYS,
} from '../lib/certifikat/status'

const TODAY = '2026-08-04'

test.describe('classifyCertStatus', () => {
  test('konstanterna är dokumenterade (60/30 dagar)', () => {
    expect(CERT_EXPIRING_SOON_DAYS).toBe(60)
    expect(CERT_REMINDER_WINDOW_DAYS).toBe(30)
  })

  test('null valid_until → no_expiry', () => {
    expect(classifyCertStatus(null, TODAY)).toBe('no_expiry')
    expect(classifyCertStatus(undefined, TODAY)).toBe('no_expiry')
  })

  test('datum i går → expired', () => {
    expect(classifyCertStatus('2026-08-03', TODAY)).toBe('expired')
  })

  test('datum idag → INTE expired (förfaller vid dagens slut, inte redan förfallet)', () => {
    expect(classifyCertStatus(TODAY, TODAY)).toBe('expiring_soon')
  })

  test('datum långt fram (>60 dagar) → valid', () => {
    expect(classifyCertStatus('2026-12-31', TODAY)).toBe('valid')
  })

  test('datum om exakt 60 dagar → expiring_soon (inklusive gräns)', () => {
    // 2026-08-04 + 60 dagar = 2026-10-03
    expect(classifyCertStatus('2026-10-03', TODAY)).toBe('expiring_soon')
  })

  test('datum om 61 dagar → valid (precis utanför gränsen)', () => {
    expect(classifyCertStatus('2026-10-04', TODAY)).toBe('valid')
  })

  test('datum om 5 dagar → expiring_soon', () => {
    expect(classifyCertStatus('2026-08-09', TODAY)).toBe('expiring_soon')
  })
})

test.describe('selectCertsNeedingReminder', () => {
  test('tomt urval → tom lista', () => {
    expect(selectCertsNeedingReminder([], TODAY)).toEqual([])
  })

  test('cert utan valid_until väljs aldrig ut', () => {
    const certs = [{ id: 'c1', valid_until: null }]
    expect(selectCertsNeedingReminder(certs, TODAY)).toEqual([])
  })

  test('cert som går ut om 30 dagar väljs ut (inklusive gräns)', () => {
    // 2026-08-04 + 30 dagar = 2026-09-03
    const certs = [{ id: 'c1', valid_until: '2026-09-03' }]
    expect(selectCertsNeedingReminder(certs, TODAY).map((c) => c.id)).toEqual(['c1'])
  })

  test('cert som går ut om 31 dagar väljs INTE ut', () => {
    const certs = [{ id: 'c1', valid_until: '2026-09-04' }]
    expect(selectCertsNeedingReminder(certs, TODAY)).toEqual([])
  })

  test('redan utgånget cert VÄLJS UT (medveten tolkning — se filhuvudet i lib/certifikat/status.ts)', () => {
    const certs = [{ id: 'c1', valid_until: '2026-01-01' }]
    expect(selectCertsNeedingReminder(certs, TODAY).map((c) => c.id)).toEqual(['c1'])
  })

  test('blandat urval filtrerar korrekt och behåller ordning', () => {
    const certs = [
      { id: 'far_future', valid_until: '2027-01-01' },
      { id: 'expiring', valid_until: '2026-08-20' },
      { id: 'no_expiry', valid_until: null },
      { id: 'expired', valid_until: '2026-07-01' },
    ]
    expect(selectCertsNeedingReminder(certs, TODAY).map((c) => c.id)).toEqual(['expiring', 'expired'])
  })
})
