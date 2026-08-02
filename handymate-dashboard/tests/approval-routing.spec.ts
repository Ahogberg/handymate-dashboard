/**
 * Etapp 3a (tasks/multi-employee-parity-plan.md) — facit-tester för
 * lib/approvals/routing.ts. getRoutingBucket() är ren logik (ingen I/O) —
 * körs utan live auth. canActOnApproval() är också testad här för de
 * grenar som inte kräver en riktig DB (any/owner_admin/can_approve_time/
 * four_eyes_quote-spärren) med en minimal fake Supabase-klient för
 * project_team-grenen (enda grenen som gör ett DB-anrop).
 *
 * Körs: npx playwright test tests/approval-routing.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { getRoutingBucket, canActOnApproval, type ApprovalRoutingRow } from '../lib/approvals/routing'
import type { BusinessUser } from '../lib/permissions'

function makeUser(overrides: Partial<BusinessUser> = {}): BusinessUser {
  return {
    id: 'bu_1',
    business_id: 'biz_1',
    user_id: 'auth_1',
    role: 'employee',
    name: 'Test Testsson',
    email: 'test@example.com',
    phone: null,
    title: null,
    hourly_cost: null,
    hourly_rate: null,
    color: '#000000',
    avatar_url: null,
    is_active: true,
    can_see_all_projects: false,
    can_see_financials: false,
    can_manage_users: false,
    can_approve_time: false,
    can_create_invoices: false,
    ...overrides,
  }
}

test.describe('getRoutingBucket', () => {
  test("okänd/ej listad approval_type → 'any'", () => {
    expect(getRoutingBucket('send_sms')).toBe('any')
    expect(getRoutingBucket('create_booking')).toBe('any')
    expect(getRoutingBucket('nagot_helt_pahittat')).toBe('any')
  })

  test("Etapp 3a: tabellen är medvetet TOM — typer som SKA routas i Etapp 3b ger 'any' idag", () => {
    // Dokumenterar det avsiktliga nuläget: ingen creation-site sätter
    // routing_role != 'any' än, så tabellen är tom och alla typer — även
    // de som planfilens Etapp 3b-tabell pekar ut som framtida
    // owner_admin/can_approve_time/project_team — mappar till 'any' tills
    // vidare. Om detta test börjar faila har någon börjat fylla i
    // ROUTING_TABLE — uppdatera testet medvetet, inte av misstag.
    expect(getRoutingBucket('four_eyes_quote')).toBe('any')
    expect(getRoutingBucket('time_attestation')).toBe('any')
    expect(getRoutingBucket('tidrapport_forslag')).toBe('any')
    expect(getRoutingBucket('egenkontroll_foto')).toBe('any')
    expect(getRoutingBucket('send_invoice')).toBe('any')
  })

  test('tom sträng → any', () => {
    expect(getRoutingBucket('')).toBe('any')
  })
})

test.describe('canActOnApproval — four_eyes_quote självgodkännande-spärr', () => {
  test('samma användare som requested_by_user_id → false, ÄVEN för ägare', () => {
    const owner = makeUser({ id: 'bu_owner', role: 'owner' })
    const approval: ApprovalRoutingRow = {
      approval_type: 'four_eyes_quote',
      business_id: 'biz_1',
      routing_role: 'any',
      payload: { requested_by_user_id: 'bu_owner', quote_id: 'q1' },
    }
    return canActOnApproval(null as any, owner, approval).then((result) => {
      expect(result).toBe(false)
    })
  })

  test('annan användare än requested_by_user_id → normal bucket-logik (any → true)', () => {
    const admin = makeUser({ id: 'bu_admin', role: 'admin' })
    const approval: ApprovalRoutingRow = {
      approval_type: 'four_eyes_quote',
      business_id: 'biz_1',
      routing_role: 'any',
      payload: { requested_by_user_id: 'bu_employee', quote_id: 'q1' },
    }
    return canActOnApproval(null as any, admin, approval).then((result) => {
      expect(result).toBe(true)
    })
  })

  test('payload saknar requested_by_user_id (äldre rader) → spärren triggar inte, faller igenom till bucket', () => {
    const owner = makeUser({ id: 'bu_owner', role: 'owner' })
    const approval: ApprovalRoutingRow = {
      approval_type: 'four_eyes_quote',
      business_id: 'biz_1',
      routing_role: 'any',
      payload: { quote_id: 'q1' },
    }
    return canActOnApproval(null as any, owner, approval).then((result) => {
      expect(result).toBe(true)
    })
  })
})

test.describe('canActOnApproval — bucket-grenar utan DB-behov', () => {
  test("'any' → alltid true, oavsett behörigheter", () => {
    const user = makeUser()
    const approval: ApprovalRoutingRow = { approval_type: 'send_sms', business_id: 'biz_1', routing_role: 'any' }
    return canActOnApproval(null as any, user, approval).then((r) => expect(r).toBe(true))
  })

  test("'owner_admin' → owner klarar", () => {
    const owner = makeUser({ role: 'owner' })
    const approval: ApprovalRoutingRow = { approval_type: 'x', business_id: 'biz_1', routing_role: 'owner_admin' }
    return canActOnApproval(null as any, owner, approval).then((r) => expect(r).toBe(true))
  })

  test("'owner_admin' → admin klarar", () => {
    const admin = makeUser({ role: 'admin' })
    const approval: ApprovalRoutingRow = { approval_type: 'x', business_id: 'biz_1', routing_role: 'owner_admin' }
    return canActOnApproval(null as any, admin, approval).then((r) => expect(r).toBe(true))
  })

  test("'owner_admin' → anställd utan can_manage_users nekas", () => {
    const employee = makeUser({ role: 'employee', can_manage_users: false })
    const approval: ApprovalRoutingRow = { approval_type: 'x', business_id: 'biz_1', routing_role: 'owner_admin' }
    return canActOnApproval(null as any, employee, approval).then((r) => expect(r).toBe(false))
  })

  test("'owner_admin' → anställd MED can_manage_users klarar", () => {
    const employee = makeUser({ role: 'employee', can_manage_users: true })
    const approval: ApprovalRoutingRow = { approval_type: 'x', business_id: 'biz_1', routing_role: 'owner_admin' }
    return canActOnApproval(null as any, employee, approval).then((r) => expect(r).toBe(true))
  })

  test("'can_approve_time' → styrs av can_approve_time-flaggan", async () => {
    const canApprove = makeUser({ role: 'employee', can_approve_time: true })
    const cannotApprove = makeUser({ role: 'employee', can_approve_time: false })
    const approval: ApprovalRoutingRow = {
      approval_type: 'time_attestation',
      business_id: 'biz_1',
      routing_role: 'can_approve_time',
    }
    expect(await canActOnApproval(null as any, canApprove, approval)).toBe(true)
    expect(await canActOnApproval(null as any, cannotApprove, approval)).toBe(false)
  })

  test("'project_team' → payload saknar project_id → true (kan inte routa mot namnlöst projekt)", () => {
    const user = makeUser()
    const approval: ApprovalRoutingRow = {
      approval_type: 'egenkontroll_foto',
      business_id: 'biz_1',
      routing_role: 'project_team',
      payload: {},
    }
    return canActOnApproval(null as any, user, approval).then((r) => expect(r).toBe(true))
  })

  test("'project_team' → see_all_projects-behörighet klarar utan DB-anrop", () => {
    const user = makeUser({ can_see_all_projects: true })
    const approval: ApprovalRoutingRow = {
      approval_type: 'egenkontroll_foto',
      business_id: 'biz_1',
      routing_role: 'project_team',
      payload: { project_id: 'proj_1' },
    }
    // supabase-klienten är null — om koden av misstag ändå försökte göra
    // ett DB-anrop här skulle testet krascha (null.from is not a function),
    // vilket bekräftar att see_all_projects-grenen kortsluter INNAN DB-anropet.
    return canActOnApproval(null as any, user, approval).then((r) => expect(r).toBe(true))
  })
})

/**
 * Minimal fake Supabase-klient för project_assignment-uppslaget i
 * 'project_team'-grenen — enda grenen i canActOnApproval som gör ett
 * faktiskt DB-anrop. Kedjan .from().select().eq().eq().eq().maybeSingle()
 * speglar exakt anropet i lib/approvals/routing.ts.
 */
