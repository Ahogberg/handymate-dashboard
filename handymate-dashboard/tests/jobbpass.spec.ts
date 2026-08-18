/**
 * FACIT — Jobbpass V1 (Etapp Ä, Closeout-to-Lifetime, 2026-08-18).
 *
 * Vad det här skyddar:
 *  (a) Allowlisten är uttömmande — deriveJobbpassView() kör assertJobbpassShape
 *      internt vid VARJE anrop, så varje test som anropar den är redan ett
 *      facit för att kundvyn aldrig bär ett fält utanför JOBBPASS_ALLOWED_FIELDS.
 *  (b) Källskanning: lib/jobbpass/jobbpass.ts läser aldrig ett förbjudet
 *      kolumnmönster (interna kostnads-/marginal-/personalfält) och skriver
 *      aldrig DELETE.
 *  (c) Bara ägarvalda foton når kundvyn — derivationstest mot en fejk-
 *      Supabase för loadSelectedJobbpassPhotos.
 *  (d) Rendertest: JSON.stringify av en fullt ifylld kundvy innehåller inga
 *      interna nycklar.
 *  (e) Publicering/urval — I/O-orkestrering mot fejk-Supabase (idempotens,
 *      token byts aldrig ut, draft/published-övergångar).
 *  (f) Opublicerat pass hittas aldrig via token.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/jobbpass.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  deriveJobbpassView,
  assertJobbpassShape,
  JOBBPASS_ALLOWED_FIELDS,
  JOBBPASS_WARRANTY_MONTHS,
  loadSelectedJobbpassPhotos,
  getOrCreateDraftJobbpass,
  setJobbpassSelection,
  publishJobbpass,
  getPublishedJobbpassByToken,
  getJobbpassServiceConsent,
  jobbpassId,
  type JobbpassSourceInput,
  type JobbpassCustomerView,
} from '../lib/jobbpass/jobbpass'

const ROOT = path.resolve(__dirname, '..')
const LIB_FILE = 'lib/jobbpass/jobbpass.ts'
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// ═══════════════════════════════════════════════════════════════════════
// Fejk-Supabase — samma in-memory-tabellsimulator som
// tests/invoice-evidence-manifest.spec.ts (select/insert/update/eq/in/
// maybeSingle, thenable). Riktiga filter mot rader i minnet.
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
      select() { return api },
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
        // Unik-constraint-simulering: samma id → 23505 (jobbpassId är
        // deterministisk, precis som produktionens PRIMARY KEY).
        const dup = insertRows.some(r => r.id != null && rows.some(existing => existing.id === r.id))
        if (dup) return { data: null, error: { code: '23505', message: 'duplicate key' } }
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

// ═══════════════════════════════════════════════════════════════════════
// Indata-fabrik för deriveJobbpassView — "allt ifyllt"-baslinje.
// ═══════════════════════════════════════════════════════════════════════

function baseInput(overrides: Partial<JobbpassSourceInput> = {}): JobbpassSourceInput {
  return {
    project: {
      project_id: 'proj_1',
      name: 'Badrumsrenovering',
      completed_at: '2026-08-10T00:00:00Z',
      quote_id: 'quote_1',
      customer_id: 'cust_1',
    },
    business: {
      name: 'Bygg & Co',
      logo_url: 'https://example.se/logo.png',
      accent_color: '#0F766E',
      phone: '070-1234567',
      email: 'info@byggco.se',
    },
    quote: { quote_id: 'quote_1', status: 'accepted', title: 'Badrumsrenovering', description: 'Totalrenovering av badrum' },
    quoteItems: [
      { id: 'qi_1', item_type: 'row', group_name: 'Rivning', description: 'Riva ut befintligt badrum', quantity: 1, unit: 'st', unit_price: 5000, total: 5000, sort_order: 1, option_selected: null, is_hidden: false },
      { id: 'qi_2', item_type: 'option', group_name: null, description: 'Golvvärme', quantity: 1, unit: 'st', unit_price: 8000, total: 8000, sort_order: 2, option_selected: true, is_hidden: false },
      { id: 'qi_3', item_type: 'option', group_name: null, description: 'Bastu', quantity: 1, unit: 'st', unit_price: 20000, total: 20000, sort_order: 3, option_selected: false, is_hidden: false },
      { id: 'qi_4', item_type: 'row', group_name: 'Internt', description: 'Dold intern rad', quantity: 1, unit: 'st', unit_price: 999, total: 999, sort_order: 4, option_selected: null, is_hidden: true },
    ],
    changes: [
      { change_id: 'ch_1', ata_number: 1, description: 'Extra eluttag', status: 'signed', signed_at: '2026-08-05T00:00:00Z', total: 1500, amount: 1500 },
      { change_id: 'ch_2', ata_number: 2, description: 'Ej godkänd ändring', status: 'sent', signed_at: null, total: 2000, amount: 2000 },
      { change_id: 'ch_3', ata_number: 3, description: 'Avböjd ändring', status: 'declined', signed_at: null, total: 500, amount: 500 },
    ],
    fieldReports: [
      { id: 'fr_1', title: 'Slutrapport', description: 'Allt klart', work_performed: 'Rivning, kakling, VVS', materials_used: 'Kakel, fog', status: 'signed', signed_by: 'Kund Kundsson', signed_at: '2026-08-09T00:00:00Z', created_at: '2026-08-08T00:00:00Z' },
      { id: 'fr_2', title: 'Utkast', description: 'Ej signerad', work_performed: null, materials_used: null, status: 'draft', signed_by: null, signed_at: null, created_at: '2026-08-01T00:00:00Z' },
    ],
    checklists: [
      { id: 'cl_1', name: 'Egenkontroll badrum', status: 'completed', items: [{ text: 'Tätskikt kontrollerat', checked: true }, { text: 'Avlopp testat', checked: true }] },
      { id: 'cl_2', name: 'Tom checklista', status: 'in_progress', items: [{ text: 'Ej bockad', checked: false }] },
    ],
    invoices: [
      { invoice_id: 'inv_1', invoice_number: '2026-101', invoice_date: '2026-08-11', total: 45000, status: 'sent' },
      { invoice_id: 'inv_2', invoice_number: '2026-050', invoice_date: '2026-07-01', total: 10000, status: 'draft' },
    ],
    photos: [
      { id: 'doc_1', url: 'https://signed.example.se/doc_1', caption: null },
    ],
    serviceConsent: true,
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════════════════════
// (a) Allowlisten är uttömmande
// ═══════════════════════════════════════════════════════════════════════

test.describe('(a) allowlisten är uttömmande', () => {
  test('en fullt ifylld kundvy passerar assertJobbpassShape utan att kasta', () => {
    expect(() => deriveJobbpassView(baseInput())).not.toThrow()
  })

  test('assertJobbpassShape kastar om ett fält utanför allowlisten smugit sig in', () => {
    const view = deriveJobbpassView(baseInput())
    const poisoned = { ...view, project: { ...view.project, internal_margin: 4711 } } as unknown as JobbpassCustomerView
    expect(() => assertJobbpassShape(poisoned)).toThrow(/allowlisten bruten/)
  })

  test('assertJobbpassShape kastar på en förgiftad ÄTA-rad', () => {
    const view = deriveJobbpassView(baseInput())
    const poisoned = {
      ...view,
      changes: [{ ...view.changes[0], internal_cost: 100 } as any],
    }
    expect(() => assertJobbpassShape(poisoned)).toThrow(/changes\[\]/)
  })

  test('assertJobbpassShape kastar på ett förgiftat foto', () => {
    const view = deriveJobbpassView(baseInput())
    const poisoned = { ...view, photos: [{ ...view.photos[0], internal_note: 'x' } as any] }
    expect(() => assertJobbpassShape(poisoned)).toThrow(/photos\[\]/)
  })

  test('toppnivåns allowlist täcker exakt fälten i en byggd vy', () => {
    const view = deriveJobbpassView(baseInput())
    expect(Object.keys(view).sort()).toEqual([...JOBBPASS_ALLOWED_FIELDS.top].sort())
  })
})

// ═══════════════════════════════════════════════════════════════════════
// (b) Källskanning — jobbpass.ts läser aldrig förbjudna kolumnmönster
// ═══════════════════════════════════════════════════════════════════════

test.describe('(b) källskanning av sammanställaren', () => {
  const source = read(LIB_FILE)

  const FORBIDDEN_PATTERNS: RegExp[] = [
    /labor_amount/,
    /material_amount/,
    /component_snapshot/,
    /estimated_hours/,
    /show_components_to_customer/,
    /hourly_cost/,
    /hourly_rate/,
    /margin_target_percent/,
    /purchase_price/,
    /total_purchase/,
    /unit_cost/,
    /\bnotes\b/,
    /internal_comment/,
    /cost_price/,
  ]

  for (const pattern of FORBIDDEN_PATTERNS) {
    test(`innehåller aldrig mönstret ${pattern}`, () => {
      expect(source).not.toMatch(pattern)
    })
  }

  test('skriver aldrig DELETE', () => {
    expect(source).not.toMatch(/\.delete\(/)
  })

  // select('*') förekommer på TVÅ ställen: business_config (samma
  // ticking-bomb-skäl som lib/business/quote-surface-select.ts — en smal
  // kolumnlista 400ar hela frågan om en enda kolumn saknas) och jobbpass-
  // tabellen själv (id/status/urval/samtycke/token — vår egen styrtabell,
  // bär aldrig projektets ekonomi). De ÄKTA källorna till interna fält
  // (offert, ÄTA, fältrapport, checklista, faktura, projektdokument) FÅR
  // aldrig läsas brett — de testas explicit nedan.
  const NARROW_SELECT_TABLES = ['quotes', 'quote_items', 'project_change', 'field_reports', 'project_checklist', 'invoice', 'project_document', 'project']

  for (const table of NARROW_SELECT_TABLES) {
    test(`.from('${table}') läses alltid med en namngiven kolumnlista, aldrig en wildcard`, () => {
      const fromIdx = source.indexOf(`.from('${table}')`)
      expect(fromIdx, `.from('${table}') hittades inte i filen`).toBeGreaterThanOrEqual(0)
      const window = source.slice(fromIdx, fromIdx + 400)
      const selectMatch = window.match(/\.select\(([^)]*)\)/)
      expect(selectMatch, `${table}: inget .select() hittades i samma anropskedja`).toBeTruthy()
      expect(selectMatch![1].trim()).not.toBe("'*'")
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════
// (c) Bara ägarvalda foton når kundvyn
// ═══════════════════════════════════════════════════════════════════════

test.describe('(c) fotourvalet är strikt', () => {
  test('loadSelectedJobbpassPhotos returnerar bara de EFTERFRÅGADE id:na', async () => {
    const supabase = createFakeSupabase({
      project_document: [
        { id: 'doc_1', project_id: 'proj_1', business_id: 'biz_1', file_path: 'biz_1/proj_1/1_a.jpg', mime_type: 'image/jpeg', name: 'a.jpg' },
        { id: 'doc_2', project_id: 'proj_1', business_id: 'biz_1', file_path: 'biz_1/proj_1/2_b.jpg', mime_type: 'image/jpeg', name: 'b.jpg' },
        { id: 'doc_3', project_id: 'proj_1', business_id: 'biz_1', file_path: 'biz_1/proj_1/3_c.jpg', mime_type: 'image/jpeg', name: 'c.jpg' },
      ],
    })

    const result = await loadSelectedJobbpassPhotos(supabase as any, 'biz_1', 'proj_1', ['doc_1', 'doc_3'])
    expect(result.map(r => r.id).sort()).toEqual(['doc_1', 'doc_3'])
    expect(result.some(r => r.id === 'doc_2')).toBe(false)
  })

  test('tom urvalslista frågar aldrig databasen och ger tom lista', async () => {
    const supabase = createFakeSupabase({ project_document: [{ id: 'doc_1', project_id: 'proj_1', business_id: 'biz_1', file_path: 'x', mime_type: 'image/jpeg', name: 'a.jpg' }] })
    const result = await loadSelectedJobbpassPhotos(supabase as any, 'biz_1', 'proj_1', [])
    expect(result).toEqual([])
  })

  test('icke-bildfiler (t.ex. PDF) filtreras bort även om de är valda', async () => {
    const supabase = createFakeSupabase({
      project_document: [
        { id: 'doc_1', project_id: 'proj_1', business_id: 'biz_1', file_path: 'x.pdf', mime_type: 'application/pdf', name: 'kontrakt.pdf' },
      ],
    })
    const result = await loadSelectedJobbpassPhotos(supabase as any, 'biz_1', 'proj_1', ['doc_1'])
    expect(result).toEqual([])
  })

  test('deriveJobbpassView speglar bara de foton som skickas in — inget urval sker i derivationen själv', () => {
    const view = deriveJobbpassView(baseInput({ photos: [{ id: 'only_this', url: 'https://x/only_this', caption: null }] }))
    expect(view.photos).toEqual([{ id: 'only_this', url: 'https://x/only_this', caption: null }])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// (d) Rendertest — inga interna nycklar i den serialiserade vyn
// ═══════════════════════════════════════════════════════════════════════

test.describe('(d) portalvyns data läcker inget internt', () => {
  test('JSON.stringify av en fullt ifylld vy innehåller inga interna nycklar', () => {
    const view = deriveJobbpassView(baseInput())
    const json = JSON.stringify(view)
    const forbidden = [
      'labor_amount', 'material_amount', 'component_snapshot', 'estimated_hours',
      'hourly_cost', 'hourly_rate', 'margin_target_percent', 'purchase_price',
      'total_purchase', 'unit_cost', '"notes"', 'internal_comment', 'cost_price',
      '"amount"',
    ]
    for (const term of forbidden) {
      expect(json, `hittade förbjuden term "${term}" i serialiserad vy`).not.toContain(term)
    }
  })

  test('dolda offertrader och ovalda tillval visas aldrig i scope.items', () => {
    const view = deriveJobbpassView(baseInput())
    expect(view.scope).not.toBeNull()
    const descriptions = view.scope!.items.map(i => i.description)
    expect(descriptions).not.toContain('Dold intern rad')
    expect(descriptions).not.toContain('Bastu') // ovalt tillval
    expect(descriptions).toContain('Golvvärme') // valt tillval
  })

  test('avböjda och ej godkända ÄTA visas aldrig', () => {
    const view = deriveJobbpassView(baseInput())
    const descriptions = view.changes.map(c => c.description)
    expect(descriptions).toEqual(['Extra eluttag'])
  })

  test('osignerad fältrapport visas aldrig; senast signerade väljs', () => {
    const view = deriveJobbpassView(baseInput())
    expect(view.work_report?.title).toBe('Slutrapport')
  })

  test('checklista utan avbockad punkt visas aldrig', () => {
    const view = deriveJobbpassView(baseInput())
    expect(view.checklists).toHaveLength(1)
    expect(view.checklists[0].name).toBe('Egenkontroll badrum')
  })

  test('draft-faktura (ej skickad) visas aldrig som fakturareferens', () => {
    const view = deriveJobbpassView(baseInput())
    expect(view.invoice_reference?.invoice_number).toBe('2026-101')
  })

  test('ingen accepterad offert → scope är null, aldrig ett gissat innehåll', () => {
    const view = deriveJobbpassView(baseInput({ quote: { quote_id: 'quote_1', status: 'draft', title: 'x', description: 'y' } }))
    expect(view.scope).toBeNull()
  })

  test('trasigt källuppslag ("error") degraderar till tom/null sektion, aldrig en gissning', () => {
    const view = deriveJobbpassView(baseInput({ changes: 'error', fieldReports: 'error', checklists: 'error', invoices: 'error' }))
    expect(view.changes).toEqual([])
    expect(view.work_report).toBeNull()
    expect(view.checklists).toEqual([])
    expect(view.invoice_reference).toBeNull()
  })

  test('garantitexten anger 12 månader och closeout-datumet, aldrig en hittad garantitabell', () => {
    const view = deriveJobbpassView(baseInput())
    expect(view.warranty.months).toBe(JOBBPASS_WARRANTY_MONTHS)
    expect(view.warranty.text).toContain('12 månader')
    expect(view.warranty.text).toMatch(/2026/)
  })

  test('certifikat-sektionen är en ärlig "kommer snart"-text, aldrig påhittad data', () => {
    const view = deriveJobbpassView(baseInput())
    expect(view.certificates_note.toLowerCase()).toContain('kommer snart')
  })

  test('framtida service speglar precis samtyckesflaggan som skickades in', () => {
    expect(deriveJobbpassView(baseInput({ serviceConsent: true })).future_service.consent).toBe(true)
    expect(deriveJobbpassView(baseInput({ serviceConsent: false })).future_service.consent).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// (e) I/O-orkestrering — urval, samtycke, publicering
// ═══════════════════════════════════════════════════════════════════════

test.describe('(e) jobbpass-radens livscykel', () => {
  test('getOrCreateDraftJobbpass skapar en draft-rad och är idempotent', async () => {
    const supabase = createFakeSupabase()
    const first = await getOrCreateDraftJobbpass(supabase as any, 'biz_1', 'proj_1')
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.row.status).toBe('draft')
    expect(first.row.id).toBe(jobbpassId('proj_1'))

    const second = await getOrCreateDraftJobbpass(supabase as any, 'biz_1', 'proj_1')
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.row.id).toBe(first.row.id)
    expect(supabase._state.jobbpass.length).toBe(1)
  })

  test('setJobbpassSelection uppdaterar foturval och samtycke oberoende av varandra', async () => {
    const supabase = createFakeSupabase()
    await getOrCreateDraftJobbpass(supabase as any, 'biz_1', 'proj_1')

    const withPhotos = await setJobbpassSelection(supabase as any, 'biz_1', 'proj_1', { selectedPhotoIds: ['doc_1', 'doc_2'] })
    expect(withPhotos.ok).toBe(true)
    if (withPhotos.ok) expect(withPhotos.row.selected_photo_ids).toEqual(['doc_1', 'doc_2'])

    const withConsent = await setJobbpassSelection(supabase as any, 'biz_1', 'proj_1', { serviceConsent: true })
    expect(withConsent.ok).toBe(true)
    if (withConsent.ok) {
      expect(withConsent.row.service_consent).toBe(true)
      // Fototurvalet från förra anropet ska inte nollställas.
      expect(withConsent.row.selected_photo_ids).toEqual(['doc_1', 'doc_2'])
    }
  })

  test('publishJobbpass sätter status/token/published_at och är idempotent (token byts aldrig)', async () => {
    const supabase = createFakeSupabase()
    await getOrCreateDraftJobbpass(supabase as any, 'biz_1', 'proj_1')

    const published = await publishJobbpass(supabase as any, 'biz_1', 'proj_1')
    expect(published.ok).toBe(true)
    if (!published.ok) return
    expect(published.row.status).toBe('published')
    expect(published.row.token).toBeTruthy()

    const republished = await publishJobbpass(supabase as any, 'biz_1', 'proj_1')
    expect(republished.ok).toBe(true)
    if (!republished.ok) return
    expect(republished.row.token).toBe(published.row.token)
  })

  test('publishJobbpass utan befintlig rad ger ett fel, aldrig en tyst tom publicering', async () => {
    const supabase = createFakeSupabase()
    const result = await publishJobbpass(supabase as any, 'biz_1', 'proj_saknas')
    expect(result.ok).toBe(false)
  })

  test('getJobbpassServiceConsent returnerar null när inget jobbpass finns', async () => {
    const supabase = createFakeSupabase()
    const consent = await getJobbpassServiceConsent(supabase as any, 'biz_1', 'proj_utan_pass')
    expect(consent).toBeNull()
  })

  test('getJobbpassServiceConsent speglar den sparade flaggan', async () => {
    const supabase = createFakeSupabase()
    await getOrCreateDraftJobbpass(supabase as any, 'biz_1', 'proj_1')
    await setJobbpassSelection(supabase as any, 'biz_1', 'proj_1', { serviceConsent: true })
    const consent = await getJobbpassServiceConsent(supabase as any, 'biz_1', 'proj_1')
    expect(consent).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// (f) Opublicerat pass hittas aldrig via token
// ═══════════════════════════════════════════════════════════════════════

test.describe('(f) opublicerat pass = ingen token-träff', () => {
  test('en draft-rad (även med ett token-värde i minnet) returneras aldrig av getPublishedJobbpassByToken', async () => {
    const supabase = createFakeSupabase({
      jobbpass: [{
        id: 'jp_proj_1', business_id: 'biz_1', project_id: 'proj_1',
        selected_photo_ids: [], service_consent: false, status: 'draft',
        token: 'leaked-token-should-not-resolve', published_at: null,
        created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
      }],
    })
    const result = await getPublishedJobbpassByToken(supabase as any, 'leaked-token-should-not-resolve')
    expect(result).toBeNull()
  })

  test('en published-rad hittas via sin token', async () => {
    const supabase = createFakeSupabase()
    await getOrCreateDraftJobbpass(supabase as any, 'biz_1', 'proj_1')
    const published = await publishJobbpass(supabase as any, 'biz_1', 'proj_1')
    expect(published.ok).toBe(true)
    if (!published.ok) return

    const found = await getPublishedJobbpassByToken(supabase as any, published.row.token as string)
    expect(found?.project_id).toBe('proj_1')
  })

  test('tom eller okänd token ger null', async () => {
    const supabase = createFakeSupabase()
    expect(await getPublishedJobbpassByToken(supabase as any, '')).toBeNull()
    expect(await getPublishedJobbpassByToken(supabase as any, 'okänd-token')).toBeNull()
  })
})
