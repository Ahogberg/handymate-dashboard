/**
 * Första verifierade handlingen — den rena väljaren (2026-08-27).
 *
 * Dag 0 fanns noll riktiga kort i kön: bara de tre informativa startkorten
 * (team_intro, "Jag har läst det"). Riktiga kort kom först nästa morgon från
 * cronarna (check-overdue 07:00, quote-follow-up 08:00, send-reminders
 * 10:00). Company Scan hittade förfallna fakturor och gamla offerter men
 * slutade med "Visa mig" — kunden fick titta, inte handla.
 *
 * Den här modulen väljer EN kandidat ur samma rader skanningen redan läser,
 * i fast prioritetsordning, helt deterministiskt (ingen modell, inga tokens):
 *
 *   1. Karin — förfallen faktura (störst belopp, vid lika: mest förfallen)
 *   2. Daniel — öppen offert som väntat > 5 dagar (störst belopp, vid lika: äldst)
 *   3. Ingen kund alls → "Skapa din första kund" (länk, inget kort)
 *   4. Annars null → skanningen behåller dagens "Visa mig"
 *
 * Hanna ("Nästa torsdag är tom") är medvetet INTE med i v1:
 * lib/agents/hanna/capacity-fill.ts kräver konfigurerade capacity_settings
 * för att kunna säga "tunn vecka" — de finns aldrig dag 0.
 *
 * Copyn bygger bara på radernas egna värden (namn, belopp, dagar, antal) —
 * aldrig ett påhittat tal. Rubriken säger "Börja med X" och inget om att de
 * andra kandidaterna köats (det har de inte).
 *
 * Anropare: app/api/onboarding/first-action/route.ts (POST). Kortet skapas
 * där via samma byggare som cronarna använder — lib/invoice-reminder-card.ts
 * respektive lib/agents/daniel/quote-follow-up-card.ts — så det är
 * exekverbart av den befintliga godkännandemotorn och ger ett kvitto.
 */
import { arTestId, arTestNamn } from '@/lib/testdata'
import { OPEN_QUOTE_STATUSES } from '@/lib/quotes/statuses'
import { daysSinceSent } from '@/lib/agents/daniel/unopened-quotes'
import { fmt } from '@/lib/onboarding/instant-value'

/** Samma tröskel som skanningens staleQuotesCount (company-scan/route.ts). */
export const FIRST_ACTION_STALE_QUOTE_DAYS = 5
/** Påminnelsestegen är fyra (lib/invoice-reminder-card.ts DEFAULT_SCHEDULE). */
export const FIRST_ACTION_MAX_REMINDERS = 4

export type FirstActionTier = 'karin' | 'daniel'
export const DEFAULT_ENABLED_TIERS: ReadonlyArray<FirstActionTier> = ['karin', 'daniel']

export interface FirstActionInvoiceRow {
  invoice_id: string
  invoice_number: string | null
  status: string
  due_date: string | null
  total: number | null
  customer_pays: number | null
  rot_rut_type: string | null
  reminder_count: number | null
  customer_id: string | null
  customer_name: string | null
  customer_phone: string | null
}

export interface FirstActionQuoteRow {
  quote_id: string
  status: string
  sent_at: string | null
  view_count: number | null
  total: number | null
  customer_pays: number | null
  customer_id: string | null
  customer_name: string | null
  customer_phone: string | null
  title: string | null
}

export interface FirstActionInput {
  /** svDateStr(now) — 'YYYY-MM-DD' i svensk lokaltid. */
  today: string
  /** Date.now() — för dagar sedan offerten skickades. */
  now: number
  customerCount: number
  invoices: FirstActionInvoiceRow[]
  quotes: FirstActionQuoteRow[]
  enabledTiers?: ReadonlyArray<FirstActionTier>
}

export type FirstAction =
  | {
      kind: 'karin_overdue'
      invoiceId: string
      invoiceNumber: string | null
      customerId: string | null
      customerName: string
      customerPhone: string
      amountKr: number
      daysOverdue: number
      /** Hur många förfallna kandidater som fanns — bara för copyn. */
      overdueCount: number
    }
  | {
      kind: 'daniel_stale_quote'
      quoteId: string
      customerId: string | null
      customerName: string
      customerPhone: string
      amountKr: number
      daysSinceSent: number
      opened: boolean
      staleCount: number
      title: string | null
    }
  | { kind: 'skapa_kund'; href: string }

const amountOf = (row: { total: number | null; customer_pays: number | null; rot_rut_type?: string | null }): number => {
  const raw = row.rot_rut_type ? row.customer_pays : row.total
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
}

const hasPhone = (phone: string | null | undefined): phone is string =>
  typeof phone === 'string' && phone.trim().length > 0

function daysBetweenDateStr(fromYmd: string, toYmd: string): number {
  const a = new Date(`${fromYmd}T00:00:00Z`).getTime()
  const b = new Date(`${toYmd}T00:00:00Z`).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.max(0, Math.floor((b - a) / 86_400_000))
}

