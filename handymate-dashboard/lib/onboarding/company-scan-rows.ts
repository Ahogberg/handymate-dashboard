/**
 * Ren modul: raderna Company Scan bygger ur de råa talen, flyttad hit från
 * components/tour/CompanyScan.tsx (2026-09-02, tasks/plan-genomgang-fore-
 * betalning.md) så StepGenomgang (onboardingens genomgång FÖRE betalningen)
 * kan återanvända exakt samma logik som dashboardens Company Scan — utan att
 * importera en klientkomponent i onboardingflödet.
 *
 * CompanyScan.tsx re-exporterar buildScanRows härifrån oförändrat, så
 * tests/company-scan.spec.ts (som importerar från komponenten) fortsätter
 * fungera utan ändring.
 */

import type { CompanyScanResult } from '@/app/api/onboarding/company-scan/route'
import { fmt } from '@/lib/onboarding/instant-value'

export interface ScanRow {
  key: string
  text: string
  agent?: 'karin' | 'daniel' | 'lars'
}

/**
 * Bygger raderna ur de råa talen. Bara sanna rader (n>0) — funktionen är
 * ren och testbar utan React/DOM (facit-stilen, se tests/company-scan.spec.ts).
 */
export function buildScanRows(d: CompanyScanResult): ScanRow[] {
  const rows: ScanRow[] = []
  if (d.customerCount > 0) {
    rows.push({ key: 'kunder', text: `${fmt(d.customerCount)} kund${d.customerCount > 1 ? 'er' : ''} hittade` })
  }
  if (d.openInvoicesCount > 0) {
    rows.push({ key: 'fakturor', text: `${fmt(d.openInvoicesCount)} öppna faktur${d.openInvoicesCount > 1 ? 'or' : 'a'} analyserade` })
  }
  if (d.activeProjectsCount > 0) {
    rows.push({ key: 'projekt', text: `${fmt(d.activeProjectsCount)} pågående projekt identifierade` })
  }
  if (d.openQuotesCount > 0) {
    rows.push({ key: 'offerter', text: `${fmt(d.openQuotesCount)} offert${d.openQuotesCount > 1 ? 'er' : ''} hittade` })
  }
  // Karins rad är uttryckligen HENNES fynd — rutten sätter karinHeadline
  // bara när headline verkligen är Karins (förfallet/obetalt > 0), aldrig
  // Daniels/Hannas/Lisas generiska fallback under en Karin-etikett.
  if (d.karinHeadline?.amount_kr) {
    rows.push({ key: 'karin', agent: 'karin', text: `Karin hittade ${fmt(d.karinHeadline.amount_kr)} kr i utestående kundfordringar` })
  }
  if (d.staleQuotesCount > 0) {
    rows.push({ key: 'daniel', agent: 'daniel', text: `Daniel hittade ${fmt(d.staleQuotesCount)} offert${d.staleQuotesCount > 1 ? 'er' : ''} som borde följas upp` })
  }
  if (d.activeProjectsCount > 0) {
    rows.push({ key: 'lars', agent: 'lars', text: `Lars bevakar ${fmt(d.activeProjectsCount)} aktiv${d.activeProjectsCount > 1 ? 'a' : 't'} projekt` })
  }
  // Kön, sist — pekar framåt mot "Det här behöver dig idag".
  if (d.pendingApprovalsCount > 0) {
    rows.push({ key: 'ko', text: `${fmt(d.pendingApprovalsCount)} sak${d.pendingApprovalsCount > 1 ? 'er' : ''} behöver din uppmärksamhet` })
  }
  return rows
}

/**
 * Onboardingens genomgång (StepGenomgang) visar, under varje rad, en kort
 * mening om vad teamet gör med just det fyndet EFTER aktivering — aldrig ett
 * löfte om belopp eller resultat, bara vem som tar vid.
 */
export function teamGorNarDuAktiverar(row: ScanRow): string | null {
  switch (row.key) {
    case 'kunder':
      return 'Lisa svarar när de ringer och Hanna håller kontakten'
    case 'fakturor':
      return 'Karin bevakar dem och påminner när det behövs'
    case 'projekt':
      return 'Lars följer varje projekt och flaggar när något glider'
    case 'offerter':
      return 'Daniel följer upp dem så de inte tappas'
    case 'karin':
      return 'Karin förbereder påminnelser du godkänner med ett tryck'
    case 'daniel':
      return 'Daniel skriver uppföljningarna, du godkänner'
    case 'lars':
      return 'Lars bevakar tid och marginal per projekt'
    case 'ko':
      return 'Allt samlas i en kö där du godkänner eller avvisar'
    default:
      return null
  }
}
