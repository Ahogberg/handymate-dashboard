/**
 * Hur ett godkännande presenteras — agent, etikett, brådska (2026-08-07).
 *
 * Låg tidigare inlinead i IdagCore.tsx. Bryts ut hit så hemskärmen och Idag-vyn
 * inte kan hamna på olika agent eller olika etikett för samma ärende — samma
 * felklass som de fyra agentkopiorna (spår D1).
 *
 * Rena funktioner — tests/approval-view.spec.ts.
 */

import { AGENT_INFO } from '@/components/dashboard/agentPersonas'

interface ApprovalLike {
  approval_type: string
  risk_level?: string | null
  payload?: Record<string, unknown> | null
}

/**
 * Vilken agent som äger ärendet.
 *
 * Explicit routing i payloaden går alltid först — cron-skapade ärenden sätter
 * `routed_agent`. Först därefter regeltolkning av typen.
 */
export function agentForApproval(approval: ApprovalLike): string {
  const routed =
    (approval.payload?.routed_agent as string) || (approval.payload?.agent_id as string) || null
  if (routed && AGENT_INFO[routed]) return routed

  const t = approval.approval_type
  if (t.includes('invoice') || t.includes('payment') || t === 'profitability_warning') return 'karin'
  if (t.includes('campaign') || t.includes('neighbour') || t.includes('reactivat') || t.includes('review')) return 'hanna'
  if (t.includes('quote') || t.includes('lead') || t.includes('pipeline')) return 'daniel'
  if (t.includes('booking') || t.includes('project') || t.includes('dispatch') || t.includes('job_report') || t.includes('warranty')) return 'lars'
  if (t.includes('call') || t.includes('sms')) return 'lisa'
  return 'matte'
}

export const TYPE_LABEL: Record<string, string> = {
  send_sms: 'SMS',
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

/**
 * Texten på Godkänn-knappen.
 *
 * "Godkänn" i största allmänhet säger inte vad som händer. "Skicka
 * påminnelsen" gör det — och den som trycker ska veta vad han sätter igång.
 */
export function approveLabel(approvalType: string): string {
  if (approvalType === 'invoice_reminder') return 'Skicka påminnelsen'
  // create_quote_draft SKAPAR offerten som utkast — den skickas inte.
  // Exekveraren POST:ar till /api/quotes och returnerar ett quote_id; något
  // utskick sker aldrig (approvals/[id]/route.ts, case 'create_quote_draft').
  // "Godkänn & skicka" hade alltså varit en osanning på själva knappen.
  if (approvalType === 'create_quote_draft') return 'Skapa offerten'
  if (approvalType === 'create_ata_draft') return 'Skapa ÄTA:n'
  if (approvalType === 'send_quote') return 'Godkänn & skicka'
  if (approvalType === 'send_sms') return 'Skicka'
  if (approvalType === 'autonomy_offer') return 'Ja, kör automatiskt'
  return 'Godkänn'
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
  if (t === 'publish_microsite') return { label: 'Visa först →', href: '/dashboard/website' }
  if (t.includes('booking')) return { label: 'Öppna kalendern →', href: '/dashboard/schedule' }
  return null
}
