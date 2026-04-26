/**
 * Delade formatterare och status-getters för kundportalen.
 * Extraherade från page.tsx vid komponent-splitten — INGEN logik-ändring.
 */

export const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })

export const formatDateTime = (date: string) =>
  new Date(date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const formatCurrency = (n: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(n)

export const getQuoteStatusText = (s: string) => {
  switch (s) {
    case 'sent': case 'opened': return 'Vantar svar'
    case 'accepted': return 'Godkand'
    case 'declined': return 'Nekad'
    case 'expired': return 'Utgangen'
    default: return s
  }
}

export const getQuoteStatusColor = (s: string) => {
  switch (s) {
    case 'sent': case 'opened': return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'accepted': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'declined': return 'bg-red-100 text-red-700 border-red-200'
    case 'expired': return 'bg-gray-100 text-gray-600 border-gray-200'
    default: return 'bg-gray-100 text-gray-600 border-gray-200'
  }
}

export const getInvoiceStatusText = (s: string) => {
  switch (s) {
    case 'sent': return 'Obetald'
    case 'overdue': return 'Forsenad'
    case 'paid': return 'Betald'
    default: return s
  }
}

export const getInvoiceStatusColor = (s: string) => {
  switch (s) {
    case 'sent': return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'overdue': return 'bg-red-100 text-red-700 border-red-200'
    case 'paid': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    default: return 'bg-gray-100 text-gray-600 border-gray-200'
  }
}

export const getProjectStatusText = (s: string) => {
  switch (s) {
    case 'active': case 'in_progress': return 'Pagaende'
    case 'completed': return 'Avslutat'
    case 'on_hold': return 'Pausat'
    default: return s
  }
}
