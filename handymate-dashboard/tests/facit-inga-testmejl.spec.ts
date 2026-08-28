/**
 * Facit: inga riktiga testmejl ur testsviten (2026-08-28).
 *
 * Bakgrund: tests/api.spec.ts och tests/comprehensive.spec.ts postade mot
 * /api/debug/mail — som skickar "Test-mail från …" till företagets kontakt-
 * mejl — och CI-grinden kör hela sviten på varje push. 40 körningar på två
 * dygn gav Andreas ett testmejl "ibland var femte minut". SMS-debugtesterna
 * var redan undantagna i CI; mejlet var det inte.
 *
 * Regel: ett test som når en sändande debug-rutt gör det med dry_run, och
 * rutten svarar då med diagnostik utan att skicka.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

test('varje test som postar mot /api/debug/mail gör det med dry_run: true', () => {
  const dir = path.join(ROOT, 'tests')
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.spec.ts') && f !== 'facit-inga-testmejl.spec.ts')
  const brott: string[] = []
  for (const f of files) {
    const s = kod(`tests/${f}`)
    const re = /request\.post\('\/api\/debug\/mail'[^)]*\)/g
    for (const m of s.match(re) || []) {
      if (!m.includes('dry_run: true')) brott.push(`${f}: ${m}`)
    }
  }
  expect(brott).toEqual([])
})

test('rutten svarar på dry_run före all sändning — inget Gmail-, inget Resend-anrop', () => {
  const r = kod('app/api/debug/mail/route.ts')
  const dry = r.indexOf('body.dry_run')
  expect(dry).toBeGreaterThan(-1)
  expect(dry).toBeLessThan(r.indexOf('sendViaGmail('))
  expect(dry).toBeLessThan(r.indexOf('https://api.resend.com/emails'))
  expect(r).toContain('dry_run: true')
})

test('CI-grinden undantar fortfarande de sändande SMS-debugtesterna', () => {
  const wf = fs.readFileSync(path.join(ROOT, '..', '.github', 'workflows', 'playwright.yml'), 'utf8')
  expect(wf).toContain('--grep-invert "debug/sms|Debug SMS"')
})
