/**
 * Fas 1.7 (offert-omtaget, 2026-08-31) — mallradernas pris hör INTE till
 * mallförfattaren, det hör till FÖRETAGET.
 *
 * lib/quote-template-defaults.ts hårdkodar gissade priser rakt i seed-datan
 * (arbetsraders á-pris — 650/750/550 beroende på bransch — materialradernas
 * kronor, paketprisernas fasta belopp), och handleNewTemplateSelect
 * (QuoteBuilder.tsx) klonade dem oförändrade via en ren object-spread. Varje
 * företag fick Handymates gissning på varje "Använd en mall"-offert, aldrig
 * sin egen timkostnad eller sina egna artikelpriser — tyst, utan varning.
 * Den ÄLDRE legacy-mallvägen (handleTemplateSelect, mallar UTAN
 * `default_items`) använde tidigare samma dolda 650-kronorsreserv. Även den
 * vägen följer nu sanningsregeln: saknas företagspris blir raden prislös.
 *
 * Epic 2: en EXPLICIT linked_product_id prövas före alla tre kategorierna.
 * Ägarens val av artikel (även arbete) slår den generella timkostnaden.
 * Saknad artikel/enhet/pris ger prislös rad, aldrig en annan namnträff.
 * Följande legacy-regler gäller enbart rader UTAN explicit koppling:
 *
 *  1. Arbetsrader (unit 'tim') — ALLTID företagets `pricingSettings.hourly_rate`,
 *     aldrig mallens gissning, oavsett vilket tal mallen råkar ha. Saknas
 *     inställningen blir raden prislös och kräver granskning.
 *
 *  2. Materialrader (icke-tim, med ett gissat pris > 0) — försök koppla raden
 *     till en riktig artikel i företagets produktbank. Återanvänder EXAKT
 *     samma exakt+fuzzy-matchning som AI-offerter redan kör
 *     (lib/products/match-generated-items.ts) — ingen ny heuristik. En träff
 *     vars artikel HAR ett satt pris (lib/products/pricing-state.ts:
 *     priceState === 'satt') ärver det priset. En träff vars artikel själv är
 *     prislös, eller ingen träff alls, går till punkt 3.
 *
 *  3. Fasta paketpriser (t.ex. elbesiktningens "fast pris") — dessa har inget
 *     rimligt sätt att skalas mot timpriset och matchar sällan en artikel i
 *     banken (ingen hantverkare har "Elbesiktning inkl. protokoll" som en
 *     lagervara). De hamnar därför i SAMMA fålla som en omatchad materialrad:
 *     prislös tills bekräftad, exakt principen i lib/products/pricing-state.ts
 *     ("ett ogranskat gissat pris är sämre än inget pris"). UI-behandlingen
 *     är redan byggd — `ai_price_missing` ger amber-markering på prisfältet
 *     och "Spara i produktbanken"-nudgen så fort hantverkaren skriver in det
 *     riktiga priset (components/quotes/ItemRow.tsx). Fältet var tidigare
 *     dokumenterat som "sätts ENDAST vid AI-konvertering" — den här filen är
 *     det andra, medvetna undantaget (se uppdaterad kommentar i
 *     lib/types/quote.ts), inte en ny mekanism.
 *
 * Rader vars mallförfattare REDAN satte 0 kr med avsikt (t.ex. "Material
 * debiteras med inköpspris + 15 % påslag", "Material debiteras löpande med
 * påslag") rörs INTE — det är ingen gissning att rätta, det är redan
 * korrekt uttryckt som "pris bestäms senare".
 *
 * Ren funktion, muterar aldrig indata — facit-testad i
 * tests/resolve-template-item-prices.spec.ts.
 */
import type { QuoteItem } from '@/lib/types/quote'
import {
  matchGeneratedItem,
  buildProductHandles,
  type MatchableProduct,
} from '@/lib/products/match-generated-items'
import { priceState } from '@/lib/products/pricing-state'
import { sameUnit } from './job-type-setup'

