import { QuoteItem, PaymentPlanEntry, QuoteTotals, RotRutType } from '@/lib/types/quote'
import { estimateHours, splitAmount, type SnapshotComponent } from '@/lib/products/build-item-snapshot'
import { rotRutDeductionInclVat, gronTeknikDeductionInclVat } from '@/lib/rot-rut'

/**
 * Get the effective ROT/RUT type for an item.
 * Prefers rot_rut_type dropdown value, falls back to boolean flags.
 */
export function getItemRotRutType(item: QuoteItem): RotRutType {
  if (item.rot_rut_type !== undefined) return item.rot_rut_type
  if (item.is_rot_eligible) return 'rot'
  if (item.is_rut_eligible) return 'rut'
  return null
}

/**
 * Set rot_rut_type and sync boolean flags for backward compatibility.
 */
export function setItemRotRut(item: QuoteItem, type: RotRutType): QuoteItem {
  return {
    ...item,
    rot_rut_type: type,
    is_rot_eligible: type === 'rot',
    is_rut_eligible: type === 'rut',
  }
}

/**
 * Global ROT-toggle (ETAPP 1c-i, offert-masterplan.md): tidigare satte
 * QuoteEditRotSection.toggle() bara `is_rot_eligible` direkt på items,
 * UTAN att gå via setItemRotRut — det satte varken `rot_rut_type` (F1:s
 * enda källa, getItemRotRutType läser den FÖRST) eller nollställde
 * `is_rut_eligible`. En rad som redan var RUT kunde därför bli BÅDE
 * ROT och RUT samtidigt (desync mellan de tre fälten).
 *
 * Denna rena funktion är den enda källan för global-togglens mappning:
 * - PÅ: 'tim'-rader av item_type 'item' som SAKNAR avdragstyp (rot_rut_type
 *   null/undefined och ingen boolean redan satt) får 'rot'. Rader som redan
 *   har en avdragstyp (t.ex. RUT eller grön teknik satt manuellt per rad)
 *   rörs INTE — global-togglen ska bara fylla i det som är tomt.
 * - AV: rader vars EFFEKTIVA typ är 'rot' (getItemRotRutType) nollställs
 *   till null. RUT- och grön teknik-rader rörs ALDRIG av ROT-togglen,
 *   i vare sig riktning.
 */
export function applyGlobalRotToggle(items: QuoteItem[], on: boolean): QuoteItem[] {
  return items.map(item => {
    if (item.item_type !== 'item') return item
    const current = getItemRotRutType(item)
    if (on) {
      if (current !== null && current !== undefined) return item
      if (item.unit !== 'tim') return item
      return setItemRotRut(item, 'rot')
    }
    if (current !== 'rot') return item
    return setItemRotRut(item, null)
  })
}

/**
 * Global avdrags-kontroll (offert-feedback 2026-08-04, Andreas skarpa test,
 * punkt 5): den globala ROT-togglen ovan förstås till en trevägs
 * "Inget avdrag / ROT / RUT"-kontroll i summeringen. SAMMA försiktiga
 * semantik som applyGlobalRotToggle — bara utökad till att gälla båda
 * avdragstyperna symmetriskt:
 * - Väljer man 'rot' eller 'rut': tomma ('tim'-rader utan avdragstyp) fylls
 *   med den valda typen. Rader av den ANDRA avdragstypen (den man lämnar)
 *   nollställs. Rader som redan har den VALDA typen rörs inte (no-op).
 * - Väljer man null ("Inget avdrag"): både ROT- och RUT-rader nollställs.
 * - Grön teknik rörs ALDRIG i någon riktning — precis som badgens klick-
 *   cykel (RotBadge/onItemRotRutCycle) redan respekterar.
 * - Endast item_type 'item' påverkas (rubrik/delsumma/rabatt/tillval/text
 *   har ingen avdragstyp att sätta).
 */
export function applyGlobalDeductionType(items: QuoteItem[], type: 'rot' | 'rut' | null): QuoteItem[] {
  return items.map(item => {
    if (item.item_type !== 'item') return item
    const current = getItemRotRutType(item)
    const isGron = current === 'gron_solceller' || current === 'gron_lagring' || current === 'gron_laddpunkt'
    if (isGron) return item

    if (type === null) {
      if (current === 'rot' || current === 'rut') return setItemRotRut(item, null)
      return item
    }

    const other: RotRutType = type === 'rot' ? 'rut' : 'rot'
    if (current === other) return setItemRotRut(item, null)
    if ((current === null || current === undefined) && item.unit === 'tim') return setItemRotRut(item, type)
    return item
  })
}

