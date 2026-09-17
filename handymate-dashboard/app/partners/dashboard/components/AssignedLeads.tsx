'use client'
import { useCallback, useEffect, useState } from 'react'
import { PARTNER_LEAD_STATUS, sendPartnerLead, type PartnerLead } from '@/lib/revenue/partner-leads'
const field = 'mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm'
const button = 'rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'
// Leaden → säljgenomgången. Orgnummer och kontakt följer med i adressen så
// partnern inte skriver om det som redan står i leaden; genomgången slår upp
// företaget mot Bolagsverket precis som när numret skrivs för hand.
function genomgangsLank(snapshot: PartnerLead['snapshot']) {
  const q = new URLSearchParams()
  if (snapshot.org_number) q.set('org', snapshot.org_number)
  if (snapshot.contact_name) q.set('kontakt', snapshot.contact_name)
  if (snapshot.contact_email) q.set('epost', snapshot.contact_email)
  const fraga = q.toString()
  return '/partners/material/genomgang' + (fraga ? '?' + fraga : '')
}
function local(value: string | null) {
  if (!value) return ''
  const d = new Date(value)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16)
}
export default function AssignedLeads() {
  const [data, setData] = useState<{ leads: PartnerLead[]; total: number } | null>(null)
  const [offset, setOffset] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const res = await fetch(`/api/partners/leads?offset=${offset}`, { cache: 'no-store' })
    const body = await res.json()
    if (!res.ok) { setData(null); throw new Error(body.error) }
    setData(body); setError('')
  }, [offset])
  useEffect(() => { load().catch(e => setError(e.message)) }, [load])
  async function act(input: Record<string, unknown>) {
    setBusy(true); setError('')
    try { await sendPartnerLead('/api/partners/leads', input); await load() }
    catch (e) { setError((e as Error).message); await load().catch(() => {}); setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <section id="tilldelade-leads" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-slate-900">Leads från Handymate</h2><p className="mt-1 text-sm text-slate-500">Välj vilka leads du vill arbeta med och håll oss uppdaterade om nästa steg.</p></div><button className="text-sm text-teal-700 underline" onClick={() => load().catch(e => setError(e.message))}>Uppdatera leads</button></header>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!data && !error && <p role="status">Hämtar leads…</p>}
    {data?.total === 0 && <p className="text-sm text-slate-600">Du har inga tilldelade leads just nu. Nya leads från Handymate visas här.</p>}
    {data?.leads.map(l => <article key={`${l.id}-${l.version}`} className="space-y-3 rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{l.snapshot.company_name}</h3><span className="rounded-full bg-teal-50 px-3 py-1 text-xs text-teal-800">{PARTNER_LEAD_STATUS[l.status]}</span></div>
      <p className="text-sm text-slate-500">{[l.snapshot.org_number,l.snapshot.city,l.snapshot.industry].filter(Boolean).join(' · ')}</p>
      <p className="whitespace-pre-wrap text-sm">{l.brief}</p>
      <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm"><p className="font-medium">{l.snapshot.contact_name} {l.snapshot.contact_role}</p>
        {l.snapshot.contact_email && <a className="block break-all text-teal-700 underline" href={`mailto:${l.snapshot.contact_email}`}>{l.snapshot.contact_email}</a>}
        {l.snapshot.contact_phone && <a className="block text-teal-700 underline" href={`tel:${l.snapshot.contact_phone}`}>{l.snapshot.contact_phone}</a>}
      </div>
      {!['won','lost','declined','revoked'].includes(l.status) && <a href={genomgangsLank(l.snapshot)} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-slate-200 px-3.5 text-sm text-slate-700 hover:border-teal-400 hover:text-teal-800">Kör säljgenomgången för {l.snapshot.company_name}</a>}
      {!['won','lost','declined','revoked'].includes(l.status) && <form className="space-y-3" onSubmit={e => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        void act({ lead_id: l.id, version: l.version, status: f.get('status'), feedback: f.get('feedback'), next_action: f.get('next_action') || '', next_action_at: f.get('next_action_at') ? new Date(String(f.get('next_action_at'))).toISOString() : null })
      }}>
        <label className="block text-sm">Vad vill du göra?<select aria-label="Vad vill du göra?" name="status" className={field}>{(l.status === 'assigned' ? ['accepted','declined'] : ['contacted','meeting','won','lost']).map(s => <option key={s} value={s}>{({ accepted: 'Acceptera leaden', declined: 'Avböj leaden', contacted: 'Jag har kontaktat företaget', meeting: 'Möte bokat', won: 'Rapportera vunnen affär', lost: 'Avsluta som förlorad' } as Record<string,string>)[s]}</option>)}</select></label>
        <label className="block text-sm">Återkoppling till Handymate<textarea name="feedback" maxLength={4000} defaultValue={l.feedback || ''} className={field} placeholder="Beskriv läget. Orsak krävs vid avböjd eller avslutad lead." /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">Nästa aktivitet<input name="next_action" maxLength={1000} defaultValue={l.next_action || ''} className={field} /></label><label className="block text-sm">Planerad uppföljning<input name="next_action_at" type="datetime-local" defaultValue={local(l.next_action_at)} className={field} /></label></div>
        <button disabled={busy} className={button}>Spara mitt val</button>
      </form>}
      {['won','lost'].includes(l.status) && <p className="text-sm">{l.feedback}</p>}
    </article>)}
    {data && data.total > 50 && <div className="flex justify-between text-sm"><button disabled={offset === 0 || busy} onClick={() => setOffset(v => Math.max(0,v-50))}>Föregående</button><span>{offset+1}–{Math.min(offset+50,data.total)} av {data.total}</span><button disabled={offset+50>=data.total || busy} onClick={() => setOffset(v=>v+50)}>Nästa</button></div>}
    <p className="text-xs text-slate-500">Tilldelade leads är möjliga affärer. Provision och kundregistrering följer det ordinarie partnerflödet. Ditt rapporterade utfall är inte en betalningsbekräftelse.</p>
  </section>
}
