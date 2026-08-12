/**
 * Facit för Margin Guardian (2026-08-12) — byggLonsamhetsVarning.
 *
 * Lönsamhetsvarningen flyttades från legacy `project.actual_*`-snapshots till
 * den kanoniska ekonomimotorn (compute-economics.ts). Den här filen är facit
 * för den rena beräkningsfunktionen — ingen DB, ingen server.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/margin-guardian.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { byggLonsamhetsVarning, type GuardianProjekt, type GuardianAtaSignal } from '../lib/projects/margin-guardian'
import type { ProjectEconomics } from '../lib/projects/compute-economics'

function eko(overrides: {
  budget_amount?: number
  ata_signerat_kr?: number
  ata_pending_kr?: number
  arbete_kr?: number | null
  arbete_timmar?: number
  material_inkop_kr?: number
  extra_kr?: number
  marginal_pct?: number | null
} = {}): ProjectEconomics {
  const budgetAmount = overrides.budget_amount ?? 100000
  const ataSignerat = overrides.ata_signerat_kr ?? 0
  return {
    project_id: 'p1',
    business_id: 'b1',
    intakter: {
      budget_amount: budgetAmount,
      ata_signerat_kr: ataSignerat,
      ata_pending_kr: overrides.ata_pending_kr ?? 0,
      fakturerat_kr: 0,
      betalt_kr: 0,
      forvantad_intakt_kr: budgetAmount + ataSignerat,
    },
    kostnader: {
      arbete_kr: overrides.arbete_kr === undefined ? 0 : overrides.arbete_kr,
      arbete_timmar: overrides.arbete_timmar ?? 0,
      material_inkop_kr: overrides.material_inkop_kr ?? 0,
      material_billable_kr: 0,
      extra_kr: overrides.extra_kr ?? 0,
      extra_per_kategori: {},
      total_kr: null,
    },
    marginal: {
      arbetskostnad_konfigurerad: overrides.arbete_kr !== null,
      timrader_utan_kostnad: overrides.arbete_kr === null ? 1 : 0,
      marginal_kr: null,
      marginal_pct: overrides.marginal_pct ?? null,
      är_tomt: false,
      kostnad_sannolikt_komplett: true,
      kostnad_completeness_pct: null,
    },
    meta: {
      computed_at: new Date().toISOString(),
      invoice_count: 0,
      ata_count: 0,
      time_entry_count: 0,
      supplier_invoice_count: 0,
      extra_cost_count: 0,
    },
    quote_rot_rut: null,
  }
}

const projekt = (budget_hours = 100): GuardianProjekt => ({ project_id: 'p1', name: 'Ekbacken 3', budget_hours })
const ingenAta: GuardianAtaSignal = { aldsta_dagar: null }

test.describe('trösklar', () => {
  test('under tröskeln (75%) ger ingen varning', () => {
    const r = byggLonsamhetsVarning(eko({ material_inkop_kr: 70000 }), projekt(), ingenAta)
    expect(r).toBeNull()
  })

  test('exakt 75% räknas fortfarande som under tröskeln', () => {
    const r = byggLonsamhetsVarning(eko({ material_inkop_kr: 75000 }), projekt(), ingenAta)
    expect(r).toBeNull()
  })

  test('76% ger at_risk', () => {
    const r = byggLonsamhetsVarning(eko({ material_inkop_kr: 76000 }), projekt(), ingenAta)
    expect(r?.status).toBe('at_risk')
  })

  test('exakt 95% är fortfarande at_risk, inte over_budget', () => {
    const r = byggLonsamhetsVarning(eko({ material_inkop_kr: 95000 }), projekt(), ingenAta)
    expect(r?.status).toBe('at_risk')
  })

  test('96% ger over_budget', () => {
    const r = byggLonsamhetsVarning(eko({ material_inkop_kr: 96000 }), projekt(), ingenAta)
    expect(r?.status).toBe('over_budget')
  })
})

test.describe('bas och golvsemantik', () => {
  test('bas <= 0 ger alltid null, oavsett kostnad', () => {
    const r = byggLonsamhetsVarning(
      eko({ budget_amount: 0, ata_signerat_kr: 0, material_inkop_kr: 50000 }),
      projekt(),
      ingenAta,
    )
    expect(r).toBeNull()
  })

  test('arbete_kr null ger ändå varning (golvet är konservativt, inte fabricerat)', () => {
    const r = byggLonsamhetsVarning(
      eko({ arbete_kr: null, arbete_timmar: 50, material_inkop_kr: 80000 }),
      projekt(),
      ingenAta,
    )
    expect(r).not.toBeNull()
    expect(r?.status).toBe('at_risk')
    expect(r?.orsaker.some(o => o.text.includes('Intern timkostnad ej konfigurerad'))).toBe(true)
  })

  test('arbete_kr konfigurerad (0) ger ingen timkostnadsrad', () => {
    const r = byggLonsamhetsVarning(
      eko({ arbete_kr: 0, arbete_timmar: 50, material_inkop_kr: 80000 }),
      projekt(),
      ingenAta,
    )
    expect(r?.orsaker.some(o => o.text.includes('Intern timkostnad'))).toBe(false)
  })
})

test.describe('prognosen', () => {
  test('10% timförbrukning exakt ger ingen prognos (kräver striktare "> 10%")', () => {
    const r = byggLonsamhetsVarning(
      eko({ material_inkop_kr: 80000, arbete_timmar: 10 }),
      projekt(100),
      ingenAta,
    )
    expect(r?.status).toBe('at_risk')
    expect(r?.projected_overrun).toBe(0)
    expect(r?.orsaker.some(o => o.kind === 'UPPSKATTAT')).toBe(false)
  })

  test('över 10% timförbrukning ger en prognosrad', () => {
    const r = byggLonsamhetsVarning(
      eko({ material_inkop_kr: 80000, arbete_timmar: 11 }),
      projekt(100),
      ingenAta,
    )
    expect(r?.projected_overrun).toBeGreaterThan(0)
    const prognosrad = r?.orsaker.find(o => o.kind === 'UPPSKATTAT')
    expect(prognosrad).toBeDefined()
    expect(prognosrad?.text).toContain('Prognos')
    expect(prognosrad?.amount_kr).toBe(r?.projected_overrun)
  })
})

test.describe('ÄTA-raderna', () => {
  test('osignerad ÄTA ger en egen rad med belopp', () => {
    const r = byggLonsamhetsVarning(
      eko({ material_inkop_kr: 80000, ata_pending_kr: 5000 }),
      projekt(),
      ingenAta,
    )
    const rad = r?.orsaker.find(o => o.text.includes('osignerad ÄTA'))
    expect(rad).toBeDefined()
    expect(rad?.kind).toBe('KÄNT')
    expect(rad?.amount_kr).toBe(5000)
  })

  test('inget skickat ÄTA-belopp ger ingen rad', () => {
    const r = byggLonsamhetsVarning(eko({ material_inkop_kr: 80000, ata_pending_kr: 0 }), projekt(), ingenAta)
    expect(r?.orsaker.some(o => o.text.includes('osignerad ÄTA'))).toBe(false)
  })

  test('ÄTA-förslag som väntat under 5 dagar ger ingen rad', () => {
    const r = byggLonsamhetsVarning(eko({ material_inkop_kr: 80000 }), projekt(), { aldsta_dagar: 4 })
    expect(r?.orsaker.some(o => o.text.includes('väntat'))).toBe(false)
  })

  test('ÄTA-förslag som väntat 5 dagar eller mer ger en rad', () => {
    const r = byggLonsamhetsVarning(eko({ material_inkop_kr: 80000 }), projekt(), { aldsta_dagar: 5 })
    const rad = r?.orsaker.find(o => o.text.includes('väntat'))
    expect(rad).toBeDefined()
    expect(rad?.text).toContain('5 dagar')
    expect(rad?.kind).toBe('KÄNT')
  })
})

test.describe('payload-kontraktet', () => {
  test('alla fält som checkProfitabilityWarnings/JarvisHome behöver finns i returen', () => {
    const r = byggLonsamhetsVarning(
      eko({ material_inkop_kr: 96000, marginal_pct: 4 }),
      projekt(),
      ingenAta,
    )
    expect(r).not.toBeNull()
    expect(r).toHaveProperty('status')
    expect(r).toHaveProperty('cost_percent')
    expect(r).toHaveProperty('margin_percent')
    expect(r).toHaveProperty('projected_overrun')
    expect(r).toHaveProperty('orsaker')
    expect(r?.margin_percent).toBe(4)
    expect(Array.isArray(r?.orsaker)).toBe(true)
  })
})

test.describe('UPPSKATTAT är reserverat för prognosraden', () => {
  test('alla andra rader är KÄNT, bara prognosraden är UPPSKATTAT', () => {
    const r = byggLonsamhetsVarning(
      eko({ arbete_kr: null, arbete_timmar: 20, material_inkop_kr: 90000, extra_kr: 5000, ata_pending_kr: 3000 }),
      projekt(100),
      { aldsta_dagar: 6 },
    )
    expect(r).not.toBeNull()
    expect(r!.orsaker.length).toBeGreaterThan(1)
    const uppskattade = r!.orsaker.filter(o => o.kind === 'UPPSKATTAT')
    for (const rad of uppskattade) {
      expect(rad.text).toContain('Prognos')
    }
    const kanda = r!.orsaker.filter(o => o.kind === 'KÄNT')
    for (const rad of kanda) {
      expect(rad.text).not.toContain('Prognos')
    }
  })
})

test.describe('beloppen formateras svenskt', () => {
  test('kronor skrivs med sv-SE-gruppering', () => {
    const r = byggLonsamhetsVarning(eko({ material_inkop_kr: 80000 }), projekt(), ingenAta)
    const rad = r?.orsaker.find(o => o.text.includes('Materialinköp'))
    expect(rad?.text).toBe(`Materialinköp: ${(80000).toLocaleString('sv-SE')} kr`)
  })
})
