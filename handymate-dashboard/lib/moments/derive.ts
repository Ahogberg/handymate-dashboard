/**
 * AgentMoment — teamets fynd, härledda ur det som redan finns.
 *
 * ═══ VARFÖR HÄRLETT OCH INTE EN EGEN TABELL ═══
 *
 * Ett moment är ett fynd med ett ansikte: "Karin hittade 34 900 kr
 * ofakturerat". Fynden FINNS redan — som godkännandekort med belopp i
 * payload och som agentobservationer i business_knowledge. En egen
 * moments-tabell hade blivit en tredje sanning som glider mot de två
 * första, precis som agentfärgerna en gång gled mellan fyra kopior.
 *
 * Härledningen är en ren funktion. Demon seedar RADER (kort och
 * observationer) — aldrig färdiga moments — så demo och produktion går
 * genom exakt samma väg. Ingen teaterkod som kastas efter lanseringen.
 *
 * ═══ ÄRLIGHETSREGLERNA (facit-låsta i tests/moments.spec.ts) ═══
 *
 * 1. amountKr sätts BARA när ett verkligt belopp finns i källraden.
 *    Saknas belopp utelämnas fältet — aldrig 0, aldrig en uppskattning.
 * 2. `projekt_utan_faktura` har amount_kr = 0 i svepet (beloppet är
 *    okänt — det finns ingen faktura att läsa det ur). Det visas som en
 *    upptäckt utan siffra, aldrig som "0 kr".
 * 3. valueKind blandas aldrig: potential är inte realiserat, en insikt
 *    utan belopp låtsas inte vara pengar.
 * 4. Belopp läses ur STRUKTURERADE fält, aldrig ur beskrivningstext.
 */

export type MomentValueKind = 'potential' | 'risk' | 'insikt'

export interface AgentMoment {
  /** Härledd och stabil: "appr:<id>" | "obs:<id>" — bär sedd-markeringen. */
  id: string
  agentId: string
  entityType?: 'customer' | 'quote' | 'project' | 'invoice'
  entityId?: string
  headline: string
  explanation: string
  valueKind: MomentValueKind
  /** Utelämnas när källan saknar ett verkligt belopp. */
  amountKr?: number
  urgency: 'low' | 'medium' | 'high'
  action: { label: string; href: string }
  createdAt: string
}

export interface ApprovalRow {
  id: string
  approval_type: string
  title: string
  description: string | null
  payload: Record<string, unknown> | null
  created_at: string
}

export interface ObservationRow {
  id: string
  agent_id: string
  title: string
  observation: string
  suggestion: string | null
  related_approval_id: string | null
  created_at: string
}

