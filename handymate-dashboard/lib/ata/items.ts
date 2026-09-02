/**
 * ÄTA-radernas form — EN normalisering, i stället för att varje ställe
 * (skapande, PATCH, PDF, portal) gissar på egen hand vad en rad heter.
 *
 * ═══ VARFÖR ═══
 *
 * ÄTA-formuläret krävde tidigare inte ett namn på raden — bara en
 * beskrivning. Rader sparades då nycklade på `description`, inte `name`.
 * UI:t som filtrerar på `item.name` (ChangeModal `validItems`) tappar den
 * raden helt — totalen visas som 0 fast raden har ett pris (prod:
 * biz_0lovw5vcwzqn har tre ÄTA med rader som blev namnlösa i UI:t).
 * `normaliseraAtaRader` gör name/description-vägen till EN plats.
 */

export interface AtaRad {
  name: string
  description?: string
  quantity: number
  unit: string
  unit_price: number
  is_rot_eligible?: boolean
  /**
   * Bevaras oförändrade: fakturamotorn (`lib/invoices/project-invoice-draft.ts`)
   * läser `rot_rut_type`/`is_rut_eligible`/`type` när ÄTA:n hämtas in på
   * slutfakturan. Att tappa dem här skulle tyst döda ROT/RUT-avdraget på
   * fakturan (TD-26-klassen).
   */
  rot_rut_type?: 'rot' | 'rut' | null
  is_rut_eligible?: boolean
  type?: string
  total?: number
}

/** Är värdet ett objekt (inte null, inte array)? */
function arObjekt(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Städa ett tal — accepterar number eller numerisk sträng, annars 0. */
function tillTal(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return 0
}

/**
 * Normalisera rå ÄTA-rader (JSONB från `project_change.items`, eller body
 * från ett formulär) till en konsekvent form. Rader utan namn OCH utan
 * beskrivning, eller helt ogiltiga poster, faller bort tyst — de kan inte
 * visas för någon ändå.
 */
export function normaliseraAtaRader(raw: unknown): AtaRad[] {
  if (!Array.isArray(raw)) return []

  const rader: AtaRad[] = []
  for (const post of raw) {
    if (!arObjekt(post)) continue

    const namn = typeof post.name === 'string' && post.name.trim() !== ''
      ? post.name.trim()
      : typeof post.description === 'string' && post.description.trim() !== ''
        ? post.description.trim()
        : ''
    if (!namn) continue

    const quantity = tillTal(post.quantity) || 1
    const unit_price = tillTal(post.unit_price)
    const unit = typeof post.unit === 'string' && post.unit.trim() !== '' ? post.unit.trim() : 'st'

    const rad: AtaRad = {
      name: namn,
      quantity,
      unit,
      unit_price,
    }
    if (typeof post.description === 'string' && post.description.trim() !== '') {
      rad.description = post.description.trim()
    }
    if (typeof post.is_rot_eligible === 'boolean') {
      rad.is_rot_eligible = post.is_rot_eligible
    }
    if (post.rot_rut_type === 'rot' || post.rot_rut_type === 'rut') {
      rad.rot_rut_type = post.rot_rut_type
    }
    if (typeof post.is_rut_eligible === 'boolean') {
      rad.is_rut_eligible = post.is_rut_eligible
    }
    if (typeof post.type === 'string' && post.type.trim() !== '') {
      rad.type = post.type.trim()
    }
    rad.total = quantity * unit_price

    rader.push(rad)
  }
  return rader
}

/** Radens visningsnamn — name, annars description, annars 'Arbete'. */
export function ataRadNamn(item: { name?: string | null; description?: string | null } | null | undefined): string {
  if (!item) return 'Arbete'
  if (item.name && item.name.trim() !== '') return item.name.trim()
  if (item.description && item.description.trim() !== '') return item.description.trim()
  return 'Arbete'
}

/**
 * Finns det en rad med pris men utan namn (varken `name` eller
 * `description`)? Används för att varna i redigeringsläget INNAN raden
 * normaliseras bort tyst.
 */
export function harNamnlosRadMedPris(items: unknown): boolean {
  if (!Array.isArray(items)) return false
  return items.some(post => {
    if (!arObjekt(post)) return false
    const namn = (typeof post.name === 'string' && post.name.trim() !== '')
      || (typeof post.description === 'string' && post.description.trim() !== '')
    const harPris = tillTal(post.unit_price) !== 0 || tillTal(post.quantity) !== 0
    return !namn && harPris
  })
}
