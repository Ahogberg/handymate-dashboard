/**
 * Artikelns prisläge — och när vi ska erbjuda "Sätt som standard" (2026-08-06).
 *
 * ═══ VARFÖR PRISLÖSA ARTIKLAR ═══
 *
 * Registret ska växa från ~20 artiklar per kund till flera hundra. Med tjugo
 * artiklar granskar hantverkaren alla på tio minuter; med flera hundra gör han
 * det aldrig. Han sätter pris på de han använder och lämnar resten orörda.
 *
 * Ett ogranskat gissat pris är sämre än inget pris, för systemet quotar det med
 * full självsäkerhet — i offerten, i telefonagenten och i storefronten. Därför
 * seedas artiklarna PRISLÖSA, och priset förtjänas av faktisk användning:
 * hantverkaren skriver in det första gången han använder artikeln och får då
 * frågan om det ska bli hans standard.
 *
 * Det är samma regel AI-generatorn redan följer: "Gissa ALDRIG ett pris — det
 * är bättre med 0 kr och en markering än ett felaktigt pris."
 *
 * ═══ VARFÖR NOLL OCH INTE NULL ═══
 *
 * `products.sales_price` är `NUMERIC NOT NULL` (sql/v12_products.sql:20).
 * Noll är alltså den enda möjliga representationen — och den är redan
 * kodbasens konvention för "PRIS SAKNAS". Ingen migration behövs.
 *
 * Rena funktioner — facit-testade i tests/pricing-state.spec.ts.
 */

export type PriceState =
  /** Artikeln har ett pris hantverkaren satt eller godtagit. */
  | 'satt'
  /** Aldrig prissatt. Visas som "Sätt pris", aldrig som "0 kr". */
  | 'osatt'

export function priceState(salesPrice: number | null | undefined): PriceState {
  return Number(salesPrice) > 0 ? 'satt' : 'osatt'
}

/** Vad som ska stå i väljaren i stället för priset. */
export function priceLabel(salesPrice: number | null | undefined, unit: string): string {
  if (priceState(salesPrice) === 'osatt') return 'Sätt pris'
  return `${Math.round(Number(salesPrice)).toLocaleString('sv-SE')} kr/${unit}`
}

export interface StandardPriceOffer {
  /** Ska "Sätt som standard" erbjudas? */
  show: boolean
  /** Texten på erbjudandet — säger vad som faktiskt händer. */
  label: string
}

/**
 * Ska vi erbjuda att spara radens pris som artikelns standard?
 *
 * ═══ TRE FALL, OCH BARA TVÅ AV DEM FRÅGAR ═══
 *
 * 1. **Artikeln är prislös och raden har ett pris** → erbjud, med texten
 *    "Spara som standardpris". Det här är huvudfallet: första gången artikeln
 *    används sätts priset.
 * 2. **Artikeln har ett pris och raden har ett ANNAT** → erbjud, men med en
 *    text som säger att det är en ändring, inte ett tillägg. Hantverkaren ska
 *    veta att han skriver över.
 * 3. **Raden har samma pris som artikeln** → fråga inte. Det finns inget att
 *    spara, och en knapp som inte gör något lär bort uppmärksamhet.
 *
 * Frågar heller ALDRIG när raden saknar koppling till banken (fritextrader,
 * omatchade AI-rader) eller när radens pris är noll — då finns inget att spara.
 */
export function standardPriceOffer(input: {
  /** Radens koppling till banken. Saknas → ingen artikel att spara till. */
  linkedProductId: string | null | undefined
  /** Priset hantverkaren skrivit på raden. */
  rowPrice: number | null | undefined
  /** Artikelns nuvarande standardpris. */
  productPrice: number | null | undefined
}): StandardPriceOffer {
  const row = Math.round(Number(input.rowPrice) || 0)
  const product = Math.round(Number(input.productPrice) || 0)

  if (!input.linkedProductId) return { show: false, label: '' }
  if (row <= 0) return { show: false, label: '' }
  if (row === product) return { show: false, label: '' }

  return product > 0
    ? { show: true, label: `Ändra standardpriset till ${row.toLocaleString('sv-SE')} kr` }
    : { show: true, label: `Spara ${row.toLocaleString('sv-SE')} kr som standardpris` }
}
