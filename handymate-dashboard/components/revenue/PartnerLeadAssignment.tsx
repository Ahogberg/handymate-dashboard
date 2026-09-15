'use client'
import { useCallback, useEffect, useState } from 'react'
import type { Account, Contact } from '@/lib/revenue/domain'
import { PARTNER_LEAD_STATUS, sendPartnerLead, type PartnerLead } from '@/lib/revenue/partner-leads'
const endpoint = '/api/admin/revenue/partner-leads'
const field = 'mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm'
const button = 'rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'
type Partner = { id: string; name: string; company: string | null }
export function PartnerLeadAssignment({ account, contacts, onChanged }: { account: Account; contacts: Contact[]; onChanged: () => Promise<void> }) {
  const [data, setData] = useState<{ partners: Partner[]; leads: PartnerLead[] } | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  const [contactId, setContactId] = useState('')
  const load = useCallback(async () => {
    const res = await fetch(`${endpoint}?account_id=${account.id}`, { cache: 'no-store' })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error)
    setData(body)
  }, [account.id])
  useEffect(() => { load().catch(e => setError(e.message)) }, [load])
  const active = data?.leads.find(l => ['assigned','accepted','contacted','meeting'].includes(l.status))
  const eligible = contacts.filter(c => c.email || c.phone)
  const contact = eligible.find(c => c.id === contactId) || eligible[0]
  async function act(input: Record<string, unknown>) {
    setBusy(true); setError(''); setNotice('')
    try {
      await sendPartnerLead(endpoint, input)
      await load(); await onChanged()
      setNotice(input.type === 'assign' ? 'Leaden finns nu i partnerns portal.' : 'Tilldelningen är återkallad och visas inte längre för partnern.')
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <section className="space-y-3 rounded-2xl border bg-white p-5">
    <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Dela lead med partner</h3><button className="text-sm text-teal-700 underline" onClick={() => load().catch(e => setError(e.message))}>Hämta partnerstatus</button></div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-teal-800">{notice}</p>}
    {!data && !error && <p>Hämtar partners…</p>}
    {data && !active && <form className="space-y-3" onSubmit={e => {
      e.preventDefault()
      const form = new FormData(e.currentTarget)
      void act({ type: 'assign', account_id: account.id, version: account.version, partner_id: form.get('partner_id'), contact_id: contact?.id, brief: form.get('brief') })
    }}>
      <label className="block text-sm">Mottagande partner<select name="partner_id" required className={field}>{data.partners.map(p => <option key={p.id} value={p.id}>{p.company || p.name} · {p.name}</option>)}</select></label>
      {!data.partners.length && <p className="text-sm text-amber-800">Ingen aktiv partner med godkänt avtal är tillgänglig.</p>}
      <label className="block text-sm">Kontakt att dela<select value={contact?.id || ''} onChange={e => setContactId(e.target.value)} required className={field}>{eligible.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      {!eligible.length && <p className="text-sm text-amber-800">Lägg först till en kontakt med telefon eller e-post.</p>}
      <div className="rounded-lg bg-stone-50 p-3 text-sm"><strong>Det här delas</strong><p>{account.company_name} · {account.org_number} · {account.city} · {account.industry}</p><p>{account.website}</p><p className="break-words">{contact?.name} · {contact?.role} · {contact?.email} · {contact?.phone}</p><p className="mt-2 text-xs text-slate-500">Företagsuppgifterna ovan, vald kontakt med dess källänk och underlaget nedan. Interna anteckningar och poäng delas inte. Pågående kontaktsekvens stoppas.</p></div>
      <label className="block text-sm">Underlag till partnern<textarea name="brief" required maxLength={4000} rows={4} className={field} placeholder="Beskriv behovet, varför kontakten är relevant och vad partnern bör göra." /></label>
      <button disabled={busy || !data.partners.length || !contact || account.contact_state !== 'active' || ['won','lost','nurture'].includes(account.status)} className={button}>Tilldela lead till partner</button>
    </form>}
    {data?.leads.map(l => <div key={l.id} className="space-y-2 border-t pt-3 text-sm">
      <p className="font-medium">{data.partners.find(p => p.id === l.partner_id)?.company || data.partners.find(p => p.id === l.partner_id)?.name || 'Tidigare partner'} · {PARTNER_LEAD_STATUS[l.status]}</p>
      <p className="whitespace-pre-wrap">{l.brief}</p>
      {l.feedback && <p>Partnerns återkoppling: {l.feedback}</p>}
      {l.next_action && <p>Nästa steg: {l.next_action} {l.next_action_at && ` · ${new Date(l.next_action_at).toLocaleString('sv-SE')}`}</p>}
      <p className="text-xs text-slate-500">Uppdaterad {new Date(l.updated_at).toLocaleString('sv-SE')}. Partnerns utfall ändrar inte betalning eller provision.</p>
      {l.status !== 'revoked' && <button disabled={busy} className="text-red-700 underline" onClick={() => act({ type: 'revoke', lead_id: l.id, version: l.version })}>Återkalla tilldelning</button>}
    </div>)}
  </section>
}
