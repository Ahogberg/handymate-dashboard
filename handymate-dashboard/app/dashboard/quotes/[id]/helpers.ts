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
