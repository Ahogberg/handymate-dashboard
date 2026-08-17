'use client'

import { useState } from 'react'
import { formatKr } from '@/lib/moments/derive'
import type { LedgerItem, LedgerItemSteg } from '@/lib/value/ledger'
import { KORTTYP_ETIKETT, kortDatum } from './ledger-format'

/**
 * "Varje krona, med sin historia" (Etapp B4) — en rad per kohortkort ur
 * ledgerns items[], med mockupens 4-punkts-kedjeräls, belopp och statuspill.
 *
 * Statuspillarna är BARA de fem stegen datat bevisar (Betald/Fakturerad/
 * Agerad/Identifierad/Avvisad) — mockupens "Hos kund"/"Väntar på dig" går
 * inte att härleda ur ledgern och hittas aldrig på.
 *
 * Filtren är rena klientfilter över samma lista:
 *   Väntar = agerat + fakturerat (på väg, ännu inte betalt)
 *   Föll bort = avvisad
 */

type Filter = 'alla' | 'betalt' | 'vantar' | 'bortfall'

const FILTER: Array<{ key: Filter; etikett: string }> = [
  { key: 'alla', etikett: 'Alla' },
  { key: 'betalt', etikett: 'Betalt' },
  { key: 'vantar', etikett: 'Väntar' },
  { key: 'bortfall', etikett: 'Föll bort' },
]

const MAX_SYNLIGA = 8

function matchar(item: LedgerItem, filter: Filter): boolean {
  if (filter === 'alla') return true
  if (filter === 'betalt') return item.steg === 'betalt'
  if (filter === 'vantar') return item.steg === 'agerat' || item.steg === 'fakturerat'
  return item.steg === 'avvisad'
}

/** Hur många kedjepunkter steget bevisat passerat. Avvisad = specialfall. */
const NADD_STEG: Record<LedgerItemSteg, number> = {
  identifierat: 1,
  agerat: 2,
  fakturerat: 3,
  betalt: 4,
  avvisad: 0,
}

export function LedgerRader({ items }: { items: LedgerItem[] }) {
  const [filter, setFilter] = useState<Filter>('alla')
  const [visaAlla, setVisaAlla] = useState(false)

  const filtrerade = items.filter(i => matchar(i, filter))
  const synliga = visaAlla ? filtrerade : filtrerade.slice(0, MAX_SYNLIGA)
  const dolda = filtrerade.length - synliga.length

  return (
    <section className="bg-white border border-slate-200 rounded-card p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 mb-3">
        <h2 className="m-0 font-heading text-[17px] font-semibold text-slate-900">
          Varje krona, med sin historia
        </h2>
        <div className="flex gap-1 -mx-1 sm:mx-0">
          {FILTER.map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => { setFilter(f.key); setVisaAlla(false) }}
              className={`text-[12.5px] px-3 py-1 rounded-full transition-colors ${
                filter === f.key
                  ? 'bg-primary-50 text-primary-700 font-semibold'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f.etikett}
            </button>
          ))}
        </div>
      </div>

      {filtrerade.length === 0 ? (
        <p className="m-0 py-4 text-sm text-slate-400">
          Inget i det här filtret den här månaden.
        </p>
      ) : (
        <div>
          {synliga.map(item => (
            <Rad key={item.approval_id} item={item} />
          ))}
        </div>
      )}

      <div className="pt-3.5 flex items-center justify-between gap-3 flex-wrap">
        {dolda > 0 ? (
          <button
            type="button"
            onClick={() => setVisaAlla(true)}
            className="text-[13.5px] font-medium text-primary-700 hover:text-primary-800"
          >
            Visa alla {filtrerade.length} poster
          </button>
        ) : <span />}
        <span className="text-[12px] text-slate-400">
          Betald = fakturan är markerad betald i bokföringen
        </span>
      </div>
    </section>
  )
}

function Rad({ item }: { item: LedgerItem }) {
  const avvisad = item.steg === 'avvisad'
  const typ = KORTTYP_ETIKETT[item.approval_type] || 'Förslag'
  const titel = item.title || typ
  const meta = item.title ? `${typ} · ${kortDatum(item.created_at)}` : kortDatum(item.created_at)

  return (
    <div className="py-3.5 border-b border-slate-100 last:border-b-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 items-center md:grid-cols-[minmax(0,1fr)_170px_120px_140px] md:gap-x-5">
      <div className="col-start-1 row-start-1 min-w-0">
        <div className={`text-[14.5px] font-semibold truncate ${avvisad ? 'text-slate-500' : 'text-slate-900'}`}>
          {titel}
        </div>
        <div className="text-[13px] text-slate-500 truncate">{meta}</div>
      </div>

      <KedjeRals steg={item.steg} className="col-start-1 row-start-2 md:col-start-2 md:row-start-1" />

      <span
        className={`col-start-2 row-start-1 md:col-start-3 text-right font-heading font-semibold tabular-nums text-[15px] ${
          avvisad ? 'text-slate-400' : 'text-slate-900'
        }`}
      >
        {formatKr(item.kr)}
      </span>

      <span className="col-start-2 row-start-2 md:col-start-4 md:row-start-1 text-right">
        <StatusPill item={item} />
      </span>
    </div>
  )
}

function KedjeRals({ steg, className }: { steg: LedgerItemSteg; className?: string }) {
  const nadda = NADD_STEG[steg]
  const avvisad = steg === 'avvisad'
  return (
    <div className={`flex items-center gap-1.5 ${className || ''}`} aria-hidden>
      {[0, 1, 2, 3].map(i => (
        <span
          key={i}
          className={`h-[5px] flex-1 rounded-full ${
            avvisad
              ? i === 0 ? 'bg-slate-300' : 'bg-slate-100'
              : i < nadda ? 'bg-primary-700' : 'bg-slate-100'
          }`}
        />
      ))}
    </div>
  )
}

function StatusPill({ item }: { item: LedgerItem }) {
  const bas = 'inline-block text-[12px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap'
  switch (item.steg) {
    case 'betalt':
      return (
        <span className={`${bas} bg-emerald-50 text-emerald-700`}>
          Betald{item.paid_at ? ` ${kortDatum(item.paid_at)}` : ''}
        </span>
      )
    case 'fakturerat':
      return <span className={`${bas} bg-amber-50 text-amber-700`}>Fakturerad</span>
    case 'agerat':
      return <span className={`${bas} bg-amber-50 text-amber-700`}>Agerad</span>
    case 'identifierat':
      return <span className={`${bas} bg-slate-100 text-slate-600`}>Identifierad</span>
    case 'avvisad':
      return <span className={`${bas} bg-slate-100 text-slate-500`}>Avvisad</span>
  }
}
