/**
 * Kö-routing för pending_approvals: vem får se och besluta om vilket kort.
 * Schemat (routing_role, routed_business_user_id) ligger i
 * sql/v77_pending_approvals_routing.sql med RLS som bakstopp.
 *
 * 2026-09-09 (Andreas: "extremt kritiskt att alla godkännandekort får rätt
 * typer av grind för rätt behörighet"). Före den här körningen var grinden
 * i praktiken verkningslös, av tre skäl som förstärkte varandra:
 *
 *   1. `routing_role` har DB-default 'any', och de flesta creation-sites
 *      sätter aldrig fältet. canActOnApproval läste kolumnen FÖRE tabellen,
 *      så ROUTING_TABLE var död kod för varje rad som inte stämplats för
 *      hand. I produktion låg 23 av 26 väntande kort på 'any'.
 *   2. Tabellen täckte 14 av 65 typer som skapas i koden. Resten föll
 *      tillbaka på 'any'.
 *   3. Både okänd bucket och project_team utan project_id föll tillbaka
 *      till true, alltså till alla.
 *
 * Följden var att en anställd såg och kunde godkänna massutskick
 * (seasonal_campaign), offertuppföljningar med belopp (quote_nudge) och
 * utgående kund-SMS.
 *
 * Nu gäller: lagrat 'any' behandlas som "ingen har tagit ställning" och
 * faller igenom till tabellen; tabellen har en uttrycklig rad per typ som
 * skapas i koden; okänd typ och okänd bucket faller STÄNGT till ägare/admin.
 * tests/kortgrindar-per-behorighet.spec.ts fallerar om en ny korttyp saknar
 * rad, eller om en pengar- eller massutskickstyp klassas som 'any'.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { hasPermission, isOwnerOrAdmin, type BusinessUser } from '@/lib/permissions'

export type RoutingRole =
  | 'any'
  | 'owner_admin'
  | 'can_approve_time'
  | 'project_team'
  | 'can_see_financials'
  | 'can_create_invoices'

/**
 * Ren uppslagstabell approval_type → RoutingRole.
 *
 * Etapp 3a höll sig MEDVETET till fyra buckets (any/owner_admin/
 * can_approve_time/project_team) — den fullständiga tabellen från
 * planfilen har fler buckets (can_create_invoices, can_see_financials,
 * assignee, m.fl.) som INTE finns i RoutingRole än. Etapp 3b fyller bara
 * i de typer som mappar mot de fyra existerande buckets — typer som
 * skulle behöva en ny bucket (t.ex. price_adjustment → can_see_financials,
 * send_invoice → can_create_invoices) lämnas medvetet utanför tabellen
 * (fallback 'any', oförändrat beteende) tills den bucketen faktiskt läggs
 * till i RoutingRole i en senare körning.
 *
 * Okänd/ej listad typ → 'any' (fallback, ingen beteendeförändring).
 */
