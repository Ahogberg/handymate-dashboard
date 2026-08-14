/**
 * Projektverklighet — en KOMPOSITION av två redan härledda sanningar
 * (Business Twin-epiken, 2026-08-14).
 *
 * ═══ VARFÖR ═══
 *
 * derive-lifecycle.ts härleder VAR projektet står (fas), compute-economics.ts
 * härleder VAD det kostar/tjänar (marginal). Båda är redan kanoniska —
 * ingenting här räknar om något de redan svarat på. `deriveProjectReality`
 * hämtar de rader varje härledning behöver, kör dem, och limmar ihop
 * resultatet till EN vy. Ingen ny matematik, ingen ny lagring.
 *
 * Samma princip som derive-lifecycle.ts: "det som inte lagras kan inte
 * drifta". ProjectReality-typen har därför BARA de fält som redan har en
 * kanonisk källa (lifecycle, economics). Fält som progress-prognoser eller
 * olösta löften har ingen sådan källa idag — de hör inte hemma här förrän
 * någon bygger den källan, annars smyger vi in nästa generations
 * progress_percent-krock (samma fälla som derive-lifecycle.ts löste).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { computeProjectEconomics, type ProjectEconomics } from '@/lib/projects/compute-economics'
import { deriveProjectLifecycle, type DerivedLifecycle } from '@/lib/projects/derive-lifecycle'

export interface ProjectReality {
  project_id: string
  name: string | null
  lifecycle: DerivedLifecycle
  economics: ProjectEconomics
}

/**
 * Komponerar lifecycle + economics för ett projekt. Null vid saknat
 * projekt eller om economics-härledningen misslyckas (samma
 * null-kontrakt som computeProjectEconomics självt).
 */
export async function deriveProjectReality(
  supabase: SupabaseClient,
  businessId: string,
  projectId: string,
): Promise<ProjectReality | null> {
  const { data: projectRow, error: projectError } = await supabase
    .from('project')
    .select('project_id, name, status, completed_at')
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .single()

  if (projectError || !projectRow) {
    console.warn('[project-reality] project not found', { projectId, businessId, error: projectError })
    return null
  }

  const { data: invoiceRows } = await supabase
    .from('invoice')
    .select('status')
    .eq('business_id', businessId)
    .eq('project_id', projectId)

  const economics = await computeProjectEconomics(supabase, projectId, businessId)
  if (!economics) return null

  const lifecycle = deriveProjectLifecycle({
    status: (projectRow as any).status ?? null,
    completed_at: (projectRow as any).completed_at ?? null,
    invoices: (invoiceRows || []) as Array<{ status: string | null }>,
  })

  return {
    project_id: (projectRow as any).project_id,
    name: (projectRow as any).name ?? null,
    lifecycle,
    economics,
  }
}
