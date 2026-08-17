/**
 * Facit för Fakturaberedskap (Etapp D1b, 2026-08-17) — beraknaFakturaberedskap.
 *
 * Ren aggregatfunktion över data projektsidan redan har i state — ingen DB,
 * ingen server. Viktningsreglerna (dokumenterade i lib/projects/
 * fakturaberedskap.ts) låses här:
 *
 *   - Fyra möjliga delar: tidrapport i går (binär), delmoment (X av Y),
 *     egenkontroll (X av Y över aktiva/klara checklistor), fakturerbart
 *     underlag (binär, behörighetsgrindad).
 *   - Lika vikt per TILLGÄNGLIG del — delar utan underlag UTESLUTS ur
 *     nämnaren, räknas aldrig som klara.
 *   - Inga delar alls → null (aldrig en fejkad 100 %).
 *   - varsta_blocker = delen med lägst andel klar; vid lika vinner den
 *     som kommer först i delordningen.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/fakturaberedskap.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  beraknaFakturaberedskap,
  type FakturaberedskapInput,
} from '../lib/projects/fakturaberedskap'

function input(overrides: Partial<FakturaberedskapInput> = {}): FakturaberedskapInput {
  return {
    tidrapportGap: null,
    milestones: [],
    checklists: [],
    uninvoicedKr: null,
    ...overrides,
  }
}

function delmoment(done: number, total: number) {
  return [
    ...Array.from({ length: done }, () => ({ status: 'completed' })),
    ...Array.from({ length: total - done }, () => ({ status: 'pending' })),
  ]
}

function checklista(checked: number, total: number, status = 'in_progress') {
  return {
    status,
    items: [
      ...Array.from({ length: checked }, () => ({ checked: true })),
      ...Array.from({ length: total - checked }, () => ({ checked: false })),
    ],
  }
}

test.describe('tomt underlag', () => {
  test('inga delar alls → null, aldrig en fejkad 100 %', () => {
    expect(beraknaFakturaberedskap(input())).toBeNull()
  })

  test('checklista utan punkter räknas inte som underlag', () => {
    expect(beraknaFakturaberedskap(input({ checklists: [{ status: 'in_progress', items: [] }] }))).toBeNull()
  })
})

test.describe('uteslutning ur nämnaren', () => {
  test('bara delmoment finns → en enda del, pct = andelen klara', () => {
    const r = beraknaFakturaberedskap(input({ milestones: delmoment(2, 4) }))
    expect(r).not.toBeNull()
    expect(r!.delar).toHaveLength(1)
    expect(r!.delar[0]).toEqual({ key: 'delmoment', label: 'Delmoment klara', done: 2, total: 4 })
    expect(r!.pct).toBe(50)
  })

  test('del utan data saknas i delar-listan — den räknas varken som klar eller oklar', () => {
    const r = beraknaFakturaberedskap(
      input({ tidrapportGap: { missing: false }, milestones: delmoment(1, 2) }),
    )
    expect(r!.delar.map(d => d.key)).toEqual(['tidrapport', 'delmoment'])
  })

  test('uninvoicedKr null (t.ex. utan see_financials) → underlagsdelen utesluten', () => {
    const r = beraknaFakturaberedskap(input({ milestones: delmoment(0, 1), uninvoicedKr: null }))
    expect(r!.delar.map(d => d.key)).toEqual(['delmoment'])
  })
})

test.describe('lika vikt per tillgänglig del', () => {
  test('tidrapport saknas (0/1) + delmoment klara (4/4) → 50 %', () => {
    const r = beraknaFakturaberedskap(
      input({ tidrapportGap: { missing: true }, milestones: delmoment(4, 4) }),
    )
    expect(r!.pct).toBe(50)
  })

  test('avrundning: 1/1 + 1/3 → (100 % + 33 %) / 2 = 67 %', () => {
    const r = beraknaFakturaberedskap(
      input({ tidrapportGap: { missing: false }, milestones: delmoment(1, 3) }),
    )
    expect(r!.pct).toBe(67)
  })

  test('alla fyra delar klara → 100 % och ingen blocker', () => {
    const r = beraknaFakturaberedskap(
      input({
        tidrapportGap: { missing: false },
        milestones: delmoment(3, 3),
        checklists: [checklista(2, 2)],
        uninvoicedKr: 12500,
      }),
    )
    expect(r!.pct).toBe(100)
    expect(r!.delar).toHaveLength(4)
    expect(r!.varsta_blocker).toBeNull()
  })
})

test.describe('egenkontroll-delen', () => {
  test('aggregerar över både pågående och klara checklistor', () => {
    const r = beraknaFakturaberedskap(
      input({ checklists: [checklista(1, 3, 'in_progress'), checklista(2, 2, 'completed')] }),
    )
    const del = r!.delar.find(d => d.key === 'egenkontroll')
    expect(del).toEqual({ key: 'egenkontroll', label: 'Egenkontroll', done: 3, total: 5 })
  })

  test('checklistor i andra statusar (t.ex. utkast) ignoreras', () => {
    const r = beraknaFakturaberedskap(input({ checklists: [checklista(0, 4, 'draft')] }))
    expect(r).toBeNull()
  })
})

test.describe('fakturerbart underlag (binär del)', () => {
  test('0 kr ofakturerat → 0 av 1, blocker i klarspråk', () => {
    const r = beraknaFakturaberedskap(input({ uninvoicedKr: 0 }))
    expect(r!.delar[0]).toEqual({ key: 'underlag', label: 'Fakturerbart underlag', done: 0, total: 1 })
    expect(r!.pct).toBe(0)
    expect(r!.varsta_blocker).toBe('Inget ofakturerat underlag ännu')
  })

  test('ofakturerat > 0 → 1 av 1', () => {
    const r = beraknaFakturaberedskap(input({ uninvoicedKr: 4500 }))
    expect(r!.delar[0].done).toBe(1)
    expect(r!.pct).toBe(100)
  })
})

test.describe('varsta_blocker', () => {
  test('lägst andel klar vinner', () => {
    const r = beraknaFakturaberedskap(
      input({
        tidrapportGap: { missing: false },
        milestones: delmoment(3, 5),
        checklists: [checklista(1, 9)],
      }),
    )
    expect(r!.varsta_blocker).toBe('8 egenkontrollpunkter kvar')
  })

  test('tidrapportluckan formuleras som mockupens subline', () => {
    const r = beraknaFakturaberedskap(
      input({ tidrapportGap: { missing: true }, milestones: delmoment(3, 5) }),
    )
    expect(r!.varsta_blocker).toBe('1 tidrapport saknas')
  })

  test('singularformer: 1 delmoment kvar / 1 egenkontrollpunkt kvar', () => {
    const bara_delmoment = beraknaFakturaberedskap(input({ milestones: delmoment(4, 5) }))
    expect(bara_delmoment!.varsta_blocker).toBe('1 delmoment kvar')
    const bara_egenkontroll = beraknaFakturaberedskap(input({ checklists: [checklista(8, 9)] }))
    expect(bara_egenkontroll!.varsta_blocker).toBe('1 egenkontrollpunkt kvar')
  })

  test('vid lika andel vinner den första delen i delordningen', () => {
    // tidrapport 0/1 och underlag 0/1 — båda 0 % → tidrapport (först) vinner.
    const r = beraknaFakturaberedskap(
      input({ tidrapportGap: { missing: true }, uninvoicedKr: 0 }),
    )
    expect(r!.varsta_blocker).toBe('1 tidrapport saknas')
  })
})
