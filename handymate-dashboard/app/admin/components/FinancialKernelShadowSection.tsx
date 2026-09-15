'use client'
import { useEffect, useRef, useState } from 'react'

type Status = { phase: 'off' | 'S1' | 'S2'; phase_since: string | null; open: Record<string, number>; open_confirmed: number; unsupported_levels: number[]; last_run: { status: string; started_at: string } | null }
type Divergence = { id: string; kind: string; severity: string; invoice_id: string | null; expected: unknown; actual: unknown; confirmed_at: string | null }
const phaseLabels = { off: 'Avstängd', S1: 'S1 – jämförelse', S2: 'S2 – reserverad' }
const resolutionLabels = { accepted: 'Acceptera', fixed: 'Rättad', reference_error: 'Fel i referens', duplicate: 'Dubblett' }
const severityLabels: Record<string, string> = { critical: 'Kritisk', high: 'Hög', medium: 'Medel', low: 'Låg' }
const kindLabels: Record<string, string> = { PAYMENT_DIVERGENCE: 'Betalning', RECEIVABLE_BALANCE_DIVERGENCE: 'Fordrans saldo', ROUNDING_DIVERGENCE: 'Avrundning', MISSING_REFERENCE_ENTRY: 'Referens saknas', REFERENCE_DATA_UNAVAILABLE: 'Referensdata otillgängliga', MISSING_HANDYMATE_ENTRY: 'Underlag saknas i Handymate', PROJECTION_DIVERGENCE: 'Fakturans visade värde' }
export function phaseReceipt(owedIntents: number) {
  return `Fasen är sparad. ${owedIntents} redan utlovade utskick återstår och fortsätter behandlas.`
}
export function DivergenceEvidence({ row }: { row: Divergence }) {
  const evidence = (value: unknown) => value == null ? 'Underlag saknas' : JSON.stringify(value, null, 2)
  return <div className="mt-2 text-sm"><p>Faktura: {row.invoice_id || 'Saknas'}</p>
    <div className="mt-2 grid gap-2 sm:grid-cols-2"><div><p className="font-medium">Förväntat värde</p><pre className="whitespace-pre-wrap break-words rounded bg-gray-50 p-2">{evidence(row.expected)}</pre></div>
    <div><p className="font-medium">Observerat värde</p><pre className="whitespace-pre-wrap break-words rounded bg-gray-50 p-2">{evidence(row.actual)}</pre></div></div>
    <p className="text-xs text-gray-600">Belopp märkta minor anges i öre. Underlaget visar den senaste registrerade jämförelsen.</p>
  </div>
}
export default function FinancialKernelShadowSection({ businessId, onBusyChange }: { businessId: string; onBusyChange: (busy: boolean) => void }) {
  const [status, setStatus] = useState<Status | null>(null), [rows, setRows] = useState<Divergence[]>([])
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true)
  const [error, setError] = useState(''), [receipt, setReceipt] = useState('')
  const [phase, setPhase] = useState('S1'), [reason, setReason] = useState(''), [reference, setReference] = useState('')
  const [decision, setDecision] = useState<{ id: string; type: keyof typeof resolutionLabels } | null>(null)
  const generation = useRef(0)
  async function refresh() {
    const current = ++generation.current
    setLoading(true)
    try {
      const response = await fetch('/api/admin/financial-kernel/shadow?business=' + encodeURIComponent(businessId), { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kunde inte hämta jämförelsen')
      if (current === generation.current) { setStatus(data.status); setRows(data.divergences); setPhase(data.status.phase === 'off' ? 'S1' : 'off') }
    } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { if (current === generation.current) setLoading(false) }
  }
  useEffect(() => { void refresh(); return () => { generation.current++ } }, [businessId])
  async function act(kind: 'phase' | 'resolve' | 'run') {
    if (busy || (kind !== 'run' && reason.trim().length < 3)) return
    setBusy(true); onBusyChange(true); setError(''); setReceipt('')
    try {
      const path = kind === 'phase' ? 'phase' : kind === 'run' ? 'shadow/run' : 'shadow/' + encodeURIComponent(decision!.id) + '/resolve'
      const response = await fetch('/api/admin/financial-kernel/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business: businessId, ...(kind === 'phase' ? { phase, reason: reason.trim() } : kind === 'resolve' ? { type: decision!.type, reason: reason.trim(), fix_reference: reference || null } : {}) }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Åtgärden kunde inte bekräftas. Uppdatera vyn innan ett nytt försök.')
      setReceipt(kind === 'run' ? data.status === 'skipped' ? 'Ingen jämförelse kördes. Kontrollera fasen.' : data.status === 'failed' ? 'Körningen avslutades med fel. Kontrollera senaste körningen.' : 'Jämförelsen är registrerad.' : kind === 'phase' ? phaseReceipt(data.owed_intents) : 'Beslutet är sparat.')
      setDecision(null); setReason(''); setReference(''); await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false); onBusyChange(false) }
  }
  return <section className="mt-8 border-t pt-6">
    <h3 className="text-lg font-semibold">Ekonomikärnan — jämförelse</h3>
    <p className="mt-2 text-sm">Fas: {status ? phaseLabels[status.phase] : 'Hämtas'}</p>
    {status?.phase_since && <p className="text-sm text-gray-600">Sedan {new Date(status.phase_since).toLocaleString('sv-SE')}</p>}
    {loading && <p role="status">Hämtar jämförelse…</p>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {receipt && <p role="status" className="mt-2 text-teal-800">{receipt}</p>}
    {status && <>
      <div className="mt-4 rounded-lg bg-gray-50 p-3"><p>Avvikelser: {Object.values(status.open).reduce((a, b) => a + Number(b), 0)} · Bekräftade: {status.open_confirmed}</p><p className="text-sm">Ej stödd nivå 2–4. Jämförelsen omfattar endast fakturor och betalningar.</p>{Object.entries(status.open).map(([severity, n]) => <span className="mr-3 text-sm" key={severity}>{severityLabels[severity] || severity}: {n}</span>)}</div>
      <p className="mt-2 text-sm">Senaste körning: {status.last_run ? `${new Date(status.last_run.started_at).toLocaleString('sv-SE')} · ${{ running: 'Pågår', completed: 'Slutförd', failed: 'Misslyckad' }[status.last_run.status] || 'Okänd status'}` : 'Ingen registrerad'}</p>
      <div className="mt-3 flex gap-3"><button disabled={busy || loading || status.phase !== 'S1'} onClick={() => void act('run')} className="rounded-lg border p-2 text-teal-800">Kör jämförelse</button><button disabled={busy || loading} onClick={() => { setError(''); void refresh() }} className="rounded-lg border p-2">Uppdatera</button></div>
      {!decision && <label className="mt-4 block text-sm">Ändra fas<select disabled={busy} value={phase} onChange={e => setPhase(e.target.value)} className="ml-2 rounded border p-2"><option value="off">Avstängd</option><option value="S1">S1 – jämförelse</option></select></label>}
      <p className="mt-2 text-sm text-gray-600">S2 är reserverad och kan inte aktiveras.</p>
      {rows.map(row => <article key={row.id} className="mt-3 rounded-lg border p-3"><p className="font-medium">{kindLabels[row.kind] || 'Avvikelse'} · {severityLabels[row.severity]} · {row.confirmed_at ? 'Bekräftad' : 'Ny'}</p><DivergenceEvidence row={row} /><div className="mt-2 flex flex-wrap gap-3">{(Object.keys(resolutionLabels) as (keyof typeof resolutionLabels)[]).map(type => <button key={type} disabled={busy} onClick={() => { setDecision({ id: row.id, type }); setReason(''); setReference('') }} className="text-sm text-teal-800">{resolutionLabels[type]}</button>)}</div></article>)}
      <form className="mt-4 rounded-lg bg-gray-50 p-3" onSubmit={e => { e.preventDefault(); void act(decision ? 'resolve' : 'phase') }}>
        <p className="font-medium">{decision ? resolutionLabels[decision.type] : `Spara fas: ${phaseLabels[phase as keyof typeof phaseLabels]}`}</p>
        <label className="mt-2 block text-sm">Skäl (minst tre tecken)<textarea required minLength={3} maxLength={500} disabled={busy} value={reason} onChange={e => setReason(e.target.value)} className="mt-1 block w-full rounded border p-2" /></label>
        {decision && <label className="mt-2 block text-sm">Referens till rättning (valfri)<input maxLength={500} disabled={busy} value={reference} onChange={e => setReference(e.target.value)} className="mt-1 block w-full rounded border p-2" /></label>}
        <button disabled={busy || loading || reason.trim().length < 3} className="mt-3 rounded-lg bg-teal-700 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Arbetar…' : 'Spara beslut'}</button>
        {decision && <button type="button" disabled={busy} onClick={() => { setDecision(null); setReason('') }} className="ml-3">Avbryt</button>}
      </form>
    </>}
  </section>
}
