/**
 * Svep efter pengar som redan är intjänade men inte fakturerade (spår 1.3).
 *
 * ═══ VARFÖR ETT SVEP OCH INTE EN TRIGGER ═══
 *
 * `autoInvoiceOnComplete` körs när ett projekt markeras klart. Det fungerar —
 * men bara i det ögonblicket. Failar anropet, är projektet redan klart sedan
 * tidigare, eller markeras det klart innan materialet är inlagt, hittas
 * pengarna aldrig. En trigger ser bara framåt; ett svep ser bakåt varje natt.
 *
 * Därför hittar det här mer ju senare det körs första gången, inte mindre.
 *
 * ═══ TRE REGLER, VALDA FÖR ATT DE ÄR ENTYDIGA ═══
 *
 * 1. **Godkänd ÄTA utan faktura** — `signed_at` satt, `invoiced_at` tom.
 *    Kunden har skrivit under på tilläggsarbetet. Pengarna är förtjänade.
 * 2. **Material ej fakturerat** — `invoiced = false` på ett avslutat projekt.
 * 3. **Avslutat projekt utan faktura** — i efterhand, till skillnad från
 *    triggern.
 *
 * Alla tre bygger på ett fält som SÄGER att något inte hänt. Ingen av dem
 * gissar. Det är avsiktligt: ett svep som producerar tveksamma kort blir ett
 * svep hantverkaren slutar öppna.
 *
 * ═══ VÄRDET ÄR DIREKT, INTE ATTRIBUERAT ═══
 *
 * lib/value/recovered-revenue.ts attribuerar OUTBOUND-kort: kontakt som kan ha
 * lett till intäkt inom ett fönster, med medveten försiktighet. Det här är en
 * annan sak — beloppet är känt redan vid upptäckt, och när hantverkaren
 * fakturerar är den återvunna summan exakt den. Att blanda in de här
 * korttyperna i RECOVERY_APPROVAL_TYPES hade gjort attributionen falsk.
 *
 * Rena funktioner — facit-testade i tests/missed-revenue.spec.ts.
 */

/** Under det här beloppet skapas inget kort. Ett svep som larmar om 80 kr
    lär hantverkaren att stänga korten oläsligt, och då missar han de stora. */
export const MIN_AMOUNT_KR = 500

/**
 * Så här länge efter projektavslut håller vi tyst.
 *
 * Ett projekt som stängdes för en timme sedan kan mycket väl vara på väg att
 * faktureras — autoInvoiceOnComplete kan fortfarande köra, eller så sitter
 * hantverkaren med fakturan just nu. Att larma då är att lägga sig i.
 */
export const GRACE_DAYS = 3

export type MissedRevenueKind = 'ata_ej_fakturerad' | 'material_ej_fakturerat' | 'projekt_utan_faktura'

export interface MissedRevenueFinding {
  kind: MissedRevenueKind
  projectId: string
  projectName: string
  /** Belopp i kronor, avrundat. Känt vid upptäckt — inte uppskattat. */
  amountKr: number
  /** Vad som gör det till ett fynd, i klartext för kortet. */
  evidence: string
  /** Stabil nyckel för dedupe — samma fynd ska inte ge ett nytt kort varje natt. */
  dedupeKey: string
}

// ── Indata: exakt de kolumner reglerna behöver, inget mer ──────────────

export interface AtaRow {
  id: string
  project_id: string
  description: string | null
  amount: number | null
  signed_at: string | null
  invoiced_at: string | null
}

export interface MaterialRow {
  id: string
  project_id: string
  total_sell: number | null
  invoiced: boolean | null
}

export interface ProjectRow {
  project_id: string
  name: string | null
  status: string | null
  completed_at: string | null
}

export interface InvoiceRow {
  project_id: string | null
}

const kr = (n: number | null | undefined) => Math.round(Number(n) || 0)

/** Har projektet varit avslutat längre än nådatiden? */
export function isPastGrace(completedAt: string | null, now: Date, graceDays = GRACE_DAYS): boolean {
  if (!completedAt) return false
  const closed = Date.parse(completedAt)
  if (!Number.isFinite(closed)) return false
  return now.getTime() - closed >= graceDays * 24 * 60 * 60 * 1000
}

const nameOf = (p: ProjectRow | undefined) => p?.name?.trim() || 'Projekt utan namn'

/**
 * REGEL 1 — godkänd ÄTA utan faktura.
 *
 * Kräver INTE att projektet är avslutat: en påskriven ÄTA mitt i ett långt
 * projekt är lika mycket förtjänade pengar, och det är just de som glöms.
 */
