'use client'
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AccountPanel } from '@/components/revenue/AccountPanel'
import { sendRevenue } from '@/lib/revenue/client'
import { STAGES, type Account } from '@/lib/revenue/domain'

type Overview = {
  accounts: Account[]
  queue: Account[]
  total: number
  matching: number
  due: number
  missing_next: number
  won: number
  manager: boolean
  email: string
  source_runs: Array<{
    id: string
    source: string
    status: string
    imported: number
    error: string | null
    started_at: string
    finished_at: string | null
  }>
}
const button =
  'rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'
export default function RevenueOSPage() {
  const [data, setData] = useState<Overview | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  const [q, setQ] = useState(''),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState<string | null>(null),
    [revision, setRevision] = useState(0)
  const [showCreate, setShowCreate] = useState(false),
    [showSource, setShowSource] = useState(false)
  const sequence = useRef(0)
  const reload = useCallback(async () => {
    const n = ++sequence.current
    try {
      const res = await fetch(
        `/api/admin/revenue?q=${encodeURIComponent(q)}&offset=${offset}`,
        { cache: 'no-store' },
      )
      const body = await res.json()
      if (!res.ok) throw new Error(body.error)
      if (n === sequence.current) {
        setData(body)
        setError('')
      }
    } catch (e) {
      if (n === sequence.current) {
        setData(null)
        setError(
          e instanceof Error ? e.message : 'Kunde inte hämta säljarbetet.',
        )
      }
    }
  }, [q, offset])
  useEffect(() => {
    const timer = setTimeout(reload, 200)
    return () => {
      clearTimeout(timer)
      sequence.current++
    }
  }, [reload, revision])
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    setError('')
    try {
      const r = await sendRevenue('create', Object.fromEntries(form))
      setShowCreate(false)
      setSelected(r.account_id)
      setRevision((v) => v + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function source(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    setError('')
    try {
      const r = await sendRevenue('import_source', Object.fromEntries(form))
      setMessage(
        `${r.imported} företag behandlade. Befintliga företag och annonser återanvänds.`,
      )
      setShowSource(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      setRevision((v) => v + 1)
    }
  }
  return (
    <main className="min-h-screen bg-stone-50 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/admin" className="text-sm text-teal-700">
              ← Administration
            </Link>
            <p className="mt-6 text-xs font-bold uppercase tracking-widest text-teal-700">
              Handymate · Revenue OS
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Vem hjälper vi vidare i dag?
            </h1>
            <p className="mt-2 text-slate-600">
              Förberedda samtal, tydliga nästa steg och en gemensam bild av
              affärerna.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={button}
              onClick={() => setShowSource(!showSource)}
            >
              Hitta företag
            </button>
            <button
              className={button}
              onClick={() => setShowCreate(!showCreate)}
            >
              Lägg till företag
            </button>
            <button
              className="rounded-xl border px-4 py-2"
              onClick={() => setRevision((v) => v + 1)}
            >
              Uppdatera
            </button>
          </div>
        </header>
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4"
          >
            {error}
          </div>
        )}
        {message && (
          <p role="status" className="rounded-xl bg-teal-50 p-4">
            {message}
          </p>
        )}
        {showCreate && (
          <form
            onSubmit={create}
            className="grid gap-4 rounded-2xl border bg-white p-5 sm:grid-cols-2"
          >
            <label>
              Företagsnamn
              <input
                name="company_name"
                required
                maxLength={200}
                className="mt-1 w-full rounded-lg border p-2"
              />
            </label>
            <label>
              Organisationsnummer
              <input
                name="org_number"
                className="mt-1 w-full rounded-lg border p-2"
              />
            </label>
            <label>
              Bransch
              <input
                name="industry"
                className="mt-1 w-full rounded-lg border p-2"
              />
            </label>
            <label>
              Ort
              <input
                name="city"
                className="mt-1 w-full rounded-lg border p-2"
              />
            </label>
            <button disabled={busy} className={button}>
              Spara företag
            </button>
          </form>
        )}
        {showSource && (
          <form
            onSubmit={source}
            className="space-y-3 rounded-2xl border bg-white p-5"
          >
            <h2 className="font-semibold">Företag som rekryterar</h2>
            <p className="text-sm text-slate-600">
              Sök i Platsbanken. Upp till 50 aktiebolag med aktuella annonser
              läggs till med källor och samtalsunderlag. Annonsen bevisar
              rekrytering; behovet undersöker vi i samtalet.
            </p>
            <div className="flex flex-wrap gap-3">
              <label className="flex-1">
                Hantverksyrke
                <select name="term" className="ml-3 rounded-lg border p-2">
                  {[
                    'elektriker',
                    'VVS-montör',
                    'snickare',
                    'målare',
                    'takläggare',
                    'ventilationsmontör',
                    'anläggningsarbetare',
                  ].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <button className={button} disabled={busy}>
                {busy ? 'Hämtar och förbereder…' : 'Hämta och förbered företag'}
              </button>
            </div>
          </form>
        )}
        {!data && !error && <p role="status">Hämtar säljarbetet…</p>}
        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ['Företag', data.total],
                ['Att följa upp', data.due],
                ['Saknar planerad tid', data.missing_next],
                ['Vunna affärer', data.won],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border bg-white p-5">
                  <p className="text-sm text-slate-500">{label}</p>
                  <p className="mt-2 text-3xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-slate-500">
              {data.manager
                ? 'Säljledarvy · alla företag'
                : 'Min säljarvy · egna företag'}{' '}
              · {data.email}
            </p>
            <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
              <section className="rounded-2xl border bg-white">
                <div className="border-b p-5">
                  <h2 className="text-xl font-semibold">Dagens kö</h2>
                  <p className="text-sm text-slate-500">
                    Förfallna uppföljningar först, sedan företagets prioritet.
                  </p>
                </div>
                {data.queue.length === 0 && (
                  <p className="p-5 text-slate-500">
                    Inga aktiva företag i kön. Lägg till ett företag för att
                    börja.
                  </p>
                )}
                <div className="divide-y">
                  {data.queue.map((a) => (
                    <button
                      key={a.id}
                      className="block w-full p-5 text-left hover:bg-teal-50"
                      onClick={() => setSelected(a.id)}
                    >
                      <div className="flex justify-between gap-3">
                        <strong>{a.company_name}</strong>
                        <span className="rounded-full bg-teal-50 px-2 text-sm text-teal-800">
                          {a.total_score}/100
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                        {a.why_now || 'Underlaget behöver förberedas.'}
                      </p>
                      <p className="mt-3 text-sm text-teal-800">
                        {a.next_action || 'Planera nästa steg'} ·{' '}
                        {a.next_action_at
                          ? new Date(a.next_action_at).toLocaleString('sv-SE')
                          : 'Tid saknas'}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
              <section className="space-y-3">
                <label className="block">
                  Sök företag
                  <input
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value)
                      setOffset(0)
                    }}
                    className="mt-1 w-full rounded-xl border bg-white p-3"
                    placeholder="Namn eller organisationsnummer"
                  />
                </label>
                <div className="divide-y rounded-2xl border bg-white">
                  {data.accounts.map((a) => (
                    <button
                      className="flex w-full items-center justify-between gap-3 p-5 text-left hover:bg-teal-50"
                      key={a.id}
                      onClick={() => setSelected(a.id)}
                    >
                      <span>
                        <strong>{a.company_name}</strong>
                        <span className="mt-1 block text-sm text-slate-500">
                          {[a.city, a.industry].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className="text-sm text-teal-800">
                        {STAGES[a.status]}
                      </span>
                    </button>
                  ))}
                  {!data.accounts.length && (
                    <p className="p-5 text-slate-500">
                      Inga företag matchar sökningen.
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <button
                    disabled={!offset}
                    className="disabled:opacity-40"
                    onClick={() => setOffset((v) => Math.max(0, v - 50))}
                  >
                    ← Föregående
                  </button>
                  <span>{data.matching} träffar</span>
                  <button
                    disabled={offset + 50 >= data.matching}
                    className="disabled:opacity-40"
                    onClick={() => setOffset((v) => v + 50)}
                  >
                    Nästa →
                  </button>
                </div>
                {data.source_runs.length > 0 && (
                  <div className="rounded-2xl border bg-white p-5">
                    <h2 className="font-semibold">Senaste hämtningar</h2>
                    {data.source_runs.map((r) => (
                      <div key={r.id} className="mt-3 border-t pt-3 text-sm">
                        <p>
                          {r.source} ·{' '}
                          {new Date(r.started_at).toLocaleString('sv-SE')}
                        </p>
                        <p>
                          {r.status === 'succeeded'
                            ? `${r.imported} företag behandlade`
                            : r.status === 'failed'
                              ? 'Hämtningen avbröts'
                              : Date.now() - Date.parse(r.started_at) > 120000
                                ? 'Hämtningen saknar slutbesked. Kontrollera företagen och försök igen.'
                                : 'Hämtning pågår'}
                        </p>
                        {r.error && <p className="text-red-700">{r.error}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
      {selected && (
        <AccountPanel
          key={selected}
          id={selected}
          onClose={() => setSelected(null)}
          onChanged={() => setRevision((v) => v + 1)}
        />
      )}
    </main>
  )
}
