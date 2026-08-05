/**
 * @deprecated Branschsortimentet ägs numera av lib/product-defaults.ts, som
 * genererar BÅDE produktbanken (`products`) och den gamla `price_list` ur
 * samma data. Tidigare fanns sortimentet bara här och seedades bara till
 * `price_list` — som offert-editorn och AI:n inte läser — så varje ny kund
 * fick en tom produktbank.
 *
 * Filen finns kvar som re-export så äldre importvägar inte bryts. Lägg ALDRIG
 * till artiklar här; lägg dem i lib/product-defaults.ts.
 */

export { getDefaultPriceList } from '@/lib/product-defaults'
export type { PriceListEntry } from '@/lib/product-defaults'
