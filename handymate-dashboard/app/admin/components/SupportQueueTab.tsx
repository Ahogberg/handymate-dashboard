'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Mail,
  MessageSquare,
  RefreshCw,
  Smartphone,
  Zap,
} from 'lucide-react'
import { CATEGORY_LABELS } from '@/lib/constants/support-categories'

interface SupportTicket {
  id: string
  business_id: string
  thread_id: string
  category: string
  status: string
  summary?: string | null
  escalated_at: string
  business_config?: { business_name?: string } | null
}

type SourceKey = 'sms' | 'email' | 'billing' | 'automation'

interface OperationIncident {
  id: string
  kind: SourceKey
  business_id: string
  business_name: string | null
  title: string
  detail: string | null
  occurred_at: string
}

interface OperationSource {
  source: string
  status: 'ok' | 'unavailable'
  count: number
  incidents: OperationIncident[]
  message: string | null
}

interface HealthState {
  available: boolean
  reason?: string
  checked_at: string | null
  stale: boolean
  overall: 'ok' | 'warn' | 'error' | 'unknown'
  checks: Array<{
    key: string
    status: 'ok' | 'warn' | 'error'
    summary: string
    checked_at: string
  }>
}

interface OperationsResponse {
  generated_at: string
  window_started_at: string
  total_incidents: number
  has_unavailable_source: boolean
  sources: Record<SourceKey, OperationSource>
  health: HealthState
}

const SOURCE_META: Record<SourceKey, { label: string; Icon: typeof Smartphone }> = {
  sms: { label: 'SMS', Icon: Smartphone },
  email: { label: 'E-post', Icon: Mail },
  billing: { label: 'Betalningar', Icon: CreditCard },
  automation: { label: 'Automationer', Icon: Zap },
}

const HEALTH_LABELS: Record<string, string> = {
  database: 'Databas',
  elks_balance: '46elks',
  anthropic_credit: 'AI-tjänst',
  stripe_key: 'Stripe',
}

