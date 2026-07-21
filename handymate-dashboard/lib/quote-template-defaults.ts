/**
 * Mallbank v1 — färdigförfattade offertmallar per bransch (Etapp 3).
 * Mönster: lib/price-list-defaults.ts / lib/checklist-defaults.ts.
 *
 * Innehållet är hämtat ordagrant från mallbank-innehall.md (granskat,
 * ROT/grön teknik-flaggor skatterättsligt verifierade mot lib/quote-calculations.ts).
 * VIKTIGT: värmepump är ROT (30 % på arbete) — INTE grön teknik. Grön teknik
 * omfattar endast solceller/batterilagring/laddpunkt enligt Skatteverket.
 *
 * total per rad = quantity × unit_price (kontrolleras av
 * scratchpad-räknescriptet i Etapp 3-verifieringen, inte incheckat här).
 */

import type { QuoteItem, PaymentPlanEntry, RotRutType } from '@/lib/types/quote'

function genItemId(): string {
  return 'qi_' + Math.random().toString(36).substr(2, 12)
}

interface ItemOpts {
  group_name?: string
  rot_rut_type?: RotRutType
  option_selected?: boolean
  option_default?: boolean
}

function heading(description: string, group_name?: string): QuoteItem {
  return {
    id: genItemId(),
    item_type: 'heading',
    description,
    group_name: group_name ?? description,
    quantity: 0,
    unit: 'st',
    unit_price: 0,
    total: 0,
    is_rot_eligible: false,
    is_rut_eligible: false,
    rot_rut_type: null,
    sort_order: 0, // reassigned av finalize()
  }
}

function line(description: string, quantity: number, unit: string, unit_price: number, opts: ItemOpts = {}): QuoteItem {
  const rotRutType = opts.rot_rut_type ?? null
  return {
    id: genItemId(),
    item_type: 'item',
    description,
    group_name: opts.group_name,
    quantity,
    unit,
    unit_price,
    total: quantity * unit_price,
    is_rot_eligible: rotRutType === 'rot',
    is_rut_eligible: rotRutType === 'rut',
    rot_rut_type: rotRutType,
    sort_order: 0, // reassigned av finalize()
  }
}

function option(description: string, quantity: number, unit: string, unit_price: number, opts: ItemOpts = {}): QuoteItem {
  const rotRutType = opts.rot_rut_type ?? null
  return {
    id: genItemId(),
    item_type: 'option',
    description,
    group_name: opts.group_name,
    quantity,
    unit,
    unit_price,
    total: quantity * unit_price,
    is_rot_eligible: rotRutType === 'rot',
    is_rut_eligible: rotRutType === 'rut',
    rot_rut_type: rotRutType,
    option_selected: opts.option_selected ?? false,
    option_default: opts.option_default ?? false,
    sort_order: 0, // reassigned av finalize()
  }
}

/** Delsumma-rad — beloppet räknas av den anropande mallbyggaren (samma
 *  logik som calculateSubtotal i lib/quote-calculations.ts: summan av
 *  alla item-rader sedan senaste heading/subtotal i samma grupp). */
function subtotal(total: number, group_name?: string): QuoteItem {
  return {
    id: genItemId(),
    item_type: 'subtotal',
    description: 'Delsumma',
    group_name,
    quantity: 0,
    unit: 'st',
    unit_price: 0,
    total,
    is_rot_eligible: false,
    is_rut_eligible: false,
    rot_rut_type: null,
    sort_order: 0, // reassigned av finalize()
  }
}

/** Sätter sort_order = array-index — MÅSTE köras sist, efter att raderna
 *  satts i sin slutgiltiga (visnings-)ordning, annars blir sorteringen fel. */
function finalize(items: QuoteItem[]): QuoteItem[] {
  return items.map((item, idx) => ({ ...item, sort_order: idx }))
}

function sumItems(items: QuoteItem[]): number {
  return items.reduce((s, i) => s + i.total, 0)
}

