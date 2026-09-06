'use client'

import { useEffect, useRef, useState } from 'react'
import type { QuoteItem } from '@/lib/types/quote'
import { sameUnit } from '@/lib/quotes/job-type-setup'
import type { QuoteSetupData, SetupTemplate } from '@/lib/quotes/job-type-setup'

/** Explicit reuse of selected product references/quantities, never customer text or quote prices. */
export function SaveJobStandardFromQuote({ jobType, items }: { jobType: string; items: QuoteItem[] }) {
  const [data, setData] = useState<(QuoteSetupData & { canManage: boolean }) | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [templateId, setTemplateId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const lock = useRef(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setData(null); setError(''); setSaved(false)
    fetch('/api/job-types/quote-setup', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Kunde inte läsa jobbtypen.')
      setData(result)
      const linked = result.templates.filter((t: SetupTemplate) => t.jobTypeSlug === jobType)
      setTemplateId(linked.length === 1 ? linked[0].id : '')
    }).catch(err => { if (!controller.signal.aborted) setError(err.message) })
    return () => controller.abort()
  }, [jobType, revision])
  const job = data?.jobTypes.find(j => j.slug === jobType)
  const templates = data?.templates.filter(t => t.jobTypeSlug === jobType) || []
  const rows = items.map((item, index) => ({ item, index })).filter(({ item }) => item.item_type === 'item' || item.item_type === 'option')
  const eligible = (item: QuoteItem) => data?.products.some(p => p.id === item.linked_product_id && sameUnit(p.unit, item.unit)) && item.quantity > 0
  const chosen = rows.filter(({ item, index }) => selected.includes(index) && eligible(item))

  async function save() {
    if (lock.current || !chosen.length || !job || !data?.canManage) return
    lock.current = true; setBusy(true); setError(''); setSaved(false)
    async function write(body: unknown) {
      const response = await fetch('/api/job-types/quote-setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Kunde inte spara standardraderna.')
      return result.template as SetupTemplate
    }
    try {
      let template = templates.find(t => t.id === templateId)
      if (!templates.length) {
        template = await write({ operation: 'create', jobTypeSlug: jobType })
        // A concurrent tab may have filled the new standard. Never replace unseen rows.
        if (template.items.length) throw new Error('Ett upplägg har hunnit skapas. Läs in det och granska innan du ersätter raderna.')
      }
      if (!template) throw new Error('Välj vilket upplägg som ska få standardraderna.')
      const updated = await write({ operation: 'replace', jobTypeSlug: jobType, templateId: template.id, updatedAt: template.updatedAt,
        rows: chosen.map(({ item }) => ({ productId: item.linked_product_id, quantity: item.quantity })) })
      setData(old => old ? { ...old, templates: [...old.templates.filter(t => t.id !== updated.id), updated] } : old)
      setTemplateId(updated.id); setSaved(true)
    } catch (err) { setError(err instanceof Error ? err.message : 'Kunde inte spara standardraderna.') }
    finally { lock.current = false; setBusy(false) }
  }

  return <details className="mt-5 border-t border-slate-200 pt-4">
    <summary className="cursor-pointer font-semibold text-teal-800">Spara standardrader för jobbtypen</summary>
    {!data && !error && <p role="status">Hämtar jobbtypen…</p>}
    {error && <p role="alert" className="my-2 text-sm text-red-700">{error} <button type="button" disabled={busy} onClick={() => setRevision(n => n + 1)}>Läs in igen</button></p>}
    {data && !job && <p>Jobbtypen finns inte längre. Välj en aktuell jobbtyp för att spara standardrader.</p>}
    {job && <>
      <p className="my-3 text-sm text-slate-600">Välj artiklar och standardmängder för <strong>{job.name}</strong>. Artikelregistrets priser används nästa gång. Kundtexter, rabatter och villkor från denna offert följer inte med.</p>
      {templates.length > 1 && <select aria-label="Upplägg att ersätta standardrader i" className="w-full rounded-lg border p-2 mb-3" value={templateId} disabled={busy} onChange={e => { setTemplateId(e.target.value); setSaved(false) }}>
        <option value="">Välj offertupplägg</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>}
      <div className="max-h-52 overflow-auto">{rows.map(({ item, index }) => <label key={item.id || index} className="flex gap-2 items-start py-2 text-sm">
        <input type="checkbox" disabled={busy || !eligible(item) || !data?.canManage} checked={selected.includes(index)} onChange={e => {
          setSelected(old => e.target.checked ? [...old, index] : old.filter(i => i !== index)); setSaved(false)
        }} />
        <span>{item.description} · {item.quantity} {item.unit}{!eligible(item) && <small className="block text-slate-500">Koppla raden till en aktiv artikel med samma enhet och giltig mängd först.</small>}{item.item_type === 'option' && <small className="block text-slate-500">Sparas som vanlig standardrad om du väljer den.</small>}</span>
      </label>)}</div>
      {templates.find(t => t.id === templateId) && <p className="my-3 text-sm text-amber-800">De valda raderna ersätter samtliga befintliga standardrader i ”{templates.find(t => t.id === templateId)?.name}”. Redan skapade offerter ändras inte.</p>}
      <button type="button" className="my-3 w-full rounded-lg bg-teal-700 px-3 py-3 text-white disabled:opacity-50" disabled={busy || !data?.canManage || !chosen.length || (templates.length > 0 && !templateId)} onClick={() => void save()}>
        {busy ? 'Sparar…' : `Spara ${chosen.length} valda rader som standard`}
      </button>
      {!data?.canManage && <p>Bara ägare och administratörer kan ändra standardrader.</p>}
      {saved && <p role="status" className="text-sm text-teal-800">Standardraderna är sparade för {job.name}. Den här offerten är oförändrad.</p>}
    </>}
  </details>
}
