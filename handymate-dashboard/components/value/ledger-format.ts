/**
 * Delade formathjälpare för Value Ledger-ytan (Etapp B, 2026-08-17).
 * Bara presentation — all härledning bor i lib/value/ledger.ts.
 */

const MANADER = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
] as const

/** 'ÅÅÅÅ-MM' → 'AUGUSTI 2026' (hero-eyebrown). */
export function periodTitel(period: string): string {
  const [ar, man] = period.split('-')
  const idx = Number(man) - 1
  const namn = MANADER[idx] || period
  return `${namn.toUpperCase()} ${ar}`
}

/** 'ÅÅÅÅ-MM' → 'Augusti' (rubrikbruk). */
export function periodManad(period: string): string {
  const idx = Number(period.split('-')[1]) - 1
  const namn = MANADER[idx] || period
  return namn.charAt(0).toUpperCase() + namn.slice(1)
}

/** 'ÅÅÅÅ-MM' → 'aug' (stapeletiketter). */
export function periodKort(period: string): string {
  const idx = Number(period.split('-')[1]) - 1
  return (MANADER[idx] || period).slice(0, 3)
}

/** ISO-tidsstämpel → '4 aug' (radernas meta och Betald-pillen). */
export function kortDatum(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getUTCDate()} ${MANADER[d.getUTCMonth()]?.slice(0, 3) || ''}`
}

/** Svenska etiketter för ledgerns fem korttyper — aldrig tekniska termer i UI. */
export const KORTTYP_ETIKETT: Record<string, string> = {
  profitability_warning: 'Lönsamhetsvarning',
  create_ata_draft: 'ÄTA-utkast',
  missad_intakt: 'Missad intäkt',
  fakturera_projekt: 'Projektfakturering',
  invoice_reminder: 'Fakturapåminnelse',
}
