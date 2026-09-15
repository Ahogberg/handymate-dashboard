import { test, expect } from '@playwright/test'
import { ACTION_CONTRACT } from '../lib/approvals/action-contract'
import { CARD_KIND } from '../lib/approvals/card-kind'
import { EXPIRY_DAYS, expiryFor } from '../lib/approvals/expiry'
import { KORTKANAL } from '../lib/approvals/kortkanal'
import { readFileSync, readdirSync } from 'fs'
import path from 'path'
test('every real producer has explicit card kind; only informational actions become notices', () => {
  const cardKinds = CARD_KIND as Record<string, 'decision' | 'notice'>
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(path.join(dir, e.name))
        : /\.tsx?$/.test(e.name)
          ? [readFileSync(path.join(dir, e.name), 'utf8')]
          : [],
    )
  const types = new Set(
    [...walk('app'), ...walk('lib')].flatMap((s) =>
      Array.from(s.matchAll(/approval_type:\s*'([a-z_]+)'/g)).map((m) => m[1]),
    ),
  )
  expect(Array.from(types).filter((t) => !cardKinds[t])).toEqual([])
  expect(Array.from(types).filter((t) => !(t in EXPIRY_DAYS))).toEqual([])
  expect(Object.keys(EXPIRY_DAYS).sort()).toEqual(Object.keys(CARD_KIND).sort())
  for (const [type, channel] of Object.entries(KORTKANAL)) {
    if (channel === 'digest') expect(cardKinds[type]).toBe('notice')
  }
  for (const [type, kind] of Object.entries(ACTION_CONTRACT)) {
    expect(cardKinds[type]).toBe(
      KORTKANAL[type] === 'digest' || kind === 'INFORMATIONAL'
        ? 'notice'
        : 'decision',
    )
    expect(expiryFor(type)).toBe(EXPIRY_DAYS[type as keyof typeof EXPIRY_DAYS])
  }
  const sql = readFileSync('sql/v248_handoff_inbox_consent.sql', 'utf8')
  const array = sql.match(/p_type = ANY\(ARRAY\[([^\]]+)\]/)![1]
  expect(
    Array.from(array.matchAll(/'([^']+)'/g))
      .map((m) => m[1])
      .sort(),
  ).toEqual(
    Object.keys(CARD_KIND)
      .filter((k) => cardKinds[k] === 'notice')
      .sort(),
  )
  const expiryBody = sql.match(
    /FUNCTION public\.handoff_expiry_days[\s\S]*?\$\$;/,
  )![0]
  const sevenDayTypes = expiryBody
    .match(/ANY\(ARRAY\[([^\]]+)\]/)![1]
    .match(/'([^']+)'/g)!
    .map((value) => value.slice(1, -1))
    .sort()
  expect(sevenDayTypes).toEqual(
    Object.entries(EXPIRY_DAYS)
      .filter(([, days]) => days === 7)
      .map(([type]) => type)
      .sort(),
  )
  expect(expiryBody).toContain("WHEN p_type='autonomy_offer' THEN 14")
  expect(expiryFor('new_unclassified_type')).toBeNull()
})
