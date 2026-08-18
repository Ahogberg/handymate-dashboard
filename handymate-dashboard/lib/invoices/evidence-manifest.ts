/**
 * Frozen Invoice Evidence Manifest V1 (Etapp P, sql/v148_invoice_evidence_
 * manifest.sql, 2026-08-18).
 *
 * Fryser VILKET underlag (ProjectCommercialReadiness-verdikt + slots/refs,
 * lib/projects/commercial-readiness.ts) som fanns när en faktura FÖRST
 * levererades till kund. Idiomet är hämtat rakt av från
 * lib/efterkalkyl/freeze-outcome.ts: versionskonstant, deterministiskt id
 * (idempotent upsert), schema-saknas-detektion (42P01/42703/PGRST204),
 * rapporteraTystFel på varje oväntat fel.
 *
 * ═══ KONTRAKT SOM ALDRIG FÅR BRYTAS ═══
 *
 * sql/v148 är INTE körd i alla miljöer än. prepareInvoiceManifest och
 * markInvoiceDelivered KASTAR ALDRIG — ett manifest-fel (schema saknas,
 * nätverk nere, vad som helst) får ALDRIG blockera eller ens fördröja den
 * faktiska fakturasändningen. De tre anropsställena (app/api/invoices/send,
 * app/api/invoices/[id]/send-via-fortnox, app/api/invoices/auto-generate)
 * anropar dem best-effort och ignorerar returvärdet i sändvägen.
 *
 * Läs-only mot BEFINTLIGA rader: readiness_snapshot bär bara table+ref_id
 * (EvidenceRef, samma kontrakt som commercial-readiness.ts) — aldrig bilder,
 * dokument eller fritext. Modulen skriver ALDRIG DELETE.
 *
 * Exekveringsmodell: prepare (status 'prepared', FÖRE fysisk sändning) →
 * fysisk sändning → mark delivered (EFTER lyckad sändning). Faller sista
 * steget (processen dör, marken själv failar) läker reconcileInvoiceManifests
 * via extern evidens (invoice.status/sent_at eller customer_activity
 * 'invoice_sent') — aldrig ett tyst hål.
 */

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  loadProjectCommercialReadiness,
  READINESS_RULES_VERSION,
  type ProjectCommercialReadiness,
  type EvidenceSlot,
} from '@/lib/projects/commercial-readiness'
import { rapporteraTystFel } from '@/lib/observability/driftlarm'

export const MANIFEST_VERSION = 1

export type ManifestStatus = 'prepared' | 'delivered' | 'incomplete' | 'reconciled'

export interface InvoiceEvidenceManifestRow {
  id: string
  business_id: string
  invoice_id: string
  project_id: string | null
  manifest_version: number
  readiness_rules_version: number
  readiness_snapshot: Record<string, unknown>
  input_fingerprint: string
  status: ManifestStatus
  delivery_method: string | null
  prepared_at: string
  delivered_at: string | null
  reconciled_at: string | null
  completeness_flags: Record<string, unknown>
}

/** Deterministiskt id — invmf_<invoice_id> — gör upsert idempotent utan att
    behöva läsa en befintlig rad först för att veta OM den finns. */
export function manifestId(invoiceId: string): string {
  return `invmf_${invoiceId}`
}

// ─────────────────────────────────────────────────────────────────
// Schema-saknas-detektion — samma konvention som freeze-outcome.ts.
// ─────────────────────────────────────────────────────────────────

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42P01' || /relation .* does not exist/i.test(error.message || '')
}

export function isManifestSchemaMissing(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false
  return isMissingTableError(error) || error.code === '42703' || error.code === 'PGRST204'
}

/** Loggas bara en gång per körande process — sql/v148 körs manuellt av
    Andreas, ingen anledning att spamma loggen innan den är körd. */
let schemaMissingWarned = false