function paymentPlan30_40_30(
  due2 = 'Vid halva arbetet',
  due3 = 'Vid godkänd slutbesiktning',
): PaymentPlanEntry[] {
  return [
    { label: 'Vid beställning', percent: 30, amount: 0, due_description: 'Vid signering av offert' },
    { label: 'Under arbetets gång', percent: 40, amount: 0, due_description: due2 },
    { label: 'Vid slutbesiktning', percent: 30, amount: 0, due_description: due3 },
  ]
}

export interface DefaultQuoteTemplate {
  name: string
  description: string
  category: string
  default_items: QuoteItem[]
  default_payment_plan: PaymentPlanEntry[]
  rot_enabled: boolean
  rut_enabled: boolean
}

// ─── Branschnyckel-normalisering ────────────────────────────────────────
// Onboarding-rymden (app/onboarding/constants.ts) är sanningen. Gamla/
// inkonsekventa nycklar som förekommit i äldre kod behålls som alias.
const BRANCH_ALIASES: Record<string, string> = {
  bygg: 'construction',
  snickeri: 'carpenter',
  el: 'electrician',
  vvs: 'plumber',
  maleri: 'painter',
}

export function normalizeTemplateBranch(branch?: string | null): string {
  if (!branch) return 'other'
  return BRANCH_ALIASES[branch] || branch
}

// ─── ALLROUND (seedas till alla branscher) ─────────────────────────────

function allroundTemplates(): DefaultQuoteTemplate[] {
  const enkelOffert: DefaultQuoteTemplate = {
    name: 'Enkel offert',
    description: 'Offert avseende överenskommet arbete enligt nedan.',
    category: 'Allmänt',
    default_items: finalize([
      line('Arbetskostnad', 8, 'tim', 650),
      line('Material', 1, 'st', 3000),
      line('Servicebil/framkörning', 1, 'st', 450),
    ]),
    default_payment_plan: [],
    rot_enabled: false,
    rut_enabled: false,
  }

  const forberedelser = [line('Etablering, skydd och täckning', 4, 'tim', 650, { group_name: 'Förberedelser', rot_rut_type: 'rot' })]
  const utforande = [
    line('Arbete enligt beskrivning', 24, 'tim', 650, { group_name: 'Utförande', rot_rut_type: 'rot' }),
    line('Material', 1, 'st', 12000, { group_name: 'Utförande' }),
  ]
  const avslut = [
    line('Städning och bortforsling av byggavfall', 3, 'tim', 650, { group_name: 'Avslut', rot_rut_type: 'rot' }),
    line('Deponi-/återvinningsavgift', 1, 'st', 900, { group_name: 'Avslut' }),
  ]
  const detaljeradOffert: DefaultQuoteTemplate = {
    name: 'Detaljerad offert med grupper',
    description:
      'Offert avseende renoveringsarbete. Arbetet utförs fackmässigt enligt gällande branschregler. ROT-avdrag är avräknat på arbetskostnaden nedan.',
    category: 'Allmänt',
    default_items: finalize([
      heading('Förberedelser'),
      ...forberedelser,
      subtotal(sumItems(forberedelser), 'Förberedelser'),
      heading('Utförande'),
      ...utforande,
      subtotal(sumItems(utforande), 'Utförande'),
      heading('Avslut'),
      ...avslut,
      subtotal(sumItems(avslut), 'Avslut'),
    ]),
    default_payment_plan: paymentPlan30_40_30(),
    rot_enabled: true,
    rut_enabled: false,
  }

  const lopandeRakning: DefaultQuoteTemplate = {
    name: 'Löpande räkning',
    description:
      'Arbetet utförs på löpande räkning enligt nedan angivna á-priser. Faktisk tid och materialåtgång redovisas på fakturan.',
    category: 'Allmänt',
    default_items: finalize([
      line('Arbetstid, ordinarie (á-pris)', 1, 'tim', 650),
      line('Material debiteras med inköpspris + 15 % påslag', 1, 'st', 0),
      line('Servicebil/framkörning per tillfälle', 1, 'st', 450),
    ]),
    default_payment_plan: [],
    rot_enabled: false,
    rut_enabled: false,
  }

  return [enkelOffert, detaljeradOffert, lopandeRakning]
}

