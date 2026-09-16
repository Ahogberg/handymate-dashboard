function invalidShare(value: unknown): boolean {
  if (value === null) return false
  return typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1
}

export function invalidSharePair(labor: unknown, travel: unknown): boolean {
  if (invalidShare(labor) || invalidShare(travel)) return true
  return Number(labor ?? 0) + Number(travel ?? 0) > 1
}
