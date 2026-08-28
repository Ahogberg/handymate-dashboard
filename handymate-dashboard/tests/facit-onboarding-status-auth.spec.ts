/**
 * Facit: /api/onboarding/status skriver bara på sessionens företag (2026-08-28).
 * Rutten var oautentiserad (service-role + businessId ur bodyn) sedan den
 * gamla checklistan — Codex-granskning, källverifierad, stängd samma dag.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const kod = fs.readFileSync(path.join(__dirname, '..', 'app/api/onboarding/status/route.ts'), 'utf8').replace(/\r\n/g, '\n')

test('rutten autentiserar och använder sessionens business_id — aldrig bodyns', () => {
  expect(kod).toContain('getAuthenticatedBusiness(request)')
  expect(kod.indexOf('getAuthenticatedBusiness(request)')).toBeLessThan(kod.indexOf("from('business_config')"))
  expect(kod).toContain('const businessId = business.business_id')
  expect(kod).toContain("body.businessId !== businessId")
  expect(kod).not.toContain('const { businessId, forwarding_confirmed')
})