function formatDate(value: string | null): string {
  if (!value) return 'Aldrig'
  return new Date(value).toLocaleString('sv-SE', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function healthLabel(health: HealthState | null): string {
  if (!health?.available) return 'Okänd'
  if (health.stale) return 'Inaktuell'
  if (health.overall === 'error') return 'Åtgärd krävs'
  if (health.overall === 'warn') return 'Varning'
  return 'Alla kontroller gröna'
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`${url} svarade ${response.status}`)
  return response.json()
}

export default function SupportQueueTab() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [operations, setOperations] = useState<OperationsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [supportError, setSupportError] = useState<string | null>(null)
  const [operationsError, setOperationsError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setSupportError(null)
    setOperationsError(null)

    const [supportResult, operationsResult] = await Promise.allSettled([
      fetchJson('/api/admin/support-tickets'),
      fetchJson('/api/admin/support-operations'),
    ])

    if (supportResult.status === 'fulfilled') {
      setTickets(supportResult.value.tickets || [])
    } else {
      setTickets([])
      setSupportError('Kunde inte hämta supportärenden — försök igen.')
    }

    if (operationsResult.status === 'fulfilled') {
      setOperations(operationsResult.value)
    } else {
      setOperations(null)
      setOperationsError('Kunde inte hämta driftläget — försök igen.')
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading && !operations && tickets.length === 0) {
    return <div className="text-gray-400 text-sm">Laddar support och drift...</div>
  }

  const health = operations?.health || null
  const healthNeedsAttention = !health?.available || health.stale || health.overall !== 'ok'

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Support & drift</h2>
          <p className="mt-1 text-sm text-gray-500">
            Kundfrågor och tekniska avvikelser i samma operativa vy.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Uppdatera
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Öppna supportärenden"
          value={supportError ? '—' : String(tickets.length)}
          tone={tickets.length > 0 ? 'attention' : 'ok'}
        />
        <SummaryCard
          label="Driftfel senaste 25 h"
          value={operationsError ? '—' : String(operations?.total_incidents ?? 0)}
          detail={operations?.has_unavailable_source ? 'Kontrollen är ofullständig' : undefined}
          tone={(operations?.total_incidents || 0) > 0 || operations?.has_unavailable_source ? 'attention' : 'ok'}
        />
        <SummaryCard
          label="Plattformshälsa"
          value={healthLabel(health)}
          tone={healthNeedsAttention ? 'attention' : 'ok'}
        />
        <SummaryCard
          label="Senast uppdaterad"
          value={operations ? formatDate(operations.generated_at) : '—'}
          tone="neutral"
        />
      </div>

      <section aria-labelledby="support-heading">
        <div className="mb-3 flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary-700" />
          <h3 id="support-heading" className="text-lg font-semibold text-gray-900">Supportärenden</h3>
        </div>

        {supportError ? (
          <ErrorBox>{supportError}</ErrorBox>
        ) : tickets.length === 0 ? (
          <EmptyBox text="Inga öppna supportärenden." />
        ) : (
          <div className="space-y-2">
            {tickets.map(ticket => (
              <div
                key={ticket.id}
                className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                    <span className="font-semibold text-gray-900 text-sm">
                      {ticket.business_config?.business_name || ticket.business_id}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {CATEGORY_LABELS[ticket.category] || ticket.category}
                    </span>
                  </div>
                  {ticket.summary && <div className="mt-1 text-xs text-gray-500">{ticket.summary}</div>}
                  <div className="mt-1 text-xs text-gray-400">Eskalerad {formatDate(ticket.escalated_at)}</div>
                </div>
                <a
                  href={`/admin/support/${ticket.id}`}
                  className="shrink-0 text-sm font-medium text-primary-700 hover:underline"
                >
                  Öppna →
                </a>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="operations-heading">
        <div className="mb-1 flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary-700" />
          <h3 id="operations-heading" className="text-lg font-semibold text-gray-900">Drift senaste 25 timmarna</h3>
        </div>
        <p className="mb-4 text-sm text-gray-500">
          Samma loggar som driftlarmet läser. Här skapas inga nya eller frikopplade incidenter.
        </p>

        {operationsError || !operations ? (
          <ErrorBox>{operationsError || 'Driftläget kunde inte läsas.'}</ErrorBox>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {(Object.keys(SOURCE_META) as SourceKey[]).map(key => (
              <SourceCard key={key} source={operations.sources[key]} sourceKey={key} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="health-heading">
        <div className="mb-3">
          <h3 id="health-heading" className="text-lg font-semibold text-gray-900">Plattform & leverantörer</h3>
          <p className="mt-1 text-sm text-gray-500">Senaste sparade kontrollen — inga leverantörsanrop görs när sidan öppnas.</p>
        </div>

        {!health?.available ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <div className="font-semibold">Kunde inte kontrollera plattformshälsan</div>
            <div className="mt-1">Inte samma sak som att allt är grönt. Kontrollera kreditbevakningen och serverloggen.</div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {health.stale && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Kontrollen är inaktuell. Senast körd {formatDate(health.checked_at)}.
              </div>
            )}
            <div className="divide-y divide-gray-100">
              {health.checks.map(check => (
                <div key={check.key} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    {check.status === 'ok'
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      : <AlertCircle className={`h-4 w-4 ${check.status === 'error' ? 'text-red-600' : 'text-amber-600'}`} />}
                    <span className="text-sm font-medium text-gray-900">{HEALTH_LABELS[check.key] || check.key}</span>
                  </div>
                  <span className="text-sm text-gray-600 sm:text-right">{check.summary}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail?: string
  tone: 'ok' | 'attention' | 'neutral'
}) {
  const color = tone === 'attention'
    ? 'border-amber-200 bg-amber-50'
    : tone === 'ok'
      ? 'border-emerald-100 bg-emerald-50/60'
      : 'border-gray-200 bg-white'
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-gray-900">{value}</div>
      {detail && <div className="mt-1 text-xs text-amber-700">{detail}</div>}
    </div>
  )
}

function SourceCard({ source, sourceKey }: { source: OperationSource; sourceKey: SourceKey }) {
  const { label, Icon } = SOURCE_META[sourceKey]
  if (source.status === 'unavailable') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-center gap-2 text-amber-800">
          <Icon className="h-4 w-4" />
          <span className="text-sm font-semibold">{label}: Kunde inte kontrolleras</span>
        </div>
        <p className="mt-2 text-xs text-amber-700">Inte samma sak som att allt är grönt. {source.message}</p>
      </div>
    )
  }

  return (
    <div className={`rounded-xl border p-4 ${source.count > 0 ? 'border-red-200 bg-red-50/60' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${source.count > 0 ? 'text-red-600' : 'text-emerald-600'}`} />
          <span className="text-sm font-semibold text-gray-900">{label}</span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${source.count > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {source.count > 0 ? `${source.count} fel` : 'Inga fel'}
        </span>
      </div>

      {source.incidents.length > 0 && (
        <div className="mt-3 space-y-3 border-t border-red-100 pt-3">
          {source.incidents.map(incident => (
            <div key={incident.id} className="text-xs">
              <div className="font-medium text-gray-900">{incident.title}</div>
              <div className="mt-0.5 text-gray-600">{incident.business_name || incident.business_id}</div>
              {incident.detail && <div className="mt-0.5 break-words text-gray-500">{incident.detail}</div>}
              <div className="mt-0.5 text-gray-400">{formatDate(incident.occurred_at)}</div>
            </div>
          ))}
          {source.count > source.incidents.length && (
            <div className="text-xs text-gray-500">+ {source.count - source.incidents.length} ytterligare i loggen</div>
          )}
        </div>
      )}
    </div>
  )
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      {children}
    </div>
  )
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-emerald-800">
      <CheckCircle2 className="h-4 w-4" />
      {text}
    </div>
  )
}
