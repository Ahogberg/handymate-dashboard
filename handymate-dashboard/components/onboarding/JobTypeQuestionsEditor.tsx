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
  type IntakeQuestion, type IntakeQuestionKind, type IntakeTarget,
} from '@/lib/quotes/intake-questions'

interface Props {
  jobTypeSlug: string
  jobTypeName: string
  canManage: boolean
  busy: boolean
  /** Bumpas när standardraderna ändrats — raderna att peka på kan ha blivit fler. */
  refreshKey?: string | number
}

interface Draft extends IntakeQuestion { choicesText?: string }

function newId(existing: Draft[]): string {
  let n = existing.length + 1
  while (existing.some(q => q.id === `fraga_${n}`)) n += 1
  return `fraga_${n}`
}

function toDraft(q: IntakeQuestion): Draft { return { ...q, choicesText: q.choices?.join(', ') ?? '' } }

function fromDraft(d: Draft): IntakeQuestion {
  const q: IntakeQuestion = { id: d.id, label: d.label, kind: d.kind }
  if ((d.kind === 'number' || d.kind === 'yesno') && d.targets?.length) q.targets = d.targets.slice()
  if (d.kind === 'number' && d.unit?.trim()) q.unit = d.unit.trim()
  if (d.kind === 'choice') q.choices = (d.choicesText ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return q
}

export function JobTypeQuestionsEditor({ jobTypeSlug, jobTypeName, canManage, busy, refreshKey = '' }: Props) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [seeded, setSeeded] = useState(false)
  const [targets, setTargets] = useState<IntakeTarget[]>([])
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
    setDrafts(prev => { const list = prev ?? []; return [...list, { id: newId(list), label: '', kind: 'number', choicesText: '' }] })
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
        {q.kind === 'choice' && <label>Alternativ, kommaseparerade<input aria-label={`Alternativ för fråga ${index + 1}`} value={q.choicesText ?? ''} disabled={disabled}
          onChange={e => update(index, { choicesText: e.target.value })} placeholder="Kakel, Klinker, Våtrumsmatta" /></label>}
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
