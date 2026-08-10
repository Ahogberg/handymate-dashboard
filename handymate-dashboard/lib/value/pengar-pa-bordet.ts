/**
 * Pengar på bordet — en fråga, fem svar.
 *
 * ═══ VAD SIDAN ÄR ═══
 *
 * Hela Handymate kokar ner till en fråga för målgruppen: var ligger
 * pengarna ni annars riskerar att missa? Den här modulen räknar ihop
 * svaret ur fem källor som redan finns — den UPPFINNER ingen kategori och
 * ingen krona:
 *
 *   1. Offerter att följa upp   — öppna offerter äldre än uppföljnings-
 *                                 cadencen (samma regel som cron/quote-follow-up)
 *   2. Fakturaunderlag att granska — missed-revenue-svepets konservativt
 *                                    klassade signaler
 *   3. Förfallna kundfordringar — fakturor förbi förfallodatum
 *   4. Marginalrisk             — profitability_warnings prognostiserade överdrag
 *   5. Möjliga ÄTA              — föreslagna ÄTA-utkast med belopp
 *
 * ═══ ÄRLIGHETEN ═══
 *
 * - Varje kategori är sin egen sort. Totalsumman på sidan är POTENTIAL —
 *   den blandas aldrig in i "bekräftat värde" (weekly-value nivå 1).
 * - Projekt utan faktura har inget känt belopp och räknas som ANTAL,
 *   aldrig som kronor i summan.
 * - En kategori utan innehåll visas inte som "0 kr" — den utelämnas.
 *
 * Ren sammanställning — facit i tests/pengar-pa-bordet.spec.ts. Rutten
 * (app/api/dashboard/pengar) gör läsningarna; den här filen bara räknar.
 */
import type { MissedRevenueFinding } from '@/lib/value/missed-revenue'

export interface PengarKategori {
  key: 'offerter' | 'ofakturerat' | 'forfallet' | 'marginalrisk' | 'ata'
  titel: string
  beskrivning: string
  summaKr: number
  antal: number
  /** Poster utan känt belopp (räknas i antal, aldrig i summan). */
  antalUtanBelopp?: number
  href: string
}

export interface PengarSummary {
  totalKr: number
  kategorier: PengarKategori[]
}

export interface StaleQuote {
  total: number | null
  sent_at: string | null
}

export interface OverdueInvoice {
  total: number | null
  customer_pays: number | null
  rot_rut_type: string | null
}

/** Samma beloppskonvention som check-overdue: ROT/RUT → det kunden betalar. */
export function invoiceAmount(inv: OverdueInvoice): number {
  const v = inv.rot_rut_type ? inv.customer_pays : inv.total
  return typeof v === 'number' && v > 0 ? v : 0
}

