/**
 * Garantisanningen — Fastighetspasset steg 3, grind 3 (sql/v175_warranty_truth.sql).
 *
 * En garanti får bara nå kunden när den är registrerad med typ, garantigivare
 * och källa. Portalen får aldrig lova mer än företaget (eller tillverkaren,
 * eller avtalet) faktiskt ansvarar för. Rena regler överst, databas under.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type WarrantyKind = 'product' | 'workmanship' | 'service_agreement'
export type WarrantySource = 'product_info' | 'contract' | 'craftsman'

export const WARRANTY_KINDS: readonly WarrantyKind[] = ['product', 'workmanship', 'service_agreement']
export const WARRANTY_SOURCES: readonly WarrantySource[] = ['product_info', 'contract', 'craftsman']

export const WARRANTY_KIND_LABEL: Record<WarrantyKind, string> = {
  product: 'Produktgaranti',
  workmanship: 'Utförandegaranti',
  service_agreement: 'Serviceavtal',
}

export const WARRANTY_SOURCE_LABEL: Record<WarrantySource, string> = {
  product_info: 'enligt produktinformationen',
  contract: 'enligt avtalet',
  craftsman: 'enligt hantverkarens utfästelse',
}

export interface WarrantyTruth {
  warranty_kind: WarrantyKind | null
  issuer: string | null
  source: WarrantySource | null
}

/**
 * Ren validering: ingen typ ⇒ alla tre null (äldre rad, når aldrig kunden).
 * Typ ⇒ garantigivare OCH källa krävs. Svenska fel, visas rakt av i UI:t.
 */
export function validateWarrantyTruth(raw: { warranty_kind?: unknown; issuer?: unknown; source?: unknown }):
  { ok: true; value: WarrantyTruth } | { ok: false; error: string } {
  const kind = typeof raw.warranty_kind === 'string' && raw.warranty_kind.trim() ? raw.warranty_kind.trim() : null
  const issuer = typeof raw.issuer === 'string' && raw.issuer.trim() ? raw.issuer.trim() : null
  const source = typeof raw.source === 'string' && raw.source.trim() ? raw.source.trim() : null
  if (!kind) {
    if (issuer || source) return { ok: false, error: 'Välj vilken sorts garanti det är — produktgaranti, utförandegaranti eller serviceavtal.' }
    return { ok: true, value: { warranty_kind: null, issuer: null, source: null } }
  }
  if (!(WARRANTY_KINDS as readonly string[]).includes(kind)) return { ok: false, error: 'Ogiltig garantityp.' }
  if (!issuer) return { ok: false, error: 'Ange vem som ansvarar för garantin — tillverkaren, ert företag eller avtalsparten.' }
  if (!source || !(WARRANTY_SOURCES as readonly string[]).includes(source)) {
    return { ok: false, error: 'Ange var garantiuppgiften kommer ifrån: produktinformationen, avtalet eller er egen utfästelse.' }
  }
  return { ok: true, value: { warranty_kind: kind as WarrantyKind, issuer, source: source as WarrantySource } }
}

export interface WarrantyRow extends WarrantyTruth {
  warranty_id: string
  business_id: string
  customer_id: string
  project_id: string | null
  installation_id: string | null
  title: string
  description: string | null
  start_date: string
  end_date: string
  status: 'active' | 'expired' | 'claimed' | 'voided'
}

/** Det kunden får se. Källan följer alltid med — löftet har en avsändare. */
export interface CustomerWarranty {
  title: string
  kind: WarrantyKind
  kind_label: string
  issuer: string
  source_label: string
  start_date: string
  end_date: string
  description: string | null
  installation_id: string | null
}

/**
 * Ren regel: bara aktiva, registrerade (typ + garantigivare + källa) och
 * ännu gällande garantier. Äldre rader utan typ når aldrig kunden.
 */
export function customerWarrantiesFromRows(rows: readonly WarrantyRow[], todayIso: string): CustomerWarranty[] {
  const today = todayIso.slice(0, 10)
  return rows
    .filter(r => r.status === 'active' && r.warranty_kind && r.issuer && r.source && r.end_date >= today)
    .map(r => ({
      title: r.title,
      kind: r.warranty_kind as WarrantyKind,
      kind_label: WARRANTY_KIND_LABEL[r.warranty_kind as WarrantyKind],
      issuer: r.issuer as string,
      source_label: WARRANTY_SOURCE_LABEL[r.source as WarrantySource],
      start_date: r.start_date,
      end_date: r.end_date,
      description: r.description,
      installation_id: r.installation_id,
    }))
}

const SELECT = 'warranty_id, business_id, customer_id, project_id, installation_id, title, description, start_date, end_date, status, warranty_kind, issuer, source'

/** Fail-soft: fel ⇒ 'error' (anroparen visar inget — aldrig något påhittat). */
export async function listWarrantiesForProject(
  supabase: SupabaseClient, businessId: string, projectId: string,
): Promise<WarrantyRow[] | 'error'> {
  const { data, error } = await supabase
    .from('warranty')
    .select(SELECT)
    .eq('business_id', businessId)
    .eq('project_id', projectId)
    .order('end_date', { ascending: true })
  if (error) {
    console.error('[warranty] project query error:', error.message)
    return 'error'
  }
  return (data || []) as WarrantyRow[]
}
