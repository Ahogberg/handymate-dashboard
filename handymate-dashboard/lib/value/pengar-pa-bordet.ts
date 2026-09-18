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
 * ═══ VARIFRÅN KOMMER SIFFRAN (2026-09-18) ═══
 *
 * Varje kategori bär nu `poster` — de faktiska raderna summan består av, var
 * och en med sitt eget belopp och en länk till just den posten. Och summan
 * RÄKNAS UR posterna. Det är inte en extra uppgift vid sidan av talet; det är
 * talets enda källa, så de kan inte glida ifrån varandra.
 *
 * Varför det behövdes: kategorierna hade bara en `href` till en filtrerad
 * lista, och ingen av de fem listorna visade samma urval som siffran. Exempel:
 * offerterna räknas med femdagarsgränsen och utan testdata, men länken gick
 * till ALLA skickade offerter. Fakturaunderlaget räknas med TOM dedupe (med
 * flit — sidan visar allt på bordet), men länken gick till godkännandekorten,
 * som per definition är en delmängd. Den som ville kontrollera ett tal måste
 * alltså räkna om det själv. Nu står raderna där.
 *
 * Ren sammanställning — facit i tests/pengar-pa-bordet.spec.ts. Rutten
 * (app/api/dashboard/pengar) gör läsningarna; den här filen bara räknar.
 */
import type { MissedRevenueFinding } from '@/lib/value/missed-revenue'

/**
 * En rad bakom en siffra.
 *
 * `belopp: null` betyder att posten finns men beloppet inte är känt. Den
 * räknas i antal och ALDRIG i summan — samma regel som tidigare gällde
 * kategorinivån, nu synlig per rad.
 */
export interface PengarPost {
  /** Stabil nyckel. Radens egen identitet, aldrig ett index. */
  id: string
  /** Vad posten är, för en människa. */
  etikett: string
  belopp: number | null
  /** Länk till JUST den här posten, inte till en lista som kanske matchar. */
  href: string
  /** Varför posten är med, eller när. */
  detalj?: string
}

export interface PengarKategori {
  key: 'offerter' | 'ofakturerat' | 'forfallet' | 'marginalrisk' | 'ata'
  titel: string
  beskrivning: string
  /** RÄKNAS UR `poster`. Aldrig satt för hand. */
  summaKr: number
  antal: number
  /** Poster utan känt belopp (räknas i antal, aldrig i summan). */
  antalUtanBelopp?: number
  /** Raderna summan består av. */
  poster: PengarPost[]
  href: string
}

export interface PengarSummary {
  totalKr: number
  kategorier: PengarKategori[]
}

export interface StaleQuote {
  total: number | null
  sent_at: string | null
  /** Identitet så posten kan pekas ut. Saknas den blir posten ospårbar. */
  quote_id?: string | null
  quote_number?: string | null
  title?: string | null
}

export interface OverdueInvoice {
  total: number | null
  customer_pays: number | null
  rot_rut_type: string | null
  invoice_id?: string | null
  invoice_number?: string | null
  due_date?: string | null
}

/** Ett marginallarm, med kortets identitet så det går att öppna. */
export interface MarginRisk {
  id: string
  overrunKr: number
  projectName?: string | null
}

/** Ett föreslaget ÄTA-utkast. */
export interface AtaForslag {
  id: string
  estimateKr: number
  projectName?: string | null
}

/**
 * Summan ur raderna. ENDA stället en kategorisumma uppstår.
 *
 * Poster utan belopp bidrar med noll men finns kvar i antalet — en avslutad
 * insats utan säkert belopp är fortfarande arbete som kan vara ofakturerat.
 */
function summeraPoster(poster: PengarPost[]): number {
  return Math.round(poster.reduce((s, p) => s + (typeof p.belopp === 'number' && p.belopp > 0 ? p.belopp : 0), 0))
}

function utanBelopp(poster: PengarPost[]): number {
  return poster.filter(p => typeof p.belopp !== 'number' || p.belopp <= 0).length
}

