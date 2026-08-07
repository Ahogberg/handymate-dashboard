'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowRight, Calendar, Check, ExternalLink, Loader2 } from 'lucide-react'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import { useToast } from '@/components/Toast'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import type { CalendarEvent, MonthGroup } from '@/lib/karin/calendar'

/**
 * Karins bolagskalender (2026-08-07).
 *
 * ═══ VAD YTAN ÄR ═══
 *
 * Inte ännu en kalender. Karin går igenom bolaget och lyfter det ägaren
 * behöver agera på — vad, när, varför, och vad som händer om det missas.
 *
 * Byggd på samma grammatik som hemskärmen: det som kräver ett beslut får ram
 * och knappar, det som bara är läget får en rad. Färgen bor i avataren.
 *
 * ═══ TRE LÖFTEN ═══
 *
 * 1. **Varje datum kan förklara sig.** "Räknat ur din momsperiod: kvartal" —
 *    och en väg att rätta profilen om det är fel.
 * 2. **Tystnad som betyder "vi vet inte" ser aldrig ut som "allt är lugnt".**
 *    Saknas uppgifter i profilen står det, i stället för en tom kalender.
 * 3. **Där säkerheten är låg hänvisar Karin vidare** i stället för att gissa
 *    snyggt. En felaktig deadline är värre än ingen.
 *
 * Ägare och administratör. Tre lager: länken döljs i inställningarna, sidan
 * redirectar, och API:et 403:ar.
 */

interface CalendarResponse {
  profile: Record<string, unknown>
  missing: string[]
  attention: CalendarEvent[]
  months: MonthGroup[]
  total: number
  window_days: number
}

const KATEGORI_ETIKETT: Record<string, string> = {
  moms: 'Moms',
  arbetsgivare: 'Arbetsgivare',
  skatt: 'Skatt',
  deklaration: 'Deklaration',
  arsredovisning: 'Årsredovisning',
  stamma: 'Stämma',
  egen: 'Egen',
  kostnad: 'Kostnad',
}

function dagarKvar(due: string): number {
  const d = new Date(due + 'T12:00:00')
  const idag = new Date()
  return Math.round((d.getTime() - new Date(idag.getFullYear(), idag.getMonth(), idag.getDate()).getTime()) / 86400000)
}

function nedrakning(due: string): string {
  const n = dagarKvar(due)
  if (n < 0) return `${Math.abs(n)} dagar sen`
  if (n === 0) return 'idag'
  if (n === 1) return 'i morgon'
  return `om ${n} dagar`
}

function visaDatum(due: string): string {
  return new Date(due + 'T12:00:00').toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })
}

