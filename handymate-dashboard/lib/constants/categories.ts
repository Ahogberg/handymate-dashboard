// System quote categories — matches quote_categories table seeds

export interface SystemCategory {
  slug: string
  label: string
  rot: boolean
  rut: boolean
}

export interface CustomCategory {
  id: string
  business_id: string
  slug: string
  label: string
  rot_eligible: boolean
  rut_eligible: boolean
}

export const SYSTEM_CATEGORIES: SystemCategory[] = [
  { slug: 'arbete_el',     label: 'Arbete — El',        rot: true,  rut: false },
  { slug: 'arbete_vvs',    label: 'Arbete — VVS',       rot: true,  rut: false },
  { slug: 'arbete_bygg',   label: 'Arbete — Bygg',      rot: true,  rut: false },
  { slug: 'arbete_maleri', label: 'Arbete — Måleri',     rot: true,  rut: false },
  { slug: 'arbete_rut',    label: 'Arbete — RUT',        rot: false, rut: true  },
  { slug: 'material_el',   label: 'Material — El',       rot: false, rut: false },
  { slug: 'material_vvs',  label: 'Material — VVS',      rot: false, rut: false },
  { slug: 'material_bygg', label: 'Material — Bygg',     rot: false, rut: false },
  { slug: 'hyra',          label: 'Hyra / Maskin',       rot: false, rut: false },
  { slug: 'ue',            label: 'Underentreprenör',    rot: false, rut: false },
  { slug: 'resa',          label: 'Resekostnad',         rot: false, rut: false },
  { slug: 'ovrigt',        label: 'Övrigt',              rot: false, rut: false },
]

/**
 * Get display label for a category slug, checking custom categories as fallback.
 */
export function getCategoryLabel(slug: string, custom: CustomCategory[] = []): string {
  const system = SYSTEM_CATEGORIES.find(c => c.slug === slug)
  if (system) return system.label
  const customCat = custom.find(c => c.slug === slug)
  return customCat?.label ?? slug
}

/**
 * Get ROT/RUT eligibility for a category slug.
 */
export function getCategoryRotRut(slug: string, custom: CustomCategory[] = []): { rot: boolean; rut: boolean } {
  const system = SYSTEM_CATEGORIES.find(c => c.slug === slug)
  if (system) return { rot: system.rot, rut: system.rut }
  const customCat = custom.find(c => c.slug === slug)
  if (customCat) return { rot: customCat.rot_eligible, rut: customCat.rut_eligible }
  return { rot: false, rut: false }
}

/**
 * Merge system + custom categories into a unified list for dropdowns.
 */
export function getAllCategories(custom: CustomCategory[] = []): { slug: string; label: string; rot: boolean; rut: boolean }[] {
  const merged = SYSTEM_CATEGORIES.map(c => ({ slug: c.slug, label: c.label, rot: c.rot, rut: c.rut }))
  for (const c of custom) {
    merged.push({ slug: c.slug, label: c.label, rot: c.rot_eligible, rut: c.rut_eligible })
  }
  return merged
}
