'use client'

/**
 * Admin → Transkriberingsmätning.
 *
 * Mätrutten (/api/admin/transcription-bench) är adminspärrad med cookie, vilket
 * gör den opraktisk att anropa med curl. Utan en yta hade mätningen blivit en
 * teoretisk konstruktion som aldrig kördes — och då hade motorvalet förblivit
 * en gissning, vilket var hela poängen med att bygga den.
 *
 * Ladda upp en svensk ljudinspelning (helst ett riktigt kundsamtal med
 * egennamn: firmanamn, ortsnamn, kundnamn) och jämför motorerna sida vid sida.
 * Det är samma metod som fltman/kundkoll använde i docs/VERIFIERAD-STACK.md.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Loader2, Upload, Clock, Users, ShieldAlert } from 'lucide-react'

interface MotorResultat {
  modell: string
  ok: boolean
  ms: number
  text: string
  teckenAntal: number
  harTalare: boolean
  antalSegment: number
  avvisadAvVakten: string | null
  uppskattadKostnadOre: number | null
  error?: string
}

interface BenchSvar {
  business_id: string
  yta: string
  ljudlangd_sekunder: number | null
  prompt: string | null
  prompt_tecken: number
  motorer: MotorResultat[]
  lasanvisning: string
}

const YTOR = [
  { value: 'samtal', label: 'Telefonsamtal (flera parter)' },
  { value: 'mote', label: 'Möte / platsbesök (flera parter)' },
  { value: 'matte', label: 'Matte röstläge (en talare)' },
  { value: 'jobbuddy', label: 'JobBuddy i fält (en talare)' },
]

export default function TranskriberingsMatning() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [kor, setKor] = useState(false)
  const [fel, setFel] = useState<string | null>(null)
  const [svar, setSvar] = useState<BenchSvar | null>(null)

  const [fil, setFil] = useState<File | null>(null)
  const [businessId, setBusinessId] = useState('')
  const [yta, setYta] = useState('samtal')
  const [langd, setLangd] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/admin/pilots')
        if (res.status === 403) {
          setIsAdmin(false)
          router.push('/login?error=admin_required')
          return
        }
        if (res.ok) {
          setIsAdmin(true)
          const data = await res.json()
          // Förifyll med första riktiga företaget — vokabuläret byggs ur det.
          const forsta = (data.pilots || [])[0]
          if (forsta?.businessId) setBusinessId(forsta.businessId)
        }
      } catch {
        setIsAdmin(false)
      }
      setLoading(false)
    })()
  }, [router])

  async function korMatning() {
    if (!fil || !businessId || kor) return
    setKor(true)
    setFel(null)
    setSvar(null)
    try {
      const form = new FormData()
      form.append('audio', fil)
      form.append('business_id', businessId)
      form.append('yta', yta)
      if (langd) form.append('duration_seconds', langd)

      const res = await fetch('/api/admin/transcription-bench', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        setFel(data.error || 'Mätningen misslyckades')
      } else {
        setSvar(data as BenchSvar)
      }
    } catch (err: any) {
      setFel(err?.message || 'Nätverksfel')
    }
    setKor(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Åtkomst nekad</h1>
          <p className="text-gray-500">Du har inte admin-behörighet.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900">Transkriberingsmätning</h1>
        <p className="text-gray-500 mt-1 mb-6">
          Samma ljudfil genom varje motor, så motorvalet blir bevisat i stället för gissat.
          Använd helst ett riktigt samtal med egennamn — firmanamn, ortsnamn och kundnamn
          är där skillnaden syns.
        </p>

        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Ljudfil</label>
              <input
                type="file"
                accept="audio/*,video/mp4,.m4a,.webm,.wav,.mp3"
                onChange={e => setFil(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700 file:font-medium hover:file:bg-primary-100"
              />
              <p className="text-xs text-gray-400 mt-1">
                Max 25 MB. Spela in på mobilen om det inte finns något inspelat samtal.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Företag</label>
              <input
                value={businessId}
                onChange={e => setBusinessId(e.target.value)}
                placeholder="biz_..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">Vokabuläret byggs ur firmans egna uppgifter.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Yta</label>
              <select
                value={yta}
                onChange={e => setYta(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                {YTOR.map(y => (
                  <option key={y.value} value={y.value}>{y.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ljudlängd i sekunder <span className="text-gray-400 font-normal">(valfritt)</span>
              </label>
              <input
                value={langd}
                onChange={e => setLangd(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="t.ex. 90"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">
                Behövs bara för vaktens täthetsregel och kostnadsuppskattningen.
              </p>
            </div>
          </div>

          <button
            onClick={korMatning}
            disabled={!fil || !businessId || kor}
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary-700 text-white font-medium text-sm disabled:opacity-50 hover:bg-primary-800 transition-colors"
          >
            {kor ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {kor ? 'Kör mätningen …' : 'Kör mätningen'}
          </button>
          <p className="text-xs text-gray-400 mt-2">
            Ljudet transkriberas en gång per motor. Kostnaden belastar inte kundens bränslemätare.
          </p>

          {fel && (
            <div className="mt-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{fel}</span>
            </div>
          )}
        </div>

        {svar && (
          <>
            <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
              <h2 className="font-semibold text-gray-900 mb-2">Egennamnsprompten</h2>
              {svar.prompt ? (
                <>
                  <p className="text-sm text-gray-600 font-mono bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap">
                    {svar.prompt}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    {svar.prompt_tecken} tecken. Diariseringsmotorn får den inte — den stöder inte prompt.
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-500">
                  Ingen prompt byggdes — firman saknar namn, ort, specialiteter och artiklar.
                </p>
              )}
            </div>

            <div className="space-y-4">
              {svar.motorer.map(m => (
                <div key={m.modell} className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <h3 className="font-semibold text-gray-900">{m.modell}</h3>
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="w-3.5 h-3.5" />
                      {(m.ms / 1000).toFixed(1)} s
                    </span>
                    {m.harTalare && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        <Users className="w-3.5 h-3.5" />
                        talare uppmärkta
                      </span>
                    )}
                    {m.antalSegment > 0 && (
                      <span className="text-xs text-gray-500">{m.antalSegment} segment</span>
                    )}
                    {m.uppskattadKostnadOre != null && (
                      <span className="text-xs text-gray-500">
                        ~{(m.uppskattadKostnadOre / 100).toFixed(2)} kr
                      </span>
                    )}
                    {m.avvisadAvVakten && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-800 bg-amber-50 px-2 py-0.5 rounded">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        vakten: {m.avvisadAvVakten}
                      </span>
                    )}
                  </div>

                  {m.error && !m.text && (
                    <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{m.error}</p>
                  )}

                  {m.text && (
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{m.text}</p>
                  )}
                </div>
              ))}
            </div>

            <p className="text-sm text-gray-500 mt-6">{svar.lasanvisning}</p>
          </>
        )}
      </div>
    </div>
  )
}
