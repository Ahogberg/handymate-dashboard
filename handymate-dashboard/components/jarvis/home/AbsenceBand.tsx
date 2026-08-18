'use client'

/**
 * AbsenceBand — Owner Absence V1 (Etapp Å), snabbknapp + statusrad i
 * MatteHeros absenceBand-slot (samma mönster som Uppdragsrad/uppdragBand).
 *
 * Självförsörjande: hämtar sitt eget läge (GET /api/absence, owner-admin-
 * grindad) och döljer sig helt tyst vid 401/403/nätverksfel — samma
 * tålighetsregel som Uppdragsrads missionSurfaceAllowed-mönster, fast utan
 * en evig skelettrad eftersom det här är en bekvämlighetsyta, inte en
 * primär informationskälla.
 *
 * Tre lägen:
 *  1. Inget aktivt fönster, ingen ovisad rapport → INGENTING renderas
 *     (Andreas 2026-08-18: vilo-knappen förlängde heron — utlösaren bor nu
 *     i stället som diskret månikon i Mattes panelhuvud, se AbsenceTrigger
 *     nedan + Jobbkompisen.tsx; heron har exakt sin gamla storlek i vardagen).
 *  2. Aktivt fönster → statusraden "Frånvaroläge till {datum} — X händelser
 *     samlade, Y eskaleringar" (X/Y HÄRLETT server-side, aldrig gissat här)
 *     + "Avsluta frånvaro nu".
 *  3. Fönstret har passerat och rapporten inte visats än (localStorage,
 *     samma mönster som mandagsmoteSeenKey) → "Välkommen tillbaka →" som
 *     öppnar rapportmodalen. Avfärdas med en gång den öppnats.
 *
 * Bandet äger sin EGEN avdelarram (border-t) i lägena 2-3 — MatteHero
 * renderar sloten bar, så ett null-läge lämnar ingen tom ramrad efter sig.
 *
 * INGEN chatt-parsning, inget mission-verktyg — bara ett rent UI-lager ovanpå
 * lib/absence/*. Den här filen skriver aldrig till pending_approvals.
 */

import { useCallback, useEffect, useState } from 'react'
import { X, Moon, PartyPopper } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Franvarorapport } from '@/lib/absence/franvarorapport'

const RAPPORT_SEDD_PREFIX = 'hm_franvarorapport_sedd_'

interface AbsenceApiWindow {
  from: string
  to: string
  setBy: string | null
  setAt: string
}

interface AbsenceState {
  window: AbsenceApiWindow | null
  active: boolean
  status: { samlade: number; eskaleringar: number } | null
}

function formatDatum(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'short' })
}