// ─── SNICKERI/BYGG (construction + carpenter) ──────────────────────────

function byggTemplates(): DefaultQuoteTemplate[] {
  const rivning = [
    line('Rivning av befintligt badrum inkl. bortforsling', 16, 'tim', 650, { group_name: 'Rivning och förberedelse', rot_rut_type: 'rot' }),
    line('Deponiavgift', 1, 'st', 2500, { group_name: 'Rivning och förberedelse' }),
  ]
  const tatskikt = [
    line('Uppbyggnad väggar/golv, fall till brunn', 32, 'tim', 650, { group_name: 'Bygg och tätskikt', rot_rut_type: 'rot' }),
    line('Tätskiktsarbete enligt BBV', 16, 'tim', 650, { group_name: 'Bygg och tätskikt', rot_rut_type: 'rot' }),
    line('Byggmaterial (skivor, flytspackel, tätskikt)', 1, 'st', 18000, { group_name: 'Bygg och tätskikt' }),
  ]
  const ytskikt = [
    line('Plattsättning golv och väggar', 32, 'tim', 650, { group_name: 'Ytskikt och montering', rot_rut_type: 'rot' }),
    line('Kakel och klinker', 1, 'st', 14000, { group_name: 'Ytskikt och montering' }),
    line('Montering porslin, blandare och inredning', 8, 'tim', 650, { group_name: 'Ytskikt och montering', rot_rut_type: 'rot' }),
  ]
  const badrum: DefaultQuoteTemplate = {
    name: 'Badrumsrenovering',
    description:
      'Totalrenovering av badrum inkl. rivning, tätskikt, ytskikt och montering. Arbetet utförs enligt Byggkeramikrådets branschregler (BBV) med kvalitetsdokument. ROT-avdrag avräknat på arbetskostnaden.',
    category: 'Badrum',
    default_items: finalize([
      heading('Rivning och förberedelse'),
      ...rivning,
      subtotal(sumItems(rivning), 'Rivning och förberedelse'),
      heading('Bygg och tätskikt'),
      ...tatskikt,
      subtotal(sumItems(tatskikt), 'Bygg och tätskikt'),
      heading('Ytskikt och montering'),
      ...ytskikt,
      subtotal(sumItems(ytskikt), 'Ytskikt och montering'),
      option('Golvvärme (elburen) inkl. installation', 1, 'st', 8500),
      option('Spotlights i tak, 4 st inkl. installation', 1, 'st', 4800),
    ]),
    default_payment_plan: paymentPlan30_40_30('Efter tätskikt', 'Vid slutbesiktning'),
    rot_enabled: true,
    rut_enabled: false,
  }

  const kok: DefaultQuoteTemplate = {
    name: 'Köksrenovering',
    description:
      'Renovering av kök: demontering av befintligt kök, montering av ny köksinredning, anpassningar av el och VVS samt ytskikt. ROT-avdrag avräknat på arbetskostnaden. Vitvaror och köksstommar ingår ej om inget annat anges.',
    category: 'Kök',
    default_items: finalize([
      line('Demontering av befintligt kök inkl. bortforsling', 8, 'tim', 650, { rot_rut_type: 'rot' }),
      line('Montering av köksstommar, luckor och bänkskiva', 32, 'tim', 650, { rot_rut_type: 'rot' }),
      line('Kakel över bänk (stänkskydd)', 8, 'tim', 650, { rot_rut_type: 'rot' }),
      line('Material (skruv, list, silikon, kakel)', 1, 'st', 6500),
      option('Ny belysning under överskåp', 1, 'st', 3200),
    ]),
    default_payment_plan: [],
    rot_enabled: true,
    rut_enabled: false,
  }

  const altan: DefaultQuoteTemplate = {
    name: 'Altanbygge',
    description:
      'Nybyggnation av altan/trädäck i tryckimpregnerat virke enligt överenskommen ritning, inkl. plintar och bärlinor. ROT-avdrag avräknat på arbetskostnaden (gäller altan i anslutning till bostadshus).',
    category: 'Utomhus',
    default_items: finalize([
      line('Markarbete och plintsättning', 12, 'tim', 650, { rot_rut_type: 'rot' }),
      line('Stomme, reglar och trall', 28, 'tim', 650, { rot_rut_type: 'rot' }),
      line('Virke och beslag', 1, 'st', 22000),
      line('Plintar och grus', 1, 'st', 3500),
      option('Räcke, ca 10 löpmeter', 1, 'st', 12000),
      option('Trappa, 3–4 steg', 1, 'st', 5500),
    ]),
    default_payment_plan: [],
    rot_enabled: true,
    rut_enabled: false,
  }

  return [badrum, kok, altan, enkelReparationTemplate()]
}

