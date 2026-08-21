import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROUTE = fs.readFileSync(
  path.join(__dirname, '..', 'app/api/rot-payment/eligible/route.ts'),
  'utf8',
)
const PAGE = fs.readFileSync(
  path.join(__dirname, '..', 'app/dashboard/invoices/rot-payment/page.tsx'),
  'utf8',
)

test.describe('ROT/RUT-eligible: Fortnox-bokförda fakturor flaggas, utesluts inte tyst (2026-08-21)', () => {
  // Tidigare kod uteslöt tyst alla fakturor med rot_application_status==='submitted'
  // ur listan, baserat på antagandet att Fortnox redan skickat in dem till
  // Skatteverket — ett antagande som inte går att verifiera i kod (beror på
  // om det specifika Fortnox-kontot har automatisk Skatteverket-anslutning
  // aktiverad). Om antagandet var fel för ett pilotföretag hade deras ROT/RUT
  // aldrig nått Skatteverket någonstans. Andreas beslut 2026-08-21: visa+flagga
  // istället för att tyst utesluta.

  test('filtrerar inte längre bort rot_application_status===submitted', () => {
    expect(ROUTE).not.toMatch(/\.filter\(\s*\(inv:\s*any\)\s*=>\s*inv\.rot_application_status\s*!==\s*'submitted'\s*\)/)
  })

  test('beräknar likely_reported_by_fortnox i svaret', () => {
    expect(ROUTE).toContain('likely_reported_by_fortnox')
    expect(ROUTE).toMatch(/likely_reported_by_fortnox:\s*inv\.rot_application_status\s*===\s*'submitted'/)
  })

  test('rot_payment_request_id-null-kollen finns kvar (utesluter fortfarande vår egen redan-skickade fil)', () => {
    expect(ROUTE).toContain(".is('rot_payment_request_id', null)")
  })

  test('UI visar en varning för likely_reported_by_fortnox-rader', () => {
    expect(PAGE).toContain('likely_reported_by_fortnox')
    expect(PAGE).toMatch(/row\.likely_reported_by_fortnox/)
  })

  test('UI-varningen nämner Fortnox och dubbel-risken', () => {
    const idx = PAGE.indexOf('likely_reported_by_fortnox &&')
    expect(idx).toBeGreaterThan(-1)
    const block = PAGE.slice(idx, idx + 400)
    expect(block).toMatch(/Fortnox/)
    expect(block).toMatch(/dubbelt|Skatteverket/)
  })
})
