'use client'

/**
 * Frågorna per jobbtyp — redigera, byt ut, fyll på (2026-09-17, Andreas).
 * Bor i samma uppsättningsyta som standardraderna (onboarding + Inställningar
 * → Jobbtyper). Förslagen ur branschen visas tills firman sparar egna;
 * "Tillbaka till förslagen" tömmer det sparade. Ingen fråga har någon effekt
 * på priser: mått/antal sätter mängd på DE RADER frågan pekar på, ja/nej
 * kryssar DE TILLVAL frågan pekar på, resten går som text till Matte.
 *
 * Bindningen är synlig och vald här: under varje mängdfråga står "Sätter
 * mängden på" med en kryssruta per kopplad artikelrad, under varje ja/nej
 * "Kryssar tillvalet". Hantverkaren ser exakt vad ett svar ändrar innan
 * frågan ställs hemma hos kunden. Rader med annan enhet än de redan valda
 * går inte att kryssa — då är det två frågor.
 */
import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react'
import { fetchIntakeQuestions, saveIntakeQuestions } from '@/lib/quotes/intake-flow'
import {
  INTAKE_KIND_LABELS, INTAKE_KINDS, INTAKE_MAX_QUESTIONS, equivalentUnit, missingIntakeTargets, validateIntakeQuestions,
  type IntakeChoice, type IntakeQuestion, type IntakeQuestionKind, type IntakeTarget,
} from '@/lib/quotes/intake-questions'

interface Props {
  jobTypeSlug: string
  jobTypeName: string
  canManage: boolean
  busy: boolean
  /** Bumpas när standardraderna ändrats — raderna att peka på kan ha blivit fler. */
  refreshKey?: string | number
}

/** Artikelraden i registret som ett alternativ kan peka på. */
interface Artikel { id: string; name: string; unit: string | null; sales_price: number }

interface Draft extends IntakeQuestion { choiceDrafts?: IntakeChoice[] }

function newId(existing: Draft[]): string {
  let n = existing.length + 1
  while (existing.some(q => q.id === `fraga_${n}`)) n += 1
  return `fraga_${n}`
}

function toDraft(q: IntakeQuestion): Draft {
  return { ...q, choiceDrafts: q.choices?.map(c => ({ ...c })) ?? [{ label: '' }, { label: '' }] }
}

function fromDraft(d: Draft): IntakeQuestion {
  const q: IntakeQuestion = { id: d.id, label: d.label, kind: d.kind }
  if ((d.kind === 'number' || d.kind === 'yesno') && d.targets?.length) q.targets = d.targets.slice()
  if (d.kind === 'number' && d.unit?.trim()) q.unit = d.unit.trim()
  if (d.kind === 'choice') {
    q.choices = (d.choiceDrafts ?? [])
      .map(c => ({ label: c.label.trim(), ...(c.productId ? { productId: c.productId } : {}) }))
      .filter(c => c.label)
  }
  return q
}

