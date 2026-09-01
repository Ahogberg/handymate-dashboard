'use client'

// Admin: provisionshantering per partner (partnerprogram v2, 2026-08-11).
// Trappredigerare (min/sats-rader + basnivå + book/marginal + löptid),
// liggarvy per period, "Skapa underlag" och "Markera utbetald".
// Pratar med /api/admin/partners/commission.

import { useCallback, useEffect, useState } from 'react'
import { X, Loader2, Plus, Trash2, Play, FileText, CheckCircle2 } from 'lucide-react'

interface TierStep { min: number; rate: number }

interface LedgerRow {
  id: string
  business_id: string
  business_name: string
  period: string
  customer_month: number
  base_amount_sek: number
  rate: number
  amount_sek: number
  rate_source: string
  status: string
  payout_batch_id: string | null
}

interface Batch {
  id: string
  period: string
  total_sek: number
  status: 'open' | 'paid'
  created_at: string
  paid_at: string | null
  paid_by: string | null
}

interface PartnerConfig {
  id: string
  name: string
  company: string | null
  commission_rate: number
  commission_tiers: TierStep[] | null
  base_rate_after: number
  tier_mode: 'book' | 'marginal'
  ladder_months: number
  total_pending_sek: number
  total_earned_sek: number
}

function formatSek(n: number): string {
  return Math.round(n).toLocaleString('sv-SE') + ' kr'
}
function pct(rate: number): string {
  return `${Math.round(rate * 1000) / 10} %`
}

