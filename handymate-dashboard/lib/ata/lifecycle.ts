/**
 * ÄTA:ns livscykel — EN övergångsmatris, alla dörrar
 * (2026-08-09, projektauditen P1-6).
 *
 * ═══ VARFÖR ═══
 *
 * Två rutter skrev ÄTA-status med olika regler: /api/ata/[id] hade en
 * övergångsmatris, medan /api/projects/[id]/changes PUT accepterade VILKEN
 * status som helst och redigerade belopp/typ i vilket läge som helst — även
 * efter att kunden signerat. En signerad ÄTA vars belopp kan skrivas om är
 * samma felklass som den olåsta accepterade offerten: kundens underskrift
 * sitter på ett dokument som inte längre finns.
 *
 * Matrisen bodde inline i den ena rutten. Nu bor den här, och båda rutterna
 * frågar den. Facit (tests/ata-livscykeln.spec.ts) korsläser rutterna så en
 * tredje maskin inte kan uppstå obemärkt.
 *
 * ═══ PRINCIPERNA ═══
 *
 *   - invoiced är en ÄNDSTATION. Vägen ur en felaktig fakturering går via
 *     kreditering, aldrig via att ÄTA:n "avfaktureras".
 *   - signed/declined sätts av KUNDEN (signeringsvägen) — hantverkaren kan
 *     efterregistrera ett godkännande (signed → approved är ett bokförings-
 *     steg, inte en åsiktsändring) men aldrig ta tillbaka kundens beslut.
 *   - Innehåll (belopp, rader, typ) får bara ändras i draft/pending. Efter
 *     det är dokumentet låst; ändringar är en NY ÄTA.
 */

export const ATA_STATUSES = [
  'draft', 'pending', 'sent', 'approved', 'rejected', 'signed', 'declined', 'invoiced',
] as const

export type AtaStatus = (typeof ATA_STATUSES)[number]

/** Övergångsmatrisen — flyttad ordagrant från /api/ata/[id]. */
export const ATA_TRANSITIONS: Record<AtaStatus, readonly AtaStatus[]> = {
  draft: ['pending', 'sent'],
  pending: ['approved', 'rejected', 'sent'],
  sent: ['approved', 'rejected', 'signed', 'declined'],
  approved: ['invoiced'],
  signed: ['approved', 'invoiced'],
  // Ändstationer. rejected/declined kan återuppstå som NY ÄTA, aldrig muteras.
  rejected: [],
  declined: [],
  invoiced: [],
}

/** Får ÄTA:n gå från `from` till `to`? Okänd status failar stängt. */
export function canTransitionAta(from: string | null | undefined, to: string): boolean {
  if (!from || !(from in ATA_TRANSITIONS)) return false
  return (ATA_TRANSITIONS[from as AtaStatus] as readonly string[]).includes(to)
}

/** Får innehållet (belopp, rader, typ, beskrivning) fortfarande ändras? */
export function isAtaEditable(status: string | null | undefined): boolean {
  return status === 'draft' || status === 'pending'
}

/**
 * Statusar som räknas som avtalade i projektekonomin (kunden/hantverkaren
 * har sagt ja) — EN sanning i stället för tre spridda definitioner
 * (projektauditen 2026-09-02): /api/projects/[id] räknade bara 'approved',
 * compute-economics.ts räknade signed/invoiced, fakturavägarna approved|signed.
 */
export const ATA_AVTALADE_STATUSAR = ['approved', 'signed', 'invoiced'] as const

/** Statusar som får hämtas in på en faktura (ännu inte fakturerade). */
export const ATA_FAKTURERBARA_STATUSAR = ['approved', 'signed'] as const

/** Räknas ÄTA:n som avtalad i projektekonomin? */
export function arAvtaladAta(status: string | null | undefined): boolean {
  return !!status && (ATA_AVTALADE_STATUSAR as readonly string[]).includes(status)
}

/** Svenskt besked när övergången nekas — landar i hantverkarens gränssnitt. */
export function ataTransitionError(from: string | null | undefined, to: string): string {
  if (from === 'invoiced') {
    return 'ÄTA:n är fakturerad och kan inte ändras. Blev det fel — kreditera fakturan och skapa en ny ÄTA.'
  }
  if (from === 'signed' || from === 'declined') {
    return `Kunden har redan ${from === 'signed' ? 'signerat' : 'tackat nej till'} den här ÄTA:n. Kundens beslut kan inte skrivas om — skapa en ny ÄTA i stället.`
  }
  return `Kan inte gå från '${from ?? 'okänd'}' till '${to}'`
}