/**
 * Tillvalsrad-specifika default-fält (B5, kodrevision 2026-08-03): en rad
 * med item_type 'option' behöver option_selected/option_default explicit
 * satta till false (v66-schemat, sql/v66_quote_option_rows.sql) — AI-
 * föreslagna tillval (convertLegacyItems i app/dashboard/quotes/new/
 * page.tsx) ska ALLTID starta avbockade och oförvalda; kunden väljer aktivt
 * till, aldrig förvalt. Extraherad hit (samma skäl som legacyItemRotRutType
 * ovan) så mappningen är facit-testbar utan att rendera sidan. No-op för
 * alla andra item_type.
 */
export function applyOptionRowDefaults(item: QuoteItem): QuoteItem {
  if (item.item_type !== 'option') return item
  return { ...item, option_selected: false, option_default: false }
}

/**
 * Ren mappning: legacy AI/mall-rad (type: labor/material/service) + en
 * föreslagen/satt avdragstyp → den ROT/RUT-typ raden faktiskt ska få.
 *
 * Kodrevision 2026-08-03 (Fix 1+2): `convertLegacyItems` i quotes/new och
 * quotes/[id]/edit satte tidigare `is_rot_eligible: item.type === 'labor'`
 * OBEROENDE av vad AI:n föreslagit — ett RUT-jobb (städ/trädgård) kunde få
 * kvarliggande ROT-flagga eftersom `getItemRotRutType` kollar ROT FÖRST, och
 * 'none' (nybygge/företag/lokal) ROT-flaggade ändå allt arbete. Denna
 * funktion är den enda källan till sanning för den mappningen — endast
 * 'labor'-rader kan bli ROT/RUT-berättigade, och bara när avdragstypen
 * faktiskt är 'rot' eller 'rut' ('none'/null/undefined ⇒ ingen avdragstyp).
 * Kombinera alltid med setItemRotRut() så att EXAKT en flagga sätts.
 */
export function legacyItemRotRutType(
  legacyType: 'labor' | 'material' | 'service',
  suggestedDeductionType: 'rot' | 'rut' | 'none' | null | undefined,
): RotRutType {
  if (legacyType !== 'labor') return null
  if (suggestedDeductionType === 'rot' || suggestedDeductionType === 'rut') return suggestedDeductionType
  return null
}

/**
 * Ren mappning: legacy-radens beskrivning + styckpris, med fallback mellan de
 * TVÅ fältformer en "legacy AI/mall-rad" kan komma i. `convertLegacyItems`
 * (app/dashboard/quotes/new/page.tsx + app/dashboard/quotes/[id]/edit/page.tsx)
 * läste tidigare BARA item.name/item.unit_price — men ai-generate
 * (lib/ai-quote-generator.ts, GeneratedQuoteItem) skickar description/
 * unitPrice, inte name/unit_price. Resultat: unit_price blev `undefined` för
 * AI-genererade rader och total = quantity * undefined = NaN, maskerat av
 * `quote: any`-typningen på anropssidan (bara "läkt" av att editorns egen
 * quantity×unit_price-omräkning körs om innan visning).
 *
 * Samma mappningsprincip som lib/quotes/generated-to-quote-items.ts
 * (mapGeneratedItemToQuoteItem): description/unitPrice PRIMÄRT (vad
 * ai-generate faktiskt skickar), name/unit_price som FALLBACK (mall-rader).
 * `?? 0`/`|| 0` på båda numeriska fälten — NaN får aldrig uppstå, även med
 * helt tomma/saknade fält.
 */
export function resolveLegacyItemFields(item: {
  name?: string | null
  description?: string | null
  quantity?: number | null
  unit_price?: number | null
  unitPrice?: number | null
}): { description: string; quantity: number; unitPrice: number } {
  return {
    description: item.description || item.name || '',
    quantity: item.quantity || 0,
    unitPrice: item.unitPrice ?? item.unit_price ?? 0,
  }
}

/**
 * Grön teknik-avdrag (Skatteverket 2026, Fas 1) — TRE kategorier, var och en
 * en % av HELA radtotalen (arbete + material) — TILL SKILLNAD FRÅN ROT/RUT
 * som bara räknar arbetsandelen. Ett tak på 50 000 kr/år, tillämpat per
 * offert i Fas 1 (årsvis tvär-offert-spårning är Fas 2, se rot-rut-limits.ts).
 */
