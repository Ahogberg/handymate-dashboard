/**
 * Facit: projektöversikten — uppgifter synliga där dagen börjar, projektnumret
 * synligt och sant (2026-08-27).
 *
 * Bakgrund: efter statusbandet (26 aug) var "Att göra" på Översikt bara
 * agenternas kort; uppgiftsytan låg gömd under Planering. Projektnumret
 * renderades ingenstans på sidan, söktes inte i listan, dubblerades i
 * pipelinen ("P-P-1042") och saknades på 19 av 37 projekt i prod.
 *
 *   npx playwright test tests/facit-projekt-uppgifter-nummer.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')
const sida = () => kod('app/dashboard/projects/[id]/page.tsx')

test.describe('uppgifter — hantverkarens egna, ovanför agenternas förslag', () => {
  test('Översikt renderar ProjectTasksBlock före ProjectTodoBlock, matad ur sidans projectTasks', () => {
    const s = sida()
    const block = s.indexOf('<ProjectTasksBlock')
    const todo = s.indexOf('<ProjectTodoBlock')
    expect(block).toBeGreaterThan(-1)
    expect(block).toBeLessThan(todo)
    expect(s).toContain('tasks={projectTasks}')
    expect(s).toContain('onChanged={fetchProjectTasks}')
    expect(s).toContain("onOpenAll={() => setActiveTab('tasks')}")
  })

  test('Uppgifter är en egen flik — inte gömd under Planering', () => {
    const s = sida()
    expect(s).toContain("{ key: 'tasks', label: 'Uppgifter', tabs: ['tasks'] }")
    expect(s).toContain("{ key: 'planning', label: 'Planering', tabs: ['milestones', 'schedule', 'arbetsorder'] }")
    expect(s).toContain("{/* === TAB: Uppgifter === */}\n        {activeGroup === 'tasks' && (")
    // Räknaren i flikraden
    expect(s).toMatch(/case 'tasks': \{[\s\S]*?`\$\{open\} öppna`/)
    // Hämtas på Översikt och i fliken
    expect(s).toContain("if (activeGroup === 'overview' || activeGroup === 'tasks') {\n      fetchProjectTasks()")
  })

  test('"Ny uppgift" är en snabbåtgärd och Mina uppgifter finns i sidomenyn', () => {
    const s = sida()
    expect(s).toContain('Ny uppgift')
    expect(s).toContain('focusSignal={nyUppgiftFokus}')
    expect(kod('components/Sidebar.tsx')).toContain("{ label: 'Mina uppgifter', href: '/dashboard/tasks' }")
    expect(kod('components/projects/ProjectTodoBlock.tsx')).toContain('>Väntar på ditt OK</h2>')
  })

  test('blocket skriver bara genom /api/tasks och kräver aldrig mer än en titel', () => {
    const b = kod('components/projects/ProjectTasksBlock.tsx')
    expect(b).toContain("fetch('/api/tasks', {\n        method: 'POST'")
    expect(b).toContain("fetch('/api/tasks', {\n        method: 'PUT'")
    expect(b).toContain("visibility: 'project'")
    expect(b).not.toMatch(/from\('task'\)|supabase/)
    expect(b).toContain('disabled={saving || !title.trim()}')
  })
})

test.describe('projektnumret — synligt, sökbart, sant', () => {
  test('headern visar numret som kopierbar chip; interfacet typar fältet', () => {
    const s = sida()
    expect(s).toContain('project_number: string | null')
    expect(s).toContain('data-testid="project-number-chip"')
    expect(s).toContain('navigator.clipboard?.writeText(project.project_number as string)')
  })

  test('listan söker på numret och visar det tydligt; pipelinen dubblerar inte prefixet', () => {
    const l = kod('app/dashboard/projects/page.tsx')
    expect(l).toContain("(p.project_number || '').toLowerCase().includes(q)")
    expect(l).not.toContain('text-xs font-mono text-slate-400 flex-shrink-0">{project.project_number}')
    for (const f of ['components/pipeline/unified/ProjectStageModal.tsx', 'components/pipeline/unified/FlowPipeline.tsx']) {
      expect(kod(f), f).not.toMatch(/P-\{[^}]*project_number\}/)
    }
  })

  test('databasen garanterar numret (v176): trigger + backfill ur räknaren + unikt per företag; skaparen tappar det aldrig tyst', () => {
    const sql = kod('sql/v176_project_number_truth.sql')
    expect(sql).toContain('CREATE TRIGGER trg_project_assign_number')
    expect(sql).toContain("'P-' || public.increment_counter(NEW.business_id, 'project')")
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_project_number_per_business')
    expect(sql).not.toMatch(/ROW_NUMBER\(\)/)
    const r = kod('app/api/projects/route.ts')
    expect(r).not.toContain('delete projectData.project_number')
    expect(r).not.toContain('retrying without')
  })

  test('kunden ser ärendenumret i portalen', () => {
    expect(kod('app/api/portal/[token]/projects/route.ts')).toContain("'project_id, project_number, name,")
    expect(kod('app/portal/[token]/components/PortalProjectDetail.tsx')).toContain('Ärende {project.project_number}')
    expect(kod('app/portal/[token]/components/PortalHome.tsx')).toContain('Ärende {activeProject.project_number}')
  })
})
