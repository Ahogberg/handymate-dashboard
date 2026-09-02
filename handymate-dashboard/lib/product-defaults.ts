/**
 * Handymates branschbibliotek och den lilla startbank en ny kund får.
 *
 * Bakgrund (kartläggning 2026-08-05): onboarding seedade bara `price_list`,
 * medan offert-editorn och AI:n läser `products`. Följden var att varje ny
 * kund fick en TOM produktbank → AI-offerter fick unit_price 0 och
 * "PRIS SAKNAS", och telefonagenten (som läser price_list) svarade med andra
 * priser än offerten. Den här filen genererar BÅDA tabellerna ur samma data,
 * så telefonen och offerten alltid säger samma sak.
 *
 * Enheten för löpande arbete är 'tim' — INTE 'timme'. Den globala
 * ROT-växeln (lib/quote-calculations.ts:29-58) letar efter exakt 'tim'.
 *
 * `sku` är en stabil seed-nyckel: reservationstriggar (v89) kopplar mot den,
 * och unikt index finns sedan sql/v67_produktbank.sql:59.
 *
 * Priserna är exkl. moms. `labor_share` styr ROT-basen per rad
 * (lib/products/build-item-snapshot.ts).
 *
 * ═══ PRISPOLICYN (Prisslingan V2 pass 2, Andreas beslut 2 2026-08-31) ═══
 * Ett ogranskat gissat pris är sämre än inget (lib/products/pricing-state.ts).
 * Därför: TIMARTIKLARNA (unit 'tim', labor_share 1) seedas prissatta — och
 * får hantverkarens EGET timpris via overlay 1f (applyHourlyRateToDefaults,
 * onboardingens steg 3), så siffran är hans, inte vår. Styck-/kvm-tjänster
 * och material seedas PRISLÖSA (unit_price 0 = "Sätt pris") och prissätts
 * vid första användning. Undantag: electrician/construction behåller sin
 * lilla granskade kärna av styckpriser (~20 rader var, 2026-08-06-beslutet
 * "tjugo artiklar granskar hantverkaren på tio minuter") + COMMON_EXTRAS.
 * De gamla GISSADE fastpriserna i övriga 11 branscher nollställdes
 * 2026-08-31 (beslut 2); långsvansen per bransch bor i
 * lib/product-defaults-longtail.ts.
 */

// Långsvansen per bransch (pass 2, beslut 2): 571 prislösa artiklar för de
// 11 branscher som saknade en. Egen fil av ren storlek; typ-importen åt
// andra hållet är `import type` → ingen runtime-cykel.
import { LONGTAIL_PRODUCTS } from './product-defaults-longtail'
import { resolveBusinessBranch } from './branch'

export interface ProductDefault {
  /** Stabil seed-nyckel, även artikelnummer i offerten. */
  sku: string
  name: string
  description?: string
  unit: string
  unit_price: number
  /** products.category — kanonisk mängd (AI-prompten grupperar på den). */
  category: 'arbete' | 'material' | 'hyra' | 'övrigt'
  /** price_list.category — bakåtkompatibel för telefonagent/widget/storefront. */
  legacy_category: 'labor' | 'material' | 'service'
  /** Andel av priset som är arbete → ROT/RUT-bas. 0 = ren material. */
  labor_share: number
  deduction: 'rot' | 'rut' | null
}

