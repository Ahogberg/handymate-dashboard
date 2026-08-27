/**
 * Installationsregistret — Fastighetspasset steg 2 (sql/v174_installation.sql).
 *
 * Vad som SITTER hos kunden efter ett jobb: värmepump, laddbox, beredare —
 * tillverkare, modell, serienummer, placering, plats, när. Kedjan:
 * utfört arbete → installerad tillgång → servicebehov → återkommande intäkt.
 *
 * Andreas sanningsgrindar (2026-08-27), var och en låst i
 * tests/facit-installation.spec.ts:
 *   1. project_material skapar BARA utkast — material bevisar ingen installation.
 *   2. Serienummer blockerar aldrig projektavslut; Lars frågar bara när det är
 *      relevant, med "ej tillämpligt" och "komplettera senare".
 *   4. Serviceintervall bara från bekräftad produktinformation eller
 *      hantverkarens val — aldrig en modellgissning.
 *   +  Varje rad bär en adress-/platsögonblicksbild från projektet.
 *
 * Rena regler överst (ingen I/O), databasfunktioner under.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type InstallationStatus = 'draft' | 'confirmed' | 'not_applicable'
export type ServiceIntervalSource = 'product_info' | 'craftsman'
export type InstallationSource = 'project_material' | 'manual'

export interface SiteSnapshot {
  site_address_line: string | null
  site_postal_code: string | null
  site_city: string | null
  site_property_designation: string | null
}

export interface InstallationRow extends SiteSnapshot {
  installation_id: string
  business_id: string
  customer_id: string | null
  project_id: string | null
  material_id: string | null
  name: string
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  serial_pending: boolean
  sku: string | null
  supplier_name: string | null
  placement: string | null
  installed_at: string | null
  status: InstallationStatus
  confirmed_at: string | null
  source: InstallationSource
  service_interval_months: number | null
  service_interval_source: ServiceIntervalSource | null
  service_note: string | null
  care_instructions: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export const SERVICE_INTERVAL_SOURCE_LABEL: Record<ServiceIntervalSource, string> = {
  product_info: 'enligt produktinformationen',
  craftsman: 'enligt hantverkaren',
}

// ─────────────────────────────────────────────────────────────────
// Relevans (grind 2): Lars frågar bara när något kan ha installerats.
// ─────────────────────────────────────────────────────────────────

/** Produkter som sitter kvar hos kunden — inte arbetsmoment ("badrum", "tak"). */
export const INSTALLATION_KEYWORDS: readonly string[] = [
  'varmepump', 'luftvarmepump', 'bergvarme', 'jordvarme', 'fjarrvarme',
  'laddbox', 'laddstation', 'laddstolpe',
  'varmvattenberedare', 'beredare', 'ackumulatortank',
  'elcentral', 'jordfelsbrytare', 'solcell', 'solpanel', 'vaxelriktare', 'batterilager',
  'ventilation', 'ftx', 'ventilationsaggregat', 'flakt', 'koksflakt', 'spisflakt',
  'panna', 'pelletspanna', 'vedpanna', 'kamin', 'braskamin', 'skorsten',
  'golvvarme', 'termostat', 'radiator',
  'blandare', 'toalett', 'wc', 'duschkabin', 'badkar', 'handfat', 'tvattstall',
  'diskmaskin', 'tvattmaskin', 'torktumlare', 'kyl', 'frys', 'spis', 'ugn', 'spishall', 'induktionshall',
  'cirkulationspump', 'expansionskarl', 'vattenfilter', 'avhardare', 'avharda',
  'garageport', 'larm', 'kamera', 'portlas', 'laddare',
  'pool', 'poolvarmepump', 'spabad', 'bastuaggregat',
  'markis', 'persienn',
]

export function normaliseraText(text: string | null | undefined): string {
  return (text || '')
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/å/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/é/g, 'e')
}

export interface InstallationRelevance {
  relevant: boolean
  /** material = projektet har materialrader · keyword = namn/beskrivning pekar på en produkt · null = inget */
  reason: 'material' | 'keyword' | null
  matched: string | null
}

/**
 * Ren regel: relevant om projektet har materialrader (utkast kan skapas) eller
 * om namnet/beskrivningen nämner en produkt som sitter kvar hos kunden.
 * Ett rent "Måla fasaden" eller "Byta takpannor" ger aldrig ett kort.
 */
export function installationRelevance(input: {
  name: string | null | undefined
  description?: string | null
  materialCount: number
}): InstallationRelevance {
  if (input.materialCount > 0) return { relevant: true, reason: 'material', matched: null }
  const text = normaliseraText(`${input.name || ''} ${input.description || ''}`)
  const hit = INSTALLATION_KEYWORDS.find(k => new RegExp(`(^|[^a-z])${k}`).test(text))
  if (hit) return { relevant: true, reason: 'keyword', matched: hit }
  return { relevant: false, reason: null, matched: null }
}

