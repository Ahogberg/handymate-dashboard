import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Markera fakturans källor — EN väg, atomisk när databasen kan
 * (2026-08-09, projektauditen P0-4).
 *
 * ═══ VARFÖR ═══
 *
 * Sex rutter markerade tidrapporter, material och ÄTA som fakturerade i
 * separata anrop som kunde lyckas eller misslyckas oberoende. Halvläget är
 * den farligaste dataklassen i systemet: en omärkt ÄTA dubbeldebiteras
 * nästa körning; en märkt rad vars faktura försvann faktureras aldrig.
 *
 * Primärvägen är RPC:n mark_invoice_sources (sql/v104) — en transaktion,
 * allt eller inget, idempotent per faktura, stjäl aldrig en annan fakturas
 * källa. Är migrationen inte körd (funktionen saknas) faller vi tillbaka på
 * dagens per-tabell-uppdateringar — INTE tystare än förut: varje delfel
 * rapporteras, och resultatet säger ärligt att vägen inte var atomisk.
 *
 * Facit (tests/fakturakallorna.spec.ts) är spärrhaken: inga nya direkta
 * invoiced-markeringar utanför den här filen.
 */

export interface MarkSourcesInput {
  businessId: string
  invoiceId: string
  timeEntryIds?: string[]
  materialIds?: string[]
  changeIds?: string[]
}

export interface MarkSourcesResult {
  ok: boolean
  /** Sant när RPC:n användes — allt-eller-inget gällde. */
  atomic: boolean
  marked: { timeEntries: number; materials: number; atas: number }
  /** Begärt minus markerat — källor en annan faktura äger, eller ÄTA i fel status. */
  conflicts: { timeEntries: number; materials: number; atas: number }
  errors: string[]
}

/** Känns "funktionen finns inte" igen? (v104 ej körd i den här miljön.) */
function arSaknadFunktion(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    /mark_invoice_sources.*(not exist|not found|schema cache)/i.test(error.message || '')
  )
}

export async function markInvoiceSources(
  supabase: SupabaseClient,
  input: MarkSourcesInput,
): Promise<MarkSourcesResult> {
  const timeIds = input.timeEntryIds ?? []
  const materialIds = input.materialIds ?? []
  const changeIds = input.changeIds ?? []

  if (timeIds.length + materialIds.length + changeIds.length === 0) {
    return { ok: true, atomic: true, marked: { timeEntries: 0, materials: 0, atas: 0 }, conflicts: { timeEntries: 0, materials: 0, atas: 0 }, errors: [] }
  }

  // ── Primärvägen: transaktionell RPC ──
  const { data, error } = await supabase.rpc('mark_invoice_sources', {
    p_business_id: input.businessId,
    p_invoice_id: input.invoiceId,
    p_time_entry_ids: timeIds.length ? timeIds : null,
    p_material_ids: materialIds.length ? materialIds : null,
    p_change_ids: changeIds.length ? changeIds : null,
  })

  if (!error && data) {
    const d = data as Record<string, number>
    return {
      ok: true,
      atomic: true,
      marked: {
        timeEntries: d.time_entries_marked || 0,
        materials: d.materials_marked || 0,
        atas: d.atas_marked || 0,
      },
      conflicts: {
        timeEntries: (d.time_entries_requested || 0) - (d.time_entries_marked || 0),
        materials: (d.materials_requested || 0) - (d.materials_marked || 0),
        atas: (d.atas_requested || 0) - (d.atas_marked || 0),
      },
      errors: [],
    }
  }

  if (error && !arSaknadFunktion(error)) {
    // RPC:n finns men misslyckades — transaktionen rullades tillbaka i sin
    // helhet. Inget halvläge; anroparen får veta och kan larma.
    console.error('[mark-sources] RPC failade (allt rullades tillbaka):', error.message, {
      invoice_id: input.invoiceId,
    })
    return { ok: false, atomic: true, marked: { timeEntries: 0, materials: 0, atas: 0 }, conflicts: { timeEntries: 0, materials: 0, atas: 0 }, errors: [error.message] }
  }

  // ── Fallback: v104 ej körd. Per-tabell som förut — men aldrig tyst. ──
  console.warn('[mark-sources] mark_invoice_sources saknas (kör sql/v104) — faller tillbaka på icke-atomisk märkning')
  const errors: string[] = []
  const marked = { timeEntries: 0, materials: 0, atas: 0 }

  if (timeIds.length > 0) {
    const { error: e, count } = await supabase
      .from('time_entry')
      .update({ invoiced: true, invoice_id: input.invoiceId }, { count: 'exact' })
      .eq('business_id', input.businessId)
      .in('time_entry_id', timeIds)
      .or(`invoice_id.is.null,invoice_id.eq.${input.invoiceId}`)
    if (e) errors.push(`time_entry: ${e.message}`)
    else marked.timeEntries = count || 0
  }

  if (materialIds.length > 0) {
    const { error: e, count } = await supabase
      .from('project_material')
      .update({ invoiced: true, invoice_id: input.invoiceId }, { count: 'exact' })
      .eq('business_id', input.businessId)
      .in('material_id', materialIds)
      .or(`invoice_id.is.null,invoice_id.eq.${input.invoiceId}`)
    if (e) errors.push(`project_material: ${e.message}`)
    else marked.materials = count || 0
  }

  if (changeIds.length > 0) {
    const { error: e, count } = await supabase
      .from('project_change')
      .update({ status: 'invoiced', invoice_id: input.invoiceId, invoiced_at: new Date().toISOString() }, { count: 'exact' })
      .eq('business_id', input.businessId)
      .in('change_id', changeIds)
      .or(`status.in.(approved,signed),invoice_id.eq.${input.invoiceId}`)
    if (e) errors.push(`project_change: ${e.message}`)
    else marked.atas = count || 0
  }

  if (errors.length > 0) {
    console.error('[mark-sources] HALVLÄGE MÖJLIGT — delmarkering misslyckades:', {
      invoice_id: input.invoiceId,
      errors,
      marked,
    })
  }

  return {
    ok: errors.length === 0,
    atomic: false,
    marked,
    conflicts: {
      timeEntries: timeIds.length - marked.timeEntries,
      materials: materialIds.length - marked.materials,
      atas: changeIds.length - marked.atas,
    },
    errors,
  }
}
