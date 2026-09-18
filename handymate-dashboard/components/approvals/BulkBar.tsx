'use client'

/**
 * Bulk med bekräftelse i godkännandekön.
 *
 * Bee Service hade 24 väntande kort 2026-09-18, det äldsta från 31 augusti.
 * En kö ingen svarar på är en signal ingen lyssnar på — men bulk är också
 * precis det verktyg som gör det lätt att godkänna något man inte läst.
 *
 * Därför: du markerar, och BEKRÄFTELSEN berättar vad som händer med varje
 * kort OCH vilka kort som inte kommer att röras, med skäl. Reglerna för vad
 * som får gå i bulk är husets egen klassificering (lib/approvals/bulk.ts) —
 * ingen ny behörighet, ingen ny klass. Utförandet skickar varje kort som sitt
 * eget beslut genom samma väg som ett klick på kortet.
 *
 * Panelen listar korten själv i stället för att lägga en kryssruta på varje
 * kortrenderare i den 1700 rader långa kösidan. Det håller ytan samlad och
 * gör det tydligt att gruppvägen är en egen, snävare väg.
 */

import { useMemo, useState } from 'react'
import { Loader2, Layers } from 'lucide-react'
import { bulkPlan, bulkKor, type BulkPlan, type BulkUtfall } from '@/lib/approvals/bulk-client'
import { bulkEffekt, bulkRubrik, delaUrval, type BulkHandling } from '@/lib/approvals/bulk'

interface Kort {
  id: string
  approval_type: string
  title?: string | null
  created_at?: string
}

const HANDLINGAR: { key: BulkHandling; etikett: string; stil: string }[] = [
  { key: 'approve', etikett: 'Godkänn valda', stil: 'bg-primary-700 text-white hover:bg-primary-800' },
  { key: 'snooze', etikett: 'Skjut upp valda', stil: 'border border-slate-200 text-slate-700 hover:border-teal-400' },
  { key: 'reject', etikett: 'Avvisa valda', stil: 'border border-red-300 text-red-700 hover:bg-red-50' },
]

