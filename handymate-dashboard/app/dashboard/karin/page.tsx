'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowRight, Calendar, Check, ExternalLink, Loader2, Plus, Trash2, X } from 'lucide-react'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import { useToast } from '@/components/Toast'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import type { CalendarEvent, MonthGroup } from '@/lib/karin/calendar'
import type { Kvittens } from '@/lib/karin/handled-store'
import type { EventSuggestion } from '@/lib/karin/event-suggestions'

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
  suggestions: EventSuggestion[]
}

/** En rad i leverantörsfaktura-matchningskön (Etapp 3, sql/supplier_invoices). */
interface SupplierInvoiceQueueItem {
  id: string
  supplier_name: string | null
  invoice_number: string | null
  invoice_date: string | null
  due_date: string | null
  total_amount: number | null
  fortnox_supplier_invoice_number: string | null
  created_at: string
}

interface ProjectOption {
  project_id: string
  name: string
  status: string
}

interface SubcontractorOption {
  subcontractor_id: string
  name: string
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
  const [kvittenser, setKvittenser] = useState<Map<string, Kvittens>>(new Map())
  const [visaLaggTill, setVisaLaggTill] = useState(false)

  // ── Leverantörsfaktura-matchningskön (Etapp 3) ──
  // Egen hämtning, eget fel-läge — kön är en tillagd yta på sidan, inte en
  // del av kalenderns laddning. Faller den ovan syns kön ändå.
  const [queue, setQueue] = useState<SupplierInvoiceQueueItem[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [subcontractors, setSubcontractors] = useState<SubcontractorOption[]>([])

  useEffect(() => {
    fetch('/api/karin/supplier-invoices')
      .then(r => (r.ok ? r.json() : { queue: [] }))
      .then(d => setQueue(d.queue || []))
      .catch(() => setQueue([]))

    fetch('/api/projects?status=active')
      .then(r => (r.ok ? r.json() : { projects: [] }))
      .then(d => setProjects(d.projects || []))
      .catch(() => setProjects([]))

    // Fail-soft: rutten nedan är feature-gated ('subcontractors'-
    // planfunktionen, se app/dashboard/projects/[id]/page.tsx) — ett konto
    // utan den ska bara se fritext-fältet, aldrig ett fel.
    fetch('/api/subcontractors?status=active')
      .then(r => (r.ok ? r.json() : { subcontractors: [] }))
      .then(d => setSubcontractors(d.subcontractors || []))
      .catch(() => setSubcontractors([]))
  }, [])

  /** Matchar en kö-rad mot ett projekt. Raden lämnar kön lokalt utan omladdning. */
  async function kopplaFaktura(id: string, projectId: string, subcontractorId: string, supplierName: string) {
    try {
      const res = await fetch('/api/karin/supplier-invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          project_id: projectId,
          subcontractor_id: subcontractorId || null,
          supplier_name: supplierName || undefined,
        }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setQueue(prev => prev.filter(q => q.id !== id))
      toast.success('Kopplad till projektet')
      return true
    } catch {
      toast.error('Kunde inte koppla — försök igen')
      return false
    }
  }

  // Lager två av rollskyddet. API:et är lager tre — en sida som bara döljer
  // sig är ingen spärr.
  useEffect(() => {
    if (!userLoading && !isOwnerOrAdmin) router.replace('/dashboard')
  }, [userLoading, isOwnerOrAdmin, router])

  async function laddaKalender() {
    try {
      const r = await fetch('/api/karin/calendar?days=90')
      if (!r.ok) throw new Error(String(r.status))
      const d: CalendarResponse = await r.json()
      setData(d)
      // Serverns kvittenser är sanningen; lokal state är bara ekot.
      const fransServer: Array<[string, Kvittens]> = [
        ...(d.months || []).flatMap((m: { events: CalendarEvent[] }) => m.events),
        ...(d.attention || []),
      ]
        .filter((e: any) => e?.kvittens)
        .map((e: any) => [e.id, e.kvittens as Kvittens])
      setKvittenser(new Map(fransServer))
      setFel(null)
    } catch {
      setFel('Kunde inte hämta kalendern just nu.')
    } finally {
      setLaddar(false)
    }
  }

  useEffect(() => {
    void laddaKalender()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Lägger till en egen post och laddar om kalendern så den dyker upp i rätt månad direkt. */
  async function laggTillEgen(title: string, eventDate: string, note: string): Promise<boolean> {
    try {
      const res = await fetch('/api/karin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, event_date: eventDate, note: note || undefined }),
      })
      if (!res.ok) throw new Error(String(res.status))
      await laddaKalender()
      setVisaLaggTill(false)
      toast.success('Tillagd i kalendern')
      return true
    } catch {
      return false
    }
  }

  /** Tar bort en egen post. Kan aldrig träffa en härledd — API:et frågar bara karin_custom_event. */
  async function taBortEgen(id: string) {
    const innan = data
    // Optimistiskt: posten försvinner direkt, återställs vid fel.
    if (data) {
      setData({
        ...data,
        attention: data.attention.filter(e => e.id !== id),
        months: data.months
          .map(m => ({ ...m, events: m.events.filter(e => e.id !== id) }))
          .filter(m => m.events.length > 0),
        total: data.total - 1,
      })
    }
    try {
      const res = await fetch(`/api/karin/events/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(String(res.status))
    } catch {
      setData(innan)
      toast.error('Kunde inte ta bort — försök igen')
    }
  }

  if (userLoading || !isOwnerOrAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
      </div>
    )
  }

  /**
   * Kvitterar, skjuter upp eller ångrar — och SPARAR det.
   *
   * Optimistiskt: raden ändras direkt. Misslyckas skrivningen återställs den och
   * det sägs — en knapp som ser ut att ha gjort något den inte gjort är värre än
   * en som är trög.
   *
   * Ingen av åtgärderna påstår att något är inlämnat, och ingen av dem tystar de
   * sista dagarna före förfall. Se lib/karin/handled-store.ts.
   */
  async function sattKvittens(id: string, action: 'acknowledge' | 'snooze' | 'undo', until?: string) {
    const innan = kvittenser
    const nasta = new Map(innan)
    if (action === 'undo') nasta.delete(id)
    else nasta.set(id, { id, state: action === 'snooze' ? 'snoozed' : 'acknowledged', actor: null, at: new Date().toISOString(), until })
    setKvittenser(nasta)

    try {
      const res = await fetch('/api/karin/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: id, action, until }),
      })
      if (!res.ok) throw new Error(String(res.status))
      if (action === 'undo') toast.success('Ångrat — påminnelserna är igång igen')
    } catch {
      setKvittenser(innan)
      toast.error('Kunde inte spara — försök igen')
    }
  }

  // Kvitterade lämnar uppmärksamhetskön — men de försvinner INTE ur
  // månadslistan nedanför, där de får sin etikett och sin ångra-knapp. En post
  // som försvinner helt går inte att ångra, och det var precis den fällan som
  // gjorde den gamla knappen farlig.
  const attention = (data?.attention || []).filter(e => !kvittenser.has(e.id))

  return (
    <div className="bg-[#F8FAFC] min-h-screen">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-8 pt-6 sm:pt-7 pb-9">
        {/* ── Hero ── */}
        <div className="flex items-center gap-3 mb-1">
          <AgentAvatar agentKey="karin" size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-[22px] sm:text-[26px] font-bold tracking-[-0.02em] text-slate-900 m-0">
              Bolagskalendern
            </h1>
            <p className="text-sm text-slate-500 m-0">
              Karin håller koll på myndighetsdatumen åt dig
            </p>
          </div>
          <button
            type="button"
            onClick={() => setVisaLaggTill(true)}
            className="inline-flex items-center gap-1.5 h-[44px] px-4 bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold rounded-xl transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            Lägg till
          </button>
        </div>

        {/* ── Leverantörsfaktura-matchningskön (Etapp 3) ──
             Egen hämtning, oberoende av kalenderns laddningsläge. Tom kö
             renderar ingenting — samma "tystnad om det inte finns något att
             göra"-princip som resten av sidan (se "TRE LÖFTEN" ovan). */}
        <LeverantorsfakturaKo
          queue={queue}
          projects={projects}
          subcontractors={subcontractors}
          onKoppla={kopplaFaktura}
        />

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
                      onHandled={() => { void sattKvittens(e.id, 'acknowledge') }}
                      onSnooze={() => { void sattKvittens(e.id, 'snooze', snoozeDatum(e.due_date)) }}
                      onDelete={e.source === 'egen' ? () => { void taBortEgen(e.id) } : undefined}
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
                        <MonthRow
                          key={e.id}
                          event={e}
                          kvittens={kvittenser.get(e.id)}
                          onUndo={() => { void sattKvittens(e.id, 'undo') }}
                          onDelete={e.source === 'egen' ? () => { void taBortEgen(e.id) } : undefined}
                        />
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

      {visaLaggTill && (
        <LaggTillModal
          suggestions={data?.suggestions || []}
          onClose={() => setVisaLaggTill(false)}
          onSave={laggTillEgen}
        />
      )}
    </div>
  )
}

/**
 * Hur långt "Påminn senare" skjuter fram.
 *
 * En vecka, eller halvvägs till förfall om det är närmare än så. Servern kapar
 * ändå allt som skulle sträcka sig in i de sista dagarna — det här är bara ett
 * rimligt förval, inte spärren.
 */
function snoozeDatum(forfall: string): string {
  const idag = new Date()
  const due = new Date(`${forfall}T00:00:00Z`)
  const dagarKvar = Math.round((due.getTime() - idag.getTime()) / 86400000)
  const fram = Math.max(1, Math.min(7, Math.floor(dagarKvar / 2)))
  const d = new Date(idag)
  d.setDate(d.getDate() + fram)
  return d.toISOString().slice(0, 10)
}

function EventCard({ event, onHandled, onSnooze, onDelete }: {
  event: CalendarEvent
  onHandled: () => void
  onSnooze: () => void
  /** Bara satt för egna poster (source 'egen') — aldrig för härledda. */
  onDelete?: () => void
}) {
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
        {event.period_label && `Avser ${event.period_label}. `}{event.why}
      </p>

      {/* Där säkerheten är låg hänvisar Karin vidare i stället för att gissa.
          Egna poster har alltid confidence 'hog' — de är aldrig en gissning,
          se lib/karin/calendar.ts:customEventToEvent — så den här visas aldrig
          på en post ägaren själv skrivit in. */}
      {event.confidence !== 'hog' && (
        <div className="bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-2.5 mb-3">
          <p className="text-[13px] text-slate-600 m-0 leading-relaxed">
            Datumet kan variera med hur du lämnar in. Stäm av med din redovisningsbyrå om du är osäker.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {/*
          "Kvittera" betyder "jag har sett den" — inte "den är inlämnad". Ordvalet
          är medvetet: Karin kan inte veta om deklarationen är gjord, och en knapp
          som hette "Klart" hade påstått det.

          Påminnelserna återkommer ändå de sista dagarna före förfall, oavsett
          vilken av knapparna som tryckts.
        */}
        <button
          type="button"
          onClick={onHandled}
          className="inline-flex items-center gap-1.5 h-[38px] px-4 bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <Check className="w-4 h-4" />
          Kvittera
        </button>
        <button
          type="button"
          onClick={onSnooze}
          className="inline-flex items-center gap-1.5 h-[38px] px-4 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
        >
          Påminn senare
        </button>
        {event.source_url && (
          <a
            href={event.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-[38px] px-4 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
          >
            Läs hos {event.authority}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        {onDelete && <TaBortKnapp onConfirm={onDelete} className="ml-auto" />}
      </div>
    </div>
  )
}

/**
 * En rad i månadslistan.
 *
 * Här — inte i uppmärksamhetskön — bor ångra-knappen. En kvitterad post lämnar
 * kön men blir kvar här med sin etikett, så beslutet alltid går att ta tillbaka.
 * Etiketterna säger vad ägaren gjort ("Kvitterad", "Påminner igen"), aldrig att
 * skyldigheten är uppfylld.
 *
 * Egna poster (source 'egen') får en diskret "Egen"-badge och en ta bort-knapp
 * i stället för myndighet/period — de har ingen av delarna.
 */
function MonthRow({ event, kvittens, onUndo, onDelete }: {
  event: CalendarEvent
  kvittens?: Kvittens
  onUndo: () => void
  /** Bara satt för egna poster — aldrig för härledda. */
  onDelete?: () => void
}) {
  const dag = new Date(event.due_date + 'T12:00:00').getDate()
  const egen = event.source === 'egen'

  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${kvittens ? 'opacity-60' : ''}`}>
      <span className="font-heading text-[13px] font-semibold text-primary-700 w-6 shrink-0 tabular-nums">{dag}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="block text-sm font-medium text-slate-900 truncate">{event.title}</span>
          {egen && (
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500">
              Egen
            </span>
          )}
        </span>
        <span className="block text-xs text-slate-400 truncate">
          {egen ? 'Egen anteckning' : `${event.authority} · ${event.period_label}`}
          {kvittens?.actor && ` · av ${kvittens.actor}`}
        </span>
      </span>
      {kvittens ? (
        <span className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary-700 bg-primary-50 rounded-full px-2 py-0.5">
            <Check className="w-3 h-3" />
            {kvittens.state === 'snoozed' ? 'Påminner igen' : 'Kvitterad'}
          </span>
          <button
            type="button"
            onClick={onUndo}
            className="text-xs text-slate-500 hover:text-primary-700 underline underline-offset-2 transition-colors"
          >
            Ångra
          </button>
        </span>
      ) : onDelete ? (
        <span className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-400 whitespace-nowrap">{nedrakning(event.due_date)}</span>
          <TaBortKnapp onConfirm={onDelete} />
        </span>
      ) : (
        <span className="text-xs text-slate-400 shrink-0 whitespace-nowrap">{nedrakning(event.due_date)}</span>
      )}
    </div>
  )
}

/**
 * Ta bort-knappen — två steg, ingen webbläsarens inbyggda bekräftelsedialog.
 *
 * Första trycket väpnar knappen ("Säkert?" + "Avbryt"). Andra trycket
 * utför borttagningen. Väpningen glömmer sig själv efter fyra sekunder så en
 * rad aldrig blir kvar i ett förvirrande halvöppet läge om ägaren klickar
 * bort sig.
 */
function TaBortKnapp({ onConfirm, className = '' }: { onConfirm: () => void; className?: string }) {
  const [vapnad, setVapnad] = useState(false)

  useEffect(() => {
    if (!vapnad) return
    const t = setTimeout(() => setVapnad(false), 4000)
    return () => clearTimeout(t)
  }, [vapnad])

  if (vapnad) {
    return (
      <span className={`inline-flex items-center gap-2 shrink-0 ${className}`}>
        <button
          type="button"
          onClick={onConfirm}
          className="text-xs font-semibold text-red-600 hover:text-red-700 underline underline-offset-2"
        >
          Säkert?
        </button>
        <button
          type="button"
          onClick={() => setVapnad(false)}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          Avbryt
        </button>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setVapnad(true)}
      aria-label="Ta bort"
      title="Ta bort"
      className={`shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-red-600 transition-colors ${className}`}
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  )
}

/**
 * "Lägg till"-modalen — titel, datum, valfri anteckning, plus max tre
 * kontextuella förslag som TAP-förifyller formuläret (aldrig lägger till av
 * sig självt). Samma modal-idiom som AbsenceSettingsModal
 * (components/jarvis/home/AbsenceBand.tsx).
 */
function LaggTillModal({ suggestions, onClose, onSave }: {
  suggestions: EventSuggestion[]
  onClose: () => void
  onSave: (title: string, date: string, note: string) => Promise<boolean>
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [sparar, setSparar] = useState(false)
  const [fel, setFel] = useState<string | null>(null)

  function anvandForslag(s: EventSuggestion) {
    setTitle(s.title)
    setDate(s.date)
    setNote(s.note)
  }

  async function handleSpara() {
    setFel(null)
    if (!title.trim()) { setFel('Ange en titel'); return }
    if (!date) { setFel('Ange ett datum'); return }
    setSparar(true)
    const ok = await onSave(title.trim(), date, note)
    setSparar(false)
    if (!ok) setFel('Kunde inte spara — försök igen')
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/55">
      <div className="w-full max-w-[420px] bg-white rounded-2xl border border-slate-200 shadow-lg p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="m-0 text-[15px] font-bold text-slate-900">Lägg till i kalendern</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Stäng"
            className="text-slate-400 hover:text-slate-600 min-h-[44px] min-w-[44px] -mt-2 -mr-2 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {suggestions.length > 0 && (
          <div>
            <p className="m-0 mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Förslag</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map(s => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => anvandForslag(s)}
                  className="text-xs font-medium px-3 py-1.5 rounded-full border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
                >
                  {s.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Titel
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="T.ex. Semesterplanering"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 min-h-[44px]"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Datum
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 min-h-[44px]"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Anteckning (valfritt)
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 resize-none"
          />
        </label>

        {fel && <p className="m-0 text-xs text-red-600">{fel}</p>}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 min-h-[44px]"
          >
            Avbryt
          </button>
          <button
            type="button"
            onClick={handleSpara}
            disabled={sparar}
            className="flex-1 px-4 py-2.5 rounded-xl bg-primary-700 text-white text-sm font-semibold hover:bg-primary-800 disabled:opacity-50 min-h-[44px]"
          >
            {sparar ? 'Sparar …' : 'Spara'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Matchningskön för leverantörsfakturor utan projekt (Etapp 3).
 *
 * Fakturor som kommit in via Fortnox-synken (eller skapats manuellt) utan
 * projektkoppling hamnar här. Ägaren väljer projekt + leverantör per rad;
 * en kopplad rad lämnar kön direkt (lokal filtrering, ingen omladdning) och
 * syns sedan i projektets befintliga "Leverantörer"-flik.
 *
 * Tom kö renderar ingenting — samma princip som resten av sidan: tystnad
 * betyder "inget att göra", inte en tom ruta som ser trasig ut.
 */
function LeverantorsfakturaKo({ queue, projects, subcontractors, onKoppla }: {
  queue: SupplierInvoiceQueueItem[]
  projects: ProjectOption[]
  subcontractors: SubcontractorOption[]
  onKoppla: (id: string, projectId: string, subcontractorId: string, supplierName: string) => Promise<boolean>
}) {
  if (queue.length === 0) return null

  return (
    <>
      <div className="flex items-baseline gap-2 mt-6 mb-2.5">
        <h2 className="m-0 text-[15px] font-semibold text-slate-900">Leverantörsfakturor att matcha</h2>
        <span className="font-heading text-xs font-bold bg-primary-700 text-white rounded-full min-w-[21px] h-[21px] px-1.5 inline-flex items-center justify-center">
          {queue.length}
        </span>
      </div>
      <div className="space-y-2.5">
        {queue.map(item => (
          <LeverantorsfakturaRad key={item.id} item={item} projects={projects} subcontractors={subcontractors} onKoppla={onKoppla} />
        ))}
      </div>
    </>
  )
}

function LeverantorsfakturaRad({ item, projects, subcontractors, onKoppla }: {
  item: SupplierInvoiceQueueItem
  projects: ProjectOption[]
  subcontractors: SubcontractorOption[]
  onKoppla: (id: string, projectId: string, subcontractorId: string, supplierName: string) => Promise<boolean>
}) {
  const [projectId, setProjectId] = useState('')
  const [subcontractorId, setSubcontractorId] = useState('')
  const [annanLeverantor, setAnnanLeverantor] = useState(false)
  const [leverantorNamn, setLeverantorNamn] = useState(item.supplier_name || '')
  const [sparar, setSparar] = useState(false)

  async function handleKoppla() {
    if (!projectId) return
    setSparar(true)
    await onKoppla(item.id, projectId, annanLeverantor ? '' : subcontractorId, annanLeverantor ? leverantorNamn : '')
    setSparar(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-slate-900 leading-snug mb-0.5 truncate">
            {item.supplier_name || 'Okänd leverantör'}
          </h3>
          <p className="text-[13px] text-slate-500 m-0 truncate">
            {item.invoice_date ? visaDatum(item.invoice_date) : 'Datum saknas'}
            {item.invoice_number && ` · Fakturanr ${item.invoice_number}`}
          </p>
        </div>
        <span className="font-heading text-sm font-bold text-slate-900 whitespace-nowrap shrink-0">
          {(item.total_amount ?? 0).toLocaleString('sv-SE')} kr
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={projectId}
          onChange={e => setProjectId(e.target.value)}
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 min-h-[44px]"
        >
          <option value="">Välj projekt…</option>
          {projects.map(p => (
            <option key={p.project_id} value={p.project_id}>{p.name}</option>
          ))}
        </select>

        {!annanLeverantor ? (
          <select
            value={subcontractorId}
            onChange={e => {
              if (e.target.value === '__annan__') {
                setAnnanLeverantor(true)
                setSubcontractorId('')
                return
              }
              setSubcontractorId(e.target.value)
            }}
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 min-h-[44px]"
          >
            <option value="">Ingen underentreprenör</option>
            {subcontractors.map(s => (
              <option key={s.subcontractor_id} value={s.subcontractor_id}>{s.name}</option>
            ))}
            <option value="__annan__">Annan leverantör…</option>
          </select>
        ) : (
          <input
            type="text"
            value={leverantorNamn}
            onChange={e => setLeverantorNamn(e.target.value)}
            placeholder="Leverantörsnamn"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 min-h-[44px]"
          />
        )}

        <button
          type="button"
          onClick={handleKoppla}
          disabled={!projectId || sparar}
          className="inline-flex items-center justify-center gap-1.5 h-[44px] px-4 bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 shrink-0"
        >
          {sparar ? 'Kopplar …' : 'Koppla'}
        </button>
      </div>
    </div>
  )
}
