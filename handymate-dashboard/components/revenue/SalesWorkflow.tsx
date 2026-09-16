'use client'
import { useState } from 'react'
import type { Account, Contact } from '@/lib/revenue/domain'
import { SEQUENCE_STEPS, type SalesSequence } from '@/lib/revenue/qualification'

const field = 'mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm'
const button = 'rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'
type Act = (type: string, input: Record<string, unknown>) => Promise<unknown>
export function QualificationForm({ account: a, busy, act }: { account: Account; busy: boolean; act: Act }) {
  const q = a.qualification
  return <section className="space-y-3 rounded-2xl border bg-white p-5">
    <h3 className="font-semibold">Kvalificering och företagsuppgifter</h3>
    <p className="text-sm text-slate-600">Bekräfta varje uppgift med en källa eller ett samtal. Målgruppen ger 15 poäng och 3–20 anställda ytterligare 10. Övriga poäng kräver bekräftat behov, tillväxt, relation eller budget.</p>
    <form key={a.version} className="space-y-3" onSubmit={async e => {
      e.preventDefault()
      const form = new FormData(e.currentTarget)
      const input: Record<string, unknown> = Object.fromEntries(form)
      for (const key of ['swedish_trade', 'confirmed_pain', 'confirmed_growth', 'warm_relationship', 'confirmed_budget']) input[key] = form.get(key) === 'on'
      await act('qualify', { ...input, version: a.version })
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>Bransch<input name="industry" defaultValue={a.industry || ''} className={field} /></label>
        <label>Ort<input name="city" defaultValue={a.city || ''} className={field} /></label>
        <label>Antal anställda<input name="employee_count" type="number" min="0" max="100000" defaultValue={a.employee_count ?? ''} className={field} /></label>
        <label>Företagets webbplats<input name="website" type="url" defaultValue={a.website || ''} placeholder="https://" className={field} /></label>
      </div>
      {([
        ['swedish_trade', 'Svenskt hantverks- eller serviceföretag'],
        ['confirmed_pain', 'Kunden har beskrivit ett konkret administrationsbehov'],
        ['confirmed_growth', 'Tillväxt är bekräftad, utöver en rekryteringsannons'],
        ['warm_relationship', 'Personlig introduktion eller etablerad relation'],
        ['confirmed_budget', 'Kunden har bekräftat budget för lösningen'],
      ] as const).map(([key, label]) => <label key={key} className="flex gap-2 text-sm"><input name={key} type="checkbox" defaultChecked={q?.[key] || false} />{label}</label>)}
      <label className="block text-sm">Källa och bekräftade uppgifter<textarea name="evidence" required maxLength={4000} defaultValue={q?.evidence || ''} className={field} rows={3} /></label>
      <label className="block text-sm">Källans webbadress, om tillämpligt<input type="url" name="source_url" defaultValue={q?.source_url || ''} className={field} /></label>
      <label className="block text-sm">Bekräftat datum<input type="date" required name="observed_at" defaultValue={q?.observed_at.slice(0, 10) || new Date().toISOString().slice(0, 10)} className={field} /></label>
      <button disabled={busy} className={button}>Spara kvalificering och räkna poäng</button>
    </form>
  </section>
}

export function SequencePanel({ account, contacts, sequences, busy, act }: { account: Account; contacts: Contact[]; sequences: SalesSequence[]; busy: boolean; act: Act }) {
  const current = sequences.find(s => s.status === 'active')
  const contact = contacts.find(c => c.id === current?.contact_id)
  const [copyStatus, setCopyStatus] = useState('')
  const eligible = contacts.filter(c => c.email && c.phone)
  return <section className="space-y-3 rounded-2xl border bg-white p-5">
    <h3 className="font-semibold">Kontaktsekvens · tre manuella steg</h3>
    <ol className="list-inside list-decimal text-sm text-slate-600">{SEQUENCE_STEPS.map(s => <li key={s}>{s}</li>)}</ol>
    <p className="text-sm">Nästa steg planeras efter två respektive tre dagar, med helg flyttad till måndag. Svar eller annan kontakt avbryter sekvensen så att du kan planera personligt.</p>
    {current ? <>
      <p className="font-medium">Steg {current.step + 1}: {SEQUENCE_STEPS[current.step]}</p>
      <p className="text-sm">{contact?.name} · {new Date(current.due_at).toLocaleString('sv-SE')}</p>
      <p className="break-words text-sm">{contact?.phone} · {contact?.email}</p>
      <form key={`${current.id}-${account.version}-${current.approved_at}`} className="space-y-3" onSubmit={async e => {
        e.preventDefault()
        const body = String(new FormData(e.currentTarget).get('body'))
        const result = await act('sequence_approve', { sequence_id: current.id, version: account.version, body })
        if (result) {
          try { await navigator.clipboard.writeText(body); setCopyStatus('Granskat och kopierat. Genomför kontakten och logga sedan utfallet.') }
          catch { setCopyStatus('Granskat. Kopiera texten manuellt.') }
        }
      }}>
        <label className="block text-sm">{current.step === 1 ? 'Mejltext att granska' : 'Samtalsunderlag att granska'}<textarea name="body" className={field} rows={6} required maxLength={10000} defaultValue={current.body} /></label>
        <button className={button} disabled={busy}>Granska och kopiera underlag</button>
      </form>
      {copyStatus && <p role="status" className="text-sm">{copyStatus}</p>}
      <p className="text-xs text-slate-500">{current.approved_at ? 'Underlaget är granskat. Ingen kontakt är ännu loggad för steget.' : 'Granska underlaget innan du loggar steget.'}</p>
      <form className="space-y-3" onSubmit={async e => {
        e.preventDefault()
        await act('sequence_complete', { ...Object.fromEntries(new FormData(e.currentTarget)), sequence_id: current.id, version: account.version })
        setCopyStatus('')
      }}>
        <label className="block text-sm">Sekvensens utfall<select name="outcome" className={field}>
          <option value="no_response">Genomfört kontaktförsök, inget svar</option>
          <option value="connected">Kontakt etablerad</option><option value="replied">Svar mottaget</option>
          <option value="declined">Avböjt</option><option value="pause">Pausa</option><option value="opt_out">Vill inte bli kontaktad</option>
        </select></label>
        <label className="block text-sm">Vad gjorde du och vad hände?<textarea name="summary" required maxLength={5000} className={field} /></label>
        <button className={button} disabled={busy || !current.approved_at || Date.parse(current.due_at) > Date.now()}>Logga genomförd kontakt och planera nästa steg</button>
      </form>
      <button className="text-sm text-red-700 underline" disabled={busy} onClick={() => act('sequence_stop', { version: account.version })}>Stoppa sekvensen</button>
    </> : <>
      {!eligible.length && <p className="text-sm text-amber-800">Lägg till en kontakt med både telefon och e-post för att starta.</p>}
      <form className="space-y-3" onSubmit={async e => {
        e.preventDefault()
        const form = new FormData(e.currentTarget)
        await act('sequence_start', { contact_id: form.get('contact_id'), due_at: new Date(String(form.get('due_at'))).toISOString(), version: account.version })
      }}>
        <label className="block text-sm">Kontakt för sekvensen<select name="contact_id" required className={field}>{eligible.map(c => <option key={c.id} value={c.id}>{c.name} · {c.email}</option>)}</select></label>
        <label className="block text-sm">Starttid<input name="due_at" type="datetime-local" required className={field} defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} /></label>
        <button disabled={busy || !eligible.length || account.contact_state !== 'active' || ['won', 'lost', 'nurture'].includes(account.status)} className={button}>Starta kontaktsekvens</button>
      </form>
      {sequences[0] && <p className="text-sm text-slate-600">Senaste sekvens: {sequences[0].status === 'completed' ? 'Slutförd' : 'Stoppad'}{sequences[0].stop_reason ? ` · ${sequences[0].stop_reason}` : ''}</p>}
    </>}
  </section>
}
