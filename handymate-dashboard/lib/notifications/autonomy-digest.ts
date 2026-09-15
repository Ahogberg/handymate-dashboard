import { AUTONOMY_META, isAllowlistedKey } from '@/lib/autonomy/earned-autonomy'
export interface AutonomyDigestItem {
  kind: string
  title: string
  autonomy_key?: string | null
  mode?: string | null
  outcome?: string | null
}
export function autonomyDigest(items: AutonomyDigestItem[]): string[] {
  const lines: string[] = [],
    counts = new Map<string, number>()
  for (const item of items) {
    if (item.kind !== 'autonomy' || !isAllowlistedKey(item.autonomy_key))
      continue
    const meta = AUTONOMY_META[item.autonomy_key]
    if (item.mode === 'earned' && item.outcome === 'success') {
      counts.set(item.autonomy_key, (counts.get(item.autonomy_key) || 0) + 1)
      continue
    }
    const status =
      item.outcome === 'success'
        ? 'skickat'
        : item.outcome === 'skipped'
          ? 'pausat'
          : item.outcome === 'failed'
            ? 'misslyckades'
            : 'utfallet är inte bekräftat'
    lines.push(`${meta.agentName}: ${item.title} — ${status}.`)
  }
  for (const [key, n] of Array.from(counts)) {
    const meta = AUTONOMY_META[key as keyof typeof AUTONOMY_META]
    lines.push(`${meta.agentName}: ${n} ${meta.label} skickade.`)
  }
  return lines
}
