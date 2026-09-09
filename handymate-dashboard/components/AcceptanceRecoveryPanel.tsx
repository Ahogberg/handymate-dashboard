'use client'
import { useEffect, useRef, useState } from 'react'
type Row = { quote_id: string; project_state: string; deal_state: string; email_state: string }
export default function AcceptanceRecoveryPanel({ onRecovered }: { onRecovered: () => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)
  const version = useRef(0)
  async function load() {
    const current = ++version.current
    try {
      const response = await fetch('/api/quotes/acceptance-recovery', { cache: 'no-store' })
      if (!mounted.current || current !== version.current) return
      if (response.status === 401 || response.status === 403) { setRows([]); setError(''); return }
      const body = await response.json()
      if (!mounted.current || current !== version.current) return
      if (!response.ok) throw new Error(body.error || 'Kunde inte läsa efterstegen.')
      if (mounted.current) { setRows(body.rows); setError('') }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Kunde inte läsa efterstegen.') }
  }
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false } }, [])
  async function resume(id: string) {
    if (busy) return
    setBusy(true)
    try {
      const response = await fetch('/api/quotes/acceptance-recovery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote_id: id }) })
      if (!response.ok) throw new Error('Kunde inte slutföra. Läs statusen och försök igen.')
      if (mounted.current) { await load(); onRecovered() }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Kunde inte slutföra.') }
    finally { if (mounted.current) setBusy(false) }
  }
  if (!rows.length && !error) return null
  return <section className="mx-4 mb-3 rounded-xl border border-amber-200 bg-white p-3 text-sm">
    {error && <p role="alert">{error} <button type="button" className="underline" onClick={() => void load()}>Kontrollera igen</button></p>}
    {!!rows.length && <details><summary className="cursor-pointer font-semibold">Accepterade offerter att slutföra</summary>
      <ul className="mt-3 space-y-3">{rows.map(row => <li key={row.quote_id} className="border-t pt-3">
        <a className="underline" href={`/dashboard/quotes/${encodeURIComponent(row.quote_id)}`}>Öppna offerten</a>
        <p>Projekt: {row.project_state === 'done' ? 'klart' : 'behöver kontrolleras'}. Affär: {['done', 'skipped'].includes(row.deal_state) ? 'klart' : 'behöver kontrolleras'}.</p>
        <p>{row.email_state === 'done' ? 'Bekräftelsen har skickats.' : row.email_state === 'skipped' ? 'Automatisk bekräftelse är avstängd.' : row.email_state === 'pending' ? 'Bekräftelsen är inte skickad. Öppna offerten och hantera kundkontakten.' : 'Mejlkvittensen är osäker. Kontrollera utskicket innan något skickas igen.'}</p>
        {(row.project_state !== 'done' || !['done', 'skipped'].includes(row.deal_state)) && <button type="button" disabled={busy} className="mt-2 rounded-lg bg-teal-700 px-3 py-2 text-white disabled:opacity-50" onClick={() => void resume(row.quote_id)}>{busy ? 'Kontrollerar…' : 'Slutför projekt och affär'}</button>}
      </li>)}</ul>
    </details>}
  </section>
}