export function formatKr(n: number): string {
  return `${Math.round(n).toLocaleString('sv-SE')} kr`
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/** Belopp → brådska. Trösklarna delas med interruption-motorn. */
export function urgencyForAmount(amountKr: number | null): 'low' | 'medium' | 'high' {
  if (amountKr === null) return 'low'
  if (amountKr >= 10_000) return 'high'
  if (amountKr >= 2_000) return 'medium'
  return 'low'
}

/**
 * Godkännandekort → moment.
 *
 * Bara typer med ett STRUKTURERAT värdefält härleds. Kort utan belopp har
 * redan sin yta (kön) — ett moment utan siffra ur den källan tillför bara
 * brus i en kanal som ska vara gles.
 *
 * `invoiceAmounts` slås upp av API-rutten (payload.invoice_id → belopp) —
 * invoice_reminder bär inte beloppet själv, och det får ALDRIG läsas ur
 * beskrivningstexten.
 */
export function deriveFromApprovals(
  approvals: ApprovalRow[],
  invoiceAmounts: Record<string, number> = {},
): AgentMoment[] {
  const ut: AgentMoment[] = []

  for (const a of approvals) {
    const p = a.payload ?? {}

    if (a.approval_type === 'missad_intakt') {
      const belopp = num(p.amount_kr)
      const projektId = str(p.project_id)
      const projektNamn = str(p.project_name) ?? 'ett projekt'
      ut.push({
        id: `appr:${a.id}`,
        agentId: str(p.routed_agent) ?? 'karin',
        entityType: 'project',
        entityId: projektId ?? undefined,
        headline: belopp
          ? `${formatKr(belopp)} klart att fakturera i ${projektNamn}`
          : `Avslutat projekt utan faktura: ${projektNamn}`,
        explanation: str(p.evidence) ?? a.description ?? a.title,
        valueKind: 'potential',
        ...(belopp ? { amountKr: belopp } : {}),
        urgency: urgencyForAmount(belopp),
        action: {
          label: belopp ? `Fakturera ${formatKr(belopp)}` : 'Granska projektet',
          href: projektId ? `/dashboard/projects/${projektId}` : '/dashboard/approvals',
        },
        createdAt: a.created_at,
      })
      continue
    }

    if (a.approval_type === 'profitability_warning') {
      const overrun = num(p.projected_overrun)
      const projektId = str(p.project_id)
      const projektNamn = str(p.project_name) ?? 'ett projekt'
      ut.push({
        id: `appr:${a.id}`,
        agentId: str(p.agent_id) ?? 'karin',
        entityType: 'project',
        entityId: projektId ?? undefined,
        headline: overrun
          ? `${projektNamn} är på väg att spräcka kalkylen med ${formatKr(overrun)}`
          : `${projektNamn} avviker från kalkylen`,
        explanation: a.description ?? a.title,
        valueKind: 'risk',
        ...(overrun ? { amountKr: overrun } : {}),
        urgency: urgencyForAmount(overrun),
        action: {
          label: overrun ? `Skydda ${formatKr(overrun)} marginal` : 'Se avvikelsen',
          href: projektId ? `/dashboard/projects/${projektId}` : '/dashboard/projects',
        },
        createdAt: a.created_at,
      })
      continue
    }

    if (a.approval_type === 'invoice_reminder') {
      const fakturaId = str(p.invoice_id)
      const belopp = fakturaId ? num(invoiceAmounts[fakturaId]) : null
      ut.push({
        id: `appr:${a.id}`,
        agentId: 'karin',
        entityType: 'invoice',
        entityId: fakturaId ?? undefined,
        headline: belopp
          ? `${formatKr(belopp)} förfallet — påminnelsen är klar att skicka`
          : 'En förfallen faktura har en färdig påminnelse',
        explanation: a.description ?? a.title,
        valueKind: 'potential',
        ...(belopp ? { amountKr: belopp } : {}),
        urgency: urgencyForAmount(belopp),
        action: {
          label: belopp ? `Påminn om ${formatKr(belopp)}` : 'Granska påminnelsen',
          href: '/dashboard/approvals',
        },
        createdAt: a.created_at,
      })
      continue
    }

    if (a.approval_type === 'create_quote_draft') {
      const varde = num(p.estimated_value)
      ut.push({
        id: `appr:${a.id}`,
        agentId: 'daniel',
        entityType: 'quote',
        headline: varde
          ? `Offertutkast klart — uppskattat värde ${formatKr(varde)}`
          : a.title,
        explanation: a.description ?? a.title,
        valueKind: 'potential',
        ...(varde ? { amountKr: varde } : {}),
        urgency: urgencyForAmount(varde),
        action: { label: 'Öppna utkastet', href: '/dashboard/approvals' },
        createdAt: a.created_at,
      })
      continue
    }
  }

  return ut
}

/**
 * Observationer → moment.
 *
 * En observation har aldrig ett strukturerat belopp (business_knowledge
 * saknar värdekolumn) — den blir en insikt utan siffra, aldrig pengar.
 * Observationer vars ärende redan blivit ett kort filtreras bort: samma
 * fynd ska inte knacka två gånger.
 */
export function deriveFromObservations(observations: ObservationRow[]): AgentMoment[] {
  return observations
    .filter(o => !o.related_approval_id)
    .map(o => ({
      id: `obs:${o.id}`,
      agentId: o.agent_id,
      headline: o.title,
      explanation: o.observation + (o.suggestion ? ` ${o.suggestion}` : ''),
      valueKind: 'insikt' as const,
      urgency: 'low' as const,
      action: { label: 'Läs mer', href: '/dashboard' },
      createdAt: o.created_at,
    }))
}

/** Allt ihop, nyast-med-högst-värde först. */
export function deriveMoments(
  approvals: ApprovalRow[],
  observations: ObservationRow[],
  invoiceAmounts: Record<string, number> = {},
): AgentMoment[] {
  const alla = [
    ...deriveFromApprovals(approvals, invoiceAmounts),
    ...deriveFromObservations(observations),
  ]
  return alla.sort((a, b) => (b.amountKr ?? 0) - (a.amountKr ?? 0) || b.createdAt.localeCompare(a.createdAt))
}
