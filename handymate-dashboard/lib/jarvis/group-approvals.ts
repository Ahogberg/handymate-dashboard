/**
 * Ett ärende per kort — sammanslagning av dubbletter (innehållskontraktet
 * regel 3).
 *
 * ═══ VAD SOM VAR FEL ═══
 *
 * Två förfallna fakturor visades som två identiska Karin-kort intill
 * varandra: samma rubrik, samma brödtext, samma knappar, bara olika
 * fakturanummer i en undertitel de flesta inte läser. Claude Design kallade
 * det "symptomet man ser först" — det läser som ett fel även för den som inte
 * kan förklara varför.
 *
 * Och det ÄR ett fel, men inte i renderingen: varje dedupe-mekanism i
 * systemet är byggd för att hålla ärendena isär (en approval per invoice_id,
 * per lead_id, per project_id). Det är rätt på producentsidan. Felet är att
 * ytan sedan visar databasrader i stället för BESLUT.
 *
 * Två förfallna fakturor till samma kund är ett beslut: "ska jag påminna?"
 *
 * ═══ REGELN ═══
 *
 * Samma agent + samma approval_type + samma dygn slås ihop. Källraderna
 * finns kvar synliga i kortet — sammanslagning får aldrig betyda att
 * information försvinner, bara att den slutar upprepas.
 *
 * Formen finns redan i kodbasen: findUninvoicedMaterial
 * (lib/value/missed-revenue.ts) producerar { ett fynd, sourceIds[], summa }
 * och är facit-testad. Det här är samma form, en nivå upp.
 *
 * Ren funktion — ingen DB, ingen React.
 */

import { agentForApproval } from '@/lib/jarvis/approval-view'

export interface GroupableApproval {
  id: string
  approval_type: string
  title: string
  description: string | null
  payload: Record<string, unknown>
  risk_level: string | null
  created_at: string
}

export interface ApprovalGroup<T extends GroupableApproval = GroupableApproval> {
  /** Det representativa kortet — äldst i gruppen, alltså det som väntat längst. */
  primary: T
  /** Alla ingående kort, inklusive primary. Ett ensamt kort ger längd 1. */
  members: T[]
  /** True när gruppen faktiskt slog ihop något. */
  merged: boolean
}

/** Dygnsnyckel i lokal tid — ett kort från 23:50 och ett från 00:10 är olika dagar. */
function dygn(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/**
 * Typer som ALDRIG slås ihop, oavsett agent och dygn.
 *
 * Ett kort som bär ett färdigt utkast är ett eget beslut med egna rader och
 * ett eget belopp — två offertutkast bredvid varandra är två olika offerter,
 * inte en upprepning. Att slå ihop dem hade dolt exakt det innehåll som
 * regel 1 kräver ska synas.
 */
const ALDRIG_SLA_IHOP = new Set([
  'create_quote_draft',
  'create_ata_draft',
  'review_auto_invoice',
])

/**
 * Grupperar kort på (agent, typ, dygn). Ordningen bevaras: gruppen hamnar
 * där dess äldsta medlem låg, så listan inte hoppar omkring mellan
 * uppdateringar.
 */
export function groupApprovals<T extends GroupableApproval>(approvals: T[]): Array<ApprovalGroup<T>> {
  const grupper = new Map<string, T[]>()
  const ordning: string[] = []

  for (const a of approvals) {
    const nyckel = ALDRIG_SLA_IHOP.has(a.approval_type)
      // Unik nyckel per kort → gruppen blir alltid ensam.
      ? `ensam:${a.id}`
      : `${agentForApproval(a)}|${a.approval_type}|${dygn(a.created_at)}`

    if (!grupper.has(nyckel)) {
      grupper.set(nyckel, [])
      ordning.push(nyckel)
    }
    grupper.get(nyckel)!.push(a)
  }

  return ordning.map(nyckel => {
    const medlemmar = grupper.get(nyckel)!
    // Äldst först — det kortet har väntat längst och får representera gruppen.
    const sorterade = [...medlemmar].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    return {
      primary: sorterade[0],
      members: sorterade,
      merged: sorterade.length > 1,
    }
  })
}

/**
 * Rubriken för ett sammanslaget kort.
 *
 * Antalet står FÖRST — det är den nya informationen. Beloppet tas med bara
 * när varje medlem faktiskt bär ett, annars vore summan en halvsanning.
 * Samma ärlighetsregel som momentlagret: hellre ett antal än ett påhittat
 * belopp.
 */
export function groupTitle(group: ApprovalGroup, totalKr?: number | null): string {
  if (!group.merged) return group.primary.title

  const n = group.members.length
  const typ = ordForTyp(group.primary.approval_type, n)
  return typeof totalKr === 'number' && totalKr > 0
    ? `${n} ${typ} — ${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(totalKr)} kr totalt`
    : `${n} ${typ}`
}

function ordForTyp(approvalType: string, antal: number): string {
  const flertal = antal !== 1
  switch (approvalType) {
    case 'invoice_reminder': return flertal ? 'fakturor har förfallit' : 'faktura har förfallit'
    case 'missad_intakt': return flertal ? 'intäktsfynd' : 'intäktsfynd'
    case 'send_sms': return flertal ? 'meddelanden att skicka' : 'meddelande att skicka'
    case 'lead_review': return flertal ? 'nya leads' : 'ny lead'
    default: return flertal ? 'ärenden' : 'ärende'
  }
}

/**
 * Summerar gruppens belopp — men bara om ALLA medlemmar bär ett.
 *
 * Returnerar null annars. En summa av tre kort där ett saknar belopp är
 * inte en summa, den är en gissning som ser exakt ut.
 */
export function groupTotalKr(
  group: ApprovalGroup,
  beloppFor: (a: GroupableApproval) => number | null | undefined,
): number | null {
  if (!group.merged) return null
  let summa = 0
  for (const m of group.members) {
    const v = beloppFor(m)
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null
    summa += v
  }
  return summa
}
