'use client'

import { useCallback, useEffect, useState } from 'react'
import { FileText, Loader2, X, AlertCircle, CheckCircle2 } from 'lucide-react'

/**
 * Intäktsfynden — Revenue Reviews smala yta (X1b, 2026-08-09).
 *
 * Bor PÅ Pengar på bordet, inte som en femte parallell sida: frågan "var
 * ligger pengarna?" och handlingen "granska fyndet" hör ihop. Varje fynd
 * visar sitt bevis och sina rader; hantverkaren väljer:
 *
 *   Skapa fakturautkast  bara ÄTA-fynd med DRAFT_AFTER_REVIEW — servern
 *                        upprätthåller gränsen, knappen speglar den.
 *   Avfärda              kräver en orsak. Falsklarm ska gå att lära av.
 *
 * Inget skickas härifrån. Utkastet granskas och skickas från fakturasidan
 * — sändningen är hantverkarens eget steg.
 */

interface Fynd {
  id: string
  title: string
  kind: string
  project_name: string | null
  amount_kr: number
  confidence: string
  recommended_action: string
  evidence: string
  preview: { items: Array<{ description: string; amount_kr: number }>; total_before_vat: number } | null
}

interface ReviewData {
  counts: { identifierade: number; utkast: number; avfardade: number; inaktuella: number; utkast_kr: number }
  identifierade: Fynd[]
}

export function Intaktsfynden() {
  const [data, setData] = useState<ReviewData | null>(null)
  const [arbetar, setArbetar] = useState<string | null>(null)
  const [avfardar, setAvfardar] = useState<string | null>(null)
  const [orsak, setOrsak] = useState('')
  const [besked, setBesked] = useState<{ typ: 'ok' | 'fel'; text: string } | null>(null)

  const hamta = useCallback(async () => {
    try {
      const res = await fetch('/api/revenue-review')
      if (res.ok) setData(await res.json())
    } catch { /* ytan är grädde — Pengar på bordet fungerar utan den */ }
  }, [])

  useEffect(() => { hamta() }, [hamta])

  async function skapaUtkast(fynd: Fynd) {
    setArbetar(fynd.id)
    setBesked(null)
    try {
      const res = await fetch(`/api/revenue-review/${fynd.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'skapa_utkast' }),
      })
      const svar = await res.json().catch(() => ({}))
      if (res.ok) {
        setBesked({ typ: 'ok', text: `Fakturautkast ${svar.invoice_number} skapat — granska och skicka från Fakturor.` })
      } else if (res.status === 409) {
        setBesked({ typ: 'ok', text: svar.message || 'Fyndet var redan hanterat.' })
      } else {
        setBesked({ typ: 'fel', text: svar.error || 'Något gick fel.' })
      }
      await hamta()
    } finally {
      setArbetar(null)
    }
  }

  async function avfarda(fyndId: string) {
    if (!orsak.trim()) return
    setArbetar(fyndId)
    setBesked(null)
    try {
      const res = await fetch(`/api/revenue-review/${fyndId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'avfarda', reason: orsak.trim() }),
      })
      if (res.ok) {
        setBesked({ typ: 'ok', text: 'Fyndet är avfärdat — orsaken sparades.' })
        setAvfardar(null)
        setOrsak('')
      } else {
        const svar = await res.json().catch(() => ({}))
        setBesked({ typ: 'fel', text: svar.error || 'Något gick fel.' })
      }
      await hamta()
    } finally {
      setArbetar(null)
    }
  }

  // Tyst när det inte finns något att granska — ett tomt avsnitt är brus.
  if (!data || data.identifierade.length === 0) return null

  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="m-0 text-[15px] font-semibold text-slate-900">
          Fynd att granska ({data.counts.identifierade})
        </h2>
        {data.counts.utkast > 0 && (
          <span className="text-xs text-slate-500">
            {data.counts.utkast} utkast skapade · {data.counts.utkast_kr.toLocaleString('sv-SE')} kr
          </span>
        )}
      </div>

      {besked && (
        <div className={`mt-3 rounded-xl border p-3 text-sm flex items-center gap-2 ${
          besked.typ === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {besked.typ === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {besked.text}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-3">
        {data.identifierade.map(fynd => {
          const kanBliUtkast = fynd.kind === 'ata_ej_fakturerad' && fynd.recommended_action === 'DRAFT_AFTER_REVIEW'
          return (
            <div key={fynd.id} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
              <div className="flex items-baseline gap-2 flex-wrap">
                {fynd.amount_kr > 0 && (
                  <span className="font-heading text-xl font-bold text-slate-900">
                    {fynd.amount_kr.toLocaleString('sv-SE')} kr
                  </span>
                )}
                <span className="text-sm font-semibold text-slate-700">{fynd.project_name || fynd.title}</span>
              </div>
              <p className="m-0 mt-1 text-[13px] text-slate-500 leading-relaxed">{fynd.evidence}</p>

              {fynd.preview?.items?.length ? (
                <ul className="mt-3 border-t border-slate-100 pt-2 text-[13px] text-slate-600">
                  {fynd.preview.items.map((rad, i) => (
                    <li key={i} className="flex justify-between gap-3 py-0.5">
                      <span className="truncate">{rad.description}</span>
                      <span className="tabular-nums shrink-0">{rad.amount_kr.toLocaleString('sv-SE')} kr</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {avfardar === fynd.id ? (
                <div className="mt-3">
                  <input
                    autoFocus
                    value={orsak}
                    onChange={e => setOrsak(e.target.value)}
                    placeholder="Varför stämmer inte fyndet? (t.ex. ingår i fastpriset)"
                    className="w-full min-h-[44px] px-3 rounded-lg border border-slate-300 text-sm"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => avfarda(fynd.id)}
                      disabled={!orsak.trim() || arbetar === fynd.id}
                      className="min-h-[44px] px-4 rounded-lg bg-slate-700 text-white text-sm font-medium disabled:opacity-50"
                    >
                      Avfärda fyndet
                    </button>
                    <button
                      onClick={() => { setAvfardar(null); setOrsak('') }}
                      className="min-h-[44px] px-3 rounded-lg text-slate-500 text-sm"
                    >
                      Ångra
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {kanBliUtkast && (
                    <button
                      onClick={() => skapaUtkast(fynd)}
                      disabled={arbetar === fynd.id}
                      className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-lg bg-primary-700 text-white text-sm font-medium hover:bg-primary-800 disabled:opacity-60"
                    >
                      {arbetar === fynd.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                      Skapa fakturautkast — {fynd.amount_kr.toLocaleString('sv-SE')} kr
                    </button>
                  )}
                  <button
                    onClick={() => { setAvfardar(fynd.id); setOrsak('') }}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg text-slate-500 text-sm hover:bg-slate-50"
                  >
                    <X className="w-4 h-4" /> Stämmer inte
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default Intaktsfynden
