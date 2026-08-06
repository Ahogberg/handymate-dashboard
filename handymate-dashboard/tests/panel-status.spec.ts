/**
 * Facit-tester för Mer-radens statusprickar (etapp A3, 2026-08-06).
 *
 * Bakgrund: pilotkunden Christoffer sa "man får inte med allt". Sju av fjorton
 * offertfält bor bakom Mer-raden, och knapparna såg likadana ut oavsett om
 * panelen var ifylld, tom eller behövde åtgärdas.
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

test.describe('villkor & texter', () => {
  test('ett ifyllt fält räcker för att panelen ska räknas som ifylld', () => {
    expect(panelStatus({ notIncluded: 'Bygglov ingår ej' }).villkor.state).toBe('filled')
  })

  test('antalet ifyllda fält visas som hint', () => {
    const status = panelStatus({ notIncluded: 'x', ataTerms: 'y', referencePerson: 'z' })
    expect(status.villkor.hint).toBe('3')
  })

  test('blanksteg räknas inte som ifyllt', () => {
    expect(panelStatus({ notIncluded: '   ', termsText: '' }).villkor.state).toBe('empty')
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

test.describe('ROT — personnumret är det som faktiskt behövs', () => {
  test('ROT valt utan personnummer kräver åtgärd', () => {
    const status = panelStatus({ hasRotItems: true })
    expect(status.rot.state).toBe('attention')
    expect(status.rot.hint).toContain('personnummer')
  })

  test('ROT med personnummer är ifyllt', () => {
    expect(panelStatus({ hasRotItems: true, personnummer: '19800101-1234' }).rot.state).toBe('filled')
  })

  test('RUT kräver inte personnummer på samma sätt', () => {
    expect(panelStatus({ hasRutItems: true }).rot.state).toBe('filled')
  })

  test('inget avdrag alls kräver ingenting', () => {
    expect(panelStatus({ hasRotItems: false, hasRutItems: false }).rot.state).toBe('empty')
  })

  test('ifyllda uppgifter utan avdrag räknas som ifyllt, inte som fel', () => {
    expect(panelStatus({ personnummer: '19800101-1234' }).rot.state).toBe('filled')
  })
})

test.describe('visning och stil — bara avvikelser markeras', () => {
  test('standardvisning (full detalj) markeras inte', () => {
    expect(panelStatus({ detailLevel: 'detailed', showUnitPrices: true, showQuantities: true }).visning.state).toBe('empty')
  })

  test('ändrad detaljnivå markeras', () => {
    expect(panelStatus({ detailLevel: 'subtotals_only' }).visning.state).toBe('filled')
  })

  test('dolda à-priser markeras', () => {
    expect(panelStatus({ showUnitPrices: false }).visning.state).toBe('filled')
  })

  test('vald stil visas med svenskt namn', () => {
    expect(panelStatus({ templateStyle: 'friendly' }).stil.hint).toBe('Personlig')
    expect(panelStatus({ templateStyle: 'modern' }).stil.hint).toBe('Modern')
  })

  test('okänd stil visas som den är i stället för att döljas', () => {
    expect(panelStatus({ templateStyle: 'nyskapad' }).stil.hint).toBe('nyskapad')
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
      notIncluded: 'Bygglov ingår ej',
      paymentPlanCount: 3,
      paymentPlanValid: true,
      attachmentCount: 1,
      templateStyle: 'modern',
      hasRotItems: true,
      personnummer: '19800101-1234',
    })
    expect(attentionCount(status)).toBe(0)
  })

  test('bara verkliga fel räknas', () => {
    const status = panelStatus({
      hasRotItems: true,
      paymentPlanCount: 2,
      paymentPlanValid: false,
    })
    expect(attentionCount(status)).toBe(2)
  })

  test('en helt tom offert ger inga varningar — tomt är inte fel', () => {
    expect(attentionCount(panelStatus(empty))).toBe(0)
  })
})