export const GRON_TEKNIK_RATES: Record<'gron_solceller' | 'gron_lagring' | 'gron_laddpunkt', number> = {
  gron_solceller: 0.15,
  gron_lagring: 0.50,
  gron_laddpunkt: 0.50,
}
export const GRON_TEKNIK_MAX_PER_YEAR = 50_000

/**
 * Calculate all quote totals from structured items
 */
export function calculateQuoteTotals(
  items: QuoteItem[],
  discountPercent: number = 0,
  vatRate: number = 25
): QuoteTotals {
  // Tillvalsrader räknas ENDAST när kunden (eller Förvald) bockat i dem —
  // EN summa-sanning för editor, previews och serverns omräkning vid signering.
  const selectedOptions = items.filter(i => i.item_type === 'option' && i.option_selected === true)
  const regularItems = [...items.filter(i => i.item_type === 'item'), ...selectedOptions]
  const discountItems = items.filter(i => i.item_type === 'discount')

  // Sum by ROT/RUT eligibility
  let laborTotal = 0
  let materialTotal = 0
  let serviceTotal = 0
  let rotWorkCost = 0
  let rutWorkCost = 0
  let gronBase = 0
  let gronDeductionRaw = 0

  for (const item of regularItems) {
    const lineTotal = item.quantity * item.unit_price
    const rotRut = getItemRotRutType(item)
    // ROT/RUT-basen per rad: labor_amount (produktbankens arbetsandel, v67)
    // när den finns — `??`, ALDRIG `||`: 0 är GILTIGT (ren material → bas 0).
    // Rader utan labor_amount → hela radens total, exakt som tidigare.
    if (rotRut === 'rot') {
      laborTotal += lineTotal
      rotWorkCost += item.labor_amount ?? lineTotal
    } else if (rotRut === 'rut') {
      laborTotal += lineTotal
      rutWorkCost += item.labor_amount ?? lineTotal
    } else if (rotRut === 'gron_solceller' || rotRut === 'gron_lagring' || rotRut === 'gron_laddpunkt') {
      // Grön teknik-basen är HELA radtotalen (arbete + material) — inte
      // labor_amount. Raden flödar ändå in i labor/material-summan precis
      // som en otaggad rad, så subtotal/moms/total förblir oförändrade.
      if (item.unit === 'tim' || item.unit === 'hour' || item.unit === 'h') {
        laborTotal += lineTotal
      } else {
        materialTotal += lineTotal
      }
      gronBase += lineTotal
      gronDeductionRaw += lineTotal * GRON_TEKNIK_RATES[rotRut]
    } else if (item.unit === 'tim' || item.unit === 'hour' || item.unit === 'h') {
      laborTotal += lineTotal
    } else {
      materialTotal += lineTotal
    }
  }

  // Discount rows (negative amounts)
  const discountFromRows = discountItems.reduce((sum, item) => sum + Math.abs(item.total), 0)

  const subtotal = laborTotal + materialTotal + serviceTotal
  const discountAmount = subtotal * (discountPercent / 100) + discountFromRows
  const afterDiscount = subtotal - discountAmount
  const vat = afterDiscount * (vatRate / 100)
  const total = afterDiscount + vat

  // Skatteverket: avdraget räknas på arbetskostnaden INKLUSIVE moms, efter rabatt
  // (radpriserna ovan är exkl moms). discountFactor fångar både procentrabatt och
  // rabattrader proportionellt mot bruttosubtotalen.
  const discountFactor = subtotal > 0 ? afterDiscount / subtotal : 1

  // ROT: 30% avdrag (inkl moms), max 50 000 kr/person/år
  const rotDeduction = rotRutDeductionInclVat('rot', rotWorkCost, { vatRate, discountFactor })
  const rotCustomerPays = rotWorkCost > 0 ? total - rotDeduction : 0

  // RUT: 50% avdrag (inkl moms), max 75 000 kr/person/år
  const rutDeduction = rotRutDeductionInclVat('rut', rutWorkCost, { vatRate, discountFactor })
  const rutCustomerPays = rutWorkCost > 0 ? total - rutDeduction : 0

  // Grön teknik: 15/50% avdrag beroende på kategori (inkl moms), max 50 000 kr/år (per offert i Fas 1)
  const gronDeduction = gronTeknikDeductionInclVat(gronDeductionRaw, { vatRate, discountFactor })
  const gronCustomerPays = gronBase > 0 ? total - gronDeduction : 0

  const totalDeduction = rotDeduction + rutDeduction + gronDeduction
  const customerPaysAfterDeductions = total - totalDeduction

  return {
    laborTotal,
    materialTotal,
    serviceTotal,
    subtotal,
    discountAmount,
    afterDiscount,
    vat,
    total,
    rotWorkCost,
    rotDeduction,
    rotCustomerPays,
    rutWorkCost,
    rutDeduction,
    rutCustomerPays,
    gronBase,
    gronDeduction,
    gronCustomerPays,
    totalDeduction,
    customerPaysAfterDeductions,
  }
}

