/**
 * Deterministisk projektmatchning av en Fortnox-leverantörsfaktura (2026-08-26).
 * REN — ingen DB.
 *
 * Ordning (första träff vinner; en osäker träff är ingen träff):
 *   1. fortnox_project   Fortnox-fältet Project = vårt projektnummer
 *                        (siffrorna jämförs: "1042" ↔ "P-1042"). Fakturan är
 *                        KONTERAD på projektet i Fortnox — så säkert det blir.
 *   2. row_project       Alla rader konterade på samma projekt. Blandade
 *                        rader = delad faktura → ingen automatisk koppling
 *                        (det är en allokering, inte en matchning).
 *   3. reference         Littrat: "P-1042" i Er referens / Vår referens /
 *                        kommentar. Kräver EXAKT ett projekt som matchar —
 *                        två kandidater ger ingen koppling.
 *   4. null              → Karins matchningskö (historikförslag) som idag.
 *
 * Projektnummer i Handymate är "P-1001"-formen (lib/numbering.ts); siffror
 * med minst tre tecken krävs så ett "P-1" i löptext inte matchar något.
 */

export interface SupplierInvoiceMatchInput {
  Project?: string | null
  CostCenter?: string | null
  YourReference?: string | null
  OurReference?: string | null
  Comments?: string | null
  ExternalInvoiceNumber?: string | null
  SupplierInvoiceRows?: Array<{ Project?: string | null }> | null
}

export interface ProjectRef {
  project_id: string
  project_number: string | null
  /** ProjectNumber i Fortnox (v172) — exakt nyckel, vinner över sifferjämförelsen. */
  fortnox_project_number?: string | null
}

export type SupplierInvoiceMatchSource = 'fortnox_project' | 'row_project' | 'reference'

export interface SupplierInvoiceMatch {
  project_id: string
  source: SupplierInvoiceMatchSource
  /** Vad som matchade — visas för ägaren ("konterad på 1042 i Fortnox"). */
  evidence: string
}

/** "P-1042" / "1042" / " P 1042 " → "1042". Kräver ≥3 siffror, annars null. */
export function projectDigits(value: string | null | undefined): string | null {
  if (!value) return null
  const digits = String(value).replace(/\D/g, '')
  return digits.length >= 3 ? digits : null
}

/** Projektnummer i löptext: P-1042, P1042, P 1042 (3–6 siffror). */
export function extractReferenceProjectNumbers(text: string | null | undefined): string[] {
  if (!text) return []
  const found = new Set<string>()
  const re = /\bP[-\s]?(\d{3,6})\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) found.add(m[1])
  return Array.from(found)
}

function byDigits(projects: ProjectRef[]): Map<string, ProjectRef[]> {
  const map = new Map<string, ProjectRef[]>()
  for (const p of projects) {
    const d = projectDigits(p.project_number)
    if (!d) continue
    const list = map.get(d) || []
    list.push(p)
    map.set(d, list)
  }
  return map
}

export function matchSupplierInvoiceToProject(
  detail: SupplierInvoiceMatchInput,
  projects: ProjectRef[],
): SupplierInvoiceMatch | null {
  const index = byDigits(projects)
  const unique = (digits: string | null): ProjectRef | null => {
    if (!digits) return null
    const list = index.get(digits)
    return list && list.length === 1 ? list[0] : null
  }

  // 1. Konterad på projekt i Fortnox — exakt Fortnox-nummer först (v172),
  //    sedan sifferjämförelsen mot vårt projektnummer.
  const fortnoxNo = (detail.Project || '').trim()
  const exact = fortnoxNo ? projects.filter(p => (p.fortnox_project_number || '').trim() === fortnoxNo) : []
  if (exact.length === 1) {
    return { project_id: exact[0].project_id, source: 'fortnox_project', evidence: `Konterad på projekt ${fortnoxNo} i Fortnox` }
  }
  const headProject = exact.length === 0 ? unique(projectDigits(detail.Project)) : null
  if (headProject) {
    return { project_id: headProject.project_id, source: 'fortnox_project', evidence: `Konterad på projekt ${detail.Project} i Fortnox` }
  }

  // 2. Alla rader på samma projekt
  const rowDigits = (detail.SupplierInvoiceRows || [])
    .map(r => projectDigits(r.Project))
    .filter((d): d is string => !!d)
  if (rowDigits.length > 0) {
    const distinct = Array.from(new Set(rowDigits))
    if (distinct.length === 1) {
      const p = unique(distinct[0])
      if (p) return { project_id: p.project_id, source: 'row_project', evidence: `Alla rader konterade på projekt ${distinct[0]} i Fortnox` }
    }
    // Blandade rader = delad faktura → ingen automatisk koppling.
    return null
  }

  // 3. Littrat i referens/kommentar
  const refText = [detail.YourReference, detail.OurReference, detail.Comments, detail.ExternalInvoiceNumber]
    .filter(Boolean)
    .join(' | ')
  const candidates = extractReferenceProjectNumbers(refText)
    .map(d => unique(d))
    .filter((p): p is ProjectRef => !!p)
  const distinctIds = Array.from(new Set(candidates.map(p => p.project_id)))
  if (distinctIds.length === 1) {
    const p = candidates[0]
    return { project_id: p.project_id, source: 'reference', evidence: `Märkning "${p.project_number}" i fakturans referens` }
  }

  return null
}
