/**
 * Schema-kontraktstest (guardrail, sanering 2026-08-05 — tasks/lessons.md).
 *
 * Bakgrund: en audit hittade ett femtontal ställen som frågade tabeller som
 * inte finns (projects, customers, activity, admin_audit_log, automation_logs,
 * work_order, project_photo, project_tracker_stage ...). Supabase-js kastar
 * aldrig — sådana anrop failar TYST i månader. Detta test gör felet till ett
 * rött test i stället: varje `.from('tabell')` i produktionskoden måste
 * matcha en tabell som bevisligen finns.
 *
 * Facit byggs av: (1) CREATE TABLE i sql/-mappen, (2) RENAME TO-migrationer,
 * (3) BASE_TABLES — bastabeller äldre än sql/-konventionen, (4)
 * MANUAL_TABLES — tabeller skapade direkt i Supabase-dashboarden utan
 * migrationsfil (dokumenterad skuld; skriv en sql-fil när de ändras).
 *
 * Körs utan browser/session:
 *   npx playwright test tests/schema-contract.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')

/** Bastabeller från före sql/-konventionen — finns i prod, saknar CREATE-fil. */
const BASE_TABLES = [
  'business_config',
  'customer',
  'booking',
  'quotes',
  'invoice',
  'price_list',
]

/** Skapade manuellt i Supabase-dashboarden — bekräftat i bruk, men utan
    migrationsfil. TODO: skriv ikapp sql-filer. */
const MANUAL_TABLES = [
  'customer_activity',
  'sms_campaign',
  'sms_campaign_recipient',
  'material_order',
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

function buildSchemaFacit(): Set<string> {
  const facit = new Set<string>([...BASE_TABLES, ...MANUAL_TABLES])
  const sqlDir = path.join(ROOT, 'sql')
  for (const file of fs.readdirSync(sqlDir)) {
    if (!file.endsWith('.sql')) continue
    const content = fs.readFileSync(path.join(sqlDir, file), 'utf8')
    for (const m of Array.from(content.matchAll(
      /CREATE TABLE (?:IF NOT EXISTS )?(?:"?[a-z0-9_]+"?\.)?"?([a-z0-9_]+)"?/gi,
    ))) {
      facit.add(m[1].toLowerCase())
    }
    // RENAME flyttar namnet: nya namnet in (gamla behålls inte — koden ska
    // inte längre referera det, och gör den det ska testet slå larm).
    for (const m of Array.from(content.matchAll(/ALTER TABLE\s+"?([a-z0-9_]+)"?\s+RENAME TO\s+"?([a-z0-9_]+)"?/gi))) {
      facit.delete(m[1].toLowerCase())
      facit.add(m[2].toLowerCase())
    }
  }
  return facit
}

function collectTableRefs(): Map<string, string[]> {
  const refs = new Map<string, string[]>()
  const files = [
    ...walk(path.join(ROOT, 'lib')),
    ...walk(path.join(ROOT, 'app')),
    ...walk(path.join(ROOT, 'components')),
  ]
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    // (?<!storage) — supabase.storage.from('bucket') är lagrings-buckets,
    // inte tabeller, och ska inte valideras mot schemat.
    for (const m of Array.from(content.matchAll(/(?<!storage)\.from\(\s*'([a-z0-9_]+)'\s*\)/g))) {
      const table = m[1].toLowerCase()
      const rel = path.relative(ROOT, file)
      const list = refs.get(table) || []
      if (!list.includes(rel)) list.push(rel)
      refs.set(table, list)
    }
  }
  return refs
}

test.describe('schema-kontraktet — alla .from() mot tabeller som finns', () => {
  test('ingen produktionskod refererar en okänd tabell', () => {
    const facit = buildSchemaFacit()
    const refs = collectTableRefs()

    const unknown: Record<string, string[]> = {}
    for (const [table, files] of Array.from(refs.entries())) {
      if (!facit.has(table)) unknown[table] = files
    }

    expect(
      unknown,
      `Okända tabellnamn hittade (finns varken i sql/ eller vitlistorna).\n` +
        `Är tabellen felstavad? Rätta koden. Finns tabellen i prod utan\n` +
        `migrationsfil? Skriv sql-filen eller lägg till i MANUAL_TABLES med\n` +
        `motivering.\n${JSON.stringify(unknown, null, 2)}`,
    ).toEqual({})
  })

  test('facit är rimligt (sanity: kärntabellerna hittades i sql/)', () => {
    const facit = buildSchemaFacit()
    for (const t of ['pending_approvals', 'v3_automation_logs', 'sms_log', 'project', 'leads', 'automation_activity']) {
      expect(facit.has(t), `${t} saknas i facit — trasig facit-byggare?`).toBe(true)
    }
  })

  test('regression: de tidigare felstavade namnen används inte längre', () => {
    const refs = collectTableRefs()
    const banned = [
      'projects', 'customers', 'activity', 'admin_audit_log',
      'automation_logs', 'work_order', 'project_photo', 'project_tracker_stage',
    ]
    for (const name of banned) {
      expect(
        refs.get(name) || [],
        `"${name}" är ett känt felnamn (sanering 2026-08-05) och får inte återinföras`,
      ).toEqual([])
    }
  })
})
