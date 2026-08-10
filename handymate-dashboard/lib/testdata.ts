/**
 * Testdata-filter — E2E-rader når aldrig hemskärmen.
 *
 * ═══ VARFÖR ═══
 *
 * Debug-flödena (app/api/debug/e2e-quote, e2e-invoice) och push-testet
 * (app/api/push/test-approval) skriver riktiga rader i riktiga tabeller —
 * det är poängen med dem. Men raderna flödar sedan in i pending_approvals
 * och business_knowledge och dyker upp på hemskärmen som om de vore
 * riktiga kunder och riktiga pengar (bevisat i ägarens skärmdump).
 *
 * Filtret ligger vid LÄSNING (fångar rader som redan finns i prod) och hos
 * PRODUCENTERNA (hindrar nya kort). Befintliga e2e-rader göms — de raderas
 * eller avförs aldrig härifrån; DB-direktläsare ser dem fortfarande.
 *
 * ═══ MÖNSTREN ═══
 *
 * Id:n: producenterna prefixar alltid — 'test_' + Date.now(),
 * 'e2e_' + Date.now(), 'e2e_inv_' + Date.now(), 'test_project_001'.
 * Prefixtestet täcker alla fyra.
 *
 * Namn/texter: SKIFTLÄGESKÄNSLIGT 'E2E' eller 'Testkund'. Gemena 'test'
 * matchas medvetet aldrig — det hade träffat "Protestera Bygg AB" och
 * "Attesterad tid". En riktig kund som råkar heta något med versalt E2E
 * finns inte; en som heter Testkund har större problem än filtret.
 *
 * Rena predikat — facit + källskanningar i tests/testdata-filter.spec.ts
 * låser kopplingen till producentmönstren åt båda håll.
 */

const TEST_ID_PREFIX = /^(test_|e2e_)/

/** Är strängen ett id från en testproducent? Täcker även 'e2e_inv_'. */
export function arTestId(id: unknown): boolean {
  return typeof id === 'string' && TEST_ID_PREFIX.test(id)
}

/** Bär texten ett testnamn? Versalkänsligt med flit — se filhuvudet. */
export function arTestNamn(text: unknown): boolean {
  if (typeof text !== 'string') return false
  return text.includes('E2E') || text.includes('Testkund')
}

/** De payload-fält producenterna faktiskt fyller med test-id:n. */
const PAYLOAD_ID_FALT = ['customer_id', 'quote_id', 'invoice_id', 'project_id'] as const

export interface TestbarApproval {
  title?: string | null
  description?: string | null
  payload?: Record<string, unknown> | null
}

/** Är pending_approvals-raden skapad av ett testflöde? */
export function arTestdataApproval(a: TestbarApproval): boolean {
  if (arTestNamn(a.title) || arTestNamn(a.description)) return true
  const p = a.payload
  if (!p || typeof p !== 'object') return false
  if (arTestNamn(p.customer_name) || arTestNamn(p.project_name)) return true
  return PAYLOAD_ID_FALT.some(falt => arTestId(p[falt]))
}

export interface TestbarObservation {
  title?: string | null
  observation?: string | null
  suggestion?: string | null
  data_basis?: Record<string, unknown> | null
}

/** Är business_knowledge-raden härledd ur testdata? */
export function arTestdataObservation(o: TestbarObservation): boolean {
  if (arTestNamn(o.title) || arTestNamn(o.observation) || arTestNamn(o.suggestion)) return true
  const d = o.data_basis
  if (!d || typeof d !== 'object') return false
  return PAYLOAD_ID_FALT.some(falt => arTestId(d[falt]))
}