/** yyyy-MM-ddThh:mm — <input type="datetime-local"> vill ha lokal tid utan sekunder/Z. */
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function AbsenceBand() {
  const [state, setState] = useState<AbsenceState | null>(null)
  const [allowed, setAllowed] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [rapport, setRapport] = useState<Franvarorapport | null>(null)
  const [rapportChecked, setRapportChecked] = useState(false)

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
  }, [])

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/absence', { headers: await authHeaders() })
      if (res.status === 401 || res.status === 403) { setAllowed(false); return }
      if (!res.ok) return
      const data = await res.json()
      setState({ window: data.window, active: data.active, status: data.status })
    } catch { /* tyst — bekvämlighetsyta, inte primär info */ }
  }, [authHeaders])

  useEffect(() => { void fetchState() }, [fetchState])

  // Läge 3: fönstret har passerat och rapporten inte visats än.
  useEffect(() => {
    if (!allowed || !state || state.active || !state.window) { setRapportChecked(true); return }
    let sedd = false
    try { sedd = localStorage.getItem(RAPPORT_SEDD_PREFIX + state.window.to) === '1' } catch { /* fail-open: visa hellre en gång för mycket */ }
    if (sedd) { setRapportChecked(true); return }
    ;(async () => {
      try {
        const res = await fetch('/api/absence/report', { headers: await authHeaders() })
        if (res.ok) {
          const data = await res.json()
          if (data.rapport) setRapport(data.rapport)
        }
      } catch { /* tyst */ }
      setRapportChecked(true)
    })()
  }, [allowed, state, authHeaders])

  function markRapportSedd() {
    if (!state?.window) return
    try { localStorage.setItem(RAPPORT_SEDD_PREFIX + state.window.to, '1') } catch { /* best effort */ }
  }

  function dismissReport() {
    markRapportSedd()
    setShowReport(false)
    setRapport(null)
  }

  async function saveWindow(from: string, to: string) {
    const res = await fetch('/api/absence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ from, to }),
    })
    if (res.ok) {
      setShowSettings(false)
      void fetchState()
    }
    return res.ok
  }

  async function endWindow() {
    await fetch('/api/absence', { method: 'DELETE', headers: await authHeaders() })
    setShowSettings(false)
    void fetchState()
  }

  if (!allowed || !state) return null

  return (
    <>
      {state.active && state.window ? (
        <div className="border-t border-white/10 pt-4 flex flex-wrap items-center gap-2.5 text-sm">
          <Moon className="w-4 h-4 text-primary-300 shrink-0" />
          <span className="text-white/80">
            Frånvaroläge till {formatDatum(state.window.to)}
            {state.status && (
              <span className="text-white/55">
                {' '}— {state.status.samlade} händelse{state.status.samlade === 1 ? '' : 'r'} samlade, {state.status.eskaleringar} eskalering{state.status.eskaleringar === 1 ? '' : 'ar'}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="ml-auto text-xs font-medium text-white/60 hover:text-white underline underline-offset-2"
          >
            Avsluta frånvaro
          </button>
        </div>
      ) : rapportChecked && rapport ? (
        <div className="border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={() => setShowReport(true)}
            className="flex items-center gap-2 text-sm font-medium text-primary-300 hover:text-primary-200"
          >
            <PartyPopper className="w-4 h-4 shrink-0" />
            Välkommen tillbaka — se vad som hände medan du var borta →
          </button>
        </div>
      ) : null}

      {showSettings && (
        <AbsenceSettingsModal
          window={state.window}
          active={state.active}
          onClose={() => setShowSettings(false)}
          onSave={saveWindow}
          onEnd={endWindow}
        />
      )}

      {showReport && rapport && (
        <FranvarorapportModal rapport={rapport} onClose={dismissReport} />
      )}
    </>
  )
}

/**
 * AbsenceTrigger — den diskreta utlösaren för frånvaroläget (Andreas
 * 2026-08-18: flyttad hit från herons vilo-band som förlängde ytan).
 * En liten månikon i Mattes panelhuvud (Jobbkompisen.tsx): tänd
 * (primary-300) när ett fönster är aktivt, dämpad annars. Öppnar samma
 * inställningsmodal som bandet. Egen lätt hämtning vid montering (panelen
 * monteras först när den öppnas) och samma tysta 401/403-degradering —
 * anställda ser aldrig knappen.
 */
export function AbsenceTrigger() {
  const [state, setState] = useState<AbsenceState | null>(null)
  const [allowed, setAllowed] = useState(true)
  const [showSettings, setShowSettings] = useState(false)

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
  }, [])

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/absence', { headers: await authHeaders() })
      if (res.status === 401 || res.status === 403) { setAllowed(false); return }
      if (!res.ok) return
      const data = await res.json()
      setState({ window: data.window, active: data.active, status: data.status })
    } catch { /* tyst — bekvämlighetsyta */ }
  }, [authHeaders])

  useEffect(() => { void fetchState() }, [fetchState])

  async function saveWindow(from: string, to: string) {
    const res = await fetch('/api/absence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ from, to }),
    })
    if (res.ok) {
      setShowSettings(false)
      void fetchState()
    }
    return res.ok
  }

  async function endWindow() {
    await fetch('/api/absence', { method: 'DELETE', headers: await authHeaders() })
    setShowSettings(false)
    void fetchState()
  }

  if (!allowed || !state) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setShowSettings(true)}
        aria-label={state.active ? 'Frånvaroläge aktivt — hantera' : 'Jag är borta en period'}
        title={state.active ? 'Frånvaroläge aktivt' : 'Jag är borta en period'}
        className={`p-1 rounded-lg transition-colors ${state.active ? 'text-primary-200 bg-white/20' : 'text-gray-900/50 hover:bg-white/20 hover:text-gray-900'}`}
      >
        <Moon className="w-4 h-4" />
      </button>

      {showSettings && (
        <AbsenceSettingsModal
          window={state.window}
          active={state.active}
          onClose={() => setShowSettings(false)}
          onSave={saveWindow}
          onEnd={endWindow}
        />
      )}
    </>
  )
}

