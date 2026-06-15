/**
 * Branschspecifika egenkontroll-FORMULÄR (foto + signatur + PDF-protokoll).
 *
 * Härleds från de redan curerade branschchecklistorna i checklist-defaults.ts
 * — inget innehåll uppfinns. Skillnaden mot checklistorna: dessa är riktiga
 * formulär (FormFillView) som kan signeras och exporteras som PDF, dvs ett
 * egenkontroll-protokoll att lämna till kund.
 *
 * Branschfiltreras precis som checklistorna (business_config.branch), så varje
 * företag bara ser sin branschs mallar.
 */

import { BRANCH_CHECKLISTS, type ChecklistTemplate } from './checklist-defaults'

export interface FormField {
  id: string
  type: 'header' | 'checkbox' | 'text' | 'photo' | 'signature'
  label: string
  required?: boolean
}

export interface FormTemplateSeed {
  name: string
  description: string
  category: string
  is_system: boolean
  fields: FormField[]
}

// Vilka checklist-kategorier som blir egenkontroll-protokoll. 'safety'
// hoppas över — daglig säkerhet täcks redan av den generiska systemmallen
// "Daglig säkerhetschecklist".
const EGENKONTROLL_CATEGORIES = new Set(['inspection', 'quality', 'installation'])

function checklistToForm(t: ChecklistTemplate): FormTemplateSeed {
  const fields: FormField[] = [
    { id: 'h1', type: 'header', label: t.name },
    ...t.items.map((it, i): FormField => ({
      id: `c${i + 1}`,
      type: 'checkbox',
      label: it.text,
      required: it.required,
    })),
    { id: 'note', type: 'text', label: 'Avvikelser / kommentarer', required: false },
    { id: 'photo', type: 'photo', label: 'Foto på utfört arbete', required: false },
    { id: 'sign', type: 'signature', label: 'Utförares signatur', required: true },
  ]
  return {
    name: `Egenkontroll – ${t.name}`,
    description: 'Branschanpassad egenkontroll med signatur och PDF-protokoll.',
    category: 'egenkontroll',
    is_system: true,
    fields,
  }
}

/**
 * Branschspecifika egenkontroll-formulärmallar för en given bransch.
 * Tom array om branschen saknar relevanta checklistor (då räcker de
 * generiska systemmallarna).
 */
export function getEgenkontrollFormTemplatesForBranch(branch: string): FormTemplateSeed[] {
  const templates = BRANCH_CHECKLISTS[branch] || []
  return templates
    .filter(t => EGENKONTROLL_CATEGORIES.has(t.category))
    .map(checklistToForm)
}
