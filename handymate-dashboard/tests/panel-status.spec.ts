/**
 * Facit-tester för Mer-radens statusprickar (etapp A3, 2026-08-06).
 *
 * Rivning paket B (2026-09-17, rad 2.3–2.6, 2.10): "Villkor & texter", "Stil"
 * och "ROT-detaljer" är inte längre egna Mer-paneler (se panel-status.ts:s
 * egen kommentar för var de flyttade) — deras tester tas bort härifrån i
 * stället för att peka på fält som inte längre finns i PanelStatusInput.
 * Kvar: de tre paneler som fortfarande är egna ytor.
 *
 * Det viktigaste löftet som testas: 'attention' används SPARSAMT. Att färga
 * allt tomt som en varning hade gjort raden till en vägg av amber och lärt
 * hantverkaren att ignorera den — då hade indikatorn varit värre än ingen.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/panel-status.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { panelStatus, attentionCount, type PanelStatusInput } from '../lib/quotes/panel-status'

const empty: PanelStatusInput = {}

test.describe('tom offert — inget skriker', () => {
  test('alla paneler är tomma och ingen kräver åtgärd', () => {
    const status = panelStatus(empty)
    expect(Object.values(status).every(e => e.state === 'empty')).toBe(true)
    expect(attentionCount(status)).toBe(0)
  })
})

test.describe('betalplan — det enda tillståndet som kan vara fel', () => {
  test('ingen plan är helt okej', () => {
    expect(panelStatus({ paymentPlanCount: 0 }).betalplan.state).toBe('empty')
  })

  test('giltig plan visar antal delar', () => {
    const status = panelStatus({ paymentPlanCount: 3, paymentPlanValid: true })
    expect(status.betalplan.state).toBe('filled')
    expect(status.betalplan.hint).toBe('3 delar')
  })

  test('plan som inte summerar kräver åtgärd — den skickas aldrig igenom', () => {
    const status = panelStatus({ paymentPlanCount: 2, paymentPlanValid: false })
    expect(status.betalplan.state).toBe('attention')
    expect(status.betalplan.hint).toContain('går inte ihop')
  })
})

test.describe('visning — bara avvikelser markeras', () => {
  test('standardvisning (full detalj) markeras inte', () => {
    expect(panelStatus({ detailLevel: 'detailed', showUnitPrices: true, showQuantities: true }).visning.state).toBe('empty')
  })

  test('ändrad detaljnivå markeras', () => {
    expect(panelStatus({ detailLevel: 'subtotals_only' }).visning.state).toBe('filled')
  })

  test('dolda à-priser markeras', () => {
    expect(panelStatus({ showUnitPrices: false }).visning.state).toBe('filled')
  })
})

test.describe('bilagor', () => {
  test('antalet visas', () => {
    const status = panelStatus({ attachmentCount: 2 })
    expect(status.bilagor.state).toBe('filled')
    expect(status.bilagor.hint).toBe('2')
  })
})

test.describe('attentionCount — sparsamhet är hela poängen', () => {
  test('en fullt ifylld offert utan fel ger noll varningar', () => {
    const status = panelStatus({
      paymentPlanCount: 3,
      paymentPlanValid: true,
      attachmentCount: 1,
    })
    expect(attentionCount(status)).toBe(0)
  })

  test('bara verkliga fel räknas', () => {
    const status = panelStatus({
      paymentPlanCount: 2,
      paymentPlanValid: false,
    })
    expect(attentionCount(status)).toBe(1)
  })

  test('en helt tom offert ger inga varningar — tomt är inte fel', () => {
    expect(attentionCount(panelStatus(empty))).toBe(0)
  })
})
