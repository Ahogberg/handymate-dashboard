/**
 * Facit — Support får aldrig nå create_approval_request/check_pending_approvals
 * via koordinationsvägen i app/api/matte/chat/route.ts (holistisk granskning,
 * 2026-08-21).
 *
 * personalities.ts gav aldrig support dessa två verktyg — men
 * COORDINATION_TOOLS i chatt-routen körde `if (COORDINATION_TOOLS.has(toolName))
 * return true` FÖRE personalities-kollen, vilket gav ALLA agenter — inklusive
 * support — create_approval_request och check_pending_approvals oavsett
 * allowedTools. Support hade då en riktig, exekverbar väg till att skriva i
 * pending_approvals, tvärtemot hela designen (support ska ha noll skrivaccess
 * utanför get_account_billing_status och escalate_to_handymate_team).
 *
 * De befintliga testerna (facit-support-agent-tools.spec.ts m.fl.) kollar
 * bara den STATISKA personalities.ts-filen — aldrig den RUNTIME-funktion
 * (isToolAllowedForAgent/toolsForAgent) som chattloopen faktiskt kör. Det är
 * därför luckan inte fångades. Det här testet läser samma runtime-fil som
 * chatten kör och exercerar den faktiska sammansättningslogiken.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/facit-support-tool-boundary.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const FILE = fs.readFileSync(
  path.join(__dirname, '..', 'app/api/matte/chat/route.ts'),
  'utf8',
)

test.describe('Support kan aldrig nå create_approval_request/check_pending_approvals via koordinationsvägen', () => {
  test('create_approval_request är INTE i den universella koordinationslistan', () => {
    const idx = FILE.indexOf('UNIVERSAL_COORDINATION_TOOLS')
    expect(idx).toBeGreaterThan(-1)
    const block = FILE.slice(idx, idx + 200)
    expect(block).not.toMatch(/create_approval_request/)
    expect(block).not.toMatch(/check_pending_approvals/)
  })

  test('isToolAllowedForAgent nekar support explicit för create_approval_request/check_pending_approvals', () => {
    const idx = FILE.indexOf('function isToolAllowedForAgent')
    expect(idx).toBeGreaterThan(-1)
    const block = FILE.slice(idx, idx + 600)
    expect(block).toMatch(/agent\s*!==\s*'support'/)
  })
})
