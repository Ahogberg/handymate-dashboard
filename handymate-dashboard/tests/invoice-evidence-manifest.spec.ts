/**
 * FACIT — Frozen Invoice Evidence Manifest V1 (Etapp P, 2026-08-18).
 *
 * ═══ VAD DET HÄR SKYDDAR ═══
 *
 * Manifestet fryser VILKET underlag (ProjectCommercialReadiness-verdikt +
 * slots/refs) som fanns när en faktura FÖRST levererades till kund.
 * sql/v148_invoice_evidence_manifest.sql är ännu inte körd i alla miljöer
 * — modulen måste degradera tyst (42P01/42703/PGRST204) utan att någonsin
 * blockera den faktiska fakturasändningen. Det är den enda regeln som
 * spänner över hela filen: prepareInvoiceManifest/markInvoiceDelivered
 * KASTAR ALDRIG.
 *
 * Fyra delar:
 *  1. Rena funktioner (fingerprint, snapshot, reconciler-beslut) — inga
 *     mockar, direkta indata → utdata.
 *  2. I/O-orkestrering mot en liten in-memory-fejk av Supabase-querybuildern
 *     (samma form som permission-contract.spec.ts redan fejkar
 *     verifyOwnership mot).
 *  3. Källskanning: READINESS_RULES_VERSION finns, de tre sändvägarna
 *     anropar prepare+mark, kreditrutten gör det INTE, modulen läser
 *     aldrig blob-kolumner och skriver aldrig DELETE.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/invoice-evidence-manifest.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  MANIFEST_VERSION,
  computeManifestFingerprint,
  buildManifestSnapshot,
  decideManifestReconciliation,
  prepareInvoiceManifest,
  markInvoiceDelivered,
  reconcileInvoiceManifests,
  manifestId,
  RECONCILE_ABANDON_MS,
  type InvoiceEvidenceManifestRow,
} from '../lib/invoices/evidence-manifest'
import type { ProjectCommercialReadiness } from '../lib/projects/commercial-readiness'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// ─────────────────────────────────────────────────────────────────────────
// Fejk-Supabase: en liten in-memory-tabellsimulator som stödjer exakt de
// querybuilder-anropen modulen faktiskt gör (select/insert/update/eq/in/
// lte/order/limit/maybeSingle, thenable). Filter är riktiga (jämför mot
// rader i minnet) så testerna kan verifiera FAKTISKT tillstånd efteråt,
// inte bara att ett canned-svar returnerades.
// ─────────────────────────────────────────────────────────────────────────

type Row = Record<string, any>

function createFakeSupabase(
  tables: Record<string, Row[]> = {},
  opts: { errorOn?: Record<string, { code?: string; message: string }> } = {},
) {
  const state: Record<string, Row[]> = tables

  function builder(table: string) {
    const filters: Array<(row: Row) => boolean> = []
    let mode: 'select' | 'insert' | 'update' = 'select'
    let insertRows: Row[] = []
    let updateFields: Row = {}
    let single = false
    let orderCol: string | null = null
    let orderAsc = true
    let limitN: number | null = null

    const api: any = {
      select() {
        return api
      },
      insert(row: Row | Row[]) {
        mode = 'insert'
        insertRows = Array.isArray(row) ? row : [row]
        return api
      },
      update(fields: Row) {
        mode = 'update'
        updateFields = fields
        return api
      },
      eq(col: string, val: any) {
        filters.push(row => row[col] === val)
        return api
      },
      in(col: string, vals: any[]) {
        filters.push(row => vals.includes(row[col]))
        return api
      },
      lte(col: string, val: any) {
        filters.push(row => row[col] <= val)
        return api
      },
      order(col: string, o?: { ascending?: boolean }) {
        orderCol = col
        orderAsc = o?.ascending !== false
        return api
      },
      limit(n: number) {
        limitN = n
        return api
      },
      maybeSingle() {
        single = true
        return api
      },
      then(resolve: any, reject: any) {
        try {
          resolve(execute())
        } catch (e) {
          reject(e)
        }
      },
    }

    function execute(): { data: any; error: any } {
      if (opts.errorOn?.[table]) {
        return { data: null, error: opts.errorOn[table] }
      }
      if (!state[table]) state[table] = []
      const rows = state[table]

      if (mode === 'insert') {
        const created = insertRows.map(r => ({ ...r }))
        rows.push(...created)
        return { data: single ? created[0] ?? null : created, error: null }
      }
      if (mode === 'update') {
        const matched = rows.filter(r => filters.every(f => f(r)))
        matched.forEach(r => Object.assign(r, updateFields))
        return { data: single ? matched[0] ?? null : matched, error: null }
      }
      // select
      let matched = rows.filter(r => filters.every(f => f(r)))
      if (orderCol) {
        const col = orderCol
        matched = [...matched].sort((a, b) => {
          const av = a[col]
          const bv = b[col]
          const cmp = av < bv ? -1 : av > bv ? 1 : 0
          return orderAsc ? cmp : -cmp
        })
      }
      if (limitN != null) matched = matched.slice(0, limitN)
      if (single) return { data: matched[0] ?? null, error: null }
      return { data: matched, error: null }
    }

    return api
  }

  return { from: (table: string) => builder(table), _state: state }
}

const MISSING_TABLE_ERROR = { code: '42P01', message: 'relation "invoice_evidence_manifest" does not exist' }
const UNEXPECTED_ERROR = { code: 'XXUNX', message: 'boom' }

function fakeReadiness(overrides: Partial<ProjectCommercialReadiness> = {}): ProjectCommercialReadiness {
  return {
    project_id: 'proj_1',
    verdict: 'ready',
    slots: [
      { slot: 'omfattning', status: 'styrkt', detail: 'Offert godkänd', refs: [{ table: 'quotes', ref_id: 'q_1' }] },
      { slot: 'ata', status: 'styrkt', detail: 'Inga ÄTA', refs: [] },
    ] as any,
    blockers: [],
    truth_notes: [],
    ...overrides,
  } as ProjectCommercialReadiness
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Rena funktioner — fingerprint + snapshot
// ═══════════════════════════════════════════════════════════════════════

test.describe('computeManifestFingerprint', () => {
  test('samma readiness-innehåll (nya objekt, samma data) → samma hash', () => {
    const a = computeManifestFingerprint(fakeReadiness())
    const b = computeManifestFingerprint(fakeReadiness())
    expect(a).toBe(b)
  })

  test('ändrad slot-status → annan hash (input-förändring upptäcks)', () => {
    const a = computeManifestFingerprint(fakeReadiness())
    const b = computeManifestFingerprint(
      fakeReadiness({
        slots: [
          { slot: 'omfattning', status: 'saknas', detail: 'Ej godkänd', refs: [] },
          { slot: 'ata', status: 'styrkt', detail: 'Inga ÄTA', refs: [] },
        ] as any,
      }),
    )
    expect(a).not.toBe(b)
  })

  test('null (inget projekt) → deterministisk hash, samma varje gång', () => {
    const a = computeManifestFingerprint(null)
    const b = computeManifestFingerprint(null)
    expect(a).toBe(b)
    expect(a).not.toBe(computeManifestFingerprint(fakeReadiness()))
  })
})

test.describe('buildManifestSnapshot', () => {
  test('inget projekt kopplat → hederligt flaggat, aldrig gissat', () => {
    const r = buildManifestSnapshot({ readiness: null, hasProject: false, projectFound: false })
    expect(r.completeness_flags.has_project).toBe(false)
    expect(JSON.stringify(r.completeness_flags)).toContain('inget projekt kopplat')
  })

  test('projekt kopplat men kunde inte läsas → readiness_loaded false, inte samma som "inget projekt"', () => {
    const r = buildManifestSnapshot({ readiness: null, hasProject: true, projectFound: false })
    expect(r.completeness_flags.has_project).toBe(true)
    expect(r.completeness_flags.readiness_loaded).toBe(false)
  })

  test('readiness laddad → snapshot bär verdict+slots, flaggan är hederlig', () => {
    const readiness = fakeReadiness()
    const r = buildManifestSnapshot({ readiness, hasProject: true, projectFound: true })
    expect(r.completeness_flags.readiness_loaded).toBe(true)
    expect((r.snapshot as any).verdict).toBe('ready')
    expect((r.snapshot as any).slots).toHaveLength(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Rena funktioner — reconciler-beslut
// ═══════════════════════════════════════════════════════════════════════

test.describe('decideManifestReconciliation', () => {
  const now = new Date('2026-08-18T12:00:00Z')

  for (const status of ['sent', 'paid', 'overdue']) {
    test(`faktura-status '${status}' + sent_at satt → läks (invoice_status)`, () => {
      const d = decideManifestReconciliation({
        preparedAt: '2026-08-18T10:00:00Z',
        now,
        invoiceStatus: status,
        invoiceSentAt: '2026-08-18T10:05:00Z',
        hasActivityEvidence: false,
      })
      expect(d).toEqual({ action: 'heal', evidence: 'invoice_status' })
    })
  }

  test('faktura-status sent men sent_at saknas → inget bevis, väntar', () => {
    const d = decideManifestReconciliation({
      preparedAt: '2026-08-18T10:00:00Z',
      now,
      invoiceStatus: 'sent',
      invoiceSentAt: null,
      hasActivityEvidence: false,
    })
    expect(d.action).toBe('wait')
  })

  test('draft utan bevis, ung ålder → wait (ingen falsk läkning)', () => {
    const d = decideManifestReconciliation({
      preparedAt: '2026-08-18T11:00:00Z',
      now,
      invoiceStatus: 'draft',
      invoiceSentAt: null,
      hasActivityEvidence: false,
    })
    expect(d.action).toBe('wait')
  })

  test('draft utan bevis, äldre än 7 dagar → abandon, aldrig heal', () => {
    const eightDaysAgo = new Date(now.getTime() - RECONCILE_ABANDON_MS - 60_000).toISOString()
    const d = decideManifestReconciliation({
      preparedAt: eightDaysAgo,
      now,
      invoiceStatus: 'draft',
      invoiceSentAt: null,
      hasActivityEvidence: false,
    })
    expect(d).toEqual({ action: 'abandon' })
  })

  test('customer_activity-bevis läker även utan matchande fakturastatus', () => {
    const d = decideManifestReconciliation({
      preparedAt: '2026-08-18T10:00:00Z',
      now,
      invoiceStatus: 'draft',
      invoiceSentAt: null,
      hasActivityEvidence: true,
    })
    expect(d).toEqual({ action: 'heal', evidence: 'customer_activity' })
  })

  test('fakturabevis vinner över aktivitetsbevis när båda finns (samma utfall, men invoice_status prioriteras)', () => {
    const d = decideManifestReconciliation({
      preparedAt: '2026-08-18T10:00:00Z',
      now,
      invoiceStatus: 'paid',
      invoiceSentAt: '2026-08-18T10:05:00Z',
      hasActivityEvidence: true,
    })
    expect(d.action).toBe('heal')
    expect((d as any).evidence).toBe('invoice_status')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. prepareInvoiceManifest — upsert-tillståndsmaskinen
// ═══════════════════════════════════════════════════════════════════════

test.describe('prepareInvoiceManifest', () => {
  test('ingen befintlig rad → skapar ny med status prepared', async () => {
    const db = createFakeSupabase()
    const result = await prepareInvoiceManifest(db as any, {
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      projectId: null,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.row.status).toBe('prepared')
    expect(result.row.id).toBe(manifestId('inv_1'))
    expect(result.row.manifest_version).toBe(MANIFEST_VERSION)
    expect(db._state.invoice_evidence_manifest).toHaveLength(1)
  })

  test('befintlig prepared-rad → uppdateras (refresh), stannar prepared', async () => {
    const existingRow = {
      id: manifestId('inv_1'),
      business_id: 'biz_1',
      invoice_id: 'inv_1',
      project_id: null,
      manifest_version: MANIFEST_VERSION,
      readiness_rules_version: 1,
      readiness_snapshot: { has_project: false },
      input_fingerprint: 'old',
      status: 'prepared',
      delivery_method: null,
      prepared_at: '2026-08-01T00:00:00Z',
      delivered_at: null,
      reconciled_at: null,
      completeness_flags: {},
    }
    const db = createFakeSupabase({ invoice_evidence_manifest: [existingRow] })
    const result = await prepareInvoiceManifest(db as any, {
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      projectId: null,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.row.status).toBe('prepared')
    expect(db._state.invoice_evidence_manifest).toHaveLength(1)
    // Faktiskt uppdaterad, inte en andra rad.
    expect(db._state.invoice_evidence_manifest[0].prepared_at).not.toBe('2026-08-01T00:00:00Z')
  })

  test('befintlig incomplete-rad → uppdateras tillbaka till prepared (re-freeze inför omskick)', async () => {
    const existingRow = {
      id: manifestId('inv_1'),
      business_id: 'biz_1',
      invoice_id: 'inv_1',
      project_id: null,
      manifest_version: MANIFEST_VERSION,
      readiness_rules_version: 1,
      readiness_snapshot: {},
      input_fingerprint: 'old',
      status: 'incomplete',
      delivery_method: null,
      prepared_at: '2026-08-01T00:00:00Z',
      delivered_at: null,
      reconciled_at: null,
      completeness_flags: {},
    }
    const db = createFakeSupabase({ invoice_evidence_manifest: [existingRow] })
    const result = await prepareInvoiceManifest(db as any, {
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      projectId: null,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.row.status).toBe('prepared')
  })

  test('befintlig delivered-rad → LÄMNAS ORÖRD, ingen ny skrivning', async () => {
    const existingRow = {
      id: manifestId('inv_1'),
      business_id: 'biz_1',
      invoice_id: 'inv_1',
      project_id: null,
      manifest_version: MANIFEST_VERSION,
      readiness_rules_version: 1,
      readiness_snapshot: {},
      input_fingerprint: 'old',
      status: 'delivered',
      delivery_method: 'email',
      prepared_at: '2026-08-01T00:00:00Z',
      delivered_at: '2026-08-01T00:05:00Z',
      reconciled_at: null,
      completeness_flags: {},
    }
    const db = createFakeSupabase({ invoice_evidence_manifest: [{ ...existingRow }] })
    const result = await prepareInvoiceManifest(db as any, {
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      projectId: null,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.row.status).toBe('delivered')
    expect(result.row.prepared_at).toBe('2026-08-01T00:00:00Z')
    expect(db._state.invoice_evidence_manifest[0]).toEqual(existingRow)
  })

  test('befintlig reconciled-rad → LÄMNAS ORÖRD', async () => {
    const existingRow = {
      id: manifestId('inv_1'),
      business_id: 'biz_1',
      invoice_id: 'inv_1',
      project_id: null,
      manifest_version: MANIFEST_VERSION,
      readiness_rules_version: 1,
      readiness_snapshot: {},
      input_fingerprint: 'old',
      status: 'reconciled',
      delivery_method: 'email',
      prepared_at: '2026-08-01T00:00:00Z',
      delivered_at: '2026-08-01T00:05:00Z',
      reconciled_at: '2026-08-02T00:00:00Z',
      completeness_flags: {},
    }
    const db = createFakeSupabase({ invoice_evidence_manifest: [{ ...existingRow }] })
    const result = await prepareInvoiceManifest(db as any, {
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      projectId: null,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.row.status).toBe('reconciled')
    expect(db._state.invoice_evidence_manifest[0]).toEqual(existingRow)
  })

  test('schema saknas (42P01) → ok:false, INGET driftlarm (väntat läge, inte en störning)', async () => {
    const db = createFakeSupabase({}, { errorOn: { invoice_evidence_manifest: MISSING_TABLE_ERROR } })
    const result = await prepareInvoiceManifest(db as any, {
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      projectId: null,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('schema_missing')
    expect(db._state.automation_activity ?? []).toHaveLength(0)
  })

  test('oväntat fel → ok:false OCH driftlarmet larmas (rapporteraTystFel skriver automation_activity)', async () => {
    const db = createFakeSupabase({}, { errorOn: { invoice_evidence_manifest: UNEXPECTED_ERROR } })
    const result = await prepareInvoiceManifest(db as any, {
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      projectId: null,
    })
    expect(result.ok).toBe(false)
    expect(db._state.automation_activity?.length).toBeGreaterThan(0)
    expect(db._state.automation_activity?.[0]?.status).toBe('failed')
  })

  test('kastar aldrig — även när supabase-anropet självt kastar synkront', async () => {
    const throwingDb = {
      from() {
        throw new Error('nätverket är nere')
      },
    }
    let result: any
    let threw = false
    try {
      result = await prepareInvoiceManifest(throwingDb as any, {
        businessId: 'biz_1',
        invoiceId: 'inv_1',
        projectId: null,
      })
    } catch {
      threw = true
    }
    expect(threw, 'prepareInvoiceManifest fick aldrig kasta').toBe(false)
    expect(result.ok).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4. markInvoiceDelivered
// ═══════════════════════════════════════════════════════════════════════

test.describe('markInvoiceDelivered', () => {
  function preparedRow(overrides: Partial<Row> = {}): Row {
    return {
      id: manifestId('inv_1'),
      business_id: 'biz_1',
      invoice_id: 'inv_1',
      project_id: null,
      manifest_version: MANIFEST_VERSION,
      readiness_rules_version: 1,
      readiness_snapshot: {},
      input_fingerprint: 'fp',
      status: 'prepared',
      delivery_method: null,
      prepared_at: '2026-08-18T09:00:00Z',
      delivered_at: null,
      reconciled_at: null,
      completeness_flags: {},
      ...overrides,
    }
  }

  test('prepared → delivered, delivered_at och method sätts', async () => {
    const db = createFakeSupabase({ invoice_evidence_manifest: [preparedRow()] })
    const result = await markInvoiceDelivered(db as any, { businessId: 'biz_1', invoiceId: 'inv_1', method: 'email' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.row.status).toBe('delivered')
    expect(result.row.delivery_method).toBe('email')
    expect(result.row.delivered_at).toBeTruthy()
  })

  test('incomplete → delivered (mark läker incomplete)', async () => {
    const db = createFakeSupabase({ invoice_evidence_manifest: [preparedRow({ status: 'incomplete' })] })
    const result = await markInvoiceDelivered(db as any, { businessId: 'biz_1', invoiceId: 'inv_1', method: 'sms' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.row.status).toBe('delivered')
  })

  test('delivered → idempotent, orörd (omskick skapar inget nytt tillstånd)', async () => {
    const existing = preparedRow({ status: 'delivered', delivery_method: 'email', delivered_at: '2026-08-18T09:05:00Z' })
    const db = createFakeSupabase({ invoice_evidence_manifest: [{ ...existing }] })
    const result = await markInvoiceDelivered(db as any, { businessId: 'biz_1', invoiceId: 'inv_1', method: 'sms' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.row.delivery_method).toBe('email')
    expect(db._state.invoice_evidence_manifest[0]).toEqual(existing)
  })

  test('reconciled → idempotent, orörd', async () => {
    const existing = preparedRow({ status: 'reconciled', reconciled_at: '2026-08-19T00:00:00Z' })
    const db = createFakeSupabase({ invoice_evidence_manifest: [{ ...existing }] })
    const result = await markInvoiceDelivered(db as any, { businessId: 'biz_1', invoiceId: 'inv_1', method: 'sms' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(db._state.invoice_evidence_manifest[0]).toEqual(existing)
  })

  test('rad saknas (prepare kördes aldrig) → sätts in som incomplete OCH driftlarmet larmas högt', async () => {
    const db = createFakeSupabase()
    const result = await markInvoiceDelivered(db as any, { businessId: 'biz_1', invoiceId: 'inv_missing_prepare', method: 'fortnox' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.row.status).toBe('incomplete')
    expect(result.row.delivery_method).toBe('fortnox')
    expect(db._state.automation_activity?.length).toBeGreaterThan(0)
    expect(
      db._state.automation_activity?.some((a: Row) => String(a.action).includes('deliver-utan-prepare')),
    ).toBe(true)
  })

  test('schema saknas → ok:false, kastar aldrig', async () => {
    const db = createFakeSupabase({}, { errorOn: { invoice_evidence_manifest: MISSING_TABLE_ERROR } })
    const result = await markInvoiceDelivered(db as any, { businessId: 'biz_1', invoiceId: 'inv_1', method: 'email' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('schema_missing')
  })

  test('kastar aldrig — supabase-anropet självt kastar synkront', async () => {
    const throwingDb = { from() { throw new Error('nätverket är nere') } }
    let threw = false
    try {
      await markInvoiceDelivered(throwingDb as any, { businessId: 'biz_1', invoiceId: 'inv_1', method: 'email' })
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5. reconcileInvoiceManifests
// ═══════════════════════════════════════════════════════════════════════

test.describe('reconcileInvoiceManifests', () => {
  const HOUR = 60 * 60 * 1000

  function manifestRow(id: string, invoiceId: string, status: string, preparedAt: string): Row {
    return {
      id,
      business_id: 'biz_1',
      invoice_id: invoiceId,
      project_id: null,
      manifest_version: MANIFEST_VERSION,
      readiness_rules_version: 1,
      readiness_snapshot: {},
      input_fingerprint: 'fp',
      status,
      delivery_method: null,
      prepared_at: preparedAt,
      delivered_at: null,
      reconciled_at: null,
      completeness_flags: {},
    }
  }

  test('faktura visar sent+sent_at → manifestet läks till reconciled', async () => {
    const staleAt = new Date(Date.now() - 3 * HOUR).toISOString()
    const db = createFakeSupabase({
      invoice_evidence_manifest: [manifestRow('m1', 'inv_1', 'prepared', staleAt)],
      invoice: [{ invoice_id: 'inv_1', status: 'sent', sent_at: new Date().toISOString(), business_id: 'biz_1' }],
      customer_activity: [],
    })
    const result = await reconcileInvoiceManifests(db as any, 'biz_1', { limit: 50 })
    expect(result.healed).toBe(1)
    expect(result.abandoned).toBe(0)
    expect(db._state.invoice_evidence_manifest[0].status).toBe('reconciled')
    expect(db._state.invoice_evidence_manifest[0].completeness_flags.healed_from).toBe('prepared')
  })

  test('faktura fortfarande draft, ingen aktivitet, gammal (>7 dagar) → abandoned, INTE läkt', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * HOUR).toISOString()
    const db = createFakeSupabase({
      invoice_evidence_manifest: [manifestRow('m1', 'inv_1', 'prepared', eightDaysAgo)],
      invoice: [{ invoice_id: 'inv_1', status: 'draft', sent_at: null, business_id: 'biz_1' }],
      customer_activity: [],
    })
    const result = await reconcileInvoiceManifests(db as any, 'biz_1', { limit: 50 })
    expect(result.healed).toBe(0)
    expect(result.abandoned).toBe(1)
    expect(db._state.invoice_evidence_manifest[0].status).toBe('prepared')
  })

  test('inom karensfönstret utan bevis → varken läkt eller övergiven, syns i remaining', async () => {
    const staleAt = new Date(Date.now() - 2 * HOUR).toISOString()
    const db = createFakeSupabase({
      invoice_evidence_manifest: [manifestRow('m1', 'inv_1', 'prepared', staleAt)],
      invoice: [{ invoice_id: 'inv_1', status: 'draft', sent_at: null, business_id: 'biz_1' }],
      customer_activity: [],
    })
    const result = await reconcileInvoiceManifests(db as any, 'biz_1', { limit: 50 })
    expect(result.healed).toBe(0)
    expect(result.abandoned).toBe(0)
    expect(result.remaining).toBe(1)
    expect(db._state.invoice_evidence_manifest[0].status).toBe('prepared')
  })

  test('customer_activity invoice_sent räknas som bevis när fakturastatusen inte gör det', async () => {
    const staleAt = new Date(Date.now() - 3 * HOUR).toISOString()
    const db = createFakeSupabase({
      invoice_evidence_manifest: [manifestRow('m1', 'inv_1', 'incomplete', staleAt)],
      invoice: [{ invoice_id: 'inv_1', status: 'draft', sent_at: null, business_id: 'biz_1' }],
      customer_activity: [
        { business_id: 'biz_1', activity_type: 'invoice_sent', metadata: { invoice_id: 'inv_1' } },
      ],
    })
    const result = await reconcileInvoiceManifests(db as any, 'biz_1', { limit: 50 })
    expect(result.healed).toBe(1)
    expect(db._state.invoice_evidence_manifest[0].status).toBe('reconciled')
    expect(db._state.invoice_evidence_manifest[0].completeness_flags.healed_evidence).toBe('customer_activity')
  })

  test('färska (icke-gamla) rader tas inte ens med som kandidater', async () => {
    const db = createFakeSupabase({
      invoice_evidence_manifest: [manifestRow('m1', 'inv_1', 'prepared', new Date().toISOString())],
      invoice: [{ invoice_id: 'inv_1', status: 'sent', sent_at: new Date().toISOString(), business_id: 'biz_1' }],
      customer_activity: [],
    })
    const result = await reconcileInvoiceManifests(db as any, 'biz_1', { limit: 50 })
    expect(result.scanned).toBe(0)
    expect(db._state.invoice_evidence_manifest[0].status).toBe('prepared')
  })

  test('respekterar limit', async () => {
    const staleAt = new Date(Date.now() - 3 * HOUR).toISOString()
    const rows = Array.from({ length: 5 }, (_, i) => manifestRow(`m${i}`, `inv_${i}`, 'prepared', staleAt))
    const invoices = rows.map((_, i) => ({ invoice_id: `inv_${i}`, status: 'draft', sent_at: null, business_id: 'biz_1' }))
    const db = createFakeSupabase({ invoice_evidence_manifest: rows, invoice: invoices, customer_activity: [] })
    const result = await reconcileInvoiceManifests(db as any, 'biz_1', { limit: 2 })
    expect(result.scanned).toBe(2)
  })

  test('schema saknas → nollresultat, kastar aldrig', async () => {
    const db = createFakeSupabase({}, { errorOn: { invoice_evidence_manifest: MISSING_TABLE_ERROR } })
    const result = await reconcileInvoiceManifests(db as any, 'biz_1', { limit: 50 })
    expect(result).toEqual({ scanned: 0, healed: 0, abandoned: 0, remaining: 0 })
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6. Källskanning
// ═══════════════════════════════════════════════════════════════════════

test.describe('källskanning — READINESS_RULES_VERSION', () => {
  test('finns exporterad i commercial-readiness.ts', () => {
    const src = read('lib/projects/commercial-readiness.ts')
    expect(src).toMatch(/export const READINESS_RULES_VERSION\s*=\s*\d+/)
  })
})

test.describe('källskanning — de tre sändvägarna anropar prepare+mark', () => {
  const VAGAR = [
    'app/api/invoices/send/route.ts',
    'app/api/invoices/[id]/send-via-fortnox/route.ts',
    'app/api/invoices/auto-generate/route.ts',
  ]

  for (const fil of VAGAR) {
    test(`${fil} anropar prepareInvoiceManifest och markInvoiceDelivered`, () => {
      const src = read(fil)
      expect(src, `${fil} importerar inte evidence-manifest`).toContain('evidence-manifest')
      expect(src, `${fil} anropar inte prepareInvoiceManifest`).toContain('prepareInvoiceManifest(')
      expect(src, `${fil} anropar inte markInvoiceDelivered`).toContain('markInvoiceDelivered(')
    })
  }

  test('send-via-fortnox markerar delivery_method som fortnox', () => {
    const src = read('app/api/invoices/[id]/send-via-fortnox/route.ts')
    expect(src).toMatch(/method:\s*'fortnox'/)
  })

  test('auto-generate markerar delivery_method som email', () => {
    const src = read('app/api/invoices/auto-generate/route.ts')
    expect(src).toMatch(/method:\s*'email'/)
  })
})

test.describe('källskanning — kreditrutten är EXKLUDERAD', () => {
  test('app/api/invoices/credit/route.ts importerar inte evidence-manifest', () => {
    const src = read('app/api/invoices/credit/route.ts')
    expect(src).not.toContain('evidence-manifest')
  })
})

test.describe('källskanning — evidence-manifest.ts läser aldrig blob-innehåll och skriver aldrig DELETE', () => {
  const src = read('lib/invoices/evidence-manifest.ts')

  test('inga uppenbara blob-liknande kolumnidentifierare', () => {
    for (const banned of ['file_url', 'attachment', 'photo_url', 'document_content']) {
      expect(src.toLowerCase(), `hittade förbjuden identifierare "${banned}"`).not.toContain(banned)
    }
  })

  test('ingen .delete( — manifestet raderar aldrig något', () => {
    expect(src).not.toContain('.delete(')
  })

  test('refs bär bara table+ref_id, aldrig innehåll — samma kontrakt som commercial-readiness.ts', () => {
    expect(src).toContain('EvidenceSlot')
  })
})

test.describe('källskanning — statusskrivningsfelet i invoices/send blir högt (Etapp P-härdning)', () => {
  test('ett misslyckat status-write efter lyckad leverans rapporteras till driftlarmet', () => {
    const src = read('app/api/invoices/send/route.ts')
    const idx = src.indexOf('Status update failed after send')
    expect(idx).toBeGreaterThan(-1)
    const after = src.slice(idx, idx + 600)
    expect(after).toContain('rapporteraTystFel')
  })

  test('svarssemantiken är oförändrad — success grenar fortfarande bara på email/sms', () => {
    const src = read('app/api/invoices/send/route.ts')
    expect(src).toContain('success: results.email || results.sms')
  })
})
