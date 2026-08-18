/**
 * Facit för push-strypunktens frånvaro-medvetenhet (Etapp Å).
 *
 * sendApprovalPush (lib/notifications/approval-push.ts) är den ENDA
 * chokepoint alla approval-pushar går igenom — samma sourceskanningsidiom
 * som tests/permission-contract.spec.ts och tests/external-actor.spec.ts
 * "vakten sitter FÖRE switchen"-testet: bevisar ORDNINGEN och att rätt
 * primitiv (isAbsenceActive/classifyAbsenceEvent) faktiskt används, i
 * stället för att mocka Supabase/fetch för en fire-and-forget-funktion.
 *
 *   npx playwright test tests/absence-push-gate.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const src = fs.readFileSync(path.join(ROOT, 'lib', 'notifications', 'approval-push.ts'), 'utf8')

test.describe('sendApprovalPush är den enda absence-gaten', () => {
  test('frånvarokontrollen körs INNAN /api/push/send-anropet', () => {
    const fnStart = src.indexOf('export async function sendApprovalPush(')
    expect(fnStart, 'sendApprovalPush hittades inte — har den bytt namn?').toBeGreaterThan(-1)
    const gateIdx = src.indexOf('isAbsenceActive(', fnStart)
    const fetchIdx = src.indexOf("fetch(`${appUrl}/api/push/send`", fnStart)
    expect(gateIdx, 'ingen isAbsenceActive-kontroll i sendApprovalPush').toBeGreaterThan(-1)
    expect(fetchIdx, 'hittade inte push-send-anropet').toBeGreaterThan(-1)
    expect(gateIdx, 'grinden ligger EFTER fetch-anropet — den skyddar inget').toBeLessThan(fetchIdx)
  })

  test('klassningen sker via den delade eskaleringsklassaren, ingen egen bedömning', () => {
    expect(src).toContain("import { classifyAbsenceEvent } from '@/lib/absence/escalation'")
    expect(src).toContain("kind: 'pending_approval'")
  })

  test('undertryckt push returnerar tyst — kortet/kön rörs aldrig av denna fil', () => {
    expect(src).not.toMatch(/pending_approvals['"]\)[\s\S]{0,80}\.(update|delete|insert)\(/)
  })

  test('en trasig frånvarokontroll är fail-open (pushen skickas som vanligt), inte fail-closed', () => {
    const fnStart = src.indexOf('export async function sendApprovalPush(')
    const body = src.slice(fnStart, src.indexOf("fetch(`${appUrl}/api/push/send`", fnStart))
    expect(body).toContain('catch (err)')
    expect(body).toContain('fail-open')
  })

  test('ApprovalLike bär risk_level (behövs för high_risk_approval-klassen)', () => {
    const ifaceStart = src.indexOf('interface ApprovalLike')
    const ifaceEnd = src.indexOf('\n}', ifaceStart)
    expect(src.slice(ifaceStart, ifaceEnd)).toContain('risk_level?: string | null')
  })
})

test.describe('lib/absence/* rör aldrig en exekveringsväg (järnregeln)', () => {
  const absenceDir = path.join(ROOT, 'lib', 'absence')
  const files = fs.readdirSync(absenceDir).filter(f => f.endsWith('.ts'))

  // Beskriver reglerna utan att stava de förbjudna funktionsnamnen i
  // implementationsfilerna (självreferens-fällan) — de riktiga namnen
  // fångas i FORBIDDEN nedan, bara i DEN HÄR testfilen.
  const FORBIDDEN = ['executeSharedTool', 'executeApprovalPayload']

  for (const file of files) {
    test(`${file} importerar aldrig en exekveringsväg`, () => {
      const content = fs.readFileSync(path.join(absenceDir, file), 'utf8')
      for (const banned of FORBIDDEN) {
        expect(content.includes(banned), `${file} innehåller "${banned}"`).toBe(false)
      }
    })

    test(`${file} skriver aldrig pending_approvals till 'approved'`, () => {
      const content = fs.readFileSync(path.join(absenceDir, file), 'utf8')
      expect(content).not.toMatch(/status:\s*['"]approved['"]/)
    })
  }
})
