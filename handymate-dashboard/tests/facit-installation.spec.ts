/**
 * Facit: Installationsregistret — Fastighetspasset steg 2 (2026-08-27).
 * Låser Andreas sanningsgrindar 1, 2, 4 + adressögonblicksbilden.
 *
 *   npx playwright test tests/facit-installation.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  installationRelevance,
  snapshotSiteAddress,
  draftFromMaterial,
  validateInstallationPatch,
  INSTALLATION_KEYWORDS,
} from '../lib/installation/installation'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const site = { site_address_line: 'Provgatan 3', site_postal_code: '123 45', site_city: 'Provstad', site_property_designation: null }
const material = { material_id: 'mat_1', name: 'Nibe F2120 värmepump', sku: 'NIBE-F2120', supplier_name: 'Ahlsell', quantity: 1, unit: 'st', notes: null }

test.describe('grind 1 — material skapar bara utkast', () => {
  test('draftFromMaterial ger alltid status draft och källa project_material', () => {
    const d = draftFromMaterial(material, { businessId: 'biz_1', projectId: 'proj_1', customerId: 'cust_1', site })
    expect(d.status).toBe('draft')
    expect(d.source).toBe('project_material')
    expect(d.confirmed_at).toBeNull()
    expect(d.material_id).toBe('mat_1')
    expect(d.site_address_line).toBe('Provgatan 3')
  })

  test('ensureMaterialDrafts går bara genom draftFromMaterial — ingen annan väg till confirmed ur material', () => {
    const lib = kod('lib/installation/installation.ts')
    const fn = lib.slice(lib.indexOf('export async function ensureMaterialDrafts('), lib.indexOf('export async function createManualInstallation('))
    expect(fn).toContain('draftFromMaterial(m,')
    expect(fn).not.toContain("'confirmed'")
    // Kundvyn läser bara bekräftade rader
    expect(lib).toMatch(/listConfirmedInstallationsForProject[\s\S]*?\.eq\('status', 'confirmed'\)/)
  })
})

test.describe('grind 2 — serienummer blockerar aldrig, Lars frågar bara när det är relevant', () => {
  test('relevans: material eller produktord — aldrig ett rent arbetsmoment', () => {
    expect(installationRelevance({ name: 'Måla fasaden', materialCount: 0 }).relevant).toBe(false)
    expect(installationRelevance({ name: 'Byta takpannor', description: 'Hela taket', materialCount: 0 }).relevant).toBe(false)
    expect(installationRelevance({ name: 'Installation av värmepump', materialCount: 0 })).toEqual({ relevant: true, reason: 'keyword', matched: 'varmepump' })
    expect(installationRelevance({ name: 'Garage', description: 'Montera laddbox på väggen', materialCount: 0 }).reason).toBe('keyword')
    expect(installationRelevance({ name: 'Måla fasaden', materialCount: 2 }).reason).toBe('material')
    // Ordgränsen: "element" i "elementärt" ska inte träffa
    expect(installationRelevance({ name: 'Elementärt underhåll', materialCount: 0 }).relevant).toBe(false)
    expect(INSTALLATION_KEYWORDS).not.toContain('badrum')
    expect(INSTALLATION_KEYWORDS).not.toContain('tak')
  })

  test('validering: "ej tillämpligt" och "komplettera senare" är giltiga; serienummer krävs aldrig', () => {
    expect(validateInstallationPatch({ status: 'not_applicable' })).toEqual({ ok: true, patch: { status: 'not_applicable' } })
    expect(validateInstallationPatch({ serial_pending: true })).toEqual({ ok: true, patch: { serial_pending: true } })
    const confirm = validateInstallationPatch({ status: 'confirmed' }, { name: 'Värmepump', service_interval_months: null, service_interval_source: null })
    expect(confirm.ok).toBe(true)
    expect(JSON.stringify(validateInstallationPatch({ status: 'confirmed', serial_number: '' }))).not.toMatch(/serienummer/i)
  })

  test('avslutsmotorn: kortet skapas efter att projektet redan är klart, bara vid relevans, och kräver granskning — inget klick avslutar något', () => {
    const cp = kod('lib/projects/complete-project.ts')
    expect(cp).toContain("| 'installation_register'")
    expect(cp).toContain('installationRelevance(')
    expect(cp).toMatch(/status: 'skipped', message: 'Inget i projektet pekar på en installation'/)
    expect(cp).toContain("approval_type: 'installation_register'")
    expect(cp).toContain("target_route: `/dashboard/projects/${project.project_id}/installationer`")
    // Kortet ligger i runCompletionEffects — efter transitionProjectToCompleted, aldrig före
    expect(cp.indexOf('proposeInstallationRegister(supabase, businessId, project)')).toBeGreaterThan(cp.indexOf('async function runCompletionEffects('))
    expect(kod('lib/approvals/action-contract.ts')).toContain("installation_register: 'REVIEW_REQUIRED'")
    const sida = kod('app/dashboard/projects/[id]/installationer/page.tsx')
    expect(sida).toContain('Ej tillämpligt')
    expect(sida).toContain('Komplettera serienumret senare')
    expect(sida).toContain('Inget här stoppar avslutet')
  })
})

test.describe('grind 4 — serviceintervall bara med källa', () => {
  test('intervall utan källa avvisas, källa utan intervall avvisas, båda tillsammans går igenom', () => {
    expect(validateInstallationPatch({ service_interval_months: 12 }).ok).toBe(false)
    expect(validateInstallationPatch({ service_interval_source: 'craftsman' }).ok).toBe(false)
    expect(validateInstallationPatch({ service_interval_months: 12, service_interval_source: 'product_info' })).toEqual({
      ok: true, patch: { service_interval_months: 12, service_interval_source: 'product_info' },
    })
    expect(validateInstallationPatch({ service_interval_months: 12, service_interval_source: 'ai_guess' }).ok).toBe(false)
    // Nollställning av båda är tillåten
    expect(validateInstallationPatch({ service_interval_months: null, service_interval_source: null }).ok).toBe(true)
    // Befintlig källa + nytt intervall går igenom
    expect(validateInstallationPatch({ service_interval_months: 6 }, { name: 'x', service_interval_months: 12, service_interval_source: 'craftsman' }).ok).toBe(true)
  })

  test('databasen säger samma sak (CHECK) och ingen modell gissar', () => {
    const sql = kod('sql/v174_installation.sql')
    expect(sql).toContain('(service_interval_months IS NULL) = (service_interval_source IS NULL)')
    expect(sql).toContain("service_interval_source IN ('product_info', 'craftsman')")
    expect(sql).toContain("status IN ('draft', 'confirmed', 'not_applicable')")
    expect(kod('lib/installation/installation.ts')).not.toMatch(/anthropic|openai|llm|claude-/i)
    expect(kod('app/api/projects/[id]/installations/route.ts')).not.toMatch(/anthropic|openai|sendSms|sendPortalNotification/i)
  })
})

test.describe('platsögonblicksbild', () => {
  test('besöksadressen vinner, annars postadressen; tomt blir null', () => {
    expect(snapshotSiteAddress({ address_line: 'Postgatan 1', visit_address: 'Sommarvägen 12', postal_code: '111 11', city: 'Ö-vik' }))
      .toEqual({ site_address_line: 'Sommarvägen 12', site_postal_code: '111 11', site_city: 'Ö-vik', site_property_designation: null })
    expect(snapshotSiteAddress({ address_line: 'Postgatan 1' }).site_address_line).toBe('Postgatan 1')
    expect(snapshotSiteAddress(null)).toEqual({ site_address_line: null, site_postal_code: null, site_city: null, site_property_designation: null })
  })

  test('kolumnerna finns i v174 som ögonblicksbild — ingen FK till en fastighet', () => {
    const sql = kod('sql/v174_installation.sql')
    for (const c of ['site_address_line', 'site_postal_code', 'site_city', 'site_property_designation']) expect(sql).toContain(c)
    expect(sql).not.toMatch(/REFERENCES public\.property/)
  })
})

test.describe('kundvyn — bara bekräftade installationer, med källa på intervallet', () => {
  test('jobbpasset bär installations i allowlisten och filtrerar på confirmed', () => {
    const lib = kod('lib/jobbpass/jobbpass.ts')
    expect(lib).toContain("'installations'")
    expect(lib).toMatch(/installation: \[[^\]]*'service_interval_source'[^\]]*\]/)
    expect(lib).toMatch(/\.filter\(r => r\.status === 'confirmed'\)/)
    const view = kod('components/jobbpass/JobbpassView.tsx')
    expect(view).toContain('Det här sitter hos dig')
    expect(view).toContain('SERVICE_INTERVAL_SOURCE_LABEL')
  })
})
