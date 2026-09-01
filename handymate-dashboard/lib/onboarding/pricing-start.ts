/**
 * Prisstarten i onboarding. Standardpriset är en uttrycklig reservkälla,
 * aldrig ett branschvärde eller ett mittvärde Handymate hittar på.
 */
export type WorkPricingModel = 'one_standard_rate' | 'job_type_rates' | 'fixed_or_mixed'

export function isWorkPricingModel(value: unknown): value is WorkPricingModel {
  return value === 'one_standard_rate' || value === 'job_type_rates' || value === 'fixed_or_mixed'
}

export function normalizeStandardHourlyRate(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number) || number <= 0 || number > 100_000) return null
  return Math.round(number * 100) / 100
}

export function pricingModelLabel(value: unknown): string | null {
  if (value === 'one_standard_rate') return 'Samma arbetspris för de flesta jobb'
  if (value === 'job_type_rates') return 'Arbetspris per jobbtyp'
  if (value === 'fixed_or_mixed') return 'Fasta priser eller blandad prissättning'
  return null
}
