/**
 * Facit — delad fakturasändkärna (Etapp Q, TD-86, 2026-08-18).
 *
 * ═══ VAD SOM VAR FEL ═══
 *
 * `lib/projects/auto-invoice-on-complete.ts` gjorde ett internt
 * `fetch('/api/invoices/send')` — ett server-till-server-anrop mot en rutt
 * som kräver `getAuthenticatedBusiness`. Utan session svarade rutten 401,
 * VARJE gång. Auto-fakturan blev alltid kvar som utkast; hantverkaren fick
 * bara en SMS-varning istället för en levererad faktura.
 *
 * ═══ FIXEN ═══
 *
 * Sändkärnan (email/SMS/PDF/manifest/status/post-send-automationer) flyttad
 * ut ur `app/api/invoices/send/route.ts` till `lib/invoices/send-invoice.ts`
 * — husmönstret från `lib/invoice-reminder-send.ts` (delas redan av flera
 * anropare). Rutten är nu tunn (auth+validering+anrop); auto-fakturan
 * anropar kärnan DIREKT — inget nätverksanrop, ingen session behövs.
 *
 * Det här facitet har två delar:
 *  1. Källskanning — låser att fixen faktiskt sitter där den ska (ingen
 *     fetch kvar, kärnan importeras på båda anropsställena, manifest-
 *     hookarna bor i kärnan och är inte kvar-duplicerade i rutten).
 *  2. Beteendefacit mot `applyInvoiceDeliveryOutcome` — den exporterade
 *     delfunktionen i kärnan som äger LEVERANS-STRYPUNKTENS invariant
 *     (status/manifest/aktivitet skrivs OM OCH BARA OM leveransen faktiskt
 *     lyckades). Testas via en in-memory-fejk av Supabase (samma idiom som
 *     tests/invoice-evidence-manifest.spec.ts) — INTE via ett fullt
 *     `sendInvoice()`-anrop, eftersom det skulle kräva riktiga Resend/
 *     46elks/Chromium-anrop. Testsviten anropar aldrig de tjänsterna live
 *     (se tests/sms-quota-chokepoint.spec.ts — 46elks-strypunkten källskannas
 *     där, anropas aldrig) — samma princip här.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/send-invoice-core.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { sendInvoice, applyInvoiceDeliveryOutcome } from '../lib/invoices/send-invoice'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const kod = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(r => !r.trim().startsWith('//'))
    .join('\n')

// ═══════════════════════════════════════════════════════════════════════
// 1. Källskanning
// ═══════════════════════════════════════════════════════════════════════

test.describe('källskanning — auto-fakturan går genom kärnan, inte fetch', () => {
  const AUTO = kod('lib/projects/auto-invoice-on-complete.ts')

  test('importerar sendInvoice från den delade kärnan', () => {
    expect(AUTO).toContain("import { sendInvoice } from '@/lib/invoices/send-invoice'")
  })

  test('anropar sendInvoice direkt', () => {
    expect(AUTO).toMatch(/await sendInvoice\(supabase,/)
  })

  test('inget internt fetch mot /api/invoices/send kvar (rotorsaken till TD-86)', () => {
    // Filen har fortfarande ETT legitimt fetch (till /api/sms/send, för att
    // varna hantverkaren) — det är oförändrat och inte del av TD-86.
    expect(AUTO).not.toMatch(/fetch\(`\$\{appUrl\}\/api\/invoices\/send`/)
  })

  test('401-kommentaren om "KÄND BEGRÄNSNING" är borta — problemet är löst, inte bara dokumenterat', () => {
    expect(AUTO).not.toContain('KÄND BEGRÄNSNING')
    expect(AUTO).not.toContain('svarar 401')
  })
})

test.describe('källskanning — rutten är tunn och delegerar till kärnan', () => {
  const RUTT = kod('app/api/invoices/send/route.ts')

  test('importerar sendInvoice från den delade kärnan', () => {
    expect(RUTT).toContain("import { sendInvoice } from '@/lib/invoices/send-invoice'")
  })

  test('anropar sendInvoice', () => {
    expect(RUTT).toMatch(/await sendInvoice\(supabase,/)
  })

  test('auth, behörighet och rate limiting finns kvar i rutten (flyttade INTE till kärnan)', () => {
    expect(RUTT).toContain('getAuthenticatedBusiness(')
    expect(RUTT).toContain("hasPermission(currentUser, 'create_invoices')")
    expect(RUTT).toContain('checkSmsRateLimitDb(')
    expect(RUTT).toContain('checkEmailRateLimitDb(')
  })

  test('manifest-hookarna är INTE kvar-duplicerade i rutten — de bor bara i kärnan nu', () => {
    expect(RUTT, 'prepareInvoiceManifest ska inte längre anropas direkt i rutten').not.toContain('prepareInvoiceManifest(')
    expect(RUTT, 'markInvoiceDelivered ska inte längre anropas direkt i rutten').not.toContain('markInvoiceDelivered(')
    expect(RUTT, 'evidence-manifest ska inte längre importeras direkt i rutten').not.toContain('evidence-manifest')
  })

  test('Resend/PDF-importerna flyttade också till kärnan — inte kvar i rutten', () => {
    expect(RUTT).not.toContain("from 'resend'")
    expect(RUTT).not.toContain('buildInvoicePdfBuffer')
  })
})

test.describe('källskanning — manifest-hookarna bor i kärnan', () => {
  const KARNA = kod('lib/invoices/send-invoice.ts')

  test('kärnan importerar och anropar prepareInvoiceManifest + markInvoiceDelivered', () => {
    expect(KARNA).toContain("from '@/lib/invoices/evidence-manifest'")
    expect(KARNA).toContain('prepareInvoiceManifest(')
    expect(KARNA).toContain('markInvoiceDelivered(')
  })

  test('kärnan exporterar sendInvoice och applyInvoiceDeliveryOutcome', () => {
    expect(KARNA).toMatch(/export async function sendInvoice\(/)
    expect(KARNA).toMatch(/export async function applyInvoiceDeliveryOutcome\(/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Beteendefacit — in-memory-fejk av Supabase (samma idiom som
//    tests/invoice-evidence-manifest.spec.ts).
// ═══════════════════════════════════════════════════════════════════════

type Row = Record<string, any>

function createFakeSupabase(tables: Record<string, Row[]> = {}) {
  const state: Record<string, Row[]> = tables

  function builder(table: string) {
    const filters: Array<(row: Row) => boolean> = []
    let mode: 'select' | 'insert' | 'update' = 'select'
    let insertRows: Row[] = []
    let updateFields: Row = {}
    let single = false

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
      single() {
        single = true
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
      const matched = rows.filter(r => filters.every(f => f(r)))
      if (single) return { data: matched[0] ?? null, error: null }
      return { data: matched, error: null }
    }

    return api
  }

  return { from: (table: string) => builder(table), _state: state }
}

function preparedManifestRow(invoiceId: string, businessId: string): Row {
  // Simulerar att prepareInvoiceManifest redan kört (som den gör inuti
  // sendInvoice INNAN email/SMS-försöket) — applyInvoiceDeliveryOutcome
  // förutsätter det, precis som produktionsflödet.
  return {
    id: `invmf_${invoiceId}`,
    business_id: businessId,
    invoice_id: invoiceId,
    project_id: null,
    manifest_version: 1,
    readiness_rules_version: 1,
    readiness_snapshot: {},
    input_fingerprint: 'fp',
    status: 'prepared',
    delivery_method: null,
    prepared_at: '2026-08-18T09:00:00Z',
    delivered_at: null,
    reconciled_at: null,
    completeness_flags: {},
  }
}

test.describe('applyInvoiceDeliveryOutcome — leverans-strypunktens invariant', () => {
  const invoice = { business_id: 'biz_1', customer_id: 'cust_1', invoice_number: 'FV-2026-001' }

  test('email lyckades → status sent + sent_at + sent_method + manifest delivered', async () => {
    const db = createFakeSupabase({
      invoice: [{ invoice_id: 'inv_1', business_id: 'biz_1', status: 'draft', sent_at: null }],
      invoice_evidence_manifest: [preparedManifestRow('inv_1', 'biz_1')],
    })
    const result = await applyInvoiceDeliveryOutcome(db as any, {
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      invoice,
      results: { email: true, errors: [] },
    })
    expect(result).toEqual({ delivered: true, sentMethod: 'email' })

    const invRow = db._state.invoice[0]
    expect(invRow.status).toBe('sent')
    expect(invRow.sent_at).toBeTruthy()
    expect(invRow.sent_method).toBe('email')

    const manifestRow = db._state.invoice_evidence_manifest[0]
    expect(manifestRow.status).toBe('delivered')
    expect(manifestRow.delivery_method).toBe('email')

    const activity = db._state.customer_activity?.[0]
    expect(activity).toBeTruthy()
    expect(activity.activity_type).toBe('invoice_sent')
  })

  test('email misslyckades men sms lyckades → ÄNDÅ sent, method sms (samma results.email||results.sms-regel som förut)', async () => {
    const db = createFakeSupabase({
      invoice: [{ invoice_id: 'inv_2', business_id: 'biz_1', status: 'draft', sent_at: null }],
      invoice_evidence_manifest: [preparedManifestRow('inv_2', 'biz_1')],
    })
    const result = await applyInvoiceDeliveryOutcome(db as any, {
      businessId: 'biz_1',
      invoiceId: 'inv_2',
      invoice,
      results: { sms: true, errors: ['Email: avvisad av e-posttjänsten'] },
    })
    expect(result).toEqual({ delivered: true, sentMethod: 'sms' })
    expect(db._state.invoice[0].status).toBe('sent')
    expect(db._state.invoice[0].sent_method).toBe('sms')
    expect(db._state.invoice_evidence_manifest[0].status).toBe('delivered')
    expect(db._state.invoice_evidence_manifest[0].delivery_method).toBe('sms')
  })

  test('email OCH sms lyckades → sent_method both', async () => {
    const db = createFakeSupabase({
      invoice: [{ invoice_id: 'inv_3', business_id: 'biz_1', status: 'draft', sent_at: null }],
      invoice_evidence_manifest: [preparedManifestRow('inv_3', 'biz_1')],
    })
    const result = await applyInvoiceDeliveryOutcome(db as any, {
      businessId: 'biz_1',
      invoiceId: 'inv_3',
      invoice,
      results: { email: true, sms: true, errors: [] },
    })
    expect(result.sentMethod).toBe('both')
    expect(db._state.invoice[0].sent_method).toBe('both')
  })

  test('BÅDA misslyckades → ingen status/manifest/aktivitets-skrivning, MEN delivery_status markeras failed — returnerar delivered:false', async () => {
    // Enat fakturautskick (2026-08-20): tidigare lämnades fakturaraden HELT
    // orörd vid total leveransmisslyckande. Nu skrivs delivery_status=
    // 'delivery_failed' (sql/v163) — annars kan man inte skilja "aldrig
    // försökt" från "Fortnox-bokfört men aldrig levererat till kund". Status/
    // sent_at/manifest/aktivitet förblir dock oskrivna, precis som förut.
    const db = createFakeSupabase({
      invoice: [{ invoice_id: 'inv_4', business_id: 'biz_1', status: 'draft', sent_at: null }],
      invoice_evidence_manifest: [preparedManifestRow('inv_4', 'biz_1')],
    })
    const result = await applyInvoiceDeliveryOutcome(db as any, {
      businessId: 'biz_1',
      invoiceId: 'inv_4',
      invoice,
      results: { errors: ['Email: avvisad', 'SMS: kunde inte skickas'] },
    })
    expect(result).toEqual({ delivered: false, sentMethod: null })

    // status/sent_at fick INGEN skrivning — bara delivery_status tillkom.
    expect(db._state.invoice[0]).toEqual({
      invoice_id: 'inv_4',
      business_id: 'biz_1',
      status: 'draft',
      sent_at: null,
      delivery_status: 'delivery_failed',
    })
    // Manifestet är fortfarande bara 'prepared' — ingen mark-delivered.
    expect(db._state.invoice_evidence_manifest[0].status).toBe('prepared')
    // Ingen aktivitetslogg skapades.
    expect(db._state.customer_activity ?? []).toHaveLength(0)
  })

  test('manifest saknar en prepared-rad (prepare-steget föll bort) → markInvoiceDelivered läker med incomplete, blockerar inte leveransen', async () => {
    const db = createFakeSupabase({
      invoice: [{ invoice_id: 'inv_5', business_id: 'biz_1', status: 'draft', sent_at: null }],
    })
    const result = await applyInvoiceDeliveryOutcome(db as any, {
      businessId: 'biz_1',
      invoiceId: 'inv_5',
      invoice,
      results: { email: true, errors: [] },
    })
    expect(result.delivered).toBe(true)
    expect(db._state.invoice[0].status).toBe('sent')
    // markInvoiceDelivered sätter in en incomplete-rad + larmar driftlarmet
    // (se tests/invoice-evidence-manifest.spec.ts) — men själva leveransens
    // sanning (status='sent') skrivs OAVSETT, precis som innan Etapp Q.
    expect(db._state.invoice_evidence_manifest?.[0]?.status).toBe('incomplete')
  })
})

test.describe('sendInvoice — hela vägen, utan att röra Resend/46elks/Chromium', () => {
  test('fakturan hittas inte (fel invoice_id/business_id) → found:false, ingen sidoeffekt', async () => {
    const db = createFakeSupabase({ invoice: [] })
    const result = await sendInvoice(db as any, {
      businessId: 'biz_1',
      invoiceId: 'inv_saknas',
      sendEmail: true,
      sendSms: false,
    })
    expect(result.found).toBe(false)
  })

  // Enat fakturautskick (2026-08-20): sendInvoice() gör nu OVILLKORLIGEN
  // ett syncInvoiceToFortnox()-anrop innan email/SMS-försöket (se
  // tests/facit-send-invoice-fortnox-first.spec.ts) — och den funktionen
  // anropar lib/fortnox.ts:s isFortnoxConnected(), som skapar sin EGEN
  // riktiga Supabase-klient direkt från process.env (oberoende av den
  // fejkade `db` som skickas in här) och alltid slår mot business_config.
  // Det fanns ingen kombination av sendEmail/sendSms som undvek detta
  // förut heller (Fortnox-steget körs oavsett) — så det här testet kan
  // INTE längre köra sendInvoice() end-to-end utan att antingen (a) träffa
  // en riktig Supabase-instans över nätverket, eller (b) att
  // isFortnoxConnected blir injicerbar/mockbar (inget stöd för modul-mocks
  // finns i denna Playwright-baserade testuppsättning). Att bara sätta
  // NEXT_PUBLIC_SUPABASE_URL i .env.test vore FEL väg — det skulle göra
  // detta "aldrig rör live tjänster"-testet till ett riktigt nätverksanrop
  // mot produktions-Supabase. Skippat medvetet, inte borttaget — flaggat
  // i slutrapporten som ett kvarstående testtäckningsgap.
  test.skip('varken email eller sms begärs → ingen Resend/46elks-väg nås, allt är fortfarande ärligt tomt', async () => {
    // Ingen kund kopplad (customer_id null) → portal-blocket hoppas också
    // över. Detta var den enda kombinationen som lät oss köra sendInvoice()
    // rakt igenom på riktigt utan att smyga in ett nätverksanrop mot Resend
    // eller 46elks i testsviten — men Fortnox-steget ovan gör nu ETT
    // ovillkorligt nätverksanrop oavsett kombination.
    const db = createFakeSupabase({
      invoice: [{
        invoice_id: 'inv_6',
        business_id: 'biz_1',
        customer_id: null,
        project_id: null,
        status: 'draft',
      }],
      business_config: [{ business_id: 'biz_1', business_name: 'Testfirman AB' }],
    })
    const result = await sendInvoice(db as any, {
      businessId: 'biz_1',
      invoiceId: 'inv_6',
      sendEmail: false,
      sendSms: false,
    })
    expect(result.found).toBe(true)
    expect(result.email).toBeUndefined()
    expect(result.sms).toBeUndefined()
    expect(result.errors).toEqual([])
    // Ingen leverans → ingen statusskrivning.
    expect(db._state.invoice[0].status).toBe('draft')
  })
})

test.describe('attributionsregeln — automationens utskick loggas aldrig som människa (Codex Q-granskning 2026-08-18)', () => {
  const fs = require('fs')
  const path = require('path')
  const coreSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'invoices', 'send-invoice.ts'), 'utf8') as string
  const autoSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'projects', 'auto-invoice-on-complete.ts'), 'utf8') as string

  test('kärnan hårdkodar inte created_by — den läser source-parametern', () => {
    expect(coreSrc).not.toContain("created_by: 'user'")
    expect(coreSrc).toContain('created_by: source')
  })

  test('autofakturan skickar source automation', () => {
    expect(autoSrc).toContain("source: 'automation'")
  })
})
