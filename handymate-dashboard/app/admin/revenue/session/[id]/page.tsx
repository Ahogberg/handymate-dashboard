'use client'
import { FormEvent, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  PAINS,
  type Account,
  type Pain,
  type Session,
} from '@/lib/revenue/domain'
import { sendRevenue } from '@/lib/revenue/client'

export default function RevenueSession({ params }: { params: { id: string } }) {
  const query = useSearchParams(),
    accountId = query.get('account')
  const [account, setAccount] = useState<Account | null>(null),
    [session, setSession] = useState<Session | null>(null),
    [pain, setPain] = useState<Pain>('time'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState('')
  useEffect(() => {
    const abort = new AbortController()
    async function load() {
      try {
        const res = await fetch(
          `/api/admin/revenue?account_id=${encodeURIComponent(accountId || '')}`,
          { signal: abort.signal, cache: 'no-store' },
        )
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        const s = data.sessions.find((s: Session) => s.id === params.id)
        if (!s) throw new Error('Genomgången är inte tillgänglig.')
        setAccount(data.account)
        setSession(s)
        if (Object.prototype.hasOwnProperty.call(PAINS, s.payload?.raw?.pain))
          setPain(s.payload.raw.pain as Pain)
      } catch (e) {
        if (!abort.signal.aborted) setError((e as Error).message)
      }
    }
    load()
    return () => abort.abort()
  }, [accountId, params.id])
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!account || !session) return
    const form = new FormData(e.currentTarget)
    setBusy(true)
    setError('')
    try {
      const r = await sendRevenue('case', {
        account_id: account.id,
        session_id: session.id,
        session_version: session.version,
        pain,
        ...Object.fromEntries(form),
      })
      setSaved(r.token)
      setSession({
        ...session,
        version: session.version + 1,
        case_token: r.token,
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="min-h-screen bg-gradient-to-br from-stone-50 via-teal-50 to-white p-5 text-slate-900 sm:p-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin/revenue" className="text-teal-700">
          ← Säljarbetet
        </Link>
        <p className="mt-10 text-sm font-semibold text-teal-700">
          {account?.company_name || 'Er firma'} + Handymate
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          En vardag med mer luft.
        </h1>
        <p className="mt-4 text-slate-600">
          Utgå från kundens vardag och välj det första arbetsflödet att hjälpa
          till med.
        </p>
        {error && (
          <p
            role="alert"
            className="my-5 rounded-xl bg-red-50 p-4 text-red-800"
          >
            {error}
          </p>
        )}
        {session && (
          <form onSubmit={save} className="mt-8 space-y-8">
            <p className="text-sm text-slate-500">
              Mötesdatum: {session.meeting_date}. Datumet följer med även när
              länken öppnas senare.
            </p>
            <fieldset>
              <legend className="text-xl font-semibold">
                1. Vad vill ni förändra först?
              </legend>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {Object.entries(PAINS).map(([key, p]) => (
                  <label
                    key={key}
                    className={`cursor-pointer rounded-2xl border p-5 ${pain === key ? 'border-teal-700 bg-teal-50' : 'bg-white'}`}
                  >
                    <input
                      type="radio"
                      name="pain_choice"
                      value={key}
                      checked={pain === key}
                      onChange={() => setPain(key as Pain)}
                      className="mr-2 accent-teal-700"
                    />
                    {p.title}
                  </label>
                ))}
              </div>
            </fieldset>
            <section className="space-y-4 rounded-2xl border bg-white p-6">
              <h2 className="text-xl font-semibold">2. Beskriv er vardag</h2>
              <p>{PAINS[pain].question}</p>
              <label className="block text-sm">
                Kundens egna ord
                <textarea
                  name="quote"
                  aria-label="Kundens egna ord"
                  defaultValue={session.payload.goal?.quote || ''}
                  required
                  maxLength={3000}
                  rows={4}
                  className="mt-2 w-full rounded-xl border p-3"
                />
              </label>
              <label className="block text-sm">
                Ert mål med Handymate
                <input
                  name="goal"
                  defaultValue={session.payload.goal?.name || ''}
                  placeholder={PAINS[pain].title}
                  maxLength={500}
                  className="mt-2 w-full rounded-xl border p-3"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  Kontaktperson
                  <input
                    name="prospect_name"
                    defaultValue={session.payload.prospect?.name || ''}
                    className="mt-2 w-full rounded-xl border p-3"
                  />
                </label>
                <label className="text-sm">
                  Kontaktpersonens e-post
                  <input
                    name="prospect_email"
                    type="email"
                    defaultValue={session.payload.prospect?.email || ''}
                    className="mt-2 w-full rounded-xl border p-3"
                  />
                </label>
              </div>
            </section>
            <section className="rounded-2xl bg-teal-800 p-6 text-white">
              <h2 className="text-xl font-semibold">
                3. Första steget mot målet
              </h2>
              <p className="mt-3 text-lg">{PAINS[pain].workflow}</p>
              <p className="mt-3 text-teal-100">{PAINS[pain].agent}</p>
              <p className="mt-5 text-sm text-teal-100">
                Vi börjar med Firman. Målet är kundens önskade förändring; någon
                uppmätt besparing utlovas inte. Införandet omfattar att bjuda in
                teamet, lägga in jobben och koppla relevanta integrationer.
              </p>
            </section>
            <button
              disabled={busy}
              className="rounded-xl bg-teal-700 px-6 py-3 font-semibold text-white disabled:opacity-50"
            >
              {busy
                ? 'Sparar…'
                : 'Spara personligt case och förbered uppföljning'}
            </button>
            <p className="text-sm text-slate-500">
              En personlig länk skapas. Inget meddelande skickas.
            </p>
          </form>
        )}
        {(saved || session?.case_token) && (
          <div
            role="status"
            className="mt-6 space-y-3 rounded-2xl border bg-white p-6"
          >
            <h2 className="font-semibold">Genomgången finns sparad</h2>
            <Link
              className="block text-teal-700 underline"
              href={`/case/${saved || session?.case_token}`}
              target="_blank"
            >
              Öppna det personliga caset
            </Link>
            <p className="text-sm text-slate-500">
              Länken kan delas med kunden. Uppföljningsutkastet finns på
              företaget i säljarvyn.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