const ROUTING_TABLE: Partial<Record<string, RoutingRole>> = {
  // ---- owner_admin: företagsomfattande räckvidd, mandat, publicering,
  // utgående marknadsföring, inköp och abonnemang. Godkännandet binder hela
  // firman eller ändrar hur den uppträder utåt.
  agent_insight: 'owner_admin',
  automation: 'owner_admin',
  autonomy_offer: 'owner_admin',
  autonomy_revoked: 'owner_admin',
  autopilot_package: 'owner_admin',
  cert_expiry_reminder: 'owner_admin',
  create_booking: 'owner_admin',
  customer_reactivation: 'owner_admin',
  deal_flow_site_visit: 'owner_admin',
  dispatch_suggestion: 'owner_admin',
  expectation_drift_signal: 'owner_admin',
  external_delivery_failure_signal: 'owner_admin',
  four_eyes_project_close: 'owner_admin',
  four_eyes_quote: 'owner_admin',
  karin_deadline: 'owner_admin',
  kort_gar_ut: 'owner_admin',
  lead_review: 'owner_admin',
  low_stock_alert: 'owner_admin',
  mandate_paused_signal: 'owner_admin',
  manual_project_create: 'owner_admin',
  monday_brief: 'owner_admin',
  monthly_review: 'owner_admin',
  new_booking_request: 'owner_admin',
  operating_experiment_proposal: 'owner_admin',
  operating_experiment_readout: 'owner_admin',
  payment_failed_signal: 'owner_admin',
  // En bekräftad playbook-regel formar ALLA framtida offerter av jobbtypen.
  playbook_pattern_confirmation: 'owner_admin',
  proactive_care: 'owner_admin',
  promise_deadline_signal: 'owner_admin',
  publish_microsite: 'owner_admin',
  review_request: 'owner_admin',
  scheduled_review_request: 'owner_admin',
  // Massutskick: ett ja når varje kund i registret.
  seasonal_campaign: 'owner_admin',
  team_intro: 'owner_admin',
  warranty_followup: 'owner_admin',
  yearly_followup: 'owner_admin',

  // ---- can_see_financials: kortet visar eller ändrar pris, marginal eller
  // lönsamhet. Den som inte får se siffrorna ska inte heller besluta om dem.
  create_quote_draft: 'can_see_financials',
  missad_intakt: 'can_see_financials',
  price_adjustment: 'can_see_financials',
  profitability_warning: 'can_see_financials',
  quote_nudge: 'can_see_financials',
  quote_signed: 'can_see_financials',
  send_quote: 'can_see_financials',

  // ---- can_create_invoices: kortet skapar, skickar eller kvitterar pengar.
  confirm_payment: 'can_create_invoices',
  create_invoice_from_report: 'can_create_invoices',
  fakturera_projekt: 'can_create_invoices',
  invoice_reminder: 'can_create_invoices',
  job_report: 'can_create_invoices',
  review_auto_invoice: 'can_create_invoices',
  send_invoice: 'can_create_invoices',

  // ---- can_approve_time
  time_attestation: 'can_approve_time',
  tidrapport_forslag: 'can_approve_time',

  // ---- project_team: gäller ETT projekt och den som är tilldelad det.
  // send_sms/send_email ligger här men grindas påload-medvetet i
  // canActOnApproval: utan project_id i payloaden är det ett utskick i
  // firmans namn utan projektförankring, och då krävs ägare/admin.
  ata_declined_notification: 'project_team',
  ata_signed_notification: 'project_team',
  checklist_forslag: 'project_team',
  create_ata_draft: 'project_team',
  customer_fact: 'project_team',
  egenkontroll_avvikelse: 'project_team',
  egenkontroll_foto: 'project_team',
  installation_register: 'project_team',
  jobbpass_proposal: 'project_team',
  meeting_followup: 'project_team',
  meeting_summary: 'project_team',
  // En föreslagen kontrollpunkt gäller ETT projekt, till skillnad från
  // playbook_pattern_confirmation ovan som formar alla framtida offerter.
  playbook_kickoff_suggestion: 'project_team',
  project_debrief: 'project_team',
  project_log_note: 'project_team',
  send_email: 'project_team',
  send_sms: 'project_team',
}

export function getRoutingBucket(approvalType: string): RoutingRole {
  // Faller STÄNGT. En ny korttyp som ingen klassat hamnar hos ägare/admin
  // tills någon tagit ställning — aldrig hos alla. Facit
  // tests/kortgrindar-per-behorighet.spec.ts kräver en uttrycklig rad per
  // typ som skapas i koden, så fallbacken ska aldrig behöva träda in.
  return ROUTING_TABLE[approvalType] || 'owner_admin'
}

/** Minimal form av en pending_approvals-rad som canActOnApproval behöver. */
export interface ApprovalRoutingRow {
  approval_type: string
  business_id: string
  routing_role?: string | null
  payload?: Record<string, unknown> | null
}

/**
 * Avgör om currentUser får agera (godkänna/avvisa/redigera) på en given
 * approval-rad.
 *
 * Bucket-källa: approval.routing_role (DB-kolumnen, satt av Etapp 3b vid
 * skapande) i första hand — faller tillbaka på getRoutingBucket(
 * approval_type) om kolumnen saknas/är null (rader från innan v77-
 * migrationen körts, eller andra edge-cases). I Etapp 3a är routing_role
 * 'any' på ALLA rader (DB-default, ingen creation-site ändrad än), så
 * denna funktion returnerar `true` för i praktiken alla anrop just nu —
 * infrastrukturen är klar, men gatingen aktiveras stegvis av Etapp 3b.
 *
 * four_eyes_quote självgodkännande-spärr: ETT UNDANTAG från bucket-
 * systemet, hårdkodat enligt planfilen — oavsett bucket nekas alltid om
 * currentUser är samma person som begärde godkännandet
 * (payload.requested_by_user_id), även för ägare/admin. Detta stänger
 * en riktig lucka som existerar REDAN NU (four_eyes_quote skulle annars
 * mappa mot 'owner_admin', vilket en självgodkännande ägare/admin alltid
 * klarar).
 */
