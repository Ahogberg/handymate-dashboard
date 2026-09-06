/** A tab-local recovery copy, never proof of a server save. */
export interface RecoveryCopy<T> { version: 1; savedAt: number; value: T }
export function recoveryKey(userId: string, businessId: string, context: string) {
  return `handymate:quote-recovery:${JSON.stringify([userId,businessId,context])}`
}
export function readRecovery<T>(raw: string | null, now = Date.now()): RecoveryCopy<T> | null {
  if (!raw) return null
  const parsed = JSON.parse(raw)
  if (parsed?.version !== 1 || !Number.isFinite(parsed.savedAt) || now - parsed.savedAt > 86400000 || parsed.savedAt > now || !parsed.value || typeof parsed.value !== 'object') throw new Error('invalid recovery')
  return parsed
}
