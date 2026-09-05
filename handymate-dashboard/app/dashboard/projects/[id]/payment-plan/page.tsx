'use client'
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { PlanSnapshot } from '@/lib/invoices/payment-plan/calculations'
const money = (cents: number) => (cents / 100).toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })
export default function PaymentPlanPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dates, setDates] = useState<Record<string,string>>({})
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${id}/payment-plan`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setData(result)
    } catch (e: any) { setError(e.message) }
  }, [id])
  useEffect(() => { void load() }, [load])
  async function act(body: any) {
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/projects/${id}/payment-plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      if (body.action === 'invoice') router.push(`/dashboard/invoices/${result.invoice.invoice_id}`)
      else await load()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  const snapshot: PlanSnapshot | undefined = data?.plan?.snapshot || data?.preview
  const entries: any[] = data?.entries || []
  const next = entries.filter(e => e.kind !== 'credit').length
  const blocked = entries.some(e => e.invoice.status === 'draft')
  return <main className="mx-auto max-w-4xl p-4 md:p-8 text-gray-900">
    <Link href={`/dashboard/projects/${id}`} className="text-teal-700">← Till projektet</Link>
    <h1 className="mt-5 text-3xl font-semibold">Fakturera enligt betalplan</h1>
    <p className="mt-2 text-gray-600">Skapa ett fakturautkast per avtalad etapp. Sista steget räknar av tidigare fakturor och utfärdade krediter. ÄTA faktureras separat.</p>
    {error && <p role="alert" className="my-4 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {!snapshot && !error && <p role="status" className="mt-6">Läser betalplan…</p>}
    {snapshot && <>
      <div className="my-6 grid gap-3 sm:grid-cols-3">
        {[['Offert inklusive moms', snapshot.amounts.net + snapshot.amounts.vat], ['Tidigare fakturerat', (data?.billed?.net || 0) + (data?.billed?.vat || 0)], ['Kvar att fakturera', data?.remaining ? data.remaining.net + data.remaining.vat : snapshot.amounts.net + snapshot.amounts.vat]].map(([label, amount]) => <div key={String(label)} className="rounded-xl border bg-white p-4"><p className="text-sm text-gray-600">{label}</p><p className="text-xl font-semibold">{money(Number(amount))}</p></div>)}
      </div>
      {!data.plan && <div className="mb-6 rounded-xl border border-teal-200 bg-teal-50 p-4"><p>Aktivering låser offertens belopp och betalsteg. Projekt med tidigare fakturor behöver först stämmas av.</p><button disabled={busy} onClick={() => act({ action: 'activate' })} className="mt-3 rounded-lg bg-teal-700 px-4 py-2 text-white disabled:opacity-50">Aktivera betalplan</button></div>}
      {blocked && <p className="mb-4 text-amber-800">Öppna och skicka det väntande utkastet innan du går vidare.</p>}
      <ol className="space-y-4">{snapshot.stages.map((stage, index) => {
        const entry = entries.find(e => e.step === index && e.kind !== 'credit')
        const final = index === snapshot.stages.length - 1
        const amounts = final && data?.remaining && !entry ? data.remaining : entry?.amounts || stage.amounts
        return <li key={index} className="rounded-xl border bg-white p-5">
          <div className="flex flex-wrap justify-between gap-3"><h2 className="font-semibold">{index + 1}. {stage.label}{final ? ' · Slutavräkning' : ''}</h2><span>{stage.percent} %</span></div>
          <p className="mt-1 text-sm text-gray-600">{stage.due}</p>
          <p className="mt-3 text-xl font-semibold">{money(amounts.net + amounts.vat - amounts.deduction)} att betala</p>
          <p className="text-sm text-gray-600">Inklusive moms {money(amounts.vat)}{snapshot.taxType ? ` · ${snapshot.taxType.toUpperCase()} ${money(amounts.deduction)} · Arbete exkl. moms ${money(amounts.labor)}` : ''}</p>
          {entry ? <div className="mt-3"><Link className="text-teal-700 underline" href={`/dashboard/invoices/${entry.invoice_id}`}>Öppna {entry.invoice.invoice_number}</Link><span className="ml-3 text-sm">{({ draft:'Utkast', sent:'Skickad', paid:'Betald', customer_paid:'Kundens del betald', credited:'Krediterad', overdue:'Förfallen' } as Record<string,string>)[entry.invoice.status] || entry.invoice.status}</span>
            {snapshot.taxType && <div className="mt-4 border-t pt-3"><p className="text-sm">ROT/RUT-ansökan kräver utfört arbete och betald kundandel. Bekräfta när arbetet som denna faktura avser är utfört.</p>{entry.invoice.payment_plan_work_completed_on ? <p className="mt-2 text-teal-800">Utfört {entry.invoice.payment_plan_work_completed_on}</p> : <div className="mt-2 flex flex-wrap gap-2"><input aria-label={`Utfört datum för ${stage.label}`} type="date" max={new Date().toISOString().slice(0,10)} value={dates[entry.invoice_id] || ''} onChange={e => setDates({ ...dates, [entry.invoice_id]: e.target.value })} className="rounded border px-3 py-2"/><button disabled={busy || !dates[entry.invoice_id]} onClick={() => act({ action:'work_completed', invoice_id:entry.invoice_id, date:dates[entry.invoice_id] })} className="rounded border px-3 py-2 disabled:opacity-50">Bekräfta utfört arbete</button></div>}</div>}
          </div> : <button disabled={busy || !data.plan || index !== next || blocked} onClick={() => act({ action:'invoice', step:index })} className="mt-4 rounded-lg bg-teal-700 px-4 py-2 text-white disabled:opacity-40">{final ? 'Skapa slutfakturautkast' : 'Skapa delfakturautkast'}</button>}
          {entries.filter(e => e.original_id === entry?.invoice_id).map(c => <p key={c.invoice_id} className="mt-2 text-sm"><Link className="text-teal-700 underline" href={`/dashboard/invoices/${c.invoice_id}`}>Kredit {c.invoice.invoice_number}</Link>{c.invoice.status === 'draft' ? ' · Utkast, ännu inte avräknat' : ' · Avräknad'}</p>)}
        </li>
      })}</ol>
      {snapshot.taxType && <p className="mt-5 text-sm text-gray-600">Vid förskottsbetalning över årsskiftet måste arbetet vara utfört och ansökan gjord senast 31 januari följande år. <Link href="/dashboard/invoices/rot-payment" className="text-teal-700 underline">Öppna ROT/RUT-ansökningar</Link></p>}
    </>}
  </main>
}