// "Enkel reparation" delas mellan bygg/snickeri och måleri (painter får den
// också, per mallbank-innehall.md-regel 1) — egen liten byggare så den
// slipper dupliceras källkodsmässigt.
function enkelReparationTemplate(): DefaultQuoteTemplate {
  return {
    name: 'Enkel reparation',
    description: 'Reparationsarbete enligt överenskommelse. ROT-avdrag avräknat på arbetskostnaden.',
    category: 'Allmänt',
    default_items: finalize([
      line('Arbetstid', 4, 'tim', 650, { rot_rut_type: 'rot' }),
      line('Material', 1, 'st', 800),
      line('Servicebil/framkörning', 1, 'st', 450),
    ]),
    default_payment_plan: [],
    rot_enabled: true,
    rut_enabled: false,
  }
}

// ─── EL (electrician) ───────────────────────────────────────────────────

function elTemplates(): DefaultQuoteTemplate[] {
  const elcentral: DefaultQuoteTemplate = {
    name: 'Byte av elcentral',
    description:
      'Byte av befintlig elcentral till ny normcentral med jordfelsbrytare och automatsäkringar. Arbetet utförs av behörig elektriker och dokumenteras. ROT-avdrag avräknat på arbetskostnaden.',
    category: 'Elinstallation',
    default_items: finalize([
      line('Demontering av befintlig central samt installation av ny', 8, 'tim', 750, { rot_rut_type: 'rot' }),
      line('Normcentral inkl. jordfelsbrytare och automatsäkringar', 1, 'st', 6500),
      line('Installationsmaterial', 1, 'st', 1200),
      line('Kontroll, märkning och dokumentation', 2, 'tim', 750, { rot_rut_type: 'rot' }),
    ]),
    default_payment_plan: [],
    rot_enabled: true,
    rut_enabled: false,
  }

  const belysning: DefaultQuoteTemplate = {
    name: 'Belysningsinstallation',
    description:
      'Installation av ny belysning enligt överenskommelse, inkl. dragning av ny ledning och montering av armaturer. ROT-avdrag avräknat på arbetskostnaden.',
    category: 'Elinstallation',
    default_items: finalize([
      line('Installation och inkoppling', 6, 'tim', 750, { rot_rut_type: 'rot' }),
      line('Kabel och installationsmaterial', 1, 'st', 1800),
      option('Dimmerfunktion, per punkt', 1, 'st', 950),
    ]),
    default_payment_plan: [],
    rot_enabled: true,
    rut_enabled: false,
  }

  // Grön teknik (laddpunkt) — HELA radtotalen (arbete + material) är underlag
  // för avdraget, till skillnad från ROT. Alla tre rader taggas därför
  // rot_rut_type: 'gron_laddpunkt', inte bara arbetsraden.
  const laddbox: DefaultQuoteTemplate = {
    name: 'Laddbox för elbil',
    description:
      'Installation av laddbox för elbil inkl. ny gruppledning från elcentral, jordfelsbrytare typ B och driftsättning. Skattereduktion för grön teknik (50 % av arbete och material) avräknas direkt på fakturan.',
    category: 'Grön teknik',
    default_items: finalize([
      line('Installation av laddbox och gruppledning', 6, 'tim', 750, { rot_rut_type: 'gron_laddpunkt' }),
      line('Laddbox 11 kW', 1, 'st', 9500, { rot_rut_type: 'gron_laddpunkt' }),
      line('Kabel, jordfelsbrytare och installationsmaterial', 1, 'st', 2800, { rot_rut_type: 'gron_laddpunkt' }),
    ]),
    default_payment_plan: [],
    rot_enabled: false,
    rut_enabled: false,
  }

  const besiktning: DefaultQuoteTemplate = {
    name: 'Elbesiktning',
    description:
      'Besiktning av fastighetens elanläggning med protokoll. Fast pris. Eventuella åtgärder offereras separat efter besiktning.',
    category: 'Besiktning',
    default_items: finalize([line('Elbesiktning inkl. protokoll (fast pris)', 1, 'st', 4500)]),
    default_payment_plan: [],
    rot_enabled: false,
    rut_enabled: false,
  }

  return [elcentral, belysning, laddbox, besiktning]
}

