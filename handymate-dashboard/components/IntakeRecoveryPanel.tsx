'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
type Row = { id: string; input: { name: string; phone: string }; state: string; error_code: string | null; notice_state: string }
export default function IntakeRecoveryPanel({ onRecovered }: { onRecovered: () => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const version = useRef(0)
  const load = useCallback(async () => {
    const n = ++version.current
    try {
      const response = await fetch('/api/leads/intake-recovery', { cache: 'no-store' })
      if (n !== version.current) return
      if (response.status === 401 || response.status === 403) { setRows([]); setError(null); return }
      if (!response.ok) throw Error('Kunde inte kontrollera mottagna förfrågningar.')
      const data = await response.json()
      if (n === version.current) { setRows(data.requests); setError(null) }
    } catch { if (n === version.current) setError('Kunde inte kontrollera mottagna förfrågningar.') }
  }, [])
  useEffect(() => { void load(); return () => { version.current++ } }, [load])
  async function retry(id: string) {
    if (busy) return
    const n = version.current
    setBusy(id); setError(null)
    try {
      const response = await fetch('/api/leads/intake-recovery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receipt_id: id }) })
      const data = await response.json()
      if (n !== version.current) return
      if (!response.ok) throw Error(data.error || 'Förfrågan kunde inte slutföras.')
      await load()
      if (data.success) onRecovered()
      else setError(data.message)
    } catch (e) { if (n === version.current) setError(e instanceof Error ? e.message : 'Förfrågan kunde inte slutföras.') }
    finally { setBusy(null) }
  }
  if (!rows.length && !error) return null
  return <section className="mx-4 mb-3 rounded-xl border border-amber-200 bg-white p-3 text-sm">
    {error && <p role="alert" className="mb-2 text-amber-800">{error} <button type="button" className="underline" onClick={() => void load()}>Kontrollera igen</button></p>}
    {rows.length > 0 && <details><summary className="cursor-pointer font-semibold text-slate-800">Mottagna förfrågningar att kontrollera</summary>
      <ul className="mt-3 max-h-60 space-y-3 overflow-auto">{rows.map(row => <li key={row.id} className="border-t border-slate-100 pt-3">
        <p className="font-medium">{row.input.name} · {row.input.phone}</p>
        <p className="my-1 text-slate-600">{row.state === 'completed'
          ? 'Förfrågan och affären är sparade. Kontrollera notiserna innan något skickas igen.'
          : row.error_code === 'customer_ambiguous' ? 'Flera kunder matchar. Kontrollera dubbletterna i kundregistret och försök sedan igen.'
          : 'Mottagen, men kundkoppling och affär är inte färdigställda.'}</p>
        {(row.state !== 'completed' || row.notice_state === 'not_started') && <button type="button" disabled={busy !== null} className="rounded-lg bg-teal-700 px-3 py-2 text-white disabled:opacity-50" onClick={() => void retry(row.id)}>{busy === row.id ? 'Kontrollerar…' : 'Försök slutföra'}</button>}
      </li>)}</ul></details>}
  </section>
}
