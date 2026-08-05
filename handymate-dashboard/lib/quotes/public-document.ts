import type { QuoteTemplateData, QuoteTemplateItem } from '@/lib/quote-templates/types'
import type { QuoteTotals } from '@/lib/types/quote'

/**
 * ETAPP 5 (offert-masterplan.md): rena, testbara transformer för den publika
 * kundvyns dokumentdata (app/quote/[token]/page.tsx). Ligger utanför
 * 'use client'-sidan så logiken är facit-testbar utan att rendera React.
 */

/**
 * Publikt GET-svar (app/api/quotes/public/[token]/route.ts): templateData
 * byggs via buildQuoteTemplateData som INTE stripper à-pris/antal ur
 * `quote.items` för displayLevel 'rows' (mallarna döljer kolumnerna via
 * showQuantities/showUnitPrices-flaggorna, men de RÅ värdena finns kvar i
 * objektet). Servern får aldrig serialisera dem till klienten som JSON i det
 * läget — 'rows' betyder uttryckligen "kunden ska inte se à-pris/antal".
 * Nollställer därför de fälten på icke-tillvalsrader innan objektet skickas
 * som JSON. HTML-strängrenderingen (Premium/Friendly, samma route) påverkas
 * INTE av denna funktion — där styr showQuantities/showUnitPrices redan vad
 * som skrivs ut i markupen, ingen separat sanering behövs.
 */
export function sanitizeTemplateDataForPublic(data: QuoteTemplateData): QuoteTemplateData {
  // Dolda rader (v90) måste bort ur SJÄLVA DATAT, inte bara ur renderingen.
  // Renderarna hoppar över dem, men objektet serialiseras också som JSON till
  // klienten — en kund som öppnar devtools kunde annars läsa beskrivning och
  // belopp på en rad hantverkaren uttryckligen dolt. Löftet "syns inte för
  // kunden" måste hålla mot verktygen, inte bara mot ögat.
  //
  // Totalerna påverkas inte: de är färdigräknade fält på data.quote
  // (subtotalExVat/totalIncVat/…) som byggts ur den OFILTRERADE radlistan —
  // den dolda radens pris ingår i summan precis som avsett.
  const visibleItems = data.quote.items.filter(item => !item.isHidden)

  if (data.displayLevel !== 'rows') {
    if (visibleItems.length === data.quote.items.length) return data
    return { ...data, quote: { ...data.quote, items: visibleItems } }
  }

  return {
    ...data,
    quote: {
      ...data.quote,
      items: visibleItems.map(item =>
        item.itemType === 'option' ? item : { ...item, quantity: 0, unitPrice: 0 },
      ),
    },
  }
}

/**
 * Kundens tillvalsval i den publika vyn (ETAPP 5, punkt 3) ska uppdatera
 * HELA Modern-dokumentet — inte bara kryssrutan i "Anpassa din
 * offert"-kortet. Ren funktion: tar serverns templateData (kundens
 * INITIALA val) + kundens AKTUELLA val (id-set) + live-totalen (SAMMA
 * calculatePublicQuoteTotals(FromBase)-motor som redan driver
 * totalsumman i tillvalskortet, se lib/quote-calculations.ts) och
 * returnerar en NY QuoteTemplateData där items[].optionSelected och
 * summeringsfälten speglar valet.
 *
 * Endast visning — servern räknar alltid om auktoritativt vid signering
 * (app/api/quotes/public/[token]/route.ts POST). Rader utan id (rubriker/
 * fritext/delsummor/rabatter) lämnas orörda.
 */
export function applyLiveSelectionToTemplateData(
  data: QuoteTemplateData,
  selectedOptionIds: Set<string>,
  totals: QuoteTotals,
): QuoteTemplateData {
  const items: QuoteTemplateItem[] = data.quote.items.map(item =>
    item.itemType === 'option' && item.id
      ? { ...item, optionSelected: selectedOptionIds.has(item.id) }
      : item,
  )
  return {
    ...data,
    quote: {
      ...data.quote,
      items,
      subtotalExVat: totals.subtotal,
      vatAmount: totals.vat,
      totalIncVat: totals.total,
      rotDeduction: totals.rotDeduction > 0 ? totals.rotDeduction : undefined,
      rutDeduction: totals.rutDeduction > 0 ? totals.rutDeduction : undefined,
      gronDeduction: totals.gronDeduction > 0 ? totals.gronDeduction : undefined,
      amountToPay: totals.customerPaysAfterDeductions,
    },
  }
}
