// Rena hjälpfunktioner som delas mellan fakturans detaljvys komponenter.
// Speglar app/dashboard/quotes/[id]/helpers.ts.
import { CreditCard, Banknote, Smartphone, Building } from 'lucide-react'

export function formatCurrency(amount: number | null | undefined): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(amount || 0)
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('sv-SE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export const PAYMENT_METHODS = [
  { value: 'swish', label: 'Swish', icon: Smartphone },
  { value: 'bankgiro', label: 'Bankgiro', icon: Building },
  { value: 'card', label: 'Kort', icon: CreditCard },
  { value: 'cash', label: 'Kontant', icon: Banknote },
]

const SYSTEM_PAYMENT_LABELS: Record<string, string> = {
  fortnox: 'Fortnox',
  manual: 'manuell registrering',
  customer_confirmed: 'kundens bekräftelse',
}

export function getPaymentMethodText(method: string | null | undefined): string {
  if (!method) return 'Okänd'
  const found = PAYMENT_METHODS.find(m => m.value === method)
  return found?.label || SYSTEM_PAYMENT_LABELS[method] || method
}

/**
 * Statusfärg för fakturor — samma semantiska palett som offertens
 * getStatusStyle (helpers.ts): slate=neutral/utkast, amber=pending,
 * green=lyckat, red=fel/försenad, orange=krediterad (ingen naturlig
 * motsvarighet i offertens palett — fakturaspecifikt).
 */
export function getStatusStyle(status: string): string {
  switch (status) {
    case 'draft': return 'bg-slate-100 text-slate-600'
    case 'sent': return 'bg-amber-50 text-amber-700'
    case 'customer_paid': return 'bg-teal-50 text-teal-700'
    case 'paid': return 'bg-green-50 text-green-700'
    case 'overdue': return 'bg-red-50 text-red-700'
    case 'credited': return 'bg-orange-50 text-orange-700'
    case 'cancelled': return 'bg-slate-100 text-slate-500'
    default: return 'bg-slate-100 text-slate-600'
  }
}

export function getStatusText(status: string): string {
  switch (status) {
    case 'draft': return 'Utkast'
    case 'sent': return 'Skickad'
    // Kunden ÄR klar — det ska läsas som betald. Tillägget säger bara att
    // ROT/RUT-delen ännu inte kommit från Skatteverket (Andreas 2026-08-26).
    case 'customer_paid': return 'Betald · ROT-del hos Skatteverket'
    case 'paid': return 'Betald'
    case 'overdue': return 'Förfallen'
    case 'cancelled': return 'Makulerad'
    case 'credited': return 'Krediterad'
    default: return status
  }
}

export function isOverdue(invoice: { status: string; due_date: string }): boolean {
  const dueDate = new Date(invoice.due_date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return (invoice.status === 'sent' || invoice.status === 'overdue') && dueDate < today
}

const FORTNOX_SYNC_LABEL: Record<string, string> = {
  pending: 'Synkar…',
  synced: 'Synkad',
  failed: 'Synk misslyckades',
}

export function getFortnoxSyncText(status: string | null | undefined): string {
  return (status && FORTNOX_SYNC_LABEL[status]) || ''
}

export function getFortnoxSyncStyle(status: string | null | undefined): string {
  switch (status) {
    case 'synced': return 'bg-emerald-50 text-emerald-700'
    case 'pending': return 'bg-amber-50 text-amber-700'
    case 'failed': return 'bg-red-50 text-red-700'
    default: return 'bg-slate-100 text-slate-500'
  }
}
