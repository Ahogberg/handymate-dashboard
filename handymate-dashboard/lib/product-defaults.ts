/**
 * Branschsortimentet — ENDA sanningskällan för artiklar en ny kund får.
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
 * Priserna är exkl. moms och avsedda som en rimlig startpunkt hantverkaren
 * justerar — inte marknadsanalys. `labor_share` styr ROT-basen per rad
 * (lib/products/build-item-snapshot.ts).
 */

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
  ],

  plumber: [
    { sku: 'HM-VVS-001', name: 'VVS-arbete', unit: 'tim', unit_price: 550, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-VVS-002', name: 'Akut utryckning', unit: 'tim', unit_price: 850, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-VVS-010', name: 'Stopp i avlopp', unit: 'st', unit_price: 1200, category: 'arbete', legacy_category: 'service', labor_share: 0.85, deduction: 'rot' },
    { sku: 'HM-VVS-011', name: 'Byta blandare', unit: 'st', unit_price: 1800, category: 'arbete', legacy_category: 'service', labor_share: 0.55, deduction: 'rot' },
    { sku: 'HM-VVS-012', name: 'Byta WC-stol', unit: 'st', unit_price: 2800, category: 'arbete', legacy_category: 'service', labor_share: 0.45, deduction: 'rot' },
    { sku: 'HM-VVS-013', name: 'Installation diskmaskin', unit: 'st', unit_price: 2200, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rot' },
    { sku: 'HM-VVS-014', name: 'Installation tvättmaskin', unit: 'st', unit_price: 1900, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rot' },
    { sku: 'HM-VVS-015', name: 'Byte varmvattenberedare', unit: 'st', unit_price: 8500, category: 'arbete', legacy_category: 'service', labor_share: 0.4, deduction: 'rot' },
    { sku: 'HM-VVS-016', name: 'Montering handdukstork', unit: 'st', unit_price: 2400, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-VVS-017', name: 'Byte golvbrunn', unit: 'st', unit_price: 6500, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-VVS-018', name: 'Tätskikt badrum', description: 'Enligt branschregler, per kvadratmeter', unit: 'kvm', unit_price: 1450, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-VVS-019', name: 'Installation vattenfelsbrytare', unit: 'st', unit_price: 5500, category: 'arbete', legacy_category: 'service', labor_share: 0.4, deduction: 'rot' },
    { sku: 'HM-VVS-050', name: 'Blandare standard', unit: 'st', unit_price: 1500, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-VVS-051', name: 'Köksblandare', unit: 'st', unit_price: 2400, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-VVS-052', name: 'WC-stol', unit: 'st', unit_price: 3500, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-VVS-053', name: 'Handfat med kommod', unit: 'st', unit_price: 3200, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-VVS-054', name: 'Varmvattenberedare 300 l', unit: 'st', unit_price: 9500, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-VVS-055', name: 'Kopparrör 15 mm', unit: 'lpm', unit_price: 95, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-VVS-056', name: 'Golvbrunn', unit: 'st', unit_price: 1400, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
  ],

  carpenter: [
    { sku: 'HM-SNI-001', name: 'Snickeriarbete', unit: 'tim', unit_price: 500, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-SNI-002', name: 'Rivning och demontering', unit: 'tim', unit_price: 450, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-SNI-010', name: 'Altanbygge', description: 'Per kvadratmeter, exkl. räcke', unit: 'kvm', unit_price: 3500, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-SNI-011', name: 'Trädäck med räcke', unit: 'kvm', unit_price: 4200, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-SNI-012', name: 'Köksmontering', unit: 'st', unit_price: 15000, category: 'arbete', legacy_category: 'service', labor_share: 0.75, deduction: 'rot' },
    { sku: 'HM-SNI-013', name: 'Montering innerdörr', unit: 'st', unit_price: 2200, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-SNI-014', name: 'Byte ytterdörr', unit: 'st', unit_price: 4500, category: 'arbete', legacy_category: 'service', labor_share: 0.35, deduction: 'rot' },
    { sku: 'HM-SNI-015', name: 'Fönsterbyte', description: 'Per fönster, inkl. drevning och lister', unit: 'st', unit_price: 4800, category: 'arbete', legacy_category: 'service', labor_share: 0.35, deduction: 'rot' },
    { sku: 'HM-SNI-016', name: 'Montering garderob', unit: 'st', unit_price: 1800, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-SNI-017', name: 'Bygga innervägg', description: 'Regelstomme med gips, per kvadratmeter', unit: 'kvm', unit_price: 1400, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-SNI-018', name: 'Innertak med gips', unit: 'kvm', unit_price: 750, category: 'arbete', legacy_category: 'service', labor_share: 0.65, deduction: 'rot' },
    { sku: 'HM-SNI-019', name: 'Bygga carport', unit: 'st', unit_price: 65000, category: 'arbete', legacy_category: 'service', labor_share: 0.45, deduction: 'rot' },
    { sku: 'HM-SNI-050', name: 'Trall tryckimpregnerad', unit: 'kvm', unit_price: 350, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-SNI-051', name: 'Reglar 45x95', unit: 'lpm', unit_price: 45, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-SNI-052', name: 'Gipsskiva 13 mm', unit: 'st', unit_price: 95, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-SNI-053', name: 'Innerdörr vit standard', unit: 'st', unit_price: 1800, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-SNI-054', name: 'Plywood 12 mm', unit: 'kvm', unit_price: 320, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-SNI-055', name: 'Isolering 95 mm', unit: 'kvm', unit_price: 145, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
  ],

  painter: [
    { sku: 'HM-MAL-001', name: 'Måleriarbete', unit: 'tim', unit_price: 450, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-MAL-010', name: 'Rum (väggar och tak)', description: 'Per kvadratmeter golvyta', unit: 'kvm', unit_price: 650, category: 'arbete', legacy_category: 'service', labor_share: 0.75, deduction: 'rot' },
    { sku: 'HM-MAL-011', name: 'Fasadmålning', unit: 'kvm', unit_price: 350, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-MAL-012', name: 'Tapetsering', unit: 'kvm', unit_price: 420, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-MAL-013', name: 'Målning innerdörr', unit: 'st', unit_price: 850, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rot' },
    { sku: 'HM-MAL-014', name: 'Målning fönster', description: 'Per båge', unit: 'st', unit_price: 1200, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rot' },
    { sku: 'HM-MAL-015', name: 'Spackling och slipning', unit: 'kvm', unit_price: 280, category: 'arbete', legacy_category: 'service', labor_share: 0.85, deduction: 'rot' },
    { sku: 'HM-MAL-016', name: 'Målning tak', unit: 'kvm', unit_price: 220, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rot' },
    { sku: 'HM-MAL-017', name: 'Lackering köksluckor', description: 'Per lucka', unit: 'st', unit_price: 950, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-MAL-018', name: 'Målning staket', unit: 'lpm', unit_price: 180, category: 'arbete', legacy_category: 'service', labor_share: 0.75, deduction: 'rot' },
    { sku: 'HM-MAL-050', name: 'Väggfärg (vit)', unit: 'liter', unit_price: 120, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-MAL-051', name: 'Grundfärg', unit: 'liter', unit_price: 150, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-MAL-052', name: 'Fasadfärg', unit: 'liter', unit_price: 220, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-MAL-053', name: 'Tapet standard', unit: 'rulle', unit_price: 450, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-MAL-054', name: 'Spackel', unit: 'hink', unit_price: 380, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-MAL-055', name: 'Maskeringsmaterial', unit: 'rulle', unit_price: 85, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
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
  ],

  roofing: [
    { sku: 'HM-TAK-001', name: 'Takarbete', unit: 'tim', unit_price: 500, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-TAK-010', name: 'Takbyte betongpannor', unit: 'kvm', unit_price: 1200, category: 'arbete', legacy_category: 'service', labor_share: 0.55, deduction: 'rot' },
    { sku: 'HM-TAK-011', name: 'Plåttak', unit: 'kvm', unit_price: 900, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-TAK-012', name: 'Byte takpapp', unit: 'kvm', unit_price: 650, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-TAK-013', name: 'Byte undertak och läkt', unit: 'kvm', unit_price: 480, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-TAK-014', name: 'Montering hängränna', unit: 'lpm', unit_price: 450, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-TAK-015', name: 'Montering stuprör', unit: 'st', unit_price: 850, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-TAK-016', name: 'Takmålning', unit: 'kvm', unit_price: 280, category: 'arbete', legacy_category: 'service', labor_share: 0.75, deduction: 'rot' },
    { sku: 'HM-TAK-017', name: 'Montering fågelband', unit: 'lpm', unit_price: 180, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-TAK-018', name: 'Snöskottning tak', unit: 'st', unit_price: 8500, category: 'arbete', legacy_category: 'service', labor_share: 0.95, deduction: 'rut' },
    { sku: 'HM-TAK-050', name: 'Betongpanna', unit: 'st', unit_price: 35, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-TAK-051', name: 'Takpapp', unit: 'kvm', unit_price: 145, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-TAK-052', name: 'Hängränna plåt', unit: 'lpm', unit_price: 220, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-TAK-053', name: 'Stuprör plåt', unit: 'st', unit_price: 280, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-TAK-054', name: 'Läkt 24x48', unit: 'lpm', unit_price: 18, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-TAK-080', name: 'Byggställning', description: 'Hyra per vecka', unit: 'vecka', unit_price: 4500, category: 'hyra', legacy_category: 'service', labor_share: 0, deduction: null },
  ],

  flooring: [
    { sku: 'HM-GOLV-001', name: 'Golvläggning', unit: 'tim', unit_price: 500, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-GOLV-010', name: 'Parkettläggning', unit: 'kvm', unit_price: 450, category: 'arbete', legacy_category: 'service', labor_share: 0.75, deduction: 'rot' },
    { sku: 'HM-GOLV-011', name: 'Kakel och klinker', unit: 'kvm', unit_price: 850, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-GOLV-012', name: 'Laminatläggning', unit: 'kvm', unit_price: 320, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rot' },
    { sku: 'HM-GOLV-013', name: 'Golvslipning', unit: 'kvm', unit_price: 380, category: 'arbete', legacy_category: 'service', labor_share: 0.85, deduction: 'rot' },
    { sku: 'HM-GOLV-014', name: 'Mattläggning', unit: 'kvm', unit_price: 280, category: 'arbete', legacy_category: 'service', labor_share: 0.75, deduction: 'rot' },
    { sku: 'HM-GOLV-015', name: 'Flytspackling', unit: 'kvm', unit_price: 340, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-GOLV-016', name: 'Montering socklar', unit: 'lpm', unit_price: 95, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-GOLV-017', name: 'Rivning av gammalt golv', unit: 'kvm', unit_price: 180, category: 'arbete', legacy_category: 'service', labor_share: 0.9, deduction: 'rot' },
    { sku: 'HM-GOLV-050', name: 'Parkett ek', unit: 'kvm', unit_price: 550, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-GOLV-051', name: 'Laminat', unit: 'kvm', unit_price: 220, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-GOLV-052', name: 'Klinker 20x20', unit: 'kvm', unit_price: 380, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-GOLV-053', name: 'Golvlim', unit: 'hink', unit_price: 420, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-GOLV-054', name: 'Flytspackel', unit: 'säck', unit_price: 145, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-GOLV-055', name: 'Sockellist', unit: 'lpm', unit_price: 45, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
  ],

  gardening: [
    { sku: 'HM-TRA-001', name: 'Trädgårdsarbete', unit: 'tim', unit_price: 400, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-TRA-010', name: 'Häckklippning', unit: 'lpm', unit_price: 80, category: 'arbete', legacy_category: 'service', labor_share: 0.95, deduction: 'rut' },
    { sku: 'HM-TRA-011', name: 'Gräsklippning', unit: 'kvm', unit_price: 8, category: 'arbete', legacy_category: 'service', labor_share: 0.95, deduction: 'rut' },
    { sku: 'HM-TRA-012', name: 'Ogräsrensning', unit: 'tim', unit_price: 400, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-TRA-013', name: 'Trädfällning', unit: 'st', unit_price: 4500, category: 'arbete', legacy_category: 'service', labor_share: 0.9, deduction: 'rut' },
    { sku: 'HM-TRA-014', name: 'Stubbfräsning', unit: 'st', unit_price: 1800, category: 'arbete', legacy_category: 'service', labor_share: 0.9, deduction: 'rut' },
    { sku: 'HM-TRA-015', name: 'Snöröjning', unit: 'st', unit_price: 850, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-TRA-016', name: 'Plantering buskar', unit: 'st', unit_price: 450, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rut' },
    { sku: 'HM-TRA-020', name: 'Stenläggning', description: 'Markarbete — avdragstyp beror på arbetets koppling till bostaden', unit: 'kvm', unit_price: 850, category: 'arbete', legacy_category: 'service', labor_share: 0.55, deduction: 'rot' },
    { sku: 'HM-TRA-021', name: 'Anläggning gräsmatta', unit: 'kvm', unit_price: 180, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-TRA-050', name: 'Marksten', unit: 'kvm', unit_price: 280, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-TRA-051', name: 'Stenmjöl', unit: 'ton', unit_price: 450, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-TRA-052', name: 'Rullgräs', unit: 'kvm', unit_price: 95, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-TRA-053', name: 'Häckplantor', unit: 'st', unit_price: 120, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
  ],

  cleaning: [
    { sku: 'HM-STA-001', name: 'Städning', unit: 'tim', unit_price: 350, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-STA-010', name: 'Hemstäd (3:a)', unit: 'st', unit_price: 1200, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-STA-011', name: 'Flyttstäd (3:a)', unit: 'st', unit_price: 3500, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-STA-012', name: 'Fönsterputs', description: 'Per fönster' , unit: 'st', unit_price: 150, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-STA-013', name: 'Storstädning villa', unit: 'st', unit_price: 4500, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-STA-020', name: 'Kontorsstädning', description: 'Företagskund — inget RUT-avdrag', unit: 'tim', unit_price: 420, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: null },
    { sku: 'HM-STA-021', name: 'Byggstädning', unit: 'tim', unit_price: 550, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: null },
    { sku: 'HM-STA-022', name: 'Trappstädning', unit: 'st', unit_price: 850, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: null },
    { sku: 'HM-STA-014', name: 'Veckostäd (2:a)', unit: 'st', unit_price: 900, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-STA-015', name: 'Veckostäd (4:a)', unit: 'st', unit_price: 1500, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-STA-016', name: 'Visningsstäd', unit: 'st', unit_price: 1800, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-STA-017', name: 'Ugnsrengöring', unit: 'st', unit_price: 650, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-STA-018', name: 'Mattvätt', unit: 'kvm', unit_price: 85, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rut' },
    { sku: 'HM-STA-019', name: 'Balkongstäd', unit: 'st', unit_price: 600, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-STA-023', name: 'Golvvård och polering', description: 'Företagskund — inget RUT-avdrag', unit: 'kvm', unit_price: 45, category: 'arbete', legacy_category: 'service', labor_share: 0.85, deduction: null },
    { sku: 'HM-STA-050', name: 'Städmaterial och rengöringsmedel', unit: 'st', unit_price: 250, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
  ],

  moving: [
    { sku: 'HM-FLY-001', name: 'Flyttpersonal', unit: 'tim', unit_price: 450, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-FLY-010', name: 'Lägenhetsflytt (2:a)', unit: 'st', unit_price: 5000, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-FLY-011', name: 'Villaflytt', unit: 'st', unit_price: 12000, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-FLY-012', name: 'Packhjälp', unit: 'tim', unit_price: 450, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-FLY-013', name: 'Pianoflytt', unit: 'st', unit_price: 3500, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-FLY-014', name: 'Bortforsling av möbler', unit: 'st', unit_price: 2500, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rut' },
    { sku: 'HM-FLY-080', name: 'Magasinering', description: 'Per månad', unit: 'månad', unit_price: 900, category: 'hyra', legacy_category: 'service', labor_share: 0, deduction: null },
    { sku: 'HM-FLY-015', name: 'Bärhjälp', description: 'Per person och timme', unit: 'tim', unit_price: 400, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-FLY-016', name: 'Montering och demontering av möbler', unit: 'tim', unit_price: 450, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-FLY-017', name: 'Tungt lyft', description: 'Kassaskåp, flygel och liknande', unit: 'st', unit_price: 2500, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rut' },
    { sku: 'HM-FLY-018', name: 'Bortforsling till återvinning', unit: 'st', unit_price: 1500, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rut' },
    { sku: 'HM-FLY-020', name: 'Kontorsflytt', description: 'Företagskund — inget RUT-avdrag', unit: 'tim', unit_price: 850, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: null },
    { sku: 'HM-FLY-050', name: 'Flyttkartonger (10 st)', unit: 'paket', unit_price: 250, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-FLY-053', name: 'Skyddsmaterial golv och dörrar', unit: 'st', unit_price: 450, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-FLY-051', name: 'Bubbelplast', unit: 'rulle', unit_price: 180, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-FLY-052', name: 'Möbelfilt', unit: 'st', unit_price: 120, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
  ],

  hvac: [
    { sku: 'HM-VENT-001', name: 'VVS- och ventilationsarbete', unit: 'tim', unit_price: 550, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-VENT-010', name: 'Installation värmepump', unit: 'st', unit_price: 25000, category: 'arbete', legacy_category: 'service', labor_share: 0.35, deduction: 'rot' },
    { sku: 'HM-VENT-011', name: 'Service luftvärmepump', unit: 'st', unit_price: 1800, category: 'arbete', legacy_category: 'service', labor_share: 0.85, deduction: 'rot' },
    { sku: 'HM-VENT-012', name: 'AC-service', unit: 'st', unit_price: 2500, category: 'arbete', legacy_category: 'service', labor_share: 0.85, deduction: 'rot' },
    { sku: 'HM-VENT-013', name: 'Installation FTX-aggregat', unit: 'st', unit_price: 45000, category: 'arbete', legacy_category: 'service', labor_share: 0.4, deduction: 'rot' },
    { sku: 'HM-VENT-014', name: 'OVK-besiktning', unit: 'st', unit_price: 4500, category: 'arbete', legacy_category: 'service', labor_share: 0.9, deduction: 'rot' },
    { sku: 'HM-VENT-015', name: 'Kanalrensning', unit: 'st', unit_price: 6500, category: 'arbete', legacy_category: 'service', labor_share: 0.85, deduction: 'rot' },
    { sku: 'HM-VENT-016', name: 'Installation köksfläkt', unit: 'st', unit_price: 3200, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-VENT-017', name: 'Injustering av värmesystem', unit: 'st', unit_price: 4500, category: 'arbete', legacy_category: 'service', labor_share: 0.9, deduction: 'rot' },
    { sku: 'HM-VENT-018', name: 'Byte cirkulationspump', unit: 'st', unit_price: 4200, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-VENT-019', name: 'Installation frånluftsvärmepump', unit: 'st', unit_price: 38000, category: 'arbete', legacy_category: 'service', labor_share: 0.35, deduction: 'rot' },
    { sku: 'HM-VENT-020', name: 'Radiatorspolning', unit: 'st', unit_price: 850, category: 'arbete', legacy_category: 'service', labor_share: 0.9, deduction: 'rot' },
    { sku: 'HM-VENT-021', name: 'Byte termostat', unit: 'st', unit_price: 650, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-VENT-050', name: 'Ventilationsdon', unit: 'st', unit_price: 450, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-VENT-051', name: 'Luftvärmepump 12 kW', unit: 'st', unit_price: 22000, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-VENT-052', name: 'Ventilationskanal', unit: 'lpm', unit_price: 165, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-VENT-053', name: 'Filter FTX', unit: 'st', unit_price: 650, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
  ],

  locksmith: [
    { sku: 'HM-LAS-001', name: 'Låssmedsarbete', unit: 'tim', unit_price: 600, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-LAS-002', name: 'Jouröppning', description: 'Kväll, helg och röd dag', unit: 'tim', unit_price: 1800, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-LAS-010', name: 'Låsöppning dagtid', unit: 'st', unit_price: 1200, category: 'arbete', legacy_category: 'service', labor_share: 0.9, deduction: 'rot' },
    { sku: 'HM-LAS-011', name: 'Byte låscylinder', unit: 'st', unit_price: 2500, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-LAS-012', name: 'Montering säkerhetsdörr', unit: 'st', unit_price: 12000, category: 'arbete', legacy_category: 'service', labor_share: 0.3, deduction: 'rot' },
    { sku: 'HM-LAS-013', name: 'Installation kodlås', unit: 'st', unit_price: 4500, category: 'arbete', legacy_category: 'service', labor_share: 0.4, deduction: 'rot' },
    { sku: 'HM-LAS-014', name: 'Montering fönsterlås', unit: 'st', unit_price: 850, category: 'arbete', legacy_category: 'service', labor_share: 0.6, deduction: 'rot' },
    { sku: 'HM-LAS-015', name: 'Nyckelkopiering', unit: 'st', unit_price: 150, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: null },
    { sku: 'HM-LAS-016', name: 'Installation dörrautomatik', unit: 'st', unit_price: 8500, category: 'arbete', legacy_category: 'service', labor_share: 0.4, deduction: 'rot' },
    { sku: 'HM-LAS-017', name: 'Byte dörrstängare', unit: 'st', unit_price: 2200, category: 'arbete', legacy_category: 'service', labor_share: 0.5, deduction: 'rot' },
    { sku: 'HM-LAS-018', name: 'Montering tittöga', unit: 'st', unit_price: 650, category: 'arbete', legacy_category: 'service', labor_share: 0.7, deduction: 'rot' },
    { sku: 'HM-LAS-019', name: 'Upprättande av låsplan', unit: 'st', unit_price: 3500, category: 'arbete', legacy_category: 'service', labor_share: 0.9, deduction: 'rot' },
    { sku: 'HM-LAS-050', name: 'Cylinderlås klass 3', unit: 'st', unit_price: 800, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-LAS-054', name: 'Dörrstängare', unit: 'st', unit_price: 1800, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-LAS-051', name: 'Säkerhetsdörr', unit: 'st', unit_price: 9500, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-LAS-052', name: 'Kodlås', unit: 'st', unit_price: 3500, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
    { sku: 'HM-LAS-053', name: 'Hänglås klass 3', unit: 'st', unit_price: 450, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
  ],

  other: [
    { sku: 'HM-OVR-001', name: 'Arbete', unit: 'tim', unit_price: 450, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-OVR-002', name: 'Montering', unit: 'tim', unit_price: 650, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-OVR-010', name: 'Konsultation', unit: 'tim', unit_price: 500, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: null },
    { sku: 'HM-OVR-011', name: 'Småjobb', unit: 'st', unit_price: 1500, category: 'arbete', legacy_category: 'service', labor_share: 0.8, deduction: 'rot' },
    { sku: 'HM-OVR-003', name: 'Felsökning', unit: 'tim', unit_price: 550, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-OVR-004', name: 'Akut utryckning', unit: 'tim', unit_price: 950, category: 'arbete', legacy_category: 'labor', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-OVR-012', name: 'Demontering och rivning', unit: 'tim', unit_price: 450, category: 'arbete', legacy_category: 'service', labor_share: 1, deduction: 'rot' },
    { sku: 'HM-OVR-013', name: 'Transport av material', unit: 'st', unit_price: 650, category: 'övrigt', legacy_category: 'service', labor_share: 0, deduction: null },
    { sku: 'HM-OVR-050', name: 'Skruv och infästning', unit: 'st', unit_price: 250, category: 'material', legacy_category: 'material', labor_share: 0, deduction: null },
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
export function getDefaultProducts(branch: string | string[]): ProductDefault[] {
  const branches = (Array.isArray(branch) ? branch : [branch]).filter(Boolean)
  const known = branches.filter(b => BRANCH_PRODUCTS[b])
  const bases = known.length > 0 ? known.map(b => BRANCH_PRODUCTS[b]) : [BRANCH_PRODUCTS.other]

  const bySku = new Map<string, ProductDefault>()
  for (const p of [...bases.flat(), ...COMMON_EXTRAS]) {
    if (!bySku.has(p.sku)) bySku.set(p.sku, p)
  }
  return Array.from(bySku.values())
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
 */
export function resolveBranches(row: {
  branch?: string | null
  industry?: string | null
  secondary_branches?: string[] | null
}): string[] {
  const primary = row.branch || row.industry || 'other'
  const extras = (row.secondary_branches ?? []).filter(b => b && b !== primary)
  return [primary, ...extras]
}

/** Alla branschnycklar som har ett eget sortiment (exkl. 'other'-fallbacken). */
export function getSeededBranches(): string[] {
  return Object.keys(BRANCH_PRODUCTS)
}

/** price_list-formen — bakåtkompatibel med telefonagent/widget/storefront. */
export interface PriceListEntry {
  category: 'labor' | 'material' | 'service'
  name: string
  unit: string
  unit_price: number
}

/**
 * price_list härleds ur samma data som produktbanken, så telefonagenten och
 * offerten aldrig kan säga olika priser för samma artikel.
 */
export function getDefaultPriceList(branch: string | string[]): PriceListEntry[] {
  return getDefaultProducts(branch).map(p => ({
    category: p.legacy_category,
    name: p.name,
    unit: p.unit,
    unit_price: p.unit_price,
  }))
}
