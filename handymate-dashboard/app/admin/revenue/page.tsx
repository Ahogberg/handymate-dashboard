'use client'
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AccountPanel } from '@/components/revenue/AccountPanel'
import { SalesMetrics, type Metrics } from '@/components/revenue/SalesMetrics'
import { sendRevenue } from '@/lib/revenue/client'
import { STAGES, type Account } from '@/lib/revenue/domain'

type Overview = {
  metrics: Metrics
  accounts: Account[]
  queue: Account[]
  total: number
  matching: number
  due: number
  missing_next: number
  won: number
  manager: boolean
  email: string
  partners: Array<{ id: string; name: string; company: string | null }>
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
  // Bulkurval. Listan från revenue_v2_overview är sorterad på total_score
  // desc, 50 per sida — en sida ÄR därför ett sammanhängande poängspann, och
  // "markera alla" gäller sidan du ser. Aldrig ett urval du inte har framför
  // dig: en knapp som tar bort företag du inte sett är inte en knapp.
  const [valda, setValda] = useState<Set<string>>(new Set())
  const [poangMin, setPoangMin] = useState('')
  const [bulkPartner, setBulkPartner] = useState('')
  const [bulkSvar, setBulkSvar] = useState<
    { rubrik: string; rader: Array<{ foretag: string; text: string }> } | null
  >(null)
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
  // Byter sida eller sökning ⇒ töm urvalet. Ett urval som lever kvar över en
  // sidbyte tar bort företag som inte längre står på skärmen.
  useEffect(() => {
    setValda(new Set())
    setBulkSvar(null)
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
  const HINDER: Record<string, string> = {
    partnerlead: 'har en partnerlead — den är partnerns historik',
    kontaktsparr: 'har en kontaktspärr som måste bevaras',
    historik: 'har aktiviteter — stäng som förlorad i stället',
    kontaktperson: 'har en sparad kontaktperson med källa',
    ingen_kontakt: 'saknar kontaktperson med e-post eller telefon',
    ingen_research: 'saknar underlag — kör Förbered först',
    redan_tilldelad: 'är redan tilldelad en partner',
    sparrad: 'är spärrad för kontakt',
    ej_oppen: 'är inte öppet för kontakt',
    saknas: 'finns inte längre',
  }
  function hinderText(rad: { hinder: string; skal?: string }) {
    return rad.hinder === 'nekades'
      ? rad.skal || 'nekades av tilldelningsregeln'
      : HINDER[rad.hinder] || rad.hinder
  }

  async function taBortValda() {
    const antal = valda.size
    if (!antal) return
    if (!window.confirm(
      `Ta bort ${antal} företag ur katalogen? Företag med partnerlead, ` +
      'kontaktspärr, aktiviteter eller sparad kontaktperson lämnas kvar.',
    )) return
    setBusy(true)
    setError('')
    setBulkSvar(null)
    try {
      const r = await sendRevenue('discard', { ids: Array.from(valda) })
      setBulkSvar({
        rubrik: `${r.borttagna} företag togs bort.`,
        rader: (r.behallna || []).map((b: { foretag: string; hinder: string }) => ({
          foretag: b.foretag,
          text: `lämnades kvar — ${hinderText(b)}`,
        })),
      })
      setValda(new Set())
      setRevision((v) => v + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function tilldelaValda() {
    if (!valda.size || !bulkPartner) return
    setBusy(true)
    setError('')
    setBulkSvar(null)
    try {
      const r = await sendRevenue('assign_bulk', {
        partner_id: bulkPartner,
        ids: Array.from(valda),
      })
      setBulkSvar({
        rubrik: `${r.antal} leads tilldelade. Underlaget kommer ur varje företags egen research.`,
        rader: (r.hoppade || []).map((h: { foretag: string; hinder: string; skal?: string }) => ({
          foretag: h.foretag,
          text: `hoppades över — ${hinderText(h)}`,
        })),
      })
      setValda(new Set())
      setRevision((v) => v + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function exportCrm() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/revenue?export=crm', { cache: 'no-store' })
      if (!res.ok) throw new Error((await res.json()).error)
      const url = URL.createObjectURL(await res.blob())
      const link = document.createElement('a')
      link.href = url; link.download = 'handymate-revenue-crm.csv'; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage('CRM-exporten är hämtad. Använd id som unik nyckel vid import. Exporten innehåller din behöriga portfölj och kontaktspärrar; ingen automatisk synk är aktiverad.')
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
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
            <button className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={exportCrm}>Exportera till CRM</button>
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
            {data.metrics && <SalesMetrics metrics={data.metrics} />}
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
                {data.manager && (() => {
                  // Poängfiltret gäller sidan du ser — listan är sorterad på
                  // poäng, så sidan är ett sammanhängande spann.
                  const grans = poangMin === '' ? null : Number(poangMin)
                  const synliga = data.accounts.filter(
                    (a) => grans === null || (a.total_score ?? 0) >= grans,
                  )
                  const allaValda =
                    synliga.length > 0 && synliga.every((a) => valda.has(a.id))
                  return (
                    <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-4">
                      <label className="text-sm">
                        Poäng minst
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={poangMin}
                          onChange={(e) => setPoangMin(e.target.value)}
                          placeholder="alla"
                          className="ml-2 w-20 rounded-lg border p-1.5"
                        />
                      </label>
                      <button
                        className="rounded-xl border px-3 py-1.5 text-sm"
                        onClick={() =>
                          setValda(
                            allaValda
                              ? new Set()
                              : new Set(synliga.map((a) => a.id)),
                          )
                        }
                      >
                        {allaValda
                          ? 'Avmarkera sidan'
                          : `Markera sidan (${synliga.length})`}
                      </button>
                      <span className="text-sm text-slate-500">
                        {valda.size} valda
                      </span>
                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        <select
                          aria-label="Partner att tilldela"
                          value={bulkPartner}
                          onChange={(e) => setBulkPartner(e.target.value)}
                          className="rounded-lg border p-1.5 text-sm"
                        >
                          <option value="">Välj partner…</option>
                          {data.partners.map((pt) => (
                            <option key={pt.id} value={pt.id}>
                              {pt.company || pt.name}
                            </option>
                          ))}
                        </select>
                        <button
                          disabled={busy || !valda.size || !bulkPartner}
                          onClick={tilldelaValda}
                          className="rounded-xl bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                        >
                          Tilldela valda
                        </button>
                        <button
                          disabled={busy || !valda.size}
                          onClick={taBortValda}
                          className="rounded-xl border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-40"
                        >
                          Ta bort valda
                        </button>
                      </div>
                      {data.partners.length === 0 && (
                        <p className="w-full text-sm text-slate-500">
                          Ingen aktiv partner med godkänt gällande avtal finns
                          att tilldela ännu.
                        </p>
                      )}
                    </div>
                  )
                })()}
                {bulkSvar && (
                  <div role="status" className="rounded-2xl border bg-white p-4">
                    <p className="font-medium">{bulkSvar.rubrik}</p>
                    {bulkSvar.rader.length > 0 && (
                      <ul className="mt-2 space-y-1 text-sm text-slate-600">
                        {bulkSvar.rader.map((r, i) => (
                          <li key={i}>
                            <strong className="font-medium">{r.foretag}</strong>{' '}
                            {r.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <div className="divide-y rounded-2xl border bg-white">
                  {data.accounts
                    .filter(
                      (a) =>
                        !data.manager ||
                        poangMin === '' ||
                        (a.total_score ?? 0) >= Number(poangMin),
                    )
                    .map((a) => (
                    <div className="flex items-center gap-3 p-5" key={a.id}>
                      {data.manager && (
                        <input
                          type="checkbox"
                          aria-label={`Välj ${a.company_name}`}
                          checked={valda.has(a.id)}
                          onChange={(e) =>
                            setValda((f) => {
                              const n = new Set(f)
                              if (e.target.checked) n.add(a.id)
                              else n.delete(a.id)
                              return n
                            })
                          }
                          className="h-5 w-5 flex-none"
                        />
                      )}
                      <button
                        className="flex flex-1 items-center justify-between gap-3 text-left hover:text-teal-800"
                        onClick={() => setSelected(a.id)}
                      >
                        <span>
                          <strong>{a.company_name}</strong>
                          <span className="mt-1 block text-sm text-slate-500">
                            {[a.city, a.industry].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="flex-none text-sm text-teal-800">
                          {a.total_score}/100 · {STAGES[a.status]}
                        </span>
                      </button>
                    </div>
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