/** Rader som gäller alla branscher — läggs till sist i varje sortiment. */
const COMMON_EXTRAS: ProductDefault[] = [
  { sku: 'HM-GEN-901', name: 'Framkörning', description: 'Resa till och från arbetsplatsen', unit: 'st', unit_price: 450, category: 'övrigt', legacy_category: 'service', labor_share: 0, deduction: null },
  { sku: 'HM-GEN-902', name: 'Bortforsling av avfall', description: 'Lastning och transport till återvinning', unit: 'st', unit_price: 1200, category: 'övrigt', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
  { sku: 'HM-GEN-903', name: 'Deponi- och miljöavgift', unit: 'st', unit_price: 650, category: 'övrigt', legacy_category: 'material', labor_share: 0, deduction: null },
]

/**
 * UX1f (Prisslingan V2): lägg hantverkarens EGET timpris (onboarding steg 3)
 * på de seedade timartiklarna — statiska 550 kr motsade den enda prisuppgift
 * han faktiskt lämnat, i hans allra första offert.
 *
 * Regeln: per bransch (sku-prefix, t.ex. HM-EL) är den FÖRSTA prissatta
 * rena timartikeln (unit 'tim', labor_share 1, pris > 0) basen; varje sådan
 * artikel i samma bransch får `rate + (artikelpris − baspris)` så relativa
 * påslag bevaras (Felsökning +100, Jour +400). Prislösa rörs ALDRIG
 * (0 = "osatt" är en signal, inte ett pris). rate null/0 → identitet.
 */
export function applyHourlyRateToDefaults(
  products: ProductDefault[],
  hourlyRate: number | null | undefined,
): ProductDefault[] {
  const rate = Number(hourlyRate)
  if (!(rate > 0)) return products

  const isTimArbete = (p: ProductDefault) =>
    p.unit === 'tim' && p.labor_share === 1

  // Bas per sku-prefix ("HM-EL", "HM-BYG", "HM-GEN" …) = första tim-artikeln
  // i seed-ordningen (den är prioritetsordningen).
  const basePerPrefix = new Map<string, { sku: string; price: number }>()
  for (const p of products) {
    if (!isTimArbete(p)) continue
    const prefix = p.sku.split('-').slice(0, 2).join('-')
    if (!basePerPrefix.has(prefix)) basePerPrefix.set(prefix, { sku: p.sku, price: p.unit_price })
  }

  return products.map(p => {
    if (!isTimArbete(p)) return p
    const prefix = p.sku.split('-').slice(0, 2).join('-')
    const base = basePerPrefix.get(prefix)
    if (base == null) return p
    // Nollrader efter basartikeln är avsiktligt prislösa (t.ex. lärling)
    // och får aldrig ärva standardpriset bara för att de delar bransch.
    if (p.unit_price <= 0 && p.sku !== base.sku) return p
    // Startbanken innehåller en prislös basartikel per bransch. Noll betyder
    // fortfarande ”osatt” när inget pris lämnats; när ägaren lämnat ett
    // pris är det just den artikeln som får företagets uttryckliga reservpris.
    return { ...p, unit_price: base.price > 0 ? rate + (p.unit_price - base.price) : rate }
  })
}

const BRANCH_PRODUCTS: Record<string, ProductDefault[]> = {
  electrician: [
    { sku: 'HM-EL-001', name: 'Elinstallation', unit: 'tim', unit_price: 550, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-EL-002', name: 'Felsökning', unit: 'tim', unit_price: 650, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-EL-003', name: 'Jour och akut utryckning', description: 'Kväll, helg och röd dag', unit: 'tim', unit_price: 950, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-EL-010', name: 'Elbilsladdare installation', description: 'Montering och inkoppling av laddbox', unit: 'st', unit_price: 12000, category: 'arbete', legacy_category: 'service', labor_share: 0.45, deduction: 'rot' },
    { sku: 'HM-EL-011', name: 'Byte av jordfelsbrytare', unit: 'st', unit_price: 2500, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-EL-012', name: 'Byte av elcentral', description: 'Normalvilla, inkl. märkning och provning', unit: 'st', unit_price: 18000, category: 'arbete', legacy_category: 'service', labor_share: 0.55, deduction: 'rot' },
    { sku: 'HM-EL-013', name: 'Installation vägguttag', unit: 'st', unit_price: 850, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-EL-014', name: 'Installation strömbrytare', unit: 'st', unit_price: 750, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-EL-015', name: 'Montering taklampa', unit: 'st', unit_price: 650, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rot' },
    { sku: 'HM-EL-016', name: 'Installation spotlights', description: 'Per spot, inkl. håltagning', unit: 'st', unit_price: 950, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-EL-017', name: 'Dragning av ny elgrupp', unit: 'st', unit_price: 4500, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-EL-018', name: 'Elgolvvärme', description: 'Installation, per kvadratmeter', unit: 'kvm', unit_price: 750, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-EL-019', name: 'Elbesiktning bostad', unit: 'st', unit_price: 3500, category: 'arbete', legacy_category: 'service', labor_share: 0.9, deduction: 'rot' },
    { sku: 'HM-EL-050', name: 'Eluttag (enkelt)', unit: 'st', unit_price: 150, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-051', name: 'Eluttag (dubbelt)', unit: 'st', unit_price: 220, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-052', name: 'Strömbrytare', unit: 'st', unit_price: 180, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-053', name: 'LED-spot', unit: 'st', unit_price: 250, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-054', name: 'Jordfelsbrytare 30 mA', unit: 'st', unit_price: 1200, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-055', name: 'Elkabel EKK 3x1,5', unit: 'lpm', unit_price: 28, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-056', name: 'Elcentral 12 moduler', unit: 'st', unit_price: 2800, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-057', name: 'Laddbox 11 kW', unit: 'st', unit_price: 9500, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },

    // ─── Utökningen 2026-08-06: prislös långsvans ──────────────────────────
    // Raderna ovan behåller sina startpriser — tjugo artiklar granskar
    // hantverkaren på tio minuter. Långsvansen nedan seedas PRISLÖS, för ett
    // ogranskat gissat pris är sämre än inget: systemet quotar det med full
    // självsäkerhet i offerten, telefonagenten och storefronten. Priset sätts
    // första gången artikeln används (lib/products/pricing-state.ts).
    { sku: 'HM-EL-004', name: 'Lärling', description: 'Medhjälpare på plats', unit: 'tim', unit_price: 0, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-EL-005', name: 'Projektering och elritning', unit: 'tim', unit_price: 0, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: null },
    { sku: 'HM-EL-006', name: 'Dokumentation och egenkontroll', unit: 'tim', unit_price: 0, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },

    { sku: 'HM-EL-020', name: 'Installation utomhusbelysning', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-EL-021', name: 'Installation motorvärmaruttag', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-EL-022', name: 'Byte av strömbrytare', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rot' },
    { sku: 'HM-EL-023', name: 'Byte av vägguttag', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rot' },
    { sku: 'HM-EL-024', name: 'Installation dimmer', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-EL-025', name: 'Installation golvvärmetermostat', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-EL-026', name: 'Installation köksfläkt', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-EL-027', name: 'Inkoppling spis och häll', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rot' },
    { sku: 'HM-EL-028', name: 'Inkoppling torktumlare', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rot' },
    { sku: 'HM-EL-029', name: 'Installation badrumsfläkt', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-EL-030', name: 'Installation brandvarnare', description: 'Seriekopplad, 230 V', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-EL-031', name: 'Installation porttelefon', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-EL-032', name: 'Installation nätverksuttag', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-EL-033', name: 'Dragning av nätverkskabel', unit: 'lpm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-EL-034', name: 'Installation TV-uttag', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-EL-035', name: 'Installation utomhusuttag', description: 'IP44, fasadmonterat', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.65, deduction: 'rot' },
    { sku: 'HM-EL-036', name: 'Installation rörelsevakt', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-EL-037', name: 'Installation trappbelysning', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.65, deduction: 'rot' },
    { sku: 'HM-EL-038', name: 'Installation solcellsanläggning', description: 'Montage och inkoppling, per kvadratmeter panel', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-EL-039', name: 'Installation batterilager', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.4, deduction: 'rot' },
    { sku: 'HM-EL-040', name: 'Byte av mätarskåp', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-EL-041', name: 'Installation huvudbrytare', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-EL-042', name: 'Installation överspänningsskydd', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-EL-043', name: 'Elanslutning värmepump', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-EL-044', name: 'Installation bastuaggregat', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-EL-045', name: 'Förläggning av markkabel', unit: 'lpm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-EL-046', name: 'Håltagning och infräsning', unit: 'lpm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.85, deduction: 'rot' },
    { sku: 'HM-EL-047', name: 'Provning och mätning av installation', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.9, deduction: 'rot' },
    { sku: 'HM-EL-048', name: 'Termografering av elcentral', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.9, deduction: 'rot' },
    { sku: 'HM-EL-049', name: 'Installation smart hem-styrning', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },

    { sku: 'HM-EL-058', name: 'Dimmer', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-059', name: 'Rörelsevakt', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-060', name: 'Utomhusuttag IP44', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-061', name: 'Motorvärmaruttag', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-062', name: 'Nätverksuttag CAT6', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-063', name: 'Nätverkskabel CAT6', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-064', name: 'TV-uttag', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-065', name: 'Antennkabel', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-066', name: 'Brandvarnare 230 V', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-067', name: 'Badrumsfläkt', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-068', name: 'Köksfläkt', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-069', name: 'Utomhusarmatur', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-070', name: 'LED-list', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-071', name: 'Drivdon för LED', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-072', name: 'Transformator 12 V', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-073', name: 'Golvvärmetermostat', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-074', name: 'Golvvärmekabel', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-075', name: 'Automatsäkring 10 A', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-076', name: 'Automatsäkring 16 A', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-077', name: 'Mätarskåp', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-078', name: 'Huvudbrytare', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-079', name: 'Överspänningsskydd', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-080', name: 'Kabelkanal', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-081', name: 'Installationsrör VP20', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-082', name: 'Markkabel EKKJ 4x10', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-083', name: 'Kopplingsdosa', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-084', name: 'Apparatdosa', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-085', name: 'Kabelskydd', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-086', name: 'Solcellspanel', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-087', name: 'Växelriktare', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-088', name: 'Batterilager 10 kWh', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-089', name: 'Laddbox 22 kW', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-090', name: 'Laddstolpe', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-091', name: 'Bastuaggregat', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-092', name: 'Bastustyrning', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-093', name: 'Porttelefon', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-094', name: 'Smart strömbrytare', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-095', name: 'Styrenhet för smart hem', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-096', name: 'Kabelstege', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-097', name: 'Buntband', unit: 'paket', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-EL-098', name: 'Märkbrickor', unit: 'paket', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
  ],

  plumber: [
    { sku: 'HM-VVS-001', name: 'VVS-arbete', unit: 'tim', unit_price: 550, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-VVS-002', name: 'Akut utryckning', unit: 'tim', unit_price: 850, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-VVS-010', name: 'Stopp i avlopp', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.85, deduction: 'rot' },
    { sku: 'HM-VVS-011', name: 'Byta blandare', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.55, deduction: 'rot' },
    { sku: 'HM-VVS-012', name: 'Byta WC-stol', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.45, deduction: 'rot' },
    { sku: 'HM-VVS-013', name: 'Installation diskmaskin', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rot' },
    { sku: 'HM-VVS-014', name: 'Installation tvättmaskin', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rot' },
    { sku: 'HM-VVS-015', name: 'Byte varmvattenberedare', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.4, deduction: 'rot' },
    { sku: 'HM-VVS-016', name: 'Montering handdukstork', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-VVS-017', name: 'Byte golvbrunn', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-VVS-018', name: 'Tätskikt badrum', description: 'Enligt branschregler, per kvadratmeter', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-VVS-019', name: 'Installation vattenfelsbrytare', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.4, deduction: 'rot' },
    { sku: 'HM-VVS-050', name: 'Blandare standard', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-VVS-051', name: 'Köksblandare', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-VVS-052', name: 'WC-stol', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-VVS-053', name: 'Handfat med kommod', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-VVS-054', name: 'Varmvattenberedare 300 l', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-VVS-055', name: 'Kopparrör 15 mm', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-VVS-056', name: 'Golvbrunn', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
  ],

  carpenter: [
    { sku: 'HM-SNI-001', name: 'Snickeriarbete', unit: 'tim', unit_price: 500, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-SNI-002', name: 'Rivning och demontering', unit: 'tim', unit_price: 450, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-SNI-010', name: 'Altanbygge', description: 'Per kvadratmeter, exkl. räcke', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-SNI-011', name: 'Trädäck med räcke', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-SNI-012', name: 'Köksmontering', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.75, deduction: 'rot' },
    { sku: 'HM-SNI-013', name: 'Montering innerdörr', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-SNI-014', name: 'Byte ytterdörr', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.35, deduction: 'rot' },
    { sku: 'HM-SNI-015', name: 'Fönsterbyte', description: 'Per fönster, inkl. drevning och lister', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.35, deduction: 'rot' },
    { sku: 'HM-SNI-016', name: 'Montering garderob', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-SNI-017', name: 'Bygga innervägg', description: 'Regelstomme med gips, per kvadratmeter', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-SNI-018', name: 'Innertak med gips', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.65, deduction: 'rot' },
    { sku: 'HM-SNI-019', name: 'Bygga carport', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.45, deduction: 'rot' },
    { sku: 'HM-SNI-050', name: 'Trall tryckimpregnerad', unit: 'kvm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-SNI-051', name: 'Reglar 45x95', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-SNI-052', name: 'Gipsskiva 13 mm', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-SNI-053', name: 'Innerdörr vit standard', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-SNI-054', name: 'Plywood 12 mm', unit: 'kvm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-SNI-055', name: 'Isolering 95 mm', unit: 'kvm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
  ],

  painter: [
    { sku: 'HM-MAL-001', name: 'Måleriarbete', unit: 'tim', unit_price: 450, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-MAL-010', name: 'Rum (väggar och tak)', description: 'Per kvadratmeter golvyta', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.75, deduction: 'rot' },
    { sku: 'HM-MAL-011', name: 'Fasadmålning', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-MAL-012', name: 'Tapetsering', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-MAL-013', name: 'Målning innerdörr', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rot' },
    { sku: 'HM-MAL-014', name: 'Målning fönster', description: 'Per båge', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rot' },
    { sku: 'HM-MAL-015', name: 'Spackling och slipning', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.85, deduction: 'rot' },
    { sku: 'HM-MAL-016', name: 'Målning tak', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rot' },
    { sku: 'HM-MAL-017', name: 'Lackering köksluckor', description: 'Per lucka', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-MAL-018', name: 'Målning staket', unit: 'lpm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.75, deduction: 'rot' },
    { sku: 'HM-MAL-050', name: 'Väggfärg (vit)', unit: 'liter', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-MAL-051', name: 'Grundfärg', unit: 'liter', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-MAL-052', name: 'Fasadfärg', unit: 'liter', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-MAL-053', name: 'Tapet standard', unit: 'rulle', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-MAL-054', name: 'Spackel', unit: 'hink', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-MAL-055', name: 'Maskeringsmaterial', unit: 'rulle', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
  ],

  construction: [
    { sku: 'HM-BYG-001', name: 'Byggarbete', unit: 'tim', unit_price: 500, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-BYG-002', name: 'Rivning', unit: 'tim', unit_price: 450, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-BYG-010', name: 'Badrumsrenovering', description: 'Komplett, normalstort badrum', unit: 'st', unit_price: 85000, category: 'arbete', legacy_category: 'service', labor_share: 0.55, deduction: 'rot' },
    { sku: 'HM-BYG-011', name: 'Köksrenovering', unit: 'st', unit_price: 75000, category: 'arbete', legacy_category: 'service', labor_share: 0.55, deduction: 'rot' },
    { sku: 'HM-BYG-012', name: 'Tillbyggnad', description: 'Per kvadratmeter, nyckelfärdigt', unit: 'kvm', unit_price: 22000, category: 'arbete', legacy_category: 'service', labor_share: 0.45, deduction: 'rot' },
    { sku: 'HM-BYG-013', name: 'Gjuta platta', unit: 'kvm', unit_price: 1800, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-BYG-014', name: 'Dränering runt hus', unit: 'lpm', unit_price: 3500, category: 'arbete', legacy_category: 'service', labor_share: 0.55, deduction: 'rot' },
    { sku: 'HM-BYG-015', name: 'Bilning av betonggolv', unit: 'kvm', unit_price: 950, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rot' },
    { sku: 'HM-BYG-016', name: 'Håltagning i bärande vägg', description: 'Inkl. avväxling', unit: 'st', unit_price: 18000, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-BYG-017', name: 'Uppbyggnad regelvägg', unit: 'kvm', unit_price: 1400, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-BYG-050', name: 'Gipsskiva 13 mm', unit: 'st', unit_price: 95, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-051', name: 'Betong C25', unit: 'kbm', unit_price: 1650, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-052', name: 'Armeringsnät', unit: 'st', unit_price: 320, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-053', name: 'Isolering 95 mm', unit: 'kvm', unit_price: 145, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-054', name: 'Cementbruk', unit: 'säck', unit_price: 110, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-080', name: 'Container 10 kbm', description: 'Hyra inkl. hämtning', unit: 'st', unit_price: 4500, category: 'hyra', legacy_category: 'service', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-081', name: 'Byggställning', description: 'Hyra per vecka', unit: 'vecka', unit_price: 4500, category: 'hyra', legacy_category: 'service', labor_share: 0, deduction: null },

    // ─── Utökningen 2026-08-06: prislös långsvans ──────────────────────────
    // Se kommentaren i electrician-blocket. Raderna ovan behåller sina
    // startpriser; långsvansen nedan seedas prislös och priset sätts första
    // gången artikeln används.
    { sku: 'HM-BYG-003', name: 'Byggledning och arbetsledning', unit: 'tim', unit_price: 0, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-BYG-004', name: 'Lärling', description: 'Medhjälpare på plats', unit: 'tim', unit_price: 0, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-BYG-005', name: 'Maskinförare', unit: 'tim', unit_price: 0, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-BYG-006', name: 'Projektering och bygglovsritning', unit: 'tim', unit_price: 0, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: null },

    // C1 (pass 3): hette 'Tillbyggnad' — exakt samma (namn, enhet) som
    // prissatta HM-BYG-012 → dubblett i varje bygg-konto och godtycklig
    // namnmatchning i matchGeneratedItems. Namnet skiljer nu varianten.
    { sku: 'HM-BYG-018', name: 'Tillbyggnad (stomme och tätt hus)', description: 'Stomme och tätt hus, per kvadratmeter', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-BYG-019', name: 'Uppbyggnad garage', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-BYG-020', name: 'Uppbyggnad altan', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.55, deduction: 'rot' },
    { sku: 'HM-BYG-021', name: 'Byggnation carport', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-BYG-022', name: 'Uppbyggnad friggebod', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-BYG-023', name: 'Inredning av vind', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-BYG-024', name: 'Inredning av källare', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-BYG-025', name: 'Rivning av innervägg', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.85, deduction: 'rot' },
    { sku: 'HM-BYG-026', name: 'Uppsättning gipsvägg', description: 'Enkelt gipsad regelvägg', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-BYG-027', name: 'Undertak', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-BYG-028', name: 'Isolering av vindsbjälklag', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-BYG-029', name: 'Tilläggsisolering fasad', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-BYG-030', name: 'Byte av fönster', description: 'Demontering och montering, per fönster', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-BYG-031', name: 'Byte av ytterdörr', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-BYG-032', name: 'Montering innerdörr', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-BYG-033', name: 'Grundläggning plintar', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-BYG-034', name: 'Schaktning', unit: 'kbm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-BYG-035', name: 'Återfyllning och packning', unit: 'kbm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-BYG-036', name: 'Fuktspärr och tätskikt grund', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-BYG-037', name: 'Gjutning av golv', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-BYG-038', name: 'Avjämning av golv', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.55, deduction: 'rot' },
    { sku: 'HM-BYG-039', name: 'Murning', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-BYG-040', name: 'Putsning av fasad', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.65, deduction: 'rot' },
    { sku: 'HM-BYG-041', name: 'Montering av fasadpanel', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-BYG-042', name: 'Byte av syllar', unit: 'lpm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-BYG-043', name: 'Uppbyggnad takstolar', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.55, deduction: 'rot' },
    { sku: 'HM-BYG-044', name: 'Byggstädning', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.9, deduction: 'rot' },
    { sku: 'HM-BYG-045', name: 'Etablering av arbetsplats', description: 'Skydd, avspärrning och dammskydd', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rot' },
    { sku: 'HM-BYG-046', name: 'Fuktmätning och besiktning', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.9, deduction: 'rot' },
    { sku: 'HM-BYG-047', name: 'Asbestsanering', description: 'Utförs av behörig entreprenör', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-BYG-048', name: 'Håltagning i betong', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rot' },
    { sku: 'HM-BYG-049', name: 'Avväxling och balkmontage', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },

    { sku: 'HM-BYG-055', name: 'Regel 45x95', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-056', name: 'Regel 45x145', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-057', name: 'Reglar för golvbjälklag', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-058', name: 'Plywood 12 mm', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-059', name: 'OSB-skiva 12 mm', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-060', name: 'Våtrumsskiva', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-061', name: 'Gipsskiva 13 mm brandklassad', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-062', name: 'Isolering 145 mm', unit: 'kvm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-063', name: 'Lösull', unit: 'kbm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-064', name: 'Ångspärr', unit: 'kvm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-065', name: 'Vindskyddsduk', unit: 'kvm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-066', name: 'Fasadpanel granrå', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-067', name: 'Trall 28x120', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-068', name: 'Impregnerat virke', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-069', name: 'Limträbalk', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-070', name: 'Stålbalk HEB', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-071', name: 'Betongplint', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-072', name: 'Makadam', unit: 'ton', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-073', name: 'Cellplast 100 mm', unit: 'kvm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-074', name: 'Avjämningsmassa', unit: 'säck', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-075', name: 'Fönster', description: 'Treglas, standardmått', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-076', name: 'Ytterdörr', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-077', name: 'Innerdörr med karm', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-078', name: 'Spik och skruv', unit: 'paket', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-079', name: 'Byggplast och skyddstäckning', unit: 'rulle', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },

    { sku: 'HM-BYG-082', name: 'Container 20 kbm', description: 'Hyra inkl. hämtning', unit: 'st', unit_price: 0, category: 'hyra', legacy_category: 'service', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-083', name: 'Minigrävare', description: 'Hyra per dag', unit: 'dag', unit_price: 0, category: 'hyra', legacy_category: 'service', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-084', name: 'Bygghiss', description: 'Hyra per vecka', unit: 'vecka', unit_price: 0, category: 'hyra', legacy_category: 'service', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-085', name: 'Byggtork', description: 'Hyra per vecka', unit: 'vecka', unit_price: 0, category: 'hyra', legacy_category: 'service', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-086', name: 'Bodetablering', description: 'Hyra per månad', unit: 'månad', unit_price: 0, category: 'hyra', legacy_category: 'service', labor_share: 0, deduction: null },
    { sku: 'HM-BYG-087', name: 'Byggel och provisoriskström', description: 'Per månad', unit: 'månad', unit_price: 0, category: 'hyra', legacy_category: 'service', labor_share: 0, deduction: null },
  ],

  roofing: [
    { sku: 'HM-TAK-001', name: 'Takarbete', unit: 'tim', unit_price: 500, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-TAK-010', name: 'Takbyte betongpannor', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.55, deduction: 'rot' },
    { sku: 'HM-TAK-011', name: 'Plåttak', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-TAK-012', name: 'Byte takpapp', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-TAK-013', name: 'Byte undertak och läkt', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-TAK-014', name: 'Montering hängränna', unit: 'lpm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-TAK-015', name: 'Montering stuprör', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-TAK-016', name: 'Takmålning', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.75, deduction: 'rot' },
    { sku: 'HM-TAK-017', name: 'Montering fågelband', unit: 'lpm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-TAK-018', name: 'Snöskottning tak', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.95, deduction: 'rut' },
    { sku: 'HM-TAK-050', name: 'Betongpanna', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-TAK-051', name: 'Takpapp', unit: 'kvm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-TAK-052', name: 'Hängränna plåt', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-TAK-053', name: 'Stuprör plåt', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-TAK-054', name: 'Läkt 24x48', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-TAK-080', name: 'Byggställning', description: 'Hyra per vecka', unit: 'vecka', unit_price: 0, category: 'hyra', legacy_category: 'service', labor_share: 0, deduction: null },
  ],

  flooring: [
    { sku: 'HM-GOLV-001', name: 'Golvläggning', unit: 'tim', unit_price: 500, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-GOLV-010', name: 'Parkettläggning', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.75, deduction: 'rot' },
    { sku: 'HM-GOLV-011', name: 'Kakel och klinker', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-GOLV-012', name: 'Laminatläggning', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rot' },
    { sku: 'HM-GOLV-013', name: 'Golvslipning', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.85, deduction: 'rot' },
    { sku: 'HM-GOLV-014', name: 'Mattläggning', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.75, deduction: 'rot' },
    { sku: 'HM-GOLV-015', name: 'Flytspackling', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-GOLV-016', name: 'Montering socklar', unit: 'lpm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-GOLV-017', name: 'Rivning av gammalt golv', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.9, deduction: 'rot' },
    { sku: 'HM-GOLV-050', name: 'Parkett ek', unit: 'kvm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-GOLV-051', name: 'Laminat', unit: 'kvm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-GOLV-052', name: 'Klinker 20x20', unit: 'kvm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-GOLV-053', name: 'Golvlim', unit: 'hink', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-GOLV-054', name: 'Flytspackel', unit: 'säck', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-GOLV-055', name: 'Sockellist', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
  ],

  gardening: [
    { sku: 'HM-TRA-001', name: 'Trädgårdsarbete', unit: 'tim', unit_price: 400, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-TRA-010', name: 'Häckklippning', unit: 'lpm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.95, deduction: 'rut' },
    { sku: 'HM-TRA-011', name: 'Gräsklippning', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.95, deduction: 'rut' },
    { sku: 'HM-TRA-012', name: 'Ogräsrensning', unit: 'tim', unit_price: 400, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-TRA-013', name: 'Trädfällning', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.9, deduction: 'rut' },
    { sku: 'HM-TRA-014', name: 'Stubbfräsning', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.9, deduction: 'rut' },
    { sku: 'HM-TRA-015', name: 'Snöröjning', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-TRA-016', name: 'Plantering buskar', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rut' },
    { sku: 'HM-TRA-020', name: 'Stenläggning', description: 'Markarbete — avdragstyp beror på arbetets koppling till bostaden', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.55, deduction: 'rot' },
    { sku: 'HM-TRA-021', name: 'Anläggning gräsmatta', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-TRA-050', name: 'Marksten', unit: 'kvm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-TRA-051', name: 'Stenmjöl', unit: 'ton', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-TRA-052', name: 'Rullgräs', unit: 'kvm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-TRA-053', name: 'Häckplantor', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
  ],

  cleaning: [
    { sku: 'HM-STA-001', name: 'Städning', unit: 'tim', unit_price: 350, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-STA-010', name: 'Hemstäd (3:a)', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-STA-011', name: 'Flyttstäd (3:a)', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-STA-012', name: 'Fönsterputs', description: 'Per fönster' , unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-STA-013', name: 'Storstädning villa', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-STA-020', name: 'Kontorsstädning', description: 'Företagskund — inget RUT-avdrag', unit: 'tim', unit_price: 420, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: null },
    { sku: 'HM-STA-021', name: 'Byggstädning', unit: 'tim', unit_price: 550, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: null },
    { sku: 'HM-STA-022', name: 'Trappstädning', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: null },
    { sku: 'HM-STA-014', name: 'Veckostäd (2:a)', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-STA-015', name: 'Veckostäd (4:a)', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-STA-016', name: 'Visningsstäd', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-STA-017', name: 'Ugnsrengöring', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-STA-018', name: 'Mattvätt', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rut' },
    { sku: 'HM-STA-019', name: 'Balkongstäd', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-STA-023', name: 'Golvvård och polering', description: 'Företagskund — inget RUT-avdrag', unit: 'kvm', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.85, deduction: null },
    { sku: 'HM-STA-050', name: 'Städmaterial och rengöringsmedel', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
  ],

  moving: [
    { sku: 'HM-FLY-001', name: 'Flyttpersonal', unit: 'tim', unit_price: 450, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-FLY-010', name: 'Lägenhetsflytt (2:a)', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-FLY-011', name: 'Villaflytt', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-FLY-012', name: 'Packhjälp', unit: 'tim', unit_price: 450, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-FLY-013', name: 'Pianoflytt', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-FLY-014', name: 'Bortforsling av möbler', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rut' },
    { sku: 'HM-FLY-080', name: 'Magasinering', description: 'Per månad', unit: 'månad', unit_price: 0, category: 'hyra', legacy_category: 'service', labor_share: 0, deduction: null },
    { sku: 'HM-FLY-015', name: 'Bärhjälp', description: 'Per person och timme', unit: 'tim', unit_price: 400, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-FLY-016', name: 'Montering och demontering av möbler', unit: 'tim', unit_price: 450, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-FLY-017', name: 'Tungt lyft', description: 'Kassaskåp, flygel och liknande', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-FLY-018', name: 'Bortforsling till återvinning', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rut' },
    { sku: 'HM-FLY-020', name: 'Kontorsflytt', description: 'Företagskund — inget RUT-avdrag', unit: 'tim', unit_price: 850, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: null },
    { sku: 'HM-FLY-050', name: 'Flyttkartonger (10 st)', unit: 'paket', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-FLY-053', name: 'Skyddsmaterial golv och dörrar', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-FLY-051', name: 'Bubbelplast', unit: 'rulle', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-FLY-052', name: 'Möbelfilt', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
  ],

  hvac: [
    { sku: 'HM-VENT-001', name: 'VVS- och ventilationsarbete', unit: 'tim', unit_price: 550, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-VENT-010', name: 'Installation värmepump', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.35, deduction: 'rot' },
    { sku: 'HM-VENT-011', name: 'Service luftvärmepump', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.85, deduction: 'rot' },
    { sku: 'HM-VENT-012', name: 'AC-service', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.85, deduction: 'rot' },
    { sku: 'HM-VENT-013', name: 'Installation FTX-aggregat', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.4, deduction: 'rot' },
    { sku: 'HM-VENT-014', name: 'OVK-besiktning', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.9, deduction: 'rot' },
    { sku: 'HM-VENT-015', name: 'Kanalrensning', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.85, deduction: 'rot' },
    { sku: 'HM-VENT-016', name: 'Installation köksfläkt', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-VENT-017', name: 'Injustering av värmesystem', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.9, deduction: 'rot' },
    { sku: 'HM-VENT-018', name: 'Byte cirkulationspump', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-VENT-019', name: 'Installation frånluftsvärmepump', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.35, deduction: 'rot' },
    { sku: 'HM-VENT-020', name: 'Radiatorspolning', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.9, deduction: 'rot' },
    { sku: 'HM-VENT-021', name: 'Byte termostat', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-VENT-050', name: 'Ventilationsdon', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-VENT-051', name: 'Luftvärmepump 12 kW', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-VENT-052', name: 'Ventilationskanal', unit: 'lpm', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-VENT-053', name: 'Filter FTX', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
  ],

  locksmith: [
    { sku: 'HM-LAS-001', name: 'Låssmedsarbete', unit: 'tim', unit_price: 600, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-LAS-002', name: 'Jouröppning', description: 'Kväll, helg och röd dag', unit: 'tim', unit_price: 1800, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-LAS-010', name: 'Låsöppning dagtid', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.9, deduction: 'rot' },
    { sku: 'HM-LAS-011', name: 'Byte låscylinder', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-LAS-012', name: 'Montering säkerhetsdörr', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.3, deduction: 'rot' },
    { sku: 'HM-LAS-013', name: 'Installation kodlås', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.4, deduction: 'rot' },
    { sku: 'HM-LAS-014', name: 'Montering fönsterlås', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-LAS-015', name: 'Nyckelkopiering', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: null },
    { sku: 'HM-LAS-016', name: 'Installation dörrautomatik', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.4, deduction: 'rot' },
    { sku: 'HM-LAS-017', name: 'Byte dörrstängare', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-LAS-018', name: 'Montering tittöga', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-LAS-019', name: 'Upprättande av låsplan', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.9, deduction: 'rot' },
    { sku: 'HM-LAS-050', name: 'Cylinderlås klass 3', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-LAS-054', name: 'Dörrstängare', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-LAS-051', name: 'Säkerhetsdörr', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-LAS-052', name: 'Kodlås', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-LAS-053', name: 'Hänglås klass 3', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
  ],

  other: [
    { sku: 'HM-OVR-001', name: 'Arbete', unit: 'tim', unit_price: 450, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-OVR-002', name: 'Montering', unit: 'tim', unit_price: 650, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-OVR-010', name: 'Konsultation', unit: 'tim', unit_price: 500, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: null },
    { sku: 'HM-OVR-011', name: 'Småjobb', unit: 'st', unit_price: 0, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rot' },
    { sku: 'HM-OVR-003', name: 'Felsökning', unit: 'tim', unit_price: 550, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-OVR-004', name: 'Akut utryckning', unit: 'tim', unit_price: 950, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-OVR-012', name: 'Demontering och rivning', unit: 'tim', unit_price: 450, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-OVR-013', name: 'Transport av material', unit: 'st', unit_price: 0, category: 'övrigt', legacy_category: 'service', labor_share: 0, deduction: null },
    { sku: 'HM-OVR-050', name: 'Skruv och infästning', unit: 'st', unit_price: 0, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
  ],
}

/**
 * Branschsortimentet inkl. de gemensamma raderna (framkörning, bortforsling,
 * deponiavgift). Okänd bransch faller tillbaka på 'other'.
 *
 * ═══ FLERA BRANSCHER ═══
 *
 * Tar emot en eller flera branscher. Verkligheten är sällan en bransch: Bee
 * arbetar både som elektriker och med bygg, och att tvinga fram ett val hade
 * gett en halv artikelbank åt en hantverkare som gör hela jobbet.
 *
 * Sammanslagningen dedupliceras på `sku` — seed-idempotensnyckeln. Två
 * branscher kan mycket väl dela en artikel (bygg och snickeri delar
 * bortforsling), och då ska den bara finnas en gång; en dubblett hade fått
 * omseedning att skriva över fel rad och kundens egna priser att hamna på fel
 * artikel. FÖRSTA förekomsten vinner, så ordningen på branscherna avgör —
 * huvudbranschen ska stå först.
 *
 * Fallbacken till 'other' gäller bara om INGEN av branscherna kändes igen. En
 * kund med ['electrician', 'nonsens'] ska få elsortimentet, inte spädas ut
 * med allmängods.
 */
export function getProductCatalog(branch: string | string[]): ProductDefault[] {
  const branches = (Array.isArray(branch) ? branch : [branch]).filter(Boolean)
  const known = branches.filter(b => BRANCH_PRODUCTS[b])
  // Kärnan + branschens prislösa långsvans (pass 2) — kärnan först så
  // seed-index/prioritetsordningen för de befintliga artiklarna bevaras.
  const medSvans = (b: string) => [...BRANCH_PRODUCTS[b], ...(LONGTAIL_PRODUCTS[b] ?? [])]
  const bases = known.length > 0 ? known.map(medSvans) : [medSvans('other')]

  // C1 (pass 3): dedup på BÅDE sku OCH (namn, enhet). Multi-bransch-konton
  // fick tidigare t.ex. 'Lärling'/tim från varje bransch (olika sku, samma
  // namn) — matchGeneratedItems tar första namn-träffen godtyckligt, och
  // v183:s unika index (business_id, LOWER(name), unit) skulle avvisa
  // seedningen. Första förekomsten vinner (huvudbranschen står först).
  const bySku = new Map<string, ProductDefault>()
  const settNamnEnhet = new Set<string>()
  for (const p of [...bases.flat(), ...COMMON_EXTRAS]) {
    if (bySku.has(p.sku)) continue
    const nyckel = `${p.name.trim().toLowerCase()}|${p.unit}`
    if (settNamnEnhet.has(nyckel)) continue
    bySku.set(p.sku, p)
    settNamnEnhet.add(nyckel)
  }
  return Array.from(bySku.values())
}

/**
 * Bakåtkompatibelt namn för äldre läsare av hela biblioteket. Nya skrivvägar
 * ska använda `getStarterProducts`; katalogytor använder `getProductCatalog`.
 */
export function getDefaultProducts(branch: string | string[]): ProductDefault[] {
  return getProductCatalog(branch)
}

/**
 * Den enda bank som får skapas automatiskt för ett nytt företag.
 *
 * En huvudsaklig timartikel per vald bransch får företagets verkliga timpris
 * av seedProducts. De tre allmänna raderna följer med prislösa. Hela den
 * prislösa långsvansen finns kvar i det frivilliga biblioteket men kopieras
 * aldrig längre in i företagets privata artikelbank utan ett aktivt val.
 */
export function getStarterProducts(branch: string | string[]): ProductDefault[] {
  const branches = (Array.isArray(branch) ? branch : [branch]).filter(Boolean)
  const known = branches.filter(b => BRANCH_PRODUCTS[b])
  const selected = known.length > 0 ? known : ['other']

  const primaryHourly = selected
    .map(b => BRANCH_PRODUCTS[b].find(p =>
      p.category === 'arbete' &&
      p.legacy_category === 'labor' &&
      p.unit === 'tim' &&
      p.labor_share === 1 &&
      p.unit_price > 0,
    ))
    .filter((p): p is ProductDefault => Boolean(p))

  const candidates = [
    // Bibliotekets branschpris är orientering, inte företagets sanning.
    // Startbanken får därför en prislös timartikel tills ägaren uttryckligen
    // satt sitt standardpris i onboarding eller senare i Inställningar.
    ...primaryHourly.map(product => ({ ...product, unit_price: 0 })),
    ...COMMON_EXTRAS.map(p => ({ ...p, unit_price: 0 })),
  ]
  const byNameAndUnit = new Map<string, ProductDefault>()
  for (const product of candidates) {
    const key = `${product.name.trim().toLowerCase()}|${product.unit}`
    if (!byNameAndUnit.has(key)) byNameAndUnit.set(key, { ...product })
  }
  return Array.from(byNameAndUnit.values())
}

/**
 * Kundens branscher, i den ordning sortimenten ska slås ihop.
 *
 * Huvudbranschen först — vid dubbletter på `sku` vinner första förekomsten,
 * så det är huvudbranschens variant av en delad artikel som blir kundens.
 *
 * `branch` är den kanoniska kolumnen; `industry` finns kvar på tabellen och
 * används av äldre kod, så den tas som reserv (samma ordning som
 * backfill-rutten redan använder). `secondary_branches` kom med v93 och kan
 * saknas på rader som seedats innan dess — därför den defensiva läsningen.
 *
 * Branschförståelse steg 1 (2026-09-02): råvärdena normaliseras via
 * lib/branch, så 'snickeri' (prod) landar på snickarsortimentet och
 * 'hantverkare' (gamla industry-defaulten) på 'other' i stället för att
 * missa BRANCH_PRODUCTS helt.
 */
export function resolveBranches(row: {
  branch?: string | null
  industry?: string | null
  secondary_branches?: string[] | null
}): string[] {
  const resolved = resolveBusinessBranch(row)
  return [resolved.primary, ...resolved.secondary]
}

/** Alla branschnycklar som har ett eget sortiment (exkl. 'other'-fallbacken). */
export function getSeededBranches(): string[] {
  return Object.keys(BRANCH_PRODUCTS)
}

// B2 (Prisslingan V2, 2026-08-31): getDefaultPriceList/PriceListEntry
// borttagna — legacy-tabellen price_list har ALDRIG innehållit en rad
// (INTEGER-id + TEXT-inserts, felet svaldes tyst; sekvensen aldrig anropad).
// Alla forna price_list-läsare går nu mot products via
// lib/products/price-list-view.ts (getPublicPriceList, sales_price>0).