/**
 * Rad från publika GET:ens structured_items (quote_items-rad med nullbara
 * fält från databasen) — minsta form som klientsidans live-total behöver.
 */
export interface PublicStructuredItem {
  id: string
  item_type: string
  description?: string | null
  quantity?: number | null
  unit?: string | null
  unit_price?: number | null
  total?: number | null
  sort_order?: number
  is_rot_eligible?: boolean | null
  is_rut_eligible?: boolean | null
  rot_rut_type?: RotRutType
  option_selected?: boolean | null
  option_default?: boolean | null
  /** Produktbank (v67): arbetsandel i kr — 0 giltigt, null = legacy (hela totalen). */
  labor_amount?: number | null
  material_amount?: number | null
}

/**
 * Live-total för publika offertvyn och portalens signeringsmodal: mappar
 * structured_items + kundens aktuella tillvalsval till QuoteItem-form och kör
 * SAMMA calculateQuoteTotals som servern använder vid signering — semantik-
 * drift omöjlig. Klientens siffra är endast visning; servern räknar alltid
 * om själv och är enda skrivaren.
 */
export function calculatePublicQuoteTotals(
  items: PublicStructuredItem[],
  selectedOptionIds: Set<string>,
  discountPercent: number = 0,
  vatRate: number = 25
): QuoteTotals {
  const mapped: QuoteItem[] = items.map(it => ({
    id: it.id,
    item_type: it.item_type as QuoteItem['item_type'],
    description: it.description || '',
    quantity: it.quantity || 0,
    unit: it.unit || 'st',
    unit_price: it.unit_price || 0,
    total: it.total || 0,
    is_rot_eligible: it.is_rot_eligible || false,
    is_rut_eligible: it.is_rut_eligible || false,
    // null → undefined så getItemRotRutType faller tillbaka på boolean-
    // flaggorna för äldre rader där rot_rut_type aldrig sattes.
    rot_rut_type: it.rot_rut_type || undefined,
    // ?? (inte ||): labor_amount 0 = ren material och skall ge ROT-bas 0.
    labor_amount: it.labor_amount ?? null,
    material_amount: it.material_amount ?? null,
    sort_order: it.sort_order ?? 0,
    option_selected:
      it.item_type === 'option' ? selectedOptionIds.has(it.id) : it.option_selected === true,
    option_default: it.option_default === true,
  }))
  return calculateQuoteTotals(mapped, discountPercent, vatRate)
}

/**
 * Live-total för publika vyn i 'summary'/'rows'-läge, där à-priserna på
 * icke-tillvalsrader strippats ur nätverkssvaret (kunden ska inte se dem).
 *
 * Klienten kan då inte längre summera basen själv → servern skickar med
 * `base_totals` (motorkörning över alla ICKE-tillvalsrader). Här läggs kundens
 * valda tillval på. Tillvalsraderna behåller sina belopp i svaret, så vi kan
 * köra SAMMA motor över (bas-som-en-syntetisk-rad? nej) — i stället återskapas
 * en exakt totalsumma genom att räkna om ROT/RUT-cap på den kombinerade basen:
 *
 *   subtotal        = base.subtotal + Σ(valda tillvals ex-moms-rad)
 *   rot/rutWorkCost = base.*WorkCost + Σ(valda tillvals labor_amount ?? radtotal)
 *   moms/total/avdrag räknas om på den kombinerade basen (cap appliceras EN gång).
 *
 * Endast visning — servern räknar alltid om auktoritativt vid signering.
 */
