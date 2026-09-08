/**
 * Hur ett godkännande presenteras — agent, etikett, brådska (2026-08-07).
 *
 * Låg tidigare inlinead i IdagCore.tsx. Bryts ut hit så hemskärmen och Idag-vyn
 * inte kan hamna på olika agent eller olika etikett för samma ärende — samma
 * felklass som de fyra agentkopiorna (spår D1).
 *
 * Rena funktioner — tests/approval-view.spec.ts.
 */

import { classify } from '@/lib/approvals/action-contract'
import { AGENT_INFO } from '@/components/dashboard/agentPersonas'

interface ApprovalLike {
  approval_type: string
  risk_level?: string | null
  payload?: Record<string, unknown> | null
  title?: string | null
  description?: string | null
}

/**
 * Vilken agent som äger ärendet.
 *
 * Explicit routing i payloaden går alltid först — cron-skapade ärenden sätter
 * `routed_agent`. Först därefter regeltolkning av typen.
 */
export function agentForApproval(approval: ApprovalLike): string {
  const routed =
    (approval.payload?.routed_agent as string)
    || (approval.payload?.agent_id as string)
    // Äldre Hanna-producenter (garanti/proactive care) använder `agent`.
    // Det är fortfarande explicit metadata och ska vinna över typgissningen.
    || (approval.payload?.agent as string)
    || null
  if (routed && AGENT_INFO[routed]) return routed

  const t = approval.approval_type
  if (t.includes('invoice') || t.includes('faktur') || t.includes('payment') || t === 'profitability_warning') return 'karin'
  if (t.includes('campaign') || t.includes('neighbour') || t.includes('reactivat') || t.includes('review')) return 'hanna'
  if (t.includes('quote') || t.includes('lead') || t.includes('pipeline')) return 'daniel'
  if (t.includes('booking') || t.includes('project') || t.includes('dispatch') || t.includes('job_report') || t.includes('warranty')) return 'lars'
  if (t.includes('call') || t.includes('sms')) return 'lisa'
  return 'matte'
}

export const TYPE_LABEL: Record<string, string> = {
  send_sms: 'SMS',
  seasonal_campaign: 'Säsongskampanj',
  send_email: 'E-post',
  send_quote: 'Offert',
  send_invoice: 'Faktura',
  create_booking: 'Bokning',
  lead_review: 'Ny lead',
  quote_nudge: 'Manuell åtgärd',
  review_request: 'Recension',
  manual_project_create: 'Skapa projekt',
  autonomy_offer: 'Förtroende',
  confirm_payment: 'Betalning',
  review_auto_invoice: 'Faktura',
  publish_microsite: 'Hemsida',
  invoice_reminder: 'Påminnelse',
  egenkontroll_foto: 'Egenkontroll',
  egenkontroll_avvikelse: 'Egenkontroll-avvikelse',
  checklist_forslag: 'Checklista',
  tidrapport_forslag: 'Tidrapport',
  create_quote_draft: 'Offertutkast',
  create_ata_draft: 'ÄTA-förslag',
  fakturera_projekt: 'Faktura',
  meeting_summary: 'Möte',
  meeting_followup: 'Uppföljning från möte',
  // Samtalsefterarbete (2026-09-01): samtalet som dagboksrad på projektet.
  project_log_note: 'Dagboksanteckning',
  // Startkorten (docs/design/FORSTA-30-MINUTERNA.md).
  team_intro: 'Ditt team',
  // Måndagskortet (2026-08-13) — veckovis lägesbild, se lib/jarvis/monday-brief.ts.
  monday_brief: 'Måndagskortet',
}

export function typeLabel(approvalType: string): string {
  return TYPE_LABEL[approvalType] || 'Förslag'
}

/**
 * ═══ AMBER ANVÄNDS BARA NÄR DET ÄR SANT ═══
 *
 * Vänsterkanten i amber betyder: **pengar eller tid går förlorade om ingen
 * tittar.** En förfallen faktura, ja. En ny lead, nej — den är en nyhet. En
 * offert är rutin.
 *
 * Listan är medvetet kort och explicit. Att koppla den till `risk_level`
 * hade sett generellt ut men gett amber på var tredje kort, och då slutar man
 * läsa amber — samma sparsamhetsprincip som i offertflödets granskning.
 */
const BRADSKANDE = new Set(['invoice_reminder', 'confirm_payment'])

export function needsAttention(approval: ApprovalLike): boolean {
  return BRADSKANDE.has(approval.approval_type)
}

/** First action opens review; the final effect-specific label comes from the
 * server-bound review. Informational cards only acknowledge reading. */