export function JobTypeQuestionsEditor({ jobTypeSlug, jobTypeName, canManage, busy, refreshKey = '' }: Props) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [seeded, setSeeded] = useState(false)
  const [targets, setTargets] = useState<IntakeTarget[]>([])
  const [artiklar, setArtiklar] = useState<Artikel[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const lock = useRef(false)
  const revision = useRef(0)

  useEffect(() => {
    const request = ++revision.current
    const controller = new AbortController()
    setLoading(true); setError(''); setSaved('')
    fetchIntakeQuestions(jobTypeSlug, controller.signal).then(view => {
      if (request !== revision.current) return
      setDrafts(view.questions.map(toDraft)); setSeeded(view.seeded); setTargets(view.targets); setDirty(false)
    }).catch(err => { if (request === revision.current && !controller.signal.aborted) setError(err instanceof Error ? err.message : 'Kunde inte hämta frågorna.') })
      .finally(() => { if (request === revision.current && !controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [jobTypeSlug, refreshKey])

  /**
   * Artikelregistret för valfrågornas alternativ. Prissatta först: mätt
   * 2026-09-18 saknar ungefär tre fjärdedelar av artiklarna pris
   * (Bee Service 139 av 187), så en osorterad lista skulle i praktiken
   * erbjuda en prislös artikel överst — och en valfråga mot en sådan ger en
   * 0 kr-rad i kundens offert.
   */
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/products', { signal: controller.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        const rows: Artikel[] = Array.isArray(data?.products) ? data.products : Array.isArray(data) ? data : []
        setArtiklar(
          rows
            .map(p => ({ id: String(p.id), name: String(p.name ?? ''), unit: p.unit ?? null, sales_price: Number(p.sales_price ?? 0) || 0 }))
            .filter(p => p.id && p.name)
            .sort((a, b) => (b.sales_price > 0 ? 1 : 0) - (a.sales_price > 0 ? 1 : 0) || a.name.localeCompare(b.name, 'sv'))
        )
      })
      .catch(() => { /* Utan register går valfrågor att skriva, bara inte binda till en artikel. */ })
    return () => controller.abort()
  }, [refreshKey])

  const prislosaVal = (drafts ?? []).flatMap((q, index) =>
    q.kind === 'choice'
      ? (q.choiceDrafts ?? [])
          .filter(c => c.productId && (artiklar.find(a => a.id === c.productId)?.sales_price ?? 0) <= 0)
          .map(c => `${index + 1}. ${c.label || 'alternativet'}`)
      : []
  )

  const update = (index: number, patch: Partial<Draft>) => {
    setDrafts(prev => prev ? prev.map((q, i) => i === index ? { ...q, ...patch } : q) : prev); setDirty(true); setSaved('')
  }
  // Byte av typ nollställer bindningen: en mängdfrågas rader är inga tillval.
  const setKind = (index: number, kind: IntakeQuestionKind) => update(index, { kind, targets: undefined, unit: undefined })
  const toggleTarget = (index: number, q: Draft, target: IntakeTarget) => {
    const current = q.targets ?? []
    const next = current.includes(target.id) ? current.filter(id => id !== target.id) : [...current, target.id]
    const first = targets.find(t => next.includes(t.id))
    update(index, { targets: next.length ? next : undefined, unit: q.kind === 'number' ? first?.unit : undefined })
  }
  const move = (index: number, dir: -1 | 1) => {
    setDrafts(prev => {
      if (!prev) return prev
      const next = prev.slice(); const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    }); setDirty(true); setSaved('')
  }
  const remove = (index: number) => { setDrafts(prev => prev ? prev.filter((_, i) => i !== index) : prev); setDirty(true); setSaved('') }
  const add = () => {
    setDrafts(prev => { const list = prev ?? []; return [...list, { id: newId(list), label: '', kind: 'number', choiceDrafts: [{ label: '' }, { label: '' }] }] })
    setDirty(true); setSaved('')
  }

  async function persist(questions: IntakeQuestion[] | null) {
    if (lock.current) return
    lock.current = true; setSaving(true); setError(''); setSaved('')
    try {
      const view = await saveIntakeQuestions(jobTypeSlug, questions)
      setDrafts(view.questions.map(toDraft)); setSeeded(view.seeded); setTargets(view.targets); setDirty(false)
      setSaved(questions === null ? 'Förslagen ur branschen används igen.' : 'Frågorna är sparade och ställs vid nästa offert.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Frågorna kunde inte sparas.') }
    finally { lock.current = false; setSaving(false) }
  }

  function save() {
    if (!drafts) return
    // Ett alternativ mot en prislös artikel ger garanterat en 0 kr-rad i
    // kundens offert. Det är inte en halvfärdig fråga utan en trasig, så den
    // spärras här i stället för att bara färgas. Måste ligga FÖRE validatorn:
    // den känner bara frågans form, inte artikelregistrets priser.
    if (prislosaVal.length) {
      setError(`Alternativ utan pris: ${prislosaVal.join(', ')}. Sätt ett pris i artikelregistret, eller ta bort artikeln från alternativet.`)
      return
    }
    let questions: IntakeQuestion[]
    try { questions = validateIntakeQuestions(drafts.map(fromDraft)) }
    catch (err) { setError(err instanceof Error ? err.message : 'Kontrollera frågorna.'); return }
    void persist(questions)
  }

  const quantityTargets = targets.filter(t => t.kind === 'quantity')
  const optionTargets = targets.filter(t => t.kind === 'option')
  const disabled = busy || saving || loading || !canManage

  function targetPicker(index: number, q: Draft) {
    const list = q.kind === 'number' ? quantityTargets : optionTargets
    const chosen = q.targets ?? []
    const missing = missingIntakeTargets(q, targets)
    const chosenUnit = q.kind === 'number' ? targets.find(t => chosen.includes(t.id))?.unit : undefined
    return <fieldset className="job-questions-targets">
      <legend>{q.kind === 'number' ? 'Sätter mängden på' : 'Kryssar tillvalet'}</legend>
      {!list.length && <p className="job-setup-caption">{q.kind === 'number'
        ? 'Inga rader är kopplade till en artikel ännu — svaret går som underlag till Matte.'
        : 'Upplägget har inga tillvalsrader ännu — svaret går som underlag till Matte.'}</p>}
      {list.map(t => {
        const otherUnit = !!chosenUnit && !chosen.includes(t.id) && !equivalentUnit(t.unit, chosenUnit)
        return <label key={t.id} className={`job-questions-target${otherUnit ? ' is-muted' : ''}`}>
          <input type="checkbox" checked={chosen.includes(t.id)} disabled={disabled || otherUnit}
            aria-label={`${t.description} (${t.unit})`} onChange={() => toggleTarget(index, q, t)} />
          <span>{t.description}</span>
          <span className="job-questions-unit">{t.unit}{otherUnit ? ' · annan enhet' : ''}</span>
        </label>
      })}
      {missing.length > 0 && <p className="job-setup-note" role="status">
        {missing.length === 1 ? 'En rad' : `${missing.length} rader`} som frågan pekade på finns inte längre i upplägget — välj en annan eller ta bort frågan.
        {canManage && <> <button type="button" className="job-setup-text-button" disabled={disabled}
          onClick={() => update(index, { targets: chosen.filter(id => !missing.includes(id)).length ? chosen.filter(id => !missing.includes(id)) : undefined })}>Glöm de raderna</button></>}
      </p>}
    </fieldset>
  }

  return <section className="job-standard-editor" aria-label={`Frågor på plats för ${jobTypeName}`} aria-busy={loading || saving}>
    <h4>Frågor på plats</h4>
    <p className="job-setup-caption">Ställs när en offert startas från {jobTypeName}. Varje fråga pekar på rader i upplägget: mått och antal sätter mängden på de raderna, ja/nej kryssar tillvalet. Resten går som underlag till Matte.</p>
    {!loading && !quantityTargets.length && <p className="job-setup-note">Inga rader är kopplade till en artikel ännu, så en fråga om mått eller antal ändrar ingen mängd. Koppla raderna under &quot;Vad brukar ingå?&quot; så börjar svaren räkna. Ja/nej-frågor och fritext fungerar ändå.</p>}
    {loading && <p className="job-setup-loading" role="status"><Loader2 size={16} className="animate-spin" /> Hämtar frågorna…</p>}
    {error && <p role="alert" className="job-setup-error">{error}</p>}
    {saved && <p role="status" className="job-setup-caption">{saved}</p>}
    {drafts && !loading && <>
      {seeded && <p className="job-setup-note">Det här är förslag: en fråga per kopplad rad och per tillval. Slå ihop, byt ut eller fyll på — de blir era egna när du sparar.</p>}
      {!drafts.length && <p className="job-setup-note">Inga frågor. Offerten startar direkt från upplägget.</p>}
      {drafts.map((q, index) => <div className="job-questions-row" key={q.id}>
        <label>Fråga {index + 1}<input aria-label={`Fråga ${index + 1}`} value={q.label} maxLength={200} disabled={disabled}
          onChange={e => update(index, { label: e.target.value })} placeholder="Till exempel: Kakel golv: hur många m²?" /></label>
        <label>Typ<select aria-label={`Typ för fråga ${index + 1}`} value={q.kind} disabled={disabled}
          onChange={e => setKind(index, e.target.value as IntakeQuestionKind)}>
          {INTAKE_KINDS.map(kind => <option key={kind} value={kind}>{INTAKE_KIND_LABELS[kind]}</option>)}
        </select></label>
        {(q.kind === 'number' || q.kind === 'yesno') && targetPicker(index, q)}
        {q.kind === 'choice' && <fieldset className="job-questions-targets">
          <legend>Alternativ — och vad de lägger in</legend>
          {(q.choiceDrafts ?? []).map((choice, ci) => {
            const artikel = choice.productId ? artiklar.find(a => a.id === choice.productId) : undefined
            const prislos = !!artikel && artikel.sales_price <= 0
            const setChoice = (patch: Partial<IntakeChoice>) => update(index, {
              choiceDrafts: (q.choiceDrafts ?? []).map((c, i) => i === ci ? { ...c, ...patch } : c),
            })
            return <div key={ci} className="job-questions-choice">
              <input aria-label={`Alternativ ${ci + 1} för fråga ${index + 1}`} value={choice.label} disabled={disabled}
                onChange={e => setChoice({ label: e.target.value })} placeholder="Till exempel: Klinker" />
              <select aria-label={`Artikel för alternativ ${ci + 1} i fråga ${index + 1}`} value={choice.productId ?? ''} disabled={disabled}
                onChange={e => setChoice({ productId: e.target.value || undefined })}>
                <option value="">Lägger inte in någon rad</option>
                {artiklar.map(a => <option key={a.id} value={a.id}>
                  {a.name}{a.sales_price > 0 ? ` — ${a.sales_price.toLocaleString('sv-SE')} kr/${a.unit || 'st'}` : ' — pris saknas'}
                </option>)}
              </select>
              {(q.choiceDrafts?.length ?? 0) > 2 && <button type="button" disabled={disabled} aria-label={`Ta bort alternativ ${ci + 1}`}
                onClick={() => update(index, { choiceDrafts: (q.choiceDrafts ?? []).filter((_, i) => i !== ci) })}><Trash2 size={16} /></button>}
              {prislos && <p role="alert" className="job-questions-warning">
                Artikeln saknar pris. Alternativet skulle ge en rad på 0 kr — sätt ett pris i artikelregistret först.
              </p>}
            </div>
          })}
          {(q.choiceDrafts?.length ?? 0) < 12 && <button type="button" disabled={disabled}
            onClick={() => update(index, { choiceDrafts: [...(q.choiceDrafts ?? []), { label: '' }] })}>
            <Plus size={16} /> Lägg till alternativ</button>}
        </fieldset>}
        {canManage && <div className="job-setup-inline">
          <button type="button" aria-label={`Flytta upp fråga ${index + 1}`} disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} /></button>
          <button type="button" aria-label={`Flytta ner fråga ${index + 1}`} disabled={disabled || index === drafts.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></button>
          <button type="button" aria-label={`Ta bort fråga ${index + 1}`} disabled={disabled} onClick={() => remove(index)}><Trash2 size={16} /></button>
        </div>}
      </div>)}
      {canManage && <div className="job-setup-inline">
        <button type="button" disabled={disabled || drafts.length >= INTAKE_MAX_QUESTIONS} onClick={add}><Plus size={16} /> Lägg till fråga</button>
        <button type="button" className="job-setup-primary" disabled={disabled || !dirty} onClick={save}>{saving ? 'Sparar…' : 'Spara frågorna'}</button>
        {!seeded && <button type="button" className="job-setup-text-button" disabled={disabled} onClick={() => void persist(null)}>Tillbaka till förslagen</button>}
      </div>}
      <p className="job-setup-caption">Ändringar gäller kommande offerter. Redan skapade offerter behåller sina svar.</p>
    </>}
  </section>
}