/**
 * Strukturell delmängd av `ProductWithComponents`
 * (app/dashboard/quotes/_shared/applyProductToItem.ts) — bara det den här
 * filen faktiskt behöver, så den slipper importera typer från app/.
 * `ProductWithComponents[]` passerar rakt av (extra fält ignoreras).
 */
export interface TemplatePricingProduct {
  id: string
  name: string
  unit: string
  sales_price: number | null
}

function isPriceableItem(item: QuoteItem): boolean {
  return item.item_type === 'item' || item.item_type === 'option'
}

/**
 * Löser priset på en uppsättning klonade mallrader mot verkligheten:
 * företagets timpris, produktbankens artikelpriser, eller "prislös tills
 * bekräftad" när ingen av delarna ger ett riktigt svar.
 *
 * `hourlyRate` är företagets uttryckliga standardpris. null/undefined/0/
 * negativ betyder "ej satt" och ger en tydligt prislös rad — aldrig ett
 * Handymate-påhittat reservpris.
 */
export function resolveTemplateItemPrices(
  items: QuoteItem[],
  products: TemplatePricingProduct[],
  hourlyRate: number | null | undefined,
): QuoteItem[] {
  const matchable: MatchableProduct[] = products.map(p => ({ id: p.id, name: p.name, unit: p.unit }))
  const handles = buildProductHandles(matchable)
  const byId = new Map(products.map(p => [p.id, p]))
  const effectiveHourlyRate = Number.isFinite(hourlyRate) && Number(hourlyRate) > 0
    ? Number(hourlyRate)
    : null

  return items.map(item => {
    if (!isPriceableItem(item)) return item

    if (item.linked_product_id) {
      const selected = byId.get(item.linked_product_id)
      const compatible = selected && sameUnit(item.unit, selected.unit)
      const priced = compatible && Number.isFinite(selected.sales_price) && priceState(selected.sales_price) === 'satt'
      const unit_price = priced ? Number(selected.sales_price) : 0
      return {
        ...item, unit_price, total: item.quantity * unit_price, ai_price_missing: !priced,
        // En felaktig/inaktiv koppling får inte väcka fel produktreservation.
        linked_product_id: compatible ? selected.id : undefined,
      }
    }

    // 1) Arbetsrader — mallens gissade á-pris betyder ingenting, det är
    // alltid FÖRETAGETS timkostnad som gäller.
    if (item.unit === 'tim') {
      const unit_price = effectiveHourlyRate ?? 0
      return {
        ...item,
        unit_price,
        total: item.quantity * unit_price,
        ai_price_missing: effectiveHourlyRate === null,
      }
    }

    // Avsiktlig $0-rad ("pris bestäms löpande/senare") — det är redan
    // korrekt uttryckt, ingen gissning att rätta.
    if (!(item.unit_price > 0)) return item

    // 2+3) Material/paketpris — försök koppla till en riktig artikel med
    // samma matchare som AI-offerterna redan litar på.
    const match = matchGeneratedItem(
      { description: item.description, unit: item.unit },
      matchable,
      handles,
    )
    const product = match ? byId.get(match.productId) : undefined

    if (product && priceState(product.sales_price) === 'satt') {
      const unit_price = Number(product.sales_price)
      return {
        ...item,
        unit_price,
        total: item.quantity * unit_price,
        linked_product_id: product.id,
      }
    }

    // Ingen träff, eller träffen är själv en prislös artikel — hellre fråga
    // än gissa fel. Kopplingen sparas ändå om vi HADE en träff (samma regel
    // som applyProductToItem: en prislös artikel får förfylla kopplingen,
    // bara aldrig ett pris den inte har) så att "Spara i produktbanken"
    // senare uppdaterar RÄTT artikel istället för att skapa en dubblett.
    return {
      ...item,
      unit_price: 0,
      total: 0,
      ai_price_missing: true,
      ...(product ? { linked_product_id: product.id } : {}),
    }
  })
}
