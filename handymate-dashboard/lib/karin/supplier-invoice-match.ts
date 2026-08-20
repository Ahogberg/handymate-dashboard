/**
 * Matchningsförslag för leverantörsfaktura-kön (Karins sida). Ren,
 * deterministisk funktion — ingen DB, inget nätverk. Samma idiom som
 * lib/fortnox/map-supplier-invoice.ts.
 *
 * Regel (docs/superpowers/specs/2026-08-20-leverantorsfaktura-matchningsforslag-design.md):
 * föreslå ett projekt/UE bara om leverantören kopplats till EXAKT en
 * kandidat minst 2 gånger förut, och ingen annan kandidat också har 2+
 * träffar. Annars: inget förslag. Tystnad är alltid ett giltigt utfall.
 */

export interface MatchedInvoice {
  supplier_name: string | null
  project_id: string | null
  subcontractor_id: string | null
}

export interface MatchSuggestion {
  project_id: string | null
  project_match_count: number
  subcontractor_id: string | null
  subcontractor_match_count: number
}

function topUnambiguousCandidate(ids: (string | null)[]): { id: string | null; count: number } {
  const counts = new Map<string, number>()
  for (const id of ids) {
    if (!id) continue
    counts.set(id, (counts.get(id) || 0) + 1)
  }

  const qualifying = Array.from(counts.entries()).filter(([, count]) => count >= 2)
  if (qualifying.length !== 1) {
    return { id: null, count: 0 }
  }

  const [id, count] = qualifying[0]
  return { id, count }
}

export function suggestMatch(supplierName: string, matchedInvoices: MatchedInvoice[]): MatchSuggestion {
  const sameSupplier = matchedInvoices.filter(inv => inv.supplier_name === supplierName)

  const project = topUnambiguousCandidate(sameSupplier.map(inv => inv.project_id))
  const subcontractor = topUnambiguousCandidate(sameSupplier.map(inv => inv.subcontractor_id))

  return {
    project_id: project.id,
    project_match_count: project.count,
    subcontractor_id: subcontractor.id,
    subcontractor_match_count: subcontractor.count,
  }
}
