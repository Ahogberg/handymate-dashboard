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
 * ═══ TRE SIGNALER, MED OLIKA BEVISSTYRKA ═══
 *
 * 1. **Godkänd ÄTA utan källkoppling** — kunden har godkänt priset, men
 *    signaturen bevisar inte ensam att arbetet utförts.
 * 2. **Material markerat ofakturerat** — relevant på löpande/blandat projekt,
 *    men kan ingå i fastpris eller i en manuellt skapad faktura.
 * 3. **Avslutat projekt utan kopplad faktura** — en signal, aldrig bevis för
 *    ett visst belopp.
 *
 * Ingen nuvarande regel når `CONFIRMED_UNBILLED`: historiska och manuella
 * fakturor saknar tillräcklig källradslänkning. Kontraktet är avsiktligt
 * konservativt tills X1b har en verifierad source→invoice-kedja.
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
/**
 * v2 (Tur 4 etapp 2, 2026-08-10): projekt_utan_faktura med komplett underlag
 * blir `fakturera_projekt` — kortet bär hela fakturautkastet och Godkänn
 * skickar. Bumpen gör att pending `projekt:*`-kort på v1 klassas om nästa
 * nattkörning (partitionPriorRevenueCards lägger dem i legacy-uppgradering).
 */
export const MISSED_REVENUE_CLASSIFICATION_VERSION = 2

export type MissedRevenueKind = 'ata_ej_fakturerad' | 'material_ej_fakturerat' | 'projekt_utan_faktura'
export type RevenueConfidence = 'CONFIRMED_UNBILLED' | 'LIKELY_UNBILLED' | 'NEEDS_REVIEW'
export type RevenueAction = 'REVIEW_ONLY' | 'DRAFT_AFTER_REVIEW'

export interface PriorRevenueCard {
  id: string | null
  status: string | null
  payload: Record<string, unknown> | null
}

export function partitionPriorRevenueCards(rows: PriorRevenueCard[]): {
  alreadyReported: Set<string>
  legacyPendingByDedupe: Map<string, string>
} {
  const alreadyReported = new Set<string>()
  const legacyPendingByDedupe = new Map<string, string>()

  for (const row of rows) {
    const dedupeKey = row.payload?.dedupe_key
    if (typeof dedupeKey !== 'string') continue
    const currentVersion = row.payload?.classification_version === MISSED_REVENUE_CLASSIFICATION_VERSION
    if (row.status === 'pending' && !currentVersion && typeof row.id === 'string') {
      legacyPendingByDedupe.set(dedupeKey, row.id)
    } else {
      // Hanterade legacykort återuppstår inte. Pending på aktuell version
      // behöver inte heller skapas eller skrivas om igen.
      alreadyReported.add(dedupeKey)
    }
  }

  return { alreadyReported, legacyPendingByDedupe }
}

export function legacyPendingCardsToExpire(
  legacyPendingByDedupe: Map<string, string>,
  currentFindingKeys: Set<string>,
): string[] {
  return Array.from(legacyPendingByDedupe.entries())
    .filter(([dedupeKey]) => !currentFindingKeys.has(dedupeKey))
    .map(([, id]) => id)
}

export interface MissedRevenueFinding {
  kind: MissedRevenueKind
  projectId: string
  projectName: string
  /** Belopp som får ingå i identifierad potential. 0 när källan är tvetydig. */
  amountKr: number
  /** Källradens nominella belopp, även när det inte får summeras som potential. */
  sourceAmountKr: number
  confidence: RevenueConfidence
  action: RevenueAction
  /** Exakta källrader som en framtida review-adapter får arbeta med. */
  sourceIds: string[]
  /** Vad som gör det till ett fynd, i klartext för kortet. */
  evidence: string
  /** Stabil nyckel för dedupe — samma fynd ska inte ge ett nytt kort varje natt. */
  dedupeKey: string
  /**
   * Fakturaraderna fyndet skulle bli, när underlaget räcker.
   *
   * ═══ SÄTTS BARA VID action === 'DRAFT_AFTER_REVIEW' (2026-08-08) ═══
   *
   * Innehållskontraktet (regel 1) säger att ett kort ska bära ett FÄRDIGT
   * resultat, inte en rubrik om ett problem. "Avslutat projekt saknar
   * faktura" är en varning; en rad med text och belopp är något man kan
   * bedöma.
   *
   * Men bara där klassificeringen tillåter det. Ett fynd som klassats
   * NEEDS_REVIEW har per definition tvetydigt underlag — att visa ett
   * "utkast" där vore att återinföra precis den falska säkerhet den
   * konservativa klassningen byggde bort. Därför följer utkastet action,
   * inte kind.
   *
   * Ingen faktura skapas av att kortet skrivs. Raderna är en förhandsvisning
   * i payloaden, samma form som create_quote_draft — kortet visar vad som
   * skulle faktureras, hantverkaren avgör.
   */
  draftLines?: Array<{ description: string; amount_kr: number }>
}

