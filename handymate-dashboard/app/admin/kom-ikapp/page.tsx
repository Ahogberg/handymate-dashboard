'use client'

/**
 * Kom ikapp — ytan till POST /api/admin/kom-ikapp.
 *
 * ═══ VARFÖR SIDAN FINNS ═══
 *
 * Rutten byggdes först utan yta, och Andreas frågade rimligt nog "hur kör jag
 * torrkörningen?". Svaret var webbläsarens konsol på en dator — värdelöst för
 * någon som står med telefonen. Ett admin-API utan yta är ett halvbyggt
 * verktyg, och det här är andra halvan.
 *
 * ═══ TVÅ STEG, MED FLIT ═══
 *
 * "Kör skarpt" är släckt tills läget har visats. Den som skriver till alla
 * kunders konton ska ha sett vad som saknas först — inte för att knappen är
 * farlig (seedaren är idempotent) utan för att en körning man inte tittat på
 * inte går att bedöma efteråt.
 */

import { useState } from 'react'
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'

interface Rad {
  business_id: string
  business_name: string
  branch: string
  jobbtyper: number
  jobbtyper_utan_upplagg: string[]
  nya_upplagg?: number
  omkopplade?: number
  hoppade_over?: string
}
interface Svar {
  dry_run: boolean
  foretag_kontrollerade: number
  foretag_utan_jobbtyper: number
  jobbtyper_utan_upplagg: number
  nya_upplagg: number
  omkopplade: number
  misslyckade: number
  resultat: Rad[]
}

export default function KomIkappSida() {
  const [svar, setSvar] = useState<Svar | null>(null)
  const [kor, setKor] = useState<'nej' | 'torr' | 'skarpt'>('nej')
  const [fel, setFel] = useState<string | null>(null)
  const [harVisatLaget, setHarVisatLaget] = useState(false)

  async function kora(dryRun: boolean) {
    setKor(dryRun ? 'torr' : 'skarpt'); setFel(null)
    try {
      const res = await fetch('/api/admin/kom-ikapp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      })
      const data = await res.json()
      if (!res.ok) { setFel(data.error || 'Körningen misslyckades.'); return }
      setSvar(data)
      if (dryRun) setHarVisatLaget(true)
    } catch {
      setFel('Kunde inte nå servern. Försök igen.')
    } finally { setKor('nej') }
  }

  const upptagen = kor !== 'nej'
  const knapp = 'min-h-[48px] px-5 rounded-xl font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40'
  const intressanta = (svar?.resultat ?? []).filter(r => r.jobbtyper === 0 || r.jobbtyper_utan_upplagg.length > 0 || r.nya_upplagg || r.omkopplade || r.hoppade_over?.startsWith('seedning'))

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Kom ikapp</h1>
        <p className="text-slate-600 mt-2 leading-relaxed">
          Kör om seedningen för företag som redan finns, så att de får det som lagts till efter
          att de kom igång. Samma seedare som körs när ett nytt företag blir klart — den hoppar
          över allt som redan finns och skriver aldrig över något.
        </p>

        <div className="flex flex-col sm:flex-row gap-2.5 mt-6">
          <button type="button" disabled={upptagen} onClick={() => kora(true)}
            className={`${knapp} bg-white border-2 border-slate-200 text-slate-700 hover:border-primary-700 hover:text-primary-700`}>
            {kor === 'torr' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Visa läget
          </button>
          <button type="button" disabled={upptagen || !harVisatLaget}
            onClick={() => { if (confirm('Kör skarpt? Upplägg skapas för de jobbtyper som saknar ett. Ingenting skrivs över.')) void kora(false) }}
            className={`${knapp} bg-primary-700 hover:bg-primary-800 text-white`}>
            {kor === 'skarpt' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Kör skarpt<ArrowRight className="w-4 h-4" />
          </button>
        </div>
        {!harVisatLaget && <p className="text-xs text-slate-500 mt-2">Visa läget först — då syns vad som saknas innan något skrivs.</p>}

        {fel && <p role="alert" className="mt-5 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-800">{fel}</p>}

        {svar && <div className="mt-7">
          <div className={`rounded-2xl border p-4 ${svar.dry_run ? 'bg-white border-slate-200' : 'bg-primary-50 border-primary-200'}`}>
            <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              {svar.dry_run ? <><RefreshCw className="w-4 h-4 text-slate-400" />Läget nu — ingenting har skrivits</>
                : <><CheckCircle2 className="w-4 h-4 text-primary-700" />Körningen är klar</>}
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 text-sm">
              <dt className="text-slate-500">Företag kontrollerade</dt><dd className="text-slate-900 font-semibold text-right">{svar.foretag_kontrollerade}</dd>
              <dt className="text-slate-500">Utan jobbtyper</dt><dd className="text-slate-900 font-semibold text-right">{svar.foretag_utan_jobbtyper}</dd>
              <dt className="text-slate-500">Jobbtyper utan upplägg</dt><dd className="text-slate-900 font-semibold text-right">{svar.jobbtyper_utan_upplagg}</dd>
              {!svar.dry_run && <><dt className="text-slate-500">Nya upplägg</dt><dd className="text-slate-900 font-semibold text-right">{svar.nya_upplagg}</dd>
                <dt className="text-slate-500">Omkopplade</dt><dd className="text-slate-900 font-semibold text-right">{svar.omkopplade}</dd></>}
              {svar.misslyckade > 0 && <><dt className="text-red-700">Misslyckade</dt><dd className="text-red-700 font-semibold text-right">{svar.misslyckade}</dd></>}
            </dl>
          </div>

          <ul className="mt-4 space-y-2">
            {intressanta.map(r => <li key={r.business_id} className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="font-semibold text-slate-900">{r.business_name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{r.jobbtyper} jobbtyper · {r.branch}</p>
              {r.jobbtyper_utan_upplagg.length > 0 && <p className="text-sm text-slate-600 mt-2">
                <span className="font-semibold text-amber-700">Utan upplägg:</span> {r.jobbtyper_utan_upplagg.join(', ')}
              </p>}
              {(r.nya_upplagg || r.omkopplade) ? <p className="text-sm text-primary-800 mt-2 font-medium">
                {r.nya_upplagg || 0} nya upplägg, {r.omkopplade || 0} omkopplade
              </p> : null}
              {r.hoppade_over?.startsWith('seedning') && <p className="text-sm text-red-700 mt-2 flex items-start gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{r.hoppade_over}
              </p>}
            </li>)}
            {intressanta.length === 0 && <li className="text-sm text-slate-500 px-1">Ingenting att komma ikapp med — alla företag ligger i fas.</li>}
          </ul>
        </div>}
      </div>
    </div>
  )
}