// ─────────────────────────────────────────────────────────────────
// Rena funktioner — fingerprint + snapshot. Ingen I/O, direkt testbara.
// ─────────────────────────────────────────────────────────────────

/**
 * sha256 av readiness-slotsen (slot+status+refs) — samma "watch"-mönster
 * som lib/business-twin/forecast-fingerprint.ts. Medvetet EXKLUDERAR
 * verdict/blockers/truth_notes: de kan skifta formulering vid en
 * READINESS_RULES_VERSION-bump utan att den underliggande EVIDENSEN ändrats
 * — fingerprinten ska upptäcka förändrat underlag, inte förändrad
 * formulering av samma underlag.
 */
export function computeManifestFingerprint(
  readiness: Pick<ProjectCommercialReadiness, 'slots'> | null,
): string {
  const source = readiness
    ? JSON.stringify(readiness.slots.map(s => ({ slot: s.slot, status: s.status, refs: s.refs })))
    : JSON.stringify({ project: null })
  const hash = createHash('sha256')
  hash.update(source)
  return `iem_v1_${hash.digest('hex')}`
}

export interface BuildManifestSnapshotInput {
  /** null om projektet saknas ELLER inte kunde läsas — se hasProject/projectFound för vilket. */
  readiness: ProjectCommercialReadiness | null
  /** false = fakturan har ingen quote_id/project_id kopplad alls. */
  hasProject: boolean
  /** true = projektet fanns och lästes; irrelevant om hasProject är false. */
  projectFound: boolean
}

export interface ManifestSnapshotResult {
  snapshot: Record<string, unknown>
  completeness_flags: Record<string, unknown>
  fingerprint: string
}

/**
 * Bygger den frysta snapshotten. Ren funktion — hela hederlighetsprincipen
 * (aldrig gissa "klart") ligger redan i deriveProjectCommercialReadiness;
 * den här funktionen degraderar bara ÄRLIGT när ett projekt saknas eller
 * inte gick att läsa, precis som council-guardraden kräver för slotsen.
 */
export function buildManifestSnapshot(input: BuildManifestSnapshotInput): ManifestSnapshotResult {
  if (!input.hasProject) {
    return {
      snapshot: { has_project: false },
      completeness_flags: {
        has_project: false,
        readiness_loaded: false,
        note: 'inget projekt kopplat',
      },
      fingerprint: computeManifestFingerprint(null),
    }
  }

  if (!input.projectFound || !input.readiness) {
    return {
      snapshot: { has_project: true, project_found: false },
      completeness_flags: {
        has_project: true,
        readiness_loaded: false,
        note: 'projektet kunde inte läsas',
      },
      fingerprint: computeManifestFingerprint(null),
    }
  }

  return {
    snapshot: {
      has_project: true,
      project_found: true,
      verdict: input.readiness.verdict,
      slots: input.readiness.slots,
      blockers: input.readiness.blockers,
      truth_notes: input.readiness.truth_notes,
    },
    completeness_flags: { has_project: true, readiness_loaded: true },
    fingerprint: computeManifestFingerprint(input.readiness),
  }
}

// ─────────────────────────────────────────────────────────────────
// Fel-rapportering — samma freezeFailure-idiom som freeze-outcome.ts.
// ─────────────────────────────────────────────────────────────────

export type ManifestFailureCode =
  | 'read_failed'
  | 'schema_missing'
  | 'upsert_failed'
  | 'deliver-utan-prepare'
  | 'unexpected'

export type ManifestResult =
  | { ok: true; row: InvoiceEvidenceManifestRow }
  | { ok: false; code: ManifestFailureCode; message: string }

async function reportFailure(
  supabase: SupabaseClient,
  businessId: string,
  invoiceId: string,
  code: ManifestFailureCode,
  message: string,
): Promise<{ ok: false; code: ManifestFailureCode; message: string }> {
  console.error('[invoice-manifest] fel', { invoiceId, code, message })
  try {
    await rapporteraTystFel(supabase, businessId, `invoice-manifest:${code}`, message, { invoiceId })
  } catch (reportError) {
    console.error('[invoice-manifest] driftlarmet kunde inte sparas', { invoiceId, reportError })
  }
  return { ok: false, code, message }
}

