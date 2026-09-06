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

/**
 * Ärlighetsetiketten per rad (Företagsskanningen, 2026-09-06 —
 * docs/design/skisser-2026-09-06/foretagsskanning.dc.html). Samma semantik
 * som KÄNT/UPPSKATTAT i docs/design/SYNLIG-INTELLIGENS.md, men i skannens
 * egna ord:
 *
 *   importerat  — ett antal läst rakt ur databasen (kunder, fakturor, …)
 *   mojlighet   — en agents bedömning av vad talen betyder (Karins kronor,
 *                 Daniels gamla offerter)
 *   uppskattat  — en räknefråga på kundens egna uppgifter, ingen mätning
 *                 (årsvärdet av en missad faktureringstimme)
 *
 * Etiketten sätts av buildScanRows, aldrig av vyn — så StepGenomgang och
 * CompanyScan visar samma sanning om samma rad.
 */
export type ScanKalla = 'importerat' | 'mojlighet' | 'uppskattat'

export interface ScanRow {
  key: string
  text: string
  agent?: 'karin' | 'daniel' | 'lars'
  kalla: ScanKalla
}

/**
 * Bygger raderna ur de råa talen. Bara sanna rader (n>0) — funktionen är
 * ren och testbar utan React/DOM (facit-stilen, se tests/company-scan.spec.ts).
 */
export function buildScanRows(d: CompanyScanResult): ScanRow[] {
  const rows: ScanRow[] = []
  if (d.customerCount > 0) {
    rows.push({ key: 'kunder', kalla: 'importerat', text: `${fmt(d.customerCount)} kund${d.customerCount > 1 ? 'er' : ''} hittade` })
  }
  if (d.openInvoicesCount > 0) {
    rows.push({ key: 'fakturor', kalla: 'importerat', text: `${fmt(d.openInvoicesCount)} öppna faktur${d.openInvoicesCount > 1 ? 'or' : 'a'} analyserade` })
  }
  if (d.activeProjectsCount > 0) {
    rows.push({ key: 'projekt', kalla: 'importerat', text: `${fmt(d.activeProjectsCount)} pågående projekt identifierade` })
  }
  if (d.openQuotesCount > 0) {
    rows.push({ key: 'offerter', kalla: 'importerat', text: `${fmt(d.openQuotesCount)} offert${d.openQuotesCount > 1 ? 'er' : ''} hittade` })
  }
  // Karins rad är uttryckligen HENNES fynd — rutten sätter karinHeadline
  // bara när headline verkligen är Karins (förfallet/obetalt > 0), aldrig
  // Daniels/Hannas/Lisas generiska fallback under en Karin-etikett.
  if (d.karinHeadline?.amount_kr) {
    // Grundmeningen är pinnad i tests/company-scan.spec.ts; "varav N
    // förfallna" hängs på BARA när rutten faktiskt räknat förfallna (>0).
    const forfallna = d.overdueInvoicesCount ?? 0
    const suffix = forfallna > 0 ? `, varav ${fmt(forfallna)} förfall${forfallna > 1 ? 'na' : 'en'}` : ''
    rows.push({ key: 'karin', agent: 'karin', kalla: 'mojlighet', text: `Karin hittade ${fmt(d.karinHeadline.amount_kr)} kr i utestående kundfordringar${suffix}` })
  }
  if (d.staleQuotesCount > 0) {
    // Ålder på den äldsta: bara när rutten vet den (null/saknas ⇒ inget tillägg).
    const aldsta = d.oldestStaleQuoteDays
    const suffix = typeof aldsta === 'number' && aldsta > 0 ? `, äldsta ${fmt(aldsta)} dag${aldsta > 1 ? 'ar' : ''}` : ''
    rows.push({ key: 'daniel', agent: 'daniel', kalla: 'mojlighet', text: `Daniel hittade ${fmt(d.staleQuotesCount)} offert${d.staleQuotesCount > 1 ? 'er' : ''} som borde följas upp${suffix}` })
  }
  if (d.activeProjectsCount > 0) {
    rows.push({ key: 'lars', kalla: 'importerat', agent: 'lars', text: `Lars bevakar ${fmt(d.activeProjectsCount)} aktiv${d.activeProjectsCount > 1 ? 'a' : 't'} projekt` })
  }
  // Kön, sist — pekar framåt mot "Det här behöver dig idag".
  if (d.pendingApprovalsCount > 0) {
    rows.push({ key: 'ko', kalla: 'importerat', text: `${fmt(d.pendingApprovalsCount)} sak${d.pendingApprovalsCount > 1 ? 'er' : ''} behöver din uppmärksamhet` })
  }
  // Firmans egna uppgifter, sist: en ny firma utan import har inga rader ovan
  // och fick tidigare "Inget att gå igenom än" — exakt ICP:n mötte alltså en
  // tom genomgång precis innan betalfrågan.
  rows.push(...buildProfileRows(d.profil))
  return rows
}