export function pickFirstAction(input: FirstActionInput): FirstAction | null {
  const tiers = input.enabledTiers ?? DEFAULT_ENABLED_TIERS

  if (tiers.includes('karin')) {
    const candidates = input.invoices
      .filter(inv => inv.status === 'sent' || inv.status === 'overdue')
      .filter(inv => !!inv.due_date && inv.due_date < input.today)
      .filter(inv => (inv.reminder_count ?? 0) < FIRST_ACTION_MAX_REMINDERS)
      .filter(inv => hasPhone(inv.customer_phone))
      .filter(inv => !arTestId(inv.invoice_id) && !arTestNamn(inv.customer_name))
      .map(inv => ({ inv, amount: amountOf(inv), days: daysBetweenDateStr(inv.due_date!, input.today) }))
      .filter(c => c.amount > 0)
      .sort((a, b) => b.amount - a.amount || b.days - a.days)
    const top = candidates[0]
    if (top) {
      return {
        kind: 'karin_overdue',
        invoiceId: top.inv.invoice_id,
        invoiceNumber: top.inv.invoice_number,
        customerId: top.inv.customer_id,
        customerName: top.inv.customer_name || 'kunden',
        customerPhone: top.inv.customer_phone as string,
        amountKr: top.amount,
        daysOverdue: top.days,
        overdueCount: candidates.length,
      }
    }
  }

  if (tiers.includes('daniel')) {
    const open = new Set<string>(OPEN_QUOTE_STATUSES)
    const candidates = input.quotes
      .filter(q => open.has(q.status))
      .map(q => ({ q, days: daysSinceSent(q.sent_at, input.now) }))
      .filter((c): c is { q: FirstActionQuoteRow; days: number } => c.days !== null && c.days > FIRST_ACTION_STALE_QUOTE_DAYS)
      .filter(c => hasPhone(c.q.customer_phone))
      .filter(c => !arTestId(c.q.quote_id) && !arTestNamn(c.q.customer_name) && !arTestNamn(c.q.title))
      .map(c => ({ ...c, amount: amountOf(c.q) }))
      .sort((a, b) => b.amount - a.amount || b.days - a.days)
    const top = candidates[0]
    if (top) {
      return {
        kind: 'daniel_stale_quote',
        quoteId: top.q.quote_id,
        customerId: top.q.customer_id,
        customerName: top.q.customer_name || 'kunden',
        customerPhone: top.q.customer_phone as string,
        amountKr: top.amount,
        daysSinceSent: top.days,
        opened: Number(top.q.view_count || 0) > 0,
        staleCount: candidates.length,
        title: top.q.title,
      }
    }
  }

  if (input.customerCount === 0) {
    return { kind: 'skapa_kund', href: '/dashboard/customers' }
  }

  return null
}

const TALORD = ['noll', 'en', 'två', 'tre', 'fyra', 'fem', 'sex', 'sju', 'åtta', 'nio', 'tio', 'elva', 'tolv']
export function talord(n: number): string {
  return n >= 0 && n < TALORD.length ? TALORD[n] : fmt(n)
}

const fornamn = (name: string): string => name.trim().split(/\s+/)[0] || name

export interface FirstActionCopy {
  /** Agentens hittade-rad, t.ex. "Karin hittade två förfallna fakturor. Börja med Andersson?" */
  headline: string
  /** Knapptexten, t.ex. "Börja med Andersson". */
  cta: string
  agent: 'karin' | 'daniel' | 'matte'
}

export function firstActionCopy(action: FirstAction): FirstActionCopy {
  switch (action.kind) {
    case 'karin_overdue': {
      const namn = fornamn(action.customerName)
      const hittade =
        action.overdueCount === 1
          ? `Karin hittade en förfallen faktura på ${fmt(action.amountKr)} kr.`
          : `Karin hittade ${talord(action.overdueCount)} förfallna fakturor.`
      return { headline: `${hittade} Börja med ${namn}?`, cta: `Börja med ${namn}`, agent: 'karin' }
    }
    case 'daniel_stale_quote': {
      const dagar = action.daysSinceSent === 1 ? 'en dag' : `${talord(action.daysSinceSent)} dagar`
      const hittade =
        action.staleCount === 1
          ? `Daniel hittade en offert som väntat ${dagar}.`
          : `Daniel hittade ${talord(action.staleCount)} offerter som väntar — den äldsta i ${dagar}.`
      return { headline: `${hittade} Vill du granska uppföljningen?`, cta: 'Granska uppföljningen', agent: 'daniel' }
    }
    case 'skapa_kund':
      return {
        headline: 'Teamet är på plats och redo. Lägg till din första kund så börjar de jobba.',
        cta: 'Lägg till din första kund',
        agent: 'matte',
      }
  }
}
