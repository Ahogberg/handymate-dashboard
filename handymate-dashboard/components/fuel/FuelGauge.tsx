'use client'

/**
 * Delad SVG-ringmätare — 150px på Bränslets hemvist (Inställningar), 20px
 * som mini-version i JarvisHome:s varningskort. Ren SVG, ingen extern
 * gauge-lib (finns ingen i repot sedan tidigare).
 */
export function FuelGauge({
  remainingPercent,
  size = 150,
  strokeWidth,
  showLabel = true,
}: {
  remainingPercent: number
  size?: number
  strokeWidth?: number
  showLabel?: boolean
}) {
  const sw = strokeWidth ?? Math.max(4, Math.round(size * 0.08))
  const r = (size - sw) / 2
  const circumference = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, remainingPercent))
  const offset = circumference * (1 - clamped / 100)

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={r}
          className="text-slate-100" stroke="currentColor" strokeWidth={sw} fill="none"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          className="text-primary-600" stroke="currentColor" strokeWidth={sw} fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-slate-900">{clamped}%</span>
          <span className="text-xs text-slate-400">kvar</span>
        </div>
      )}
    </div>
  )
}
