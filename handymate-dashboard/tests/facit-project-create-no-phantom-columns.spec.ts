/**
 * Facit: projektskaparna skriver inga fantomkolumner (2026-08-26).
 *
 * Live-verifierat mot information_schema: `project` har INGEN address-kolumn
 * och `customer.address` är sedan länge uppdelad i address_line/postal_code/
 * city. Ändå skrev alla tre automatiska skapare `address:` i sitt
 * project-insert → Postgres 42703 → HELA skapandet avvisades tyst:
 *   - create-from-quote: förklarar REALITY-WEEK #2 ("onQuoteAccepted vinner
 *     racet" — den andra skaparen kraschade helt enkelt)
 *   - create-from-lead: lead→projekt har aldrig fungerat i prod
 *   - maybe-create-from-booking: bokning→projekt har aldrig fungerat i prod
 *
 *   npx playwright test tests/facit-project-create-no-phantom-columns.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

/** Plockar ut varje `.from('project')…​.insert({ … })`-block ur en källfil. */
function projectInsertBlocks(src: string): string[] {
  const blocks: string[] = []
  // Literal insert ELLER insert via variabel (`let projectData: any = {` i
  // app/api/projects/route.ts) — båda formerna skannas.
  const re = /(\.from\('project'\)\s*\.insert\(\{|let projectData: any = \{)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const start = m.index
    // Hitta den matchande stängningen av objektet (enkel klammer-räkning).
    let depth = 0
    let i = src.indexOf('{', start + m[0].length - 1)
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') { depth--; if (depth === 0) break }
    }
    blocks.push(src.slice(start, i + 1))
  }
  return blocks
}

// project-ai-engine.ts (onQuoteAccepted) skapar inte längre projekt själv —
// den delegerar till create-from-quote sedan 2026-08-26 (en skapare per
// signerad offert). Låst separat nedan.
const CREATORS = [
  'lib/projects/create-from-quote.ts',
  'lib/projects/create-from-lead.ts',
  'lib/projects/maybe-create-from-booking.ts',
  'lib/autopilot/trigger.ts',
  'lib/e2e-deal-flow.ts',
  'app/api/projects/route.ts',
]

test.describe('project-insert utan fantomkolumner', () => {
  for (const fil of CREATORS) {
    test(`${fil}: inget \`address:\` i något project-insert`, () => {
      const blocks = projectInsertBlocks(read(fil))
      expect(blocks.length, `${fil} har inget .from('project').insert({…})`).toBeGreaterThan(0)
      for (const b of blocks) {
        expect(b, `${fil} skriver address: (kolumnen finns inte i project)`).not.toMatch(/^\s*address:/m)
      }
    })
  }

  test('project-ai-engine.ts har inget eget project-insert längre (delegerar till create-from-quote)', () => {
    expect(projectInsertBlocks(read('lib/project-ai-engine.ts'))).toHaveLength(0)
  })

  test('maybe-create-from-booking läser customer.address_line, inte den döda customer.address', () => {
    const s = read('lib/projects/maybe-create-from-booking.ts')
    expect(s).not.toMatch(/\.select\('name, address'\)/)
    expect(s).toContain(".select('name, address_line')")
  })

  test('adressen bevaras i source_lead_data i stället', () => {
    expect(read('lib/projects/create-from-quote.ts')).toContain('project_address: quote.project_address || null')
    expect(read('lib/projects/create-from-lead.ts')).toContain('lead_address: lead.address || null')
    expect(read('lib/projects/maybe-create-from-booking.ts')).toContain('customer_address: cust?.address_line || null')
  })
})
