/**
 * Etapp 3a (tasks/multi-employee-parity-plan.md) — kö-routing infrastruktur
 * för pending_approvals. Se sql/v77_pending_approvals_routing.sql för
 * schemat (routing_role, routed_business_user_id) och RLS-bakstoppen.
 *
 * Denna körning bygger BARA infrastrukturen: routing_role har default
 * 'any' på alla rader och INGEN creation-site sätter ett annat värde än
 * (det är Etapp 3b). Funktionerna nedan är alltså strukturellt kompletta
 * men ger noll beteendeförändring i produktion förrän 3b börjar sätta
 * specifika buckets vid skapande.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { hasPermission, isOwnerOrAdmin, type BusinessUser } from '@/lib/permissions'

export type RoutingRole = 'any' | 'owner_admin' | 'can_approve_time' | 'project_team'

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
  // owner_admin
  four_eyes_quote: 'owner_admin',
  four_eyes_project_close: 'owner_admin',
  dispatch_suggestion: 'owner_admin',

  // can_approve_time
  time_attestation: 'can_approve_time',
  tidrapport_forslag: 'can_approve_time',

  // project_team
  egenkontroll_foto: 'project_team',
  egenkontroll_avvikelse: 'project_team',
  checklist_forslag: 'project_team',
  // Våg 2b (tasks/value-chain-plan.md) — ÄTA hör till projektteamet.
  create_ata_draft: 'project_team',
}

export function getRoutingBucket(approvalType: string): RoutingRole {
  return ROUTING_TABLE[approvalType] || 'any'
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
  if (approval.approval_type === 'four_eyes_quote') {
    const requestedByUserId = (approval.payload as Record<string, unknown> | undefined)
      ?.requested_by_user_id as string | undefined
    if (requestedByUserId && requestedByUserId === currentUser.id) {
      return false
    }
  }

  const bucket = (approval.routing_role as RoutingRole | undefined) || getRoutingBucket(approval.approval_type)

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

    case 'project_team': {
      const projectId = (approval.payload as Record<string, unknown> | undefined)?.project_id as
        | string
        | undefined
      // Kan inte routa mot ett projekt som inte finns namngivet i payloaden
      // — fall tillbaka till true (samma som 'any') snarare än att blockera.
      if (!projectId) return true

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
      // Okänd/framtida bucket-sträng i DB (t.ex. en Etapp 3b-bucket som
      // ännu inte är implementerad här) → samma beteende som 'any'.
      return true
  }
}