// ─────────────────────────────────────────────────────────────────
// Platsögonblicksbild
// ─────────────────────────────────────────────────────────────────

export interface CustomerAddressRow {
  address_line?: string | null
  visit_address?: string | null
  postal_code?: string | null
  city?: string | null
  property_designation?: string | null
}

/** Besöksadressen vinner över postadressen — det är där installationen sitter. */
export function snapshotSiteAddress(customer: CustomerAddressRow | null | undefined): SiteSnapshot {
  const line = (customer?.visit_address || customer?.address_line || '').trim() || null
  return {
    site_address_line: line,
    site_postal_code: (customer?.postal_code || '').trim() || null,
    site_city: (customer?.city || '').trim() || null,
    site_property_designation: (customer?.property_designation || '').trim() || null,
  }
}

export function formatSite(site: SiteSnapshot): string | null {
  const parts = [site.site_address_line, [site.site_postal_code, site.site_city].filter(Boolean).join(' ') || null].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

// ─────────────────────────────────────────────────────────────────
// Utkast ur material (grind 1: aldrig något annat än 'draft')
// ─────────────────────────────────────────────────────────────────

export interface MaterialRowForDraft {
  material_id: string
  name: string
  sku: string | null
  supplier_name: string | null
  quantity: number | null
  unit: string | null
  notes: string | null
}

export type InstallationInsert = Omit<InstallationRow, 'installation_id' | 'created_at' | 'updated_at'>

export function draftFromMaterial(
  material: MaterialRowForDraft,
  ctx: { businessId: string; projectId: string; customerId: string | null; site: SiteSnapshot },
): InstallationInsert {
  return {
    business_id: ctx.businessId,
    customer_id: ctx.customerId,
    project_id: ctx.projectId,
    material_id: material.material_id,
    name: material.name,
    manufacturer: null,
    model: null,
    serial_number: null,
    serial_pending: false,
    sku: material.sku,
    supplier_name: material.supplier_name,
    placement: null,
    ...ctx.site,
    installed_at: null,
    // Grind 1: ett materialutkast är aldrig en bekräftad installation.
    status: 'draft' as const,
    confirmed_at: null,
    source: 'project_material' as const,
    service_interval_months: null,
    service_interval_source: null,
    service_note: null,
    care_instructions: null,
    notes: material.notes,
  }
}

// ─────────────────────────────────────────────────────────────────
// Validering av ändringar (grind 2 + 4)
// ─────────────────────────────────────────────────────────────────

export const INSTALLATION_PATCHABLE_FIELDS = [
  'name', 'manufacturer', 'model', 'serial_number', 'serial_pending', 'sku', 'supplier_name', 'placement',
  'site_address_line', 'site_postal_code', 'site_city', 'site_property_designation',
  'installed_at', 'status', 'service_interval_months', 'service_interval_source', 'service_note',
  'care_instructions', 'notes',
] as const
export type InstallationPatchField = typeof INSTALLATION_PATCHABLE_FIELDS[number]
export type InstallationPatch = Partial<Pick<InstallationRow, InstallationPatchField>>

export type PatchValidation = { ok: true; patch: InstallationPatch } | { ok: false; error: string }

const trimOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * Ren validering av det ägaren/hantverkaren skickar in. Svenska fel — de
 * visas rakt av i UI:t.
 *  - Grind 4: intervall utan källa (eller källa utan intervall) avvisas.
 *  - Grind 2: 'not_applicable' och serial_pending är alltid giltiga val;
 *    ett serienummer krävs aldrig.
 *  - Bekräftelse kräver bara ett namn — det som faktiskt sitter där.
 */
export function validateInstallationPatch(raw: Record<string, unknown>, current?: Pick<InstallationRow, 'name' | 'service_interval_months' | 'service_interval_source'>): PatchValidation {
  const patch: InstallationPatch = {}
  for (const key of INSTALLATION_PATCHABLE_FIELDS) {
    if (!(key in raw)) continue
    const v = raw[key]
    switch (key) {
      case 'serial_pending':
        patch.serial_pending = Boolean(v)
        break
      case 'status':
        if (v !== 'draft' && v !== 'confirmed' && v !== 'not_applicable') return { ok: false, error: 'Ogiltig status.' }
        patch.status = v
        break
      case 'service_interval_months': {
        if (v === null || v === '' || v === undefined) { patch.service_interval_months = null; break }
        const n = Number(v)
        if (!Number.isInteger(n) || n < 1 || n > 240) return { ok: false, error: 'Serviceintervallet anges i hela månader, 1–240.' }
        patch.service_interval_months = n
        break
      }
      case 'service_interval_source':
        if (v === null || v === '' || v === undefined) { patch.service_interval_source = null; break }
        if (v !== 'product_info' && v !== 'craftsman') return { ok: false, error: 'Ange var serviceintervallet kommer ifrån: produktinformationen eller ditt eget val.' }
        patch.service_interval_source = v
        break
      case 'installed_at': {
        const s = trimOrNull(v)
        if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, error: 'Installationsdatum anges som ÅÅÅÅ-MM-DD.' }
        patch.installed_at = s
        break
      }
      case 'name': {
        const s = trimOrNull(v)
        if (!s) return { ok: false, error: 'Installationen behöver ett namn — vad är det som sitter där?' }
        patch.name = s
        break
      }
      default:
        patch[key] = trimOrNull(v) as never
    }
  }

  // Grind 4: intervall och källa följs åt.
  const months = 'service_interval_months' in patch ? patch.service_interval_months : current?.service_interval_months ?? null
  const source = 'service_interval_source' in patch ? patch.service_interval_source : current?.service_interval_source ?? null
  if ((months == null) !== (source == null)) {
    return { ok: false, error: 'Serviceintervall sparas bara tillsammans med sin källa — produktinformationen eller ditt eget val. Ingen gissning.' }
  }

  return { ok: true, patch }
}

