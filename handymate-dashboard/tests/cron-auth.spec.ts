import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { verifyCronSecret } from '../lib/cron/verify-secret'

const ROOT = path.resolve(__dirname, '..')
const CRON_DIR = path.join(ROOT, 'app', 'api', 'cron')

function requestWith(headers: Record<string, string> = {}) {
  return { headers: new Headers(headers) }
}

function routeFiles(dir: string, result: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) routeFiles(full, result)
    else if (entry.name === 'route.ts') result.push(full)
  }
  return result
}

test.describe('cron-auth failar stängt', () => {
  test('saknad serverhemlighet nekas', () => {
    expect(verifyCronSecret(requestWith(), undefined)).toBe(false)
  })

  test('Bearer undefined nekas när serverhemligheten saknas', () => {
    expect(verifyCronSecret(
      requestWith({ authorization: 'Bearer undefined' }),
      undefined,
    )).toBe(false)
  })

  test('fel hemlighet nekas', () => {
    expect(verifyCronSecret(
      requestWith({ authorization: 'Bearer wrong' }),
      'correct',
    )).toBe(false)
  })

  test('rätt hemlighet godkänns', () => {
    expect(verifyCronSecret(
      requestWith({ authorization: 'Bearer correct' }),
      'correct',
    )).toBe(true)
  })

  test('legacy-headern använder samma verifierare', () => {
    expect(verifyCronSecret(
      requestWith({ 'x-cron-secret': 'correct' }),
      'correct',
    )).toBe(true)
  })
})

test('alla cron-rutter utanför Claudes Karin-fillås använder helpern', () => {
  const files = routeFiles(CRON_DIR)
  expect(files).toHaveLength(34)

  const karinRoute = path.join(CRON_DIR, 'karin-deadlines', 'route.ts')
  const ownedRoutes = files.filter(file => file !== karinRoute)
  expect(ownedRoutes).toHaveLength(33)

  const missing = ownedRoutes
    .filter(file => {
      const source = fs.readFileSync(file, 'utf8')
      return !source.includes("from '@/lib/cron/verify-secret'")
        || !source.includes('verifyCronSecret(request)')
    })
    .map(file => path.relative(ROOT, file))

  expect(missing).toEqual([])
})
