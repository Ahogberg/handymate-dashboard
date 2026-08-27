/**
 * Facit: Fastighetspasset steg 3 (2026-08-27) — garantisanningen (grind 3),
 * service ur installationen (grind 4), utskick genom hubbens grind (grind 5)
 * och "Min bostad" i portalen.
 *
 *   npx playwright test tests/facit-fastighetspass-steg3.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { validateWarrantyTruth, customerWarrantiesFromRows, type WarrantyRow } from '../lib/warranty/warranty-truth'
import { isWithinQuietHours } from '../lib/outbound/hub-gate'
import { nextServiceDate } from '../lib/installation/installation'
import { groupBostad, siteLabel } from '../app/portal/[token]/components/bostad'
import type { PortalInstallation, PortalJobbpassSummary } from '../app/portal/[token]/types'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const baseRow: WarrantyRow = {
  warranty_id: 'w1', business_id: 'b', customer_id: 'c', project_id: 'p', installation_id: null,
  title: 'Värmepump Nibe F2120', description: null, start_date: '2026-08-27', end_date: '2031-08-27', status: 'active',
  warranty_kind: 'product', issuer: 'Nibe', source: 'product_info',
}

test.describe('grind 3 — garanti bara med typ, garantigivare och källa', () => {
  test('validering: typ kräver garantigivare + källa; utan typ är alla tre tomma', () => {
    expect(validateWarrantyTruth({})).toEqual({ ok: true, value: { warranty_kind: null, issuer: null, source: null } })
    expect(validateWarrantyTruth({ warranty_kind: 'product' }).ok).toBe(false)
    expect(validateWarrantyTruth({ warranty_kind: 'product', issuer: 'Nibe' }).ok).toBe(false)
    expect(validateWarrantyTruth({ warranty_kind: 'product', issuer: 'Nibe', source: 'guess' }).ok).toBe(false)
    expect(validateWarrantyTruth({ warranty_kind: 'workmanship', issuer: 'Provfirman AB', source: 'craftsman' })).toEqual({
      ok: true, value: { warranty_kind: 'workmanship', issuer: 'Provfirman AB', source: 'craftsman' },
    })
    // Garantigivare utan typ är också fel — ett halvt löfte
    expect(validateWarrantyTruth({ issuer: 'Nibe' }).ok).toBe(false)
  })

  test('kundvyn: bara aktiva, registrerade och gällande — äldre rader utan typ når aldrig kunden', () => {
    const rows: WarrantyRow[] = [
      baseRow,
      { ...baseRow, warranty_id: 'w2', warranty_kind: null, issuer: null, source: null },       // äldre rad
      { ...baseRow, warranty_id: 'w3', end_date: '2026-01-01' },                                 // utgången
      { ...baseRow, warranty_id: 'w4', status: 'voided' },                                       // ogiltig
      { ...baseRow, warranty_id: 'w5', warranty_kind: 'service_agreement', issuer: 'Provfirman AB', source: 'contract', title: 'Serviceavtal värmepump' },
    ]
    const out = customerWarrantiesFromRows(rows, '2026-08-27')
    expect(out.map(w => w.title)).toEqual(['Värmepump Nibe F2120', 'Serviceavtal värmepump'])
    expect(out[0]).toMatchObject({ kind_label: 'Produktgaranti', issuer: 'Nibe', source_label: 'enligt produktinformationen' })
    expect(out[1]).toMatchObject({ kind_label: 'Serviceavtal', issuer: 'Provfirman AB', source_label: 'enligt avtalet' })
  })

  test('databasen (v175) och rutten säger samma sak; passet bär aldrig en hårdkodad garanti', () => {
    const sql = kod('sql/v175_warranty_truth.sql')
    expect(sql).toContain("CHECK (warranty_kind IS NULL OR (issuer IS NOT NULL AND source IS NOT NULL))")
    expect(sql).toContain("warranty_kind IN ('product', 'workmanship', 'service_agreement')")
    expect(sql).toContain("source IN ('product_info', 'contract', 'craftsman')")
    const route = kod('app/api/warranties/route.ts')
    expect(route).toContain('validateWarrantyTruth(')
    expect(route).toContain("checkFeatureAccess(business, 'warranty_tracking')")
    const lib = kod('lib/jobbpass/jobbpass.ts')
    expect(lib).toContain('customerWarrantiesFromRows(')
    expect(lib).not.toMatch(/JOBBPASS_WARRANTY_MONTHS|Standardgaranti|byggGarantitext/)
    const view = kod('components/jobbpass/JobbpassView.tsx')
    expect(view).not.toMatch(/Standardgaranti|12 månader/)
    // Ordet garanti förekommer i vyn först inne i den rad-styrda sektionen
    expect(view.search(/garanti/i)).toBeGreaterThan(view.indexOf('pass.warranties.length > 0'))
    expect(view).toContain('Garantigivare')
    const sida = kod('app/dashboard/warranties/page.tsx')
    expect(sida).not.toContain('Standard (2 år)')
    expect(sida).not.toMatch(/getFullYear\(\) \+ 2/)
    expect(sida).toContain('Garantigivare')
  })
})

test.describe('grind 4 — service ur installationen, aldrig en gissning när en tillgång finns', () => {
  test('proactive-care läser bekräftade installationer och hoppar över registrerade tillgångar utan intervall', () => {
    const pc = kod('lib/proactive-care.ts')
    expect(pc).toContain("from('installation')")
    expect(pc).toContain(".eq('status', 'confirmed')")
    expect(pc).toContain('i.service_interval_months && i.service_interval_source')
    expect(pc).toContain('SERVICE_INTERVAL_SOURCE_LABEL[')
    // Kundens nej i jobbpasset stoppar allt för projektet
    expect(pc).toContain("from('jobbpass')")
    expect(pc).toContain('consentByProject.get(project.project_id) === false')
    // Nyckelordstabellen används bara när ingen installation finns
    expect(pc).toMatch(/} else \{\n\s*\/\/ Determine job type by keyword matching/)
    // Facit-pinnen från kundrost.spec måste överleva: LLM:en skriver bara texten
    expect(pc).toContain('async function generateProactiveSms(')
    expect(pc).toContain('installation_id: installation?.installation_id ?? null')
  })

  test('nästa service räknas ur installed_at + intervall, aldrig utan båda', () => {
    expect(nextServiceDate('2026-08-27', 12)).toBe('2027-08-27')
    expect(nextServiceDate('2026-01-31', 1)).toMatch(/^2026-03-0[23]$/)
    expect(nextServiceDate(null, 12)).toBeNull()
    expect(nextServiceDate('2026-08-27', null)).toBeNull()
    const route = kod('app/api/portal/[token]/installations/route.ts')
    expect(route).toContain(".eq('status', 'confirmed')")
    expect(route).not.toMatch(/^export (const|function) (?!dynamic)/m)
  })
})

test.describe('grind 5 — utskick genom hubbens grind, godkännandet är avsikten', () => {
  test('tysta timmar: ren aritmetik som klarar midnatt', () => {
    expect(isWithinQuietHours('21:00', '07:00', 22 * 60)).toBe(true)
    expect(isWithinQuietHours('21:00', '07:00', 3 * 60)).toBe(true)
    expect(isWithinQuietHours('21:00', '07:00', 12 * 60)).toBe(false)
    expect(isWithinQuietHours('21:00', '07:00', 7 * 60)).toBe(false)
    expect(isWithinQuietHours('12:00', '13:00', 12 * 60 + 30)).toBe(true)
    expect(isWithinQuietHours('', '07:00', 3 * 60)).toBe(false)
  })

  test('proactive_care och warranty_followup passerar hubAllowsProactiveSend före sendSms; auto_enabled ignoreras medvetet', () => {
    const route = kod('app/api/approvals/[id]/route.ts')
    for (const c of ["case 'proactive_care':", "case 'warranty_followup':"]) {
      const start = route.indexOf(c)
      const block = route.slice(start, start + 2500)
      const gate = block.indexOf('hubAllowsProactiveSend(')
      const send = block.indexOf('await sendSms(')
      expect(gate, c).toBeGreaterThan(-1)
      expect(send, c).toBeGreaterThan(gate)
    }
    const gate = kod('lib/outbound/hub-gate.ts')
    expect(gate).not.toContain('auto_enabled')
    expect(gate).toContain('quiet_hours_start')
    expect(gate).toContain('max_sms_per_customer_per_week')
    expect(gate).not.toMatch(/sendSms|sendSmsViaElks|anthropic/i)
  })
})

test.describe('Min bostad — grupperat per plats', () => {
  const inst = (o: Partial<PortalInstallation>): PortalInstallation => ({
    installation_id: 'i', project_id: 'p1', name: 'Värmepump', manufacturer: null, model: null, serial_number: null, placement: null,
    installed_at: null, service_interval_months: null, service_interval_source: null, service_source_label: null, next_service_at: null,
    care_instructions: null, site_address_line: null, site_postal_code: null, site_city: null, ...o,
  })
  const pass = (project_id: string): PortalJobbpassSummary => ({ project_id, project_name: project_id, completed_at: null, published_at: null, view: {} as PortalJobbpassSummary['view'] })

  test('installationer grupperas på adressögonblicksbilden, passen följer sitt projekt, okänd plats sist', () => {
    const groups = groupBostad(
      [pass('p1'), pass('p2'), pass('p3')],
      [
        inst({ installation_id: 'a', project_id: 'p1', site_address_line: 'Storgatan 3', site_postal_code: '111 11', site_city: 'Stad' }),
        inst({ installation_id: 'b', project_id: 'p2', site_address_line: 'Sommarvägen 12' }),
        inst({ installation_id: 'c', project_id: 'p1', site_address_line: 'storgatan 3', site_postal_code: '111 11', site_city: 'Stad' }),
      ],
    )
    expect(groups.map(g => g.label)).toEqual(['Storgatan 3, 111 11 Stad', 'Sommarvägen 12', null])
    expect(groups[0].installations.map(i => i.installation_id)).toEqual(['a', 'c'])
    expect(groups[0].passes.map(p => p.project_id)).toEqual(['p1'])
    expect(groups[2].passes.map(p => p.project_id)).toEqual(['p3'])
    expect(siteLabel(inst({}))).toBeNull()
    expect(groupBostad([], [])).toEqual([])
  })

  test('portalen: rutten registrerad i facit-listorna, Hem hämtar och visar "Min bostad"', () => {
    expect(kod('tests/launch-public-token-contract.spec.ts')).toContain("'app/api/portal/[token]/installations/route.ts'")
    expect(kod('tests/portal-error-swallow.spec.ts')).toContain("'app/api/portal/[token]/installations/route.ts'")
    expect(kod('app/portal/[token]/page.tsx')).toContain("fetch(`/api/portal/${token}/installations`)")
    const home = kod('app/portal/[token]/components/PortalHome.tsx')
    expect(home).toContain('groupBostad(')
    expect(home).toContain('>Min bostad</h3>')
    expect(home).toContain('DET HÄR SITTER HOS DIG')
    expect(home).not.toContain('Ditt hem')
  })
})
