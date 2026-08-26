'use client'

import { Check } from 'lucide-react'
import { formatCurrency, formatDate, getFortnoxSyncText, getPaymentMethodText } from '../helpers'
import type { Invoice, InvoiceReminder } from '../types'

interface InvoiceStatusTimelineProps {
  invoice: Invoice
  reminders: InvoiceReminder[]
}

type StepStatus = 'done' | 'current' | 'upcoming' | 'failed'

interface Step {
  label: string
  sublabel?: string | null
  date: string | null | undefined
  status: StepStatus
}

/**
 * ETAPP 6d (offert-masterplan.md, faktura-sprinten), punkt 3 — VERKLIG
 * tidslinje. Speglar QuoteStatusTimeline.tsx men fixar den namngivna
 * spec-buggen: den GAMLA fakturasidan läste `invoice.reminder_sent_at`
 * (kolumnen finns inte — den heter `last_reminder_at`) för
 * påminnelserraden, så påminnelser syntes ALDRIG i historiken trots att
 * fullständig data hela tiden hämtades i `reminders`-arrayen
 * (invoice_reminders, en rad per faktiskt utskickad påminnelse — nummer,
 * datum, metod, avgift, ränta). Den arrayen är den enda sanningskällan
 * här; `last_reminder_at`/`reminder_count` på invoice-raden används inte
 * längre (samma princip som QuoteStatusTimeline slutade läsa quote.opened_at).
 *
 * `invoice.viewed_at` sätts ALDRIG någonstans i kodbasen idag (verifierat
 * via grep) — "Visad"-steget visar därför bara "kommande" tills en
 * framtida etapp faktiskt börjar skriva den kolumnen. Ärligt om vad datat
 * vet, inte en påhittad status.
 *
 * Fortnox-synk (v58, fortnox_sync_status) renderas som ett eget steg när
 * den finns — tidigare visades den INGENSTANS i UI:t trots att retry-läget
 * (pending/synced/failed) och tidsstämpeln (fortnox_sync_attempted_at)
 * fanns i databasen sedan v58.
 */
export function InvoiceStatusTimeline({ invoice, reminders }: InvoiceStatusTimelineProps) {
  const steps: Step[] = []

  steps.push({ label: 'Skapad', date: invoice.created_at, status: 'done' })

  steps.push({
    label: invoice.sent_at && invoice.sent_method ? `Skickad via ${sentMethodLabel(invoice.sent_method)}` : 'Skickad',
    date: invoice.sent_at,
    status: invoice.sent_at ? 'done' : invoice.status === 'draft' ? 'current' : 'upcoming',
  })

  steps.push({
    label: 'Visad',
    date: invoice.viewed_at,
    status: invoice.viewed_at ? 'done' : 'upcoming',
  })

  // En rad PER påminnelse (invoice_reminders, hämtad i page.tsx) — inte en
  // sammanfattande "N påminnelser skickade"-rad.
  reminders.forEach(r => {
    steps.push({
      label: `Påminnelse ${r.reminder_number}`,
      date: r.sent_at,
      sublabel: reminderSublabel(r),
      status: 'done',
    })
  })

  if (invoice.fortnox_sync_status) {
    const isFailed = invoice.fortnox_sync_status === 'failed'
    const isSynced = invoice.fortnox_sync_status === 'synced'
    steps.push({
      label: `Fortnox: ${getFortnoxSyncText(invoice.fortnox_sync_status)}`,
      date: isSynced ? invoice.fortnox_synced_at : invoice.fortnox_sync_attempted_at,
      sublabel: isFailed
        ? invoice.fortnox_sync_error || 'Okänt fel'
        : isSynced && invoice.fortnox_invoice_number
          ? `Fakturanr ${invoice.fortnox_invoice_number}`
          : null,
      status: isFailed ? 'failed' : isSynced ? 'done' : 'current',
    })
  }

  // Betalning. ROT/RUT (2026-08-26): kundens del och Skatteverkets del är två
  // steg — `customer_paid` = kunden klar, `paid` + settled_at = slutbetald.
  const isSplit = (invoice.rot_rut_type === 'rot' || invoice.rot_rut_type === 'rut')
    && (invoice.status === 'customer_paid' || (invoice.status === 'paid' && !!invoice.settled_at && invoice.settled_at !== invoice.paid_at))
  if (invoice.paid_at && isSplit) {
    const remaining = Math.max(0, (invoice.total || 0) - (invoice.paid_amount ?? invoice.customer_pays ?? 0))
    steps.push({
      label: `Kundens del betald via ${getPaymentMethodText(invoice.paid_via)}`,
      date: invoice.paid_at,
      sublabel: invoice.status === 'customer_paid'
        ? `${formatCurrency(invoice.paid_amount ?? invoice.customer_pays)} · ${invoice.rot_rut_type?.toUpperCase()}-del ${formatCurrency(remaining)} väntar på Skatteverket`
        : formatCurrency(invoice.paid_amount ?? invoice.customer_pays),
      status: 'done',
    })
    steps.push({
      label: 'Slutbetald',
      date: invoice.settled_at,
      sublabel: invoice.settled_at ? 'Skatteverkets utbetalning registrerad' : null,
      status: invoice.settled_at ? 'done' : 'current',
    })
  } else if (invoice.paid_at) {
    steps.push({
      label: `Betald via ${getPaymentMethodText(invoice.paid_via)}`,
      date: invoice.paid_at,
      sublabel: invoice.payment_reference ? `Referens ${invoice.payment_reference}` : null,
      status: 'done',
    })
  } else if (invoice.status === 'cancelled') {
    steps.push({ label: 'Makulerad', date: invoice.cancelled_at, status: 'done' })
  } else if (invoice.status !== 'credited') {
    steps.push({ label: 'Betald', date: null, status: 'upcoming' })
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Historik</p>
      <ol className="relative space-y-1">
        {steps.map((step, i) => (
          <TimelineRow key={i} step={step} isLast={i === steps.length - 1} />
        ))}
      </ol>
    </div>
  )
}

