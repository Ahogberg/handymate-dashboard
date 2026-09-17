import type { QuoteItem, QuoteTemplate } from '@/lib/types/quote'
import { resolveTemplateItemPrices, type TemplatePricingProduct } from './resolve-template-item-prices'

/**
 * Fyll på från jobbtyp (2026-09-17, Andreas).
 *
 * Första jobbtypsvalet på en tom offert ERSÄTTER raderna (handleNewTemplateSelect).
 * Det här är det andra valet: badrummet ligger redan i offerten, nu ska elen
 * in under det. Raderna LÄGGS TILL under en rubrikrad med jobbtypens namn, så
 * kunden läser offerten som "Badrum" och "El" — två sektioner, inte en lång
 * lista där ingen ser var det ena slutar.
 *
 * Ren funktion, ingen React och ingen DB: den bygger bara raderna. Anroparen
 * lägger dem sist med en funktionell setItems, så påfyllningen är oberoende
 * av vad som hände med offerten under hämtningen — ordning spelar ingen roll
 * för ett tillägg, till skillnad från en ersättning.
 *
 * Priserna går genom SAMMA resolver som varje annan mallstart: mallens
 * belopp betyder ingenting för det här företaget (Fas 1.7). Titel,
 * beskrivning, betalplan och villkor rörs INTE — de tillhör det första
 * upplägget, och en påfyllning har ingen rätt att skriva om dem.
 */
export function byggPafyllnadsrader(
  template: Pick<QuoteTemplate, 'default_items'>,
  jobbtypNamn: string,
  products: TemplatePricingProduct[],
  hourlyRate: number | null | undefined,
  fran: number,
  nyttId: () => string,
): QuoteItem[] {
  const rader = Array.isArray(template.default_items) ? template.default_items : []
  if (rader.length === 0) return []

  const rubrik: QuoteItem = {
    id: nyttId(),
    item_type: 'heading',
    description: jobbtypNamn,
    group_name: jobbtypNamn,
    quantity: 0,
    unit: 'st',
    unit_price: 0,
    total: 0,
    is_rot_eligible: false,
    is_rut_eligible: false,
    sort_order: fran,
  }

  const klonade: QuoteItem[] = rader.map((item, idx) => ({
    ...item,
    item_type: item.item_type || 'item',
    id: nyttId(),
    // Jobbtypens namn på varje rad, inte bara rubriken: dokumentet grupperar
    // på group_name, och en rad utan grupp hamnar utanför sin sektion.
    group_name: jobbtypNamn,
    sort_order: fran + 1 + idx,
    total: (item.item_type || 'item') === 'item' ? item.quantity * item.unit_price : item.total,
  }))

  return [rubrik, ...resolveTemplateItemPrices(klonade, products, hourlyRate)]
}