export default function PartnerCommissionModal({
  partnerId,
  onClose,
}: {
  partnerId: string
  onClose: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [partner, setPartner] = useState<PartnerConfig | null>(null)
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [batches, setBatches] = useState<Batch[]>([])

  const [tiers, setTiers] = useState<TierStep[]>([])
  const [baseRate, setBaseRate] = useState('0')
  const [tierMode, setTierMode] = useState<'book' | 'marginal'>('book')
  const [ladderMonths, setLadderMonths] = useState('36')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/partners/commission?partner_id=${partnerId}`)
      if (!res.ok) { setMessage('Kunde inte ladda partnern'); return }
      const data = await res.json()
      setPartner(data.partner)
      setLedger(data.ledger || [])
      setBatches(data.batches || [])
      setTiers(
        Array.isArray(data.partner?.commission_tiers) && data.partner.commission_tiers.length > 0
          ? data.partner.commission_tiers
          : [{ min: 0, rate: data.partner?.commission_rate ?? 0.2 }]
      )
      setBaseRate(String(Math.round((data.partner?.base_rate_after ?? 0) * 1000) / 10))
      setTierMode(data.partner?.tier_mode === 'marginal' ? 'marginal' : 'book')
      setLadderMonths(String(data.partner?.ladder_months ?? 36))
    } finally {
      setLoading(false)
    }
  }, [partnerId])

  useEffect(() => { load() }, [load])

  async function saveConfig() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/partners/commission', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partner_id: partnerId,
          commission_tiers: tiers.map(t => ({ min: Number(t.min), rate: Number(t.rate) })),
          base_rate_after: Number(baseRate) / 100,
          tier_mode: tierMode,
          ladder_months: Number(ladderMonths),
        }),
      })
      const data = await res.json()
      setMessage(res.ok ? 'Villkoren sparade' : (data.error || 'Kunde inte spara'))
      if (res.ok) await load()
    } catch {
      setMessage('Nätverksfel')
    } finally {
      setSaving(false)
    }
  }

  async function action(body: Record<string, unknown>, label: string) {
    setBusy(label)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/partners/commission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage(
          body.action === 'run'
            ? `Körning klar: ${data.result?.rowsInserted ?? 0} rader, ${formatSek(data.result?.totalSek ?? 0)}`
            : body.action === 'create_batch'
              ? `Underlag skapat: ${formatSek(data.total_sek ?? 0)}`
              : 'Markerad som utbetald'
        )
        await load()
      } else {
        setMessage(data.error || 'Något gick fel')
      }
    } catch {
      setMessage('Nätverksfel')
    } finally {
      setBusy(null)
    }
  }

  // Perioder med oliggade accrued-rader → kandidater för "Skapa underlag".
  const senastePeriodMedAccrued = ledger
    .filter(r => r.status === 'accrued' && !r.payout_batch_id)
    .map(r => r.period)
    .sort()
    .pop() ?? null

  const forraManaden = (() => {
    const d = new Date()
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() === 0 ? 12 : d.getUTCMonth()).padStart(2, '0')}`
  })()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Provision — {partner?.name || '…'}
            </h3>
            {partner && (
              <p className="text-sm text-gray-500">
                Upplupet: <span className="font-medium">{formatSek(partner.total_pending_sek)}</span>
                {' · '}Utbetalt: <span className="font-medium">{formatSek(partner.total_earned_sek)}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary-700" /></div>
        ) : (
          <div className="space-y-6">
            {/* ── Villkor ── */}
            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Villkor</p>

              <div className="space-y-2">
                {tiers.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-sm text-gray-500 w-10">Från</span>
                    <input
                      type="number" min={0} value={t.min}
                      disabled={i === 0}
                      onChange={e => setTiers(prev => prev.map((x, j) => j === i ? { ...x, min: Number(e.target.value) } : x))}
                      className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50 disabled:text-gray-400"
                    />
                    <span className="text-sm text-gray-500">aktiva kunder →</span>
                    <input
                      type="number" min={0.1} max={100} step={0.5}
                      value={Math.round(t.rate * 1000) / 10}
                      onChange={e => setTiers(prev => prev.map((x, j) => j === i ? { ...x, rate: Number(e.target.value) / 100 } : x))}
                      className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                    />
                    <span className="text-sm text-gray-500">%</span>
                    {i > 0 && (
                      <button
                        onClick={() => setTiers(prev => prev.filter((_, j) => j !== i))}
                        className="p-1.5 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setTiers(prev => [...prev, { min: (prev[prev.length - 1]?.min ?? 0) + 5, rate: (prev[prev.length - 1]?.rate ?? 0.2) + 0.05 }])}
                  className="flex items-center gap-1.5 text-sm text-primary-700 hover:text-primary-800 font-medium"
                >
                  <Plus className="w-4 h-4" /> Lägg till trappsteg
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-gray-100">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Basnivå efter trappan (%)</label>
                  <input
                    type="number" min={0} max={100} step={0.5} value={baseRate}
                    onChange={e => setBaseRate(e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Trappmånader per kund</label>
                  <input
                    type="number" min={1} max={120} value={ladderMonths}
                    onChange={e => setLadderMonths(e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Trappeffekt</label>
                  <select
                    value={tierMode}
                    onChange={e => setTierMode(e.target.value as 'book' | 'marginal')}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white"
                  >
                    <option value="book">Hela kundstocken</option>
                    <option value="marginal">Bara kunder över tröskeln</option>
                  </select>
                </div>
              </div>

              <button
                onClick={saveConfig}
                disabled={saving}
                className="px-4 py-2 bg-primary-700 text-white text-sm font-medium rounded-lg hover:bg-primary-800 disabled:opacity-50"
              >
                {saving ? 'Sparar…' : 'Spara villkor'}
              </button>
            </div>

            {/* ── Åtgärder ── */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => action({ action: 'run' }, 'run')}
                disabled={busy !== null}
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                <Play className="w-4 h-4" />
                {busy === 'run' ? 'Kör…' : `Kör period (${forraManaden})`}
              </button>
              {senastePeriodMedAccrued && (
                <button
                  onClick={() => action({ action: 'create_batch', partner_id: partnerId, period: senastePeriodMedAccrued }, 'batch')}
                  disabled={busy !== null}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  <FileText className="w-4 h-4" />
                  {busy === 'batch' ? 'Skapar…' : `Skapa underlag t.o.m. ${senastePeriodMedAccrued}`}
                </button>
              )}
            </div>

            {message && (
              <p className="text-sm text-gray-700 bg-slate-50 rounded-lg px-3 py-2">{message}</p>
            )}

            {/* ── Batchar ── */}
            {batches.length > 0 && (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 border-b border-gray-100">Utbetalningsunderlag</p>
                <div className="divide-y divide-gray-50">
                  {batches.map(b => (
                    <div key={b.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">t.o.m. {b.period} · {formatSek(b.total_sek)}</p>
                        <p className="text-xs text-gray-500">
                          {b.status === 'paid'
                            ? `Utbetald ${b.paid_at ? new Date(b.paid_at).toLocaleDateString('sv-SE') : ''} av ${b.paid_by || '—'}`
                            : `Skapad ${new Date(b.created_at).toLocaleDateString('sv-SE')} — väntar på utbetalning`}
                        </p>
                      </div>
                      {b.status === 'open' ? (
                        <button
                          onClick={() => action({ action: 'mark_paid', batch_id: b.id }, `paid_${b.id}`)}
                          disabled={busy !== null}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-700 text-white text-xs font-medium rounded-lg hover:bg-primary-800 disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {busy === `paid_${b.id}` ? 'Markerar…' : 'Markera utbetald'}
                        </button>
                      ) : (
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-50 text-green-700">Utbetald</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Liggaren ── */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 border-b border-gray-100">
                Liggare ({ledger.length} rader)
              </p>
              {ledger.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">Inga provisionsrader ännu</p>
              ) : (
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-100">
                        <th className="px-4 py-2 font-medium">Period</th>
                        <th className="px-3 py-2 font-medium">Kund</th>
                        <th className="px-3 py-2 font-medium">Mån</th>
                        <th className="px-3 py-2 font-medium text-right">Bas</th>
                        <th className="px-3 py-2 font-medium">Sats</th>
                        <th className="px-3 py-2 font-medium text-right">Belopp</th>
                        <th className="px-4 py-2 font-medium text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {ledger.map(r => (
                        <tr key={r.id}>
                          <td className="px-4 py-2 text-gray-600">{r.period}</td>
                          <td className="px-3 py-2 text-gray-900">{r.business_name}</td>
                          <td className="px-3 py-2 text-gray-600">{r.customer_month}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{formatSek(Number(r.base_amount_sek))}</td>
                          <td className="px-3 py-2 text-gray-600">{pct(Number(r.rate))}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900">{formatSek(Number(r.amount_sek))}</td>
                          <td className="px-4 py-2 text-right">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              r.status === 'paid' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                            }`}>
                              {r.status === 'paid' ? 'Utbetald' : 'Upplupen'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
