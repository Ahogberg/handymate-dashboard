/**
 * Lead-kategorier — används i portal, lead-källor och pipeline-badge.
 * Håll listan synkad med dropdown-alternativ och badge-färger.
 */

export interface LeadCategory {
  value: string
  label: string
  color: string       // Tailwind base-färg
  bgClass: string     // Tailwind bakgrundsklasser (bg + text)
  dotClass: string    // Tailwind dot-klass
}

export const LEAD_CATEGORIES: LeadCategory[] = [
  { value: 'el',           label: 'El / Elteknik',              color: 'amber',   bgClass: 'bg-amber-50 text-amber-700 border-amber-200',   dotClass: 'bg-amber-500' },
  { value: 'vvs',          label: 'VVS / Rörmokare',            color: 'blue',    bgClass: 'bg-blue-50 text-blue-700 border-blue-200',       dotClass: 'bg-blue-500' },
  { value: 'bygg',         label: 'Bygg / Snickeri',            color: 'stone',   bgClass: 'bg-stone-50 text-stone-700 border-stone-200',    dotClass: 'bg-stone-500' },
  { value: 'maleri',       label: 'Måleri',                     color: 'rose',    bgClass: 'bg-rose-50 text-rose-700 border-rose-200',       dotClass: 'bg-rose-500' },
  { value: 'tak',          label: 'Tak',                        color: 'slate',   bgClass: 'bg-slate-50 text-slate-700 border-slate-200',    dotClass: 'bg-slate-500' },
  { value: 'plattsattning',label: 'Plattsättning',              color: 'teal',    bgClass: 'bg-teal-50 text-teal-700 border-teal-200',       dotClass: 'bg-teal-500' },
  { value: 'stad',         label: 'Städ / Sanering',            color: 'emerald', bgClass: 'bg-emerald-50 text-emerald-700 border-emerald-200', dotClass: 'bg-emerald-500' },
  { value: 'brf',          label: 'BRF / Fastighetsförvaltning', color: 'purple', bgClass: 'bg-purple-50 text-purple-700 border-purple-200', dotClass: 'bg-purple-500' },
  { value: 'ovrigt',       label: 'Övrigt',                     color: 'gray',    bgClass: 'bg-gray-50 text-gray-700 border-gray-200',       dotClass: 'bg-gray-400' },
]

export function getLeadCategory(value: string | null | undefined): LeadCategory | null {
  if (!value) return null
  return LEAD_CATEGORIES.find(c => c.value === value) || null
}
