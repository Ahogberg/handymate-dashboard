/**
 * Lönsamhet per person — facit-tester för den rena beräkningskärnan
 * (tasks/resurs-masterplan.md, R4-E). Körs:
 *   npx playwright test tests/person-profitability.spec.ts --no-deps
 *
 * Testar ENDAST computePersonProfitability — ren funktion, ingen I/O.
 * Route-lagret (app/api/projects/[id]/profitability/per-person/route.ts,
 * DB-hämtning + owner/admin-gating) testas inte här, samma upplägg som
 * tests/person-day.spec.ts / tests/tidrapport-forslag.spec.ts.
 */
import { test, expect } from '@playwright/test'
import {
  computePersonProfitability,
  type InvoiceItemForPersonProfitability,
  type MemberForPersonProfitability,
  type TimeEntryForPersonProfitability,
} from '../lib/projects/compute-person-profitability'

const MICKE: MemberForPersonProfitability = {
  id: 'user_micke',
  name: 'Micke',
  color: '#0F766E',
  internal_hourly_cost: 350,
}

const LISA: MemberForPersonProfitability = {
  id: 'user_lisa',
  name: 'Lisa',
  color: '#B45309',
  internal_hourly_cost: null, // saknar egen intern kostnad — testar fallback/null-fall
}

test.describe('computePersonProfitability — grundläggande aggregation', () => {
  test('en person, en fakturarad, timmar och kostnad matchar', () => {
    const items: InvoiceItemForPersonProfitability[] = [
      { business_user_id: MICKE.id, total: 10000 },
    ]
    const entries: TimeEntryForPersonProfitability[] = [
      { business_user_id: MICKE.id, duration_minutes: 600 }, // 10h
    ]

    const rows = computePersonProfitability(items, entries, [MICKE], null)

    expect(rows).toHaveLength(1)
    expect(rows[0].business_user_id).toBe(MICKE.id)
    expect(rows[0].name).toBe('Micke')
    expect(rows[0].fakturerat_kr).toBe(10000)
    expect(rows[0].timmar).toBe(10)
    expect(rows[0].kostnad_konfigurerad).toBe(true)
    expect(rows[0].kostnad_kr).toBe(3500) // 10h * 350
    expect(rows[0].marginal_kr).toBe(6500)
  })

  test('flera fakturarader för samma person summeras', () => {
    const items: InvoiceItemForPersonProfitability[] = [
      { business_user_id: MICKE.id, total: 5000 },
      { business_user_id: MICKE.id, total: 3000 },
    ]
    const rows = computePersonProfitability(items, [], [MICKE], null)

    expect(rows).toHaveLength(1)
    expect(rows[0].fakturerat_kr).toBe(8000)
    expect(rows[0].timmar).toBe(0)
  })

  test('rader utan business_user_id ignoreras (material, manuella rader)', () => {
    const items: InvoiceItemForPersonProfitability[] = [
      { business_user_id: null, total: 5000 },
      { business_user_id: MICKE.id, total: 2000 },
    ]
    const rows = computePersonProfitability(items, [], [MICKE], null)

    expect(rows).toHaveLength(1)
    expect(rows[0].fakturerat_kr).toBe(2000)
  })

  test('person utan fakturarad (bara timrader) syns INTE — personmängden styrs av fakturarader', () => {
    const items: InvoiceItemForPersonProfitability[] = [
      { business_user_id: MICKE.id, total: 1000 },
    ]
    const entries: TimeEntryForPersonProfitability[] = [
      { business_user_id: MICKE.id, duration_minutes: 60 },
      { business_user_id: LISA.id, duration_minutes: 120 }, // Lisa har bara tid, ingen fakturarad
    ]
    const rows = computePersonProfitability(items, entries, [MICKE, LISA], null)

    expect(rows).toHaveLength(1)
    expect(rows[0].business_user_id).toBe(MICKE.id)
  })
})

test.describe('computePersonProfitability — kostnad/marginal ärlighetsprincip', () => {
  test('saknad intern kostnad (varken medlem eller default) → kostnad/marginal null, aldrig 0', () => {
    const items: InvoiceItemForPersonProfitability[] = [
      { business_user_id: LISA.id, total: 4000 },
    ]
    const entries: TimeEntryForPersonProfitability[] = [
      { business_user_id: LISA.id, duration_minutes: 300 },
    ]
    const rows = computePersonProfitability(items, entries, [LISA], null)

    expect(rows[0].kostnad_konfigurerad).toBe(false)
    expect(rows[0].kostnad_kr).toBeNull()
    expect(rows[0].marginal_kr).toBeNull()
    expect(rows[0].fakturerat_kr).toBe(4000) // fakturerat rapporteras alltid
  })

  test('business-default används som fallback när medlemmen saknar egen kostnad', () => {
    const items: InvoiceItemForPersonProfitability[] = [
      { business_user_id: LISA.id, total: 4000 },
    ]
    const entries: TimeEntryForPersonProfitability[] = [
      { business_user_id: LISA.id, duration_minutes: 120 }, // 2h
    ]
    const rows = computePersonProfitability(items, entries, [LISA], 400) // business default 400 kr/h

    expect(rows[0].kostnad_konfigurerad).toBe(true)
    expect(rows[0].kostnad_kr).toBe(800)
    expect(rows[0].marginal_kr).toBe(3200)
  })

  test('medlemmens egen kostnad prioriteras över business-default', () => {
    const items: InvoiceItemForPersonProfitability[] = [
      { business_user_id: MICKE.id, total: 1000 },
    ]
    const entries: TimeEntryForPersonProfitability[] = [
      { business_user_id: MICKE.id, duration_minutes: 60 }, // 1h
    ]
    // Business-default 999 ska INTE användas — Micke har egen kostnad 350.
    const rows = computePersonProfitability(items, entries, [MICKE], 999)

    expect(rows[0].kostnad_kr).toBe(350)
  })

  test('negativ marginal rapporteras korrekt (kostnad > fakturerat)', () => {
    const items: InvoiceItemForPersonProfitability[] = [
      { business_user_id: MICKE.id, total: 100 },
    ]
    const entries: TimeEntryForPersonProfitability[] = [
      { business_user_id: MICKE.id, duration_minutes: 600 }, // 10h * 350 = 3500 kostnad
    ]
    const rows = computePersonProfitability(items, entries, [MICKE], null)

    expect(rows[0].marginal_kr).toBe(100 - 3500)
    expect(rows[0].marginal_kr).toBeLessThan(0)
  })
})

test.describe('computePersonProfitability — sortering och okänd medlem', () => {
  test('sorteras fallande på fakturerat belopp', () => {
    const items: InvoiceItemForPersonProfitability[] = [
      { business_user_id: LISA.id, total: 2000 },
      { business_user_id: MICKE.id, total: 9000 },
    ]
    const rows = computePersonProfitability(items, [], [MICKE, LISA], null)

    expect(rows.map(r => r.business_user_id)).toEqual([MICKE.id, LISA.id])
  })

  test('okänd medlem (finns på fakturarad men saknas i members-listan) → namn "Okänd", kraschar inte', () => {
    const items: InvoiceItemForPersonProfitability[] = [
      { business_user_id: 'user_okand', total: 500 },
    ]
    const rows = computePersonProfitability(items, [], [], null)

    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Okänd')
    expect(rows[0].color).toBeNull()
  })

  test('tom input → tom lista', () => {
    const rows = computePersonProfitability([], [], [], null)
    expect(rows).toEqual([])
  })
})