export default function KarinKalenderPage() {
  const router = useRouter()
  const { isOwnerOrAdmin, loading: userLoading } = useCurrentUser()
  const toast = useToast()

  const [data, setData] = useState<CalendarResponse | null>(null)
  const [laddar, setLaddar] = useState(true)
  const [fel, setFel] = useState<string | null>(null)
  const [hanterade, setHanterade] = useState<Set<string>>(new Set())

  // Lager två av rollskyddet. API:et är lager tre — en sida som bara döljer
  // sig är ingen spärr.
  useEffect(() => {
    if (!userLoading && !isOwnerOrAdmin) router.replace('/dashboard')
  }, [userLoading, isOwnerOrAdmin, router])

  useEffect(() => {
    let aktiv = true
    fetch('/api/karin/calendar?days=90')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => {
        if (!aktiv) return
        setData(d)
        // Serverns hanterat-lista är sanningen; lokal state är bara ekot.
        const fransServer: string[] = (d.months || [])
          .flatMap((m: { events: CalendarEvent[] }) => m.events)
          .filter((e: CalendarEvent) => e.handled)
          .map((e: CalendarEvent) => e.id)
        if (fransServer.length > 0) setHanterade(new Set(fransServer))
      })
      .catch(() => { if (aktiv) setFel('Kunde inte hämta kalendern just nu.') })
      .finally(() => { if (aktiv) setLaddar(false) })
    return () => { aktiv = false }
  }, [])

  if (userLoading || !isOwnerOrAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
      </div>
    )
  }

  /**
   * Markerar hanterat och SPARAR det.
   *
   * Optimistiskt: raden försvinner direkt. Misslyckas skrivningen kommer den
   * tillbaka och det sägs — en knapp som ser ut att ha gjort något den inte
   * gjort är värre än en som är trög.
   */
  async function markeraHanterad(id: string) {
    setHanterade(prev => new Set(prev).add(id))
    try {
      const res = await fetch('/api/karin/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: id, handled: true }),
      })
      if (!res.ok) throw new Error(String(res.status))
    } catch {
      setHanterade(prev => { const n = new Set(prev); n.delete(id); return n })
      toast.error('Kunde inte spara — försök igen')
    }
  }

  const attention = (data?.attention || []).filter(e => !hanterade.has(e.id))

  return (
    <div className="bg-[#F8FAFC] min-h-screen">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-8 pt-6 sm:pt-7 pb-9">
        {/* ── Hero ── */}
        <div className="flex items-center gap-3 mb-1">
          <AgentAvatar agentKey="karin" size="lg" />
          <div className="min-w-0">
            <h1 className="font-heading text-[22px] sm:text-[26px] font-bold tracking-[-0.02em] text-slate-900 m-0">
              Bolagskalendern
            </h1>
            <p className="text-sm text-slate-500 m-0">
              Karin håller koll på myndighetsdatumen åt dig
            </p>
          </div>
        </div>

        {laddar ? (
          <div className="mt-6 bg-white border border-slate-200 rounded-2xl p-6 flex items-center justify-center min-h-[120px]">
            <Loader2 className="w-4 h-4 text-slate-300 animate-spin" />
          </div>
        ) : fel ? (
          <div className="mt-6 bg-white border border-slate-200 rounded-2xl p-5">
            <p className="text-sm text-slate-600 m-0">{fel}</p>
          </div>
        ) : (
          <>
            {/* ── Profilens luckor ──
                 En tom kalender som betyder "vi vet inte" får aldrig se ut
                 som en som betyder "allt är lugnt". */}
            {data && data.missing.length > 0 && (
              <div className="mt-5 bg-white border border-slate-200 border-l-4 border-l-amber-600 rounded-2xl p-4">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-semibold text-slate-900 m-0">
                      Karin behöver veta {data.missing.length === 1 ? 'en sak till' : `${data.missing.length} saker till`}
                    </h3>
                    <p className="text-[13px] text-slate-500 leading-relaxed mt-1 mb-3">
                      Utan {data.missing.join(', ')} kan hon inte räkna ut när dina deadlines
                      infaller. Kalendern nedan visar bara det hon är säker på.
                    </p>
                    <Link
                      href="/dashboard/settings/bolagsprofil"
                      className="inline-flex items-center gap-1.5 h-[38px] px-4 bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold rounded-xl transition-colors"
                    >
                      Fyll i uppgifterna
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* ── Kräver din uppmärksamhet ── */}
            {attention.length > 0 && (
              <>
                <div className="flex items-baseline gap-2 mt-6 mb-2.5">
                  <h2 className="m-0 text-[15px] font-semibold text-slate-900">Kräver din uppmärksamhet</h2>
                  <span className="font-heading text-xs font-bold bg-primary-700 text-white rounded-full min-w-[21px] h-[21px] px-1.5 inline-flex items-center justify-center">
                    {attention.length}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {attention.map(e => (
                    <EventCard
                      key={e.id}
                      event={e}
                      onHandled={() => { void markeraHanterad(e.id) }}
                    />
                  ))}
                </div>
              </>
            )}

            {/* ── Kommande 90 dagar ── */}
            <div className="flex items-baseline gap-2 mt-6 mb-2.5">
              <h2 className="m-0 text-[15px] font-semibold text-slate-900">Kommande 90 dagar</h2>
              <span className="text-xs text-slate-400 hidden sm:inline">
                {data?.total === 1 ? '1 datum' : `${data?.total ?? 0} datum`}
              </span>
            </div>

            {data && data.months.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-200 rounded-2xl px-5 py-7 text-center">
                <span className="w-11 h-11 rounded-full bg-primary-50 text-primary-700 inline-flex items-center justify-center mb-2">
                  <Calendar className="w-5 h-5" />
                </span>
                <h3 className="font-semibold text-slate-900 m-0">
                  {data.missing.length > 0 ? 'Karin vet inte tillräckligt än' : 'Inga datum de närmaste tre månaderna'}
                </h3>
                <p className="text-sm text-slate-500 mt-0.5 m-0">
                  {data.missing.length > 0
                    ? 'Fyll i uppgifterna ovan så räknar hon ut dina datum.'
                    : 'Karin säger till i god tid när något närmar sig.'}
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {data?.months.map(m => (
                  <div key={m.key}>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{m.label}</h3>
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
                      {m.events.map(e => (
                        <MonthRow key={e.id} event={e} handled={hanterade.has(e.id)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="mt-6 text-xs text-slate-400 leading-relaxed">
              Karin är ett beslutsstöd, inte skatterådgivning. Datumen räknas ur dina
              företagsuppgifter — stämmer något inte,{' '}
              <Link href="/dashboard/settings/bolagsprofil" className="text-primary-700 hover:underline">
                rätta dem här
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function EventCard({ event, onHandled }: { event: CalendarEvent; onHandled: () => void }) {
  const forfallen = dagarKvar(event.due_date) < 0

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 p-4 ${forfallen ? 'border-l-4 border-l-amber-600' : ''}`}>
      <div className="flex items-center gap-2.5 mb-2">
        <AgentAvatar agentKey="karin" />
        <span className="text-xs text-slate-500 flex-1 min-w-0 truncate">
          <b className="font-semibold text-slate-900">Karin</b> · Ekonom
        </span>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-primary-50 text-primary-700 whitespace-nowrap">
          {KATEGORI_ETIKETT[event.category] || 'Datum'}
        </span>
        <span className={`text-xs whitespace-nowrap ${forfallen ? 'text-amber-700 font-semibold' : 'text-slate-400'}`}>
          {nedrakning(event.due_date)}
        </span>
      </div>

      <h3 className="text-[15px] font-semibold text-slate-900 leading-snug mb-0.5">
        {event.title} — {visaDatum(event.due_date)}
      </h3>
      <p className="text-[13px] text-slate-500 leading-relaxed mb-2.5">
        Avser {event.period_label}. {event.why}
      </p>

      {/* Där säkerheten är låg hänvisar Karin vidare i stället för att gissa. */}
      {event.confidence !== 'hog' && (
        <div className="bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-2.5 mb-3">
          <p className="text-[13px] text-slate-600 m-0 leading-relaxed">
            Datumet kan variera med hur du lämnar in. Stäm av med din redovisningsbyrå om du är osäker.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onHandled}
          className="inline-flex items-center gap-1.5 h-[38px] px-4 bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <Check className="w-4 h-4" />
          Markera hanterad
        </button>
        <a
          href={event.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 h-[38px] px-4 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
        >
          Läs hos {event.authority}
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  )
}

function MonthRow({ event, handled }: { event: CalendarEvent; handled: boolean }) {
  const dag = new Date(event.due_date + 'T12:00:00').getDate()

  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${handled ? 'opacity-50' : ''}`}>
      <span className="font-heading text-[13px] font-semibold text-primary-700 w-6 shrink-0 tabular-nums">{dag}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900 truncate">{event.title}</span>
        <span className="block text-xs text-slate-400 truncate">
          {event.authority} · {event.period_label}
        </span>
      </span>
      {handled ? (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary-700 bg-primary-50 rounded-full px-2 py-0.5 shrink-0">
          <Check className="w-3 h-3" /> Hanterad
        </span>
      ) : (
        <span className="text-xs text-slate-400 shrink-0 whitespace-nowrap">{nedrakning(event.due_date)}</span>
      )}
    </div>
  )
}
