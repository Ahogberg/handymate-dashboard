'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/AgentAvatar'

/**
 * "Daniels bedömning" — Kvittoprincipen Fall 1 (docs/design/
 * SYNLIG-INTELLIGENS.md, 2026-08-13). Offertmotorns eget resonemang
 * (GeneratedQuote.reasoning) + de regler/lärdomar/kundfakta som FAKTISKT
 * vävdes in i prompten — beräknades och returnerades redan, renderades
 * bara aldrig.
 *
 * Kvittoreglerna som styr formen här:
 * - Tomt reasoning ⇒ inget block alls (aldrig ett tomt skal).
 * - Arbetsyta ⇒ ihopfällt till en rad — UTOM när en affärsregel
 *   aktiverats (rules icke-tom): då expanderat från start. En regel som
 *   säger "ta inte jobbet" får inte gömma sig bakom ett klick.
 * - Tomma listor renderar ingen rad. Etiketterna är "Din regel"/
 *   "Lärdom"/"Kundfakta" — allt är kundens EGEN bekräftade kunskap.
 * - Expansionen heter exakt "Visa varför" (aldrig "Detaljer"/"Mer info").
 */

interface Props {
  reasoning: string | null
  rules: Array<{ observation: string }>
  lessons: Array<{ lesson_text: string }>
  customerFacts: Array<{ content: string }>
  /** Modellens egen siffra ur svaret — null visas inte (aldrig en
      default som ser ut som en bedömning). */
  confidence: number | null
}

export function DanielsBedomning({ reasoning, rules, lessons, customerFacts, confidence }: Props) {
  const harRegel = rules.length > 0
  const [expanded, setExpanded] = useState(harRegel)

  const text = (reasoning || '').trim()
  if (!text) return null

  const delar: string[] = []
  if (rules.length > 0) delar.push(`${rules.length} regel${rules.length === 1 ? '' : 'er'}`)
  if (lessons.length > 0) delar.push(`${lessons.length} lärdom${lessons.length === 1 ? '' : 'ar'}`)
  if (customerFacts.length > 0) delar.push(`${customerFacts.length} kundfakta`)

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full flex items-center gap-2.5 bg-white border border-[#E2E8F0] rounded-xl px-4 py-2.5 mb-4 text-left hover:border-primary-200 transition-colors"
      >
        <AgentAvatar agentKey="daniel" size="sm" />
        <span className="flex-1 min-w-0 text-sm text-slate-600 truncate">
          <b className="font-semibold text-slate-900">Daniels bedömning</b>
          {delar.length > 0 && <span className="text-slate-400"> · {delar.join(' · ')}</span>}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 shrink-0">
          Visa varför
          <ChevronDown className="w-3.5 h-3.5" />
        </span>
      </button>
    )
  }

  return (
    <div className="bg-white border border-[#E2E8F0] border-l-[3px] border-l-primary-500 rounded-xl px-4 py-3.5 mb-4">
      <div className="flex items-center gap-2.5">
        <AgentAvatar agentKey="daniel" size="sm" />
        <span className="flex-1 min-w-0 text-sm">
          <b className="font-semibold text-slate-900">Daniels bedömning</b>
          {typeof confidence === 'number' && (
            <span className="text-slate-400"> · säkerhet {confidence} %</span>
          )}
        </span>
        {/* Regel-fallet öppnas expanderat med flit — men får fällas ihop. */}
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-primary-700 shrink-0 transition-colors"
        >
          Fäll ihop
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
      </div>

      <p className="m-0 mt-2 text-[13px] leading-relaxed text-slate-600 italic">
        &ldquo;{text}&rdquo;
      </p>

      {(rules.length > 0 || lessons.length > 0 || customerFacts.length > 0) && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-1.5">
          {rules.map((r, i) => (
            <p key={`r-${i}`} className="m-0 text-[13px] text-slate-600 flex gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 shrink-0 pt-0.5">Din regel</span>
              <span className="min-w-0">{r.observation}</span>
            </p>
          ))}
          {lessons.map((l, i) => (
            <p key={`l-${i}`} className="m-0 text-[13px] text-slate-600 flex gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary-700 shrink-0 pt-0.5">Lärdom</span>
              <span className="min-w-0">{l.lesson_text}</span>
            </p>
          ))}
          {customerFacts.map((f, i) => (
            <p key={`f-${i}`} className="m-0 text-[13px] text-slate-600 flex gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 shrink-0 pt-0.5">Kundfakta</span>
              <span className="min-w-0">{f.content}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
