'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, FileText, Loader2, Plus } from 'lucide-react'
import { getAgentById } from '@/lib/agents/team'
import { QuickPriceInput } from '@/components/products/QuickPriceInput'
import { inspectTemplate, relevantProducts, resolveFirstQuoteSelection, sameUnit, setupSummary, templatesForJobType,
  type FirstQuoteSelection, type QuoteSetupData, type SetupTemplate } from '@/lib/quotes/job-type-setup'
import './job-type-setup.css'

interface Props {
  initialJobTypes?: string[]
  initialSelection?: FirstQuoteSelection | null
  refreshKey?: number
  onChange?: (selection: FirstQuoteSelection | null, jobTypes: string[]) => void
  onBusyChange?: (busy: boolean) => void
  allowCreateJobType?: boolean
}

type SetupResponse = QuoteSetupData & { canManage: boolean }

/** Delad riktig uppsättningsyta — ingen offertpreview och inga AI-anrop. */
export function JobTypeQuoteSetup({ initialJobTypes = [], initialSelection, onChange, onBusyChange, refreshKey = 0, allowCreateJobType = true }: Props) {
  const [data, setData] = useState<SetupResponse | null>(null)
  const [selected, setSelected] = useState<string[]>(() => Array.from(new Set([
    ...(initialSelection ? [initialSelection.jobTypeSlug] : []), ...initialJobTypes,
  ])).slice(0, 3))
  const [focused, setFocused] = useState(initialSelection?.jobTypeSlug || initialJobTypes[0] || '')
  const [templateId, setTemplateId] = useState(initialSelection?.templateId || '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [priceSaving, setPriceSaving] = useState(false)
  const [jobName, setJobName] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [editingPrice, setEditingPrice] = useState<string | null>(null)
  const revision = useRef(0)
  const mutationLock = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const busyCallbackRef = useRef(onBusyChange)
  busyCallbackRef.current = onBusyChange
  useEffect(() => { busyCallbackRef.current?.(busy || priceSaving); return () => { busyCallbackRef.current?.(false) } }, [busy, priceSaving])

  const load = useCallback(async () => {
    const request = ++revision.current
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/job-types/quote-setup', { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Kunde inte hämta underlaget.')
      if (request !== revision.current) return
      setData(result)
      setSelected(old => old.filter(slug => result.jobTypes.some((j: { slug: string }) => j.slug === slug)))
    } catch (err) {
      if (request === revision.current) {
        setData(null) // Gamla priser får inte se aktuella ut efter ett läsfel.
        setError(err instanceof Error ? err.message : 'Kunde inte hämta underlaget.')
      }
    } finally { if (request === revision.current) setLoading(false) }
  }, [])

  useEffect(() => { void load(); return () => { revision.current++ } }, [load, refreshKey])

  const job = data?.jobTypes.find(j => j.slug === focused && selected.includes(j.slug))
  const linked = job && data ? templatesForJobType(data.templates, job.slug) : []
  // EN explicit kopplad mall kan väljas direkt. Flera = människan väljer.
  const chosen = job && data ? data.templates.find(t => t.id === templateId && (t.jobTypeSlug === job.slug || !t.jobTypeSlug))
    || (linked.length === 1 ? linked[0] : null) : null
  const choice = data && chosen && job ? resolveFirstQuoteSelection(data, { jobTypeSlug: job.slug, templateId: chosen.id }) : null
  const choiceKey = JSON.stringify(choice)
  const selectedKey = JSON.stringify(selected)

  useEffect(() => {
    if (!loading && data) onChangeRef.current?.(JSON.parse(choiceKey), selectedRef.current)
  }, [choiceKey, selectedKey, loading, data])

  async function mutate(url: string, method: string, body?: unknown): Promise<boolean> {
    if (mutationLock.current) return false
    mutationLock.current = true
    setBusy(true); setError('')
    try {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Kunde inte spara. Försök igen.')
      await load()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte spara.')
      return false
    } finally { mutationLock.current = false; setBusy(false) }
  }

  function toggleJob(slug: string) {
    setTemplateId(''); setShowAll(false)
    if (selected.includes(slug)) {
      const next = selected.filter(s => s !== slug)
      setSelected(next); setFocused(next[0] || '')
    } else if (selected.length < 3) {
      setSelected([...selected, slug]); setFocused(slug)
    }
  }

  const rows = chosen && data ? inspectTemplate(chosen, data.products) : []
  const products = chosen && data ? relevantProducts(chosen, data.products) : []
  const unresolved = rows.filter(r => r.status === 'product_missing' || r.status === 'unit_mismatch')
  const matte = getAgentById('matte')

  return <section className="job-setup" aria-label="Förbered dina vanligaste jobb" aria-busy={loading || busy}>
    <div className="job-setup-host">
      <img src={matte?.avatar} alt="" width={56} height={56} />
      <div><span className="job-setup-eyebrow">Matte · din chefsagent</span>
        <h2>Vilket jobb börjar vi med?</h2>
        <p>Välj upp till tre vanliga jobb. Koppla ett offertupplägg och sätt dina priser där de behövs.</p>
        <p className="job-setup-caption">När affären har samma jobbtyp kan offerten börja med era förvalda artikelrader. Flera mallar? Då väljer du vilken. Artikelkopplade reservationer föreslås i offerten och du granskar dem innan de läggs till.</p>
      </div>
    </div>
    {error && <div className="job-setup-error" role="alert">{error} <button type="button" onClick={() => void load()} disabled={loading || busy}>Försök igen</button></div>}
    {loading && <p className="job-setup-loading" role="status"><Loader2 size={18} className="animate-spin" /> Hämtar dina jobb och artiklar…</p>}
    {!loading && data && <>
      {!data.linkingAvailable && <p className="job-setup-note" role="status">Jobbtypskopplingen är inte aktiverad ännu. Du kan fortsätta och använda ditt artikelregister som vanligt.</p>}
      <div className="job-setup-jobs" role="group" aria-label="Dina vanligaste jobb">
        {data.jobTypes.map(j => <button type="button" key={j.id} aria-pressed={selected.includes(j.slug)}
          disabled={busy || (!selected.includes(j.slug) && selected.length >= 3)} onClick={() => toggleJob(j.slug)}>
          <span>{j.name}</span>{selected.includes(j.slug) ? <Check size={17} /> : <Plus size={17} />}
        </button>)}
      </div>
      {!data.jobTypes.length && <p>Inga jobbtyper finns ännu. Lägg till ett jobb ni ofta gör, till exempel servicebesök.</p>}
      {data.canManage && allowCreateJobType && <details className="job-setup-details"><summary>Lägg till en jobbtyp</summary>
        <form className="job-setup-inline" onSubmit={async e => {
          e.preventDefault()
          if (jobName.trim() && await mutate('/api/job-types', 'POST', { name: jobName.trim() })) setJobName('')
        }}>
          <label className="sr-only" htmlFor="quote-setup-job-name">Namn på jobbtypen</label>
          <input id="quote-setup-job-name" value={jobName} maxLength={80} onChange={e => setJobName(e.target.value)} placeholder="Till exempel servicebesök" />
          <button type="submit" disabled={busy || !jobName.trim()}>Lägg till</button>
        </form>
      </details>}
      {selected.length > 1 && <div className="job-setup-tabs" role="group" aria-label="Redigera valt jobb">
        {data.jobTypes.filter(j => selected.includes(j.slug)).map(j => <button type="button" key={j.id} aria-pressed={focused === j.slug}
          disabled={busy} onClick={() => { setFocused(j.slug); setTemplateId(''); setShowAll(false) }}>{j.name}</button>)}
      </div>}
      {job && data.linkingAvailable && <div className="job-setup-workspace" key={job.slug}>
        <div className="job-setup-document-heading"><FileText size={23} /><div><span className="job-setup-eyebrow">Ditt upplägg för</span><h3>{job.name}</h3></div></div>
        <label className="job-setup-label" htmlFor="quote-setup-template">Vilken offertmall vill du utgå från?</label>
        <select id="quote-setup-template" value={chosen?.id || ''} disabled={busy} onChange={e => { setTemplateId(e.target.value); setShowAll(false) }}>
          <option value="">Välj en mall</option>
          <optgroup label="Kopplade till jobbtypen">{linked.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>
          <optgroup label="Mallar att koppla">{data.templates.filter(t => !t.jobTypeSlug).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>
        </select>
        {!data.templates.length && <div className="job-setup-note"><p>Det finns inga offertmallar ännu.</p>
          {data.canManage && <button type="button" disabled={busy} onClick={() => void mutate('/api/quote-templates/seed', 'POST')}>Hämta mallar för min bransch</button>}
        </div>}
        {chosen && <>
          {chosen.jobTypeSlug !== job.slug && <div className="job-setup-note"><p>Du granskar mallen. Den blir inte ert standardunderlag förrän du kopplar den.</p>
            {data.canManage && <button type="button" className="job-setup-primary" disabled={busy} onClick={() => void mutate('/api/job-types/quote-setup', 'PUT',
              { templateId: chosen.id, jobTypeSlug: job.slug, updatedAt: chosen.updatedAt })}>Koppla till {job.name} <ArrowRight size={16} /></button>}
          </div>}
          <p className="job-setup-summary" role="status">{setupSummary(rows)}</p>
          <p className="job-setup-caption">Artikelpriser exkl. moms. Mängder, kundavtal och jobbets förutsättningar granskar du i offerten.</p>
          <div className="job-setup-products">
            {(showAll ? products : products.slice(0, 10)).map(p => <div className="job-setup-product" key={p.id}>
              <div><strong>{p.name}</strong><span>{p.unit}</span></div>
              {data.canManage && (!(p.salesPrice && p.salesPrice > 0) || editingPrice === p.id)
                ? <div aria-label={`Pris för ${p.name}`}><QuickPriceInput productId={p.id} unit={p.unit} label={`Pris för ${p.name}`} onSavingChange={setPriceSaving} onSaved={() => { setEditingPrice(null); void load() }} /></div>
                : <div className="job-setup-price"><span>{p.salesPrice && p.salesPrice > 0 ? `${p.salesPrice.toLocaleString('sv-SE')} kr/${p.unit}` : 'Pris saknas'}</span>
                  {data.canManage && <button type="button" onClick={() => setEditingPrice(p.id)}>Ändra pris</button>}</div>}
            </div>)}
          </div>
          {products.length > 10 && <button type="button" className="job-setup-text-button" onClick={() => setShowAll(!showAll)}>{showAll ? 'Visa färre artiklar' : `Visa alla ${products.length} artiklar`}</button>}
          {unresolved.length > 0 && <details className="job-setup-details"><summary>{unresolved.length} {unresolved.length === 1 ? 'rad behöver' : 'rader behöver'} artikelkoppling</summary>
            <p className="job-setup-caption">Välj en befintlig artikel med samma enhet. Vi gissar inte vad en rad motsvarar.</p>
            {unresolved.map(({ item, status }) => <div className="job-setup-unlinked" key={item.index}>
              <label htmlFor={`setup-item-${item.index}`}>{item.description || 'Namnlös rad'} <span>({item.unit || 'enhet saknas'})</span></label>
              {status === 'unit_mismatch' && <p className="job-setup-caption">Den kopplade artikeln har en annan enhet.</p>}
              {data.canManage && <ProductLinkSelect key={`${chosen.id}:${item.index}:${chosen.updatedAt}`} id={`setup-item-${item.index}`} template={chosen} itemIndex={item.index}
                products={data.products.filter(p => sameUnit(p.unit, item.unit))} busy={busy}
                onSave={productId => mutate('/api/job-types/quote-setup', 'PATCH', { templateId: chosen.id, itemIndex: item.index, productId, updatedAt: chosen.updatedAt })} />}
            </div>)}
          </details>}
          {choice && <div className="job-setup-saved"><Check size={18} /><p><strong>Upplägget är kopplat.</strong> Reservationer föreslås utifrån offertens artiklar när du bygger offerten. Ingenting skickas till kunden här.</p></div>}
        </>}
      </div>}
      <p className="job-setup-caption">Det går bra att fortsätta nu. Du hittar uppläggen igen under Inställningar → Jobbtyper.</p>
    </>}
  </section>
}

function ProductLinkSelect({ id, products, busy, onSave }: {
  id: string; template: SetupTemplate; itemIndex: number; products: QuoteSetupData['products']; busy: boolean; onSave: (id: string) => Promise<boolean>
}) {
  const [value, setValue] = useState('')
  return <div className="job-setup-inline"><select id={id} value={value} onChange={e => setValue(e.target.value)} disabled={busy}>
    <option value="">Välj artikel</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
  </select><button type="button" disabled={busy || !value} onClick={() => void onSave(value)}>Koppla</button></div>
}
