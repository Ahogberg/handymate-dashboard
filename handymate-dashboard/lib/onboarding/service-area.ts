/** Convert persisted JSONB service areas to the onboarding text field. */
export function normalizeOnboardingServiceArea(value: unknown): string {
  if (typeof value === 'string') return value
  const values = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && 'values' in value
      ? value.values
      : null
  if (!Array.isArray(values)) return ''
  return values.filter((item): item is string => typeof item === 'string')
    .map(item => item.trim()).filter(Boolean).join(', ')
}