export default function BulkBar({ approvals, onDone }: { approvals: Kort[]; onDone: () => void }) {
  const [oppen, setOppen] = useState(false)
  const [valda, setValda] = useState<Set<string>>(new Set())
  const [plan, setPlan] = useState<BulkPlan | null>(null)
  const [arbetar, setArbetar] = useState(false)
  const [framsteg, setFramsteg] = useState<{ klart: number; totalt: number } | null>(null)
  const [utfall, setUtfall] = useState<BulkUtfall[] | null>(null)
  const [fel, setFel] = useState('')

  // Hur många av korten husets klassificering alls släpper i grupp. Visas
  // rakt ut, så ingen tror att knappen ska tömma hela kön.
  const antalGrupperbara = useMemo(
    () => delaUrval(approvals, 'approve').tillatna.length,
    [approvals],
  )

  if (approvals.length < 2) return null

  function vaxla(id: string, pa: boolean) {
    setValda(f => {
      const n = new Set(f)
      if (pa) n.add(id)
      else n.delete(id)
      return n
    })
  }

  async function forbered(handling: BulkHandling) {
    const kort = approvals.filter(a => valda.has(a.id))
    if (kort.length === 0) return
    setArbetar(true)
    setFel('')
    setUtfall(null)
    try {
      setPlan(await bulkPlan(kort, handling))
    } catch {
      setFel('Kunde inte förhandsvisa just nu. Försök igen.')
    } finally {
      setArbetar(false)
    }
  }

  async function utfor() {
    if (!plan) return
    setArbetar(true)
    setFramsteg({ klart: 0, totalt: plan.klara.length })
    try {
      const res = await bulkKor(plan, (klart, totalt) => setFramsteg({ klart, totalt }))
      setUtfall(res)
      setPlan(null)
      setValda(new Set())
      onDone()
    } catch {
      setFel('Något gick fel mitt i. Uppdatera kön och se vad som blev gjort.')
    } finally {
      setArbetar(false)
      setFramsteg(null)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-sm font-medium text-slate-900 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-slate-400" /> Hantera flera kort
          </p>
          <p className="m-0 mt-0.5 text-[13px] text-slate-500">
            {antalGrupperbara} av {approvals.length} kort kan godkännas i grupp. Resten kräver
            att du öppnar dem — de gör något på riktigt.
          </p>
        </div>
        <button
          onClick={() => setOppen(v => !v)}
          className="min-h-[44px] px-3 text-[13px] text-primary-700 hover:text-primary-800"
        >
          {oppen ? 'Stäng' : 'Välj kort'}
        </button>
      </div>

      {fel && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-3 text-[13px] text-red-700">{fel}</p>}

      {utfall && (
        <div role="status" className="mt-3 rounded-xl border border-slate-200 p-3">
          <p className="m-0 text-sm font-medium text-slate-900">
            {utfall.filter(u => u.ok).length} av {utfall.length} klara.
          </p>
          {utfall.filter(u => !u.ok).length > 0 && (
            <ul className="mt-1.5 space-y-1 text-[13px] text-slate-600">
              {utfall.filter(u => !u.ok).map(u => (
                <li key={u.id}><strong className="font-medium">{u.titel}</strong> — {u.fel}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {oppen && !plan && (
        <>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => setValda(valda.size === approvals.length ? new Set() : new Set(approvals.map(a => a.id)))}
              className="min-h-[44px] text-[13px] text-primary-700"
            >
              {valda.size === approvals.length ? 'Avmarkera alla' : `Markera alla (${approvals.length})`}
            </button>
            <span className="text-[13px] text-slate-500">{valda.size} valda</span>
          </div>
          <ul className="mt-1.5 flex flex-col divide-y divide-slate-100 border-y border-slate-100 max-h-72 overflow-y-auto">
            {approvals.map(a => (
              <li key={a.id}>
                <label className="flex items-center gap-3 min-h-[44px] py-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={valda.has(a.id)}
                    onChange={e => vaxla(a.id, e.target.checked)}
                    className="h-5 w-5 flex-none"
                  />
                  <span className="min-w-0 text-[13px] text-slate-700 truncate">
                    {a.title || a.approval_type}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            {HANDLINGAR.map(h => (
              <button
                key={h.key}
                disabled={arbetar || valda.size === 0}
                onClick={() => void forbered(h.key)}
                className={`min-h-[44px] px-4 rounded-xl text-sm font-medium disabled:opacity-40 transition-colors ${h.stil}`}
              >
                {arbetar ? <Loader2 className="w-4 h-4 animate-spin" /> : h.etikett}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Den samlade bekräftelsen. Allt som händer syns här, och allt som
          INTE kommer att hända syns med sitt skäl. */}
      {plan && (
        <div className="mt-3 rounded-xl border border-slate-300 p-4">
          <p className="m-0 font-heading text-base font-semibold text-slate-900">
            {bulkRubrik(plan.handling, plan.klara.length)}
          </p>
          <p className="m-0 mt-1 text-[13px] text-slate-600">
            {bulkEffekt(plan.handling, plan.klara.length)}
          </p>

          {plan.klara.length > 0 && (
            <ul className="mt-2.5 space-y-1 text-[13px] text-slate-700">
              {plan.klara.map(k => (
                <li key={k.id}>
                  <strong className="font-medium">{k.titel}</strong>
                  <span className="text-slate-500"> — {k.effekt}</span>
                </li>
              ))}
            </ul>
          )}

          {plan.nekade.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3">
              <p className="m-0 text-[13px] font-medium text-amber-900">
                {plan.nekade.length} kort rörs inte:
              </p>
              <ul className="mt-1 space-y-1 text-[13px] text-amber-900">
                {plan.nekade.map(n => (
                  <li key={n.id}><strong className="font-medium">{n.titel}</strong> — {n.skal}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => setPlan(null)}
              disabled={arbetar}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 text-sm text-slate-700 disabled:opacity-40"
            >
              Tillbaka
            </button>
            <button
              onClick={() => void utfor()}
              disabled={arbetar || plan.klara.length === 0}
              className="min-h-[44px] px-4 rounded-xl bg-primary-700 text-white text-sm font-medium disabled:opacity-40"
            >
              {framsteg
                ? `Utför ${framsteg.klart} av ${framsteg.totalt}…`
                : `Bekräfta ${plan.klara.length} kort`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
