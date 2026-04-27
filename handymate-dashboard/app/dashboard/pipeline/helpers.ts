// Pipeline-vyns delade hjälpfunktioner — rena och utan sidoeffekter.

export function formatValue(v: number | null | undefined): string {
  if (v == null || v === 0) return '0 kr'
  return `${v.toLocaleString('sv-SE')} kr`
}

export function formatValueCompact(v: number | null | undefined): string {
  if (v == null || v === 0) return '0 kr'
  if (v >= 1000000) return `${(v / 1000000).toFixed(1).replace('.0', '')}M kr`
  if (v >= 1000) return `${Math.round(v / 1000)}k kr`
  return `${v} kr`
}

export function formatColumnValue(v: number): string {
  if (v === 0) return '0 kr'
  if (v >= 1000000) return `${(v / 1000000).toFixed(1).replace('.0', '')}M kr`
  if (v >= 1000) return `${Math.round(v / 1000)}k kr`
  return `${v} kr`
}

export function timeAgo(date: string): string {
  const now = new Date()
  const d = new Date(date)
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  const diffWeek = Math.floor(diffDay / 7)

  if (diffMin < 1) return 'just nu'
  if (diffMin < 60) return `${diffMin} min`
  if (diffHour < 24) return `${diffHour}h`
  if (diffDay < 7) return `${diffDay}d`
  if (diffWeek < 5) return `${diffWeek}v`
  return `${Math.floor(diffDay / 30)} mån`
}

export function getPriorityDot(p: string): string {
  switch (p) {
    case 'urgent': return 'bg-red-500'
    case 'high': return 'bg-orange-500'
    case 'medium': return 'bg-yellow-400'
    case 'low': return 'bg-green-400'
    default: return 'bg-gray-300'
  }
}

export function getPriorityLabel(p: string): string {
  switch (p) {
    case 'urgent': return 'Brådskande'
    case 'high': return 'Hög'
    case 'medium': return 'Medium'
    case 'low': return 'Låg'
    default: return 'Låg'
  }
}

export function getPriorityBadgeStyle(p: string): string {
  switch (p) {
    case 'urgent': return 'bg-gray-200 text-gray-700 border-gray-300'
    case 'high': return 'bg-gray-150 text-gray-600 border-gray-200'
    case 'medium': return 'bg-gray-100 text-gray-500 border-gray-200'
    case 'low': return 'bg-gray-50 text-gray-400 border-gray-100'
    default: return 'bg-gray-100 text-gray-500 border-gray-200'
  }
}

export function getTriggeredByLabel(t: string): string {
  switch (t) {
    case 'ai': return 'AI'
    case 'user': return 'Användare'
    case 'system': return 'System'
    default: return t
  }
}

export function getTriggeredByStyle(t: string): string {
  switch (t) {
    case 'ai': return 'bg-primary-100 text-sky-700 border-primary-200'
    case 'user': return 'bg-gray-100 text-gray-600 border-gray-200'
    case 'system': return 'bg-gray-100 text-gray-500 border-gray-200'
    default: return 'bg-gray-100 text-gray-500 border-gray-200'
  }
}
