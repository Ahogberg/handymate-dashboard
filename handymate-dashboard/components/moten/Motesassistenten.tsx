'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Pause, Play, Loader2, AlertCircle, Trash2 } from 'lucide-react'
import { useSegmentedRecording, type SegmentPayload } from '@/hooks/useSegmentedRecording'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'

/**
 * Mötesassistenten V2 (Meeting Intelligence, 2026-08) — Inkorgens Möte-flik.
 *
 * ═══ VARFÖR MOTORN BYTTES UT ═══
 *
 * V1 spelade in EN fil i max 10 minuter och laddade upp den synkront när
 * hantverkaren tryckte "spara". Möten går ofta längre än så, och en lång
 * fil som laddas upp i ett enda skott är sårbar: tappar telefonen täckning
 * mot slutet av ett 40-minutersmöte är hela inspelningen borta.
 *
 * V2 spelar in i 5-minuterssegment (`useSegmentedRecording`) upp till 90
 * minuter. Varje segment är en komplett, egen ljudfil som laddas upp för
 * sig så fort det är klart — mötet är alltså redan halvvägs säkrat på
 * servern innan hantverkaren ens trycker "Avsluta". Transkriptet kommer
 * INTE längre tillbaka synkront: Matte går igenom det i bakgrunden efter
 * att workern plockat upp de uppladdade segmenten.
 *
 * ═══ SAMTYCKET ═══
 *
 * Telefonivägen har call_recording_consent_message som läses upp i luren.
 * Ett fysiskt möte har ingen lur — därför står påminnelsen HÄR, ovanför
 * knappen, varje gång: hantverkaren ska säga det innan inspelningen börjar.
 * Texten är en påminnelse till hantverkaren, inte juridisk rådgivning.
 */

const SEGMENT_SEKUNDER = 5 * 60
const MAX_MOTE_SEKUNDER = 90 * 60

type UppladdningsStatus = 'väntar' | 'laddar' | 'klar' | 'misslyckad'

interface UppladdningsItem extends SegmentPayload {
  jobId: string
}

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

