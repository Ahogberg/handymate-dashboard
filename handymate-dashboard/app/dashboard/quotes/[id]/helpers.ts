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

export function getStatusStyle(status: string): string {
  switch (status) {
    case 'draft': return 'bg-gray-100 text-gray-500 border-gray-300'
    case 'sent': return 'bg-blue-100 text-blue-600 border-blue-300'
    case 'opened': return 'bg-amber-100 text-amber-600 border-amber-300'
    case 'accepted': return 'bg-emerald-100 text-emerald-600 border-emerald-300'
    case 'declined': return 'bg-red-100 text-red-600 border-red-500/30'
    case 'expired': return 'bg-gray-100 text-gray-400 border-gray-300'
    default: return 'bg-gray-100 text-gray-500 border-gray-300'
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
