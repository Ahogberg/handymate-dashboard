import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Vilket projekt gäller samtalet? Delad av ÄTA-utkastet och dagboksraden
 * (Samtalsefterarbete 2026-09-01). Gissar aldrig: bara när projektet är
 * entydigt. Ordning:
 *   1. call_recording.project_id (satt av mötes-/fältflödet)
 *   2. bokningens project_id (v51, mötesinspelning kopplad till bokning)
 *   3. kundens EXAKT ETT pågående projekt (planning/active) — två eller
 *      noll → null, hantverkaren får peka ut projektet själv.
 */
export interface ResolvedCallProject {
  project_id: string
  name: string | null
  source: 'recording' | 'booking' | 'customer_single'
}

export async function resolveCallProject(
  supabase: SupabaseClient,
  args: {
    businessId: string
    recording: { project_id?: string | null; booking_id?: string | null }
    customerId: string | null
  },
): Promise<ResolvedCallProject | null> {
  const { businessId } = args

  const load = async (projectId: string, source: ResolvedCallProject['source']) => {
    const { data } = await supabase
      .from('project')
      .select('project_id, name')
      .eq('business_id', businessId)
      .eq('project_id', projectId)
      .maybeSingle()
    return data ? { project_id: data.project_id, name: data.name ?? null, source } : null
  }

  if (args.recording.project_id) {
    const hit = await load(args.recording.project_id, 'recording')
    if (hit) return hit
  }

  if (args.recording.booking_id) {
    const { data: booking } = await supabase
      .from('booking')
      .select('project_id')
      .eq('business_id', businessId)
      .eq('booking_id', args.recording.booking_id)
      .maybeSingle()
    if (booking?.project_id) {
      const hit = await load(booking.project_id, 'booking')
      if (hit) return hit
    }
  }

  if (args.customerId) {
    const { data: projects } = await supabase
      .from('project')
      .select('project_id, name')
      .eq('business_id', businessId)
      .eq('customer_id', args.customerId)
      .in('status', ['planning', 'active'])
      .limit(2)
    if (projects && projects.length === 1) {
      return { project_id: projects[0].project_id, name: projects[0].name ?? null, source: 'customer_single' }
    }
  }

  return null
}