interface OppetJobb {
  id: string
  created_at: string
  segment_count: number
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function Motesassistenten() {
  const business = useBusiness()
  const [fel, setFel] = useState<string | null>(null)
  const [moten, setMoten] = useState<Mote[]>([])
  const [laddar, setLaddar] = useState(true)

  // Jobbet som skapas på servern innan inspelningen ens börjar — allt som
  // laddas upp under mötet hänger på detta id.
  const [jobId, setJobId] = useState<string | null>(null)
  const [startar, setStartar] = useState(false)
  const [avslutar, setAvslutar] = useState(false)
  const [klart, setKlart] = useState(false)

  // Uppladdningsstatus per segment-nummer, för statusraden "X av Y delar".
  const [uploads, setUploads] = useState<Record<number, UppladdningsStatus>>({})
  const uploadQueueRef = useRef<UppladdningsItem[]>([])
  const uploadBusyRef = useRef(false)

  // Oavslutade möten från tidigare sessioner (krasch, stängd flik) —
  // hämtas en gång vid mount.
  const [oppnaJobb, setOppnaJobb] = useState<OppetJobb[]>([])

  // Kundkoppling — samma sökväljare som i V1.
  const [kundSok, setKundSok] = useState('')
  const [kundTraffar, setKundTraffar] = useState<KundTraff[]>([])
  const [valdKund, setValdKund] = useState<KundTraff | null>(null)

  // Dagens kundkopplade bokningar som snabbval.
  const [dagensBokningar, setDagensBokningar] = useState<DagensBokning[]>([])
  const [valdBokning, setValdBokning] = useState<DagensBokning | null>(null)

  async function laddaUppSegment(item: UppladdningsItem): Promise<boolean> {
    // Sekventiell kö med två om — mobilnät på en byggarbetsplats tappar
    // paket, men ett enskilt segment är litet nog att det nästan alltid
    // går igenom inom tre försök.
    const forsok = [0, 1000, 3000]
    for (let i = 0; i < forsok.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, forsok[i]))
      try {
        const andelse = item.mimeType.includes('mp4') ? 'mp4' : 'webm'
        const form = new FormData()
        form.append('job_id', item.jobId)
        form.append('seq', String(item.seq))
        form.append('duration_seconds', String(item.durationSeconds))
        form.append('audio', item.blob, `segment-${item.seq}.${andelse}`)

        const res = await fetch('/api/voice/meeting/segment', { method: 'POST', body: form })
        // 409 = mötet är redan avslutat på servern (t.ex. dubbelt avsluta-
        // tryck hann före) — inget mer att göra med det här segmentet,
        // räkna det som klart så uppladdningskön inte fastnar.
        if (res.ok || res.status === 409) return true
      } catch {
        // Nätverksfel — försök igen om det finns fler försök kvar.
      }
    }
    return false
  }

  async function processaKö() {
    if (uploadBusyRef.current) return
    const next = uploadQueueRef.current.shift()
    if (!next) return
    uploadBusyRef.current = true
    setUploads(u => ({ ...u, [next.seq]: 'laddar' }))
    const ok = await laddaUppSegment(next)
    setUploads(u => ({ ...u, [next.seq]: ok ? 'klar' : 'misslyckad' }))
    uploadBusyRef.current = false
    processaKö() // fortsätt med nästa i kön om något väntar
  }

  function enqueueSegment(segment: SegmentPayload) {
    if (!jobId) return // ska inte hända — jobId sätts innan insp.start()
    setUploads(u => ({ ...u, [segment.seq]: 'väntar' }))
    uploadQueueRef.current.push({ ...segment, jobId })
    processaKö()
  }

  const insp = useSegmentedRecording({
    segmentSeconds: SEGMENT_SEKUNDER,
    maxTotalSeconds: MAX_MOTE_SEKUNDER,
    onSegment: enqueueSegment,
  })

  // Mikrofonen nekades eller stöds inte EFTER att jobbet redan skapades på
  // servern (start() postar jobbet, sedan begärs mikrofontillstånd) — då
  // finns ett tomt jobb kvar att städa bort. Reaktivt istället för att läsa
  // insp.state direkt efter await, eftersom React-state inte hinner
  // uppdateras synkront i samma funktion.
  useEffect(() => {
    if (jobId && (insp.state === 'denied' || insp.state === 'unsupported')) {
      fetch('/api/voice/meeting/abandon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      }).catch(() => {})
      setJobId(null)
    }
  }, [insp.state, jobId])

  useEffect(() => {
    let aktiv = true
    async function hamtaOppna() {
      try {
        const res = await fetch('/api/voice/meeting/start')
        if (!res.ok) return
        const data = await res.json()
        if (aktiv) setOppnaJobb(data.open_jobs || [])
      } catch {
        // Återhämtning är en bonus, inte en kritisk väg — sväljs tyst.
      }
    }
    hamtaOppna()
    return () => { aktiv = false }
  }, [])

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
      // medlemmen. Saknas source-kolumnen blir listan tom, inte kraschad:
      // felet sväljs medvetet och ytan visar tomläget.
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
  }, [business.business_id, klart])

  async function startaMote() {
    setFel(null)
    setStartar(true)
    try {
      const res = await fetch('/api/voice/meeting/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: valdKund?.customer_id ?? null,
          booking_id: valdBokning?.booking_id ?? null,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.job_id) {
        setFel(data?.error || 'Kunde inte starta mötet — försök igen.')
        return
      }
      setJobId(data.job_id)
      setUploads({})
      setKlart(false)
      uploadQueueRef.current = []
      await insp.start()
    } catch {
      setFel('Nätverksfel — mötet kunde inte startas.')
    } finally {
      setStartar(false)
    }
  }

  function pausaEllerAterta() {
    if (insp.state === 'recording') insp.pause()
    else if (insp.state === 'paused') insp.resume()
  }

  // Väntar in det sista segmentet innan "Avsluta" går vidare till complete.
  // MediaRecorderns onstop-event (som skickar segmentet till kön) är
  // asynkront, så kön kan se tom ut en kort stund innan svansen dyker upp —
  // därför en kort inledande paus innan vi börjar polla kötömning.
  async function vantaPaTomKö() {
    await new Promise(r => setTimeout(r, 400))
    const deadline = Date.now() + 20000
    while (Date.now() < deadline) {
      if (uploadQueueRef.current.length === 0 && !uploadBusyRef.current) return
      await new Promise(r => setTimeout(r, 300))
    }
  }

  async function avslutaMote() {
    if (!jobId) return
    setFel(null)
    insp.stop()
    setAvslutar(true)
    try {
      await vantaPaTomKö()
      const res = await fetch('/api/voice/meeting/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setFel(data?.error || 'Mötet kunde inte skickas in — försök igen.')
        return
      }
      setKlart(true)
      setJobId(null)
      insp.reset()
    } catch {
      setFel('Nätverksfel — mötet kunde inte skickas in. Försök igen.')
    } finally {
      setAvslutar(false)
    }
  }

  async function slangMote() {
    if (typeof window !== 'undefined' && !window.confirm('Kasta mötet? Det som spelats in går inte att återställa.')) {
      return
    }
    const id = jobId
    insp.reset()
    setJobId(null)
    setUploads({})
    uploadQueueRef.current = []
    if (id) {
      fetch('/api/voice/meeting/abandon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: id }),
      }).catch(() => {})
    }
  }

  async function slutforOppet(id: string) {
    await fetch('/api/voice/meeting/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: id }),
    }).catch(() => {})
    setOppnaJobb(jobb => jobb.filter(j => j.id !== id))
  }

  async function slangOppet(id: string) {
    await fetch('/api/voice/meeting/abandon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: id }),
    }).catch(() => {})
    setOppnaJobb(jobb => jobb.filter(j => j.id !== id))
  }

  const spelarIn = insp.state === 'recording'
  const pausad = insp.state === 'paused'
  const aktivInspelning = jobId && (spelarIn || pausad) && !avslutar
  const uppladdadeAntal = Object.values(uploads).filter(s => s === 'klar').length
  const totaltAntal = Object.keys(uploads).length
  const nagonMisslyckad = Object.values(uploads).some(s => s === 'misslyckad')
  const uppladdningPagar = Object.values(uploads).some(s => s === 'väntar' || s === 'laddar')

  return (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto">
      {/* Oavslutade möten från en krasch eller stängd flik. */}
      {oppnaJobb.length > 0 && (
        <div className="mb-4 space-y-2">
          {oppnaJobb.map(j => (
            <div key={j.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p>
                Oavslutat möte från{' '}
                {new Date(j.created_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}{' '}
                ({j.segment_count} {j.segment_count === 1 ? 'del' : 'delar'} uppladdade)
              </p>
              <div className="mt-2 flex gap-3">
                <button
                  onClick={() => slutforOppet(j.id)}
                  className="min-h-[36px] px-3 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
                >
                  Slutför
                </button>
                <button
                  onClick={() => slangOppet(j.id)}
                  className="min-h-[36px] px-3 rounded-lg text-amber-800 text-sm hover:bg-amber-100"
                >
                  Släng
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Samtyckespåminnelsen — alltid synlig ovanför knappen. */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Innan du startar</p>
        <p className="mt-1">
          Säg till kunden att mötet spelas in för anteckningar, och vänta på
          ett ja. Ljudet raderas när texten är klar — bara texten sparas.
        </p>
      </div>

      {/* Kundval — valfritt men gör transkriptet kopplat till affären. */}
      <div className="mt-4 bg-white rounded-2xl border border-[#E2E8F0] p-4">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Vilken kund gäller mötet? (valfritt)
        </label>

        {!valdKund && dagensBokningar.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {dagensBokningar.map(b => (
              <button
                key={b.booking_id}
                onClick={() => valjBokning(b)}
                disabled={!!aktivInspelning || startar}
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
              disabled={!!aktivInspelning || startar}
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
              disabled={!!aktivInspelning || startar}
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

        {/* Startläge — inget jobb pågår och vi väntar varken på uppladdning
            eller på complete-svaret. */}
        {!jobId && !avslutar && !klart && insp.state !== 'denied' && insp.state !== 'unsupported' && (
          <button
            onClick={startaMote}
            disabled={startar}
            className="inline-flex items-center gap-3 min-h-[56px] px-8 rounded-full text-white font-medium text-lg transition-colors bg-primary-700 hover:bg-primary-800 disabled:opacity-60"
          >
            {startar ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mic className="w-5 h-5" />}
            {startar ? 'Startar mötet…' : 'Starta mötesinspelning'}
          </button>
        )}

        {/* Inspelning eller paus pågår. */}
        {aktivInspelning && (
          <div>
            <p className="font-heading text-3xl font-bold text-slate-900 tabular-nums">
              {insp.durationLabel}
            </p>
            <p className={`mt-1 text-sm ${insp.secondsLeft <= 5 * 60 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
              {formatDuration(insp.secondsLeft)} min kvar
            </p>
            {pausad && <p className="mt-2 text-sm font-medium text-amber-700">Pausad</p>}

            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                onClick={pausaEllerAterta}
                className="inline-flex items-center gap-2 min-h-[48px] px-5 rounded-full border border-gray-200 text-gray-700 font-medium hover:bg-gray-50"
              >
                {pausad ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                {pausad ? 'Återuppta' : 'Paus'}
              </button>
              <button
                onClick={avslutaMote}
                className="inline-flex items-center gap-2 min-h-[48px] px-6 rounded-full text-white font-medium bg-red-600 hover:bg-red-700"
              >
                <Square className="w-4 h-4" />
                Avsluta
              </button>
            </div>

            <button
              onClick={slangMote}
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Släng mötet
            </button>

            {totaltAntal > 0 && (
              <p className="mt-4 inline-flex items-center gap-2 text-xs text-gray-500">
                {uppladdningPagar && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {uppladdadeAntal} av {totaltAntal} delar uppladdade
                {nagonMisslyckad && (
                  <span className="text-amber-700">
                    — ett avsnitt kunde inte laddas upp och markeras som saknat i texten
                  </span>
                )}
              </p>
            )}
          </div>
        )}

        {/* Väntar in sista uppladdningen och complete-anropet. */}
        {avslutar && (
          <p className="inline-flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
            Laddar upp sista delen…
          </p>
        )}

        {fel && (
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="w-4 h-4" /> {fel}
          </p>
        )}
      </div>

      {klart && (
        <div className="mt-6 bg-white rounded-2xl border border-primary-200 p-5">
          <p className="text-sm font-medium text-primary-800">Mötet är inskickat</p>
          <p className="mt-2 text-sm text-gray-700">
            Matte går igenom det nu — kort med förslag dyker upp på Idag.
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
