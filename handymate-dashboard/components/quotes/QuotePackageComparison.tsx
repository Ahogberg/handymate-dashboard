'use client'
import { useState } from 'react'
import type { QuoteItem } from '@/lib/types/quote'
import { applyPackage, comparePackage, PACKAGE_LABELS, type PackageLevel } from '@/lib/quotes/package-comparison'
const money = (n: number) => new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(n)
export default function QuotePackageComparison({ items, discountPercent, vatRate, onApply }: {
  items: QuoteItem[]; discountPercent: number; vatRate: number; onApply: (items: QuoteItem[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<string[] | null>(null)
  const [notice, setNotice] = useState('')
  const options = items.filter(row => row.item_type === 'option' && !row.is_hidden)
  const recommended = chosen ?? options.filter(row => row.option_selected).map(row => row.id)
  if (!items.length) return null
  return <section className="mb-4 rounded-xl border border-teal-200 bg-white p-4">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-[44px] w-full text-left font-semibold text-teal-800">Jämför offertpaket <span className="float-right text-sm">{open ? 'Stäng' : 'Öppna'}</span></button>
    {open && <div className="space-y-4">
      <p className="text-sm text-slate-600">Jämför tre nivåer med dina egna priser. Lägg relevanta tillägg som tillval i radlistan. Ett paketval ändrar förvalen i utkastet; kunden kan fortfarande välja tillval i den vanliga offerten.</p>
      {!options.length ? <p className="text-sm">Lägg till minst ett tillval för att jämföra olika nivåer.</p> : <>
        <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Vilka tillval rekommenderar du?</legend>{options.map(row => <label key={row.id} className="flex min-h-[44px] items-center gap-3 text-sm"><input type="checkbox" checked={recommended.includes(row.id)} onChange={event => { setNotice(''); setChosen(event.target.checked ? [...recommended, row.id] : recommended.filter(id => id !== row.id)) }} />{row.description || 'Namnlöst tillval'}</label>)}</fieldset>
        <div className="grid gap-3 lg:grid-cols-3">{(['base','recommended','extended'] as PackageLevel[]).map(level => {
          const result = comparePackage(items, level, recommended, discountPercent, vatRate)
          return <article key={level} className="min-w-0 rounded-lg border p-3"><h3 className="font-semibold">{PACKAGE_LABELS[level]}</h3><p className="my-2 text-lg font-semibold">{result.valid ? money(result.total) : 'Pris behöver kontrolleras'}</p><p className="text-xs text-slate-500">Inkl. moms, före eventuellt skatteavdrag</p><ul className="my-3 space-y-1 text-sm"><li>Offertens grundarbete</li>{result.options.map((text,index) => <li key={index}>+ {text}</li>)}</ul><p className="text-xs text-slate-600">{result.valid && result.contribution !== null ? `Beräknat täckningsbidrag: ${money(result.contribution)} exkl. moms` : 'Täckningsbidrag kan inte beräknas med komplett underlag.'}</p><button type="button" disabled={!result.valid} onClick={() => { setChosen(recommended); onApply(applyPackage(items, level, recommended)); setNotice(`${PACKAGE_LABELS[level]} är tillämpat i utkastet. Kontrollera offerten innan du sparar eller skickar.`) }} className="mt-3 min-h-[44px] w-full rounded-lg bg-teal-700 p-2 text-sm text-white disabled:opacity-50">Använd {PACKAGE_LABELS[level].toLowerCase()}</button></article>
        })}</div>
        <p className="text-xs text-slate-500">Täckningsbidrag bygger på registrerade radkostnader och rabatter. Företagets övriga kostnader ingår inte. Paketgrupperingen är en arbetsvy; det är offertens tillval och förval som sparas.</p>
      </>}
      {notice && <p role="status" className="rounded-lg bg-teal-50 p-3 text-sm text-teal-900">{notice}</p>}
    </div>}
  </section>
}
