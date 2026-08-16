/**
 * Revenue Recovery Case V1 — enda I/O-lagret.
 *
 * Alla service-role-läsningar filtreras explicit på business_id och varje
 * Supabase-fel kastas. UI/API får alltså antingen en komplett, tenantbunden
 * read model eller ett synligt 500-svar — aldrig en tom lista som döljer ett
 * trasigt uppslag.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { arTestdataApproval } from '@/lib/testdata'
import {
  REVENUE_RECOVERY_APPROVAL_TYPES,
  deriveRevenueRecoveryCase,
  recoveryChangeIds,
  recoveryInvoiceIds,
  recoveryProjectId,
  type RevenueRecoveryApproval,
  type RevenueRecoveryCase,
  type RevenueRecoveryChange,
  type RevenueRecoveryInvoice,
  type RevenueRecoveryProject,
} from '@/lib/value/revenue-recovery-case'

const MAX_APPROVAL_ROWS = 1000

export interface RevenueRecoveryRepository {
  listApprovals(): Promise<RevenueRecoveryApproval[]>
  findProjects(ids: string[]): Promise<RevenueRecoveryProject[]>
  findChanges(ids: string[]): Promise<RevenueRecoveryChange[]>
  findInvoices(ids: string[]): Promise<RevenueRecoveryInvoice[]>
}

function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? data as T[] : []
}

/**
 * Supabase-adaptern är medvetet tråkig och explicit. Ingen embed/join används:
 * flera av tabellerna saknar FK-constraints i produktion och PostgREST-embeds
 * har tidigare dött tyst. Varje relation verifieras därför i nästa lager.
 */
export function createRevenueRecoveryRepository(
  supabase: SupabaseClient,
  businessId: string,
): RevenueRecoveryRepository {
  return {
    async listApprovals() {
      const { data, error } = await supabase
        .from('pending_approvals')
        .select('id, approval_type, status, title, payload, created_at, resolved_at')
        .eq('business_id', businessId)
        .in('approval_type', [...REVENUE_RECOVERY_APPROVAL_TYPES])
        .order('created_at', { ascending: false })
        .limit(MAX_APPROVAL_ROWS + 1)
      if (error) throw new Error(`pending_approvals-uppslag misslyckades: ${error.message}`)
      const rows = asRows<RevenueRecoveryApproval>(data)
      if (rows.length > MAX_APPROVAL_ROWS) {
        throw new Error(`Revenue Recovery har fler än ${MAX_APPROVAL_ROWS} källrader; avgränsning krävs`)
      }
      return rows.filter(row => !arTestdataApproval(row as any))
    },

    async findProjects(ids) {
      if (ids.length === 0) return []
      const { data, error } = await supabase
        .from('project')
        .select('project_id, name, status, completed_at')
        .eq('business_id', businessId)
        .in('project_id', ids)
      if (error) throw new Error(`project-uppslag misslyckades: ${error.message}`)
      return asRows<RevenueRecoveryProject>(data)
    },

    async findChanges(ids) {
      if (ids.length === 0) return []
      const { data, error } = await supabase
        .from('project_change')
        .select('change_id, project_id, status, signed_at, declined_at, invoice_id, invoiced_at, total, amount')
        .eq('business_id', businessId)
        .in('change_id', ids)
      if (error) throw new Error(`project_change-uppslag misslyckades: ${error.message}`)
      return asRows<RevenueRecoveryChange>(data)
    },

    async findInvoices(ids) {
      if (ids.length === 0) return []
      const { data, error } = await supabase
        .from('invoice')
        .select('invoice_id, project_id, invoice_number, status, total, sent_at, paid_at')
        .eq('business_id', businessId)
        .in('invoice_id', ids)
      if (error) throw new Error(`invoice-uppslag misslyckades: ${error.message}`)
      return asRows<RevenueRecoveryInvoice>(data)
    },
  }
}

function unique(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => value !== null)))
}

function byId<T>(rows: T[], id: (row: T) => string): Map<string, T> {
  const result = new Map<string, T>()
  for (const row of rows) result.set(id(row), row)
  return result
}

/**
 * Orkestrerar de fyra explicita uppslagen och skickar normaliserade fakta till
 * den rena härledningen. `create_ata_draft` utan project_id är den etablerade
 * offert-fallbacken och ligger uttryckligen utanför projektbundna V1.
 */
export async function loadRevenueRecoveryCasesFromRepository(
  repository: RevenueRecoveryRepository,
): Promise<RevenueRecoveryCase[]> {
  const approvals = (await repository.listApprovals()).filter(approval => (
    REVENUE_RECOVERY_APPROVAL_TYPES.includes(approval.approval_type as any)
    && !(approval.approval_type === 'create_ata_draft' && !recoveryProjectId(approval))
  ))

  const projectIds = unique(approvals.map(recoveryProjectId))
  const changeIds = unique(approvals.flatMap(recoveryChangeIds))
  const [projects, changes] = await Promise.all([
    repository.findProjects(projectIds),
    repository.findChanges(changeIds),
  ])

  const changeById = byId(changes, row => row.change_id)
  const changesByApproval = new Map<string, RevenueRecoveryChange[]>()
  const allInvoiceIds: string[] = []
  for (const approval of approvals) {
    const approvalChanges = recoveryChangeIds(approval)
      .map(id => changeById.get(id))
      .filter((row): row is RevenueRecoveryChange => Boolean(row))
    changesByApproval.set(approval.id, approvalChanges)
    allInvoiceIds.push(...recoveryInvoiceIds(approval, approvalChanges))
  }

  const invoices = await repository.findInvoices(unique(allInvoiceIds))
  const projectById = byId(projects, row => row.project_id)
  const invoiceById = byId(invoices, row => row.invoice_id)

  return approvals.map(approval => {
    const approvalChanges = changesByApproval.get(approval.id) || []
    const invoiceIds = recoveryInvoiceIds(approval, approvalChanges)
    const invoice = invoiceIds.length === 1 ? invoiceById.get(invoiceIds[0]) ?? null : null
    const projectId = recoveryProjectId(approval)
    return deriveRevenueRecoveryCase({
      approval,
      project: projectId ? projectById.get(projectId) ?? null : null,
      changes: approvalChanges,
      invoice,
    })
  })
}

export async function loadRevenueRecoveryCases(
  supabase: SupabaseClient,
  businessId: string,
): Promise<RevenueRecoveryCase[]> {
  return loadRevenueRecoveryCasesFromRepository(
    createRevenueRecoveryRepository(supabase, businessId),
  )
}
