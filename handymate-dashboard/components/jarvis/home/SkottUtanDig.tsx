'use client'

import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { AGENT_INFO } from '@/components/dashboard/agentPersonas'

/**
 * "Skött utan dig sedan i går" — dygnsdigesten lyft ur sin hopfällda
 * undanskymdhet (Etapp C3, 2026-08-17).
 *
 * Tidigare låg HELA digesten bakom en kollapsad rad ("Senaste dygnet ·
 * N händelser") — bevisen på det autonoma arbetet var gömda. Nu visas de
 * AUTOMATISKA raderna (auto-flaggan ur /api/automations/activity, som
 * redan skiljer autonomt från användargodkänt) som mockupens
 * tvåkolumns-checklista direkt, kapade till ~4 hopfällt.
 *
 * "Visa alla {N}" fäller ut den FULLSTÄNDIGA listan — samma rader, med
 * klockslag, agentfärgad prick och Automatiskt/Godkänt av dig-märkena.
 * EN sanning: de användargodkända raderna renderas bara i den utfällda
 * listan, aldrig som en andra kopia.
 *
 * Datat är exakt samma dygnsRader som förut (byggDygnsdigest +
 * executeSends färska rader, byggda i JarvisHome) — ingen ny hämtning,
 * inga nya grindar. Fönstret är ett RULLANDE dygn
 * (lib/jarvis/dygnsdigest.ts), därav "sedan i går".
 */

export interface SkottRad {
  key: string
  time: string
  agent: string
  text: string
  auto: boolean
  fresh?: boolean
}

const MAX_HOPFALLDA = 4

export function SkottUtanDig({ rader }: { rader: SkottRad[] }) {
  const [open, setOpen] = useState(false)
  if (rader.length === 0) return null

  const auto = rader.filter(r => r.auto)
  const godkanda = rader.length - auto.length

  return (
    <section className="mb-2.5 bg-white border border-slate-200 rounded-card p-4">
      <div className="flex items-baseline gap-2 mb-1">
        <h3 className="m-0 font-heading text-[15px] font-semibold text-slate-900 flex-1 min-w-0">
          Skött utan dig sedan i går
        </h3>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-primary-700 hover:text-primary-800 shrink-0 min-h-[32px] transition-colors"
        >
          Visa alla {rader.length}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      <p className="m-0 mb-2.5 text-xs text-slate-400">
        {auto.length} automatiskt · {godkanda} godkänd{godkanda === 1 ? '' : 'a'} av dig
      </p>

      {auto.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {auto.slice(0, MAX_HOPFALLDA).map(r => (
            <div key={r.key} className="flex gap-2.5 items-baseline text-[13px] text-slate-700">
              <span className="w-[7px] h-[7px] rounded-full bg-emerald-500 shrink-0 relative top-[1px]" aria-hidden />
              <span className="min-w-0">{r.text}</span>
            </div>
          ))}
        </div>
      )}

      {open && (
        <ul className="mt-3 -mx-4 -mb-4 border-t border-slate-100 divide-y divide-slate-50 list-none p-0">
          {rader.map(r => (
            <li key={r.key} className={`flex items-center gap-2.5 px-4 py-2.5 ${r.fresh ? 'bg-primary-50/50' : ''}`}>
              <span className="font-mono text-[11px] text-slate-400 w-10 shrink-0">{r.time}</span>
              {/* Agentfärgad prick — persona-färgen är den enda tillåtna
                  icke-teal-accenten, och pricken pekar ut VEM utan att en
                  avatarkolumn tar plats i listan. */}
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: AGENT_INFO[r.agent]?.dot || '#94a3b8' }}
                aria-hidden
              />
              <span className="flex-1 min-w-0 text-[13px] text-slate-600 truncate">{r.text}</span>
              {/* Bocken är reserverad för mänskliga beslut. Maskinens
                  eget arbete får ett eget, neutralt märke. */}
              {r.auto ? (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 shrink-0">
                  Automatiskt
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary-700 bg-primary-50 rounded-full px-2 py-0.5 shrink-0">
                  <Check className="w-3 h-3" /> Godkänt av dig
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
