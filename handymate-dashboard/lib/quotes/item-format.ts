import { formatKronor } from '@/lib/format-price'

/**
 * Offertradens delade format: enheterna och kronor.
 *
 * RIVNINGEN PAKET A (2026-09-17): låg tidigare i components/quotes/ItemRow.tsx,
 * alltså inuti listvyns radkomponent. När listvyn togs bort (dokumentet är enda
 * radeditorn) hade de här följt med i fallet — men dokumentraden och radbladet
 * läser samma enhetslista, och enheterna MÅSTE vara identiska på alla ytor: en
 * rad med "m2" i en vy och "m²" i en annan matchar inte artikelkopplingens
 * sameUnit och därmed inte heller frågeflödets mängdregel.
 *
 * Ingen React här med flit, så både komponenter och rena facit kan läsa den.
 * ITEM_TYPE_STYLES och ITEM_TYPE_BADGE följde INTE med: de var listvyns egen
 * radfärgning och hade ingen läsare utanför den.
 */
export const UNIT_OPTIONS = [
  { value: 'st', label: 'st' },
  { value: 'tim', label: 'tim' },
  { value: 'm', label: 'm' },
  { value: 'm2', label: 'm²' },
  { value: 'lm', label: 'lm' },
  { value: 'kg', label: 'kg' },
  { value: 'pauschal', label: 'pauschal' },
]

export function formatCurrency(amount: number) {
  return formatKronor(amount)
}
