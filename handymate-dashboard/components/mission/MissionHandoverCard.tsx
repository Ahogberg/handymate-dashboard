/** @jsxImportSource react */
import type { MissionHandover } from '@/lib/mission/handover'
export function MissionHandoverCard({ handover, compact = false }: { handover: MissionHandover; compact?: boolean }) {
  return <section aria-label="Din överlämning till teamet" className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-slate-800">
    <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Matte håller ihop planen</p>
    <h3 className="mt-1 font-semibold">{handover.headline}</h3>
    <p className="mt-2 text-sm">{handover.nextStep}</p>
    <p className="mt-2 text-sm">{handover.pending} väntar på beslut · {handover.executed} åtgärder har bekräftat utfall{handover.unverified > 0 && ` · ${handover.unverified} behöver kontrolleras`}</p>
    {!compact && <><ul className="mt-3 space-y-2">{handover.planned.map(step => <li key={step.id} className="text-sm"><strong>{step.owner}</strong> · {step.title}<span className="block text-xs text-slate-500">Ansvar enligt planen</span></li>)}</ul>
      <p className="mt-3 text-sm">Planens tidsram: {handover.deadline}</p><p className="mt-2 text-xs text-slate-600">{handover.scope}</p></>}
  </section>
}