function AbsenceSettingsModal({
  window: absenceWindow,
  active,
  onClose,
  onSave,
  onEnd,
}: {
  window: AbsenceApiWindow | null
  active: boolean
  onClose: () => void
  onSave: (from: string, to: string) => Promise<boolean>
  onEnd: () => void
}) {
  const now = new Date()
  const igenIFredag = new Date(now.getTime() + 3 * 24 * 3600_000)
  const [from, setFrom] = useState(toDatetimeLocal(now))
  const [to, setTo] = useState(toDatetimeLocal(igenIFredag))
  const [saving, setSaving] = useState(false)
  const [fel, setFel] = useState<string | null>(null)

  async function handleSave() {
    setFel(null)
    if (new Date(to) <= new Date(from)) {
      setFel('Sluttiden måste ligga efter starttiden')
      return
    }
    setSaving(true)
    const ok = await onSave(new Date(from).toISOString(), new Date(to).toISOString())
    setSaving(false)
    if (!ok) setFel('Kunde inte spara — försök igen')
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/55">
      <div className="w-full max-w-[400px] bg-white rounded-2xl border border-slate-200 shadow-lg p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="m-0 text-[15px] font-bold text-slate-900">Frånvaroläge</h2>
          <button type="button" onClick={onClose} aria-label="Stäng" className="text-slate-400 hover:text-slate-600 min-h-[36px] min-w-[36px] -mt-1 -mr-1 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="m-0 text-xs text-slate-500 leading-relaxed">
          Under fönstret samlar teamet vanliga händelser i stället för att pusha dig. Bara det som verkligen inte kan vänta hör av sig — resten väntar tills du är tillbaka.
        </p>

        {active && (
          <button
            type="button"
            onClick={onEnd}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
          >
            Avsluta frånvaron nu
          </button>
        )}

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Från
            <input
              type="datetime-local"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Till
            <input
              type="datetime-local"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900"
            />
          </label>
        </div>

        {fel && <p className="m-0 text-xs text-red-600">{fel}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full px-4 py-2.5 rounded-xl bg-primary-700 text-white text-sm font-semibold hover:bg-primary-800 disabled:opacity-50"
        >
          {saving ? 'Sparar …' : active ? 'Uppdatera fönster' : 'Aktivera frånvaroläge'}
        </button>
      </div>
    </div>
  )
}

function FranvarorapportModal({ rapport, onClose }: { rapport: Franvarorapport; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/55">
      <div className="w-full max-w-[440px] max-h-[85vh] bg-white rounded-2xl border border-slate-200 shadow-lg flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 shrink-0">
          <div>
            <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-primary-700">Välkommen tillbaka</p>
            <h2 className="m-0 mt-0.5 text-[17px] font-bold text-slate-900">Medan du var borta</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Stäng" className="text-slate-400 hover:text-slate-600 min-h-[44px] min-w-[44px] -mt-2 -mr-2 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-5 flex flex-col gap-4">
          <RapportSektion titel="Gjort" tom="Inget gjordes automatiskt under fönstret.">
            {rapport.gjort.map(r => (
              <li key={r.agentId} className="flex justify-between">
                <span className="capitalize">{r.agentId}</span>
                <span className="tabular-nums text-slate-500">{r.antal} st</span>
              </li>
            ))}
          </RapportSektion>

          <RapportSektion titel="Behöver ditt beslut" tom="Inget krävde ett beslut.">
            {rapport.behoverBeslut.map(r => (
              <li key={r.id}>{r.title}</li>
            ))}
          </RapportSektion>

          <RapportSektion titel="Misslyckades" tom="Inget misslyckades.">
            {rapport.misslyckades.map(r => (
              <li key={r.key} className="text-red-700">{r.text}</li>
            ))}
          </RapportSektion>

          <RapportSektion titel="Väntar fortfarande" tom="Inget väntar i kön.">
            {rapport.vantar.map(r => (
              <li key={r.id}>{r.title}</li>
            ))}
          </RapportSektion>
        </div>

        <div className="px-5 pb-5 pt-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-full bg-primary-700 text-white text-sm font-semibold min-h-[44px]"
          >
            Jag har läst det
          </button>
        </div>
      </div>
    </div>
  )
}

function RapportSektion({ titel, tom, children }: { titel: string; tom: string; children: React.ReactNode[] }) {
  const harRader = children.length > 0
  return (
    <div>
      <p className="m-0 mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{titel}</p>
      {harRader ? (
        <ul className="m-0 pl-0 list-none flex flex-col gap-1 text-sm text-slate-800">{children}</ul>
      ) : (
        <p className="m-0 text-sm text-slate-400">{tom}</p>
      )}
    </div>
  )
}
