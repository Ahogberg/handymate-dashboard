'use client'

/** En primär uppgift utifrån kontots mål och verkliga signaler.
 * Hämtas om vid fokus/återkomst. Ingen global "klar"-flagga kan gömma en
 * annan firmas start. API-fel ger ett synligt återförsök. */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { useJobbuddy } from '@/lib/JobbuddyContext'
import { useBusiness } from '@/lib/BusinessContext'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { KOM_IGANG_HEADING, visibleKomIgangTasks, type KomIgangTask } from '@/lib/onboarding/kom-igang-tasks'

const KONTO_MAX_DAGAR = 30

interface KomIgangData {
  ring_test: boolean
  forsta_artefakten: boolean
  pwa: boolean
  /** Lager 3 / B7 — saknas på ett äldre API-svar: då faller vi till de tre booleanerna. */
  tasks?: KomIgangTask[]
}

/** Fallback när rutten (ännu) inte skickar tasks — samma tre rader som förut. */
function fallbackTasks(d: KomIgangData): KomIgangTask[] {
  return [
    { key: 'ring', agent: 'lisa', label: 'Ring ditt nummer — hör Lisa fånga samtalet', varde: '', minuter: 2, href: '/dashboard/settings/phone', klar: d.ring_test },
    { key: 'daniel_quote', agent: 'daniel', label: 'Spela in ett testmöte eller skapa din första offert', varde: '', minuter: 5, href: '/dashboard/inkorg?tab=mote', klar: d.forsta_artefakten },
    { key: 'pwa', agent: 'matte', label: 'Lägg appen på hemskärmen', varde: '', minuter: 1, href: '/dashboard/help', klar: d.pwa },
  ]
}

export function KomIgangRail() {
  const business = useBusiness()
  // Remount per företag: gammal respons eller lokalt UI får inte följa med.
  return <AccountStartRail key={business.business_id} />
}

function AccountStartRail() {
  const business = useBusiness()
  const { isOpen, setPendingPrompt, setActiveTab, setIsOpen } = useJobbuddy()
  const [data, setData] = useState<KomIgangData | null>(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !isOpen) setRetry(n => n + 1)
    wasOpen.current = isOpen
  }, [isOpen])

  useEffect(() => {
    let active = true
    let latest = 0
    const controller = new AbortController()
    async function refresh() {
      const request = ++latest
      try {
        const r = await fetch('/api/onboarding/kom-igang', { signal: controller.signal, cache: 'no-store' })
        if (!r.ok) throw new Error('fel svar')
        const d = await r.json()
        if (active && request === latest) { setData(d); setFailed(false) }
      } catch {
        if (active && request === latest) { setFailed(true); setData(null) }
      }
    }
    void refresh()
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => { active = false; controller.abort(); window.removeEventListener('focus', onFocus) }
  }, [retry, business.business_id])

  const tasks = data ? (Array.isArray(data.tasks) ? data.tasks : fallbackTasks(data)) : []
  const allaKlara = data !== null && tasks.length > 0 && tasks.every(t => t.klar)

  function openMission(task: KomIgangTask) {
    setPendingPrompt(task.prompt || 'Vad är det viktigaste vi kan göra den här veckan?')
    setActiveTab('chat')
    setIsOpen(true)
  }

  const kontotsAlderDagar = business.created_at
    ? (Date.now() - new Date(business.created_at).getTime()) / 86_400_000
    : null
  // Saknas created_at (borde inte hända) — fail-safe åt "nytt konto" hellre
  // än att tyst gömma railen för alla.
  const nyttKonto = kontotsAlderDagar === null || kontotsAlderDagar < KONTO_MAX_DAGAR
  if (!nyttKonto) return null
  if (failed) return <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Kom igång">
    <p role="alert" className="text-sm text-slate-700">Kunde inte hämta nästa steg för ditt företag.</p>
    <button type="button" className="min-h-[44px] text-sm font-semibold text-teal-800" onClick={() => setRetry(n => n + 1)}>Försök igen</button>
  </section>
  if (!data || allaKlara || tasks.length === 0) return null

  const { primary, secondary } = visibleKomIgangTasks(tasks)
  if (!primary) return null
  const klaraAntal = tasks.filter(t => t.klar).length

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="m-0 text-sm font-semibold text-slate-900">{KOM_IGANG_HEADING}</h2>
        <span className="text-[11px] text-slate-400 shrink-0">{klaraAntal}/{tasks.length} klart</span>
      </div>

      <p className="text-xs text-slate-600 mb-3">Fånga förfrågningar, få iväg offerter och följ pengarna. Börja med en sak som hjälper dig nu.</p>
      {/* Primär — agenten som behöver den, värdet, tiden */}
      <TaskAction task={primary} onMission={openMission} className="block rounded-xl border border-primary-100 bg-primary-50/60 p-3 mb-2.5 group hover:border-primary-300 transition-colors">
        <div className="flex items-start gap-2.5">
          <AgentAvatar agentKey={primary.agent} size="sm" />
          <div className="min-w-0">
            <p className="m-0 text-[13px] font-semibold text-slate-900 leading-snug group-hover:text-primary-700">{primary.label}</p>
            {primary.varde && <p className="m-0 mt-1 text-xs text-slate-600 leading-snug">{primary.varde}</p>}
            <p className="m-0 mt-1.5 text-[11px] text-slate-400">~{primary.minuter} min</p>
          </div>
        </div>
      </TaskAction>

      {secondary.length > 0 && (
        <div className="flex flex-col gap-2">
          {secondary.map(u => (
            <TaskAction key={u.key} task={u} onMission={openMission} className="flex items-start gap-2.5 min-h-[44px] group">
              <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 border border-slate-300 text-transparent">
                <Check className="w-3 h-3" strokeWidth={3} />
              </span>
              <span className="text-[13px] leading-snug text-slate-700 group-hover:text-primary-700">
                {u.label} <span className="text-slate-400">· ~{u.minuter} min</span>
              </span>
            </TaskAction>
          ))}
        </div>
      )}
    </div>
  )
}

function TaskAction({ task, onMission, className, children }: {
  task: KomIgangTask; onMission: (task: KomIgangTask) => void; className: string; children: React.ReactNode
}) {
  return task.key === 'matte_mission'
    ? <button type="button" className={`${className} w-full text-left`} onClick={() => onMission(task)}>{children}</button>
    : <Link href={task.href} className={className}>{children}</Link>
}

export default KomIgangRail