// ─── VVS (plumber) ──────────────────────────────────────────────────────

function vvsTemplates(): DefaultQuoteTemplate[] {
  const badrumVvs: DefaultQuoteTemplate = {
    name: 'Badrum — VVS-installation',
    description:
      'VVS-arbeten vid badrumsrenovering: nya rördragningar för vatten och avlopp, montering av golvbrunn samt inkoppling av porslin och blandare. Utförs enligt Säker Vatten. ROT-avdrag avräknat på arbetskostnaden.',
    category: 'Badrum',
    default_items: finalize([
      line('Rivning och demontering av befintligt VVS', 6, 'tim', 750, { rot_rut_type: 'rot' }),
      line('Nya rördragningar vatten/avlopp', 16, 'tim', 750, { rot_rut_type: 'rot' }),
      line('Byte golvbrunn', 4, 'tim', 750, { rot_rut_type: 'rot' }),
      line('Rör- och installationsmaterial', 1, 'st', 8500),
      line('Montering porslin och blandare', 6, 'tim', 750, { rot_rut_type: 'rot' }),
    ]),
    default_payment_plan: [],
    rot_enabled: true,
    rut_enabled: false,
  }

  const blandare: DefaultQuoteTemplate = {
    name: 'Byte av blandare/WC',
    description:
      'Byte av blandare eller WC-stol inkl. demontering av befintlig och funktionskontroll. ROT-avdrag avräknat på arbetskostnaden. Produkt kan ingå enligt överenskommelse eller tillhandahållas av kund.',
    category: 'Service',
    default_items: finalize([
      line('Demontering och montering', 2, 'tim', 750, { rot_rut_type: 'rot' }),
      line('Installationsmaterial (packningar, anslutningar)', 1, 'st', 400),
      line('Servicebil/framkörning', 1, 'st', 450),
    ]),
    default_payment_plan: [],
    rot_enabled: true,
    rut_enabled: false,
  }

  const akut: DefaultQuoteTemplate = {
    name: 'Akutjobb VVS',
    description:
      'Akut utryckning för vattenläcka eller stopp. Debitering enligt á-priser nedan; faktisk tid redovisas på fakturan. Vid akuta läckage: stäng huvudkranen i väntan på ankomst.',
    category: 'Service',
    default_items: finalize([
      line('Utryckningsavgift (inkl. första timmen)', 1, 'st', 1900),
      line('Arbetstid därefter (á-pris)', 1, 'tim', 950),
      line('Material debiteras löpande med påslag', 1, 'st', 0),
    ]),
    default_payment_plan: [],
    rot_enabled: false,
    rut_enabled: false,
  }

  // RÄTTAT mot arkitektrapporten: värmepump är ROT (30 % på arbetet), INTE
  // grön teknik — grön teknik omfattar endast solceller/lagring/laddpunkt.
  const varmepump: DefaultQuoteTemplate = {
    name: 'Värmepumpsinstallation (luft/vatten)',
    description:
      'Installation av luft/vattenvärmepump inkl. demontering av befintlig värmekälla, inkoppling mot värmesystem och driftsättning. ROT-avdrag avräknat på arbetskostnaden.',
    category: 'Värme',
    default_items: finalize([
      line('Installation och inkoppling', 24, 'tim', 750, { rot_rut_type: 'rot' }),
      line('Värmepump inkl. inomhusdel', 1, 'st', 85000),
      line('Rör, el- och installationsmaterial', 1, 'st', 7500),
      line('Driftsättning och injustering', 4, 'tim', 750, { rot_rut_type: 'rot' }),
    ]),
    default_payment_plan: [],
    rot_enabled: true,
    rut_enabled: false,
  }

  return [badrumVvs, blandare, akut, varmepump]
}

