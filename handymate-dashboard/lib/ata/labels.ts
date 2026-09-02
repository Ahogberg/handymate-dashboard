/**
 * ÄTA-etiketter — svenska texter för status och typ, EN sanning.
 *
 * ═══ VARFÖR ═══
 *
 * Kunden i portalen såg tidigare rå engelsk status ('sent', 'signed', …)
 * utan rader/moms/ROT. Hantverkarens vy och kundens vy behöver dessutom
 * OLIKA ord för samma status — kunden bryr sig inte om att en ÄTA är
 * 'approved' internt, hen vill veta att den är "Godkänd". Två separata
 * kartor i stället för en delad, så ordvalet kan skilja sig utan att
 * någon glömmer att uppdatera den andra.
 *
 * `ATA_STATUSES` (lib/ata/lifecycle.ts) är sanningen för vilka statusar
 * som finns — facit (tests/ata-dokumentet.spec.ts) kräver att båda
 * etikettkartorna täcker alla åtta.
 */

import type { AtaStatus } from './lifecycle'

/** Hantverkarens vy — statustexter i dashboarden. */
export const ATA_STATUS_LABELS: Record<AtaStatus, string> = {
  draft: 'Utkast',
  pending: 'Väntar',
  sent: 'Skickad',
  approved: 'Godkänd',
  rejected: 'Avvisad',
  signed: 'Signerad',
  declined: 'Nekad',
  invoiced: 'Fakturerad',
}

/** Kundens vy — statustexter i portalen/PDF:en, andra ord för samma status. */
export const ATA_KUND_STATUS_LABELS: Record<AtaStatus, string> = {
  draft: 'Förslag',
  pending: 'Förslag',
  sent: 'Att signera',
  approved: 'Godkänd',
  rejected: 'Förslag',
  signed: 'Signerad av dig',
  declined: 'Du tackade nej',
  invoiced: 'Fakturerad',
}

/**
 * change_type — de tre typer som faktiskt förekommer i kodbasen (page.tsx
 * ChangeModal, PortalProjectDetail.tsx): addition/change/removal. "deduction"
 * finns inte i schemat, bara removal.
 */
export const ATA_TYP_LABELS: Record<string, string> = {
  addition: 'Tillägg',
  change: 'Ändring',
  removal: 'Avgående',
}

/** Statuslabel med fallback på råsträngen för okänd/null status. */
export function ataStatusLabel(status: string | null | undefined): string {
  if (status && status in ATA_STATUS_LABELS) {
    return ATA_STATUS_LABELS[status as AtaStatus]
  }
  return status ?? 'Okänd'
}

/** Kundens statuslabel med fallback på råsträngen för okänd/null status. */
export function ataKundStatusLabel(status: string | null | undefined): string {
  if (status && status in ATA_KUND_STATUS_LABELS) {
    return ATA_KUND_STATUS_LABELS[status as AtaStatus]
  }
  return status ?? 'Förslag'
}

/** Typlabel med fallback på råsträngen för okänd/null typ. */
export function ataTypLabel(changeType: string | null | undefined): string {
  if (changeType && changeType in ATA_TYP_LABELS) {
    return ATA_TYP_LABELS[changeType]
  }
  return changeType ?? 'Okänd'
}
