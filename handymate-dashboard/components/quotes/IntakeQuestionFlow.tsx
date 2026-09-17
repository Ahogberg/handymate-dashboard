'use client'

/**
 * Frågeflödet på plats (2026-09-17). Fullskärm som Snabbofferten, EN skärm
 * med alla frågor: på telefon är det snabbare att scrolla än att bläddra,
 * och hantverkaren ser direkt vad som är kvar. Varje fråga går att hoppa
 * över — ett tomt svar rör ingen rad. "Hoppa över frågorna" ger upplägget
 * orört; "Tillbaka" lämnar allt som det var. Röst per fritextfråga via samma
 * hook och transkriberingsrutt som Snabbofferten; texten landar redigerbar.
 */
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Loader2, Mic, Square } from 'lucide-react'
import { useAudioRecording } from '@/hooks/useAudioRecording'
import { normalizeIntakeAnswer, type IntakeAnswers, type IntakeQuestion } from '@/lib/quotes/intake-questions'

interface Props {
  jobTypeName: string
  questions: IntakeQuestion[]
  initialAnswers?: IntakeAnswers
  busy: boolean
  error?: string | null
  onSubmit: (answers: IntakeAnswers) => void
  onSkip: () => void
  onBack: () => void
}

export function IntakeQuestionFlow({ jobTypeName, questions, initialAnswers, busy, error, onSubmit, onSkip, onBack }: Props) {
  const [answers, setAnswers] = useState<IntakeAnswers>(initialAnswers ?? {})
  const [voiceTarget, setVoiceTarget] = useState<string | null>(null)
  const [transcribing, setTranscribing] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const recording = useAudioRecording()
  const handledBlobRef = useRef<Blob | null>(null)
  const targetRef = useRef<string | null>(null)
  targetRef.current = voiceTarget

  useEffect(() => {
    const blob = recording.blob
    if (!blob || handledBlobRef.current === blob) return
    handledBlobRef.current = blob
    const target = targetRef.current
    let cancelled = false
    const run = async () => {
      setTranscribing(true); setVoiceError(null)
      try {
        const form = new FormData()
        form.append('audio', blob, 'inspelning.webm')
        const res = await fetch('/api/matte/transcribe', { method: 'POST', body: form })
        const data = await res.json()
        if (cancelled) return
        if (!res.ok || !data.text || !target) { setVoiceError(data.error || 'Kunde inte tolka inspelningen — skriv gärna i stället.'); return }
        setAnswers(prev => {
          const current = typeof prev[target] === 'string' ? String(prev[target]).trim() : ''
          return { ...prev, [target]: current ? `${current}\n${data.text}` : data.text }
        })
      } catch {
        if (!cancelled) setVoiceError('Kunde inte tolka inspelningen — skriv gärna i stället.')
      } finally {
        if (!cancelled) { setTranscribing(false); setVoiceTarget(null); recording.reset() }
      }
    }
    void run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording.blob])

  const isRecording = recording.state === 'recording'
  const voiceUnavailable = recording.state === 'denied' || recording.state === 'unsupported'
  const answered = questions.filter(q => normalizeIntakeAnswer(q, answers[q.id]) !== null).length
  const set = (id: string, value: IntakeAnswers[string]) => setAnswers(prev => ({ ...prev, [id]: value }))
  const field = 'w-full min-h-[48px] px-4 py-3 border-2 border-slate-200 rounded-xl text-slate-900 bg-white focus:outline-none focus:border-primary-700 focus:ring-4 focus:ring-primary-100 transition-colors'
  const chip = (active: boolean) => `min-h-[44px] px-4 rounded-xl border-2 text-sm font-semibold transition-colors ${active ? 'bg-primary-700 border-primary-700 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-primary-300'}`

  return (
    <div className="fixed inset-0 bg-slate-50 z-50 overflow-y-auto" aria-busy={busy}>
      <div className="max-w-xl mx-auto min-h-screen flex flex-col px-4 py-5 sm:py-8">
        <div className="flex items-center justify-between mb-5">
          <button type="button" onClick={onBack} disabled={busy} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 -ml-1 px-2 py-2 disabled:opacity-50">
            <ArrowLeft className="w-4 h-4" />Tillbaka
          </button>
          <button type="button" onClick={onSkip} disabled={busy} className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-primary-700 px-2 py-2 transition-colors disabled:opacity-50">
            Hoppa över frågorna<ArrowRight className="w-4 h-4" />
          </button>
        </div>
        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-700">{jobTypeName}</p>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Några frågor om jobbet</h1>
          <p className="text-slate-500 mt-2">Svaren sätter mängderna i offerten. Hoppa över det du inte vet — allt går att ändra i offerten sedan.</p>
        </div>

        <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (!busy) onSubmit(answers) }}>
          {questions.map((q, index) => {
            const value = answers[q.id]
            return <fieldset key={q.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <legend className="sr-only">{q.label}</legend>
              <label htmlFor={`intake-${q.id}`} className="block text-sm font-semibold text-slate-900 mb-2">
                <span className="text-slate-400 mr-1.5">{index + 1}.</span>{q.label}
              </label>
              {q.kind === 'number' && <div className="flex items-center gap-2">
                <input id={`intake-${q.id}`} inputMode="decimal" className={field} disabled={busy} placeholder="0"
                  value={typeof value === 'number' || typeof value === 'string' ? String(value) : ''} onChange={e => set(q.id, e.target.value)} />
                {q.unit && <span className="text-sm font-semibold text-slate-500 shrink-0 min-w-[2.5rem]">{q.unit}</span>}
              </div>}
              {q.kind === 'yesno' && <div className="flex gap-2" role="group" aria-labelledby={`intake-${q.id}`}>
                {[['Ja', true], ['Nej', false]].map(([label, v]) => <button key={String(v)} type="button" disabled={busy}
                  aria-pressed={value === v} className={`${chip(value === v)} flex-1`}
                  onClick={() => set(q.id, value === v ? null : (v as boolean))}>{label}</button>)}
              </div>}
              {q.kind === 'choice' && <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`intake-${q.id}`}>
                {(q.choices ?? []).map(choice => <button key={choice} type="button" disabled={busy} aria-pressed={value === choice}
                  className={chip(value === choice)} onClick={() => set(q.id, value === choice ? null : choice)}>{choice}</button>)}
              </div>}
              {q.kind === 'text' && <div className="relative">
                <textarea id={`intake-${q.id}`} rows={2} className={`${field} pr-14 resize-none`} disabled={busy}
                  value={typeof value === 'string' ? value : ''} onChange={e => set(q.id, e.target.value)} placeholder="Skriv eller prata in" />
                <button type="button" disabled={busy || transcribing || voiceUnavailable || (isRecording && voiceTarget !== q.id)}
                  title={isRecording && voiceTarget === q.id ? 'Stoppa inspelningen' : 'Prata in svaret'}
                  aria-label={isRecording && voiceTarget === q.id ? 'Stoppa inspelningen' : `Prata in svaret på ${q.label}`}
                  onClick={() => { if (isRecording) { recording.stop() } else { setVoiceTarget(q.id); void recording.start() } }}
                  className={`absolute right-2 bottom-2 w-10 h-10 rounded-full flex items-center justify-center transition-all disabled:opacity-40 ${
                    isRecording && voiceTarget === q.id ? 'bg-red-600 text-white ring-4 ring-red-100' : 'bg-primary-50 hover:bg-primary-100 text-primary-700'}`}>
                  {transcribing && voiceTarget === q.id ? <Loader2 className="w-4 h-4 animate-spin" />
                    : isRecording && voiceTarget === q.id ? <Square className="w-4 h-4" fill="currentColor" /> : <Mic className="w-4 h-4" />}
                </button>
              </div>}
            </fieldset>
          })}

          <div className="min-h-[20px]">
            {isRecording && <p className="text-sm text-red-600 font-medium flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />Lyssnar… {recording.durationLabel}</p>}
            {transcribing && <p className="text-sm text-slate-500">Skriver ner…</p>}
            {voiceError && <p className="text-sm text-amber-700">{voiceError}</p>}
            {recording.state === 'denied' && <p className="text-sm text-slate-500">Mikrofonen är blockerad i webbläsaren. Skriv i rutan i stället.</p>}
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          </div>

          <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-slate-50/95 backdrop-blur border-t border-slate-200 flex items-center justify-between gap-3">
            <span role="status" className="text-xs text-slate-500">{answered} av {questions.length} besvarade</span>
            <button type="submit" disabled={busy || isRecording || transcribing}
              className="min-h-[48px] px-5 rounded-xl bg-primary-700 hover:bg-primary-800 text-white font-semibold inline-flex items-center gap-2 disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Skapa offerten<ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
