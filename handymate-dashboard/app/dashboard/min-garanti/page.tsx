'use client'
import { useCallback, useEffect, useState } from 'react'
import { useBusiness } from '@/lib/BusinessContext'
import { useCurrentUser } from '@/lib/CurrentUserContext'

/**
 * "Min användning" — kundens egen vy av användningsgarantins villkor.
 *
 * Garantin (grundarerbjudandet) mäter fyra av åtta ytor under de första 30
 * dagarna. Måttet räknades redan internt, men kunden kunde inte se det.
 * Den här sidan visar exakt samma siffra som vi själva ser, yta för yta,
 * med samma funktion bakom (lib/admin/adoption.ts via /api/min-garanti).
 *
 * Sidan LOVAR ingenting. Den visar ett mått. Garantins ordalydelse bor i
 * avtalet och på landningssidan — en produktyta som formulerar sin egen
 * version av ett avtalsvillkor är precis hur två sanningar uppstår.
 */

interface Yta { nyckel: string; etikett: string; klar: boolean }
interface Svar {
  ytor: Yta[]
  antal: number
  totalt: number
  troskel: number
  uppfyllt: boolean
  dag: number | null
  fonsterDagar: number
  fonsterKlart: boolean
  dagarKvarIFonstret: number | null
  beslutsfonsterDagar: number
  dagarKvarTillBeslut: number | null
  onboardingKlar: boolean
}

export default function MinGarantiPage() {
  const business = useBusiness()
  const { user, loading, isOwnerOrAdmin } = useCurrentUser()
  const [data, setData] = useState<Svar | null>(null)
  const [fel, setFel] = useState('')

  const hamta = useCallback(async () => {
    setFel('')
    try {
      const res = await fetch('/api/min-garanti')
      if (res.status === 403) { setFel('Bara ägare och administratör ser firmans villkor.'); return }
      if (!res.ok) { setFel('Kunde inte läsa din användning just nu.'); return }
      setData(await res.json())
    } catch {
      setFel('Kunde inte läsa din användning just nu.')
    }
  }, [business.business_id, user?.user_id])

  useEffect(() => { if (!loading && isOwnerOrAdmin) void hamta() }, [loading, isOwnerOrAdmin, hamta])

  if (loading) return <p role="status" className="p-6">Hämtar din användning…</p>
  if (!isOwnerOrAdmin) return <p role="alert" className="p-6">Bara ägare och administratör ser firmans villkor.</p>

  return (
    <main key={business.business_id} className="mx-auto max-w-2xl px-4 py-6 pb-28">
      <a href="/dashboard" className="mb-4 inline-flex min-h-[44px] items-center text-sm text-teal-800 underline">Till Översikt</a>
      <h1 className="font-heading text-2xl font-semibold text-slate-900">Din användning</h1>
      <p className="mt-2 text-slate-600">
        Så här många av de åtta ytorna har du använt sedan du kom igång. {data ? `${data.troskel} av ${data.totalt}` : 'Fyra av åtta'} är
        tröskeln i grundarerbjudandets användningsvillkor.
      </p>

      {fel ? <p role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">{fel}</p> : null}

      {data && !data.onboardingKlar ? (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-slate-600">
          Räkningen börjar när du gått igenom starten. Inget är försenat — fönstret har inte börjat.
        </p>
      ) : null}

      {data && data.onboardingKlar ? (
        <>
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-baseline gap-3">
              <span className="font-heading tabular-nums text-4xl font-bold text-slate-900">{data.antal}</span>
              <span className="text-slate-500">av {data.totalt} ytor</span>
              {data.uppfyllt ? (
                <span className="ml-auto rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">Villkoret uppfyllt</span>
              ) : (
                <span className="ml-auto rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800">{Math.max(0, data.troskel - data.antal)} kvar till tröskeln</span>
              )}
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {data.fonsterKlart
                ? `De ${data.fonsterDagar} första dagarna har passerat. Det här är ditt slutliga utfall.`
                : data.dagarKvarIFonstret === null
                  ? 'Fönstret har inte börjat.'
                  : `Dag ${data.dag} av ${data.fonsterDagar}. ${data.dagarKvarIFonstret} ${data.dagarKvarIFonstret === 1 ? 'dag' : 'dagar'} kvar att hinna använda fler ytor.`}
            </p>
            {data.dagarKvarTillBeslut !== null ? (
              <p className="mt-1 text-sm text-slate-500">
                {data.dagarKvarTillBeslut > 0
                  ? `Du har ${data.dagarKvarTillBeslut} ${data.dagarKvarTillBeslut === 1 ? 'dag' : 'dagar'} kvar att bestämma dig, räknat från starten.`
                  : 'Beslutsfönstret har stängt.'}
              </p>
            ) : null}
          </div>

          <ul className="mt-4 space-y-2">
            {data.ytor.map(y => (
              <li key={y.nyckel} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <span aria-hidden="true" className={y.klar ? 'text-emerald-600' : 'text-slate-300'}>{y.klar ? '●' : '○'}</span>
                <span className={y.klar ? 'text-slate-900' : 'text-slate-500'}>{y.etikett}</span>
                <span className="ml-auto text-sm text-slate-400">{y.klar ? 'Använd' : 'Inte använd än'}</span>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-xs text-slate-500">
            Det är samma räkning vi själva ser. Ser något fel ut, säg till — då är det räkningen vi rättar, inte din siffra.
          </p>
        </>
      ) : null}
    </main>
  )
}