// ─── MÅLERI (painter) ────────────────────────────────────────────────────

function maleriTemplates(): DefaultQuoteTemplate[] {
  const malningInomhus: DefaultQuoteTemplate = {
    name: 'Målning inomhus',
    description:
      'Målning av väggar och tak inomhus: spackling, slipning, grundning och två strykningar med kvalitetsfärg. ROT-avdrag avräknat på arbetskostnaden. Kulör enligt överenskommelse.',
    category: 'Måleri',
    default_items: finalize([
      line('Skydd, täckning och förarbete (spackling/slipning)', 8, 'tim', 550, { rot_rut_type: 'rot' }),
      line('Målning väggar och tak, två strykningar', 16, 'tim', 550, { rot_rut_type: 'rot' }),
      line('Färg och spackel', 1, 'st', 3500),
      option('Målning snickerier (dörrar/foder/lister)', 8, 'tim', 550, { rot_rut_type: 'rot' }),
    ]),
    default_payment_plan: [],
    rot_enabled: true,
    rut_enabled: false,
  }

  const fasadmalning: DefaultQuoteTemplate = {
    name: 'Fasadmålning',
    description:
      'Fasadmålning: tvättning, skrapning, grundning och två strykningar. Ställning ingår enligt specifikation. ROT-avdrag avräknat på arbetskostnaden. Utförs vid lämplig väderlek.',
    category: 'Måleri',
    default_items: finalize([
      line('Fasadtvätt och skrapning', 16, 'tim', 550, { rot_rut_type: 'rot' }),
      line('Grundning och målning, två strykningar', 40, 'tim', 550, { rot_rut_type: 'rot' }),
      line('Färg och material', 1, 'st', 9500),
      line('Ställningshyra', 1, 'st', 8000),
    ]),
    default_payment_plan: [],
    rot_enabled: true,
    rut_enabled: false,
  }

  return [malningInomhus, fasadmalning]
}

// ─── Publikt API ──────────────────────────────────────────────────────

/**
 * Branschmappning: construction/carpenter → snickeri/bygg-mallar,
 * electrician → el-mallar, plumber → VVS-mallar, painter → måleri-mallar
 * (+ "Enkel reparation" från bygg-listan). Alla branscher (inkl. other/
 * okänd) får dessutom de tre allround-mallarna.
 */
export function getDefaultQuoteTemplates(branch?: string | null): DefaultQuoteTemplate[] {
  const normalized = normalizeTemplateBranch(branch)
  const allround = allroundTemplates()

  switch (normalized) {
    case 'construction':
    case 'carpenter':
      return [...allround, ...byggTemplates()]
    case 'electrician':
      return [...allround, ...elTemplates()]
    case 'plumber':
      return [...allround, ...vvsTemplates()]
    case 'painter':
      return [...allround, ...maleriTemplates(), enkelReparationTemplate()]
    default:
      return allround
  }
}

/**
 * Alla mallnamn som kan seedas, oavsett bransch — används för att undanta
 * seed-mallar från plan-kvoten i /api/quote-templates (POST) utan ny
 * DB-kolumn: en mall räknas mot kvoten endast om dess namn INTE matchar
 * något av dessa (se app/api/quote-templates/route.ts).
 */
export function getAllDefaultTemplateNames(): string[] {
  const names = new Set<string>()
  for (const t of allroundTemplates()) names.add(t.name)
  for (const t of byggTemplates()) names.add(t.name)
  for (const t of elTemplates()) names.add(t.name)
  for (const t of vvsTemplates()) names.add(t.name)
  for (const t of maleriTemplates()) names.add(t.name)
  return Array.from(names)
}