function sentMethodLabel(method: string): string {
  if (method === 'email') return 'e-post'
  if (method === 'sms') return 'SMS'
  if (method === 'both') return 'e-post och SMS'
  return method
}

function reminderSublabel(r: InvoiceReminder): string {
  const methodText = r.sent_method === 'sms' ? 'SMS' : r.sent_method === 'email' ? 'E-post' : 'Misslyckad'
  const parts = [methodText]
  if (r.fee_amount > 0) parts.push(`${formatCurrency(r.fee_amount)} avgift`)
  if (r.penalty_interest_amount > 0) parts.push(`${formatCurrency(r.penalty_interest_amount)} ränta`)
  return parts.join(' · ')
}

function TimelineRow({ step, isLast }: { step: Step; isLast: boolean }) {
  const isDone = step.status === 'done'
  const isCurrent = step.status === 'current'
  const isFailed = step.status === 'failed'

  return (
    <li className="relative flex items-start gap-3 py-1.5">
      {!isLast && <span className="absolute left-[11px] top-7 bottom-0 w-px bg-slate-200" aria-hidden />}

      <div className="relative z-10 mt-0.5 flex-shrink-0">
        {isDone ? (
          <div className="w-[22px] h-[22px] rounded-full bg-green-600 flex items-center justify-center">
            <Check className="w-3 h-3 text-white" strokeWidth={3} />
          </div>
        ) : isCurrent ? (
          <div className="w-[22px] h-[22px] rounded-full bg-primary-700 ring-4 ring-primary-100 animate-pulse" />
        ) : isFailed ? (
          <div className="w-[22px] h-[22px] rounded-full bg-red-600" />
        ) : (
          <div className="w-[22px] h-[22px] rounded-full bg-white border-2 border-dashed border-slate-300" />
        )}
      </div>

      <div className="flex-1 min-w-0 pt-0.5">
        <p
          className={`text-sm ${
            isDone || isCurrent
              ? 'text-slate-900 font-medium'
              : isFailed
                ? 'text-red-700 font-semibold'
                : 'text-slate-500'
          }`}
        >
          {step.label}
        </p>
        {step.date && <p className="text-xs text-slate-400 mt-0.5 font-mono">{formatDate(step.date)}</p>}
        {step.sublabel ? (
          <p className="text-xs text-slate-400 mt-0.5">{step.sublabel}</p>
        ) : !step.date ? (
          <p className="text-xs text-slate-300 mt-0.5">—</p>
        ) : null}
      </div>
    </li>
  )
}
