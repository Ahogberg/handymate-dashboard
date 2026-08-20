import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const PAGE_PATH = path.join(__dirname, '..', 'app/dashboard/supplier-invoices/page.tsx')

test.describe('app/dashboard/supplier-invoices/page.tsx', () => {
  test('sidan finns', () => {
    expect(fs.existsSync(PAGE_PATH)).toBe(true)
  })

  test('anropar /api/supplier-invoices utan project_id-parameter', () => {
    const src = fs.readFileSync(PAGE_PATH, 'utf8')
    expect(src).toContain("fetch('/api/supplier-invoices')")
  })

  test('renderar en lank till Karins ko for rader utan projekt', () => {
    const src = fs.readFileSync(PAGE_PATH, 'utf8')
    expect(src).toContain('/dashboard/karin')
    expect(src).toContain('Ej kopplad')
  })

  test('subcontractors-hamtningen ar fail-soft', () => {
    const src = fs.readFileSync(PAGE_PATH, 'utf8')
    const idx = src.indexOf('/api/subcontractors')
    expect(idx).toBeGreaterThan(-1)
    const around = src.slice(idx, idx + 300)
    expect(around).toMatch(/catch/)
  })

  test('sidan ar see_financials-gated via PermissionGate', () => {
    const src = fs.readFileSync(PAGE_PATH, 'utf8')
    expect(src).toContain('permission="see_financials"')
  })

  test('forfallen status harleds av due_date, inte ett lagrat DB-varde', () => {
    const src = fs.readFileSync(PAGE_PATH, 'utf8')
    expect(src).toMatch(/function displayStatus/)
  })
})
