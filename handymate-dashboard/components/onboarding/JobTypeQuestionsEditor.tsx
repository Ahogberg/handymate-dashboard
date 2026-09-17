'use client'

/**
 * Frågorna per jobbtyp — redigera, byt ut, fyll på (2026-09-17, Andreas).
 * Bor i samma uppsättningsyta som standardraderna (onboarding + Inställningar
 * → Jobbtyper). Förslagen ur branschen visas tills firman sparar egna;
 * "Tillbaka till förslagen" tömmer det sparade. Ingen fråga har någon effekt
 * på priser: mått/antal sätter mängd på rader med samma enhet, ja/nej kan
 * kryssa ett tillval, resten går som text till Matte.
 */
import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react'
import { fetchIntakeQuestions, saveIntakeQuestions } from '@/lib/quotes/intake-flow'
import { INTAKE_KIND_LABELS, INTAKE_KINDS, INTAKE_MAX_QUESTIONS, validateIntakeQuestions, type IntakeQuestion, type IntakeQuestionKind } from '@/lib/quotes/intake-questions'

interface Props {
  jobTypeSlug: string
  jobTypeName: string
  canManage: boolean
  busy: boolean
  /** Bumpas när standardraderna ändrats — enheterna kan ha blivit fler. */
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
  if (d.kind === 'number' && d.unit?.trim()) q.unit = d.unit.trim()
  if (d.kind === 'choice') q.choices = (d.choicesText ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (d.kind === 'yesno' && d.optionMatch?.trim()) q.optionMatch = d.optionMatch.trim()
  return q
}

export function JobTypeQuestionsEditor({ jobTypeSlug, jobTypeName, canManage, busy, refreshKey = '' }: Props) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [seeded, setSeeded] = useState(false)
  const [units, setUnits] = useState<string[]>([])
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
      setDrafts(view.questions.map(toDraft)); setSeeded(view.seeded); setUnits(view.units); setDirty(false)
    }).catch(err => { if (request === revision.current && !controller.signal.aborted) setError(err instanceof Error ? err.message : 'Kunde inte hämta frågorna.') })
      .finally(() => { if (request === revision.current && !controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [jobTypeSlug, refreshKey])

  const update = (index: number, patch: Partial<Draft>) => {
    setDrafts(prev => prev ? prev.map((q, i) => i === index ? { ...q, ...patch } : q) : prev); setDirty(true); setSaved('')
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
    setDrafts(prev => { const list = prev ?? []; return [...list, { id: newId(list), label: '', kind: 'number', unit: units[0] ?? '', choicesText: '' }] })
    setDirty(true); setSaved('')
  }

  async function persist(questions: IntakeQuestion[] | null) {
    if (lock.current) return
    lock.current = true; setSaving(true); setError(''); setSaved('')
    try {
      const view = await saveIntakeQuestions(jobTypeSlug, questions)
      setDrafts(view.questions.map(toDraft)); setSeeded(view.seeded); setUnits(view.units); setDirty(false)
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

  const disabled = busy || saving || loading || !canManage
  return <section className="job-standard-editor" aria-label={`Frågor på plats för ${jobTypeName}`} aria-busy={loading || saving}>
    <h4>Frågor på plats</h4>
    <p className="job-setup-caption">Ställs när en offert startas från {jobTypeName}. Mått och antal sätter mängden på rader som är kopplade till en artikel med samma enhet{units.length ? ` (${units.join(', ')})` : ''}; ja/nej kan kryssa ett tillval; resten går som underlag till Matte.</p>
    {!loading && !units.length && <p className="job-setup-note">Inga rader är kopplade till en artikel ännu, så en fråga om mått eller antal ändrar ingen mängd. Koppla raderna under &quot;Vad brukar ingå?&quot; så börjar svaren räkna. Ja/nej-frågor och fritext fungerar ändå.</p>}
    {loading && <p className="job-setup-loading" role="status"><Loader2 size={16} className="animate-spin" /> Hämtar frågorna…</p>}
    {error && <p role="alert" className="job-setup-error">{error}</p>}
    {saved && <p role="status" className="job-setup-caption">{saved}</p>}
    {drafts && !loading && <>
      {seeded && <p className="job-setup-note">Det här är förslag ur din bransch. Ändra, byt ut eller fyll på — de blir era egna när du sparar.</p>}
      {!drafts.length && <p className="job-setup-note">Inga frågor. Offerten startar direkt från upplägget.</p>}
      {drafts.map((q, index) => <div className="job-questions-row" key={q.id}>
        <label>Fråga {index + 1}<input aria-label={`Fråga ${index + 1}`} value={q.label} maxLength={200} disabled={disabled}
          onChange={e => update(index, { label: e.target.value })} placeholder="Till exempel: Hur stor yta gäller det?" /></label>
        <label>Typ<select aria-label={`Typ för fråga ${index + 1}`} value={q.kind} disabled={disabled}
          onChange={e => update(index, { kind: e.target.value as IntakeQuestionKind })}>
          {INTAKE_KINDS.map(kind => <option key={kind} value={kind}>{INTAKE_KIND_LABELS[kind]}</option>)}
        </select></label>
        {q.kind === 'number' && <label>Enhet<input aria-label={`Enhet för fråga ${index + 1}`} list={`intake-units-${jobTypeSlug}`} value={q.unit ?? ''} maxLength={20} disabled={disabled}
          onChange={e => update(index, { unit: e.target.value })} placeholder="m², st, tim" /></label>}
        {q.kind === 'choice' && <label>Alternativ, kommaseparerade<input aria-label={`Alternativ för fråga ${index + 1}`} value={q.choicesText ?? ''} disabled={disabled}
          onChange={e => update(index, { choicesText: e.target.value })} placeholder="Kakel, Klinker, Våtrumsmatta" /></label>}
        {q.kind === 'yesno' && <label>Kryssar tillval som innehåller<input aria-label={`Kopplat tillval för fråga ${index + 1}`} value={q.optionMatch ?? ''} maxLength={80} disabled={disabled}
          onChange={e => update(index, { optionMatch: e.target.value })} placeholder="Golvvärme (valfritt)" /></label>}
        {canManage && <div className="job-setup-inline">
          <button type="button" aria-label={`Flytta upp fråga ${index + 1}`} disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} /></button>
          <button type="button" aria-label={`Flytta ner fråga ${index + 1}`} disabled={disabled || index === drafts.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></button>
          <button type="button" aria-label={`Ta bort fråga ${index + 1}`} disabled={disabled} onClick={() => remove(index)}><Trash2 size={16} /></button>
        </div>}
      </div>)}
      <datalist id={`intake-units-${jobTypeSlug}`}>{units.map(u => <option key={u} value={u} />)}</datalist>
      {canManage && <div className="job-setup-inline">
        <button type="button" disabled={disabled || drafts.length >= INTAKE_MAX_QUESTIONS} onClick={add}><Plus size={16} /> Lägg till fråga</button>
        <button type="button" className="job-setup-primary" disabled={disabled || !dirty} onClick={save}>{saving ? 'Sparar…' : 'Spara frågorna'}</button>
        {!seeded && <button type="button" className="job-setup-text-button" disabled={disabled} onClick={() => void persist(null)}>Tillbaka till förslagen</button>}
      </div>}
      <p className="job-setup-caption">Ändringar gäller kommande offerter. Redan skapade offerter behåller sina svar.</p>
    </>}
  </section>
}