function fakeSupabase(result: { data: unknown; error: unknown }) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => result,
  }
  return { from: () => builder } as any
}

test.describe("canActOnApproval — 'project_team' med project_assignment-uppslag", () => {
  test('projektmedlem hittad → true', () => {
    const user = makeUser({ can_see_all_projects: false })
    const approval: ApprovalRoutingRow = {
      approval_type: 'egenkontroll_foto',
      business_id: 'biz_1',
      routing_role: 'project_team',
      payload: { project_id: 'proj_1' },
    }
    const supabase = fakeSupabase({ data: { id: 'pa_1' }, error: null })
    return canActOnApproval(supabase, user, approval).then((r) => expect(r).toBe(true))
  })

  test('ingen tilldelning hittad → false', () => {
    const user = makeUser({ can_see_all_projects: false })
    const approval: ApprovalRoutingRow = {
      approval_type: 'egenkontroll_foto',
      business_id: 'biz_1',
      routing_role: 'project_team',
      payload: { project_id: 'proj_1' },
    }
    const supabase = fakeSupabase({ data: null, error: null })
    return canActOnApproval(supabase, user, approval).then((r) => expect(r).toBe(false))
  })

  test('DB-fel → fail-closed (false), inte true', () => {
    const user = makeUser({ can_see_all_projects: false })
    const approval: ApprovalRoutingRow = {
      approval_type: 'egenkontroll_foto',
      business_id: 'biz_1',
      routing_role: 'project_team',
      payload: { project_id: 'proj_1' },
    }
    const supabase = fakeSupabase({ data: null, error: { message: 'boom' } })
    return canActOnApproval(supabase, user, approval).then((r) => expect(r).toBe(false))
  })
})