export function calculatePublicQuoteTotalsFromBase(
  base: QuoteTotals,
  optionRows: PublicStructuredItem[],
  selectedOptionIds: Set<string>,
  discountPercent: number = 0,
  vatRate: number = 25,
): QuoteTotals {
  let laborTotal = base.laborTotal
  let materialTotal = base.materialTotal
  const serviceTotal = base.serviceTotal
  let rotWorkCost = base.rotWorkCost
  let rutWorkCost = base.rutWorkCost
  let gronBase = base.gronBase
  // base.gronDeduction är redan färdig-momsad/rabattfaktorerad/takad (post-fix).
  // Tillvalens tillskott är fortfarande rått (ex moms, bara satsen applicerad) —
  // momsa/rabattfaktorera det tillskottet likadant innan det adderas, och taka
  // EN gång på summan. Ev. drift jämfört med att räkna om hela rad-listan i ett
  // svep vid rabatt är acceptabel eftersom detta är ren visning — servern
  // räknar alltid om auktoritativt med hela radlistan vid signering.
  let optionGronRaw = 0

  for (const o of optionRows) {
    if (o.item_type !== 'option' || !selectedOptionIds.has(o.id)) continue
    const lineTotal = (o.quantity ?? 0) * (o.unit_price ?? 0)
    const rotRut = (o.rot_rut_type ?? undefined) || (o.is_rot_eligible ? 'rot' : o.is_rut_eligible ? 'rut' : null)
    if (rotRut === 'rot') {
      laborTotal += lineTotal
      rotWorkCost += o.labor_amount ?? lineTotal
    } else if (rotRut === 'rut') {
      laborTotal += lineTotal
      rutWorkCost += o.labor_amount ?? lineTotal
    } else if (rotRut === 'gron_solceller' || rotRut === 'gron_lagring' || rotRut === 'gron_laddpunkt') {
      if (o.unit === 'tim' || o.unit === 'hour' || o.unit === 'h') {
        laborTotal += lineTotal
      } else {
        materialTotal += lineTotal
      }
      gronBase += lineTotal
      optionGronRaw += lineTotal * GRON_TEKNIK_RATES[rotRut]
    } else if (o.unit === 'tim' || o.unit === 'hour' || o.unit === 'h') {
      laborTotal += lineTotal
    } else {
      materialTotal += lineTotal
    }
  }

  const subtotal = laborTotal + materialTotal + serviceTotal
  // base.discountAmount inkluderar redan ev. rabattraders belopp + procentrabatt
  // på bas-subtotalen. Räkna om procentdelen på den kombinerade subtotalen och
  // behåll bas-rabattradernas fasta del (base.discountAmount − procentdel på bas).
  const baseFixedDiscount = base.discountAmount - base.subtotal * (discountPercent / 100)
  const discountAmount = subtotal * (discountPercent / 100) + baseFixedDiscount
  const afterDiscount = subtotal - discountAmount
  const vat = afterDiscount * (vatRate / 100)
  const total = afterDiscount + vat

  // Samma momsregel som calculateQuoteTotals: avdraget är X % av arbetskostnaden
  // INKLUSIVE moms, efter rabatt. Ev. drift vid rabatt (jämfört med att räkna om
  // hela rad-listan i ett svep) är acceptabel eftersom detta är ren visning —
  // servern räknar alltid om auktoritativt med hela radlistan vid signering.
  const discountFactor = subtotal > 0 ? afterDiscount / subtotal : 1
  const rotDeduction = rotRutDeductionInclVat('rot', rotWorkCost, { vatRate, discountFactor })
  const rotCustomerPays = rotWorkCost > 0 ? total - rotDeduction : 0
  const rutDeduction = rotRutDeductionInclVat('rut', rutWorkCost, { vatRate, discountFactor })
  const rutCustomerPays = rutWorkCost > 0 ? total - rutDeduction : 0
  // base.gronDeduction är redan färdigberäknad (momsad/rabatterad/takad). Tillvalets
  // tillskott (rått, ex moms) momsas/rabattfaktoreras likadant och läggs på — taket
  // appliceras EN gång på den kombinerade summan.
  const optionGronInclVat = optionGronRaw * (1 + vatRate / 100) * discountFactor
  const gronDeduction = gronBase > 0
    ? Math.min(base.gronDeduction + optionGronInclVat, GRON_TEKNIK_MAX_PER_YEAR)
    : 0
  const gronCustomerPays = gronBase > 0 ? total - gronDeduction : 0

  const totalDeduction = rotDeduction + rutDeduction + gronDeduction
  const customerPaysAfterDeductions = total - totalDeduction

  return {
    laborTotal, materialTotal, serviceTotal, subtotal, discountAmount, afterDiscount,
    vat, total, rotWorkCost, rotDeduction, rotCustomerPays, rutWorkCost, rutDeduction, rutCustomerPays,
    gronBase, gronDeduction, gronCustomerPays, totalDeduction, customerPaysAfterDeductions,
  }
}

