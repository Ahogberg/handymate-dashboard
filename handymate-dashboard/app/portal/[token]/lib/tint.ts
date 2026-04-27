/**
 * Genererar Bee-paletten (--bee-50 till --bee-700) från en accent-hex.
 * Används för per-business färgtinting av portalen.
 *
 * Mönstret matchar lib/quote-templates/modern.ts + friendly.ts
 * (samma darken/mixWithWhite-helpers).
 *
 * Returnerar en CSS-variabel-objekt som kan spridas i style-prop.
 */

const BEE_DEFAULT = {
  '--bee-700': '#B45309',
  '--bee-600': '#D97706',
  '--bee-500': '#F59E0B',
  '--bee-400': '#FBBF24',
  '--bee-100': '#FEF3C7',
  '--bee-50':  '#FFFBEB',
}

export function tintFromAccent(hex: string | null | undefined): Record<string, string> {
  if (!hex) return BEE_DEFAULT

  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i)
  if (!m) return BEE_DEFAULT

  return {
    '--bee-700': darken(hex, 0.20),
    '--bee-600': darken(hex, 0.10),
    '--bee-500': hex,
    '--bee-400': lighten(hex, 0.10),
    '--bee-100': mixWithWhite(hex, 0.85),
    '--bee-50':  mixWithWhite(hex, 0.95),
  }
}

function mixWithWhite(hex: string, whitePct: number): string {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i)
  if (!m) return hex
  const r = parseInt(m[1].substring(0, 2), 16)
  const g = parseInt(m[1].substring(2, 4), 16)
  const b = parseInt(m[1].substring(4, 6), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * whitePct)
  return `#${mix(r).toString(16).padStart(2, '0')}${mix(g).toString(16).padStart(2, '0')}${mix(b).toString(16).padStart(2, '0')}`
}

function darken(hex: string, amount: number): string {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i)
  if (!m) return hex
  const r = parseInt(m[1].substring(0, 2), 16)
  const g = parseInt(m[1].substring(2, 4), 16)
  const b = parseInt(m[1].substring(4, 6), 16)
  const dark = (c: number) => Math.round(c * (1 - amount))
  return `#${dark(r).toString(16).padStart(2, '0')}${dark(g).toString(16).padStart(2, '0')}${dark(b).toString(16).padStart(2, '0')}`
}

function lighten(hex: string, amount: number): string {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i)
  if (!m) return hex
  const r = parseInt(m[1].substring(0, 2), 16)
  const g = parseInt(m[1].substring(2, 4), 16)
  const b = parseInt(m[1].substring(4, 6), 16)
  const light = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount))
  return `#${light(r).toString(16).padStart(2, '0')}${light(g).toString(16).padStart(2, '0')}${light(b).toString(16).padStart(2, '0')}`
}
