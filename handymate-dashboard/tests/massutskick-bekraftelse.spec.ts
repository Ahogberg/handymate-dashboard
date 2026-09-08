/**
 * Massutskick kräver bekräftelse — facit (beslut Andreas 2026-09-08).
 *
 * Bakgrund: Codex godkännandegranskning visade att Hannas kampanjkort kunde
 * godkännas på ett tryck utan att ägaren sett SMS-texten eller antalet
 * mottagare. Två regler:
 *  1. Servern vägrar (428) att godkänna ett kort med fler än en mottagare
 *     utan att klienten bekräftat exakt antalet — oavsett klient.
 *  2. Kortet bär själva texten, inte bara antalet.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { massutskickAvKort, massutskickBekraftat, massutskickSvar, MASSUTSKICK_STATUS } from '../lib/approvals/massutskick'
import { massutskickText } from '../lib/approvals/klient-bekraftelse'

const ROOT = path.join(__dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

test.describe('massutskickAvKort — ren igenkänning', () => {
  test('säsongskampanj till 79 kunder är ett massutskick med texten och de första namnen', () => {
    const m = massutskickAvKort('seasonal_campaign', {
      sms_text: 'Hej! Dags för höstkoll av elen.',
      customer_count: 79,
      customers: Array.from({ length: 79 }, (_, i) => ({ customer_id: `c${i}`, name: `Kund ${i}`, phone_number: '+4670' })),
    })
    expect(m?.recipient_count).toBe(79)
    expect(m?.message).toContain('höstkoll')
    expect(m?.recipients_preview).toHaveLength(5)
  })
  test('en mottagare är inget massutskick', () => {
    expect(massutskickAvKort('seasonal_campaign', { customers: [{ name: 'A' }], sms_text: 'x' })).toBeNull()
    expect(massutskickAvKort('send_sms', { to: '+46', message: 'x' })).toBeNull()
  })
  test('customer_count utan lista räcker för att stoppa', () => {
    expect(massutskickAvKort('x', { customer_count: 3, message: 'hej' })?.recipient_count).toBe(3)
  })
  test('bekräftelsen måste vara exakt antalet', () => {
    const m = { recipient_count: 21, message: 'x', recipients_preview: [] }
    expect(massutskickBekraftat({ confirm_recipients: 21 }, m)).toBe(true)
    expect(massutskickBekraftat({ confirm_recipients: 20 }, m)).toBe(false)
    expect(massutskickBekraftat({ confirm_recipients: true }, m)).toBe(false)
    expect(massutskickBekraftat({}, m)).toBe(false)
  })
  test('svaret bär allt mellanskärmen behöver', () => {
    const svar = massutskickSvar({ recipient_count: 4, message: 'Hej', recipients_preview: ['A'] }, 'seasonal_campaign')
    expect(svar.requires_confirmation).toBe(true)
    expect(svar.confirm_field).toBe('confirm_recipients')
    expect(MASSUTSKICK_STATUS).toBe(428)
    expect(massutskickText(svar)).toContain('4 kunder')
    expect(massutskickText(svar)).toContain('"Hej"')
  })
})

test.describe('rutten grindar före statusändring och exekvering', () => {
  const src = read('app/api/approvals/[id]/route.ts')
  test('428 med underlag när bekräftelse saknas, före "Update status"', () => {
    const grind = src.indexOf('massutskickAvKort(approval.approval_type, finalPayload')
    const status = src.indexOf('// Update status')
    expect(grind).toBeGreaterThan(0)
    expect(grind).toBeLessThan(status)
    expect(src.slice(grind, grind + 400)).toMatch(/MASSUTSKICK_STATUS/)
    expect(src.slice(grind, grind + 400)).toMatch(/massutskickBekraftat\(body, mass\)/)
  })
  test('grinden gäller approve och edit', () => {
    expect(src).toMatch(/if \(action === 'approve' \|\| action === 'edit'\) \{\s*const mass = massutskickAvKort/)
  })
})

test.describe('webbens ytor går genom postKortbeslut', () => {
  for (const rel of [
    'app/dashboard/approvals/page.tsx',
    'components/jarvis/JarvisHome.tsx',
    'components/dashboard/IdagCore.tsx',
    'components/projects/ProjectApprovalsBlock.tsx',
  ]) {
    test(rel, () => {
      const s = read(rel)
      expect(s).toMatch(/postKortbeslut\(/)
      // Inga kvarvarande direkta POST-fetchar mot /api/approvals/{id} för beslut
      // (retry i approvals-sidan är undantaget — den skickar inte ett nytt beslut).
      const direkta = s.match(/fetch\(`\/api\/approvals\/\$\{[^}]+\}`, \{\s*method: 'POST'/g) || []
      expect(direkta.length, `${rel}: direkta POST-anrop`).toBeLessThanOrEqual(rel.endsWith('approvals/page.tsx') ? 1 : 0)
    })
  }
  test('klienthjälparen skickar igen bara efter ja, med serverns antal', () => {
    const s = read('lib/approvals/klient-bekraftelse.ts')
    expect(s).toMatch(/res\.status !== 428\) return res/)
    expect(s).toMatch(/window\.confirm\(massutskickText\(svar\)\)/)
    expect(s).toMatch(/\[svar\.confirm_field \|\| 'confirm_recipients'\]: svar\.recipient_count/)
  })
})

test('säsongskampanjkortet bär SMS-texten före antalet', () => {
  const s = read('lib/seasonality/campaign-generator.ts')
  expect(s).toMatch(/description: `"\$\{smsText\}"\\n\\nTill \$\{validCustomers\.length\}/)
})
