'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useBusiness } from '@/lib/BusinessContext'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import type { PlanningStartView } from '@/lib/onboarding/planning-start'

type Props = {
  step: 'team' | 'calendar'
  refreshKey?: string
  visibleWeekStart?: string
  onShowWeek?: (weekStart: string) => void
}
export function PlanningStart(props: Props) {
  const business = useBusiness()
  const { isOwnerOrAdmin } = useCurrentUser()
  const age = business.created_at ? (Date.now() - Date.parse(business.created_at)) / 86_400_000 : 0
  if (!isOwnerOrAdmin || age >= 30) return null
  return <PlanningStartCard key={`${business.business_id}:${props.step}`} {...props} />
}
function PlanningStartCard({ step, refreshKey, visibleWeekStart, onShowWeek }: Props) {
  const [data, setData] = useState<PlanningStartView | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    setSaved(false)
    let active = true
    let latest = 0
    const controller = new AbortController()
    async function refresh() {
      const sequence = ++latest
      setData(null)
      try {
        const r = await fetch('/api/onboarding/planning-start', { cache: 'no-store', signal: controller.signal })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Kunde inte läsa startsteget.')
        if (active && sequence === latest) { setData(d); setError('') }
      } catch (e) {
        if (active && sequence === latest) setError(e instanceof Error ? e.message : 'Kunde inte läsa startsteget.')
      }
    }
    void refresh()
    window.addEventListener('focus', refresh)
    return () => { active = false; controller.abort(); window.removeEventListener('focus', refresh) }
  }, [retry, refreshKey])

  async function confirm(action: 'team' | 'solo' | 'calendar') {
    if (!data || busy) return
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/onboarding/planning-start', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, revision: data.revision, weekStart: data.weekStart }) })
      const result = await r.json()
      if (!r.ok || result.saved !== true) throw new Error(result.error || 'Bekräftelsen kunde inte sparas.')
      setSaved(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'Bekräftelsen kunde inte sparas.') }
    finally { setBusy(false) }
  }
  if (!saved && data && (step === 'team' ? data.teamConfirmed : data.calendarStarted)) return null
  if (!data && !error) return null
  const correctWeek = data && visibleWeekStart === data.weekStart
  const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', timeZone: 'Europe/Stockholm' })
  return <section id="planning-start" aria-label="Kom igång med planeringen" className="rounded-2xl border border-primary-100 bg-primary-50/60 p-4 mb-4">
    <div className="flex items-start gap-3">
      <AgentAvatar agentKey="matte" size="sm" />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-slate-900">{step === 'team' ? 'Vilka jobbar i firman?' : 'Få nästa veckas planering på plats'}</h2>
        {saved ? <div role="status" className="mt-2 text-sm text-slate-700">
          <p>{step === 'team' ? 'Teamet är bekräftat. Nästa steg är att lägga in jobben och känd frånvaro.' : 'Du har bekräftat att nästa veckas kända jobb och frånvaro är inlagda.'}</p>
          <Link className="inline-block min-h-[44px] py-3 font-semibold text-primary-700" href={step === 'team' ? '/dashboard/schedule#planning-start' : '/dashboard'}>{step === 'team' ? 'Öppna schemat' : 'Till Överblick'} →</Link>
        </div> : data && <>
          {step === 'team' ? <>
            <p className="mt-1 text-sm text-slate-600">{data.memberCount} personer finns i den aktiva medlemslistan, inklusive inbjudna. Använd Bjud in för att lägga till fler. Bekräfta när alla som arbetar i firman finns med.</p>
            <button type="button" disabled={busy || data.memberCount === 0} onClick={() => confirm(data.memberCount === 1 ? 'solo' : 'team')} className="min-h-[44px] py-2 text-sm font-semibold text-primary-700 disabled:opacity-50">{busy ? 'Sparar…' : data.memberCount === 1 ? 'Jag jobbar själv' : 'Alla i teamet finns med'}</button>
          </> : !data.teamConfirmed ? <Link className="inline-block min-h-[44px] py-3 text-sm font-semibold text-primary-700" href="/dashboard/team#planning-start">Bekräfta vilka som jobbar i firman först →</Link> : <>
            <p className="mt-1 text-sm text-slate-600">{dateLabel(data.weekStart)}–{dateLabel(data.weekEnd)}: {data.jobCount} jobbposter. Lägg in alla kända jobb på rätt person och tid, samt frånvaro. Kontrollera även jobb som finns i andra kalendrar.</p>
            {data.unresolvedCount > 0 && <p className="mt-2 text-sm text-slate-700">{data.unresolvedCount} poster behöver rätt person eller fullständiga tider innan du kan bekräfta.</p>}
            {!correctWeek ? <button type="button" className="min-h-[44px] py-2 text-sm font-semibold text-primary-700" onClick={() => onShowWeek?.(data.weekStart)}>Visa veckan som ska kontrolleras →</button>
              : <button type="button" disabled={busy || data.unresolvedCount > 0} onClick={() => confirm('calendar')} className="min-h-[44px] py-2 text-left text-sm font-semibold text-primary-700 disabled:opacity-50">{busy ? 'Sparar…' : data.jobCount === 0 ? 'Jag har inga kända jobb nästa vecka och frånvaron är inlagd' : 'Alla kända jobb och frånvaro för veckan är inlagda'}</button>}
            <p className="text-xs text-slate-500">Du kan ändra planeringen när nya jobb kommer in.</p>
          </>}
        </>}
        {error && <div className="mt-2"><p role="alert" className="text-sm text-slate-700">{error}</p><button type="button" disabled={busy} className="min-h-[44px] text-sm font-semibold text-primary-700" onClick={() => setRetry(n => n + 1)}>Läs in igen</button></div>}
      </div>
    </div>
  </section>
}
