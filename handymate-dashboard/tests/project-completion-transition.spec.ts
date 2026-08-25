import { test, expect } from '@playwright/test'
import { transitionProjectToCompleted } from '../lib/projects/complete-project'

const completedProject = {
  project_id: 'project-1',
  business_id: 'business-1',
  customer_id: 'customer-1',
  name: 'Badrum Andersson',
  quote_id: null,
  lead_id: null,
  status: 'completed',
  completed_at: '2026-08-15T08:00:00.000Z',
}

function fakeSupabase(responses: Array<{ data: unknown; error: { message: string } | null }>) {
  let calls = 0
  const supabase = {
    from() {
      const response = responses[calls++]
      const builder: Record<string, (...args: unknown[]) => unknown> = {}
      // 2026-08-25: or() ersatt av neq()/is() — PostgREST-buggen där
      // eq()+or() på en update-representation gav tom retur (verkligt
      // prod-repro, se transitionProjectToCompleted:s BUGFIX-kommentar).
      // Mocken speglar de metoder koden faktiskt anropar.
      for (const method of ['update', 'eq', 'neq', 'is', 'or', 'select']) {
        builder[method] = () => builder
      }
      builder.maybeSingle = async () => response
      return builder
    },
  }
  return { supabase, calls: () => calls }
}

test.describe('atomisk projektövergång', () => {
  test('primärfelet returneras — ingen efterläsning eller falsk success', async () => {
    const fake = fakeSupabase([{ data: null, error: { message: 'write failed' } }])
    const result = await transitionProjectToCompleted(
      fake.supabase as any,
      'business-1',
      'project-1',
    )

    expect(result).toMatchObject({
      ok: false,
      transitioned: false,
      already_completed: false,
      error: 'write failed',
      errorCode: 'transition_failed',
    })
    expect(fake.calls()).toBe(1)
  })

  test('vinnaren får transitioned=true', async () => {
    const fake = fakeSupabase([{ data: completedProject, error: null }])
    const result = await transitionProjectToCompleted(
      fake.supabase as any,
      'business-1',
      'project-1',
    )

    expect(result).toMatchObject({ ok: true, transitioned: true, already_completed: false })
    expect(fake.calls()).toBe(1)
  })

  test('projekt med NULL-status stängs via det andra atomära försöket', async () => {
    // Nya tvåförsöksflödet (2026-08-25): neq('status','completed') matchar
    // aldrig NULL (SQL-semantik) — det andra försöket (.is('status', null))
    // är det som stänger äldre rader utan status. Fortfarande atomärt per
    // försök via Postgres radlås.
    const fake = fakeSupabase([
      { data: null, error: null },            // försök 1: neq — miss (status är NULL)
      { data: completedProject, error: null }, // försök 2: is null — vinner
    ])
    const result = await transitionProjectToCompleted(
      fake.supabase as any,
      'business-1',
      'project-1',
    )
    expect(result).toMatchObject({ ok: true, transitioned: true, already_completed: false })
    expect(fake.calls()).toBe(2)
  })

  test('förloraren skiljer idempotent replay från misslyckad övergång', async () => {
    // 3 svar sedan tvåförsöksflödet: neq-miss → is-null-miss → efterläsning.
    const replay = fakeSupabase([
      { data: null, error: null },
      { data: null, error: null },
      { data: completedProject, error: null },
    ])
    const replayResult = await transitionProjectToCompleted(
      replay.supabase as any,
      'business-1',
      'project-1',
    )
    expect(replayResult).toMatchObject({ ok: true, transitioned: false, already_completed: true })

    const failed = fakeSupabase([
      { data: null, error: null },
      { data: null, error: null },
      { data: { ...completedProject, status: 'active' }, error: null },
    ])
    const failedResult = await transitionProjectToCompleted(
      failed.supabase as any,
      'business-1',
      'project-1',
    )
    expect(failedResult).toMatchObject({ ok: false, errorCode: 'transition_failed' })
  })
})
