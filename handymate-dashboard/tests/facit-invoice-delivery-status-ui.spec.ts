import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

test.describe('InvoiceHeader — omdopt Fortnox-knapp', () => {
  const HEADER = fs.readFileSync(
    path.join(__dirname, '..', "app/dashboard/invoices/[id]/components/InvoiceHeader.tsx"),
    'utf8',
  )

  test('knappen heter Bokfor i Fortnox, inte Skicka via Fortnox', () => {
    expect(HEADER).toContain('Bokför i Fortnox')
    expect(HEADER).not.toContain('Skicka via Fortnox')
  })

  test('canSendViaFortnox kraver aven att fortnox_sync_status inte redan ar synced', () => {
    const idx = HEADER.indexOf('const canSendViaFortnox')
    const line = HEADER.slice(idx, idx + 200)
    expect(line).toMatch(/fortnox_sync_status/)
  })
})

test.describe('Fakturasidan — delivery_failed-banner', () => {
  const PAGE = fs.readFileSync(
    path.join(__dirname, '..', "app/dashboard/invoices/[id]/page.tsx"),
    'utf8',
  )

  test('visar en banner nar delivery_status ar delivery_failed', () => {
    expect(PAGE).toMatch(/delivery_status/)
    expect(PAGE).toMatch(/delivery_failed/)
  })
})
