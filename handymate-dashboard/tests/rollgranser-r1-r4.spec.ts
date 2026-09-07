/**
 * Rollgränser R1–R4 — facit för rollgranskningen 2026-09-07
 * (docs/security/role-audit-2026-09-07, Codex draft-PR #22).
 *
 * Fyra luckor reproducerades i riktiga handlers med syntetisk databas:
 *  R1 projektdetaljen kringgick tilldelning och lämnade ekonomifält råa
 *  R2 projektradering saknade rollgräns
 *  R3 teamlistan lämnade ut invite_token till alla i firman
 *  R4 egen profiländring returnerade dold intern timkostnad
 *
 * De 60 befintliga behörighetskontrakten passerade samtidigt — de kollar att
 * en grind FINNS, inte vad som läcker förbi den. Den här filen kollar båda:
 * rena tester av projektionerna, och källskanning som kräver att rutterna
 * faktiskt använder dem på rätt plats.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/rollgranser-r1-r4.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { projiceraMedlem, projiceraMedlemmar, LONEKOSTNADSFALT } from '../lib/team/member-projection'
import { projiceraProjektdetalj } from '../lib/projects/ekonomiprojektion'
import type { BusinessUser } from '../lib/permissions'

const ROOT = path.join(__dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

function anvandare(role: string, flaggor: Partial<BusinessUser> = {}): BusinessUser {
  return {
    id: 'bu-1', business_id: 'biz-a', user_id: 'auth-1', role,
    name: 'Test', email: 't@example.com', phone: null, title: null,
    hourly_cost: null, hourly_rate: null, color: null, avatar_url: null,
    is_active: true,
    can_see_all_projects: false, can_see_financials: false, can_manage_users: false,
    can_approve_time: false, can_create_invoices: false,
    invite_token: null, invite_expires_at: null, invited_at: null, accepted_at: null,
    last_login_at: null, created_at: '2026-09-07T00:00:00Z',
    ...flaggor,
  } as BusinessUser
}

const rad = {
  id: 'bu-2', role: 'admin', name: 'Väntande admin',
  internal_hourly_cost: 350, hourly_cost: 350, hourly_wage: 32000, ob1_rate: 40,
  invite_token: 'SYNTHETIC-PENDING-TOKEN', accepted_at: null,
}

test.describe('R3/R4 — medlemsprojektionen', () => {
  test('anställd utan manage_users får varken token eller lönekostnad, men vet att inbjudan väntar', () => {
    const ut = projiceraMedlem(rad, anvandare('employee'))
    expect(ut.invite_token).toBeNull()
    expect(ut.invite_pending).toBe(true)
    for (const f of LONEKOSTNADSFALT) if (f in rad) expect((ut as Record<string, unknown>)[f]).toBeNull()
  })

  test('PM med see_financials ser ändå ingen lönekostnad (Andreas spec 2026-05-21)', () => {
    const ut = projiceraMedlem(rad, anvandare('project_manager', { can_see_financials: true }))
    expect(ut.internal_hourly_cost).toBeNull()
    expect(ut.hourly_cost).toBeNull()
  })

  test('anställd med manage_users ser token men inte lönekostnad', () => {
    const ut = projiceraMedlem(rad, anvandare('employee', { can_manage_users: true }))
    expect(ut.invite_token).toBe('SYNTHETIC-PENDING-TOKEN')
    expect(ut.internal_hourly_cost).toBeNull()
  })

  test('owner och admin ser allt', () => {
    for (const role of ['owner', 'admin'] as const) {
      const ut = projiceraMedlem(rad, anvandare(role))
      expect(ut.invite_token).toBe('SYNTHETIC-PENDING-TOKEN')
      expect(ut.internal_hourly_cost).toBe(350)
      expect(ut.hourly_wage).toBe(32000)
    }
  })

  test('okänd betraktare (null) behandlas som obehörig — en token läcker aldrig av osäkerhet', () => {
    const ut = projiceraMedlem(rad, null)
    expect(ut.invite_token).toBeNull()
    expect(ut.internal_hourly_cost).toBeNull()
    expect(ut.invite_pending).toBe(true)
  })

  test('accepterad inbjudan är inte väntande', () => {
    const ut = projiceraMedlem({ ...rad, accepted_at: '2026-09-01T00:00:00Z' }, anvandare('employee'))
    expect(ut.invite_pending).toBe(false)
  })

  test('listprojektionen projicerar varje rad', () => {
    const ut = projiceraMedlemmar([rad, { ...rad, id: 'bu-3' }], anvandare('employee'))
    expect(ut).toHaveLength(2)
    expect(ut.every(m => m.invite_token === null && m.internal_hourly_cost === null)).toBe(true)
  })
})

test.describe('R3/R4 — rutten och UI:t använder projektionen', () => {
  const route = read('app/api/team/route.ts')

  test('GET och PATCH svarar genom projektionen, ingen egen strippning kvar', () => {
    expect(route).toMatch(/projiceraMedlemmar\(members \|\| \[\], currentUser\)/)
    expect(route).toMatch(/member: projiceraMedlem\(member, currentUser\)/)
    expect(route).not.toMatch(/internal_hourly_cost: null, hourly_cost: null/)
  })

  test('PATCH-svaret från .select() går aldrig ut rått', () => {
    const patch = route.slice(route.indexOf('export async function PATCH'), route.indexOf('export async function DELETE'))
    expect(patch).not.toMatch(/NextResponse\.json\(\{ member \}\)/)
  })

  test('teamsidan läser invite_pending, inte token, för Inbjuden-läget', () => {
    for (const rel of ['app/dashboard/team/page.tsx', 'app/dashboard/team/components/helpers.ts']) {
      const src = read(rel)
      expect(src, rel).not.toMatch(/invite_token && !\w+\.accepted_at/)
      expect(src, rel).toMatch(/invite_pending/)
    }
  })
})

test.describe('R1 — ekonomiprojektionen av projektdetaljen', () => {
  const svar = {
    project: { project_id: 'p', name: 'Solvägen', budget_amount: 9000, budget_hours: 40, actual_hours: 12, actual_labor_cost: 4000, actual_material_cost: 500, profitability_status: 'ok', status: 'active' },
    quote: { quote_id: 'q', title: 'Offert', status: 'accepted', total: 12000, labor_total: 8000 },
    milestones: [{ milestone_id: 'm', name: 'Rivning', budget_hours: 10, budget_amount: 3000, actual_hours: 4, actual_revenue: 3200 }],
    time_entries: [{ time_entry_id: 't', duration_minutes: 60, is_billable: true, hourly_rate: 800, cost_rate: 350 }],
    materials: [{ material_id: 'mat', name: 'Kabel', quantity: 3, unit: 'm', purchase_price: 100, sell_price: 160, markup_percent: 60, total_purchase: 300, total_sell: 480 }],
    changes: [],
    prices_redacted: true as const,
    summary: { total_hours: 1 },
  }

  test('redacted: inget beloppsfält kvar i något underobjekt, timmar behålls', () => {
    const ut = projiceraProjektdetalj(svar, true)
    expect(ut.project).not.toHaveProperty('budget_amount')
    expect(ut.project).not.toHaveProperty('actual_labor_cost')
    expect(ut.project).not.toHaveProperty('profitability_status')
    expect(ut.project.actual_hours).toBe(12)
    expect(ut.quote).toEqual({ quote_id: 'q', title: 'Offert', status: 'accepted' })
    expect(ut.milestones[0]).not.toHaveProperty('actual_revenue')
    expect(ut.milestones[0]).not.toHaveProperty('budget_amount')
    expect(ut.milestones[0].actual_hours).toBe(4)
    expect(ut.time_entries[0]).not.toHaveProperty('hourly_rate')
    expect(ut.time_entries[0]).not.toHaveProperty('cost_rate')
    expect(ut.time_entries[0].duration_minutes).toBe(60)
    for (const f of ['purchase_price', 'sell_price', 'markup_percent', 'total_purchase', 'total_sell']) {
      expect(ut.materials[0]).not.toHaveProperty(f)
    }
    expect(ut.materials[0].quantity).toBe(3)
    expect(JSON.stringify(ut)).not.toMatch(/12000|9000|3200|800|480|350/)
  })

  test('inte redacted: svaret är oförändrat', () => {
    expect(projiceraProjektdetalj(svar, false)).toBe(svar)
  })

  test('null-offert tål projektionen', () => {
    expect(projiceraProjektdetalj({ ...svar, quote: null }, true).quote).toBeNull()
  })
})

test.describe('R1/R2 — rutterna grindar innan de läser eller raderar', () => {
  test('projektdetaljen kräver tilldelning utan see_all_projects, före barnfrågorna', () => {
    const src = read('app/api/projects/[id]/route.ts')
    const grind = src.indexOf("!hasPermission(currentUser, 'see_all_projects')")
    const tilldelning = src.indexOf(".from('project_assignment')")
    const barn = src.indexOf("BARNFRÅGORNA")
    expect(grind).toBeGreaterThan(0)
    expect(tilldelning).toBeGreaterThan(grind)
    expect(barn).toBeGreaterThan(tilldelning)
    // Tilldelningen slås upp för rätt person i rätt firma.
    const block = src.slice(tilldelning, tilldelning + 400)
    expect(block).toMatch(/\.eq\('business_id', business\.business_id\)/)
    expect(block).toMatch(/\.eq\('business_user_id', currentUser\.id\)/)
    // Nekas som "not found" — samma svar som fel firma, avslöjar inte att projektet finns.
    expect(block).toMatch(/status: 404/)
    // Läsfel på tilldelningen kastas — aldrig "ingen rad = ingen tilldelning".
    expect(block).toMatch(/if \(assignmentError\) throw assignmentError/)
  })

  test('saknad medlemsidentitet nekas om inte servern bevisat impersonering (beslut Andreas 2026-09-07)', () => {
    const src = read('app/api/projects/[id]/route.ts')
    const nullGrind = src.indexOf('!currentUser && !business._impersonation')
    expect(nullGrind).toBeGreaterThan(0)
    expect(src.slice(nullGrind, nullGrind + 300)).toMatch(/status: 404/)
    // Grinden ligger före tilldelningsuppslaget — inte efter.
    expect(nullGrind).toBeLessThan(src.indexOf(".from('project_assignment')"))
    // Inget "!currentUser ||"-degraderande mönster får smyga in i detaljen.
    expect(src).not.toMatch(/!currentUser \|\| hasPermission/)
  })

  test('projektdetaljens svar går genom ekonomiprojektionen med redacted-flaggan', () => {
    const src = read('app/api/projects/[id]/route.ts')
    expect(src).toMatch(/NextResponse\.json\(projiceraProjektdetalj\(\{/)
    expect(src).toMatch(/\}, redacted\)\)/)
  })

  test('projekt-DELETE kräver owner/admin före första raderingen', () => {
    const src = read('app/api/projects/route.ts')
    const del = src.slice(src.indexOf('export async function DELETE'))
    const grind = del.indexOf('!actor || !isOwnerOrAdmin(actor) || business._impersonation')
    const forstaRadering = del.indexOf('.delete()')
    expect(grind, 'null-aktör och impersonering nekas, inte bara fel roll').toBeGreaterThan(0)
    expect(forstaRadering).toBeGreaterThan(grind)
    expect(del.slice(grind, grind + 200)).toMatch(/status: 403/)
  })
})

// Kör den riktiga list-handlern: källskanning ensam missade null-luckan.
import ts from 'typescript'
import { NextRequest } from 'next/server'
import { hasPermission } from '../lib/permissions'
import * as ekonomiprojektion from '../lib/projects/ekonomiprojektion'

function projektlista(actor: BusinessUser | null, impersonation = false) {
  const operations: any[] = []
  const scopes: unknown[] = []
  const rows = [
    { project_id: 'p1', business_id: 'biz-a', name: 'Tilldelat', budget_amount: 120000, budget_hours: 40, actual_labor_cost: 4321, actual_material_cost: 8765, profitability_status: 'over_budget' },
    { project_id: 'p2', business_id: 'biz-a', name: 'Otilldelat', budget_amount: 90000 },
  ]
  const db = { from(table: string) {
    operations.push([table, 'from'])
    const filters: Array<[string, string, any]> = []
    const q: any = { then(resolve: any) {
      let data: any[] = table === 'project' ? rows : table === 'project_assignment' ? [{ project_id: 'p1' }] : []
      if (table === 'project') for (const [method, column, value] of filters) {
        if (method === 'eq') data = data.filter(row => row[column] === value)
        if (method === 'in') data = data.filter(row => value.includes(row[column]))
      }
      return Promise.resolve({ data, error: null }).then(resolve)
    } }
    for (const method of ['select', 'eq', 'in', 'order', 'not', 'limit', 'lte', 'neq', 'or']) {
      q[method] = (...args: any[]) => { operations.push([table, method, ...args]); filters.push([method, args[0], args[1]]); return q }
    }
    return q
  } }
  const mocks: Record<string, any> = {
    '@/lib/auth': { getAuthenticatedBusiness: async () => ({ business_id: 'biz-a', ...(impersonation ? { _impersonation: { admin_user_id: 'verified-admin', admin_email: 'support@example.com' } } : {}) }) },
    '@/lib/supabase': { getServerSupabase: () => db },
    '@/lib/permissions': { getCurrentUser: async (_request: NextRequest, businessId?: string) => { scopes.push(businessId); return actor }, hasPermission },
    '@/lib/projects/ekonomiprojektion': ekonomiprojektion,
    '@/lib/projects/derive-lifecycle': { deriveProjectLifecycle: () => ({}) },
    '@/lib/projects/derive-dates': { deriveProjectDates: () => ({ is_late: false }) },
    '@/lib/projects/derive-todo': { deriveProjectTodo: () => ({}) },
    '@/lib/project-stages/stages': { getSystemStage: () => null, PROJECT_SYSTEM_STAGES: [] },
  }
  const output = ts.transpileModule(read('app/api/projects/route.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const api: Record<string, any> = {}
  new Function('require', 'exports', output)((id: string) => id in mocks ? mocks[id] : id.startsWith('@/') ? {} : require(id), api)
  return { api, operations, scopes }
}

test.describe('Projektlistan — riktiga handlerns identitetsgräns', () => {
  for (const suffix of ['', '?include=workflow', '?status=active']) {
    test(`saknad aktiv medlem nekas före dataläsning ${suffix}`, async () => {
      const { api, operations } = projektlista(null)
      const res = await api.GET(new NextRequest(`https://test/api/projects${suffix}`))
      expect(res.status).toBe(403)
      expect(operations).toEqual([])
      expect(await res.json()).not.toHaveProperty('projects')
    })
  }

  test('förfalskad impersoneringscookie ger inte ett serververifierat undantag', async () => {
    const { api, operations } = projektlista(null)
    const res = await api.GET(new NextRequest('https://test/api/projects', { headers: { cookie: 'hm_impersonate=biz-a' } }))
    expect(res.status).toBe(403)
    expect(operations).toEqual([])
  })

  test('serververifierad impersonering kan läsa målföretaget utan medlemsrad', async () => {
    const { api, operations } = projektlista(null, true)
    const res = await api.GET(new NextRequest('https://test/api/projects'))
    expect(res.status).toBe(200)
    expect((await res.json()).projects[0].budget_amount).toBe(120000)
    expect(operations).toContainEqual(['project', 'eq', 'business_id', 'biz-a'])
  })

  for (const role of ['owner', 'admin', 'project_manager']) {
    test(`${role} med behörighet får alla projekt och ekonomi`, async () => {
      const { api, scopes } = projektlista(anvandare(role, { can_see_all_projects: true, can_see_financials: true }))
      const res = await api.GET(new NextRequest('https://test/api/projects'))
      const body = await res.json()
      expect(res.status).toBe(200)
      expect(body.projects).toHaveLength(2)
      expect(body.projects[0].actual_labor_cost).toBe(4321)
      expect(scopes).toEqual(['biz-a'])
    })
  }

  test('tilldelad anställd ser bara P1 och inga budget-/kostnadsfält', async () => {
    const { api, operations } = projektlista(anvandare('employee'))
    const res = await api.GET(new NextRequest('https://test/api/projects?include=workflow'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.projects.map((p: any) => p.project_id)).toEqual(['p1'])
    for (const field of [...ekonomiprojektion.PROJEKT_EKONOMIFALT, 'actual_amount']) {
      expect(body.projects[0]).not.toHaveProperty(field)
    }
    expect(body.projects[0].name).toBe('Tilldelat')
    expect(operations).toContainEqual(['project_assignment', 'eq', 'business_user_id', 'bu-1'])
    expect(operations).toContainEqual(['project_assignment', 'eq', 'business_id', 'biz-a'])
  })

  test('projektlistan är dynamisk så auth-svar inte fryses i Full Route Cache', () => {
    const { api } = projektlista(null)
    expect(api.dynamic).toBe('force-dynamic')
  })
})