export function buildPengarSummary(input: {
  staleQuotes: StaleQuote[]
  missedRevenue: MissedRevenueFinding[]
  overdueInvoices: OverdueInvoice[]
  marginOverruns: number[]
  ataEstimates: number[]
}): PengarSummary {
  const kategorier: PengarKategori[] = []

  // 1. Offerter att följa upp
  const offertSumma = input.staleQuotes.reduce((s, q) => s + (typeof q.total === 'number' && q.total > 0 ? q.total : 0), 0)
  if (input.staleQuotes.length > 0) {
    kategorier.push({
      key: 'offerter',
      titel: 'Offerter värda att följa upp',
      beskrivning: 'Skickade utan svar — en påminnelse vinner historiskt ungefär var fjärde.',
      summaKr: Math.round(offertSumma),
      antal: input.staleQuotes.length,
      href: '/dashboard/quotes?status=sent',
    })
  }

  // 2. Fakturaunderlag att granska. Bara LIKELY/CONFIRMED får bära amountKr;
  //    NEEDS_REVIEW är antal utan belopp och påverkar aldrig totalsumman.
  const medBelopp = input.missedRevenue.filter(f => f.amountKr > 0)
  const utanBelopp = input.missedRevenue.filter(f => f.amountKr === 0)
  if (input.missedRevenue.length > 0) {
    kategorier.push({
      key: 'ofakturerat',
      titel: 'Fakturaunderlag att granska',
      beskrivning: 'Källrader som kan sakna fakturakoppling — kontrollera innan ett utkast skapas.',
      summaKr: Math.round(medBelopp.reduce((s, f) => s + f.amountKr, 0)),
      antal: medBelopp.length,
      ...(utanBelopp.length > 0 ? { antalUtanBelopp: utanBelopp.length } : {}),
      href: '/dashboard/approvals?filter=missad_intakt',
    })
  }

  // 3. Förfallna kundfordringar
  const forfallet = input.overdueInvoices.map(invoiceAmount).filter(v => v > 0)
  if (input.overdueInvoices.length > 0) {
    kategorier.push({
      key: 'forfallet',
      titel: 'Förfallna kundfordringar',
      beskrivning: 'Fakturor förbi förfallodatum — pengar som redan är intjänade.',
      summaKr: Math.round(forfallet.reduce((s, v) => s + v, 0)),
      antal: input.overdueInvoices.length,
      href: '/dashboard/invoices?status=overdue',
    })
  }

  // 4. Marginalrisk
  const overruns = input.marginOverruns.filter(v => typeof v === 'number' && v > 0)
  if (overruns.length > 0) {
    kategorier.push({
      key: 'marginalrisk',
      titel: 'Marginal i riskzonen',
      beskrivning: 'Pågående projekt vars prognos pekar över kalkyl.',
      summaKr: Math.round(overruns.reduce((s, v) => s + v, 0)),
      antal: overruns.length,
      href: '/dashboard/projects',
    })
  }

  // 5. Möjliga ÄTA
  const atas = input.ataEstimates.filter(v => typeof v === 'number' && v > 0)
  if (atas.length > 0) {
    kategorier.push({
      key: 'ata',
      titel: 'Möjliga ÄTA-arbeten',
      beskrivning: 'Föreslagna tillägg som ännu inte blivit avtal.',
      summaKr: Math.round(atas.reduce((s, v) => s + v, 0)),
      antal: atas.length,
      href: '/dashboard/approvals',
    })
  }

  return {
    totalKr: kategorier.reduce((s, k) => s + k.summaKr, 0),
    kategorier,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Trikotomin (Spår A2, 2026-08-10): Hämta nu / Möjligheter / Risk.
//
// Fem kategorier i en platt lista svarar på "var ligger pengarna?" men inte
// på "vad gör jag först?". Grupperingen är samma sanning i tre handlings-
// nivåer — intjänat, potentiellt, hotat — utan att en enda krona flyttas
// mellan kategorierna. Hemskärmens Att hämta gör redan samma separation.
// ─────────────────────────────────────────────────────────────────────────

export type PengarGruppKey = 'hamta_nu' | 'mojligheter' | 'risk'

export interface PengarGrupp {
  key: PengarGruppKey
  titel: string
  beskrivning: string
  summaKr: number
  kategorier: PengarKategori[]
}

/**
 * UTTÖMMANDE mappning — Record över kategorinycklarna gör att en ny
 * kategori inte kompilerar förrän någon bestämt vilken handlingsnivå den
 * tillhör. En ogrupperad kategori hade tyst försvunnit från sidan.
 */
export const GRUPP_AV_KATEGORI: Record<PengarKategori['key'], PengarGruppKey> = {
  forfallet: 'hamta_nu',      // redan intjänat — förbi förfallodatum
  ofakturerat: 'hamta_nu',    // utfört arbete som saknar faktura
  offerter: 'mojligheter',    // skickat men obesvarat
  ata: 'mojligheter',         // föreslagna tillägg, ännu inte avtal
  marginalrisk: 'risk',       // prognos om överdrag — kan försvinna
}

const GRUPP_META: Record<PengarGruppKey, { titel: string; beskrivning: string }> = {
  hamta_nu: {
    titel: 'Att hämta nu',
    beskrivning: 'Intjänat arbete och förfallna fakturor — konkreta handlingar.',
  },
  mojligheter: {
    titel: 'Möjligheter',
    beskrivning: 'Potentiellt värde — offerter och tillägg som ännu inte är avtal.',
  },
  risk: {
    titel: 'Risk',
    beskrivning: 'Pengar som kan försvinna om prognosen slår in.',
  },
}

/** Ren omgruppering: summan per grupp är exakt kategorisumman, tomma
    grupper utelämnas, ordningen är alltid hämta → möjligheter → risk. */
export function grupperaPengar(summary: PengarSummary): PengarGrupp[] {
  const ordning: PengarGruppKey[] = ['hamta_nu', 'mojligheter', 'risk']
  return ordning
    .map(key => {
      const kategorier = summary.kategorier.filter(k => GRUPP_AV_KATEGORI[k.key] === key)
      return {
        key,
        ...GRUPP_META[key],
        summaKr: kategorier.reduce((s, k) => s + k.summaKr, 0),
        kategorier,
      }
    })
    .filter(g => g.kategorier.length > 0)
}
