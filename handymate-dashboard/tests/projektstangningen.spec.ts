/**
 * Facit för projektstängningens övergångssemantik (2026-08-09,
 * projektauditen P2-4).
 *
 * ═══ VAD SOM VAR FEL ═══
 *
 * PUT /api/projects eldade ALLA stängnings-sidoeffekter varje gång
 * body.status var 'completed' — även när projektet redan var stängt.
 * job_completed-eventet dubblerade recensionsbegäran och nurture per klick.
 * Och en återöppning nollade completed_at helt tyst, medan fakturan, det
 * frysta utfallet och recensionsbegäran låg kvar.
 *
 *   npx playwright test tests/projektstangningen.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const kod = (p: string) =>
  fs.readFileSync(path.join(ROOT, p), 'utf8')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')

const PUT = 'app/api/projects/route.ts'
const COMMAND = 'lib/projects/complete-project.ts'

/** PUT-hanteraren — från föregående-uppslaget och nedåt. */
function hanteraren(): string {
  const s = kod(PUT)
  const i = s.indexOf('const varRedanKlart')
  expect(i, 'föregående-tillstånd-vakten saknas').toBeGreaterThan(-1)
  return s.slice(i)
}

test.describe('sidoeffekter eldas på övergången, inte på statusen', () => {
  test('föregående tillstånd hämtas FÖRE uppdateringen', () => {
    const s = kod(PUT)
    const uppslag = s.indexOf("select('status, completed_at')")
    const uppdatering = s.indexOf('completeProject(')
    expect(uppslag, 'föregående status slås aldrig upp').toBeGreaterThan(-1)
    expect(uppslag).toBeLessThan(uppdatering)
  })

  test('job_completed-kedjan vaktas av blirKlart', () => {
    const route = hanteraren()
    const command = kod(COMMAND)
    expect(route).toContain('if (blirKlart)')
    expect(route).toContain('completeProject(')
    expect(route).not.toContain('fireEvent')

    // 2026-08-25: or() ersatt av neq+is-null (två atomära försök) — se
    // canonical-project-completion.spec.ts för PostgREST-bugg-motiveringen.
    const compareAndSet = command.indexOf(".neq('status', 'completed')")
    const eventBlock = command.indexOf("fireEvent(supabase, 'job_completed'")
    expect(compareAndSet).toBeGreaterThan(-1)
    expect(eventBlock).toBeGreaterThan(compareAndSet)
  })

  test('four-eyes-grinden prövas bara på övergången', () => {
    const route = hanteraren()
    expect(route.indexOf('if (blirKlart)')).toBeLessThan(route.indexOf('completeProject('))
    expect(kod(COMMAND)).toContain("if (authorization.kind === 'direct')")
  })

  test('upprepad stängning skriver inte om stängningsdatumet', () => {
    const command = kod(COMMAND)
    // 2026-08-25: or() ersatt av neq+is-null — samma vakt, ny filterform.
    expect(command).toContain(".neq('status', 'completed')")
    expect(command).toContain(".is('status', null)")
    expect(command).toContain('already_completed: true')
    expect(command).toContain('effects: []')
  })
})

test.describe('återöppning är synlig, inte tyst', () => {
  test('reopen loggar vad som INTE rullas tillbaka', () => {
    const h = hanteraren()
    expect(h).toContain('aterOppnas')
    expect(h).toContain('rullas INTE tillbaka')
  })
})

test.describe('detaljen skiljer tomt från trasigt (P2-3)', () => {
  test('barnfrågorna körs parallellt och delfel redovisas', () => {
    const s = kod('app/api/projects/[id]/route.ts')
    expect(s).toContain('Promise.all')
    expect(s).toContain('partial_errors: partialErrors')
    // Varje failad sektion loggas med namn — inte sväljs.
    expect(s).toContain('partialErrors.push(namn)')
  })
})

test.describe('fas-flytten syns direkt (P2-2)', () => {
  test('modalen bär onChanged och anropar den efter LYCKAD flytt', () => {
    const s = kod('components/pipeline/unified/ProjectStageModal.tsx')
    const flytt = s.indexOf('await fetchWorkflow(projectId)')
    const krok = s.indexOf('onChanged?.()')
    expect(krok, 'onChanged anropas aldrig').toBeGreaterThan(-1)
    // Efter refetchen, i success-grenen — inte i catch/finally.
    expect(krok).toBeGreaterThan(flytt)
    const felgren = s.indexOf('Kunde inte flytta stage', flytt)
    expect(krok).toBeLessThan(felgren)
  })

  test('projektsidan pekar kroken på sin egen refetch', () => {
    const s = kod('app/dashboard/projects/[id]/page.tsx')
    expect(s).toContain('onChanged={fetchProjectData}')
  })
})