/** Gemensam form: antal, summa och antalUtanBelopp härleds alltid ur posterna. */
function kategoriUrPoster(
  bas: Pick<PengarKategori, 'key' | 'titel' | 'beskrivning' | 'href'>,
  poster: PengarPost[],
): PengarKategori {
  const saknas = utanBelopp(poster)
  return {
    ...bas,
    summaKr: summeraPoster(poster),
    antal: poster.length - saknas,
    ...(saknas > 0 ? { antalUtanBelopp: saknas } : {}),
    poster,
  }
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
  marginRisker: MarginRisk[]
  ataForslag: AtaForslag[]
}): PengarSummary {
  const kategorier: PengarKategori[] = []

  // 1. Offerter att följa upp. En offert utan totalsumma finns kvar som post
  //    med belopp null — den är fortfarande värd en påminnelse.
  if (input.staleQuotes.length > 0) {
    kategorier.push(kategoriUrPoster({
      key: 'offerter',
      titel: 'Offerter värda att följa upp',
      beskrivning: 'Skickade utan svar — en påminnelse vinner historiskt ungefär var fjärde.',
      href: '/dashboard/quotes?status=sent',
    }, input.staleQuotes.map((q, i) => ({
      id: q.quote_id || `offert-${i}`,
      etikett: q.quote_number ? `Offert ${q.quote_number}` : q.title || 'Offert utan nummer',
      belopp: typeof q.total === 'number' && q.total > 0 ? q.total : null,
      href: q.quote_id ? `/dashboard/quotes/${q.quote_id}` : '/dashboard/quotes?status=sent',
      ...(q.sent_at ? { detalj: `skickad ${q.sent_at.slice(0, 10)}` } : {}),
    }))))
  }

  // 2. Fakturaunderlag att granska. Bara LIKELY/CONFIRMED bär amountKr;
  //    NEEDS_REVIEW blir en post utan belopp och påverkar aldrig summan.
  if (input.missedRevenue.length > 0) {
    kategorier.push(kategoriUrPoster({
      key: 'ofakturerat',
      titel: 'Fakturaunderlag att granska',
      beskrivning: 'Källrader som kan sakna fakturakoppling — kontrollera innan ett utkast skapas.',
      href: '/dashboard/approvals?filter=missad_intakt',
    }, input.missedRevenue.map((f, i) => ({
      id: f.dedupeKey || `underlag-${i}`,
      etikett: f.projectName || 'Projekt utan namn',
      belopp: f.amountKr > 0 ? f.amountKr : null,
      // Projektet är posten. Godkännandekortet finns inte alltid: sidan
      // räknar med TOM dedupe, så en post här kan mycket väl sakna kort.
      href: f.projectId ? `/dashboard/projects/${f.projectId}` : '/dashboard/approvals?filter=missad_intakt',
      ...(f.evidence ? { detalj: f.evidence } : {}),
    }))))
  }

  // 3. Förfallna kundfordringar
  if (input.overdueInvoices.length > 0) {
    kategorier.push(kategoriUrPoster({
      key: 'forfallet',
      titel: 'Förfallna kundfordringar',
      beskrivning: 'Fakturor förbi förfallodatum — pengar som redan är intjänade.',
      href: '/dashboard/invoices?status=overdue',
    }, input.overdueInvoices.map((inv, i) => {
      const belopp = invoiceAmount(inv)
      return {
        id: inv.invoice_id || `faktura-${i}`,
        etikett: inv.invoice_number ? `Faktura ${inv.invoice_number}` : 'Faktura utan nummer',
        belopp: belopp > 0 ? belopp : null,
        href: inv.invoice_id ? `/dashboard/invoices/${inv.invoice_id}` : '/dashboard/invoices?status=overdue',
        ...(inv.due_date ? { detalj: `förfallen ${String(inv.due_date).slice(0, 10)}` } : {}),
      }
    })))
  }

  // 4. Marginalrisk. Bara faktiska överdrag — ett larm med noll i prognos är
  //    ingen risk, och togs bort redan före posterna fanns.
  const risker = input.marginRisker.filter(r => typeof r.overrunKr === 'number' && r.overrunKr > 0)
  if (risker.length > 0) {
    kategorier.push(kategoriUrPoster({
      key: 'marginalrisk',
      titel: 'Marginal i riskzonen',
      beskrivning: 'Pågående projekt vars prognos pekar över kalkyl.',
      href: '/dashboard/projects',
    }, risker.map(r => ({
      id: r.id,
      etikett: r.projectName || 'Projekt utan namn',
      belopp: r.overrunKr,
      href: `/dashboard/approvals/${r.id}`,
      detalj: 'prognos över kalkyl',
    }))))
  }

  // 5. Möjliga ÄTA. Samma sak: bara förslag med ett belopp.
  const atas = input.ataForslag.filter(a => typeof a.estimateKr === 'number' && a.estimateKr > 0)
  if (atas.length > 0) {
    kategorier.push(kategoriUrPoster({
      key: 'ata',
      titel: 'Möjliga ÄTA-arbeten',
      beskrivning: 'Föreslagna tillägg som ännu inte blivit avtal.',
      href: '/dashboard/approvals',
    }, atas.map(a => ({
      id: a.id,
      etikett: a.projectName || 'Projekt utan namn',
      belopp: a.estimateKr,
      href: `/dashboard/approvals/${a.id}`,
      detalj: 'föreslaget tillägg',
    }))))
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

/**
 * Presentationsfacit för hemskärmsbandet. Okända belopp är inte ett
 * tomläge: posten ska fortfarande synas som ett granskningsbehov i antal.
 */
export function pengarBandPresentation(summary: PengarSummary): {
  grupper: PengarGrupp[]
  tomt: boolean
  harKantBelopp: boolean
} {
  const grupper = grupperaPengar(summary)
  return {
    grupper,
    tomt: grupper.length === 0,
    harKantBelopp: summary.totalKr > 0,
  }
}

/** Antal faktiska poster i en kategori, inklusive poster utan säkert belopp. */
export function pengarKategoriAntal(kategori: PengarKategori): number {
  return kategori.antal + (kategori.antalUtanBelopp ?? 0)
}
