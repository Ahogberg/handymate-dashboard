'use client'

import { useEffect, useRef, useState } from 'react'
import { applyVisitRule, readVisitRule, type VisitRule } from '@/lib/quotes/visit-rule'

export function VisitRuleEditor({ jobType, description, onApply }: {
  jobType: string | null; description: string; onApply: (description: string) => void
}) {
  const [visits, setVisits] = useState('2')
  const [scope, setScope] = useState<'quote' | 'job'>('quote')
  const [savedRule, setSavedRule] = useState<VisitRule | null>(null)
  const [allowed, setAllowed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{ before: string; after: string; visits: number; jobType: string | null; scope: 'quote' | 'job' } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const lock = useRef(false)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const current = useRef({ description, jobType }); current.current = { description, jobType }
  useEffect(() => {
    let active = true
    setAllowed(false); setSavedRule(null); setPreview(null); setReceipt(''); setError(''); setLoading(true)
    if (!jobType) { setLoading(false); return }
    fetch(`/api/quotes/visit-rule?jobType=${encodeURIComponent(jobType)}`, { cache: 'no-store' }).then(async response => {
      if (response.status === 403) return
      if (!response.ok) throw new Error('Kunde inte läsa din jobbregel.')
      const json = await response.json()
      if (!active) return
      const rule = readVisitRule(json.rule)
      setSavedRule(rule); setAllowed(true)
      if (rule) setVisits(String(rule.visits))
    }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [jobType, attempt])
  if (!jobType) return null
  if (!loading && !allowed && !error) return null
  const number = Number(visits)
  return <section className="my-4 rounded-xl border border-teal-200 bg-white p-4" aria-label="Så jobbar vi">
    <h2 className="font-semibold text-teal-900">Så jobbar vi · planerade besök</h2>
    <p className="mt-2 text-sm text-slate-600">Låt ditt arbetssätt synas i offerten. Regeln lägger till antal besök i beskrivningen. Priser och timmar ändras inte.</p>
    {savedRule && <p className="mt-2 text-sm text-teal-800">Din sparade regel för jobbtypen: {savedRule.visits} besök.</p>}
    {loading ? <p role="status">Läser din jobbregel…</p> : allowed && <>
      <label className="block mt-3 text-sm">Antal besök<input type="number" min={1} max={20} step={1} value={visits} disabled={busy}
        onChange={e => { setVisits(e.target.value); setPreview(null) }} className="block mt-1 min-h-[44px] w-24 rounded-lg border p-2 text-base" /></label>
      <fieldset className="mt-3" disabled={busy}><legend className="text-sm font-medium">Var ska regeln gälla?</legend>
        <label className="flex items-center gap-2 min-h-[44px] text-sm"><input type="radio" checked={scope === 'quote'} onChange={() => { setScope('quote'); setPreview(null) }} />Bara den här offerten</label>
        <label className="flex items-center gap-2 min-h-[44px] text-sm"><input type="radio" checked={scope === 'job'} onChange={() => { setScope('job'); setPreview(null) }} />Även nya AI-utkast för den här jobbtypen</label>
      </fieldset>
      <button type="button" disabled={busy || !Number.isInteger(number) || number < 1 || number > 20}
        onClick={() => { setError(''); setReceipt(''); setPreview({ before: description, after: applyVisitRule(description, number), visits: number, jobType, scope }) }}
        className="min-h-[44px] text-sm font-semibold text-teal-800 underline">Visa ändringen först</button>
      {preview && <div className="mt-3 rounded-lg bg-teal-50 p-3">
        <div className="grid md:grid-cols-2 gap-4 text-sm"><div><strong>Nu</strong><p className="whitespace-pre-wrap mt-2">{preview.before || 'Ingen beskrivning ännu.'}</p></div><div><strong>Efter ditt godkännande</strong><p className="whitespace-pre-wrap mt-2">{preview.after}</p></div></div>
        <button type="button" disabled={busy} className="mt-3 min-h-[44px] rounded-lg bg-teal-700 px-4 text-sm font-medium text-white" onClick={async () => {
          if (lock.current) return
          if (current.current.description !== preview.before || current.current.jobType !== preview.jobType) { setPreview(null); setError('Offerten ändrades. Förhandsgranska på nytt.'); return }
          lock.current = true; setBusy(true); setError('')
          try {
            if (preview.scope === 'job') {
              const response = await fetch('/api/quotes/visit-rule', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ version: 1, kind: 'planned_visits', jobType: preview.jobType, visits: preview.visits }) })
              const json = await response.json()
              if (!mounted.current) return
              if (!response.ok) throw new Error(json.error || 'Kunde inte spara jobbregeln.')
              const rule = readVisitRule(json.rule)
              if (!rule) throw new Error('Kunde inte bekräfta den sparade regeln.')
              setSavedRule(rule)
            }
            if (!mounted.current) return
            if (current.current.description !== preview.before || current.current.jobType !== preview.jobType) {
              setPreview(null)
              throw new Error(preview.scope === 'job' ? 'Jobbregeln sparades. Offerten ändrades under tiden och behöver granskas på nytt.' : 'Offerten ändrades. Förhandsgranska på nytt.')
            }
            onApply(preview.after); setPreview(null)
            setReceipt(preview.scope === 'job' ? 'Din regel är sparad för jobbtypen och infogad i denna offert. Spara offerten när du är klar.' : 'Infogat i denna offert. Ingen regel sparades för framtida jobb. Spara offerten när du är klar.')
          } catch (e) { setError(e instanceof Error ? e.message : 'Kunde inte spara.') }
          finally { lock.current = false; setBusy(false) }
        }}>{busy ? 'Sparar…' : preview.scope === 'job' ? 'Spara regeln och använd här' : 'Använd i den här offerten'}</button>
        <button type="button" disabled={busy} className="ml-3 min-h-[44px] text-sm underline" onClick={() => setPreview(null)}>Avbryt</button>
      </div>}
    </>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error} {!allowed && <button type="button" onClick={() => setAttempt(n => n + 1)} className="underline min-h-[44px]">Försök igen</button>}</p>}
    {receipt && <p role="status" className="mt-3 text-sm text-teal-800">{receipt}</p>}
  </section>
}
