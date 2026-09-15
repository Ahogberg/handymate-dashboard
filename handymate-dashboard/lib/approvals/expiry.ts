import { cardKind } from './card-kind'
export const expiryFor = (type: string): number | null =>
  cardKind(type) === 'notice' ? null : type === 'autonomy_offer' ? 14 : 7
export function expiryAt(type: string, createdAt = new Date()): string | null {
  const days = expiryFor(type)
  return days === null
    ? null
    : new Date(createdAt.getTime() + days * 86400000).toISOString()
}
