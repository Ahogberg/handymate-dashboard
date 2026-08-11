'use client'

import { useEffect, useState } from 'react'
import { Mic, Square, Loader2, FileText, AlertCircle } from 'lucide-react'
import { useAudioRecording } from '@/hooks/useAudioRecording'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'

/**
 * Mötesassistenten (etapp 3, 2026-08-09) — Inkorgens Möte-flik.
 *
 * Hantverkaren slår på inspelningen vid ett platsbesök; efteråt finns
 * transkriptet här och förslagen i Samtal-fliken. Beslutad omfattning:
 * max 10 minuter, BARA transkriptet sparas — ljudet kastas efter
 * transkribering och går aldrig att lyssna på i efterhand.
 *
 * ═══ SAMTYCKET ═══
 *
 * Telefonivägen har call_recording_consent_message som läses upp i luren.
 * Ett fysiskt möte har ingen lur — därför står påminnelsen HÄR, ovanför
 * knappen, varje gång: hantverkaren ska säga det innan inspelningen börjar.
 * Texten är en påminnelse till hantverkaren, inte juridisk rådgivning.
 */

const MAX_SEKUNDER = 10 * 60

interface Mote {
  recording_id: string
  transcript: string | null
  transcript_summary: string | null
  duration_seconds: number | null
  created_at: string
}

interface KundTraff {
  customer_id: string
  name: string
}

interface DagensBokning {
  booking_id: string
  scheduled_start: string
  customer_id: string | null
  customer: { name: string } | null
  notes: string | null
}

