/**
 * Facit för mobilens hem-feed (Mission Control mobil 4a, E0: G1–G3).
 *
 * Körs: npx playwright test tests/mobile-home-feed.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fallbackSortera, arAktivt, senasteKvallsgrans } from '../lib/approvals/mobile-home'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('G2 — fallbacksorteringen', () => {
  test('risk före ålder, äldst först inom samma risk', () => {
    const sorterade = fallbackSortera([
      { id: 'a', risk_level: 'low', created_at: '2026-08-01', status: 'pending' },
      { id: 'b', risk_level: 'high', created_at: '2026-08-30', status: 'pending' },
      { id: 'c', risk_level: 'high', created_at: '2026-08-02', status: 'pending' },
      { id: 'd', risk_level: 'medium', created_at: '2026-08-03', status: 'pending' },
    ])
    expect(sorterade.map(k => k.id)).toEqual(['c', 'b', 'd', 'a'])
  })

  test('okänd/null risk hamnar sist — aldrig ett kastat fel', () => {
    const sorterade = fallbackSortera([
      { id: 'x', risk_level: null, created_at: '2026-08-01', status: 'pending' },
      { id: 'y', risk_level: 'low', created_at: '2026-08-02', status: 'pending' },
    ])
    expect(sorterade.map(k => k.id)).toEqual(['y', 'x'])
  })
})

test.describe('G1 — snooze-synlighet', () => {
  const nu = new Date('2026-08-31T10:00:00Z')
  test('utan snooze = aktivt; framtida snooze = gömt; passerad snooze = tillbaka', () => {
    expect(arAktivt({ snoozed_until: null }, nu)).toBe(true)
    expect(arAktivt({}, nu)).toBe(true)
    expect(arAktivt({ snoozed_until: '2026-08-31T14:00:00Z' }, nu)).toBe(false)
    expect(arAktivt({ snoozed_until: '2026-08-31T09:00:00Z' }, nu)).toBe(true)
  })
})

test.describe('nattfönstret — senaste 18:00 svensk tid', () => {
  test('kl 03 natten mot söndag ⇒ lördag 18:00 (CEST = 16:00Z)', () => {
    // 2026-08-30 är en söndag; 01:00Z = 03:00 svensk sommartid.
    const grans = senasteKvallsgrans(new Date('2026-08-30T01:00:00Z'))
    expect(grans.toISOString()).toBe('2026-08-29T16:00:00.000Z')
  })
  test('kl 19:30 svensk tid ⇒ samma dags 18:00', () => {
    const grans = senasteKvallsgrans(new Date('2026-08-30T17:30:00Z'))
    expect(grans.toISOString()).toBe('2026-08-30T16:00:00.000Z')
  })
})

test.describe('källfacit — rutterna delar primitiver och kan inte tyst glida isär', () => {
  const feed = read('app/api/mobile/home/route.ts')
  const nba = read('app/api/next-best-action/route.ts')
  const idRoute = read('app/api/approvals/[id]/route.ts')
  const listRoute = read('app/api/approvals/route.ts')

  test('feeden använder samma filterprimitiver som NBA-endpointen', () => {
    for (const fil of [feed, nba]) {
      expect(fil).toContain('canActOnApproval')
      expect(fil).toContain('arTestdataApproval')
      expect(fil).toContain('svDateStr')
    }
  })

  test('feeden är force-dynamic (cachebuggen 2026-08-22 får inte återuppstå)', () => {
    expect(feed).toContain("export const dynamic = 'force-dynamic'")
  })

  test('fallbacken hittar aldrig på rationale', () => {
    // I fallback-grenen mappas kandidater till enbart { approval } — utan
    // rationale-fält. NBA-grenen är den enda som bär rationale.
    expect(feed).toContain('.map(approval => ({ approval }))')
  })

  test('snooze finns som action i [id]-routen och kräver pending', () => {
    expect(idRoute).toContain("'snooze'")
    expect(idRoute).toContain('Endast väntande kort kan skjutas upp')
  })

  test('pending-kön filtrerar bort framtida snooze', () => {
    expect(listRoute).toContain('snoozed_until.is.null,snoozed_until.lt.')
  })

  test('sql/v181 finns och är additiv', () => {
    const sql = read('sql/v181_approval_snooze.sql')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS snoozed_until')
    expect(sql).not.toMatch(/DROP|DELETE|UPDATE /i)
  })
})