// ─────────────────────────────────────────────────────────────────
// Databas
// ─────────────────────────────────────────────────────────────────

const SELECT = '*'

export async function listInstallationsForProject(
  supabase: SupabaseClient, businessId: string, projectId: string,
): Promise<{ rows: InstallationRow[]; error?: string }> {
  const { data, error } = await supabase
    .from('installation')
    .select(SELECT)
    .eq('business_id', businessId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  if (error) return { rows: [], error: error.message }
  return { rows: (data || []) as InstallationRow[] }
}

/** Bara det kunden får se: bekräftade rader. Fail-soft: fel ⇒ 'error' (anroparen visar inget, aldrig något påhittat). */
export async function listConfirmedInstallationsForProject(
  supabase: SupabaseClient, businessId: string, projectId: string,
): Promise<InstallationRow[] | 'error'> {
  const { data, error } = await supabase
    .from('installation')
    .select(SELECT)
    .eq('business_id', businessId)
    .eq('project_id', projectId)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[installation] confirmed query error:', error.message)
    return 'error'
  }
  return (data || []) as InstallationRow[]
}

export async function loadProjectSite(
  supabase: SupabaseClient, businessId: string, projectId: string,
): Promise<{ customerId: string | null; site: SiteSnapshot; projectName: string; description: string | null } | null> {
  const { data: project, error } = await supabase
    .from('project')
    .select('project_id, name, description, customer_id')
    .eq('business_id', businessId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (error || !project) return null
  let customer: CustomerAddressRow | null = null
  if (project.customer_id) {
    const { data } = await supabase
      .from('customer')
      .select('address_line, visit_address, postal_code, city, property_designation')
      .eq('business_id', businessId)
      .eq('customer_id', project.customer_id)
      .maybeSingle()
    customer = (data as CustomerAddressRow | null) ?? null
  }
  return {
    customerId: (project.customer_id as string | null) ?? null,
    site: snapshotSiteAddress(customer),
    projectName: project.name as string,
    description: (project.description as string | null) ?? null,
  }
}

/**
 * Idempotent: ett utkast per materialrad som saknar ett. Grind 1 — allt som
 * skapas här är 'draft'. Returnerar hur många som skapades; fel svaras ärligt.
 */
export async function ensureMaterialDrafts(
  supabase: SupabaseClient, businessId: string, projectId: string,
): Promise<{ created: number; materialCount: number; error?: string }> {
  const { data: materials, error: matErr } = await supabase
    .from('project_material')
    .select('material_id, name, sku, supplier_name, quantity, unit, notes')
    .eq('business_id', businessId)
    .eq('project_id', projectId)
  if (matErr) return { created: 0, materialCount: 0, error: matErr.message }
  const rows = (materials || []) as MaterialRowForDraft[]
  if (rows.length === 0) return { created: 0, materialCount: 0 }

  const { data: existing, error: exErr } = await supabase
    .from('installation')
    .select('material_id')
    .eq('business_id', businessId)
    .eq('project_id', projectId)
    .not('material_id', 'is', null)
  if (exErr) return { created: 0, materialCount: rows.length, error: exErr.message }
  const has = new Set((existing || []).map(r => r.material_id as string))
  const missing = rows.filter(m => !has.has(m.material_id))
  if (missing.length === 0) return { created: 0, materialCount: rows.length }

  const ctx = await loadProjectSite(supabase, businessId, projectId)
  if (!ctx) return { created: 0, materialCount: rows.length, error: 'Projektet hittades inte' }
  const inserts = missing.map(m => draftFromMaterial(m, { businessId, projectId, customerId: ctx.customerId, site: ctx.site }))
  const { error: insErr } = await supabase.from('installation').insert(inserts)
  if (insErr) return { created: 0, materialCount: rows.length, error: insErr.message }
  return { created: inserts.length, materialCount: rows.length }
}

export async function createManualInstallation(
  supabase: SupabaseClient, businessId: string, projectId: string, raw: Record<string, unknown>,
): Promise<{ ok: true; row: InstallationRow } | { ok: false; error: string; status: number }> {
  const v = validateInstallationPatch({ ...raw, name: raw.name })
  if (!v.ok) return { ok: false, error: v.error, status: 400 }
  if (!v.patch.name) return { ok: false, error: 'Installationen behöver ett namn — vad är det som sitter där?', status: 400 }
  const ctx = await loadProjectSite(supabase, businessId, projectId)
  if (!ctx) return { ok: false, error: 'Projektet hittades inte', status: 404 }
  const status: InstallationStatus = v.patch.status ?? 'draft'
  const insert: InstallationInsert = {
    business_id: businessId,
    customer_id: ctx.customerId,
    project_id: projectId,
    material_id: null,
    name: v.patch.name,
    manufacturer: v.patch.manufacturer ?? null,
    model: v.patch.model ?? null,
    serial_number: v.patch.serial_number ?? null,
    serial_pending: v.patch.serial_pending ?? false,
    sku: v.patch.sku ?? null,
    supplier_name: v.patch.supplier_name ?? null,
    placement: v.patch.placement ?? null,
    site_address_line: v.patch.site_address_line ?? ctx.site.site_address_line,
    site_postal_code: v.patch.site_postal_code ?? ctx.site.site_postal_code,
    site_city: v.patch.site_city ?? ctx.site.site_city,
    site_property_designation: v.patch.site_property_designation ?? ctx.site.site_property_designation,
    installed_at: v.patch.installed_at ?? null,
    status,
    confirmed_at: status === 'confirmed' ? new Date().toISOString() : null,
    source: 'manual',
    service_interval_months: v.patch.service_interval_months ?? null,
    service_interval_source: v.patch.service_interval_source ?? null,
    service_note: v.patch.service_note ?? null,
    care_instructions: v.patch.care_instructions ?? null,
    notes: v.patch.notes ?? null,
  }
  const { data, error } = await supabase.from('installation').insert(insert).select(SELECT).single()
  if (error) return { ok: false, error: error.message, status: 500 }
  return { ok: true, row: data as InstallationRow }
}

export async function updateInstallation(
  supabase: SupabaseClient, businessId: string, installationId: string, raw: Record<string, unknown>,
): Promise<{ ok: true; row: InstallationRow } | { ok: false; error: string; status: number }> {
  const { data: current, error: curErr } = await supabase
    .from('installation')
    .select(SELECT)
    .eq('business_id', businessId)
    .eq('installation_id', installationId)
    .maybeSingle()
  if (curErr) return { ok: false, error: curErr.message, status: 500 }
  if (!current) return { ok: false, error: 'Installationen hittades inte', status: 404 }
  const row = current as InstallationRow

  const v = validateInstallationPatch(raw, row)
  if (!v.ok) return { ok: false, error: v.error, status: 400 }
  const update: Record<string, unknown> = { ...v.patch, updated_at: new Date().toISOString() }
  if ('status' in v.patch) {
    // Bekräftad ⇔ stämpel (CHECK i v174). Tillbaka till utkast/ej tillämpligt nollar stämpeln.
    update.confirmed_at = v.patch.status === 'confirmed' ? (row.confirmed_at ?? new Date().toISOString()) : null
  }
  const { data, error } = await supabase
    .from('installation')
    .update(update)
    .eq('business_id', businessId)
    .eq('installation_id', installationId)
    .select(SELECT)
    .single()
  if (error) return { ok: false, error: error.message, status: 500 }
  return { ok: true, row: data as InstallationRow }
}

export async function deleteInstallation(
  supabase: SupabaseClient, businessId: string, installationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('installation')
    .delete()
    .eq('business_id', businessId)
    .eq('installation_id', installationId)
  return error ? { ok: false, error: error.message } : { ok: true }
}