export function approveLabel(approvalType: string, _payload?: Record<string, unknown> | null): string {
  const klass = classify(approvalType)
  return klass === 'INFORMATIONAL' || klass === 'ACKNOWLEDGEMENT' ? 'Jag har läst det' : 'Granska'
}

/**
 * Ring-uppmaningen — kortet vars hela poäng är att MÄNNISKAN ringer.
 *
 * "Ring kund om offert / Vill du ringa kunden?" (create_approval-regeln) gav
 * tidigare Godkänn → Bekräfta-modal → ingenting. Servern kan inte ringa;
 * det enda ärliga kortet är en tel:-knapp med kundens nummer (Andreas fynd
 * 2026-08-10). Numret läggs i payloaden av threshold-motorn
 * (fetchCustomerContacts).
 *
 * Deterministisk detektion: ordet "ring" i rubrik/beskrivning + ett nummer i
 * payloaden. Ordgränsen friar "fakturering" och "beställning"; utan nummer
 * finns ingen knapp — aldrig en trasig tel:-länk.
 */
export function ringUppmaning(approval: ApprovalLike): { label: string; href: string } | null {
  const pl = (approval.payload || {}) as Record<string, any>
  const telefon = typeof pl.customer_phone === 'string' ? pl.customer_phone.trim() : ''
  if (!telefon) return null
  const text = `${approval.title || ''} ${approval.description || ''}`
  if (!/\bring/i.test(text)) return null
  const fornamn =
    typeof pl.customer_name === 'string' && pl.customer_name.trim()
      ? pl.customer_name.trim().split(' ')[0]
      : 'kunden'
  return { label: `Ring ${fornamn}`, href: `tel:${telefon.replace(/[^\d+]/g, '')}` }
}

/** Djuplänken in i den sida ärendet hör hemma på, eller null. */
export function deepLinkFor(approval: ApprovalLike): { label: string; href: string } | null {
  const pl = (approval.payload || {}) as Record<string, any>
  const t = approval.approval_type

  if (t === 'invoice_reminder' && pl.invoice_id) {
    return { label: 'Öppna fakturan →', href: `/dashboard/invoices/${pl.invoice_id}` }
  }
  if (t === 'create_quote_draft' && pl.lead_id) {
    return { label: 'Öppna leaden →', href: `/dashboard/pipeline?lead=${pl.lead_id}` }
  }
  if (t === 'fakturera_projekt' && pl.project_id) {
    return { label: 'Läs & ändra →', href: `/dashboard/projects/${pl.project_id}` }
  }
  // Bara när Guardian själv sett en ÄTA-vinkel (osäkrad/väntande ÄTA-intäkt)
  // pekar länken mot ÄTA-fliken — annars är det ett rent kostnadsöverdrag
  // (t.ex. ineffektivt arbete) utan något att fakturera för, och "Skapa ÄTA"
  // vore en gissning kortet inte har täckning för (lib/projects/margin-guardian.ts).
  if (t === 'profitability_warning' && pl.project_id) {
    return pl.ata_signal
      ? { label: 'Skapa ÄTA →', href: `/dashboard/projects/${pl.project_id}?tab=changes` }
      : { label: 'Öppna projektet →', href: `/dashboard/projects/${pl.project_id}` }
  }
  if (t === 'publish_microsite') return { label: 'Visa först →', href: '/dashboard/website' }
  if (t.includes('booking')) return { label: 'Öppna kalendern →', href: '/dashboard/schedule' }
  // Startkorten: bara Karins kort (payload.agent_id) länkar vidare — Lisas
  // och Daniels är rena presentationskort utan en egen sida att öppna.
  if (t === 'team_intro' && pl.agent_id === 'karin') {
    return { label: 'Öppna pengar →', href: '/dashboard/pengar' }
  }
  return null
}

/**
 * Presentationskontraktet som API:et skickar med varje kort (Etapp F,
 * 2026-09-02): `display: {type_label, agent, approve_label}`. Mobilen och
 * andra klienter slipper då sina egna etikettkartor — som drev isär
 * (create_ata_draft/project_log_note föll till "Förslag" i appen fast
 * desktop sa "ÄTA-förslag"/"Dagboksanteckning").
 */
export interface ApprovalDisplay {
  type_label: string
  agent: string
  approve_label: string
}

export function approvalDisplay(approval: ApprovalLike): ApprovalDisplay {
  return {
    type_label: typeLabel(approval.approval_type),
    agent: agentForApproval(approval),
    approve_label: approveLabel(approval.approval_type, approval.payload ?? null),
  }
}