// ── Indata: exakt de kolumner reglerna behöver, inget mer ──────────────

export interface AtaRow {
  id: string
  project_id: string
  change_type: string | null
  description: string | null
  amount: number | null
  signed_at: string | null
  invoice_id: string | null
  invoiced_at: string | null
}

export interface MaterialRow {
  id: string
  project_id: string
  total_sell: number | null
  invoiced: boolean | null
  invoice_id: string | null
}

export interface ProjectRow {
  project_id: string
  name: string | null
  project_type: string | null
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
 * REGEL 1 — godkänd ÄTA utan säker fakturakoppling.
 *
 * Kräver att projektet är avslutat. En påskriven ÄTA mitt i ett pågående
 * projekt är ett avtal om pris, inte bevis på utfört arbete.
 */
export function findUninvoicedAta(
  atas: AtaRow[],
  projects: Map<string, ProjectRow>,
  invoices: InvoiceRow[],
  now: Date,
): MissedRevenueFinding[] {
  const invoicedProjects = new Set(invoices.map(invoice => invoice.project_id).filter(Boolean))
  const out: MissedRevenueFinding[] = []
  for (const a of atas) {
    if (!a.signed_at || a.invoiced_at || a.invoice_id) continue
    // Avgående ÄTA minskar kontraktet och är aldrig missad intäkt. Okänd typ
    // failar stängt; dagens riktiga skapare skriver addition/change/removal.
    if (a.change_type !== 'addition' && a.change_type !== 'change') continue
    const p = projects.get(a.project_id)
    // En signatur godkänner priset, inte att arbetet är utfört. Före avslut är
    // detta ett avtal, inte missad intäkt, och ska därför inte larma.
    if (!p || p.status !== 'completed' || !isPastGrace(p.completed_at, now)) continue
    const sourceAmount = kr(a.amount)
    if (sourceAmount < MIN_AMOUNT_KR) continue
    const hasLinkedInvoice = invoicedProjects.has(a.project_id)
    out.push({
      kind: 'ata_ej_fakturerad',
      projectId: a.project_id,
      projectName: nameOf(p),
      amountKr: hasLinkedInvoice ? 0 : sourceAmount,
      sourceAmountKr: sourceAmount,
      confidence: hasLinkedInvoice ? 'NEEDS_REVIEW' : 'LIKELY_UNBILLED',
      action: hasLinkedInvoice ? 'REVIEW_ONLY' : 'DRAFT_AFTER_REVIEW',
      sourceIds: [a.id],
      evidence: hasLinkedInvoice
        ? `Kunden skrev under ${a.signed_at.slice(0, 10)}, men projektet har redan en kopplad faktura — kontrollera om tillägget ingår`
        : `Kunden skrev under ${a.signed_at.slice(0, 10)}, projektet är avslutat och tillägget saknar fakturakoppling${a.description ? ` — ${a.description.slice(0, 60)}` : ''}`,
      dedupeKey: `ata:${a.id}`,
      // Utkastet följer ACTION, inte kind: bara när klassificeringen säger
      // DRAFT_AFTER_REVIEW finns underlag nog att visa en rad. ÄTA:n bär
      // redan sin text och sitt belopp — inget genereras, inget gissas.
      ...(hasLinkedInvoice
        ? {}
        : {
            draftLines: [{
              description: a.description?.trim() || 'Tilläggsarbete enligt signerad ÄTA',
              amount_kr: sourceAmount,
            }],
          }),
    })
  }
  return out
}

/**
 * REGEL 2 — material markerat ofakturerat på avslutat projekt.
 *
 * Summeras PER PROJEKT, inte per rad. Fastpris/okänd faktureringsform och
 * projekt som redan har faktura blir review-only utan belopp i potentialen.
 */
export function findUninvoicedMaterial(
  materials: MaterialRow[],
  projects: Map<string, ProjectRow>,
  invoices: InvoiceRow[],
  now: Date,
): MissedRevenueFinding[] {
  const invoicedProjects = new Set(invoices.map(invoice => invoice.project_id).filter(Boolean))
  const perProject = new Map<string, { amount: number; sourceIds: string[] }>()
  for (const m of materials) {
    if (m.invoiced || m.invoice_id) continue
    const p = projects.get(m.project_id)
    if (!p || p.status !== 'completed' || !isPastGrace(p.completed_at, now)) continue
    const group = perProject.get(m.project_id) || { amount: 0, sourceIds: [] }
    group.amount += kr(m.total_sell)
    group.sourceIds.push(m.id)
    perProject.set(m.project_id, group)
  }

  const out: MissedRevenueFinding[] = []
  for (const [projectId, group] of Array.from(perProject.entries())) {
    if (group.amount < MIN_AMOUNT_KR) continue
    const p = projects.get(projectId)
    if (!p) continue
    const billableContract = p.project_type === 'hourly' || p.project_type === 'mixed'
    const hasLinkedInvoice = invoicedProjects.has(projectId)
    const likely = billableContract && !hasLinkedInvoice
    out.push({
      kind: 'material_ej_fakturerat',
      projectId,
      projectName: nameOf(p),
      amountKr: likely ? group.amount : 0,
      sourceAmountKr: group.amount,
      confidence: likely ? 'LIKELY_UNBILLED' : 'NEEDS_REVIEW',
      action: 'REVIEW_ONLY',
      sourceIds: group.sourceIds,
      evidence: !billableContract
        ? `Material är registrerat, men projektets faktureringsform är ${p.project_type === 'fixed_price' ? 'fastpris' : 'okänd'} — kostnaden kan redan ingå i avtalet`
        : hasLinkedInvoice
          ? `Material är markerat ofakturerat, men projektet har redan en kopplad faktura — kontrollera källraderna`
          : `Material är markerat ofakturerat på ett avslutat ${p.project_type === 'mixed' ? 'blandprojekt' : 'projekt på löpande räkning'}`,
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
      sourceAmountKr: 0,
      confidence: 'NEEDS_REVIEW',
      action: 'REVIEW_ONLY',
      sourceIds: [],
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
  /** dedupeKeys som redan rapporterats, även om kortet har avfärdats. */
  alreadyReported: Set<string>
  now: Date
}): MissedRevenueFinding[] {
  const byId = new Map(input.projects.map(p => [p.project_id, p]))
  const all = [
    ...findUninvoicedAta(input.atas, byId, input.invoices, input.now),
    ...findUninvoicedMaterial(input.materials, byId, input.invoices, input.now),
    ...findCompletedWithoutInvoice(input.projects, input.invoices, input.now),
  ]
  return all
    .filter(f => !input.alreadyReported.has(f.dedupeKey))
    .sort((a, b) => b.amountKr - a.amountKr)
}

/**
 * Rubriken för ett fakturera_projekt-kort — kortet som bär ett FÄRDIGT utkast.
 *
 * Deterministisk och utan AI: namnet, månaden projektet blev klart och det
 * belopp kunden betalar. "Fakturan är ifylld och redo" är sant i exakt det
 * ögonblick kortet skapas — cronen persisterar hela previewn i samma veva.
 */
export function fakturaKortTitel(
  projectName: string,
  completedAt: string | null,
  kundenBetalarKr: number,
): string {
  const namn = projectName?.trim() || 'Projektet'
  const belopp = `${Math.round(kundenBetalarKr).toLocaleString('sv-SE')} kr`
  const t = completedAt ? Date.parse(completedAt) : NaN
  if (!Number.isFinite(t)) {
    return `${namn} är klart — fakturan är ifylld och redo · ${belopp}`
  }
  const manad = new Date(t).toLocaleDateString('sv-SE', { month: 'long' })
  return `${namn} blev klart i ${manad} — fakturan är ifylld och redo · ${belopp}`
}

/** Svensk rubrik till kortet. */
export function findingTitle(f: MissedRevenueFinding): string {
  const belopp = f.amountKr > 0 ? ` — ${f.amountKr.toLocaleString('sv-SE')} kr` : ''
  switch (f.kind) {
    case 'ata_ej_fakturerad':
      return `Godkänt tilläggsarbete behöver fakturakontroll${belopp}`
    case 'material_ej_fakturerat':
      return `Material behöver fakturakontroll${belopp}`
    case 'projekt_utan_faktura':
      return `Avslutat projekt saknar faktura`
  }
}
