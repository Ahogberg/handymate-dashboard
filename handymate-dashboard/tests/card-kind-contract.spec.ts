import { test, expect } from '@playwright/test'
import { ACTION_CONTRACT } from '../lib/approvals/action-contract'
import { CARD_KIND } from '../lib/approvals/card-kind'
import { expiryFor } from '../lib/approvals/expiry'
import { readFileSync, readdirSync } from 'fs'
import path from 'path'
test('every real producer has explicit card kind; only informational actions become notices', () => {
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
  expect(Array.from(types).filter((t) => !CARD_KIND[t])).toEqual([])
  for (const [type, kind] of Object.entries(ACTION_CONTRACT)) {
    expect(CARD_KIND[type]).toBe(
      kind === 'INFORMATIONAL' ? 'notice' : 'decision',
    )
    expect(expiryFor(type)).toBe(
      kind === 'INFORMATIONAL' ? null : type === 'autonomy_offer' ? 14 : 7,
    )
  }
  const sql = readFileSync('sql/v248_handoff_inbox_consent.sql', 'utf8')
  const array = sql.match(/p_type = ANY\(ARRAY\[([^\]]+)\]/)![1]
  expect(
    Array.from(array.matchAll(/'([^']+)'/g))
      .map((m) => m[1])
      .sort(),
  ).toEqual(
    Object.keys(CARD_KIND)
      .filter((k) => CARD_KIND[k] === 'notice')
      .sort(),
  )
})