/**
 * Calculate subtotal for items above the subtotal row within the same group
 */
export function calculateSubtotal(items: QuoteItem[], subtotalIndex: number): number {
  const subtotalItem = items[subtotalIndex]
  if (!subtotalItem || subtotalItem.item_type !== 'subtotal') return 0

  let sum = 0
  // Walk backwards from the subtotal row
  for (let i = subtotalIndex - 1; i >= 0; i--) {
    const item = items[i]
    // Stop at another subtotal or heading in the same or different group
    if (item.item_type === 'subtotal') break
    if (item.item_type === 'heading') break
    // Only sum regular items and discounts
    if (item.item_type === 'item') {
      sum += item.quantity * item.unit_price
    } else if (item.item_type === 'discount') {
      sum -= Math.abs(item.total)
    }
  }
  return sum
}

/**
 * Fill in amount for each entry based on total and percent
 */
export function calculatePaymentPlan(total: number, plan: PaymentPlanEntry[]): PaymentPlanEntry[] {
  return plan.map(entry => ({
    ...entry,
    amount: Math.round((total * entry.percent / 100) * 100) / 100,
  }))
}

/**
 * Validate that payment plan percentages sum to 100%
 */
export function validatePaymentPlan(plan: PaymentPlanEntry[]): boolean {
  if (plan.length === 0) return true
  const sum = plan.reduce((s, entry) => s + entry.percent, 0)
  return Math.abs(sum - 100) < 0.01
}

/**
 * Generate a new QuoteItem ID
 */
export function generateItemId(): string {
  return 'qi_' + Math.random().toString(36).substr(2, 12)
}

/**
 * Create a default empty item of given type
 */
export function createDefaultItem(type: QuoteItem['item_type'], sortOrder: number = 0, groupName?: string): QuoteItem {
  const base: QuoteItem = {
    id: generateItemId(),
    item_type: type,
    group_name: groupName,
    description: '',
    quantity: 0,
    unit: 'st',
    unit_price: 0,
    total: 0,
    category_slug: undefined,
    is_rot_eligible: false,
    is_rut_eligible: false,
    sort_order: sortOrder,
  }

  switch (type) {
    case 'heading':
      return { ...base, description: 'Ny rubrik' }
    case 'text':
      return { ...base, description: '' }
    case 'subtotal':
      return { ...base, description: 'Delsumma' }
    case 'discount':
      return { ...base, description: 'Rabatt', unit: 'st', quantity: 1 }
    case 'option':
      // Tillvalsrad: som item men avbockad tills kunden (eller Förvald) väljer den
      return { ...base, quantity: 1, unit: 'st', option_selected: false, option_default: false }
    default:
      return { ...base, quantity: 1, unit: 'st' }
  }
}

/**
 * Recalculate all subtotal rows and item totals.
 *
 * Produktbank (v67): rader med component_snapshot och fryst labor_share
 * räknar om arbete/material-spliten + timmarna vid varje mängd/pris-ändring —
 * klient-side, från snapshotens per-enhets-data, utan API. `!== null/undefined`
 * (aldrig falsy-koll): labor_share 0 är GILTIG och ger labor_amount 0.
 * Rader utan snapshot (fritext, AI, legacy) passerar exakt som tidigare.
 */
export function recalculateItems(items: QuoteItem[]): QuoteItem[] {
  return items.map((item, index) => {
    // Option-rader beräknas som item (spread behåller option_selected/option_default)
    if (item.item_type === 'item' || item.item_type === 'option') {
      const total = item.quantity * item.unit_price
      const laborShare = item.component_snapshot?.labor_share
      if (laborShare !== null && laborShare !== undefined) {
        const { labor_amount, material_amount } = splitAmount(total, laborShare)
        const components: SnapshotComponent[] = item.component_snapshot?.components ?? []
        return {
          ...item,
          total,
          labor_amount,
          material_amount,
          estimated_hours: estimateHours(components, item.quantity),
        }
      }
      return { ...item, total }
    }
    if (item.item_type === 'discount') {
      // Discount: total is negative
      return { ...item, total: -(Math.abs(item.quantity) * Math.abs(item.unit_price)) }
    }
    if (item.item_type === 'subtotal') {
      return { ...item, total: calculateSubtotal(items, index) }
    }
    return item
  })
}
