// Rena hjälpfunktioner som delas mellan offert-detaljvyns komponenter.

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('sv-SE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function getUnitLabel(unit: string): string {
  switch (unit) {
    case 'hour': return 'tim'
    case 'piece': return 'st'
    case 'm2': return 'm²'
    case 'm': return 'm'
    case 'lm': return 'lm'
    case 'pauschal': return 'pauschal'
    default: return unit || 'st'
  }
}

/**
 * Statusfärg för offerter — följer designsystemets semantiska palett:
 *   slate  = neutral/utkast,
 *   amber  = pending/väntar (skickad),
 *   blue   = information (öppnad — kunden tittar),
 *   green  = lyckat (accepterad),
 *   red    = fel (nekad/utgången).
 */
export function getStatusStyle(status: string): string {
  switch (status) {
    case 'draft':    return 'bg-slate-100 text-slate-600'
    case 'sent':     return 'bg-amber-50 text-amber-700'
    case 'opened':   return 'bg-blue-50 text-blue-700'
    case 'accepted': return 'bg-green-50 text-green-700'
    case 'declined': return 'bg-red-50 text-red-700'
    case 'expired':  return 'bg-red-50 text-red-700'
    default:         return 'bg-slate-100 text-slate-600'
  }
}

export function getStatusText(status: string): string {
  switch (status) {
    case 'draft': return 'Utkast'
    case 'sent': return 'Skickad'
    case 'opened': return 'Öppnad'
    case 'accepted': return 'Accepterad'
    case 'declined': return 'Nekad'
    case 'expired': return 'Utgången'
    default: return status
  }
}

/** Belopp med explicit tecken — "+4 500 kr" / "−4 500 kr" (minus, U+2212,
    matchar mallarnas rabattrader) — ANVÄND ENDAST för diff-belopp, aldrig
    absoluta summor (de har inget tecken att visa). 0 → utan tecken. */
export function formatSignedCurrency(amount: number): string {
  if (amount === 0) return formatCurrency(0)
  const sign = amount > 0 ? '+' : '−'
  return `${sign}${formatCurrency(Math.abs(amount))}`
}

export interface VersionDiffInput {
  total: number
  item_count: number
}

/**
 * FACIT (tests/quote-version-diff.spec.ts) — ETAPP 4, punkt 5: "vad
 * ändrades"-raden i versionsväljaren. Ren funktion: jämför EN versions
 * summering mot föregåendes (totalbelopp + antal rader) — INTE en fullständig
 * fältdiff (det är medvetet utanför scope, se offert-masterplan.md ETAPP 4).
 *
 * `previous` null (första versionen, inget att jämföra med) → null.
 * Ingen skillnad alls → en explicit "inga ändringar"-sträng (inte null,
 * så anroparen kan skilja "inget att jämföra" från "jämfört, identiskt").
 */
export function computeVersionDiff(
  current: VersionDiffInput,
  previous: VersionDiffInput | null | undefined,
): string | null {
  if (!previous) return null

  const rowDiff = current.item_count - previous.item_count
  const totalDiff = current.total - previous.total

  if (rowDiff === 0 && totalDiff === 0) return 'Inga ändringar mot föregående version'

  const parts: string[] = []
  if (rowDiff !== 0) {
    const label = Math.abs(rowDiff) === 1 ? 'rad' : 'rader'
    parts.push(`${rowDiff > 0 ? '+' : ''}${rowDiff} ${label}`)
  }
  if (totalDiff !== 0) {
    parts.push(formatSignedCurrency(totalDiff))
  }
  return parts.join(', ')
}

/** "2 min 14 s" / "48 s" — total_view_seconds (quotes-kolumn) till läsbar
    text. 0/saknas → null (anroparen döljer raden istället för "0 s"). */
export function formatViewDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m === 0) return `${s} s`
  return `${m} min ${s} s`
}
