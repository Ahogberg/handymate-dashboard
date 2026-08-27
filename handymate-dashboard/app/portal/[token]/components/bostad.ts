import type { PortalInstallation, PortalJobbpassSummary } from '../types'

/**
 * "Min bostad" (Fastighetspasset steg 3): gruppera det som sitter i bostaden
 * och det som gjorts där per plats. Platsen är installationens adress-
 * ögonblicksbild — kunden kan ha flera fastigheter och det finns ingen
 * fastighetsentitet att luta sig mot. Ren funktion, testad i
 * tests/facit-fastighetspass-steg3.spec.ts.
 */
export interface BostadGroup {
  key: string
  /** null = ingen adress känd (visas utan rubrik) */
  label: string | null
  installations: PortalInstallation[]
  passes: PortalJobbpassSummary[]
}

export function siteLabel(i: Pick<PortalInstallation, 'site_address_line' | 'site_postal_code' | 'site_city'>): string | null {
  const rad = (i.site_address_line || '').trim()
  const ort = [i.site_postal_code, i.site_city].filter(Boolean).join(' ').trim()
  if (!rad && !ort) return null
  return [rad, ort].filter(Boolean).join(', ')
}

export function groupBostad(passes: PortalJobbpassSummary[], installations: PortalInstallation[]): BostadGroup[] {
  const groups = new Map<string, BostadGroup>()
  const ensure = (label: string | null): BostadGroup => {
    const key = label ? `plats:${label.toLowerCase()}` : 'plats:okand'
    let g = groups.get(key)
    if (!g) { g = { key, label, installations: [], passes: [] }; groups.set(key, g) }
    return g
  }
  const projectToKey = new Map<string, string>()
  for (const inst of installations) {
    const g = ensure(siteLabel(inst))
    g.installations.push(inst)
    if (inst.project_id && !projectToKey.has(inst.project_id)) projectToKey.set(inst.project_id, g.key)
  }
  for (const pass of passes) {
    const key = projectToKey.get(pass.project_id)
    const g = key ? (groups.get(key) as BostadGroup) : ensure(null)
    g.passes.push(pass)
  }
  // Grupper med adress först, den okända sist. En ensam okänd grupp får ingen rubrik.
  const out = Array.from(groups.values()).filter(g => g.installations.length > 0 || g.passes.length > 0)
  out.sort((a, b) => (a.label === null ? 1 : 0) - (b.label === null ? 1 : 0))
  return out
}

export function formatDatum(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatManad(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })
}
