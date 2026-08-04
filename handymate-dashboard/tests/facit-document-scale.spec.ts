/**
 * FACIT — DocumentScaler.tsx:s skalberäkning (ETAPP 3, offert-masterplan.md,
 * punkt 1: mobilcanvasen skalas till skärmbredd via `transform: scale()`).
 * Körs: npx playwright test tests/facit-document-scale.spec.ts --no-deps
 *
 * Ren funktion, ingen DOM/ResizeObserver — den delen (DocumentScaler.tsx)
 * verifieras manuellt/via mobile-projektets Playwright-viewport istället.
 * Detta testar bara SJÄLVA MATTEN: aldrig uppskalat, aldrig NaN/negativt,
 * och exakt gränsvärdet vid precis A4-bredd.
 */
import { test, expect } from '@playwright/test'
import { A4_WIDTH_PX, computeFitScale } from '../components/quotes/document/format'

test.describe('computeFitScale — A4-dokumentets nedskalning till containerbredd', () => {
  test('(a) A4_WIDTH_PX = 210mm vid 96dpi (~793.7px)', () => {
    expect(A4_WIDTH_PX).toBeCloseTo(793.7007874015748, 6)
  })

  test('(b) smal mobilcontainer (375px) skalas ned proportionellt', () => {
    const scale = computeFitScale(375)
    expect(scale).toBeCloseTo(375 / A4_WIDTH_PX, 10)
    expect(scale).toBeLessThan(1)
    // 375px container × skala == exakt 375px synlig bredd (ingen horisontell scroll kvar)
    expect(A4_WIDTH_PX * scale).toBeCloseTo(375, 6)
  })

  test('(c) bred desktop-container (1200px) skalas ALDRIG upp — max 1', () => {
    expect(computeFitScale(1200)).toBe(1)
  })

  test('(d) exakt A4-bredd → skala 1 (gränsvärdet, inte >1 och inte <1)', () => {
    expect(computeFitScale(A4_WIDTH_PX)).toBe(1)
  })

  test('(e) 0/negativ/NaN containerbredd → 1 (ingen skalning innan layout mätts)', () => {
    expect(computeFitScale(0)).toBe(1)
    expect(computeFitScale(-100)).toBe(1)
    expect(computeFitScale(NaN)).toBe(1)
  })

  test('(f) anpassad innehållsbredd (inte bara A4) respekteras', () => {
    expect(computeFitScale(200, 400)).toBe(0.5)
    expect(computeFitScale(800, 400)).toBe(1)
  })
})
