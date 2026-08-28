/**
 * Facit: uppgifters synlighet och ändringsrätt (2026-08-28).
 * Ägare/admin ser allt; anställd ser egna + projekt hen leder; samma gräns
 * för PUT/DELETE — ett id räcker inte längre.
 *
 *   npx playwright test tests/facit-uppgifter-synlighet.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { canSeeTask, canEditTask, taskListOrFilter, type TaskScope } from '../lib/tasks/visibility'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const agare: TaskScope = { mode: 'all', memberId: 'bu_owner', userId: 'u_owner', leadProjectIds: [] }
const anstalld: TaskScope = { mode: 'own', memberId: 'bu_emp', userId: 'u_emp', leadProjectIds: ['p_lead'] }

test.describe('rena regler', () => {
  test('ägaren ser allt utom andras privata; anställd ser egna, skapade och projekt hen leder', () => {
    expect(canSeeTask({ assigned_to: 'bu_x', created_by: 'u_x', project_id: 'p1', visibility: 'project' }, agare)).toBe(true)
    expect(canSeeTask({ assigned_to: 'bu_x', created_by: 'u_x', visibility: 'private' }, agare)).toBe(false)
    expect(canSeeTask({ assigned_to: 'bu_emp', created_by: 'u_x', project_id: 'p1', visibility: 'project' }, anstalld)).toBe(true)
    expect(canSeeTask({ assigned_to: 'bu_x', created_by: 'u_emp', project_id: 'p1', visibility: 'project' }, anstalld)).toBe(true)
    expect(canSeeTask({ assigned_to: 'bu_x', created_by: 'u_x', project_id: 'p_lead', visibility: 'project' }, anstalld)).toBe(true)
    expect(canSeeTask({ assigned_to: 'bu_x', created_by: 'u_x', project_id: 'p1', visibility: 'project' }, anstalld)).toBe(false)
    // Privat i ett projekt hen leder — fortfarande bara skaparen/den tilldelade
    expect(canSeeTask({ assigned_to: 'bu_x', created_by: 'u_x', project_id: 'p_lead', visibility: 'private' }, anstalld)).toBe(false)
  })

  test('ändringsrätt = synlighet; listfiltret speglar samma gräns och blir aldrig "allt" utan identitet', () => {
    expect(canEditTask({ assigned_to: 'bu_x', created_by: 'u_x', project_id: 'p1' }, anstalld)).toBe(false)
    expect(canEditTask({ assigned_to: 'bu_x', created_by: 'u_x', project_id: 'p_lead' }, anstalld)).toBe(true)
    expect(taskListOrFilter(agare)).toBeNull()
    expect(taskListOrFilter(anstalld)).toBe('assigned_to.eq.bu_emp,created_by.eq.u_emp,project_id.in.(p_lead)')
    expect(taskListOrFilter({ mode: 'own', memberId: null, userId: null, leadProjectIds: [] })).toBe('id.eq.__ingen__')
  })
})

test.describe('rutten använder en sanning', () => {
  const r = kod('app/api/tasks/route.ts')
  test('GET listar genom resolveTaskScope + taskListOrFilter + canSeeTask och svarar med scope', () => {
    expect(r).toContain('resolveTaskScope(')
    expect(r).toContain('taskListOrFilter(scope)')
    expect(r).toContain('.filter((t: any) => canSeeTask(t, scope))')
    expect(r).toContain('scope: scope.mode')
    expect(r).not.toContain("const isEmployee = currentUser?.role === 'employee'")
  })
  test('PUT och DELETE stoppas av canEditTask med svensk 403', () => {
    const put = r.slice(r.indexOf('export async function PUT'), r.indexOf('export async function DELETE'))
    const del = r.slice(r.indexOf('export async function DELETE'))
    for (const [namn, blok] of [['PUT', put], ['DELETE', del]] as const) {
      expect(blok, namn).toContain('canEditTask(')
      expect(blok, namn).toContain('Du kan bara ändra dina egna uppgifter')
      expect(blok.indexOf('canEditTask('), namn).toBeLessThan(blok.indexOf(namn === 'PUT' ? '.update(' : '.delete()'))
    }
    // DELETE måste läsa fälten kontrollen behöver, inte bara titeln
    expect(del).toContain("select('title, assigned_to, created_by, project_id, visibility')")
  })
  test('projektblocket säger ärligt när man bara ser sina egna', () => {
    expect(kod('components/projects/ProjectTasksBlock.tsx')).toContain("scope === 'own'")
    expect(kod('app/dashboard/projects/[id]/page.tsx')).toContain('scope={taskScope}')
  })
})