export function Motesassistenten() {
  const business = useBusiness()
  const insp = useAudioRecording({ maxDurationSeconds: MAX_SEKUNDER })
  const [skickar, setSkickar] = useState(false)
  const [fel, setFel] = useState<string | null>(null)
  const [senasteTranskript, setSenasteTranskript] = useState<string | null>(null)
  const [moten, setMoten] = useState<Mote[]>([])
  const [laddar, setLaddar] = useState(true)

  // Kundkoppling (P0-fix 2026-08-11): routen har alltid tagit emot
  // customer_id men UI:t skickade det aldrig — varje mötestranskript blev
  // föräldralöst. Valfri sökväljare; transkriptet sparas även utan val.
  const [kundSok, setKundSok] = useState('')
  const [kundTraffar, setKundTraffar] = useState<KundTraff[]>([])
  const [valdKund, setValdKund] = useState<KundTraff | null>(null)

  // Epic 1 (2026-08-11): dagens kundkopplade bokningar som snabbval —
  // hantverkaren står oftast hos en bokad kund, ett tryck räcker.
  // Bokningsvalet ger transkriptet både customer_id OCH booking_id (v118).
  const [dagensBokningar, setDagensBokningar] = useState<DagensBokning[]>([])
  const [valdBokning, setValdBokning] = useState<DagensBokning | null>(null)

  useEffect(() => {
    let aktiv = true
    async function hamtaBokningar() {
      const idag = new Date().toISOString().slice(0, 10)
      const { data } = await supabase
        .from('booking')
        .select('booking_id, scheduled_start, customer_id, notes, customer (name)')
        .eq('business_id', business.business_id)
        .gte('scheduled_start', `${idag}T00:00:00`)
        .lte('scheduled_start', `${idag}T23:59:59`)
        .not('status', 'eq', 'cancelled')
        .not('customer_id', 'is', null)
        .order('scheduled_start')
        .limit(8)
      if (aktiv) setDagensBokningar((data as unknown as DagensBokning[]) || [])
    }
    hamtaBokningar()
    return () => { aktiv = false }
  }, [business.business_id])

  function valjBokning(b: DagensBokning) {
    setValdBokning(b)
    if (b.customer_id) {
      setValdKund({ customer_id: b.customer_id, name: b.customer?.name || 'Kund' })
    }
    setKundTraffar([])
  }

  useEffect(() => {
    const term = kundSok.trim()
    if (term.length < 2 || valdKund) {
      setKundTraffar([])
      return
    }
    let aktiv = true
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('customer')
        .select('customer_id, name')
        .eq('business_id', business.business_id)
        .ilike('name', `%${term}%`)
        .order('name')
        .limit(8)
      if (aktiv) setKundTraffar(data || [])
    }, 250)
    return () => { aktiv = false; clearTimeout(t) }
  }, [kundSok, valdKund, business.business_id])

  useEffect(() => {
    let aktiv = true
    async function hamta() {
      // Klientläsning via den sessionsbärande klienten — v101 släpper igenom
      // medlemmen. Saknas source-kolumnen (v102 ej körd) blir listan tom,
      // inte kraschad: felet sväljs medvetet och ytan visar tomläget.
      const { data } = await supabase
        .from('call_recording')
        .select('recording_id, transcript, transcript_summary, duration_seconds, created_at')
        .eq('business_id', business.business_id)
        .eq('source', 'site_visit')
        .order('created_at', { ascending: false })
        .limit(20)
      if (aktiv) {
        setMoten(data || [])
        setLaddar(false)
      }
    }
    hamta()
    return () => { aktiv = false }
  }, [business.business_id, senasteTranskript])

  async function skickaInspelning() {
    if (!insp.blob) return
    setSkickar(true)
    setFel(null)
    try {
      const form = new FormData()
      const andelse = insp.blob.type.includes('mp4') ? 'mp4' : 'webm'
      form.append('audio', insp.blob, `platsbesok.${andelse}`)
      form.append('duration_seconds', String(insp.duration))
      if (valdKund) form.append('customer_id', valdKund.customer_id)
      if (valdBokning) form.append('booking_id', valdBokning.booking_id)

      const res = await fetch('/api/voice/site-visit', { method: 'POST', body: form })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setFel(data?.error || 'Något gick fel — transkriptet sparades inte.')
        return
      }
      setSenasteTranskript(data.transcript)
      insp.reset()
    } catch {
      setFel('Nätverksfel — försök igen. Inspelningen finns kvar tills du lämnar sidan.')
    } finally {
      setSkickar(false)
    }
  }

  const spelarIn = insp.state === 'recording'
  const harInspelning = insp.state === 'stopped' && insp.blob

  return (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto">
      {/* Samtyckespåminnelsen — alltid synlig ovanför knappen. */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Innan du startar</p>
        <p className="mt-1">
          Säg till kunden att mötet spelas in för anteckningar, och vänta på
          ett ja. Ljudet sparas inte — bara texten.
        </p>
      </div>

      {/* Kundval — valfritt men gör transkriptet kopplat till affären. */}
      <div className="mt-4 bg-white rounded-2xl border border-[#E2E8F0] p-4">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Vilken kund gäller mötet? (valfritt)
        </label>

        {/* Dagens bokningar som ett-trycks-val */}
        {!valdKund && dagensBokningar.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {dagensBokningar.map(b => (
              <button
                key={b.booking_id}
                onClick={() => valjBokning(b)}
                disabled={spelarIn || skickar}
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-full border border-primary-200 bg-primary-50 text-primary-800 text-sm hover:bg-primary-100 disabled:opacity-50"
              >
                <span className="font-medium">
                  {new Date(b.scheduled_start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                </span>
                {b.customer?.name || 'Kund'}
              </button>
            ))}
          </div>
        )}

        {valdKund ? (
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-50 text-primary-800 text-sm font-medium">
              {valdKund.name}
              {valdBokning && (
                <span className="text-primary-600 font-normal">
                  · bokning {new Date(valdBokning.scheduled_start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </span>
            <button
              onClick={() => { setValdKund(null); setValdBokning(null); setKundSok('') }}
              className="text-sm text-gray-500 hover:text-gray-700"
              disabled={spelarIn || skickar}
            >
              Byt
            </button>
          </div>
        ) : (
          <div className="relative mt-2">
            <input
              type="text"
              value={kundSok}
              onChange={e => setKundSok(e.target.value)}
              placeholder="Sök kund på namn…"
              disabled={spelarIn || skickar}
              className="w-full min-h-[44px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none disabled:bg-gray-50"
            />
            {kundTraffar.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                {kundTraffar.map(k => (
                  <li key={k.customer_id}>
                    <button
                      onClick={() => { setValdKund(k); setKundTraffar([]) }}
                      className="w-full text-left px-3 py-2.5 text-sm text-gray-800 hover:bg-primary-50"
                    >
                      {k.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 bg-white rounded-2xl border border-[#E2E8F0] p-6 text-center">
        {insp.state === 'unsupported' && (
          <p className="text-sm text-gray-600">
            Inspelning fungerar inte i den här webbläsaren. Öppna appen i
            Safari eller Chrome på telefonen.
          </p>
        )}
        {insp.state === 'denied' && (
          <p className="text-sm text-gray-600">
            Mikrofonen är blockerad. Tillåt mikrofon för app.handymate.se i
            webbläsarens inställningar och försök igen.
          </p>
        )}

        {(insp.state === 'idle' || spelarIn) && (
          <>
            <button
              onClick={spelarIn ? insp.stop : insp.start}
              className={`inline-flex items-center gap-3 min-h-[56px] px-8 rounded-full text-white font-medium text-lg transition-colors ${
                spelarIn ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-700 hover:bg-primary-800'
              }`}
            >
              {spelarIn ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              {spelarIn ? 'Avsluta mötet' : 'Starta mötesinspelning'}
            </button>

            {spelarIn && (
              <div className="mt-4">
                <p className="font-heading text-3xl font-bold text-slate-900 tabular-nums">
                  {insp.durationLabel}
                </p>
                {/* Nedräkningen — kravet från planen: hantverkaren ska se
                    taket komma, inte överraskas av det. */}
                <p className={`mt-1 text-sm ${
                  (insp.secondsLeft ?? 0) <= 60 ? 'text-red-600 font-medium' : 'text-gray-500'
                }`}>
                  {Math.floor((insp.secondsLeft ?? 0) / 60)}:{String((insp.secondsLeft ?? 0) % 60).padStart(2, '0')} kvar
                </p>
              </div>
            )}
          </>
        )}

        {harInspelning && (
          <div>
            {insp.stoppedByLimit && (
              <p className="mb-3 text-sm text-amber-700">
                Tio minuter — inspelningen stoppades automatiskt.
              </p>
            )}
            <p className="text-sm text-gray-600">Inspelning klar ({insp.durationLabel})</p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={skickaInspelning}
                disabled={skickar}
                className="inline-flex items-center gap-2 min-h-[44px] px-6 rounded-lg bg-primary-700 text-white font-medium hover:bg-primary-800 disabled:opacity-60"
              >
                {skickar ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {skickar ? 'Skriver ut mötet…' : 'Spara som text'}
              </button>
              <button
                onClick={insp.reset}
                disabled={skickar}
                className="min-h-[44px] px-4 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Släng
              </button>
            </div>
          </div>
        )}

        {fel && (
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="w-4 h-4" /> {fel}
          </p>
        )}
      </div>

      {senasteTranskript && (
        <div className="mt-6 bg-white rounded-2xl border border-primary-200 p-5">
          <p className="text-sm font-medium text-primary-800">Mötet är sparat</p>
          <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{senasteTranskript}</p>
          <p className="mt-3 text-xs text-gray-500">
            Matte går igenom mötet nu — kort med förslag dyker upp på Idag inom någon minut.
          </p>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-medium text-gray-900">Tidigare möten</h2>
        {laddar ? (
          <div className="mt-4 flex justify-center"><Loader2 className="w-5 h-5 text-primary-600 animate-spin" /></div>
        ) : moten.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            Inga möten ännu. Nästa platsbesök — starta inspelningen ovan.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {moten.map(m => (
              <li key={m.recording_id} className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{new Date(m.created_at).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  {m.duration_seconds ? <span>{Math.round(m.duration_seconds / 60)} min</span> : null}
                </div>
                <p className="mt-2 text-sm text-gray-700 line-clamp-4 whitespace-pre-wrap">
                  {m.transcript_summary || m.transcript || '—'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default Motesassistenten
