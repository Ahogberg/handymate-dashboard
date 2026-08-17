/**
 * FACIT — ProjectCommercialReadiness V1 (Etapp O, 2026-08-17).
 *
 * Två delar:
 *  1. Direkta facit för de rena funktionerna i
 *     lib/projects/commercial-readiness.ts (deriveProjectCommercialReadiness,
 *     byggReadinessSummering).
 *  2. Källskanning av de tre levande produktionsfilerna verktyget registreras
 *     i (tool-definitions.ts, tool-router.ts, matte/chat/route.ts) — samma
 *     idiom som tests/mission-tools.spec.ts — plus en läs-bara-disciplin-
 *     skanning av själva lib-filen (ingen .insert(/.update(/.delete() och
 *     council-guardraden citerad ordagrant.
 *
 * Körs: npx playwright test tests/commercial-readiness.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  deriveProjectCommercialReadiness,
  byggReadinessSummering,
  type ProjectCommercialReadinessInput,
  type EvidenceSlotName,
} from '../lib/projects/commercial-readiness'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const SLOT_ORDER: EvidenceSlotName[] = [
  'omfattning', 'ata', 'tid', 'material', 'egenkontroll', 'arbetsrapport', 'avslut', 'faktura',
]

// ─────────────────────────────────────────────────────────────────────────
// Input-fabrik — "allt styrkt"-baslinje, override:as per test.
// ─────────────────────────────────────────────────────────────────────────

function baseInput(overrides: Partial<ProjectCommercialReadinessInput> = {}): ProjectCommercialReadinessInput {
  return {
    project: {
      project_id: 'proj_1',
      status: 'completed',
      completed_at: '2026-08-10T00:00:00Z',
      quote_id: 'quote_1',
      budget_amount: 50000,
    },
    quote: { quote_id: 'quote_1', status: 'accepted' },
    changes: [],
    timeEntries: [{ time_entry_id: 'te_1' }],
    supplierInvoices: [{ id: 'si_1', total_amount: 5000 }],
    projectMaterials: [],
    checklists: [{ id: 'cl_1', status: 'completed', items: [{ checked: true }, { checked: true }] }],
    fieldReports: [{ id: 'fr_1', status: 'signed' }],
    invoices: [],
    ...overrides,
  }
}

function slotFor(readiness: ReturnType<typeof deriveProjectCommercialReadiness>, name: EvidenceSlotName) {
  const found = readiness.slots.find(s => s.slot === name)
  expect(found, `slot ${name} saknas i output`).toBeTruthy()
  return found!
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Baslinje — allt styrkt → ready
// ─────────────────────────────────────────────────────────────────────────

test.describe('baslinje: allt styrkt', () => {
  test('ger verdict ready och alla 8 slots styrkt eller ej_bedombar', () => {
    const r = deriveProjectCommercialReadiness(baseInput())
    expect(r.verdict).toBe('ready')
    expect(r.blockers).toEqual([])
    for (const s of r.slots) {
      expect(['styrkt', 'ej_bedombar']).toContain(s.status)
    }
  })

  test('project_id kommer från input', () => {
    const r = deriveProjectCommercialReadiness(baseInput())
    expect(r.project_id).toBe('proj_1')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 2. Alla 8 slots alltid närvarande, i fast ordning
// ─────────────────────────────────────────────────────────────────────────

test.describe('alla 8 slots är alltid närvarande', () => {
  test('även när alla källor är "error"', () => {
    const r = deriveProjectCommercialReadiness(baseInput({
      quote: 'error',
      changes: 'error',
      timeEntries: 'error',
      supplierInvoices: 'error',
      projectMaterials: 'error',
      checklists: 'error',
      fieldReports: 'error',
      invoices: 'error',
    }))
    expect(r.slots).toHaveLength(8)
    expect(r.slots.map(s => s.slot)).toEqual(SLOT_ORDER)
    // Inget källfel får krascha — allt degraderar till ej_bedombar (utom
    // omfattning som är "saknas" eftersom project.quote_id ändå är satt
    // men quote='error' → ej_bedombar; se separat test för att verifiera det).
    for (const s of r.slots) {
      expect(['ej_bedombar', 'styrkt', 'saknas']).toContain(s.status)
    }
  })

  test('slots.length === 8 även i baslinjen', () => {
    expect(deriveProjectCommercialReadiness(baseInput()).slots).toHaveLength(8)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 3. omfattning
// ─────────────────────────────────────────────────────────────────────────

test.describe('omfattning', () => {
  test('ingen quote_id → saknas, exakt facit-strängen', () => {
    const r = deriveProjectCommercialReadiness(baseInput({
      project: { project_id: 'proj_1', status: 'completed', completed_at: null, quote_id: null, budget_amount: 0 },
      quote: null,
    }))
    const slot = slotFor(r, 'omfattning')
    expect(slot.status).toBe('saknas')
    expect(slot.detail).toBe('Ingen accepterad offert kopplad')
    expect(r.verdict).toBe('blocked')
    expect(r.blockers).toContain('Ingen accepterad offert kopplad')
  })

  test('quote_id satt men uppslaget misslyckades → ej_bedombar, hamnar i truth_notes, blockar INTE', () => {
    const r = deriveProjectCommercialReadiness(baseInput({ quote: 'error' }))
    const slot = slotFor(r, 'omfattning')
    expect(slot.status).toBe('ej_bedombar')
    expect(r.truth_notes.some(n => n.startsWith('Omfattning:'))).toBe(true)
    expect(r.verdict).toBe('ready')
  })

  test('offert finns men ej godkänd (t.ex. sent) → saknas med status i klarspråk', () => {
    const r = deriveProjectCommercialReadiness(baseInput({ quote: { quote_id: 'quote_1', status: 'sent' } }))
    const slot = slotFor(r, 'omfattning')
    expect(slot.status).toBe('saknas')
    expect(slot.detail).toContain('sent')
    expect(slot.refs).toEqual([{ table: 'quotes', ref_id: 'quote_1' }])
  })

  test('offert signed räknas också som godkänd', () => {
    const r = deriveProjectCommercialReadiness(baseInput({ quote: { quote_id: 'quote_1', status: 'signed' } }))
    expect(slotFor(r, 'omfattning').status).toBe('styrkt')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 4. ata
// ─────────────────────────────────────────────────────────────────────────

test.describe('ata', () => {
  test('ÄTA i status sent → saknas, refererar bara den raden', () => {
    const r = deriveProjectCommercialReadiness(baseInput({
      changes: [{ change_id: 'chg_1', ata_number: 2, status: 'sent', sent_at: '2026-08-01', signed_at: null, declined_at: null, amount: 1000, total: 1000 }],
    }))
    const slot = slotFor(r, 'ata')
    expect(slot.status).toBe('saknas')
    expect(slot.detail).toBe('ÄTA 2 väntar på kundgodkännande')
    expect(slot.refs).toEqual([{ table: 'project_change', ref_id: 'chg_1' }])
    expect(r.verdict).toBe('blocked')
  })

  test('ÄTA i status draft blockerar också', () => {
    const r = deriveProjectCommercialReadiness(baseInput({
      changes: [{ change_id: 'chg_1', ata_number: 1, status: 'draft', sent_at: null, signed_at: null, declined_at: null, amount: 500, total: 500 }],
    }))
    expect(slotFor(r, 'ata').status).toBe('saknas')
  })

  test('flera väntande ÄTA:n → antal i detail-texten', () => {
    const r = deriveProjectCommercialReadiness(baseInput({
      changes: [
        { change_id: 'chg_1', ata_number: 1, status: 'sent', sent_at: '2026-08-01', signed_at: null, declined_at: null, amount: 100, total: 100 },
        { change_id: 'chg_2', ata_number: 2, status: 'draft', sent_at: null, signed_at: null, declined_at: null, amount: 200, total: 200 },
      ],
    }))
    expect(slotFor(r, 'ata').detail).toBe('2 ÄTA väntar på kundgodkännande')
  })

  test('avböjd ÄTA exkluderas — slotten blir styrkt, men avböjningen noteras i truth_notes', () => {
    const r = deriveProjectCommercialReadiness(baseInput({
      changes: [{ change_id: 'chg_1', ata_number: 1, status: 'declined', sent_at: '2026-08-01', signed_at: null, declined_at: '2026-08-02', amount: 100, total: 100 }],
    }))
    const slot = slotFor(r, 'ata')
    expect(slot.status).toBe('styrkt')
    expect(r.truth_notes.some(n => n.includes('avböjd'))).toBe(true)
    expect(r.verdict).toBe('ready')
  })

  test('signerad/godkänd/fakturerad ÄTA → styrkt, ingen i refs exkluderas', () => {
    const r = deriveProjectCommercialReadiness(baseInput({
      changes: [
        { change_id: 'chg_1', ata_number: 1, status: 'signed', sent_at: '2026-08-01', signed_at: '2026-08-02', declined_at: null, amount: 100, total: 100 },
        { change_id: 'chg_2', ata_number: 2, status: 'invoiced', sent_at: '2026-08-01', signed_at: '2026-08-02', declined_at: null, amount: 200, total: 200 },
      ],
    }))
    const slot = slotFor(r, 'ata')
    expect(slot.status).toBe('styrkt')
    expect(slot.refs).toHaveLength(2)
  })

  test('källfel → ej_bedombar', () => {
    const r = deriveProjectCommercialReadiness(baseInput({ changes: 'error' }))
    expect(slotFor(r, 'ata').status).toBe('ej_bedombar')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 5. tid
// ─────────────────────────────────────────────────────────────────────────

test.describe('tid', () => {
  test('ingen tid loggad på aktivt projekt → saknas', () => {
    const r = deriveProjectCommercialReadiness(baseInput({
      project: { project_id: 'proj_1', status: 'active', completed_at: null, quote_id: 'quote_1', budget_amount: 50000 },
      timeEntries: [],
    }))
    expect(slotFor(r, 'tid').status).toBe('saknas')
  })

  test('ingen tid loggad på avslutat projekt → saknas', () => {
    const r = deriveProjectCommercialReadiness(baseInput({ timeEntries: [] }))
    expect(slotFor(r, 'tid').status).toBe('saknas')
  })

  test('ingen tid, projekt varken active eller completed → ej_bedombar (inte guessat blockerat)', () => {
    const r = deriveProjectCommercialReadiness(baseInput({
      project: { project_id: 'proj_1', status: 'planering', completed_at: null, quote_id: 'quote_1', budget_amount: 50000 },
      timeEntries: [],
    }))
    expect(slotFor(r, 'tid').status).toBe('ej_bedombar')
  })

  test('tid loggad → styrkt med refs mot riktiga time_entry-id:n', () => {
    const r = deriveProjectCommercialReadiness(baseInput({ timeEntries: [{ time_entry_id: 'te_a' }, { time_entry_id: 'te_b' }] }))
    const slot = slotFor(r, 'tid')
    expect(slot.status).toBe('styrkt')
    expect(slot.refs.map(x => x.ref_id).sort()).toEqual(['te_a', 'te_b'])
  })

  test('källfel → ej_bedombar', () => {
    expect(slotFor(deriveProjectCommercialReadiness(baseInput({ timeEntries: 'error' })), 'tid').status).toBe('ej_bedombar')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 6. material
// ─────────────────────────────────────────────────────────────────────────

test.describe('material', () => {
  test('inget material och inga leverantörsfakturor → ej_bedombar (aldrig gissat)', () => {
    const r = deriveProjectCommercialReadiness(baseInput({ supplierInvoices: [], projectMaterials: [] }))
    expect(slotFor(r, 'material').status).toBe('ej_bedombar')
  })

  test('leverantörsfaktura registrerad → styrkt', () => {
    const r = deriveProjectCommercialReadiness(baseInput({ supplierInvoices: [{ id: 'si_1', total_amount: 1200 }] }))
    const slot = slotFor(r, 'material')
    expect(slot.status).toBe('styrkt')
    expect(slot.refs).toEqual([{ table: 'supplier_invoices', ref_id: 'si_1' }])
  })

  test('project_material-rad (utan leverantörsfaktura) → styrkt', () => {
    const r = deriveProjectCommercialReadiness(baseInput({
      supplierInvoices: [],
      projectMaterials: [{ material_id: 'mat_1', total_purchase: 300 }],
    }))
    const slot = slotFor(r, 'material')
    expect(slot.status).toBe('styrkt')
    expect(slot.refs).toEqual([{ table: 'project_material', ref_id: 'mat_1' }])
  })

  test('källfel på endera källan → ej_bedombar', () => {
    expect(slotFor(deriveProjectCommercialReadiness(baseInput({ supplierInvoices: 'error' })), 'material').status).toBe('ej_bedombar')
    expect(slotFor(deriveProjectCommercialReadiness(baseInput({ projectMaterials: 'error' })), 'material').status).toBe('ej_bedombar')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 7. egenkontroll — delad matte med fakturaberedskap
// ─────────────────────────────────────────────────────────────────────────

test.describe('egenkontroll', () => {
  test('ingen aktiv/klar checklista med punkter → ej_bedombar', () => {
    expect(slotFor(deriveProjectCommercialReadiness(baseInput({ checklists: [] })), 'egenkontroll').status).toBe('ej_bedombar')
    expect(slotFor(deriveProjectCommercialReadiness(baseInput({ checklists: [{ id: 'cl_1', status: 'draft', items: [{ checked: false }] }] })), 'egenkontroll').status).toBe('ej_bedombar')
  })

  test('delvis avbockad → saknas med kvar-antal i klarspråk', () => {
    const r = deriveProjectCommercialReadiness(baseInput({
      checklists: [{ id: 'cl_1', status: 'in_progress', items: [{ checked: true }, { checked: false }, { checked: false }] }],
    }))
    const slot = slotFor(r, 'egenkontroll')
    expect(slot.status).toBe('saknas')
    expect(slot.detail).toBe('2 egenkontrollpunkter kvar')
    expect(r.verdict).toBe('blocked')
  })

  test('singular: 1 punkt kvar', () => {
    const r = deriveProjectCommercialReadiness(baseInput({
      checklists: [{ id: 'cl_1', status: 'in_progress', items: [{ checked: true }, { checked: false }] }],
    }))
    expect(slotFor(r, 'egenkontroll').detail).toBe('1 egenkontrollpunkt kvar')
  })

  test('alla avbockade → styrkt', () => {
    const r = deriveProjectCommercialReadiness(baseInput({
      checklists: [{ id: 'cl_1', status: 'completed', items: [{ checked: true }, { checked: true }] }],
    }))
    expect(slotFor(r, 'egenkontroll').status).toBe('styrkt')
  })

  test('källfel → ej_bedombar', () => {
    expect(slotFor(deriveProjectCommercialReadiness(baseInput({ checklists: 'error' })), 'egenkontroll').status).toBe('ej_bedombar')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 8. arbetsrapport — ALDRIG en blockerare i sig (valfri), men osignerad är det
// ─────────────────────────────────────────────────────────────────────────

test.describe('arbetsrapport', () => {
  test('ingen rapport alls → ej_bedombar, blockerar inte (rapporter är valfria)', () => {
    const r = deriveProjectCommercialReadiness(baseInput({ fieldReports: [] }))
    expect(slotFor(r, 'arbetsrapport').status).toBe('ej_bedombar')
    expect(r.verdict).toBe('ready')
  })

  test('osignerad rapport finns → saknas, exakt facit-strängen', () => {
    const r = deriveProjectCommercialReadiness(baseInput({ fieldReports: [{ id: 'fr_1', status: 'draft' }] }))
    const slot = slotFor(r, 'arbetsrapport')
    expect(slot.status).toBe('saknas')
    expect(slot.detail).toBe('Arbetsrapport osignerad')
    expect(r.verdict).toBe('blocked')
  })

  test('en osignerad bland flera signerade → fortfarande saknas', () => {
    const r = deriveProjectCommercialReadiness(baseInput({
      fieldReports: [{ id: 'fr_1', status: 'signed' }, { id: 'fr_2', status: 'sent' }],
    }))
    expect(slotFor(r, 'arbetsrapport').status).toBe('saknas')
  })

  test('alla signerade → styrkt', () => {
    const r = deriveProjectCommercialReadiness(baseInput({ fieldReports: [{ id: 'fr_1', status: 'signed' }] }))
    expect(slotFor(r, 'arbetsrapport').status).toBe('styrkt')
  })

  test('källfel → ej_bedombar', () => {
    expect(slotFor(deriveProjectCommercialReadiness(baseInput({ fieldReports: 'error' })), 'arbetsrapport').status).toBe('ej_bedombar')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 9. avslut
// ─────────────────────────────────────────────────────────────────────────

test.describe('avslut', () => {
  test('completed_at satt (även utan status=completed) → styrkt', () => {
    const r = deriveProjectCommercialReadiness(baseInput({
      project: { project_id: 'proj_1', status: 'active', completed_at: '2026-08-10', quote_id: 'quote_1', budget_amount: 1000 },
    }))
    expect(slotFor(r, 'avslut').status).toBe('styrkt')
  })

  test('pågående projekt → ej_bedombar, blockerar inte', () => {
    const r = deriveProjectCommercialReadiness(baseInput({
      project: { project_id: 'proj_1', status: 'active', completed_at: null, quote_id: 'quote_1', budget_amount: 1000 },
      timeEntries: [{ time_entry_id: 'te_1' }],
    }))
    expect(slotFor(r, 'avslut').status).toBe('ej_bedombar')
    expect(r.verdict).toBe('ready')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 10. faktura
// ─────────────────────────────────────────────────────────────────────────

test.describe('faktura', () => {
  test('inga fakturor → styrkt, "inget som motsäger"', () => {
    const r = deriveProjectCommercialReadiness(baseInput({ invoices: [] }))
    expect(slotFor(r, 'faktura').status).toBe('styrkt')
  })

  test('faktura täcker allt (budget) → styrkt "Redan fakturerad"', () => {
    const r = deriveProjectCommercialReadiness(baseInput({
      project: { project_id: 'proj_1', status: 'completed', completed_at: '2026-08-10', quote_id: 'quote_1', budget_amount: 10000 },
      invoices: [{ invoice_id: 'inv_1', status: 'sent', total: 10000 }],
    }))
    const slot = slotFor(r, 'faktura')
    expect(slot.status).toBe('styrkt')
    expect(slot.detail).toBe('Redan fakturerad')
  })

  test('faktura finns men täcker inte budget+signerad ÄTA → motsager', () => {
    const r = deriveProjectCommercialReadiness(baseInput({
      project: { project_id: 'proj_1', status: 'completed', completed_at: '2026-08-10', quote_id: 'quote_1', budget_amount: 10000 },
      changes: [{ change_id: 'chg_1', ata_number: 1, status: 'signed', sent_at: '2026-08-01', signed_at: '2026-08-02', declined_at: null, amount: 2000, total: 2000 }],
      invoices: [{ invoice_id: 'inv_1', status: 'sent', total: 5000 }],
    }))
    const slot = slotFor(r, 'faktura')
    expect(slot.status).toBe('motsager')
    expect(slot.detail).toContain('7000')
    expect(r.verdict).toBe('needs_review')
  })

  test('ÄTA-underlag saknas p.g.a källfel men faktura finns → ej_bedombar, gissar inte', () => {
    const r = deriveProjectCommercialReadiness(baseInput({
      invoices: [{ invoice_id: 'inv_1', status: 'sent', total: 100 }],
      changes: 'error',
    }))
    expect(slotFor(r, 'faktura').status).toBe('ej_bedombar')
  })

  test('källfel på fakturor → ej_bedombar', () => {
    expect(slotFor(deriveProjectCommercialReadiness(baseInput({ invoices: 'error' })), 'faktura').status).toBe('ej_bedombar')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 11. Verdict-kombinationer
// ─────────────────────────────────────────────────────────────────────────

test.describe('verdict-kombinationer', () => {
  test('needs_review vinner över blocked när båda finns samtidigt', () => {
    const r = deriveProjectCommercialReadiness(baseInput({
      // ata saknas (blocked-signal)
      changes: [{ change_id: 'chg_1', ata_number: 1, status: 'sent', sent_at: '2026-08-01', signed_at: null, declined_at: null, amount: 100, total: 100 }],
      // faktura motsager (needs_review-signal) — kräver att changes INTE är 'error'
      project: { project_id: 'proj_1', status: 'completed', completed_at: '2026-08-10', quote_id: 'quote_1', budget_amount: 10000 },
      invoices: [{ invoice_id: 'inv_1', status: 'sent', total: 100 }],
    }))
    expect(r.verdict).toBe('needs_review')
    // Blockers listar ändå det konkreta som saknas — användbart även under needs_review.
    expect(r.blockers.length).toBeGreaterThan(0)
    expect(r.truth_notes.some(n => n.startsWith('Faktura:'))).toBe(true)
  })

  test('bara saknas (inget motsager) → blocked', () => {
    const r = deriveProjectCommercialReadiness(baseInput({ fieldReports: [{ id: 'fr_1', status: 'draft' }] }))
    expect(r.verdict).toBe('blocked')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 12. refs pekar bara på riktiga input-rader — aldrig hittepå-id:n
// ─────────────────────────────────────────────────────────────────────────

test.describe('refs pekar aldrig på hittepåa id:n', () => {
  test('varje ref_id i output finns bland de id:n som faktiskt skickades in', () => {
    const input = baseInput({
      quote: { quote_id: 'quote_xyz', status: 'accepted' },
      changes: [
        { change_id: 'chg_a', ata_number: 1, status: 'signed', sent_at: '2026-08-01', signed_at: '2026-08-02', declined_at: null, amount: 100, total: 100 },
      ],
      timeEntries: [{ time_entry_id: 'te_xyz' }],
      supplierInvoices: [{ id: 'si_xyz', total_amount: 100 }],
      projectMaterials: [{ material_id: 'mat_xyz', total_purchase: 50 }],
      checklists: [{ id: 'cl_xyz', status: 'completed', items: [{ checked: true }] }],
      fieldReports: [{ id: 'fr_xyz', status: 'signed' }],
      invoices: [],
    })
    const knownIds = new Set([
      'proj_1', 'quote_xyz', 'chg_a', 'te_xyz', 'si_xyz', 'mat_xyz', 'cl_xyz', 'fr_xyz',
    ])
    const r = deriveProjectCommercialReadiness(input)
    for (const slot of r.slots) {
      for (const ref of slot.refs) {
        expect(knownIds.has(ref.ref_id), `slot ${slot.slot} hänvisar till okänt id ${ref.ref_id}`).toBe(true)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 13. byggReadinessSummering — konkret, aldrig bara en siffra
// ─────────────────────────────────────────────────────────────────────────

test.describe('byggReadinessSummering', () => {
  test('ready-fallet nämner "Redo att fakturera"', () => {
    const text = byggReadinessSummering(deriveProjectCommercialReadiness(baseInput()))
    expect(text).toContain('Redo att fakturera')
  })

  test('blocked-fallet namnger blockeraren konkret, inte bara en procentsats', () => {
    const r = deriveProjectCommercialReadiness(baseInput({
      changes: [{ change_id: 'chg_1', ata_number: 3, status: 'sent', sent_at: '2026-08-01', signed_at: null, declined_at: null, amount: 100, total: 100 }],
    }))
    const text = byggReadinessSummering(r)
    expect(text).toContain('ÄTA 3 väntar på kundgodkännande')
    expect(text).not.toMatch(/%/)
  })

  test('needs_review-fallet nämner motsägelsen', () => {
    const r = deriveProjectCommercialReadiness(baseInput({
      project: { project_id: 'proj_1', status: 'completed', completed_at: '2026-08-10', quote_id: 'quote_1', budget_amount: 10000 },
      invoices: [{ invoice_id: 'inv_1', status: 'sent', total: 100 }],
    }))
    const text = byggReadinessSummering(r)
    expect(text).toContain('9900')
    expect(text).not.toMatch(/%/)
  })

  test('ingen sammanfattning innehåller ett procenttecken (aldrig ett rent siffersvar)', () => {
    const scenarios = [
      baseInput(),
      baseInput({ fieldReports: [{ id: 'fr_1', status: 'draft' }] }),
      baseInput({ invoices: [{ invoice_id: 'inv_1', status: 'sent', total: 1 }] }),
    ]
    for (const s of scenarios) {
      expect(byggReadinessSummering(deriveProjectCommercialReadiness(s))).not.toMatch(/%/)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 14. Källskanning — lib/projects/commercial-readiness.ts är read-only
//     och citerar council-guardraden ordagrant.
// ─────────────────────────────────────────────────────────────────────────

test.describe('källskanning — commercial-readiness.ts är ett rent läslager', () => {
  const src = read('lib/projects/commercial-readiness.ts')

  test('innehåller ingen .insert(/.update(/.delete( — verdikten agerar aldrig själv', () => {
    expect(src).not.toContain('.insert(')
    expect(src).not.toContain('.update(')
    expect(src).not.toContain('.delete(')
  })

  test('citerar council-guardraden ordagrant (docs/council/PRIORITY_PROPOSAL_CODEX.md)', () => {
    expect(src).toContain('missing evidence creates a warning or review action, not an')
    expect(src).toContain('autonomous block')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 15. Källskanning — tool-definitions.ts
// ─────────────────────────────────────────────────────────────────────────

function sliceBetween(src: string, startMarker: string, endMarker: string, label: string): string {
  const start = src.indexOf(startMarker)
  expect(start, `${label}: startmarkören "${startMarker}" hittades inte`).toBeGreaterThan(-1)
  const end = src.indexOf(endMarker, start + startMarker.length)
  expect(end, `${label}: slutmarkören "${endMarker}" hittades inte efter start`).toBeGreaterThan(start)
  return src.slice(start, end)
}

test.describe('tool-definitions.ts — get_project_commercial_readiness', () => {
  const defsSrc = read('app/api/agent/trigger/tool-definitions.ts')

  test('verktyget är registrerat med project_id som obligatoriskt fält', () => {
    expect(defsSrc).toContain('name: "get_project_commercial_readiness"')
    const idx = defsSrc.indexOf('name: "get_project_commercial_readiness"')
    const block = defsSrc.slice(idx, idx + 1200)
    expect(block).toContain('project_id')
    expect(block).toMatch(/required:\s*\["project_id"\]/)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 16. Källskanning — tool-router.ts
// ─────────────────────────────────────────────────────────────────────────

function functionBody(src: string, fnName: string): string {
  const marker = `async function ${fnName}`
  const start = src.indexOf(marker)
  expect(start, `${fnName} hittades inte i tool-router.ts`).toBeGreaterThan(-1)
  const nextFn = src.indexOf('\nasync function ', start + marker.length)
  const end = nextFn > -1 ? nextFn : src.length
  return src.slice(start, end)
}

test.describe('tool-router.ts — get_project_commercial_readiness', () => {
  const routerSrc = read('app/api/agent/trigger/tool-router.ts')

  test('switchen har en case för verktyget', () => {
    expect(routerSrc).toContain("case 'get_project_commercial_readiness':")
  })

  test('implementationen läser via loadProjectCommercialReadiness och formulerar med byggReadinessSummering', () => {
    expect(routerSrc).toContain('loadProjectCommercialReadiness')
    expect(routerSrc).toContain('byggReadinessSummering')
  })

  test('kastar aldrig — try/catch runt uppslaget (fail-soft mot chatten)', () => {
    const idx = routerSrc.indexOf('loadProjectCommercialReadiness(')
    expect(idx).toBeGreaterThan(-1)
    const before = routerSrc.slice(Math.max(0, idx - 400), idx)
    expect(before).toContain('try')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 17. Källskanning — matte/chat/route.ts kurerar in verktyget (Matte-scopat)
// ─────────────────────────────────────────────────────────────────────────

test.describe('get_project_commercial_readiness är Matte-scopat', () => {
  test('matte/chat/route.ts kurerar in verktyget', () => {
    const src = read('app/api/matte/chat/route.ts')
    expect(src).toContain("'get_project_commercial_readiness'")
  })

  test('ingen specialist (karin/hanna/daniel/lars/lisa) listar verktyget i personalities.ts', () => {
    const src = read('lib/agents/personalities.ts')
    expect(src).not.toContain('get_project_commercial_readiness')
  })
})
