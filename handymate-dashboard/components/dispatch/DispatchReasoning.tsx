'use client'

/**
 * Delad rendering av Lars dispatch-resonemang — "Visa varför"-utrullning,
 * Fall 4 (docs/design/SYNLIG-INTELLIGENS.md, 2026-08-13). Samma "en
 * sanning, två ytor"-mönster som GuardianOrsaker: lyft ur den tidigare
 * inline-kopian i approvals/page.tsx, monterad där (live payload, kortet
 * finns kvar) OCH i ShiftDetailSheet (sparad booking.dispatch_reasoning,
 * kortet kan vara borta för länge sedan).
 *
 * Bara skäl-chips + korta fakta, aldrig avatar/namn/jobbtitel — den
 * kontexten äger respektive yta redan själv (kön visar sin egen rad,
 * ShiftDetailSheet visar redan "Person: {namn}" ovanför).
 */

export interface DispatchReasoningData {
  reasons?: string[] | null
  score?: number | null
  alternatives?: Array<{ name: string; score?: number; reasons?: string[] }> | null
  week_utilization_pct?: number | null
  certificates?: {
    valid?: string[]
    expiring_soon?: Array<{ cert_type: string; valid_until: string }>
  } | null
}

export function DispatchReasoning({ reasons, alternatives, week_utilization_pct, certificates }: DispatchReasoningData) {
  const harNagot =
    (reasons && reasons.length > 0) ||
    typeof week_utilization_pct === 'number' ||
    (certificates?.valid?.length || certificates?.expiring_soon?.length) ||
    (alternatives && alternatives.length > 0)
  if (!harNagot) return null

  return (
    <div className="space-y-2">
      {reasons && reasons.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {reasons.map((r, i) => (
            <span key={i} className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">{r}</span>
          ))}
        </div>
      )}
      {/* R5 (tasks/resurs-masterplan.md) — beläggning + cert-data för kandidaten */}
      {typeof week_utilization_pct === 'number' && (
        <p className="text-xs text-gray-500">
          Beläggning denna vecka:{' '}
          <span className={
            week_utilization_pct < 50 ? 'text-emerald-600 font-medium'
              : week_utilization_pct < 80 ? 'text-amber-600 font-medium'
              : 'text-red-600 font-medium'
          }>{week_utilization_pct}%</span>
        </p>
      )}
      {(certificates?.valid?.length || certificates?.expiring_soon?.length) ? (
        <div className="flex flex-wrap gap-1">
          {(certificates?.valid || []).map((cert, i) => (
            <span key={`cert-${i}`} className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">{cert}</span>
          ))}
          {(certificates?.expiring_soon || []).map((cert, i) => (
            <span key={`cert-exp-${i}`} className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{cert.cert_type} går ut {cert.valid_until}</span>
          ))}
        </div>
      ) : null}
      {alternatives && alternatives.length > 0 && (
        <p className="text-[10px] text-gray-400">Alternativ: {alternatives.map(a => a.name).join(', ')}</p>
      )}
    </div>
  )
}

export default DispatchReasoning
