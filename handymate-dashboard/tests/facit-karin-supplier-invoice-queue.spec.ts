import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROUTE_PATH = path.join(__dirname, '..', 'app/api/karin/supplier-invoices/route.ts')

test.describe('GET/PATCH /api/karin/supplier-invoices', () => {
  test('rutten finns med GET och PATCH', () => {
    expect(fs.existsSync(ROUTE_PATH)).toBe(true)
    const src = fs.readFileSync(ROUTE_PATH, 'utf8')
    expect(src).toContain('export async function GET')
    expect(src).toContain('export async function PATCH')
  })

  test('bada metoderna ar agare/admin-grindade, samma monster som karin/events', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8')
    const getBlock = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function PATCH'))
    const patchBlock = src.slice(src.indexOf('export async function PATCH'))
    for (const block of [getBlock, patchBlock]) {
      expect(block).toContain('getAuthenticatedBusiness')
      expect(block).toMatch(/isOwnerOrAdmin/)
    }
  })

  test('GET filtrerar pa project_id IS NULL', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8')
    expect(src).toMatch(/\.is\(['"]project_id['"],\s*null\)/)
  })

  test('PATCH kontrollerar projekt-agarskap via verifyOwnership innan skrivning', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8')
    const patchBlock = src.slice(src.indexOf('export async function PATCH'))
    expect(patchBlock).toContain('verifyOwnership')
  })

  test('GET lackar aldrig interna marginalfalt', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8')
    const getBlock = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function PATCH'))
    expect(getBlock).not.toMatch(/marginal|budget_amount/)
  })
})
