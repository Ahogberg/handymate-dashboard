'use client'
import { useEffect, useState } from 'react'
import { TEMPLATES, isTemplate, validateAnswers, type TemplateKey, type Answers } from '@/lib/customer-preparation/contract'

type RequestData = { template: TemplateKey; context: string; due_date: string | null; status: string }
export default function PreparationPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<RequestData | null>(null)
  const [answers, setAnswers] = useState<Answers>({})
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setData(null); setError(''); setAnswers({}); setFiles([]); setSent(false)
    fetch(`/api/preparation/${encodeURIComponent(params.token)}`, { cache: 'no-store' })
      .then(async res => { const body = await res.json(); if (!res.ok || !isTemplate(body.template)) throw new Error(body.error || 'Kunde inte läsa underlaget.'); return body })
      .then(body => { if (active) { setData(body); setSent(body.status !== 'open') } })
      .catch(err => { if (active) setError(err.message || 'Kunde inte läsa underlaget.') })
    return () => { active = false }
  }, [params.token, attempt])
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!data || busy) return
    setError('')
    try {
      const validated = validateAnswers(data.template, answers)
      if (files.length > 3 || files.reduce((sum, file) => sum + file.size, 0) > 3 * 1024 * 1024) throw new Error('Välj högst tre bilder och högst 3 MB totalt.')
      setBusy(true)
      const form = new FormData(); form.set('answers', JSON.stringify(validated))
      files.forEach(file => form.append('images', file))
      const res = await fetch(`/api/preparation/${encodeURIComponent(params.token)}`, { method: 'POST', body: form })
      const body = await res.json()
      if (!res.ok || !body.success) throw new Error(body.error || 'Kunde inte spara svaret.')
      setSent(true)
    } catch (err) { setError(err instanceof Error ? err.message : 'Kunde inte spara svaret. Läs in sidan igen för att kontrollera om det kom fram.') }
    finally { setBusy(false) }
  }
  return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
    <div className="mx-auto max-w-xl rounded-2xl border bg-white p-6 shadow-sm">
      <p className="mb-2 text-sm font-semibold text-teal-700">Inför ditt arbete</p>
      <h1 className="text-2xl font-semibold">{data ? TEMPLATES[data.template].label : 'Kundunderlag'}</h1>
      {error && <div role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-red-800">{error}<button type="button" className="block min-h-[44px] underline" onClick={() => setAttempt(n => n + 1)}>Läs in igen</button></div>}
      {!data && !error && <p role="status" className="mt-4">Läser in…</p>}
      {sent ? <div role="status" className="mt-6 rounded-xl bg-teal-50 p-5"><h2 className="font-semibold">Ditt svar är mottaget</h2><p className="mt-2">Företaget kan nu läsa ditt underlag. Eventuella ändringar av pris, arbete eller tid bekräftas separat. Kontakta företaget om du behöver ändra ditt svar.</p></div> : data && <form onSubmit={submit} className="mt-5 space-y-5">
        <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4">{data.context}</p>
        <p>{TEMPLATES[data.template].intro}</p>
        {data.due_date && <p className="font-medium">Önskat svar senast {data.due_date}</p>}
        {TEMPLATES[data.template].questions.map(question => <label key={question.id} className="block font-medium">{question.label}{!question.required && ' (valfritt)'}<textarea required={question.required} maxLength={1500} rows={3} disabled={busy} value={answers[question.id] || ''} onChange={event => setAnswers(previous => ({ ...previous, [question.id]: event.target.value }))} className="mt-2 block w-full rounded-lg border border-slate-300 p-3 font-normal focus:outline-teal-700" /></label>)}
        <label className="block font-medium">Bilder (valfritt)<span className="my-2 block text-sm font-normal">{TEMPLATES[data.template].photos} Högst tre bilder, 3 MB totalt. JPG, PNG eller WebP.</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={event => setFiles(Array.from(event.target.files || []))} className="sr-only" /><span className="inline-block cursor-pointer rounded-lg border border-teal-700 px-4 py-3 text-sm text-teal-800">Välj bilder</span></label>
        {files.length > 0 && <p className="text-sm">{files.length} bilder valda · {(files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(1)} MB</p>}
        <p className="text-sm text-slate-500">Dela bara information som behövs för arbetet. Undvik personnummer, koder och bilder på andra personer.</p>
        <button disabled={busy} className="min-h-[48px] w-full rounded-lg bg-teal-700 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Sparar…' : 'Lämna underlag'}</button>
      </form>}
    </div>
  </main>
}
