/**
 * Facit: ROT/RUT skickas till Fortnox i Fortnox form (2026-08-26).
 *
 * Tidigare skickade sync-to-fortnox ett påhittat `TaxReduction`-objekt på
 * fakturan ({ Type, PropertyType, TaxReductionAmount,
 * AskerSocialSecurityNumber }). Invoice.TaxReduction är read-only i Fortnox;
 * husarbetet uttrycks via TaxReductionType + HouseWork/HouseWorkType per rad,
 * och köparens uppgifter via POST /taxreductions. Aldrig observerat eftersom
 * Fortnox-vägen är licensblockerad (Pass 3/I2).
 *
 *   npx playwright test tests/facit-fortnox-housework.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

test.describe('lib/invoices/sync-to-fortnox.ts — husarbete i Fortnox form', () => {
  const s = read('lib/invoices/sync-to-fortnox.ts')

  test('det påhittade TaxReduction-objektet är borta', () => {
    expect(s).not.toContain('TaxReductionAmount')
    expect(s).not.toContain('AskerSocialSecurityNumber')
    expect(s).not.toMatch(/invoicePayload\.TaxReduction\s*=/)
  })

  test('raderna får HouseWork-fälten via den rena mappningen', () => {
    expect(s).toContain("from '@/lib/fortnox/housework'")
    expect(s).toContain('houseWorkRowFields(item, rotType as RotRutType, houseWorkType as string)')
    expect(s).toContain('invoicePayload.TaxReductionType = taxReductionType')
  })

  test('kategorin gissas aldrig — saknas den bokförs utan husarbete och driftlarmet får veta', () => {
    expect(s).toContain("'fortnox:housework-category-missing'")
    expect(s).toContain('defaultCategoryForIndustry(bizConfig?.industry)')
  })

  test('begäran skapas via POST /taxreductions efter bokföringen, best-effort', () => {
    const post = s.indexOf("'/taxreductions'")
    const invoicePost = s.indexOf("'/invoices',")
    expect(post).toBeGreaterThan(invoicePost)
    expect(s).toContain("'fortnox:taxreduction-failed'")
    expect(s).toContain("'fortnox:taxreduction-skipped'")
  })

  test("rot_application_status='submitted' bara när Fortnox faktiskt har en begäran — ROT och RUT", () => {
    expect(s).toContain('if (taxReductionCreated) {')
    expect(s).not.toMatch(/if \(isRot\) \{\s*\n\s*updateData\.rot_application_status/)
  })
})

test.describe('FortnoxInvoiceRow bär husarbetsfälten', () => {
  test('typen har HouseWork/HouseWorkType/HouseWorkHoursToReport', () => {
    const s = read('lib/fortnox.ts')
    const t = s.slice(s.indexOf('export interface FortnoxInvoiceRow'), s.indexOf('export interface FortnoxInvoice {'))
    expect(t).toContain('HouseWork?: boolean')
    expect(t).toContain('HouseWorkType?: string')
    expect(t).toContain('HouseWorkHoursToReport?: number')
  })
})
