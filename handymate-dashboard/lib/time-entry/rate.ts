import { hourlyRateField } from '@/lib/company/company-model'

function positiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/**
 * Ett tomt timpris betyder "använd företagets/personens verkliga standard",
 * aldrig en hårdkodad gissning. Ett explicit timpris är redan slutpriset och
 * multipliceras därför inte en gång till vid redigering.
 */
export function resolveTimeEntryHourlyRate(input: {
  explicitRate: unknown
  userRate: unknown
  pricingSettings: Record<string, unknown> | null | undefined
  legacyDefaultRate: unknown
  workTypeMultiplier?: unknown
}): number | null {
  const explicitRate = positiveNumber(input.explicitRate)
  if (explicitRate !== null) return explicitRate

  const baseRate =
    positiveNumber(input.userRate) ??
    hourlyRateField(input.pricingSettings).value ??
    positiveNumber(input.legacyDefaultRate)

  if (baseRate === null) return null

  const multiplier = positiveNumber(input.workTypeMultiplier) ?? 1
  return Math.round(baseRate * multiplier * 100) / 100
}

