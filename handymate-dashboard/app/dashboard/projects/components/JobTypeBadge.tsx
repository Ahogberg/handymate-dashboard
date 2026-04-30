'use client'

import { Briefcase, Brush, Hammer, Home, Lightbulb, Mountain, Paintbrush, Ruler, Wrench, Zap } from 'lucide-react'

export interface JobTypeMeta {
  id: string
  name: string
  slug: string
  color: string
  icon?: string | null
}

interface JobTypeBadgeProps {
  /** Slug på jobbtypen — används för lookup mot jobTypes-arrayen */
  slug: string | null | undefined
  /** Lista av business' job_types (från /api/projects-respons) */
  jobTypes: JobTypeMeta[]
  /** Storlek — sm är default */
  size?: 'sm' | 'md'
}

/**
 * Mappar slug → Lucide-ikon. Används om job_types-raden inte har en explicit
 * icon-sträng. Heuristiken känner igen vanliga svenska hantverkar-slugs.
 */
function inferIconBySlug(slug: string): React.ComponentType<{ className?: string }> {
  const s = slug.toLowerCase()
  if (s.includes('el') || s.includes('elinstal')) return Zap
  if (s.includes('vvs') || s.includes('rör')) return Wrench
  if (s.includes('mal') || s.includes('måler')) return Paintbrush
  if (s.includes('byg') || s.includes('snicker')) return Hammer
  if (s.includes('tak')) return Home
  if (s.includes('mark') || s.includes('mark_')) return Mountain
  if (s.includes('plat') || s.includes('kakel')) return Ruler
  if (s.includes('golv')) return Ruler
  if (s.includes('lampa') || s.includes('belysn')) return Lightbulb
  if (s.includes('brush')) return Brush
  return Briefcase
}

/**
 * Konverterar en hex-färg från job_types.color till bg/text/border-toner.
 * Vi använder color som accent men begränsar mättnaden via opacity och
 * separat text-färg för att undvika dålig kontrast.
 */
function buildBadgeStyle(color: string): React.CSSProperties {
  return {
    backgroundColor: `${color}14`, // ~8% opacity bakgrund
    color,
    borderColor: `${color}33`, // ~20% opacity border
  }
}

/**
 * Badge för jobbtyp på ett projekt. Visar ikon + namn med färg från
 * job_types-tabellen. Hidden om slug saknas eller inte hittas i listan.
 *
 * Designsystem-not: jobbtyp är en av de tillåtna "single-purpose accent"-
 * användningarna per docs/HANDYMATE_DESIGN_SYSTEM.md §1 (branschtyp).
 */
export function JobTypeBadge({ slug, jobTypes, size = 'sm' }: JobTypeBadgeProps) {
  if (!slug) return null
  const meta = jobTypes.find(jt => jt.slug === slug)
  if (!meta) return null

  const Icon = inferIconBySlug(meta.slug)
  const padding = size === 'md' ? 'px-2.5 py-1' : 'px-2 py-0.5'
  const text = size === 'md' ? 'text-xs' : 'text-[11px]'

  return (
    <span
      className={`inline-flex items-center gap-1 ${padding} ${text} font-semibold uppercase tracking-wider rounded-full border whitespace-nowrap`}
      style={buildBadgeStyle(meta.color)}
    >
      <Icon className="w-3 h-3" />
      {meta.name}
    </span>
  )
}
