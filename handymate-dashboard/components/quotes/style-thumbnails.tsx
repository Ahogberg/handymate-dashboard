'use client'

import type { TemplateStyle } from '@/lib/quote-templates/meta'

/**
 * Delade A4-tumnaglar för offertstilarna (Modern/Premium/Friendly).
 *
 * ETAPP 1b (offert-masterplan.md): extraherad ur
 * app/dashboard/settings/quote-style/page.tsx (bästa befintliga mönstret —
 * visuella miniatyrer av dokumentet, inte textknappar) så samma
 * tumnagel-ritning kan återanvändas av QuoteStylePicker.tsx (offert-
 * skaparen/redigeraren) UTAN duplicering. Settings-sidan importerar nu
 * härifrån.
 */

export function DualThumbnail({
  style,
  bg,
  accent,
}: {
  style: TemplateStyle
  bg: string
  accent: string
}) {
  return (
    <div className="grid grid-cols-2 gap-1 p-1 bg-gray-50">
      <MiniDoc style={style} bg={bg} accent={accent} kind="quote" />
      <MiniDoc style={style} bg={bg} accent={accent} kind="invoice" />
    </div>
  )
}

export function MiniDoc({
  style,
  bg,
  accent,
  kind,
}: {
  style: TemplateStyle
  bg: string
  accent: string
  kind: 'quote' | 'invoice'
}) {
  const label = kind === 'quote' ? 'OFFERT' : 'FAKTURA'

  if (style === 'modern') {
    return (
      <div className="aspect-[210/297] p-2.5 flex flex-col gap-1.5 rounded-sm" style={{ background: bg }}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ background: accent }} />
            <div className="h-1 w-7 bg-gray-300 rounded" />
          </div>
          <div className="text-right">
            <div className="text-[5px] font-bold text-gray-400 leading-none">{label}</div>
            {kind === 'invoice' && (
              <div className="inline-block mt-0.5 px-1 py-px text-[5px] font-bold leading-none rounded-full" style={{ background: '#FEE2E2', color: '#DC2626' }}>SEN</div>
            )}
          </div>
        </div>
        <div className="h-px w-full" style={{ background: accent }} />
        <div className="space-y-0.5">
          <div className="h-1 w-3/4 bg-gray-200 rounded" />
          <div className="h-1 w-2/3 bg-gray-200 rounded" />
          <div className="h-1 w-1/2 bg-gray-200 rounded" />
        </div>
        <div className="mt-auto flex justify-end">
          <div className="h-2 w-10 rounded" style={{ background: accent }} />
        </div>
      </div>
    )
  }

  if (style === 'premium') {
    return (
      <div className="aspect-[210/297] p-2 flex flex-col gap-1 rounded-sm" style={{ background: bg }}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 border border-white/40 rounded-sm" />
            <div className="h-1 w-7 bg-white/30 rounded" />
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <div className="h-1 w-7 rounded" style={{ background: accent }} />
            {kind === 'invoice' && (
              <div className="inline-block px-1 text-[4.5px] font-bold leading-none border" style={{ borderColor: '#EF4444', color: '#FCA5A5', background: 'rgba(239,68,68,0.12)', letterSpacing: '0.1em' }}>SEN</div>
            )}
          </div>
        </div>
        <div className="mt-1">
          <div className="h-4 w-12 rounded" style={{ background: 'rgba(255,255,255,0.15)' }} />
          <div className="h-1 w-10 mt-1 rounded" style={{ background: accent }} />
        </div>
        <div className="mt-auto bg-white/95 rounded p-1 space-y-0.5">
          <div className="h-1 w-3/4 bg-gray-200 rounded" />
          <div className="h-1 w-2/3 bg-gray-200 rounded" />
        </div>
      </div>
    )
  }

  // friendly
  const accentDark = darken(accent, 0.2)
  return (
    <div className="aspect-[210/297] p-1.5 flex flex-col gap-1 rounded-sm" style={{ background: bg }}>
      <div
        className="rounded-md p-1.5 flex items-center justify-between text-white"
        style={{ background: `linear-gradient(135deg, ${accent}, ${accentDark})` }}
      >
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-white/20" />
          <div className="h-1 w-7 bg-white/40 rounded" />
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <div className="h-1 w-7 bg-white/40 rounded" />
          {kind === 'invoice' && (
            <div className="inline-block px-1 text-[4.5px] font-bold leading-none rounded-full" style={{ background: '#FEE2E2', color: '#991B1B' }}>SEN</div>
          )}
        </div>
      </div>
      <div className="bg-white rounded-md p-1 space-y-0.5">
        <div className="h-1 w-2/3 bg-gray-200 rounded" />
        <div className="h-1 w-1/2 bg-gray-200 rounded" />
      </div>
      <div className="mt-auto bg-white rounded-md p-1 flex items-center justify-between">
        <div className="h-1 w-7 bg-gray-200 rounded" />
        <div className="h-2 w-9 rounded" style={{ background: accent }} />
      </div>
    </div>
  )
}

export function darken(hex: string, amount: number): string {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i)
  if (!m) return hex
  const r = parseInt(m[1].substring(0, 2), 16)
  const g = parseInt(m[1].substring(2, 4), 16)
  const b = parseInt(m[1].substring(4, 6), 16)
  const dark = (c: number) => Math.round(c * (1 - amount))
  return `#${dark(r).toString(16).padStart(2, '0')}${dark(g).toString(16).padStart(2, '0')}${dark(b).toString(16).padStart(2, '0')}`
}