function schemaMissingResult(): { ok: false; code: 'schema_missing'; message: string } {
  if (!schemaMissingWarned) {
    schemaMissingWarned = true
    console.error(
      '[invoice-manifest] invoice_evidence_manifest saknas (kör sql/v148_invoice_evidence_manifest.sql manuellt) — skippar manifest tills vidare',
    )
  }
  return { ok: false, code: 'schema_missing', message: 'Kör sql/v148_invoice_evidence_manifest.sql manuellt.' }
}

// ─────────────────────────────────────────────────────────────────
// prepareInvoiceManifest — anropas FÖRE fysisk sändning.
// ─────────────────────────────────────────────────────────────────

export interface PrepareManifestParams {
  businessId: string
  invoiceId: string
  /** null om fakturan inte har ett kopplat projekt — hederligt, inte gissat. */
  projectId: string | null
}

/**
 * Fryser fakturaunderlaget innan sändningen påbörjas. NEVER THROWS — varje
 * felväg rapporteras (rapporteraTystFel, utom det väntade schema-saknas-
 * läget) och returnerar { ok: false }. Anroparen fortsätter sändningen
 * OAVSETT returvärde.
 */
export async function prepareInvoiceManifest(
  supabase: SupabaseClient,
  params: PrepareManifestParams,
): Promise<ManifestResult> {
  const id = manifestId(params.invoiceId)
  try {
    let readiness: ProjectCommercialReadiness | null = null
    if (params.projectId) {
      try {
        readiness = await loadProjectCommercialReadiness(supabase, params.businessId, params.projectId)
      } catch {
        // loadProjectCommercialReadiness är dokumenterat fail-soft internt
        // och ska inte kasta, men ett trasigt uppslag får degradera
        // SNAPSHOTTEN (hanteras nedan via projectFound:false), aldrig
        // avbryta manifestet.
        readiness = null
      }
    }

    const { snapshot, completeness_flags, fingerprint } = buildManifestSnapshot({
      readiness,
      hasProject: Boolean(params.projectId),
      projectFound: readiness !== null,
    })

    const { data: existing, error: selectErr } = await supabase
      .from('invoice_evidence_manifest')
      .select('*')
      .eq('id', id)
      .eq('business_id', params.businessId)
      .maybeSingle()

    if (selectErr) {
      if (isManifestSchemaMissing(selectErr)) return schemaMissingResult()
      return await reportFailure(supabase, params.businessId, params.invoiceId, 'read_failed', selectErr.message)
    }

    // Redan levererad/avstämd — den frusna sanningen om det FÖRSTA
    // leveranstillfället rör vi inte, en omprepare inför en resend får
    // aldrig skriva över det historiska underlaget.
    if (existing && (existing.status === 'delivered' || existing.status === 'reconciled')) {
      return { ok: true, row: existing as InvoiceEvidenceManifestRow }
    }

    const now = new Date().toISOString()
    const payload = {
      id,
      business_id: params.businessId,
      invoice_id: params.invoiceId,
      project_id: params.projectId,
      manifest_version: MANIFEST_VERSION,
      readiness_rules_version: READINESS_RULES_VERSION,
      readiness_snapshot: snapshot,
      input_fingerprint: fingerprint,
      status: 'prepared' as const,
      completeness_flags,
      prepared_at: now,
    }

    if (existing) {
      const { data: updated, error: updateErr } = await supabase
        .from('invoice_evidence_manifest')
        .update(payload)
        .eq('id', id)
        .eq('business_id', params.businessId)
        .select('*')
        .maybeSingle()
      if (updateErr) {
        if (isManifestSchemaMissing(updateErr)) return schemaMissingResult()
        return await reportFailure(supabase, params.businessId, params.invoiceId, 'upsert_failed', updateErr.message)
      }
      return { ok: true, row: (updated ?? { ...existing, ...payload }) as InvoiceEvidenceManifestRow }
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('invoice_evidence_manifest')
      .insert({ ...payload, delivery_method: null, delivered_at: null, reconciled_at: null })
      .select('*')
      .maybeSingle()
    if (insertErr) {
      if (isManifestSchemaMissing(insertErr)) return schemaMissingResult()
      return await reportFailure(supabase, params.businessId, params.invoiceId, 'upsert_failed', insertErr.message)
    }
    return { ok: true, row: (inserted ?? payload) as InvoiceEvidenceManifestRow }
  } catch (err) {
    return await reportFailure(
      supabase,
      params.businessId,
      params.invoiceId,
      'unexpected',
      err instanceof Error ? err.message : String(err),
    )
  }
}

// ─────────────────────────────────────────────────────────────────
// markInvoiceDelivered — anropas EFTER lyckad fysisk sändning.
// ─────────────────────────────────────────────────────────────────

export interface MarkDeliveredParams {
  businessId: string
  invoiceId: string
  /** 'email' | 'sms' | 'both' | 'fortnox' — första lyckade leveransmetod. */
  method: string
}

/**
 * Markerar manifestet levererat. NEVER THROWS. Idempotent: delivered/
 * reconciled rörs aldrig igen (ett omskick ändrar inte historiken).
 * Saknas manifestraden helt (prepare kördes aldrig eller misslyckades
 * tyst) sätts en 'incomplete'-rad in direkt — det HÖGA signal-läget som
 * både reconcilern och driftlarmet reagerar på.
 */
export async function markInvoiceDelivered(
  supabase: SupabaseClient,
  params: MarkDeliveredParams,
): Promise<ManifestResult> {
  const id = manifestId(params.invoiceId)
  try {
    const { data: existing, error: selectErr } = await supabase
      .from('invoice_evidence_manifest')
      .select('*')
      .eq('id', id)
      .eq('business_id', params.businessId)
      .maybeSingle()

    if (selectErr) {
      if (isManifestSchemaMissing(selectErr)) return schemaMissingResult()
      return await reportFailure(supabase, params.businessId, params.invoiceId, 'read_failed', selectErr.message)
    }

    const now = new Date().toISOString()

    if (!existing) {
      await reportFailure(
        supabase,
        params.businessId,
        params.invoiceId,
        'deliver-utan-prepare',
        'markInvoiceDelivered anropades utan ett förberett manifest — leveransen skedde men underlaget frystes aldrig',
      )
      const fallbackPayload = {
        id,
        business_id: params.businessId,
        invoice_id: params.invoiceId,
        project_id: null,
        manifest_version: MANIFEST_VERSION,
        readiness_rules_version: READINESS_RULES_VERSION,
        readiness_snapshot: { missing_prepare: true },
        input_fingerprint: computeManifestFingerprint(null),
        status: 'incomplete' as const,
        delivery_method: params.method,
        prepared_at: now,
        delivered_at: now,
        reconciled_at: null,
        completeness_flags: { has_project: false, readiness_loaded: false, note: 'saknar förberett manifest' },
      }
      const { data: inserted, error: insertErr } = await supabase
        .from('invoice_evidence_manifest')
        .insert(fallbackPayload)
        .select('*')
        .maybeSingle()
      if (insertErr) {
        if (isManifestSchemaMissing(insertErr)) return schemaMissingResult()
        return await reportFailure(supabase, params.businessId, params.invoiceId, 'upsert_failed', insertErr.message)
      }
      return { ok: true, row: (inserted ?? fallbackPayload) as InvoiceEvidenceManifestRow }
    }

    if (existing.status === 'delivered' || existing.status === 'reconciled') {
      return { ok: true, row: existing as InvoiceEvidenceManifestRow }
    }

    const updateFields = { status: 'delivered' as const, delivered_at: now, delivery_method: params.method }
    const { data: updated, error: updateErr } = await supabase
      .from('invoice_evidence_manifest')
      .update(updateFields)
      .eq('id', id)
      .eq('business_id', params.businessId)
      .select('*')
      .maybeSingle()
    if (updateErr) {
      if (isManifestSchemaMissing(updateErr)) return schemaMissingResult()
      return await reportFailure(supabase, params.businessId, params.invoiceId, 'upsert_failed', updateErr.message)
    }
    return { ok: true, row: (updated ?? { ...existing, ...updateFields }) as InvoiceEvidenceManifestRow }
  } catch (err) {
    return await reportFailure(
      supabase,
      params.businessId,
      params.invoiceId,
      'unexpected',
      err instanceof Error ? err.message : String(err),
    )
  }
}

// ─────────────────────────────────────────────────────────────────
// reconcileInvoiceManifests — admin-triggad avstämning.
// ─────────────────────────────────────────────────────────────────

/** Hur gammal en prepared/incomplete-rad måste vara innan reconcilern rör
    den — undviker att racea mot en sändning som fortfarande pågår. */
export const RECONCILE_STALE_MS = 60 * 60 * 1000 // 1 timme

/** Prepared-men-aldrig-skickad (utkast, inget bevis alls) äldre än detta
    räknas som övergiven — läks ALDRIG, för att aldrig hitta på en leverans
    som inte skedde. */
export const RECONCILE_ABANDON_MS = 7 * 24 * 60 * 60 * 1000 // 7 dagar

export type ReconcileEvidence = 'invoice_status' | 'customer_activity'

export type ReconcileDecision =
  | { action: 'heal'; evidence: ReconcileEvidence }
  | { action: 'abandon' }
  | { action: 'wait' }

export interface DecideReconciliationInput {
  preparedAt: string
  now: Date
  invoiceStatus: string | null
  invoiceSentAt: string | null
  hasActivityEvidence: boolean
}

const DELIVERED_INVOICE_STATUSES = new Set(['sent', 'paid', 'overdue'])

/**
 * Ren beslutsfunktion — ingen I/O. invoice.status+sent_at är förstahandsbeviset
 * (billigast, en batchad fråga); customer_activity 'invoice_sent' är andrahands
 * (täcker fallet där statusskrivningen själv misslyckades men leveransen ändå
 * skedde). sms_log är medvetet INTE med i V1 — de två ovan täcker alla tre
 * sändvägarnas normalfall; lägg till om reconcilern visar sig missa fall i
 * praktiken.
 */
export function decideManifestReconciliation(input: DecideReconciliationInput): ReconcileDecision {
  const invoiceEvidence =
    input.invoiceStatus != null &&
    DELIVERED_INVOICE_STATUSES.has(input.invoiceStatus) &&
    Boolean(input.invoiceSentAt)
  if (invoiceEvidence) return { action: 'heal', evidence: 'invoice_status' }
  if (input.hasActivityEvidence) return { action: 'heal', evidence: 'customer_activity' }

  const ageMs = input.now.getTime() - new Date(input.preparedAt).getTime()
  if (ageMs > RECONCILE_ABANDON_MS) return { action: 'abandon' }
  return { action: 'wait' }
}

export interface ReconcileManifestsResult {
  scanned: number
  healed: number
  abandoned: number
  remaining: number
}

/**
 * Admin-triggad avstämning (app/api/admin/invoice-manifests/reconcile).
 * Inget schemalagt körschema i V1 — nästa prepare-försök läker incomplete-
 * rader naturligt också; detta är säkerhetsnätet för de som blir kvar.
 * Kastar på RIKTIGA fel (samma idiom som reconcileProjectOutcomes — rutten
 * fångar och svarar 500), men degraderar TYST till nollresultat om
 * sql/v148 inte är kört än.
 */
export async function reconcileInvoiceManifests(
  supabase: SupabaseClient,
  businessId: string,
  options: { limit?: number } = {},
): Promise<ReconcileManifestsResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const now = new Date()
  const staleBefore = new Date(now.getTime() - RECONCILE_STALE_MS).toISOString()

  const { data: candidates, error: candErr } = await supabase
    .from('invoice_evidence_manifest')
    .select('id, invoice_id, status, prepared_at, completeness_flags')
    .eq('business_id', businessId)
    .in('status', ['prepared', 'incomplete'])
    .lte('prepared_at', staleBefore)
    .order('prepared_at', { ascending: true })
    .limit(limit)

  if (candErr) {
    if (isManifestSchemaMissing(candErr)) return { scanned: 0, healed: 0, abandoned: 0, remaining: 0 }
    throw new Error(`invoice-manifest-reconciliation misslyckades: ${candErr.message}`)
  }

  const rows = (candidates || []) as Array<{
    id: string
    invoice_id: string
    status: ManifestStatus
    prepared_at: string
    completeness_flags: Record<string, unknown> | null
  }>
  if (rows.length === 0) return { scanned: 0, healed: 0, abandoned: 0, remaining: 0 }

  const invoiceIds = rows.map(r => String(r.invoice_id))
  const { data: invoices, error: invErr } = await supabase
    .from('invoice')
    .select('invoice_id, status, sent_at')
    .eq('business_id', businessId)
    .in('invoice_id', invoiceIds)
  if (invErr) throw new Error(`invoice-manifest-reconciliation (invoice) misslyckades: ${invErr.message}`)
  const invoiceMap = new Map(
    (invoices || []).map((i: any) => [String(i.invoice_id), i as { status: string | null; sent_at: string | null }]),
  )

  // Andrahandsbevis — best-effort, ett trasigt uppslag ger bara ett tomt
  // bevisset (fler rader väntar/övergivna, aldrig felaktigt läkta).
  let activityInvoiceIds = new Set<string>()
  try {
    const { data: activityRows } = await supabase
      .from('customer_activity')
      .select('metadata')
      .eq('business_id', businessId)
      .eq('activity_type', 'invoice_sent')
    activityInvoiceIds = new Set(
      (activityRows || [])
        .map((row: any) => row?.metadata?.invoice_id)
        .filter((v: unknown): v is string => typeof v === 'string'),
    )
  } catch (err) {
    console.error('[invoice-manifest] reconcile: customer_activity-uppslaget misslyckades (best-effort)', err)
  }

  let healed = 0
  let abandoned = 0

  for (const row of rows) {
    const invoice = invoiceMap.get(String(row.invoice_id))
    const decision = decideManifestReconciliation({
      preparedAt: row.prepared_at,
      now,
      invoiceStatus: invoice?.status ?? null,
      invoiceSentAt: invoice?.sent_at ?? null,
      hasActivityEvidence: activityInvoiceIds.has(String(row.invoice_id)),
    })

    if (decision.action === 'heal') {
      const { error: healErr } = await supabase
        .from('invoice_evidence_manifest')
        .update({
          status: 'reconciled',
          reconciled_at: now.toISOString(),
          completeness_flags: {
            ...(row.completeness_flags || {}),
            healed_from: row.status,
            healed_evidence: decision.evidence,
          },
        })
        .eq('id', row.id)
        .eq('business_id', businessId)
      if (!healErr) healed++
      else console.error('[invoice-manifest] reconcile-uppdatering misslyckades', { id: row.id, healErr })
    } else if (decision.action === 'abandon') {
      abandoned++
    }
  }

  return {
    scanned: rows.length,
    healed,
    abandoned,
    remaining: Math.max(rows.length - healed - abandoned, 0),
  }
}

// Återexporterat för anropsställen som vill typa refs utan att importera
// direkt från commercial-readiness.ts.
export type { EvidenceSlot }