export function findUninvoicedAta(
  atas: AtaRow[],
  projects: Map<string, ProjectRow>,
  now: Date,
): MissedRevenueFinding[] {
  const out: MissedRevenueFinding[] = []
  for (const a of atas) {
    if (!a.signed_at || a.invoiced_at) continue
    const amount = kr(a.amount)
    if (amount < MIN_AMOUNT_KR) continue
    // Även ÄTA får nådatid — påskriven i morse ska inte larma i natt.
    if (!isPastGrace(a.signed_at, now)) continue
    const p = projects.get(a.project_id)
    out.push({
      kind: 'ata_ej_fakturerad',
      projectId: a.project_id,
      projectName: nameOf(p),
      amountKr: amount,
      evidence: `Kunden skrev under ${a.signed_at.slice(0, 10)}${a.description ? ` — ${a.description.slice(0, 60)}` : ''}`,
      dedupeKey: `ata:${a.id}`,
    })
  }
  return out
}

/**
 * REGEL 2 — material ej fakturerat på avslutat projekt.
 *
 * Summeras PER PROJEKT, inte per rad: femton ofakturerade skruvpaket är ett
 * problem, inte femton. Ett kort per rad hade dränkt kön.
 */
export function findUninvoicedMaterial(
  materials: MaterialRow[],
  projects: Map<string, ProjectRow>,
  now: Date,
): MissedRevenueFinding[] {
  const perProject = new Map<string, number>()
  for (const m of materials) {
    if (m.invoiced) continue
    const p = projects.get(m.project_id)
    if (!p || p.status !== 'completed' || !isPastGrace(p.completed_at, now)) continue
    perProject.set(m.project_id, (perProject.get(m.project_id) || 0) + kr(m.total_sell))
  }

  const out: MissedRevenueFinding[] = []
  for (const [projectId, amount] of Array.from(perProject.entries())) {
    if (amount < MIN_AMOUNT_KR) continue
    const p = projects.get(projectId)
    out.push({
      kind: 'material_ej_fakturerat',
      projectId,
      projectName: nameOf(p),
      amountKr: amount,
      evidence: `Material inlagt på projektet men aldrig fakturerat`,
      dedupeKey: `material:${projectId}`,
    })
  }
  return out
}

/**
 * REGEL 3 — avslutat projekt utan någon faktura alls.
 *
 * Det här är den `autoInvoiceOnComplete` skulle ha fångat. Svepet finns för
 * de gånger den inte gjorde det — och för projekt som stängdes innan den
 * triggern ens fanns.
 *
 * Beloppet är okänt här (det finns ingen faktura att läsa summan ur), så
 * kortet bär 0 och evidensen säger vad som saknas i stället för hur mycket.
 */
export function findCompletedWithoutInvoice(
  projects: ProjectRow[],
  invoices: InvoiceRow[],
  now: Date,
): MissedRevenueFinding[] {
  const invoiced = new Set(invoices.map(i => i.project_id).filter(Boolean) as string[])
  const out: MissedRevenueFinding[] = []
  for (const p of projects) {
    if (p.status !== 'completed') continue
    if (!isPastGrace(p.completed_at, now)) continue
    if (invoiced.has(p.project_id)) continue
    out.push({
      kind: 'projekt_utan_faktura',
      projectId: p.project_id,
      projectName: nameOf(p),
      amountKr: 0,
      evidence: `Avslutat ${p.completed_at?.slice(0, 10) ?? 'tidigare'} men ingen faktura finns`,
      dedupeKey: `projekt:${p.project_id}`,
    })
  }
  return out
}

/**
 * Kör alla tre och tar bort det som redan ligger i kön.
 *
 * Sorterat på belopp: den som öppnar kön ska mötas av de största pengarna
 * först, inte av den äldsta posten.
 */
export function sweepMissedRevenue(input: {
  atas: AtaRow[]
  materials: MaterialRow[]
  projects: ProjectRow[]
  invoices: InvoiceRow[]
  /** dedupeKeys som redan har ett öppet kort. */
  alreadyOpen: Set<string>
  now: Date
}): MissedRevenueFinding[] {
  const byId = new Map(input.projects.map(p => [p.project_id, p]))
  const all = [
    ...findUninvoicedAta(input.atas, byId, input.now),
    ...findUninvoicedMaterial(input.materials, byId, input.now),
    ...findCompletedWithoutInvoice(input.projects, input.invoices, input.now),
  ]
  return all
    .filter(f => !input.alreadyOpen.has(f.dedupeKey))
    .sort((a, b) => b.amountKr - a.amountKr)
}

/** Svensk rubrik till kortet. */
export function findingTitle(f: MissedRevenueFinding): string {
  const belopp = f.amountKr > 0 ? ` — ${f.amountKr.toLocaleString('sv-SE')} kr` : ''
  switch (f.kind) {
    case 'ata_ej_fakturerad':
      return `Godkänt tilläggsarbete inte fakturerat${belopp}`
    case 'material_ej_fakturerat':
      return `Material inte fakturerat${belopp}`
    case 'projekt_utan_faktura':
      return `Avslutat projekt saknar faktura`
  }
}
