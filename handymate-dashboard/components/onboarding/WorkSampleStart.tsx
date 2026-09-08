'use client'

import { useEffect, useRef, useState } from 'react'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { readWorkSample, type WorkSample } from '@/lib/onboarding/work-sample'

export function WorkSampleStart({ businessId, source: initialSource = '', sample: initialSample, onContinue }: {
  businessId: string; source?: string; sample?: unknown
  onContinue: (source: string, sample: WorkSample | null) => Promise<void>
}) {
  const [source, setSource] = useState(initialSource)
  const [sample, setSample] = useState(() => readWorkSample(initialSample))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const storageKey = `handymate:work-sample:${businessId}`
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null')
      if (saved && typeof saved.source === 'string' && saved.source.length <= 4000) {
        setSource(saved.source); setSample(readWorkSample(saved.sample))
      }
    } catch { /* Storage is optional; server save on Continue remains authoritative. */ }
    setRestored(true)
  }, [storageKey])
  useEffect(() => {
    if (!restored) return
    try { sessionStorage.setItem(storageKey, JSON.stringify({ source, sample })) } catch { /* Private browser mode. */ }
  }, [storageKey, restored, source, sample])
  async function run(action: () => Promise<void>) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : 'Försök igen. Din text finns kvar.') }
    finally { lock.current = false; setBusy(false) }
  }
  return <section className="ob-screen" aria-label="Ditt första arbetsprov" aria-busy={busy}>
    <div className="ob-body">
      <div className="flex items-center gap-3 mb-4"><AgentAvatar agentKey="daniel" size="sm" /><span className="text-sm text-teal-800">Daniel · vi börjar med ditt jobb</span></div>
      <h1 className="ob-headline">Visa oss något som ligger och väntar.</h1>
      <p className="ob-sub">Klistra in en kundförfrågan eller dina anteckningar. Du får ett offertunderlag innan du ställer in resten av firman.</p>
      <div className="grid md:grid-cols-2 gap-5 mt-5">
        <label className="block text-sm font-medium">Din förfrågan
          <textarea value={source} maxLength={4000} rows={8} disabled={busy}
            onChange={e => { setSource(e.target.value); setSample(null) }}
            placeholder="Kunden vill byta sex innerdörrar och få de gamla bortforslade…"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-base font-normal" />
          <span className="block text-xs font-normal text-slate-500 mt-1">Ta bara med uppgifter som behövs för jobbet. Du kan prova upp till tre gånger.</span>
        </label>
        <div className="rounded-xl border border-teal-100 bg-white p-4" aria-live="polite">
          <h2 className="font-semibold text-teal-900">{sample ? sample.title : 'Ditt förberedda underlag'}</h2>
          {sample ? <><p className="whitespace-pre-wrap text-sm mt-3">{sample.description}</p>
            <ul className="mt-4 space-y-3">{sample.items.map((row, i) => <li key={i} className="border-t pt-2 text-sm"><strong>{row.description}</strong><span className="block text-slate-500">Mängdförslag: {row.quantity} {row.unit} · Pris saknas</span></li>)}</ul>
            <p className="mt-4 text-xs text-amber-800">Granska omfattning och mängder. Dina priser och eventuella avdrag lägger du till i offertbyggaren. Inget är skickat.</p>
          </> : <p className="text-sm text-slate-500 mt-3">Daniel förbereder arbetsmomenten från din text. När något saknas får du komplettera det.</p>}
        </div>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </div>
    <div className="ob-footer flex flex-wrap gap-3">
      {!sample && <button type="button" className="ob-cta" disabled={busy || source.trim().length < 8} onClick={() => void run(async () => {
        const response = await fetch('/api/onboarding/work-sample', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source }) })
        const json = await response.json()
        if (!response.ok) throw new Error(json.error || 'Kunde inte förbereda jobbet.')
        const prepared = readWorkSample(json.sample)
        if (!prepared) throw new Error('Underlaget kunde inte läsas. Din text finns kvar.')
        setSample(prepared)
      })}>{busy ? 'Arbetar…' : 'Förbered mitt jobb'}</button>}
      <button type="button" className={sample ? 'ob-cta' : 'min-h-[44px] text-sm text-teal-800 underline'} disabled={busy}
        onClick={() => void run(async () => {
          await onContinue(source, sample)
          try { sessionStorage.removeItem(storageKey) } catch { /* Optional local backup. */ }
        })}>{sample ? 'Behåll underlaget och fortsätt' : 'Fortsätt med inställningarna'}</button>
    </div>
  </section>
}
