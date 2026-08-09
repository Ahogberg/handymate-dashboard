/**
 * Facit för "exakt ett projekt per accepterad offert" (2026-08-09,
 * projektauditen P0-2).
 *
 * ═══ VAD SOM VAR FEL ═══
 *
 * Tre skapare kunde göra projekt ur samma offert — signeringsvägen,
 * autopiloten och deal-flödet — alla tre check-then-insert, och deal-flödet
 * kollade dessutom bara deal_id: ett projekt från signeringsvägen (som inte
 * sätter deal_id) syntes inte alls där. Två projekt ur samma offert är
 * förstadiet till två fakturor för samma arbete.
 *
 * Regeln bor nu i databasen (sql/v103, partiellt unikt index) och alla tre
 * skaparna fångar 23505 som ett lugnt "finns redan" i stället för ett fel.
 *
 *   npx playwright test tests/ett-projekt-per-offert.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const kod = (p: string) =>
  read(p)
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')

const SKAPARNA = [
  'lib/projects/create-from-quote.ts',
  'lib/autopilot/trigger.ts',
  'lib/e2e-deal-flow.ts',
]

test.describe('regeln bor i databasen', () => {
  test('v103 skapar det partiella unika indexet', () => {
    const sql = read('sql/v103_ett_projekt_per_offert.sql')
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS project_one_per_quote')
    expect(sql).toContain('(business_id, quote_id)')
    expect(sql).toContain('WHERE quote_id IS NOT NULL')
  })

  test('v103 kräver dubblettlistan FÖRE indexet', () => {
    // Indexet failar om prod redan har dubbletter — migrationen måste tvinga
    // fram titten innan regeln slås på, och städvägen är quote_id=NULL,
    // aldrig DELETE.
    const sql = read('sql/v103_ett_projekt_per_offert.sql')
    const lista = sql.indexOf('HAVING COUNT(*) > 1')
    const index = sql.indexOf('CREATE UNIQUE INDEX')
    expect(lista).toBeGreaterThan(-1)
    expect(lista, 'dubblettlistan kommer efter indexet').toBeLessThan(index)
    expect(sql).toContain('SET quote_id = NULL')
    expect(sql).not.toMatch(/DELETE FROM public\.project/)
  })
})

test.describe('skaparna möter kollisionen lugnt', () => {
  for (const fil of SKAPARNA) {
    test(`${fil} fångar 23505 och återanvänder vinnaren`, () => {
      const s = kod(fil)
      expect(s, `${fil} hanterar inte unik-kollisionen`).toContain("'23505'")
      // Återhämtningen ska SLÅ UPP det befintliga projektet, inte bara svälja
      // felet — annars fortsätter flödet utan projekt-id.
      const kollision = s.indexOf("'23505'")
      const uppslag = s.indexOf("from('project')", kollision)
      expect(uppslag, `${fil} slår inte upp vinnaren efter kollisionen`).toBeGreaterThan(kollision)
    })
  }

  test('deal-flödets dedup ser även offerten, inte bara dealen', () => {
    const s = kod('lib/e2e-deal-flow.ts')
    expect(s).toContain('quote_id.eq.${deal.quote_id}')
  })

  test('deal-flödet pekar dealen på vinnaren vid kollision', () => {
    // Utan omlänkningen står dealen kvar utan project_id och flödets nästa
    // steg skapar ett nytt försök nästa körning.
    const s = kod('lib/e2e-deal-flow.ts')
    const kollision = s.indexOf("insertErr.code === '23505'")
    const lank = s.indexOf("update({ project_id: vinnare.project_id })", kollision)
    expect(lank).toBeGreaterThan(kollision)
  })
})
