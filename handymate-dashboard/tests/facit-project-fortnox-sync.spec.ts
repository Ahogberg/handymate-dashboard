/**
 * Facit: projekt i Fortnox projektregister + märkning på det vi skickar
 * (steg 3 i leverantörsfaktura-kedjan, 2026-08-26).
 *
 *   npx playwright test tests/facit-project-fortnox-sync.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

test.describe('sql/v172 — kolumnerna finns innan koden skriver dem', () => {
  const sql = read('sql/v172_project_fortnox.sql')
  for (const col of ['fortnox_project_number', 'fortnox_synced_at', 'fortnox_sync_error']) {
    test(`ADD COLUMN IF NOT EXISTS ${col}`, () => {
      expect(sql).toMatch(new RegExp(`ALTER TABLE project ADD COLUMN IF NOT EXISTS ${col}\\s+`))
    })
  }
})

test.describe('syncProjectToFortnox — samma kontrakt som kundsynken', () => {
  const s = read('lib/fortnox.ts')
  const fn = s.slice(s.indexOf('export async function syncProjectToFortnox'), s.indexOf('// INVOICE SYNC FUNCTIONS'))

  test('idempotent via fortnox_project_number-vakten; ProjectNumber = siffrorna i vårt nummer', () => {
    expect(fn).toContain('if (project.fortnox_project_number) {')
    expect(fn).toContain('fortnoxProjectNumberFor(project.project_number)')
    expect(s).toContain("const digits = String(projectNumber).replace(/\\D/g, '')")
  })

  test('UPDATE:en efter Fortnox-skapandet läser error → success:false + driftlarm (aldrig dubblett)', () => {
    const upd = fn.indexOf('fortnox_project_number: created.ProjectNumber')
    expect(upd).toBeGreaterThan(-1)
    const efter = fn.slice(upd)
    expect(efter).toContain('if (updateError)')
    const felgren = efter.slice(efter.indexOf('if (updateError)'), efter.indexOf('return { success: true'))
    expect(felgren).toContain('success: false')
    expect(felgren).toContain("'fortnox:project-number-not-persisted'")
  })

  test('båda UPDATE:arna är tenant-scopade', () => {
    const updates = fn.split(".from('project')").slice(1).filter(b => b.trimStart().startsWith('.update('))
    expect(updates.length).toBeGreaterThanOrEqual(2)
    for (const u of updates) expect(u.slice(0, 400)).toContain(".eq('business_id', businessId)")
  })

  test('utan projektnummer → skipped, inte ett fel eller en gissning', () => {
    expect(fn).toContain("skipped: true, error: 'project_number_missing'")
  })
})

test.describe('hooken + skyddsnätet', () => {
  test('syncNewProjectToFortnox kortsluter på fortnox_connected och eskalerar äkta fel', () => {
    const s = read('lib/fortnox/sync.ts')
    const fn = s.slice(s.indexOf('export async function syncNewProjectToFortnox'), s.indexOf('export async function batchSync'))
    expect(fn.indexOf("select('fortnox_connected')")).toBeGreaterThan(-1)
    expect(fn).toContain("'project-create:fortnox-sync'")
    expect(fn).toContain('catch (err: unknown)')
  })

  const vagar: Array<{ fil: string; efter: string }> = [
    { fil: 'lib/projects/create-from-quote.ts', efter: "if (insertErr.code === '23505')" },
    { fil: 'lib/projects/create-from-lead.ts', efter: "return { success: false, error: insertError?.message || 'Kunde inte skapa projekt' }" },
    { fil: 'lib/projects/maybe-create-from-booking.ts', efter: "reason = 'created_minimal'" },
    { fil: 'app/api/projects/route.ts', efter: "console.error('[projects POST] stage init error (non-blocking):', err)" },
  ]
  for (const v of vagar) {
    test(`${v.fil} synkar projektet till Fortnox efter lyckad insert`, () => {
      const s = read(v.fil)
      const anchor = s.indexOf(v.efter)
      const hook = s.indexOf('syncNewProjectToFortnox(', anchor)
      expect(anchor).toBeGreaterThan(-1)
      expect(hook).toBeGreaterThan(anchor)
      expect(s.slice(anchor, hook)).toContain('try {')
    })
  }

  test('batchSync har en project-gren i skapandeordning; cronen kör den', () => {
    const s = read('lib/fortnox/sync.ts')
    const gren = s.slice(s.indexOf("if (entityType === 'project')"), s.indexOf('// Sync invoices'))
    expect(gren).toContain(".is('fortnox_project_number', null)")
    expect(gren).toContain(".order('created_at', { ascending: true })")
    expect(gren).toContain('projectsError')
    const cron = read('app/api/cron/fortnox-sync/route.ts')
    expect(cron).toContain("batchSync(biz.business_id, 'project')")
    expect(cron).toContain('total_projects_synced')
  })
})

test.describe('märkning på det vi skickar — aldrig gissad', () => {
  test('materialbeställningen bär projektnumret (via offerten) i ämne + infobox', () => {
    const s = read('app/api/orders/send/route.ts')
    expect(s).toContain("if (proj?.project_number) markning = proj.project_number")
    expect(s).toContain('Märkning: ${markning}')
    expect(s).toContain('Märkning (ange på fakturan):')
  })
  test('arbetsordern till underentreprenören bär projektnumret', () => {
    const s = read('app/api/work-orders/[id]/send/route.ts')
    expect(s).toContain(".select('name, project_number')")
    expect(s).toContain('Märkning på fakturan: ${project.project_number}')
  })
  test('kundfakturan bokförs på samma Fortnox-projekt (bara när numret finns)', () => {
    const s = read('lib/invoices/sync-to-fortnox.ts')
    expect(s).toContain("select('fortnox_project_number')")
    expect(s).toContain('Project: fortnoxProjectNumber || undefined')
  })
  test('matchningen använder det exakta Fortnox-numret först', () => {
    expect(read('lib/fortnox/match-supplier-invoice.ts')).toContain('fortnox_project_number || \'\').trim() === fortnoxNo')
    expect(read('lib/fortnox/import-supplier-invoices.ts')).toContain("select('project_id, project_number, fortnox_project_number')")
  })
})