/**
 * Räknerader ur det kunden själv fyllde i under steg 2–3 (Etapp B5,
 * 2026-09-02). Ingen AI, ren aritmetik på kundens egna tal, och samma
 * ärlighetsregel som resten av skannen: en rad byggs bara när underlaget
 * finns. Aldrig ett löfte om resultat — bara vad talen betyder.
 */
export function buildProfileRows(profil: CompanyScanResult['profil']): ScanRow[] {
  if (!profil) return []
  const rows: ScanRow[] = []

  const timpris = Number(profil.hourlyRate) || 0
  if (timpris > 0) {
    const personer = Math.max(1, Number(profil.employeeCount) || 1)
    // En missad faktureringstimme i veckan, per person, på ett år.
    const perAr = timpris * personer * 52
    rows.push({
      key: 'profil_timme',
      agent: 'lars',
      // En räknefråga på kundens egna tal — aldrig en mätning.
      kalla: 'uppskattat',
      text:
        personer > 1
          ? `Med ${fmt(timpris)} kr/h och ${personer} personer motsvarar en missad faktureringstimme i veckan ${fmt(perAr)} kr på ett år`
          : `Med ${fmt(timpris)} kr/h motsvarar en missad faktureringstimme i veckan ${fmt(perAr)} kr på ett år`,
    })
  }

  const markup = Number(profil.materialMarkupPct) || 0
  if (markup > 0) {
    rows.push({
      key: 'profil_pastag',
      agent: 'daniel',
      kalla: 'importerat',
      text: `Ditt materialpåslag på ${fmt(markup)} % räknas in i varje offert automatiskt`,
    })
  }

  const tjanster = Number(profil.specialtyCount) || 0
  if (tjanster > 0) {
    rows.push({
      key: 'profil_tjanster',
      kalla: 'importerat',
      text: `${fmt(tjanster)} tjänst${tjanster > 1 ? 'er' : ''} du valt styr vad teamet föreslår i offerter och svar`,
    })
  }

  if (profil.phoneNumber) {
    rows.push({
      key: 'profil_telefon',
      kalla: 'importerat',
      text: `Lisa fångar samtal på ${profil.phoneNumber} från dag ett`,
    })
  }

  return rows
}

/**
 * En källa skanningen faktiskt gick igenom (Företagsskanningen, 2026-09-06).
 * Listan är en kvittens, inte ett löfte: bara källor som finns (kundregister/
 * fakturor med n>0) eller är kopplade (Fortnox enligt
 * business_config.fortnox_connected). Aldrig Gmail — skannen läser ingen
 * post — och aldrig något som inte är kopplat.
 */
export interface ScanSource {
  key: 'kundregister' | 'fakturor' | 'fortnox'
  label: string
  meta: string
}

/** Kort svensk datumstämpel för "kopplat · synkat 6 sep." — ingen tid, ingen sekund. */
function kortDatum(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

/**
 * Ren och testbar (tests/foretagsskanning-vy.spec.ts): källistan byggs ur
 * talen + Fortnox-flaggan, ingenting annat. Ordningen är systemet först,
 * sedan det lästa — samma ordning som vänsterpanelen bockar av dem i.
 */
export function buildScanSources(input: {
  customerCount: number
  openInvoicesCount: number
  fortnoxConnected: boolean
  fortnoxLastSyncedAt?: string | null
}): ScanSource[] {
  const sources: ScanSource[] = []
  if (input.fortnoxConnected) {
    const synk = kortDatum(input.fortnoxLastSyncedAt)
    sources.push({ key: 'fortnox', label: 'Fortnox', meta: synk ? `kopplat · synkat ${synk}` : 'kopplat' })
  }
  if (input.customerCount > 0) {
    sources.push({ key: 'kundregister', label: 'Kundregister', meta: `${fmt(input.customerCount)} kund${input.customerCount > 1 ? 'er' : ''}` })
  }
  if (input.openInvoicesCount > 0) {
    sources.push({ key: 'fakturor', label: 'Fakturor', meta: `${fmt(input.openInvoicesCount)} öppna` })
  }
  return sources
}

/** Etikettens ord i UI:t — en sanning, samma ord i skannen och genomgången. */
export const KALLA_LABEL: Record<ScanKalla, string> = {
  importerat: 'Importerat',
  mojlighet: 'Möjlighet',
  uppskattat: 'Uppskattat',
}

/**
 * Onboardingens genomgång (StepGenomgang) visar, under varje rad, en kort
 * mening om vad teamet gör med just det fyndet EFTER aktivering — aldrig ett
 * löfte om belopp eller resultat, bara vem som tar vid.
 */
export function teamGorNarDuAktiverar(row: ScanRow): string | null {
  switch (row.key) {
    case 'kunder':
      return 'Lisa fångar samtalet när de ringer och Hanna håller kontakten'
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
    case 'profil_timme':
      return 'Lars räknar tid mot marginal på varje jobb'
    case 'profil_pastag':
      return 'Daniel prissätter materialet efter din regel, inte på känsla'
    case 'profil_tjanster':
      return 'Teamet håller sig till det du faktiskt säljer'
    case 'profil_telefon':
      return 'Varje samtal blir en sammanfattning du kan agera på'
    default:
      return null
  }
}