export async function canActOnApproval(
  supabase: SupabaseClient,
  currentUser: BusinessUser,
  approval: ApprovalRoutingRow,
): Promise<boolean> {
  // Customer document delivery must not inherit a legacy routing_role='any'.
  // Match the existing quote/invoice send capability, including owners/admins.
  // Project-register writes in the accounting integration require an owner/admin,
  // even on historical automation cards whose routing bucket was 'any'.
  if (approval.approval_type === 'automation' && approval.payload?.rule_action_type === 'sync_to_fortnox') {
    const config = approval.payload.rule_action_config as Record<string, unknown> | undefined
    if ((config?.entity_type || approval.payload.entity_type) === 'project' &&
      (currentUser.business_id !== approval.business_id || !isOwnerOrAdmin(currentUser))) return false
  }
  if (approval.approval_type === 'automation' && approval.payload?.rule_action_type === 'notify_owner' &&
    (currentUser.business_id !== approval.business_id || !isOwnerOrAdmin(currentUser))) return false
  if (approval.approval_type === 'job_report' && !hasPermission(currentUser, 'create_invoices')) return false
  // Ett utskick i firmans namn utan projektförankring är inte projektteamets
  // beslut. Med project_id får den tilldelade hantverkaren kvittera ett
  // meddelande om sitt eget jobb; utan det krävs ägare/admin.
  if (approval.approval_type === 'send_sms' || approval.approval_type === 'send_email') {
    const projectId = (approval.payload as Record<string, unknown> | undefined)?.project_id
    if (!projectId && !(hasPermission(currentUser, 'manage_users') || isOwnerOrAdmin(currentUser))) return false
  }

  if (approval.approval_type === 'four_eyes_quote') {
    const requestedByUserId = (approval.payload as Record<string, unknown> | undefined)
      ?.requested_by_user_id as string | undefined
    if (requestedByUserId && requestedByUserId === currentUser.id) {
      return false
    }
  }

  // Lagrat 'any' är INTE ett beslut — det är kolumnens default i
  // sql/v77_pending_approvals_routing.sql, och de flesta creation-sites
  // sätter aldrig fältet. Att låta det slå tabellen gjorde ROUTING_TABLE
  // till död kod för varje rad. Ett uttryckligt strängare värde vinner
  // fortfarande; 'any' faller igenom till tabellen.
  const lagrad = approval.routing_role as RoutingRole | undefined
  const bucket = lagrad && lagrad !== 'any' ? lagrad : getRoutingBucket(approval.approval_type)

  switch (bucket) {
    case 'any':
      return true

    case 'owner_admin':
      // hasPermission täcker redan owner/admin (se lib/permissions.ts) —
      // isOwnerOrAdmin-ORet är en explicit dubbelkoll enligt planspecen,
      // defensivt mot framtida ändringar i hasPermission-mappningen.
      return hasPermission(currentUser, 'manage_users') || isOwnerOrAdmin(currentUser)

    case 'can_approve_time':
      return hasPermission(currentUser, 'approve_time')

    case 'can_see_financials':
      return hasPermission(currentUser, 'see_financials') || isOwnerOrAdmin(currentUser)

    case 'can_create_invoices':
      return hasPermission(currentUser, 'create_invoices') || isOwnerOrAdmin(currentUser)

    case 'project_team': {
      const projectId = (approval.payload as Record<string, unknown> | undefined)?.project_id as
        | string
        | undefined
      // Kan inte routa mot ett projekt som inte finns namngivet i payloaden.
      // Tidigare föll detta tillbaka till true, alltså till alla. Ett kort
      // vars projektförankring saknas är inte därmed allas — det går till
      // ägare/admin tills någon satt project_id i payloaden.
      if (!projectId) return hasPermission(currentUser, 'manage_users') || isOwnerOrAdmin(currentUser)

      if (hasPermission(currentUser, 'see_all_projects')) return true

      // Samma join-mönster som app/api/projects/[id]/team/route.ts.
      const { data, error } = await supabase
        .from('project_assignment')
        .select('id')
        .eq('project_id', projectId)
        .eq('business_user_id', currentUser.id)
        .eq('business_id', approval.business_id)
        .maybeSingle()

      if (error) {
        console.error('[canActOnApproval] project_assignment-uppslag misslyckades:', error)
        // Fail-closed vid DB-fel — hellre neka en åtgärd än att av misstag
        // släppa igenom pga ett transient databasfel.
        return false
      }
      return !!data
    }

    default:
      // Okänd bucket-sträng i DB (framtida värde, felstavning, manuell
      // rad). Den får ALDRIG betyda "alla" — ett värde vi inte känner igen
      // är ett värde vi inte kan resonera om, och då är ägare/admin det
      // enda försvarbara svaret.
      return hasPermission(currentUser, 'manage_users') || isOwnerOrAdmin(currentUser)
  }
}
