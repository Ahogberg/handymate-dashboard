/**
 * Formatterings-hjälpare delade av QuoteDocument (edit + static-läge).
 * Kopierade EXAKT (inte omskrivna) från lib/quote-templates/modern.ts så
 * paritetstestet (tests/quote-document-parity.spec.ts) inte kan fastna på
 * en oavsiktlig avrundnings-/mellanslagsskillnad mellan gammal och ny
 * renderare.
 */

/** "10 000" — mellanslag som tusentalsavgränsare, decimaler bevaras. */
export function formatNumber(n: number): string {
  if (Number.isInteger(n)) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  }
  return n.toLocaleString('sv-SE', { maximumFractionDigits: 2 }).replace(/[  ]/g, ' ')
}

/**
 * Mixar accent-färgen mot vitt med given vit-andel (0..1) — genererar
 * ljusare bakgrundsvarianter (accent-50/accent-100) från valfri
 * business.accentColor så hela paletten håller ihop.
 */
export function mixWithWhite(hex: string, whitePct: number): string {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i)
  if (!m) return hex
  const r = parseInt(m[1].substring(0, 2), 16)
  const g = parseInt(m[1].substring(2, 4), 16)
  const b = parseInt(m[1].substring(4, 6), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * whitePct)
  return `#${mix(r).toString(16).padStart(2, '0')}${mix(g).toString(16).padStart(2, '0')}${mix(b).toString(16).padStart(2, '0')}`
}

/** 210mm i px vid 96dpi (96/25.4*210) — samma bredd som modern-css.ts:s
    `.quote-document .page { width: 210mm }`. ETAPP 3 (offert-masterplan.md):
    DocumentScaler.tsx skalar mobilcanvasen mot denna bredd. */
export const A4_WIDTH_PX = (96 / 25.4) * 210

/**
 * Ren skalberäkning (facit-testad, tests/facit-document-scale.spec.ts):
 * hur mycket ett `contentWidthPx`-brett dokument måste skalas ned för att
 * få plats i en `containerWidthPx`-bred container — ALDRIG uppskalat
 * (max 1, "läsbarhet före pixelperfektion" — vi förstorar aldrig dokumentet
 * bara för att containern råkar vara bredare än A4). Ogiltig/saknad
 * containerbredd (0, negativ, NaN — t.ex. innan layout mätts) → 1 (ingen
 * skalning) så anroparen aldrig krymper till ett sönderräknat värde.
 */
export function computeFitScale(containerWidthPx: number, contentWidthPx: number = A4_WIDTH_PX): number {
  if (!Number.isFinite(containerWidthPx) || containerWidthPx <= 0) return 1
  if (!Number.isFinite(contentWidthPx) || contentWidthPx <= 0) return 1
  return Math.min(1, containerWidthPx / contentWidthPx)
}
