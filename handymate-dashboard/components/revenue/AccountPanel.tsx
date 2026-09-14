'use client'
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { sendRevenue } from '@/lib/revenue/client'
import { OUTREACH_ANGLES, OUTREACH_CTAS } from '@/lib/revenue/outreach'
import {
  STAGES,
  type Account,
  type Activity,
  type Contact,
  type Draft,
  type Session,
  type Signal,
} from '@/lib/revenue/domain'

type Detail = {
  account: Account
  contacts: Contact[]
  activities: Activity[]
  signals: Signal[]
  sessions: Session[]
  drafts: Draft[]
  manager: boolean
}
const field =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm'
const button =
  'rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'
const outcomes: Record<string, string> = {
  connected: 'Kontakt etablerad',
  no_response: 'Inget svar',
  replied: 'Svar mottaget',
  declined: 'Avböjt',
  pause: 'Pausa kontakten',
  opt_out: 'Vill inte bli kontaktad',
  completed: 'Genomfört',
}
function Input({
  label,
  name,
  value,
  type = 'text',
  required = false,
}: {
  label: string
  name: string
  value?: string | null
  type?: string
  required?: boolean
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        name={name}
        defaultValue={value || ''}
        type={type}
        required={required}
        className={field}
      />
    </label>
  )
}
function localDate(value: string | null) {
  if (!value) return ''
  const d = new Date(value)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
}
function external(url: string | null) {
  try {
    const u = new URL(url || '')
    return u.protocol === 'https:' ? u.href : undefined
  } catch {
    return undefined
  }
}
export function AccountPanel({
  id,
  onClose,
  onChanged,
}: {
  id: string
  onClose: () => void
  onChanged: () => void
}) {
  const router = useRouter(),
    dialog = useRef<HTMLDialogElement>(null)
  const [data, setData] = useState<Detail | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [formRevision, setFormRevision] = useState(0)
  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/revenue?account_id=${id}`, {
      cache: 'no-store',
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error)
    setData(body)
  }, [id])
  useEffect(() => {
    dialog.current?.showModal()
    let active = true
    load().catch((e) => {
      if (active) setError(e.message)
    })
    return () => {
      active = false
    }
  }, [load])
  async function act(type: string, input: Record<string, unknown> = {}) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const r = await sendRevenue(type, { account_id: id, ...input })
      await load()
      onChanged()
      setNotice('Sparat.')
      setFormRevision((v) => v + 1)
      return r
    } catch (e) {
      setError((e as Error).message)
      return null
    } finally {
      setBusy(false)
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>, type: string) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const input: Record<string, unknown> = Object.fromEntries(form)
    if (type === 'next' || type === 'outreach') input.version = data?.account.version
    if (type === 'activity') input.make_draft = form.get('make_draft') === 'on'
    const r = await act(type, input)
    if (r && type === 'contact') e.currentTarget?.reset()
  }
  async function start() {
    const r = await act('session')
    if (r) router.push(`/admin/revenue/session/${r.session_id}?account=${id}`)
  }
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-2xl overflow-y-auto bg-stone-50 p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/40"
      aria-labelledby="account-title"
    >
      <div className="space-y-6 p-5 sm:p-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-teal-700">
              Företagets säljarbete
            </p>
            <h2 id="account-title" className="mt-2 text-2xl font-semibold">
              {data?.account.company_name || 'Hämtar företag…'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border px-3 py-2"
            aria-label="Stäng företag"
          >
            Stäng
          </button>
        </header>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-teal-800">
            {notice}
          </p>
        )}
        {data && (
          <>
            <section className="space-y-3 rounded-2xl border bg-white p-5">
              <h3 className="font-semibold">Inför samtalet</h3>
              <details className="text-sm text-slate-600">
                <summary className="cursor-pointer">
                  Så räknas prioriteten: {data.account.total_score}/100
                </summary>
                <dl className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    ['Målgrupp', data.account.icp_score, 25],
                    ['Bekräftat behov', data.account.pain_score, 20],
                    ['Aktuell signal', data.account.timing_score, 20],
                    ['Tillväxt', data.account.growth_score, 15],
                    ['Relation', data.account.warmth_score, 10],
                    [
                      'Betalningsförmåga',
                      data.account.ability_to_pay_score,
                      10,
                    ],
                  ].map(([label, value, max]) => (
                    <div key={String(label)}>
                      <dt>{label}</dt>
                      <dd>
                        {value}/{max}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2">
                  Saknade uppgifter ger inga poäng. Rekrytering ensam bevisar
                  inte tillväxt eller behov.
                </p>
              </details>
              <p className="whitespace-pre-line text-sm">
                {data.account.why_now || 'Inget källunderlag förberett ännu.'}
              </p>
              <div className="rounded-lg bg-amber-50 p-3 text-sm">
                <strong>Hypotes att pröva</strong>
                <p>
                  {data.account.pain_hypothesis ||
                    'Behovet är ännu inte bekräftat.'}
                </p>
              </div>
              <p className="text-sm">{data.account.personalization_hook}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={busy}
                  onClick={() => act('research')}
                  className={button}
                >
                  Förbered samtalsunderlag
                </button>
                <button disabled={busy} onClick={start} className={button}>
                  Starta säljgenomgång
                </button>
              </div>
              {data.account.research_at && (
                <p className="text-xs text-slate-500">
                  Underlag uppdaterat{' '}
                  {new Date(data.account.research_at).toLocaleString('sv-SE')}.
                  Prioriteten bygger på kända uppgifter, inte en sannolikhet att
                  köpa.
                </p>
              )}
              {data.signals.map((s) => (
                <div key={s.id} className="border-t pt-3 text-sm">
                  <p>
                    {s.title} · {s.observed_at.slice(0, 10)}
                  </p>
                  {external(s.source_url) && (
                    <a
                      className="text-teal-700 underline"
                      href={external(s.source_url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Öppna källan
                    </a>
                  )}
                </div>
              ))}
            </section>
            <section className="rounded-2xl border bg-white p-5">
              <h3 className="font-semibold">Första kontakten</h3>
              <p className="mt-2 text-sm text-slate-600">
                Välj ett behov att pröva och ett tydligt nästa steg. En aktuell
                rekryteringskälla används när den finns; annars blir inledningen neutral.
              </p>
              {data.account.contact_state === 'active' && data.account.status === 'identified' && !data.account.last_contact_at ? (
                <form onSubmit={(e) => submit(e, 'outreach')} className="mt-3 space-y-3">
                  <label className="block text-sm">Budskap att pröva
                    <select name="angle" aria-label="Budskap att pröva" className={field}>
                      {Object.entries(OUTREACH_ANGLES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm">Nästa steg i mejlet
                    <select name="cta" aria-label="Nästa steg i mejlet" className={field}>
                      {Object.entries(OUTREACH_CTAS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                  <p className="text-xs text-slate-500">
                    Ett nytt utkast ersätter tidigare aktuella utkast. Granska text,
                    kontaktgrund och avsändare innan du skickar manuellt.
                  </p>
                  <button disabled={busy} className={button}>Förbered första mejlet</button>
                </form>
              ) : <p className="mt-3 text-sm text-slate-600">Första kontakten är inte aktuell. Följ upp befintlig dialog eller kontaktstatus.</p>}
            </section>
            <section className="rounded-2xl border bg-white p-5">
              <h3 className="font-semibold">Nästa steg</h3>
              <form
                key={`next-${data.account.version}`}
                onSubmit={(e) => submit(e, 'next')}
                className="mt-3 space-y-3"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    Affärssteg
                    <select
                      className={field}
                      name="status"
                      aria-label="Affärssteg"
                      defaultValue={data.account.status}
                    >
                      {Object.entries(STAGES).map(([v, l]) => (
                        <option value={v} key={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Kontaktstatus
                    <select
                      name="contact_state"
                      aria-label="Kontaktstatus"
                      className={field}
                      defaultValue={data.account.contact_state}
                    >
                      <option value="active">Aktiv</option>
                      <option value="paused">Pausad</option>
                      <option value="opted_out">Kontakt spärrad</option>
                    </select>
                  </label>
                </div>
                <Input
                  name="next_action"
                  label="Nästa aktivitet"
                  value={data.account.next_action}
                />
                <Input
                  name="next_action_at"
                  type="datetime-local"
                  label="När ska det göras?"
                  value={localDate(data.account.next_action_at)}
                />
                {data.manager && (
                  <Input
                    name="owner_email"
                    label="Ansvarig säljares e-post"
                    value={data.account.owner_email}
                    required
                  />
                )}
                <label className="text-sm">
                  Orsak vid förlorad affär
                  <select name="lost_reason" className={field}>
                    <option value="">Ej angiven</option>
                    <option value="not_now">Inte nu</option>
                    <option value="price">Pris</option>
                    <option value="no_pain">Inget behov</option>
                    <option value="implementation_risk">Införandet</option>
                    <option value="no_response">Inget svar</option>
                    <option value="other">Annat</option>
                  </select>
                </label>
                <button disabled={busy} className={button}>
                  Spara nästa steg
                </button>
              </form>
            </section>
            <section className="rounded-2xl border bg-white p-5">
              <h3 className="font-semibold">Vad hände?</h3>
              <form
                key={`activity-${formRevision}`}
                onSubmit={(e) => submit(e, 'activity')}
                className="mt-3 space-y-3"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    Aktivitet
                    <select
                      name="activity_type"
                      aria-label="Aktivitet"
                      className={field}
                    >
                      <option value="call">Samtal</option>
                      <option value="email">E-post skickad manuellt</option>
                      <option value="meeting">Möte</option>
                      <option value="note">Intern anteckning</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    Utfall
                    <select
                      name="outcome"
                      aria-label="Utfall"
                      className={field}
                    >
                      {Object.entries(outcomes).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block text-sm">
                  Sammanfattning
                  <textarea
                    name="summary"
                    required
                    maxLength={5000}
                    rows={3}
                    className={field}
                  />
                </label>
                <Input
                  name="next_action"
                  label="Nästa aktivitet"
                  value={data.account.next_action}
                />
                <Input
                  name="next_action_at"
                  type="datetime-local"
                  label="Planerad tid"
                  value={localDate(data.account.next_action_at)}
                />
                <label className="flex gap-2 text-sm">
                  <input type="checkbox" name="make_draft" />
                  Förbered ett uppföljningsutkast från sammanfattningen
                </label>
                <p className="text-xs text-slate-500">
                  Svar, avböjande och paus stoppar äldre utkast. Interna
                  anteckningar räknas inte som kundkontakt. Inga meddelanden
                  skickas här.
                </p>
                <button disabled={busy} className={button}>
                  Logga och planera
                </button>
              </form>
            </section>
            <section className="rounded-2xl border bg-white p-5">
              <h3 className="font-semibold">Kontaktpersoner</h3>
              {data.contacts.map((c) => (
                <div key={c.id} className="my-3 border-b pb-3 text-sm">
                  <strong>{c.name}</strong> {c.role}
                  <p>
                    {c.email} {c.phone}
                  </p>
                  {external(c.source_url) && (
                    <a
                      href={external(c.source_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-teal-700 underline"
                    >
                      Källa till kontaktuppgiften
                    </a>
                  )}
                </div>
              ))}
              <details>
                <summary className="cursor-pointer text-sm text-teal-700">
                  Lägg till kontaktperson
                </summary>
                <form
                  key={`contact-${formRevision}`}
                  onSubmit={(e) => submit(e, 'contact')}
                  className="mt-3 space-y-3"
                >
                  <Input name="name" label="Namn" required />
                  <Input name="role" label="Roll" />
                  <Input name="email" type="email" label="E-post" />
                  <Input name="phone" label="Telefon" />
                  <label className="block text-sm">
                    Hur fick vi kontaktuppgiften?
                    <select className={field} name="contact_basis">
                      <option value="warm_intro">Personlig introduktion</option>
                      <option value="inbound">Personen kontaktade oss</option>
                      <option value="customer_referral">
                        Kundrekommendation
                      </option>
                      <option value="public_business_contact">
                        Offentlig företagskontakt
                      </option>
                      <option value="public_professional_role">
                        Offentlig yrkesroll
                      </option>
                    </select>
                  </label>
                  <Input
                    name="source_url"
                    label="Källans webbadress"
                    type="url"
                  />
                  <button disabled={busy} className={button}>
                    Spara kontakt
                  </button>
                </form>
              </details>
            </section>
            <section className="rounded-2xl border bg-white p-5">
              <h3 className="font-semibold">Genomgångar</h3>
              {!data.sessions.length && (
                <p className="mt-2 text-sm text-slate-500">
                  Ingen genomgång startad ännu.
                </p>
              )}
              {data.sessions.map((s) => (
                <div key={s.id} className="mt-3 space-x-4 text-sm">
                  <Link
                    href={`/admin/revenue/session/${s.id}?account=${id}`}
                    className="text-teal-700 underline"
                  >
                    Fortsätt genomgång {s.meeting_date}
                  </Link>
                  {s.case_token && (
                    <Link
                      href={`/case/${s.case_token}`}
                      target="_blank"
                      className="text-teal-700 underline"
                    >
                      Personligt case
                    </Link>
                  )}
                </div>
              ))}
            </section>
            <section className="space-y-4 rounded-2xl border bg-white p-5">
              <h3 className="font-semibold">Mejlutkast</h3>
              <p className="text-xs text-slate-500">
                Godkänn och kopiera för manuell sändning. Godkänt betyder inte
                skickat.
              </p>
              {data.drafts
                .filter((d) => d.status !== 'cancelled')
                .map((d) => (
                  <DraftEditor
                    key={`${d.id}-${d.status}`}
                    draft={d}
                    busy={busy}
                    approve={async (body) => {
                      const r = await act('draft', { draft_id: d.id, body })
                      if (r) {
                        try {
                          await navigator.clipboard.writeText(body)
                          setNotice(
                            'Godkänt och kopierat. Skicka i din e-post och logga sedan det verkliga utskicket.',
                          )
                        } catch {
                          setNotice(
                            'Godkänt. Kopiera texten manuellt; webbläsaren tillät inte automatisk kopiering.',
                          )
                        }
                      }
                    }}
                  />
                ))}
              {!data.drafts.some((d) => d.status !== 'cancelled') && (
                <p className="text-sm text-slate-500">Inga aktuella utkast.</p>
              )}
            </section>
            <section className="rounded-2xl border bg-white p-5">
              <h3 className="font-semibold">Senaste händelser</h3>
              <p className="text-xs text-slate-500">
                Visar de senaste 100 händelserna.
              </p>
              {data.activities.map((a) => (
                <div key={a.id} className="mt-4 border-t pt-3 text-sm">
                  <p className="font-medium">
                    {outcomes[a.outcome || ''] || a.outcome || 'Anteckning'} ·{' '}
                    {new Date(a.occurred_at).toLocaleString('sv-SE')}
                  </p>
                  <p className="whitespace-pre-line">{a.summary}</p>
                  <p className="text-xs text-slate-500">{a.seller_email}</p>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </dialog>
  )
}
function DraftEditor({
  draft,
  busy,
  approve,
}: {
  draft: Draft
  busy: boolean
  approve: (body: string) => Promise<void>
}) {
  const [body, setBody] = useState(draft.body)
  return (
    <div className="space-y-2 border-t pt-3">
      <label className="block text-sm">
        <span>
          {draft.status === 'approved'
            ? 'Godkänt utkast · inte skickat'
            : 'Utkast att granska'}
        </span>
        <textarea
          aria-label="Mejltext"
          className={field}
          rows={9}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <button
        className={button}
        disabled={busy || !body.trim()}
        onClick={() => approve(body)}
      >
        Godkänn och kopiera
      </button>
    </div>
  )
}
