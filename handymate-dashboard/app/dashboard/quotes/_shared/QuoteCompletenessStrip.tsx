'use client'
import { SECTION_ORDER,SECTION_LABELS,type QuoteSection,type SectionSummary } from '@/lib/quotes/quote-completeness'
interface QuoteCompletenessStripProps {summaries:Record<QuoteSection,SectionSummary>;onSelect:(section:QuoteSection)=>void}
/** One next question, with all sections available on demand. Never gates editing. */
export function QuoteCompletenessStrip({summaries,onSelect}:QuoteCompletenessStripProps){
  const attention=SECTION_ORDER.filter(section=>summaries[section].attention)
  const next=attention[0]
  return <div className="rounded-xl border border-slate-200 bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="text-xs font-medium text-slate-500">{next?'Nästa sak att kontrollera':'Din offertöversikt'}</p><p className="text-sm font-semibold text-slate-900">{next?summaries[next].attention:'Inga automatiska uppmärksamhetspunkter — granska kundens offert före utskick.'}</p></div>
      {next && <button type="button" onClick={()=>onSelect(next)} className="min-h-[44px] rounded-lg bg-teal-700 px-3 text-sm font-medium text-white">Kontrollera {SECTION_LABELS[next].toLowerCase()} →</button>}
    </div>
    <details className="mt-1"><summary className="min-h-[44px] cursor-pointer py-3 text-xs font-medium text-slate-600">Visa alla delar{attention.length>1?` · ${attention.length} behöver ses över`:''}</summary><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{SECTION_ORDER.map(section=><button type="button" key={section} onClick={()=>onSelect(section)} className={`min-h-[44px] rounded-lg border p-3 text-left text-sm ${summaries[section].attention?'border-amber-200 bg-amber-50 text-amber-900':'border-slate-200 text-slate-700'}`}><span className="block font-medium">{SECTION_LABELS[section]}</span>{summaries[section].attention || summaries[section].text}</button>)}</div></details>
  </div>
}
